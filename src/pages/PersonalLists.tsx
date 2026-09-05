import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ListPlus, Trash2, Film, ArrowLeft, Pencil, ArrowUpDown, ListMusic } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import ConfirmationModal from '../components/ConfirmationModal';
import ListFormModal from '../components/ListFormModal';
import ReorderListModal from '../components/ReorderListModal';
import MovieDetailsModal from '../components/MovieDetailsModal';
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

// Cada lista gira por uma dessas 6 identidades de cor (não depende de
// configuração do usuário) — dá variedade visual entre as listas sem
// exigir que a pessoa escolha nada, e resolve o problema de todas as
// listas ficarem visualmente idênticas.
const LIST_THEMES = [
  { glow: 'from-blue-500/15 to-cyan-500/10', border: 'border-blue-300/40 dark:border-blue-500/30', bar: 'from-blue-400 to-cyan-500', text: 'text-blue-600 dark:text-blue-400', button: 'from-blue-600 to-cyan-600' },
  { glow: 'from-purple-500/15 to-fuchsia-500/10', border: 'border-purple-300/40 dark:border-purple-500/30', bar: 'from-purple-400 to-fuchsia-500', text: 'text-purple-600 dark:text-purple-400', button: 'from-purple-600 to-fuchsia-600' },
  { glow: 'from-pink-500/15 to-rose-500/10', border: 'border-pink-300/40 dark:border-pink-500/30', bar: 'from-pink-400 to-rose-500', text: 'text-pink-600 dark:text-pink-400', button: 'from-pink-600 to-rose-600' },
  { glow: 'from-emerald-500/15 to-green-500/10', border: 'border-emerald-300/40 dark:border-emerald-500/30', bar: 'from-emerald-400 to-green-500', text: 'text-emerald-600 dark:text-emerald-400', button: 'from-emerald-600 to-green-600' },
  { glow: 'from-amber-500/15 to-orange-500/10', border: 'border-amber-300/40 dark:border-amber-500/30', bar: 'from-amber-400 to-orange-500', text: 'text-amber-600 dark:text-amber-400', button: 'from-amber-600 to-orange-600' },
  { glow: 'from-sky-500/15 to-indigo-500/10', border: 'border-sky-300/40 dark:border-sky-500/30', bar: 'from-sky-400 to-indigo-500', text: 'text-sky-600 dark:text-sky-400', button: 'from-sky-600 to-indigo-600' },
];

