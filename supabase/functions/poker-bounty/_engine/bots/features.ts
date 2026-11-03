// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/bots/features.ts
/**
 * Leitura da situação a partir do BotView (SPEC §3.5, "Features"): posição, effBB, SPR,
 * quem está na mão, o que o bot enfrenta antes do flop, textura e carta de susto.
 */
import type { Card } from '../cards.ts';
import { rankOf, suitOf } from '../cards.ts';
import type { ActionRecord } from '../engine.ts';
import type { BotView, PlayerId } from '../types.ts';

export type Pos = 'CO' | 'BTN' | 'SB' | 'BB';
export type Facing = 'unopened' | 'limped' | 'opened' | 'threeBet' | 'fourBetPlus';

export interface Features {
  pos: Pos;
  headsUp: boolean;
  nDealt: number;
  nInHand: number;
  bb: number;
  effBB: number;
  spr: number;
  facing: Facing;
  limpers: number;
  callersAfterRaise: number;
  openerId: PlayerId | null;
  openerPos: Pos | null;
  openerStealPos: boolean;
  /** O bot deu o primeiro aumento antes do flop (a faixa dele é a de abertura). */
  iOpened: boolean;
  preflopAggressorId: PlayerId | null;
  facingAllIn: boolean;
  /** Último a apostar/aumentar nesta rua. */
  aggressorId: PlayerId | null;
  inPosition: boolean;
  wasAggressor: boolean;
  wet: boolean;
  scareCard: boolean;
  checkedThroughTurn: boolean;
  facingRaise: boolean;
  canCheckRaise: boolean;
  /** Oponentes ainda na mão (com cartas). */
  opponents: PlayerId[];
}

const isAggr = (a: ActionRecord): boolean => a.type === 'bet' || a.type === 'raise';

function seatDist(seat: number, btn: number): number {
  const d = (seat - btn + 9) % 9;
  return d === 0 ? 9 : d;
}

export function positionOf(v: BotView, id: PlayerId): Pos {
  if (id === v.bbId) return 'BB';
  if (id === v.sbId) return v.sbId === v.buttonId ? 'BTN' : 'SB';
  if (id === v.buttonId) return 'BTN';
  return 'CO';
}

function lastAggr(acts: ActionRecord[]): ActionRecord | null {
  for (let i = acts.length - 1; i >= 0; i--) if (isAggr(acts[i])) return acts[i];
  return null;
}

export function isWet(board: readonly Card[]): boolean {
  const flop = board.slice(0, 3);
  if (flop.length < 3) return false;
  const suits: Record<string, number> = {};
  for (const c of flop) suits[suitOf(c)] = (suits[suitOf(c)] ?? 0) + 1;
  if (Object.values(suits).some((n) => n >= 2)) return true;
  const r = flop.map(rankOf).sort((a, b) => a - b);
  return r[2] - r[0] <= 4 && new Set(r).size === 3;
}

export function isScareCard(board: readonly Card[]): boolean {
  if (board.length !== 5) return false;
  const river = board[4];
  const suits: Record<string, number> = {};
  for (const c of board) suits[suitOf(c)] = (suits[suitOf(c)] ?? 0) + 1;
  if (suits[suitOf(river)] === 4) return true;
  const ranks = new Set(board.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0;
    for (let r = lo; r < lo + 5; r++) if (ranks.has(r)) n++;
    if (n >= 4 && rankOf(river) >= lo && rankOf(river) < lo + 5) return true;
  }
  const rr = rankOf(river);
  return rr >= 13 && board.slice(0, 3).every((c) => rankOf(c) < rr);
}

export function features(v: BotView): Features {
  const bb = v.blinds.bigBlind;
  const dealt = v.players.filter((p) => p.status !== 'eliminated');
  const inHand = v.players.filter((p) => p.hasCards);
  const me = v.players.find((p) => p.id === v.selfId)!;
  const opponents = inHand.filter((p) => p.id !== v.selfId).map((p) => p.id);
  const pos = positionOf(v, v.selfId);
  const headsUp = dealt.length === 2;

  const pre = v.actions.filter((a) => a.street === 'preflop');
  let raises = 0;
  let limpers = 0;
  let callersAfterRaise = 0;
  let openerId: PlayerId | null = null;
  for (const a of pre) {
    if (isAggr(a)) {
      raises++;
      if (raises === 1) openerId = a.playerId;
      callersAfterRaise = 0;
    } else if (a.type === 'call') {
      if (raises === 0) limpers++;
      else callersAfterRaise++;
    }
  }
  const facing = raises === 0 ? (limpers === 0 ? 'unopened' : 'limped') : raises === 1 ? 'opened' : raises === 2 ? 'threeBet' : 'fourBetPlus';
  const openerPos = openerId ? positionOf(v, openerId) : null;
  const pfAggr = lastAggr(pre);

  const street = v.actions.filter((a) => a.street === v.street);
  const aggr = lastAggr(street);
  const facingAllIn = v.toCall > 0 && ((aggr?.allIn ?? false) || v.toCall >= v.stack);

  const myTotal = v.stack + v.streetBet;
  const maxOpp = Math.max(0, ...inHand.filter((p) => p.id !== v.selfId).map((p) => p.stack + p.streetBet));
  const effBB = Math.min(myTotal, maxOpp) / bb;

  const btnSeat = v.players.find((p) => p.id === v.buttonId)!.seat;
  const canAct = inHand.filter((p) => p.status === 'active');
  const myDist = seatDist(me.seat, btnSeat);
  const inPosition = canAct.every((p) => p.id === v.selfId || seatDist(p.seat, btnSeat) < myDist);

  let wasAggressor = false;
  const flopAggr = lastAggr(v.actions.filter((a) => a.street === 'flop'));
  const turnAggr = lastAggr(v.actions.filter((a) => a.street === 'turn'));
  if (v.street === 'flop') wasAggressor = pfAggr?.playerId === v.selfId;
  else if (v.street === 'turn') wasAggressor = flopAggr?.playerId === v.selfId;
  else if (v.street === 'river') wasAggressor = flopAggr?.playerId === v.selfId && turnAggr?.playerId === v.selfId;
  const turnActs = v.actions.filter((a) => a.street === 'turn');

  return {
    pos,
    headsUp,
    nDealt: dealt.length,
    nInHand: inHand.length,
    bb,
    effBB,
    spr: v.pot > 0 ? v.stack / v.pot : 99,
    facing,
    limpers,
    callersAfterRaise,
    openerId,
    openerPos,
    openerStealPos: openerPos === 'BTN' || openerPos === 'SB',
    iOpened: openerId === v.selfId,
    preflopAggressorId: pfAggr?.playerId ?? null,
    facingAllIn,
    aggressorId: aggr?.playerId ?? null,
    inPosition,
    wasAggressor,
    wet: isWet(v.board),
    scareCard: isScareCard(v.board),
    checkedThroughTurn: turnActs.length > 0 && !turnActs.some(isAggr),
    facingRaise: aggr?.type === 'raise' && street.filter(isAggr).length >= 2,
    canCheckRaise: v.toCall > 0 && street.some((a) => a.playerId === v.selfId && a.type === 'check'),
    opponents,
  };
}
