import { useDebounce } from 'use-debounce';
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';
import { cache, CACHE_KEYS, CACHE_TTL } from './cache';
import i18n from '../i18n';

// Secure proxy endpoint
const PROXY_URL = `${supabaseUrl}/functions/v1/tmdb-proxy`;

// Get current language for TMDB requests
function getCurrentLanguage(): string {
  const lang = i18n.language || 'en';
  // TMDB expects language codes like 'pt-BR' or 'en-US'
  return lang === 'pt' ? 'pt-BR' : 'en-US';
}

// Helper function to call TMDB through secure proxy (with automatic language)
async function tmdbFetch(endpoint: string): Promise<any> {
  // Only add language if not already present in endpoint
  const hasLanguage = endpoint.includes('language=');
  let finalEndpoint = endpoint;

  if (!hasLanguage) {
    const language = getCurrentLanguage();
    const separator = endpoint.includes('?') ? '&' : '?';
    finalEndpoint = `${endpoint}${separator}language=${language}`;
  }

  const url = `${PROXY_URL}?endpoint=${encodeURIComponent(finalEndpoint)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB request failed: ${response.statusText}`);
  }

  return response.json();
}

export interface Genre {
  id: number;
  name: string;
}

export interface Cast {
  id: number;
  name: string;
  character: string;
}

export interface StreamingProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface WatchProviders {
  link: string;
  flatrate?: StreamingProvider[];
  rent?: StreamingProvider[];
  buy?: StreamingProvider[];
}

export interface Movie {
  id: number;
  title: string;
  name?: string;
  poster_path: string;
  overview: string;
  release_date: string;
  first_air_date?: string;
  vote_average: number;
  vote_count?: number;
  runtime: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number | number[];
  genres: Genre[];
  userRating?: number | null;
  popularity?: number;
  ratedByUsername?: string;
  media_type?: 'movie' | 'tv';
  credits?: {
    cast: Cast[];
    crew: Array<{
      id: number;
      name: string;
      job: string;
    }>;
  };
  watchProviders?: WatchProviders;
  production_countries?: Array<{
    iso_3166_1: string;
    name: string;
  }>;
  origin_country?: string[];
}

export const findByImdbId = async (imdbId: string): Promise<{ id: number; media_type: 'movie' | 'tv' } | null> => {
  try {
    const data = await tmdbFetch(`/find/${imdbId}?external_source=imdb_id&language=en-US`);
    if (data.movie_results?.length > 0) {
      return { id: data.movie_results[0].id, media_type: 'movie' };
    }
    if (data.tv_results?.length > 0) {
      return { id: data.tv_results[0].id, media_type: 'tv' };
    }
    return null;
  } catch {
    return null;
  }
};

export const getTrending = async (): Promise<Movie[]> => {
  const data = await tmdbFetch('/trending/movie/week');
  return data.results;
};

export const getComingSoon = async (): Promise<Movie[]> => {
  const data = await tmdbFetch('/movie/upcoming?region=US');
  return data.results;
};

export const getTopRatedGems = async (): Promise<Movie[]> => {
  const data = await tmdbFetch('/discover/movie?sort_by=vote_average.desc&vote_count.gte=5000&vote_average.gte=8');
  return data.results;
};

// "Melhores do Ano" — o TMDB não tem um endpoint dedicado pra isso
// (/movie/top_rated não filtra por período, mistura clássicos de todos
// os tempos). Em vez de usar o ano civil atual (que ficaria vazio todo
// 1º de janeiro, até os primeiros lançamentos do ano acumularem votos),
// usa uma janela móvel dos últimos 365 dias — sempre tem conteúdo, e
// ainda captura bem a intenção de "os melhores lançamentos recentes".
// vote_count.gte mais baixo que o de getTopRatedGems (150 em vez de
// 5000) porque filmes recentes tiveram bem menos tempo pra acumular
// votos que os "de todos os tempos".
// "Melhores do Ano" — o TMDB não tem um endpoint dedicado pra isso
// (/movie/top_rated não filtra por período, mistura clássicos de todos
// os tempos). Em vez de usar o ano civil atual (que ficaria vazio todo
// 1º de janeiro, até os primeiros lançamentos do ano acumularem votos),
// usa uma janela móvel dos últimos 365 dias — sempre tem conteúdo, e
// ainda captura bem a intenção de "os melhores lançamentos recentes".
//
// Um corte simples por "vote_count.gte=X" é tudo-ou-nada: um filme com
// poucos votos mas MUITO entusiasmados (ex: 254 votos, nota 8.9 — um
// grupo pequeno de fãs avaliando alto) passa direto com a nota bruta,
// distorcendo o ranking. A correção correta é a MÉDIA BAYESIANA
// PONDERADA — a mesma técnica que o próprio IMDb usa no ranking Top 250
// deles — que "puxa" a nota de filmes com poucos votos na direção da
// média geral do conjunto, proporcionalmente à quantidade de votos que
// eles têm, em vez de simplesmente excluir ou aceitar a nota bruta.
//
// weighted = (v/(v+m)) * R + (m/(v+m)) * C
//   v = votos do filme, R = nota do filme
//   m = limiar de confiança (quantos votos até a nota "pesar" sozinha)
//   C = média geral do conjunto de candidatos
const BEST_OF_YEAR_CONFIDENCE_THRESHOLD = 300;

