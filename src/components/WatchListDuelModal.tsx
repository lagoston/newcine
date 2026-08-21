import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Swords, Loader2, Play, User, Star, ArrowLeft, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getMovieTrailer, getMovieDetailsFromDB } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';

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

const posterUrl = (path: string | null) =>
  path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://via.placeholder.com/500x750?text=No+Image';

export default function WatchlistDuelModal({ isOpen, onClose }: WatchlistDuelModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();

  const [phase, setPhase] = useState<Phase>('setup');
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [friends, setFriends] = useState<FriendCandidate[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<FriendCandidate | null>(null);
  const [starting, setStarting] = useState(false);

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
    fetchFriends();
  }, [isOpen, session?.user?.id]);

  const fetchFriends = async () => {
    try {
      setLoadingFriends(true);
      const { data, error } = await supabase
        .rpc('get_followed_users_with_watchlist', { p_user_id: session?.user?.id, p_min_count: 4 });
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

  const handleClose = () => {
    setPhase('setup');
    setSelectedFriend(null);
    setChampion(null);
    onClose();
  };

  if (!isOpen) return null;

  const currentPair = phase === 'bracket' ? [roundMovies[pairIndex * 2], roundMovies[pairIndex * 2 + 1]] : [];

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
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-blue-50/95 via-purple-50/90 to-pink-50/95 dark:from-gray-900/95 dark:via-blue-950/90 dark:to-purple-950/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 dark:border-gray-700/60 p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>

            {/* SETUP — escolher o amigo */}
            {phase === 'setup' && (
              <div>
                <div className="text-center mb-6">
                  <motion.div
                    className="inline-flex p-4 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-400/30 mb-4"
                    animate={{ y: [-4, 4, -4] }}
                    transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse' }}
                  >
                    <Swords className="w-10 h-10 text-pink-500 dark:text-pink-400" />
                  </motion.div>
                  <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-rose-500 to-pink-500">
                    {t('watchlistDuel.title')}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 text-sm mt-2">
                    {t('watchlistDuel.description')}
                  </p>
                </div>

                {loadingFriends ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
                  </div>
                ) : friends.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {t('watchlistDuel.noEligibleFriends')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mb-6">
                    {friends.map((friend) => (
                      <button
                        key={friend.id}
                        onClick={() => setSelectedFriend(friend)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                          selectedFriend?.id === friend.id
                            ? 'border-pink-400 bg-pink-500/10 dark:bg-pink-500/15 shadow-lg shadow-pink-500/10'
                            : 'border-white/60 dark:border-gray-700/60 bg-white/40 dark:bg-gray-800/40 hover:bg-white/70 dark:hover:bg-gray-700/60'
                        }`}
                      >
                        <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
                          {friend.avatar_url ? (
                            <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-full h-full p-2.5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">
                            @{friend.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('watchlistDuel.moviesInWatchlist', { count: friend.watchlist_count })}
                          </p>
                        </div>
                        {selectedFriend?.id === friend.id && (
                          <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center flex-shrink-0">
                            <Swords className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleStartDuel}
                  disabled={!selectedFriend || starting}
                  className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl hover:shadow-xl hover:shadow-pink-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Swords className="w-5 h-5" />
                  {t('watchlistDuel.startButton')}
                </button>
              </div>
            )}

            {/* LOADING */}
            {phase === 'loading' && (
              <div className="flex flex-col items-center py-16 gap-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Swords className="w-10 h-10 text-pink-500" />
                </motion.div>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  {t('watchlistDuel.assembling')}
                </p>
              </div>
            )}

            {/* BRACKET */}
            {phase === 'bracket' && currentPair[0] && currentPair[1] && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <button
                    onClick={() => setPhase('setup')}
                    className="p-2 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-full transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  </button>
                  <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {t('duel.roundOf', { count: roundMovies.length })} · {t('duel.pairProgress', { current: pairIndex + 1, total: roundMovies.length / 2 })}
                  </p>
                  <div className="w-8" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {currentPair.map((movie, idx) => (
                    <motion.div
                      key={movie.id}
                      initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex flex-col"
                    >
                      <div
                        className="aspect-[2/3] w-full overflow-hidden cursor-pointer group relative rounded-2xl shadow-xl"
                        onClick={() => openDetails(movie)}
                      >
                        <img
                          src={posterUrl(movie.poster_path)}
                          alt={movie.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image'; }}
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold">
                          {movie.source === 'me' ? t('watchlistDuel.yourList') : `@${selectedFriend?.username}`}
                        </div>
                        {loadingDetailsFor === movie.id && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); openTrailer(movie); }}
                        className="flex items-center justify-center gap-1.5 mt-2 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 rounded-xl transition-colors"
                      >
                        <Play className="w-3 h-3" />
                        {t('duel.watchTrailer')}
                      </button>
                      <button
                        onClick={() => handleChoose(movie)}
                        className="flex items-center justify-center gap-1.5 mt-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-pink-500 to-rose-500 hover:shadow-lg hover:shadow-pink-500/30 rounded-xl transition-all"
                      >
                        <Swords className="w-4 h-4" />
                        {t('duel.choose')}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* CAMPEÃO */}
            {phase === 'champion' && champion && (
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="inline-flex p-4 rounded-full bg-gradient-to-br from-amber-400/20 to-yellow-500/20 border border-amber-400/30 mb-4"
                >
                  <Trophy className="w-10 h-10 text-amber-400" />
                </motion.div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  {t('duel.champion')}
                </h2>
                <div
                  className="w-40 mx-auto aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl cursor-pointer group relative mb-4"
                  onClick={() => openDetails(champion)}
                >
                  <img
                    src={posterUrl(champion.poster_path)}
                    alt={champion.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image'; }}
                  />
                </div>
                <p className="font-bold text-lg text-gray-900 dark:text-white mb-1">{champion.title}</p>
                <div className="flex items-center justify-center gap-1 text-amber-500 mb-6">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="text-sm">{champion.vote_average?.toFixed(1)}</span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => openDetails(champion)}
                    className="flex-1 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-pink-500/30 transition-all"
                  >
                    {t('duel.viewAndAdd')}
                  </button>
                  <button
                    onClick={() => setPhase('setup')}
                    className="flex-1 py-3 bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 text-gray-700 dark:text-gray-200 font-bold rounded-2xl transition-colors"
                  >
                    {t('duel.newDuel')}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Modal de trailer */}
      {trailerMovie && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
          onClick={() => setTrailerMovie(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-gray-950 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-semibold truncate pr-4">{trailerMovie.title}</h3>
              <button onClick={() => setTrailerMovie(null)} className="text-gray-400 hover:text-white flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              {loadingTrailer ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
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
          </div>
        </div>
      )}

      {/* Modal de detalhes do filme */}
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