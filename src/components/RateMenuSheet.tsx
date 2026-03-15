import React, { useState } from 'react';
import { Star, X, Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface RateMenuSheetProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onRate: (rating: number | null) => Promise<void>;
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

const RateMenuSheet: React.FC<RateMenuSheetProps> = ({ movieTitle, isOpen, onClose, onRate }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language === 'pt';
  const [loading, setLoading] = useState<number | 'watchlist' | null>(null);

  if (!isOpen) return null;

  const handleRate = async (rating: number) => {
    if (loading !== null) return;
    setLoading(rating);
    try {
      await onRate(rating);
      onClose();
    } catch (err) {
      console.error('Error rating movie:', err);
      toast.error(isPt ? 'Erro ao classificar' : 'Error rating');
    } finally {
      setLoading(null);
    }
  };

  const handleMoveToWatchlist = async () => {
    if (loading !== null) return;
    setLoading('watchlist');
    try {
      await onRate(null);
      onClose();
    } catch (err) {
      console.error('Error moving to watchlist:', err);
      toast.error(isPt ? 'Erro ao mover para Watchlist' : 'Error moving to watchlist');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-2xl z-[60] shadow-2xl">
        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mt-3 mb-1" />

        <div className="px-3 pb-6 pt-2">
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
                  style={{ fontSize: '10px' }}
                  className={`
                    aspect-square rounded-md font-bold shadow-sm transition-all duration-150
                    active:scale-90 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed
                    flex items-center justify-center leading-none
                    ${loading === n ? 'opacity-60 animate-pulse' : ''}
                    ${ratingColors[n]}
                  `}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleMoveToWatchlist}
            disabled={loading !== null}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 mb-2 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium rounded-xl border border-blue-200 dark:border-blue-700/50 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${loading === 'watchlist' ? 'animate-pulse' : ''}`}
          >
            <Bookmark className="w-4 h-4" />
            {isPt ? 'Mover para Watchlist' : 'Move to Watchlist'}
          </button>

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

export default RateMenuSheet;
