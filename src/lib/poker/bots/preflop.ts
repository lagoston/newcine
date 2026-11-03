/**
 * Antes do flop, com mais de maxBB efetivos (SPEC §3.5, `preflop`). pct = "top X%" da mão
 * menos o deslocamento de VPIP (tilt/portador): menor = melhor.
 */
import type { PlayerAction } from '../engine.ts';
import type { BotView } from '../types.ts';
import { preflopPct } from './buckets.ts';
import type { Features } from './features.ts';
import type { BotCtx, EffProfile, Ranked } from './policy.ts';
import { ALLIN, CALL, CHECK, FOLD, checkOrCall, entryFor, raiseTo } from './policy.ts';
import { callAllInRanked } from './pushfold.ts';

function limpAllowed(P: EffProfile, f: Features, ctx: BotCtx, v: BotView): boolean {
  if (!P.preflop.limpOnlySbVsPassiveBB) return true;
  if (f.pos !== 'SB' || !ctx.model) return false;
  return ctx.model.rates(v.bbId).pfr < 0.15;   // BB passivo
}

/**
 * Parte da faixa de entrada com que se isola um limp (A3, 03/11/2026: era 1,0). Isolar
 * todo limp punia o iniciante, que limpa metade das mãos, muito mais do que qualquer
 * outro estilo; o médio e o bom quase nunca limpam.
 */
const ISO_SHARE = 0.5;
/** "O Raposo isola o Sapo" (§3.5): contra o limp do Sapo, mais largo que o normal. */
const ISO_VS_SAPO = 1.3;

/** Distância (pp de "top %") além da faixa de entrada a partir da qual a mão é lixo. */
const TRASH_GAP = 15;

function isoRange(P: EffProfile, ctx: BotCtx, v: BotView, entry: number): number {
  if (P.preflop.raiseOnlyTopPct !== null) return P.preflop.raiseOnlyTopPct;
  const limpers = v.actions.filter((a) => a.street === 'preflop' && a.type === 'call').map((a) => a.playerId);
  // Raposo: limp de quem entra em quase tudo (rótulo `solto`, ou VPIP lido > 50%) se isola largo.
  const soft = ctx.model && limpers.some((id) => ctx.model!.has(id, 'solto') || ctx.model!.quick(id).vpip > 0.5);
  // Contra o Sapo (só bots limparam) isola mais; contra a pessoa, metade (ver ISO_SHARE).
  const share = limpers.every((id) => id === 'bogart') ? ISO_VS_SAPO : ISO_SHARE;
  return entry * (soft ? 0.8 : 0.6) * share;
}

function currentLevel(v: BotView): number {
  return v.toCall + v.streetBet;
}

function threeBetTo(v: BotView, f: Features): number {
  const lvl = currentLevel(v);
  return lvl * (f.inPosition ? 3 : 3.5) + lvl * f.callersAfterRaise;
}

/** Faixa de blefe (Cobra/Raposo): entre o valor e a entrada, preferindo Ax do mesmo naipe. */
function bluffBandFreq(P: EffProfile, tb: number, valueTop: number, entry: number, v: BotView): number {
  const width = Math.max(1, entry - valueTop);
  const base = Math.min(1, (tb * P.preflop.threeBetBluffShare) / width);
  const suitedAce = v.hole[0][1] === v.hole[1][1] && (v.hole[0][0] === 'A' || v.hole[1][0] === 'A');
  return Math.min(1, base * (suitedAce ? 2.5 : 0.8));
}

/** Raposo: até 1,4× a faixa de abrir quando os que faltam falar entram pouco (VPIP < 30%). */
function stealWiden(v: BotView, ctx: BotCtx): number {
  const me = v.players.find((p) => p.id === v.selfId)!;
  const left = v.players.filter((p) => p.hasCards && p.id !== v.selfId && p.streetBet <= v.blinds.bigBlind
    && !v.actions.some((a) => a.playerId === p.id && a.street === 'preflop'));
  if (left.length === 0 || left.length > 2 || me.status !== 'active') return 1;
  const vpip = Math.max(...left.map((p) => ctx.model!.quick(p.id).vpip));
  return vpip < 0.3 ? 1 + Math.min(0.4, (0.3 - vpip) * 2.5) : 1;
}

/** Raposo: quanto alargar contra um re-aumento de quem aumenta demais (1 = nada). */
function reraiseWiden(ctx: BotCtx, f: Features): number {
  if (!ctx.model || !f.aggressorId) return 1;
  return Math.max(1, Math.min(4, ctx.model.quick(f.aggressorId).pfr / 0.2));
}

/**
 * Diante de 3-bet/4-bet que já compromete o cacife (pagar deixaria menos de um pote
 * atrás), a decisão vira a de um all-in: equidade contra a faixa de quem re-aumentou.
 * Pagar e largar no flop seria o pior dos dois mundos (A3, 03/11/2026).
 */
function commit(v: BotView, f: Features, P: EffProfile, ctx: BotCtx, ranked: PlayerAction[]): PlayerAction[] {
  const behind = v.stack - v.toCall;
  if (behind > v.pot + v.toCall || ranked[0] !== FOLD || !v.legal.allIn) return ranked;
  const r = callAllInRanked(v, { ...f, facingAllIn: true }, P, ctx, false);
  return r.ranked[0] === CALL ? [ALLIN, FOLD] : ranked;
}

