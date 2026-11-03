// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/bots/postflop.ts
/**
 * Depois do flop (SPEC §3.5, `postflop`, `betOrCheck`, `facingBet`): equidade contra as
 * faixas dos oponentes, ruído e posição, e as frequências e tamanhos do perfil.
 */
import type { PlayerAction } from '../engine.ts';
import { estimateEquity } from '../equity.ts';
import type { WeightedRange } from '../equity.ts';
import type { BotView, HandBucket } from '../types.ts';
import type { Features } from './features.ts';
import type { BotCtx, EffProfile, Ranked } from './policy.ts';
import { CALL, CHECK, FOLD, betFrac, clamp01, gauss4, raiseTo } from './policy.ts';
import { rangeFor } from './ranges.ts';

function hasLabel(ctx: BotCtx, f: Features, label: 'pagaTudo' | 'blefador' | 'solto'): boolean {
  return !!ctx.model && f.opponents.some((o) => ctx.model!.has(o, label));
}

function cbetSize(P: EffProfile, f: Features, v: BotView, ctx: BotCtx): number {
  if (v.street === 'flop') {
    // Raposo contra quem larga muito para c-bet: ⅓ do pote.
    if (ctx.model && f.opponents.length === 1) {
      const c = ctx.model.counters(f.opponents[0]);
      if (c && c.raw.cbetFaced >= 6 && ctx.model.rates(f.opponents[0]).foldToCbet > 0.6) return P.sizings.flopDry;
    }
    return f.wet ? P.sizings.flopWet : P.sizings.flopDry;
  }
  if (v.street === 'turn') return P.sizings.turn;
  return P.sizings.riverThin;
}

function valueSize(P: EffProfile, f: Features, v: BotView, ctx: BotCtx, b: HandBucket, monster: boolean): number {
  if (P.sizings.monster !== null && monster) return P.sizings.monster;   // Sapo: grande só com monstro
  if (v.street === 'river') return b === 'nuts' ? P.sizings.riverPolar : P.sizings.riverThin;
  return cbetSize(P, f, v, ctx);
}

/**
 * Raposo: quanto vale blefar contra quem está na mão, pela taxa de largar para c-bet
 * que ele já viu (leitura rápida; A3, 03/11/2026). 1 = normal; 0 = não larga nunca
 * (maniac, quem paga tudo): blefe nenhum. Não sobe contra quem larga demais: blefar
 * mais o iniciante, que larga sem par, deixava a mesa dura demais para ele.
 * Sem modelo (Cobra, Sapo, ou o Raposo com o modelo desligado no simulador), 1.
 */
function bluffScale(ctx: BotCtx, f: Features): number {
  if (!ctx.model || f.opponents.length === 0) return 1;
  let k = 1;
  for (const o of f.opponents) {
    const fold = ctx.model.quick(o).foldToCbet;
    k = Math.min(k, Math.max(0, (fold - 0.2) / 0.25));
  }
  return k;
}

/** c-bet, segunda barrel ou river depois de duas, com os ajustes do modelo do Raposo. */
function aggressionGate(P: EffProfile, f: Features, v: BotView, ctx: BotCtx, b: HandBucket): number {
  const strongish = b === 'nuts' || b === 'strong' || b === 'medium' || b === 'draw';
  // Sem mão, a frequência acompanha o quanto o oponente larga (só o Raposo lê isso).
  const bluffy = strongish ? 1 : bluffScale(ctx, f);
  if (v.street === 'flop') {
    let g = P.post.cbetHU * (f.opponents.length > 1 ? 0.6 : 1);
    if (ctx.model && f.opponents.length === 1) {
      const o = f.opponents[0];
      const c = ctx.model.counters(o);
      if (c && c.raw.cbetFaced >= 6 && ctx.model.rates(o).foldToCbet > 0.6) g = 0.85;
      // Contra quem paga tudo: c-bet só com valor e projeto (≈ 45% da faixa), nunca com ar.
      if (ctx.model.has(o, 'pagaTudo')) return strongish ? P.model.cbet.max : 0;
      g = Math.min(P.model.cbet.max, Math.max(P.model.cbet.min, g * bluffy));
      if (!strongish && bluffy < 0.5) g *= bluffy * 2;
    }
    return g;
  }
  if (v.street === 'turn') {
    let g = P.post.barrelTurn;
    if (ctx.model && f.opponents.some((o) => ctx.model!.rates(o).af < 1)) g += 0.15;
    if (hasLabel(ctx, f, 'pagaTudo') && !strongish) g = 0;
    return Math.min(1, g * bluffy);
  }
  return hasLabel(ctx, f, 'pagaTudo') && !strongish ? 0 : Math.min(1, P.post.riverAfterTwo * bluffy);
}

