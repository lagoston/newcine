import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Wand2, Star, Eye, EyeOff, Users2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getMovieDetailsFromDB } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';

interface MatchMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  otherUserId: string;
  otherUsername: string;
}

type Mode = 'unseen' | 'one' | 'both';
type Phase = 'setup' | 'loading' | 'results';

interface MatchedMovie {
  id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  scoreA: number;
  scoreB: number;
  wasRatedA: boolean;
  wasRatedB: boolean;
  matchScore: number;
}

const posterUrl = (path: string | null) =>
  path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://via.placeholder.com/500x750?text=No+Image';

// Mesmos 9 humores usados no Duelo/Recomendação Clássica — o valor à direita
// é o formato real salvo em recommendation_pools.mood_key (com hífen), a
// chave à esquerda é a de tradução (oracle.moods.*, camelCase).
const MOODS: { labelKey: string; value: string }[] = [
  { labelKey: 'oracle.moods.adventures', value: 'adventures' },
  { labelKey: 'oracle.moods.catharsis', value: 'catharsis' },
  { labelKey: 'oracle.moods.adrenaline', value: 'adrenaline' },
  { labelKey: 'oracle.moods.mindBlowing', value: 'mind-blowing' },
  { labelKey: 'oracle.moods.laughOutLoud', value: 'laugh-out-loud' },
  { labelKey: 'oracle.moods.drugTrip', value: 'drug-trip' },
  { labelKey: 'oracle.moods.romantic', value: 'romantic' },
  { labelKey: 'oracle.moods.darkScary', value: 'dark-and-scary' },
  { labelKey: 'oracle.moods.familyTime', value: 'family-time' },
];

