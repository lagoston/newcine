import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, Check, Film, Lock, Sparkles, Star, Sun, Wand2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { getMovieDetails, getMoviesFromCacheByType, type Movie } from '../../lib/tmdb';
import OptimizedPoster from '../OptimizedPoster';
import { INK, MIST, ORACLE_BY_ID, PAPER, PIXEL, POSTER_TITLE, FOCUS_RING, VELVET, withAlpha } from '../../lib/oracleTheme';
import {
  currentStep,
  daysLeft,
  formatDayMonth,
  lastDayOf,
  stepTextKey,
  type SeasonalEventState,
  type SeasonalStep,
  type SeasonalTheme,
} from '../../lib/seasonalEvents';
import { PanelSeasonalScene } from './SeasonalDecor';

// Painel do evento na home ("Recomendações de Halloween", "Recomendações de
// Natal"): toma o lugar das Recomendações do Dia enquanto o evento está no
// ar. Mostra a seleção (até 20 filmes das prateleiras dos oráculos), a
// trilha das três tags especiais e o que falta para a próxima.

export type HomePanelView = 'event' | 'daily';

// Alternância entre o painel do evento e as Recomendações do Dia.
export const PanelSwitch: React.FC<{ view: HomePanelView; onChange: (view: HomePanelView) => void; theme: SeasonalTheme }> = ({
  view,
  onChange,
  theme,
}) => {
  const { t } = useTranslation();
  const tab = (id: HomePanelView, label: React.ReactNode) => {
    const active = view === id;
    return (
      <button
        role="tab"
        aria-selected={active}
        onClick={() => onChange(id)}
        className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap transition ${FOCUS_RING} ${active ? '' : 'hover:bg-white/10'}`}
        style={active ? { background: id === 'event' ? theme.accent : PAPER, color: id === 'event' ? theme.ink : INK } : { color: MIST }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="tablist"
      aria-label={t('events.switchLabel')}
      className="inline-flex shrink-0 p-1 rounded-full"
      style={{ background: 'rgba(0,0,0,0.38)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
    >
      {tab(
        'event',
        <>
          <span aria-hidden>{theme.emoji}</span>
          {t(`events.${theme.id}.tab`)}
        </>,
      )}
      {tab(
        'daily',
        <>
          <Sun className="w-4 h-4" aria-hidden />
          {t('events.dailyTab')}
        </>,
      )}
    </div>
  );
};

// Arrastar com o mouse para rolar a fileira (como as prateleiras da home).
function useDragScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef({ down: false, startX: 0, startScroll: 0, moved: 0 });
  const handlers = {
    onMouseDown: (e: React.MouseEvent) => {
      if (!ref.current) return;
      state.current = { down: true, startX: e.pageX, startScroll: ref.current.scrollLeft, moved: 0 };
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!state.current.down || !ref.current) return;
      const dx = e.pageX - state.current.startX;
      state.current.moved = Math.abs(dx);
      ref.current.scrollLeft = state.current.startScroll - dx;
    },
    onMouseUp: () => {
      state.current.down = false;
    },
    onMouseLeave: () => {
      state.current.down = false;
    },
  };
  return { ref, handlers, wasDrag: () => state.current.moved > 5 };
}

interface Props {
  event: SeasonalEventState;
  theme: SeasonalTheme;
  onMovieClick: (movie: Movie) => void;
  switcher?: React.ReactNode;
}

const SeasonalEventPanel: React.FC<Props> = ({ event, theme, onMovieClick, switcher }) => {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [movies, setMovies] = useState<Movie[] | null>(null);
  const [own, setOwn] = useState<Map<number, number | null>>(new Map());
  const [predictions, setPredictions] = useState<Record<number, number>>({});
  const predicted = useRef(false);
  const drag = useDragScroll();

  const idsKey = event.items.map((item) => item.id).join(',');
  const oracleOf = new Map(event.items.map((item) => [item.id, item.oracle]));

  // Filmes da seleção, na ordem do evento (cache do banco; o TMDB só se faltar).
  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(',').map(Number) : [];
    (async () => {
      const cached = await getMoviesFromCacheByType(ids.map((id) => ({ movie_id: id, media_type: 'movie' })));
      const list = await Promise.all(
        ids.map(async (id) => cached.get(`${id}_movie`) ?? (await getMovieDetails(id, 'movie').catch(() => null))),
      );
      if (!cancelled) setMovies(list.filter((movie): movie is Movie => Boolean(movie?.poster_path)));
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, i18n.language]);

  // Notas e watchlist da pessoa nesses filmes (de novo a cada atualização do evento).
  useEffect(() => {
    if (!userId || !idsKey) return;
    let cancelled = false;
    supabase
      .from('user_movies')
      .select('movie_id, rating, media_type')
      .eq('user_id', userId)
      .in('movie_id', idsKey.split(',').map(Number))
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as { movie_id: number; rating: number | null; media_type: string | null }[];
        setOwn(new Map(rows.filter((row) => (row.media_type ?? 'movie') === 'movie').map((row) => [row.movie_id, row.rating])));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, idsKey, event]);

  // Nota prevista (uma vez): o mesmo modelo das prateleiras dos oráculos.
  useEffect(() => {
    if (!userId || !idsKey || predicted.current) return;
    predicted.current = true;
    supabase.functions
      .invoke('predict-watchlist-ratings', { body: { movieIds: idsKey.split(',').map(Number) } })
      .then(({ data }) => setPredictions((data?.ratings as Record<number, number>) ?? {}))
      .catch(() => {});
  }, [userId, idsKey]);

  // ---------------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------------

  const steps = event.steps;
  const step = currentStep(event);
  const sameKind = steps.every((s) => s.kind === steps[0]?.kind);
  const last = steps[steps.length - 1];
  const unlockedCount = steps.filter((s) => s.unlocked).length;
  const giftedCount = steps.filter((s) => s.credited).length;
  // (tags ganhas antes da regra dos filmes ficam mesmo sem os filmes: conta como completo)
  const summary = sameKind && last
    ? t(`events.${event.id}.summary`, { done: last.unlocked ? last.count : Math.min(last.progress, last.count), total: last.count })
    : t(`events.${event.id}.summary`, { done: unlockedCount, total: steps.length });

  // Filmes que já contaram para alguma etapa deste evento (só os tipos de
  // ação que o evento usa; na Watchlist, vale também o que já está guardado).
  const kinds = new Set(steps.map((s) => s.kind));
  const counted = new Set<number>([...kinds].flatMap((kind) => event.actions[kind] ?? []));
  if (kinds.has('watchlist')) own.forEach((rating, id) => rating === null && counted.add(id));

  const startLabel = formatDayMonth(new Date(event.starts_at), i18n.language);
  const endLabel = formatDayMonth(lastDayOf(event), i18n.language);
  const remaining = daysLeft(event);
  const timeLabel = event.is_preview
    ? t('events.previewWindow', { start: startLabel, end: endLabel })
    : remaining <= 1
      ? t('events.endsToday')
      : t('events.endsIn', { count: remaining });

  // Quanto do fio entre as etapas já acendeu.
  const fill = (() => {
    if (steps.length < 2) return unlockedCount > 0 ? 1 : 0;
    if (!step) return 1;
    const k = steps.indexOf(step);
    if (k <= 0) return 0;
    const prev = steps[k - 1];
    const base = prev.kind === step.kind ? prev.count : 0;
    const partial = Math.max(0, Math.min(1, (step.progress - base) / Math.max(1, step.count - base)));
    return (k - 1 + partial) / (steps.length - 1);
  })();
  const edge = `${100 / (2 * Math.max(steps.length, 1))}%`;

  const nodeFor = (s: SeasonalStep) => {
    const state = s.unlocked ? 'done' : s.available ? 'current' : 'locked';
    const style: React.CSSProperties =
      state === 'done'
        ? {
            background: `radial-gradient(circle, ${withAlpha(theme.glow, 0.32)}, ${withAlpha(theme.accent, 0.16)} 62%, rgba(0,0,0,0.3))`,
            boxShadow: `inset 0 0 0 2px ${theme.accent}, 0 0 24px ${withAlpha(theme.accent, 0.5)}`,
          }
        : state === 'current'
          ? {
              background: 'rgba(0,0,0,0.42)',
              border: `2px dashed ${withAlpha(theme.accent, 0.75)}`,
              ['--co-pulse' as string]: withAlpha(theme.accent, 0.45),
            }
          : { background: 'rgba(0,0,0,0.38)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' };
    return (
      <li key={s.tag} className="relative flex flex-col items-center text-center px-1">
        <span
          className={`relative grid place-items-center w-14 h-14 sm:w-16 sm:h-16 rounded-full text-[28px] sm:text-[32px] leading-none ${state === 'current' ? 'co-node-pulse' : ''}`}
          style={style}
        >
          <span aria-hidden className={state === 'done' ? '' : state === 'current' ? 'grayscale-[60%] opacity-80' : 'grayscale opacity-35'}>
            {s.emoji}
          </span>
          {state === 'done' && (
            <span
              className="absolute -top-0.5 -right-0.5 grid place-items-center w-5 h-5 rounded-full"
              style={{ background: theme.accent, color: theme.ink, boxShadow: `0 0 0 2px ${theme.surface}` }}
              aria-hidden
            >
              <Check className="w-3 h-3" strokeWidth={3} />
            </span>
          )}
          {state === 'locked' && (
            <span
              className="absolute -top-0.5 -right-0.5 grid place-items-center w-5 h-5 rounded-full bg-white/15"
              style={{ color: MIST, boxShadow: `0 0 0 2px ${theme.surface}` }}
              aria-hidden
            >
              <Lock className="w-2.5 h-2.5" />
            </span>
          )}
        </span>
        <span className="mt-2.5 text-sm font-semibold leading-tight" style={{ color: state === 'locked' ? MIST : PAPER }}>
          {s.name}
        </span>
        <span className="mt-1 text-xs leading-snug" style={{ color: state === 'done' ? theme.accentText : MIST }}>
          {state === 'done'
            ? s.credited
              ? t('events.gifted')
              : t('events.conquered')
            : state === 'locked'
              ? t('events.locked')
              : t(`events.${event.id}.steps.${stepTextKey(s)}.label`)}
        </span>
        <span className="sr-only">
          {state === 'done' ? t('events.conquered') : state === 'locked' ? t('events.locked') : t('events.inProgress')}
        </span>
      </li>
    );
  };

  const badgeFor = (movieId: number) => {
    const mine = own.get(movieId);
    if (typeof mine === 'number') {
      return (
        <span
          className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-full text-xs font-semibold shadow-lg"
          style={{ background: PAPER, color: INK }}
          title={t('home.desk.yourRating')}
        >
          <Star className="w-3 h-3 fill-current" aria-hidden />
          <span className="sr-only">{t('home.desk.yourRating')}:</span>
          {mine}
        </span>
      );
    }
    if (mine === null) {
      return (
        <span
          className="absolute top-1.5 left-1.5 grid place-items-center w-6 h-6 rounded-full bg-sky-500/95 text-white shadow-lg"
          title={t('home.desk.inWatchlist')}
        >
          <Bookmark className="w-3.5 h-3.5 fill-current" aria-hidden />
          <span className="sr-only">{t('home.desk.inWatchlist')}</span>
        </span>
      );
    }
    const prediction = predictions[movieId];
    if (typeof prediction === 'number') {
      return (
        <span
          className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
          title={t('home.desk.predictedForYou')}
        >
          <Wand2 className="w-3 h-3" aria-hidden />
          <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
          <span style={PIXEL} className="text-sm leading-none">
            {prediction}
          </span>
        </span>
      );
    }
    return null;
  };

  const titleId = `seasonal-${event.id}-title`;

  return (
    <div
      className="relative rounded-3xl p-px"
      style={{ background: theme.border, boxShadow: `0 34px 80px -44px ${withAlpha(theme.accent, 0.75)}` }}
    >
      <section
        aria-labelledby={titleId}
        className="relative overflow-hidden rounded-[calc(1.5rem-1px)]"
        style={{ background: theme.panelBackground }}
      >
        <PanelSeasonalScene eventId={event.id} />

        <div className="relative pt-6 sm:pt-8 pb-5 sm:pb-7">
          {/* ---------- Cabeçalho ---------- */}
          <div className="px-5 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                className="inline-flex items-center gap-2 min-h-[28px] px-3 py-1 rounded-2xl sm:rounded-full text-xs font-semibold"
                style={{ background: withAlpha(theme.accent, 0.18), color: theme.accentText, boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.45)}` }}
              >
                <span aria-hidden>{theme.emoji}</span>
                <span>
                  {t(`events.${event.id}.eyebrow`)} · {timeLabel}
                </span>
                {event.is_preview && (
                  <span className="ml-1 px-1.5 rounded bg-white/15 text-[10px] uppercase tracking-wide" style={{ color: PAPER }}>
                    {t('events.preview')}
                  </span>
                )}
              </p>
              {switcher}
            </div>

            <h2
              id={titleId}
              style={{ ...PIXEL, color: PAPER, textShadow: `0 0 28px ${withAlpha(theme.accent, 0.6)}` }}
              className="mt-4 text-[2rem] sm:text-5xl leading-[1.05] max-w-3xl"
            >
              {t(`events.${event.id}.title`)}
            </h2>
            <p className="mt-3 max-w-2xl text-sm sm:text-base leading-relaxed" style={{ color: MIST }}>
              {t(`events.${event.id}.subtitle`, { count: event.items.length })}
            </p>
          </div>

          {/* ---------- Trilha das tags ---------- */}
          <div className="px-5 sm:px-8">
            <div
              className="mt-6 rounded-2xl p-4 sm:p-5 backdrop-blur-[2px]"
              style={{ background: 'rgba(0,0,0,0.32)', boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.25)}` }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 style={{ ...PIXEL, color: theme.accentText }} className="text-lg sm:text-xl leading-none">
                  {t(`events.${event.id}.trackTitle`)}
                </h3>
                <p className="text-sm tabular-nums" style={{ color: MIST }}>
                  {summary}
                </p>
              </div>

              <ol className="relative mt-5 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
                <span
                  aria-hidden
                  className="absolute top-7 sm:top-8 h-1 -translate-y-1/2 rounded-full bg-white/10"
                  style={{ left: edge, right: edge }}
                >
                  <span
                    className="block h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${fill * 100}%`, background: `linear-gradient(90deg, ${theme.accent}, ${theme.glow})`, boxShadow: `0 0 12px ${withAlpha(theme.accent, 0.6)}` }}
                  />
                </span>
                {steps.map(nodeFor)}
              </ol>

              {giftedCount > 0 && (
                <p
                  className="mt-5 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-xs leading-snug"
                  style={{ background: 'rgba(0,0,0,0.28)', color: MIST, boxShadow: `inset 0 0 0 1px ${withAlpha(theme.glow, 0.25)}` }}
                >
                  <span className="text-base leading-none" aria-hidden>
                    🎁
                  </span>
                  <span>{t('events.giftedNote', { seen: event.pre_rated, size: event.list_size, count: giftedCount })}</span>
                </p>
              )}

              {step ? (
                <div
                  className="mt-5 flex items-start gap-3 rounded-xl px-3.5 py-3"
                  style={{ background: withAlpha(theme.accent, 0.1), boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.22)}` }}
                >
                  <span className="grid place-items-center w-10 h-10 shrink-0 rounded-lg text-xl" style={{ background: 'rgba(0,0,0,0.35)' }} aria-hidden>
                    {step.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs font-medium" style={{ color: theme.accentText }}>
                        {t('events.next')}
                      </p>
                      <p style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none tabular-nums">
                        {Math.min(step.progress, step.count)}/{step.count}
                      </p>
                    </div>
                    <p className="text-sm font-semibold leading-snug" style={{ color: PAPER }}>
                      {t(`events.${event.id}.steps.${stepTextKey(step)}.task`)}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug" style={{ color: MIST }}>
                      {t(`events.${event.id}.steps.${stepTextKey(step)}.hint`)}
                    </p>
                    <span
                      className="mt-2.5 block h-1 rounded-full bg-white/10 overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={step.count}
                      aria-valuenow={Math.min(step.progress, step.count)}
                      aria-label={step.name}
                    >
                      <span
                        className="block h-full rounded-full transition-[width] duration-700"
                        style={{ width: `${Math.min(100, (step.progress / Math.max(1, step.count)) * 100)}%`, background: theme.accent }}
                      />
                    </span>
                  </div>
                </div>
              ) : (
                // Um parágrafo só (título em negrito emendado no texto) e o
                // atalho para o perfil logo abaixo, alinhado ao texto.
                <div
                  className="mt-5 rounded-xl px-3.5 pt-3 pb-1.5"
                  style={{ background: withAlpha(theme.accent, 0.14), boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.35)}` }}
                >
                  <p className="text-[13px] leading-relaxed" style={{ color: MIST }}>
                    <Sparkles className="inline-block w-4 h-4 mr-1.5 -mt-0.5 align-middle" style={{ color: theme.glow }} aria-hidden />
                    <strong className="font-semibold" style={{ color: PAPER }}>
                      {t(`events.${event.id}.doneTitle`)}.
                    </strong>{' '}
                    {t(`events.${event.id}.doneText`, { tag: last?.name ?? '' })}
                  </p>
                  <Link
                    to="/profile"
                    className={`-ml-2 mt-0.5 inline-flex items-center gap-1.5 min-h-[36px] px-2 rounded-lg text-sm font-semibold hover:bg-white/10 transition ${FOCUS_RING}`}
                    style={{ color: theme.accentText }}
                  >
                    {t('events.viewProfile')}
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* ---------- A seleção ---------- */}
          {movies === null ? (
            <div className="mt-6 flex gap-4 px-5 sm:px-8 overflow-hidden" aria-hidden>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="shrink-0 w-[112px] sm:w-[132px]">
                  <div className="aspect-[2/3] rounded-xl bg-white/10 animate-pulse" />
                  <div className="mt-2.5 h-3.5 w-20 rounded bg-white/10 animate-pulse" />
                </div>
              ))}
            </div>
          ) : movies.length === 0 ? (
            <p className="mt-6 px-5 sm:px-8 text-sm" style={{ color: MIST }}>
              {t('events.loadError')}
            </p>
          ) : (
            <div
              ref={drag.ref}
              className="mt-4 pt-3 overflow-x-auto cursor-grab select-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              {...drag.handlers}
            >
              <ol className="flex gap-4 px-5 sm:px-8 pb-2" aria-label={t(`events.${event.id}.title`)}>
                {movies.map((movie) => {
                  const oracleId = oracleOf.get(movie.id);
                  const oracle = oracleId ? ORACLE_BY_ID[oracleId] : null;
                  const isCounted = counted.has(movie.id);
                  const year = movie.release_date?.slice(0, 4);
                  return (
                    <li key={movie.id} className="shrink-0 w-[112px] sm:w-[132px]">
                      <button
                        onClick={() => {
                          if (drag.wasDrag()) return;
                          onMovieClick(movie);
                        }}
                        className={`group block w-full text-left rounded-xl ${FOCUS_RING}`}
                      >
                        <span
                          className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1"
                          style={{ background: VELVET, boxShadow: `0 18px 30px -18px ${oracle?.color ?? theme.accent}` }}
                        >
                          <OptimizedPoster
                            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
                            alt={movie.title}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {badgeFor(movie.id)}
                          {isCounted && (
                            <span
                              className="absolute top-1.5 right-1.5 grid place-items-center w-6 h-6 rounded-full shadow-lg"
                              style={{ background: theme.accent, color: theme.ink }}
                              title={t('events.counted')}
                            >
                              <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />
                              <span className="sr-only">{t('events.counted')}</span>
                            </span>
                          )}
                          {oracle && (
                            <>
                              <img
                                src={oracle.avatar}
                                alt=""
                                width={22}
                                height={22}
                                loading="lazy"
                                decoding="async"
                                title={t('events.curatedBy', { name: oracle.name })}
                                className="absolute bottom-2 left-1.5 w-[22px] h-[22px] rounded-full object-cover"
                                style={{ boxShadow: `0 0 0 2px ${oracle.color}` }}
                              />
                              <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: oracle.color }} />
                            </>
                          )}
                        </span>
                        <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                          {movie.title}
                        </span>
                        <span className="mt-0.5 block text-xs" style={{ color: MIST }}>
                          {year}
                          {oracle && <span className="sr-only"> · {t('events.curatedBy', { name: oracle.name })}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <p className="mt-3 px-5 sm:px-8 flex items-start gap-2 text-xs leading-relaxed" style={{ color: MIST }}>
            <Film className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden />
            <span>
              {event.is_preview ? t('events.previewNote', { start: startLabel, end: endLabel }) : t(`events.${event.id}.footnote`)}
            </span>
          </p>
        </div>
      </section>
    </div>
  );
};

export default SeasonalEventPanel;
