import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Star, Play, X, Loader2, Ticket, Trophy, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { getMovieTrailer } from '../lib/tmdb';
import { toast } from 'sonner';
import MovieDetailsModal from '../components/MovieDetailsModal';

interface DuelMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  overview: string;
}

const MOODS = [
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

const ORACLES: { id: 'bogart' | 'fincher' | 'cypher'; emoji: string }[] = [
  { id: 'bogart', emoji: '🐸' },
  { id: 'fincher', emoji: '🦊' },
  { id: 'cypher', emoji: '🐍' }
];

const DUEL_COST = 5;

type Phase = 'setup' | 'loading' | 'bracket' | 'champion';

export default function OracleDuel() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');

  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [selectedOracles, setSelectedOracles] = useState<string[]>([]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);

  const [roundMovies, setRoundMovies] = useState<DuelMovie[]>([]);
  const [winners, setWinners] = useState<DuelMovie[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [champion, setChampion] = useState<DuelMovie | null>(null);

  const [trailerMovie, setTrailerMovie] = useState<DuelMovie | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  const [detailsMovie, setDetailsMovie] = useState<any | null>(null);

  const toggleMood = (mood: string) => {
    setSelectedMoods((prev) => prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood]);
  };

  const toggleOracle = (oracle: string) => {
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

  const closeTrailer = () => {
    setTrailerMovie(null);
    setTrailerKey(undefined);
  };

  const restart = () => {
    setPhase('setup');
    setSelectedMoods([]);
    setSelectedOracles([]);
    setRoundMovies([]);
    setWinners([]);
    setChampion(null);
  };

  const totalRounds = roundMovies.length > 0 ? Math.log2(roundMovies.length) : 0;

  const posterUrl = (path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://via.placeholder.com/500x750?text=No+Image';

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-4xl mx-auto relative z-10">
        <motion.button
          onClick={() => navigate('/oracle')}
          className="p-2.5 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl hover:bg-white/60 dark:hover:bg-gray-800/60 border border-white/60 dark:border-gray-700/60 rounded-full transition-colors mb-8"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </motion.button>

        {/* SETUP */}
        {phase === 'setup' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-400/30">
                  <Trophy className="w-10 h-10 text-violet-500" />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500 mb-3">
                {t('duel.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-300 text-lg">{t('duel.description')}</p>
            </div>

            <div className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">{t('duel.chooseMoods')}</h2>
              <div className="flex flex-wrap gap-2">
                {MOODS.map((mood) => (
                  <button
                    key={mood}
                    onClick={() => toggleMood(mood)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedMoods.includes(mood)
                        ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                        : 'bg-gray-100/80 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {t(`oracle.moods.${MOOD_LABEL_KEY[mood]}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 mb-8">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">{t('duel.chooseOracles')}</h2>
              <div className="flex flex-wrap gap-3">
                {ORACLES.map((oracle) => (
                  <button
                    key={oracle.id}
                    onClick={() => toggleOracle(oracle.id)}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all ${
                      selectedOracles.includes(oracle.id)
                        ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                        : 'bg-gray-100/80 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="text-lg">{oracle.emoji}</span>
                    {t(`oracle.cards.${oracle.id}`)}
                  </button>
                ))}
              </div>
            </div>

            {setupError && (
              <p className="text-center text-red-500 text-sm mb-4">{setupError}</p>
            )}

            <motion.button
              onClick={startDuel}
              className="w-full flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all text-lg"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Sparkles className="w-5 h-5" />
              {t('duel.startDuel')}
              <span className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full text-sm">
                <Ticket className="w-4 h-4" />
                {DUEL_COST}
              </span>
            </motion.button>
          </motion.div>
        )}

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 text-violet-500 animate-spin" />
            <p className="text-violet-600 dark:text-violet-300 text-lg italic">{t('duel.assembling')}</p>
          </div>
        )}

        {/* BRACKET */}
        {phase === 'bracket' && roundMovies.length >= 2 && (
          <motion.div key={`${roundMovies.length}-${pairIndex}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">
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
                  whileHover={{ scale: 1.02 }}
                  initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="aspect-[2/3] w-full overflow-hidden">
                    <img src={posterUrl(movie.poster_path)} alt={movie.title} className="w-full h-full object-cover" />
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
                      onClick={() => openTrailer(movie)}
                      className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-violet-600 dark:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 rounded-xl transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      {t('duel.watchTrailer')}
                    </button>

                    <button
                      onClick={() => chooseWinner(movie)}
                      className="mt-auto flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white font-bold rounded-xl shadow-md transition-all"
                    >
                      <Trophy className="w-4 h-4" />
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
          <motion.div
            className="text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="flex justify-center mb-4">
              <motion.div
                animate={{ rotate: [0, -8, 8, -8, 0] }}
                transition={{ duration: 1, delay: 0.3 }}
              >
                <Trophy className="w-14 h-14 text-amber-400" />
              </motion.div>
            </div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-purple-500 mb-6">
              {t('duel.champion')}
            </h2>

            <div className="max-w-xs mx-auto rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden mb-6">
              <div className="aspect-[2/3] w-full overflow-hidden">
                <img src={posterUrl(champion.poster_path)} alt={champion.title} className="w-full h-full object-cover" />
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
                onClick={() => setDetailsMovie({
                  id: champion.id,
                  title: champion.title,
                  poster_path: champion.poster_path,
                  overview: champion.overview,
                  release_date: champion.release_date,
                  vote_average: champion.vote_average,
                  media_type: 'movie',
                  genres: []
                })}
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
                  <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
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
    </motion.div>
  );
}