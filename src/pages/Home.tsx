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
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode } from 'swiper/modules';
import { motion } from 'framer-motion';
import 'swiper/css';
import 'swiper/css/free-mode';
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
  const swiperMoved = React.useRef(false);

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
    const [isDraggingDesktop, setIsDraggingDesktop] = React.useState(false);
    const [startX, setStartX] = React.useState(0);
    const [scrollLeft, setScrollLeft] = React.useState(0);
    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const dragDistanceRef = React.useRef(0);

    if (loading) {
      return (
        <div className="relative mb-12 p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl">
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        </div>
      );
    }

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!scrollContainerRef.current) return;
      setIsDraggingDesktop(true);
      setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
      setScrollLeft(scrollContainerRef.current.scrollLeft);
      dragDistanceRef.current = 0;
      scrollContainerRef.current.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDraggingDesktop || !scrollContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.current.offsetLeft;
      const walk = (x - startX) * 2;
      dragDistanceRef.current = Math.abs(walk);
      scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    };

    const handleMouseUp = () => {
      setIsDraggingDesktop(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.cursor = 'grab';
      }
    };

    const handleMouseLeave = () => {
      setIsDraggingDesktop(false);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.cursor = 'grab';
      }
    };

    const handleMovieClickDesktop = (movie: Movie) => {
      if (dragDistanceRef.current > 5) {
        return;
      }
      handleMovieClick(movie);
    };

    return (
      <motion.div
        className="relative mb-12 p-6 sm:p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 opacity-30 dark:opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
        </div>

        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}></div>

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

        <div className="relative z-10 overflow-visible py-4">
          <div className="block lg:hidden">
            <Swiper
              modules={[FreeMode]}
              slidesPerView={1.2}
              spaceBetween={16}
              speed={400}
              freeMode={{
                enabled: true,
                momentum: true,
                momentumRatio: 1,
                momentumVelocityRatio: 1,
                momentumBounce: false,
                sticky: false,
                minimumVelocity: 0.02
              }}
              grabCursor={true}
              resistance={true}
              resistanceRatio={0.85}
              touchRatio={1}
              touchAngle={45}
              threshold={5}
              longSwipesRatio={0.5}
              shortSwipes={true}
              longSwipes={true}
              followFinger={true}
              watchSlidesProgress={true}
              preventInteractionOnTransition={false}
              allowTouchMove={true}
              touchStartForcePreventDefault={false}
              cssMode={false}
              breakpoints={{
                0: { slidesPerView: 2.4, spaceBetween: 16 },
                480: { slidesPerView: 3.2, spaceBetween: 18 },
                640: { slidesPerView: 4.1, spaceBetween: 20 },
                768: { slidesPerView: 5.1, spaceBetween: 22 }
              }}
              onTouchStart={() => {
                swiperMoved.current = false;
              }}
              onSliderMove={() => {
                swiperMoved.current = true;
              }}
              onTouchEnd={(swiper) => {
                setTimeout(() => {
                  swiperMoved.current = false;
                }, 50);
              }}
              onClick={(swiper, event) => {
                if (swiperMoved.current) {
                  event.preventDefault();
                  event.stopPropagation();
                }
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
                    style={{
                      transition: 'all 0.2s ease-out',
                      willChange: 'transform'
                    }}
                  >
                    <div
                      className="absolute top-2 left-2 bg-gradient-to-br from-blue-600 to-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg"
                      style={{
                        zIndex: 30,
                        willChange: 'transform, opacity',
                        transform: 'translateZ(0)',
                        backfaceVisibility: 'hidden' as const
                      }}
                    >
                      #{index + 1}
                    </div>

                    <OptimizedPoster
                      src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
                    />

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

                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/20 group-hover:via-purple-500/20 group-hover:to-pink-500/20 transition-all duration-300 pointer-events-none"></div>
                  </motion.div>
                </SwiperSlide>
              ))}
            </Swiper>
          </div>

          <div
            className="hidden lg:block overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing pb-4"
            ref={scrollContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            style={{
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <div className="flex gap-6" style={{ minWidth: 'min-content' }}>
              {movies.map((movie, index) => (
                <motion.div
                  key={movie.id}
                  className="relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group h-[280px] shadow-xl hover:shadow-2xl border-3 border-white/50 dark:border-gray-700/50 hover:border-blue-400/60 dark:hover:border-purple-400/60 flex-shrink-0"
                  style={{
                    width: '200px',
                    transition: 'all 0.2s ease-out',
                    willChange: 'transform'
                  }}
                  onClick={() => handleMovieClickDesktop(movie)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.3 }}
                  whileHover={{ scale: 1.05, y: -8 }}
                >
                  <div
                    className="absolute top-2 left-2 bg-gradient-to-br from-blue-600 to-purple-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg"
                    style={{
                      zIndex: 30,
                      willChange: 'transform, opacity',
                      transform: 'translateZ(0)',
                      backfaceVisibility: 'hidden' as const
                    }}
                  >
                    #{index + 1}
                  </div>

                  <OptimizedPoster
                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                    alt={movie.title}
                    className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out pointer-events-none"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-sm pointer-events-none">
                    <div className="p-5">
                      <h3 className="text-white font-bold mb-2 line-clamp-2 text-lg drop-shadow-lg">{movie.title}</h3>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center bg-gradient-to-r from-yellow-500/30 to-orange-500/30 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-yellow-500/30 shadow-lg">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="ml-1 text-yellow-100 font-bold text-sm">{movie.vote_average.toFixed(1)}</span>
                        </div>
                        <span className="text-gray-200 text-sm font-semibold bg-white/20 backdrop-blur-sm px-2 py-1 rounded-lg">
                          {new Date(movie.release_date).getFullYear()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/0 via-purple-500/0 to-pink-500/0 group-hover:from-blue-500/20 group-hover:via-purple-500/20 group-hover:to-pink-500/20 transition-all duration-300 pointer-events-none"></div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  if (!session) {
    return (
      <div
        className="min-h-screen relative overflow-hidden"
        style={{
          backgroundImage: 'url(/assets/Fundo.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e27]/80 via-[#0a0e27]/70 to-[#0a0e27]/80"></div>

        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-blue-500/20 via-purple-500/10 to-transparent blur-3xl"></div>

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
          <motion.div
            className="mb-12"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <motion.div
              className="relative"
              animate={{
                filter: [
                  'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 12px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.3))',
                  'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 16px rgba(168, 85, 247, 0.5)) drop-shadow(0 0 32px rgba(168, 85, 247, 0.4))',
                  'brightness(0) saturate(100%) invert(1) drop-shadow(0 0 12px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.3))',
                ]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            >
              <Logo size="large" className="w-32 h-32" />
            </motion.div>
          </motion.div>

          <motion.div
            className="text-center mb-6"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-4 px-4">
              <span className="text-white">{t('home.welcomeTo')} </span>
              <span className="bg-gradient-to-r from-pink-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                CineOracle
              </span>
            </h1>
          </motion.div>

          <motion.p
            className="text-gray-300 text-base sm:text-lg md:text-xl text-center max-w-2xl mb-16 px-4"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            {t('home.welcomeDesc')}
          </motion.p>

          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full px-4 mb-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.6 }}
          >
            {[
              {
                icon: <Star className="w-12 h-12 text-yellow-400 mb-4" />,
                titleKey: 'home.homeClassification',
                descriptionKey: 'home.homeClassificationDesc',
                gradient: 'from-yellow-500/20 to-orange-500/20',
                borderGradient: 'from-yellow-500/50 to-orange-500/50'
              },
              {
                icon: <LibraryIcon className="w-12 h-12 text-blue-400 mb-4" />,
                titleKey: 'home.homeLibrary',
                descriptionKey: 'home.homeLibraryDesc',
                gradient: 'from-blue-500/20 to-cyan-500/20',
                borderGradient: 'from-blue-500/50 to-cyan-500/50'
              },
              {
                icon: <Eye className="w-12 h-12 text-purple-400 mb-4" />,
                titleKey: 'home.homeOracle',
                descriptionKey: 'home.homeOracleDesc',
                gradient: 'from-purple-500/20 to-pink-500/20',
                borderGradient: 'from-purple-500/50 to-pink-500/50'
              },
              {
                icon: <Users className="w-12 h-12 text-green-400 mb-4" />,
                titleKey: 'home.homeCommunity',
                descriptionKey: 'home.homeCommunityDesc',
                gradient: 'from-green-500/20 to-emerald-500/20',
                borderGradient: 'from-green-500/50 to-emerald-500/50'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                className="relative group"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8 + (index * 0.1), duration: 0.5 }}
                whileHover={{ y: -8, scale: 1.02 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-sm"
                  style={{
                    background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
                    backgroundImage: `linear-gradient(135deg, ${feature.borderGradient.split(' ')[1]}, ${feature.borderGradient.split(' ')[2]})`
                  }}
                ></div>

                <div className={`relative bg-gradient-to-br ${feature.gradient} backdrop-blur-xl rounded-2xl p-6 sm:p-8 border border-white/10 h-full transition-all duration-300 group-hover:border-white/20`}>
                  <div className="flex flex-col items-center text-center">
                    {feature.icon}
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">
                      {t(feature.titleKey)}
                    </h3>
                    <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
                      {t(feature.descriptionKey)}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
          >
            <Link
              to="/auth?signup=true"
              className="group relative inline-flex items-center justify-center gap-3 px-8 sm:px-12 py-4 sm:py-5 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white text-base sm:text-lg font-bold rounded-full overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
            >
              <span className="relative z-10">{t('home.signUpButton')}</span>
              <Logo className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:rotate-12" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            </Link>
          </motion.div>

          <motion.p
            className="mt-6 text-gray-400 text-xs sm:text-sm px-4 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            {t('home.alreadyHaveAccount')}{' '}
            <Link to="/auth" className="text-purple-400 hover:text-purple-300 font-semibold underline transition-colors">
              {t('home.signInLink')}
            </Link>
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 transition-all duration-500 py-8 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }}></div>

      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '30px 30px'
      }}></div>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 bg-gradient-to-b from-blue-500/5 to-transparent dark:from-blue-400/5 blur-2xl"></div>

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
