import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Star, Dices, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Movie, getTvProgressBatch, getTvProgressBatchForProfile, TvProgress } from '../lib/tmdb';
import { ShelfEntry, getFullTitle, prefetchFullTitle, titleKey, toShelfEntry } from '../lib/titleCards';
import { useProgressiveCount, useReveal, useTitleCards } from '../hooks/useLazyList';
import { useAuth } from '../lib/auth';
// 19/11/2026 (Reborn, onda 2b): o menu do título é uma camada do host
// (src/overlays); aqui não se guarda mais o filme aberto nem se monta o menu.
import { useOpenTitle } from '../overlays';
import PosterImage from './PosterImage';
import PosterArt from './posterJackpot/PosterArt';
import { posterKey, useEquippedPosters, type EquippedPoster } from '../lib/posterJackpot';
import { useEvent } from '../hooks/useEvent';
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

// 19/11/2026 (Reborn, onda 2b, render.md A5): cada pôster da grade é um
// componente memorizado, com props simples. Antes os ladrilhos eram desenhados
// dentro do .map do modal, e cada lote novo de 24 (e cada resposta de cartões
// ou de progresso de série) redesenhava TODOS os anteriores: com 1.000 títulos
// na Watchlist, rolar até o fim custava 110 renders da grade inteira (11 s de
// render, o maior de 557 ms; CPU 4×). Agora um lote novo desenha só os novos.
// A classe poster-cv (index.css) deixa o navegador pular o que está fora da
// tela.
interface GridTileProps {
  // posição na lista (as ações recebem a posição, não o objeto)
  index: number;
  title: string;
  posterPath: string | null | undefined;
  year: string | undefined;
  voteAverage: number | undefined;
  userRating: number | null | undefined;
  // Série: quanto a pessoa já viu (0 a 100) e a cor da barra. null = filme.
  progressPercent: number | null;
  progressColor: string | null;
  // o pôster do Jackpot equipado neste título, se houver
  equipped: EquippedPoster | undefined;
  loading: boolean;
  language: string;
  reveal: (el: HTMLElement | null) => void;
  onOpen: (index: number) => void;
  onPrefetch: (index: number) => void;
}

const GridTile = React.memo(function GridTile({
  index,
  title,
  posterPath,
  year,
  voteAverage,
  userRating,
  progressPercent,
  progressColor,
  equipped,
  loading,
  language,
  reveal,
  onOpen,
  onPrefetch,
}: GridTileProps) {
  const score =
    typeof voteAverage === 'number' && voteAverage > 0
      ? voteAverage.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;
  return (
    <li ref={reveal} className="reveal-tile poster-cv min-w-0">
      <button
        onClick={() => onOpen(index)}
        onPointerEnter={() => onPrefetch(index)}
        onPointerDown={() => onPrefetch(index)}
        className="group block w-full text-left rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300"
      >
        <div
          className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-lg transition-transform duration-200 group-hover:-translate-y-1"
          style={{ background: VELVET }}
        >
          {equipped ? (
            <PosterArt filePath={equipped.file_path} effect={equipped.effect} alt={title} className="absolute inset-0 w-full h-full" mark={{ rarity: equipped.rarity, serial: equipped.serial, size: 'xs' }} />
          ) : (
            // a coluna da grade vai de ~100 px (celular) a ~190 px
            <PosterImage path={posterPath} width={190} alt={title} className="absolute inset-0 w-full h-full object-cover" />
          )}
          {progressPercent !== null && (
            <span className="absolute inset-x-0 top-0 h-1 bg-black/40">
              <span className="block h-full" style={{ width: `${progressPercent}%`, background: progressColor ?? undefined }} />
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
          {loading && (
            <span className="absolute inset-0 grid place-items-center bg-black/55">
              <Loader2 className="w-6 h-6 animate-spin text-white" aria-hidden />
            </span>
          )}
        </div>
        <p className={`mt-2 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={title}>{title}</p>
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
});

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
  // Pôsteres equipados (Poster Jackpot) de quem é a biblioteca.
  const equippedPosters = useEquippedPosters(isOpen ? (isOtherUserProfile ? profileUserId : session?.user?.id) : null);
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

  const showTitle = useOpenTitle({ isOtherUserProfile, profileUserId, onAddToLibrary, onEpisodeToggle: refetchTvProgress });
  const openEntry = async (entry: ShelfEntry) => {
    if (loadingKey !== null) return;
    const key = titleKey(entry);
    setLoadingKey(key);
    try {
      const details = await getFullTitle(entry);
      showTitle({ ...details, userRating: entry.userRating ?? null });
    } catch {
      const fallback = tileFor(entry);
      if (fallback) showTitle(fallback);
    } finally {
      setLoadingKey(null);
    }
  };

  const openRandom = () => {
    if (entries.length === 0) return;
    openEntry(entries[Math.floor(Math.random() * entries.length)]);
  };

  // As ações dos ladrilhos nunca mudam de identidade (senão o React.memo deles
  // não valeria); recebem a posição do título na lista.
  const openAt = useEvent((index: number) => {
    const entry = entries[index];
    if (entry) openEntry(entry);
  });
  const prefetchAt = useEvent((index: number) => {
    const entry = entries[index];
    if (entry) prefetchFullTitle(entry);
  });

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
          {entries.slice(0, count).map((entry, index) => {
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
            const progress = movie.media_type === 'tv' ? tvProgress(movie) : null;
            return (
              <GridTile
                key={`t:${titleKey(entry)}`}
                index={index}
                title={movie.title}
                posterPath={movie.poster_path}
                year={movie.release_date?.slice(0, 4)}
                voteAverage={movie.vote_average}
                userRating={movie.userRating}
                progressPercent={progress ? progress.percent : null}
                progressColor={progress ? progress.color : null}
                equipped={equippedPosters.get(posterKey(movie.media_type, movie.id))}
                loading={loadingKey === titleKey(entry)}
                language={i18n.language}
                reveal={reveal}
                onOpen={openAt}
                onPrefetch={prefetchAt}
              />
            );
          })}
          {hasMore && <li ref={endRef} aria-hidden className="col-span-full h-px" />}
        </ul>
      </OracleSheet>

    </>
  );
};

export default AllMoviesModal;