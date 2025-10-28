import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Star } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface EditListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  listId: string;
  listName: string;
  currentMovies: Movie[];
}

export default function EditListModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  listId,
  listName: initialListName,
  currentMovies 
}: EditListModalProps) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [listName, setListName] = useState(initialListName);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovies, setSelectedMovies] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allLibraryMovies, setAllLibraryMovies] = useState<Movie[]>([]);
  const [recentMovies, setRecentMovies] = useState<Movie[]>([]);

  // Initialize selected movies from current movies
  useEffect(() => {
    if (isOpen && currentMovies) {
      const currentMovieIds = new Set(currentMovies.map(movie => movie.id));
      setSelectedMovies(currentMovieIds);
    }
  }, [isOpen, currentMovies]);

  // Fetch all user movies when modal opens
  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchUserMovies();
    }
  }, [isOpen, session?.user?.id]);

  const fetchUserMovies = async () => {
    try {
      setLoading(true);
      console.log('Fetching user movies for list editing');
      
      // First, get the user's movie IDs and ratings
      const { data: userMovies, error: userMoviesError } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', session?.user?.id)
        .order('created_at', { ascending: false });

      if (userMoviesError) throw userMoviesError;

      if (!userMovies || userMovies.length === 0) {
        setAllLibraryMovies([]);
        setRecentMovies([]);
        setLoading(false);
        return;
      }

      console.log(`Found ${userMovies.length} movies in user library`);

      // Then get the movie details for each movie ID
      const movieDetailsPromises = userMovies.map(async (um) => {
        try {
          // First try to get from the movies table
          const { data: movieData, error: movieError } = await supabase
            .from('movies')
            .select('*')
            .eq('id', um.movie_id)
            .single();

          if (movieError) throw movieError;

          console.log(`Successfully retrieved movie ${movieData.id} from database`);
          
          // Return movie with relevant data
          return {
            id: movieData.id,
            title: movieData.title,
            release_date: movieData.release_date || '',
            poster_path: null, // Will be loaded from TMDB directly in the image tag
            vote_average: 0,
            overview: '',
            userRating: um.rating,
            genres: movieData.genres || []
          };
        } catch (error) {
          console.error(`Error fetching details for movie ${um.movie_id}:`, error);
          
          // If we can't get from the database, return basic info
          return {
            id: um.movie_id,
            title: `Movie ${um.movie_id}`,
            release_date: '',
            poster_path: null,
            vote_average: 0,
            overview: '',
            userRating: um.rating
          };
        }
      });

      const movieDetails = await Promise.all(movieDetailsPromises);
      
      // Filter out any null results
      const validMovies = movieDetails.filter(movie => movie !== null);
      
      console.log(`Successfully processed ${validMovies.length} movies for list editing`);
      
      setAllLibraryMovies(validMovies);
      setRecentMovies(validMovies.slice(0, 20)); // Get 20 most recent movies
    } catch (error) {
      console.error('Error fetching user movies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setListName(initialListName);
    setSearchQuery('');
    onClose();
  };

  const filteredMovies = searchQuery.trim()
    ? allLibraryMovies.filter(movie =>
        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recentMovies;

  const handleToggleMovie = (movieId: number) => {
    setSelectedMovies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(movieId)) {
        newSet.delete(movieId);
      } else {
        newSet.add(movieId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!session?.user?.id || !listId) {
      toast.error(t('common.error'));
      return;
    }

    if (!listName.trim()) {
      toast.error(t('lists.enterName'));
      return;
    }

    if (selectedMovies.size === 0) {
      toast.error('Please select at least one movie');
      return;
    }

    setSaving(true);

    try {
      // Update the list name if changed
      if (listName !== initialListName) {
        const { error: nameError } = await supabase
          .from('lists')
          .update({ 
            name: listName.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', listId)
          .eq('user_id', session.user.id);

        if (nameError) {
          if (nameError.code === '23505') {
            toast.error(t('lists.nameExists'));
            setSaving(false);
            return;
          }
          throw nameError;
        }
      }

      // Get current movies in the list
      const { data: currentMovieRelations, error: relationsError } = await supabase
        .from('list_movies')
        .select('movie_id')
        .eq('list_id', listId);

      if (relationsError) throw relationsError;

      const currentMovieIds = new Set(currentMovieRelations.map(item => item.movie_id));
      const selectedMovieIds = Array.from(selectedMovies);
      
      // Find movies to add (in selected but not in current)
      const moviesToAdd = selectedMovieIds.filter(id => !currentMovieIds.has(id))
        .map(movieId => ({
          list_id: listId,
          movie_id: movieId,
        }));

      // Find movies to remove (in current but not in selected)
      const moviesToRemove = Array.from(currentMovieIds)
        .filter(id => !selectedMovies.has(id));

      // Perform add operations if needed
      if (moviesToAdd.length > 0) {
        const { error: addError } = await supabase
          .from('list_movies')
          .insert(moviesToAdd);

        if (addError) throw addError;
      }

      // Perform remove operations if needed
      for (const movieId of moviesToRemove) {
        const { error: removeError } = await supabase
          .from('list_movies')
          .delete()
          .eq('list_id', listId)
          .eq('movie_id', movieId);

        if (removeError) throw removeError;
      }

      toast.success('List updated successfully');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error updating list:', error);
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={handleClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              {t('common.edit')} {t('lists.title')}
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="mb-6">
              <label
                htmlFor="listName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('lists.listName')}
              </label>
              <input
                type="text"
                id="listName"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder={t('lists.enterName')}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('lists.selectMovies')}
                </h3>
                <div className="relative w-64">
                  <input
                    type="text"
                    placeholder={t('library.searchMovies')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  {filteredMovies.length > 0 ? (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg">
                      {filteredMovies.map((movie) => (
                        <div
                          key={movie.id}
                          className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                            selectedMovies.has(movie.id)
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                          }`}
                          onClick={() => handleToggleMovie(movie.id)}
                        >
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900 dark:text-white">
                              {movie.title}
                            </h3>
                            <div className="flex items-center mt-1 text-sm text-gray-600 dark:text-gray-400">
                              {movie.release_date && (
                                <span className="mr-2">
                                  {new Date(movie.release_date).getFullYear()}
                                </span>
                              )}
                              {movie.userRating !== undefined && movie.userRating !== null && (
                                <div className="flex items-center">
                                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-current" />
                                  <span className="ml-1">{movie.userRating}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              selectedMovies.has(movie.id)
                                ? 'bg-blue-500 border-blue-500'
                                : 'border-gray-400 dark:border-gray-500'
                            }`}
                          >
                            {selectedMovies.has(movie.id) && (
                              <svg
                                className="w-3 h-3 text-white"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-600 dark:text-gray-400">
                      {t('lists.noMoviesFound')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-4 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleClose}
              className="px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || selectedMovies.size === 0 || !listName.trim()}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  {t('common.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}