function riverBluffProb(P: EffProfile, f: Features, ctx: BotCtx): number {
  if (hasLabel(ctx, f, 'pagaTudo')) return 0;
  const s = P.sizings.riverPolar;
  const share = P.post.riverBluffShare === 'balanced' ? s / (1 + 2 * s) : P.post.riverBluffShare;
  return clamp01((share + P.mods.bluffPP / 100) * bluffScale(ctx, f));
}

/** Chance de sondar (apostar sem mão quando passam para ele, sem ter sido o agressor). */
const STAB: Partial<Record<string, number>> = { cypher: 0.3, fincher: 0.25 };

function betOrCheck(v: BotView, f: Features, P: EffProfile, ctx: BotCtx, b: HandBucket, monster: boolean, pairPlus: boolean): PlayerAction[] {
  const r = (): number => ctx.rng.nextFloat();
  const small = betFrac(v, 0.33);
  if (b === 'nuts' && v.street !== 'river' && r() < P.post.slowplay) return [CHECK, betFrac(v, valueSize(P, f, v, ctx, b, monster))];
  if (b === 'nuts' || b === 'strong') return [betFrac(v, valueSize(P, f, v, ctx, b, monster)), CHECK];
  if (f.wasAggressor && r() < aggressionGate(P, f, v, ctx, b)) {
    if (!(P.post.cbetPairOnly && !pairPlus)) return [betFrac(v, cbetSize(P, f, v, ctx)), CHECK];
  }
  if (b === 'medium') {
    if (P.id === 'bogart' && r() < 0.30) return [small, CHECK];                   // "um trailer"
    // Raposo: valor fino contra quem paga tudo (rótulo) ou quase nunca larga (leitura rápida).
    if (P.id === 'fincher' && v.street !== 'flop' && (hasLabel(ctx, f, 'pagaTudo') || bluffScale(ctx, f) < 0.5)) return [betFrac(v, 0.5), CHECK];
    return [CHECK, small];
  }
  if (v.street === 'river' && f.scareCard && f.checkedThroughTurn && r() < P.post.scareCardOverbet) {
    return [betFrac(v, P.sizings.scareOverbet), CHECK];                           // Cobra
  }
  if (b === 'draw' && v.street !== 'river' && r() < clamp01((P.post.semibluffFreq + P.mods.bluffPP / 100) * Math.max(0.5, Math.min(1, bluffScale(ctx, f))))) {
    return [betFrac(v, cbetSize(P, f, v, ctx)), CHECK];
  }
  if (b === 'air' && v.street === 'river' && r() < riverBluffProb(P, f, ctx)) return [betFrac(v, P.sizings.riverPolar), CHECK];
  // Sondagem: a mesa passou e ninguém mostrou força; quem é agressivo aposta sem mão
  // (A3: o AF da Cobra e do Raposo estava abaixo da meta).
  if ((b === 'air' || b === 'weak') && v.street !== 'river' && !f.wasAggressor && r() < (STAB[P.id] ?? 0) * bluffScale(ctx, f)) {
    return [betFrac(v, cbetSize(P, f, v, ctx)), CHECK];
  }
  return [CHECK, small];
}

/** Quanto uma aposta daquele oponente informa: AF alto (com amostra) = aposta vale menos. */
function aggrWeightOf(ctx: BotCtx, id: string): number {
  const c = ctx.model?.counters(id);
  if (!ctx.model || !c || c.raw.hands < 2) return 1;
  // AF alto ou aumento demais antes do flop (este sobe já nas primeiras mãos): aposta vale
  // menos. AF baixo (quem só paga e, quando aposta, tem mão): vale mais, até 2× (A3).
  const r = ctx.model.quick(id);
  return Math.max(0.15, Math.min(2, 1.5 / Math.max(0.1, r.af), 0.22 / Math.max(0.01, r.pfr)));
}

function marginAdj(v: BotView, f: Features, P: EffProfile, ctx: BotCtx): number {
  let m = 0;
  if (ctx.model && f.aggressorId) {
    let adj = 0;
    if (v.street === 'river' && ctx.model.has(f.aggressorId, 'blefador')) adj -= 0.10;
    const c = ctx.model.counters(f.aggressorId);
    if (v.street === 'river' && c && c.raw.riverBetsShown >= 3 && ctx.model.rates(f.aggressorId).riverBluff < 0.15) adj += 0.10;
    // Contra quem agride muito (AF > 2,5 com amostra), paga mais leve em qualquer rua.
    if (c && c.raw.hands >= 2) {
      const r = ctx.model.quick(f.aggressorId);
      if (r.af > 2.5) adj -= Math.min(0.10, 0.04 * (r.af - 1.5));
      if (r.pfr > 0.3) adj -= Math.min(0.12, 0.4 * (r.pfr - 0.3));
    }
    const lim = P.model.callMarginPP / 100;
    m += Math.max(-lim, Math.min(lim, adj));
  }
  const tilt = ctx.mem.tilt;
  if (tilt && P.tilt.effect.targeted && tilt.targetId && tilt.targetId === f.aggressorId) m += P.tilt.effect.callMarginPP / 100;
  if (ctx.huntingId && f.aggressorId === ctx.huntingId) m += P.bounty.hunterMarginPP / 100;
  if (ctx.isCarrier && f.facingAllIn) m += P.bounty.carrier.allInMarginPP / 100;
  return m;
}