export default function MatchMovieModal({ isOpen, onClose, otherUserId, otherUsername }: MatchMovieModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<Mode>('unseen');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [matches, setMatches] = useState<MatchedMovie[]>([]);
  const [isUnderdog, setIsUnderdog] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<any | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);

  const toggleMood = (value: string) => {
    setSelectedMoods((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  };

  const modes: { id: Mode; icon: React.ElementType; labelKey: string }[] = [
    { id: 'unseen', icon: EyeOff, labelKey: 'matchMovie.modeUnseen' },
    { id: 'one', icon: Eye, labelKey: 'matchMovie.modeOne' },
    { id: 'both', icon: Users2, labelKey: 'matchMovie.modeBoth' },
  ];

  const handleFindMatch = async () => {
    try {
      setPhase('loading');
      const response = await fetch(`${supabaseUrl}/functions/v1/match-movie`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendId: otherUserId, mode, moods: selectedMoods, language: i18n.language })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        toast.error(data.error || t('common.error'));
        setPhase('setup');
        return;
      }
      setMatches(data.movies || []);
      setIsUnderdog(!!data.isUnderdog);
      setPhase('results');
    } catch (error) {
      console.error('Error finding match:', error);
      toast.error(t('common.error'));
      setPhase('setup');
    }
  };

  const handleOpenMovie = async (movieId: number) => {
    setLoadingMovieId(movieId);
    try {
      const details = await getMovieDetailsFromDB(movieId, 'movie');
      setSelectedMovie(details);
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingMovieId(null);
    }
  };

  const handleClose = () => {
    setPhase('setup');
    setMatches([]);
    onClose();
  };

  if (!isOpen) return null;

  const topMatch = matches[0];
  const restMatches = matches.slice(1);

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9998] flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-gradient-to-br from-blue-50/95 via-purple-50/90 to-pink-50/95 dark:from-gray-900/95 dark:via-blue-950/90 dark:to-purple-950/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 dark:border-gray-700/60 p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            <div className="text-center mb-6">
              <motion.div
                className="inline-flex p-3 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-400/30 mb-3"
                animate={phase === 'loading' ? { rotate: 360 } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Wand2 className="w-7 h-7 text-pink-500 dark:text-pink-400" />
              </motion.div>
              <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500">
                {t('matchMovie.title')}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
                {t('matchMovie.subtitle', { username: otherUsername })}
              </p>
            </div>

            {phase === 'setup' && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  {t('matchMovie.chooseMoods')}
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {MOODS.map(({ labelKey, value }) => (
                    <button
                      key={value}
                      onClick={() => toggleMood(value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        selectedMoods.includes(value)
                          ? 'border-pink-400 bg-pink-500/15 text-pink-600 dark:text-pink-400'
                          : 'border-white/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/40 text-gray-600 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-700/60'
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>

                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  {t('matchMovie.chooseFilter')}
                </p>
                <div className="space-y-2 mb-6">
                  {modes.map(({ id, icon: Icon, labelKey }) => (
                    <button
                      key={id}
                      onClick={() => setMode(id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                        mode === id
                          ? 'border-pink-400 bg-pink-500/10 dark:bg-pink-500/15'
                          : 'border-white/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/40 hover:bg-white/70 dark:hover:bg-gray-700/60'
                      }`}
                    >
                      <Icon className={`w-5 h-5 flex-shrink-0 ${mode === id ? 'text-pink-500' : 'text-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${mode === id ? 'text-pink-600 dark:text-pink-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {t(labelKey)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t(`${labelKey}Desc`)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleFindMatch}
                  disabled={selectedMoods.length === 0}
                  className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-pink-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Wand2 className="w-5 h-5" />
                  {t('matchMovie.findButton')}
                </button>
              </div>
            )}

            {phase === 'loading' && (
              <div className="flex flex-col items-center py-16 gap-4">
                <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
                <p className="text-gray-600 dark:text-gray-300 text-sm">{t('matchMovie.searching')}</p>
              </div>
            )}

            {phase === 'results' && (
              <div>
                {matches.length === 0 ? (
                  <div className="text-center py-10">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('matchMovie.noMatchesFound')}</p>
                    <button
                      onClick={() => setPhase('setup')}
                      className="mt-4 text-sm font-semibold text-pink-600 dark:text-pink-400 hover:underline"
                    >
                      {t('matchMovie.tryAgain')}
                    </button>
                  </div>
                ) : (
                  <div>
                    {/* Destaque do melhor match */}
                    {topMatch && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mb-6"
                      >
                        <p className="text-xs font-bold uppercase tracking-wide text-pink-500 dark:text-pink-400 text-center mb-2 flex items-center justify-center gap-1.5">
                          {isUnderdog && <span title={t('matchMovie.underdogHint')}>🃏</span>}
                          {isUnderdog ? t('matchMovie.underdogMatch') : t('matchMovie.perfectMatch')}
                        </p>
                        <button
                          onClick={() => handleOpenMovie(topMatch.id)}
                          className="w-full flex gap-4 p-3 rounded-2xl bg-white/60 dark:bg-gray-800/60 border-2 border-pink-400/50 hover:bg-white/90 dark:hover:bg-gray-700/70 transition-all text-left"
                        >
                          <div className="relative w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden shadow-lg">
                            <img src={posterUrl(topMatch.poster_path)} alt={topMatch.title} className="w-full h-full object-cover" />
                            {loadingMovieId === topMatch.id && (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 dark:text-white leading-snug line-clamp-2">{topMatch.title}</p>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {t('matchMovie.you')}: <strong className="text-gray-800 dark:text-gray-200">{topMatch.scoreA}</strong>
                                {!topMatch.wasRatedA && <span className="text-gray-400"> ({t('matchMovie.predicted')})</span>}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                @{otherUsername}: <strong className="text-gray-800 dark:text-gray-200">{topMatch.scoreB}</strong>
                                {!topMatch.wasRatedB && <span className="text-gray-400"> ({t('matchMovie.predicted')})</span>}
                              </span>
                            </div>
                            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-600 dark:text-pink-400 text-xs font-bold">
                              <Star className="w-3 h-3 fill-current" />
                              {topMatch.matchScore}
                            </div>
                          </div>
                        </button>
                      </motion.div>
                    )}

                    {restMatches.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                          {t('matchMovie.otherOptions')}
                        </p>
                        <div className="space-y-1.5">
                          {restMatches.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => handleOpenMovie(m.id)}
                              className="w-full flex items-center gap-3 p-2 rounded-xl bg-white/40 dark:bg-gray-800/40 hover:bg-white/70 dark:hover:bg-gray-700/60 transition-colors text-left"
                            >
                              <img
                                src={posterUrl(m.poster_path)}
                                alt={m.title}
                                className="w-8 h-12 object-cover rounded flex-shrink-0"
                              />
                              <span className="flex-1 min-w-0 text-sm text-gray-900 dark:text-white truncate">{m.title}</span>
                              <span className="flex-shrink-0 text-xs font-semibold text-pink-500 dark:text-pink-400">
                                {m.matchScore}
                              </span>
                              {loadingMovieId === m.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setPhase('setup')}
                      className="w-full mt-5 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white/40 dark:bg-gray-800/40 hover:bg-white/70 dark:hover:bg-gray-700/60 rounded-xl transition-colors"
                    >
                      {t('matchMovie.tryAgain')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
        />
      )}
    </>
  );
}