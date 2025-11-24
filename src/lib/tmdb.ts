import { useDebounce } from 'use-debounce';
import { supabase } from './supabase';
import { cache, CACHE_KEYS, CACHE_TTL } from './cache';
import i18n from '../i18n';

// Secure proxy endpoint
const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tmdb-proxy`;

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

  console.log(`📡 TMDB Fetch: ${finalEndpoint}`);

  const url = `${PROXY_URL}?endpoint=${encodeURIComponent(finalEndpoint)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
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

export interface ContentRating {
  iso_3166_1: string;
  certification: string;
  meaning?: string;
  order?: number;
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
  runtime: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number | number[];
  genres: Genre[];
  userRating?: number | null;
  popularity?: number;
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
  content_ratings?: ContentRating[];
  production_countries?: Array<{
    iso_3166_1: string;
    name: string;
  }>;
  origin_country?: string[];
}

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
  const cacheKey = CACHE_KEYS.MOVIE_DETAILS(movieId);
  const memCached = cache.get<Movie>(cacheKey);

  if (memCached) {
    return memCached;
  }

  // Try to get from database cache first (if enabled)
  if (useCache) {
    const language = getCurrentLanguage();
    const dbCached = await getCachedMovie(movieId, language, mediaType);

    if (dbCached) {
      console.log(`🎯 Using cached ${mediaType} ${movieId} from database`);
      cache.set(cacheKey, dbCached, CACHE_TTL.MOVIE_DETAILS);
      return dbCached;
    }
  }

  console.log(`🌐 Fetching movie ${movieId} from TMDB API`);

  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const releaseDateEndpoint = mediaType === 'tv' ? 'content_ratings' : 'release_dates';

  const [movieDetails, providersData, releaseDatesData] = await Promise.all([
    tmdbFetch(`/${endpoint}/${movieId}?append_to_response=credits`),
    tmdbFetch(`/${endpoint}/${movieId}/watch/providers`),
    tmdbFetch(`/${endpoint}/${movieId}/${releaseDateEndpoint}`)
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

  // Get content ratings
  if (releaseDatesData && releaseDatesData.results) {
    const contentRatings: ContentRating[] = [];

    if (mediaType === 'tv') {
      // TV shows have different structure - array of ratings
      const usRating = releaseDatesData.results.find((r: any) => r.iso_3166_1 === 'US');
      const brRating = releaseDatesData.results.find((r: any) => r.iso_3166_1 === 'BR');

      if (usRating && usRating.rating) {
        contentRatings.push({
          iso_3166_1: 'US',
          certification: usRating.rating,
          meaning: getContentWarnings(usRating.rating, '')
        });
      }

      if (brRating && brRating.rating) {
        contentRatings.push({
          iso_3166_1: 'BR',
          certification: brRating.rating,
          meaning: getContentWarnings(brRating.rating, '')
        });
      }

      // If no US or BR ratings, use first available
      if (contentRatings.length === 0 && releaseDatesData.results.length > 0) {
        const firstRating = releaseDatesData.results[0];
        if (firstRating.rating) {
          contentRatings.push({
            iso_3166_1: firstRating.iso_3166_1,
            certification: firstRating.rating,
            meaning: getContentWarnings(firstRating.rating, '')
          });
        }
      }
    } else {
      // Movies - existing logic
      const usReleases = releaseDatesData.results.find((r: any) => r.iso_3166_1 === 'US');
      const brReleases = releaseDatesData.results.find((r: any) => r.iso_3166_1 === 'BR');

      if (usReleases && usReleases.release_dates) {
        const usRating = usReleases.release_dates.find((rd: any) => rd.certification && rd.certification !== '');
        if (usRating) {
          contentRatings.push({
            iso_3166_1: 'US',
            certification: usRating.certification,
            meaning: getContentWarnings(usRating.certification, usRating.note)
          });
        }
      }

      if (brReleases && brReleases.release_dates) {
        const brRating = brReleases.release_dates.find((rd: any) => rd.certification && rd.certification !== '');
        if (brRating) {
          contentRatings.push({
            iso_3166_1: 'BR',
            certification: brRating.certification,
            meaning: getContentWarnings(brRating.certification, brRating.note)
          });
        }
      }

      // If no US or BR ratings, use the first available
      if (contentRatings.length === 0) {
        for (const countryReleases of releaseDatesData.results) {
          if (countryReleases.release_dates) {
            const rating = countryReleases.release_dates.find((rd: any) => rd.certification && rd.certification !== '');
            if (rating) {
              contentRatings.push({
                iso_3166_1: countryReleases.iso_3166_1,
                certification: rating.certification,
                meaning: getContentWarnings(rating.certification, rating.note)
              });
              break;
            }
          }
        }
      }
    }

    if (contentRatings.length > 0) {
      movieDetails.content_ratings = contentRatings;
    }
  }

  cache.set(cacheKey, movieDetails, CACHE_TTL.MOVIE_DETAILS);

  // Save to database cache in background (don't await to avoid slowing down response)
  if (useCache) {
    cacheMovie(movieId, movieDetails, mediaType).catch(err =>
      console.error('Background cache save failed:', err)
    );
  }

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

    // Skip cache if movie has no rating (0.0) - fetch fresh data from API
    if (data.vote_average === 0 || data.vote_average === null) {
      console.log(`Movie ${movieId} has no rating, fetching fresh data from API`);
      return null;
    }

    // Convert cached data to Movie interface based on language
    const isPortuguese = language.startsWith('pt');

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
      genres: isPortuguese && data.genres_pt ? data.genres_pt : data.genres_en,
      credits: {
        cast: data.cast_members || [],
        crew: data.director ? [{ id: 0, name: data.director, job: 'Director' }] : []
      },
      watchProviders: data.watch_providers,
      content_ratings: data.content_ratings,
      seasons: data.seasons_data
    };
  } catch (error) {
    console.error('Error fetching from cache:', error);
    return null;
  }
}

