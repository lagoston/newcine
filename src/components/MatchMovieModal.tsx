import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Wand2, Star, Eye, EyeOff, Users2, UserPlus, Search } from 'lucide-react';
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

interface Participant {
  id: string;
  username: string;
}

interface ScoreEntry {
  userId: string;
  username: string;
  score: number;
  wasRated: boolean;
}

interface MatchedMovie {
  id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  scores: ScoreEntry[];
  matchScore: number;
}

interface FollowedUser {
  id: string;
  username: string;
  avatar_url: string | null;
}

const posterUrl = (path: string | null) =>
  path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://via.placeholder.com/500x750?text=No+Image';

// Mesma paleta oficial usada na Recomendação Clássica (OracleRecommend) —
// só em escala menor aqui, já que o Match Movie é um modal compacto, não
// uma página inteira. Antes o seletor de humor usava só rosa genérico,
// sem nenhuma relação com as cores reais de cada humor no resto do site.
const MOODS: { labelKey: string; value: string; bg: string; hover: string; text: string; border: string }[] = [
  { labelKey: 'oracle.moods.adventures', value: 'adventures', bg: 'bg-sky-500/20 dark:bg-sky-500/30', hover: 'hover:bg-sky-500/30 dark:hover:bg-sky-500/40', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-400/50 dark:border-sky-500/50' },
  { labelKey: 'oracle.moods.catharsis', value: 'catharsis', bg: 'bg-blue-500/20 dark:bg-blue-500/30', hover: 'hover:bg-blue-500/30 dark:hover:bg-blue-500/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-400/50 dark:border-blue-500/50' },
  { labelKey: 'oracle.moods.adrenaline', value: 'adrenaline', bg: 'bg-red-500/20 dark:bg-red-500/30', hover: 'hover:bg-red-500/30 dark:hover:bg-red-500/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-400/50 dark:border-red-500/50' },
  { labelKey: 'oracle.moods.mindBlowing', value: 'mind-blowing', bg: 'bg-pink-500/20 dark:bg-pink-500/30', hover: 'hover:bg-pink-500/30 dark:hover:bg-pink-500/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-400/50 dark:border-pink-500/50' },
  { labelKey: 'oracle.moods.laughOutLoud', value: 'laugh-out-loud', bg: 'bg-green-500/20 dark:bg-green-500/30', hover: 'hover:bg-green-500/30 dark:hover:bg-green-500/40', text: 'text-green-700 dark:text-green-300', border: 'border-green-400/50 dark:border-green-500/50' },
  { labelKey: 'oracle.moods.drugTrip', value: 'drug-trip', bg: 'bg-emerald-500/20 dark:bg-emerald-500/30', hover: 'hover:bg-emerald-500/30 dark:hover:bg-emerald-500/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-400/50 dark:border-emerald-500/50' },
  { labelKey: 'oracle.moods.romantic', value: 'romantic', bg: 'bg-orange-500/20 dark:bg-orange-500/30', hover: 'hover:bg-orange-500/30 dark:hover:bg-orange-500/40', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-400/50 dark:border-orange-500/50' },
  { labelKey: 'oracle.moods.darkScary', value: 'dark-and-scary', bg: 'bg-gray-500/20 dark:bg-gray-500/30', hover: 'hover:bg-gray-500/30 dark:hover:bg-gray-500/40', text: 'text-gray-700 dark:text-gray-300', border: 'border-gray-400/50 dark:border-gray-500/50' },
  { labelKey: 'oracle.moods.familyTime', value: 'family-time', bg: 'bg-yellow-500/20 dark:bg-yellow-500/30', hover: 'hover:bg-yellow-500/30 dark:hover:bg-yellow-500/40', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-400/50 dark:border-yellow-500/50' },
];

const ALL_MOOD_VALUES = MOODS.map((m) => m.value);

// "Surpresa Aleatória" não é um humor de verdade — é um atalho que
// seleciona TODOS os 9 de uma vez, mesmo espírito do resto do site.
const RANDOM_SURPRISE_MOOD = {
  labelKey: 'oracle.moods.randomSurprise',
  value: 'random-surprise',
  bg: 'bg-violet-500/20 dark:bg-violet-500/30',
  hover: 'hover:bg-violet-500/30 dark:hover:bg-violet-500/40',
  text: 'text-violet-700 dark:text-violet-300',
  border: 'border-violet-400/50 dark:border-violet-500/50',
};

const MAX_PARTICIPANTS = 4;

export default function MatchMovieModal({ isOpen, onClose, otherUserId, otherUsername }: MatchMovieModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();

  const [participants, setParticipants] = useState<Participant[]>([{ id: otherUserId, username: otherUsername }]);
  const [myUsername, setMyUsername] = useState<string>('');
  const [showAddViewer, setShowAddViewer] = useState(false);
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [loadingFollowed, setLoadingFollowed] = useState(false);
  const [viewerSearch, setViewerSearch] = useState('');

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<Mode>('unseen');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [matches, setMatches] = useState<MatchedMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);

  // Balão "Você" — antes a barra só mostrava os OUTROS participantes,
  // nunca quem está de fato fazendo o match, o que deixava a barra visual
  // desequilibrada (parecia que o balão do convidado era "maior" porque
  // não tinha nada do seu lado pra comparar).
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.username) setMyUsername(data.username);
      });
  }, [session?.user?.id]);

  const toggleMood = (value: string) => {
    if (value === 'random-surprise') {
      // Se já estão todos selecionados, desmarca tudo; senão, marca tudo.
      setSelectedMoods((prev) => (prev.length === ALL_MOOD_VALUES.length ? [] : ALL_MOOD_VALUES));
      return;
    }
    setSelectedMoods((prev) =>
      prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]
    );
  };

  const modes: { id: Mode; icon: React.ElementType; labelKey: string }[] = [
    { id: 'unseen', icon: EyeOff, labelKey: 'matchMovie.modeUnseen' },
    { id: 'one', icon: Eye, labelKey: 'matchMovie.modeOne' },
    { id: 'both', icon: Users2, labelKey: 'matchMovie.modeBoth' },
  ];

  const handleOpenAddViewer = async () => {
    setShowAddViewer(true);
    if (followedUsers.length > 0 || loadingFollowed) return;
    setLoadingFollowed(true);
    try {
      const { data: followRows, error: followError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', session?.user?.id);
      if (followError) throw followError;

      const followingIds = (followRows || []).map((r: any) => r.following_id).filter((id: string) => id !== otherUserId);
      if (followingIds.length === 0) {
        setFollowedUsers([]);
        return;
      }

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', followingIds);
      if (profileError) throw profileError;

      setFollowedUsers((profileRows || []) as FollowedUser[]);
    } catch (error) {
      console.error('Error loading followed users:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingFollowed(false);
    }
  };

  const handleAddParticipant = (user: FollowedUser) => {
    if (participants.length >= MAX_PARTICIPANTS - 1) return;
    setParticipants((prev) => [...prev, { id: user.id, username: user.username }]);
    setShowAddViewer(false);
    setViewerSearch('');
  };

  const handleRemoveParticipant = (id: string) => {
    // Sempre mantém pelo menos o participante original.
    if (id === otherUserId) return;
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const filteredFollowedUsers = followedUsers.filter(
    (u) =>
      !participants.some((p) => p.id === u.id) &&
      u.username.toLowerCase().includes(viewerSearch.toLowerCase())
  );

  const handleFindMatch = async () => {
    try {
      setPhase('loading');
      const response = await fetch(`${supabaseUrl}/functions/v1/match-movie`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          friendIds: participants.map((p) => p.id),
          mode,
          moods: selectedMoods,
          language: i18n.language
        })
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        toast.error(data.error || t('common.error'));
        setPhase('setup');
        return;
      }
      setMatches(data.movies || []);
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
    setShowAddViewer(false);
    onClose();
  };

  if (!isOpen) return null;

  const topMatch = matches[0];
  const restMatches = matches.slice(1);

  const renderScores = (scores: ScoreEntry[]) => (
    <div className="space-y-0.5">
      {scores.map((s) => (
        <span key={s.userId} className="text-xs text-gray-500 dark:text-gray-400 block">
          {s.username}: <strong className="text-gray-800 dark:text-gray-200">{s.score}</strong>
          {!s.wasRated && <span className="text-gray-400"> ({t('matchMovie.predicted')})</span>}
        </span>
      ))}
    </div>
  );

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

            {/* Barra de participantes — sempre visível no topo. "Você" vem
                primeiro, sempre presente, com o mesmo estilo dos demais —
                sem isso a barra ficava desequilibrada visualmente. */}
            <div className="flex items-center justify-center flex-wrap gap-2 mb-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-500/15 border border-pink-400/40 text-sm font-medium text-pink-700 dark:text-pink-300">
                {t('matchMovie.you')}
              </div>
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-gray-800/60 border border-white/60 dark:border-gray-700/60 text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  @{p.username}
                  {p.id !== otherUserId && phase === 'setup' && (
                    <button onClick={() => handleRemoveParticipant(p.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {phase === 'setup' && participants.length < MAX_PARTICIPANTS - 1 && (
                <button
                  onClick={handleOpenAddViewer}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-pink-400/60 text-pink-600 dark:text-pink-400 text-sm font-medium hover:bg-pink-500/10 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {t('matchMovie.addViewer')}
                </button>
              )}
            </div>

            <div className="text-center mb-6">
              {phase === 'loading' ? (
                <motion.div
                  key="wand-spinning"
                  className="inline-flex p-3 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-400/30 mb-3"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                >
                  <Wand2 className="w-7 h-7 text-pink-500 dark:text-pink-400" />
                </motion.div>
              ) : (
                <div
                  key="wand-static"
                  className="inline-flex p-3 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-400/30 mb-3"
                >
                  <Wand2 className="w-7 h-7 text-pink-500 dark:text-pink-400" />
                </div>
              )}
              <h2 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500">
                {t('matchMovie.title')}
              </h2>
            </div>

            {/* Sub-tela de adicionar espectador */}
            {showAddViewer && (
              <div className="mb-6">
                <div className="relative mb-3">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={viewerSearch}
                    onChange={(e) => setViewerSearch(e.target.value)}
                    placeholder={t('matchMovie.searchViewer')}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/60 dark:bg-gray-800/60 border border-white/60 dark:border-gray-700/60 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-400/50"
                  />
                </div>
                {loadingFollowed ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 text-pink-500 animate-spin" />
                  </div>
                ) : filteredFollowedUsers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    {t('matchMovie.noViewersFound')}
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {filteredFollowedUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleAddParticipant(u)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-300 dark:bg-gray-700 flex-shrink-0">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-500">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">@{u.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setShowAddViewer(false)}
                  className="w-full mt-3 py-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:underline"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {!showAddViewer && phase === 'setup' && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                  {t('matchMovie.chooseMoods')}
                </p>
                <div className="grid grid-cols-5 gap-1.5 mb-6">
                  {[...MOODS, RANDOM_SURPRISE_MOOD].map(({ labelKey, value, bg, hover, text, border }) => {
                    const isRandomSurprise = value === 'random-surprise';
                    const isSelected = isRandomSurprise
                      ? selectedMoods.length === ALL_MOOD_VALUES.length
                      : selectedMoods.includes(value);
                    return (
                      <button
                        key={value}
                        onClick={() => toggleMood(value)}
                        className={`px-1.5 py-2 rounded-xl text-[11px] font-semibold border backdrop-blur-sm transition-all text-center leading-tight ${
                          isSelected
                            ? `${bg} ${hover} ${text} ${border} ring-1 ring-offset-1 ring-offset-transparent`
                            : 'bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-700/60 text-gray-500 dark:text-gray-400 border-transparent'
                        }`}
                      >
                        {t(labelKey)}
                      </button>
                    );
                  })}
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
                    {topMatch && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mb-6"
                      >
                        <p className="text-xs font-bold uppercase tracking-wide text-pink-500 dark:text-pink-400 text-center mb-2 flex items-center justify-center gap-1.5">
                          {t('matchMovie.perfectMatch')}
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
                            <div className="mt-2">
                              {renderScores(topMatch.scores)}
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