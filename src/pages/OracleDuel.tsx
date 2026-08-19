import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Star, Play, X, Loader2, Ticket, Trophy, Swords, Plus, HelpCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { getMovieTrailer, getMovieDetails } from '../lib/tmdb';
import { toast } from 'sonner';
import MovieDetailsModal from '../components/MovieDetailsModal';

interface DuelMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  overview: string;
  source: string;
}

// Mesmas cores usadas no modal "Conheça os Oráculos" da Câmara de Recomendação —
// mantém a identidade visual de cada oráculo consistente em todo o site.
const ORACLE_SEAL: Record<string, { emoji: string; bg: string; ring: string }> = {
  bogart: { emoji: '🐸', bg: 'bg-emerald-500', ring: 'ring-emerald-300' },
  fincher: { emoji: '🦊', bg: 'bg-red-500', ring: 'ring-red-300' },
  cypher: { emoji: '🐍', bg: 'bg-orange-500', ring: 'ring-orange-300' }
};

type CardType = 'bogart' | 'fincher' | 'cypher';

const MOOD_KEYS = [
  'adventures', 'catharsis', 'adrenaline', 'mind-blowing', 'laugh-out-loud',
  'drug-trip', 'romantic', 'dark-and-scary', 'family-time', 'random-surprise'
];

const MOOD_LABEL_KEY: Record<string, string> = {
  'adventures': 'adventures',
  'catharsis': 'catharsis',
  'adrenaline': 'adrenaline',
  'mind-blowing': 'mindBlowing',
  'laugh-out-loud': 'laughOutLoud',
  'drug-trip': 'drugTrip',
  'romantic': 'romantic',
  'dark-and-scary': 'darkScary',
  'family-time': 'familyTime',
  'random-surprise': 'randomSurprise'
};

