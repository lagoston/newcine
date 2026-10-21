import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Film, RefreshCw } from 'lucide-react';
import type { Movie } from '../../lib/tmdb';
import { getFullTitle, prefetchFullTitle, titleKey, type TitleRef } from '../../lib/titleCards';
import { useTitleCards } from '../../hooks/useLazyList';
import { fetchOracleHubPicks, mixPicks, drawSeriesShare, type OracleHubPicks, type OraclePick } from '../../lib/oraclePicks';
import { MOOD_BY_KEY } from '../../lib/moods';
import { VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, ORACLES, oracleCardImage, withAlpha, type OracleCard } from '../../lib/oracleTheme';
import { MoodChip } from '../PersonaBits';
import MovieDetailsModal from '../MovieDetailsModal';

// Escolhidos a dedo — o painel das três cartas do Oracle Hub como uma
// locadora antiga: cada oráculo tem o seu corredor, com a carta dele na
// cabeceira e, saindo dela, as fitas que ele separou na prateleira — os
// melhores títulos (pela nota prevista) das três prateleiras favoritas da
// pessoa. A cada abertura muda só a proporção de filmes e séries.
//
// A única animação orquestrada: quando os títulos chegam, eles saem de trás
// da carta, um a um, e param na prateleira (sem movimento se a pessoa pediu
// menos animação). Tocar na carta (ou em "Todas as prateleiras") abre as
// nove prateleiras daquele oráculo; tocar numa fita abre o título.

// Inclinação de cada fita na prateleira: ninguém deixa as caixas
// perfeitamente alinhadas.
const TILTS = [-1.6, 1.1, -0.6, 1.8, -1.2, 0.5, -1.9, 0.9, -0.3, 1.4, -0.8];

// Medidas da prateleira (precisam bater com as classes abaixo).
const TILE = { sm: 76, lg: 104 };
const GAP = { sm: 10, lg: 14 };
const PAD_TOP = 10; // espaço para o adesivo e para a fita "levantar" no hover
const PLANK = 12;

const useIsWide = () => {
  const query = '(min-width: 640px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
};

type Status = 'loading' | 'ready' | 'error';

