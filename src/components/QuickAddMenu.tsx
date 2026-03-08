import React, { useState } from 'react';
import { BookmarkPlus, Star, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface QuickAddMenuProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rating?: number) => Promise<void>;
}

const ratingColors: Record<number, string> = {
  10: 'bg-gradient-to-br from-pink-400 via-rose-400 to-pink-500 text-white shadow-pink-500/40',
  9:  'bg-green-500 text-white shadow-green-500/30',
  8:  'bg-green-500 text-white shadow-green-500/30',
  7:  'bg-green-500 text-white shadow-green-500/30',
  6:  'bg-amber-400 text-white shadow-amber-400/30',
  5:  'bg-amber-400 text-white shadow-amber-400/30',
  4:  'bg-amber-400 text-white shadow-amber-400/30',
  3:  'bg-red-500 text-white shadow-red-500/30',
  2:  'bg-red-500 text-white shadow-red-500/30',
  1:  'bg-red-500 text-white shadow-red-500/30',
  0:  'bg-gray-700 text-gray-300 shadow-gray-700/30',
};

const QuickAddMenu: React.FC<QuickAddMenuProps> = ({ movieTitle, isOpen, onClose, onAdd }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language === 'pt';
  const [loading, setLoading] = useState<number | 'watchlist' | null>(null);

  if (!isOpen) return null;

  const handleRate = async (rating: number) => {
    if (loading !== null) return;
    setLoading(rating);
    try {
      await onAdd(rating);
      onClose();
    } catch (err) {
      console.error('Error adding to library:', err);
      toast.error('Erro ao adicionar à biblioteca');
    } finally {
      setLoading(null);
    }
  };

  const handleWatchlist = async () => {
    if (loading !== null) return;
    setLoading('watchlist');
    try {
      await onAdd(undefined);
      onClose();
    } catch (err) {
      console.error('Error adding to watchlist:', err);
      toast.error('Erro ao adicionar à Watchlist');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl z-50 shadow-2xl">
        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-1" />

        <div className="px-4 pb-6 pt-2">
          <p className="text-center text-sm font-semibold text-gray-900 dark:text-white truncate mb-4 px-8">
            {movieTitle}
          </p>

          <div className="mb-4">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Star className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {isPt ? 'Avaliar' : 'Rate'}
              </span>
            </div>

            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <button
                  key={n}
                  onClick={() => handleRate(n)}
                  disabled={loading !== null}
                  className={`
                    aspect-square rounded-md text-xs font-bold shadow-sm transition-all duration-150
                    active:scale-90 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed
                    flex items-center justify-center
                    ${loading === n ? 'opacity-60 animate-pulse' : ''}
                    ${ratingColors[n]}
                  `}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <BookmarkPlus className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {isPt ? 'Quero Assistir' : 'Watchlist'}
              </span>
            </div>
            <button
              onClick={handleWatchlist}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
            >
              {loading === 'watchlist' ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <BookmarkPlus className="w-4 h-4" />
              )}
              {isPt ? 'Adicionar à Watchlist' : 'Add to Watchlist'}
            </button>
          </div>

          <button
            onClick={onClose}
            disabled={loading !== null}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            {isPt ? 'Cancelar' : 'Cancel'}
          </button>
        </div>
      </div>
    </>
  );
};

export default QuickAddMenu;
