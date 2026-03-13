import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, Library as LibraryIcon, Eye, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Movie, getTrending, getMovieDetails, getComingSoon, getTopRatedGems } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import Logo from '../components/Logo';
import MovieDetailsModal from '../components/MovieDetailsModal';
import OptimizedPoster from '../components/OptimizedPoster';
import HomeUserPanels from '../components/HomeUserPanels';
import OracleForYouBox from '../components/OracleForYouBox';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const Home = () => {
  const { session, user } = useAuth();
  const { t } = useTranslation();
  const [trendingMovies, setTrendingMovies] = React.useState<Movie[]>([]);
  const [comingSoonMovies, setComingSoonMovies] = React.useState<Movie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = React.useState<Movie[]>([]);
  const [userPersonalidade, setUserPersonalidade] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState({
    trending: false,
    comingSoon: false,
    topRated: false,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = React.useState<Movie | null>(null);
  const [username, setUsername] = React.useState('');
  useEffect(() => {
    if (session?.user) {
      fetchUsername();
      fetchAllMovies();
      fetchUserEssence();
    }
  }, [session?.user]);

  const fetchUsername = async () => {
    try {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('username')
        .eq('id', session?.user?.id)
        .maybeSingle();

      if (error) throw error;
      setUsername(data?.username || '');
    } catch (error) {
      console.error('Error fetching username:', error);
    }
  };

  const fetchAllMovies = async () => {
    try {
      setLoading({ trending: true, comingSoon: true, topRated: true });
      setError(null);

      const [trending, comingSoon, topRated] = await Promise.all([
        getTrending(),
        getComingSoon(),
        getTopRatedGems(),
      ]);

      setTrendingMovies(trending);
      setComingSoonMovies(comingSoon);
      setTopRatedMovies(topRated);
    } catch (error) {
      console.error('Error fetching movies:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch movies');
    } finally {
      setLoading({ trending: false, comingSoon: false, topRated: false });
    }
  };

  const fetchUserEssence = async () => {
    if (!session?.user?.id) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('personalidade_completa')
        .eq('id', session.user.id)
        .maybeSingle();
      setUserPersonalidade(data?.personalidade_completa ?? null);
    } catch {
      // ignore
    }
  };

  const handleMovieClick = async (movie: Movie) => {
    try {
      const details = await getMovieDetails(movie.id);
      setSelectedMovie(details);
    } catch (error) {
      console.error('Error fetching movie details:', error);
      toast.error('Failed to load movie details');
    }
  };

  const handleAddToLibrary = () => {
    // Modal handles the library state internally
  };

  const MovieCarousel = ({ title, movies, loading, category }: { title: string | JSX.Element; movies: Movie[]; loading: boolean; category: string }) => {
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const isDraggingRef = React.useRef(false);
    const startXRef = React.useRef(0);
    const scrollStartRef = React.useRef(0);
    const dragDistanceRef = React.useRef(0);

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!scrollRef.current) return;
      isDraggingRef.current = true;
      startXRef.current = e.pageX - scrollRef.current.offsetLeft;
      scrollStartRef.current = scrollRef.current.scrollLeft;
      dragDistanceRef.current = 0;
      scrollRef.current.style.cursor = 'grabbing';
    };
    const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingRef.current || !scrollRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollRef.current.offsetLeft;
      dragDistanceRef.current = Math.abs(x - startXRef.current);
      scrollRef.current.scrollLeft = scrollStartRef.current - (x - startXRef.current) * 2;
    };
    const handleMouseUp = () => {
      isDraggingRef.current = false;
      if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
    };

    if (loading) {
      return (
        <div className="relative mb-10 p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      );
    }

    return (
      <motion.div
        className="relative mb-10 p-6 sm:p-8 rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-pink-500/8 to-blue-400/5 rounded-full blur-3xl"></div>
        </div>

        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}></div>

        <div className="relative z-10 flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1 bg-gradient-to-b from-blue-400 via-cyan-400 to-blue-500 rounded-full"></div>
            <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 leading-relaxed">
              {title}
            </h2>
          </div>
          <Link
            to={`/category/${category}`}
            className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:shadow-lg hover:shadow-blue-500/25 rounded-xl transition-all duration-300 whitespace-nowrap flex-shrink-0 overflow-hidden relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
            <span className="relative z-10 hidden sm:inline">{t('common.view_all')}</span>
            <span className="relative z-10 sm:hidden">Ver</span>
            <ArrowRight className="relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </Link>
        </div>

        <div
          ref={scrollRef}
          className="relative z-10 overflow-x-auto py-4 pb-2 cursor-grab select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <div className="flex gap-4">
            {movies.map((movie, index) => (
              <motion.div
                key={movie.id}
                className="relative rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-xl border border-white/10"
                style={{ width: '160px', height: '240px', willChange: 'transform' }}
                onClick={() => { if (dragDistanceRef.current > 5) return; handleMovieClick(movie); }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                whileHover={{ scale: 1.05, y: -8 }}
                whileTap={{ scale: 0.97 }}
              >
                <div
                  className="absolute top-2 left-2 bg-blue-500/80 backdrop-blur-md text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg border border-blue-400/30"
                  style={{ zIndex: 30, transform: 'translateZ(0)' }}
                >
                  #{index + 1}
                </div>

                <OptimizedPoster
                  src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                  alt={movie.title}
                  className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
                />

                <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-[2px] pointer-events-none">
                  <div className="p-3">
                    <h3 className="text-white font-bold mb-1.5 line-clamp-2 text-sm drop-shadow-lg">{movie.title}</h3>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center bg-blue-500/20 backdrop-blur-md px-2 py-1 rounded-lg border border-blue-400/30">
                        <Star className="w-3 h-3 fill-blue-400 text-blue-400" />
                        <span className="ml-1 text-blue-100 font-bold text-xs">{movie.vote_average.toFixed(1)}</span>
                      </div>
                      <span className="text-gray-200 text-xs font-semibold bg-white/10 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/10">
                        {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    );
  };

  if (!session) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950/90 to-slate-900">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute top-40 right-20 w-80 h-80 bg-gradient-to-br from-pink-500/12 to-rose-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute bottom-40 left-1/3 w-72 h-72 bg-gradient-to-br from-cyan-500/10 to-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-indigo-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }}></div>
        </div>

        <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-8 sm:py-12">
          <motion.div
            className="relative rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden max-w-lg w-full mb-8 mt-8 sm:mt-12"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-blue-500/15 to-cyan-400/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-pink-500/10 to-blue-400/10 rounded-full blur-3xl" />
            </div>
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}></div>

            <div className="relative z-10 p-8 sm:p-10 flex flex-col items-center text-center">
              <motion.div
                className="mb-6"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <motion.div
                  className="relative"
                  animate={{
                    filter: [
                      'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                      'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 14px rgba(59, 130, 246, 0.5)) drop-shadow(0 0 28px rgba(59, 130, 246, 0.4))',
                      'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 10px rgba(255, 255, 255, 0.3)) drop-shadow(0 0 20px rgba(59, 130, 246, 0.3))',
                    ]
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Logo size="large" className="w-24 h-24 sm:w-28 sm:h-28" />
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3">
                  <span className="text-white">{t('home.welcomeTo')} </span>
                  <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                    CineOracle
                  </span>
                </h1>
              </motion.div>

              <motion.p
                className="text-gray-300/80 text-sm sm:text-base leading-relaxed max-w-md"
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                {t('home.welcomeDesc')}
              </motion.p>
            </div>
          </motion.div>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl w-full mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            {[
              {
                icon: <Star className="w-8 h-8" />,
                titleKey: 'home.homeClassification',
                descriptionKey: 'home.homeClassificationDesc',
                iconBg: 'bg-amber-500/15',
                iconColor: 'text-amber-400',
                accentColor: 'from-amber-500/10 to-orange-500/5'
              },
              {
                icon: <LibraryIcon className="w-8 h-8" />,
                titleKey: 'home.homeLibrary',
                descriptionKey: 'home.homeLibraryDesc',
                iconBg: 'bg-blue-500/15',
                iconColor: 'text-blue-400',
                accentColor: 'from-blue-500/10 to-cyan-500/5'
              },
              {
                icon: <Eye className="w-8 h-8" />,
                titleKey: 'home.homeOracle',
                descriptionKey: 'home.homeOracleDesc',
                iconBg: 'bg-purple-500/15',
                iconColor: 'text-purple-400',
                accentColor: 'from-purple-500/10 to-violet-500/5'
              },
              {
                icon: <Users className="w-8 h-8" />,
                titleKey: 'home.homeCommunity',
                descriptionKey: 'home.homeCommunityDesc',
                iconBg: 'bg-emerald-500/15',
                iconColor: 'text-emerald-400',
                accentColor: 'from-emerald-500/10 to-green-500/5'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                className="relative group"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 + (index * 0.1), duration: 0.4 }}
                whileHover={{ y: -4, scale: 1.02 }}
              >
                <div className={`relative rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-5 sm:p-6 h-full transition-all duration-300 group-hover:border-white/20 group-hover:bg-white/8 overflow-hidden`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.accentColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                  <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{
                    backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                    backgroundSize: '16px 16px'
                  }}></div>

                  <div className="relative z-10 flex items-start gap-4">
                    <div className={`flex-shrink-0 p-3 rounded-xl ${feature.iconBg} ${feature.iconColor}`}>
                      {feature.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-white mb-1.5 leading-tight">
                        {t(feature.titleKey)}
                      </h3>
                      <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                        {t(feature.descriptionKey)}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            className="relative rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden max-w-lg w-full p-6 sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.5 }}
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-cyan-400/5 rounded-full blur-2xl" />
              <div className="absolute bottom-0 right-0 w-28 h-28 bg-gradient-to-tr from-cyan-500/8 to-blue-400/5 rounded-full blur-2xl" />
            </div>

            <div className="relative z-10 flex flex-col items-center text-center">
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="w-full"
              >
                <Link
                  to="/auth?signup=true"
                  className="group relative flex items-center justify-center gap-3 w-full px-8 py-4 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 text-white text-base sm:text-lg font-bold rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30"
                >
                  <span className="relative z-10">{t('home.signUpButton')}</span>
                  <Logo className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:rotate-12" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                </Link>
              </motion.div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-5"></div>

              <p className="text-gray-400 text-sm">
                {t('home.alreadyHaveAccount')}{' '}
                <Link to="/auth" className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                  {t('home.signInLink')}
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-900 via-blue-950/90 to-slate-900 transition-all duration-500 py-8 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-500/15 to-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-pink-500/12 to-rose-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-40 left-1/3 w-72 h-72 bg-gradient-to-br from-cyan-500/10 to-blue-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-20 right-1/4 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-indigo-500/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '3s' }}></div>
      </div>

      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '30px 30px'
      }}></div>

      <div className="max-w-7xl mx-auto relative z-10">
        {session?.user && (
          <HomeUserPanels
            userId={session.user.id}
            username={username}
          />
        )}

        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🔥</span> {t('home.popularNow')}</span>}
          movies={trendingMovies}
          loading={loading.trending}
          category="trending"
        />

        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>🎬</span> {t('home.comingSoon')}</span>}
          movies={comingSoonMovies}
          loading={loading.comingSoon}
          category="coming-soon"
        />

        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>⭐</span> {t('home.topRatedGems')}</span>}
          movies={topRatedMovies}
          loading={loading.topRated}
          category="top-rated"
        />

        {session?.user && (
          <OracleForYouBox
            userId={session.user.id}
            hasEssence={!!(userPersonalidade && userPersonalidade.length >= 3)}
          />
        )}
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          isOtherUserProfile={false}
          onAddToLibrary={handleAddToLibrary}
        />
      )}
    </div>
  );
};

export default Home;