export const getBestOfYear = async (): Promise<Movie[]> => {
  const today = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setDate(today.getDate() - 365);
  const formatDate = (d: Date) => d.toISOString().split('T')[0];
  const dateParams = `primary_release_date.gte=${formatDate(oneYearAgo)}&primary_release_date.lte=${formatDate(today)}`;

  // Corte rígido de 400 votos — o teste real mostrou que só a ponderação
  // bayesiana não bastava: filmes com poucos votos continuavam
  // aparecendo, só reordenados pra baixo, não removidos de fato. 400 é
  // o piso mínimo pra sequer entrar no pool de candidatos; a ponderação
  // abaixo continua refinando a ordem entre os que passam desse corte
  // (um filme com 400 votos ainda pesa menos que um com 10 mil).
  const pages = await Promise.all(
    [1, 2, 3, 4, 5].map((page) =>
      tmdbFetch(`/discover/movie?sort_by=vote_average.desc&vote_count.gte=400&${dateParams}&page=${page}`)
    )
  );
  const candidates: Movie[] = pages.flatMap((p) => p.results || []);
  if (candidates.length === 0) return [];

  const meanRating =
    candidates.reduce((sum, m) => sum + (m.vote_average || 0), 0) / candidates.length;
  const m = BEST_OF_YEAR_CONFIDENCE_THRESHOLD;

  const weighted = candidates
    .map((movie) => {
      const v = movie.vote_count || 0;
      const r = movie.vote_average || 0;
      const weightedRating = (v / (v + m)) * r + (m / (v + m)) * meanRating;
      return { movie, weightedRating };
    })
    .sort((a, b) => b.weightedRating - a.weightedRating);

  return weighted.slice(0, 20).map((w) => w.movie);
};

export const getHiddenIndies = async (): Promise<Movie[]> => {
  const data = await tmdbFetch('/discover/movie?sort_by=popularity.asc&popularity.lte=10&vote_count.gte=50&with_original_language=en');
  return data.results;
};

