// A própria pessoa: perfil e amigos (18/11/2026, Protocolo Reborn, onda 2a).
//
// Achado A2 do relatório de rede: a linha do próprio perfil era lida 14 vezes
// numa sessão de 6 telas, cada componente pedindo a sua coluna (a barra de
// baixo, a Home, a Biblioteca, o Perfil, o Jackpot). Aqui ela é lida UMA vez,
// com as colunas que a casca usa (~1 KB), e todo mundo recebe a mesma resposta.
//
// Estas colunas só mudam quando a própria pessoa mexe no perfil. Quem grava
// uma delas avisa com emit('profile:updated', {}) (src/lib/bus.ts) ou corrige
// a cópia guardada com patchMyProfile — senão as telas mostram o valor antigo
// por até 10 minutos.
import { supabase } from '../supabase';
import { invalidate, patchCached } from './client';
import { fetchCached } from './fetch';
import { Q } from './keys';
import { ownerNow } from './scope';
import { useCached, useOwner, type Cached } from './use';

export interface MyProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  avatar_frame: string | null;
  banner: string | null;
  card_style: string | null;
  text_effect: string | null;
  active_tag: { name?: string; category?: string; [key: string]: unknown } | null;
  tv_order: string | null;
  library_layout: string | null;
}

// Só colunas que o site já lia da própria linha (nenhuma nova no banco).
const MY_PROFILE_COLUMNS = 'id, username, avatar_url, bio, avatar_frame, banner, card_style, text_effect, active_tag, tv_order, library_layout';

async function loadMyProfile(uid: string): Promise<MyProfile | null> {
  const { data, error } = await supabase.from('profiles').select(MY_PROFILE_COLUMNS).eq('id', uid).maybeSingle();
  if (error) throw error;
  return (data as MyProfile | null) ?? null;
}

// O perfil de quem está logado (undefined enquanto não chegou; null se a linha não existe).
export function useMyProfile(): Cached<MyProfile | null> {
  const owner = useOwner();
  return useCached(Q.myProfile(owner), () => loadMyProfile(owner as string));
}

// O mesmo, fora de componente. `uid` tem de ser quem está logado; para
// qualquer outra pessoa a leitura vai direto ao banco, sem guardar.
export function fetchMyProfile(uid: string): Promise<MyProfile | null> {
  return fetchCached(Q.myProfile(uid), () => loadMyProfile(uid));
}

// A tela acabou de gravar uma destas colunas e já sabe o valor novo.
export function patchMyProfile(patch: Partial<MyProfile>): void {
  patchCached<MyProfile | null>(Q.myProfile(ownerNow()), (current) => (current ? { ...current, ...patch } : current));
}

// O perfil pode ter mudado (sem saber o quê): quem mostra lê de novo.
export function refreshMyProfile(): Promise<void> {
  return invalidate(['me', 'profile']);
}

// ---- amigos -----------------------------------------------------------------------
async function loadFriendIds(uid: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  if (error) throw error;
  return ((data ?? []) as { requester_id: string; addressee_id: string }[]).map((f) => (f.requester_id === uid ? f.addressee_id : f.requester_id));
}

// Os ids dos amigos de quem está logado (5 min; 'friendship:changed' refaz).
// Fica só na memória: é dado de outras pessoas, não vai para o aparelho.
export function fetchMyFriendIds(uid: string): Promise<string[]> {
  return fetchCached(Q.myFriendIds(uid), () => loadFriendIds(uid));
}

// ---- premium (2b) -----------------------------------------------------------------
// Hoje quem lê o premium é lib/auth.tsx (2 RPCs por login), e o WatchListDuelModal
// e o OracleDuel leem de novo por conta própria. A linha e a busca já ficam
// prontas; a troca dentro do auth.tsx é da 2b (ele importa de './data/fetch').
export interface MyPremium {
  premium: boolean;
  lifetime: boolean;
}

export async function loadMyPremium(uid: string): Promise<MyPremium> {
  const [premium, lifetime] = await Promise.all([
    supabase.rpc('get_user_premium_status', { user_id_input: uid }),
    supabase.rpc('is_lifetime_premium', { user_id_input: uid }),
  ]);
  if (premium.error) throw premium.error;
  if (lifetime.error) throw lifetime.error;
  return { premium: premium.data === true, lifetime: lifetime.data === true };
}
