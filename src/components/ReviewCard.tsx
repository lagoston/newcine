import React, { useState } from 'react';
import { Star, AlertTriangle, Eye, EyeOff, Pencil, Trash2, Film, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../lib/oracleTheme';

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

/**
 * Card de review compartilhado entre ReviewsModal e UserReviewsModal —
 * uma única fonte de verdade pro layout, o desfoque de spoiler e as ações.
 * A cor da nota (mesma faixa das rating boxes) aparece no selo e numa
 * faixa fina à esquerda do card.
 */
const ReviewCard: React.FC<ReviewCardProps> = ({ review, isOwnReview = false, onEdit, onDelete, movieInfo, onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const [isRevealed, setIsRevealed] = useState(false);
  const showSpoilerBlur = review.has_spoilers && !isRevealed;
  const hasRating = review.rating !== null && review.rating !== undefined;
  const tone = hasRating ? ratingTone(review.rating) : { color: MIST, ring: 'rgba(189,180,214,0.35)' };

  const movieTitle = movieInfo?.title || movieInfo?.name;
  const movieYear = movieInfo?.release_date || movieInfo?.first_air_date;
  const movieYearDisplay = movieYear ? movieYear.slice(0, 4) : '';
  const createdAt = new Date(review.created_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const moviePoster = movieInfo?.poster_path ? (
    <img
      src={`https://image.tmdb.org/t/p/w92${movieInfo.poster_path}`}
      alt=""
      className="w-12 h-[72px] rounded-lg object-cover ring-1 ring-white/10"
    />
  ) : (
    <span className="grid place-items-center w-12 h-[72px] rounded-lg ring-1 ring-white/10" style={{ background: NIGHT, color: MIST }}>
      <Film className="w-5 h-5" aria-hidden />
    </span>
  );

  return (
    <article
      className={`relative rounded-2xl p-4 sm:p-5 ring-1 overflow-hidden ${isOwnReview ? 'ring-violet-400/40' : 'ring-white/10'}`}
      style={{ background: VELVET }}
    >
      <span aria-hidden className="absolute left-0 inset-y-0 w-1" style={{ background: tone.color, opacity: 0.8 }} />

      {movieInfo && (
        onMovieClick ? (
          <button
            onClick={onMovieClick}
            className={`w-full flex justify-start items-center gap-3 mb-3 pb-3 border-b border-white/[0.07] text-left group rounded-lg ${FOCUS_RING}`}
          >
            <span className="shrink-0 group-hover:opacity-85 transition-opacity">{moviePoster}</span>
            <span className="min-w-0 font-semibold truncate group-hover:underline underline-offset-4" style={{ color: PAPER }}>
              {movieTitle} {movieYearDisplay && <span style={{ color: MIST }}>({movieYearDisplay})</span>}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/[0.07]">
            <span className="shrink-0">{moviePoster}</span>
            <span className="min-w-0 font-semibold truncate" style={{ color: PAPER }}>
              {movieTitle} {movieYearDisplay && <span style={{ color: MIST }}>({movieYearDisplay})</span>}
            </span>
          </div>
        )
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {review.profiles?.avatar_url ? (
            <img
              src={review.profiles.avatar_url}
              alt=""
              className="w-9 h-9 rounded-full object-cover shrink-0 ring-1 ring-white/15"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="grid place-items-center w-9 h-9 rounded-full shrink-0 ring-1 ring-white/15 text-sm font-semibold" style={{ background: NIGHT, color: PAPER }}>
              {review.profiles?.username?.[0]?.toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {review.profiles?.username && (
                <p className="font-medium truncate" style={{ color: PAPER }}>{review.profiles.username}</p>
              )}
              {isOwnReview && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/25 text-violet-100">
                  {t('reviews.you')}
                </span>
              )}
              {hasRating && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] leading-none"
                  style={{ ...PIXEL, color: tone.color, boxShadow: `inset 0 0 0 1.5px ${tone.ring}` }}
                >
                  <Star className="w-3 h-3 fill-current" aria-hidden />
                  {review.rating}
                </span>
              )}
              {review.is_ai_generated && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-pink-500/15 text-pink-200">
                  <Sparkles className="w-3 h-3" aria-hidden />
                  {t('reviews.aiGenerated')}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: MIST }}>{createdAt}</p>
          </div>
        </div>
        {isOwnReview && (onEdit || onDelete) && (
          <div className="flex shrink-0 -mr-2 -mt-1">
            {onEdit && (
              <button
                onClick={onEdit}
                aria-label={t('reviews.editReview')}
                title={t('reviews.editReview')}
                className={`rounded-full text-violet-200 hover:bg-white/10 transition ${FOCUS_RING}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={onDelete}
                aria-label={t('common.delete')}
                title={t('common.delete')}
                className={`rounded-full text-red-300 hover:bg-red-500/15 transition ${FOCUS_RING}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <h4 className="mt-3 font-semibold leading-snug" style={{ color: PAPER }}>{review.title}</h4>

      {review.has_spoilers && (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-300">
          <AlertTriangle className="w-4 h-4" aria-hidden />
          {t('reviews.hasSpoilers')}
        </p>
      )}

      <div className="relative mt-2">
        <p
          className={`whitespace-pre-wrap text-[15px] leading-relaxed ${showSpoilerBlur ? 'blur-sm select-none' : ''}`}
          style={{ color: 'rgba(243,234,211,0.85)' }}
          aria-hidden={showSpoilerBlur || undefined}
        >
          {review.content}
        </p>
        {showSpoilerBlur && (
          <button
            onClick={() => setIsRevealed(true)}
            className={`absolute inset-0 bg-black/25 hover:bg-black/35 transition-colors rounded-lg ${FOCUS_RING}`}
          >
            <span className="inline-flex items-center gap-2 px-4 h-10 rounded-full bg-amber-300 text-[#221B36] text-sm font-semibold shadow-lg">
              <Eye className="w-4 h-4" aria-hidden />
              {t('reviews.clickToReveal')}
            </span>
          </button>
        )}
        {!showSpoilerBlur && review.has_spoilers && (
          <button
            onClick={() => setIsRevealed(false)}
            className={`mt-1 -ml-2 inline-flex justify-start items-center gap-1.5 px-2 rounded-lg text-sm hover:bg-white/5 transition ${FOCUS_RING}`}
            style={{ color: MIST }}
          >
            <EyeOff className="w-4 h-4" aria-hidden />
            {t('reviews.hideSpoilers')}
          </button>
        )}
      </div>
    </article>
  );
};

export default ReviewCard;
