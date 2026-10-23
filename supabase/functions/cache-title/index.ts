import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.39.0';

// cache-title — a única porta de entrada e de atualização do movie_cache
// (12/10/2026). Ver o doc "Base de filmes" do Project.
//
// Modos:
//   • ensure (o site): recebe até 25 títulos { id, type }. O que falta no
//     banco é buscado no TMDB agora e devolvido; o que está vencido
//     (title_refresh_days) é devolvido como está e atualizado em segundo
//     plano; com fresh: true, um título incompleto (sem orçamento, série
//     sem episódios) é atualizado antes de responder.
//   • fill (banco, chave interna): busca/atualiza na hora a lista recebida
//     (gatilho da biblioteca, lacunas).
//   • sweep (agenda, chave interna): atualiza os títulos mais vencidos.
//   • trending (agenda, chave interna): grava os filmes em alta da semana
//     que ainda não estão no banco.
//
// Cada título custa 2 pedidos ao TMDB (inglês com elenco, palavras-chave,
// onde assistir, classificação e vídeos juntos; português só com título,
// sinopse, pôster e gêneros), mais as temporadas que mudaram, nas séries.
// O site tem limite de títulos buscados por hora (por conta; sem conta, por
// endereço IP).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB = 'https://api.themoviedb.org/3';

const MAX_TITLES_PER_CALL = 25;
const MAX_FETCHES_PER_CALL = 10;
const USER_TITLES_PER_HOUR = 150;
const ANON_TITLES_PER_HOUR = 40;
const SWEEP_MAX = 60;
const FILL_MAX = 60;
const CONCURRENCY = 4;
// Avisos de episódio novo: desde 23/10/2026 saem do banco, numa rodada
// diária (notify_aired_episodes, 01h10 de Brasília), a partir do que esta
// função guarda. Ela não avisa mais nada.

type MediaType = 'movie' | 'tv';
type Ref = { id: number; type: MediaType };
type Row = Record<string, any>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const refKey = (r: Ref) => `${r.type}:${r.id}`;

function normalizeRefs(input: unknown, max: number): Ref[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Ref[] = [];
  for (const item of input) {
    const id = Number((item as any)?.id ?? (item as any)?.tmdb_id);
    const rawType = (item as any)?.type ?? (item as any)?.media_type;
    const type: MediaType = rawType === 'tv' ? 'tv' : 'movie';
    if (!Number.isInteger(id) || id <= 0) continue;
    const key = `${type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, type });
    if (out.length >= max) break;
  }
  return out;
}

// O gateway já confere a assinatura do token (verify_jwt): aqui só se lê
// quem é (conta ou visitante).
function readJwt(req: Request): { role: string | null; sub: string | null } {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const part = token.split('.')[1];
  if (!part) return { role: null, sub: null };
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return { role: payload?.role ?? null, sub: payload?.sub ?? null };
  } catch {
    return { role: null, sub: null };
  }
}

const clientIp = (req: Request) =>
  (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0] || 'unknown').trim();

// ---------- Prazo de validade (o mesmo de title_refresh_days no banco e de
// isTitleStale no site) ----------

function refreshDays(row: Row): number {
  const ongoing = ['Returning Series', 'In Production', 'Planned', 'Pilot'];
  if (row.media_type === 'tv' && (row.in_production || ongoing.includes(row.status))) return 7;
  if (row.media_type === 'movie' && !row.release_date) return 30;
  if (row.media_type === 'movie') {
    const released = new Date(`${row.release_date}T00:00:00Z`).getTime();
    if (released > Date.now() - 120 * 86400000) return 7;
  }
  return 90;
}

const isIncomplete = (row: Row) =>
  (row.media_type === 'movie' && row.budget === null) ||
  (row.media_type === 'tv' && (row.number_of_seasons || 0) > 0 && !(Array.isArray(row.seasons_data) && row.seasons_data.length > 0));

function isStale(row: Row): boolean {
  if (isIncomplete(row)) return true;
  const at = new Date(row.refreshed_at || row.updated_at || row.cached_at || 0).getTime();
  return at + refreshDays(row) * 86400000 <= Date.now();
}

// ---------- TMDB ----------

async function tmdb(path: string): Promise<{ status: number; data: any }> {
  const url = `${TMDB}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(10, Number(res.headers.get('retry-after')) || 2);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) return { status: res.status, data: null };
    return { status: res.status, data: await res.json() };
  }
  return { status: 429, data: null };
}

