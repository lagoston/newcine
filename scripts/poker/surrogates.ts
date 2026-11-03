/**
 * Jogadores substitutos para o simulador (SPEC §3.8). Jogam no lugar da pessoa, com as
 * cartas dela e o que está na mesa (nada dos bots além do que é público).
 *  - iniciante: VPIP ~55%, paga qualquer par, quase não aumenta, larga aposta grande no river ao acaso;
 *  - medio: TAG básico, abre o top 25%, c-bet 60%, paga pelas odds, sem blefe no river;
 *  - bom: rouba o Sapo, valor fino contra ele, paga a Cobra na carta de susto, 4-bet nos
 *    3-bets dela, check-raise no turn do Raposo e troca de marcha a cada 12 mãos;
 *  - allin (empurra tudo), station (paga tudo), maniac (aumenta 70%).
 */
import { estimateEquity } from '../../src/lib/poker/index.ts';
import type { ActionRecord, BotView, Card, LegalActions, MatchState, PlayerAction, Rng, WeightedRange } from '../../src/lib/poker/index.ts';
import { ALL_COMBOS, rangeFor, topWeights } from '../../src/lib/poker/bots/ranges.ts';
import { categoryOf, handInfo, preflopPct } from '../../src/lib/poker/bots/buckets.ts';
import { isScareCard } from '../../src/lib/poker/bots/features.ts';

export type HeroName = 'iniciante' | 'medio' | 'bom' | 'allin' | 'station' | 'maniac';
export type Hero = (L: LegalActions, rng: Rng, s: MatchState) => PlayerAction;

interface Spot {
  hole: Card[];
  board: Card[];
  street: 'preflop' | 'flop' | 'turn' | 'river';
  bb: number;
  pot: number;
  toCall: number;
  odds: number;
  opps: string[];
  acts: ActionRecord[];
  stackBB: number;
  pos: 'BTN' | 'SB' | 'BB' | 'CO';
  aggressorId: string | null;
  pfAggressor: string | null;
  handNumber: number;
}

function spot(L: LegalActions, s: MatchState): Spot {
  const g = s.game;
  const h = g.hand!;
  const me = g.players.find((p) => p.id === 'human')!;
  const inHand = g.players.filter((p) => p.status === 'active' || p.status === 'allIn');
  const seatOf = (seat: number): string => g.players.find((p) => p.seat === seat)!.id;
  const btn = seatOf(h.buttonSeat);
  const sb = seatOf(h.smallBlindSeat);
  const bbId = seatOf(h.bigBlindSeat);
  const pos = bbId === 'human' ? 'BB' : sb === 'human' ? (sb === btn ? 'BTN' : 'SB') : btn === 'human' ? 'BTN' : 'CO';
  const street = h.actions.filter((a) => a.street === h.street);
  const aggr = [...street].reverse().find((a) => a.type === 'bet' || a.type === 'raise');
  const pf = [...h.actions.filter((a) => a.street === 'preflop')].reverse().find((a) => a.type === 'bet' || a.type === 'raise');
  return {
    hole: me.holeCards, board: h.board, street: h.street, bb: h.blinds.bigBlind, pot: L.pot, toCall: L.toCall,
    odds: L.toCall / (L.pot + L.toCall), opps: inHand.filter((p) => p.id !== 'human').map((p) => p.id), acts: h.actions,
    stackBB: (me.stack + me.streetBet) / h.blinds.bigBlind, pos, aggressorId: aggr?.playerId ?? null,
    pfAggressor: pf?.playerId ?? null, handNumber: g.handNumber,
  };
}

function eqOf(sp: Spot, rng: Rng, iters = 250): number {
  return estimateEquity({ hole: sp.hole, board: sp.board, opponents: Math.max(1, sp.opps.length), iterations: iters, rng }).equity;
}

/** Equidade contra a faixa que cada oponente mostrou com as ações (o que um jogador bom lê). */
function eqVsRanges(sp: Spot, rng: Rng, iters = 300): number {
  const v = { actions: sp.acts, hole: sp.hole, board: sp.board, street: sp.street } as unknown as BotView;
  const ranges: (WeightedRange | null)[] = sp.opps.map((o) => rangeFor(o, v, 'static'));
  try {
    return estimateEquity({ hole: sp.hole, board: sp.board, opponents: Math.max(1, sp.opps.length), iterations: iters, rng, ranges }).equity;
  } catch {
    return eqOf(sp, rng, iters);
  }
}

