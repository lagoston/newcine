import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';

interface AllMoviesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  movies: Movie[];
  rating: number | null;
  isOtherUserProfile?: boolean;
  onAddToLibrary?: () => void;
}

const AllMoviesModal: React.FC<AllMoviesModalProps> = ({
  isOpen,
  onClose,
  title,
  movies,
  rating,
  isOtherUserProfile = false,
  onAddToLibrary,
}) => {
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  if (!isOpen) return null;

  const handleMovieClick = (movie: Movie) => {
    setSelectedMovie(movie);
  };

  const handleCloseDetails = () => {
    setSelectedMovie(null);
  };

  return (
    <>
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center">
          {rating !== null && (
            <span className="w-8 h-8 flex items-center justify-center bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-full mr-3 font-bold">
              {rating}
            </span>
          )}
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
          <span className="ml-3 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
            {movies.length} {movies.length === 1 ? 'movie' : 'movies'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="w-6 h-6" />
        </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
          {movies.map((movie) => (
            <div
              key={movie.id}
              className="bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => handleMovieClick(movie)}
            >
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
                      <div className="flex items-center text-white">
                        <span className="text-[10px] sm:text-xs font-medium">{movie.userRating}</span>
                        <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400 fill-current ml-0.5" />
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

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    {selectedMovie && (
      <MovieDetailsModal
        movie={selectedMovie}
        isOpen={true}
        onClose={handleCloseDetails}
        isOtherUserProfile={isOtherUserProfile}
        onAddToLibrary={onAddToLibrary}
      />
    )}
    </>
  );
};

export default AllMoviesModal;