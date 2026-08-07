import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';

interface Genre {
  id: number;
  name: string;
  count: number;
}

interface DecadeCount {
  [decade: string]: number;
}

interface FavoriteDecade {
  decade: string;
  count: number;
  label: string;
  percentage: number;
  allDecades?: DecadeCount;
}

interface ActorCount {
  id: number;
  name: string;
  count: number;
  character?: string;
}

interface DirectorCount {
  id?: number;
  name: string;
  count: number;
}

interface LeastKnownGem {
  id: number;
  title: string;
  vote_count: number;
  release_date: string;
  vote_average: number;
  userRating?: number;
}

interface SpectrumPoints {
  e: number;
  i: number;
  c: number;
  s: number;
  r: number;
}

interface EssencePersonality {
  subcategoria_id: string | null;
  personalidade_completa: string | null;
  arquetipo_primario: string | null;
  arquetipo_secundario: string | null;
  pontos_e?: number;
  pontos_i?: number;
  pontos_c?: number;
  pontos_s?: number;
  pontos_r?: number;
}

interface EssenceArchetype {
  archetype_name: string;
  subcategory_name: string;
  description: string;
  archetype_description: string;
  subcategory_description: string;
}

interface RatingDistribution {
  [key: number]: number;
}

interface ProfileDataResult {
  movies: Movie[];
  ratedMoviesCount: number;
  ratingDistribution: RatingDistribution;
  totalWatchTime: number;
  favoriteGenres: Genre[];
  favoriteDecade: FavoriteDecade | null;
  topActors: ActorCount[];
  topDirectors: DirectorCount[];
  leastKnownGem: LeastKnownGem | null;
  followersCount: number;
  followingCount: number;
  essencePersonality: EssencePersonality | null;
  essenceArchetype: EssenceArchetype | null;
  spectrumPoints: SpectrumPoints;
  essenceLoading: boolean;
  refetch: () => void;
}

const getDecadeLabel = (decade: string): string => {
  const year = parseInt(decade);
  if (year <= 1959) return 'Grandpa Cinema';
  if (year <= 1999) return 'Nostalgic';
  return 'Modern Lover';
};

