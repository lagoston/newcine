import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader2, Star, Film, ListPlus, Check } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

// Substitui CreateListModal.tsx + EditListModal.tsx — os dois faziam
// essencialmente a mesma coisa (nome + buscar/selecionar filmes da
// biblioteca + salvar) como componentes duplicados, e tinham ficado
// dessincronizados: o Create já buscava os pôsteres em lote (2 consultas
// no total), enquanto o Edit ainda fazia uma consulta POR FILME — com
// 200 filmes na biblioteca, eram 200 requisições toda vez que o modal de
// editar abria. Um componente só, com um modo (`mode`), elimina essa
// duplicação e essa dessincronia de uma vez.
interface ListFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  listId?: string;
  initialName?: string;
  initialMovieIds?: number[];
}

const ListFormModal: React.FC<ListFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  mode,
  listId,
  initialName = '',
  initialMovieIds = [],
}) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [listName, setListName] = useState(initialName);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovies, setSelectedMovies] = useState<Set<number>>(new Set(initialMovieIds));
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allLibraryMovies, setAllLibraryMovies] = useState<Movie[]>([]);

  useEffect(() => {
    if (isOpen) {
      setListName(initialName);
      setSelectedMovies(new Set(initialMovieIds));
      setSearchQuery('');
      if (session?.user?.id) fetchUserMovies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalOverflow; };
    }
  }, [isOpen]);

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
        setLoading(false);
        return;
      }

      const movieIds = userMovies.map((um) => um.movie_id);

      // Uma consulta em lote pros metadados, outra pros pôsteres — em vez
      // de uma consulta por filme (o bug de performance que o
      // EditListModal antigo tinha).
      const [moviesRes, cacheRes] = await Promise.all([
        supabase.from('movies').select('id, title, release_date, genres, media_type').in('id', movieIds),
        supabase.from('movie_cache').select('tmdb_id, media_type, poster_path').in('tmdb_id', movieIds),
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
          genres: movieData?.genres || [],
        };
      });

      setAllLibraryMovies(validMovies);
    } catch (error) {
      console.error('Error fetching user movies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const displayedMovies = searchQuery.trim()
    ? allLibraryMovies.filter((movie) => movie.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : allLibraryMovies.slice(0, 30);

  const handleToggleMovie = (movieId: number) => {
    setSelectedMovies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(movieId)) newSet.delete(movieId);
      else newSet.add(movieId);
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

    setSaving(true);
    try {
      let currentListId = listId;

      if (mode === 'create') {
        const { data: list, error: listError } = await supabase
          .from('lists')
          .insert({ name: listName.trim(), user_id: session.user.id })
          .select()
          .single();

        if (listError) throw listError;
        currentListId = list.id;
      } else {
        const { error: updateError } = await supabase
          .from('lists')
          .update({ name: listName.trim(), updated_at: new Date().toISOString() })
          .eq('id', currentListId)
          .eq('user_id', session.user.id);

        if (updateError) throw updateError;

        // Modo edição: recria a lista de filmes do zero pra refletir
        // exatamente a seleção atual (removidos e adicionados).
        const { error: deleteError } = await supabase
          .from('list_movies')
          .delete()
          .eq('list_id', currentListId);

        if (deleteError) throw deleteError;
      }

      const movieInserts = Array.from(selectedMovies).map((movieId) => ({
        list_id: currentListId,
        movie_id: movieId,
      }));

      const { error: moviesError } = await supabase.from('list_movies').insert(movieInserts);
      if (moviesError) throw moviesError;

      toast.success(mode === 'create' ? t('lists.created') : t('common.success', { defaultValue: 'Salvo com sucesso' }));
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving list:', error);
      if (error.code === '23505') {
        toast.error(t('lists.nameExists'));
      } else {
        toast.error(t('common.error'));
      }
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl max-h-[calc(100dvh-4rem)] flex flex-col rounded-3xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-2xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-blue-400/15 to-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/30">
                  <ListPlus className="w-5 h-5 text-blue-500" />
                </div>
                {mode === 'create' ? t('lists.createNew') : t('common.edit')}
              </h2>
              <button
                onClick={onClose}
                className="p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative flex-1 overflow-y-auto p-6">
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder={t('lists.enterName')}
                className="w-full px-4 py-3 mb-5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 text-gray-900 dark:text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
              />

              <div className="relative mb-4">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('library.searchMovies')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                />
              </div>

              {selectedMovies.size > 0 && (
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-3">
                  {selectedMovies.size} {t('lists.selectedCount', { defaultValue: 'selecionados' })}
                </p>
              )}

              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                </div>
              ) : displayedMovies.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {displayedMovies.map((movie) => {
                    const isSelected = selectedMovies.has(movie.id);
                    return (
                      <button
                        key={movie.id}
                        onClick={() => handleToggleMovie(movie.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                            : 'border-transparent bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-900/50'
                        }`}
                      >
                        <div className="w-10 h-[60px] flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 shadow">
                          {movie.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                              alt={movie.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <Film className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{movie.title}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {movie.release_date && <span>{new Date(movie.release_date).getFullYear()}</span>}
                            {movie.userRating !== undefined && movie.userRating !== null && (
                              <span className="flex items-center gap-0.5">
                                <Star className="w-3 h-3 text-yellow-500 fill-current" />
                                {movie.userRating}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-500' : 'border-2 border-gray-300 dark:border-gray-600'}`}>
                          {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400 text-sm">
                  {t('lists.noMoviesFound')}
                </div>
              )}
            </div>

            <div className="relative flex-shrink-0 flex justify-end gap-3 p-5 border-t border-gray-200/50 dark:border-gray-700/50">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || selectedMovies.size === 0 || !listName.trim()}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'create' ? t('lists.createNew') : t('common.save')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ListFormModal;