// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/eliminator.ts
/**
 * Quem eliminou (SPEC §2.4): o vencedor do pote de MAIOR índice em que a vítima concorria
 * (foi ele quem levou o último cacife dela). Pote dividido: a pessoa tem prioridade; senão,
 * a ordem da ficha ímpar (primeiro à esquerda do botão), que é a ordem de `winners` no motor.
 * Uma regra só para prêmio, estatísticas, marcos e falas.
 */
import type { HandResult } from '../engine.ts';
import type { PlayerId } from '../types.ts';
import { HUMAN } from './internal.ts';

export function eliminatorOf(result: HandResult, victimId: string, persons: readonly string[] = [HUMAN]): PlayerId | null {
  let best: HandResult['pots'][number] | null = null;
  for (const pot of result.pots) {
    if (!pot.eligibleIds.includes(victimId)) continue;
    if (!best || pot.potIndex > best.potIndex) best = pot;
  }
  if (!best) return null;
  const winners = best.winners.filter((w) => w.playerId !== victimId).map((w) => w.playerId);
  if (winners.length === 0) return null;
  // Pacote E3: na mesa de amigos, qualquer pessoa tem a prioridade (a primeira na ordem da ficha ímpar).
  const person = winners.find((w) => persons.includes(w));
  if (person) return person;
  return winners[0];
}
