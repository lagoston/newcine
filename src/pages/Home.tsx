import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star, Library as LibraryIcon, Eye, Users, ArrowRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Movie, getTrending, getMovieDetails, getComingSoon, getTopRatedGems, getHiddenIndies, getSeasonalMovies, getCurrentSeason } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';
import MovieDetailsModal from '../components/MovieDetailsModal';
import OptimizedPoster from '../components/OptimizedPoster';
import { Swiper, SwiperSlide } from 'swiper/react';
import { motion } from 'framer-motion';
import 'swiper/css';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const Home = () => {
  const { session, user } = useAuth();
  const { t } = useTranslation();
  const [trendingMovies, setTrendingMovies] = React.useState<Movie[]>([]);
  const [comingSoonMovies, setComingSoonMovies] = React.useState<Movie[]>([]);
  const [seasonalMovies, setSeasonalMovies] = React.useState<Movie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = React.useState<Movie[]>([]);
  const [indieMovies, setIndieMovies] = React.useState<Movie[]>([]);
  const [loading, setLoading] = React.useState({
    trending: false,
    comingSoon: false,
    seasonal: false,
    topRated: false,
    indie: false
  });
  const [error, setError] = React.useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = React.useState<Movie | null>(null);
  const [username, setUsername] = React.useState('');

  useEffect(() => {
    if (session?.user) {
      fetchUsername();
      fetchAllMovies();
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
      setLoading({
        trending: true,
        comingSoon: true,
        seasonal: true,
        topRated: true,
        indie: true
      });
      setError(null);

      const [trending, comingSoon, seasonal, topRated, indie] = await Promise.all([
        getTrending(),
        getComingSoon(),
        getSeasonalMovies(),
        getTopRatedGems(),
        getHiddenIndies()
      ]);

      setTrendingMovies(trending);
      setComingSoonMovies(comingSoon);
      setSeasonalMovies(seasonal);
      setTopRatedMovies(topRated);
      setIndieMovies(indie);
    } catch (error) {
      console.error('Error fetching movies:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch movies');
    } finally {
      setLoading({
        trending: false,
        comingSoon: false,
        seasonal: false,
        topRated: false,
        indie: false
      });
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
    fetchAllMovies(); // Refresh the list after adding to library
  };

  const MovieCarousel = ({ title, movies, loading, category }: { title: string | JSX.Element; movies: Movie[]; loading: boolean; category: string }) => {
    if (loading) {
      return (
        <div className="relative mb-12 p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      );
    }

    return (
      <motion.div
        className="relative mb-12 p-6 sm:p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Padrão decorativo de fundo */}
        <div className="absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
        </div>

        {/* Grid pattern decorativo */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}></div>

        {/* Header da seção */}
        <div className="relative z-10 flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-1.5 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
            <h2 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 pb-1 leading-relaxed">
              {title}
            </h2>
          </div>
          <Link
            to={`/category/${category}`}
            className="flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl transition-all duration-300 whitespace-nowrap flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
          >
            <span className="hidden sm:inline">{t('common.view_all')}</span>
            <span className="sm:hidden">Ver</span>
            <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
          </Link>
        </div>

        {/* Container do carrossel */}
        <div className="relative z-10 overflow-visible py-4">
          <Swiper
            slidesPerView={1.2}
            spaceBetween={16}
            speed={400}
            freeMode={true}
            grabCursor={true}
            breakpoints={{
              0: { slidesPerView: 2.4, spaceBetween: 16 },
              480: { slidesPerView: 3.2, spaceBetween: 18 },
              640: { slidesPerView: 4.1, spaceBetween: 20 },
              768: { slidesPerView: 5.1, spaceBetween: 22 },
              1024: { slidesPerView: 6.1, spaceBetween: 24 }
            }}
            className="popular-swiper pb-4"
            style={{ overflow: 'visible' }}
          >
            {movies.map((movie, index) => (
              <SwiperSlide key={movie.id}>
                <motion.div
                  className="relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group h-[200px] sm:h-[280px] shadow-xl hover:shadow-2xl border-3 border-white/50 dark:border-gray-700/50 hover:border-blue-400/60 dark:hover:border-purple-400/60"
                  onClick={() => handleMovieClick(movie)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  whileHover={{ scale: 1.05, y: -8 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ transition: 'all 0.2s ease-out' }}
                >
                  {/* Badge de ranking */}
                  <div className="absolute top-2 left-2 z-10 bg-gradient-to-br from-blue-600 to-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                    #{index + 1}
                  </div>

                  <OptimizedPoster
                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                    alt={movie.title}
                    className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
                  />

                  {/* Overlay com gradiente */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-sm">
                    <div className="p-4 sm:p-5">
                      <h3 className="text-white font-bold mb-2 line-clamp-2 text-base sm:text-lg drop-shadow-lg">{movie.title}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center bg-gradient-to-r from-yellow-500/30 to-orange-500/30 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-yellow-500/30 shadow-lg">
                          <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-yellow-400 text-yellow-400" />
                          <span className="ml-1 text-yellow-100 font-bold text-sm">{movie.vote_average.toFixed(1)}</span>
                        </div>
                        <span className="text-gray-200 text-xs sm:text-sm font-semibold bg-white/20 backdrop-blur-sm px-2 py-1 rounded-lg">
                          {new Date(movie.release_date).getFullYear()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Brilho no hover */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/20 group-hover:via-purple-500/20 group-hover:to-pink-500/20 transition-all duration-300 pointer-events-none"></div>
                </motion.div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </motion.div>
    );
  };

  if (!session) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 transition-all duration-500 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.05),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.1),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_80%,rgba(168,85,247,0.05),transparent_50%)]"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 relative z-10">
          <div className="text-center">
            <motion.div 
              className="flex justify-center items-center mb-8"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <Logo size="large" />
            </motion.div>
            
            <motion.h1 
              className="text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl md:text-6xl mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              {t('home.welcomeTitle')}
            </motion.h1>
            
            <motion.p 
              className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-12"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              {t('home.welcomeDesc')}
            </motion.p>
            
            <motion.div 
              className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto mb-16"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5, staggerChildren: 0.1 }}
            >
              {[
                {
                  icon: <Star className="h-12 w-12 text-yellow-500 mb-4 mx-auto" />,
                  title: t('movies.rating'),
                  desc: t('home.rateMoviesHelp'),
                  gradient: 'from-yellow-500/10 to-orange-500/10'
                },
                {
                  icon: <LibraryIcon className="h-12 w-12 text-blue-500 dark:text-blue-400 mb-4 mx-auto" />,
                  title: t('home.yourLibrary'),
                  desc: t('home.viewManage'),
                  gradient: 'from-blue-500/10 to-cyan-500/10'
                },
                {
                  icon: <Eye className="h-12 w-12 text-purple-500 dark:text-purple-400 mb-4 mx-auto" />,
                  title: t('oracle.prediction.title'),
                  desc: t('home.getPersonalized'),
                  gradient: 'from-purple-500/10 to-pink-500/10'
                },
                {
                  icon: <Users className="h-12 w-12 text-green-500 dark:text-green-400 mb-4 mx-auto" />,
                  title: t('nav.community'),
                  desc: t('community.description'),
                  gradient: 'from-green-500/10 to-emerald-500/10'
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  className={`glass-effect rounded-2xl shadow-lg border border-white/20 dark:border-gray-700/50 p-8 bg-gradient-to-br ${feature.gradient} backdrop-blur-xl`}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + (i * 0.1), duration: 0.4 }}
                  whileHover={{ scale: 1.03, y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  style={{ transition: 'all 0.15s ease-out' }}
                >
                  {feature.icon}
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{feature.title}</h2>
                  <p className="text-gray-700 dark:text-gray-300">{feature.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 300, damping: 20 }}
            >
              <Link
                to="/auth"
                className="inline-flex items-center px-10 py-5 border border-transparent text-lg font-bold rounded-2xl text-white bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 shadow-2xl hover:shadow-3xl btn-hover-lift gradient-animate relative overflow-hidden group"
              >
                <span className="relative z-10">{t('auth.signUp')}</span>
                <Logo className="ml-3 w-6 h-6 relative z-10 transform group-hover:rotate-12 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 transition-all duration-500 py-8 px-4 relative overflow-hidden">
      {/* Orbs animados de fundo */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Grid pattern de fundo */}
      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }}></div>

      {/* Dots pattern decorativo */}
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '30px 30px'
      }}></div>

      {/* Brilho sutil no topo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 bg-gradient-to-b from-blue-500/5 to-transparent dark:from-blue-400/5 blur-2xl"></div>

      <div className="max-w-7xl mx-auto relative z-10">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <motion.h1 
            className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {t('home.welcome', { username })}
          </motion.h1>
          
          <motion.div
            className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <Link
              to="/library"
              className="glass-effect bg-gradient-to-br from-blue-500/5 to-cyan-500/5 p-10 rounded-2xl shadow-lg border border-blue-200/30 dark:border-blue-700/30 group flex flex-col items-center justify-center card-interactive backdrop-blur-xl hover:shadow-blue-500/50 hover:shadow-2xl transition-all duration-200"
            >
              <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 mb-5 transition-all duration-200 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-lg group-hover:shadow-blue-500/50">
                <LibraryIcon className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('home.yourLibrary')}</h2>
              <p className="text-gray-700 dark:text-gray-300 text-center">{t('home.viewManage')}</p>
            </Link>

            <Link
              to="/oracle"
              className="glass-effect bg-gradient-to-br from-purple-500/5 to-pink-500/5 p-10 rounded-2xl shadow-lg border border-purple-200/30 dark:border-purple-700/30 group flex flex-col items-center justify-center card-interactive backdrop-blur-xl hover:shadow-purple-500/50 hover:shadow-2xl transition-all duration-200"
            >
              <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 mb-5 transition-all duration-200 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-lg group-hover:shadow-purple-500/50">
                <Eye className="h-10 w-10 text-purple-600 dark:text-purple-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t('home.consultOracle')}</h2>
              <p className="text-gray-700 dark:text-gray-300 text-center">{t('home.getPersonalized')}</p>
            </Link>
          </motion.div>
        </motion.div>

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
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>{getCurrentSeason().emoji}</span> {getCurrentSeason().name}</span>}
          movies={seasonalMovies}
          loading={loading.seasonal}
          category={getCurrentSeason().key}
        />

        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>⭐</span> {t('home.topRatedGems')}</span>}
          movies={topRatedMovies}
          loading={loading.topRated}
          category="top-rated"
        />

        <MovieCarousel
          title={<span className="flex items-center gap-3"><span className="text-3xl" style={{fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'}}>💎</span> {t('home.hiddenIndiePicks')}</span>}
          movies={indieMovies}
          loading={loading.indie}
          category="indie"
        />

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
    </div>
  );
};

export default Home;