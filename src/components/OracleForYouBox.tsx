import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Star, Sparkles, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getMovieDetails, Movie } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import FloatingFriendBubbles from './FloatingFriendBubbles';
import { NIGHT, VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, POSTER_TITLE } from '../lib/oracleTheme';

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

// Isolado num componente próprio: só esse selo re-renderiza a cada
// segundo, não a fileira de pôsteres inteira.
const CountdownBadge: React.FC = () => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(getBrasiliaCountdown());

  useEffect(() => {
    const interval = setInterval(() => setCountdown(getBrasiliaCountdown()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-black/25 ring-1 ring-white/10 text-sm shrink-0" style={{ color: MIST }}>
      <Clock className="w-4 h-4 text-pink-300" aria-hidden />
      <span>{t('oracle.forYou.renewsIn')}</span>
      <span style={{ ...PIXEL, color: PAPER }} className="text-base leading-none tabular-nums">
        {formatCountdown(countdown)}
      </span>
    </span>
  );
};

// "Do Oráculo para Você": os 5 filmes do dia, escolhidos a partir do que
// você já viu. Renova todo dia às 00:00 de Brasília. Usado na Biblioteca
// dos Oráculos e em Adicionar filmes.
const OracleForYouBox: React.FC<Props> = ({ userId, hasEssence }) => {
  const { t, i18n } = useTranslation();

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_or_create_user_oracle_recommendations', { p_user_id: userId });
      if (error || !data || data.length === 0) return;

      const movieDetails = await Promise.all(
        (data as { movie_id: number; pool_position: number }[])
          .sort((a, b) => a.pool_position - b.pool_position)
          .map((row) => getMovieDetails(row.movie_id).catch(() => null)),
      );
      setMovies(movieDetails.filter((m): m is Movie => m !== null));
    } catch (err) {
      console.error('OracleForYouBox: fetch error', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!hasEssence) {
      setLoading(false);
      return;
    }
    fetchRecommendations();
  }, [fetchRecommendations, hasEssence]);

  const formatScore = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <>
      <div className="rounded-2xl ring-1 ring-white/10 p-5 sm:p-6" style={{ background: `radial-gradient(ellipse 60% 70% at 100% 0%, rgba(236,72,153,0.12), transparent 70%), ${VELVET}` }}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
              <Sparkles className="w-5 h-5 text-pink-300" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
                {t('home.oracleForYou')}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: MIST }}>
                {t('home.oracleForYouDesc')}
              </p>
            </div>
          </div>
          {hasEssence && <CountdownBadge />}
        </div>

        {!hasEssence ? (
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl px-4 py-4 bg-black/20">
            <p className="flex-1 text-sm leading-relaxed" style={{ color: MIST }}>
              {t('home.oracleForYouNoEssence')}
            </p>
            <Link
              to="/oracle"
              className={`shrink-0 gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
            >
              <Sparkles className="w-[18px] h-[18px]" aria-hidden />
              {t('oracle.discoverEssence')}
            </Link>
          </div>
        ) : loading ? (
          <ol className="mt-6 flex gap-4 overflow-hidden" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="shrink-0 w-[124px] sm:w-[148px]">
                <div className="aspect-[2/3] rounded-xl bg-white/[0.07] animate-pulse" />
                <div className="mt-2.5 h-3.5 w-4/5 rounded bg-white/[0.07] animate-pulse" />
              </li>
            ))}
          </ol>
        ) : movies.length === 0 ? (
          <p className="mt-6 rounded-xl px-4 py-4 text-sm bg-black/20" style={{ color: MIST }}>
            {t('oracle.noRecommendationsToday')}
          </p>
        ) : (
          <div className="mt-3 pt-3 -mx-5 sm:-mx-6 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
            <ol className="flex gap-4 pb-1 px-5 sm:px-6">
              {movies.map((movie, idx) => {
                const year = (movie.release_date || '').slice(0, 4);
                return (
                  <li key={movie.id} className="group relative shrink-0 w-[124px] sm:w-[148px]">
                    <button onClick={() => setSelectedMovie(movie)} className={`block w-full text-left rounded-xl ${FOCUS_RING}`}>
                      <span
                        className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                        style={{ background: NIGHT }}
                      >
                        {movie.poster_path ? (
                          <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`} alt={movie.title} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                            <Film className="w-7 h-7" aria-hidden />
                          </span>
                        )}
                        <span
                          className="absolute top-1.5 left-1.5 grid place-items-center min-w-[1.75rem] h-7 px-1.5 rounded-lg text-base leading-none shadow-lg"
                          style={{ ...PIXEL, background: PAPER, color: INK }}
                        >
                          <span className="sr-only">#</span>
                          {idx + 1}
                        </span>
                        <FloatingFriendBubbles movieId={movie.id} mediaType={movie.media_type || 'movie'} />
                      </span>
                      <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                        {movie.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                        {year && <span>{year}</span>}
                        {movie.vote_average > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                            {formatScore(movie.vote_average)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {selectedMovie && <MovieDetailsModal movie={selectedMovie} isOpen={true} onClose={() => setSelectedMovie(null)} />}
    </>
  );
};

export default OracleForYouBox;
