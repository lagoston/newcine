import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BarChart3, MessageCircle, HelpCircle, Wand2, Star, ArrowRight, Film, Library as LibraryIcon, Eye, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWhispers } from '../contexts/WhispersContext';
import { getMovieDetails, Movie } from '../lib/tmdb';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import OptimizedPoster from './OptimizedPoster';
import OracleSheet from './OracleSheet';
import WhispersModal from './WhispersModal';
import MonthlyInsightsModal from './MonthlyInsightsModal';
import SeasonalEventPanel, { PanelSwitch, type HomePanelView } from './seasonal/SeasonalEventPanel';
import FriendsFeed from './feed/FriendsFeed';
import { useSeasonalEvent } from '../contexts/SeasonalEventContext';
import { formatDayMonth } from '../lib/seasonalEvents';
import { NIGHT, VELVET, PAPER, INK, MIST, PIXEL, ORACLES, ORACLE_BY_ID, OracleId, withAlpha } from '../lib/oracleTheme';

// Topo da home de quem está logado — "a mesa do oráculo".
//   1. Cabeçalho: saudação e os atalhos pessoais (Insights do mês e
//      Sussurros).
//   2. Três botões de acesso, cada um com a sua cor: Biblioteca (azul),
//      Oráculo (rosa) e Perfil (roxo).
//   3. Recomendações do Dia: as três cartas do dia, uma por oráculo, com a
//      nota prevista (ou a sua nota, se já avaliou), num painel com contorno
//      e a data do dia. É o único momento animado da página: as cartas são
//      "distribuídas" na mesa ao abrir. Durante um evento sazonal (Halloween
//      em outubro, Natal em dezembro) o painel vira o do evento
//      (seasonal/SeasonalEventPanel), com uma alternância para voltar ao do dia.
//
// O painel "Sua essência" (arquétipo + cinco balanças + persona) saiu da
// home e está guardado para a repaginação do Hub dos Oráculos.

// ---------------------------------------------------------------------------
// Relógio da troca das cartas (meia-noite de Brasília = 03:00 UTC). Isolado
// num componente próprio: só ele re-renderiza a cada segundo.
// ---------------------------------------------------------------------------

function msUntilReset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(3, 0, 0, 0);
  if (now >= target) target.setUTCDate(target.getUTCDate() + 1);
  return Math.max(0, target.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

const ResetCountdown: React.FC = () => {
  const [ms, setMs] = useState(msUntilReset);
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilReset()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="font-mono tabular-nums" style={{ color: PAPER }}>
      {formatCountdown(ms)}
    </time>
  );
};

// ---------------------------------------------------------------------------
// Tipos de dados
// ---------------------------------------------------------------------------

interface AccountStats {
  username: string;
  avatarUrl: string | null;
  avatarFrame: string | null;
  avatarIsPremium: boolean;
  // nota do usuário por id de filme (null = está na watchlist sem nota)
  movieRatings: Map<number, number | null>;
}

