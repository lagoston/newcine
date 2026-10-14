import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.39.0';

// pesca-lancamentos — a "lista de pesca" (14/10/2026). Ver o doc "Lista de
// pesca" do projeto e a migração 20261014010000_pesca.sql.
//
// Roda todo dia (agenda `pesca-diaria`, 04h30 de Brasília), só com a chave
// interna:
//   1. Pesca: os lançamentos recentes mais populares do TMDB — filmes dos
//      últimos 150 dias, séries que estrearam nos últimos 200 dias e uma
//      busca só de brasileiros do último ano. Sem documentários, filmes de
//      TV, reality, talk show, telejornal e novela. O que já está numa
//      prateleira não entra (pesca_registrar confere).
//   2. Reconfere quem já está na lista (pesca_para_checar: esquentando 1×
//      por semana; pronto/abaixo a cada 2 semanas), guardando nota e votos no
//      histórico.
//   3. pesca_avaliar(): decide quem já assentou (pronto/abaixo), sugere
//      oráculo e humor e pede ao cache do site os prontos que faltam.
//
// Custo por dia: ~12 pedidos de lista + até 120 de detalhes ao TMDB.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB = 'https://api.themoviedb.org/3';
const CONCURRENCY = 4;
const REFRESH_PER_RUN = 120;

type MediaType = 'movie' | 'tv';
type Item = {
  id: number;
  type: MediaType;
  title: string | null;
  original_title: string | null;
  date: string | null;
  va: number | null;
  vc: number | null;
  popularity: number | null;
  lang: string | null;
  genres: string | null;
};

// Gêneros do TMDB em português (os ids que as listas devolvem).
const GENRES: Record<number, string> = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime', 99: 'Documentário', 18: 'Drama',
  10751: 'Família', 14: 'Fantasia', 36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério',
  10749: 'Romance', 878: 'Ficção científica', 10770: 'Filme de TV', 53: 'Suspense', 10752: 'Guerra', 37: 'Faroeste',
  10759: 'Ação e Aventura', 10762: 'Infantil', 10763: 'Notícias', 10764: 'Reality', 10765: 'Ficção científica e Fantasia',
  10766: 'Novela', 10767: 'Talk show', 10768: 'Guerra e Política',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

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

const genreNames = (ids: number[] | undefined, objs?: { id: number; name: string }[]) => {
  if (objs && objs.length) return objs.map((g) => g.name).join('/');
  return (ids || []).map((id) => GENRES[id]).filter(Boolean).join('/') || null;
};

// Linha de uma lista (discover) ou dos detalhes → item da pesca.
function toItem(raw: any, type: MediaType): Item | null {
  if (!raw || typeof raw.id !== 'number') return null;
  return {
    id: raw.id,
    type,
    title: (type === 'movie' ? raw.title : raw.name) || null,
    original_title: (type === 'movie' ? raw.original_title : raw.original_name) || null,
    date: (type === 'movie' ? raw.release_date : raw.first_air_date) || null,
    va: typeof raw.vote_average === 'number' ? raw.vote_average : null,
    vc: typeof raw.vote_count === 'number' ? raw.vote_count : null,
    popularity: typeof raw.popularity === 'number' ? raw.popularity : null,
    lang: raw.original_language || null,
    genres: genreNames(raw.genre_ids, raw.genres),
  };
}

