import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X, Loader2, Wand2, Eye, EyeOff, Users2, Search, Plus, Film, RotateCcw, Shuffle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getMovieDetailsFromDB, type Movie } from '../lib/tmdb';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import MovieDetailsModal from './MovieDetailsModal';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ORACLES } from '../lib/oracleTheme';

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
  avatar_url?: string | null;
  avatar_frame?: string | null;
  plan_type?: string | null;
  lifetime_premium?: boolean | null;
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
  avatar_frame: string | null;
  plan_type: string | null;
  lifetime_premium: boolean | null;
}

// plan_type sozinho não reflete premium vitalício concedido diretamente
// na tabela (fora do fluxo normal do Stripe) — combina os dois campos,
// mesma lógica de is_premium_active() no banco.
const isUserPremium = (u: { plan_type?: string | null; lifetime_premium?: boolean | null }) => u.plan_type === 'premium' || !!u.lifetime_premium;

// Humores — as mesmas cores dos selos de humor dos detalhes do filme.
const MOODS: { labelKey: string; value: string; pill: string }[] = [
  { labelKey: 'oracle.moods.adventures', value: 'adventures', pill: 'text-sky-200 ring-sky-400/50 bg-sky-500/20' },
  { labelKey: 'oracle.moods.catharsis', value: 'catharsis', pill: 'text-blue-200 ring-blue-400/50 bg-blue-500/20' },
  { labelKey: 'oracle.moods.adrenaline', value: 'adrenaline', pill: 'text-red-200 ring-red-400/50 bg-red-500/20' },
  { labelKey: 'oracle.moods.mindBlowing', value: 'mind-blowing', pill: 'text-pink-200 ring-pink-400/50 bg-pink-500/20' },
  { labelKey: 'oracle.moods.laughOutLoud', value: 'laugh-out-loud', pill: 'text-green-200 ring-green-400/50 bg-green-500/20' },
  { labelKey: 'oracle.moods.drugTrip', value: 'drug-trip', pill: 'text-emerald-200 ring-emerald-400/50 bg-emerald-500/20' },
  { labelKey: 'oracle.moods.romantic', value: 'romantic', pill: 'text-orange-200 ring-orange-400/50 bg-orange-500/20' },
  { labelKey: 'oracle.moods.darkScary', value: 'dark-and-scary', pill: 'text-gray-100 ring-gray-400/50 bg-gray-500/25' },
  { labelKey: 'oracle.moods.familyTime', value: 'family-time', pill: 'text-yellow-200 ring-yellow-400/50 bg-yellow-500/20' },
];

const ALL_MOOD_VALUES = MOODS.map((m) => m.value);

// Até 4 pessoas no total: você + quem abriu + 2 convidados.
const MAX_PARTICIPANTS = 4;

