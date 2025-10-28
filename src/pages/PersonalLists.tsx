import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListPlus, Loader2, Trash2, Film, ArrowLeft, Edit } from 'lucide-react';
import { Movie, getMovieDetails } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import CreateListModal from '../components/CreateListModal';
import ConfirmationModal from '../components/ConfirmationModal';
import EditListModal from '../components/EditListModal';
import RatingBox from '../components/RatingBox';
import ReorderListModal from '../components/ReorderListModal';
import { useTranslation } from 'react-i18next';

interface List {
  id: string;
  name: string;
  created_at: string;
  movies: Movie[];
}

interface UserMovie {
  id: string;
  movie_id: number;
  rating: number | null;
}

export default function PersonalLists() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();
  const [lists, setLists] = useState<List[]>([]);
  const [libraryMovies, setLibraryMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const [editingList, setEditingList] = useState<{id: string, name: string} | null>(null);
  const [newListName, setNewListName] = useState('');
  const [editModalList, setEditModalList] = useState<List | null>(null);
  const [reorderListId, setReorderListId] = useState<string | null>(null);
  const [reorderingList, setReorderingList] = useState<List | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      fetchLists();
      fetchUserMovies();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (reorderListId) {
      const selectedList = lists.find(list => list.id === reorderListId);
      if (selectedList) {
        setReorderingList(selectedList);
      }
    } else {
      setReorderingList(null);
    }
  }, [reorderListId, lists]);

  const fetchLists = async () => {
    try {
      if (!session?.user?.id) {
        setLists([]);
        setLoading(false);
        return;
      }

      // First, get all lists for the current user
      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (listsError) throw listsError;
      
      console.log('Lists fetched:', listsData?.length || 0);
      
      if (!listsData || listsData.length === 0) {
        setLists([]);
        setLoading(false);
        return;
      }

      // Get all user ratings
      const { data: userMovies, error: ratingsError } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', session.user.id);

      if (ratingsError) throw ratingsError;

      // Create a map of movie IDs to ratings
      const ratingsMap = new Map(
        userMovies.map((um: UserMovie) => [um.movie_id, um.rating])
      );

      // For each list, get its movies
      const listsWithMovies = await Promise.all(
        listsData.map(async (list) => {
          const { data: movieIds, error: moviesError } = await supabase
            .from('list_movies')
            .select('movie_id')
            .eq('list_id', list.id);

          if (moviesError) throw moviesError;

          if (!movieIds || movieIds.length === 0) {
            return {
              ...list,
              movies: []
            };
          }

          // Get movie details for each movie ID and include user ratings
          const movies = await Promise.all(
            movieIds.map(async ({ movie_id }) => {
              try {
                const movieDetails = await getMovieDetails(movie_id);
                return {
                  ...movieDetails,
                  userRating: ratingsMap.get(movie_id) || null
                };
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
    } catch (error) {
      console.error('Error fetching lists:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchUserMovies = async () => {
    try {
      if (!session?.user?.id) return;

      const { data: userMoviesData, error } = await supabase
        .from('user_movies')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const moviesWithDetails = await Promise.all(
        (userMoviesData || []).map(async (userMovie: UserMovie) => {
          try {
            const movieDetails = await getMovieDetails(userMovie.movie_id);
            return {
              ...movieDetails,
              userRating: userMovie.rating
            };
          } catch (error) {
            console.error(`Error fetching details for movie ${userMovie.movie_id}:`, error);
            return null;
          }
        })
      );

      setLibraryMovies(moviesWithDetails.filter(Boolean));
    } catch (error) {
      console.error('Error fetching user movies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteList = async () => {
    if (!deleteListId || !session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', deleteListId)
        .eq('user_id', session.user.id);

      if (error) throw error;

      setLists(lists.filter(list => list.id !== deleteListId));
      toast.success(t('lists.deleted'));
    } catch (error) {
      console.error('Error deleting list:', error);
      toast.error(t('common.error'));
    } finally {
      setDeleteListId(null);
    }
  };

  const handleEditList = (list: {id: string, name: string}) => {
    setEditingList(list);
    setNewListName(list.name);
  };

  const handleSaveListName = async () => {
    if (!editingList || !session?.user?.id || !newListName.trim()) return;

    try {
      const { error } = await supabase
        .from('lists')
        .update({ 
          name: newListName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editingList.id)
        .eq('user_id', session.user.id);

      if (error) {
        if (error.code === '23505') {
          toast.error(t('lists.nameExists'));
        } else {
          throw error;
        }
        return;
      }

      setLists(lists.map(list => {
        if (list.id === editingList.id) {
          return { ...list, name: newListName.trim() };
        }
        return list;
      }));
      
      toast.success('List name updated successfully');
      setEditingList(null);
    } catch (error) {
      console.error('Error updating list name:', error);
      toast.error(t('common.error'));
    }
  };

  const handleRemoveMovie = async (listId: string, movieId: number) => {
    try {
      const { error } = await supabase
        .from('list_movies')
        .delete()
        .eq('list_id', listId)
        .eq('movie_id', movieId);

      if (error) throw error;

      setLists(lists.map(list => {
        if (list.id === listId) {
          return {
            ...list,
            movies: list.movies.filter(movie => movie.id !== movieId)
          };
        }
        return list;
      }));

      toast.success(t('lists.movieRemoved'));
    } catch (error) {
      console.error('Error removing movie:', error);
      toast.error(t('common.error'));
    }
  };

  const handleEditFullList = (list: List) => {
    setEditModalList(list);
  };

  const handleReorderSave = async (updatedMovies: Movie[]) => {
    if (!reorderListId || !reorderingList) return;
    
    try {
      setSaving(true);
      
      // Get original movie list for comparison
      const originalList = lists.find(list => list.id === reorderListId);
      if (!originalList) {
        throw new Error('List not found');
      }
      
      // First, update the state so the UI is immediately responsive
      setLists(prev => 
        prev.map(list => 
          list.id === reorderListId 
            ? { ...list, movies: updatedMovies }
            : list
        )
      );
      
      // Now update the database
      // We need to delete and re-insert all movies to preserve the order
      const { error: deleteError } = await supabase
        .from('list_movies')
        .delete()
        .eq('list_id', reorderListId);
      
      if (deleteError) throw deleteError;
      
      // Then insert all movies in the new order
      const insertData = updatedMovies.map((movie, index) => ({
        list_id: reorderListId,
        movie_id: movie.id,
        added_at: new Date().toISOString() // Use timestamp for ordering
      }));
      
      const { error: insertError } = await supabase
        .from('list_movies')
        .insert(insertData);
      
      if (insertError) throw insertError;
      
      // Close the reorder modal
      setReorderListId(null);
      
      // Show success message
      toast.success('List order updated successfully');
      
    } catch (error) {
      console.error('Error saving reordered list:', error);
      toast.error(t('common.error'));
      
      // Revert to the original order in case of error
      fetchLists();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0 flex-1">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {t('lists.title')}
            </h1>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center justify-center w-10 sm:w-auto px-0 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors self-end sm:self-auto"
              aria-label={t('lists.createNew')}
            >
              <ListPlus className="w-5 h-5 sm:mr-2" />
              <span className="hidden sm:inline">{t('lists.createNew')}</span>
            </button>
          </div>
        </div>

        {lists.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <ListPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {t('lists.noListsYet')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {t('lists.createFirstMsg')}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {lists.map(list => (
              <div key={list.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  {editingList && editingList.id === list.id ? (
                    <div className="flex items-center space-x-2 flex-1">
                      <input 
                        type="text" 
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={handleSaveListName}
                        disabled={!newListName.trim()}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t('common.save')}
                      </button>
                      <button
                        onClick={() => setEditingList(null)}
                        className="px-3 py-2 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                      {list.name}
                    </h2>
                  )}
                  <div className="flex items-center">
                    <button
                      onClick={() => handleEditFullList(list)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center mr-2"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      <span>{t('common.edit')}</span>
                    </button>
                    <button
                      onClick={() => setDeleteListId(list.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
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
                    key={list.id}
                    title={list.name}
                    movies={list.movies}
                    rating={null}
                    onRemoveFromList={(movieId) => handleRemoveMovie(list.id, movieId)}
                    className="border-2 border-gray-200 dark:border-gray-700"
                    isPersonalList={true}
                    enableDragDrop={() => setReorderListId(list.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <CreateListModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={fetchLists}
        />

        <ConfirmationModal
          isOpen={deleteListId !== null}
          onClose={() => setDeleteListId(null)}
          onConfirm={handleDeleteList}
          title={t('common.delete')}
          message={t('common.confirm')}
        />

        {editModalList && (
          <EditListModal
            isOpen={true}
            onClose={() => setEditModalList(null)}
            onSuccess={fetchLists}
            listId={editModalList.id}
            listName={editModalList.name}
            currentMovies={editModalList.movies}
          />
        )}
        
        {reorderingList && (
          <ReorderListModal
            isOpen={reorderListId !== null}
            onClose={() => setReorderListId(null)} 
            onSave={handleReorderSave}
            movies={reorderingList.movies}
            listName={reorderingList.name}
          />
        )}
      </div>
    </div>
  );
}