// As listas do dia.
function discoverPaths(): { path: string; type: MediaType; origem: string }[] {
  const today = isoDay(0);
  const movies = `/discover/movie?language=pt-BR&include_adult=false&sort_by=popularity.desc&with_runtime.gte=60&without_genres=99,10770&vote_count.gte=15&primary_release_date.gte=${isoDay(-150)}&primary_release_date.lte=${today}`;
  const series = `/discover/tv?language=pt-BR&include_adult=false&sort_by=popularity.desc&without_genres=99,10763,10764,10766,10767&vote_count.gte=10&first_air_date.gte=${isoDay(-200)}&first_air_date.lte=${today}`;
  const brMovies = `/discover/movie?language=pt-BR&include_adult=false&sort_by=popularity.desc&with_origin_country=BR&with_runtime.gte=60&without_genres=99,10770&vote_count.gte=5&primary_release_date.gte=${isoDay(-365)}&primary_release_date.lte=${today}`;
  const brSeries = `/discover/tv?language=pt-BR&include_adult=false&sort_by=popularity.desc&with_origin_country=BR&without_genres=99,10763,10764,10766,10767&vote_count.gte=3&first_air_date.gte=${isoDay(-365)}&first_air_date.lte=${today}`;
  const out: { path: string; type: MediaType; origem: string }[] = [];
  for (let page = 1; page <= 5; page++) out.push({ path: `${movies}&page=${page}`, type: 'movie', origem: 'lancamentos' });
  for (let page = 1; page <= 3; page++) out.push({ path: `${series}&page=${page}`, type: 'tv', origem: 'lancamentos' });
  for (let page = 1; page <= 2; page++) out.push({ path: `${brMovies}&page=${page}`, type: 'movie', origem: 'brasil' });
  out.push({ path: `${brSeries}&page=1`, type: 'tv', origem: 'brasil' });
  return out;
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
  if (!(await isInternal(req, supabase))) return json({ error: 'forbidden' }, 403);
  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === 'string' ? body.mode : 'run';

  try {
    let fished = 0;
    let refreshed = 0;
    const errors: string[] = [];

    // 1. Pesca
    if (mode === 'run' || mode === 'discover') {
      const lists = await mapLimited(discoverPaths(), CONCURRENCY, async (l) => {
        const { status, data } = await tmdb(l.path);
        if (!data) errors.push(`${l.path.slice(0, 40)}… HTTP ${status}`);
        return { origem: l.origem, items: ((data?.results || []) as any[]).map((r) => toItem(r, l.type)).filter(Boolean) as Item[] };
      });
      for (const origem of ['lancamentos', 'brasil']) {
        const items = lists.filter((l) => l.origem === origem).flatMap((l) => l.items);
        if (items.length === 0) continue;
        const { data, error } = await supabase.rpc('pesca_registrar', { p_items: items, p_origem: origem });
        if (error) throw error;
        fished += Number(data) || 0;
      }
    }

    // 2. Reconferir
    if (mode === 'run' || mode === 'refresh') {
      const limit = Math.max(1, Math.min(300, Number(body?.limit) || REFRESH_PER_RUN));
      const { data: due, error } = await supabase.rpc('pesca_para_checar', { p_limit: limit });
      if (error) throw error;
      const details = await mapLimited((due || []) as { tmdb_id: number; media_type: MediaType }[], CONCURRENCY, async (d) => {
        const { status, data } = await tmdb(`/${d.media_type}/${d.tmdb_id}?language=pt-BR`);
        if (!data) {
          if (status !== 404) errors.push(`${d.media_type}:${d.tmdb_id} HTTP ${status}`);
          return null;
        }
        return toItem(data, d.media_type);
      });
      const items = details.filter(Boolean) as Item[];
      if (items.length > 0) {
        // Só atualiza quem já está na lista (a origem não muda).
        const { data, error: regError } = await supabase.rpc('pesca_registrar', { p_items: items, p_origem: 'lancamentos' });
        if (regError) throw regError;
        refreshed = Number(data) || 0;
      }
    }

    // 3. Avaliar
    const { data: summary, error: evalError } = await supabase.rpc('pesca_avaliar');
    if (evalError) throw evalError;

    return json({ mode, fished, refreshed, summary, errors: errors.slice(0, 10) });
  } catch (error) {
    console.error('pesca-lancamentos error', error);
    return json({ error: 'internal_error', detail: String((error as Error)?.message || error) }, 500);
  }
});