export default function PersonalLists() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [formModal, setFormModal] = useState<{ mode: 'create' | 'edit'; list?: List } | null>(null);
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const [reorderListId, setReorderListId] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  useEffect(() => {
    if (session?.user?.id) fetchLists();
  }, [session?.user?.id]);

  const fetchLists = async () => {
    try {
      if (!session?.user?.id) {
        setLists([]);
        setLoading(false);
        return;
      }

      const { data: listsData, error: listsError } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (listsError) throw listsError;

      if (!listsData || listsData.length === 0) {
        setLists([]);
        setLoading(false);
        return;
      }

      const { data: userMovies, error: ratingsError } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', session.user.id);

      if (ratingsError) throw ratingsError;

      const ratingsMap = new Map(
        (userMovies || []).map((um: UserMovie) => [um.movie_id, um.rating])
      );

      const listsWithMovies = await Promise.all(
        listsData.map(async (list) => {
          const { data: movieIds, error: moviesError } = await supabase
            .from('list_movies')
            .select('movie_id')
            .eq('list_id', list.id);

          if (moviesError) throw moviesError;

          if (!movieIds || movieIds.length === 0) {
            return { ...list, movies: [] };
          }

          const movies = await Promise.all(
            movieIds.map(async ({ movie_id }) => {
              try {
                const movieDetails = await getMovieDetailsFromDB(movie_id);
                const rating = ratingsMap.get(movie_id);
                return { ...movieDetails, userRating: rating !== undefined ? rating : null };
              } catch (error) {
                console.error(`Failed to fetch details for movie ${movie_id}:`, error);
                return null;
              }
            })
          );

          return { ...list, movies: movies.filter(Boolean) as Movie[] };
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

  const handleDeleteList = async () => {
    if (!deleteListId || !session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', deleteListId)
        .eq('user_id', session.user.id);

      if (error) throw error;

      setLists(lists.filter((list) => list.id !== deleteListId));
      toast.success(t('lists.deleted'));
    } catch (error) {
      console.error('Error deleting list:', error);
      toast.error(t('common.error'));
    } finally {
      setDeleteListId(null);
    }
  };

  const handleReorderSave = async (updatedMovies: Movie[]) => {
    if (!reorderListId) return;

    try {
      setLists((prev) =>
        prev.map((list) => (list.id === reorderListId ? { ...list, movies: updatedMovies } : list))
      );

      const { error: deleteError } = await supabase
        .from('list_movies')
        .delete()
        .eq('list_id', reorderListId);

      if (deleteError) throw deleteError;

      const insertData = updatedMovies.map((movie) => ({
        list_id: reorderListId,
        movie_id: movie.id,
      }));

      const { error: insertError } = await supabase.from('list_movies').insert(insertData);
      if (insertError) throw insertError;

      setReorderListId(null);
      toast.success(t('lists.reordered', { defaultValue: 'Ordem atualizada' }));
    } catch (error) {
      console.error('Error saving reordered list:', error);
      toast.error(t('common.error'));
      fetchLists();
    }
  };

  const reorderingList = lists.find((l) => l.id === reorderListId);

  if (loading) {
    return <GlassLoader fullPage size="lg" />;
  }

  return (
    <div className="min-h-screen pt-20 pb-24 px-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="fixed inset-0 bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/10 dark:to-purple-900/10 -z-10"></div>
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/10 to-purple-400/10 dark:from-blue-600/5 dark:to-purple-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-pink-400/10 to-amber-400/10 dark:from-pink-600/5 dark:to-amber-600/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2.5 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-colors shadow-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="flex items-center gap-2.5">
              <ListMusic className="w-6 h-6 text-blue-500" />
              <h1 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500">
                {t('lists.title')}
              </h1>
            </div>
          </div>

          <motion.button
            onClick={() => setFormModal({ mode: 'create' })}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 shadow-lg transition-all"
          >
            <ListPlus className="w-4 h-4" />
            {t('lists.createNew')}
          </motion.button>
        </div>

        {lists.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden text-center py-16 px-6"
          >
            <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-blue-400/15 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/30 flex items-center justify-center rotate-3">
                <ListPlus className="w-8 h-8 text-blue-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-1.5">
                {t('lists.noListsYet')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto">
                {t('lists.createFirstMsg')}
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {lists.map((list, listIndex) => {
              const theme = LIST_THEMES[listIndex % LIST_THEMES.length];
              return (
                <motion.div
                  key={list.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(listIndex * 0.05, 0.3) }}
                  className={`relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border ${theme.border} shadow-2xl overflow-hidden p-5 sm:p-6`}
                >
                  <div className={`absolute top-0 right-0 w-48 h-48 bg-gradient-to-br ${theme.glow} rounded-full blur-3xl pointer-events-none`} />

                  <div className="relative z-10 flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-1.5 rounded-full bg-gradient-to-b ${theme.bar} flex-shrink-0`} />
                      <div className="min-w-0">
                        <h2 className={`text-lg font-bold truncate ${theme.text}`}>{list.name}</h2>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {list.movies.length} {list.movies.length === 1 ? t('community.film') : t('community.films')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {list.movies.length > 1 && (
                        <button
                          onClick={() => setReorderListId(list.id)}
                          title={t('lists.reorderTitle', { name: list.name })}
                          className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <ArrowUpDown className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setFormModal({ mode: 'edit', list })}
                        title={t('common.edit')}
                        className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteListId(list.id)}
                        title={t('common.delete')}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {list.movies.length === 0 ? (
                    <div className="relative z-10 rounded-2xl bg-gray-50/60 dark:bg-gray-900/30 py-8 text-center">
                      <Film className="w-7 h-7 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 dark:text-gray-500">{t('lists.noMoviesInList')}</p>
                    </div>
                  ) : (
                    <div className="relative z-10 flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      {list.movies.map((movie) => (
                        <motion.button
                          key={`${movie.id}-${movie.media_type}`}
                          onClick={() => setSelectedMovie(movie)}
                          whileHover={{ scale: 1.05, y: -4 }}
                          whileTap={{ scale: 0.97 }}
                          className="relative w-[100px] sm:w-[120px] flex-shrink-0 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-[2/3] shadow-lg"
                        >
                          <img
                            src={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : 'https://via.placeholder.com/300x450?text=No+Image'}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {movie.userRating !== null && movie.userRating !== undefined && (
                            <div className="absolute top-1.5 right-1.5 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                              ★ {movie.userRating}
                            </div>
                          )}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {formModal && (
        <ListFormModal
          isOpen={true}
          onClose={() => setFormModal(null)}
          onSuccess={fetchLists}
          mode={formModal.mode}
          listId={formModal.list?.id}
          initialName={formModal.list?.name || ''}
          initialMovieIds={formModal.list?.movies.map((m) => m.id) || []}
        />
      )}

      <ConfirmationModal
        isOpen={deleteListId !== null}
        onClose={() => setDeleteListId(null)}
        onConfirm={handleDeleteList}
        title={t('common.delete')}
        message={t('common.confirm')}
      />

      {reorderingList && (
        <ReorderListModal
          isOpen={reorderListId !== null}
          onClose={() => setReorderListId(null)}
          onSave={handleReorderSave}
          movies={reorderingList.movies}
          listName={reorderingList.name}
        />
      )}

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          isOtherUserProfile={false}
        />
      )}
    </div>
  );
}