export const searchMovies = async (query: string): Promise<Movie[]> => {
  if (!query.trim()) return [];

  // Search both movies and TV shows
  const [movieData, tvData] = await Promise.all([
    tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&sort_by=popularity.desc`),
    tmdbFetch(`/search/tv?query=${encodeURIComponent(query)}&sort_by=popularity.desc`)
  ]);

  // Normalize TV shows to match Movie interface
  const movies = movieData.results.map((movie: any) => ({
    ...movie,
    media_type: 'movie' as const
  }));

  const tvShows = tvData.results.map((show: any) => ({
    ...show,
    id: show.id,
    title: show.name,
    release_date: show.first_air_date,
    media_type: 'tv' as const
  }));

  // Combine and sort by popularity
  const combined = [...movies, ...tvShows];
  return combined.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
};

export const getMovieDetails = async (movieId: number, mediaType: 'movie' | 'tv' = 'movie', useCache: boolean = true): Promise<Movie> => {
  const language = getCurrentLanguage();
  const cacheKey = `${CACHE_KEYS.MOVIE_DETAILS(movieId, mediaType)}:${language}`;
  const memCached = cache.get<Movie>(cacheKey);

  if (memCached) {
    return memCached;
  }

  // Try to get from database cache first (if enabled)
  if (useCache) {
    const dbCached = await getCachedMovie(movieId, language, mediaType);
    if (dbCached) {
      cache.set(cacheKey, dbCached, CACHE_TTL.MOVIE_DETAILS);
      return dbCached;
    }
  }

  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const [movieDetails, providersData] = await Promise.all([
    tmdbFetch(`/${endpoint}/${movieId}?append_to_response=credits`),
    tmdbFetch(`/${endpoint}/${movieId}/watch/providers`),
  ]);

  // Normalize TV show data to match Movie interface
  if (mediaType === 'tv') {
    movieDetails.title = movieDetails.name;
    movieDetails.release_date = movieDetails.first_air_date;
    movieDetails.media_type = 'tv';
  } else {
    movieDetails.media_type = 'movie';
  }

  // Get providers for Brazil (BR) or fallback to US if not available
  const countryData = providersData.results?.BR || providersData.results?.US;
  if (countryData) {
    movieDetails.watchProviders = {
      link: countryData.link,
      flatrate: countryData.flatrate,
      rent: countryData.rent,
      buy: countryData.buy
    };
  }

  cache.set(cacheKey, movieDetails, CACHE_TTL.MOVIE_DETAILS);
  return movieDetails;
};

// Helper to get cached movie from database
async function getCachedMovie(movieId: number, language: string, mediaType: 'movie' | 'tv' = 'movie'): Promise<Movie | null> {
  try {
    const { data, error } = await supabase
      .from('movie_cache')
      .select('*')
      .eq('tmdb_id', movieId)
      .eq('media_type', mediaType)
      .maybeSingle();

    if (error || !data) return null;

    // Convert cached data to Movie interface based on language
    const isPortuguese = language.startsWith('pt');

    // Parse genres to ensure correct format
    const rawGenres = isPortuguese && data.genres_pt ? data.genres_pt : data.genres_en;
    let parsedGenres: any[] = [];

    if (rawGenres) {
      // If genres is already an array of objects with id and name, use it
      if (Array.isArray(rawGenres) && rawGenres.length > 0) {
        if (typeof rawGenres[0] === 'object' && rawGenres[0].id && rawGenres[0].name) {
          parsedGenres = rawGenres;
        } else if (typeof rawGenres[0] === 'string') {
          // If it's an array of strings, convert to objects
          parsedGenres = rawGenres.map((name: string, index: number) => ({
            id: index,
            name: name
          }));
        }
      }
    }

    return {
      id: data.tmdb_id,
      title: isPortuguese && data.title_pt ? data.title_pt : data.title_en,
      poster_path: isPortuguese && data.poster_path_pt ? data.poster_path_pt : data.poster_path,
      backdrop_path: data.backdrop_path,
      overview: isPortuguese && data.overview_pt ? data.overview_pt : data.overview_en,
      release_date: data.release_date,
      vote_average: data.vote_average,
      vote_count: data.vote_count,
      runtime: data.runtime,
      number_of_seasons: data.number_of_seasons,
      number_of_episodes: data.number_of_episodes,
      episode_run_time: data.episode_run_time,
      origin_country: data.origin_country,
      media_type: data.media_type as 'movie' | 'tv',
      genres: parsedGenres,
      credits: {
        cast: data.cast_members || [],
        crew: data.director ? [{ id: 0, name: data.director, job: 'Director' }] : []
      },
      watchProviders: data.watch_providers,
      seasons: data.seasons_data,
      keywords: data.keywords || []
    };
  } catch (error) {
    console.error('Error fetching from cache:', error);
    return null;
  }
}

// Called when adding a movie to library: inserts or updates the full movie_cache entry
export async function ensureMovieCached(movieId: number, mediaType: 'movie' | 'tv'): Promise<void> {
  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';

    const [enData, ptData] = await Promise.all([
      tmdbFetch(`/${endpoint}/${movieId}?language=en-US&append_to_response=credits,keywords`),
      tmdbFetch(`/${endpoint}/${movieId}?language=pt-BR&append_to_response=credits`)
    ]);

    const enTitle = mediaType === 'tv' ? enData.name : enData.title;
    const ptTitle = mediaType === 'tv' ? ptData.name : ptData.title;

    let director: string | null = null;
    if (mediaType === 'tv') {
      director = enData.created_by?.[0]?.name ||
        enData.credits?.crew?.find((p: any) => p.job === 'Executive Producer')?.name || null;
    } else {
      director = enData.credits?.crew?.find((p: any) => p.job === 'Director')?.name || null;
    }

    const castMembers = enData.credits?.cast?.slice(0, 10).map((p: any) => ({
      id: p.id,
      name: p.name,
      character: p.character
    })) || [];

    let totalRuntime = enData.runtime || 0;
    let episodeRuntime: number | null = null;

    if (mediaType === 'tv' && enData.episode_run_time?.length > 0) {
      episodeRuntime = Math.round(
        enData.episode_run_time.reduce((a: number, b: number) => a + b, 0) / enData.episode_run_time.length
      );
      totalRuntime = (enData.number_of_episodes || 0) * episodeRuntime;
    }

    let seasonsData: any[] | null = null;
    if (mediaType === 'tv' && enData.number_of_seasons > 0) {
      seasonsData = await fetchTVSeasonsData(movieId, enData.number_of_seasons);
    }

    // Extrai keywords/tags temáticas (ex: "time travel", "film noir") — formato do TMDB
    // difere entre filme (keywords.keywords) e série (keywords.results).
    // Reservado para uso futuro pelo Oráculo; não é lido por nenhuma feature ainda.
    const keywordsRaw = mediaType === 'tv' ? enData.keywords?.results : enData.keywords?.keywords;
    const keywords = (keywordsRaw || []).map((k: any) => ({ id: k.id, name: k.name }));

    const cacheData: Record<string, any> = {
      id: movieId,
      tmdb_id: movieId,
      media_type: mediaType,
      release_date: mediaType === 'tv' ? enData.first_air_date : enData.release_date,
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
      title_en: enTitle,
      overview_en: enData.overview,
      genres_en: enData.genres,
      title_pt: ptTitle,
      overview_pt: ptData.overview,
      genres_pt: ptData.genres,
      director,
      cast_members: castMembers,
      keywords,
      status: mediaType === 'tv' ? enData.status : null,
      in_production: mediaType === 'tv' ? (enData.in_production ?? false) : false,
      last_air_date: mediaType === 'tv' ? enData.last_air_date : null,
      updated_at: new Date().toISOString()
    };

    if (seasonsData !== null) {
      cacheData.seasons_data = seasonsData;
    }

    const { error } = await supabase
      .from('movie_cache')
      .upsert(cacheData, { onConflict: 'tmdb_id,media_type' });

    if (error) {
      console.error('Error saving movie cache:', error);
    } else {
      cache.invalidate(CACHE_KEYS.MOVIE_DETAILS(movieId, mediaType));
    }
  } catch (error) {
    console.error('Error in ensureMovieCached:', error);
  }
}

// Fetches all seasons with their episodes for a TV show from TMDB API
export async function fetchTVSeasonsData(showId: number, numberOfSeasons: number): Promise<any[]> {
  const seasonPromises = Array.from({ length: numberOfSeasons }, (_, i) =>
    tmdbFetch(`/tv/${showId}/season/${i + 1}?language=en-US`).catch(() => null)
  );

  const seasonResults = await Promise.all(seasonPromises);

  return seasonResults
    .filter(Boolean)
    .map((s: any) => ({
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
        vote_average: ep.vote_average || 0
      }))
    }));
}

// Called on every search in AddMovies: updates ONLY existing movie_cache entries with fresh TMDB data
export async function updateMovieCache(movieId: number, mediaType: 'movie' | 'tv'): Promise<void> {
  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';

    const [enData, ptData] = await Promise.all([
      tmdbFetch(`/${endpoint}/${movieId}?language=en-US&append_to_response=credits,keywords`),
      tmdbFetch(`/${endpoint}/${movieId}?language=pt-BR&append_to_response=credits`)
    ]);

    const enTitle = mediaType === 'tv' ? enData.name : enData.title;
    const ptTitle = mediaType === 'tv' ? ptData.name : ptData.title;

    let director: string | null = null;
    if (mediaType === 'tv') {
      director = enData.created_by?.[0]?.name ||
        enData.credits?.crew?.find((p: any) => p.job === 'Executive Producer')?.name || null;
    } else {
      director = enData.credits?.crew?.find((p: any) => p.job === 'Director')?.name || null;
    }

    const castMembers = enData.credits?.cast?.slice(0, 10).map((p: any) => ({
      id: p.id,
      name: p.name,
      character: p.character
    })) || [];

    let totalRuntime = enData.runtime || 0;
    let episodeRuntime: number | null = null;

    if (mediaType === 'tv' && enData.episode_run_time?.length > 0) {
      episodeRuntime = Math.round(
        enData.episode_run_time.reduce((a: number, b: number) => a + b, 0) / enData.episode_run_time.length
      );
      totalRuntime = (enData.number_of_episodes || 0) * episodeRuntime;
    }

    let seasonsData: any[] | null = null;
    if (mediaType === 'tv' && enData.number_of_seasons > 0) {
      seasonsData = await fetchTVSeasonsData(movieId, enData.number_of_seasons);
    }

    const keywordsRaw = mediaType === 'tv' ? enData.keywords?.results : enData.keywords?.keywords;
    const keywords = (keywordsRaw || []).map((k: any) => ({ id: k.id, name: k.name }));

    const updateData: Record<string, any> = {
      tmdb_id: movieId,
      media_type: mediaType,
      release_date: mediaType === 'tv' ? enData.first_air_date : enData.release_date,
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
      title_en: enTitle,
      overview_en: enData.overview,
      genres_en: enData.genres,
      title_pt: ptTitle,
      overview_pt: ptData.overview,
      genres_pt: ptData.genres,
      director,
      cast_members: castMembers,
      keywords,
      status: mediaType === 'tv' ? enData.status : null,
      in_production: mediaType === 'tv' ? (enData.in_production ?? false) : false,
      last_air_date: mediaType === 'tv' ? enData.last_air_date : null,
      updated_at: new Date().toISOString()
    };

    if (seasonsData !== null) {
      updateData.seasons_data = seasonsData;
    }

    const { error, count } = await supabase
      .from('movie_cache')
      .update(updateData)
      .eq('tmdb_id', movieId)
      .eq('media_type', mediaType)
      .select('tmdb_id', { count: 'exact', head: true });

    if (error) {
      console.error('Error updating movie cache:', error);
    } else if (count && count > 0) {
      cache.invalidate(CACHE_KEYS.MOVIE_DETAILS(movieId, mediaType));
    }
  } catch (error) {
    console.error('Error in updateMovieCache:', error);
  }
}

// Helper to get multiple movies from cache efficiently
export interface MovieTrailer {
  key: string;
  site: string;
  name: string;
}

// Busca o trailer oficial de um filme (usado no duelo do Oráculo). Prioriza
// trailer oficial do YouTube; se não achar nenhum, retorna null (o chamador
// deve mostrar "trailer não disponível" — comum em filmes do oráculo Cypher,
// que é propositalmente obscuro/underground).
export const getMovieTrailer = async (movieId: number, mediaType: 'movie' | 'tv' = 'movie'): Promise<MovieTrailer | null> => {
  try {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const data = await tmdbFetch(`/${endpoint}/${movieId}/videos?language=en-US`);
    const videos = data.results || [];

    const officialTrailer = videos.find(
      (v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.official
    );
    const anyTrailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
    const anyVideo = videos.find((v: any) => v.site === 'YouTube');

    const chosen = officialTrailer || anyTrailer || anyVideo;
    if (!chosen) return null;

    return { key: chosen.key, site: chosen.site, name: chosen.name };
  } catch (error) {
    console.error('Error fetching movie trailer:', error);
    return null;
  }
};

export const getMoviesFromCache = async (movieIds: number[]): Promise<Map<number, Movie>> => {
  const language = getCurrentLanguage();
  const movieMap = new Map<number, Movie>();

  if (movieIds.length === 0) return movieMap;

  try {
    const { data, error } = await supabase
      .from('movie_cache')
      .select('*')
      .in('tmdb_id', movieIds)
      .limit(50000);

    if (error) throw error;

    if (data) {
      const isPortuguese = language.startsWith('pt');

      data.forEach((cached: any) => {
        const movie: Movie = {
          id: cached.tmdb_id,
          title: isPortuguese && cached.title_pt ? cached.title_pt : cached.title_en,
          poster_path: isPortuguese && cached.poster_path_pt ? cached.poster_path_pt : cached.poster_path,
          backdrop_path: cached.backdrop_path,
          overview: isPortuguese && cached.overview_pt ? cached.overview_pt : cached.overview_en,
          release_date: cached.release_date,
          vote_average: cached.vote_average,
          runtime: cached.runtime,
          number_of_seasons: cached.number_of_seasons,
          media_type: cached.media_type as 'movie' | 'tv',
          genres: isPortuguese && cached.genres_pt ? cached.genres_pt : cached.genres_en,
          popularity: cached.popularity,
          credits: {
            cast: cached.cast_members || [],
            crew: cached.director ? [{ id: 0, name: cached.director, job: 'Director' }] : []
          },
          watchProviders: cached.watch_providers,
          content_ratings: cached.content_ratings,
          keywords: cached.keywords || []
        };
        movieMap.set(cached.tmdb_id, movie);
      });
    }
  } catch (error) {
    console.error('Error fetching movies from cache:', error);
  }

  return movieMap;
};

// Versão segura de getMoviesFromCache pra quando os resultados incluem
// filmes E séries misturados. A versão antiga busca só por tmdb_id, sem
// filtrar por media_type — como filmes e séries têm espaços de ID
// INDEPENDENTES no TMDB, um filme e uma série completamente diferentes
// podem ter o MESMO id numérico (ex: tmdb_id 105 é "De Volta para o
// Futuro" como filme E "Sex and the City" como série). Buscar só por
// tmdb_id retorna as DUAS linhas do cache, e como o Map da versão antiga
// é indexado só pelo id (sem media_type), uma sobrescreve a outra
// silenciosamente — o filme certo pode "virar" outro completamente
// diferente na tela. Esse mesmo bug já tinha sido identificado e
// corrigido antes em useProfileData.ts (função local batchFetchFromCache,
// não exportada) — essa é a versão equivalente, reaproveitável em
// qualquer lugar que precise buscar filmes por (id, media_type) sem
// risco de colisão.
export const getMoviesFromCacheByType = async (
  entries: { movie_id: number; media_type: string }[]
): Promise<Map<string, Movie>> => {
  const language = getCurrentLanguage();
  const isPortuguese = language.startsWith('pt');
  const map = new Map<string, Movie>();
  if (entries.length === 0) return map;

  const ids = [...new Set(entries.map((e) => e.movie_id))];

  try {
    const { data, error } = await supabase
      .from('movie_cache')
      .select('*')
      .in('tmdb_id', ids)
      .limit(50000);

    if (error) throw error;

    (data || []).forEach((cached: any) => {
      const movie: Movie = {
        id: cached.tmdb_id,
        title: isPortuguese && cached.title_pt ? cached.title_pt : cached.title_en,
        poster_path: isPortuguese && cached.poster_path_pt ? cached.poster_path_pt : cached.poster_path,
        backdrop_path: cached.backdrop_path,
        overview: isPortuguese && cached.overview_pt ? cached.overview_pt : cached.overview_en,
        release_date: cached.release_date,
        vote_average: cached.vote_average,
        runtime: cached.runtime,
        number_of_seasons: cached.number_of_seasons,
        media_type: cached.media_type as 'movie' | 'tv',
        genres: isPortuguese && cached.genres_pt ? cached.genres_pt : cached.genres_en,
        popularity: cached.popularity,
        credits: {
          cast: cached.cast_members || [],
          crew: cached.director ? [{ id: 0, name: cached.director, job: 'Director' }] : []
        },
        watchProviders: cached.watch_providers,
        content_ratings: cached.content_ratings,
        keywords: cached.keywords || []
      };
      // Chave composta (id + tipo) — a correção real. Duas linhas com o
      // mesmo tmdb_id mas media_type diferente ocupam slots separados no
      // Map, em vez de uma sobrescrever a outra.
      map.set(`${cached.tmdb_id}_${cached.media_type}`, movie);
    });
  } catch (error) {
    console.error('Error batch-fetching movies from cache by type:', error);
  }

  return map;
};

// "Melhores dos Amigos" — filmes com nota 7-10 avaliados mais
// recentemente por usuários seguidos, em ordem de frescor (mais
// recentes primeiro). A consulta pesada (JOIN entre follows e
// user_movies, filtro de nota, ordenação, limite) roda inteira no banco
// via RPC — o Postgres usa os índices certos pra fazer isso de forma
// eficiente mesmo com muitos usuários seguidos, sem precisar buscar
// "tudo" antes de aplicar o corte. Como a ordenação é sempre
// determinística (mais recente primeiro, com LIMIT fixo), a lista fica
// naturalmente estável entre atualizações de página — só muda quando
// avaliações genuinamente novas entram (empurrando as mais antigas pra
// fora do topo 20), sem depender de nenhuma amostragem aleatória.
export const getFriendsBestMovies = async (userId: string): Promise<Movie[]> => {
  const { data: ratings, error } = await supabase.rpc('get_friends_best_movies', {
    p_user_id: userId,
    p_limit: 20,
  });

  if (error) {
    console.error('Error fetching friends best movies:', error);
    return [];
  }
  if (!ratings || ratings.length === 0) return [];

  // getMoviesFromCacheByType (não a versão antiga) — a RPC retorna
  // filmes E séries misturados, e o bug do "De Volta para o Futuro"
  // virando "Sex and the City" na tela (mesmo tmdb_id, media_type
  // diferente) é exatamente o cenário que a versão antiga não cobria.
  const movieMap = await getMoviesFromCacheByType(
    ratings.map((r: any) => ({ movie_id: r.movie_id, media_type: r.media_type }))
  );

  // Reordena na MESMA ordem de frescor que já veio da RPC, e anexa quem
  // avaliou, caso seja útil exibir isso no card futuramente.
  return ratings
    .map((r: any) => {
      const movie = movieMap.get(`${r.movie_id}_${r.media_type}`);
      if (!movie) return null;
      return { ...movie, ratedByUsername: r.rated_by_username };
    })
    .filter((m: Movie | null): m is Movie => m !== null);
};

// Helper to get movie details with media_type from database
export const getMovieDetailsFromDB = async (movieId: number): Promise<Movie> => {
  // Fetch from movies table to get media_type
  const { data: dbMovie } = await supabase
    .from('movies')
    .select('media_type')
    .eq('id', movieId)
    .maybeSingle();

  const mediaType = dbMovie?.media_type || 'movie';
  const language = getCurrentLanguage();
  const cacheKey = `${CACHE_KEYS.MOVIE_DETAILS(movieId, mediaType)}:${language}`;
  const memCached = cache.get<Movie>(cacheKey);

  if (memCached) {
    return memCached;
  }

  const dbCached = await getCachedMovie(movieId, language, mediaType);
  if (dbCached) {
    cache.set(cacheKey, dbCached, CACHE_TTL.MOVIE_DETAILS);
    return dbCached;
  }

  // Fallback: fetch from API
  return getMovieDetails(movieId, mediaType);
};

// Bibliotecas do Oráculo — navegação paginada por um pool específico
// (oráculo + categoria). A RPC já retorna só a "fatia" pedida dos
// movie_ids (não o array inteiro, que em alguns pools passa de 900
// filmes) e o total real do pool, pra a interface saber quando parar de
// oferecer "carregar mais".
export interface OraclePoolPage {
  movies: Movie[];
  totalCount: number;
}

export const getOraclePoolMovies = async (
  cardType: 'bogart' | 'fincher' | 'cypher',
  moodKey: string,
  limit: number = 24,
  offset: number = 0
): Promise<OraclePoolPage> => {
  const { data, error } = await supabase.rpc('get_oracle_pool_movies', {
    p_card_type: cardType,
    p_mood_key: moodKey,
    p_limit: limit,
    p_offset: offset,
  });

  if (error || !data || data.length === 0) {
    if (error) console.error('Error fetching oracle pool movies:', error);
    return { movies: [], totalCount: 0 };
  }

  const totalCount = data[0].total_count;
  const movieIds = data.map((r: any) => r.movie_id);

  // Os pools guardam só o ID numérico, sem media_type — a maioria é
  // filme, mas o cache pode ter tanto filme quanto série pro mesmo ID
  // (mesmo risco de colisão já corrigido antes). Busca os dois tipos e
  // prioriza o que realmente existir no cache pra cada ID.
  const { data: cacheRows } = await supabase
    .from('movie_cache')
    .select('tmdb_id, media_type')
    .in('tmdb_id', movieIds);

  const entries = (cacheRows || []).map((row: any) => ({ movie_id: row.tmdb_id, media_type: row.media_type }));
  const movieMap = await getMoviesFromCacheByType(entries);

  // Reordena na mesma ordem em que veio da RPC (a ordem dos movie_ids no
  // pool é intencional, não deveria ser embaralhada pela consulta ao cache).
  const movies = movieIds
    .map((id: number) => {
      const movieKey = [...movieMap.keys()].find((key) => key.startsWith(`${id}_`));
      return movieKey ? movieMap.get(movieKey) : undefined;
    })
    .filter((m: Movie | undefined): m is Movie => m !== undefined);

  return { movies, totalCount };
};