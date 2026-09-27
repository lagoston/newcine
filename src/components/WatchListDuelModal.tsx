import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Swords, Loader2, Play, Star, ArrowLeft, Trophy, Film, Crown, Check } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getMovieTrailer, getMovieDetailsFromDB } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

interface WatchlistDuelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FriendCandidate {
  id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string;
  watchlist_count: number;
}

interface DuelMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number;
  overview: string;
  source: 'me' | 'friend';
}

type Phase = 'setup' | 'loading' | 'bracket' | 'champion';

// Pôster do duelo — sem imagem, vira um cartão com o título (antes caía
// num placeholder externo que já não existe).
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
          <span className="text-sm leading-snug" style={{ color: PAPER }}>{movie.title}</span>
        </span>
      )}
    </span>
  );
};

export default function WatchlistDuelModal({ isOpen, onClose }: WatchlistDuelModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('setup');
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [friends, setFriends] = useState<FriendCandidate[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendCandidate | null>(null);
  const [starting, setStarting] = useState(false);
  // Tickets nunca existiram aqui, mas o Duelo de Watchlist também vira
  // um recurso inteiramente premium agora, junto com o Duelo padrão.
  const [isPremium, setIsPremium] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);

  const [roundMovies, setRoundMovies] = useState<DuelMovie[]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [champion, setChampion] = useState<DuelMovie | null>(null);

  const [trailerMovie, setTrailerMovie] = useState<DuelMovie | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  const [detailsMovie, setDetailsMovie] = useState<any | null>(null);
  const [loadingDetailsFor, setLoadingDetailsFor] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    setPhase('setup');
    setSelectedFriend(null);
    setChampion(null);
    setPairIndex(0);
    fetchPremiumStatus();
  }, [isOpen, session?.user?.id]);

  const fetchPremiumStatus = async () => {
    try {
      setCheckingPremium(true);
      const { data, error } = await supabase.rpc('get_user_premium_status', { user_id_input: session?.user?.id });
      if (error) throw error;
      const premium = data || false;
      setIsPremium(premium);
      // Não faz sentido buscar amigos e montar a tela de setup pra
      // quem nem vai conseguir usar o duelo.
      if (premium) fetchFriends();
    } catch (error) {
      console.error('Error fetching premium status:', error);
    } finally {
      setCheckingPremium(false);
    }
  };

  const fetchFriends = async () => {
    try {
      setLoadingFriends(true);
      const { data, error } = await supabase
        .rpc('get_friends_with_watchlist', { p_user_id: session?.user?.id, p_min_count: 4 });
      if (error) throw error;
      setFriends(data || []);
    } catch (error) {
      console.error('Error fetching duel-eligible friends:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleStartDuel = async () => {
    if (!selectedFriend || starting) return;
    try {
      setStarting(true);
      setPhase('loading');

      const response = await fetch(`${supabaseUrl}/functions/v1/watchlist-duel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ friendId: selectedFriend.id, language: i18n.language })
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        toast.error(data.error || t('common.error'));
        setPhase('setup');
        return;
      }

      setRoundMovies(data.movies);
      setPairIndex(0);
      setPhase('bracket');
    } catch (error) {
      console.error('Error starting watchlist duel:', error);
      toast.error(t('common.error'));
      setPhase('setup');
    } finally {
      setStarting(false);
    }
  };

  // Acumula os vencedores da rodada atual — usa ref porque handleChoose é
  // chamado múltiplas vezes em sequência rápida, e setState não garante
  // valor atualizado entre chamadas dentro do mesmo ciclo de eventos.
  const winnersRef = React.useRef<DuelMovie[]>([]);

  const handleChoose = (winner: DuelMovie) => {
    winnersRef.current.push(winner);

    const totalPairs = roundMovies.length / 2;
    if (pairIndex + 1 < totalPairs) {
      setPairIndex(pairIndex + 1);
      return;
    }

    // rodada completa
    if (winnersRef.current.length === 1) {
      setChampion(winnersRef.current[0]);
      setPhase('champion');
    } else {
      setRoundMovies([...winnersRef.current]);
      setPairIndex(0);
    }
    winnersRef.current = [];
  };

  const openTrailer = async (movie: DuelMovie) => {
    setTrailerMovie(movie);
    setLoadingTrailer(true);
    setTrailerKey(undefined);
    try {
      const trailer = await getMovieTrailer(movie.id, 'movie');
      setTrailerKey(trailer?.key || null);
    } catch (error) {
      console.error('Error fetching trailer:', error);
      setTrailerKey(null);
    } finally {
      setLoadingTrailer(false);
    }
  };

  const openDetails = async (movie: DuelMovie) => {
    setLoadingDetailsFor(movie.id);
    try {
      const details = await getMovieDetailsFromDB(movie.id, 'movie');
      setDetailsMovie(details);
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingDetailsFor(null);
    }
  };

  // Esc fecha o trailer primeiro (a gaveta do duelo espera).
  useEffect(() => {
    if (!trailerMovie) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTrailerMovie(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trailerMovie]);

  const handleClose = () => {
    setPhase('setup');
    setSelectedFriend(null);
    setChampion(null);
    onClose();
  };

  const currentPair = phase === 'bracket' ? [roundMovies[pairIndex * 2], roundMovies[pairIndex * 2 + 1]] : [];

  const subtitle = !isPremium || checkingPremium
    ? undefined
    : phase === 'bracket'
      ? `${t('duel.roundOf', { count: roundMovies.length })} · ${t('duel.pairProgress', { current: pairIndex + 1, total: roundMovies.length / 2 })}`
      : phase === 'champion'
        ? t('duel.champion')
        : selectedFriend && phase === 'loading'
          ? `@${selectedFriend.username}`
          : t('watchlistDuel.description');

  const primaryButton = `w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-400 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`;
  const ghostButton = `w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 font-medium transition ${FOCUS_RING}`;

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={handleClose}
        title={t('watchlistDuel.title')}
        subtitle={subtitle}
        leading={
          <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
            <Swords className="w-5 h-5 text-pink-300" aria-hidden />
          </span>
        }
        size="lg"
        escapeEnabled={!trailerMovie && !detailsMovie}
        footer={isPremium && !checkingPremium && phase === 'setup' && friends.length > 0 ? (
          <button onClick={handleStartDuel} disabled={!selectedFriend || starting} className={primaryButton}>
            <Swords className="w-5 h-5" aria-hidden />
            {t('watchlistDuel.startButton')}
          </button>
        ) : undefined}
      >
        {checkingPremium ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-pink-300" aria-hidden />
          </div>
        ) : !isPremium ? (
          // Duelo de Watchlist é um recurso Premium — sem o plano, só o aviso.
          <div className="text-center py-6">
            <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/30">
              <Crown className="w-8 h-8 text-amber-300" aria-hidden />
            </span>
            <h3 style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl leading-tight">
              {t('watchlistDuel.premiumFeatureTitle', { defaultValue: 'Duelo de Watchlist é exclusivo Premium' })}
            </h3>
            <p className="mt-2 mx-auto max-w-sm text-sm" style={{ color: MIST }}>
              {t('watchlistDuel.premiumFeatureDescription', { defaultValue: 'Assine o Premium pra fazer quantos duelos de watchlist quiser, sem limite.' })}
            </p>
            <button
              onClick={() => { onClose(); navigate('/premium'); }}
              className={`mt-7 inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#221B36] font-semibold shadow-lg shadow-amber-900/30 transition ${FOCUS_RING}`}
            >
              <Crown className="w-5 h-5" aria-hidden />
              {t('oracle.viewPremium', { defaultValue: 'Ver Premium' })}
            </button>
          </div>
        ) : (
          <>
            {/* SETUP — escolher o amigo */}
            {phase === 'setup' && (
              <div>
                <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none mb-3">
                  {t('watchlistDuel.pickFriend')}
                </h3>
                {loadingFriends ? (
                  <ul className="space-y-2" aria-busy="true">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <li key={i} className="h-16 rounded-xl animate-pulse" style={{ background: VELVET }} />
                    ))}
                  </ul>
                ) : friends.length === 0 ? (
                  <p className="py-10 px-4 text-center text-sm" style={{ color: MIST }}>
                    {t('watchlistDuel.noEligibleFriends')}
                  </p>
                ) : (
                  <ul className="space-y-1.5" role="radiogroup" aria-label={t('watchlistDuel.pickFriend')}>
                    {friends.map((friend) => {
                      const active = selectedFriend?.id === friend.id;
                      return (
                        <li key={friend.id}>
                          <button
                            onClick={() => setSelectedFriend(friend)}
                            role="radio"
                            aria-checked={active}
                            className={`w-full justify-start gap-3.5 px-3 py-2.5 rounded-xl text-left ring-1 transition ${FOCUS_RING} ${
                              active ? 'ring-2 ring-pink-400/70 bg-pink-500/10' : 'ring-transparent hover:bg-white/5'
                            }`}
                          >
                            {friend.avatar_url ? (
                              <img src={friend.avatar_url} alt="" className="w-11 h-11 shrink-0 rounded-full object-cover ring-1 ring-white/15" loading="lazy" decoding="async" />
                            ) : (
                              <span className="grid place-items-center w-11 h-11 shrink-0 rounded-full ring-1 ring-white/15 font-semibold" style={{ background: VELVET, color: PAPER }}>
                                {friend.username.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span className="flex-1 min-w-0">
                              <span className="block font-semibold truncate" style={{ color: PAPER }}>@{friend.username}</span>
                              <span className="block text-xs" style={{ color: MIST }}>
                                {t('watchlistDuel.moviesInWatchlist', { count: friend.watchlist_count })}
                              </span>
                            </span>
                            <span
                              aria-hidden
                              className={`grid place-items-center w-6 h-6 shrink-0 rounded-full ${active ? 'bg-pink-500' : 'ring-2 ring-white/20'}`}
                            >
                              {active && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* LOADING */}
            {phase === 'loading' && (
              <div className="flex flex-col items-center py-16 gap-4" role="status">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="grid place-items-center w-14 h-14 rounded-2xl bg-pink-500/15 ring-1 ring-pink-400/30"
                >
                  <Swords className="w-7 h-7 text-pink-300" aria-hidden />
                </motion.span>
                <p className="text-sm" style={{ color: MIST }}>{t('watchlistDuel.assembling')}</p>
              </div>
            )}

            {/* BRACKET */}
            {phase === 'bracket' && currentPair[0] && currentPair[1] && (
              <div>
                <button
                  onClick={() => setPhase('setup')}
                  className={`-ml-2 mb-4 inline-flex justify-start items-center gap-1.5 px-2 rounded-lg text-sm hover:bg-white/5 transition ${FOCUS_RING}`}
                  style={{ color: MIST }}
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden />
                  {t('watchlistDuel.changeFriend')}
                </button>

                <div className="relative grid grid-cols-2 gap-3 sm:gap-5">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {currentPair.map((movie, idx) => (
                      <motion.div
                        key={`${pairIndex}-${movie.id}`}
                        initial={{ opacity: 0, x: idx === 0 ? -16 : 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex flex-col min-w-0"
                      >
                        <button
                          onClick={() => openDetails(movie)}
                          aria-label={t('watchlistDuel.openDetails', { title: movie.title })}
                          className={`group relative block w-full rounded-xl ${FOCUS_RING}`}
                        >
                          <DuelPoster movie={movie} className="shadow-xl" />
                          <span
                            className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-white/15"
                            style={{ background: 'rgba(18,13,34,0.86)', color: PAPER }}
                          >
                            {movie.source === 'me' ? t('watchlistDuel.yourList') : `@${selectedFriend?.username}`}
                          </span>
                          {loadingDetailsFor === movie.id && (
                            <span className="absolute inset-0 rounded-xl bg-black/55 grid place-items-center">
                              <Loader2 className="w-6 h-6 text-white animate-spin" aria-hidden />
                            </span>
                          )}
                        </button>
                        <p className="mt-2.5 text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5rem]" style={{ color: PAPER }}>
                          {movie.title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                          {movie.release_date && <span>{movie.release_date.slice(0, 4)}</span>}
                          {movie.vote_average > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                              {movie.vote_average.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          )}
                        </p>
                        <button
                          onClick={(e) => { e.stopPropagation(); openTrailer(movie); }}
                          className={`mt-2.5 ${ghostButton} h-10 text-xs`}
                          style={{ color: PAPER }}
                        >
                          <Play className="w-3.5 h-3.5 fill-fuchsia-300 text-fuchsia-300" aria-hidden />
                          {t('duel.watchTrailer')}
                        </button>
                        <button onClick={() => handleChoose(movie)} className={`mt-2 ${primaryButton} text-sm`}>
                          <Swords className="w-4 h-4" aria-hidden />
                          {t('duel.choose')}
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full ring-2 ring-pink-400/50 text-sm pointer-events-none"
                    style={{ ...PIXEL, background: NIGHT, color: PAPER }}
                  >
                    vs
                  </span>
                </div>
              </div>
            )}

            {/* CAMPEÃO */}
            {phase === 'champion' && champion && (
              <div className="text-center">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/30"
                >
                  <Trophy className="w-7 h-7 text-amber-300" aria-hidden />
                </motion.span>
                <button
                  onClick={() => openDetails(champion)}
                  aria-label={t('watchlistDuel.openDetails', { title: champion.title })}
                  className={`group relative mt-5 mx-auto block w-40 rounded-xl ${FOCUS_RING}`}
                >
                  <DuelPoster movie={champion} className="shadow-2xl ring-2 ring-amber-300/40" />
                  {loadingDetailsFor === champion.id && (
                    <span className="absolute inset-0 rounded-xl bg-black/55 grid place-items-center">
                      <Loader2 className="w-6 h-6 text-white animate-spin" aria-hidden />
                    </span>
                  )}
                </button>
                <p style={{ ...PIXEL, color: PAPER }} className="mt-4 text-2xl leading-tight">{champion.title}</p>
                {champion.vote_average > 0 && (
                  <p className="mt-1 inline-flex items-center justify-center gap-1 text-sm" style={{ color: MIST }}>
                    <Star className="w-4 h-4 fill-amber-300 text-amber-300" aria-hidden />
                    {champion.vote_average.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </p>
                )}
                <div className="mt-6 grid sm:grid-cols-2 gap-2.5">
                  <button onClick={() => openDetails(champion)} className={primaryButton}>
                    {t('duel.viewAndAdd')}
                  </button>
                  <button onClick={() => setPhase('setup')} className={ghostButton} style={{ color: PAPER }}>
                    {t('duel.newDuel')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </OracleSheet>

      {/* Trailer */}
      <AnimatePresence>
        {trailerMovie && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${t('duel.watchTrailer')} — ${trailerMovie.title}`}>
            <motion.div
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTrailerMovie(null)}
            />
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
                  <p style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{t('movieModal.trailer')}</p>
                  <p className="mt-1 text-sm truncate" style={{ color: MIST }}>{trailerMovie.title}</p>
                </div>
                <button
                  onClick={() => setTrailerMovie(null)}
                  aria-label={t('common.close')}
                  className={`shrink-0 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
                  style={{ color: MIST }}
                >
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

      {/* Detalhes do filme */}
      {detailsMovie && (
        <MovieDetailsModal
          movie={detailsMovie}
          isOpen={true}
          onClose={() => setDetailsMovie(null)}
        />
      )}
    </>
  );
}
