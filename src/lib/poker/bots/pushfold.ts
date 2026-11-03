/**
 * Push/fold (effBB ≤ maxBB) e a decisão de pagar um all-in (SPEC §3.2 e §3.5):
 *  - Sapo: paga se pct ≤ 5 (com ≥ 10 BB efetivos) ou se eq(aleatória) ≥ odds + 5 pp;
 *    pão-duro, mas paga com par quando já investiu boa parte do cacife;
 *  - Cobra: paga se pct ≤ 22 × tilt, ou pela equidade contra uma faixa larga (ela acha
 *    que todo mundo blefa);
 *  - Raposo: paga se eq(contra a faixa do agressor) ≥ odds + icm (4 pp com 3 vivos).
 *  - Prêmio: o portador soma allInMarginPP; os caçadores somam −5 pp contra o portador.
 *
 * Calibração A3 (03/11/2026): a faixa de quem empurra passou a depender da profundidade
 * (por BB, "Nash-ish" alargado: quem a gente não conhece e empurra fundo é tratado como
 * largo, porque na mesa de app é quase sempre o jogador solto). O Raposo afina pela
 * frequência de all-in que ele já viu. Decisão clara não tem "segunda opção" para o ε:
 * largar AA diante de all-in não é erro plausível.
 */
import { estimateEquity } from '../equity.ts';
import type { WeightedRange } from '../equity.ts';
import type { BotView } from '../types.ts';
import { preflopPct } from './buckets.ts';
import type { Features } from './features.ts';
import type { BotCtx, EffProfile, Ranked } from './policy.ts';
import { ALLIN, CALL, CHECK, FOLD } from './policy.ts';
import { rangeFor, topWeights, withKnown, ALL_COMBOS } from './ranges.ts';

/** Diferença de equidade (sobre o necessário) a partir da qual pagar/largar é óbvio. */
const CLEAR = 0.07;

type Curve = readonly (readonly [depthBB: number, topPct: number])[];
/** All-in de abertura: Nash-ish até ~10 BB; mais fundo que isso, quem abre all-in é o
 *  jogador que empurra demais (ninguém sensato arrisca 30–40 BB por 1,5 BB), então a
 *  faixa presumida volta a abrir. */
const OPEN_SHOVE: Curve = [[2, 90], [4, 75], [6, 64], [8, 57], [10, 52], [15, 46], [20, 42], [30, 38], [40, 36], [60, 35]];
/** All-in por cima de um aumento: mais fechado quanto mais fundo. */
const RE_SHOVE: Curve = [[2, 80], [4, 62], [6, 50], [8, 42], [10, 36], [15, 27], [20, 21], [30, 15], [40, 12]];

function interp(pts: Curve, x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [d1, p1] = pts[i];
    const [d0, p0] = pts[i - 1];
    if (x <= d1) return p0 + ((p1 - p0) * (x - d0)) / (d1 - d0);
  }
  return pts[pts.length - 1][1];
}

/**
 * Faixa presumida (top %) de quem empurra com `depth` BB, sem saber nada da pessoa.
 * `reShove` = o all-in veio por cima de um aumento (3-bet/4-bet all-in).
 */
export function assumedShovePct(depth: number, reShove = false): number {
  return interp(reShove ? RE_SHOVE : OPEN_SHOVE, depth);
}

/**
 * Teto (top %) para pagar all-in antes do flop, pela profundidade efetiva em BB (A3,
 * 03/11/2026). Com cacife fundo, pagar largo dá a quem empurra ~40% de chance de dobrar
 * de uma vez, e roubar 1,5 BB de um cacife de 50–100 BB não vale quase nada: medido no
 * simulador, pagar só o top ~15% fundo derruba o "empurra tudo" de 14% para ~12,5% de
 * vitórias, e pagar pela equidade em fichas (mais largo) é pior. Curto, o teto some e
 * vale a equidade (Nash-ish).
 */
const SURVIVAL: Curve = [[12, 100], [15, 45], [20, 30], [30, 20], [40, 16]];
function survivalCap(depth: number): number {
  return interp(SURVIVAL, depth);
}
/** Personalidade: a Cobra paga mais leve; o Sapo, pão-duro, mais apertado. */
const CAP_MUL: Partial<Record<string, number>> = { cypher: 1.3, bogart: 0.8 };