// Onde assistir: Brasil, ou Estados Unidos sem dados do Brasil (igual ao
// pickWatchProviders do site). undefined = o TMDB não respondeu.
function pickProviders(raw: any): Row | undefined {
  if (!raw || typeof raw !== 'object' || !raw.results) return undefined;
  const country = raw.results.BR || raw.results.US;
  if (!country) return {};
  const picked: Row = {};
  for (const k of ['link', 'flatrate', 'rent', 'buy']) if (country[k]) picked[k] = country[k];
  return picked;
}

// Classificação indicativa por país: [{ iso_3166_1, certification }].
function pickRatings(en: any, type: MediaType): Row[] {
  if (type === 'tv') {
    return (en?.content_ratings?.results || [])
      .filter((r: any) => r?.rating)
      .map((r: any) => ({ iso_3166_1: r.iso_3166_1, certification: r.rating }));
  }
  const order = [3, 2, 1, 4, 5, 6];
  return (en?.release_dates?.results || [])
    .map((country: any) => {
      const dates = (country.release_dates || []).filter((d: any) => d?.certification);
      dates.sort((a: any, b: any) => order.indexOf(a.type) - order.indexOf(b.type));
      return dates[0] ? { iso_3166_1: country.iso_3166_1, certification: dates[0].certification } : null;
    })
    .filter(Boolean);
}

function pickTrailer(en: any): Row {
  const videos = (en?.videos?.results || []).filter((v: any) => v?.site === 'YouTube' && v?.key);
  const chosen =
    videos.find((v: any) => v.type === 'Trailer' && v.official) || videos.find((v: any) => v.type === 'Trailer') || videos[0];
  return chosen ? { key: chosen.key, site: chosen.site, name: chosen.name } : {};
}

