// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/bots/guardrails.ts
/**
 * Travas universais (SPEC §3.5), aplicadas depois do ε:
 *  1. nunca larga quando pode passar de graça (vira check);
 *  2. nunca larga `nuts` com eq ≥ 0,95 (vira call);
 *  3. nunca paga all-in com eq < 0,15, a menos que as odds sejam < 0,15 (vira fold);
 *  4. aposta ≥ 90% do cacife vira all-in;
 *  5. valor em múltiplos de 5, preso entre o mínimo e o máximo legais.
 */
import type { PlayerAction } from '../engine.ts';
import type { BotView, HandBucket } from '../types.ts';
import type { Features } from './features.ts';
import { ALLIN, CALL, CHECK, FOLD, round5 } from './policy.ts';

export function guardrails(pick: PlayerAction, v: BotView, f: Features, eq: number | null, b: HandBucket): PlayerAction {
  const L = v.legal;
  if (pick.type === 'fold' && L.canCheck) return CHECK;
  if (pick.type === 'fold' && b === 'nuts' && eq !== null && eq >= 0.95) return CALL;
  const allInCall = pick.type === 'call' && ((L.call?.allIn ?? false) || f.facingAllIn);
  if (allInCall && eq !== null && eq < 0.15 && v.toCall / (v.pot + v.toCall) >= 0.15) return FOLD;
  return pick;
}

export function toLegalAmount(pick: PlayerAction, v: BotView): PlayerAction {
  const L = v.legal;
  const passive = (): PlayerAction => (L.canCheck ? CHECK : L.call ? CALL : FOLD);
  switch (pick.type) {
    case 'fold':
      return L.canCheck ? CHECK : FOLD;
    case 'check':
      return L.canCheck ? CHECK : CALL;
    case 'call':
      return L.call ? CALL : CHECK;
    case 'allIn':
      return L.allIn ? ALLIN : passive();
    default: {
      const range = L.bet ?? L.raise;
      if (!range) return L.allIn && L.allIn.kind !== 'call' ? ALLIN : passive();
      let to = round5(pick.amount);
      if (to - v.streetBet >= 0.9 * v.stack) return L.allIn ? ALLIN : { type: L.bet ? 'bet' : 'raise', amount: range.max };
      to = Math.min(range.max, Math.max(range.min, to));
      if (L.allIn && to === L.allIn.to) return ALLIN;
      return { type: L.bet ? 'bet' : 'raise', amount: to };
    }
  }
}
