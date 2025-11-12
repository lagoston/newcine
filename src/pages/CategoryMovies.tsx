import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Loader2 } from 'lucide-react';
import { Movie, getTrending, getComingSoon, getTopRatedGems, getHiddenIndies, getMovieDetails } from '../lib/tmdb';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const CategoryMovies = () => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const categoryConfig: Record<string, { title: string; emoji: string; fetch: () => Promise<Movie[]> }> = {
    trending: {
      title: t('home.popularNow'),
      emoji: '🔥',
      fetch: getTrending
    },
    'coming-soon': {
      title: t('home.comingSoon'),
      emoji: '🎬',
      fetch: getComingSoon
    },
    'top-rated': {
      title: t('home.topRated'),
      emoji: '⭐',
      fetch: getTopRatedGems
    },
    indie: {
      title: t('home.hiddenGems'),
      emoji: '💎',
      fetch: getHiddenIndies
    },
    personalized: {
      title: t('home.personalizedForYou'),
      emoji: '🎬',
      fetch: getTopRatedGems
    }
  };

  useEffect(() => {
    if (category && categoryConfig[category]) {
      fetchMovies();
    } else {
      navigate('/');
    }
  }, [category]);

  const fetchMovies = async () => {
    if (!category || !categoryConfig[category]) return;

    try {
      setLoading(true);
      const data = await categoryConfig[category].fetch();
      setMovies(data);
    } catch (error) {
      console.error('Error fetching movies:', error);
      toast.error('Failed to load movies');
    } finally {
      setLoading(false);
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

  if (!category || !categoryConfig[category]) {
    return null;
  }

  const config = categoryConfig[category];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:from-gray-900 dark:via-blue-950/30 dark:to-purple-950/30 transition-all duration-500 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {t('common.back')}
          </button>

          <div className="flex items-center gap-4 mb-8">
            <span
              className="text-5xl"
              style={{
                fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"'
              }}
            >
              {config.emoji}
            </span>
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400">
              {config.title}
            </h1>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {movies.map((movie) => (
                <motion.div
                  key={movie.id}
                  className="relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group shadow-lg hover:shadow-2xl transition-all duration-200 border-2 border-transparent hover:border-blue-500/30"
                  onClick={() => handleMovieClick(movie)}
                  whileHover={{ scale: 1.05, y: -4 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <img
                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                    alt={movie.title}
                    className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300 ease-out"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image';
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-sm">
                    <div className="p-5">
                      <h3 className="text-white font-bold mb-2 line-clamp-2 text-lg">{movie.title}</h3>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-yellow-500/20 backdrop-blur-sm px-2 py-1 rounded-lg">
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          <span className="ml-1 text-white font-semibold text-sm">
                            {movie.vote_average.toFixed(1)}
                          </span>
                        </div>
                        {movie.release_date && (
                          <span className="text-white/80 text-sm">
                            {new Date(movie.release_date).getFullYear()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </div>
  );
};

export default CategoryMovies;
