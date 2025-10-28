import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Film, Users, Calendar, Star, BarChart3, Loader2, Clock, Crown, ArchiveIcon, Award, TrendingDown, ListPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie, getMovieDetails } from '../lib/tmdb';
import RatingBox from '../components/RatingBox';
import FollowersModal from '../components/FollowersModal';
import { toast } from 'sonner';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import UserListsModal from '../components/UserListsModal';
import { useTranslation } from 'react-i18next';

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
  label: string; // "Grandpa Cinema", "Nostalgic", or "Modern Lover"
  percentage: number;
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
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [movies, setMovies] = useState<MovieWithRating[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution>({});
  const [showFollowModal, setShowFollowModal] = useState<'followers' | 'following' | null>(null);
  const [showUserListsModal, setShowUserListsModal] = useState(false);
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

  const fetchProfileAndMovies = async () => {
    if (!username) return;

    try {
      setLoading(true);

      // Fetch basic profile data first
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

      // Now get followers count
      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileData.id);

      if (followersError) throw followersError;

      // Get following count
      const { count: followingCount, error: followingError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileData.id);

      if (followingError) throw followingError;

      setProfile(profileData);
      setFollowersCount(followersCount || 0);
      setFollowingCount(followingCount || 0);

      // Check follow status if logged in
      if (session?.user?.id) {
        const { data: followData } = await supabase
          .from('follows')
          .select('*')
          .eq('follower_id', session.user.id)
          .eq('following_id', profileData.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      // Fetch user's movies with ratings
      const { data: userMovies, error: moviesError } = await supabase
        .from('user_movies')
        .select('*')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false });

      if (moviesError) throw moviesError;

      // Calculate rated movies count and distribution
      const ratedMovies = (userMovies || []).filter(movie => movie.rating !== null);
      setRatedMoviesCount(ratedMovies.length);

      // Initialize rating distribution
      const distribution: RatingDistribution = {};
      for (let i = 0; i <= 10; i++) {
        distribution[i] = 0;
      }

      // Count ratings
      ratedMovies.forEach(movie => {
        if (movie.rating !== null) {
          distribution[movie.rating]++;
        }
      });
      setRatingDistribution(distribution);

      // Fetch complete movie details for each movie
      const movieDetails = await Promise.all(
        userMovies.map(async (userMovie) => {
          try {
            const details = await getMovieDetails(userMovie.movie_id);
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

      const validMovies = movieDetails.filter(movie => movie !== null);
      setMovies(validMovies);

      // Calculate stats for rated movies only
      const ratedValidMovies = validMovies.filter(movie => movie.userRating !== null);

      // Calculate total watch time (rated movies only)
      const totalWatchTime = ratedValidMovies.reduce((sum, movie) => sum + (movie.runtime || 0), 0);
      setTotalWatchTime(totalWatchTime);

      // Calculate genre counts (rated movies only)
      const genreCounts = {};
      ratedValidMovies.forEach(movie => {
        movie.genres?.forEach(genre => {
          genreCounts[genre.id] = genreCounts[genre.id] || { id: genre.id, name: genre.name, count: 0 };
          genreCounts[genre.id].count++;
        });
      });

      const favoriteGenres = Object.values(genreCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setFavoriteGenres(favoriteGenres);

      // Calculate favorite decade
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
        // Find decade with most movies
        let topDecade = '';
        let topCount = 0;
        
        for (const [decade, count] of Object.entries(decadeCounts)) {
          if (count > topCount) {
            topDecade = decade;
            topCount = count;
          }
        }
        
        // Calculate percentage
        const percentage = (topCount / totalRatedMovies) * 100;
        
        // Determine label based on decade
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
          percentage: percentage
        });
      }

      // Calculate top actors
      const actorCounts = {};
      ratedValidMovies.forEach(movie => {
        movie.credits?.cast?.slice(0, 5).forEach(actor => {
          actorCounts[actor.id] = actorCounts[actor.id] || { 
            id: actor.id, 
            name: actor.name,
            character: actor.character, 
            count: 0 
          };
          actorCounts[actor.id].count++;
        });
      });

      const mostFrequentActors = Object.values(actorCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);
      
      setTopActors(mostFrequentActors);

      // Calculate top directors
      const directorCounts = {};
      ratedValidMovies.forEach(movie => {
        const director = movie.credits?.crew?.find(person => person.job === 'Director');
        if (director) {
          directorCounts[director.name] = directorCounts[director.name] || { 
            id: director.id,
            name: director.name, 
            count: 0 
          };
          directorCounts[director.name].count++;
        }
      });

      const mostFrequentDirectors = Object.values(directorCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);
      
      setTopDirectors(mostFrequentDirectors);

      // Find least-known gem (movie with lowest vote_count that the user has rated)
      const ratedMoviesWithVoteCounts = ratedValidMovies
        .filter(movie => movie.userRating !== null && movie.vote_count !== undefined)
        .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

      if (ratedMoviesWithVoteCounts.length > 0) {
        const leastRated = ratedMoviesWithVoteCounts[0];
        setLeastKnownGem({
          id: leastRated.id,
          title: leastRated.title,
          vote_count: leastRated.vote_count || 0,
          release_date: leastRated.release_date,
          vote_average: leastRated.vote_average,
          userRating: leastRated.userRating
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

  const getMaxRatingCount = () => {
    return Math.max(...Object.values(ratingDistribution), 1);
  };

  const getTagColorClasses = (category: string) => {
    switch (category) {
      case 'basic':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'theme':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      case 'community':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
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
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden ${getBannerClass(profile?.banner, profile.plan_type === 'premium')}`}>
          <div className="p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6">
              <div className="relative mx-auto sm:mx-0 mb-4 sm:mb-0">
                <div className={`w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile?.avatar_frame, profile.plan_type === 'premium')}`}>
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-full h-full p-4 text-gray-400" />
                  )}
                </div>
              </div>
              
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2">
                    <div className="flex items-center">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        @{profile.username}
                      </h1>
                      {profile.plan_type === 'premium' && (
                        <Crown className="inline-block align-middle ml-2 w-5 h-5 text-yellow-400" title="Premium member" />
                      )}
                    </div>
                    {profile.active_tag && (
                      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                        getTagColorClasses(profile.active_tag.category)
                      }`}>
                        <span>{profile.active_tag.emoji}</span>
                        <span className="text-sm font-medium">
                          {profile.active_tag.name}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                {profile.bio && (
                  <p className="mt-4 text-gray-600 dark:text-gray-300">
                    {profile.bio}
                  </p>
                )}

                <div className="flex flex-wrap justify-center sm:justify-start gap-4 sm:gap-6 text-sm text-gray-600 dark:text-gray-400 mt-4">
                  <button
                    onClick={() => setShowFollowModal('followers')}
                    className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    <span>
                      <strong className="text-gray-900 dark:text-white">
                        {followersCount}
                      </strong>{' '}
                      {followersCount === 1 ? 'follower' : 'followers'}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowFollowModal('following')}
                    className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    <span>
                      <strong className="text-gray-900 dark:text-white">
                        {followingCount}
                      </strong>{' '}
                      {t('profile.following', { count: followingCount })}
                    </span>
                  </button>
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    <span>
                      {t('profile.joined', { date: formatDate(profile.created_at) })}
                    </span>
                  </div>
                </div>

                {session?.user?.id !== profile.id && (
                  <div className="flex justify-center sm:justify-end mt-6 gap-3">
                    <button
                      onClick={() => setShowUserListsModal(true)}
                      className="px-6 py-2 rounded-lg font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center"
                    >
                      <ListPlus className="w-5 h-5 mr-2" />
                      {t('lists.userLists')}
                    </button>
                    <button
                      onClick={handleFollowToggle}
                      disabled={isToggling}
                      className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                        isFollowing
                          ? 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                          : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                      ) : isFollowing ? (
                        t('profile.following')
                      ) : (
                        t('profile.follow')
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.ratedMovies')}
              </h2>
              <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {ratedMoviesCount}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.favoriteGenres')}
              </h2>
              <Film className="w-6 h-6 text-purple-500" />
            </div>
            <div className="space-y-2">
              {favoriteGenres.map((genre, index) => (
                <div
                  key={genre.id}
                  className={`text-${index === 0 ? 'xl' : 'base'} ${
                    index === 0 ? 'font-bold' : 'font-medium'
                  } text-gray-900 dark:text-white text-center`}
                >
                  {genre.name}
                </div>
              ))}
              {favoriteGenres.length === 0 && (
                <div className="text-gray-500 dark:text-gray-400 text-center">
                  {t('profile.stats.noGenresYet')}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.timeWatching')}
              </h2>
              <Clock className="w-6 h-6 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatWatchTime(totalWatchTime)}
            </div>
          </div>
        </div>

        {/* Toggle de Estatísticas */}
        {ratedMoviesCount > 0 && (
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg p-4 shadow-md transition-all duration-300 flex items-center justify-center gap-2 font-medium"
          >
            <BarChart3 className="w-5 h-5" />
            {showStats ? t('profile.hideStats') : t('profile.showStats')}
            <svg
              className={`w-5 h-5 transition-transform duration-300 ${showStats ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {showStats && ratedMoviesCount > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.ratingDistribution')}
              </h2>
              <BarChart3 className="w-6 h-6 text-blue-500" />
            </div>
            <div className="space-y-2">
              {[...Array(11)].map((_, i) => {
                const rating = 10 - i;
                return (
                  <div key={rating} className="flex items-center gap-2">
                    <div className="w-12 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                      {rating}<Star className="w-3 h-3 ml-0.5 inline fill-current" />
                    </div>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 dark:bg-blue-600 rounded-full transition-all duration-300"
                        style={{
                          width: `${(ratingDistribution[rating] / getMaxRatingCount()) * 100}%`
                        }}
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
        )}

        {showStats && favoriteDecade && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.favoriteDecade')}
              </h2>
              <ArchiveIcon className="w-6 h-6 text-amber-500" />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900 dark:text-white">
                  {favoriteDecade.decade}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {favoriteDecade.count} {t('community.films')}
                </div>
              </div>
              
              <div className="sm:col-span-2">
                <div className="flex flex-col space-y-2">
                  <div className={`text-lg font-medium ${
                    favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                    favoriteDecade.label === 'Nostalgic' ? 'text-indigo-600 dark:text-indigo-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {favoriteDecade.label === 'Grandpa Cinema' && '🎬 '}
                    {favoriteDecade.label === 'Nostalgic' && '📼 '}
                    {favoriteDecade.label === 'Modern Lover' && '📱 '}
                    {favoriteDecade.label === 'Grandpa Cinema' ? 'Grandpa Cinema' :
                     favoriteDecade.label === 'Nostalgic' ? 'Nostalgic' :
                     'Modern Lover'}
                  </div>
                  
                  <div className="relative">
                    <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          favoriteDecade.label === 'Grandpa Cinema' ? 'bg-amber-500 dark:bg-amber-600' :
                          favoriteDecade.label === 'Nostalgic' ? 'bg-indigo-500 dark:bg-indigo-600' :
                          'bg-emerald-500 dark:bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(100, favoriteDecade.percentage)}%` }}
                      />
                    </div>
                    
                    {/* Labels beneath progress bar */}
                    <div className="flex text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <div 
                        className={`text-${
                          favoriteDecade.label === 'Grandpa Cinema' ? 'amber-600 dark:text-amber-400' :
                          favoriteDecade.label === 'Nostalgic' ? 'indigo-600 dark:text-indigo-400' :
                          'emerald-600 dark:text-emerald-400'
                        }`}
                        style={{ width: `${Math.min(100, favoriteDecade.percentage)}%` }}
                      >
                        {favoriteDecade.decade}
                      </div>
                      {favoriteDecade.percentage < 100 && (
                        <div
                          style={{ width: `${Math.max(0, 100 - favoriteDecade.percentage)}%` }}
                        >
                          {t('profile.stats.otherDecades')}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {favoriteDecade.label === 'Grandpa Cinema' ? t('profile.stats.classicFilm') : 
                     favoriteDecade.label === 'Nostalgic' ? t('profile.stats.nostalgic') : 
                     t('profile.stats.modern')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Row for Frequent Actors, Directors, and Least-Known Gem */}
        {showStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Most Frequent Actors */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.favoriteActors')}
              </h2>
              <Award className="w-6 h-6 text-pink-500" />
            </div>
            {topActors.length > 0 ? (
              <div className="space-y-2">
                {topActors.map((actor, index) => (
                  <div key={actor.id} className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {index + 1}. {actor.name}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {actor.count} {actor.count === 1 ? t('community.film') : t('community.films')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                {t('common.no_data')}
              </div>
            )}
          </div>

          {/* Most Frequent Directors */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.favoriteDirectors')}
              </h2>
              <Film className="w-6 h-6 text-indigo-500" />
            </div>
            {topDirectors.length > 0 ? (
              <div className="space-y-2">
                {topDirectors.map((director, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {index + 1}. {director.name}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {director.count} {director.count === 1 ? t('community.film') : t('community.films')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                {t('common.no_data')}
              </div>
            )}
          </div>

          {/* Least-Known Gem */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.stats.leastKnownGem')}
              </h2>
              <TrendingDown className="w-6 h-6 text-emerald-500" />
            </div>
            {leastKnownGem ? (
              <div className="flex flex-col">
                <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                  {leastKnownGem.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  {new Date(leastKnownGem.release_date).getFullYear()}
                </p>
                <div className="flex items-center gap-4 mt-1">
                  <div className="flex items-center text-yellow-500">
                    <Star className="w-4 h-4 fill-current mr-1" />
                    <span className="text-sm">{leastKnownGem.vote_average.toFixed(1)}</span>
                  </div>
                  {leastKnownGem.userRating && (
                    <div className="flex items-center">
                      <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">{t('movies.friendRating')}:</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{leastKnownGem.userRating}/10</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {t('profile.stats.onlyVotes', { count: leastKnownGem.vote_count })} {t('profile.stats.votesOnTmdb')}
                </p>
              </div>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                {t('profile.stats.noHiddenGems')}
              </div>
            )}
          </div>
        </div>
        )}

        <div className="mt-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            {t('profile.movieCollection')}
          </h2>
          
          {movies.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
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
                      onAddToLibrary={fetchProfileAndMovies}
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
                  onAddToLibrary={fetchProfileAndMovies}
                />
              )}
            </>
          )}
        </div>

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
      </div>
    </div>
  );
}