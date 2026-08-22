import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Sparkles, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import MovieDetailsModal from './MovieDetailsModal';
import { getMovieDetailsFromDB } from '../lib/tmdb';

interface CompatibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  myUserId: string;
  otherUserId: string;
  otherUsername: string;
}

interface RawComparison {
  movie_id: number;
  media_type: string;
  rating_a: number;
  rating_b: number;
}

interface MovieComparison extends RawComparison {
  title: string;
  poster_path: string | null;
  diff: number;
}

const MIN_MOVIES = 3;

function getTier(score: number) {
  if (score >= 90) return { key: 'soulmates', color: 'text-emerald-500', ring: 'ring-emerald-400/40', bg: 'from-emerald-500/20 to-teal-500/20', emoji: '💫' };
  if (score >= 75) return { key: 'great', color: 'text-green-500', ring: 'ring-green-400/40', bg: 'from-green-500/20 to-emerald-500/20', emoji: '🎬' };
  if (score >= 60) return { key: 'good', color: 'text-blue-500', ring: 'ring-blue-400/40', bg: 'from-blue-500/20 to-cyan-500/20', emoji: '🍿' };
  if (score >= 40) return { key: 'different', color: 'text-amber-500', ring: 'ring-amber-400/40', bg: 'from-amber-500/20 to-orange-500/20', emoji: '🎭' };
  return { key: 'opposite', color: 'text-red-500', ring: 'ring-red-400/40', bg: 'from-red-500/20 to-rose-500/20', emoji: '🌗' };
}