// Helper to save movie to cache
async function cacheMovie(movieId: number, movieData: any, mediaType: 'movie' | 'tv'): Promise<void> {
  try {
    console.log(`💾 Caching movie ${movieId} (${mediaType})...`);

    // Fetch both English and Portuguese versions
    const [enData, ptData] = await Promise.all([
      tmdbFetch(`/${mediaType === 'tv' ? 'tv' : 'movie'}/${movieId}?language=en-US&append_to_response=credits`),
      tmdbFetch(`/${mediaType === 'tv' ? 'tv' : 'movie'}/${movieId}?language=pt-BR&append_to_response=credits`)
    ]);

    const enTitle = mediaType === 'tv' ? enData.name : enData.title;
    const ptTitle = mediaType === 'tv' ? ptData.name : ptData.title;

    console.log(`📝 EN: "${enTitle}" | PT: "${ptTitle}"`);
    console.log(`🖼️ Poster EN: ${enData.poster_path} | PT: ${ptData.poster_path}`);

    // For TV shows, use "created_by" instead of director
    let director;
    if (mediaType === 'tv') {
      director = enData.created_by && enData.created_by.length > 0
        ? enData.created_by[0].name
        : null;
    } else {
      director = enData.credits?.crew?.find((person: any) => person.job === 'Director')?.name;
    }
    const castMembers = enData.credits?.cast?.slice(0, 10).map((person: any) => ({
      id: person.id,
      name: person.name,
      character: person.character
    })) || [];

    // Calculate runtime for TV shows and fetch seasons data
    let totalRuntime = enData.runtime;
    let episodeRuntime = null;
    let totalEpisodes = null;
    let seasonsData = null;

    if (mediaType === 'tv') {
      // For TV shows, calculate total runtime
      totalEpisodes = enData.number_of_episodes || 0;

      // Get average episode runtime (API returns array, use first value or calculate average)
      if (enData.episode_run_time && enData.episode_run_time.length > 0) {
        episodeRuntime = Math.round(
          enData.episode_run_time.reduce((a: number, b: number) => a + b, 0) / enData.episode_run_time.length
        );
        totalRuntime = totalEpisodes * episodeRuntime;
      }

      // Fetch seasons data with episodes
      if (enData.number_of_seasons && enData.number_of_seasons > 0) {
        const seasons = [];
        for (let i = 1; i <= enData.number_of_seasons; i++) {
          try {
            const seasonData = await tmdbFetch(`/tv/${movieId}/season/${i}?language=${getCurrentLanguage()}`);
            seasons.push({
              season_number: seasonData.season_number,
              name: seasonData.name,
              episode_count: seasonData.episodes?.length || 0,
              air_date: seasonData.air_date,
              overview: seasonData.overview,
              poster_path: seasonData.poster_path,
              episodes: seasonData.episodes?.map((ep: any) => ({
                episode_number: ep.episode_number,
                name: ep.name,
                air_date: ep.air_date,
                runtime: ep.runtime,
                overview: ep.overview,
                vote_average: ep.vote_average
              })) || []
            });
          } catch (error) {
            console.warn(`Failed to fetch season ${i} for TV ${movieId}:`, error);
          }
        }
        seasonsData = seasons;
      }
    }

    // Prepare cache data
    const cacheData = {
      id: movieId,
      tmdb_id: movieId,
      media_type: mediaType,
      poster_path: enData.poster_path,
      poster_path_pt: ptData.poster_path,
      backdrop_path: enData.backdrop_path,
      vote_average: enData.vote_average,
      vote_count: enData.vote_count,
      runtime: totalRuntime,
      number_of_seasons: enData.number_of_seasons,
      number_of_episodes: totalEpisodes,
      episode_run_time: episodeRuntime,
      origin_country: enData.origin_country || enData.production_countries?.map((c: any) => c.iso_3166_1) || [],
      release_date: mediaType === 'tv' ? enData.first_air_date : enData.release_date,

      title_en: enTitle,
      overview_en: enData.overview,
      genres_en: enData.genres,

      title_pt: ptTitle,
      overview_pt: ptData.overview,
      genres_pt: ptData.genres,

      director,
      cast_members: castMembers,
      watch_providers: movieData.watchProviders || {},
      content_ratings: movieData.content_ratings || [],
      seasons_data: seasonsData,

      updated_at: new Date().toISOString()
    };

    // Upsert to cache (using composite key: tmdb_id + media_type)
    const { error } = await supabase
      .from('movie_cache')
      .upsert(cacheData, { onConflict: 'tmdb_id,media_type' });

    if (error) {
      console.error('Error caching movie:', error);
    } else {
      console.log(`✅ Cached ${mediaType} ${movieId} in database`);
    }
  } catch (error) {
    console.error('Error in cacheMovie:', error);
  }
}

