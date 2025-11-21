import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, MoreVertical, Trash2, Star, Eye, ListPlus, XCircle, ArrowUpDown, Film } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import ConfirmationModal from './ConfirmationModal';
import MovieDetailsModal from './MovieDetailsModal';
import AllMoviesModal from './AllMoviesModal';
import AddToListMenu from './AddToListMenu';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode } from 'swiper/modules';
import { useTranslation } from 'react-i18next';
import 'swiper/css';
import OptimizedPoster from './OptimizedPoster';
import { motion } from 'framer-motion';

interface RatingBoxProps {
  title: string;
  movies: Movie[];
  rating: number | null;
  onRate?: (movieId: number, rating: number | null) => void;
  onDelete?: (movieId: number) => void;
  onRemoveFromList?: (movieId: number) => void; // New prop for removing from a list
  isNotRated?: boolean;
  className?: string;
  isOtherUserProfile?: boolean;
  onAddToLibrary?: () => void;
  isPersonalList?: boolean; // New prop to identify Personal List context
  enableDragDrop?: () => void; // New prop for enabling drag & drop
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
  isPersonalList = false, // Default to false
  enableDragDrop,
}) => {
  const { t } = useTranslation();
  const [deleteMovieId, setDeleteMovieId] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showAllMovies, setShowAllMovies] = useState(false);
  const [showAddToList, setShowAddToList] = useState<{movieId: number, title: string} | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [mobileMenuMovie, setMobileMenuMovie] = useState<Movie | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);

  // Desktop scroll states
  const [isDraggingDesktop, setIsDraggingDesktop] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dragDistanceRef = useRef(0);

  // Swiper mobile state
  const swiperMoved = useRef(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleListButtonClick = (e: React.MouseEvent, movieId: number, title: string) => {
    e.stopPropagation();

    // Calculate center position for the menu
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const menuWidth = 256; // Width of menu in pixels (matches w-64 class)

    const position = {
      top: Math.max(window.scrollY + (windowHeight / 2) - 150, window.scrollY + 20),
      left: (windowWidth / 2) - (menuWidth / 2)
    };

    setMenuPosition(position);
    setOpenMenuId(null);
    setShowAddToList({ movieId, title });
  };

  // Desktop drag handlers
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
    setSelectedMovie(movie);
  };

  if (movies.length === 0) return null;

  return (
    <>
    <div className="relative mb-12 p-6 sm:p-8 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl transition-all duration-300">
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
          <div className="h-12 w-1.5 bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 rounded-full"></div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 pb-1 leading-relaxed flex items-center">
              {rating !== null && (
                <Star className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-500 fill-yellow-500 mr-2" />
              )}
              <span>
                {rating !== null ? rating : title}
              </span>
            </h3>
            <div className="mt-1 inline-flex items-center text-xs font-semibold bg-gradient-to-r from-blue-500/20 to-purple-500/20 dark:from-blue-500/30 dark:to-purple-500/30 backdrop-blur-sm border border-blue-500/30 dark:border-purple-500/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-lg">
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

      {/* Container do carrossel - Desktop: Native Scroll / Mobile: Swiper */}
      <div className="relative z-10 overflow-hidden py-4">
        {/* MOBILE: Swiper */}
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
            touchStartPreventDefault={false}
            preventClicks={false}
            preventClicksPropagation={false}
            cssMode={false}
            breakpoints={{
              0: { slidesPerView: 2.4, spaceBetween: 12 },
              480: { slidesPerView: 3.2, spaceBetween: 16 },
              640: { slidesPerView: 4.1, spaceBetween: 16 },
              768: { slidesPerView: 5.1, spaceBetween: 20 }
            }}
            onTouchStart={() => {
              swiperMoved.current = false;
            }}
            onSliderMove={() => {
              swiperMoved.current = true;
            }}
            onTouchEnd={() => {
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
            className="pb-4"
          >
            {movies.map((movie, index) => (
              <SwiperSlide key={movie.id}>
              <div className="relative group h-full">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden h-full">
                  {!isOtherUserProfile && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMobileMenuMovie(movie);
                      }}
                      className="absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center bg-black/60 active:bg-black/80 rounded-full text-white"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  )}
                  <div className="absolute top-1 left-1 z-10 bg-black/40 rounded-md px-1.5 py-0.5 flex items-center">
                    <Star className="w-3.5 h-3.5 text-blue-400 fill-current" />
                    <span className="text-white text-xs ml-1">{movie.vote_average.toFixed(1)}</span>
                  </div>
                  <button
                    onClick={() => setSelectedMovie(movie)}
                    className="relative w-full aspect-[2/3] block"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                      alt={movie.title}
                      className="w-full h-full object-cover rounded-t-lg"
                      width={185}
                      height={278}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/185x278?text=No+Image';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-white text-sm font-medium line-clamp-1">
                          {movie.title}
                        </h3>
                        <p className="text-gray-300 text-xs">
                          {new Date(movie.release_date).getFullYear()}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="p-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                      {movie.title}
                    </h4>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {new Date(movie.release_date).getFullYear()}
                      </p>
                      {!isNotRated && movie.userRating !== null && (
                        <div className="bg-black/40 rounded-md px-1.5 py-0.5 flex items-center">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                          <span className="text-white text-xs ml-1">{movie.userRating}</span>
                        </div>
                      )}
                    </div>
                    {isNotRated && onRate && (
                      <select
                        onChange={(e) => {
                          e.stopPropagation();
                          onRate(movie.id, parseInt(e.target.value));
                        }}
                        className="mt-2 w-full text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white py-1"
                        defaultValue=""
                      >
                        <option value="" disabled>{t('movies.rating')}</option>
                        {[...Array(11)].map((_, i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
        </div>

        {/* DESKTOP: Native Scroll */}
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
              <div
                key={movie.id}
                className="relative group flex-shrink-0"
                style={{ width: '200px' }}
              >
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden h-full">
                  {!isOtherUserProfile && (
                    <div className="absolute top-1 right-1 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === movie.id ? null : movie.id);
                        }}
                        className="w-6 h-6 flex items-center justify-center bg-black/60 hover:bg-black/80 rounded-full text-white transition-all duration-200"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === movie.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
                        >
                          {isPersonalList ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onRemoveFromList) {
                                    onRemoveFromList(movie.id);
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                {t('common.remove')}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (enableDragDrop) {
                                    enableDragDrop();
                                  }
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                              >
                                <ArrowUpDown className="w-4 h-4 mr-2" />
                                {t('lists.reorder')}
                              </button>
                            </>
                          ) : (
                            <>
                              {rating !== null && onRate && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRate(movie.id, null);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                                >
                                  <Star className="w-4 h-4 mr-2" />
                                  {t('library.changeRating')}
                                </button>
                              )}
                              <button
                                onClick={(e) => handleListButtonClick(e, movie.id, movie.title)}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                              >
                                <ListPlus className="w-4 h-4 mr-2" />
                                {t('lists.title', { defaultValue: 'List' })}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteMovieId(movie.id);
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t('common.delete')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="absolute top-1 left-1 z-10 bg-black/40 rounded-md px-1.5 py-0.5 flex items-center">
                    <Star className="w-3.5 h-3.5 text-blue-400 fill-current" />
                    <span className="text-white text-xs ml-1">{movie.vote_average.toFixed(1)}</span>
                  </div>
                  <button
                    onClick={() => handleMovieClickDesktop(movie)}
                    className="relative w-full aspect-[2/3] block"
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                      alt={movie.title}
                      className="w-full h-full object-cover rounded-t-lg pointer-events-none"
                      width={185}
                      height={278}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = 'https://via.placeholder.com/185x278?text=No+Image';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg pointer-events-none">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-white text-sm font-medium line-clamp-1">
                          {movie.title}
                        </h3>
                        <p className="text-gray-300 text-xs">
                          {new Date(movie.release_date).getFullYear()}
                        </p>
                      </div>
                    </div>
                  </button>
                  <div className="p-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-1">
                      {movie.title}
                    </h4>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {new Date(movie.release_date).getFullYear()}
                      </p>
                      {!isNotRated && movie.userRating !== null && (
                        <div className="bg-black/40 rounded-md px-1.5 py-0.5 flex items-center">
                          <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                          <span className="text-white text-xs ml-1">{movie.userRating}</span>
                        </div>
                      )}
                    </div>
                    {isNotRated && onRate && (
                      <select
                        onChange={(e) => {
                          e.stopPropagation();
                          onRate(movie.id, parseInt(e.target.value));
                        }}
                        className="mt-2 w-full text-xs border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white py-1"
                        defaultValue=""
                      >
                        <option value="" disabled>{t('movies.rating')}</option>
                        {[...Array(11)].map((_, i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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

    {/* MOBILE BOTTOM SHEET MENU */}
    {mobileMenuMovie && (
      <>
        <div
          className="fixed inset-0 bg-black/50 z-50 md:hidden"
          onClick={() => setMobileMenuMovie(null)}
        />
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl z-50 md:hidden animate-slide-up">
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
                  {rating !== null && onRate && (
                    <button
                      onClick={() => {
                        onRate(mobileMenuMovie.id, null);
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

export default RatingBox;