export default function MatchMovieModal({ isOpen, onClose, otherUserId, otherUsername }: MatchMovieModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();

  const [participants, setParticipants] = useState<Participant[]>([{ id: otherUserId, username: otherUsername, avatar_url: null, avatar_frame: null, plan_type: null }]);
  const [me, setMe] = useState<Participant | null>(null);
  const [showAddViewer, setShowAddViewer] = useState(false);
  const [followedUsers, setFollowedUsers] = useState<FollowedUser[]>([]);
  const [loadingFollowed, setLoadingFollowed] = useState(false);
  const [viewerSearch, setViewerSearch] = useState('');

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<Mode>('unseen');
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [matches, setMatches] = useState<MatchedMovie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);

  // Busca username + avatar + moldura do usuário atual, e o mesmo do
  // participante original (que chega só com o username).
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('profiles')
      .select('username, avatar_url, avatar_frame, plan_type, lifetime_premium')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMe({
          id: session.user.id,
          username: data?.username || '',
          avatar_url: data?.avatar_url || null,
          avatar_frame: data?.avatar_frame || null,
          plan_type: data?.plan_type || null,
          lifetime_premium: data?.lifetime_premium || false,
        });
      });

    supabase
      .from('profiles')
      .select('avatar_url, avatar_frame, plan_type, lifetime_premium')
      .eq('id', otherUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setParticipants((prev) =>
            prev.map((p) =>
              p.id === otherUserId
                ? { ...p, avatar_url: data.avatar_url, avatar_frame: data.avatar_frame, plan_type: data.plan_type, lifetime_premium: data.lifetime_premium }
                : p,
            ),
          );
        }
      });
  }, [session?.user?.id, otherUserId]);

  const toggleMood = (value: string) => {
    setSelectedMoods((prev) => (prev.includes(value) ? prev.filter((m) => m !== value) : [...prev, value]));
  };
  // "Surpresa" não é um humor — seleciona (ou limpa) todos de uma vez.
  const allMoodsSelected = selectedMoods.length === ALL_MOOD_VALUES.length;
  const toggleAllMoods = () => setSelectedMoods(allMoodsSelected ? [] : ALL_MOOD_VALUES);

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
      const { data: friendRows, error: followError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${session?.user?.id},addressee_id.eq.${session?.user?.id}`);
      if (followError) throw followError;

      const followingIds = (friendRows || [])
        .map((r: any) => (r.requester_id === session?.user?.id ? r.addressee_id : r.requester_id))
        .filter((id: string) => id !== otherUserId);
      if (followingIds.length === 0) {
        setFollowedUsers([]);
        return;
      }

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, avatar_frame, plan_type, lifetime_premium')
        .in('id', followingIds);
      if (profileError) throw profileError;

      setFollowedUsers(((profileRows || []) as FollowedUser[]).sort((a, b) => a.username.localeCompare(b.username)));
    } catch (error) {
      console.error('Error loading followed users:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingFollowed(false);
    }
  };

  const handleAddParticipant = (user: FollowedUser) => {
    if (participants.length >= MAX_PARTICIPANTS - 1) return;
    setParticipants((prev) => [
      ...prev,
      { id: user.id, username: user.username, avatar_url: user.avatar_url, avatar_frame: user.avatar_frame, plan_type: user.plan_type, lifetime_premium: user.lifetime_premium },
    ]);
    setShowAddViewer(false);
    setViewerSearch('');
  };

  const handleRemoveParticipant = (id: string) => {
    // Sempre mantém o participante original.
    if (id === otherUserId) return;
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const filteredFollowedUsers = followedUsers.filter(
    (u) => !participants.some((p) => p.id === u.id) && u.username.toLowerCase().includes(viewerSearch.toLowerCase()),
  );

  const handleFindMatch = async () => {
    try {
      setPhase('loading');
      const response = await fetch(`${supabaseUrl}/functions/v1/match-movie`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          friendIds: participants.map((p) => p.id),
          mode,
          moods: selectedMoods,
          language: i18n.language,
        }),
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
      setSelectedMovie(await getMovieDetailsFromDB(movieId));
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

  // Você + os demais, numa fileira só.
  const everyone: Participant[] = [
    me || { id: session?.user?.id || 'me', username: t('matchMovie.you'), avatar_url: null, avatar_frame: null, plan_type: null },
    ...participants,
  ];
  const openSlots = Math.max(0, MAX_PARTICIPANTS - everyone.length);

  const avatar = (p: Participant, size: number) => {
    const premium = isUserPremium(p);
    if (frameUsesComponent(p.avatar_frame || undefined, premium) === 'GhostRiderFrame' && p.avatar_url) {
      return <GhostRiderFrame src={p.avatar_url} alt="" size={size} />;
    }
    const raw = getFrameClass(p.avatar_frame || undefined, premium);
    const frame = !raw || raw === 'ring-0' ? 'ring-2 ring-white/15' : raw;
    return (
      <span className={`block rounded-full overflow-hidden ${frame}`} style={{ width: size, height: size, background: VELVET }}>
        {p.avatar_url ? (
          <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full grid place-items-center text-sm font-semibold" style={{ color: PAPER }}>
            {(p.username || '?').charAt(0).toUpperCase()}
          </span>
        )}
      </span>
    );
  };

  // O servidor devolve notas com casas decimais soltas (ex.: 8.200000001).
  const formatScore = (value: number) => value.toLocaleString(i18n.language, { maximumFractionDigits: 1 });

  const topMatch = matches[0];
  const restMatches = matches.slice(1);

  const scoresLine = (scores: ScoreEntry[]) => (
    <ul className="space-y-0.5 text-xs" style={{ color: MIST }}>
      {scores.map((s) => (
        <li key={s.userId}>
          @{s.username}{' '}
          <span style={{ ...PIXEL, color: PAPER }} className="text-sm">
            {formatScore(s.score)}
          </span>
          {!s.wasRated && <span> · {t('matchMovie.predicted')}</span>}
        </li>
      ))}
    </ul>
  );

  const posterThumb = (path: string | null, className: string, busy: boolean) => (
    <span className={`relative block shrink-0 overflow-hidden ring-1 ring-white/10 ${className}`} style={{ background: VELVET }}>
      {path ? (
        <img src={`https://image.tmdb.org/t/p/w342${path}`} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full grid place-items-center" style={{ color: MIST }}>
          <Film className="w-5 h-5" aria-hidden />
        </span>
      )}
      {busy && (
        <span className="absolute inset-0 grid place-items-center bg-black/50">
          <Loader2 className="w-5 h-5 text-white animate-spin" aria-hidden />
        </span>
      )}
    </span>
  );

  const sectionTitle = (text: string) => (
    <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
      {text}
    </h3>
  );

  const footer =
    phase === 'setup' && !showAddViewer ? (
      <button
        onClick={handleFindMatch}
        disabled={selectedMoods.length === 0}
        className={`w-full gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none ${FOCUS_RING}`}
      >
        <Wand2 className="w-5 h-5" aria-hidden />
        {selectedMoods.length === 0 ? t('matchMovie.pickMoodFirst') : t('matchMovie.findButton')}
      </button>
    ) : phase === 'results' ? (
      <button
        onClick={() => setPhase('setup')}
        className={`w-full gap-2 h-12 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
        style={{ color: PAPER }}
      >
        <RotateCcw className="w-4 h-4" aria-hidden />
        {t('matchMovie.tryAgain')}
      </button>
    ) : undefined;

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={handleClose}
        title={t('matchMovie.title')}
        subtitle={t('matchMovie.subtitle', { username: otherUsername })}
        leading={
          <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-fuchsia-500/15 ring-1 ring-fuchsia-400/30">
            <Wand2 className="w-5 h-5 text-fuchsia-300" aria-hidden />
          </span>
        }
        size="lg"
        escapeEnabled={!selectedMovie}
        footer={footer}
        bodyClassName="px-5 sm:px-7 py-6 space-y-7"
      >
        {/* Quem vai assistir */}
        <section>
          {sectionTitle(t('matchMovie.whoIsWatching'))}
          <ul className="mt-4 flex flex-wrap items-start gap-4">
            {everyone.map((p, index) => {
              const removable = index > 1 && phase === 'setup';
              return (
                <li key={p.id} className="relative flex flex-col items-center w-16">
                  {avatar(p, 56)}
                  <span className="mt-1.5 max-w-full text-xs truncate" style={{ color: index === 0 ? MIST : PAPER }}>
                    {index === 0 ? t('matchMovie.you') : `@${p.username}`}
                  </span>
                  {removable && (
                    <button
                      onClick={() => handleRemoveParticipant(p.id)}
                      aria-label={t('matchMovie.removeViewer', { username: p.username })}
                      className={`absolute -top-2 -right-1 grid place-items-center w-7 h-7 rounded-full bg-black/70 ring-1 ring-white/25 text-white hover:bg-red-500 transition ${FOCUS_RING}`}
                      style={{ minWidth: 0, minHeight: 0 }}
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
            {phase === 'setup' &&
              Array.from({ length: openSlots }).map((_, i) => (
                <li key={`slot-${i}`} className="flex flex-col items-center w-16">
                  <button
                    onClick={handleOpenAddViewer}
                    aria-label={t('matchMovie.addViewer')}
                    aria-expanded={showAddViewer}
                    className={`grid place-items-center w-14 h-14 rounded-full border-2 border-dashed border-white/20 hover:border-fuchsia-300/70 hover:bg-fuchsia-500/10 text-fuchsia-200 transition ${FOCUS_RING}`}
                  >
                    <Plus className="w-5 h-5" aria-hidden />
                  </button>
                  <span className="mt-1.5 text-xs" style={{ color: MIST }}>
                    {t('matchMovie.addShort')}
                  </span>
                </li>
              ))}
          </ul>

          {/* Adicionar espectador */}
          {showAddViewer && phase === 'setup' && (
            <div className="mt-4 rounded-2xl p-3 ring-1 ring-white/10" style={{ background: VELVET }}>
              <label className="relative block">
                <span className="sr-only">{t('matchMovie.searchViewer')}</span>
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MIST }} aria-hidden />
                <input
                  type="text"
                  value={viewerSearch}
                  onChange={(e) => setViewerSearch(e.target.value)}
                  placeholder={t('matchMovie.searchViewer')}
                  autoFocus
                  className="w-full h-11 pl-10 pr-3 rounded-xl ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-sm placeholder:text-[#BDB4D6]/70"
                  style={{ background: NIGHT, color: PAPER }}
                />
              </label>
              {loadingFollowed ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 text-violet-300 animate-spin" aria-hidden />
                </div>
              ) : filteredFollowedUsers.length === 0 ? (
                <p className="text-sm text-center py-5" style={{ color: MIST }}>
                  {t('matchMovie.noViewersFound')}
                </p>
              ) : (
                <ul className="mt-2 max-h-52 overflow-y-auto overscroll-contain">
                  {filteredFollowedUsers.map((u) => (
                    <li key={u.id}>
                      <button
                        onClick={() => handleAddParticipant(u)}
                        className={`w-full justify-start gap-3 px-2 py-1.5 rounded-xl text-left hover:bg-white/[0.06] transition ${FOCUS_RING}`}
                      >
                        {avatar(u, 36)}
                        <span className="flex-1 min-w-0 truncate text-sm font-medium" style={{ color: PAPER }}>
                          @{u.username}
                        </span>
                        <Plus className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1 flex justify-end">
                <button
                  onClick={() => setShowAddViewer(false)}
                  className={`h-10 px-3 rounded-lg text-sm font-medium hover:bg-white/5 transition ${FOCUS_RING}`}
                  style={{ color: MIST }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}
        </section>

        {phase === 'setup' && !showAddViewer && (
          <>
            {/* Humores */}
            <section>
              {sectionTitle(t('matchMovie.chooseMoods'))}
              <ul className="mt-3 flex flex-wrap gap-2">
                {MOODS.map(({ labelKey, value, pill }) => {
                  const selected = selectedMoods.includes(value);
                  return (
                    <li key={value}>
                      <button
                        onClick={() => toggleMood(value)}
                        aria-pressed={selected}
                        className={`h-10 px-4 rounded-full text-sm font-medium ring-1 transition ${FOCUS_RING} ${selected ? pill : 'ring-white/10 hover:ring-white/30'}`}
                        style={selected ? undefined : { background: VELVET, color: MIST }}
                      >
                        {t(labelKey)}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    onClick={toggleAllMoods}
                    aria-pressed={allMoodsSelected}
                    className={`gap-1.5 h-10 px-4 rounded-full text-sm font-medium transition ${FOCUS_RING} ${
                      allMoodsSelected ? 'ring-1 bg-violet-500/25 ring-violet-400/60 text-violet-100' : 'border border-dashed border-white/25 hover:border-white/45'
                    }`}
                    style={allMoodsSelected ? undefined : { color: MIST }}
                  >
                    <Shuffle className="w-4 h-4" aria-hidden />
                    {t('oracle.moods.randomSurprise')}
                  </button>
                </li>
              </ul>
            </section>

            {/* Filtro */}
            <section>
              {sectionTitle(t('matchMovie.chooseFilter'))}
              <div role="radiogroup" aria-label={t('matchMovie.chooseFilter')} className="mt-3 grid sm:grid-cols-3 gap-2">
                {modes.map(({ id, icon: Icon, labelKey }) => {
                  const selected = mode === id;
                  return (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMode(id)}
                      className={`w-full flex-col items-start justify-start gap-1.5 p-3.5 rounded-xl text-left ring-1 transition ${FOCUS_RING} ${
                        selected ? 'ring-2 ring-violet-400/70 bg-violet-500/15' : 'ring-white/10 hover:ring-white/25'
                      }`}
                      style={{ background: selected ? undefined : VELVET }}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className={`w-[18px] h-[18px] ${selected ? 'text-violet-200' : 'text-violet-300'}`} aria-hidden />
                        <span className="text-sm font-semibold" style={{ color: PAPER }}>
                          {t(labelKey)}
                        </span>
                      </span>
                      <span className="text-xs leading-snug" style={{ color: MIST }}>
                        {t(`${labelKey}Desc`)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center py-10 gap-5" role="status">
            <div className="flex">
              {ORACLES.map((oracle, i) => (
                <motion.img
                  key={oracle.id}
                  src={oracle.avatar}
                  alt=""
                  width={48}
                  height={48}
                  className={`w-12 h-12 rounded-full object-cover ${i > 0 ? '-ml-2' : ''}`}
                  style={{ boxShadow: `0 0 0 2px ${NIGHT}, 0 0 0 4px ${oracle.color}` }}
                  animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
                />
              ))}
            </div>
            <p className="text-sm" style={{ color: MIST }}>
              {t('matchMovie.searching')}
            </p>
          </div>
        )}

        {phase === 'results' &&
          (matches.length === 0 ? (
            <div className="text-center py-8">
              <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
                <Film className="w-7 h-7 text-violet-300" aria-hidden />
              </span>
              <p className="mt-4 text-sm" style={{ color: MIST }}>
                {t('matchMovie.noMatchesFound')}
              </p>
            </div>
          ) : (
            <>
              {topMatch && (
                <section>
                  {sectionTitle(t('matchMovie.perfectMatch'))}
                  <button
                    onClick={() => handleOpenMovie(topMatch.id)}
                    className={`group mt-3 w-full justify-start items-stretch gap-4 p-3 rounded-2xl text-left ring-2 ring-fuchsia-400/50 hover:ring-fuchsia-300/80 bg-fuchsia-500/[0.07] transition ${FOCUS_RING}`}
                  >
                    {posterThumb(topMatch.poster_path, 'w-24 aspect-[2/3] rounded-xl', loadingMovieId === topMatch.id)}
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-lg font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                        {topMatch.title}
                      </span>
                      <span className="mt-2">{scoresLine(topMatch.scores)}</span>
                      <span className="mt-auto pt-3 inline-flex items-center gap-2 text-xs" style={{ color: MIST }}>
                        {t('matchMovie.matchScore')}
                        <span style={{ ...PIXEL }} className="text-xl leading-none text-fuchsia-200">
                          {formatScore(topMatch.matchScore)}
                        </span>
                      </span>
                    </span>
                  </button>
                </section>
              )}

              {restMatches.length > 0 && (
                <section>
                  {sectionTitle(t('matchMovie.otherOptions'))}
                  <ul className="mt-3 space-y-1">
                    {restMatches.map((m) => (
                      <li key={m.id}>
                        <button
                          onClick={() => handleOpenMovie(m.id)}
                          className={`group -mx-2 w-[calc(100%+1rem)] justify-start gap-3 p-2 rounded-xl text-left hover:bg-white/[0.05] transition ${FOCUS_RING}`}
                        >
                          {posterThumb(m.poster_path, 'w-9 h-[54px] rounded-md', loadingMovieId === m.id)}
                          <span className="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                            {m.title}
                          </span>
                          <span style={PIXEL} className="shrink-0 text-lg leading-none text-fuchsia-200">
                            <span className="sr-only">{t('matchMovie.matchScore')}:</span>
                            {formatScore(m.matchScore)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ))}
      </OracleSheet>

      {selectedMovie && <MovieDetailsModal movie={selectedMovie} isOpen={true} onClose={() => setSelectedMovie(null)} />}
    </>
  );
}
