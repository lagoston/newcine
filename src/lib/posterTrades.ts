import { supabase } from './supabase';
import { notifyPostersChanged, type PosterEffect, type PosterItem } from './posterJackpot';

// Trocas de pôsteres entre amigos (31/10/2026). "O meu pôster X pelo seu
// pôster Y": quem propõe tem X (e o amigo não), o amigo tem Y (e quem propõe
// não). Tudo é conferido no banco (migração 20261031020000); as propostas e
// as respostas viram sussurros.
//
// 16/11/2026 (pedido do Bruno): até 3 pôsteres de cada lado (3 por 1, 2 por 3...).
// O banco guarda o 1º de cada lado nas colunas de sempre e o 2º e o 3º à parte
// (migração 20261116230000); aqui chegam todos em 'offers' e 'asks'. Um pôster
// oferecido fica reservado: não entra em outra proposta enquanto esta estiver
// aberta (erro 'offer_pending'), para ninguém aceitar e receber "anulada".

export interface TradePoster extends PosterItem {
  effect: PosterEffect;
  // Na mesa da troca: o outro lado já tem esta versão (não pode receber).
  other_has?: boolean;
  // Só nos meus: já está oferecido numa proposta minha que espera resposta.
  reserved?: boolean;
}

// Quantos pôsteres cabem em cada lado de uma troca.
export const TRADE_SLOTS = 3;

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
  // offer: o que quem propôs dá; ask: o que quem propôs pede (o 1º de cada lado)
  offer: TradePoster;
  ask: TradePoster;
  // todos os pôsteres de cada lado, na ordem (16/11/2026)
  offers?: TradePoster[];
  asks?: TradePoster[];
}

const lines = (all: TradePoster[] | undefined, first: TradePoster) => (all && all.length ? all : [first]);

// Do meu ponto de vista: os pôsteres que eu dou e os que eu recebo.
export const tradeSides = (trade: PosterTrade): { give: TradePoster[]; get: TradePoster[] } => {
  const offers = lines(trade.offers, trade.offer);
  const asks = lines(trade.asks, trade.ask);
  return trade.incoming ? { give: asks, get: offers } : { give: offers, get: asks };
};

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
    ['their_daily_trades', 'daily_proposals', 'daily_trades', 'not_friends', 'not_owned', 'they_have', 'not_theirs', 'you_have', 'duplicate', 'too_many', 'jackpot_closed', 'offer_pending', 'bad_slots'].find((code) =>
      message.includes(code)
    ) || 'error'
  );
};

const slots = (posters: TradePoster[]) => posters.map((poster) => ({ item_id: poster.id, effect: poster.effect }));

export async function proposeTrade(friendId: string, give: TradePoster[], get: TradePoster[]): Promise<number> {
  const { data, error } = await supabase.rpc('propose_poster_trade_multi', {
    p_friend: friendId,
    p_offer: slots(give),
    p_ask: slots(get),
  });
  if (error) throw error;
  return Number((data as { id?: number })?.id) || 0;
}

export async function respondTrade(tradeId: number, accept: boolean): Promise<TradeStatus> {
  // 16/11/2026: a v2 move todos os pôsteres da troca de uma vez (a antiga, que o
  // app instalado ainda chama, recusa aceitar trocas de vários pôsteres).
  const { data, error } = await supabase.rpc('respond_poster_trade_v2', { p_trade: tradeId, p_accept: accept });
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

// O aviso de troca feita, no singular ou no plural (16/11/2026).
export const acceptedToast = (trade: PosterTrade) => {
  const count = tradeSides(trade).get.length;
  return count > 1 ? { key: 'trades.acceptedManyToast', count } : { key: 'trades.acceptedToast', count };
};
