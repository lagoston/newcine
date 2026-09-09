import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2, MessageSquare, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie } from '../lib/tmdb';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ConfirmationModal from './ConfirmationModal';
import ReviewCard, { Review } from './ReviewCard';

interface ReviewsModalProps {
  movie: Movie;
  onClose: () => void;
  userRating: number | null;
}

type SortOrder = 'recent' | 'highest' | 'lowest';

const ReviewsModal: React.FC<ReviewsModalProps> = ({ movie, onClose, userRating }) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasSpoilers, setHasSpoilers] = useState(false);
  const [saving, setSaving] = useState(false);

  const mediaType = movie.media_type || 'movie';
  const hasRating = userRating !== null;

  const fetchReviews = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('reviews')
        .select(`*, profiles:user_id ( username, avatar_url )`)
        .eq('movie_id', movie.id)
        .eq('media_type', mediaType)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allReviews = data || [];
      const currentUserReview = allReviews.find((r) => r.user_id === session?.user?.id);
      const otherReviews = allReviews.filter((r) => r.user_id !== session?.user?.id);

      setUserReview(currentUserReview || null);
      setReviews(otherReviews);

      if (currentUserReview) {
        setTitle(currentUserReview.title);
        setContent(currentUserReview.content);
        setHasSpoilers(currentUserReview.has_spoilers);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      toast.error(t('reviews.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [movie.id]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  const handleSaveReview = async () => {
    if (!session?.user?.id) return;
    if (!title.trim() || !content.trim()) {
      toast.error(t('reviews.titleAndContentRequired'));
      return;
    }
    if (content.length > 1500) {
      toast.error(t('reviews.charactersCount', { count: 1500 }));
      return;
    }

    try {
      setSaving(true);

      const reviewData = {
        user_id: session.user.id,
        movie_id: movie.id,
        media_type: mediaType,
        title: title.trim(),
        content: content.trim(),
        has_spoilers: hasSpoilers,
        rating: userRating,
      };

      if (userReview) {
        const { error } = await supabase.from('reviews').update(reviewData).eq('id', userReview.id);
        if (error) throw error;
        toast.success(t('reviews.updated'));
      } else {
        const { error } = await supabase.from('reviews').insert([reviewData]);
        if (error) throw error;
        toast.success(t('reviews.published'));
      }

      setShowWriteForm(false);
      await fetchReviews();
    } catch (error: any) {
      console.error('Error saving review:', error);
      toast.error(error.message || t('reviews.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!userReview) return;

    try {
      const { error } = await supabase.from('reviews').delete().eq('id', userReview.id);
      if (error) throw error;

      toast.success(t('reviews.deleted'));
      setUserReview(null);
      setTitle('');
      setContent('');
      setHasSpoilers(false);
      await fetchReviews();
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error(t('reviews.deleteError'));
    } finally {
      setShowDeleteConfirm(false);
    }
  };

  const sortedReviews = useMemo(() => {
    const reviewsCopy = [...reviews];
    if (sortOrder === 'highest') return reviewsCopy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (sortOrder === 'lowest') return reviewsCopy.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    return reviewsCopy;
  }, [reviews, sortOrder]);

  const sortOptions: { id: SortOrder; label: string; icon: React.ReactNode }[] = [
    { id: 'recent', label: t('reviews.mostRecent'), icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'highest', label: t('reviews.highestRating'), icon: <ArrowUp className="w-3.5 h-3.5" /> },
    { id: 'lowest', label: t('reviews.lowestRating'), icon: <ArrowDown className="w-3.5 h-3.5" /> },
  ];

  return (
    <>
      {createPortal(
        <AnimatePresence>
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
              <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-blue-400/15 to-purple-500/15 rounded-full blur-3xl pointer-events-none" />

              <div className="relative flex-shrink-0 flex items-center justify-between p-5 sm:p-6 border-b border-gray-200/50 dark:border-gray-700/50">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30">
                      <MessageSquare className="w-5 h-5 text-blue-500" />
                    </div>
                    {t('reviews.title')}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                    {movie.title || movie.name}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                {!hasRating && (
                  <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-2xl p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-700 dark:text-yellow-300">
                        {t('reviews.rateToReview')}
                      </p>
                      <p className="text-sm text-yellow-600/80 dark:text-yellow-400/80 mt-1">
                        {t('reviews.rateToReviewHint')}
                      </p>
                    </div>
                  </div>
                )}

                {hasRating && !showWriteForm && !userReview && (
                  <button
                    onClick={() => setShowWriteForm(true)}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-2xl transition-colors shadow-lg hover:shadow-xl"
                  >
                    {t('reviews.writeReview')}
                  </button>
                )}

                {hasRating && showWriteForm && (
                  <div className="bg-gray-50/70 dark:bg-gray-900/40 rounded-2xl p-4 space-y-4 border border-gray-200/50 dark:border-gray-700/50">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {userReview ? t('reviews.editReview') : t('reviews.writeReview')}
                    </h3>

                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('reviews.titlePlaceholder')}
                      className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-700/60 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-400/50 backdrop-blur-sm"
                      maxLength={100}
                    />

                    <div>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={t('reviews.contentPlaceholder')}
                        className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-700/60 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-400/50 backdrop-blur-sm resize-none"
                        rows={7}
                        maxLength={1500}
                      />
                      <div className="flex justify-end mt-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t('reviews.charactersCount', { count: content.length })}
                        </span>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasSpoilers}
                        onChange={(e) => setHasSpoilers(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {t('reviews.containsSpoilersCheckbox')}
                      </span>
                    </label>

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveReview}
                        disabled={saving || !title.trim() || !content.trim()}
                        className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('reviews.saving')}
                          </>
                        ) : (
                          t('reviews.save')
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setShowWriteForm(false);
                          if (userReview) {
                            setTitle(userReview.title);
                            setContent(userReview.content);
                            setHasSpoilers(userReview.has_spoilers);
                          }
                        }}
                        className="px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {userReview && !showWriteForm && (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                      {t('reviews.yourReview')}
                    </h3>
                    <ReviewCard
                      review={userReview}
                      isOwnReview
                      onEdit={() => setShowWriteForm(true)}
                      onDelete={() => setShowDeleteConfirm(true)}
                    />
                  </div>
                )}

                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                  </div>
                ) : reviews.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {t('reviews.communityReviews')} ({reviews.length})
                      </h3>
                      <div className="flex gap-1.5">
                        {sortOptions.map((opt) => (
                          <button
                            key={opt.id}
                            onClick={() => setSortOrder(opt.id)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              sortOrder === opt.id
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600/60'
                            }`}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {sortedReviews.map((review) => (
                        <ReviewCard key={review.id} review={review} />
                      ))}
                    </div>
                  </div>
                ) : (
                  !userReview && (
                    <div className="text-center py-12">
                      <p className="text-gray-400 dark:text-gray-500">
                        {t('reviews.noReviews')}
                      </p>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteReview}
        title={t('reviews.deleteConfirmTitle')}
        message={t('reviews.deleteConfirmMessage')}
      />
    </>
  );
};

export default React.memo(ReviewsModal);