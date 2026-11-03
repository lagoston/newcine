/**
 * % de chance de cada mão aberta num all-in (SPEC §2.3 e §4.4).
 * Exato com ≥ 3 cartas no board; antes do flop, Monte Carlo com 3.000 iterações e semente
 * = hash das cartas abertas, para dar o mesmo número no aparelho e no servidor.
 * Empates dividem a chance. Resultado com 4 casas.
 */
import type { Card } from '../cards.ts';
import { cardIndex } from '../cards.ts';
import { scoreMasks } from '../evaluator.ts';
import { createRng } from '../rng.ts';
import { round4 } from './internal.ts';

const PREFLOP_ITERS = 3000;

function addCard(m: Int32Array, offset: number, idx: number): void {
  m[offset + (idx & 3)] |= 1 << (idx >> 2);
}

export function runoutOdds(hands: { playerId: string; cards: Card[] }[], board: Card[]): Record<string, number> {
  const players = hands.filter((h) => h.cards.length === 2);
  const out: Record<string, number> = {};
  for (const h of hands) out[h.playerId] = 0;
  const n = players.length;
  if (n === 0) return out;
  if (n === 1) {
    out[players[0].playerId] = 1;
    return out;
  }
  const used = new Uint8Array(52);
  const base = new Int32Array(4);
  for (const c of board) {
    const i = cardIndex(c);
    used[i] = 1;
    addCard(base, 0, i);
  }
  // Máscaras de cada jogador: board conhecido + as duas cartas dele.
  const pm = new Int32Array(4 * n);
  players.forEach((h, k) => {
    for (let s = 0; s < 4; s++) pm[4 * k + s] = base[s];
    for (const c of h.cards) {
      const i = cardIndex(c);
      used[i] = 1;
      addCard(pm, 4 * k, i);
    }
  });
  const deck: number[] = [];
  for (let i = 0; i < 52; i++) if (!used[i]) deck.push(i);
  const need = 5 - board.length;
  const eq = new Float64Array(n);
  const scores = new Int32Array(n);
  let trials = 0;

  const evaluate = (extra: number[]): void => {
    let best = -1;
    let ties = 0;
    for (let k = 0; k < n; k++) {
      let m0 = pm[4 * k], m1 = pm[4 * k + 1], m2 = pm[4 * k + 2], m3 = pm[4 * k + 3];
      for (const c of extra) {
        const bit = 1 << (c >> 2);
        switch (c & 3) { case 0: m0 |= bit; break; case 1: m1 |= bit; break; case 2: m2 |= bit; break; default: m3 |= bit; }
      }
      const v = scoreMasks(m0, m1, m2, m3);
      scores[k] = v;
      if (v > best) {
        best = v;
        ties = 1;
      } else if (v === best) {
        ties++;
      }
    }
    for (let k = 0; k < n; k++) if (scores[k] === best) eq[k] += 1 / ties;
    trials++;
  };

  if (need <= 0) {
    evaluate([]);
  } else if (board.length >= 3) {
    // Exato: todas as combinações das cartas que faltam (no máximo C(45,2) = 990).
    if (need === 1) {
      for (const a of deck) evaluate([a]);
    } else {
      for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) evaluate([deck[i], deck[j]]);
    }
  } else {
    const key = players.map((h) => `${h.playerId}:${h.cards.join('')}`).join('|') + `/${board.join('')}`;
    const rng = createRng(`odds:${key}`);
    const d = deck.slice();
    const extra = new Array<number>(need);
    for (let it = 0; it < PREFLOP_ITERS; it++) {
      for (let k = 0; k < need; k++) {
        const last = d.length - 1 - k;
        const j = rng.nextInt(last + 1);
        const t = d[j];
        d[j] = d[last];
        d[last] = t;
        extra[k] = d[last];
      }
      evaluate(extra);
    }
  }
  players.forEach((h, k) => {
    out[h.playerId] = round4(eq[k] / trials);
  });
  return out;
}
