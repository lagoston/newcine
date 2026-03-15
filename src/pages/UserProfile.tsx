import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Film, Users, Calendar, Star, BarChart3, Loader2, Clock, Crown, Archive as ArchiveIcon, Award, TrendingDown, ListPlus, MessageSquare, UserCheck, UserPlus, ChevronDown, ArrowLeft } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import RatingBox from '../components/RatingBox';
import FollowersModal from '../components/FollowersModal';
import { toast } from 'sonner';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import UserListsModal from '../components/UserListsModal';
import UserReviewsModal from '../components/UserReviewsModal';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { motion, AnimatePresence } from 'framer-motion';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  plan_type: string;
  avatar_frame: string;
  banner?: string;
  active_tag?: {
    emoji: string;
    name: string;
    category: string;
  };
}

interface UserMovie {
  movie_id: number;
  rating: number | null;
}

interface RatingDistribution {
  [key: number]: number;
}

interface MovieWithRating extends Movie {
  userRating: number | null;
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
}

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

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [movies, setMovies] = useState<MovieWithRating[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution>({});
  const [showFollowModal, setShowFollowModal] = useState<'followers' | 'following' | null>(null);
  const [showUserListsModal, setShowUserListsModal] = useState(false);
  const [showUserReviewsModal, setShowUserReviewsModal] = useState(false);
  const [totalWatchTime, setTotalWatchTime] = useState(0);
  const [favoriteGenres, setFavoriteGenres] = useState<Genre[]>([]);
  const [favoriteDecade, setFavoriteDecade] = useState<FavoriteDecade | null>(null);
  const [topActors, setTopActors] = useState<ActorCount[]>([]);
  const [topDirectors, setTopDirectors] = useState<DirectorCount[]>([]);
  const [leastKnownGem, setLeastKnownGem] = useState<LeastKnownGem | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showStats, setShowStats] = useState(false);

  useEffect(() => {
    if (username) {
      fetchProfileAndMovies();
    }
  }, [username]);

  useEffect(() => {
    const handleLanguageChange = () => {
      if (profile?.id) {
        const cacheKey = CACHE_KEYS.USER_PROFILE(profile.id);
        cache.delete(cacheKey);
      }
      cache.invalidatePattern('movie:');
      if (username) {
        fetchProfileAndMovies();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n, username, profile?.id]);

  const fetchProfileAndMovies = async () => {
    if (!username) return;

    try {
      setLoading(true);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (profileError) throw profileError;

      if (!profileData) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileData.id);

      if (followersError) throw followersError;

      const { count: followingCount, error: followingError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileData.id);

      if (followingError) throw followingError;

      setProfile(profileData);
      setFollowersCount(followersCount || 0);
      setFollowingCount(followingCount || 0);

      if (session?.user?.id) {
        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', session.user.id)
          .eq('following_id', profileData.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      const { data: userMovies, error: moviesError } = await supabase
        .from('user_movies')
        .select('*')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false });

      if (moviesError) throw moviesError;

      const ratedMovies = (userMovies || []).filter(movie => movie.rating !== null);
      setRatedMoviesCount(ratedMovies.length);

      const distribution: RatingDistribution = {};
      for (let i = 0; i <= 10; i++) {
        distribution[i] = 0;
      }

      ratedMovies.forEach(movie => {
        if (movie.rating !== null) {
          distribution[movie.rating]++;
        }
      });
      setRatingDistribution(distribution);

      const INITIAL_BATCH = 20;
      const initialBatch = userMovies.slice(0, INITIAL_BATCH);
      const remainingMovies = userMovies.slice(INITIAL_BATCH);

      const firstBatchDetails = await Promise.all(
        initialBatch.map(async (userMovie) => {
          try {
            const details = await getMovieDetailsFromDB(userMovie.movie_id);
            return {
              ...details,
              userRating: userMovie.rating
            };
          } catch (error) {
            console.error(`Error fetching details for movie ${userMovie.movie_id}:`, error);
            return null;
          }
        })
      );

      const firstBatchMovies = firstBatchDetails.filter(movie => movie !== null);
      setMovies(firstBatchMovies);

      if (remainingMovies.length > 0) {
        const remainingDetails = await Promise.all(
          remainingMovies.map(async (userMovie) => {
            try {
              const details = await getMovieDetailsFromDB(userMovie.movie_id);
              return {
                ...details,
                userRating: userMovie.rating
              };
            } catch (error) {
              console.error(`Error fetching details for movie ${userMovie.movie_id}:`, error);
              return null;
            }
          })
        );

        const remainingBatchMovies = remainingDetails.filter(movie => movie !== null);
        const allMovies = [...firstBatchMovies, ...remainingBatchMovies];
        setMovies(allMovies);
        var validMovies = allMovies;
      } else {
        var validMovies = firstBatchMovies;
      }

      const ratedValidMovies = validMovies.filter(movie => movie.userRating !== null);

      let totalWatchTime = 0;

      for (const movie of ratedValidMovies) {
        if (movie.media_type === 'tv') {
          const { data: watchedEps } = await supabase
            .from('watched_episodes')
            .select('season_number, episode_number')
            .eq('user_id', profileData.id)
            .eq('tmdb_id', movie.id);

          if (watchedEps && watchedEps.length > 0 && movie.seasons) {
            watchedEps.forEach(ep => {
              const season = movie.seasons.find((s: any) => s.season_number === ep.season_number);
              const episode = season?.episodes.find((e: any) => e.episode_number === ep.episode_number);
              if (episode?.runtime) {
                totalWatchTime += episode.runtime;
              }
            });
          }
        } else {
          totalWatchTime += movie.runtime || 0;
        }
      }

      setTotalWatchTime(totalWatchTime);

      const genreCounts = {};
      ratedValidMovies.forEach(movie => {
        if (movie.genres && Array.isArray(movie.genres)) {
          movie.genres.forEach(genre => {
            if (typeof genre === 'object' && genre.id && genre.name) {
              genreCounts[genre.id] = genreCounts[genre.id] || { id: genre.id, name: genre.name, count: 0 };
              genreCounts[genre.id].count++;
            } else if (typeof genre === 'string') {
              const key = genre;
              genreCounts[key] = genreCounts[key] || { id: key, name: genre, count: 0 };
              genreCounts[key].count++;
            }
          });
        }
      });

      const favoriteGenres = Object.values(genreCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setFavoriteGenres(favoriteGenres);

      const decadeCounts: DecadeCount = {};
      let totalRatedMovies = 0;

      ratedValidMovies.forEach(movie => {
        if (movie.release_date) {
          const year = new Date(movie.release_date).getFullYear();
          const decade = Math.floor(year / 10) * 10;
          const decadeStr = `${decade}s`;
          decadeCounts[decadeStr] = (decadeCounts[decadeStr] || 0) + 1;
          totalRatedMovies++;
        }
      });

      if (totalRatedMovies > 0) {
        let topDecade = '';
        let topCount = 0;

        for (const [decade, count] of Object.entries(decadeCounts)) {
          if (count > topCount) {
            topDecade = decade;
            topCount = count;
          }
        }

        const percentage = (topCount / totalRatedMovies) * 100;

        let label = '';
        const decadeNum = parseInt(topDecade);

        if (decadeNum < 1980) {
          label = 'Grandpa Cinema';
        } else if (decadeNum < 2010) {
          label = 'Nostalgic';
        } else {
          label = 'Modern Lover';
        }

        setFavoriteDecade({
          decade: topDecade,
          count: topCount,
          label,
          percentage: percentage,
          allDecades: decadeCounts
        });
      }

      const actorCounts = {};

      ratedValidMovies.forEach((movie, idx) => {
        if (movie.credits?.cast && Array.isArray(movie.credits.cast)) {
          movie.credits.cast.slice(0, 5).forEach(actor => {
            if (actor && actor.id && actor.name) {
              actorCounts[actor.id] = actorCounts[actor.id] || {
                id: actor.id,
                name: actor.name,
                character: actor.character,
                count: 0
              };
              actorCounts[actor.id].count++;
            }
          });
        }
      });

      const mostFrequentActors = Object.values(actorCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setTopActors(mostFrequentActors);

      const directorCounts = {};

      ratedValidMovies.forEach((movie, idx) => {
        if (movie.credits?.crew && Array.isArray(movie.credits.crew)) {
          const director = movie.credits.crew.find(person =>
            person.job === 'Director' || person.job === 'Creator' || person.job === 'Executive Producer'
          );
          if (director && director.name) {
            directorCounts[director.name] = directorCounts[director.name] || {
              id: director.id || 0,
              name: director.name,
              count: 0
            };
            directorCounts[director.name].count++;
          }
        }
      });

      const mostFrequentDirectors = Object.values(directorCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setTopDirectors(mostFrequentDirectors);

      const ratedMoviesWithVoteCounts = ratedValidMovies
        .filter(movie => movie.userRating !== null && movie.vote_count !== undefined && movie.vote_count !== null)
        .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

      if (ratedMoviesWithVoteCounts.length > 0) {
        const leastKnown = ratedMoviesWithVoteCounts[0];
        setLeastKnownGem({
          id: leastKnown.id,
          title: leastKnown.title,
          vote_count: leastKnown.vote_count || 0,
          release_date: leastKnown.release_date,
          vote_average: leastKnown.vote_average,
          userRating: leastKnown.userRating
        });
      }

    } catch (error) {
      console.error('Error fetching profile and movies:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!session) {
      toast.error('Please sign in to follow users');
      return;
    }

    if (!profile?.id || isToggling) {
      return;
    }

    try {
      setIsToggling(true);

      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', session.user.id)
          .eq('following_id', profile.id);

        if (error) throw error;
        setIsFollowing(false);
        setFollowersCount(prev => prev - 1);
        toast.success(`Unfollowed @${profile.username}`);
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: session.user.id,
            following_id: profile.id
          });

        if (error) throw error;
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
        toast.success(`Following @${profile.username}`);

        const { data: canSend } = await supabase
          .rpc('can_send_follower_notification', {
            p_from_user_id: session.user.id,
            p_to_user_id: profile.id
          });

        if (canSend) {
          await supabase
            .from('friend_indications')
            .insert({
              from_user_id: session.user.id,
              to_user_id: profile.id,
              type: 'follower',
              read: false
            });

          await supabase
            .from('follower_notifications_log')
            .insert({
              from_user_id: session.user.id,
              to_user_id: profile.id
            });
        }
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast.error('Failed to update follow status');
    } finally {
      setIsToggling(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatWatchTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes % 60}m`;
  };

  const getMaxRatingCount = useMemo(() => {
    return Math.max(...Object.values(ratingDistribution), 1);
  }, [ratingDistribution]);

  const getTagColorClasses = useCallback((category: string) => {
    switch (category) {
      case 'basic':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'theme':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
      case 'community':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      case 'oracle':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
    }
  }, []);

  if (loading) {
    return <GlassLoader fullPage size="lg" />;
  }

  if (!profile) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {t('profile.notFound')}
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {t('profile.userDoesntExist', { username })}
          </p>
        </div>
      </div>
    );
  }

  const moviesByRating = movies.reduce(
    (acc, movie: any) => {
      const rating = movie.userRating;
      if (rating === null) {
        acc.unrated.push(movie);
      } else {
        acc[rating] = acc[rating] || [];
        acc[rating].push(movie);
      }
      return acc;
    },
    { unrated: [], ...Array.from({ length: 11 }, () => []) }
  );

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        <motion.button
          onClick={() => navigate(-1)}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/60 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium backdrop-blur-sm transition-all duration-200 shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </motion.button>

        <motion.div
          className={`relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden ${getBannerClass(profile?.banner, profile.plan_type === 'premium')}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              <div className="relative mx-auto sm:mx-0 flex-shrink-0">
                <div className={`w-28 h-28 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile?.avatar_frame, profile.plan_type === 'premium')}`}>
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-full h-full p-5 text-gray-400" />
                  )}
                </div>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                      @{profile.username}
                    </h1>
                    {profile.plan_type === 'premium' && (
                      <Crown className="w-6 h-6 text-yellow-400" title="Premium member" />
                    )}
                  </div>
                  {profile.active_tag && (
                    <div className="flex justify-center sm:justify-start w-full sm:w-auto">
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${getTagColorClasses(profile.active_tag.category)}`}>
                        <span>{profile.active_tag.emoji}</span>
                        <span className="text-sm font-medium">{profile.active_tag.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                {profile.bio && (
                  <p className="text-gray-600 dark:text-gray-300 mb-4 max-w-2xl">
                    {profile.bio}
                  </p>
                )}

                <div className="flex flex-wrap justify-center sm:justify-start gap-4 sm:gap-6 text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <button
                    onClick={() => setShowFollowModal('followers')}
                    className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    <span>
                      <strong className="text-gray-900 dark:text-white">{followersCount}</strong>{' '}
                      {followersCount === 1 ? 'follower' : 'followers'}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowFollowModal('following')}
                    className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    <span>
                      <strong className="text-gray-900 dark:text-white">{followingCount}</strong>{' '}
                      {t('profile.following', { count: followingCount })}
                    </span>
                  </button>
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    <span>{t('profile.joined', { date: formatDate(profile.created_at) })}</span>
                  </div>
                </div>

                {session?.user?.id !== profile.id && (
                  <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                    <motion.button
                      onClick={() => setShowUserListsModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-200 font-medium hover:bg-white/70 dark:hover:bg-gray-600/70 transition-all flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <ListPlus className="w-5 h-5" />
                      <span className="hidden sm:inline">{t('lists.userLists')}</span>
                    </motion.button>
                    <motion.button
                      onClick={() => setShowUserReviewsModal(true)}
                      className="px-4 py-2.5 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-200 font-medium hover:bg-white/70 dark:hover:bg-gray-600/70 transition-all flex items-center gap-2"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span className="hidden sm:inline">Reviews</span>
                    </motion.button>
                    <motion.button
                      onClick={handleFollowToggle}
                      disabled={isToggling}
                      className={`px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                        isFollowing
                          ? 'bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-white/70 dark:hover:bg-gray-600/70'
                          : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg hover:shadow-blue-500/25'
                      }`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {isToggling ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : isFollowing ? (
                        <>
                          <UserCheck className="w-5 h-5" />
                          <span className="hidden sm:inline">{t('profile.following')}</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-5 h-5" />
                          <span className="hidden sm:inline">{t('profile.follow')}</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {t('profile.stats.ratedMovies')}
              </h2>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {ratedMoviesCount}
            </div>
          </div>

          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {t('profile.stats.favoriteGenres')}
              </h2>
              <Film className="w-5 h-5 text-purple-500" />
            </div>
            <div className="space-y-1">
              {favoriteGenres.map((genre, index) => (
                <div
                  key={genre.id}
                  className={`text-${index === 0 ? 'lg' : 'sm'} ${index === 0 ? 'font-bold' : 'font-medium'} text-gray-900 dark:text-white`}
                >
                  {genre.name}
                </div>
              ))}
              {favoriteGenres.length === 0 && (
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                  {t('profile.stats.noGenresYet')}
                </div>
              )}
            </div>
          </div>

          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {t('profile.stats.timeWatching')}
              </h2>
              <Clock className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatWatchTime(totalWatchTime)}
            </div>
          </div>
        </motion.div>

        {ratedMoviesCount > 0 && (
          <motion.button
            onClick={() => setShowStats(!showStats)}
            className="w-full relative rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4 shadow-xl hover:shadow-2xl hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 font-semibold"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <BarChart3 className="w-5 h-5" />
            {showStats ? t('profile.hideStats') : t('profile.showStats')}
            <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${showStats ? 'rotate-180' : ''}`} />
          </motion.button>
        )}

        <AnimatePresence>
          {showStats && ratedMoviesCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('profile.stats.ratingDistribution')}
                  </h2>
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                </div>
                <div className="space-y-2">
                  {[...Array(11)].map((_, i) => {
                    const rating = 10 - i;
                    return (
                      <div key={rating} className="flex items-center gap-2">
                        <div className="w-10 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                          {rating}<Star className="w-3 h-3 ml-0.5 inline fill-current" />
                        </div>
                        <div className="flex-1 h-3 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${(ratingDistribution[rating] / getMaxRatingCount) * 100}%` }}
                            transition={{ duration: 0.5, delay: i * 0.05 }}
                          />
                        </div>
                        <div className="w-8 text-sm text-right text-gray-600 dark:text-gray-400">
                          {ratingDistribution[rating]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {favoriteDecade && (
                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('profile.stats.favoriteDecade')}
                    </h2>
                    <ArchiveIcon className="w-5 h-5 text-amber-500" />
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 dark:text-white">
                        {favoriteDecade.decade}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {favoriteDecade.count} {t('community.films')}
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className={`text-lg font-medium mb-2 ${
                        favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                        favoriteDecade.label === 'Nostalgic' ? 'text-indigo-600 dark:text-indigo-400' :
                        'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {favoriteDecade.label === 'Grandpa Cinema' && '🎬 '}
                        {favoriteDecade.label === 'Nostalgic' && '📼 '}
                        {favoriteDecade.label === 'Modern Lover' && '📱 '}
                        {favoriteDecade.label}
                      </div>

                      {(() => {
                        const allDecades = favoriteDecade.allDecades || {};
                        const sorted = Object.entries(allDecades)
                          .map(([k, v]) => ({ decade: k, count: v as number }))
                          .filter(d => d.count > 0)
                          .sort((a, b) => b.count - a.count);
                        const total = sorted.reduce((a, b) => a + b.count, 0) || 1;
                        const top3 = sorted.slice(0, 3);
                        const othersCount = sorted.slice(3).reduce((a, b) => a + b.count, 0);
                        const accentBg =
                          favoriteDecade.label === 'Grandpa Cinema' ? 'bg-amber-500' :
                          favoriteDecade.label === 'Nostalgic' ? 'bg-blue-500' : 'bg-emerald-500';
                        const accentText =
                          favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-500' :
                          favoriteDecade.label === 'Nostalgic' ? 'text-blue-500' : 'text-emerald-500';
                        const accentGlow =
                          favoriteDecade.label === 'Grandpa Cinema' ? 'rgba(245,158,11,0.5)' :
                          favoriteDecade.label === 'Nostalgic' ? 'rgba(59,130,246,0.5)' : 'rgba(16,185,129,0.5)';
                        const segs = [
                          ...top3.map((d, i) => ({ key: d.decade, count: d.count, rank: i })),
                          ...(othersCount > 0 ? [{ key: 'outros', count: othersCount, rank: 3 }] : [])
                        ];
                        return (
                          <div className="space-y-1.5">
                            <div className="flex gap-1 h-4 rounded-lg overflow-hidden">
                              {segs.map((seg, idx) => {
                                const pct = (seg.count / total) * 100;
                                const isFirst = seg.rank === 0;
                                return (
                                  <motion.div
                                    key={seg.key}
                                    title={`${seg.key}: ${seg.count} filmes`}
                                    className={`h-full rounded-sm ${isFirst ? accentBg : seg.rank === 3 ? 'bg-gray-200/60 dark:bg-gray-700/50' : 'bg-gray-300/70 dark:bg-gray-600/60'}`}
                                    initial={{ opacity: 0, scaleX: 0 }}
                                    animate={{ opacity: 1, scaleX: 1 }}
                                    transition={{ duration: 0.4, delay: 0.1 * idx }}
                                    style={{
                                      width: `${pct}%`,
                                      transformOrigin: 'left',
                                      boxShadow: isFirst ? `0 0 8px ${accentGlow}` : undefined,
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex gap-1">
                              {segs.map((seg) => {
                                const pct = (seg.count / total) * 100;
                                const isFirst = seg.rank === 0;
                                return (
                                  <div
                                    key={seg.key}
                                    className={`text-center text-[9px] font-semibold truncate ${isFirst ? accentText : 'text-gray-400 dark:text-gray-500'}`}
                                    style={{ width: `${pct}%` }}
                                  >
                                    {seg.key}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {t('profile.stats.favoriteActors')}
                    </h2>
                    <Award className="w-5 h-5 text-pink-500" />
                  </div>
                  {topActors.length > 0 ? (
                    <div className="space-y-2">
                      {topActors.map((actor, index) => (
                        <div key={actor.id} className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {index + 1}. {actor.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {actor.count} {actor.count === 1 ? t('community.film') : t('community.films')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">
                      {t('common.no_data')}
                    </div>
                  )}
                </div>

                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {t('profile.stats.favoriteDirectors')}
                    </h2>
                    <Film className="w-5 h-5 text-indigo-500" />
                  </div>
                  {topDirectors.length > 0 ? (
                    <div className="space-y-2">
                      {topDirectors.map((director, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {index + 1}. {director.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {director.count} {director.count === 1 ? t('community.film') : t('community.films')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">
                      {t('common.no_data')}
                    </div>
                  )}
                </div>

                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {t('profile.stats.leastKnownGem')}
                    </h2>
                    <TrendingDown className="w-5 h-5 text-emerald-500" />
                  </div>
                  {leastKnownGem ? (
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white mb-1 text-sm">
                        {leastKnownGem.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {new Date(leastKnownGem.release_date).getFullYear()}
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center text-yellow-500">
                          <Star className="w-4 h-4 fill-current mr-1" />
                          <span className="text-sm">{leastKnownGem.vote_average.toFixed(1)}</span>
                        </div>
                        {leastKnownGem.userRating && (
                          <div className="flex items-center text-xs">
                            <span className="text-gray-500 dark:text-gray-400 mr-1">{t('movies.friendRating')}:</span>
                            <span className="font-medium text-gray-900 dark:text-white">{leastKnownGem.userRating}/10</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">
                      {t('profile.stats.noHiddenGems')}
                    </div>
                  )}
                </div>
              </div>

              {(favoriteGenres.length > 0 || favoriteDecade || topDirectors.length > 0) && (() => {
                const avgRating = Object.entries(ratingDistribution).reduce((sum, [r, c]) => sum + Number(r) * c, 0) /
                  Math.max(Object.values(ratingDistribution).reduce((a, b) => a + b, 0), 1);
                const topGenre = favoriteGenres[0]?.name || '';
                const era = favoriteDecade?.label || '';
                const topDir = topDirectors[0]?.name || '';

                const archetypes: Array<{ cond: boolean; title: string; desc: string; color: string; accent: string; dot: string }> = [
                  {
                    cond: topGenre === 'Drama' && avgRating >= 7,
                    title: 'O Contemplativo',
                    desc: 'Busca profundidade emocional e narrativas que ficam na memória. Drama é o universo natural — histórias de gente real, sentimentos reais.',
                    color: 'from-blue-500/10 to-sky-500/5',
                    accent: 'text-blue-500',
                    dot: 'bg-blue-500'
                  },
                  {
                    cond: topGenre === 'Action' || topGenre === 'Ação',
                    title: 'O Adrenalina',
                    desc: 'Cinema é adrenalina pura. Aprecia ritmo, tensão e sequências que prendem a respiração do começo ao fim.',
                    color: 'from-red-500/10 to-orange-500/5',
                    accent: 'text-red-500',
                    dot: 'bg-red-500'
                  },
                  {
                    cond: topGenre === 'Horror' || topGenre === 'Terror',
                    title: 'O Corajoso',
                    desc: 'Não foge do desconforto — vai em busca dele. O horror é a tela onde o medo se transforma em fascinação.',
                    color: 'from-gray-700/20 to-gray-800/10',
                    accent: 'text-gray-400',
                    dot: 'bg-gray-500'
                  },
                  {
                    cond: topGenre === 'Comedy' || topGenre === 'Comédia',
                    title: 'O Levado',
                    desc: 'Cinema é também alegria. Valoriza o humor inteligente e a leveza que bons filmes podem oferecer.',
                    color: 'from-yellow-400/10 to-amber-400/5',
                    accent: 'text-amber-500',
                    dot: 'bg-amber-500'
                  },
                  {
                    cond: topGenre === 'Science Fiction' || topGenre === 'Ficção científica',
                    title: 'O Visionário',
                    desc: 'Pensa além do presente. Ficção científica é o playground de ideias — mundos impossíveis que revelam verdades sobre o nosso.',
                    color: 'from-cyan-500/10 to-teal-500/5',
                    accent: 'text-cyan-500',
                    dot: 'bg-cyan-500'
                  },
                  {
                    cond: era === 'Grandpa Cinema',
                    title: 'O Arqueólogo',
                    desc: 'Mergulha no passado do cinema com reverência. Clássicos são a especialidade — conhece o cinema antes de todos os outros.',
                    color: 'from-amber-500/10 to-yellow-500/5',
                    accent: 'text-amber-600',
                    dot: 'bg-amber-500'
                  },
                  {
                    cond: avgRating <= 5.5 && ratedMoviesCount >= 20,
                    title: 'O Crítico Rigoroso',
                    desc: 'Padrões elevados e não distribui notas altas facilmente. Cada 7 dado vale por três avaliações de outro espectador.',
                    color: 'from-rose-500/10 to-pink-500/5',
                    accent: 'text-rose-500',
                    dot: 'bg-rose-500'
                  },
                  {
                    cond: avgRating >= 7.5 && ratedMoviesCount >= 20,
                    title: 'O Apaixonado',
                    desc: 'Assiste filmes com o coração aberto. A generosidade nas notas reflete um amor genuíno pela sétima arte.',
                    color: 'from-pink-500/10 to-rose-500/5',
                    accent: 'text-pink-500',
                    dot: 'bg-pink-500'
                  },
                  {
                    cond: topGenre === 'Thriller',
                    title: 'O Tensionado',
                    desc: 'Vive pelo suspense. Cada reviravolta, cada pista — a mente está sempre um passo à frente tentando desvendar o próximo ato.',
                    color: 'from-slate-500/10 to-gray-500/5',
                    accent: 'text-slate-500',
                    dot: 'bg-slate-500'
                  },
                  {
                    cond: topGenre === 'Animation' || topGenre === 'Animação',
                    title: 'O Eterno Jovem',
                    desc: 'Sabe que histórias profundas não precisam de atores reais. Animação é arte, emoção e narrativa em sua forma mais pura.',
                    color: 'from-emerald-500/10 to-green-500/5',
                    accent: 'text-emerald-500',
                    dot: 'bg-emerald-500'
                  },
                ];

                const matched = archetypes.find(a => a.cond) || {
                  title: 'O Explorador',
                  desc: 'Não se prende a um único gênero ou era. Cinema é um universo a ser explorado sem barreiras — curioso, aberto e eclético.',
                  color: 'from-teal-500/10 to-emerald-500/5',
                  accent: 'text-teal-500',
                  dot: 'bg-teal-500'
                };

                const traits: Array<{ label: string; value: string }> = [];
                if (topGenre) traits.push({ label: 'Gênero dominante', value: topGenre });
                if (era) traits.push({ label: 'Era preferida', value: era });
                if (topDir) traits.push({ label: 'Diretor favorito', value: topDir });
                if (ratedMoviesCount > 0) traits.push({ label: 'Filmes avaliados', value: String(ratedMoviesCount) });
                traits.push({ label: 'Nota média', value: avgRating > 0 ? avgRating.toFixed(1) : '—' });

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className={`relative rounded-2xl bg-gradient-to-br ${matched.color} bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-6 overflow-hidden`}
                  >
                    <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5 blur-3xl bg-current pointer-events-none" />
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Essencia Cinematografica</p>
                        <h2 className={`text-2xl font-bold ${matched.accent}`}>{matched.title}</h2>
                      </div>
                      <div className={`w-10 h-10 rounded-xl ${matched.dot} opacity-20 flex items-center justify-center`}>
                        <Film className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-6">{matched.desc}</p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {traits.map((trait) => (
                        <div key={trait.label} className="bg-white/50 dark:bg-gray-700/40 rounded-xl px-3 py-2.5 text-center">
                          <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{trait.label}</div>
                          <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{trait.value}</div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="mt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {t('profile.movieCollection')}
          </h2>

          {movies.length === 0 ? (
            <div className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-12 text-center">
              <Film className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('profile.noMoviesYet')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t('profile.noMoviesYet')}
              </p>
            </div>
          ) : (
            <>
              {[...Array(11)].map((_, i) => {
                const rating = 10 - i;
                const ratedMovies = moviesByRating[rating] || [];
                if (ratedMovies.length > 0) {
                  return (
                    <RatingBox
                      key={rating}
                      title={`Rated ${rating}`}
                      movies={ratedMovies}
                      rating={rating}
                      isOtherUserProfile={true}
                    />
                  );
                }
                return null;
              })}

              {moviesByRating.unrated && moviesByRating.unrated.length > 0 && (
                <RatingBox
                  title={t('library.watchList')}
                  movies={moviesByRating.unrated}
                  rating={null}
                  isOtherUserProfile={true}
                />
              )}
            </>
          )}
        </motion.div>

        {showFollowModal && profile.id && (
          <FollowersModal
            isOpen={true}
            onClose={() => setShowFollowModal(null)}
            userId={profile.id}
            type={showFollowModal}
            onFollowChange={fetchProfileAndMovies}
          />
        )}

        {showUserListsModal && profile.id && (
          <UserListsModal
            isOpen={true}
            onClose={() => setShowUserListsModal(false)}
            userId={profile.id}
          />
        )}

        {showUserReviewsModal && profile.id && (
          <UserReviewsModal
            userId={profile.id}
            username={profile.username}
            onClose={() => setShowUserReviewsModal(false)}
          />
        )}
      </div>
    </motion.div>
  );
}
