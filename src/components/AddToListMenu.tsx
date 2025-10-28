import React, { useState, useEffect } from 'react';
import { ListPlus, Loader2, Check, X, PlusSquare as SquarePlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface AddToListMenuProps {
  movieId: number;
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  position: {
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
  position
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
      checkMovieInLists();
    }
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
      setLists(data || []);
    } catch (error) {
      console.error('Error fetching lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkMovieInLists = async () => {
    try {
      const { data, error } = await supabase
        .from('list_movies')
        .select('list_id')
        .eq('movie_id', movieId);

      if (error) throw error;
      
      if (data) {
        const listIds = new Set(data.map(item => item.list_id));
        setAlreadyInLists(listIds);
      }
    } catch (error) {
      console.error('Error checking movie in lists:', error);
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

      setAlreadyInLists(prev => new Set([...prev, listId]));
      toast.success(t('lists.movieAdded', { defaultValue: 'Movie added to list' }));
    } catch (error) {
      console.error('Error adding movie to list:', error);
      toast.error(t('common.error'));
    } finally {
      setAddingToList(null);
    }
  };

  if (!isOpen) return null;

  // Calculate centered position
  const calculatedStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1000,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxHeight: '80vh'
  };

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/20" onClick={onClose}></div>
      <div 
        style={calculatedStyle}
        className="w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
            {t('lists.addToList')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="max-h-60 overflow-y-auto">
          {loading ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : lists.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                {t('lists.noListsYet')}
              </p>
              <Link
                to="/lists"
                onClick={onClose}
                className="inline-flex items-center text-sm px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                <SquarePlus className="w-4 h-4 mr-2" />
                {t('lists.createNew')}
              </Link>
            </div>
          ) : (
            <ul className="py-1">
              {lists.map(list => (
                <li key={list.id} className="px-1">
                  <button
                    onClick={() => !alreadyInLists.has(list.id) ? addToList(list.id) : null}
                    disabled={addingToList !== null || alreadyInLists.has(list.id)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between ${
                      alreadyInLists.has(list.id)
                        ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center">
                      <ListPlus className={`w-4 h-4 mr-2 ${
                        alreadyInLists.has(list.id) ? 'text-green-500' : 'text-gray-400'
                      }`} />
                      <span className="truncate">{list.name}</span>
                    </div>
                    {addingToList === list.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    ) : alreadyInLists.has(list.id) ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default AddToListMenu;