// Helper to get multiple movies from cache efficiently
export const getMoviesFromCache = async (movieIds: number[]): Promise<Map<number, Movie>> => {
  const language = getCurrentLanguage();
  const movieMap = new Map<number, Movie>();

  if (movieIds.length === 0) return movieMap;

  try {
    const { data, error } = await supabase
      .from('movie_cache')
      .select('*')
      .in('tmdb_id', movieIds);

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
          content_ratings: cached.content_ratings
        };

        movieMap.set(cached.tmdb_id, movie);
      });

      console.log(`🎯 Loaded ${movieMap.size}/${movieIds.length} movies from cache`);
    }
  } catch (error) {
    console.error('Error fetching movies from cache:', error);
  }

  return movieMap;
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

  // Try cache with correct media_type
  const language = getCurrentLanguage();
  const cached = await getCachedMovie(movieId, language, mediaType);

  if (cached) {
    return cached;
  }

  // Fallback: fetch from API
  return getMovieDetails(movieId, mediaType);
};

// Helper function to generate content warnings based on certification and notes
function getContentWarnings(certification: string, note?: string): string {
  // Default warnings based on common certifications
  const defaultWarnings: Record<string, string> = {
    'G': 'Suitable for all ages',
    'PG': 'Parental guidance suggested',
    'PG-13': 'Parents strongly cautioned - May be inappropriate for children under 13',
    'R': 'Restricted - Under 17 requires accompanying parent or adult guardian',
    'NC-17': 'Adults Only - No one 17 and under admitted',
    
    // Brazilian ratings
    'L': 'Livre - Suitable for all ages',
    '10': '10+ - Not recommended for children under 10',
    '12': '12+ - Not recommended for children under 12',
    '14': '14+ - Not recommended for children under 14',
    '16': '16+ - Not recommended for people under 16',
    '18': '18+ - Not recommended for people under 18',
  };

  // Common content warnings based on ratings
  const commonWarnings: Record<string, string[]> = {
    'PG': ['Mild language', 'Brief violence'],
    'PG-13': ['Some violence', 'Brief strong language', 'Suggestive content'],
    'R': ['Strong language', 'Violence', 'Sexual content', 'Drug use'],
    'NC-17': ['Explicit content'],
    '12': ['Mild violence', 'Mild language'],
    '14': ['Violence', 'Some strong language', 'Some suggestive content'],
    '16': ['Strong violence', 'Strong language', 'Sexual content', 'Drug references'],
    '18': ['Explicit content', 'Graphic violence', 'Strong sexual content', 'Drug abuse']
  };
  
  // Parse note for specific warnings
  let warningText = defaultWarnings[certification] || `Rating: ${certification}`;
  
  // Add common warnings if available
  if (commonWarnings[certification]) {
    if (!note) {
      warningText += ` - May contain: ${commonWarnings[certification].join(', ')}`;
    }
  }
  
  // If there's a note from the API, use it instead of default warnings
  if (note && note.length > 5 && !note.includes('http')) {
    warningText = `${certification} - ${note}`;
  }
  
  return warningText;
}

