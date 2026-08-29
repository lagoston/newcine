import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader2, Star, Film } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateListModal({ isOpen, onClose, onSuccess }: CreateListModalProps) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [listName, setListName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovies, setSelectedMovies] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allLibraryMovies, setAllLibraryMovies] = useState<Movie[]>([]);
  const [recentMovies, setRecentMovies] = useState<Movie[]>([]);

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchUserMovies();
    }
  }, [isOpen, session?.user?.id]);

  const fetchUserMovies = async () => {
    try {
      setLoading(true);

      const { data: userMovies, error: userMoviesError } = await supabase
        .from('user_movies')
        .select('movie_id, media_type, rating')
        .eq('user_id', session?.user?.id)
        .order('created_at', { ascending: false });

      if (userMoviesError) throw userMoviesError;

      if (!userMovies || userMovies.length === 0) {
        setAllLibraryMovies([]);
        setRecentMovies([]);
        setLoading(false);
        return;
      }

      const movieIds = userMovies.map((um) => um.movie_id);

      // Antes, cada filme da biblioteca disparava sua PRÓPRIA consulta
      // individual (N+1) — com 200 filmes na biblioteca, isso significava
      // 200 requisições separadas ao banco só pra abrir esse modal. Agora
      // são só 2 consultas no total (uma pros metadados, uma pros
      // pôsteres), buscando todos os filmes de uma vez com `.in()`.
      const [moviesRes, cacheRes] = await Promise.all([
        supabase.from('movies').select('id, title, release_date, genres, media_type').in('id', movieIds),
        supabase.from('movie_cache').select('tmdb_id, media_type, poster_path').in('tmdb_id', movieIds)
      ]);

      if (moviesRes.error) throw moviesRes.error;

      const movieDataMap = new Map(
        (moviesRes.data || []).map((m: any) => [`${m.id}_${m.media_type}`, m])
      );
      const posterMap = new Map(
        (cacheRes.data || []).map((c: any) => [`${c.tmdb_id}_${c.media_type}`, c.poster_path])
      );

      const validMovies = userMovies.map((um) => {
        const mediaType = um.media_type || 'movie';
        const key = `${um.movie_id}_${mediaType}`;
        const movieData = movieDataMap.get(key);

        return {
          id: um.movie_id,
          title: movieData?.title || `Movie ${um.movie_id}`,
          release_date: movieData?.release_date || '',
          poster_path: posterMap.get(key) || null,
          vote_average: 0,
          overview: '',
          userRating: um.rating,
          genres: movieData?.genres || []
        };
      });

      setAllLibraryMovies(validMovies);
      setRecentMovies(validMovies.slice(0, 10)); // Get 10 most recent movies
    } catch (error) {
      console.error('Error fetching user movies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setListName('');
    setSearchQuery('');
    setSelectedMovies(new Set());
    onClose();
  };

  const filteredMovies = searchQuery.trim()
    ? allLibraryMovies.filter(movie =>
        movie.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : recentMovies;

  const handleToggleMovie = (movieId: number) => {
    console.log(`Toggling movie selection for ID: ${movieId}`);
    setSelectedMovies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(movieId)) {
        newSet.delete(movieId);
        console.log(`Removed movie ${movieId}, selected count: ${newSet.size}`);
      } else {
        newSet.add(movieId);
        console.log(`Added movie ${movieId}, selected count: ${newSet.size}`);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    if (!session?.user?.id) {
      toast.error(t('common.error'));
      return;
    }

    if (!listName.trim()) {
      toast.error(t('lists.enterName'));
      return;
    }

    if (selectedMovies.size === 0) {
      toast.error(t('common.error'));
      return;
    }

    console.log(`Creating list "${listName}" with ${selectedMovies.size} movies`);
    setSaving(true);

    try {
      const { data: list, error: listError } = await supabase
        .from('lists')
        .insert({
          name: listName.trim(),
          user_id: session.user.id
        })
        .select()
        .single();

      if (listError) throw listError;
      
      console.log(`Created list with ID: ${list.id}`);

      const movieInserts = Array.from(selectedMovies).map(movieId => ({
        list_id: list.id,
        movie_id: movieId,
      }));

      const { error: moviesError } = await supabase
        .from('list_movies')
        .insert(movieInserts);

      if (moviesError) throw moviesError;
      
      console.log(`Added ${movieInserts.length} movies to the list`);

      toast.success(t('lists.created'));
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating list:', error);
      if (error.code === '23505') {
        toast.error(t('lists.nameExists'));
      } else {
        toast.error(t('common.error'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50"
            onClick={handleClose}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  {t('lists.createNew')}
                </h2>
                <button
                  onClick={handleClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
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

            <div className="mb-6">
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
                          <div className="w-9 h-[54px] flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 mr-3">
                            {movie.poster_path ? (
                              <img
                                src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                                alt={movie.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                                <Film className="w-4 h-4" />
                              </div>
                            )}
                          </div>
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
                t('lists.createNew')
              )}
            </button>
          </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}