// Mesmas cores por humor usadas na Câmara de Recomendação, pra manter consistência visual.
const MOOD_COLORS: Record<string, { bg: string; hover: string; text: string; border: string }> = {
  'adventures': { bg: 'bg-sky-500/20 dark:bg-sky-500/30', hover: 'hover:bg-sky-500/30 dark:hover:bg-sky-500/40', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-400/50 dark:border-sky-500/50' },
  'catharsis': { bg: 'bg-blue-500/20 dark:bg-blue-500/30', hover: 'hover:bg-blue-500/30 dark:hover:bg-blue-500/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400/50 dark:border-blue-500/50' },
  'adrenaline': { bg: 'bg-red-500/20 dark:bg-red-500/30', hover: 'hover:bg-red-500/30 dark:hover:bg-red-500/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-400/50 dark:border-red-500/50' },
  'mind-blowing': { bg: 'bg-pink-500/20 dark:bg-pink-500/30', hover: 'hover:bg-pink-500/30 dark:hover:bg-pink-500/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-400/50 dark:border-pink-500/50' },
  'laugh-out-loud': { bg: 'bg-green-500/20 dark:bg-green-500/30', hover: 'hover:bg-green-500/30 dark:hover:bg-green-500/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-400/50 dark:border-green-500/50' },
  'drug-trip': { bg: 'bg-emerald-500/20 dark:bg-emerald-500/30', hover: 'hover:bg-emerald-500/30 dark:hover:bg-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-400/50 dark:border-emerald-500/50' },
  'romantic': { bg: 'bg-orange-500/20 dark:bg-orange-500/30', hover: 'hover:bg-orange-500/30 dark:hover:bg-orange-500/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-400/50 dark:border-orange-500/50' },
  'dark-and-scary': { bg: 'bg-gray-500/20 dark:bg-gray-500/30', hover: 'hover:bg-gray-500/30 dark:hover:bg-gray-500/40', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-400/50 dark:border-gray-500/50' },
  'family-time': { bg: 'bg-yellow-500/20 dark:bg-yellow-500/30', hover: 'hover:bg-yellow-500/30 dark:hover:bg-yellow-500/40', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-400/50 dark:border-yellow-500/50' },
  'random-surprise': { bg: 'bg-violet-500/20 dark:bg-violet-500/30', hover: 'hover:bg-violet-500/30 dark:hover:bg-violet-500/40', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-400/50 dark:border-violet-500/50' }
};

const ORACLE_IDS: CardType[] = ['bogart', 'fincher', 'cypher'];
const ORACLE_NAMES: Record<CardType, string> = { bogart: 'BOGART', fincher: 'FINCHER', cypher: 'CYPHER' };

const DUEL_COST = 3;

type Phase = 'setup' | 'loading' | 'bracket' | 'champion';

export default function OracleDuel() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();

  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedOracles, setSelectedOracles] = useState<CardType[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<Date | null>(null);
  const [cardStyle, setCardStyle] = useState<'default' | 'yugioh'>('default');

  const [roundMovies, setRoundMovies] = useState<DuelMovie[]>([]);
  const [winners, setWinners] = useState<DuelMovie[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [champion, setChampion] = useState<DuelMovie | null>(null);

  const [trailerMovie, setTrailerMovie] = useState<DuelMovie | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  const [detailsMovie, setDetailsMovie] = useState<any | null>(null);
  const [loadingDetailsFor, setLoadingDetailsFor] = useState<number | null>(null);
  const [showOracleInfoModal, setShowOracleInfoModal] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      fetchTicketInfo();
      fetchCardStyle();
    }
  }, [session?.user?.id]);

  const fetchCardStyle = async () => {
    if (!session?.user?.id) return;
    try {
      const { data } = await supabase.from('profiles').select('card_style').eq('id', session.user.id).single();
      if (data?.card_style) setCardStyle(data.card_style as 'default' | 'yugioh');
    } catch (error) {
      console.error('Error fetching card style:', error);
    }
  };

  const fetchTicketInfo = async () => {
    try {
      const { data, error } = await supabase.rpc('check_and_reset_tickets', { user_id_param: session?.user?.id });
      if (error) throw error;
      if (data && data.length > 0) {
        setTicketsRemaining(data[0].tickets_remaining);
        setNextReset(new Date(data[0].next_reset));
      }
    } catch (error) {
      console.error('Error fetching ticket info:', error);
    }
  };

  const formatTimeUntilReset = () => {
    if (!nextReset) return '';
    const now = new Date();
    const diff = nextReset.getTime() - now.getTime();
    if (diff <= 0) return t('common.now');
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const getCardImage = (cardId: CardType) => {
    const suffix = cardStyle === 'yugioh' ? '2' : '';
    return `/assets/${ORACLE_NAMES[cardId]}${suffix}.webp`;
  };

  const toggleMood = (mood: string) => {
    setSelectedMoods((prev) => prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]);
  };

  const toggleOracle = (oracle: CardType) => {
    setSelectedOracles((prev) => prev.includes(oracle) ? prev.filter((o) => o !== oracle) : [...prev, oracle]);
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
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          moods: selectedMoods,
          cardTypes: selectedOracles,
          language: i18n.language
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setTicketsRemaining(data.ticketsRemaining ?? null);
        toast.error(data.error === 'Insufficient tickets' ? t('duel.notEnoughTickets', { needed: data.ticketsNeeded }) : data.error);
        setPhase('setup');
        return;
      }

      if (data.error) {
        toast.error(data.error);
        setPhase('setup');
        return;
      }

      setRoundMovies(data.movies);
      setTicketsRemaining(data.ticketsRemaining);
      setWinners([]);
      setPairIndex(0);
      setChampion(null);
      setPhase('bracket');
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

  const openTrailer = async (e: React.MouseEvent, movie: DuelMovie) => {
    e.stopPropagation();
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

  const closeTrailer = () => {
    setTrailerMovie(null);
    setTrailerKey(undefined);
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
    setSelectedMoods([]);
    setSelectedOracles([]);
    setRoundMovies([]);
    setWinners([]);
    setChampion(null);
  };

  const posterUrl = (path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://via.placeholder.com/500x750?text=No+Image';

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-pink-400/20 to-rose-400/20 dark:from-pink-600/10 dark:to-rose-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-violet-400/20 dark:from-purple-600/10 dark:to-violet-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <motion.button
            onClick={() => navigate('/oracle')}
            className="p-2.5 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl hover:bg-white/60 dark:hover:bg-gray-800/60 border border-white/60 dark:border-gray-700/60 rounded-full transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </motion.button>

          {/* Alternador entre Duelo (modo atual, padrão) e Recomendação Clássica */}
          <div className="flex items-center bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 rounded-full p-1">
            <div className="px-4 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white text-xs font-bold rounded-full shadow-sm">
              {t('duel.modeToggleDuel')}
            </div>
            <button
              onClick={() => navigate('/oracle/recommend')}
              className="px-4 py-1.5 text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full transition-colors"
            >
              {t('duel.modeToggleClassic')}
            </button>
          </div>
        </div>

        {/* SETUP */}
        {phase === 'setup' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <motion.div
                className="flex justify-center mb-4"
                animate={{ y: [-5, 5, -5] }}
                transition={{ duration: 4, repeat: Infinity, repeatType: 'reverse' }}
              >
                <div className="p-4 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 dark:from-pink-500/30 dark:to-rose-500/30 border border-pink-400/30">
                  <Swords className="w-12 h-12 text-pink-500 dark:text-pink-400" style={{ filter: 'drop-shadow(0 0 15px rgba(236, 72, 153, 0.4))' }} />
                </div>
              </motion.div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-rose-500 to-pink-500 tracking-wide mb-3">
                {t('duel.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-300 text-lg mb-8">{t('duel.description')}</p>

              {/* Contador de tickets, mesmo estilo da Câmara de Recomendação */}
              <motion.div
                className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 p-4 mb-8 inline-flex flex-col sm:flex-row items-center gap-4 sm:gap-8"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-amber-500" />
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{ticketsRemaining ?? '...'}</span>
                  <span className="text-gray-500 dark:text-gray-400">{t('oracle.ticketsLabel')}</span>
                </div>
                {nextReset && (
                  <>
                    <div className="hidden sm:block w-px h-5 bg-gray-300 dark:bg-gray-600" />
                    <div className="text-gray-600 dark:text-gray-300 text-sm">
                      <span className="font-semibold">{t('oracle.resetLabel')}:</span> {formatTimeUntilReset()}
                    </div>
                  </>
                )}
                <motion.button
                  onClick={() => navigate('/premium')}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all text-sm flex items-center gap-2"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <Plus className="w-4 h-4" />
                  {t('oracle.prediction.addMore')}
                </motion.button>
              </motion.div>
            </div>

            {/* Cards de oráculo — múltipla escolha */}
            <motion.div
              className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8 mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center justify-center gap-2 mb-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                  {t('duel.chooseOracles')}
                </h2>
                <button onClick={() => setShowOracleInfoModal(true)} className="text-pink-500 hover:text-pink-400 transition-colors">
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {ORACLE_IDS.map((oracleId) => {
                  const isSelected = selectedOracles.includes(oracleId);
                  return (
                    <motion.button
                      key={oracleId}
                      onClick={() => toggleOracle(oracleId)}
                      className={`relative overflow-hidden rounded-xl transition-all ${
                        isSelected
                          ? 'ring-2 ring-pink-500 shadow-lg shadow-pink-500/30'
                          : 'opacity-60 grayscale hover:opacity-80 hover:grayscale-0'
                      }`}
                      whileHover={{ scale: 1.03, y: -3 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <img src={getCardImage(oracleId)} alt={t(`oracle.cards.${oracleId}`)} className="w-full h-auto" />
                      <div className={`absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent ${isSelected ? '' : 'opacity-70'}`}>
                        <p className="text-white font-bold text-xs sm:text-sm text-center">{t(`oracle.cards.${oracleId}`)}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center shadow-lg">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {/* Chips de humor coloridos — múltipla escolha */}
            <motion.div
              className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6 text-center">
                {t('duel.chooseMoods')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {MOOD_KEYS.map((moodKey) => {
                  const isSelected = selectedMoods.includes(moodKey);
                  const moodStyle = MOOD_COLORS[moodKey];
                  return (
                    <motion.button
                      key={moodKey}
                      onClick={() => toggleMood(moodKey)}
                      className={`px-3 py-3 rounded-xl transition-all text-center border backdrop-blur-sm ${moodStyle.bg} ${moodStyle.hover} ${moodStyle.text} ${
                        isSelected ? `${moodStyle.border} ring-2 ring-offset-2 ring-offset-transparent shadow-lg` : 'border-transparent'
                      }`}
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="font-medium text-sm">{t(`oracle.moods.${MOOD_LABEL_KEY[moodKey]}`)}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {setupError && (
              <p className="text-center text-red-500 text-sm mb-4">{setupError}</p>
            )}

            <motion.div className="flex justify-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <motion.button
                onClick={startDuel}
                className="px-10 py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-lg rounded-2xl hover:shadow-xl hover:shadow-pink-500/30 transition-all flex items-center gap-3 border border-pink-400/30"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Sparkles className="w-5 h-5" />
                {t('duel.startDuel')}
                <span className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full text-sm">
                  <Ticket className="w-4 h-4" />
                  {DUEL_COST}
                </span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-6 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-400/30">
                <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 2, repeat: Infinity }}>
                  <Swords className="w-10 h-10 text-pink-500" />
                </motion.div>
              </div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500">
                {t('duel.assembling')}
              </h2>
            </div>
          </motion.div>
        )}

        {/* BRACKET */}
        {phase === 'bracket' && roundMovies.length >= 2 && (
          <motion.div key={`${roundMovies.length}-${pairIndex}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-semibold text-pink-600 dark:text-pink-300">
                {t('duel.roundOf', { count: roundMovies.length })}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('duel.pairProgress', { current: pairIndex + 1, total: roundMovies.length / 2 })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-stretch">
              {[roundMovies[pairIndex * 2], roundMovies[pairIndex * 2 + 1]].map((movie, idx) => (
                <motion.div
                  key={movie.id}
                  className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden flex flex-col"
                  initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div
                    className="aspect-[2/3] w-full overflow-hidden cursor-pointer group relative"
                    onClick={() => openDetails(movie)}
                  >
                                        <img
                      src={posterUrl(movie.poster_path)}
                      alt={movie.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image'; }}
                    />
                    <div className={`absolute top-2 left-2 w-8 h-8 rounded-full ${ORACLE_SEAL[movie.source]?.bg || 'bg-gray-500'} ring-2 ${ORACLE_SEAL[movie.source]?.ring || 'ring-gray-300'} shadow-lg flex items-center justify-center text-base`}>
                      {ORACLE_SEAL[movie.source]?.emoji || '🎬'}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                      {loadingDetailsFor === movie.id ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <p className="text-white text-sm font-semibold">{t('duel.clickForDetails')}</p>
                      )}
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-3">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white leading-snug line-clamp-2">{movie.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{movie.release_date ? new Date(movie.release_date).getFullYear() : '—'}</span>
                        <span className="flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                          {movie.vote_average.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => openTrailer(e, movie)}
                      className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-pink-600 dark:text-pink-300 bg-pink-500/10 hover:bg-pink-500/20 rounded-xl transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      {t('duel.watchTrailer')}
                    </button>

                    <button
                      onClick={() => chooseWinner(movie)}
                      className="mt-auto flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-pink-500 to-rose-500 hover:shadow-lg hover:shadow-pink-500/25 text-white font-bold rounded-xl shadow-md transition-all"
                    >
                      <Swords className="w-4 h-4" />
                      {t('duel.choose')}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* CHAMPION */}
        {phase === 'champion' && champion && (
          <motion.div className="text-center" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="flex justify-center mb-4">
              <motion.div animate={{ rotate: [0, -8, 8, -8, 0] }} transition={{ duration: 1, delay: 0.3 }}>
                <Trophy className="w-14 h-14 text-amber-400" />
              </motion.div>
            </div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-6">
              {t('duel.champion')}
            </h2>

            <div className="max-w-xs mx-auto rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden mb-6">
              <div
                className="aspect-[2/3] w-full overflow-hidden cursor-pointer group relative"
                onClick={() => openDetails(champion)}
              >
                                <img
                  src={posterUrl(champion.poster_path)}
                  alt={champion.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image'; }}
                />
                <div className={`absolute top-2 left-2 w-8 h-8 rounded-full ${ORACLE_SEAL[champion.source]?.bg || 'bg-gray-500'} ring-2 ${ORACLE_SEAL[champion.source]?.ring || 'ring-gray-300'} shadow-lg flex items-center justify-center text-base`}>
                  {ORACLE_SEAL[champion.source]?.emoji || '🎬'}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                  {loadingDetailsFor === champion.id ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <p className="text-white text-sm font-semibold">{t('duel.clickForDetails')}</p>
                  )}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">{champion.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {champion.release_date ? new Date(champion.release_date).getFullYear() : '—'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <button
                onClick={() => openDetails(champion)}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl shadow-md transition-all"
              >
                <Plus className="w-4 h-4" />
                {t('duel.viewAndAdd')}
              </button>
              <button
                onClick={restart}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-white/60 dark:bg-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-all"
              >
                <Sparkles className="w-4 h-4" />
                {t('duel.newDuel')}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* TRAILER MODAL */}
      <AnimatePresence>
        {trailerMovie && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeTrailer}
          >
            <motion.div
              className="relative w-full max-w-2xl bg-gray-950 rounded-2xl overflow-hidden shadow-2xl"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 className="text-white font-semibold truncate pr-4">{trailerMovie.title}</h3>
                <button onClick={closeTrailer} className="text-gray-400 hover:text-white flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="aspect-video bg-black flex items-center justify-center">
                {loadingTrailer ? (
                  <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
                ) : trailerKey ? (
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${trailerKey}`}
                    title="Trailer"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <p className="text-gray-400 text-center px-6">{t('duel.noTrailer')}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {detailsMovie && (
        <MovieDetailsModal
          movie={detailsMovie}
          isOpen={true}
          onClose={() => setDetailsMovie(null)}
        />
      )}

      <AnimatePresence>
        {showOracleInfoModal && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowOracleInfoModal(false)}
          >
            <motion.div
              className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowOracleInfoModal(false)}
                className="absolute top-4 right-4 p-2.5 bg-gray-200/60 dark:bg-gray-700/60 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-6 text-center pr-10">
                {t('oracle.cards.infoTitle')}
              </h2>

              <div className="space-y-4">
                <div className="rounded-xl p-4 border-2 border-pink-400/60 dark:border-pink-500/50 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/30 dark:to-rose-900/30 shadow-lg">
                  <div className="flex items-center gap-3">
                    <Info className="w-5 h-5 text-pink-500 flex-shrink-0" />
                    <p className="text-pink-700 dark:text-pink-300 text-sm font-medium leading-relaxed">
                      {t('oracle.cards.disclaimer')}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-emerald-300/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🐸
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                        {t('oracle.cards.bogart')} - {t('oracle.cards.bogartSubtitle')}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.bogartDesc')}
                      </p>
                      <p className="text-emerald-600 dark:text-emerald-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.bogartRec')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-red-300/50 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 dark:bg-red-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🦊
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
                        {t('oracle.cards.fincher')} - {t('oracle.cards.fincherSubtitle')}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.fincherDesc')}
                      </p>
                      <p className="text-red-600 dark:text-red-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.fincherRec')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-orange-300/50 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-orange-500/20 dark:bg-orange-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🐍
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-orange-600 dark:text-orange-400 mb-2">
                        {t('oracle.cards.cypher')} - {t('oracle.cards.cypherSubtitle')}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.cypherDesc')}
                      </p>
                      <p className="text-orange-600 dark:text-orange-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.cypherRec')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}