/** O all-in do agressor veio por cima de outro aumento nesta rua? */
function isReShove(v: BotView, f: Features): boolean {
  const street = v.actions.filter((a) => a.street === v.street);
  const k = street.map((a) => a.playerId).lastIndexOf(f.aggressorId ?? '');
  return street.slice(0, Math.max(0, k)).some((a) => a.type === 'bet' || a.type === 'raise');
}

/** Profundidade (BB) do all-in do agressor: o menor entre o cacife dele e o meu. */
function shoveDepth(v: BotView, f: Features): number {
  const id = f.aggressorId;
  const p = id ? v.players.find((q) => q.id === id) : undefined;
  const his = p ? p.stack + p.streetBet : v.stack;
  return Math.min(his, v.stack + v.streetBet) / f.bb;
}

/** Faixa (top %) de quem empurrou, vista por este bot. */
function shoverPct(v: BotView, f: Features, P: EffProfile, ctx: BotCtx): number {
  const prior = assumedShovePct(shoveDepth(v, f), isReShove(v, f));
  if (P.id === 'cypher') return Math.min(100, prior * 1.3);   // Cobra: "todo mundo blefa"
  const id = f.aggressorId;
  const c = id ? ctx.model?.counters(id) : undefined;
  if (!c || c.hands <= 0) return prior;
  // Raposo: frequência de all-in antes do flop que ele já viu (com decaimento), com o
  // prior pesando um terço do atraso normal: all-in é fácil de ler.
  const w = ctx.difficulty.adaptDelay / 3;
  const seen = Math.min(100, (120 * c.pfShoves) / c.hands);
  const est = (seen * c.hands + prior * w) / (c.hands + w);
  return Math.max(0.4 * prior, Math.min(100, est));
}

/**
 * Quem disputa o all-in: o agressor e quem já pagou depois dele. Quem ainda vai agir
 * quase sempre larga; contar essas mãos como adversárias subestimaria a equidade.
 */
function involved(v: BotView, f: Features): string[] {
  if (!f.aggressorId) return f.opponents;
  const street = v.actions.filter((a) => a.street === v.street);
  const k = street.map((a) => a.playerId).lastIndexOf(f.aggressorId);
  const callers = street.slice(k + 1).filter((a) => a.type === 'call').map((a) => a.playerId);
  return f.opponents.filter((o) => o === f.aggressorId || callers.includes(o));
}

function equityVs(v: BotView, f: Features, ctx: BotCtx, P: EffProfile, aggrPct: number | null): number {
  const vs = v.street === 'preflop' ? involved(v, f) : f.opponents;
  const opps = Math.max(1, vs.length);
  const base: (WeightedRange | null)[] = vs.map((o) => {
    if (v.street !== 'preflop') return aggrPct === null ? null : rangeFor(o, v, P.rangeModel === 'random' ? 'static' : P.rangeModel);
    if (aggrPct === null) return null;
    // Quem pagou um all-in antes de mim tem mão boa (top 20%).
    const pct = o === f.aggressorId ? aggrPct : 20;
    return { combos: ALL_COMBOS, weights: Array.from(topWeights(pct)) };
  });
  // Pôster Poker: cartas viradas por efeito e o baralho do Cassino.
  const dead = [...v.hole, ...v.board];
  const ranges = base.map((r, k) => withKnown(r, v.shownThisHand[vs[k]], dead));
  const extraCards = v.extraCards;
  try {
    return estimateEquity({ hole: v.hole, board: v.board, opponents: opps, iterations: P.iters.flop, rng: ctx.rng, ranges, extraCards }).equity;
  } catch {
    return estimateEquity({ hole: v.hole, board: v.board, opponents: opps, iterations: P.iters.flop, rng: ctx.rng, extraCards }).equity;
  }
}

/** Parte do cacife que o bot já pôs nesta mão. */
function investedShare(v: BotView): number {
  const me = v.players.find((p) => p.id === v.selfId);
  const put = me ? me.totalBet : v.streetBet;
  return put / Math.max(1, put + v.stack);
}

