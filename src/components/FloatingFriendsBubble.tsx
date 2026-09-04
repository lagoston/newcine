import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface FriendBubbleData {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rating: number | null;
  is_watchlist_only?: boolean;
}

interface FloatingFriendBubblesProps {
  movieId: number;
  mediaType?: 'movie' | 'tv';
  // Máximo de bolhas exibidas — os cards fora do modal expandido são bem
  // menores que o pôster grande do MovieDetailsModal, então por padrão
  // mostra menos (3) pra não lotar um card pequeno.
  maxBubbles?: number;
}

// Versão "fechada" das bolhas flutuantes que já existem no
// MovieDetailsModal — mesmo conceito (avatar + coroa com nota ou emoji
// de watchlist), mas SEM balões de diálogo. Balões de review/"Querendo
// Assistir..." exigem espaço e contexto que só fazem sentido no modal
// aberto; num card de pôster pequeno dentro de um carrossel, eles
// atrapalhariam mais do que ajudariam. Usada apenas em: "Amigos
// planejando assistir" (Comunidade), "Popular Agora" e "Recomendações
// do Oráculo" (Home) — nunca na Biblioteca, buscas de filme, ou perfis
// da comunidade, onde as bolhas continuam desativadas.
const FloatingFriendBubbles: React.FC<FloatingFriendBubblesProps> = ({ movieId, mediaType = 'movie', maxBubbles = 3 }) => {
  const { session } = useAuth();
  const [bubbles, setBubbles] = useState<FriendBubbleData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }

      try {
        const { data: followingData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', session.user.id);

        const followingIds = (followingData || []).map((f: any) => f.following_id);
        if (followingIds.length === 0) {
          if (!cancelled) { setBubbles([]); setLoading(false); }
          return;
        }

        const { data: entries } = await supabase
          .from('user_movies')
          .select(`user_id, rating, movies!inner(media_type)`)
          .eq('movie_id', movieId)
          .eq('movies.media_type', mediaType)
          .in('user_id', followingIds);

        if (!entries || entries.length === 0) {
          if (!cancelled) { setBubbles([]); setLoading(false); }
          return;
        }

        const userIds = entries.map((e: any) => e.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        const formatted: FriendBubbleData[] = entries
          .sort(() => Math.random() - 0.5)
          .slice(0, maxBubbles)
          .map((e: any) => {
            const profile = profiles?.find((p: any) => p.id === e.user_id);
            return {
              user_id: e.user_id,
              username: profile?.username || 'Unknown',
              avatar_url: profile?.avatar_url || null,
              rating: e.rating,
              is_watchlist_only: e.rating === null,
            };
          });

        if (!cancelled) { setBubbles(formatted); setLoading(false); }
      } catch (error) {
        console.error('Error loading floating friend bubbles:', error);
        if (!cancelled) { setBubbles([]); setLoading(false); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [movieId, mediaType, session?.user?.id, maxBubbles]);

  const getBubbleColor = (rating: number | null) => {
    if (rating === null) return 'from-sky-400 to-blue-500';
    if (rating === 10) return 'from-purple-400 via-pink-400 to-blue-400';
    if (rating >= 7) return 'from-green-400 to-emerald-500';
    if (rating >= 4) return 'from-orange-400 to-amber-500';
    return 'from-red-400 to-rose-500';
  };

  if (loading || bubbles.length === 0) return null;

  // Mesmas primeiras posições usadas no modal expandido — reaproveita a
  // mesma disposição visual reconhecível, só com menos bolhas no total
  // (cards pequenos não comportam as 5 do modal grande).
  const positions = [
    { top: '10%', left: '8%' },
    { top: '15%', right: '10%' },
    { top: '45%', left: '6%' },
  ];

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {bubbles.map((friend, index) => {
        const position = positions[index] || positions[0];
        return (
          <div
            key={friend.user_id}
            className="absolute animate-float-slow"
            style={{ ...position, animationDelay: `${index * 0.3}s` }}
          >
            <div className="relative w-9 h-9 sm:w-10 sm:h-10">
              <div className={`absolute inset-0 rounded-full border-2 border-white dark:border-gray-700 shadow-xl overflow-hidden bg-gradient-to-br ${getBubbleColor(friend.rating)} p-0.5`}>
                <div className="w-full h-full rounded-full overflow-hidden bg-gray-800">
                  {friend.avatar_url ? (
                    <img src={friend.avatar_url} alt={friend.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xs">
                      {friend.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-white dark:border-gray-800 shadow-lg flex items-center justify-center">
                <span className="text-[8px] sm:text-[9px] font-extrabold text-white">
                  {friend.is_watchlist_only ? '👀' : friend.rating}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default FloatingFriendBubbles;