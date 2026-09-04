import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Star, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getMovieDetails, Movie } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import FloatingFriendBubbles from './FloatingFriendBubbles';

interface Props {
  userId: string;
  hasEssence: boolean;
}

function getBrasiliaCountdown(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(3, 0, 0, 0);
  if (now >= target) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return Math.max(0, target.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// Isolado num componente próprio — antes o timer de 1s vivia no
// OracleForYouBox inteiro, forçando TODO o componente (inclusive os
// cards de filme animados abaixo) a re-renderizar a cada segundo. Como
// as animações de entrada usam objetos initial/animate recriados a cada
// render, esse re-render constante causava um "flicker" visível nos
// pôsteres. Isolando o timer aqui, só esse badge pequeno re-renderiza a
// cada segundo — o resto da árvore fica parado.
const CountdownBadge: React.FC = () => {
  const [countdown, setCountdown] = useState(getBrasiliaCountdown());

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getBrasiliaCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 rounded-xl border border-amber-400/20 flex-shrink-0 ml-2">
      <Clock className="w-3 h-3 text-amber-500 dark:text-amber-400" />
      <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
        {formatCountdown(countdown)}
      </span>
    </div>
  );
};

const OracleForYouBox: React.FC<Props> = ({ userId, hasEssence }) => {
  const { t } = useTranslation();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        'get_or_create_user_oracle_recommendations',
        { p_user_id: userId }
      );
      if (error || !data || data.length === 0) return;

      const movieDetails = await Promise.all(
        (data as { movie_id: number; pool_position: number }[])
          .sort((a, b) => a.pool_position - b.pool_position)
          .map(row => getMovieDetails(row.movie_id).catch(() => null))
      );
      setMovies(movieDetails.filter((m): m is Movie => m !== null));
    } catch (err) {
      console.error('OracleForYouBox: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden mb-10"
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-400/10 to-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-yellow-400/10 to-amber-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-gradient-to-b from-amber-400 to-orange-500 rounded-full" />
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {t('home.oracleForYou')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('home.oracleForYouDesc')}
                </p>
              </div>
            </div>
            <CountdownBadge />
          </div>

          {!hasEssence ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-400/20">
                <Sparkles className="w-8 h-8 text-amber-500 dark:text-amber-400" />
              </div>
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 max-w-xs leading-relaxed">
                {t('home.oracleForYouNoEssence')}
              </p>
              <Link
                to="/oracle"
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                {t('oracle.discoverEssence')}
              </Link>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
            </div>
          ) : movies.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {t('oracle.noRecommendationsToday')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex gap-4">
                {movies.map((movie, idx) => (
                  <motion.div
                    key={movie.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                    className="relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group flex-shrink-0 shadow-xl hover:shadow-2xl"
                    style={{ width: '160px', height: '240px', transition: 'all 0.2s ease-out', willChange: 'transform' }}
                    onClick={() => setSelectedMovie(movie)}
                    whileHover={{ scale: 1.05, y: -8 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div
                      className="absolute top-2 left-2 bg-gradient-to-br from-amber-500 to-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg"
                      style={{ zIndex: 30, transform: 'translateZ(0)' }}
                    >
                      #{idx + 1}
                    </div>

                    <FloatingFriendBubbles movieId={movie.id} mediaType={movie.media_type || 'movie'} />

                    <OptimizedPoster
                      src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-300 ease-out"
                    />

                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out flex flex-col justify-end backdrop-blur-sm pointer-events-none">
                      <div className="p-3">
                        <h3 className="text-white font-bold mb-1.5 line-clamp-2 text-sm drop-shadow-lg">{movie.title}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="flex items-center bg-gradient-to-r from-blue-500/30 to-blue-600/30 backdrop-blur-md px-2 py-1 rounded-lg border border-blue-400/30 shadow-lg">
                            <Star className="w-3 h-3 fill-blue-400 text-blue-400" />
                            <span className="ml-1 text-blue-100 font-bold text-xs">{movie.vote_average?.toFixed(1)}</span>
                          </div>
                          <span className="text-gray-200 text-xs font-semibold bg-white/20 backdrop-blur-sm px-2 py-1 rounded-lg">
                            {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

        </div>
      </motion.div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </>
  );
};

export default OracleForYouBox;