function raiseTo(L: LegalActions, to: number): PlayerAction {
  const r = L.bet ?? L.raise;
  if (!r) return L.allIn && L.allIn.kind !== 'call' ? { type: 'allIn' } : L.canCheck ? { type: 'check' } : { type: 'call' };
  const amt = Math.min(r.max, Math.max(r.min, Math.round(to / 5) * 5));
  if (L.allIn && amt >= L.allIn.to) return { type: 'allIn' };
  return { type: L.bet ? 'bet' : 'raise', amount: amt };
}
const betPot = (L: LegalActions, frac: number): PlayerAction => raiseTo(L, L.streetBet + L.toCall + frac * (L.pot + L.toCall));
const passive = (L: LegalActions): PlayerAction => (L.canCheck ? { type: 'check' } : { type: 'fold' });
const callOr = (L: LegalActions): PlayerAction => (L.canCheck ? { type: 'check' } : { type: 'call' });

function preRaises(sp: Spot): number {
  return sp.acts.filter((a) => a.street === 'preflop' && (a.type === 'bet' || a.type === 'raise')).length;
}

const iniciante: Hero = (L, rng, s) => {
  const sp = spot(L, s);
  const pct = preflopPct(sp.hole);
  if (sp.street === 'preflop') {
    if (pct <= 3 && rng.nextFloat() < 0.5) return betPot(L, 0.8);
    if (pct <= 55 || L.toCall === 0) return L.toCall > 6 * sp.bb && pct > 20 ? passive(L) : callOr(L);
    return passive(L);
  }
  const pair = categoryOf([...sp.hole, ...sp.board]) >= 1;
  if (L.toCall === 0) return pair && rng.nextFloat() < 0.2 ? betPot(L, 0.5) : { type: 'check' };
  if (sp.street === 'river' && L.toCall >= 0.75 * L.pot && rng.nextFloat() < 0.5) return { type: 'fold' };
  if (pair) return { type: 'call' };
  return sp.odds < 0.25 && rng.nextFloat() < 0.5 ? { type: 'call' } : { type: 'fold' };
};

interface TagOpts {
  fourBetVsCobra?: boolean; defendBB?: number; callOpen?: number; threeBet?: number;
  /** Equidade para pagar all-in (médio: contra mãos aleatórias; bom: contra a faixa de quem empurrou). */
  shoveEq?: () => number; shoveMargin?: number;
  /** Multiplica as faixas de empurrar com cacife curto. */
  shoveWide?: number;
}

function tagPreflop(L: LegalActions, sp: Spot, openPct: number, opts: TagOpts = {}): PlayerAction {
  const pct = preflopPct(sp.hole);
  const raises = preRaises(sp);
  if (sp.stackBB <= 12) {
    const wide = opts.shoveWide ?? 1;
    if (raises === 0 && L.toCall <= sp.bb) return pct <= ({ CO: 30, BTN: 45, SB: 55, BB: 40 }[sp.pos]) * wide ? { type: 'allIn' } : passive(L);
    // Diante de aumento curto: paga (ou empurra) se a equidade cobre o preço.
    const eq = opts.shoveEq ? opts.shoveEq() : 0;
    if (eq >= sp.odds + (opts.shoveMargin ?? 0)) return L.allIn && L.allIn.kind !== 'call' && L.toCall < L.stack ? { type: 'allIn' } : { type: 'call' };
    return passive(L);
  }
  if (L.toCall >= 0.4 * (L.stack + L.toCall) && opts.shoveEq) {
    // Diante de all-in fundo: mesma regra de preço.
    return opts.shoveEq() >= sp.odds + (opts.shoveMargin ?? 0) ? { type: 'call' } : passive(L);
  }
  if (raises === 0) {
    if (pct <= openPct) return raiseTo(L, 2.5 * sp.bb);
    return passive(L);
  }
  const level = L.toCall + L.streetBet;
  if (raises === 1) {
    if (pct <= (opts.threeBet ?? 4)) return raiseTo(L, level * 3);
    const defend = sp.pos === 'BB' ? (opts.defendBB ?? 30) : (opts.callOpen ?? 12);
    return pct <= defend ? { type: 'call' } : passive(L);
  }
  if (opts.fourBetVsCobra && sp.aggressorId === 'cypher' && pct <= 8) return raiseTo(L, level * 2.3);
  if (pct <= 2.5) return { type: 'allIn' };
  return pct <= 5 ? { type: 'call' } : passive(L);
}

const medio: Hero = (L, rng, s) => {
  const sp = spot(L, s);
  if (sp.street === 'preflop') return tagPreflop(L, sp, 25, { defendBB: 40, callOpen: 15, threeBet: 5, shoveEq: () => eqOf(sp, rng, 300), shoveMargin: 0.05 });
  const eq = eqOf(sp, rng);
  const n = Math.max(1, sp.opps.length);
  if (L.toCall === 0) {
    if (eq > 0.62 / Math.sqrt(n)) return betPot(L, 0.6);
    if (sp.street === 'flop' && sp.pfAggressor === 'human' && rng.nextFloat() < 0.6) return betPot(L, 0.5);
    return { type: 'check' };
  }
  if (eq > 0.85) return betPot(L, 1);
  return eq >= sp.odds ? { type: 'call' } : { type: 'fold' };
};

