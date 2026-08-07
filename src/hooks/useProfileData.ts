import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getMovieDetailsFromDB, Movie } from '../lib/tmdb';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';

// --- Tipos ---

export interface MovieWithRating extends Movie {
  userRating: number | null;
}

export interface Genre {
  id: number | string;
  name: string;
  count: number;
}

interface DecadeCount {
  [decade: string]: number;
}

export interface FavoriteDecade {
  decade: string;
  count: number;
  label: string;
  percentage: number;
  allDecades: DecadeCount;
}

export interface ActorCount {
  id: number;
  name: string;
  count: number;
  character?: string;
}

export interface DirectorCount {
  id?: number;
  name: string;
  count: number;
}

export interface LeastKnownGem {
  id: number;
  title: string;
  vote_count: number;
  release_date: string;
  vote_average: number;
  userRating?: number;
}

export interface EssencePersonality {
  subcategoria_id: string | null;
  personalidade_completa: string | null;
  arquetipo_primario: string | null;
  arquetipo_secundario: string | null;
}

export interface EssenceArchetype {
  archetype_name: string;
  subcategory_name: string;
  description: string;
  archetype_description: string;
  subcategory_description: string;
}

export interface ProfileData {
  loading: boolean;
  error: string | null;

  // Filmes (com nota do usuário) — usado pelo UserProfile.tsx pra renderizar a grade;
  // Profile.tsx pode simplesmente ignorar esse campo.
  movies: MovieWithRating[];

  // Estatísticas
  ratedMoviesCount: number;
  ratingDistribution: Record<number, number>;
  totalWatchTime: number;
  favoriteGenres: Genre[];
  favoriteDecade: FavoriteDecade | null;
  topActors: ActorCount[];
  topDirectors: DirectorCount[];
  leastKnownGem: LeastKnownGem | null;

  // Social
  followersCount: number;
  followingCount: number;

  // Essência / personalidade
  essencePersonality: EssencePersonality | null;
  essenceArchetype: EssenceArchetype | null;
  spectrumPoints: { e: number; i: number; c: number; s: number; r: number };
  essenceLoading: boolean;

  refetch: () => void;
}

// --- Helpers internos ---

function decadeLabel(decadeNum: number): string {
  if (decadeNum < 1980) return 'Grandpa Cinema';
  if (decadeNum < 2010) return 'Nostalgic';
  return 'Modern Lover';
}

/**
 * Busca em lote os detalhes de vários filmes do movie_cache numa única query,
 * já respeitando media_type (evita a colisão filme/série que getMoviesFromCache tem).
 * Retorna um Map chaveado por `${tmdb_id}_${media_type}`.
 * Filmes ausentes do cache precisam ser buscados individualmente por quem chama.
 */
async function batchFetchFromCache(
  entries: { movie_id: number; media_type: string }[],
  isPortuguese: boolean
): Promise<Map<string, Movie>> {
  const map = new Map<string, Movie>();
  if (entries.length === 0) return map;

  const ids = [...new Set(entries.map((e) => e.movie_id))];

  const { data, error } = await supabase
    .from('movie_cache')
    .select(
      'tmdb_id, media_type, title_en, title_pt, poster_path, poster_path_pt, release_date, vote_average, vote_count, runtime, episode_run_time, number_of_seasons, genres_en, genres_pt, director, cast_members, seasons_data, origin_country'
    )
    .in('tmdb_id', ids);

  if (error || !data) {
    console.error('Error batch-fetching movie_cache:', error);
    return map;
  }

  for (const row of data) {
    const genres = isPortuguese && row.genres_pt ? row.genres_pt : row.genres_en;
    const movie: Movie = {
      id: row.tmdb_id,
      title: isPortuguese && row.title_pt ? row.title_pt : row.title_en,
      poster_path: isPortuguese && row.poster_path_pt ? row.poster_path_pt : row.poster_path,
      overview: '',
      release_date: row.release_date,
      vote_average: row.vote_average,
      vote_count: row.vote_count,
      runtime: row.runtime,
      episode_run_time: row.episode_run_time,
      number_of_seasons: row.number_of_seasons,
      media_type: row.media_type as 'movie' | 'tv',
      genres: genres || [],
      credits: {
        cast: row.cast_members || [],
        crew: row.director ? [{ id: 0, name: row.director, job: 'Director' }] : []
      },
      seasons: row.seasons_data
    } as Movie;
    map.set(`${row.tmdb_id}_${row.media_type}`, movie);
  }

  return map;
}

