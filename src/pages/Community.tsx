import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Users, Loader2, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/free-mode';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { useAuth } from '../lib/auth';
import { getMovieDetails, Movie, getTrending } from '../lib/tmdb';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  plan_type: string;
  avatar_frame: string;
  banner: string;
  active_tag?: {
    emoji: string;
    name: string;
    category: string;
  };
}

interface FriendWatchlistMovie {
  movie_id: number;
  title: string;
  friend_username: string;
  friend_id: string;
  movieDetails?: Movie;
}

export default function Community() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [friendsWatchlist, setFriendsWatchlist] = useState<FriendWatchlistMovie[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const USERS_PER_PAGE = 12;

  // Animation variants for staggered animations
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [currentPage]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchFriendsWatchlist();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (debouncedQuery) {
      searchProfiles();
    } else {
      setFilteredProfiles(profiles);
    }
  }, [debouncedQuery, profiles]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);

      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      // Calculate offset for pagination
      const offset = (currentPage - 1) * USERS_PER_PAGE;

      // First, get total count for pagination (including current user)
      const { count: totalCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (totalCount) {
        setTotalPages(Math.ceil(totalCount / USERS_PER_PAGE));
      }

      // Try to use intelligent suggestions function, fallback to direct query
      const { data: suggestedUsers, error: suggestionsError } = await supabase
        .rpc('get_suggested_users', {
          p_user_id: session.user.id,
          p_limit: USERS_PER_PAGE + 1 // +1 to include current user
        });

      if (suggestionsError) {
        console.error('Error with suggestions, falling back to direct query:', suggestionsError);

        // Fallback: get profiles directly with pagination
        const { data: allProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select(`
            id,
            username,
            avatar_url,
            bio,
            plan_type,
            avatar_frame,
            banner,
            active_tag
          `)
          .order('created_at', { ascending: false })
          .range(offset, offset + USERS_PER_PAGE - 1);

        if (profilesError) throw profilesError;

        // Add followers/following counts
        const profilesWithCounts = await Promise.all(
          (allProfiles || []).map(async (profile) => {
            const { count: followersCount } = await supabase
              .from('follows')
              .select('*', { count: 'exact', head: true })
              .eq('following_id', profile.id);

            const { count: followingCount } = await supabase
              .from('follows')
              .select('*', { count: 'exact', head: true })
              .eq('follower_id', profile.id);

            return {
              ...profile,
              followers_count: followersCount || 0,
              following_count: followingCount || 0
            };
          })
        );

        setProfiles(profilesWithCounts);
        setFilteredProfiles(profilesWithCounts);
      } else {
        setProfiles(suggestedUsers || []);
        setFilteredProfiles(suggestedUsers || []);
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const searchProfiles = async () => {
    setSearching(true);
    const filtered = profiles.filter(profile =>
      profile.username.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      profile.bio?.toLowerCase().includes(debouncedQuery.toLowerCase())
    );
    setFilteredProfiles(filtered);
    setSearching(false);
  };

  const fetchFriendsWatchlist = async () => {
    if (!session?.user?.id) return;

    try {
      setLoadingWatchlist(true);
      const { data, error } = await supabase
        .rpc('get_friends_watchlist_movies', { user_id_param: session.user.id });

      if (error) throw error;

      if (data && data.length > 0) {
        const moviesWithDetails = await Promise.all(
          data.map(async (movie: FriendWatchlistMovie) => {
            try {
              const details = await getMovieDetails(movie.movie_id);
              return { ...movie, movieDetails: details };
            } catch {
              return movie;
            }
          })
        );
        setFriendsWatchlist(moviesWithDetails);
      } else {
        const trendingMovies = await getTrending();
        const fallbackMovies = trendingMovies.slice(0, 10).map(movie => ({
          movie_id: movie.id,
          title: movie.title,
          friend_username: '',
          friend_id: '',
          movieDetails: movie
        }));
        setFriendsWatchlist(fallbackMovies);
      }
    } catch (error) {
      console.error('Error fetching friends watchlist:', error);
      try {
        const trendingMovies = await getTrending();
        const fallbackMovies = trendingMovies.slice(0, 10).map(movie => ({
          movie_id: movie.id,
          title: movie.title,
          friend_username: '',
          friend_id: '',
          movieDetails: movie
        }));
        setFriendsWatchlist(fallbackMovies);
      } catch {
        setFriendsWatchlist([]);
      }
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const navigateToProfile = (username: string) => {
    navigate(`/profile/${username}`);
  };

  if (loading) {
    return (
      <motion.div 
        className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="p-8 rounded-xl bg-white dark:bg-gray-800/80 shadow-xl border border-gray-100 dark:border-gray-700/30 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium text-center">
            {t('common.loading')}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5 py-8 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container mx-auto max-w-7xl">
        <motion.div 
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
          variants={itemVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: [0, -10, 0], scale: 1.05 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Users className="w-8 h-8 text-blue-500" />
            </motion.div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
              {t('community.title')}
            </h1>
          </div>
          <div className="w-full md:w-96">
            <div className="relative">
              <input
                type="text"
                placeholder={t('community.searchMembers')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md hover:shadow-lg transition-shadow"
                aria-label={t('community.searchMembers')}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-blue-500" />
              )}
            </div>
          </div>
        </motion.div>

        {/* Friends Watchlist Carousel - Only on page 1 */}
        {currentPage === 1 && (
          <motion.div
            className="mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-6 h-6 text-purple-500" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('community.friendsPlanning')}
              </h2>
            </div>

          {loadingWatchlist ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
          ) : friendsWatchlist.length > 0 ? (

            <Swiper
              modules={[FreeMode]}
              spaceBetween={16}
              slidesPerView="auto"
              freeMode={true}
              className="!pb-4"
            >
              {friendsWatchlist.map((movie) => (
                <SwiperSlide key={`${movie.movie_id}-${movie.friend_id}`} className="!w-40">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    transition={{ duration: 0.2 }}
                    className="relative group cursor-pointer"
                    onClick={() => movie.movieDetails && setSelectedMovie(movie.movieDetails)}
                  >
                    {movie.movieDetails?.poster_path && (
                      <img
                        src={`https://image.tmdb.org/t/p/w342${movie.movieDetails.poster_path}`}
                        alt={movie.title}
                        className="w-full rounded-lg shadow-lg"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex flex-col justify-end p-3">
                      <p className="text-white text-xs font-medium truncate">{movie.title}</p>
                      <p className="text-gray-300 text-xs truncate">@{movie.friend_username}</p>
                    </div>
                    {movie.movieDetails?.vote_average && movie.movieDetails.vote_average > 0 && (
                      <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2 py-1 rounded-md text-xs font-bold shadow-lg">
                        ★ {movie.movieDetails.vote_average.toFixed(1)}
                      </div>
                    )}
                  </motion.div>
                </SwiperSlide>
              ))}
            </Swiper>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {t('common.noMoviesFound')}
            </div>
          )}
          </motion.div>
        )}

        {filteredProfiles.length === 0 ? (
          <motion.div 
            className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <Users className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            </motion.div>
            <motion.h2 
              className="text-2xl font-semibold text-gray-900 dark:text-white mb-2"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              {t('community.noMembers')}
            </motion.h2>
            <motion.p 
              className="text-gray-600 dark:text-gray-400 max-w-md mx-auto"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              {searchQuery
                ? t('community.noMembersMatch')
                : t('community.beFirst')}
            </motion.p>
          </motion.div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredProfiles.map((profile) => (
              <motion.div
                key={profile.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl cursor-pointer ${getBannerClass(profile.banner, profile.plan_type === 'premium')}`}
                onClick={() => navigateToProfile(profile.username)}
                role="button"
                tabIndex={0}
                aria-label={`View ${profile.username}'s profile`}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                style={{ transition: 'all 0.15s ease-out' }}
              >
                <div className="relative h-full flex flex-col">
                  {/* Avatar e informações principais */}
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="relative flex-shrink-0">
                        <div className={`w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile.avatar_frame, profile.plan_type === 'premium')}`}>
                          {profile.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={profile.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-full h-full p-3 text-gray-400" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                            @{profile.username}
                          </h2>
                          {profile.plan_type === 'premium' && (
                            <motion.div
                              whileHover={{ rotate: 360 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                              className="flex-shrink-0"
                            >
                              <Crown className="w-5 h-5 text-yellow-400" title={t('premium.title')} />
                            </motion.div>
                          )}
                        </div>

                        {profile.active_tag && (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            profile.active_tag.category === 'theme'
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                              : profile.active_tag.category === 'basic'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            <span>{profile.active_tag.emoji}</span>
                            <span className="truncate max-w-[120px]">{profile.active_tag.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bio */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4 flex-1">
                      {profile.bio || t('profile.bio')}
                    </p>

                    {/* Stats na parte inferior */}
                    <div className="flex items-center gap-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          <span className="font-bold text-gray-900 dark:text-white">{profile.followers_count}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1">{profile.followers_count === 1 ? 'follower' : 'followers'}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          <span className="font-bold text-gray-900 dark:text-white">{profile.following_count}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1">following</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Pagination Controls */}
        {!searchQuery && filteredProfiles.length > 0 && totalPages > 1 && (
          <motion.div
            className="flex items-center justify-center gap-2 mt-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ← {t('common.back', { defaultValue: 'Back' })}
            </button>

            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                        : 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.next', { defaultValue: 'Next' })} →
            </button>
          </motion.div>
        )}
      </div>

      {/* Background animated elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-blue-500/20 dark:bg-blue-600/20"
            initial={{ 
              x: `${Math.random() * 100}%`, 
              y: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5
            }}
            animate={{ 
              y: [
                `${Math.random() * 100}%`, 
                `${Math.random() * 100}%`,
                `${Math.random() * 100}%`
              ],
              opacity: [
                Math.random() * 0.5,
                Math.random() * 0.3,
                Math.random() * 0.5
              ]
            }}
            transition={{ 
              duration: 20 + Math.random() * 30,
              repeat: Infinity,
              repeatType: "mirror"
            }}
          />
        ))}
      </div>

      {/* Movie Details Modal */}
      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </motion.div>
  );
}