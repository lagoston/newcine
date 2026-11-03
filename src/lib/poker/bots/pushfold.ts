/**
 * Push/fold (effBB ≤ maxBB) e a decisão de pagar um all-in (SPEC §3.2 e §3.5):
 *  - Sapo: paga se pct ≤ 5 (com ≥ 10 BB efetivos) ou se eq(aleatória) ≥ odds + 5 pp;
 *  - Cobra: paga se pct ≤ 22 × tilt;
 *  - Raposo: paga se eq(contra a faixa do agressor) ≥ odds + icm (4 pp com 3 vivos).
 *  - Prêmio: o portador soma allInMarginPP; os caçadores somam −5 pp contra o portador.
 */
import { estimateEquity } from '../equity.ts';
import type { WeightedRange } from '../equity.ts';
import type { BotView } from '../types.ts';
import { preflopPct } from './buckets.ts';
import type { Features } from './features.ts';
import type { BotCtx, EffProfile, Ranked } from './policy.ts';
import { ALLIN, CALL, CHECK, FOLD } from './policy.ts';
import { rangeFor, topWeights, ALL_COMBOS } from './ranges.ts';

/** Faixa de quem empurrou antes do flop: mais larga quanto mais curto ele estava. */
function shoverRange(v: BotView, f: Features, ctx: BotCtx): WeightedRange | null {
  const id = f.aggressorId;
  if (!id) return null;
  const p = v.players.find((q) => q.id === id);
  const bb = f.bb;
  const depth = p ? (p.stack + p.streetBet) / bb : 20;
  let pct = depth <= 10 ? 40 : depth <= 20 ? 22 : 12;
  const c = ctx.model?.counters(id);
  if (c && c.hands > 0 && c.pfShoves / c.hands > 0.2) pct *= 1.5;   // quem empurra demais abre a faixa de call
  const w = topWeights(Math.min(100, pct));
  return { combos: ALL_COMBOS, weights: Array.from(w) };
}

function equityVs(v: BotView, f: Features, ctx: BotCtx, P: EffProfile, vsAggressor: boolean): number {
  const opps = Math.max(1, f.opponents.length);
  const ranges: (WeightedRange | null)[] = f.opponents.map((o) => {
    if (!vsAggressor || o !== f.aggressorId) return null;
    return v.street === 'preflop' ? shoverRange(v, f, ctx) : rangeFor(o, v, P.rangeModel === 'random' ? 'static' : P.rangeModel);
  });
  try {
    return estimateEquity({ hole: v.hole, board: v.board, opponents: opps, iterations: P.iters.flop, rng: ctx.rng, ranges }).equity;
  } catch {
    return estimateEquity({ hole: v.hole, board: v.board, opponents: opps, iterations: P.iters.flop, rng: ctx.rng }).equity;
  }
}

export function callAllInRanked(v: BotView, f: Features, P: EffProfile, ctx: BotCtx): Ranked {
  const odds = v.toCall / (v.pot + v.toCall);
  let marginPP = P.callAllIn.eqMarginPP;
  let extraPP = 0;
  if (ctx.isCarrier) extraPP += P.bounty.carrier.allInMarginPP;
  if (ctx.huntingId && f.aggressorId === ctx.huntingId) extraPP += P.bounty.hunterMarginPP;
  if (f.nDealt === 3) extraPP += P.callAllIn.icm3PP;
  marginPP += extraPP;
  let call = false;
  let eq: number | null = null;
  if (P.callAllIn.topPct !== null && v.street === 'preflop') {
    // Margem extra (prêmio, ICM) estreita ou alarga a faixa: ~4% da faixa por pp.
    const top = P.callAllIn.topPct * P.mods.allInCallMul * Math.max(0.2, 1 - extraPP / 25);
    const deepEnough = P.callAllIn.eqVs === null || f.effBB >= 10;
    if (deepEnough && preflopPct(v.hole) - P.mods.vpipDelta <= top) call = true;
  }
  if (!call && (P.callAllIn.eqVs !== null || v.street !== 'preflop')) {
    eq = equityVs(v, f, ctx, P, P.callAllIn.eqVs === 'aggressorRange');
    if (eq >= odds + marginPP / 100) call = true;
  }
  return { ranked: call ? [CALL, FOLD] : [FOLD, CALL], eq };
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