/** Chance de aumentar quando pagaria (flop e turn): a Cobra com qualquer mão, o Raposo
 *  só com mão média ou forte (proteção e valor). */
const RAISE_INSTEAD: Partial<Record<string, number>> = { cypher: 0.3, fincher: 0.3 };

/** Folga de equidade a partir da qual pagar é óbvio (sem segunda opção para o ε). */
const CLEAR_CALL = 0.08;

function facingBet(v: BotView, f: Features, P: EffProfile, ctx: BotCtx, eq: number, b: HandBucket, pairPlus: boolean): PlayerAction[] {
  const odds = v.toCall / (v.pot + v.toCall);
  const key = ctx.mem.committed ? 'committed' : pairPlus ? 'pairPlus' : b === 'draw' ? 'draw' : 'air';
  const margin = P.post.callMarginPP[key] / 100 + marginAdj(v, f, P, ctx);
  let dor = 0;   // Sapo: "mão de vaca", só antes de investir
  if (P.stinginess > 0 && !ctx.mem.committed && !ctx.mem.facedFirstBet) {
    dor = (P.stinginess * v.toCall * (v.toCall / Math.max(1, v.stack))) / (v.pot + v.toCall);
  }
  const need = odds + margin + dor;
  ctx.mem.facedFirstBet = true;
  const r = (): number => ctx.rng.nextFloat();
  const level = v.toCall + v.streetBet;
  const raise = raiseTo(level * 3);
  if ((b === 'nuts' || b === 'strong') && r() < P.post.raiseValueFreq) return [raise, CALL];
  if (f.canCheckRaise && (b === 'draw' || b === 'air') && r() < P.post.checkRaise * (b === 'air' ? bluffScale(ctx, f) : 1)) return [raise, FOLD];
  if (P.id === 'fincher' && v.street === 'river' && f.facingRaise && (b === 'strong' || b === 'medium')
      && !(ctx.model?.has(f.aggressorId, 'blefador') ?? false) && r() < 0.70) return [FOLD, CALL];   // falha planejada
  // Aumenta-ou-larga: parte das vezes em que pagaria, aumenta (A3: AF da Cobra 1,6 e do
  // Raposo 1,4, metas 3,5–4,5 e 2,5–3; o aumento leve é vazamento que quem tem mão pune).
  if (eq >= need && v.street !== 'river' && (P.id === 'cypher' || b === 'medium' || b === 'strong')
      && r() < (RAISE_INSTEAD[P.id] ?? 0)) return [raise, CALL];
  if (eq >= need) {
    if (P.id === 'bogart' && pairPlus) ctx.mem.committed = true;   // "já investi": dor = 0, margem −8
    // Pagar com folga não tem "erro plausível" de largar (A3): o ε vira pagamento curioso
    // e valor perdido, nunca largar a mão boa — largar era o que o maniac explorava.
    return eq >= need + CLEAR_CALL ? [CALL] : [CALL, FOLD];
  }
  return [FOLD, CALL];
}

export function postflop(v: BotView, f: Features, P: EffProfile, ctx: BotCtx, b: HandBucket, monster: boolean, pairPlus: boolean): Ranked {
  const ranges: (WeightedRange | null)[] = f.opponents.map((o) => rangeFor(o, v, P.rangeModel, ctx.model
    ? { rates: ctx.model.quick(o), labels: ctx.model.labels(o), aggrWeight: aggrWeightOf(ctx, o) }
    : {}));
  const iters = P.iters[v.street === 'preflop' ? 'flop' : v.street];
  const opponents = Math.max(1, f.opponents.length);
  let eq: number;
  try {
    eq = estimateEquity({ hole: v.hole, board: v.board, opponents, iterations: iters, rng: ctx.rng, ranges }).equity;
  } catch {
    eq = estimateEquity({ hole: v.hole, board: v.board, opponents, iterations: iters, rng: ctx.rng }).equity;
  }
  eq = clamp01(eq + gauss4(ctx.rng) * P.noise);
  if (!f.inPosition) eq *= 1 - 0.05 * P.positionUse;
  const ranked = v.toCall === 0 ? betOrCheck(v, f, P, ctx, b, monster, pairPlus) : facingBet(v, f, P, ctx, eq, b, pairPlus);
  return { ranked, eq };
}
