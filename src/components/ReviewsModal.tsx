import React, { useState, useEffect, useMemo } from 'react';
import { X, Star, AlertTriangle, Eye, EyeOff, Loader2, Pencil, Trash2, ArrowUpDown } from 'lucide-react';
import GlassLoader from './GlassLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie } from '../lib/tmdb';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Review {
  id: string;
  user_id: string;
  movie_id: number;
  media_type: string;
  title: string;
  content: string;
  has_spoilers: boolean;
  rating: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    username: string;
    avatar_url: string | null;
  };
}

interface ReviewsModalProps {
  movie: Movie;
  onClose: () => void;
  userRating: number | null;
}

const ReviewsModal: React.FC<ReviewsModalProps> = ({ movie, onClose, userRating }) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWriteForm, setShowWriteForm] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'highest' | 'lowest' | 'recent'>('recent');

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [hasSpoilers, setHasSpoilers] = useState(false);
  const [saving, setSaving] = useState(false);

  const mediaType = movie.media_type || 'movie';
  const hasRating = userRating !== null;

  useEffect(() => {
    fetchReviews();
  }, [movie.id]);

  const fetchReviews = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          profiles:user_id (
            username,
            avatar_url
          )
        `)
        .eq('movie_id', movie.id)
        .eq('media_type', mediaType)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const allReviews = data || [];
      const currentUserReview = allReviews.find(r => r.user_id === session?.user?.id);
      const otherReviews = allReviews.filter(r => r.user_id !== session?.user?.id);

      setUserReview(currentUserReview || null);
      setReviews(otherReviews);

      if (currentUserReview) {
        setTitle(currentUserReview.title);
        setContent(currentUserReview.content);
        setHasSpoilers(currentUserReview.has_spoilers);
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
      toast.error('Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReview = async () => {
    if (!session?.user?.id) return;
    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required');
      return;
    }
    if (content.length > 1500) {
      toast.error('Review content must be 1500 characters or less');
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
        rating: userRating
      };

      if (userReview) {
        const { error } = await supabase
          .from('reviews')
          .update(reviewData)
          .eq('id', userReview.id);

        if (error) throw error;
        toast.success('Review updated successfully');
      } else {
        const { error } = await supabase
          .from('reviews')
          .insert([reviewData]);

        if (error) throw error;
        toast.success('Review published successfully');
      }

      setShowWriteForm(false);
      await fetchReviews();
    } catch (error: any) {
      console.error('Error saving review:', error);
      toast.error(error.message || 'Failed to save review');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReview = async () => {
    if (!userReview) return;
    if (!confirm('Are you sure you want to delete your review?')) return;

    try {
      const { error } = await supabase
        .from('reviews')
        .delete()
        .eq('id', userReview.id);

      if (error) throw error;

      toast.success('Review deleted successfully');
      setUserReview(null);
      setTitle('');
      setContent('');
      setHasSpoilers(false);
      await fetchReviews();
    } catch (error) {
      console.error('Error deleting review:', error);
      toast.error('Failed to delete review');
    }
  };

  const toggleSpoiler = (reviewId: string) => {
    setRevealedSpoilers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reviewId)) {
        newSet.delete(reviewId);
      } else {
        newSet.add(reviewId);
      }
      return newSet;
    });
  };

  const sortedReviews = useMemo(() => {
    const reviewsCopy = [...reviews];
    if (sortOrder === 'highest') {
      return reviewsCopy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortOrder === 'lowest') {
      return reviewsCopy.sort((a, b) => (a.rating || 0) - (b.rating || 0));
    }
    return reviewsCopy; // recent (already sorted by created_at desc)
  }, [reviews, sortOrder]);

  const renderReview = (review: Review, isUserReview: boolean = false) => {
    const isRevealed = revealedSpoilers.has(review.id);
    const showSpoilerBlur = review.has_spoilers && !isRevealed;

    return (
      <div
        key={review.id}
        className={`bg-gray-50 dark:bg-gray-800 rounded-lg p-4 ${
          isUserReview ? 'border-2 border-blue-500' : ''
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {review.profiles?.avatar_url ? (
              <img
                src={review.profiles.avatar_url}
                alt={review.profiles.username}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                <span className="text-sm font-medium">
                  {review.profiles?.username?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 dark:text-white">
                  {review.profiles?.username}
                </p>
                {isUserReview && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
                    You
                  </span>
                )}
                <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded">
                  <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                  <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                    {review.rating}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(review.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          {isUserReview && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowWriteForm(true);
                }}
                className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={handleDeleteReview}
                className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
          {review.title}
        </h3>

        {review.has_spoilers && (
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
              Contains Spoilers
            </span>
          </div>
        )}

        <div className="relative">
          <p
            className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${
              showSpoilerBlur ? 'blur-sm select-none' : ''
            }`}
          >
            {review.content}
          </p>
          {showSpoilerBlur && (
            <button
              onClick={() => toggleSpoiler(review.id)}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors rounded"
            >
              <div className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-medium">
                <Eye className="w-5 h-5" />
                Click to Reveal Spoilers
              </div>
            </button>
          )}
          {!showSpoilerBlur && review.has_spoilers && (
            <button
              onClick={() => toggleSpoiler(review.id)}
              className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <EyeOff className="w-4 h-4" />
              Hide Spoilers
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reviews
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {movie.title || movie.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!hasRating && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-900 dark:text-yellow-200">
                  Rate this {mediaType} to write a review
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  You need to rate this {mediaType} before you can write a review.
                </p>
              </div>
            </div>
          )}

          {hasRating && !showWriteForm && !userReview && (
            <button
              onClick={() => setShowWriteForm(true)}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 rounded-lg transition-colors"
            >
              Write a Review
            </button>
          )}

          {hasRating && showWriteForm && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {userReview ? 'Edit Your Review' : 'Write Your Review'}
              </h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your review a title"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your Review
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Share your thoughts..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                  rows={8}
                  maxLength={1500}
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {content.length}/1500 characters
                  </span>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasSpoilers}
                  onChange={(e) => setHasSpoilers(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  This review contains spoilers
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={handleSaveReview}
                  disabled={saving || !title.trim() || !content.trim()}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Review'
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
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {userReview && !showWriteForm && (
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                Your Review
              </h3>
              {renderReview(userReview, true)}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <GlassLoader size="md" />
            </div>
          ) : reviews.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Community Reviews ({reviews.length})
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">Sort by:</span>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'highest' | 'lowest' | 'recent')}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="recent">Most Recent</option>
                    <option value="highest">Highest Rating</option>
                    <option value="lowest">Lowest Rating</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                {sortedReviews.map(review => renderReview(review))}
              </div>
            </div>
          ) : (
            !userReview && (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400">
                  No reviews yet. Be the first to write one!
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReviewsModal);
