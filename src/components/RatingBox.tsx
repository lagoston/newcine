import React, { useState, useRef, useEffect } from 'react';
import { MoreVertical, Trash2, Star, Eye, ListPlus, XCircle, ArrowUpDown, Film } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import ConfirmationModal from './ConfirmationModal';
import MovieDetailsModal from './MovieDetailsModal';
import AllMoviesModal from './AllMoviesModal';
import AddToListMenu from './AddToListMenu';
import RateMenuSheet from './RateMenuSheet';
import PredictMenuSheet from './PredictMenuSheet';
import { useTranslation } from 'react-i18next';
import OptimizedPoster from './OptimizedPoster';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';

interface RatingBoxProps {
  title: string;
  movies: Movie[];
  rating: number | null;
  onRate?: (movieId: number, rating: number | null) => void;
  onDelete?: (movieId: number) => void;
  onRemoveFromList?: (movieId: number) => void;
  isNotRated?: boolean;
  className?: string;
  isOtherUserProfile?: boolean;
  onAddToLibrary?: () => void;
  isPersonalList?: boolean;
  enableDragDrop?: () => void;
  chromaBoxEnabled?: boolean;
  isOneGrid?: boolean;
  isOneGridTv?: boolean;
}

const RatingBox: React.FC<RatingBoxProps> = ({
  title,
  movies,
  rating,
  onRate,
  onDelete,
  onRemoveFromList,
  isNotRated,
  className,
  isOtherUserProfile = false,
  onAddToLibrary,
  isPersonalList = false,
  enableDragDrop,
  chromaBoxEnabled = false,
  isOneGrid = false,
  isOneGridTv = false,
}) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language === 'pt';
  const [deleteMovieId, setDeleteMovieId] = useState<number | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [rateMenuMovie, setRateMenuMovie] = useState<Movie | null>(null);
  const [predictMenuMovie, setPredictMenuMovie] = useState<Movie | null>(null);
  const [showAllMovies, setShowAllMovies] = useState(false);
  const [showAddToList, setShowAddToList] = useState<{movieId: number, title: string} | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [mobileMenuMovie, setMobileMenuMovie] = useState<Movie | null>(null);
  const [cachedPredictionIds, setCachedPredictionIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isNotRated || movies.length === 0) return;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) return;
      const movieIds = movies.map(m => m.id).filter(Boolean);
      if (movieIds.length === 0) return;
      const { data } = await supabase
        .from('prediction_cache')
        .select('movie_id')
        .eq('user_id', userId)
        .in('movie_id', movieIds)
        .gte('expires_at', new Date().toISOString());
      if (data) {
        setCachedPredictionIds(new Set(data.map(r => r.movie_id)));
      }
    })();
  }, [isNotRated, movies]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

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

  if (movies.length === 0) return null;

  // Check if box contains any TV series
  const hasTvSeries = movies.some(m => m.media_type === 'tv');

  // Chroma Box Effects
  const getChromaBoxClasses = () => {
    if (isOneGrid && isOneGridTv && chromaBoxEnabled) {
      return 'chroma-box-blue';
    }
    if (!chromaBoxEnabled || rating === null) return '';

    if (rating === 10) {
      return 'chroma-box-gold';
    } else if (rating >= 7 && rating <= 9) {
      return 'chroma-box-green';
    } else if (rating >= 4 && rating <= 6) {
      return 'chroma-box-yellow';
    } else if (rating >= 1 && rating <= 3) {
      return 'chroma-box-red';
    } else if (rating === 0) {
      return 'chroma-box-glitch';
    }
    return '';
  };

  const chromaClass = getChromaBoxClasses();

  return (
    <>
    <div className={`relative mb-12 p-6 sm:p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl transition-all duration-300 ${chromaClass}`}>
      {/* Padrão decorativo de fundo - com overflow hidden */}
      <div className="absolute inset-0 opacity-30 dark:opacity-20 overflow-hidden rounded-3xl pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-pink-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Grid pattern decorativo */}
      <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none rounded-3xl overflow-hidden" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }}></div>

      {/* Header da seção */}
      <div className="relative z-10 flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-1.5 rounded-full ${
            isOneGridTv
              ? 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-700'
              : hasTvSeries
              ? 'bg-gradient-to-b from-purple-500 via-purple-600 to-purple-700'
              : 'bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500'
          }`}></div>
          <div>
            <h3 className={`text-2xl sm:text-3xl font-bold text-transparent bg-clip-text pb-1 leading-relaxed flex items-center ${
              isOneGridTv
                ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 dark:from-blue-400 dark:via-blue-300 dark:to-blue-400'
                : hasTvSeries
                ? 'bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 dark:from-purple-400 dark:via-purple-300 dark:to-purple-400'
                : 'bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400'
            }`}>
              {rating !== null && !isOneGrid && (
                <Star className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-500 fill-yellow-500 mr-2" />
              )}
              <span>
                {isOneGrid ? title : (rating !== null ? rating : title)}
              </span>
            </h3>
            <div className={`mt-1 inline-flex items-center text-xs font-semibold backdrop-blur-sm px-3 py-1 rounded-lg ${
              isOneGridTv
                ? 'bg-gradient-to-r from-blue-500/20 to-blue-600/20 dark:from-blue-500/30 dark:to-blue-600/30 border border-blue-500/30 text-blue-700 dark:text-blue-300'
                : hasTvSeries
                ? 'bg-gradient-to-r from-purple-500/20 to-purple-600/20 dark:from-purple-500/30 dark:to-purple-600/30 border border-purple-500/30 text-purple-700 dark:text-purple-300'
                : 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 dark:from-blue-500/30 dark:to-purple-500/30 border border-blue-500/30 dark:border-purple-500/30 text-blue-700 dark:text-blue-300'
            }`}>
              <Film className="w-3 h-3 mr-1.5" />
              {movies.length} {movies.length === 1 ? t('community.film') : t('community.films')}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowAllMovies(true)}
          className="flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl transition-all duration-300 whitespace-nowrap flex-shrink-0 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
        >
          <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">{t('common.view_all')}</span>
          <span className="sm:hidden">Ver</span>
        </button>
      </div>

      {/* Carrossel unificado - scroll nativo suave em todos os dispositivos */}
      <div
        ref={scrollRef}
        className="relative z-10 overflow-x-auto py-4 pb-2 cursor-grab select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <div className="flex gap-3">
          {movies.map((movie) => (
            <div
              key={movie.id}
              className="relative group flex-shrink-0 rounded-t-xl"
              style={{ width: '140px' }}
            >
              {!isOtherUserProfile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileMenuMovie(movie);
                  }}
                  className="absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center bg-black/60 hover:bg-black/80 active:bg-black/90 rounded-full text-white transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              )}
              <div className="absolute top-1 left-1 z-10 bg-black/40 rounded-md px-1.5 py-0.5 flex items-center">
                <Star className="w-3 h-3 text-blue-400 fill-current" />
                <span className="text-white text-[10px] ml-1">{movie.vote_average.toFixed(1)}</span>
              </div>
              <motion.button
                onClick={() => { if (dragDistanceRef.current > 5) return; setSelectedMovie(movie); }}
                className="relative w-full aspect-[2/3] block rounded-t-xl overflow-hidden shadow-lg"
                whileHover={{ scale: 1.04, y: -5 }}
                whileTap={{ scale: 0.97 }}
                style={{ willChange: 'transform' }}
              >
                <OptimizedPoster
                  src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                  alt={movie.title}
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
                />
                <div className="absolute inset-0 rounded-t-xl bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <h3 className="text-white text-xs font-semibold line-clamp-2 drop-shadow">
                      {movie.title}
                    </h3>
                    <p className="text-gray-300 text-[10px] mt-0.5">
                      {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                    </p>
                  </div>
                </div>
              </motion.button>
              <div className={`pt-1.5 px-1 pb-1.5 rounded-b-xl ${
                movie.media_type === 'tv'
                  ? 'bg-blue-100 dark:bg-blue-900/80'
                  : 'bg-gray-100 dark:bg-gray-800/95'
              }`}>
                <h4 className="text-xs font-medium text-gray-900 dark:text-white line-clamp-1">
                  {movie.title}
                </h4>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">
                    {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                  </p>
                  {!isNotRated && movie.userRating !== null && (
                    <div className="bg-black/30 dark:bg-black/50 rounded px-1 py-0.5 flex items-center">
                      <Star className="w-3 h-3 text-yellow-400 fill-current" />
                      <span className="text-white text-[10px] ml-0.5">{movie.userRating}</span>
                    </div>
                  )}
                </div>
                {isNotRated && onRate && (
                  <div className="mt-1.5 flex flex-col gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRateMenuMovie(movie);
                      }}
                      className="w-full flex items-center justify-center gap-1 px-1.5 py-1 bg-yellow-500 hover:bg-yellow-400 active:bg-yellow-600 text-white text-[10px] font-semibold rounded-lg transition-all duration-150"
                    >
                      {t('movies.rating')}
                      <Star className="w-2.5 h-2.5 fill-current" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPredictMenuMovie(movie);
                      }}
                      className={`w-full flex items-center justify-center gap-1 px-1.5 py-1 text-white text-[10px] font-semibold rounded-lg transition-all duration-150 ${
                        cachedPredictionIds.has(movie.id)
                          ? 'bg-purple-900 hover:bg-purple-800 active:bg-[#2e0a5e]'
                          : 'bg-purple-700 hover:bg-purple-600 active:bg-purple-800'
                      }`}
                    >
                      {isPt ? 'Prever' : 'Predict'}
                      <Star className="w-2.5 h-2.5 fill-current" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Modals - Fora do container para evitar overflow */}
    <ConfirmationModal
      isOpen={deleteMovieId !== null}
      onClose={() => setDeleteMovieId(null)}
      onConfirm={() => {
        if (deleteMovieId && onDelete) {
          onDelete(deleteMovieId);
        }
      }}
      title={t('common.delete')}
      message={t('library.movieRemoved')}
    />

    {selectedMovie && (
      <MovieDetailsModal
        movie={selectedMovie}
        isOpen={true}
        onClose={() => setSelectedMovie(null)}
        isOtherUserProfile={isOtherUserProfile}
        onAddToLibrary={onAddToLibrary}
      />
    )}

    <AllMoviesModal
      isOpen={showAllMovies}
      onClose={() => setShowAllMovies(false)}
      title={rating !== null ? t('library.rating', { value: rating }) : title}
      movies={movies}
      rating={rating}
      isOtherUserProfile={isOtherUserProfile}
      onAddToLibrary={onAddToLibrary}
    />

    {showAddToList && (
      <AddToListMenu
        movieId={showAddToList.movieId}
        movieTitle={showAddToList.title}
        isOpen={true}
        onClose={() => setShowAddToList(null)}
        position={menuPosition}
      />
    )}

    {rateMenuMovie && onRate && (
      <RateMenuSheet
        movieTitle={rateMenuMovie.title}
        isOpen={true}
        onClose={() => setRateMenuMovie(null)}
        onRate={async (rating) => {
          onRate(rateMenuMovie.id, rating);
        }}
      />
    )}

    {predictMenuMovie && (
      <PredictMenuSheet
        movieTitle={predictMenuMovie.title}
        movieId={predictMenuMovie.id}
        isOpen={true}
        onClose={() => setPredictMenuMovie(null)}
      />
    )}

    {/* MOBILE BOTTOM SHEET MENU */}
    {mobileMenuMovie && (
      <>
        <div
          className="fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileMenuMovie(null)}
        />
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl z-50 animate-slide-up">
          <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-4" />

          <div className="px-4 pb-6">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <img
                src={`https://image.tmdb.org/t/p/w92${mobileMenuMovie.poster_path}`}
                alt={mobileMenuMovie.title}
                className="w-12 h-18 object-cover rounded"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                  {mobileMenuMovie.title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {mobileMenuMovie.release_date?.split('-')[0] || 'N/A'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {isPersonalList ? (
                <>
                  <button
                    onClick={() => {
                      if (onRemoveFromList) {
                        onRemoveFromList(mobileMenuMovie.id);
                      }
                      setMobileMenuMovie(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg active:bg-gray-200 dark:active:bg-gray-600"
                  >
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">{t('common.remove')}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (enableDragDrop) {
                        enableDragDrop();
                      }
                      setMobileMenuMovie(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg active:bg-gray-200 dark:active:bg-gray-600"
                  >
                    <ArrowUpDown className="w-5 h-5" />
                    <span className="font-medium">{t('lists.reorder')}</span>
                  </button>
                </>
              ) : (
                <>
                  {(rating !== null || isOneGrid) && onRate && (
                    <button
                      onClick={() => {
                        setRateMenuMovie(mobileMenuMovie);
                        setMobileMenuMovie(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg active:bg-gray-200 dark:active:bg-gray-600"
                    >
                      <Star className="w-5 h-5" />
                      <span className="font-medium">{t('library.changeRating')}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const ww = window.innerWidth;
                      const wh = window.innerHeight;
                      setMenuPosition({
                        top: Math.max(window.scrollY + (wh / 2) - 150, window.scrollY + 20),
                        left: (ww / 2) - 128
                      });
                      setShowAddToList({ movieId: mobileMenuMovie.id, title: mobileMenuMovie.title });
                      setMobileMenuMovie(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg active:bg-gray-200 dark:active:bg-gray-600"
                  >
                    <ListPlus className="w-5 h-5" />
                    <span className="font-medium">{t('lists.title', { defaultValue: 'List' })}</span>
                  </button>
                  <button
                    onClick={() => {
                      setDeleteMovieId(mobileMenuMovie.id);
                      setMobileMenuMovie(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg active:bg-gray-200 dark:active:bg-gray-600"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span className="font-medium">{t('common.delete')}</span>
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => setMobileMenuMovie(null)}
              className="w-full mt-4 px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
          </div>
        </div>
      </>
    )}
    </>
  );
};

export default React.memo(RatingBox);