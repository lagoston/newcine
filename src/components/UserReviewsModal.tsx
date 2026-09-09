import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, MessageSquare, Clock, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { getMoviesFromCacheByType, getMovieDetails, Movie } from '../lib/tmdb';
import ReviewCard, { Review, ReviewMovieInfo } from './ReviewCard';
import MovieDetailsModal from './MovieDetailsModal';

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

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

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
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+4rem)]">
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
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-2xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-blue-400/15 to-purple-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex-shrink-0 flex items-center justify-between p-5 sm:p-6 border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                </div>
                <span className="truncate">{username}</span>
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('reviews.reviewCount', { count: reviews.length })}
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
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
              </div>
            ) : reviews.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {t('reviews.allReviews')}
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
                    <ReviewCard
                      key={review.id}
                      review={review}
                      movieInfo={review.movieData}
                      onMovieClick={() => handleMovieClick(review)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400 dark:text-gray-500">
                  {t('reviews.userHasNoReviews', { username })}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
        </AnimatePresence>,
        document.body
      )}

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