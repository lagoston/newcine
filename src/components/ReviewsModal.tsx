import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Clock, ArrowUp, ArrowDown, Sparkles, ArrowLeft, Star, PenLine, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie } from '../lib/tmdb';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ConfirmationModal from './ConfirmationModal';
import ReviewCard, { Review } from './ReviewCard';
import OracleReviewSection from './OracleReviewSection';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

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
  const [showOraclePanel, setShowOraclePanel] = useState(false);
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
        // Qualquer edição manual — mesmo que a review tenha nascido do
        // Oráculo — deixa de ser puramente gerada pela IA, já que o
        // usuário agora participou do texto. O selo "Gerado pelo
        // Oráculo" só faz sentido pro texto exato que saiu da geração;
        // uma vez editado, vira uma review normal do usuário. Pra
        // reviews que já eram normais (is_ai_generated já false), isso
        // não muda nada.
        is_ai_generated: false,
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

  const fieldClass = 'w-full px-4 rounded-xl ring-1 ring-white/10 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-[15px] placeholder:text-[#BDB4D6]/70';
  const sectionHeading = (text: React.ReactNode) => (
    <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{text}</h3>
  );

  return (
    <>
      <OracleSheet
        open
        onClose={onClose}
        title={t('reviews.title')}
        subtitle={movie.title || movie.name}
        size="lg"
        zIndexClass="z-[10010]"
        escapeEnabled={!showDeleteConfirm}
        bodyClassName="px-5 sm:px-7 py-5 space-y-6"
      >
        {!hasRating && (
          <div className="flex items-start gap-3 rounded-xl px-4 py-3.5 ring-1 ring-amber-300/25 bg-amber-400/10">
            <Star className="w-5 h-5 mt-0.5 shrink-0 text-amber-300" aria-hidden />
            <div>
              <p className="font-medium text-amber-100">{t('reviews.rateToReview')}</p>
              <p className="mt-0.5 text-sm text-amber-100/70">{t('reviews.rateToReviewHint')}</p>
            </div>
          </div>
        )}

        {!loading && hasRating && !showWriteForm && !userReview && !showOraclePanel && (
          <div className="grid sm:grid-cols-2 gap-2.5">
            <button
              onClick={() => setShowWriteForm(true)}
              className={`inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
            >
              <PenLine className="w-[18px] h-[18px]" aria-hidden />
              {t('reviews.writeReview')}
            </button>
            <button
              onClick={() => setShowOraclePanel(true)}
              className={`inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-pink-400/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-100 font-semibold transition ${FOCUS_RING}`}
            >
              <Sparkles className="w-[18px] h-[18px] text-pink-300" aria-hidden />
              {t('reviews.oracle.generateReviewButton')}
            </button>
          </div>
        )}

        {showOraclePanel ? (
          <div className="space-y-4">
            <button
              onClick={() => setShowOraclePanel(false)}
              className={`-ml-2 inline-flex justify-start items-center gap-1.5 px-2 rounded-lg text-sm font-medium hover:bg-white/5 transition ${FOCUS_RING}`}
              style={{ color: MIST }}
            >
              <ArrowLeft className="w-4 h-4" aria-hidden />
              {t('common.back')}
            </button>
            <OracleReviewSection
              movie={movie}
              userRating={userRating as number}
              onPosted={() => {
                setShowOraclePanel(false);
                fetchReviews();
              }}
            />
          </div>
        ) : (
          <>
            {hasRating && showWriteForm && (
              <div className="rounded-2xl p-4 sm:p-5 space-y-4 ring-1 ring-white/10" style={{ background: VELVET }}>
                {sectionHeading(userReview ? t('reviews.editReview') : t('reviews.writeReview'))}

                <label className="block">
                  <span className="sr-only">{t('reviews.titlePlaceholder')}</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('reviews.titlePlaceholder')}
                    className={`${fieldClass} h-12 font-medium`}
                    style={{ background: 'rgba(18,13,34,0.7)', color: PAPER }}
                    maxLength={100}
                  />
                </label>

                <label className="block">
                  <span className="sr-only">{t('reviews.contentPlaceholder')}</span>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t('reviews.contentPlaceholder')}
                    className={`${fieldClass} py-3 resize-none leading-relaxed`}
                    style={{ background: 'rgba(18,13,34,0.7)', color: PAPER }}
                    rows={7}
                    maxLength={1500}
                  />
                  <span className="block mt-1 text-xs text-right tabular-nums" style={{ color: MIST }}>
                    {t('reviews.charactersCount', { count: content.length })}
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasSpoilers}
                    onChange={(e) => setHasSpoilers(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="grid place-items-center w-5 h-5 rounded-md ring-2 ring-white/25 peer-checked:ring-amber-300 peer-checked:bg-amber-300 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fuchsia-300 transition"
                  >
                    {hasSpoilers && <Check className="w-3.5 h-3.5 text-[#221B36]" strokeWidth={3} />}
                  </span>
                  <span className="text-sm" style={{ color: PAPER }}>{t('reviews.containsSpoilersCheckbox')}</span>
                </label>

                <div className="flex gap-2.5 pt-1">
                  <button
                    onClick={handleSaveReview}
                    disabled={saving || !title.trim() || !content.trim()}
                    className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
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
                    className={`h-12 px-5 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 font-medium transition ${FOCUS_RING}`}
                    style={{ color: MIST }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            {userReview && !showWriteForm && (
              <section className="space-y-3">
                {sectionHeading(t('reviews.yourReview'))}
                <ReviewCard
                  review={userReview}
                  isOwnReview
                  onEdit={() => setShowWriteForm(true)}
                  onDelete={() => setShowDeleteConfirm(true)}
                />
              </section>
            )}

            {loading ? (
              <div className="space-y-3" aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: VELVET }} />
                ))}
              </div>
            ) : reviews.length > 0 ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2">
                  {sectionHeading(
                    <>
                      {t('reviews.communityReviews')}{' '}
                      <span style={{ color: MIST }}>({reviews.length})</span>
                    </>
                  )}
                  <div className="flex rounded-full ring-1 ring-white/10 p-0.5" role="group" aria-label={t('reviews.communityReviews')}>
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setSortOrder(opt.id)}
                        aria-pressed={sortOrder === opt.id}
                        className={`inline-flex items-center gap-1 px-3 rounded-full text-xs font-medium whitespace-nowrap transition ${FOCUS_RING} ${
                          sortOrder === opt.id ? 'bg-white/10' : 'hover:bg-white/5'
                        }`}
                        style={{ color: sortOrder === opt.id ? PAPER : MIST }}
                      >
                        <span className="hidden sm:inline-flex" aria-hidden>{opt.icon}</span>
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
              </section>
            ) : (
              !userReview && (
                <p className="py-10 text-center text-sm" style={{ color: MIST }}>
                  {t('reviews.noReviews')}
                </p>
              )
            )}
          </>
        )}
      </OracleSheet>

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