// --- Hook principal ---

export function useProfileData(userId: string | undefined, language: string): ProfileData {
  const [loading, setLoading] = useState(true);
  const [essenceLoading, setEssenceLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  const [movies, setMovies] = useState<MovieWithRating[]>([]);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<Record<number, number>>({});
  const [totalWatchTime, setTotalWatchTime] = useState(0);
  const [favoriteGenres, setFavoriteGenres] = useState<Genre[]>([]);
  const [favoriteDecade, setFavoriteDecade] = useState<FavoriteDecade | null>(null);
  const [topActors, setTopActors] = useState<ActorCount[]>([]);
  const [topDirectors, setTopDirectors] = useState<DirectorCount[]>([]);
  const [leastKnownGem, setLeastKnownGem] = useState<LeastKnownGem | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const [essencePersonality, setEssencePersonality] = useState<EssencePersonality | null>(null);
  const [essenceArchetype, setEssenceArchetype] = useState<EssenceArchetype | null>(null);
  const [spectrumPoints, setSpectrumPoints] = useState({ e: 0, i: 0, c: 0, s: 0, r: 0 });

  const refetch = useCallback(() => setReloadFlag((f) => f + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        const cacheKey = CACHE_KEYS.USER_STATS(userId);
        const cached = cache.get<Omit<ProfileData, 'loading' | 'error' | 'essenceLoading' | 'refetch' | 'essencePersonality' | 'essenceArchetype' | 'spectrumPoints'>>(cacheKey);

        if (cached && cached.ratedMoviesCount > 0) {
          if (cancelled) return;
          setMovies(cached.movies);
          setRatedMoviesCount(cached.ratedMoviesCount);
          setRatingDistribution(cached.ratingDistribution);
          setTotalWatchTime(cached.totalWatchTime);
          setFavoriteGenres(cached.favoriteGenres);
          setFavoriteDecade(cached.favoriteDecade);
          setTopActors(cached.topActors);
          setTopDirectors(cached.topDirectors);
          setLeastKnownGem(cached.leastKnownGem);
          setFollowersCount(cached.followersCount);
          setFollowingCount(cached.followingCount);
          setLoading(false);
          return;
        }

        // --- Contadores sociais (2 queries leves, em paralelo) ---
        const [followersRes, followingRes, userMoviesRes] = await Promise.all([
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
          supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
          supabase
            .from('user_movies')
            .select('movie_id, rating, movies!inner(media_type)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        ]);

        if (userMoviesRes.error) throw userMoviesRes.error;

        const followers = followersRes.count || 0;
        const following = followingRes.count || 0;

        const rawUserMovies = (userMoviesRes.data || []).map((m: any) => ({
          movie_id: m.movie_id,
          rating: m.rating,
          media_type: m.movies?.media_type || 'movie'
        }));

        const ratedEntries = rawUserMovies.filter((m) => m.rating !== null);
        setRatedMoviesCount(ratedEntries.length);

        const distribution: Record<number, number> = {};
        for (let i = 0; i <= 10; i++) distribution[i] = 0;
        ratedEntries.forEach((m) => {
          if (m.rating !== null) distribution[m.rating]++;
        });
        setRatingDistribution(distribution);

        // --- Busca em lote no movie_cache (1 query pra todos) ---
        const isPortuguese = language.startsWith('pt');
        const cacheMap = await batchFetchFromCache(rawUserMovies, isPortuguese);

        const missing = rawUserMovies.filter((m) => !cacheMap.has(`${m.movie_id}_${m.media_type}`));

        // --- Reserva: só busca individualmente o que faltou no cache ---
        const fallbackDetails = await Promise.all(
          missing.map(async (m) => {
            try {
              const details = await getMovieDetailsFromDB(m.movie_id);
              return { key: `${m.movie_id}_${m.media_type}`, movie: details };
            } catch {
              return null;
            }
          })
        );
        fallbackDetails.forEach((r) => {
          if (r) cacheMap.set(r.key, r.movie);
        });

        // --- Monta a lista final de filmes com nota ---
        const fullMovies: MovieWithRating[] = rawUserMovies
          .map((m) => {
            const movie = cacheMap.get(`${m.movie_id}_${m.media_type}`);
            if (!movie) return null;
            return { ...movie, userRating: m.rating };
          })
          .filter((m): m is MovieWithRating => m !== null);

        if (cancelled) return;
        setMovies(fullMovies);

        const ratedMovies = fullMovies.filter((m) => m.userRating !== null);

        // --- Tempo assistido (séries: episódios assistidos, em lote) ---
        const tvIds = ratedMovies.filter((m) => m.media_type === 'tv').map((m) => m.id);
        let watchedEpisodesByShow = new Map<number, { season_number: number; episode_number: number }[]>();

        if (tvIds.length > 0) {
          const { data: watchedData } = await supabase
            .from('watched_episodes')
            .select('tmdb_id, season_number, episode_number')
            .eq('user_id', userId)
            .in('tmdb_id', tvIds);

          (watchedData || []).forEach((ep: any) => {
            const list = watchedEpisodesByShow.get(ep.tmdb_id) || [];
            list.push({ season_number: ep.season_number, episode_number: ep.episode_number });
            watchedEpisodesByShow.set(ep.tmdb_id, list);
          });
        }

        let totalMinutes = 0;
        ratedMovies.forEach((movie) => {
          if (movie.media_type === 'tv') {
            const watched = watchedEpisodesByShow.get(movie.id) || [];
            watched.forEach((ep) => {
              const season = (movie as any).seasons?.find((s: any) => s.season_number === ep.season_number);
              const episode = season?.episodes?.find((e: any) => e.episode_number === ep.episode_number);
              if (episode?.runtime) totalMinutes += episode.runtime;
            });
          } else {
            totalMinutes += movie.runtime || 0;
          }
        });
        setTotalWatchTime(totalMinutes);

        // --- Gêneros favoritos ---
        const genreCounts: Record<string, Genre> = {};
        ratedMovies.forEach((movie) => {
          movie.genres?.forEach((genre: any) => {
            const key = String(genre.id ?? genre.name);
            genreCounts[key] = genreCounts[key] || { id: genre.id ?? genre.name, name: genre.name, count: 0 };
            genreCounts[key].count++;
          });
        });
        const topGenres = Object.values(genreCounts).sort((a, b) => b.count - a.count).slice(0, 3);
        setFavoriteGenres(topGenres);

        // --- Década favorita ---
        const decadeCounts: DecadeCount = {};
        let totalWithDate = 0;
        ratedMovies.forEach((movie) => {
          if (movie.release_date) {
            const year = new Date(movie.release_date).getFullYear();
            const decade = Math.floor(year / 10) * 10;
            const decadeStr = `${decade}s`;
            decadeCounts[decadeStr] = (decadeCounts[decadeStr] || 0) + 1;
            totalWithDate++;
          }
        });

        if (totalWithDate > 0) {
          let topDecade = '';
          let topCount = 0;
          for (const [decade, count] of Object.entries(decadeCounts)) {
            if (count > topCount) {
              topDecade = decade;
              topCount = count;
            }
          }
          setFavoriteDecade({
            decade: topDecade,
            count: topCount,
            label: decadeLabel(parseInt(topDecade)),
            percentage: (topCount / totalWithDate) * 100,
            allDecades: decadeCounts
          });
        } else {
          setFavoriteDecade(null);
        }

        // --- Atores e diretores mais frequentes ---
        const actorCounts: Record<number, ActorCount> = {};
        const directorCounts: Record<string, DirectorCount> = {};

        ratedMovies.forEach((movie) => {
          movie.credits?.cast?.slice(0, 5).forEach((actor: any) => {
            if (!actor?.id || !actor?.name) return;
            actorCounts[actor.id] = actorCounts[actor.id] || {
              id: actor.id,
              name: actor.name,
              character: actor.character,
              count: 0
            };
            actorCounts[actor.id].count++;
          });

          const director = movie.credits?.crew?.find(
            (p: any) => p.job === 'Director' || p.job === 'Creator' || p.job === 'Executive Producer'
          );
          if (director?.name) {
            directorCounts[director.name] = directorCounts[director.name] || {
              id: director.id,
              name: director.name,
              count: 0
            };
            directorCounts[director.name].count++;
          }
        });

        setTopActors(Object.values(actorCounts).sort((a, b) => b.count - a.count).slice(0, 3));
        setTopDirectors(Object.values(directorCounts).sort((a, b) => b.count - a.count).slice(0, 3));

        // --- Jóia escondida (menor vote_count entre os avaliados) ---
        const withVoteCounts = ratedMovies
          .filter((m) => m.userRating !== null && m.vote_count !== undefined && m.vote_count !== null)
          .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

        const gem =
          withVoteCounts.length > 0
            ? {
                id: withVoteCounts[0].id,
                title: withVoteCounts[0].title,
                vote_count: withVoteCounts[0].vote_count || 0,
                release_date: withVoteCounts[0].release_date,
                vote_average: withVoteCounts[0].vote_average,
                userRating: withVoteCounts[0].userRating ?? undefined
              }
            : null;
        setLeastKnownGem(gem);

        setFollowersCount(followers);
        setFollowingCount(following);

        // --- Salva no cache local ---
        cache.set(
          cacheKey,
          {
            movies: fullMovies,
            ratedMoviesCount: ratedEntries.length,
            ratingDistribution: distribution,
            totalWatchTime: totalMinutes,
            favoriteGenres: topGenres,
            favoriteDecade:
              totalWithDate > 0
                ? {
                    decade: Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
                    count: Math.max(...Object.values(decadeCounts), 0),
                    label: decadeLabel(parseInt(Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '0')),
                    percentage: 0,
                    allDecades: decadeCounts
                  }
                : null,
            topActors: Object.values(actorCounts).sort((a, b) => b.count - a.count).slice(0, 3),
            topDirectors: Object.values(directorCounts).sort((a, b) => b.count - a.count).slice(0, 3),
            leastKnownGem: gem,
            followersCount: followers,
            followingCount: following
          },
          CACHE_TTL.USER_STATS
        );
      } catch (err: any) {
        console.error('useProfileData error:', err);
        if (!cancelled) setError(err?.message || 'Failed to load profile data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const runEssence = async () => {
      try {
        setEssenceLoading(true);
        const { data: profileData } = await supabase
          .from('profiles')
          .select('subcategoria_id, personalidade_completa, arquetipo_primario, arquetipo_secundario, pontos_e, pontos_i, pontos_c, pontos_s, pontos_r')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;

        if (!profileData?.personalidade_completa) {
          setEssencePersonality(profileData ?? null);
          return;
        }
        setEssencePersonality(profileData);
        setSpectrumPoints({
          e: Number(profileData.pontos_e) || 0,
          i: Number(profileData.pontos_i) || 0,
          c: Number(profileData.pontos_c) || 0,
          s: Number(profileData.pontos_s) || 0,
          r: Number(profileData.pontos_r) || 0
        });

        const { data: archetypeData } = await supabase
          .rpc('get_user_complete_personality', {
            p_user_id: userId,
            p_language: language.startsWith('pt') ? 'pt' : 'en'
          })
          .maybeSingle();

        if (!cancelled) setEssenceArchetype(archetypeData ?? null);
      } catch (err) {
        console.error('useProfileData essence error:', err);
      } finally {
        if (!cancelled) setEssenceLoading(false);
      }
    };

    run();
    runEssence();

    return () => {
      cancelled = true;
    };
  }, [userId, language, reloadFlag]);

  return {
    loading,
    error,
    movies,
    ratedMoviesCount,
    ratingDistribution,
    totalWatchTime,
    favoriteGenres,
    favoriteDecade,
    topActors,
    topDirectors,
    leastKnownGem,
    followersCount,
    followingCount,
    essencePersonality,
    essenceArchetype,
    spectrumPoints,
    essenceLoading,
    refetch
  };
}