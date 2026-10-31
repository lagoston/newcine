import { supabase } from './supabase';
import { notifyPostersChanged, type PosterEffect, type PosterItem } from './posterJackpot';

// Trocas de pôsteres entre amigos (31/10/2026). "O meu pôster X pelo seu
// pôster Y": quem propõe tem X (e o amigo não), o amigo tem Y (e quem propõe
// não). Tudo é conferido no banco (migração 20261031020000); as propostas e
// as respostas viram sussurros.

export interface TradePoster extends PosterItem {
  effect: PosterEffect;
  // Na mesa da troca: o outro lado já tem esta versão (não pode receber).
  other_has?: boolean;
}

export interface TradeFriend {
  id: string;
  username: string;
  avatar_url: string | null;
  posters: number;
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'void';

export interface PosterTrade {
  id: number;
  status: TradeStatus;
  // true: o amigo propôs para mim
  incoming: boolean;
  created_at: string;
  responded_at: string | null;
  friend: { id: string; username: string; avatar_url: string | null };
  // offer: o que quem propôs dá; ask: o que quem propôs pede
  offer: TradePoster;
  ask: TradePoster;
}

// Do meu ponto de vista: o que eu dou e o que eu recebo.
export const tradeSides = (trade: PosterTrade) =>
  trade.incoming ? { give: trade.ask, get: trade.offer } : { give: trade.offer, get: trade.ask };

export async function getTradeFriends(): Promise<TradeFriend[]> {
  const { data, error } = await supabase.rpc('get_trade_friends');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as TradeFriend[];
}

export async function getTradeBoard(friendId: string): Promise<{ mine: TradePoster[]; theirs: TradePoster[] }> {
  const { data, error } = await supabase.rpc('get_trade_board', { p_friend: friendId });
  if (error) throw error;
  const raw = (data || {}) as { mine?: TradePoster[]; theirs?: TradePoster[] };
  return { mine: raw.mine || [], theirs: raw.theirs || [] };
}

// Limite diário (31/10/2026): até 3 trocas feitas e 3 propostas enviadas
// por dia (dia de Brasília).
export interface TradeLimits {
  limit: number;
  tradesToday: number;
  proposalsToday: number;
}

export async function getTradeLimits(): Promise<TradeLimits> {
  const { data, error } = await supabase.rpc('get_trade_limits');
  if (error) throw error;
  const raw = (data || {}) as { limit?: number; trades_today?: number; proposals_today?: number };
  return { limit: Number(raw.limit) || 3, tradesToday: Number(raw.trades_today) || 0, proposalsToday: Number(raw.proposals_today) || 0 };
}

export async function getMyTrades(ids?: number[]): Promise<PosterTrade[]> {
  const { data, error } = await supabase.rpc('get_my_poster_trades', ids ? { p_ids: ids } : {});
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as PosterTrade[];
}

export const tradeErrorCode = (error: unknown): string => {
  const message = (error as { message?: string })?.message || '';
  return (
    ['their_daily_trades', 'daily_proposals', 'daily_trades', 'not_friends', 'not_owned', 'they_have', 'not_theirs', 'you_have', 'duplicate', 'too_many', 'jackpot_closed'].find((code) =>
      message.includes(code)
    ) || 'error'
  );
};

export async function proposeTrade(friendId: string, give: TradePoster, get: TradePoster): Promise<number> {
  const { data, error } = await supabase.rpc('propose_poster_trade', {
    p_friend: friendId,
    p_offer_item: give.id,
    p_offer_effect: give.effect,
    p_ask_item: get.id,
    p_ask_effect: get.effect,
  });
  if (error) throw error;
  return Number((data as { id?: number })?.id) || 0;
}

export async function respondTrade(tradeId: number, accept: boolean): Promise<TradeStatus> {
  const { data, error } = await supabase.rpc('respond_poster_trade', { p_trade: tradeId, p_accept: accept });
  if (error) throw error;
  const status = (data as { status?: TradeStatus })?.status || 'void';
  if (status === 'accepted') notifyPostersChanged();
  return status;
}

export async function cancelTrade(tradeId: number): Promise<TradeStatus> {
  const { data, error } = await supabase.rpc('cancel_poster_trade', { p_trade: tradeId });
  if (error) throw error;
  return (data as { status?: TradeStatus })?.status || 'cancelled';
}
