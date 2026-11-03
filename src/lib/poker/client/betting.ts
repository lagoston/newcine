/**
 * Contas dos botões de aposta (SPEC §7.4): atalhos de valor, limites do slider e
 * a ação que o valor escolhido vira. Valores sempre "até" (total na rua), como o motor.
 */
import type { LegalActions, PlayerAction, Street } from '../engine.ts';

export interface Preset {
  key: 'x2' | 'x25' | 'x3' | 'third' | 'half' | 'twoThirds' | 'pot' | 'allIn';
  to: number;
}

export interface RaiseRange {
  min: number;
  max: number;
  kind: 'bet' | 'raise';
}

/** Faixa do slider; null quando só dá para pagar (ou só o all-in curto). */
export function raiseRange(legal: LegalActions): RaiseRange | null {
  if (legal.bet) return { min: legal.bet.min, max: legal.bet.max, kind: 'bet' };
  if (legal.raise) return { min: legal.raise.min, max: legal.raise.max, kind: 'raise' };
  return null;
}

/** All-in que não cabe no slider (abaixo do aumento mínimo): vira botão direto. */
export function shortAllIn(legal: LegalActions): boolean {
  return !raiseRange(legal) && !!legal.allIn && legal.allIn.kind !== 'call';
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function presetsFor(legal: LegalActions, street: Street, bb: number): Preset[] {
  const r = raiseRange(legal);
  if (!r) return [];
  const current = legal.streetBet + legal.toCall;
  const pot = legal.pot;
  const potTo = r.kind === 'bet' ? pot : current + (pot + legal.toCall);
  const frac = (f: number) => (r.kind === 'bet' ? Math.round(pot * f) : Math.round(current + f * (pot + legal.toCall)));
  const snap = (v: number) => clamp(Math.round(v / Math.max(1, Math.round(bb / 2))) * Math.max(1, Math.round(bb / 2)), r.min, r.max);
  const list: Preset[] =
    street === 'preflop'
      ? [
          { key: 'x2', to: snap(Math.max(current, bb) * 2) },
          { key: 'x25', to: snap(Math.max(current, bb) * 2.5) },
          { key: 'x3', to: snap(Math.max(current, bb) * 3) },
          { key: 'pot', to: snap(potTo) },
        ]
      : [
          { key: 'third', to: snap(frac(1 / 3)) },
          { key: 'half', to: snap(frac(1 / 2)) },
          { key: 'twoThirds', to: snap(frac(2 / 3)) },
          { key: 'pot', to: snap(potTo) },
        ];
  list.push({ key: 'allIn', to: r.max });
  return list;
}

/** Passo do slider: 1 BB, sem sair dos limites. */
export function stepAmount(v: number, dir: 1 | -1, r: RaiseRange, bb: number): number {
  if (dir > 0 && v + bb >= r.max) return r.max;
  return clamp(v + dir * bb, r.min, r.max);
}

/** O valor do slider vira ação: no teto, all-in. */
export function actionFor(to: number, r: RaiseRange): PlayerAction {
  if (to >= r.max) return { type: 'allIn' };
  return r.kind === 'bet' ? { type: 'bet', amount: to } : { type: 'raise', amount: to };
}

/** Fração do pote para o aria-valuetext ("metade do pote"). */
export function potFractionKey(to: number, legal: LegalActions): 'third' | 'half' | 'twoThirds' | 'pot' | 'overPot' | 'small' {
  const current = legal.streetBet + legal.toCall;
  const base = legal.pot + legal.toCall;
  const f = base > 0 ? (to - current) / base : 0;
  if (f > 1.05) return 'overPot';
  if (f >= 0.9) return 'pot';
  if (f >= 0.6) return 'twoThirds';
  if (f >= 0.42) return 'half';
  if (f >= 0.28) return 'third';
  return 'small';
}
