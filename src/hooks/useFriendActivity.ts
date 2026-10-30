import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { FriendBubbleData } from '../components/FloatingFriendBubbles';

// Atividade dos amigos em lote, para as bolhas que flutuam nas capas
// (FloatingFriendBubbles): uma consulta por leva de títulos que chega, em vez
// de três consultas por pôster. Nasceu na home; desde 30/10/2026 vale também
// para "Escolhidos a dedo" (Oracle Hub) e as prateleiras da Biblioteca dos
// Oráculos.
//
// A lista de amigos é buscada uma vez por pessoa e guardada por 5 minutos
// para a página inteira (as nove prateleiras dividem a mesma busca).

export type FriendActivity = Record<string, FriendBubbleData[]>;

type TitleLike = { id: number; media_type?: string | null };
type FriendEntry = { user_id: string; movie_id: number; media_type: string | null; rating: number | null };

// A chave de um título nas listas de atividade: "movie:603", "tv:1396".
export const friendKey = (title: TitleLike) => `${title.media_type === 'tv' ? 'tv' : 'movie'}:${title.id}`;

const FRIENDS_TTL_MS = 5 * 60 * 1000;
const friendIdsCache = new Map<string, { at: number; ids: Promise<string[]> }>();

async function loadFriendIds(userId: string): Promise<string[]> {
  const { data: friendships } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return (friendships ?? []).map((f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );
}

export function fetchFriendIds(userId: string): Promise<string[]> {
  const cached = friendIdsCache.get(userId);
  if (cached && Date.now() - cached.at < FRIENDS_TTL_MS) return cached.ids;
  const ids = loadFriendIds(userId).catch((error) => {
    friendIdsCache.delete(userId);
    throw error;
  });
  friendIdsCache.set(userId, { at: Date.now(), ids });
  return ids;
}

export function useFriendActivity(userId: string | undefined, titles: TitleLike[]): FriendActivity {
  const [activity, setActivity] = useState<FriendActivity>({});
  const askedRef = useRef<Set<string>>(new Set());
  // Quem está logado agora: uma resposta que chega depois de trocar de conta
  // é descartada.
  const userRef = useRef(userId);

  useEffect(() => {
    userRef.current = userId;
    askedRef.current = new Set();
    setActivity({});
  }, [userId]);

  const keysKey = useMemo(() => Array.from(new Set(titles.map(friendKey))).sort().join(','), [titles]);

  useEffect(() => {
    if (!userId || !keysKey) return;
    const keys = keysKey.split(',').filter((key) => !askedRef.current.has(key));
    if (keys.length === 0) return;
    keys.forEach((key) => askedRef.current.add(key));
    const wanted = new Set(keys);
    const ids = Array.from(new Set(keys.map((key) => Number(key.split(':')[1]))));
    const stale = () => userRef.current !== userId;

    (async () => {
      try {
        const friendIds = await fetchFriendIds(userId);
        if (friendIds.length === 0 || stale()) return;

        const { data: entries } = await supabase
          .from('user_movies')
          .select('user_id, movie_id, media_type, rating')
          .in('movie_id', ids)
          .in('user_id', friendIds);

        if (!entries || entries.length === 0 || stale()) return;

        const userIds = Array.from(new Set(entries.map((e: { user_id: string }) => e.user_id)));
        const { data: profiles } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url')
          .in('id', userIds);

        const byId = new Map((profiles ?? []).map((p: { id: string; username: string; avatar_url: string | null }) => [p.id, p]));
        const grouped: FriendActivity = {};

        (entries as FriendEntry[]).forEach((entry) => {
          const key = friendKey({ id: entry.movie_id, media_type: entry.media_type });
          // o mesmo número pode ser filme e série: só o tipo pedido entra
          if (!wanted.has(key)) return;
          const profile = byId.get(entry.user_id);
          if (!profile) return;
          (grouped[key] ||= []).push({
            user_id: entry.user_id,
            username: profile.username,
            avatar_url: profile.avatar_url,
            rating: entry.rating,
            is_watchlist_only: entry.rating === null,
          });
        });

        // Quem avaliou vem antes de quem só guardou na watchlist; notas maiores primeiro.
        Object.values(grouped).forEach((list) => list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)));

        if (!stale()) setActivity((prev) => ({ ...prev, ...grouped }));
      } catch (error) {
        console.error('Friend activity error', error);
        // a leva não chegou: pode ser pedida de novo
        if (!stale()) keys.forEach((key) => askedRef.current.delete(key));
      }
    })();
  }, [userId, keysKey]);

  return activity;
}
