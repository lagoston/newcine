import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, Play, X, Loader2, Trophy, Swords, HelpCircle, Check, Crown, Film, Shuffle, Info } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { getMovieTrailer, getMovieDetails, type Movie } from '../lib/tmdb';
import { toast } from 'sonner';
import MovieDetailsModal from '../components/MovieDetailsModal';
import OracleSheet from '../components/OracleSheet';
import { MOODS } from '../lib/moods';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, POSTER_TITLE, ORACLES, ORACLE_BY_ID, OracleId, oracleCardImage, withAlpha } from '../lib/oracleTheme';

// Duelo do Oráculo (Premium).
//   1. Escolha os oráculos e os humores (as 9 prateleiras + Surpresa).
//   2. 8 filmes entram num chaveamento; a cada confronto você escolhe um.
//   3. Sobra o campeão da noite.
// O selo no canto do pôster é o oráculo que trouxe aquele filme.

interface DuelMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  overview: string;
  source: string;
}

type Phase = 'setup' | 'loading' | 'bracket' | 'champion';

const SURPRISE_KEY = 'random-surprise';
const SURPRISE_COLOR = '#A78BFA';

const GHOST_BUTTON = `gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;
const PRIMARY_BUTTON = `gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`;

const DuelPoster: React.FC<{ movie: DuelMovie; className?: string }> = ({ movie, className = '' }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`relative block aspect-[2/3] w-full overflow-hidden rounded-xl ring-1 ring-white/10 ${className}`} style={{ background: VELVET }}>
      {movie.poster_path && !failed ? (
        <img
          src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: MIST }}>
          <Film className="w-8 h-8" aria-hidden />
          <span className="text-sm leading-snug" style={{ color: PAPER }}>
            {movie.title}
          </span>
        </span>
      )}
    </span>
  );
};

// O oráculo que trouxe o filme, no canto do pôster.
const OracleSeal: React.FC<{ source: string }> = ({ source }) => {
  const oracle = ORACLE_BY_ID[source as OracleId];
  if (!oracle) return null;
  return (
    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 h-7 pl-0.5 pr-2.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(18,13,34,0.88)', color: oracle.color }}>
      <img src={oracle.avatar} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover" style={{ boxShadow: `0 0 0 1.5px ${oracle.color}` }} />
      <span style={PIXEL}>{oracle.name}</span>
    </span>
  );
};

export default function OracleDuel() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedOracles, setSelectedOracles] = useState<OracleId[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  // Duelo é inteiramente Premium; checkingPremium só evita mostrar a tela
  // errada antes de saber o status real.
  const [isPremium, setIsPremium] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);
  const [cardStyle, setCardStyle] = useState<string>('default');

  const [roundMovies, setRoundMovies] = useState<DuelMovie[]>([]);
  const [winners, setWinners] = useState<DuelMovie[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [champion, setChampion] = useState<DuelMovie | null>(null);

  const [trailerMovie, setTrailerMovie] = useState<DuelMovie | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  const [detailsMovie, setDetailsMovie] = useState<Movie | null>(null);
  const [loadingDetailsFor, setLoadingDetailsFor] = useState<number | null>(null);
  const [showOracleInfo, setShowOracleInfo] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    supabase
      .rpc('get_user_premium_status', { user_id_input: userId })
      .then(({ data, error }) => {
        if (error) console.error('Error fetching premium status:', error);
        setIsPremium(Boolean(data));
      })
      .then(() => setCheckingPremium(false));
    supabase
      .from('profiles')
      .select('card_style')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.card_style) setCardStyle(data.card_style as string);
      });
  }, [session?.user?.id]);

  // Esc fecha o trailer primeiro.
  useEffect(() => {
    if (!trailerMovie) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTrailerMovie(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trailerMovie]);

  const toggleMood = (mood: string) => {
    setSetupError(null);
    setSelectedMoods((prev) => (prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]));
  };

  const toggleOracle = (oracle: OracleId) => {
    setSetupError(null);
    setSelectedOracles((prev) => (prev.includes(oracle) ? prev.filter((o) => o !== oracle) : [...prev, oracle]));
  };

  const startDuel = async () => {
    if (selectedMoods.length === 0 || selectedOracles.length === 0) {
      setSetupError(t('duel.selectAtLeastOne'));
      return;
    }
    setSetupError(null);
    setPhase('loading');

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/oracle-duel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moods: selectedMoods, cardTypes: selectedOracles, language: i18n.language }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        toast.error(data.error === 'Premium required' ? t('duel.premiumRequired') : data.error || t('common.error'));
        setPhase('setup');
        return;
      }

      setRoundMovies(data.movies);
      setWinners([]);
      setPairIndex(0);
      setChampion(null);
      setPhase('bracket');
      window.scrollTo({ top: 0 });
    } catch (error) {
      console.error('Error starting duel:', error);
      toast.error(t('common.error'));
      setPhase('setup');
    }
  };

  const chooseWinner = (movie: DuelMovie) => {
    const newWinners = [...winners, movie];
    const isLastPairOfRound = pairIndex + 1 >= roundMovies.length / 2;

    if (!isLastPairOfRound) {
      setWinners(newWinners);
      setPairIndex(pairIndex + 1);
      return;
    }
    if (newWinners.length === 1) {
      setChampion(newWinners[0]);
      setPhase('champion');
      return;
    }
    setRoundMovies(newWinners);
    setWinners([]);
    setPairIndex(0);
  };

  const openTrailer = async (movie: DuelMovie) => {
    setTrailerMovie(movie);
    setTrailerKey(undefined);
    setLoadingTrailer(true);
    try {
      const trailer = await getMovieTrailer(movie.id, 'movie');
      setTrailerKey(trailer?.key || null);
    } catch {
      setTrailerKey(null);
    } finally {
      setLoadingTrailer(false);
    }
  };

  const openDetails = async (movie: DuelMovie) => {
    setLoadingDetailsFor(movie.id);
    try {
      const fullDetails = await getMovieDetails(movie.id, 'movie');
      setDetailsMovie(fullDetails);
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingDetailsFor(null);
    }
  };

  const restart = () => {
    setPhase('setup');
    setRoundMovies([]);
    setWinners([]);
    setChampion(null);
  };

  const formatScore = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const currentPair: DuelMovie[] = phase === 'bracket' ? [roundMovies[pairIndex * 2], roundMovies[pairIndex * 2 + 1]].filter(Boolean) : [];
  const canStart = selectedMoods.length > 0 && selectedOracles.length > 0;

  const stepTitle = (n: number, text: string) => (
    <h2 className="flex items-center gap-3" style={{ color: PAPER }}>
      <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-white/[0.07] text-lg leading-none" style={{ ...PIXEL, color: '#F0ABFC' }} aria-hidden>
        {n}
      </span>
      <span style={PIXEL} className="text-2xl sm:text-3xl leading-tight">
        {text}
      </span>
    </h2>
  );

  const moodChip = (key: string, label: string, color: string, letter: React.ReactNode) => {
    const active = selectedMoods.includes(key);
    return (
      <button
        key={key}
        onClick={() => toggleMood(key)}
        aria-pressed={active}
        className={`w-full gap-2.5 min-h-[48px] h-auto py-2 pl-2 pr-3 rounded-xl text-left text-sm font-medium transition ${FOCUS_RING} ${active ? '' : 'hover:bg-white/5'}`}
        style={{
          justifyContent: 'flex-start',
          color: active ? PAPER : MIST,
          background: active ? withAlpha(color, 0.16) : VELVET,
          boxShadow: `inset 0 0 0 ${active ? 2 : 1}px ${active ? color : 'rgba(255,255,255,0.1)'}`,
        }}
      >
        <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg text-lg leading-none" style={{ ...PIXEL, color, background: withAlpha(color, active ? 0.25 : 0.12) }} aria-hidden>
          {letter}
        </span>
        <span className="min-w-0 leading-tight">{label}</span>
        {active && <Check className="ml-auto w-4 h-4 shrink-0" style={{ color }} strokeWidth={3} aria-hidden />}
      </button>
    );
  };

  return (
    <div className="min-h-screen pb-16">
      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
        <Link to="/oracle" className={`-ml-2 gap-1.5 h-11 px-2 rounded-xl hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`} style={{ color: MIST, justifyContent: 'flex-start', display: 'inline-flex' }}>
          <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
          {t('oracle.title')}
        </Link>
        <h1 style={{ ...PIXEL, color: PAPER }} className="mt-3 text-[2.2rem] sm:text-5xl leading-none">
          {t('duel.title')}
        </h1>
        <p className="mt-3 text-[15px] sm:text-base max-w-xl" style={{ color: MIST }}>
          {t('duel.description')}
        </p>
      </section>

      <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-8">
        {checkingPremium ? (
          <div className="flex justify-center py-20" role="status">
            <Loader2 className="w-8 h-8 animate-spin text-violet-300" aria-hidden />
            <span className="sr-only">{t('common.loading')}</span>
          </div>
        ) : !isPremium ? (
          <div className="mx-auto max-w-lg rounded-2xl p-6 sm:p-8 ring-1 ring-white/10 text-center" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(251,191,36,0.12), transparent 70%), ${VELVET}` }}>
            <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-amber-500/15 ring-1 ring-amber-400/30">
              <Crown className="w-7 h-7 text-amber-300" aria-hidden />
            </span>
            <h2 style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl sm:text-3xl leading-tight">
              {t('duel.premiumFeatureTitle')}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: MIST }}>
              {t('duel.premiumFeatureDescription')}
            </p>
            <button onClick={() => navigate('/premium')} className={`mx-auto mt-6 ${PRIMARY_BUTTON}`}>
              <Crown className="w-5 h-5" aria-hidden />
              {t('oracle.viewPremium')}
            </button>
          </div>
        ) : (
          <>
            {/* ---------- 1 e 2: oráculos e humores ---------- */}
            {phase === 'setup' && (
              <div className="space-y-10">
                <section>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {stepTitle(1, t('duel.chooseOracles'))}
                    <button onClick={() => setShowOracleInfo(true)} className={GHOST_BUTTON} style={{ color: PAPER }}>
                      <HelpCircle className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                      {t('duel.meetOracles')}
                    </button>
                  </div>
                  <ul className="mt-5 grid grid-cols-3 gap-3 sm:gap-5 max-w-3xl">
                    {ORACLES.map((oracle) => {
                      const active = selectedOracles.includes(oracle.id);
                      return (
                        <li key={oracle.id}>
                          <button
                            onClick={() => toggleOracle(oracle.id)}
                            aria-pressed={active}
                            className={`group w-full flex flex-col items-stretch justify-start text-left rounded-xl p-1.5 sm:p-2 transition ${FOCUS_RING}`}
                            style={{ background: active ? withAlpha(oracle.color, 0.14) : 'transparent', boxShadow: `inset 0 0 0 ${active ? 2 : 1}px ${active ? oracle.color : 'rgba(255,255,255,0.1)'}` }}
                          >
                            <span className="relative block overflow-hidden rounded-lg">
                              <img
                                src={oracleCardImage(oracle.id, cardStyle)}
                                alt=""
                                decoding="async"
                                className={`block w-full h-auto transition duration-300 ${active ? '' : 'opacity-60 grayscale-[0.6] group-hover:opacity-90 group-hover:grayscale-0'}`}
                              />
                              {active && (
                                <span className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-full shadow-lg" style={{ background: oracle.color }} aria-hidden>
                                  <Check className="w-4 h-4" style={{ color: NIGHT }} strokeWidth={3} />
                                </span>
                              )}
                            </span>
                            <span style={{ ...PIXEL, color: oracle.color }} className="mt-2.5 px-1 text-lg sm:text-2xl leading-none">
                              {oracle.name}
                            </span>
                            <span className="mt-1 px-1 pb-1 text-xs sm:text-sm leading-snug" style={{ color: MIST }}>
                              {t(`oracle.cards.${oracle.id}Subtitle`)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section className="border-t border-white/[0.07] pt-10">
                  {stepTitle(2, t('duel.chooseMoods'))}
                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5" role="group" aria-label={t('duel.chooseMoods')}>
                    {MOODS.map((mood) => moodChip(mood.key, t(mood.labelKey), mood.color, mood.letter))}
                    {moodChip(SURPRISE_KEY, t('oracle.moods.randomSurprise'), SURPRISE_COLOR, <Shuffle className="w-4 h-4" />)}
                  </div>
                </section>

                <section className="border-t border-white/[0.07] pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm" style={{ color: setupError ? '#FCA5A5' : MIST }} role={setupError ? 'alert' : undefined}>
                    {setupError ??
                      `${t('duel.oraclesCount', { count: selectedOracles.length })} · ${t('duel.moodsCount', { count: selectedMoods.length })}`}
                  </p>
                  <button onClick={startDuel} disabled={!canStart} className={PRIMARY_BUTTON}>
                    <Swords className="w-5 h-5" aria-hidden />
                    {t('duel.startDuel')}
                  </button>
                </section>
              </div>
            )}

            {/* ---------- Montando ---------- */}
            {phase === 'loading' && (
              <div className="flex flex-col items-center py-20 gap-4" role="status">
                <motion.span
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="grid place-items-center w-14 h-14 rounded-2xl bg-pink-500/15 ring-1 ring-pink-400/30"
                >
                  <Swords className="w-7 h-7 text-pink-300" aria-hidden />
                </motion.span>
                <p className="text-sm" style={{ color: MIST }}>
                  {t('duel.assembling')}
                </p>
              </div>
            )}

            {/* ---------- Chaveamento ---------- */}
            {phase === 'bracket' && currentPair.length === 2 && (
              <div className="mx-auto max-w-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-sm font-semibold bg-pink-500/15 text-pink-200 ring-1 ring-pink-400/30">
                    <Swords className="w-4 h-4" aria-hidden />
                    {t('duel.roundOf', { count: roundMovies.length })}
                  </span>
                  <span className="flex items-center gap-2 text-sm" style={{ color: MIST }}>
                    {t('duel.pairProgress', { current: pairIndex + 1, total: roundMovies.length / 2 })}
                    <span className="flex gap-1" aria-hidden>
                      {Array.from({ length: roundMovies.length / 2 }).map((_, i) => (
                        <span key={i} className="h-1.5 rounded-full transition-all" style={{ width: i === pairIndex ? 18 : 6, background: i <= pairIndex ? '#F472B6' : 'rgba(189,180,214,0.3)' }} />
                      ))}
                    </span>
                  </span>
                </div>

                <div className="duel-arena mt-5">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {currentPair.map((movie, idx) => (
                      <motion.div
                        key={`${roundMovies.length}-${pairIndex}-${movie.id}`}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: idx === 0 ? -16 : 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex flex-col min-w-0"
                      >
                        <button onClick={() => openDetails(movie)} aria-label={t('watchlistDuel.openDetails', { title: movie.title })} className={`group relative block w-full rounded-xl ${FOCUS_RING}`}>
                          <DuelPoster movie={movie} className="shadow-xl" />
                          <OracleSeal source={movie.source} />
                          {loadingDetailsFor === movie.id && (
                            <span className="absolute inset-0 rounded-xl bg-black/55 grid place-items-center">
                              <Loader2 className="w-6 h-6 text-white animate-spin" aria-hidden />
                            </span>
                          )}
                        </button>
                        <p className={`mt-2.5 text-sm sm:text-base font-semibold ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                          {movie.title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                          {movie.release_date && <span>{movie.release_date.slice(0, 4)}</span>}
                          {movie.vote_average > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                              {formatScore(movie.vote_average)}
                            </span>
                          )}
                        </p>
                        <button onClick={() => openTrailer(movie)} className={`mt-2.5 ${GHOST_BUTTON} h-10 text-xs`} style={{ color: PAPER }}>
                          <Play className="w-3.5 h-3.5 fill-fuchsia-300 text-fuchsia-300" aria-hidden />
                          {t('duel.watchTrailer')}
                        </button>
                        <button onClick={() => chooseWinner(movie)} className={`mt-2 ${PRIMARY_BUTTON} h-11 px-3 text-sm whitespace-nowrap`}>
                          <Swords className="hidden sm:block w-4 h-4" aria-hidden />
                          {t('duel.choose')}
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <span aria-hidden className="duel-vs" style={PIXEL}>
                    VS
                  </span>
                </div>
              </div>
            )}

            {/* ---------- Campeão ---------- */}
            {phase === 'champion' && champion && (
              <div className="mx-auto max-w-md text-center">
                <motion.span
                  initial={reduceMotion ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/30"
                >
                  <Trophy className="w-7 h-7 text-amber-300" aria-hidden />
                </motion.span>
                <p className="mt-3 text-sm font-semibold text-amber-200">{t('duel.champion')}</p>
                <button onClick={() => openDetails(champion)} aria-label={t('watchlistDuel.openDetails', { title: champion.title })} className={`group relative mt-4 mx-auto block w-44 rounded-xl ${FOCUS_RING}`}>
                  <DuelPoster movie={champion} className="shadow-2xl ring-2 ring-amber-300/40" />
                  <OracleSeal source={champion.source} />
                  {loadingDetailsFor === champion.id && (
                    <span className="absolute inset-0 rounded-xl bg-black/55 grid place-items-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" aria-hidden />
                    </span>
                  )}
                </button>
                <p style={{ ...PIXEL, color: PAPER }} className="mt-4 text-2xl leading-tight">
                  {champion.title}
                </p>
                {champion.vote_average > 0 && (
                  <p className="mt-1 inline-flex items-center justify-center gap-1 text-sm" style={{ color: MIST }}>
                    <Star className="w-4 h-4 fill-amber-300 text-amber-300" aria-hidden />
                    {formatScore(champion.vote_average)}
                  </p>
                )}
                <div className="mt-6 grid sm:grid-cols-2 gap-2.5">
                  <button onClick={() => openDetails(champion)} className={PRIMARY_BUTTON}>
                    {t('duel.viewAndAdd')}
                  </button>
                  <button onClick={restart} className={`${GHOST_BUTTON} h-12`} style={{ color: PAPER }}>
                    {t('duel.newDuel')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- Trailer ---------- */}
      <AnimatePresence>
        {trailerMovie && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${t('duel.watchTrailer')} — ${trailerMovie.title}`}>
            <motion.div className="absolute inset-0 bg-black/85 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setTrailerMovie(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-3xl rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl"
              style={{ background: NIGHT }}
            >
              <div className="flex items-center justify-between gap-4 pl-5 pr-2 py-2 border-b border-white/[0.07]">
                <div className="min-w-0">
                  <p style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
                    {t('movieModal.trailer')}
                  </p>
                  <p className="mt-1 text-sm truncate" style={{ color: MIST }}>
                    {trailerMovie.title}
                  </p>
                </div>
                <button onClick={() => setTrailerMovie(null)} aria-label={t('common.close')} className={`shrink-0 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`} style={{ color: MIST }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="aspect-video bg-black grid place-items-center">
                {loadingTrailer ? (
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: MIST }} aria-hidden />
                ) : trailerKey ? (
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${trailerKey}`}
                    title={`${t('movieModal.trailer')} — ${trailerMovie.title}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <Film className="w-8 h-8" style={{ color: MIST }} aria-hidden />
                    <p style={{ color: MIST }}>{t('duel.noTrailer')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {detailsMovie && <MovieDetailsModal movie={detailsMovie} isOpen={true} onClose={() => setDetailsMovie(null)} />}

      {/* ---------- Conheça os oráculos ---------- */}
      <OracleSheet open={showOracleInfo} onClose={() => setShowOracleInfo(false)} title={t('oracle.cards.infoTitle')} size="lg">
        <p className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed ring-1 ring-fuchsia-400/25 bg-fuchsia-500/[0.07]" style={{ color: PAPER }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-fuchsia-300" aria-hidden />
          {t('oracle.cards.disclaimer')}
        </p>
        <ul className="mt-6 space-y-6">
          {ORACLES.map((oracle) => (
            <li key={oracle.id} className="flex gap-5">
              <img
                src={oracleCardImage(oracle.id, cardStyle)}
                alt=""
                loading="lazy"
                className="w-[88px] sm:w-[104px] h-auto shrink-0 self-start rounded-lg"
                style={{ boxShadow: `0 16px 32px -16px ${withAlpha(oracle.color, 0.6)}` }}
              />
              <div className="min-w-0">
                <p style={{ ...PIXEL, color: oracle.color }} className="text-2xl leading-none">
                  {oracle.name}
                </p>
                <p className="mt-1 text-sm" style={{ color: MIST }}>
                  {t(`oracle.cards.${oracle.id}`)} · {t(`oracle.cards.${oracle.id}Subtitle`)}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MIST }}>
                  {t(`oracle.cards.${oracle.id}Desc`)}
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: PAPER }}>
                  {t(`oracle.cards.${oracle.id}Rec`)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </OracleSheet>
    </div>
  );
}