export function callAllInRanked(v: BotView, f: Features, P: EffProfile, ctx: BotCtx, capped = true): Ranked {
  const odds = v.toCall / (v.pot + v.toCall);
  let extraPP = 0;
  if (ctx.isCarrier) extraPP += P.bounty.carrier.allInMarginPP;
  if (ctx.huntingId && f.aggressorId === ctx.huntingId) extraPP += P.bounty.hunterMarginPP;
  if (f.nDealt === 3) extraPP += P.callAllIn.icm3PP;
  const need = odds + (P.callAllIn.eqMarginPP + extraPP) / 100;
  const pct = preflopPct(v.hole) - P.mods.vpipDelta;
  if (v.street === 'preflop' && involved(v, f).length > 1 && investedShare(v) < 0.25) {
    // Alguém já pagou o all-in: entrar junto dá EV a quem empurrou (ele triplica com
    // ~1/3 de chance). Só com monstro; pão-duro ou não, todo mundo deixa o outro isolar.
    return { ranked: [pct <= 3 ? CALL : FOLD], eq: null };
  }
  if (v.street === 'preflop') {
    if (P.callAllIn.topPct !== null) {
      // Margem extra (prêmio, ICM) estreita ou alarga a faixa fixa: ~4% da faixa por pp.
      const top = P.callAllIn.topPct * P.mods.allInCallMul * Math.max(0.2, 1 - extraPP / 25);
      const deepEnough = P.callAllIn.eqVs === null || f.effBB >= 10;
      if (deepEnough && pct <= top) return { ranked: [CALL], eq: null };
    }
    // Sapo pão-duro, mas paga com par depois de investir (já pôs ≥ 25% do cacife).
    if (P.stinginess > 0 && v.hole[0][0] === v.hole[1][0] && investedShare(v) >= 0.25) return { ranked: [CALL], eq: null };
  }
  let aggrPct: number | null = null;
  if (v.street === 'preflop') {
    if (P.callAllIn.eqVs === 'random') aggrPct = null;
    else aggrPct = shoverPct(v, f, P, ctx) * (P.callAllIn.eqVs === null ? P.mods.allInCallMul : 1);
  } else {
    aggrPct = P.callAllIn.eqVs === 'random' ? null : 0;
  }
  if (v.street === 'preflop' && capped && f.facingAllIn) {
    // Fundo, ninguém arrisca a partida num cara-ou-coroa: teto de faixa pela profundidade.
    const cap = survivalCap(shoveDepth(v, f)) * (CAP_MUL[P.id] ?? 1);
    if (pct > cap * 1.25) return { ranked: [FOLD], eq: null };
    if (pct > cap) return { ranked: [FOLD, CALL], eq: null };
  }
  const eq = equityVs(v, f, ctx, P, aggrPct === null ? null : Math.min(100, aggrPct));
  if (eq >= need + CLEAR) return { ranked: [CALL], eq };
  if (eq >= need) return { ranked: [CALL, FOLD], eq };
  if (eq < need - CLEAR) return { ranked: [FOLD], eq };
  return { ranked: [FOLD, CALL], eq };
}

export function pushFold(v: BotView, f: Features, P: EffProfile, ctx: BotCtx): Ranked {
  if (f.facing === 'opened' || f.facing === 'threeBet' || f.facing === 'fourBetPlus' || f.facingAllIn) {
    const r = callAllInRanked(v, f, P, ctx);
    // Curto, pagar = se comprometer: com a faixa de pagar, empurra de volta.
    if (r.ranked[0] === CALL && !f.facingAllIn && v.legal.allIn && v.legal.allIn.kind !== 'call') return { ranked: [ALLIN, FOLD], eq: r.eq };
    return r;
  }
  const pct = preflopPct(v.hole) - P.mods.vpipDelta;
  const band = f.effBB <= 5 ? 0 : f.effBB <= 8 ? 1 : 2;
  const col = f.pos === 'BB' || f.headsUp ? 'SB' : f.pos;
  const shove = P.pushFold.shove[col][band];
  if (pct <= shove && v.legal.allIn) return { ranked: [ALLIN, v.toCall === 0 ? CHECK : FOLD], eq: null };
  return { ranked: v.toCall === 0 ? [CHECK, ALLIN] : [FOLD, ALLIN], eq: null };
}