export default function CompatibilityModal({ isOpen, onClose, myUserId, otherUserId, otherUsername }: CompatibilityModalProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<RawComparison[]>([]);
  const [comparisons, setComparisons] = useState<MovieComparison[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !myUserId || !otherUserId) return;
    fetchCompatibility();
  }, [isOpen, myUserId, otherUserId]);

  const fetchCompatibility = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .rpc('get_user_compatibility', { p_user_a: myUserId, p_user_b: otherUserId });
      if (error) throw error;
      const rows: RawComparison[] = data || [];
      setRaw(rows);

      if (rows.length === 0) {
        setComparisons([]);
        return;
      }

      // Busca título/pôster em lote pros filmes em comum, só o necessário
      // pra exibir a lista de maior concordância/discordância (não precisa
      // buscar todos se a lista de comuns for grande — só os que vamos
      // realmente mostrar, calculado depois de ordenar).
      const isPt = i18n.language.startsWith('pt');
      const ids = rows.map((r) => r.movie_id);
      const { data: cacheRows } = await supabase
        .from('movie_cache')
        .select('tmdb_id, media_type, title_en, title_pt, poster_path, poster_path_pt')
        .in('tmdb_id', ids);

      const cacheMap = new Map(
        (cacheRows || []).map((c: any) => [`${c.tmdb_id}_${c.media_type}`, c])
      );

      const enriched: MovieComparison[] = rows.map((r) => {
        const cached = cacheMap.get(`${r.movie_id}_${r.media_type}`);
        return {
          ...r,
          title: cached ? ((isPt && cached.title_pt) ? cached.title_pt : cached.title_en) : `#${r.movie_id}`,
          poster_path: cached ? ((isPt && cached.poster_path_pt) ? cached.poster_path_pt : cached.poster_path) : null,
          diff: Math.abs(r.rating_a - r.rating_b)
        };
      });
      setComparisons(enriched);
    } catch (error) {
      console.error('Error fetching compatibility:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (raw.length === 0) return null;
    const avgDiff = raw.reduce((sum, r) => sum + Math.abs(r.rating_a - r.rating_b), 0) / raw.length;
    const score = Math.max(0, Math.min(100, Math.round(100 - (avgDiff / 10) * 100)));
    return { score, count: raw.length, avgDiff };
  }, [raw]);

  const topAgreements = useMemo(
    () => [...comparisons].sort((a, b) => a.diff - b.diff || b.rating_a - a.rating_a).slice(0, 3),
    [comparisons]
  );
  const topDisagreements = useMemo(
    () => [...comparisons].sort((a, b) => b.diff - a.diff).slice(0, 3),
    [comparisons]
  );

  const handleOpenMovie = async (movieId: number, mediaType: string) => {
    setLoadingMovieId(movieId);
    try {
      const details = await getMovieDetailsFromDB(movieId, mediaType as 'movie' | 'tv');
      setSelectedMovie(details);
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingMovieId(null);
    }
  };

  if (!isOpen) return null;

  const tier = stats ? getTier(stats.score) : null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-gradient-to-br from-blue-50/95 via-purple-50/90 to-pink-50/95 dark:from-gray-900/95 dark:via-blue-950/90 dark:to-purple-950/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 dark:border-gray-700/60 p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-400/30 mb-3">
                <Sparkles className="w-7 h-7 text-pink-500 dark:text-pink-400" />
              </div>
              <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500">
                {t('compatibility.title')}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                {t('compatibility.subtitle', { username: otherUsername })}
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
              </div>
            ) : !stats || stats.count < MIN_MOVIES ? (
              <div className="text-center py-10 px-4">
                <div className="inline-flex p-4 rounded-full bg-gray-100 dark:bg-gray-800/50 mb-4">
                  <Film className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="font-bold text-gray-800 dark:text-white mb-1">
                  {t('compatibility.notEnoughDataTitle')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  {t('compatibility.notEnoughDataDescription', { count: stats?.count || 0, min: MIN_MOVIES })}
                </p>
              </div>
            ) : (
              <div>
                {/* Placar principal */}
                <div className="flex flex-col items-center mb-6">
                  <div className={`relative w-32 h-32 rounded-full bg-gradient-to-br ${tier!.bg} ring-4 ${tier!.ring} flex items-center justify-center mb-3`}>
                    <div className="text-center">
                      <div className={`text-3xl font-extrabold ${tier!.color}`}>{stats.score}%</div>
                    </div>
                  </div>
                  <p className={`text-lg font-bold ${tier!.color} flex items-center gap-1.5`}>
                    <span>{tier!.emoji}</span>
                    {t(`compatibility.tier.${tier!.key}`)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {t('compatibility.moviesCompared', { count: stats.count })}
                  </p>
                </div>

                {/* Onde mais concordam */}
                {topAgreements.length > 0 && (
                  <div className="mb-5">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      {t('compatibility.mostAgree')}
                    </h4>
                    <div className="space-y-1.5">
                      {topAgreements.map((m) => (
                        <button
                          key={`${m.movie_id}_${m.media_type}`}
                          onClick={() => handleOpenMovie(m.movie_id, m.media_type)}
                          className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/60 transition-colors text-left"
                        >
                          <img
                            src={m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : 'https://via.placeholder.com/80x120?text=No+Image'}
                            alt={m.title}
                            className="w-8 h-12 object-cover rounded flex-shrink-0"
                          />
                          <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white truncate">{m.title}</span>
                          <span className="flex-shrink-0 text-xs font-semibold text-green-600 dark:text-green-400">
                            {m.rating_a} / {m.rating_b}
                          </span>
                          {loadingMovieId === m.movie_id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Onde mais discordam */}
                {topDisagreements.length > 0 && topDisagreements[0].diff > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      {t('compatibility.mostDisagree')}
                    </h4>
                    <div className="space-y-1.5">
                      {topDisagreements.filter((m) => m.diff > 0).map((m) => (
                        <button
                          key={`${m.movie_id}_${m.media_type}`}
                          onClick={() => handleOpenMovie(m.movie_id, m.media_type)}
                          className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/60 transition-colors text-left"
                        >
                          <img
                            src={m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : 'https://via.placeholder.com/80x120?text=No+Image'}
                            alt={m.title}
                            className="w-8 h-12 object-cover rounded flex-shrink-0"
                          />
                          <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white truncate">{m.title}</span>
                          <span className="flex-shrink-0 text-xs font-semibold text-red-500 dark:text-red-400">
                            {m.rating_a} / {m.rating_b}
                          </span>
                          {loadingMovieId === m.movie_id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </>
  );
}