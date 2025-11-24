import React, { useState, useEffect } from 'react';
import { X, Download, List } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { getMovieDetails } from '../lib/tmdb';

interface LibraryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  rating: number | null;
  alternateNames: Record<string, string>;
  onAlternateNameChange: (rating: number | null, name: string) => void;
}

const LibraryEditModal: React.FC<LibraryEditModalProps> = ({
  isOpen,
  onClose,
  onReset,
  rating,
  alternateNames,
  onAlternateNameChange,
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [alternateName, setAlternateName] = useState(alternateNames[rating?.toString() ?? 'unrated'] || '');
  const [isDownloading, setIsDownloading] = useState(false);
  const [tvOrder, setTvOrder] = useState<'auto' | 'first' | 'last'>('auto');
  const [chromaBoxEnabled, setChromaBoxEnabled] = useState(false);
  const { session } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    setAlternateName(alternateNames[rating?.toString() ?? 'unrated'] || '');
  }, [alternateNames, rating]);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!session?.user?.id) return;

      const { data } = await supabase
        .from('profiles')
        .select('tv_order, chroma_box_enabled')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setTvOrder(data.tv_order || 'auto');
        setChromaBoxEnabled(data.chroma_box_enabled || false);
      }
    };

    if (isOpen) {
      loadPreferences();
    }
  }, [isOpen, session?.user?.id]);

  const handleResetLibrary = async () => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('user_movies')
        .delete()
        .eq('user_id', session.user.id);

      if (error) throw error;

      onReset();
      onClose();
      toast.success(t('common.success'));
    } catch (error) {
      console.error('Error resetting library:', error);
      toast.error(t('common.error'));
    }
  };

  const handleAlternateNameSave = () => {
    onAlternateNameChange(rating, alternateName);
    toast.success(t('common.success'));
  };

  const handleTvOrderChange = async (newOrder: 'auto' | 'first' | 'last') => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ tv_order: newOrder })
        .eq('id', session.user.id);

      if (error) throw error;

      setTvOrder(newOrder);
      toast.success(t('common.success'));

      // Force reload page to apply order
      window.location.reload();
    } catch (error) {
      console.error('Error updating tv_order:', error);
      toast.error(t('common.error'));
    }
  };

  const handleChromaBoxToggle = async () => {
    if (!session?.user?.id) return;

    try {
      const newValue = !chromaBoxEnabled;
      const { error } = await supabase
        .from('profiles')
        .update({ chroma_box_enabled: newValue })
        .eq('id', session.user.id);

      if (error) throw error;

      setChromaBoxEnabled(newValue);
      toast.success(t('common.success'));

      // Force reload page to apply effects
      window.location.reload();
    } catch (error) {
      console.error('Error updating chroma_box_enabled:', error);
      toast.error(t('common.error'));
    }
  };

  const handleDownloadMovieList = async () => {
    if (!session?.user?.id) return;

    try {
      setIsDownloading(true);

      const { data: userMoviesData, error } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', session.user.id)
        .not('rating', 'is', null)
        .order('rating', { ascending: false });

      if (error) throw error;

      if (!userMoviesData || userMoviesData.length === 0) {
        toast.error(t('library.noRatedMovies'));
        return;
      }

      const moviesWithDetails = await Promise.all(
        userMoviesData.map(async (movie) => {
          try {
            const details = await getMovieDetails(movie.movie_id);
            return {
              title: details.title,
              rating: movie.rating
            };
          } catch (err) {
            console.warn(`Failed to fetch details for movie ${movie.movie_id}`);
            return {
              title: 'Título não disponível',
              rating: movie.rating
            };
          }
        })
      );

      const worksheetData = moviesWithDetails.map((movie, index) => ({
        '#': index + 1,
        'Filme': movie.title,
        'Nota': movie.rating
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Filmes Avaliados');

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 50 },
        { wch: 10 }
      ];

      XLSX.writeFile(workbook, 'minha_lista_filmes.xls');
      toast.success(t('library.downloadSuccess'));
    } catch (error) {
      console.error('Error downloading movie list:', error);
      toast.error(t('common.error'));
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadWatchlist = async () => {
    if (!session?.user?.id) return;

    try {
      setIsDownloading(true);

      const { data: userMoviesData, error } = await supabase
        .from('user_movies')
        .select('movie_id, created_at')
        .eq('user_id', session.user.id)
        .is('rating', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!userMoviesData || userMoviesData.length === 0) {
        toast.error(t('library.noWatchlistMovies'));
        return;
      }

      const moviesWithDetails = await Promise.all(
        userMoviesData.map(async (movie) => {
          try {
            const details = await getMovieDetails(movie.movie_id);
            return {
              title: details.title,
              created_at: movie.created_at
            };
          } catch (err) {
            console.warn(`Failed to fetch details for movie ${movie.movie_id}`);
            return {
              title: 'Título não disponível',
              created_at: movie.created_at
            };
          }
        })
      );

      const worksheetData = moviesWithDetails.map((movie, index) => ({
        '#': index + 1,
        'Filme': movie.title,
        'Adicionado em': new Date(movie.created_at).toLocaleDateString()
      }));

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Watchlist');

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 50 },
        { wch: 15 }
      ];

      XLSX.writeFile(workbook, 'minha_watchlist.xls');
      toast.success(t('library.downloadSuccess'));
    } catch (error) {
      console.error('Error downloading watchlist:', error);
      toast.error(t('common.error'));
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  if (showResetConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
          <div className="p-6">
            <h3 className="text-xl font-bold text-red-600 dark:text-red-400 mb-4">
              WARNING: This action cannot be undone
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              This will permanently delete ALL rated movies from your account
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleResetLibrary}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-md transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('library.title')} {t('common.edit')}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-6">
          {/* Only show rename for rated boxes, not watchlist */}
          {rating !== null && (
            <div>
              <label
                htmlFor="alternateName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                {t('lists.enterName')} {t('library.rating', { value: rating })}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="alternateName"
                  value={alternateName}
                  onChange={(e) => setAlternateName(e.target.value)}
                  maxLength={30}
                  placeholder={t('lists.enterName')}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAlternateNameSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          )}

          {/* TV Series Order */}
          <div className={rating !== null ? 'border-t border-gray-200 dark:border-gray-700 pt-6' : ''}>
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              TV Series Order
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Control how TV series are displayed in rating boxes
            </p>
            <div className="space-y-2">
              <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="radio"
                  name="tvOrder"
                  value="auto"
                  checked={tvOrder === 'auto'}
                  onChange={() => handleTvOrderChange('auto')}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Automatic</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Mixed order (default)</div>
                </div>
              </label>

              <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="radio"
                  name="tvOrder"
                  value="first"
                  checked={tvOrder === 'first'}
                  onChange={() => handleTvOrderChange('first')}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Series First</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Show all series before movies</div>
                </div>
              </label>

              <label className="flex items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <input
                  type="radio"
                  name="tvOrder"
                  value="last"
                  checked={tvOrder === 'last'}
                  onChange={() => handleTvOrderChange('last')}
                  className="w-4 h-4 text-blue-600"
                />
                <div className="ml-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Series Last</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Show all series after movies</div>
                </div>
              </label>
            </div>
          </div>

          {/* Chroma Box */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
              Chroma Box
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Color-coded rating boxes with visual effects
            </p>
            <label className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">Enable Chroma Box</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">10: Gold | 9-7: Green | 6-4: Yellow | 3-1: Red | 0: Glitch</div>
              </div>
              <button
                onClick={handleChromaBoxToggle}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  chromaBoxEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ease-in-out ${
                    chromaBoxEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {t('common.export')}
            </h4>
            <div className="space-y-3">
              <button
                onClick={handleDownloadMovieList}
                disabled={isDownloading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-md hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <Download className="w-5 h-5" />
                <span>{isDownloading ? t('library.downloading') : t('library.downloadMovieList')}</span>
              </button>

              <button
                onClick={handleDownloadWatchlist}
                disabled={isDownloading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-md hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <List className="w-5 h-5" />
                <span>{isDownloading ? t('library.downloading') : t('library.downloadWatchlist')}</span>
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Danger Zone
            </h4>
            <button
              onClick={() => setShowResetConfirm(true)}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Reset Library
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryEditModal;