import React, { useState, useEffect } from 'react';
import { X, ListPlus, Film, Eye } from 'lucide-react';
import GlassLoader from './GlassLoader';
import { supabase } from '../lib/supabase';
import { Movie, getMovieDetails } from '../lib/tmdb';
import { toast } from 'sonner';
import RatingBox from './RatingBox';
import { useTranslation } from 'react-i18next';

interface UserListsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface List {
  id: string;
  name: string;
  created_at: string;
  movies: Movie[];
}

export default function UserListsModal({ isOpen, onClose, userId }: UserListsModalProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserLists();
    }
  }, [isOpen, userId]);

  const fetchUserLists = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Fetching lists for user:', userId);

      // Use RPC function to get user's lists
      const { data: listsData, error: listsError } = await supabase
        .rpc('get_user_lists_by_id', { target_user_id: userId })
        .order('created_at', { ascending: false });

      if (listsError) {
        console.error('Error fetching lists:', listsError);
        throw listsError;
      }
      
      console.log('Lists fetched:', listsData?.length || 0);
      
      if (!listsData || listsData.length === 0) {
        setLists([]);
        setLoading(false);
        return;
      }

      // For each list, get its movies
      const listsWithMovies = await Promise.all(
        listsData.map(async (list) => {
          console.log('Fetching movies for list:', list.id);
          
          const { data: movieIds, error: moviesError } = await supabase
            .from('list_movies')
            .select('movie_id')
            .eq('list_id', list.id);

          if (moviesError) {
            console.error('Error fetching movies for list:', moviesError);
            throw moviesError;
          }
          
          console.log('Movies in list:', movieIds?.length || 0);

          if (!movieIds || movieIds.length === 0) {
            return {
              ...list,
              movies: []
            };
          }

          // Get movie details for each movie ID
          const movies = await Promise.all(
            movieIds.map(async ({ movie_id }) => {
              try {
                const movieDetails = await getMovieDetails(movie_id);
                return movieDetails;
              } catch (error) {
                console.error(`Failed to fetch details for movie ${movie_id}:`, error);
                return null;
              }
            })
          );

          return {
            ...list,
            movies: movies.filter(Boolean) // Remove any null results from failed fetches
          };
        })
      );

      setLists(listsWithMovies);
    } catch (error: any) {
      console.error('Error fetching user lists:', error);
      setError(error.message || 'Failed to load user lists');
      toast.error('Failed to load user lists');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center">
            <ListPlus className="w-6 h-6 mr-2 text-blue-500" />
            {t('lists.userLists')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <GlassLoader size="md" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">
              <p className="mb-2">Error loading lists:</p>
              <p>{error}</p>
            </div>
          ) : lists.length === 0 ? (
            <div className="text-center py-12">
              <ListPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {t('lists.noListsYet')}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {t('lists.createFirstMsg')}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {lists.map(list => (
                <div key={list.id} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                      {list.name}
                    </h3>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {new Date(list.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  
                  {list.movies.length === 0 ? (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 text-center">
                      <Film className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 dark:text-gray-400">
                        {t('lists.noMoviesInList')}
                      </p>
                    </div>
                  ) : (
                    <RatingBox
                      title={list.name}
                      movies={list.movies}
                      rating={null}
                      isOtherUserProfile={true}
                      className="border-2 border-gray-200 dark:border-gray-700"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}