export function preflop(v: BotView, f: Features, P: EffProfile, ctx: BotCtx): Ranked {
  if (f.facingAllIn) return callAllInRanked(v, f, P, ctx);
  const pct = preflopPct(v.hole) - P.mods.vpipDelta;
  let entry = entryFor(P, f);
  const bb = f.bb;
  const LIMP: PlayerAction = CALL;
  const R = (xBB: number): PlayerAction => raiseTo(xBB * bb);
  const r = (): number => ctx.rng.nextFloat();
  let ranked: PlayerAction[];
  switch (f.facing) {
    case 'unopened': {
      // Raposo: rouba mais quando quem falta falar é apertado (VPIP lido baixo; A3).
      if (ctx.model && (f.pos === 'BTN' || f.pos === 'SB')) entry = Math.min(100, entry * stealWiden(v, ctx));
      if (pct > entry) {
        // Lixo (bem fora da faixa) não tem "erro plausível" de limp (A3): com ε alto o
        // limp de lixo inflava o VPIP do Sapo e da Cobra acima das metas.
        ranked = f.pos === 'BB' ? [CHECK] : pct > entry + TRASH_GAP ? [FOLD] : [FOLD, LIMP];
        break;
      }
      const open = f.pos === 'SB' ? P.preflop.openOOP : P.preflop.open;
      if (P.preflop.raiseOnlyTopPct !== null && pct > P.preflop.raiseOnlyTopPct) {
        ranked = r() < P.preflop.limpShare ? [LIMP, FOLD] : [R(open), LIMP];
        break;
      }
      // Quem quase nunca limpa (Cobra 3%; Raposo só no SB contra BB passivo). Veneno: aumenta mais.
      const limp = P.preflop.raiseOnlyTopPct === null && limpAllowed(P, f, ctx, v)
        && r() < Math.max(0, P.preflop.limpShare - P.mods.pfrDelta / 100);
      // Quem não limpa nunca (Cobra) não tem o limp como "erro plausível" (A3: o ε dela
      // virava ~1/4 das aberturas em limp e o PFR ficava abaixo da meta).
      ranked = limp ? [LIMP, R(open)] : P.preflop.limpShare <= 0 ? [R(open)] : [R(open), LIMP];
      break;
    }
    case 'limped': {
      const extra = Math.max(0, f.limpers - 1);
      if (pct <= isoRange(P, ctx, v, entry)) ranked = [R(P.preflop.iso + extra * P.preflop.isoPerExtraLimper), checkOrCall(v)];
      else if (pct <= entry || f.pos === 'BB') ranked = [checkOrCall(v), FOLD];
      else ranked = [FOLD, checkOrCall(v)];
      break;
    }
    case 'opened': {
      // Raposo: contra quem abre demais (PFR alto no modelo), 3-bet e defesa mais largos.
      const widen = ctx.model && f.openerId ? Math.max(1, Math.min(3.5, ctx.model.quick(f.openerId).pfr / 0.22)) : 1;
      const tb = (P.preflop.threeBetPct + P.mods.pfrDelta * 0.5) * widen;
      const valueTop = tb * (1 - P.preflop.threeBetBluffShare);
      if (pct <= valueTop) {
        ranked = [raiseTo(threeBetTo(v, f)), CALL];
        break;
      }
      if (pct <= entry && P.preflop.threeBetBluffShare > 0 && r() < bluffBandFreq(P, tb, valueTop, entry, v)) {
        ranked = [raiseTo(threeBetTo(v, f)), FOLD];
        break;
      }
      let defend = P.preflop.callOpenPct;
      if (f.pos === 'BB' && f.openerStealPos) {
        let fold = P.preflop.foldBBvsSteal;
        if (ctx.model && f.openerId) {
          // Raposo: defende mais contra quem rouba muito, menos contra quem só abre forte (±0,10).
          const pfr = ctx.model.quick(f.openerId).pfr;
          const adj = Math.max(-P.model.foldBBvsSteal, Math.min(P.model.foldBBvsSteal, (0.18 - pfr) * 0.5));
          fold += adj;
        }
        defend = 100 * (1 - fold);
      }
      ranked = pct <= defend * widen ? [CALL, FOLD] : [FOLD, CALL];
      break;
    }
    case 'threeBet': {
      const mine = f.iOpened ? entry : P.preflop.callOpenPct;
      // Raposo: contra quem re-aumenta demais (PFR alto no modelo), continua mais largo (A3).
      const w3 = reraiseWiden(ctx, f);
      if (pct <= 4 * w3) ranked = [P.id === 'bogart' ? CALL : raiseTo(currentLevel(v) * 2.3), CALL];
      else ranked = pct <= mine * (1 - P.preflop.foldTo3bet) * w3 ? [CALL, FOLD] : [FOLD, CALL];
      ranked = commit(v, f, P, ctx, ranked);
      break;
    }
    default: {
      const mine = f.iOpened ? entry : P.preflop.callOpenPct;
      const w4 = reraiseWiden(ctx, f);
      if (pct <= 2.5 * w4) ranked = [ALLIN, CALL];
      else ranked = pct <= mine * (1 - P.preflop.foldTo4bet) * w4 ? [CALL, FOLD] : [FOLD, CALL];
      ranked = commit(v, f, P, ctx, ranked);
    }
  }
  return { ranked, eq: null };
}
