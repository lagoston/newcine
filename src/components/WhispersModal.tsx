import React, { useState, useEffect } from 'react';
import { X, MessageCircle, Loader2, Calendar, Trash2, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import ConfirmationModal from './ConfirmationModal';
import MovieDetailsModal from './MovieDetailsModal';
import { Movie, getMovieDetails } from '../lib/tmdb';

interface WhispersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onMarkAsRead?: () => void;
}

interface Recommendation {
  id: string;
  from_user_id: string;
  movie_id: number;
  movie_title: string;
  movie_poster: string;
  message: string;
  read: boolean;
  created_at: string;
  from_user: {
    username: string;
    avatar_url: string | null;
  };
}

export default function WhispersModal({ isOpen, onClose, userId, onMarkAsRead }: WhispersModalProps) {
  const { session } = useAuth();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showMovieModal, setShowMovieModal] = useState(false);
  const [loadingMovie, setLoadingMovie] = useState(false);
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState(false);

  const fetchRecommendations = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          *,
          from_user:profiles!recommendations_from_user_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('to_user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = data?.map((rec: any) => ({
        ...rec,
        from_user: rec.from_user || { username: 'Unknown', avatar_url: null }
      })) || [];

      setRecommendations(formattedData);

      // Marcar como lidas
      const unreadIds = formattedData.filter((r: Recommendation) => !r.read).map((r: Recommendation) => r.id);
      if (unreadIds.length > 0 && !hasMarkedAsRead) {
        await supabase
          .from('recommendations')
          .update({ read: true })
          .in('id', unreadIds);
        setHasMarkedAsRead(true);

        // Aguarda um pouco para garantir propagação e notifica componentes externos
        setTimeout(() => {
          if (onMarkAsRead) {
            onMarkAsRead();
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      toast.error('Erro ao carregar recomendações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      fetchRecommendations();
    } else if (!isOpen) {
      // Reset quando fechar
      setHasMarkedAsRead(false);
    }
  }, [isOpen, session?.user?.id]);

  const handleDelete = async () => {
    if (!deletingId || !session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('recommendations')
        .delete()
        .match({ id: deletingId, to_user_id: session.user.id });

      if (error) throw error;

      setRecommendations(prev => prev.filter(r => r.id !== deletingId));
      toast.success('Recomendação deletada');
    } catch (error) {
      console.error('Error deleting recommendation:', error);
      toast.error('Erro ao deletar recomendação');
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenMovie = async (movieId: number) => {
    try {
      setLoadingMovie(true);
      const movie = await getMovieDetails(movieId);
      setSelectedMovie(movie);
      setShowMovieModal(true);
    } catch (error) {
      console.error('Error loading movie:', error);
      toast.error('Erro ao carregar filme');
    } finally {
      setLoadingMovie(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-6 h-6 text-orange-500" />
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                  Sussurros
                </h2>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 sm:p-6 max-h-[70vh] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
              ) : recommendations.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    Nenhum sussurro ainda
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Quando alguém recomendar um filme para você, aparecerá aqui
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-gray-50 dark:bg-gray-700/50 rounded-lg overflow-hidden"
                    >
                      <div className="p-4 sm:p-6">
                        <div className="flex gap-4 mb-4">
                          {/* Avatar do remetente */}
                          <div className="flex-shrink-0">
                            {rec.from_user.avatar_url ? (
                              <img
                                src={rec.from_user.avatar_url}
                                alt={rec.from_user.username}
                                className="w-12 h-12 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                                {rec.from_user.username.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {rec.from_user.username}
                              </span>
                              <span className="text-sm text-gray-500 dark:text-gray-400">
                                recomendou
                              </span>
                            </div>
                            <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                              <Calendar className="w-4 h-4 mr-2" />
                              {formatDate(rec.created_at)}
                            </div>
                          </div>
                        </div>

                        {/* Filme recomendado */}
                        <div className="flex gap-4 mb-4 bg-white dark:bg-gray-800 rounded-lg p-4">
                          <img
                            src={`https://image.tmdb.org/t/p/w200${rec.movie_poster}`}
                            alt={rec.movie_title}
                            className="w-20 h-30 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleOpenMovie(rec.movie_id)}
                            onError={(e) => {
                              e.currentTarget.src = 'https://via.placeholder.com/200x300?text=No+Image';
                            }}
                          />
                          <div className="flex-1">
                            <h3
                              className="text-lg font-semibold text-gray-900 dark:text-white mb-2 cursor-pointer hover:text-orange-500 transition-colors"
                              onClick={() => handleOpenMovie(rec.movie_id)}
                            >
                              {rec.movie_title}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-300 text-sm italic">
                              "{rec.message}"
                            </p>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-600 pt-4">
                          <button
                            onClick={() => handleOpenMovie(rec.movie_id)}
                            disabled={loadingMovie}
                            className="flex items-center px-3 py-1.5 text-sm rounded-md text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
                          >
                            {loadingMovie ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                              <Film className="w-4 h-4 mr-2" />
                            )}
                            Ver Filme
                          </button>
                          <button
                            onClick={() => setDeletingId(rec.id)}
                            className="flex items-center px-3 py-1.5 text-sm rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Deletar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <ConfirmationModal
          isOpen={deletingId !== null}
          onClose={() => setDeletingId(null)}
          onConfirm={handleDelete}
          title="Deletar Recomendação"
          message="Tem certeza que deseja deletar esta recomendação? Esta ação não pode ser desfeita."
        />
      </div>

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
    </>
  );
}
