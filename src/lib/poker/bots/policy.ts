/**
 * Peças comuns às políticas (pré-flop, push/fold, pós-flop): o perfil efetivo da mão
 * (tilt + portador + ε final, SPEC §3.4/§3.5), o contexto da decisão e as ações.
 */
import type { PlayerAction } from '../engine.ts';
import type { Rng } from '../rng.ts';
import type { BotMemory, BotProfile, BotView, DifficultyRow, PlayerId } from '../types.ts';
import { effectiveEpsilon } from './profile.ts';
import type { ModelView } from './model.ts';
import type { Features } from './features.ts';

export interface Mods { vpipDelta: number; pfrDelta: number; bluffPP: number; allInCallMul: number }
export interface EffProfile extends BotProfile { mods: Mods }

export interface BotCtx {
  profile: EffProfile;
  mem: BotMemory;
  model?: ModelView;
  difficulty: DifficultyRow;
  rng: Rng;
  isCarrier: boolean;
  /** Portador do prêmio que este bot caça (null fora do prêmio ou depois da captura). */
  huntingId: PlayerId | null;
}

/** Tilt + portador + ε_final = max(ε × epsilonMul, piso). */
export function applyMods(p: BotProfile, tilt: BotMemory['tilt'], isCarrier: boolean, d: DifficultyRow): EffProfile {
  const mods: Mods = { vpipDelta: 0, pfrDelta: 0, bluffPP: 0, allInCallMul: 1 };
  if (tilt && !p.tilt.effect.targeted) {
    mods.vpipDelta += p.tilt.effect.vpipDelta;
    mods.pfrDelta += p.tilt.effect.pfrDelta;
    mods.bluffPP += p.tilt.effect.bluffPP;
    mods.allInCallMul *= p.tilt.effect.allInCallMul;
  }
  if (isCarrier) mods.vpipDelta += p.bounty.carrier.vpipDelta;
  return { ...p, epsilon: effectiveEpsilon(p, d), mods };
}

export const FOLD: PlayerAction = { type: 'fold' };
export const CHECK: PlayerAction = { type: 'check' };
export const CALL: PlayerAction = { type: 'call' };
export const ALLIN: PlayerAction = { type: 'allIn' };

export function round5(x: number): number {
  return Math.round(x / 5) * 5;
}

/** Aumentar PARA `to` fichas (a trava acerta o valor depois). */
export function raiseTo(to: number): PlayerAction {
  return { type: 'raise', amount: Math.max(1, round5(to)) };
}

/** Apostar/aumentar uma fração do pote: `to = streetBet + round5(size × pote)` (§3.5). */
export function betFrac(v: BotView, size: number): PlayerAction {
  const level = v.toCall + v.streetBet;
  return { type: v.toCall === 0 && level === 0 ? 'bet' : 'raise', amount: Math.max(1, v.streetBet + round5(size * v.pot)) };
}

export function checkOrCall(v: BotView): PlayerAction {
  return v.toCall === 0 ? CHECK : CALL;
}

/** Soma de 4 uniformes (sem exp/log, §3.7): ~normal com média 0 e desvio 1. */
export function gauss4(rng: Rng): number {
  return (rng.nextFloat() + rng.nextFloat() + rng.nextFloat() + rng.nextFloat() - 2) * 1.7320508075688772;
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Faixa de entrada pela posição (heads-up: o botão usa a maior; BB usa a do SB). */
export function entryFor(P: EffProfile, f: Features): number {
  const e = P.preflop.entry;
  if (f.pos === 'BB') return e.SB;
  // Heads-up: o botão abre bem mais largo, na medida do uso de posição (Sapo não muda).
  if (f.headsUp) return Math.min(100, Math.max(e.BTN, e.SB) * (1 + 0.7 * P.positionUse));
  return e[f.pos];
}

export interface Ranked { ranked: PlayerAction[]; eq: number | null }
