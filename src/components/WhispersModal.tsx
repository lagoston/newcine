import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Loader2, Calendar, Trash2, Film, User, Tv, Sparkles, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import ConfirmationModal from './ConfirmationModal';
import MovieDetailsModal from './MovieDetailsModal';
import { Movie, getMovieDetails, getMovieDetailsFromDB } from '../lib/tmdb';
import { useWhispers } from '../contexts/WhispersContext';

interface WhispersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

// Estrutura genérica de tipos — cada notificação nova que formos
// adicionando no futuro (mencionado explicitamente que viriam mais)
// só precisa entrar nesse union type e ganhar um case no switch de
// renderização abaixo, em vez de reformular tudo de novo.
interface Whisper {
  id: string;
  from_user_id: string | null;
  type: 'movie' | 'friend_request' | 'new_episode' | 'tag_unlocked';
  movie_id?: number;
  movie_title?: string;
  movie_poster?: string;
  message?: string;
  read: boolean;
  created_at: string;
  media_type?: 'movie' | 'tv';
  season_number?: number;
  episode_number?: number;
  episode_name?: string;
  tag_name?: string;
  tag_emoji?: string;
  tag_category?: string;
  from_user: {
    username: string;
    avatar_url: string | null;
  } | null;
}

export default function WhispersModal({ isOpen, onClose, userId }: WhispersModalProps) {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refetchUnreadCount } = useWhispers();
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showMovieModal, setShowMovieModal] = useState(false);
  const [loadingMovie, setLoadingMovie] = useState(false);

  const fetchWhispers = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('friend_indications')
        .select(`
          *,
          from_user:profiles!from_user_id (
            username,
            avatar_url
          )
        `)
        .eq('to_user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData: Whisper[] = (data || []).map((rec: any) => ({
        ...rec,
        // Notificações do sistema (new_episode) não têm from_user —
        // diferente dos tipos antigos, que sempre tinham um remetente.
        from_user: rec.from_user || null,
      }));

      setWhispers(formattedData);

      // Marca como lidas direto — sem o setTimeout artificial de antes
      // ("aguarda um pouco pra garantir propagação"), que era uma
      // tentativa de contornar uma condição de corrida sem resolver a
      // causa raiz. Agora o Context tem sua própria subscription
      // realtime na tabela certa, então basta fazer o UPDATE aqui e
      // chamar refetchUnreadCount uma vez — não precisa de atraso
      // artificial pra "esperar propagar".
      const unreadIds = formattedData.filter((w) => !w.read).map((w) => w.id);
      if (unreadIds.length > 0) {
        await supabase
          .from('friend_indications')
          .update({ read: true })
          .in('id', unreadIds);
        refetchUnreadCount();
      }
    } catch (error) {
      console.error('Error fetching whispers:', error);
      toast.error(t('indications.loadError', { defaultValue: 'Erro ao carregar sussurros.' }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchWhispers();
    }
  }, [isOpen, session?.user?.id]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = originalOverflow; };
    }
  }, [isOpen]);

  const handleDelete = async () => {
    if (!deletingId || !session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('friend_indications')
        .delete()
        .match({ id: deletingId, to_user_id: session.user.id });

      if (error) throw error;

      setWhispers((prev) => prev.filter((w) => w.id !== deletingId));
      toast.success(t('indications.deleted', { defaultValue: 'Sussurro apagado.' }));
    } catch (error) {
      console.error('Error deleting whisper:', error);
      toast.error(t('indications.deleteError', { defaultValue: 'Erro ao apagar sussurro.' }));
    } finally {
      setDeletingId(null);
    }
  };

  // Aceita ou recusa um pedido de amizade direto do Whisper — a peça
  // central da mudança de "seguir" pra amizade mútua estilo Facebook.
  // Recusar não deixa rastro (respond_to_friend_request já apaga a
  // linha de friendships), e aqui também remove o próprio whisper,
  // já que o pedido foi resolvido.
  const handleRespondToFriendRequest = async (whisper: Whisper, accept: boolean) => {
    if (!session?.user?.id || !whisper.from_user_id) return;

    try {
      const { data, error } = await supabase.rpc('respond_to_friend_request', {
        p_addressee_id: session.user.id,
        p_requester_id: whisper.from_user_id,
        p_accept: accept
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'respond_failed');

      await supabase
        .from('friend_indications')
        .delete()
        .match({ id: whisper.id, to_user_id: session.user.id });

      setWhispers((prev) => prev.filter((w) => w.id !== whisper.id));
      refetchUnreadCount();

      toast.success(
        accept
          ? t('indications.friendRequestAccepted', { defaultValue: `Você e @${whisper.from_user?.username} agora são amigos!` })
          : t('indications.friendRequestDeclined', { defaultValue: 'Pedido de amizade recusado.' })
      );
    } catch (error) {
      console.error('Error responding to friend request:', error);
      toast.error(t('indications.respondError', { defaultValue: 'Erro ao responder o pedido.' }));
    }
  };

  const handleOpenMovie = async (movieId: number, mediaType?: 'movie' | 'tv') => {
    try {
      setLoadingMovie(true);
      const movie = mediaType
        ? await getMovieDetails(movieId, mediaType)
        : await getMovieDetailsFromDB(movieId);
      setSelectedMovie(movie);
      setShowMovieModal(true);
    } catch (error) {
      console.error('Error loading movie:', error);
      toast.error(t('common.error', { defaultValue: 'Erro ao carregar filme.' }));
    } finally {
      setLoadingMovie(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(t('common.locale', { defaultValue: 'pt-BR' }), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="relative w-full max-w-2xl max-h-[calc(100dvh-4rem)] flex flex-col rounded-3xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-2xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-orange-400/15 to-amber-500/15 rounded-full blur-3xl pointer-events-none" />

                <div className="relative flex-shrink-0 flex items-center justify-between p-5 sm:p-6 border-b border-gray-200/50 dark:border-gray-700/50">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-400/30">
                      <MessageCircle className="w-5 h-5 text-orange-500" />
                    </div>
                    {t('profile.whispers', { defaultValue: 'Sussurros' })}
                  </h2>
                  <button
                    onClick={onClose}
                    className="p-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="relative flex-1 overflow-y-auto p-4 sm:p-6">
                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-7 h-7 animate-spin text-orange-500" />
                    </div>
                  ) : whispers.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-400/30 flex items-center justify-center rotate-3">
                        <MessageCircle className="w-8 h-8 text-orange-500" />
                      </div>
                      <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1.5">
                        {t('indications.empty', { defaultValue: 'Nenhum sussurro ainda' })}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs mx-auto">
                        {t('indications.emptyHint', { defaultValue: 'Recomendações, novos seguidores e episódios novos de séries que você acompanha vão aparecer aqui.' })}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {whispers.map((whisper, index) => (
                        <motion.div
                          key={whisper.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(index * 0.04, 0.3) }}
                          className="rounded-2xl bg-gray-50/70 dark:bg-gray-900/40 border border-gray-200/50 dark:border-gray-700/50 overflow-hidden"
                        >
                          <div className="p-4">
                            <div className="flex gap-3 mb-3">
                              <div className="flex-shrink-0">
                                {whisper.from_user?.avatar_url ? (
                                  <img
                                    src={whisper.from_user.avatar_url}
                                    alt={whisper.from_user.username}
                                    className="w-10 h-10 rounded-full object-cover"
                                  />
                                ) : whisper.from_user ? (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                    {whisper.from_user.username.charAt(0).toUpperCase()}
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  {whisper.from_user ? (
                                    <>
                                      <span className="font-semibold text-sm text-gray-900 dark:text-white">
                                        {whisper.from_user.username}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {whisper.type === 'friend_request'
                                          ? t('indications.sentFriendRequest', { defaultValue: 'quer ser seu amigo' })
                                          : t('indications.recommended', { defaultValue: 'recomendou' })}
                                      </span>
                                    </>
                                  ) : (
                                    <span className={`font-semibold text-sm ${whisper.type === 'tag_unlocked' ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400'}`}>
                                      {whisper.type === 'tag_unlocked'
                                        ? t('indications.tagUnlockedHeader', { defaultValue: 'Você desbloqueou uma tag!' })
                                        : t('indications.newEpisodeLabel', { defaultValue: 'Novo episódio disponível' })}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center text-xs text-gray-400 dark:text-gray-500">
                                  <Calendar className="w-3 h-3 mr-1.5" />
                                  {formatDate(whisper.created_at)}
                                </div>
                              </div>
                            </div>

                            {whisper.type === 'movie' && (
                              <>
                                <div className="flex gap-3 mb-3 bg-white/80 dark:bg-gray-800/60 rounded-xl p-3">
                                  <img
                                    src={`https://image.tmdb.org/t/p/w200${whisper.movie_poster}`}
                                    alt={whisper.movie_title}
                                    className="w-16 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                                    onClick={() => handleOpenMovie(whisper.movie_id!, whisper.media_type)}
                                    onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/200x300?text=No+Image'; }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <h3
                                      className="font-semibold text-gray-900 dark:text-white mb-1.5 cursor-pointer hover:text-orange-500 transition-colors line-clamp-2"
                                      onClick={() => handleOpenMovie(whisper.movie_id!, whisper.media_type)}
                                    >
                                      {whisper.movie_title}
                                    </h3>
                                    {whisper.message && (
                                      <p className="text-gray-600 dark:text-gray-300 text-sm italic line-clamp-3">
                                        "{whisper.message}"
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenMovie(whisper.movie_id!, whisper.media_type)}
                                    disabled={loadingMovie}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-orange-600 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 transition-colors disabled:opacity-50"
                                  >
                                    {loadingMovie ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Film className="w-3.5 h-3.5" />}
                                    {t('indications.viewMovie', { defaultValue: 'Ver Filme' })}
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(whisper.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('common.delete', { defaultValue: 'Apagar' })}
                                  </button>
                                </div>
                              </>
                            )}

                            {whisper.type === 'friend_request' && (
                              <>
                                <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 rounded-xl p-3 mb-3 text-center">
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    <User className="w-4 h-4 inline-block mr-1.5 text-orange-500 align-text-bottom" />
                                    <span className="font-semibold">@{whisper.from_user?.username}</span>{' '}
                                    {t('indications.wantsToBeFriends', { defaultValue: 'quer ser seu amigo!' })} 🤝
                                  </p>
                                </div>
                                <div className="flex justify-end gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => { onClose(); navigate(`/profile/${whisper.from_user?.username}`); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-gray-600 dark:text-gray-300 bg-gray-500/10 hover:bg-gray-500/20 transition-colors"
                                  >
                                    <User className="w-3.5 h-3.5" />
                                    {t('indications.viewProfile', { defaultValue: 'Ver Perfil' })}
                                  </button>
                                  <button
                                    onClick={() => handleRespondToFriendRequest(whisper, false)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('indications.declineRequest', { defaultValue: 'Recusar' })}
                                  </button>
                                  <button
                                    onClick={() => handleRespondToFriendRequest(whisper, true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:shadow-md transition-all"
                                  >
                                    <User className="w-3.5 h-3.5" />
                                    {t('indications.acceptRequest', { defaultValue: 'Aceitar' })}
                                  </button>
                                </div>
                              </>
                            )}

                            {whisper.type === 'new_episode' && (
                              <>
                                <div className="flex gap-3 mb-3 bg-white/80 dark:bg-gray-800/60 rounded-xl p-3">
                                  <img
                                    src={`https://image.tmdb.org/t/p/w200${whisper.movie_poster}`}
                                    alt={whisper.movie_title}
                                    className="w-16 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                                    onClick={() => handleOpenMovie(whisper.movie_id!, 'tv')}
                                    onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/200x300?text=No+Image'; }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <h3
                                      className="font-semibold text-gray-900 dark:text-white mb-1 cursor-pointer hover:text-violet-500 transition-colors line-clamp-2"
                                      onClick={() => handleOpenMovie(whisper.movie_id!, 'tv')}
                                    >
                                      {whisper.movie_title}
                                    </h3>
                                    <p className="text-xs font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1">
                                      <Tv className="w-3.5 h-3.5" />
                                      S{whisper.season_number}E{whisper.episode_number}
                                      {whisper.episode_name ? ` — ${whisper.episode_name}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenMovie(whisper.movie_id!, 'tv')}
                                    disabled={loadingMovie}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                                  >
                                    {loadingMovie ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tv className="w-3.5 h-3.5" />}
                                    {t('indications.viewEpisode', { defaultValue: 'Ver Episódio' })}
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(whisper.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('common.delete', { defaultValue: 'Apagar' })}
                                  </button>
                                </div>
                              </>
                            )}

                            {whisper.type === 'tag_unlocked' && (
                              <>
                                <div className="flex items-center gap-3 mb-3 bg-white/80 dark:bg-gray-800/60 rounded-xl p-3">
                                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400/20 to-yellow-500/20 border border-amber-400/30 flex items-center justify-center text-3xl flex-shrink-0">
                                    {whisper.tag_emoji}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2">
                                      {whisper.tag_name}
                                    </h3>
                                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                      <Trophy className="w-3.5 h-3.5" />
                                      {t('indications.tagUnlockedLabel', { defaultValue: 'Nova conquista desbloqueada' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => { onClose(); navigate('/profile'); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                                  >
                                    <Trophy className="w-3.5 h-3.5" />
                                    {t('indications.viewTags', { defaultValue: 'Ver Minhas Tags' })}
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(whisper.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {t('common.delete', { defaultValue: 'Apagar' })}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}

          <ConfirmationModal
            isOpen={deletingId !== null}
            onClose={() => setDeletingId(null)}
            onConfirm={handleDelete}
            title={t('indications.deleteTitle', { defaultValue: 'Apagar Sussurro' })}
            message={t('indications.deleteConfirm', { defaultValue: 'Tem certeza que deseja apagar este sussurro? Essa ação não pode ser desfeita.' })}
          />

          {selectedMovie && (
            <MovieDetailsModal
              movie={selectedMovie}
              isOpen={showMovieModal}
              onClose={() => {
                setShowMovieModal(false);
                setSelectedMovie(null);
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}