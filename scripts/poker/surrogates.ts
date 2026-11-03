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
import type { ActionRecord, Card, LegalActions, MatchState, PlayerAction, PublicEvent, Rng, WeightedRange } from '../../src/lib/poker/index.ts';
import { ALL_COMBOS, boardInfo, topWeights } from '../../src/lib/poker/bots/ranges.ts';
import { categoryOf, preflopPct } from '../../src/lib/poker/bots/buckets.ts';
import { isScareCard } from '../../src/lib/poker/bots/features.ts';

export type HeroName = 'iniciante' | 'medio' | 'bom' | 'allin' | 'station' | 'maniac';
/**
 * `pub` (opcional) = eventos públicos desta mão até agora, o mesmo que a pessoa vê na
 * mesa (inclui a pista de corpo e o tempo de pensar de cada ação de bot). Só o "bom" usa.
 */
export type Hero = (L: LegalActions, rng: Rng, s: MatchState, pub?: readonly PublicEvent[]) => PlayerAction;

/** Acumula os eventos públicos da mão corrente (zera no handStarted). Para o simulador. */
export function handFeed(): { push(evs: readonly PublicEvent[]): void; events: PublicEvent[] } {
  const out = { events: [] as PublicEvent[], push(evs: readonly PublicEvent[]): void {
    for (const e of evs) {
      if (e.t === 'handStarted') out.events = [];
      out.events.push(e);
    }
  } };
  return out;
}

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

/**
 * Equidade do TAG básico (médio): sabe que quem aumentou antes do flop tem mão melhor
 * que a média (top 35%; quem pagou, top 45%), mas não lê as apostas depois do flop.
 * A3 (03/11/2026): antes era contra mão aleatória, o que fazia o "médio" pagar até o
 * showdown com ás alto contra quem abriu — um passivo-solto, não um TAG.
 */
function eqVsPreflop(sp: Spot, rng: Rng, iters = 250): number {
  const pre = sp.acts.filter((a) => a.street === 'preflop');
  const ranges: (WeightedRange | null)[] = sp.opps.map((o) => {
    const mine = pre.filter((a) => a.playerId === o);
    const pct = mine.some((a) => a.type === 'raise' || a.type === 'bet') ? 35 : mine.some((a) => a.type === 'call') ? 45 : 100;
    return pct >= 100 ? null : { combos: ALL_COMBOS, weights: Array.from(topWeights(pct)) };
  });
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
  const eq = eqVsPreflop(sp, rng);
  const n = Math.max(1, sp.opps.length);
  if (L.toCall === 0) {
    if (eq > 0.62 / Math.sqrt(n)) return betPot(L, 0.6);
    if (sp.street === 'flop' && sp.pfAggressor === 'human' && rng.nextFloat() < 0.6) return betPot(L, 0.5);
    return { type: 'check' };
  }
  if (eq > 0.85) return betPot(L, 1);
  return eq >= sp.odds ? { type: 'call' } : { type: 'fold' };
};

/**
 * O "bom" lê cada oráculo pelo jeito que ele joga (o que um jogador bom aprende em
 * poucas partidas): o Sapo só aposta com mão e paga com qualquer par; a Cobra aposta
 * quase tudo; o Raposo fica no meio. A faixa começa pela ação antes do flop e cada
 * aposta/pagamento corta a parte mais fraca na medida daquele oráculo.
 * A3 (03/11/2026): antes o "bom" usava a mesma faixa estática para todos (cada aposta
 * cortava 40%) e largava 76–85% no river — inclusive contra a Cobra, que blefa muito.
 */
