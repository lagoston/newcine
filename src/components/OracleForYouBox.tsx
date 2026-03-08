import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Star, Sparkles, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getMovieDetails, Movie } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';

interface Props {
  userId: string;
  hasEssence: boolean;
  personalidade?: string | null;
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

const OracleForYouBox: React.FC<Props> = ({ userId, hasEssence, personalidade }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [countdown, setCountdown] = useState(getBrasiliaCountdown());

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getBrasiliaCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

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
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 rounded-xl border border-amber-400/20 flex-shrink-0 ml-2">
              <Clock className="w-3 h-3 text-amber-500 dark:text-amber-400" />
              <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {formatCountdown(countdown)}
              </span>
            </div>
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
                {isPt ? 'Descobrir minha Essência' : 'Discover my Essence'}
              </Link>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
            </div>
          ) : movies.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {isPt ? 'Nenhuma recomendação disponível hoje' : 'No recommendations available today'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex gap-3 min-w-max">
                {movies.map((movie, idx) => (
                  <motion.button
                    key={movie.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: idx * 0.07 }}
                    onClick={() => setSelectedMovie(movie)}
                    className="group flex-shrink-0 w-[100px] text-left focus:outline-none"
                  >
                    <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-white/20 dark:border-gray-700/40 group-hover:shadow-xl group-hover:scale-[1.04] transition-all duration-300">
                      <OptimizedPoster
                        src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl">
                        <div className="absolute bottom-0 left-0 right-0 p-2">
                          <Eye className="w-4 h-4 text-white mx-auto" />
                        </div>
                      </div>
                      <div className="absolute top-1.5 left-1.5 bg-black/50 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                        <span className="text-white text-[10px] font-bold">{movie.vote_average?.toFixed(1)}</span>
                      </div>
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-sm">
                        <span className="text-white font-black" style={{ fontSize: '9px' }}>{idx + 1}</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-1 leading-tight">
                      {movie.title}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {movie.release_date ? new Date(movie.release_date).getFullYear() : ''}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {hasEssence && personalidade && (
            <div className="mt-4 pt-4 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {isPt ? 'Baseado na essência' : 'Based on essence'}
                  {' '}
                  <span className="font-bold text-amber-600 dark:text-amber-400">{personalidade}</span>
                </span>
              </div>
              <Link
                to="/oracle/recommend"
                className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-500 dark:hover:text-amber-300 transition-colors"
              >
                {isPt ? 'Explorar Oráculo →' : 'Explore Oracle →'}
              </Link>
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