function mapSeason(s: any): Row {
  return {
    season_number: s.season_number,
    name: s.name,
    episode_count: s.episodes?.length || 0,
    air_date: s.air_date || null,
    overview: s.overview || null,
    poster_path: s.poster_path || null,
    episodes: (s.episodes || []).map((ep: any) => ({
      episode_number: ep.episode_number,
      name: ep.name,
      air_date: ep.air_date || null,
      runtime: ep.runtime || null,
      overview: ep.overview || null,
      vote_average: ep.vote_average || 0,
    })),
  };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Temporadas: só busca as que são novas, mudaram de tamanho ou (série no ar)
// a última. As outras continuam como estavam.
async function buildSeasons(id: number, en: any, old: Row[] | null): Promise<Row[] | null> {
  const listed = (en?.seasons || []).filter((s: any) => s?.season_number > 0);
  if (listed.length === 0) return old && old.length ? old : null;
  const oldBy = new Map<number, Row>((old || []).map((s: Row) => [s.season_number, s]));
  const last = Math.max(...listed.map((s: any) => s.season_number));
  const ongoing = en.in_production || ['Returning Series', 'In Production', 'Planned', 'Pilot'].includes(en.status);
  const toFetch = listed.filter((s: any) => {
    const prev = oldBy.get(s.season_number);
    if (!prev || !(prev.episodes?.length > 0)) return true;
    if ((prev.episode_count ?? prev.episodes.length) !== s.episode_count) return true;
    return ongoing && s.season_number === last;
  });
  const fetched = await mapLimited(toFetch, 3, async (s: any) => {
    const { data } = await tmdb(`/tv/${id}/season/${s.season_number}?language=en-US`);
    return data ? mapSeason(data) : null;
  });
  const fetchedBy = new Map<number, Row>();
  fetched.forEach((s) => s && fetchedBy.set(s.season_number, s));
  return listed
    .map((s: any) => fetchedBy.get(s.season_number) || oldBy.get(s.season_number) || null)
    .filter(Boolean)
    .sort((a: Row, b: Row) => a.season_number - b.season_number);
}

type Outcome = { ref: Ref; row: Row | null; notFound?: boolean; error?: string };

// Busca o título no TMDB e grava. existing = a linha atual (atualização) ou
// null (título novo).
async function refreshTitle(supabase: SupabaseClient, ref: Ref, existing: Row | null): Promise<Outcome> {
  const path = ref.type === 'tv' ? 'tv' : 'movie';
  const extras = ref.type === 'tv' ? 'credits,keywords,watch/providers,content_ratings,videos' : 'credits,keywords,watch/providers,release_dates,videos';
  const [enRes, ptRes] = await Promise.all([
    tmdb(`/${path}/${ref.id}?language=en-US&append_to_response=${extras}`),
    tmdb(`/${path}/${ref.id}?language=pt-BR`),
  ]);
  if (!enRes.data) {
    return { ref, row: existing, notFound: enRes.status === 404, error: enRes.status === 404 ? undefined : `tmdb_${enRes.status}` };
  }
  const en = enRes.data;
  const pt = ptRes.data;
  const isTv = ref.type === 'tv';

  let director: string | null = null;
  let directorId: number | null = null;
  if (isTv) {
    const creator = en.created_by?.[0] || en.credits?.crew?.find((p: any) => p.job === 'Executive Producer');
    director = creator?.name || null;
    directorId = creator?.id || null;
  } else {
    const d = en.credits?.crew?.find((p: any) => p.job === 'Director');
    director = d?.name || null;
    directorId = d?.id || null;
  }

  let runtime = en.runtime || 0;
  let episodeRuntime: number | null = null;
  if (isTv && en.episode_run_time?.length > 0) {
    episodeRuntime = Math.round(en.episode_run_time.reduce((a: number, b: number) => a + b, 0) / en.episode_run_time.length);
    runtime = (en.number_of_episodes || 0) * episodeRuntime;
  }

  const keywordsRaw = isTv ? en.keywords?.results : en.keywords?.keywords;
  const now = new Date().toISOString();
  const row: Row = {
    id: ref.id,
    tmdb_id: ref.id,
    media_type: ref.type,
    release_date: (isTv ? en.first_air_date : en.release_date) || null,
    vote_average: en.vote_average,
    vote_count: en.vote_count,
    runtime,
    episode_run_time: episodeRuntime,
    number_of_seasons: en.number_of_seasons || null,
    number_of_episodes: en.number_of_episodes || null,
    origin_country: en.origin_country || en.production_countries?.map((c: any) => c.iso_3166_1) || [],
    poster_path: en.poster_path,
    backdrop_path: en.backdrop_path,
    title_en: (isTv ? en.name : en.title) || existing?.title_en || '',
    overview_en: en.overview,
    genres_en: en.genres || [],
    director,
    director_id: directorId,
    cast_members: (en.credits?.cast || []).slice(0, 10).map((p: any) => ({ id: p.id, name: p.name, character: p.character })),
    keywords: (keywordsRaw || []).map((k: any) => ({ id: k.id, name: k.name })),
    budget: isTv ? null : en.budget ?? 0,
    status: isTv ? en.status : null,
    in_production: isTv ? en.in_production ?? false : false,
    last_air_date: isTv ? en.last_air_date || null : null,
    trailer: pickTrailer(en),
    refreshed_at: now,
    updated_at: now,
  };
  if (pt) {
    row.title_pt = (isTv ? pt.name : pt.title) || null;
    row.overview_pt = pt.overview || null;
    row.poster_path_pt = pt.poster_path || null;
    row.genres_pt = pt.genres || [];
  }
  const providers = pickProviders(en['watch/providers']);
  if (providers !== undefined) row.watch_providers = providers;
  const ratings = pickRatings(en, ref.type);
  if (ratings.length > 0 || !existing) row.content_ratings = ratings;

  if (isTv) {
    const seasons = await buildSeasons(ref.id, en, existing?.seasons_data || null);
    if (seasons) row.seasons_data = seasons;
  }

  const { data: saved, error } = await supabase.from('movie_cache').upsert(row, { onConflict: 'tmdb_id,media_type' }).select('*').single();
  if (error) return { ref, row: existing, error: error.message };

  // Linha em movies criada sem título (título adicionado à biblioteca antes
  // de estar no cache): completa agora.
  await supabase
    .from('movies')
    .update({
      title: saved.title_pt || saved.title_en,
      release_date: saved.release_date,
      genres: (saved.genres_pt || saved.genres_en || []).map((g: any) => g?.name).filter(Boolean),
      director: saved.director,
      number_of_seasons: saved.number_of_seasons,
    })
    .eq('id', ref.id)
    .eq('media_type', ref.type)
    .eq('title', '');

  return { ref, row: saved };
}

async function loadRows(supabase: SupabaseClient, refs: Ref[]): Promise<Map<string, Row>> {
  const map = new Map<string, Row>();
  for (const type of ['movie', 'tv'] as MediaType[]) {
    const ids = refs.filter((r) => r.type === type).map((r) => r.id);
    if (ids.length === 0) continue;
    const { data } = await supabase.from('movie_cache').select('*').eq('media_type', type).in('tmdb_id', ids);
    (data || []).forEach((row: Row) => map.set(`${type}:${row.tmdb_id}`, row));
  }
  return map;
}

async function isInternal(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const key = req.headers.get('x-internal-key');
  if (!key) return false;
  const { data } = await supabase.rpc('check_internal_key', { p_key: key });
  return data === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === 'string' ? body.mode : 'ensure';

  try {
    if (mode !== 'ensure') {
      if (!(await isInternal(req, supabase))) return json({ error: 'forbidden' }, 403);

      if (mode === 'fill') {
        const refs = normalizeRefs(body.titles, FILL_MAX);
        const existing = await loadRows(supabase, refs);
        const outcomes = await mapLimited(refs, CONCURRENCY, (ref) => refreshTitle(supabase, ref, existing.get(refKey(ref)) || null));
        return json({
          mode,
          done: outcomes.filter((o) => o.row && !o.error).length,
          notFound: outcomes.filter((o) => o.notFound).map((o) => refKey(o.ref)),
          errors: outcomes.filter((o) => o.error).map((o) => `${refKey(o.ref)} ${o.error}`).slice(0, 10),
        });
      }

      if (mode === 'sweep') {
        const limit = Math.max(1, Math.min(SWEEP_MAX, Number(body.limit) || 40));
        const { data: due, error } = await supabase.rpc('titles_due_for_refresh', { p_limit: limit });
        if (error) throw error;
        const refs = normalizeRefs((due || []).map((d: Row) => ({ id: d.tmdb_id, type: d.media_type })), limit);
        const existing = await loadRows(supabase, refs);
        const outcomes = await mapLimited(refs, CONCURRENCY, (ref) => refreshTitle(supabase, ref, existing.get(refKey(ref)) || null));
        // Título que sumiu do TMDB: marca como atualizado para não voltar à
        // fila toda noite (os dados guardados continuam valendo).
        const gone = outcomes.filter((o) => o.notFound).map((o) => o.ref);
        for (const ref of gone) {
          await supabase.from('movie_cache').update({ refreshed_at: new Date().toISOString() }).eq('tmdb_id', ref.id).eq('media_type', ref.type);
        }
        // Faxina: respostas guardadas do proxy com mais de 7 dias e limites
        // parados há mais de 2 dias.
        await supabase.from('tmdb_response_cache').delete().lt('fetched_at', new Date(Date.now() - 7 * 86400000).toISOString());
        await supabase.from('api_rate_limits').delete().lt('window_start', new Date(Date.now() - 2 * 86400000).toISOString());
        return json({
          mode,
          refreshed: outcomes.filter((o) => o.row && !o.error && !o.notFound).length,
          gone: gone.length,
          errors: outcomes.filter((o) => o.error).map((o) => `${refKey(o.ref)} ${o.error}`).slice(0, 10),
        });
      }

      if (mode === 'trending') {
        const { data } = await tmdb('/trending/movie/week?language=en-US');
        const refs = normalizeRefs((data?.results || []).map((m: any) => ({ id: m.id, type: 'movie' })), 20);
        const existing = await loadRows(supabase, refs);
        const missing = refs.filter((r) => !existing.has(refKey(r)));
        const outcomes = await mapLimited(missing, CONCURRENCY, (ref) => refreshTitle(supabase, ref, null));
        return json({ mode, trending: refs.length, added: outcomes.filter((o) => o.row && !o.error).length });
      }

      return json({ error: 'unknown_mode' }, 400);
    }

    // ---------- ensure (o site) ----------
    const refs = normalizeRefs(body.titles, MAX_TITLES_PER_CALL);
    if (refs.length === 0) return json({ titles: [] });
    const fresh = body.fresh === true;

    const rows = await loadRows(supabase, refs);
    const now: Ref[] = [];
    const later: Ref[] = [];
    for (const ref of refs) {
      const row = rows.get(refKey(ref));
      if (!row) now.push(ref);
      else if (fresh && isIncomplete(row)) now.push(ref);
      else if (isStale(row)) later.push(ref);
    }

    const internal = await isInternal(req, supabase);
    let allowedNow = now.slice(0, MAX_FETCHES_PER_CALL);
    let allowedLater = later.slice(0, MAX_FETCHES_PER_CALL);
    if (!internal && allowedNow.length + allowedLater.length > 0) {
      const { role, sub } = readJwt(req);
      const isUser = role === 'authenticated' && !!sub;
      const { data: ok } = await supabase.rpc('hit_rate_limit', {
        p_key: isUser ? `title:user:${sub}` : `title:ip:${clientIp(req)}`,
        p_limit: isUser ? USER_TITLES_PER_HOUR : ANON_TITLES_PER_HOUR,
        p_window_seconds: 3600,
        p_cost: allowedNow.length + allowedLater.length,
      });
      if (ok !== true) {
        // Passou do limite: devolve só o que já está no banco.
        allowedNow = [];
        allowedLater = [];
      }
    }

    const fetchedNow = await mapLimited(allowedNow, CONCURRENCY, (ref) => refreshTitle(supabase, ref, rows.get(refKey(ref)) || null));
    fetchedNow.forEach((o) => o.row && rows.set(refKey(o.ref), o.row));

    if (allowedLater.length > 0) {
      const background = mapLimited(allowedLater, 2, (ref) => refreshTitle(supabase, ref, rows.get(refKey(ref)) || null));
      // @ts-ignore EdgeRuntime existe no runtime do Supabase
      EdgeRuntime.waitUntil(background);
    }

    return json({
      titles: refs.map((r) => rows.get(refKey(r))).filter(Boolean),
      notFound: fetchedNow.filter((o) => o.notFound).map((o) => ({ id: o.ref.id, type: o.ref.type })),
      limited: now.length > allowedNow.length,
    });
  } catch (error) {
    console.error('cache-title error', error);
    return json({ error: 'internal_error' }, 500);
  }
});