// Uma fita na prateleira: a capa em pé, o adesivo da nota prevista, a
// etiqueta "Série" e, embaixo da prateleira, o título.
const Tape: React.FC<{
  pick: OraclePick;
  index: number;
  rowIndex: number;
  tile: number;
  gap: number;
  posterHeight: number;
  color: string;
  movie: Movie | undefined;
  reduceMotion: boolean;
  onOpen: () => void;
}> = ({ pick, index, rowIndex, tile, gap, posterHeight, color, movie, reduceMotion, onOpen }) => {
  const { t } = useTranslation();
  const ref: TitleRef = { id: pick.id, media_type: pick.type };
  const title = movie?.title || '';
  const year = (movie?.release_date || '').slice(0, 4);
  const mood = MOOD_BY_KEY[pick.mood];
  const tilt = TILTS[index % TILTS.length];
  const ratingLabel = pick.rating !== null ? t('oracle.picks.predicted', { rating: pick.rating }) : '';

  return (
    <motion.li
      className="shrink-0"
      style={{ width: tile }}
      // Sai de trás da carta (que está à esquerda da prateleira) e para no lugar.
      initial={reduceMotion ? false : { x: -(index + 1) * (tile + gap), opacity: 0, rotate: -9 }}
      animate={{ x: 0, opacity: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26, delay: rowIndex * 0.15 + index * 0.055 }}
    >
      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={() => prefetchFullTitle(ref)}
        onPointerDown={() => prefetchFullTitle(ref)}
        className={`group block w-full text-left rounded-md ${FOCUS_RING}`}
        aria-label={[title, year, ratingLabel].filter(Boolean).join(', ')}
      >
        <span
          className="relative block transition-transform duration-200 [transform:rotate(var(--tilt))] group-hover:[transform:translateY(-6px)_rotate(0deg)] group-focus-visible:[transform:translateY(-6px)_rotate(0deg)]"
          style={{ height: posterHeight, ['--tilt' as string]: `${tilt}deg` } as React.CSSProperties}
        >
          <span className="absolute inset-0 overflow-hidden rounded-md ring-1 ring-black/40" style={{ background: VELVET, boxShadow: '0 10px 14px -10px rgba(0,0,0,0.9)' }}>
            {movie?.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w185${movie.poster_path}`}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : movie ? (
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center" style={{ color: MIST }}>
                <Film className="w-5 h-5" aria-hidden />
                <span className="text-[10px] leading-tight line-clamp-3" style={{ color: PAPER }}>
                  {title}
                </span>
              </span>
            ) : (
              <span className="absolute inset-0 poster-skeleton" />
            )}
            {pick.type === 'tv' && (
              <span className="absolute bottom-1 left-1 px-1 py-px rounded-[3px] text-[9px] sm:text-[10px] font-semibold leading-tight shadow" style={{ background: PAPER, color: INK }}>
                {t('oracle.picks.series')}
              </span>
            )}
          </span>
          {/* O adesivo da nota prevista, como a etiqueta de preço das fitas. */}
          {pick.rating !== null && (
            <span
              className="absolute -top-1.5 -right-1.5 grid place-items-center w-6 h-6 sm:w-[30px] sm:h-[30px] rounded-full -rotate-12"
              style={{ background: color, color: INK, boxShadow: '0 0 0 2px #140F26, inset 0 1px 0 rgba(255,255,255,0.45), 0 4px 8px -2px rgba(0,0,0,0.6)' }}
              title={ratingLabel}
              aria-hidden
            >
              <span style={PIXEL} className="text-[13px] sm:text-base leading-none">
                {pick.rating}
              </span>
            </span>
          )}
        </span>
        <span className="block mt-[calc(12px+8px)]">
          <span className="block text-[11px] sm:text-xs font-medium leading-snug line-clamp-2 break-words" style={{ color: PAPER }} title={title}>
            {title || ' '}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] sm:text-[11px]" style={{ color: MIST }}>
            {mood && (
              <span style={{ ...PIXEL, color: mood.color }} className="leading-none" title={t(mood.labelKey)}>
                {mood.letter}
              </span>
            )}
            {year}
          </span>
        </span>
      </button>
    </motion.li>
  );
};

// Um corredor: a carta do oráculo na cabeceira e a prateleira com as fitas.
const Aisle: React.FC<{
  oracle: OracleCard;
  cardStyle: string;
  rowIndex: number;
  status: Status;
  picks: OraclePick[];
  cardOf: (ref: TitleRef) => Movie | undefined;
  onOpen: (pick: OraclePick) => void;
}> = ({ oracle, cardStyle, rowIndex, status, picks, cardOf, onOpen }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const wide = useIsWide();
  const tile = wide ? TILE.lg : TILE.sm;
  const gap = wide ? GAP.lg : GAP.sm;
  const posterHeight = Math.round(tile * 1.5);
  const libraryLink = `/oracle/libraries?oracle=${oracle.id}`;

  // A fileira é distribuída quando os cartões dela chegaram (ou depois de
  // 4 s, com o que tiver — o resto aparece como esqueleto).
  const loadedCount = picks.filter((pick) => cardOf({ id: pick.id, media_type: pick.type })).length;
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (status !== 'ready' || picks.length === 0) return;
    const id = window.setTimeout(() => setTimedOut(true), 4000);
    return () => window.clearTimeout(id);
  }, [status, picks.length]);
  const dealt = status === 'ready' && picks.length > 0 && (loadedCount === picks.length || timedOut);
  const empty = status === 'ready' && picks.length === 0;

  // Rolar com o mouse arrastando (como as prateleiras da Biblioteca).
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scroll: 0, moved: 0 });
  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    drag.current = { active: true, startX: e.pageX, scroll: scrollRef.current.scrollLeft, moved: 0 };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current.active || !scrollRef.current) return;
    const dx = e.pageX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
    scrollRef.current.scrollLeft = drag.current.scroll - dx;
  };
  const endDrag = () => {
    drag.current.active = false;
  };

  return (
    <section aria-label={t('oracle.picks.aisleLabel', { name: oracle.name })}>
      <div className="flex items-baseline justify-between gap-3 px-1 sm:px-0">
        <h3 style={{ ...PIXEL, color: oracle.color }} className="text-xl sm:text-[1.7rem] leading-none">
          {oracle.name}
        </h3>
        <Link
          to={libraryLink}
          className={`group shrink-0 inline-flex items-center gap-1 rounded-md text-xs sm:text-sm font-semibold ${FOCUS_RING}`}
          style={{ color: oracle.color }}
          aria-label={t('oracle.picks.allShelvesOf', { name: oracle.name })}
        >
          {t('oracle.picks.allShelves')}
          <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>

      <div className="relative mt-2 flex" style={{ gap }}>
        {/* A prateleira, por baixo da carta e das fitas. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 rounded-[3px]"
          style={{
            top: PAD_TOP + posterHeight,
            height: PLANK,
            background: `linear-gradient(180deg, rgba(243,234,211,0.22) 0, rgba(243,234,211,0.07) 3px, ${withAlpha(oracle.color, 0.6)} 3px, ${withAlpha(oracle.color, 0.6)} 5px, #0E0A1A 5px, #0E0A1A 100%)`,
            boxShadow: '0 14px 18px -10px rgba(0,0,0,0.75)',
          }}
        />

        {/* A carta na cabeceira do corredor. */}
        <div className="relative z-10 shrink-0" style={{ width: tile, paddingTop: PAD_TOP }}>
          <motion.div
            animate={dealt && !reduceMotion ? { rotate: [0, -5, 0], x: [0, -2, 0] } : undefined}
            transition={{ duration: 0.45, delay: rowIndex * 0.15, ease: 'easeOut' }}
          >
            <Link
              to={libraryLink}
              aria-label={`${oracle.name} — ${t('oracle.libraries.exploreShelves')}`}
              className={`group block rounded-lg ${FOCUS_RING}`}
            >
              <span
                className="block overflow-hidden rounded-lg transition-transform duration-300 group-hover:-translate-y-1"
                style={{ height: posterHeight, boxShadow: `8px 0 18px -8px rgba(0,0,0,0.8), 0 16px 30px -18px ${withAlpha(oracle.color, 0.9)}` }}
              >
                <img src={oracleCardImage(oracle.id, cardStyle)} alt="" decoding="async" className="block w-full h-full object-cover" />
              </span>
            </Link>
          </motion.div>
          <p className="mt-[calc(12px+8px)] text-[10px] sm:text-xs leading-snug" style={{ color: MIST }}>
            {t(`oracle.cards.${oracle.id}Subtitle`)}
          </p>
        </div>

        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto select-none"
          style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
        >
          {status === 'error' ? (
            <div aria-hidden style={{ height: PAD_TOP + posterHeight }} />
          ) : empty ? (
            <div className="flex items-center pl-1" style={{ height: PAD_TOP + posterHeight }}>
              <p className="text-xs sm:text-sm max-w-xs" style={{ color: MIST }}>
                {t('oracle.picks.empty')}
              </p>
            </div>
          ) : (
            <ol className="flex pr-2" style={{ gap, paddingTop: PAD_TOP }}>
              {dealt
                ? picks.map((pick, i) => (
                    <Tape
                      key={titleKey({ id: pick.id, media_type: pick.type })}
                      pick={pick}
                      index={i}
                      rowIndex={rowIndex}
                      tile={tile}
                      gap={gap}
                      posterHeight={posterHeight}
                      color={oracle.color}
                      movie={cardOf({ id: pick.id, media_type: pick.type })}
                      reduceMotion={Boolean(reduceMotion)}
                      onOpen={() => {
                        if (drag.current.moved > 5) return;
                        onOpen(pick);
                      }}
                    />
                  ))
                : [0, 1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="shrink-0" style={{ width: tile }} aria-hidden>
                      <span className="block rounded-md poster-skeleton opacity-60" style={{ height: posterHeight }} />
                    </li>
                  ))}
              {dealt && (
                <motion.li
                  className="shrink-0"
                  style={{ width: tile }}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: rowIndex * 0.15 + picks.length * 0.055 + 0.2 }}
                >
                  <Link
                    to={`/oracle/libraries?oracle=${oracle.id}`}
                    className={`flex flex-col items-center justify-center gap-2 px-2 rounded-md border-2 border-dashed text-center transition hover:bg-white/[0.04] ${FOCUS_RING}`}
                    style={{ height: posterHeight, borderColor: withAlpha(oracle.color, 0.45), color: oracle.color }}
                  >
                    <ArrowRight className="w-5 h-5" aria-hidden />
                    <span className="text-[11px] sm:text-xs font-semibold leading-tight">{t('oracle.picks.allShelves')}</span>
                  </Link>
                </motion.li>
              )}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
};

