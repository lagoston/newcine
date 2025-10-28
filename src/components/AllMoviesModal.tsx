import React, { useState, useEffect } from 'react';
import { X, Star, ArrowLeft, Film, Clock, Calendar, User, AlertCircle, Loader2 } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';

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
  const { session } = useAuth();
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [isDetailsView, setIsDetailsView] = useState(false);
  const [adding, setAdding] = useState(false);
  const [isInLibrary, setIsInLibrary] = useState(false);

  if (!isOpen) return null;

  const handleMovieClick = (movie: Movie) => {
    setSelectedMovie(movie);
    setIsDetailsView(true);
    checkIfInLibrary(movie.id);
  };

  const handleBackToGrid = () => {
    setIsDetailsView(false);
    setSelectedMovie(null);
  };

  const checkIfInLibrary = async (movieId: number) => {
    if (!session?.user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('user_movies')
        .select('id')
        .eq('user_id', session?.user?.id)
        .eq('movie_id', movieId)
        .maybeSingle();

      if (error) {
        console.warn('Error checking library:', error);
        return;
      }
      
      setIsInLibrary(data !== null);
    } catch (error) {
      console.error('Error checking library:', error);
    }
  };

  const handleAddToLibrary = async () => {
    if (!session?.user?.id || adding || !selectedMovie) return;

    try {
      setAdding(true);

      // First, ensure movie details are stored
      const { error: movieError } = await supabase
        .from('movies')
        .upsert({
          id: selectedMovie.id,
          title: selectedMovie.title,
          release_date: selectedMovie.release_date,
          genres: selectedMovie.genres?.map(g => g.name),
          director: selectedMovie.credits?.crew?.find(person => person.job === 'Director')?.name
        });

      if (movieError) throw movieError;

      // Then add to user's library
      const { error: libraryError } = await supabase
        .from('user_movies')
        .insert({
          movie_id: selectedMovie.id,
          user_id: session.user.id,
        });

      if (libraryError) throw libraryError;

      setIsInLibrary(true);
      toast.success('Movie added to library');
      if (onAddToLibrary) {
        onAddToLibrary();
      }
    } catch (error) {
      console.error('Error adding movie:', error);
      toast.error('Failed to add movie to library');
    } finally {
      setAdding(false);
    }
  };

  const renderGridView = () => (
    <>
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
    </>
  );

  const renderDetailsView = () => {
    if (!selectedMovie) return null;

    const director = selectedMovie.credits?.crew?.find(person => person.job === 'Director')?.name || 'Unknown';
    const hasStreamingProviders = selectedMovie.watchProviders?.flatrate && selectedMovie.watchProviders.flatrate.length > 0;
    const year = new Date(selectedMovie.release_date).getFullYear();
    const cast = selectedMovie.credits?.cast?.slice(0, 3) || [];
    const runtime = selectedMovie.runtime 
      ? `${Math.floor(selectedMovie.runtime / 60)}h ${selectedMovie.runtime % 60}m` 
      : 'Unknown';
      
    // Get content rating information
    const contentRating = selectedMovie.content_ratings && selectedMovie.content_ratings.length > 0
      ? selectedMovie.content_ratings[0]
      : null;

    return (
      <>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <button
              onClick={handleBackToGrid}
              className="mr-3 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
              {selectedMovie.title}
              <span className="text-sm sm:text-base font-normal text-gray-500 dark:text-gray-400 ml-2">
                ({year})
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
              <img
                src={`https://image.tmdb.org/t/p/w500${selectedMovie.poster_path}`}
                alt={selectedMovie.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image';
                }}
              />
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center">
                  <Star className="w-5 h-5 text-yellow-500 fill-current mr-1" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {selectedMovie.vote_average.toFixed(1)}
                  </span>
                </div>
                
                {selectedMovie.userRating !== undefined && selectedMovie.userRating !== null && (
                  <div className="flex items-center px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-md">
                    <span className="font-medium text-yellow-700 dark:text-yellow-400">
                      {isOtherUserProfile ? "Friend's rating:" : "Your rating:"} {selectedMovie.userRating}/10
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-3">
                {selectedMovie.genres?.map(genre => (
                  <span key={genre.id} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300">
                    {genre.name}
                  </span>
                ))}
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Synopsis
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {selectedMovie.overview || "No synopsis available."}
                </p>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-center mb-2">
                    <Calendar className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Year</div>
                    <div className="font-medium text-gray-900 dark:text-white">{year}</div>
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-center mb-2">
                    <Clock className="w-5 h-5 text-green-500" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Runtime</div>
                    <div className="font-medium text-gray-900 dark:text-white">{runtime}</div>
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-center mb-2">
                    <User className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Director</div>
                    <div className="font-medium text-gray-900 dark:text-white">{director}</div>
                  </div>
                </div>
              </div>
              
              {cast.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Cast
                  </h3>
                  <div className="space-y-2">
                    {cast.map((actor) => (
                      <div key={actor.id} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{actor.character}</span>
                        <span className="text-sm text-gray-900 dark:text-white">{actor.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasStreamingProviders && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Watch on
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {selectedMovie.watchProviders.flatrate.map((provider) => (
                      <div
                        key={provider.provider_id}
                        className="relative group"
                      >
                        <img
                          src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                          alt={provider.provider_name}
                          className="h-10 w-10 rounded-lg object-contain"
                        />
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {provider.provider_name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {contentRating && (
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Content Rating
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 rounded-md">
                      <span className="font-medium text-red-700 dark:text-red-400">
                        {contentRating.certification}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      {contentRating.meaning}
                    </div>
                  </div>
                </div>
              )}

              {session?.user && !isInLibrary && (
                <button
                  onClick={handleAddToLibrary}
                  disabled={adding}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {adding ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Adding to library...
                    </>
                  ) : (
                    'Add to Library'
                  )}
                </button>
              )}

              {isInLibrary && (
                <div className="px-4 py-2 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-center font-medium">
                  ✓ In Library
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {isDetailsView ? renderDetailsView() : renderGridView()}
      </div>
    </div>
  );
};

export default AllMoviesModal;