/** Ajustes do "bom" (o simulador pode sobrescrever por BOMX para procurar a melhor resposta). */
const BOM_DEFAULT = {
  open: { CO: 30, BTN: 50, SB: 55 }, sapoSteal: 20, iso: 35, threeBet: 6, cobra3bet: 22, cobra4bet: 20,
  value: 0.5, valueSapo: 0.45, valueSize: 0.8, valueSizeSapo: 0.5, cbet: 0.5, cbetSapo: 0.9, cbetMulti: 0.15, barrel: 0.3,
  raise: 0.78, sapoNoPairBet: 0.8, defendBB: 45, callOpen: 18,
};
let bomCfg: typeof BOM_DEFAULT | null = null;
/** Lido na primeira jogada (o import é içado; BOMX pode ser definido depois). */
function B(): typeof BOM_DEFAULT {
  bomCfg ??= { ...BOM_DEFAULT, ...((globalThis as { BOMX?: object }).BOMX ?? {}) };
  return bomCfg;
}
const BOM_READ: Record<string, { open: number; call: number; limp: number; betCut: number; callCut: number }> = {
  bogart: { open: 8, call: 22, limp: 30, betCut: 0.6, callCut: 0.25 },
  cypher: { open: 50, call: 45, limp: 50, betCut: 0.15, callCut: 0.1 },
  fincher: { open: 32, call: 25, limp: 40, betCut: 0.35, callCut: 0.2 },
};

function bomRange(o: string, sp: Spot): WeightedRange | null {
  const rd = BOM_READ[o] ?? BOM_READ.fincher;
  const pre = sp.acts.filter((a) => a.street === 'preflop');
  const mine = pre.filter((a) => a.playerId === o);
  const raises = mine.filter((a) => a.type === 'raise' || a.type === 'bet').length;
  const k = pre.filter((a) => a.type === 'raise' || a.type === 'bet').length;
  let pct = 100;
  if (raises > 0) pct = k >= 2 && raises === 1 && pre.findIndex((a) => a.playerId === o && (a.type === 'raise' || a.type === 'bet')) > 0 ? rd.open / 3 : rd.open / Math.max(1, raises * 1.5 - 0.5);
  else if (mine.some((a) => a.type === 'call')) pct = k === 0 ? rd.limp : rd.call;
  const w = pct >= 100 ? new Float64Array(ALL_COMBOS.length).fill(1) : topWeights(pct);
  const dead = new Set<string>([...sp.hole, ...sp.board]);
  ALL_COMBOS.forEach((c, i) => { if (dead.has(c[0]) || dead.has(c[1])) w[i] = 0; });
  for (const a of sp.acts) {
    if (a.playerId !== o || a.street === 'preflop' || a.type === 'fold' || a.type === 'check') continue;
    const cut = a.type === 'call' ? rd.callCut : rd.betCut;
    const n = a.street === 'flop' ? 3 : a.street === 'turn' ? 4 : 5;
    const info = boardInfo(sp.board.slice(0, n));
    const live: number[] = [];
    let mass = 0;
    for (let i = 0; i < w.length; i++) if (w[i] > 0 && info.score[i] >= 0) { live.push(i); mass += w[i]; }
    live.sort((x, y) => info.score[x] - info.score[y]);
    let left = cut * mass;
    for (const i of live) { if (left <= 0) break; left -= w[i]; w[i] = 0; }
  }
  let tot = 0;
  for (let i = 0; i < w.length; i++) tot += w[i];
  return tot < 1 ? null : { combos: ALL_COMBOS, weights: Array.from(w) };
}

function bomEq(sp: Spot, rng: Rng, iters = 300): number {
  const ranges = sp.opps.map((o) => bomRange(o, sp));
  try {
    return estimateEquity({ hole: sp.hole, board: sp.board, opponents: Math.max(1, sp.opps.length), iterations: iters, rng, ranges }).equity;
  } catch {
    return eqOf(sp, rng, iters);
  }
}

type ActEv = Extract<PublicEvent, { t: 'action' }>;
/** Última ação pública de `id` nesta mão (com pista e tempo, se for bot). */
function lastAct(pub: readonly PublicEvent[] | undefined, id: string, street?: string): ActEv | null {
  if (!pub) return null;
  for (let i = pub.length - 1; i >= 0; i--) {
    const e = pub[i];
    if (e.t === 'action' && e.playerId === id && (!street || e.street === street)) return e;
  }
  return null;
}

/**
 * Leitura das pistas de corpo (§3.6), como um jogador atento faz: quanto a pista muda
 * a equidade necessária para pagar a aposta de `id` (positivo = largar mais).
 */
