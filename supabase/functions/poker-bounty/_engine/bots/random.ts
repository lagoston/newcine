// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/bots/random.ts
/**
 * Bot provisório do A1 (03/11/2026): escolhe uma ação legal ao acaso, com pesos que dão
 * partidas parecidas com as de verdade (paga muito, aumenta às vezes, all-in raro).
 * Fica para testes, fixtures e exploração (`allin`, `station`, `maniac` usam o mesmo molde).
 */
import type { PlayerAction } from '../engine.ts';
import type { Rng } from '../rng.ts';
import type { BotView } from '../types.ts';

function sizeIn(r: { min: number; max: number }, rng: Rng): number {
  const t = rng.nextFloat();
  const raw = r.min + (r.max - r.min) * t * t * t;
  const to = Math.round(raw / 5) * 5;
  return Math.min(r.max, Math.max(r.min, to));
}

export function randomAction(v: BotView, rng: Rng): PlayerAction {
  const L = v.legal;
  const range = L.bet ?? L.raise;
  const u = rng.nextFloat();
  if (L.toCall === 0) {
    if (range && u < 0.22) return { type: L.bet ? 'bet' : 'raise', amount: sizeIn(range, rng) };
    if (L.allIn && u < 0.24) return { type: 'allIn' };
    return { type: 'check' };
  }
  if (u < 0.30) return { type: 'fold' };
  if (range && u < 0.40) return { type: 'raise', amount: sizeIn(range, rng) };
  if (L.allIn && u < 0.43) return { type: 'allIn' };
  return { type: 'call' };
}
