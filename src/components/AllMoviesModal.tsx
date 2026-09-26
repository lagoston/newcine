import React, { useState, useEffect, useCallback } from 'react';
import { Star, Dices, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Movie, getMovieDetails, getTvProgressBatch, getTvProgressBatchForProfile, TvProgress } from '../lib/tmdb';
import { useAuth } from '../lib/auth';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

interface AllMoviesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  movies: Movie[];
  rating: number | null;
  isOtherUserProfile?: boolean;
  profileUserId?: string;
  onAddToLibrary?: () => void;
  // Mantido por compatibilidade com quem ainda passa um tema; no padrão
  // novo todas as prateleiras usam a mesma identidade.
  theme?: 'gold' | 'purple';
}

// Faixa de cor da nota — a mesma lógica das rating boxes (vermelho pras
// baixas, verde pras boas, rosa pro 10), agora sobre o fundo noite.
const ratingTone = (rating: number): { color: string; ring: string } => {
  if (rating === 10) return { color: '#F9A8D4', ring: 'rgba(249,168,212,0.45)' };
  if (rating >= 7) return { color: '#86EFAC', ring: 'rgba(134,239,172,0.4)' };
  if (rating >= 4) return { color: '#FCD34D', ring: 'rgba(252,211,77,0.4)' };
  if (rating >= 1) return { color: '#FCA5A5', ring: 'rgba(252,165,165,0.4)' };
  return { color: MIST, ring: 'rgba(189,180,214,0.35)' };
};

const AllMoviesModal: React.FC<AllMoviesModalProps> = ({
  isOpen,
  onClose,
  title,
  movies,
  rating,
  isOtherUserProfile = false,
  profileUserId,
  onAddToLibrary,
}) => {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [tvProgressData, setTvProgressData] = useState<Map<number, TvProgress>>(new Map());

  const refetchTvProgress = useCallback(() => {
    const tvIds = movies.filter((m) => m.media_type === 'tv').map((m) => m.id);
    if (tvIds.length === 0 || !session?.user?.id) {
      setTvProgressData(new Map());
      return;
    }
    const fetchFn = isOtherUserProfile && profileUserId
      ? getTvProgressBatchForProfile(session.user.id, profileUserId, tvIds)
      : getTvProgressBatch(session.user.id, tvIds);
    fetchFn.then(setTvProgressData);
  }, [movies, session?.user?.id, isOtherUserProfile, profileUserId]);

  useEffect(() => {
    if (isOpen) refetchTvProgress();
  }, [isOpen, refetchTvProgress]);

  // Barra de progresso das séries: azul assistindo, roxo em dia com uma
  // série que ainda está no ar, rosa concluída.
  const tvProgress = (movie: Movie) => {
    const progress = tvProgressData.get(movie.id);
    const aired = progress?.airedCount || 0;
    const watched = progress?.watchedCount || 0;
    const percent = aired > 0 ? Math.min(100, (watched / aired) * 100) : 0;
    const stillAiring = movie.in_production === true || movie.status === 'Returning Series';
    const color = percent >= 100 ? (stillAiring ? '#C084FC' : '#F472B6') : '#60A5FA';
    return { percent, color };
  };

  const openMovie = async (movie: Movie) => {
    if (loadingId !== null) return;
    setLoadingId(movie.id);
    try {
      const details = await getMovieDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    } finally {
      setLoadingId(null);
    }
  };

  const openRandom = () => {
    if (movies.length === 0) return;
    openMovie(movies[Math.floor(Math.random() * movies.length)]);
  };

  const formatScore = (value?: number) =>
    typeof value === 'number' && value > 0
      ? value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;

  const leading = rating !== null ? (
    <span
      className="w-11 h-11 shrink-0 rounded-full grid place-items-center text-xl"
      style={{ ...PIXEL, background: VELVET, color: ratingTone(rating).color, boxShadow: `0 0 0 2px ${ratingTone(rating).ring}` }}
      aria-label={`${rating}`}
    >
      {rating}
    </span>
  ) : undefined;

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={onClose}
        title={title}
        subtitle={`${movies.length} ${movies.length === 1 ? t('community.film') : t('community.films')}`}
        leading={leading}
        size="full"
        escapeEnabled={!selectedMovie}
        footer={
          movies.length > 0 ? (
            <div className="flex justify-center">
              <button
                onClick={openRandom}
                disabled={loadingId !== null}
                className="inline-flex items-center gap-2 px-6 h-12 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
              >
                <Dices className="w-5 h-5" aria-hidden />
                {t('library.randomMovie')}
              </button>
            </div>
          ) : undefined
        }
      >
        <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-3 sm:gap-x-4 gap-y-6">
          {movies.map((movie) => {
            const isTv = movie.media_type === 'tv';
            const progress = isTv ? tvProgress(movie) : null;
            const score = formatScore(movie.vote_average);
            const year = movie.release_date?.slice(0, 4);
            const userRating = movie.userRating;
            return (
              <li key={`${movie.media_type || 'movie'}:${movie.id}`} className="min-w-0">
                <button
                  onClick={() => openMovie(movie)}
                  className="group block w-full text-left rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
                >
                  <div
                    className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-lg transition-transform duration-200 group-hover:-translate-y-1"
                    style={{ background: VELVET }}
                  >
                    <OptimizedPoster
                      src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {progress && (
                      <span className="absolute inset-x-0 top-0 h-1 bg-black/40">
                        <span className="block h-full" style={{ width: `${progress.percent}%`, background: progress.color }} />
                      </span>
                    )}
                    {typeof userRating === 'number' && (
                      <span
                        className="absolute top-2 right-2 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-md text-sm ring-1"
                        style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: ratingTone(userRating).color, '--tw-ring-color': ratingTone(userRating).ring } as React.CSSProperties}
                      >
                        <Star className="w-3 h-3 fill-current" aria-hidden />
                        {userRating}
                      </span>
                    )}
                    {loadingId === movie.id && (
                      <span className="absolute inset-0 grid place-items-center bg-black/55">
                        <Loader2 className="w-6 h-6 animate-spin text-white" aria-hidden />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>{movie.title}</p>
                  <p className="mt-0.5 text-xs inline-flex flex-wrap items-center gap-x-1.5" style={{ color: MIST }}>
                    {year && <span>{year}</span>}
                    {score && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                        {score}
                      </span>
                    )}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </OracleSheet>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          isOtherUserProfile={isOtherUserProfile}
          profileUserId={profileUserId}
          onAddToLibrary={onAddToLibrary}
          onEpisodeToggle={refetchTvProgress}
        />
      )}
    </>
  );
};

export default AllMoviesModal;