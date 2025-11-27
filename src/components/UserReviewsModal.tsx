import React, { useState, useEffect, useMemo } from 'react';
import { X, Star, AlertTriangle, Eye, EyeOff, Loader2, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { getMovieDetailsFromDB } from '../lib/tmdb';

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
}

interface MovieData {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

interface ReviewWithMovie extends Review {
  movieData?: MovieData;
}

interface UserReviewsModalProps {
  userId: string;
  username: string;
  onClose: () => void;
}

const UserReviewsModal: React.FC<UserReviewsModalProps> = ({ userId, username, onClose }) => {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<ReviewWithMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<'highest' | 'lowest' | 'recent'>('recent');

  useEffect(() => {
    fetchUserReviews();
  }, [userId]);

  const fetchUserReviews = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const reviewsWithMovies = await Promise.all(
        (data || []).map(async (review) => {
          try {
            const movieData = await getMovieDetailsFromDB(review.movie_id);
            return { ...review, movieData };
          } catch (err) {
            console.error(`Failed to fetch movie ${review.movie_id}:`, err);
            return { ...review, movieData: undefined };
          }
        })
      );

      setReviews(reviewsWithMovies);
    } catch (error) {
      console.error('Error fetching user reviews:', error);
    } finally {
      setLoading(false);
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
    return reviewsCopy;
  }, [reviews, sortOrder]);

  const renderReview = (review: ReviewWithMovie) => {
    const isRevealed = revealedSpoilers.has(review.id);
    const showSpoilerBlur = review.has_spoilers && !isRevealed;
    const movieTitle = review.movieData?.title || review.movieData?.name || 'Unknown';
    const year = review.movieData?.release_date || review.movieData?.first_air_date;
    const yearDisplay = year ? new Date(year).getFullYear() : '';

    return (
      <div
        key={review.id}
        className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
      >
        <div className="flex gap-4 mb-3">
          {review.movieData?.poster_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w92${review.movieData.poster_path}`}
              alt={movieTitle}
              className="w-16 h-24 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-24 rounded bg-gray-300 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Film className="w-8 h-8 text-gray-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                  {movieTitle} {yearDisplay && `(${yearDisplay})`}
                </h4>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded">
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                    <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                      {review.rating}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
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
              {username}'s Reviews
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
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
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : reviews.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  All Reviews
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
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {username} hasn't written any reviews yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(UserReviewsModal);
