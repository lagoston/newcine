import React, { useState, useEffect } from 'react';
import { ListPlus, Loader2, Check, PlusSquare as SquarePlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';

interface AddToListMenuProps {
  movieId: number;
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  // Mantida por compatibilidade — a janela agora é uma gaveta padrão
  // (de baixo pra cima no celular, centralizada no desktop).
  position?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

interface List {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

const AddToListMenu: React.FC<AddToListMenuProps> = ({
  movieId,
  movieTitle,
  isOpen,
  onClose,
}) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToList, setAddingToList] = useState<string | null>(null);
  const [alreadyInLists, setAlreadyInLists] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchUserLists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, session?.user?.id, movieId]);

  const fetchUserLists = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .eq('user_id', session?.user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const userLists: List[] = data || [];
      setLists(userLists);

      // Em quais das SUAS listas o filme já está (antes a consulta olhava
      // list_movies de qualquer lista, não só as do usuário).
      if (userLists.length > 0) {
        const { data: entries, error: entriesError } = await supabase
          .from('list_movies')
          .select('list_id')
          .eq('movie_id', movieId)
          .in('list_id', userLists.map((l) => l.id));
        if (entriesError) throw entriesError;
        setAlreadyInLists(new Set((entries || []).map((item: { list_id: string }) => item.list_id)));
      } else {
        setAlreadyInLists(new Set());
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const addToList = async (listId: string) => {
    if (addingToList || !session?.user?.id) return;

    try {
      setAddingToList(listId);

      const { error } = await supabase
        .from('list_movies')
        .insert({
          list_id: listId,
          movie_id: movieId
        });

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          toast.error(t('lists.movieAlreadyInList', { defaultValue: 'Movie is already in this list' }));
        } else {
          throw error;
        }
        return;
      }

      setAlreadyInLists((prev) => new Set([...prev, listId]));
      toast.success(t('lists.movieAdded', { defaultValue: 'Movie added to list' }));
    } catch (error) {
      console.error('Error adding movie to list:', error);
      toast.error(t('common.error'));
    } finally {
      setAddingToList(null);
    }
  };

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('lists.addToList')}
      subtitle={movieTitle}
      size="md"
      bodyClassName="px-3 sm:px-5 py-4"
    >
      {loading ? (
        <ul className="space-y-2 px-2" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="h-12 rounded-xl animate-pulse" style={{ background: VELVET }} />
          ))}
        </ul>
      ) : lists.length === 0 ? (
        <div className="px-2 py-8 text-center">
          <ListPlus className="w-7 h-7 mx-auto text-violet-300" aria-hidden />
          <p className="mt-3" style={{ color: MIST }}>{t('lists.noListsYet')}</p>
          <Link
            to="/lists"
            onClick={onClose}
            className={`mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
          >
            <SquarePlus className="w-4 h-4" aria-hidden />
            {t('lists.createNew')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {lists.map((list) => {
            const inList = alreadyInLists.has(list.id);
            return (
              <li key={list.id}>
                <button
                  onClick={() => (!inList ? addToList(list.id) : null)}
                  disabled={addingToList !== null || inList}
                  aria-pressed={inList}
                  className={`w-full justify-between gap-3 px-3 py-3 rounded-xl text-left transition ${FOCUS_RING} ${
                    inList ? 'bg-emerald-400/10 cursor-default' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <ListPlus className={`w-5 h-5 shrink-0 ${inList ? 'text-emerald-300' : 'text-violet-300'}`} aria-hidden />
                    <span className="font-medium truncate" style={{ color: PAPER }}>{list.name}</span>
                  </span>
                  {addingToList === list.id ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-violet-300" aria-hidden />
                  ) : inList ? (
                    <span className="inline-flex items-center gap-1 shrink-0 text-xs font-semibold text-emerald-300">
                      <Check className="w-4 h-4" aria-hidden />
                      {t('lists.inThisList')}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </OracleSheet>
  );
};

export default AddToListMenu;
