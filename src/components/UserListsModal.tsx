import { useState, useEffect } from 'react';
import { ListPlus, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Movie, getMovieDetails } from '../lib/tmdb';
import { toast } from 'sonner';
import RatingBox from './RatingBox';
import OracleSheet from './OracleSheet';
import { useTranslation } from 'react-i18next';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

interface UserListsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  // Dono das listas — só pra dar nome no título e no vazio.
  username?: string;
}

interface List {
  id: string;
  name: string;
  created_at: string;
  movies: Movie[];
}

// Listas de outra pessoa (aberto do perfil dela). Cada lista vira uma
// prateleira de pôsteres, a mesma da Biblioteca.
export default function UserListsModal({ isOpen, onClose, userId, username }: UserListsModalProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserLists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

  const fetchUserLists = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: listsData, error: listsError } = await supabase
        .rpc('get_user_lists_by_id', { target_user_id: userId })
        .order('created_at', { ascending: false });

      if (listsError) throw listsError;

      if (!listsData || listsData.length === 0) {
        setLists([]);
        return;
      }

      // Pra cada lista, os títulos dela.
      const listsWithMovies = await Promise.all(
        (listsData as Omit<List, 'movies'>[]).map(async (list) => {
          const { data: movieIds, error: moviesError } = await supabase.from('list_movies').select('movie_id').eq('list_id', list.id);

          if (moviesError) throw moviesError;
          if (!movieIds || movieIds.length === 0) return { ...list, movies: [] };

          const movies = await Promise.all(
            movieIds.map(async ({ movie_id }: { movie_id: number }) => {
              try {
                return await getMovieDetails(movie_id);
              } catch (err) {
                console.error(`Failed to fetch details for movie ${movie_id}:`, err);
                return null;
              }
            }),
          );

          return { ...list, movies: movies.filter((m): m is Movie => m !== null) };
        }),
      );

      setLists(listsWithMovies);
    } catch (err: unknown) {
      console.error('Error fetching user lists:', err);
      setError(err instanceof Error ? err.message : 'error');
      toast.error(t('lists.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('profile.listsShort')}
      subtitle={[username ? `@${username}` : null, !loading && lists.length > 0 ? t('lists.listCount', { count: lists.length }) : null].filter(Boolean).join(' · ') || undefined}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
          <ListPlus className="w-5 h-5 text-violet-300" aria-hidden />
        </span>
      }
      size="full"
      bodyClassName="py-4"
    >
      {loading ? (
        <div className="px-5 sm:px-7 space-y-6" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i}>
              <div className="h-6 w-48 rounded bg-white/10 animate-pulse" />
              <div className="mt-4 flex gap-3">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="w-[110px] aspect-[2/3] rounded-xl bg-white/[0.07] animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="px-5 sm:px-7 py-12 text-center" style={{ color: MIST }}>
          {t('lists.loadError')}
        </p>
      ) : lists.length === 0 ? (
        <div className="px-5 sm:px-7 py-12 text-center">
          <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <ListPlus className="w-7 h-7 text-violet-300" aria-hidden />
          </span>
          <p className="mt-4 font-semibold" style={{ color: PAPER }}>
            {t('lists.noListsYet')}
          </p>
          {username && (
            <p className="mt-1 text-sm" style={{ color: MIST }}>
              {t('lists.noListsOther', { username })}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) =>
            list.movies.length === 0 ? (
              <section key={list.id} className="px-5 sm:px-7 py-6">
                <h3 style={{ ...PIXEL, color: PAPER }} className="text-2xl leading-tight">
                  {list.name}
                </h3>
                <p className="mt-1 text-xs" style={{ color: MIST }}>
                  {formatDate(list.created_at)}
                </p>
                <div className="mt-4 flex items-center gap-3 rounded-xl px-4 py-4 ring-1 ring-white/10" style={{ background: VELVET }}>
                  <Film className="w-5 h-5 shrink-0 text-violet-300" aria-hidden />
                  <p className="text-sm" style={{ color: MIST }}>
                    {t('lists.noMoviesInList')}
                  </p>
                </div>
              </section>
            ) : (
              <RatingBox key={list.id} title={list.name} movies={list.movies} rating={null} isOtherUserProfile={true} chromaBoxEnabled={false} />
            ),
          )}
        </div>
      )}
    </OracleSheet>
  );
}
