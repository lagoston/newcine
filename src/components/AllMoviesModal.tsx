import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, Dices, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Movie, getTvProgressBatch, getTvProgressBatchForProfile, TvProgress } from '../lib/tmdb';
import { ShelfEntry, getFullTitle, prefetchFullTitle, titleKey, toShelfEntry } from '../lib/titleCards';
import { useProgressiveCount, useReveal, useTitleCards } from '../hooks/useLazyList';
import { useAuth } from '../lib/auth';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL, POSTER_TITLE, ratingTone } from '../lib/oracleTheme';

// "Ver todos" de uma prateleira: a grade inteira, montada em lotes conforme
// a pessoa desce (sob demanda desde 10/10/2026). Aceita os títulos inteiros
// (`movies`) ou só as referências (`items`, como a Biblioteca), e aí busca os
// cartões leves e, ao abrir, os detalhes completos (lib/titleCards).
interface AllMoviesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  movies?: Movie[];
  items?: ShelfEntry[];
  rating: number | null;
  isOtherUserProfile?: boolean;
  profileUserId?: string;
  onAddToLibrary?: () => void;
  // Mantido por compatibilidade com quem ainda passa um tema; no padrão
  // novo todas as prateleiras usam a mesma identidade.
  theme?: 'gold' | 'purple';
}

const FIRST_BATCH = 30;
const NEXT_BATCH = 24;

const AllMoviesModal: React.FC<AllMoviesModalProps> = ({
  isOpen,
  onClose,
  title,
  movies,
  items,
  rating,
  isOtherUserProfile = false,
  profileUserId,
  onAddToLibrary,
}) => {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [tvProgressData, setTvProgressData] = useState<Map<number, TvProgress>>(new Map());

  const entries: ShelfEntry[] = useMemo(
    () => (items !== undefined ? items : (movies || []).map((movie) => toShelfEntry(movie))),
    [items, movies]
  );
  const lazy = items !== undefined && entries.some((entry) => !entry.movie);

  // Grade em lotes: o próximo entra quando o fim se aproxima (rolagem da janela).
  const { count, endRef, hasMore } = useProgressiveCount({
    total: entries.length,
    initial: FIRST_BATCH,
    step: NEXT_BATCH,
    enabled: isOpen,
    axis: 'y',
    margin: 900,
    resetKey: isOpen ? 'open' : 'closed',
  });
  const cardOf = useTitleCards(lazy ? entries : [], count, { enabled: isOpen && lazy, ahead: 12 });
  const reveal = useReveal();

  const tileFor = (entry: ShelfEntry): Movie | undefined => {
    const base = entry.movie ?? cardOf(entry);
    if (!base) return undefined;
    return { ...base, title: base.title || t('library.unavailableTitle'), media_type: entry.media_type, userRating: entry.userRating ?? base.userRating ?? null };
  };

  const visibleTvKey = useMemo(
    () => entries.slice(0, count).filter((entry) => entry.media_type === 'tv').map((entry) => entry.id).join(','),
    [entries, count]
  );

  const refetchTvProgress = useCallback(() => {
    const tvIds = visibleTvKey ? visibleTvKey.split(',').map(Number) : [];
    if (tvIds.length === 0 || !session?.user?.id) {
      setTvProgressData(new Map());
      return;
    }
    const fetchFn = isOtherUserProfile && profileUserId
      ? getTvProgressBatchForProfile(session.user.id, profileUserId, tvIds)
      : getTvProgressBatch(session.user.id, tvIds);
    fetchFn.then(setTvProgressData);
  }, [visibleTvKey, session?.user?.id, isOtherUserProfile, profileUserId]);

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

  const openEntry = async (entry: ShelfEntry) => {
    if (loadingKey !== null) return;
    const key = titleKey(entry);
    setLoadingKey(key);
    try {
      const details = await getFullTitle(entry);
      setSelectedMovie({ ...details, userRating: entry.userRating ?? null });
    } catch {
      const fallback = tileFor(entry);
      if (fallback) setSelectedMovie(fallback);
    } finally {
      setLoadingKey(null);
    }
  };

  const openRandom = () => {
    if (entries.length === 0) return;
    openEntry(entries[Math.floor(Math.random() * entries.length)]);
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
        subtitle={`${entries.length} ${entries.length === 1 ? t('community.film') : t('community.films')}`}
        leading={leading}
        size="full"
        escapeEnabled={!selectedMovie}
        footer={
          entries.length > 0 ? (
            <div className="flex justify-center">
              <button
                onClick={openRandom}
                disabled={loadingKey !== null}
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
          {entries.slice(0, count).map((entry) => {
            const movie = tileFor(entry);
            if (!movie) {
              return (
                <li key={`s:${titleKey(entry)}`} className="min-w-0" aria-hidden>
                  <span className="block aspect-[2/3] rounded-xl poster-skeleton" />
                  <span className="mt-2 block h-3.5 w-4/5 rounded poster-skeleton" />
                  <span className="mt-1.5 block h-3 w-1/2 rounded poster-skeleton" />
                </li>
              );
            }
            const isTv = movie.media_type === 'tv';
            const progress = isTv ? tvProgress(movie) : null;
            const score = formatScore(movie.vote_average);
            const year = movie.release_date?.slice(0, 4);
            const userRating = movie.userRating;
            return (
              <li key={`t:${titleKey(entry)}`} ref={reveal} className="reveal-tile min-w-0">
                <button
                  onClick={() => openEntry(entry)}
                  onPointerEnter={() => prefetchFullTitle(entry)}
                  onPointerDown={() => prefetchFullTitle(entry)}
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
                    {loadingKey === titleKey(entry) && (
                      <span className="absolute inset-0 grid place-items-center bg-black/55">
                        <Loader2 className="w-6 h-6 animate-spin text-white" aria-hidden />
                      </span>
                    )}
                  </div>
                  <p className={`mt-2 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>{movie.title}</p>
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
          {hasMore && <li ref={endRef} aria-hidden className="col-span-full h-px" />}
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