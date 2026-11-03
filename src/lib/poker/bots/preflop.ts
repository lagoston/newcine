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

function isoRange(P: EffProfile, ctx: BotCtx, v: BotView, entry: number): number {
  if (P.preflop.raiseOnlyTopPct !== null) return P.preflop.raiseOnlyTopPct;
  const limpers = v.actions.filter((a) => a.street === 'preflop' && a.type === 'call').map((a) => a.playerId);
  const soft = ctx.model && limpers.some((id) => ctx.model!.has(id, 'solto'));
  return entry * (soft ? 0.8 : 0.6);
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

export function preflop(v: BotView, f: Features, P: EffProfile, ctx: BotCtx): Ranked {
  if (f.facingAllIn) return callAllInRanked(v, f, P, ctx);
  const pct = preflopPct(v.hole) - P.mods.vpipDelta;
  const entry = entryFor(P, f);
  const bb = f.bb;
  const LIMP: PlayerAction = CALL;
  const R = (xBB: number): PlayerAction => raiseTo(xBB * bb);
  const r = (): number => ctx.rng.nextFloat();
  let ranked: PlayerAction[];
  switch (f.facing) {
    case 'unopened': {
      if (pct > entry) {
        ranked = f.pos === 'BB' ? [CHECK] : [FOLD, LIMP];
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
      ranked = limp ? [LIMP, R(open)] : [R(open), LIMP];
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
      const widen = ctx.model && f.openerId ? Math.max(1, Math.min(2.5, ctx.model.rates(f.openerId).pfr / 0.22)) : 1;
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
          const pfr = ctx.model.rates(f.openerId).pfr;
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
      if (pct <= 4) ranked = [P.id === 'bogart' ? CALL : raiseTo(currentLevel(v) * 2.3), CALL];
      else ranked = pct <= mine * (1 - P.preflop.foldTo3bet) ? [CALL, FOLD] : [FOLD, CALL];
      break;
    }
    default: {
      const mine = f.iOpened ? entry : P.preflop.callOpenPct;
      if (pct <= 2.5) ranked = [ALLIN, CALL];
      else ranked = pct <= mine * (1 - P.preflop.foldTo4bet) ? [CALL, FOLD] : [FOLD, CALL];
    }
  }
  return { ranked, eq: null };
}
