import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
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
import { NIGHT, VELVET, PAPER, INK, MIST, PIXEL, ORACLES, ORACLE_BY_ID, OracleId } from '../lib/oracleTheme';

// Topo da home de quem está logado — "a mesa do oráculo".
//   1. Cabeçalho: saudação, números da conta e os atalhos pessoais
//      (Insights do mês e Sussurros).
//   2. Três botões de acesso: Biblioteca, Oráculo e Perfil.
//   3. Recomendações do Dia: as três cartas do dia, uma por oráculo, com a
//      nota prevista (ou a sua nota, se já avaliou). É o único momento
//      animado da página: as cartas são "distribuídas" na mesa ao abrir.
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
  rated: number;
  watchlist: number;
  friends: number;
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

  const [insightsIsNew, setInsightsIsNew] = useState(false);
  const [showWhispers, setShowWhispers] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showOracleInfo, setShowOracleInfo] = useState(false);

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
    const [profileRes, moviesRes, friendsRes] = await Promise.all([
      supabase.from('public_profiles').select('username, avatar_url, avatar_frame, plan_type, is_premium').eq('id', userId).maybeSingle(),
      supabase.from('user_movies').select('movie_id, media_type, rating').eq('user_id', userId),
      supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    ]);

    const rows = (moviesRes.data ?? []) as { movie_id: number; media_type: string | null; rating: number | null }[];
    const movieRatings = new Map<number, number | null>();
    rows.forEach((row) => {
      if ((row.media_type ?? 'movie') === 'movie') movieRatings.set(row.movie_id, row.rating);
    });
    const friends = friendsRes.count ?? 0;
    const profile = profileRes.data as { username?: string; avatar_url?: string | null; avatar_frame?: string | null; plan_type?: string; is_premium?: boolean } | null;

    setStats({
      username: profile?.username ?? '',
      avatarUrl: profile?.avatar_url ?? null,
      avatarFrame: profile?.avatar_frame ?? null,
      avatarIsPremium: profile?.is_premium ?? profile?.plan_type === 'premium',
      rated: rows.filter((row) => row.rating !== null).length,
      watchlist: rows.filter((row) => row.rating === null).length,
      friends,
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

  const statLink = (to: string, count: number, labelKey: string) => (
    <Link to={to} className={`group inline-flex items-baseline gap-1.5 rounded ${focusRing}`}>
      <span className="font-semibold tabular-nums" style={{ color: PAPER }}>{count}</span>
      <span className="group-hover:underline underline-offset-4" style={{ color: MIST }}>{t(labelKey, { count })}</span>
    </Link>
  );

  const quickLinks = [
    { to: '/library', icon: LibraryIcon, label: t('nav.library'), hint: t('home.desk.navLibraryHint') },
    { to: '/oracle', icon: Eye, label: t('nav.oracle'), hint: t('home.desk.navOracleHint') },
    { to: '/profile', icon: User, label: t('nav.profile'), hint: t('home.desk.navProfileHint') },
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

  return (
    <>
      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
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

        {stats && (
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm sm:text-[15px]">
            {statLink('/library', stats.rated, 'home.desk.statRated')}
            {statLink('/library', stats.watchlist, 'home.desk.statWatchlist')}
            {statLink('/community', stats.friends, 'home.desk.statFriends')}
          </p>
        )}
      </section>

      {/* ---------- Acesso rápido ---------- */}
      <nav aria-label={t('home.desk.shortcutsLabel')} className="mx-auto max-w-6xl px-5 sm:px-8 pt-7">
        <ul className="grid grid-cols-3 gap-3 sm:gap-4">
          {quickLinks.map(({ to, icon: Icon, label, hint }) => (
            <li key={to}>
              <Link
                to={to}
                className={`group h-full flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-2.5 sm:gap-4 p-3.5 sm:px-5 sm:py-4 rounded-2xl ring-1 ring-white/10 hover:ring-white/25 hover:bg-white/[0.03] text-center sm:text-left transition ${focusRing}`}
                style={{ background: VELVET }}
              >
                <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: NIGHT }} aria-hidden>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="min-w-0 sm:flex-1">
                  <span className="block text-sm sm:text-base font-semibold" style={{ color: PAPER }}>{label}</span>
                  <span className="hidden sm:block mt-0.5 text-sm truncate" style={{ color: MIST }}>{hint}</span>
                </span>
                <ArrowRight className="hidden lg:block w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: MIST }} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------- Recomendações do Dia ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-12 pb-14 sm:pb-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl leading-tight">
              {t('home.panels.dailyRecommendation')}
            </h2>
            <p className="mt-2 text-sm sm:text-base" style={{ color: MIST }}>
              {t('home.desk.todaySubtitle')} {t('home.desk.todayRenews')} <ResetCountdown />
            </p>
          </div>
          <button
            onClick={() => setShowOracleInfo(true)}
            aria-label={t('home.desk.todayHelp')}
            title={t('home.desk.todayHelp')}
            className={`shrink-0 rounded-full hover:bg-white/5 transition ${focusRing}`}
            style={{ color: MIST }}
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {picksLoading ? (
          <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4 p-3 rounded-xl ring-1 ring-white/10" style={{ background: VELVET }}>
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
          <motion.ol
            className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-3"
            variants={dealList}
            initial="hidden"
            animate={visible ? 'shown' : 'hidden'}
          >
            {picks.map((pick, i) => {
              const oracle = ORACLE_BY_ID[pick.oracle];
              const year = pick.movie.release_date?.slice(0, 4);
              const score = formatScore(pick.movie.vote_average);
              const inWatchlist = stats?.movieRatings.get(pick.movie.id) === null;
              return (
                <motion.li key={pick.oracle} custom={i} variants={dealCard}>
                  <button
                    onClick={() => onMovieClick(pick.movie)}
                    className={`group w-full h-full flex justify-start items-stretch gap-4 p-3 text-left rounded-xl ring-1 ring-white/10 hover:ring-white/25 transition ${focusRing}`}
                    style={{ background: VELVET }}
                  >
                    <span
                      className="relative shrink-0 w-[84px] sm:w-[92px] aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10"
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
                </motion.li>
              );
            })}
          </motion.ol>
        ) : (
          <p className="mt-6 text-sm" style={{ color: MIST }}>{t('home.panels.noRecommendationToday')}</p>
        )}

        <Link
          to="/oracle/libraries"
          className={`mt-6 inline-flex items-center gap-2 text-sm font-semibold text-violet-200 hover:text-white transition rounded ${focusRing}`}
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