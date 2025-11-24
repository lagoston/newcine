import { useState, useEffect } from 'react';
import { X, Search, Send, Loader2, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';

interface Follower {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface RecommendModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieId: number;
  movieTitle: string;
  moviePoster: string;
  mediaType?: 'movie' | 'tv';
}

const RecommendModal = ({ isOpen, onClose, movieId, movieTitle, moviePoster, mediaType = 'movie' }: RecommendModalProps) => {
  const { session } = useAuth();
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [filteredFollowers, setFilteredFollowers] = useState<Follower[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFollower, setSelectedFollower] = useState<Follower | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      loadFollowers();
    }
  }, [isOpen, session?.user?.id]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredFollowers(followers);
    } else {
      const filtered = followers.filter(f =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFollowers(filtered);
    }
  }, [searchQuery, followers]);

  const loadFollowers = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);

      const { data: followersData, error: followersError } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', session.user.id);

      if (followersError) throw followersError;

      if (!followersData || followersData.length === 0) {
        setFollowers([]);
        setFilteredFollowers([]);
        return;
      }

      const followerIds = followersData.map(f => f.follower_id);

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', followerIds);

      if (profilesError) throw profilesError;

      const formattedFollowers = profilesData?.map(p => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url
      })) || [];

      setFollowers(formattedFollowers);
      setFilteredFollowers(formattedFollowers);
    } catch (error) {
      console.error('Error loading followers:', error);
      toast.error('Erro ao carregar seguidores');
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecommendation = async () => {
    if (!selectedFollower || !session?.user?.id) return;
    if (message.trim().length === 0) {
      toast.error('Por favor, escreva uma mensagem');
      return;
    }

    try {
      setSending(true);

      const { data: canSend, error: checkError } = await supabase.rpc('can_send_recommendation', {
        user_id_input: session.user.id
      });

      if (checkError) throw checkError;

      if (!canSend) {
        const { data: limit, error: limitError } = await supabase.rpc('get_user_recommendation_limit', {
          user_id_input: session.user.id
        });

        if (limitError) {
          console.error('Error getting limit:', limitError);
        }

        const isPremium = limit === 50;

        if (isPremium) {
          toast.error(
            'Você atingiu o limite semanal de 50 recomendações para usuários Premium. Tente novamente na próxima semana!',
            { duration: 5000 }
          );
        } else {
          toast.error(
            'Você atingiu o limite semanal de 10 recomendações. Faça upgrade para Premium e envie até 50 recomendações por semana!',
            { duration: 5000 }
          );
        }
        setSending(false);
        return;
      }

      const { error } = await supabase
        .from('recommendations')
        .insert({
          from_user_id: session.user.id,
          to_user_id: selectedFollower.id,
          movie_id: movieId,
          movie_title: movieTitle,
          movie_poster: moviePoster,
          message: message.trim(),
          read: false,
          media_type: mediaType
        });

      if (error) throw error;

      toast.success(`Recomendação enviada para ${selectedFollower.username}!`);
      onClose();
      setSelectedFollower(null);
      setMessage('');
      setSearchQuery('');
    } catch (error) {
      console.error('Error sending recommendation:', error);
      toast.error('Erro ao enviar recomendação');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Recomendar Filme
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
            {!selectedFollower ? (
              <>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar seguidor..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Carregando seguidores...</p>
                  </div>
                ) : filteredFollowers.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                      {followers.length === 0 ? 'Você ainda não tem seguidores' : 'Nenhum seguidor encontrado'}
                    </p>
                    {followers.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Compartilhe seu perfil para receber seguidores
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-2 -mr-2">
                    {filteredFollowers.map((follower) => (
                      <button
                        key={follower.id}
                        onClick={() => setSelectedFollower(follower)}
                        className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all duration-200 border border-transparent hover:border-orange-200 dark:hover:border-orange-800 group"
                      >
                        <div className="relative flex-shrink-0">
                          {follower.avatar_url ? (
                            <img
                              src={follower.avatar_url}
                              alt={follower.username}
                              className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-orange-400 transition-all"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-orange-400 transition-all">
                              {follower.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-gray-900 dark:text-white truncate">
                            @{follower.username}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Enviar recomendação
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <Send className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <div className="relative flex items-center gap-4 p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl border-2 border-orange-200 dark:border-orange-800">
                  <div className="relative flex-shrink-0">
                    {selectedFollower.avatar_url ? (
                      <img
                        src={selectedFollower.avatar_url}
                        alt={selectedFollower.username}
                        className="w-16 h-16 rounded-full object-cover ring-2 ring-orange-400"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl ring-2 ring-orange-400">
                        {selectedFollower.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 dark:text-white text-lg truncate">
                      @{selectedFollower.username}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate flex items-center gap-1">
                      <Film className="w-4 h-4" />
                      {movieTitle}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedFollower(null);
                      setMessage('');
                    }}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white dark:hover:bg-gray-800 p-2 rounded-full transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Sua mensagem
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Escreva por que está recomendando este filme..."
                    rows={4}
                    maxLength={500}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">
                    {message.length}/500
                  </div>
                </div>

                <button
                  onClick={handleSendRecommendation}
                  disabled={sending || message.trim().length === 0}
                  className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Enviar Recomendação
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RecommendModal;
