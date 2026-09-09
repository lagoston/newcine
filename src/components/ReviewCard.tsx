import React, { useState } from 'react';
import { Star, AlertTriangle, Eye, EyeOff, Pencil, Trash2, Film, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Review {
  id: string;
  user_id: string;
  movie_id: number;
  media_type: string;
  title: string;
  content: string;
  has_spoilers: boolean;
  rating: number;
  is_ai_generated?: boolean;
  created_at: string;
  updated_at: string;
  profiles?: {
    username: string;
    avatar_url: string | null;
  };
}

export interface ReviewMovieInfo {
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
}

interface ReviewCardProps {
  review: Review;
  isOwnReview?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Quando presente, mostra o pôster + nome do filme acima da review —
      usado no UserReviewsModal (lista reviews de VÁRIOS filmes). No
      ReviewsModal (reviews de UM filme só, já visível no contexto) essa
      prop fica de fora. */
  movieInfo?: ReviewMovieInfo;
  /** Chamado ao clicar no pôster do filme — usado pra abrir o menu
      expandido (MovieDetailsModal) daquele filme. Só faz sentido junto
      com movieInfo. */
  onMovieClick?: () => void;
}

// Mesmo mapeamento de nota pra cor usado na Biblioteca (chroma box) —
// reaproveitado aqui pra dar a mesma identidade visual às reviews.
const getChromaClass = (rating: number | null | undefined): string => {
  if (rating === null || rating === undefined) return '';
  if (rating === 10) return 'chroma-box-gold';
  if (rating >= 7) return 'chroma-box-green';
  if (rating >= 4) return 'chroma-box-yellow';
  if (rating >= 1) return 'chroma-box-red';
  return 'chroma-box-glitch';
};

/**
 * Card de review compartilhado entre ReviewsModal e UserReviewsModal —
 * antes cada modal tinha sua própria cópia quase idêntica dessa
 * renderização (mesmo layout, mesmo blur de spoiler, mesma estrutura),
 * divergindo só em detalhes pequenos. Consolidado aqui numa única fonte
 * de verdade.
 */
const ReviewCard: React.FC<ReviewCardProps> = ({ review, isOwnReview = false, onEdit, onDelete, movieInfo, onMovieClick }) => {
  const { t } = useTranslation();
  const [isRevealed, setIsRevealed] = useState(false);
  const showSpoilerBlur = review.has_spoilers && !isRevealed;
  const chromaClass = getChromaClass(review.rating);

  const movieTitle = movieInfo?.title || movieInfo?.name;
  const movieYear = movieInfo?.release_date || movieInfo?.first_air_date;
  const movieYearDisplay = movieYear ? new Date(movieYear).getFullYear() : '';

  return (
    <div
      className={`rounded-2xl p-4 backdrop-blur-xl border transition-colors ${
        isOwnReview
          ? 'bg-blue-500/10 border-blue-400/40'
          : 'bg-white/5 dark:bg-gray-900/30 border-white/10 dark:border-gray-700/40'
      } ${chromaClass}`}
    >
      {movieInfo && (
        <div className="flex gap-3 mb-3 pb-3 border-b border-white/10 dark:border-gray-700/40">
          {movieInfo.poster_path ? (
            <img
              src={`https://image.tmdb.org/t/p/w92${movieInfo.poster_path}`}
              alt={movieTitle}
              onClick={onMovieClick}
              className={`w-12 h-[72px] rounded-lg object-cover flex-shrink-0 ${onMovieClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            />
          ) : (
            <div
              onClick={onMovieClick}
              className={`w-12 h-[72px] rounded-lg bg-gray-300/20 flex items-center justify-center flex-shrink-0 ${onMovieClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            >
              <Film className="w-5 h-5 text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h4
              onClick={onMovieClick}
              className={`font-semibold text-gray-900 dark:text-white truncate ${onMovieClick ? 'cursor-pointer hover:text-blue-500 transition-colors' : ''}`}
            >
              {movieTitle} {movieYearDisplay && `(${movieYearDisplay})`}
            </h4>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {review.profiles?.avatar_url ? (
            <img
              src={review.profiles.avatar_url}
              alt={review.profiles.username}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-300/30 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {review.profiles?.username?.[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {review.profiles?.username && (
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {review.profiles.username}
                </p>
              )}
              {isOwnReview && (
                <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full flex-shrink-0">
                  {t('reviews.you')}
                </span>
              )}
              <div className="flex items-center gap-1 bg-yellow-500/15 px-2 py-0.5 rounded-full flex-shrink-0">
                <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
                  {review.rating}
                </span>
              </div>
              {review.is_ai_generated && (
                <div className="flex items-center gap-1 bg-violet-500/15 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Sparkles className="w-3 h-3 text-violet-500" />
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    {t('reviews.aiGenerated')}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(review.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        {isOwnReview && (onEdit || onDelete) && (
          <div className="flex gap-1 flex-shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-1.5 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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
            {t('reviews.hasSpoilers')}
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
            onClick={() => setIsRevealed(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-xl font-medium">
              <Eye className="w-5 h-5" />
              {t('reviews.clickToReveal')}
            </div>
          </button>
        )}
        {!showSpoilerBlur && review.has_spoilers && (
          <button
            onClick={() => setIsRevealed(false)}
            className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <EyeOff className="w-4 h-4" />
            {t('reviews.hideSpoilers')}
          </button>
        )}
      </div>
    </div>
  );
};

export default ReviewCard;