/**
 * Mesa com amigos do Pôster Poker (03/11/2026, fase 3 — pacote G3).
 *
 * Os tipos são os do pacote F3 (apiTypes.ts; formato em .../poker3/status/F3_NOTES.md):
 * Edge `poker-friends` (proto 1), RPC `get_poker_friends_home()`, convites nos Sussurros
 * (`get_poker_invites`) e a casual de devolução (`poker_casual_begin` + `recover.*`).
 * A interface pega `pokerApi.friends`/`pokerApi.casual` (o do F3, ou o `mockApi` na
 * prévia); se faltarem (servidor antigo), o modo mostra "em breve".
 */
import type { CasualApi, FriendsApi, FriendsHome, FriendsPing, InviteState, PokerApiLike } from './apiTypes.ts';
import { pokerApi } from './api.ts';
import { supabase } from '../../supabase.ts';

export type {
  FriendsRoomStatus,
  FriendsMemberStatus,
  FriendsPosterCard,
  FriendsMember,
  FriendsStakeOutcome,
  FriendsResult,
  FriendsRoom,
  FriendsMatch,
  FriendsRoomReply,
  FriendsRoomBrief,
  FriendsInvite,
  FriendsFriend,
  FriendsHome,
  InviteState,
  FriendsPing,
  FriendsApi,
  CasualBegin,
  RecoverResult,
  CasualApi,
} from './apiTypes.ts';

type WithFriends = PokerApiLike & { friends?: Partial<FriendsApi>; casual?: Partial<CasualApi> };

// O canal de tempo real do F3 (Broadcast privado `poker-room:<id>`, evento `ping`).
function realtimeSubscribe(roomId: string, onPing: (p: FriendsPing) => void): () => void {
  const ch = supabase
    .channel(`poker-room:${roomId}`, { config: { private: true } })
    .on('broadcast', { event: 'ping' }, ({ payload }) => {
      const p = (payload ?? {}) as { version?: number; seq?: number };
      onPing({ version: typeof p.version === 'number' ? p.version : 0, seq: p.seq });
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

/**
 * A API dos amigos, se houver: a do F3 quando `pokerApi.friends` existir; o mock só
 * quando a mesa inteira está no mock (prévia). null = "em breve".
 */
export function friendsApi(): FriendsApi | null {
  const api = pokerApi as WithFriends;
  const f = api.friends;
  if (!f || typeof f.create !== 'function' || typeof f.sync !== 'function') return null;
  const home = f.home ?? (async () => {
    const { data, error } = await supabase.rpc('get_poker_friends_home');
    if (error) throw error;
    return (data ?? { enabled: false }) as FriendsHome;
  });
  const inviteStates = f.inviteStates ?? (async (roomIds: string[]) => {
    if (!roomIds.length) return [];
    const { data, error } = await supabase.rpc('get_poker_invites', { p_room_ids: roomIds });
    if (error) throw error;
    return (Array.isArray(data) ? data : []) as InviteState[];
  });
  return { ...(f as FriendsApi), home, inviteStates, subscribe: f.subscribe ?? realtimeSubscribe };
}

/** A casual de devolução, se o servidor já tem (senão a casual roda sempre no aparelho). */
export function casualApi(): CasualApi | null {
  const c = (pokerApi as WithFriends).casual;
  if (!c || typeof c.begin !== 'function' || typeof c.start !== 'function') return null;
  return c as CasualApi;
}

// Quem está em cada lugar de pessoa (nome e foto): people.ts (sem dependências, a
// narração também lê).
export { setTablePeople, tablePerson, personColor, isPersonId, type SeatPerson } from './people.ts';
