/**
 * Quem eliminou (SPEC §2.4): o vencedor do pote de MAIOR índice em que a vítima concorria
 * (foi ele quem levou o último cacife dela). Pote dividido: a pessoa tem prioridade; senão,
 * a ordem da ficha ímpar (primeiro à esquerda do botão), que é a ordem de `winners` no motor.
 * Uma regra só para prêmio, estatísticas, marcos e falas.
 */
import type { HandResult } from '../engine.ts';
import type { PlayerId } from '../types.ts';
import { HUMAN } from './internal.ts';

export function eliminatorOf(result: HandResult, victimId: string): PlayerId | null {
  let best: HandResult['pots'][number] | null = null;
  for (const pot of result.pots) {
    if (!pot.eligibleIds.includes(victimId)) continue;
    if (!best || pot.potIndex > best.potIndex) best = pot;
  }
  if (!best) return null;
  const winners = best.winners.filter((w) => w.playerId !== victimId).map((w) => w.playerId);
  if (winners.length === 0) return null;
  if (winners.includes(HUMAN)) return HUMAN;
  return winners[0];
}