function tellNeed(pub: readonly PublicEvent[] | undefined, id: string | null, big: boolean): number {
  if (!id) return 0;
  const a = lastAct(pub, id);
  if (!a || !a.cue || (a.action !== 'bet' && a.action !== 'raise')) return 0;
  if (id === 'bogart') {
    if (big) return a.cue === 'calado' ? 0.3 : a.cue === 'nervoso' ? -0.2 : 0;   // calado = monstro; nervoso = sem monstro
    return a.cue === 'confiante' ? 0.08 : a.cue === 'neutro' ? -0.12 : 0;         // confiante = tem par
  }
  if (id === 'cypher') return a.cue === 'nervoso' ? -0.12 : a.cue === 'confiante' ? 0.08 : 0;   // língua = blefe
  if (id === 'fincher') return a.cue === 'confiante' ? 0.35 : 0;                                // anel de fumaça = nuts
  return 0;
}

/** O Sapo mostrou (pela pista) que não tem par nesta rua? Então aposta nele. */
function sapoNoPair(pub: readonly PublicEvent[] | undefined, street: string): boolean {
  const a = lastAct(pub, 'bogart', street);
  return !!a && (a.action === 'check' || a.action === 'call') && a.cue === 'neutro';
}

const bom: Hero = (L, rng, s, pub) => {
  const sp = spot(L, s);
  const g = s.game;
  const h = g.hand!;
  const pct = preflopPct(sp.hole);
  // Troca de marcha a cada 12 mãos: normal ↔ solta (o Raposo demora ~10 mãos para perceber).
  const loose = Math.floor((sp.handNumber - 1) / 12) % 2 === 1;
  const bb = sp.bb;
  const level = L.toCall + L.streetBet;
  if (sp.street === 'preflop') {
    const pre = sp.acts.filter((a) => a.street === 'preflop');
    const raises = preRaises(sp);
    const limpers = pre.filter((a) => a.type === 'call').length;
    const late = sp.pos === 'BTN' || sp.pos === 'SB';
    const sapo = g.players.find((p) => p.id === 'bogart')!;
    const sapoInBlinds = sapo.status !== 'eliminated' && [h.smallBlindSeat, h.bigBlindSeat].includes(sapo.seat);
    const shover = sp.aggressorId ?? 'cypher';
    const shoveEq = (): number => {
      const top = { cypher: 55, fincher: 40, bogart: 15 }[shover as 'cypher'] ?? 40;
      const w = topWeights(top);
      const ranges = sp.opps.map((o) => (o === shover ? { combos: ALL_COMBOS, weights: Array.from(w) } : null));
      return estimateEquity({ hole: sp.hole, board: [], opponents: Math.max(1, sp.opps.length), iterations: 400, rng, ranges }).equity;
    };
    if (sp.stackBB <= 12 || (L.toCall >= 0.4 * (L.stack + L.toCall))) {
      return tagPreflop(L, sp, 0, { shoveEq, shoveWide: 1.2 });
    }
    if (raises === 0) {
      if (limpers > 0) {
        // Isola quem limpa (o Sapo limpa 80% das mãos que joga).
        if (pct <= B().iso + (loose ? 10 : 0)) return raiseTo(L, (4 + limpers) * bb);
        return L.canCheck ? { type: 'check' } : pct <= 45 ? { type: 'call' } : { type: 'fold' };
      }
      // Rouba o Sapo (ele larga 75–85% do blind) e abre mais em posição tardia; com menos
      // gente na mesa, abre bem mais (no heads-up, quase tudo no botão).
      const alive = g.players.filter((p) => p.status !== 'eliminated').length;
      const base = alive === 2 ? { CO: 85, BTN: 85, SB: 85 } : alive === 3 ? { CO: 45, BTN: 62, SB: 62 } : B().open;
      const open = ({ ...base, BB: 100 }[sp.pos]) + (loose ? 10 : 0) + (sapoInBlinds && late ? B().sapoSteal : 0);
      if (sp.pos === 'BB') return { type: 'check' };
      return pct <= open ? raiseTo(L, 2.5 * bb) : passive(L);
    }
    const opener = pre.find((a) => a.type === 'raise' || a.type === 'bet')?.playerId;
    if (raises === 1) {
      if (pct <= B().threeBet) return raiseTo(L, level * 3);
      // 3-bet leve contra a Cobra (ela larga 55% para 3-bet).
      if (opener === 'cypher' && pct <= B().cobra3bet && rng.nextFloat() < 0.5) return raiseTo(L, level * 3);
      const alive = g.players.filter((p) => p.status !== 'eliminated').length;
      const hu = alive === 2;
      if (hu && pct <= 15) return raiseTo(L, level * 3);   // heads-up: 3-bet de valor bem mais largo
      const defend = (sp.pos === 'BB' ? (opener === 'cypher' ? B().defendBB + 10 : B().defendBB) : opener === 'cypher' ? B().callOpen + 10 : B().callOpen) + (hu ? 25 : alive === 3 ? 10 : 0);
      return pct <= defend ? { type: 'call' } : passive(L);
    }
    const iOpened = pre.find((a) => a.type === 'raise' || a.type === 'bet')?.playerId === 'human';
    if (raises === 2) {
      // 4-bet nos 3-bets da Cobra (ela larga 70% para 4-bet).
      if (iOpened && sp.aggressorId === 'cypher' && pct <= B().cobra4bet) return raiseTo(L, level * 2.3);
      if (pct <= 3) return raiseTo(L, level * 2.3);
      return pct <= (sp.aggressorId === 'cypher' ? 14 : 8) ? { type: 'call' } : passive(L);
    }
    if (pct <= 3) return { type: 'allIn' };
    return pct <= 6 && L.toCall < 0.3 * L.stack ? { type: 'call' } : passive(L);
  }
  const eq = bomEq(sp, rng, 300);
  const n = Math.max(1, sp.opps.length);
  const vsSapo = n === 1 && sp.opps[0] === 'bogart';
  const streetActs = sp.acts.filter((a) => a.street === sp.street);
  const iBetFlop = sp.acts.some((a) => a.street === 'flop' && a.playerId === 'human' && (a.type === 'bet' || a.type === 'raise'));
  if (L.toCall === 0) {
    // Valor fino contra o Sapo (ele paga com qualquer par).
    if (eq > (vsSapo ? B().valueSapo : B().value) / Math.sqrt(n)) return betPot(L, vsSapo ? B().valueSizeSapo : B().valueSize);
    // O Sapo passou sem par (pista neutra): ele larga quase tudo para uma aposta.
    if (vsSapo && sapoNoPair(pub, sp.street) && rng.nextFloat() < B().sapoNoPairBet) return betPot(L, 0.5);
    if (sp.street === 'flop' && sp.pfAggressor === 'human' && rng.nextFloat() < (n === 1 ? (vsSapo ? B().cbetSapo : B().cbet) : B().cbetMulti)) return betPot(L, 0.45);
    // Segunda barrel, só com equidade razoável.
    if (sp.street === 'turn' && iBetFlop && n === 1 && eq > 0.35 && rng.nextFloat() < B().barrel) return betPot(L, 0.6);
    return { type: 'check' };
  }
  const checkedFirst = streetActs.some((a) => a.playerId === 'human' && a.type === 'check');
  // Check-raise no turn do Raposo.
  if (sp.street === 'turn' && sp.aggressorId === 'fincher' && checkedFirst && eq > 0.5) return betPot(L, 1);
  let need = sp.odds + tellNeed(pub, sp.aggressorId, L.toCall >= 0.7 * L.pot);
  if (sp.aggressorId === 'bogart' && L.toCall >= 0.7 * L.pot) need += 0.15;                       // Sapo grande = monstro
  if (sp.aggressorId === 'cypher' && sp.street === 'river' && isScareCard(sp.board)) need -= 0.08;  // Cobra na carta de susto
  if (eq > B().raise) return betPot(L, 1);
  return eq >= need ? { type: 'call' } : { type: 'fold' };
};

const allin: Hero = (L) => (L.allIn ? { type: 'allIn' } : callOr(L));
const station: Hero = (L) => callOr(L);
const maniac: Hero = (L, rng) => (rng.nextFloat() < 0.7 && (L.bet || L.raise) ? betPot(L, 0.75) : callOr(L));

/** Trava de legalidade: o substituto nunca manda uma ação que o motor recusaria. */
function legal(h: Hero): Hero {
  return (L, rng, s, pub) => {
    const a = h(L, rng, s, pub);
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

