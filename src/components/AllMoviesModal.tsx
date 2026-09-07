import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Dices, Loader2 } from 'lucide-react';
import { Movie, getMovieDetails, getTvProgressBatch, getTvProgressBatchForProfile, TvProgress } from '../lib/tmdb';
import { useAuth } from '../lib/auth';
import { useTranslation } from 'react-i18next';
import MovieDetailsModal from './MovieDetailsModal';

interface AllMoviesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  movies: Movie[];
  rating: number | null;
  isOtherUserProfile?: boolean;
  profileUserId?: string;
  onAddToLibrary?: () => void;
  // Tema de cor opcional pro destaque do modal (botão "Filme Aleatório"),
  // usado pra diferenciar visualmente carrosséis específicos da Home
  // (dourado pro "Melhores do Ano", roxo pro "Melhores dos Amigos") do
  // azul padrão usado nos demais.
  theme?: 'gold' | 'purple';
}

const getThemeButtonClasses = (theme?: 'gold' | 'purple'): string => {
  if (theme === 'gold') return 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600';
  if (theme === 'purple') return 'bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-700 hover:to-fuchsia-700';
  return 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700';
};

// Mesma faixa de cores usada no cabeçalho das rating boxes e no slider de
// avaliação — antes, tanto o círculo do cabeçalho quanto a nota de cada
// filme na grade ficavam sempre amarelos, sem refletir a nota real
// (vermelho pra baixas, verde pras boas, holográfico/rosa pra 10).
const getRatingCircleClasses = (rating: number): string => {
  if (rating === 10) return 'bg-pink-500/15 text-pink-600 dark:bg-pink-500/20 dark:text-pink-300';
  if (rating >= 7) return 'bg-green-500/15 text-green-700 dark:bg-green-500/20 dark:text-green-300';
  if (rating >= 4) return 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
  if (rating >= 1) return 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-300';
  return 'bg-gray-500/15 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300';
};

const getRatingTextClasses = (rating: number): string => {
  if (rating === 10) return 'text-pink-400';
  if (rating >= 7) return 'text-green-400';
  if (rating >= 4) return 'text-amber-400';
  if (rating >= 1) return 'text-red-400';
  return 'text-gray-300';
};

