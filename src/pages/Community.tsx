import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Users, Loader2, Crown, ArrowRight, Sparkles, Film } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { supabase } from '../lib/supabase';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { useAuth } from '../lib/auth';
import { getMovieDetails, getMovieDetailsFromDB, Movie, getTrending } from '../lib/tmdb';

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
  const { t, i18n } = useTranslation();
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

  const watchlistScrollRef = useRef<HTMLDivElement>(null);
  const watchlistDragging = useRef(false);
  const watchlistStartX = useRef(0);
  const watchlistScrollStart = useRef(0);
  const watchlistDragDist = useRef(0);

  const handleWatchlistMouseDown = (e: React.MouseEvent) => {
    if (!watchlistScrollRef.current) return;
    watchlistDragging.current = true;
    watchlistStartX.current = e.pageX - watchlistScrollRef.current.offsetLeft;
    watchlistScrollStart.current = watchlistScrollRef.current.scrollLeft;
    watchlistDragDist.current = 0;
    watchlistScrollRef.current.style.cursor = 'grabbing';
  };
  const handleWatchlistMouseMove = (e: React.MouseEvent) => {
    if (!watchlistDragging.current || !watchlistScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - watchlistScrollRef.current.offsetLeft;
    watchlistDragDist.current = Math.abs(x - watchlistStartX.current);
    watchlistScrollRef.current.scrollLeft = watchlistScrollStart.current - (x - watchlistStartX.current) * 2;
  };
  const handleWatchlistMouseUp = () => {
    watchlistDragging.current = false;
    if (watchlistScrollRef.current) watchlistScrollRef.current.style.cursor = 'grab';
  };

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
    const handleLanguageChange = () => {
      if (typeof window !== 'undefined') {
        const { cache } = require('../lib/cache');
        cache.invalidatePattern('movie:');
      }
      fetchProfiles();
      if (session?.user?.id) {
        fetchFriendsWatchlist();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n, session?.user?.id]);

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

      const offset = (currentPage - 1) * USERS_PER_PAGE;

      const { count: totalCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (totalCount) {
        setTotalPages(Math.ceil(totalCount / USERS_PER_PAGE));
      }

      const { data: visibleProfiles, error: profilesError } = await supabase
        .rpc('get_visible_profiles', {
          p_user_id: session.user.id,
          p_limit: USERS_PER_PAGE,
          p_offset: offset
        });

      if (profilesError) throw profilesError;

      setProfiles(visibleProfiles || []);
      setFilteredProfiles(visibleProfiles || []);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const searchProfiles = async () => {
    if (!session?.user?.id) return;

    try {
      setSearching(true);

      const { data: searchResults, error } = await supabase
        .rpc('search_visible_profiles', {
          p_user_id: session.user.id,
          p_search_query: debouncedQuery,
          p_limit: 50
        });

      if (error) throw error;

      setFilteredProfiles(searchResults || []);
    } catch (error) {
      console.error('Error searching profiles:', error);
      toast.error(t('common.error'));
    } finally {
      setSearching(false);
    }
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
              const details = await getMovieDetailsFromDB(movie.movie_id);
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
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
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

      <div className="container mx-auto max-w-7xl relative z-10">
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
              className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30"
            >
              <Users className="w-8 h-8 text-blue-500 dark:text-blue-400" />
            </motion.div>
            <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500">
              {t('community.title')}
            </h1>
          </div>
          <div className="w-full md:w-96">
            <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-lg overflow-hidden">
              <input
                type="text"
                placeholder={t('community.searchMembers')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-10 py-3 bg-transparent text-gray-800 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none"
                aria-label={t('community.searchMembers')}
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              {searching && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-blue-500" />
              )}
            </div>
          </div>
        </motion.div>

        {currentPage === 1 && !searchQuery && (
          <motion.div
            className="mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden p-6">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
              </div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-400/30">
                    <Sparkles className="w-6 h-6 text-purple-500 dark:text-purple-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500">
                    {t('community.friendsPlanning')}
                  </h2>
                </div>

                {loadingWatchlist ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  </div>
                ) : friendsWatchlist.length > 0 ? (
                  <div
                    ref={watchlistScrollRef}
                    className="overflow-x-auto pb-2 cursor-grab select-none"
                    onMouseDown={handleWatchlistMouseDown}
                    onMouseMove={handleWatchlistMouseMove}
                    onMouseUp={handleWatchlistMouseUp}
                    onMouseLeave={handleWatchlistMouseUp}
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                  >
                    <div className="flex gap-4">
                      {friendsWatchlist.map((movie) => (
                        <motion.div
                          key={`${movie.movie_id}-${movie.friend_id}`}
                          className="relative group cursor-pointer flex-shrink-0 rounded-xl overflow-hidden shadow-lg"
                          style={{ width: '160px', willChange: 'transform' }}
                          onClick={() => { if (watchlistDragDist.current > 5) return; movie.movieDetails && setSelectedMovie(movie.movieDetails); }}
                          whileHover={{ scale: 1.05, y: -6 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {movie.movieDetails?.poster_path && (
                            <img
                              src={`https://image.tmdb.org/t/p/w342${movie.movieDetails.poster_path}`}
                              alt={movie.title}
                              draggable={false}
                              onDragStart={(e) => e.preventDefault()}
                              className="w-full aspect-[2/3] object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
                              loading="lazy"
                              decoding="async"
                              style={{ userSelect: 'none', WebkitUserDrag: 'none' } as React.CSSProperties}
                            />
                          )}
                          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 pointer-events-none">
                            <p className="text-white text-xs font-semibold truncate drop-shadow">{movie.title}</p>
                            {movie.friend_username && (
                              <p className="text-gray-300 text-[10px] truncate">@{movie.friend_username}</p>
                            )}
                          </div>
                          {movie.movieDetails?.vote_average && movie.movieDetails.vote_average > 0 && (
                            <div className="absolute top-2 right-2 bg-purple-500/90 text-white px-1.5 py-0.5 rounded-md text-[10px] font-bold shadow-lg backdrop-blur-sm">
                              ★ {movie.movieDetails.vote_average.toFixed(1)}
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t('common.noMoviesFound')}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {filteredProfiles.length === 0 ? (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-12 text-center"
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
                className={`relative rounded-2xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl overflow-hidden cursor-pointer group ${getBannerClass(profile.banner, profile.plan_type === 'premium')}`}
                onClick={() => navigateToProfile(profile.username)}
                role="button"
                tabIndex={0}
                aria-label={`View ${profile.username}'s profile`}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative h-full flex flex-col p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="relative flex-shrink-0">
                      <div className={`w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile.avatar_frame, profile.plan_type === 'premium')}`}>
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.username}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
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
                          profile.active_tag.category === 'basic'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : profile.active_tag.category === 'theme'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            : profile.active_tag.category === 'community'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            : profile.active_tag.category === 'oracle'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                            : profile.active_tag.category === 'special'
                            ? 'bg-red-900 dark:bg-red-900/60 text-white dark:text-red-100'
                            : 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400'
                        }`}>
                          <span>{profile.active_tag.emoji}</span>
                          <span className="truncate max-w-[120px]">{profile.active_tag.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4 flex-1">
                    {profile.bio || t('profile.bio')}
                  </p>

                  <div className="flex items-center gap-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
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
              </motion.div>
            ))}
          </motion.div>
        )}

        {!searchQuery && filteredProfiles.length > 0 && totalPages > 1 && (
          <motion.div
            className="flex items-center justify-center gap-2 mt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2.5 rounded-xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 font-medium hover:bg-white/60 dark:hover:bg-gray-700/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
                    className={`w-10 h-10 rounded-xl font-medium transition-all ${
                      currentPage === pageNum
                        ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/25'
                        : 'bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-700/60'
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
              className="px-4 py-2.5 rounded-xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 font-medium hover:bg-white/60 dark:hover:bg-gray-700/60 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {t('common.next', { defaultValue: 'Next' })} →
            </button>
          </motion.div>
        )}
      </div>

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
