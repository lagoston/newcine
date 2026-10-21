import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Film, RefreshCw, Star } from 'lucide-react';
import type { Movie } from '../../lib/tmdb';
import { getFullTitle, prefetchFullTitle, titleKey, type TitleRef } from '../../lib/titleCards';
import { tilesThatFit, useReveal, useTitleCards } from '../../hooks/useLazyList';
import { fetchOracleHubPicks, mixPicks, drawSeriesShare, type OracleHubPicks, type OraclePick } from '../../lib/oraclePicks';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING, POSTER_TITLE, ORACLES, oracleCardImage, withAlpha, type OracleCard, type OracleId } from '../../lib/oracleTheme';
import { MoodChip } from '../PersonaBits';
import PredictedBadge from '../PredictedBadge';
import MovieDetailsModal from '../MovieDetailsModal';
import OracleProfileSheet from './OracleProfileSheet';

// Escolhidos a dedo — o painel das três cartas do Oracle Hub. Cada oráculo
// tem a sua fileira: a carta dele na frente (tocar abre o perfil do oráculo)
// e os melhores títulos (pela nota prevista) que ele guarda nas três
// prateleiras favoritas da pessoa. A cada abertura muda só a proporção de
// filmes e séries. As fileiras seguem o padrão das listas do site (o mesmo
// pôster, o selo violeta da nota prevista, título, ano e nota do público).
// Embaixo, o letreiro que abre todas as prateleiras.

// O mesmo tamanho dos pôsteres das listas da home e da Biblioteca.
const TILE_WIDTH = 'w-[124px] sm:w-[148px]';
const tileWidthPx = () => (typeof window !== 'undefined' && window.innerWidth >= 640 ? 148 : 124);

const SkeletonTile: React.FC = () => (
  <li className={`shrink-0 ${TILE_WIDTH}`} aria-hidden>
    <span className="block aspect-[2/3] rounded-xl poster-skeleton" />
    <span className="mt-2.5 block h-3.5 w-4/5 rounded poster-skeleton" />
    <span className="mt-2 block h-3 w-1/2 rounded poster-skeleton" />
  </li>
);

type Status = 'loading' | 'ready' | 'error';

// Uma fileira: a carta do oráculo e os títulos dele.
const OracleRow: React.FC<{
  oracle: OracleCard;
  cardStyle: string;
  status: Status;
  picks: OraclePick[];
  cardOf: (ref: TitleRef) => Movie | undefined;
  onOpen: (pick: OraclePick) => void;
  onOpenProfile: (id: OracleId) => void;
}> = ({ oracle, cardStyle, status, picks, cardOf, onOpen, onOpenProfile }) => {
  const { t, i18n } = useTranslation();
  const reveal = useReveal();
  const initialCount = useMemo(() => tilesThatFit(tileWidthPx()), []);
  const libraryLink = `/oracle/libraries?oracle=${oracle.id}`;
  const formatScore = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Arrastar com o mouse no desktop (como as outras listas).
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, scroll: 0, moved: 0 });
  const onMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    drag.current = { active: true, startX: e.pageX, scroll: scrollRef.current.scrollLeft, moved: 0 };
    scrollRef.current.style.cursor = 'grabbing';
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current.active || !scrollRef.current) return;
    e.preventDefault();
    const dx = e.pageX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
    scrollRef.current.scrollLeft = drag.current.scroll - dx * 2;
  };
  const endDrag = () => {
    drag.current.active = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };
  const dragged = () => drag.current.moved > 5;

  return (
    <section aria-label={t('oracle.picks.aisleLabel', { name: oracle.name })}>
      <div className="flex items-baseline justify-between gap-3 px-1 sm:px-0">
        <h3 style={{ ...PIXEL, color: oracle.color }} className="text-2xl sm:text-3xl leading-tight">
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

      <div
        ref={scrollRef}
        className="-mx-3 sm:-mx-6 mt-1 pt-3 overflow-x-auto cursor-grab select-none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        <ol className="flex gap-4 px-3 sm:px-6 pb-2">
          {/* A carta do oráculo: abre o perfil dele. */}
          <li className={`shrink-0 ${TILE_WIDTH}`}>
            <button
              type="button"
              onClick={() => !dragged() && onOpenProfile(oracle.id)}
              className={`group block w-full text-left rounded-xl ${FOCUS_RING}`}
              aria-label={t('oracle.profile.open', { name: oracle.name })}
            >
              <span
                className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1"
                style={{ background: VELVET, boxShadow: `0 18px 30px -18px ${withAlpha(oracle.color, 0.9)}` }}
              >
                <img src={oracleCardImage(oracle.id, cardStyle)} alt="" decoding="async" draggable={false} className="absolute inset-0 w-full h-full object-cover" />
              </span>
              <span className={`mt-2.5 block text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }}>
                {t(`oracle.cards.${oracle.id}`)}
              </span>
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: oracle.color }}>
                {t('oracle.profile.view')}
                <ArrowRight className="w-3.5 h-3.5 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </button>
          </li>

          {status === 'loading' && [...Array(initialCount)].map((_, i) => <SkeletonTile key={`s${i}`} />)}

          {status === 'ready' && picks.length === 0 && (
            <li className="shrink-0 w-56 sm:w-72 self-center">
              <p className="text-sm leading-relaxed" style={{ color: MIST }}>
                {t('oracle.picks.empty')}
              </p>
            </li>
          )}

          {status === 'ready' &&
            picks.map((pick) => {
              const ref: TitleRef = { id: pick.id, media_type: pick.type };
              const movie = cardOf(ref);
              if (!movie) return <SkeletonTile key={`s:${titleKey(ref)}`} />;
              const year = (movie.release_date || '').slice(0, 4);
              return (
                <li key={`t:${titleKey(ref)}`} ref={reveal} className={`reveal-tile group relative shrink-0 ${TILE_WIDTH}`}>
                  <button
                    type="button"
                    onClick={() => !dragged() && onOpen(pick)}
                    onPointerEnter={() => prefetchFullTitle(ref)}
                    onPointerDown={() => prefetchFullTitle(ref)}
                    className={`block w-full text-left rounded-xl ${FOCUS_RING}`}
                  >
                    <span
                      className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                      style={{ background: VELVET }}
                    >
                      {movie.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                          alt={movie.title}
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: MIST }}>
                          <Film className="w-7 h-7" aria-hidden />
                          <span className="text-xs leading-snug line-clamp-3" style={{ color: PAPER }}>
                            {movie.title}
                          </span>
                        </span>
                      )}
                      {pick.rating !== null && <PredictedBadge rating={pick.rating} />}
                    </span>
                    <span className={`mt-2.5 block text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
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
  const [profileId, setProfileId] = useState<OracleId | null>(null);
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

      <div className="mt-5 sm:mt-7 space-y-4 sm:space-y-6">
        {rows.map(({ oracle, picks }) => (
          <OracleRow
            key={oracle.id}
            oracle={oracle}
            cardStyle={cardStyle}
            status={status}
            picks={picks}
            cardOf={cardOf}
            onOpen={open}
            onOpenProfile={setProfileId}
          />
        ))}
      </div>

      <BrowseAllSign totalTitles={data?.totalTitles ?? 0} shelves={data?.shelves ?? 27} />

      <OracleProfileSheet oracleId={profileId} cardStyle={cardStyle} onClose={() => setProfileId(null)} />
      {selected && <MovieDetailsModal movie={selected} isOpen onClose={() => setSelected(null)} isOtherUserProfile={false} />}
    </div>
  );
};

export default OraclePicks;