// O letreiro que abre todas as prateleiras.
const BrowseAllSign: React.FC<{ totalTitles: number; shelves: number }> = ({ totalTitles, shelves }) => {
  const { t, i18n } = useTranslation();
  return (
    <Link
      to="/oracle/libraries?oracle=bogart"
      className={`group relative mt-6 sm:mt-8 flex items-center gap-3 sm:gap-5 rounded-2xl px-3.5 sm:px-6 py-3.5 sm:py-4 overflow-hidden transition ${FOCUS_RING}`}
      style={{
        background: 'radial-gradient(120% 140% at 50% 0%, rgba(240,171,252,0.10), transparent 60%), #0E0A1A',
        boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.12), 0 18px 40px -24px rgba(240,171,252,0.45)',
      }}
    >
      {/* O tubo de neon com as cores dos três oráculos. */}
      <span
        aria-hidden
        className="absolute left-5 right-5 top-0 h-[2px] rounded-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, ${ORACLES.map((o) => o.color).join(', ')})`,
          boxShadow: `0 0 10px 1px ${withAlpha(ORACLES[1].color, 0.55)}, 0 0 22px 2px ${withAlpha(ORACLES[0].color, 0.3)}`,
        }}
      />
      <span className="flex items-center -space-x-2.5 shrink-0" aria-hidden>
        {ORACLES.map((oracle) => (
          <img
            key={oracle.id}
            src={oracle.avatar}
            alt=""
            width={40}
            height={40}
            decoding="async"
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover"
            style={{ boxShadow: `0 0 0 2px ${oracle.color}, 0 0 0 4px #0E0A1A` }}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span
          style={{ ...PIXEL, color: PAPER, textShadow: '0 0 14px rgba(240,171,252,0.55)' }}
          className="block text-lg sm:text-[1.7rem] leading-none transition-[text-shadow] duration-300 group-hover:[text-shadow:0_0_18px_rgba(240,171,252,0.85)]"
        >
          {t('oracle.picks.browseAll')}
        </span>
        <span className="mt-1.5 block text-[11px] sm:text-sm leading-snug" style={{ color: MIST }}>
          {totalTitles > 0
            ? t('oracle.picks.browseAllHint', { shelves, count: totalTitles, formatted: totalTitles.toLocaleString(i18n.language) })
            : t('oracle.picks.browseAllHintShort')}
        </span>
      </span>
      <span
        className="grid place-items-center w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-full transition-transform duration-300 group-hover:translate-x-0.5"
        style={{ background: 'linear-gradient(135deg, #7C3AED, #C026D3)', color: '#fff', boxShadow: '0 0 18px -2px rgba(217,70,239,0.6)' }}
        aria-hidden
      >
        <ArrowRight className="w-5 h-5" />
      </span>
    </Link>
  );
};

const OraclePicks: React.FC<{ cardStyle: string }> = ({ cardStyle }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<OracleHubPicks | null>(null);
  const [selected, setSelected] = useState<Movie | null>(null);
  // A proporção de séries de cada oráculo, sorteada uma vez por abertura.
  const [shares] = useState(() => Object.fromEntries(ORACLES.map((o) => [o.id, drawSeriesShare()])) as Record<string, number>);

  const load = useCallback(() => {
    setStatus('loading');
    fetchOracleHubPicks()
      .then((result) => {
        setData(result);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Oracle hub picks:', error);
        setStatus('error');
      });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () =>
      ORACLES.map((oracle) => ({
        oracle,
        picks: data ? mixPicks(data.byOracle[oracle.id].movies, data.byOracle[oracle.id].series, shares[oracle.id]) : [],
      })),
    [data, shares]
  );

  const refs: TitleRef[] = useMemo(() => rows.flatMap((row) => row.picks.map((pick) => ({ id: pick.id, media_type: pick.type }))), [rows]);
  const cardOf = useTitleCards(refs, refs.length, { enabled: refs.length > 0, ahead: 0 });

  const open = async (pick: OraclePick) => {
    const ref: TitleRef = { id: pick.id, media_type: pick.type };
    try {
      setSelected(await getFullTitle(ref));
    } catch {
      const card = cardOf(ref);
      if (card) setSelected(card);
    }
  };

  const lead = data && !data.personal ? t('oracle.picks.leadStarter') : t('oracle.picks.lead');

  return (
    <div
      className="relative overflow-hidden rounded-3xl px-3 pt-4 pb-3 sm:p-6"
      style={{
        background: [
          ...ORACLES.map((oracle, i) => `radial-gradient(32% 40% at ${17 + i * 33}% 0%, ${withAlpha(oracle.color, 0.12)}, transparent 75%)`),
          'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015) 45%)',
          'rgba(28,20,51,0.55)',
        ].join(', '),
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 0 1px rgba(243,234,211,0.1), 0 24px 50px -30px rgba(0,0,0,0.8)',
      }}
    >
      <header className="px-1 sm:px-0">
        <h2 style={{ ...PIXEL, color: PAPER }} className="text-[1.7rem] sm:text-4xl leading-none">
          {t('oracle.picks.title')}
        </h2>
        <p className="mt-2 max-w-2xl text-sm sm:text-[15px] leading-relaxed" style={{ color: MIST }}>
          {lead}
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('oracle.picks.shelvesLabel')}>
          {(data?.moods ?? []).map((key, i) => (
            <li key={key}>
              <MoodChip moodKey={key} rank={data?.personal ? i + 1 : undefined} size="sm" />
            </li>
          ))}
          {!data && status === 'loading' && [0, 1, 2].map((i) => <li key={i} className="h-7 w-28 rounded-full poster-skeleton" aria-hidden />)}
        </ul>
        {status === 'error' && (
          <div className="mt-3 flex flex-wrap items-center gap-3" role="status">
            <p className="text-sm" style={{ color: MIST }}>
              {t('oracle.picks.error')}
            </p>
            <button
              type="button"
              onClick={load}
              className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg ring-1 ring-white/15 hover:bg-white/5 text-sm font-medium ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <RefreshCw className="w-4 h-4" aria-hidden />
              {t('common.retry')}
            </button>
          </div>
        )}
      </header>

      <div className="mt-5 sm:mt-7 space-y-5 sm:space-y-7">
        {rows.map(({ oracle, picks }, rowIndex) => (
          <Aisle
            key={oracle.id}
            oracle={oracle}
            cardStyle={cardStyle}
            rowIndex={rowIndex}
            status={status}
            picks={picks}
            cardOf={cardOf}
            onOpen={open}
          />
        ))}
      </div>

      <BrowseAllSign totalTitles={data?.totalTitles ?? 0} shelves={data?.shelves ?? 27} />

      {selected && <MovieDetailsModal movie={selected} isOpen onClose={() => setSelected(null)} isOtherUserProfile={false} />}
    </div>
  );
};

export default OraclePicks;