const AllMoviesModal: React.FC<AllMoviesModalProps> = ({
  isOpen,
  onClose,
  title,
  movies,
  rating,
  isOtherUserProfile = false,
  profileUserId,
  onAddToLibrary,
  theme,
}) => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  // Mesma lógica de progresso já usada no RatingBox — esse modal
  // ("Ver Todos") tinha ficado com a versão antiga: roxo fixo só por
  // media_type === 'tv', sem nenhuma relação com progresso real de
  // episódios assistidos.
  const [tvProgressData, setTvProgressData] = useState<Map<number, TvProgress>>(new Map());

  const refetchTvProgress = useCallback(() => {
    const tvIds = movies.filter((m) => m.media_type === 'tv').map((m) => m.id);
    if (tvIds.length === 0 || !session?.user?.id) {
      setTvProgressData(new Map());
      return;
    }
    const fetchFn = isOtherUserProfile && profileUserId
      ? getTvProgressBatchForProfile(session.user.id, profileUserId, tvIds)
      : getTvProgressBatch(session.user.id, tvIds);
    fetchFn.then((data) => {
      setTvProgressData(data);
    });
  }, [movies, session?.user?.id, isOtherUserProfile, profileUserId]);

  useEffect(() => {
    refetchTvProgress();
  }, [refetchTvProgress]);

  const getTvProgress = (movie: Movie) => {
    const progress = tvProgressData.get(movie.id);
    const aired = progress?.airedCount || 0;
    const watched = progress?.watchedCount || 0;
    const percent = aired > 0 ? Math.min(100, (watched / aired) * 100) : 0;
    const stillAiring = movie.in_production === true || movie.status === 'Returning Series';

    let bgTint = 'bg-blue-50/70 dark:bg-blue-900/20';
    let barColor = 'from-blue-400 to-blue-500';
    if (percent >= 100) {
      if (stillAiring) {
        bgTint = 'bg-purple-50/70 dark:bg-purple-900/20';
        barColor = 'from-purple-400 to-purple-500';
      } else {
        bgTint = 'bg-pink-50/70 dark:bg-pink-900/20';
        barColor = 'from-pink-400 to-pink-500';
      }
    }

    return { percent, bgTint, barColor };
  };

  // Bloqueia a rolagem da página por trás enquanto o modal está aberto —
  // faltava completamente antes, então era possível rolar o fundo da
  // página junto com o conteúdo do modal, uma experiência instável. Mesmo
  // padrão já usado no CustomizeModal e no MovieDetailsModal.
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  const handleMovieClick = async (movie: Movie) => {
    try {
      setLoadingDetails(true);
      const mediaType = movie.media_type || 'movie';
      const details = await getMovieDetails(movie.id, mediaType);
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedMovie(null);
  };

  const handleRandomMovie = async () => {
    if (movies.length === 0) return;
    const randomIndex = Math.floor(Math.random() * movies.length);
    await handleMovieClick(movies[randomIndex]);
  };

  // Renderizado via Portal, direto no <body> — mesma lição aprendida com
  // o MovieDetailsModal: sem isso, abrir esse modal de dentro de uma
  // página cujo container raiz é um motion.div prende ele num contexto de
  // empilhamento isolado, ficando atrás da navbar mesmo com z-index alto.
  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-7xl w-full max-h-[calc(100dvh-env(safe-area-inset-top)-3rem)] flex flex-col overflow-hidden"
            >
              <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center min-w-0">
                  {rating !== null && (
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full mr-3 font-bold flex-shrink-0 ${getRatingCircleClasses(rating)}`}>
                      {rating}
                    </span>
                  )}
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white truncate">
                    {title}
                  </h2>
                  <span className="ml-3 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full flex-shrink-0 whitespace-nowrap">
                    {movies.length} {movies.length === 1 ? t('community.film') : t('community.films')}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
                  {movies.map((movie) => (
                    <div
                      key={movie.id}
                      className={`relative rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer ${
                        loadingDetails ? 'pointer-events-none opacity-70' : ''
                      } ${
                        movie.media_type === 'tv'
                          ? getTvProgress(movie).bgTint
                          : 'bg-gray-50 dark:bg-gray-700/50'
                      }`}
                      onClick={() => handleMovieClick(movie)}
                    >
                      {movie.media_type === 'tv' && (
                        <div className="absolute top-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10 overflow-hidden z-10">
                          <motion.div
                            className={`h-full bg-gradient-to-r ${getTvProgress(movie).barColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${getTvProgress(movie).percent}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                          />
                        </div>
                      )}
                      <div className="relative aspect-[2/3]">
                        <img
                          src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                          alt={movie.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = 'https://via.placeholder.com/300x450?text=No+Image';
                          }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center text-white">
                              <Star className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500 fill-current mr-0.5 sm:mr-1" />
                              <span className="text-[10px] sm:text-xs">{movie.vote_average.toFixed(1)}</span>
                            </div>
                            {movie.userRating !== undefined && movie.userRating !== null && (
                              <div className="flex items-center">
                                <span className={`text-[10px] sm:text-xs font-bold ${getRatingTextClasses(movie.userRating)}`}>
                                  {movie.userRating}
                                </span>
                                <Star className={`w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current ml-0.5 ${getRatingTextClasses(movie.userRating)}`} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="p-1 sm:p-2">
                        <h3 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white line-clamp-1 sm:line-clamp-2 h-4 sm:h-10">
                          {movie.title}
                        </h3>
                        <p className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1">
                          {new Date(movie.release_date).getFullYear()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 flex justify-center">
                <button
                  onClick={handleRandomMovie}
                  disabled={movies.length === 0 || loadingDetails}
                  className={`flex items-center gap-2 px-6 py-3 ${getThemeButtonClasses(theme)} text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95`}
                  title={t('library.randomMovie')}
                >
                  {loadingDetails ? <Loader2 className="w-5 h-5 animate-spin" /> : <Dices className="w-5 h-5" />}
                  <span className="font-semibold">{t('library.randomMovie')}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={handleCloseDetails}
          isOtherUserProfile={isOtherUserProfile}
          profileUserId={profileUserId}
          onAddToLibrary={onAddToLibrary}
          onEpisodeToggle={refetchTvProgress}
        />
      )}
    </>,
    document.body
  );
};

export default AllMoviesModal;