import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Semeadura dos perfis-bot (09/10/2026): recebe códigos do IMDb ("tt…"),
// acha o título no TMDB (/find) e garante que ele está no movie_cache e na
// tabela movies — do mesmo jeito que o importador do IMDb do site faz
// (ensureMovieCached em src/lib/tmdb.ts + upsert em movies), só que aqui no
// servidor, para os dados do TMDB não passarem pelo banco como resposta de
// pg_net (créditos completos pesam dezenas de KB por filme).
//
// Uso interno: só aceita chamadas com a chave do cabeçalho x-seed-key igual
// a uma chave válida (não expirada) da tabela bot_seed_keys, que só o
// service_role lê. Corpo: { imdbIds: string[] } (até 30 por chamada).
// Resposta: { results: [{ imdbId, tmdbId, mediaType, status }] } com status
// 'cached' (já estava), 'added' (cacheado agora), 'not_found' ou 'error:…'.

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') || '';
const TMDB = 'https://api.themoviedb.org/3';
const MAX_IDS = 30;
const CONCURRENCY = 4;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seed-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MediaType = 'movie' | 'tv';

interface SeedResult {
  imdbId: string;
  tmdbId: number | null;
  mediaType: MediaType | null;
  status: string;
}

async function tmdb(path: string): Promise<any> {
  const url = `${TMDB}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`tmdb ${res.status} ${path.split('?')[0]}`);
    return await res.json();
  }
  throw new Error(`tmdb 429 ${path.split('?')[0]}`);
}

async function fetchSeasons(showId: number, numberOfSeasons: number): Promise<any[]> {
  const out: any[] = [];
  for (let s = 1; s <= numberOfSeasons; s++) {
    try {
      const season = await tmdb(`/tv/${showId}/season/${s}?language=en-US`);
      out.push({
        season_number: season.season_number,
        name: season.name,
        episode_count: season.episodes?.length || 0,
        air_date: season.air_date || null,
        overview: season.overview || null,
        poster_path: season.poster_path || null,
        episodes: (season.episodes || []).map((ep: any) => ({
          episode_number: ep.episode_number,
          name: ep.name,
          air_date: ep.air_date || null,
          runtime: ep.runtime || null,
          overview: ep.overview || null,
          vote_average: ep.vote_average || 0,
        })),
      });
    } catch {
      // temporada que o TMDB não devolve: segue sem ela (igual ao site)
    }
  }
  return out;
}

// Mesma montagem de linha do ensureMovieCached (src/lib/tmdb.ts).
async function buildCacheRow(tmdbId: number, mediaType: MediaType) {
  const [enData, ptData] = await Promise.all([
    tmdb(`/${mediaType}/${tmdbId}?language=en-US&append_to_response=credits,keywords`),
    tmdb(`/${mediaType}/${tmdbId}?language=pt-BR`),
  ]);

  const director: string | null = mediaType === 'tv'
    ? enData.created_by?.[0]?.name || enData.credits?.crew?.find((p: any) => p.job === 'Executive Producer')?.name || null
    : enData.credits?.crew?.find((p: any) => p.job === 'Director')?.name || null;

  const castMembers = (enData.credits?.cast || []).slice(0, 10).map((p: any) => ({
    id: p.id,
    name: p.name,
    character: p.character,
  }));

  let totalRuntime = enData.runtime || 0;
  let episodeRuntime: number | null = null;
  if (mediaType === 'tv' && enData.episode_run_time?.length > 0) {
    episodeRuntime = Math.round(
      enData.episode_run_time.reduce((a: number, b: number) => a + b, 0) / enData.episode_run_time.length,
    );
    totalRuntime = (enData.number_of_episodes || 0) * episodeRuntime;
  }

  const keywordsRaw = mediaType === 'tv' ? enData.keywords?.results : enData.keywords?.keywords;
  const keywords = (keywordsRaw || []).map((k: any) => ({ id: k.id, name: k.name }));

  const row: Record<string, unknown> = {
    id: tmdbId,
    tmdb_id: tmdbId,
    media_type: mediaType,
    release_date: (mediaType === 'tv' ? enData.first_air_date : enData.release_date) || null,
    vote_average: enData.vote_average,
    vote_count: enData.vote_count,
    runtime: totalRuntime,
    episode_run_time: episodeRuntime,
    number_of_seasons: enData.number_of_seasons || null,
    number_of_episodes: enData.number_of_episodes || null,
    origin_country: enData.origin_country || enData.production_countries?.map((c: any) => c.iso_3166_1) || [],
    poster_path: enData.poster_path,
    poster_path_pt: ptData.poster_path,
    backdrop_path: enData.backdrop_path,
    title_en: (mediaType === 'tv' ? enData.name : enData.title) || ptData.name || ptData.title || String(tmdbId),
    overview_en: enData.overview,
    genres_en: enData.genres,
    title_pt: mediaType === 'tv' ? ptData.name : ptData.title,
    overview_pt: ptData.overview,
    genres_pt: ptData.genres,
    director,
    cast_members: castMembers,
    keywords,
    budget: mediaType === 'movie' ? (enData.budget ?? 0) : null,
    status: mediaType === 'tv' ? enData.status : null,
    in_production: mediaType === 'tv' ? (enData.in_production ?? false) : false,
    last_air_date: mediaType === 'tv' ? enData.last_air_date || null : null,
    updated_at: new Date().toISOString(),
  };

  if (mediaType === 'tv' && enData.number_of_seasons > 0) {
    row.seasons_data = await fetchSeasons(tmdbId, enData.number_of_seasons);
  }

  const moviesRow = {
    id: tmdbId,
    title: (row.title_pt as string) || (row.title_en as string),
    release_date: row.release_date,
    genres: ((ptData.genres || enData.genres || []) as any[]).map((g) => g.name),
    director: mediaType === 'movie' ? director : null,
    media_type: mediaType,
    number_of_seasons: mediaType === 'tv' ? enData.number_of_seasons || null : null,
  };

  return { row, moviesRow };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const seedKey = req.headers.get('x-seed-key') || '';
    if (!seedKey) return json({ error: 'forbidden' }, 403);
    const { data: keyRow } = await supabase
      .from('bot_seed_keys')
      .select('key')
      .eq('key', seedKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!keyRow) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const imdbIds: string[] = Array.isArray(body?.imdbIds)
      ? [...new Set((body.imdbIds as unknown[]).map(String).filter((s) => /^tt\d{5,10}$/.test(s)))].slice(0, MAX_IDS)
      : [];
    if (imdbIds.length === 0) return json({ error: 'imdbIds vazio' }, 400);

    const results: SeedResult[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < imdbIds.length) {
        const imdbId = imdbIds[cursor++];
        try {
          const found = await tmdb(`/find/${imdbId}?external_source=imdb_id`);
          const movie = found.movie_results?.[0];
          const tv = found.tv_results?.[0];
          const hit = movie || tv;
          if (!hit) {
            results.push({ imdbId, tmdbId: null, mediaType: null, status: 'not_found' });
            continue;
          }
          const mediaType: MediaType = movie ? 'movie' : 'tv';
          const tmdbId = hit.id as number;

          const [{ data: cached }, { data: inMovies }] = await Promise.all([
            supabase.from('movie_cache').select('tmdb_id').eq('tmdb_id', tmdbId).eq('media_type', mediaType).maybeSingle(),
            supabase.from('movies').select('id').eq('id', tmdbId).eq('media_type', mediaType).maybeSingle(),
          ]);
          if (cached && inMovies) {
            results.push({ imdbId, tmdbId, mediaType, status: 'cached' });
            continue;
          }

          const { row, moviesRow } = await buildCacheRow(tmdbId, mediaType);
          if (!cached) {
            const { error } = await supabase.from('movie_cache').upsert(row, { onConflict: 'tmdb_id,media_type' });
            if (error) throw new Error(`movie_cache: ${error.message}`);
          }
          if (!inMovies) {
            const { error } = await supabase.from('movies').upsert(moviesRow, { onConflict: 'id,media_type' });
            if (error) throw new Error(`movies: ${error.message}`);
          }
          results.push({ imdbId, tmdbId, mediaType, status: 'added' });
        } catch (error) {
          results.push({
            imdbId,
            tmdbId: null,
            mediaType: null,
            status: `error:${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
          });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return json({ results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, 500);
  }
});