interface DailyPick {
  oracle: OracleId;
  movie: Movie;
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

// Celular e tablet usam o carrossel das Recomendações do Dia; no desktop as três
// cartas ficam lado a lado. O timer do carrossel só roda quando ele aparece.
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

const PICK_INTERVAL_MS = 6000;
const SWIPE_THRESHOLD = 50;
// Escolha entre o painel do evento e o do dia (vale enquanto a aba está aberta).
const PANEL_VIEW_KEY = 'cineoracle:homePanelView';

// Contorno e fundo do painel das Recomendações do Dia.
const DAILY_BORDER = 'linear-gradient(135deg, rgba(167,139,250,0.7), rgba(255,255,255,0.08) 38%, rgba(255,255,255,0.06) 62%, rgba(232,121,249,0.5))';
const DAILY_SURFACE =
  'radial-gradient(ellipse 60% 80% at 100% 0%, rgba(139,92,246,0.2), transparent 60%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(217,70,239,0.09), transparent 70%), #150F28';

interface Props {
  userId: string;
  username: string;
  // A página só "acende" quando o topo está pronto — assim a home abre
  // inteira de uma vez, sem blocos pulando.
  visible?: boolean;
  onReady?: () => void;
  onMovieClick: (movie: Movie) => void;
}

const HomeUserPanels: React.FC<Props> = ({ userId, username, visible = true, onReady, onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { unreadCount: unreadWhispers, openWhispersTarget, clearOpenWhispersTarget } = useWhispers();

  const [stats, setStats] = useState<AccountStats | null>(null);
  const [picks, setPicks] = useState<DailyPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [predictions, setPredictions] = useState<Record<number, number>>({});

  // Carrossel das Recomendações do Dia (celular): troca sozinho a cada 6s;
  // depois que a pessoa arrasta ou toca num pontinho, para de trocar sozinho.
  const [pickIndex, setPickIndex] = useState(0);
  const [pickDirection, setPickDirection] = useState(1);
  const [pickAutoPaused, setPickAutoPaused] = useState(false);
  const pickDragged = useRef(false);
  const isMobile = useMediaQuery('(max-width: 1023px)');

  const [insightsIsNew, setInsightsIsNew] = useState(false);
  const [showWhispers, setShowWhispers] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showOracleInfo, setShowOracleInfo] = useState(false);

  const { event: seasonal, theme: seasonalTheme } = useSeasonalEvent();
  const [panelView, setPanelView] = useState<HomePanelView>(() => {
    try {
      return sessionStorage.getItem(PANEL_VIEW_KEY) === 'daily' ? 'daily' : 'event';
    } catch {
      return 'event';
    }
  });
  const changePanelView = (view: HomePanelView) => {
    setPanelView(view);
    try {
      sessionStorage.setItem(PANEL_VIEW_KEY, view);
    } catch {
      // segue sem guardar
    }
  };
  const showEvent = Boolean(seasonal && seasonalTheme) && panelView === 'event';

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Pedido de abertura dos Sussurros vindo de uma notificação em outra tela.
  useEffect(() => {
    if (openWhispersTarget === 'home') {
      setShowWhispers(true);
      clearOpenWhispersTarget();
    }
  }, [openWhispersTarget, clearOpenWhispersTarget]);

  // O relatório do mês passado sempre existe a partir do dia 1º; o ponto
  // "novo" some depois que o usuário abre esse relatório específico.
  const lastMonth = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, []);

  useEffect(() => {
    supabase
      .from('user_monthly_insights_seen')
      .select('id')
      .eq('user_id', userId)
      .eq('year', lastMonth.year)
      .eq('month', lastMonth.month)
      .maybeSingle()
      .then(({ data }) => setInsightsIsNew(!data));
  }, [userId, lastMonth]);

  const openInsights = () => {
    setShowInsights(true);
    if (insightsIsNew) {
      supabase
        .from('user_monthly_insights_seen')
        .insert({ user_id: userId, year: lastMonth.year, month: lastMonth.month })
        .then(() => setInsightsIsNew(false));
    }
  };

  const fetchStats = useCallback(async () => {
    const [profileRes, moviesRes] = await Promise.all([
      supabase.from('public_profiles').select('username, avatar_url, avatar_frame, plan_type, is_premium').eq('id', userId).maybeSingle(),
      supabase.from('user_movies').select('movie_id, media_type, rating').eq('user_id', userId),
    ]);

    const rows = (moviesRes.data ?? []) as { movie_id: number; media_type: string | null; rating: number | null }[];
    const movieRatings = new Map<number, number | null>();
    rows.forEach((row) => {
      if ((row.media_type ?? 'movie') === 'movie') movieRatings.set(row.movie_id, row.rating);
    });
    const profile = profileRes.data as { username?: string; avatar_url?: string | null; avatar_frame?: string | null; plan_type?: string; is_premium?: boolean } | null;

    setStats({
      username: profile?.username ?? '',
      avatarUrl: profile?.avatar_url ?? null,
      avatarFrame: profile?.avatar_frame ?? null,
      avatarIsPremium: profile?.is_premium ?? profile?.plan_type === 'premium',
      movieRatings,
    });
  }, [userId]);

