/**
 * Bots do treino (SPEC §2.8): cada um consome a sua fila do roteiro, na ordem em que age.
 * Ação ilegal no roteiro (ou fila vazia) vira check, ou fold se não puder passar, com
 * console.warn — o teste do roteiro (pacote B) falha com isso.
 */
import type { LegalActions, PlayerAction } from '../engine.ts';
import { getLegalActions } from '../engine.ts';
import type { RivalId, ScriptedAction } from '../types.ts';
import type { BotChoice } from '../bots/driver.ts';
import { handInfo } from '../bots/driver.ts';
import type { MatchStateX } from './internal.ts';
import { playerOf } from './internal.ts';

function isLegal(a: PlayerAction, L: LegalActions): boolean {
  switch (a.type) {
    case 'fold':
      return true;
    case 'check':
      return L.canCheck;
    case 'call':
      return true;
    case 'allIn':
      return L.allIn !== null;
    case 'bet':
    case 'raise': {
      if (!Number.isInteger(a.amount)) return false;
      if (L.allIn && a.amount === L.allIn.to) return true;
      const r = L.bet ?? L.raise;
      return !!r && a.amount >= r.min && a.amount <= r.max;
    }
    default:
      return false;
  }
}

export function scriptedChoice(st: MatchStateX, botId: RivalId): BotChoice {
  const g = st.game;
  const hand = g.hand!;
  const L = getLegalActions(g, botId)!;
  const script = st.config.tutorial;
  const idx = hand.actions.filter((a) => a.playerId === botId).length;
  const queue: ScriptedAction[] = (script && st.tutorialHand !== undefined ? script.hands[st.tutorialHand]?.bots[botId] : undefined) ?? [];
  const want = queue[idx];
  const checkOrFold: PlayerAction = L.canCheck ? { type: 'check' } : { type: 'fold' };
  let action: PlayerAction;
  if (!want || want.type === 'checkOrFold') {
    if (!want) console.warn(`[treino] fila vazia: ${botId}, ação ${idx + 1} da mão ${(st.tutorialHand ?? 0) + 1}`);
    action = checkOrFold;
  } else if (isLegal(want, L)) {
    action = want;
  } else {
    console.warn(`[treino] ação ilegal no roteiro: ${botId} ${JSON.stringify(want)} (mão ${(st.tutorialHand ?? 0) + 1})`);
    action = checkOrFold;
  }
  const me = playerOf(g, botId);
  return { action, ...handInfo(me.holeCards, hand.board) };
}
