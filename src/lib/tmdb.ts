import { useDebounce } from 'use-debounce';
import { supabase } from './supabase';
import { cache, CACHE_KEYS, CACHE_TTL } from './cache';

// Secure proxy endpoint
const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tmdb-proxy`;

// Helper function to call TMDB through secure proxy
async function tmdbFetch(endpoint: string): Promise<any> {
  const url = `${PROXY_URL}?endpoint=${encodeURIComponent(endpoint)}`;

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
  poster_path: string;
  overview: string;
  release_date: string;
  vote_average: number;
  runtime: number;
  genres: Genre[];
  userRating?: number | null;
  popularity?: number;
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

export const getCurrentSeason = () => {
  const month = new Date().getMonth() + 1;

  if (month === 10) {
    return { name: 'Halloween', emoji: '🎃', key: 'halloween' };
  } else if (month === 11 || month === 12) {
    return { name: 'Natal', emoji: '🎄', key: 'christmas' };
  } else if (month === 1 || month === 7) {
    return { name: 'Férias', emoji: '🏖️', key: 'vacation' };
  } else if (month === 2 || month === 6) {
    return { name: 'Dia dos Namorados', emoji: '💕', key: 'valentines' };
  } else if (month === 3 || month === 4) {
    return { name: 'Páscoa', emoji: '🐰', key: 'easter' };
  } else if (month === 8 || month === 9) {
    return { name: 'Oscar & Cannes', emoji: '🏆', key: 'awards' };
  }

  return { name: 'Festividades', emoji: '🎭', key: 'festivals' };
};

export const getSeasonalMovies = async (): Promise<Movie[]> => {
  // TESTE: Forçar filmes de AÇÃO (gênero 28) para debug
  const genreIds = '28'; // Action

  console.log('🎬 TESTE: Buscando filmes de AÇÃO do TMDB');
  console.log('Genre ID:', genreIds);

  let endpoint = '/discover/movie?sort_by=popularity.desc';

  if (genreIds) {
    endpoint += `&with_genres=${genreIds}`;
  }

  console.log('Endpoint:', endpoint);

  const data = await tmdbFetch(endpoint);

  console.log('✅ TMDB retornou:', data.results?.length || 0, 'filmes');
  console.log('Primeiros 5 filmes:', data.results?.slice(0, 5).map((m: Movie) => ({
    id: m.id,
    title: m.title
  })));

  return data.results.slice(0, 20);
};

export const searchMovies = async (query: string): Promise<Movie[]> => {
  if (!query.trim()) return [];

  const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&sort_by=popularity.desc`);
  return data.results;
};

export const getMovieDetails = async (movieId: number): Promise<Movie> => {
  const cacheKey = CACHE_KEYS.MOVIE_DETAILS(movieId);
  const cached = cache.get<Movie>(cacheKey);

  if (cached) {
    return cached;
  }

  const [movieDetails, providersData, releaseDatesData] = await Promise.all([
    tmdbFetch(`/movie/${movieId}?append_to_response=credits`),
    tmdbFetch(`/movie/${movieId}/watch/providers`),
    tmdbFetch(`/movie/${movieId}/release_dates`)
  ]);

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

    // Process release dates to extract content ratings
    // Priority: US ratings first, then BR, then others
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
    
    if (contentRatings.length > 0) {
      movieDetails.content_ratings = contentRatings;
    }
  }

  cache.set(cacheKey, movieDetails, CACHE_TTL.MOVIE_DETAILS);
  return movieDetails;
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