  const fetchDailyPicks = useCallback(async () => {
    setPicksLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_or_create_daily_oracle_recommendations');
      if (error || !data || data.length === 0) {
        setPicks([]);
        return;
      }
      const order: OracleId[] = ['bogart', 'fincher', 'cypher'];
      const loaded = await Promise.all(
        (data as { out_card_type: string; out_movie_id: number }[]).map(async (row) => {
          try {
            const movie = await getMovieDetails(row.out_movie_id, 'movie');
            return { oracle: row.out_card_type as OracleId, movie };
          } catch {
            return null;
          }
        })
      );
      const valid = loaded
        .filter((pick): pick is DailyPick => pick !== null && pick.oracle in ORACLE_BY_ID)
        .sort((a, b) => order.indexOf(a.oracle) - order.indexOf(b.oracle));
      setPicks(valid);

      // Nota prevista das cartas do dia (mesmo modelo do Oracle Filter).
      // Não segura a abertura da página: o selo aparece quando chegar.
      if (valid.length > 0) {
        supabase.functions
          .invoke('predict-watchlist-ratings', { body: { movieIds: valid.map((pick) => pick.movie.id) } })
          .then(({ data: result }) => setPredictions((result?.ratings as Record<number, number>) ?? {}))
          .catch(() => {});
      }
    } finally {
      setPicksLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchStats(), fetchDailyPicks()]).then(() => {
      if (!cancelled) onReadyRef.current?.();
    });
    return () => { cancelled = true; };
  }, [fetchStats, fetchDailyPicks]);

  useEffect(() => {
    if (!isMobile || !visible || showEvent || pickAutoPaused || picks.length <= 1) return;
    const id = setInterval(() => {
      setPickDirection(1);
      setPickIndex((i) => (i + 1) % picks.length);
    }, PICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isMobile, visible, showEvent, pickAutoPaused, picks.length]);

  const goToPick = (index: number, direction: number) => {
    setPickAutoPaused(true);
    setPickDirection(direction);
    setPickIndex(index);
  };

  const handlePickSwipe = (_event: unknown, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD && picks.length > 1) {
      const direction = info.offset.x < 0 ? 1 : -1;
      goToPick((pickIndex + direction + picks.length) % picks.length, direction);
    }
    // o toque que termina um arraste não deve abrir o filme
    setTimeout(() => { pickDragged.current = false; }, 60);
  };

  // ---------------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------------

  const displayName = username || stats?.username || '';
  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12
    ? t('home.desk.greetingMorning')
    : hour >= 12 && hour < 18
      ? t('home.desk.greetingAfternoon')
      : t('home.desk.greetingEvening');

  const formatScore = (value?: number) =>
    typeof value === 'number' && value > 0
      ? value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;

  const avatar = (() => {
    const frameComponent = frameUsesComponent(stats?.avatarFrame || undefined, stats?.avatarIsPremium ?? false);
    if (frameComponent === 'GhostRiderFrame' && stats?.avatarUrl) {
      return <GhostRiderFrame src={stats.avatarUrl} alt={displayName} size={64} />;
    }
    return (
      <div className={`w-16 h-16 rounded-full overflow-hidden ${getFrameClass(stats?.avatarFrame || undefined, stats?.avatarIsPremium ?? false)}`}>
        {stats?.avatarUrl ? (
          <img src={stats.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-2xl" style={{ ...PIXEL, background: VELVET, color: PAPER }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    );
  })();

  // Cada atalho tem a sua cor: azul, rosa e roxo.
  const quickLinks = [
    { to: '/library', icon: LibraryIcon, label: t('nav.library'), hint: t('home.desk.navLibraryHint'), color: '#38BDF8', tint: '#7DD3FC' },
    { to: '/oracle', icon: Eye, label: t('nav.oracle'), hint: t('home.desk.navOracleHint'), color: '#EC4899', tint: '#F9A8D4' },
    { to: '/profile', icon: User, label: t('nav.profile'), hint: t('home.desk.navProfileHint'), color: '#8B5CF6', tint: '#C4B5FD' },
  ];

  const dealList = {
    hidden: {},
    shown: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
  };
  const dealCard = {
    hidden: (i: number) => (reduceMotion ? { opacity: 1 } : { opacity: 0, y: 18, rotate: (i - 1) * 3 }),
    shown: reduceMotion
      ? { opacity: 1 }
      : { opacity: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 220, damping: 22 } },
  };

  const pickBadge = (movieId: number) => {
    const own = stats?.movieRatings.get(movieId);
    if (typeof own === 'number') {
      return (
        <span
          className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 pl-1 pr-1.5 py-0.5 rounded-full text-xs font-semibold shadow-lg"
          style={{ background: PAPER, color: INK }}
          title={t('home.desk.yourRating')}
        >
          <Star className="w-3 h-3 fill-current" aria-hidden />
          <span className="sr-only">{t('home.desk.yourRating')}:</span>
          {own}
        </span>
      );
    }
    const predicted = predictions[movieId];
    if (typeof predicted === 'number') {
      return (
        <span
          className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
          title={t('home.desk.predictedForYou')}
        >
          <Wand2 className="w-3 h-3" aria-hidden />
          <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
          <span style={PIXEL} className="text-sm leading-none">{predicted}</span>
        </span>
      );
    }
    return null;
  };

  const pickSlide = {
    enter: (direction: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 56 }),
    center: { opacity: 1, x: 0 },
    exit: (direction: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -56 }),
  };

  const renderPickTile = (pick: DailyPick) => {
    const oracle = ORACLE_BY_ID[pick.oracle];
    const year = pick.movie.release_date?.slice(0, 4);
    const score = formatScore(pick.movie.vote_average);
    const inWatchlist = stats?.movieRatings.get(pick.movie.id) === null;
    return (
      <button
        onClick={() => { if (pickDragged.current) return; onMovieClick(pick.movie); }}
        className={`group w-full h-full flex justify-start items-stretch gap-4 p-3 text-left rounded-xl ring-1 ring-white/10 hover:ring-white/25 transition ${focusRing}`}
        style={{ background: VELVET, boxShadow: '0 14px 30px -22px rgba(0,0,0,0.9)' }}
      >
        <span
          className="relative shrink-0 w-[84px] sm:w-[92px] aspect-[2/3] self-start rounded-lg overflow-hidden ring-1 ring-white/10"
          style={{ background: NIGHT, boxShadow: `0 14px 28px -16px ${oracle.color}` }}
        >
          {pick.movie.poster_path ? (
            <OptimizedPoster
              src={`https://image.tmdb.org/t/p/w185${pick.movie.poster_path}`}
              alt={pick.movie.title}
              className="absolute inset-0 w-full h-full object-cover"
              priority
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
              <Film className="w-7 h-7" aria-hidden />
            </span>
          )}
          {pickBadge(pick.movie.id)}
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: oracle.color }} />
        </span>
        <span className="min-w-0 flex-1 flex flex-col py-0.5">
          <span className="flex items-center gap-2">
            <img
              src={oracle.avatar}
              alt=""
              width={22}
              height={22}
              loading="lazy"
              decoding="async"
              className="w-[22px] h-[22px] rounded-full object-cover"
              style={{ boxShadow: `0 0 0 2px ${oracle.color}` }}
            />
            <span style={{ ...PIXEL, color: oracle.color }} className="text-base leading-none">{oracle.name}</span>
          </span>
          <span className="mt-2 font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
            {pick.movie.title}
          </span>
          <span className="mt-1 text-sm flex flex-wrap items-center gap-x-2" style={{ color: MIST }}>
            {year && <span>{year}</span>}
            {score && (
              <span className="inline-flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                {t('home.desk.publicScore', { score })}
              </span>
            )}
          </span>
          {inWatchlist ? (
            <span className="mt-auto pt-2 text-xs" style={{ color: MIST }}>{t('home.desk.inWatchlist')}</span>
          ) : pick.movie.overview ? (
            <span className="mt-2 text-sm leading-snug line-clamp-2" style={{ color: MIST }}>{pick.movie.overview}</span>
          ) : null}
        </span>
      </button>
    );
  };

  return (
    <>
      {/* ---------- Feed dos Amigos: os stories, no topo ---------- */}
      <FriendsFeed userId={userId} onMovieClick={onMovieClick} />

      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/profile" aria-label={t('nav.profile')} className={`shrink-0 rounded-full ${focusRing}`}>
              {avatar}
            </Link>
            <div className="min-w-0">
              <p className="text-sm sm:text-base" style={{ color: MIST }}>{greeting}</p>
              <h1 style={{ ...PIXEL, color: PAPER }} className="mt-1 text-[2rem] sm:text-5xl leading-none truncate">
                {displayName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={openInsights}
              aria-label={t('home.desk.insights')}
              className={`relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${focusRing}`}
              style={{ color: PAPER }}
            >
              <BarChart3 className="w-[18px] h-[18px] text-violet-300" aria-hidden />
              <span className="hidden sm:inline">{t('home.desk.insights')}</span>
              {insightsIsNew && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-fuchsia-500 ring-2" style={{ '--tw-ring-color': NIGHT } as React.CSSProperties}>
                  <span className="sr-only">{t('home.desk.newBadge')}</span>
                </span>
              )}
            </button>
            <button
              onClick={() => setShowWhispers(true)}
              aria-label={t('profile.whispers')}
              className={`relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${focusRing}`}
              style={{ color: PAPER }}
            >
              <MessageCircle className="w-[18px] h-[18px] text-violet-300" aria-hidden />
              <span className="hidden sm:inline">{t('profile.whispers')}</span>
              {unreadWhispers > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 grid place-items-center rounded-full bg-fuchsia-500 text-white text-[11px] font-bold ring-2" style={{ '--tw-ring-color': NIGHT } as React.CSSProperties}>
                  {unreadWhispers}
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* ---------- Acesso rápido ---------- */}
      <nav aria-label={t('home.desk.shortcutsLabel')} className="mx-auto max-w-6xl px-5 sm:px-8 pt-5 sm:pt-6">
        <ul className="grid grid-cols-3 gap-3 sm:gap-4">
          {quickLinks.map(({ to, icon: Icon, label, hint, color, tint }) => (
            <li key={to}>
              <Link
                to={to}
                className={`group h-full flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2.5 sm:gap-4 p-3.5 sm:px-5 sm:py-4 rounded-2xl ring-1 hover:brightness-125 text-center sm:text-left transition ${focusRing}`}
                style={{
                  background: `linear-gradient(135deg, ${withAlpha(color, 0.2)}, ${withAlpha(color, 0.06)} 70%), ${VELVET}`,
                  ['--tw-ring-color' as string]: withAlpha(color, 0.38),
                } as React.CSSProperties}
              >
                <span
                  className="w-11 h-11 shrink-0 rounded-xl grid place-items-center ring-1"
                  style={{ background: withAlpha(color, 0.2), color: tint, ['--tw-ring-color' as string]: withAlpha(color, 0.45) } as React.CSSProperties}
                  aria-hidden
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0 sm:flex-1">
                  <span className="block text-sm sm:text-base font-semibold" style={{ color: PAPER }}>{label}</span>
                  <span className="hidden lg:block mt-0.5 text-sm truncate" style={{ color: MIST }}>{hint}</span>
                </span>
                <ArrowRight className="hidden lg:block w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: tint }} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------- Recomendações do Dia (ou do evento sazonal) ---------- */}
      {/* pb menor: o link "Mais recomendações" encosta na próxima seção
          (que já tem o próprio respiro de 48px) sem um vão enorme. */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-12 pb-4 sm:pb-6">
        {showEvent && seasonal && seasonalTheme ? (
          <SeasonalEventPanel
            event={seasonal}
            theme={seasonalTheme}
            onMovieClick={onMovieClick}
            switcher={<PanelSwitch view={panelView} onChange={changePanelView} theme={seasonalTheme} />}
          />
        ) : (
          <div className="relative rounded-3xl p-px" style={{ background: DAILY_BORDER, boxShadow: '0 34px 80px -44px rgba(139,92,246,0.75)' }}>
            <div className="relative overflow-hidden rounded-[calc(1.5rem-1px)] p-5 sm:p-7" style={{ background: DAILY_SURFACE }}>
              {/* faixa com as cores dos três oráculos: um filme de cada */}
              <span aria-hidden className="absolute inset-x-0 top-0 flex h-1">
                {ORACLES.map((oracle) => (
                  <span key={oracle.id} className="flex-1" style={{ background: oracle.color }} />
                ))}
              </span>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 style={{ ...PIXEL, color: PAPER }} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-3xl sm:text-4xl leading-tight">
                    <span>{t('home.panels.dailyRecommendation')}</span>
                    <span
                      className="inline-flex items-center h-9 sm:h-10 px-2.5 rounded-lg text-xl sm:text-2xl leading-none tabular-nums"
                      style={{ background: PAPER, color: INK, boxShadow: '0 8px 18px -10px rgba(0,0,0,0.8)' }}
                    >
                      {formatDayMonth(new Date(), i18n.language)}
                    </span>
                  </h2>
                  <p className="mt-2 text-sm sm:text-base" style={{ color: MIST }}>
                    {t('home.desk.todaySubtitle')} {t('home.desk.todayRenews')} <ResetCountdown />
                  </p>
                  {/* no celular a alternância do evento fica embaixo do título */}
                  {seasonal && seasonalTheme && (
                    <div className="mt-4 sm:hidden">
                      <PanelSwitch view={panelView} onChange={changePanelView} theme={seasonalTheme} />
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {seasonal && seasonalTheme && (
                    <div className="hidden sm:block">
                      <PanelSwitch view={panelView} onChange={changePanelView} theme={seasonalTheme} />
                    </div>
                  )}
                  <button
                    onClick={() => setShowOracleInfo(true)}
                    aria-label={t('home.desk.todayHelp')}
                    title={t('home.desk.todayHelp')}
                    className={`shrink-0 grid place-items-center w-10 h-10 rounded-full hover:bg-white/5 transition ${focusRing}`}
                    style={{ color: MIST }}
                  >
                    <HelpCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {picksLoading ? (
                <div className="mt-6 grid gap-4 lg:grid-cols-3" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className={`${i > 0 ? 'hidden lg:flex' : 'flex'} gap-4 p-3 rounded-xl ring-1 ring-white/10`} style={{ background: VELVET }}>
                      <div className="w-[84px] sm:w-[92px] aspect-[2/3] rounded-lg bg-white/10 animate-pulse" />
                      <div className="flex-1 space-y-2.5 pt-1">
                        <div className="h-4 w-20 rounded bg-white/10 animate-pulse" />
                        <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
                        <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : picks.length > 0 ? (
                <>
                  {/* Desktop: as três cartas lado a lado, distribuídas na mesa */}
                  <motion.ol
                    className="mt-6 hidden lg:grid gap-4 lg:grid-cols-3"
                    variants={dealList}
                    initial="hidden"
                    animate={visible ? 'shown' : 'hidden'}
                  >
                    {picks.map((pick, i) => (
                      <motion.li key={pick.oracle} custom={i} variants={dealCard}>
                        {renderPickTile(pick)}
                      </motion.li>
                    ))}
                  </motion.ol>

                  {/* Celular e tablet: uma carta por vez, arrastando para os lados */}
                  <div
                    className="mt-6 lg:hidden"
                    aria-roledescription="carousel"
                    aria-label={t('home.panels.dailyRecommendation')}
                  >
                    {/* As três cartas ficam empilhadas invisíveis na mesma célula do
                        grid só para dar a altura da mais alta: a troca nunca faz a
                        página pular, mesmo com títulos de uma ou duas linhas. */}
                    <div className="grid">
                      {picks.map((pick) => (
                        <div key={`sizer-${pick.oracle}`} className="invisible" style={{ gridArea: '1 / 1' }} aria-hidden>
                          {renderPickTile(pick)}
                        </div>
                      ))}
                      <AnimatePresence initial={false} custom={pickDirection}>
                        <motion.div
                          key={picks[pickIndex % picks.length].oracle}
                          className="h-full"
                          style={{ gridArea: '1 / 1' }}
                          custom={pickDirection}
                          variants={pickSlide}
                          initial="enter"
                          animate="center"
                          exit="exit"
                          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                          drag={picks.length > 1 ? 'x' : false}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.22}
                          onDragStart={() => { pickDragged.current = true; }}
                          onDragEnd={handlePickSwipe}
                        >
                          {renderPickTile(picks[pickIndex % picks.length])}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {picks.length > 1 && (
                      <div className="mt-2 -mb-2 flex items-center justify-center" role="tablist" aria-label={t('home.panels.dailyRecommendation')}>
                        {picks.map((pick, i) => {
                          const active = i === pickIndex % picks.length;
                          const oracle = ORACLE_BY_ID[pick.oracle];
                          return (
                            <button
                              key={pick.oracle}
                              role="tab"
                              aria-selected={active}
                              aria-label={oracle.name}
                              onClick={() => goToPick(i, i >= pickIndex ? 1 : -1)}
                              className="grid place-items-center"
                              style={{ minWidth: 0, minHeight: 0, width: 30, height: 28, padding: 0 }}
                            >
                              <span
                                className="block rounded-full transition-all duration-300"
                                style={{ height: 8, width: active ? 22 : 8, background: active ? oracle.color : 'rgba(189,180,214,0.3)' }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-6 text-sm" style={{ color: MIST }}>{t('home.panels.noRecommendationToday')}</p>
              )}
            </div>
          </div>
        )}

        <Link
          to="/oracle"
          className={`mt-3 inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-violet-200 hover:text-white transition rounded ${focusRing}`}
        >
          {t('home.desk.moreRecs')}
          <ArrowRight className="w-4 h-4" aria-hidden />
        </Link>
      </section>

      {/* ---------- Modais ---------- */}
      <WhispersModal isOpen={showWhispers} onClose={() => setShowWhispers(false)} userId={userId} />
      <MonthlyInsightsModal isOpen={showInsights} onClose={() => setShowInsights(false)} userId={userId} />

      <OracleSheet open={showOracleInfo} onClose={() => setShowOracleInfo(false)} title={t('oracle.cards.infoTitle')} size="lg">
        <ul className="space-y-7">
          {ORACLES.map((oracle) => (
            <li key={oracle.id} className="flex gap-5">
              <img
                src={oracle.img}
                alt=""
                loading="lazy"
                className="w-20 sm:w-24 shrink-0 self-start rounded-[4px] ring-1 ring-white/10"
                style={{ boxShadow: `0 16px 32px -16px ${oracle.color}99` }}
              />
              <div className="min-w-0">
                <p style={{ ...PIXEL, color: oracle.color }} className="text-2xl leading-none">{oracle.name}</p>
                <p className="mt-2 font-semibold" style={{ color: PAPER }}>
                  {t(`oracle.cards.${oracle.id}`)} · {t(`oracle.cards.${oracle.id}Subtitle`)}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MIST }}>{t(`oracle.cards.${oracle.id}Desc`)}</p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: PAPER }}>{t(`oracle.cards.${oracle.id}Rec`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-7 pt-5 border-t border-white/[0.07] text-sm leading-relaxed" style={{ color: MIST }}>
          {t('home.desk.todayExplain')}
        </p>
      </OracleSheet>
    </>
  );
};

export default HomeUserPanels;