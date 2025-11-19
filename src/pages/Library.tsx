import React, { useState, useEffect, useRef } from 'react';
import { Plus, ListPlus, Film, Eye, Edit } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Movie, getMovieDetails } from '../lib/tmdb';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import RatingBox from '../components/RatingBox';
import LibraryEditModal from '../components/LibraryEditModal';
import LinearProgressBar from '../components/LinearProgressBar';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';

interface UserMovie {
  id: string;
  movie_id: number;
  rating: number | null;
}

interface LibraryMovie extends Movie {
  userRating?: number | null;
}

export default function Library() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [userMovies, setUserMovies] = useState<LibraryMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [alternateNames, setAlternateNames] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('libraryAlternateNames');
    return saved ? JSON.parse(saved) : {};
  });
  
  // Progress tracking states
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [totalMovies, setTotalMovies] = useState(0);
  const [processedMovies, setProcessedMovies] = useState(0);
  const [loadingError, setLoadingError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Track if this is the initial load
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Track active requests to allow cleanup
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      fetchUserMovies();
    }

    // Cleanup on unmount or when user changes
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [session?.user?.id]);

  useEffect(() => {
    localStorage.setItem('libraryAlternateNames', JSON.stringify(alternateNames));
  }, [alternateNames]);

  const fetchUserMovies = async () => {
    try {
      // Clear any existing intervals
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      // Create new AbortController for this fetch
      abortControllerRef.current = new AbortController();

      setLoadingError(false);
      setLoadingProgress(0);
      setProcessedMovies(0);
      setLoading(true);

      const cacheKey = CACHE_KEYS.USER_LIBRARY(session?.user?.id || '');
      const cachedLibrary = cache.get<LibraryMovie[]>(cacheKey);

      if (cachedLibrary) {
        setUserMovies(cachedLibrary);
        setTotalMovies(cachedLibrary.length);
        setProcessedMovies(cachedLibrary.length);
        setLoadingProgress(100);
        setLoading(false);
        setInitialLoadComplete(true);
        return;
      }

      const { data: userMoviesData, error } = await supabase
        .from('user_movies')
        .select('*')
        .eq('user_id', session?.user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const total = (userMoviesData || []).length;
      setTotalMovies(total);

      setLoading(false);

      if (total === 0) {
        setUserMovies([]);
        setLoadingProgress(100);
        setInitialLoadComplete(true);
        return;
      }

      setLoadingProgress(5);

      // Carregamento incremental: primeiro 20 filmes
      const INITIAL_BATCH = 20;
      const initialBatch = userMoviesData.slice(0, INITIAL_BATCH);
      const remainingMovies = userMoviesData.slice(INITIAL_BATCH);

      // Simular progresso baseado em tempo estimado
      const estimatedDuration = 8000;
      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const percentage = Math.min(95, 5 + (elapsed / estimatedDuration) * 90);
        setLoadingProgress(percentage);
      }, 100);

      // Carregar primeiro lote (20 filmes)
      const firstBatchDetails = await Promise.all(
        initialBatch.map(async (userMovie: UserMovie) => {
          try {
            const details = await getMovieDetails(userMovie.movie_id);
            return {
              ...details,
              userRating: userMovie.rating,
            };
          } catch (err) {
            console.warn(`Failed to fetch movie ${userMovie.movie_id}`);
            return null;
          }
        })
      );

      const firstBatchMovies = firstBatchDetails.filter(movie => movie !== null);
      setUserMovies(firstBatchMovies);
      setProcessedMovies(firstBatchMovies.length);
      setInitialLoadComplete(true);

      // Carregar restante em background
      if (remainingMovies.length > 0) {
        const remainingDetails = await Promise.all(
          remainingMovies.map(async (userMovie: UserMovie) => {
            try {
              const details = await getMovieDetails(userMovie.movie_id);
              return {
                ...details,
                userRating: userMovie.rating,
              };
            } catch (err) {
              console.warn(`Failed to fetch movie ${userMovie.movie_id}`);
              return null;
            }
          })
        );

          const remainingBatchMovies = remainingDetails.filter(movie => movie !== null);
        const allMovies = [...firstBatchMovies, ...remainingBatchMovies];
        setUserMovies(allMovies);
        setProcessedMovies(allMovies.length);
        cache.set(cacheKey, allMovies, CACHE_TTL.USER_LIBRARY);
      } else {
        cache.set(cacheKey, firstBatchMovies, CACHE_TTL.USER_LIBRARY);
      }

      // Clear interval and set progress to complete
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoadingProgress(100);
    } catch (error) {
      console.error('Error fetching user movies:', error);

      // Clear interval on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      setLoadingError(true);
      setErrorMessage(t('common.error'));
      toast.error(t('common.error'));
      setLoadingProgress(100);
      setLoading(false);
    }
  };

  const handleRate = async (movieId: number, rating: number | null) => {
    try {
      // Encontrar o filme para obter os gêneros
      const movie = userMovies.find(m => m.id === movieId);

      // Cache dos gêneros para o Espectrograma Cinematográfico
      if (movie?.genres && movie.genres.length > 0) {
        try {
          await supabase
            .rpc('cache_movie_genres', {
              p_movie_id: movieId,
              p_genres: movie.genres
            });
        } catch (cacheError) {
          console.warn('Failed to cache movie genres:', cacheError);
          // Não bloquear o rating se o cache falhar
        }
      }

      const { error } = await supabase
        .from('user_movies')
        .update({ rating })
        .eq('movie_id', movieId)
        .eq('user_id', session?.user?.id);

      if (error) throw error;

      setUserMovies((movies) =>
        movies.map((movie) =>
          movie.id === movieId ? { ...movie, userRating: rating } : movie
        )
      );

      cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
      cache.invalidatePattern('stats:');
      toast.success(rating === null ? t('library.ratingRemoved') : t('library.ratingUpdated'));
    } catch (error) {
      console.error('Error updating rating:', error);
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async (movieId: number) => {
    try {
      // Trocar nota: move o filme de volta para a watchlist (rating = null)
      const { error } = await supabase
        .from('user_movies')
        .update({ rating: null })
        .eq('movie_id', movieId)
        .eq('user_id', session?.user?.id);

      if (error) throw error;

      // Atualizar localmente: mover para watchlist
      setUserMovies((movies) =>
        movies.map((movie) =>
          movie.id === movieId ? { ...movie, rating: null } : movie
        )
      );

      cache.invalidate(CACHE_KEYS.USER_LIBRARY(session?.user?.id || ''));
      cache.invalidatePattern('stats:');
      toast.success(t('library.movedToWatchlist'));
    } catch (error) {
      console.error('Error moving to watchlist:', error);
      toast.error(t('common.error'));
    }
  };

  const handleAlternateNameChange = (rating: number | null, name: string) => {
    setAlternateNames(prev => ({
      ...prev,
      [rating === null ? 'unrated' : rating]: name.trim()
    }));
  };

  const moviesByRating = userMovies.reduce(
    (acc, movie) => {
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

  // Loading screen with container animation

  // Container animations for main content
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

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background com gradientes animados */}
      <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/10 dark:to-purple-900/10"></div>

      {/* Orbes decorativos de fundo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <motion.div
        className="relative max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Loading Progress Bar - Fixed at top */}
        {loadingProgress > 0 && loadingProgress < 100 && (
          <motion.div
            className="sticky top-0 z-40 mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl shadow-lg border border-blue-200 dark:border-blue-800/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('library.loadingMovies')}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {processedMovies} / {totalMovies}
                </span>
              </div>
              <LinearProgressBar
                progress={loadingProgress}
                total={totalMovies}
                current={processedMovies}
                isError={loadingError}
                errorMessage={errorMessage}
              />
            </div>
          </motion.div>
        )}

        <motion.div
          className="flex flex-col gap-6 mb-8"
          variants={itemVariants}
        >
          {/* Header moderno */}
          <div className="relative p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden">
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

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-1.5 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 pb-1 leading-relaxed">
                    {t('library.title')}
                  </h1>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="inline-flex items-center text-sm font-semibold bg-gradient-to-r from-blue-500/20 to-purple-500/20 dark:from-blue-500/30 dark:to-purple-500/30 backdrop-blur-sm border border-blue-500/30 dark:border-purple-500/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-xl shadow-lg">
                      <Film className="w-4 h-4 mr-2 flex-shrink-0" />
                      <span>{userMovies.length} {t('community.films')}</span>
                    </div>
                  </div>
                </div>
              </div>
          
              <div className="relative z-10 flex flex-wrap gap-2 justify-end">
                <Link
                  to="/oracle"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                  <Eye className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('nav.oracle')}</span>
                </Link>

                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                  <Edit className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('common.edit')}</span>
                </button>

                <Link
                  to="/lists"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                  <ListPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('lists.title')}</span>
                </Link>

                <Link
                  to="/add-movies"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('library.addMovies')}</span>
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={itemVariants}>
            <RatingBox
              title={alternateNames['unrated'] || t('library.watchList')}
              movies={moviesByRating.unrated}
              rating={null}
              onRate={handleRate}
              onDelete={handleDelete}
              isNotRated
              className=""
            />
          </motion.div>
          
          {[...Array(11)].map((_, i) => {
            const rating = 10 - i;
            return (
              <motion.div key={rating} variants={itemVariants}>
                <RatingBox
                  key={rating}
                  title={alternateNames[rating] || t('library.rating', { value: rating })}
                  movies={moviesByRating[rating] || []}
                  rating={rating}
                  onRate={handleRate}
                  onDelete={handleDelete}
                  className=""
                />
              </motion.div>
            );
          })}
        </motion.div>

        <LibraryEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onReset={() => {
            setUserMovies([]);
            setAlternateNames({});
          }}
          rating={selectedRating}
          alternateNames={alternateNames}
          onAlternateNameChange={handleAlternateNameChange}
        />
      </motion.div>
    </div>
  );
}