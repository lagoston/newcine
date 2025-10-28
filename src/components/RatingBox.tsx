import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, MoreVertical, Trash2, Star, Eye, ListPlus, XCircle, ArrowUpDown } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import ConfirmationModal from './ConfirmationModal';
import MovieDetailsModal from './MovieDetailsModal';
import AllMoviesModal from './AllMoviesModal';
import AddToListMenu from './AddToListMenu';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useTranslation } from 'react-i18next';
import 'swiper/css';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const listButtonRef = useRef<HTMLButtonElement>(null);

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

  if (movies.length === 0) return null;

  return (
    <div
      className={`w-full p-4 rounded-lg bg-white dark:bg-gray-800 mb-6 transition-all duration-300 ${
        isNotRated
          ? 'border-2 border-orange-200 dark:border-orange-800'
          : className || ''
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            {rating !== null && (
              <span className="text-yellow-500 mr-2">★</span>
            )}
            <span className={rating !== null ? 'text-yellow-500' : ''}>
              {rating !== null ? rating : title}
            </span>
          </h3>
          <span className="ml-3 px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
            {movies.length} {movies.length === 1 ? t('community.film') : t('community.films')}
          </span>
        </div>
        <button
          onClick={() => setShowAllMovies(true)}
          className="px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors flex items-center"
        >
          <Eye className="w-3.5 h-3.5 mr-1" />
          {t('common.view_all')}
        </button>
      </div>

      <div className="overflow-hidden">
        <Swiper
          slidesPerView={1.2}
          spaceBetween={16}
          breakpoints={{
            0: { slidesPerView: 2.4, spaceBetween: 12 },
            480: { slidesPerView: 3.2, spaceBetween: 16 },
            640: { slidesPerView: 4.1, spaceBetween: 16 },
            768: { slidesPerView: 5.1, spaceBetween: 20 },
            1024: { slidesPerView: 6.1, spaceBetween: 20 }
          }}
          className="pb-4"
        >
          {movies.map((movie) => (
            <SwiperSlide key={movie.id}>
              <div className="relative group h-full">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden h-full">
                  {!isOtherUserProfile && (
                    <div className="absolute top-1 right-1 z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === movie.id ? null : movie.id);
                        }}
                        className="w-6 h-6 flex items-center justify-center bg-black/40 hover:bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all duration-200"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === movie.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
                        >
                          {/* Show different options based on context */}
                          {isPersonalList ? (
                            // Personal List specific options
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
                            // Standard Library options
                            <>
                              {/* Show "Remove" option only if NOT in WatchList */}
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
                                  {t('common.remove')}
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

      {/* Modals */}
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
    </div>
  );
};

export default RatingBox;