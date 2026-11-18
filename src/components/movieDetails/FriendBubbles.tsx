import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../../lib/oracleTheme';
import { BUBBLE_BG, FRIEND_POSITIONS, type FriendRating } from './shared';
import { useTitleFriends } from './useTitleFriends';

// Bolhas de quem viu: amigos primeiro, depois resenhas de outras pessoas,
// depois amigos de amigos (até 5), flutuando sobre o pôster.
//
// 18/11/2026 (otimização): a cascata de consultas dos amigos é a resposta que
// mais demora ao abrir o menu. Ela mora nesta seção (useTitleFriends): quando
// chega, só as bolhas aparecem; o resto da ficha não re-renderiza.

interface FriendBubblesProps {
  movieId: number;
  mediaType: 'movie' | 'tv';
  userId: string | null;
  // abre as resenhas do título (a bolha de quem escreveu resenha)
  onOpenReviews: () => void;
}

const FriendBubbles: React.FC<FriendBubblesProps> = ({ movieId, mediaType, userId, onOpenReviews }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { friends, loading: loadingFriends } = useTitleFriends(movieId, mediaType, userId);
  // Qual bolha de amigo tem o balãozinho com o nome ativo no momento —
  // primeiro clique numa bolha mostra o balão; um segundo clique NA
  // MESMA bolha (ela já ativa) navega pro perfil desse usuário.
  const [activeFriendBubble, setActiveFriendBubble] = useState<string | null>(null);
  useEffect(() => {
    setActiveFriendBubble(null);
  }, [movieId]);

  const friendAriaLabel = (friend: FriendRating) => {
    if (friend.is_watchlist_only) return `${friend.username}: ${t('movies.wantingToWatch')}`;
    if (friend.rating !== null) return t('movieModal.friendRated', { name: friend.username, rating: friend.rating });
    return friend.username;
  };

  const handleFriendClick = (friend: FriendRating) => {
    // Com resenha: abre as resenhas do filme (a dele já aparece lá).
    // Só watchlist: vai direto pro perfil. Só nota: o primeiro toque mostra
    // o balão com nome e nota; o segundo, na mesma bolha, abre o perfil.
    if (friend.review_title) {
      onOpenReviews();
    } else if (friend.is_watchlist_only) {
      navigate(`/profile/${friend.username}`);
    } else if (activeFriendBubble === friend.user_id) {
      navigate(`/profile/${friend.username}`);
    } else {
      setActiveFriendBubble(friend.user_id);
    }
  };

  if (loadingFriends || friends.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" role="group" aria-label={t('movieModal.friendsHere')}>
      {friends.map((friend, index) => {
        const tone = friend.is_watchlist_only
          ? ratingTone(null)
          : friend.rating === null
            ? { color: MIST, ring: 'rgba(189,180,214,0.35)' }
            : ratingTone(friend.rating);
        const position = FRIEND_POSITIONS[index] || FRIEND_POSITIONS[0];
        const isActive = activeFriendBubble === friend.user_id;
        return (
          <div
            key={friend.user_id}
            className="absolute animate-float-slow pointer-events-auto"
            style={{ ...position, animationDelay: `${index * 0.3}s`, zIndex: isActive ? 25 : 10 }}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleFriendClick(friend); }}
              aria-label={friendAriaLabel(friend)}
              className={`group relative block w-12 h-12 sm:w-14 sm:h-14 rounded-full ${FOCUS_RING}`}
              style={{ minWidth: 0, minHeight: 0, padding: 0 }}
            >
              <span
                className="absolute inset-0 rounded-full overflow-hidden"
                style={{ background: VELVET, boxShadow: `0 0 0 2.5px ${tone.color}, 0 12px 24px -8px rgba(0,0,0,0.85)` }}
              >
                {friend.avatar_url ? (
                  <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <span className="w-full h-full grid place-items-center text-lg font-semibold" style={{ color: PAPER }}>
                    {friend.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>

              {/* Selo: a nota, ou um olho quando é só watchlist */}
              <span
                className="absolute -bottom-1.5 -right-1.5 grid place-items-center w-7 h-7 rounded-full text-[13px] leading-none"
                style={{
                  ...PIXEL,
                  background: NIGHT,
                  color: tone.color,
                  boxShadow: `0 0 0 2px ${tone.color}${friend.rating === 10 ? ', 0 0 16px rgba(249,168,212,0.85)' : ''}`,
                }}
              >
                {friend.is_watchlist_only ? <Eye className="w-3.5 h-3.5" aria-hidden /> : (friend.rating ?? '–')}
              </span>

              {friend.review_title ? (
                // Com resenha: balão sempre visível com o título dela.
                <span
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 block w-[118px] px-2.5 py-1.5 rounded-xl text-center shadow-2xl ring-1 ring-white/15"
                  style={{ background: BUBBLE_BG }}
                >
                  <span className="block text-[10px] font-semibold truncate" style={{ color: PAPER }}>{friend.username}</span>
                  <span className="text-[10px] italic leading-tight line-clamp-2 mt-0.5" style={{ color: MIST }}>“{friend.review_title}”</span>
                  <span aria-hidden className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]" style={{ borderTopColor: BUBBLE_BG }} />
                </span>
              ) : friend.is_watchlist_only ? (
                // Só watchlist: balão sempre visível, "querendo assistir".
                <span
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 block px-2.5 py-1.5 rounded-xl text-center whitespace-nowrap shadow-2xl ring-1 ring-white/15"
                  style={{ background: BUBBLE_BG }}
                >
                  <span className="block text-[10px] font-semibold" style={{ color: PAPER }}>{friend.username}</span>
                  <span className="block text-[10px] italic leading-tight mt-0.5 text-sky-300">
                    {t('movies.wantingToWatch', { defaultValue: 'Querendo Assistir...' })}
                  </span>
                  <span aria-hidden className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]" style={{ borderTopColor: BUBBLE_BG }} />
                </span>
              ) : (
                // Só nota: balão aparece no primeiro toque (ou no hover).
                <span
                  className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 block px-3 py-1.5 rounded-xl text-left whitespace-nowrap shadow-2xl ring-1 ring-white/15 transition-opacity duration-200 ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  style={{ background: BUBBLE_BG }}
                >
                  <span className="block text-xs font-semibold" style={{ color: PAPER }}>{friend.username}</span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: tone.color }}>
                    <Star className="w-3 h-3 fill-current" aria-hidden />
                    {friend.rating}/10
                  </span>
                  <span aria-hidden className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]" style={{ borderTopColor: BUBBLE_BG }} />
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(FriendBubbles);