const bom: Hero = (L, rng, s) => {
  const sp = spot(L, s);
  const g = s.game;
  // Troca de marcha a cada 12 mãos: normal ↔ solta (o Raposo demora ~10 mãos para perceber).
  const loose = Math.floor((sp.handNumber - 1) / 12) % 2 === 1;
  if (sp.street === 'preflop') {
    const late = sp.pos === 'BTN' || sp.pos === 'SB';
    const sapoInBlinds = [g.hand!.smallBlindSeat, g.hand!.bigBlindSeat].includes(g.players.find((p) => p.id === 'bogart')!.seat);
    // Rouba o Sapo (ele larga 75–80% do blind) e abre mais em posição tardia.
    const open = (late ? 40 : 28) + (loose ? 10 : 0) + (sapoInBlinds && late ? 15 : 0);
    const shover = sp.aggressorId ?? 'cypher';
    const shoveEq = (): number => {
      const top = { cypher: 55, fincher: 40, bogart: 12 }[shover as 'cypher'] ?? 40;
      const w = topWeights(top);
      const ranges = sp.opps.map((o) => (o === shover ? { combos: ALL_COMBOS, weights: Array.from(w) } : null));
      return estimateEquity({ hole: sp.hole, board: [], opponents: Math.max(1, sp.opps.length), iterations: 400, rng, ranges }).equity;
    };
    return tagPreflop(L, sp, open, { fourBetVsCobra: true, defendBB: 45, callOpen: 18, threeBet: 6, shoveEq, shoveWide: 1.2 });
  }
  const eq = eqVsRanges(sp, rng, 300);
  const n = Math.max(1, sp.opps.length);
  const vsSapo = sp.opps.length === 1 && sp.opps[0] === 'bogart';
  if (L.toCall === 0) {
    // Valor fino contra o Sapo (ele paga com qualquer par); c-bet como agressor.
    if (eq > (vsSapo ? 0.5 : 0.55) / Math.sqrt(n)) return betPot(L, vsSapo ? 0.5 : 0.66);
    if (sp.street === 'flop' && sp.pfAggressor === 'human' && rng.nextFloat() < (n === 1 ? 0.65 : 0.3)) return betPot(L, 0.45);
    return { type: 'check' };
  }
  const checkedFirst = sp.acts.some((a) => a.street === sp.street && a.playerId === 'human' && a.type === 'check');
  // Check-raise no turn do Raposo.
  if (sp.street === 'turn' && sp.aggressorId === 'fincher' && checkedFirst && eq > 0.5) return betPot(L, 1);
  let need = sp.odds;
  if (sp.aggressorId === 'bogart' && L.toCall >= 0.7 * L.pot) need += 0.15;                       // Sapo grande = monstro
  if (sp.aggressorId === 'cypher' && sp.street === 'river' && isScareCard(sp.board)) need -= 0.08;  // Cobra na carta de susto
  if (eq > 0.8) return betPot(L, 1);
  return eq >= need ? { type: 'call' } : { type: 'fold' };
};

const allin: Hero = (L) => (L.allIn ? { type: 'allIn' } : callOr(L));
const station: Hero = (L) => callOr(L);
const maniac: Hero = (L, rng) => (rng.nextFloat() < 0.7 && (L.bet || L.raise) ? betPot(L, 0.75) : callOr(L));

/** Trava de legalidade: o substituto nunca manda uma ação que o motor recusaria. */
function legal(h: Hero): Hero {
  return (L, rng, s) => {
    const a = h(L, rng, s);
    if (a.type === 'allIn' && !L.allIn) return callOr(L);
    if (a.type === 'check' && !L.canCheck) return { type: 'fold' };
    if (a.type === 'bet' || a.type === 'raise') {
      const r = L.bet ?? L.raise;
      if (L.allIn && a.amount === L.allIn.to) return a;
      if (!r) return L.allIn && L.allIn.kind !== 'call' ? { type: 'allIn' } : callOr(L);
      return { type: L.bet ? 'bet' : 'raise', amount: Math.min(r.max, Math.max(r.min, a.amount)) };
    }
    return a;
  };
}

export const HEROES: Record<HeroName, Hero> = {
  iniciante: legal(iniciante), medio: legal(medio), bom: legal(bom), allin: legal(allin), station: legal(station), maniac: legal(maniac),
};

