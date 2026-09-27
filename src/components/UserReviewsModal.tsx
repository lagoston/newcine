import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, MessageSquare, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { getMoviesFromCacheByType, getMovieDetails, Movie } from '../lib/tmdb';
import ReviewCard, { Review, ReviewMovieInfo } from './ReviewCard';
import MovieDetailsModal from './MovieDetailsModal';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

interface ReviewWithMovie extends Review {
  movieData?: ReviewMovieInfo;
}

interface UserReviewsModalProps {
  userId: string;
  username: string;
  onClose: () => void;
}

type SortOrder = 'recent' | 'highest' | 'lowest';

const UserReviewsModal: React.FC<UserReviewsModalProps> = ({ userId, username, onClose }) => {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<ReviewWithMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(false);

  const fetchUserReviews = async () => {
    try {
      setLoading(true);

      const [reviewsResult, profileResult] = await Promise.all([
        supabase
          .from('reviews')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        // O avatar não vinha em lugar nenhum antes — cada review criada
        // aqui nunca recebia review.profiles, que é o que o ReviewCard
        // usa pra desenhar o avatar. Como é sempre o MESMO usuário pra
        // todas as reviews desse modal, uma única busca resolve pra
        // todas de uma vez.
        supabase.from('profiles').select('avatar_url').eq('id', userId).maybeSingle(),
      ]);

      if (reviewsResult.error) throw reviewsResult.error;

      const reviewsData = reviewsResult.data || [];
      const avatarUrl = profileResult.data?.avatar_url ?? null;

      // Antes buscava os dados de CADA filme numa consulta separada,
      // uma promise por review — com muitas reviews, disparava dezenas
      // de requisições onde uma só bastaria. getMoviesFromCacheByType
      // já existe pronta pra isso: busca todos de uma vez, e diferencia
      // filme de série pela chave composta (id+tipo) — getMoviesFromCache
      // (sem "ByType") chaveia só por id numérico, então um filme e uma
      // série com o mesmo tmdb_id colidiam no mapa, fazendo o pôster
      // (e o resto dos dados) vir errado ou vazio pra um dos dois.
      const movieEntries = reviewsData.map((r) => ({ movie_id: r.movie_id, media_type: r.media_type || 'movie' }));
      const moviesMap = movieEntries.length > 0 ? await getMoviesFromCacheByType(movieEntries) : new Map();

      const reviewsWithMovies: ReviewWithMovie[] = reviewsData.map((review) => ({
        ...review,
        movieData: moviesMap.get(`${review.movie_id}_${review.media_type || 'movie'}`),
        profiles: { username, avatar_url: avatarUrl },
      }));

      setReviews(reviewsWithMovies);
    } catch (error) {
      console.error('Error fetching user reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMovieClick = async (review: ReviewWithMovie) => {
    if (loadingMovie) return;
    try {
      setLoadingMovie(true);
      const details = await getMovieDetails(review.movie_id, (review.media_type as 'movie' | 'tv') || 'movie');
      setSelectedMovie(details);
    } catch (error) {
      console.error('Error loading movie:', error);
    } finally {
      setLoadingMovie(false);
    }
  };

  useEffect(() => {
    fetchUserReviews();
  }, [userId]);

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
      <OracleSheet
        open
        onClose={onClose}
        title={username || t('reviews.title')}
        subtitle={loading ? t('reviews.title') : t('reviews.reviewCount', { count: reviews.length })}
        leading={
          <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl ring-1 ring-white/10" style={{ background: VELVET }}>
            {loadingMovie ? <Loader2 className="w-5 h-5 animate-spin text-violet-300" aria-hidden /> : <MessageSquare className="w-5 h-5 text-violet-300" aria-hidden />}
          </span>
        }
        size="lg"
        zIndexClass="z-[10000]"
        escapeEnabled={!selectedMovie}
        bodyClassName="px-5 sm:px-7 py-5"
      >
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl animate-pulse" style={{ background: VELVET }} />
            ))}
          </div>
        ) : reviews.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-2">
              <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{t('reviews.allReviews')}</h3>
              <div className="flex rounded-full ring-1 ring-white/10 p-0.5" role="group" aria-label={t('reviews.allReviews')}>
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
                <ReviewCard
                  key={review.id}
                  review={review}
                  movieInfo={review.movieData}
                  onMovieClick={() => handleMovieClick(review)}
                />
              ))}
            </div>
          </section>
        ) : (
          <p className="py-12 text-center text-sm" style={{ color: MIST }}>
            {t('reviews.userHasNoReviews', { username })}
          </p>
        )}
      </OracleSheet>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          zIndexClass="z-[10001]"
        />
      )}
    </>
  );
};

export default React.memo(UserReviewsModal);