export function useProfileData(userId: string | undefined, language: string): ProfileDataResult {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution>({});
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
  const [spectrumPoints, setSpectrumPoints] = useState<SpectrumPoints>({ e: 0, i: 0, c: 0, s: 0, r: 0 });
  const [essenceLoading, setEssenceLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refetch = useCallback(() => setRefreshKey(k => k + 1), []);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const statsCacheKey = CACHE_KEYS.USER_STATS(userId);
        const cachedStats = cache.get<Partial<ProfileDataResult>>(statsCacheKey);

        const [
          userMoviesRes,
          followersRes,
          followingRes,
          profileRes,
        ] = await Promise.all([
          supabase
            .from('user_movies')
            .select('movie_id, rating')
            .eq('user_id', userId),
          supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', userId),
          supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', userId),
          supabase
            .from('profiles')
            .select('subcategoria_id, personalidade_completa, arquetipo_primario, arquetipo_secundario, pontos_e, pontos_i, pontos_c, pontos_s, pontos_r')
            .eq('id', userId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const userMovies: Array<{ movie_id: number; rating: number | null }> = userMoviesRes.data || [];
        const rated = userMovies.filter(m => m.rating !== null);
        const dist: RatingDistribution = {};
        rated.forEach(m => {
          const r = m.rating!;
          dist[r] = (dist[r] || 0) + 1;
        });

        setRatedMoviesCount(rated.length);
        setRatingDistribution(dist);
        setFollowersCount(followersRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);

        const profileData = profileRes.data as EssencePersonality | null;
        setEssencePersonality(profileData);

        if (profileData) {
          setSpectrumPoints({
            e: Number(profileData.pontos_e) || 0,
            i: Number(profileData.pontos_i) || 0,
            c: Number(profileData.pontos_c) || 0,
            s: Number(profileData.pontos_s) || 0,
            r: Number(profileData.pontos_r) || 0,
          });
        }

        if (profileData?.personalidade_completa) {
          const { data: archetypeData } = await supabase
            .rpc('get_user_complete_personality', { p_user_id: userId, p_language: language.startsWith('pt') ? 'pt' : 'en' })
            .single();
          if (!cancelled && archetypeData) {
            setEssenceArchetype(archetypeData as EssenceArchetype);
          }
        }

        setEssenceLoading(false);

        const movieIds = userMovies.map(m => m.movie_id);
        if (movieIds.length === 0) {
          if (!cancelled) {
            setMovies([]);
            setTotalWatchTime(0);
            setFavoriteGenres([]);
            setFavoriteDecade(null);
            setTopActors([]);
            setTopDirectors([]);
            setLeastKnownGem(null);
          }
          return;
        }

        const movieDetailsPromises = movieIds.map(id => getMovieDetailsFromDB(id).catch(() => null));
        const movieDetailsResults = await Promise.all(movieDetailsPromises);
        if (cancelled) return;

        const validMovies: Movie[] = movieDetailsResults.filter((m): m is Movie => m !== null);
        const movieMap = new Map(validMovies.map(m => [m.id, m]));

        const fullMovies: Movie[] = userMovies.map(um => {
          const details = movieMap.get(um.movie_id);
          if (!details) return null;
          return { ...details, userRating: um.rating };
        }).filter((m): m is Movie => m !== null);

        setMovies(fullMovies);

        let watchTime = 0;
        const genreCounts = new Map<number, { name: string; count: number }>();
        const decadeCounts: DecadeCount = {};
        const actorCounts = new Map<number, ActorCount>();
        const directorCounts = new Map<string, DirectorCount>();

        fullMovies.forEach(m => {
          if (m.runtime) watchTime += m.runtime;

          if (m.genres) {
            m.genres.forEach(g => {
              const existing = genreCounts.get(g.id);
              if (existing) existing.count++;
              else genreCounts.set(g.id, { name: g.name, count: 1 });
            });
          }

          if (m.release_date) {
            const year = parseInt(m.release_date.substring(0, 4));
            const decade = `${Math.floor(year / 10) * 10}s`;
            decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
          }

          if (m.credits?.cast) {
            m.credits.cast.slice(0, 5).forEach(c => {
              const existing = actorCounts.get(c.id);
              if (existing) existing.count++;
              else actorCounts.set(c.id, { id: c.id, name: c.name, count: 1, character: c.character });
            });
          }

          if (m.credits?.crew) {
            m.credits.crew.forEach(c => {
              if (c.job === 'Director') {
                const key = c.name;
                const existing = directorCounts.get(key);
                if (existing) existing.count++;
                else directorCounts.set(key, { name: c.name, count: 1 });
              }
            });
          }
        });

        setTotalWatchTime(watchTime);

        const sortedGenres = Array.from(genreCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map(g => ({ id: 0, name: g.name, count: g.count }));
        setFavoriteGenres(sortedGenres);

        const sortedDecades = Object.entries(decadeCounts)
          .map(([decade, count]) => ({ decade, count }))
          .sort((a, b) => b.count - a.count);

        if (sortedDecades.length > 0) {
          const top = sortedDecades[0];
          const total = sortedDecades.reduce((a, b) => a + b.count, 0) || 1;
          setFavoriteDecade({
            decade: top.decade,
            count: top.count,
            label: getDecadeLabel(top.decade),
            percentage: Math.round((top.count / total) * 100),
            allDecades: decadeCounts,
          });
        } else {
          setFavoriteDecade(null);
        }

        const sortedActors = Array.from(actorCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setTopActors(sortedActors);

        const sortedDirectors = Array.from(directorCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setTopDirectors(sortedDirectors);

        const gems = fullMovies
          .filter(m => m.vote_count && m.vote_count < 1000 && m.vote_average >= 6)
          .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

        if (gems.length > 0) {
          const gem = gems[0];
          setLeastKnownGem({
            id: gem.id,
            title: gem.title,
            vote_count: gem.vote_count || 0,
            release_date: gem.release_date,
            vote_average: gem.vote_average,
            userRating: gem.userRating ?? undefined,
          });
        } else {
          setLeastKnownGem(null);
        }

      } catch (error) {
        console.error('Error in useProfileData:', error);
        if (!cancelled) setEssenceLoading(false);
      }
    };

    fetchData();

    return () => { cancelled = true; };
  }, [userId, language, refreshKey]);

  return {
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
    refetch,
  };
}
