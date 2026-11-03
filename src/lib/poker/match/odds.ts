/**
 * % de chance de cada mão aberta num all-in (SPEC §2.3 e §4.4).
 * Exato com ≥ 3 cartas no board; antes do flop, Monte Carlo com 3.000 iterações e semente
 * = hash das cartas abertas, para dar o mesmo número no aparelho e no servidor.
 * Empates dividem a chance. Resultado com 4 casas.
 *
 * Pôster Poker (03/11/2026): `boardSize` 6 (river de 2 cartas do Onze Homens; com 3 cartas
 * no board são até C(45,3) = 14.190 combinações) e `extraCards` (Cassino): o baralho
 * restante é o real, com repetidas, e as mãos passam pelo avaliador por contagem.
 */
import type { Card } from '../cards.ts';
import { cardIndex } from '../cards.ts';
import { scoreIndicesAny, scoreMasks } from '../evaluator.ts';
import { createRng } from '../rng.ts';
import { round4 } from './internal.ts';

const PREFLOP_ITERS = 3000;

function addCard(m: Int32Array, offset: number, idx: number): void {
  m[offset + (idx & 3)] |= 1 << (idx >> 2);
}

export interface RunoutOptions {
  /** Cartas a mais no baralho (Cassino). */
  extraCards?: readonly Card[];
  /** Tamanho final do board (padrão max(5, board.length)). */
  boardSize?: number;
}

/** Cartas que faltam escolhidas entre `deck` (exato até 3; Monte Carlo antes do flop). */
function forEachRunout(deck: number[], need: number, exact: boolean, mcKey: string, fn: (extra: number[]) => void): void {
  if (need <= 0) {
    fn([]);
  } else if (exact) {
    const L = deck.length;
    if (need === 1) {
      for (let i = 0; i < L; i++) fn([deck[i]]);
    } else if (need === 2) {
      for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) fn([deck[i], deck[j]]);
    } else {
      for (let i = 0; i < L; i++) for (let j = i + 1; j < L; j++) for (let k = j + 1; k < L; k++) fn([deck[i], deck[j], deck[k]]);
    }
  } else {
    const rng = createRng(mcKey);
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
      fn(extra);
    }
  }
}

/** Com cartas repetidas: baralho restante real e avaliador por contagem. */
function runoutOddsMulti(players: { playerId: string; cards: Card[] }[], board: Card[], extraCards: readonly Card[], boardSize: number,
  out: Record<string, number>): Record<string, number> {
  const count = new Uint8Array(52).fill(1);
  for (const c of extraCards) count[cardIndex(c)]++;
  const takeOne = (c: Card): number => {
    const i = cardIndex(c);
    if (count[i] > 0) count[i]--;
    return i;
  };
  const boardIdx = board.map(takeOne);
  const holes = players.map((h) => h.cards.map(takeOne));
  const deck: number[] = [];
  for (let i = 0; i < 52; i++) for (let k = 0; k < count[i]; k++) deck.push(i);
  const n = players.length;
  const eq = new Float64Array(n);
  const scores = new Int32Array(n);
  const buf = new Uint8Array(8);
  let trials = 0;
  const key = players.map((h) => `${h.playerId}:${h.cards.join('')}`).join('|') + `/${board.join('')}/x${extraCards.length}/b${boardSize}`;
  forEachRunout(deck, boardSize - board.length, board.length >= 3, `odds:${key}`, (extra) => {
    let best = -1;
    let ties = 0;
    for (let k = 0; k < n; k++) {
      let m = 0;
      for (const c of holes[k]) buf[m++] = c;
      for (const c of boardIdx) buf[m++] = c;
      for (const c of extra) buf[m++] = c;
      const v = scoreIndicesAny(buf, m);
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
  });
  players.forEach((h, k) => {
    out[h.playerId] = round4(eq[k] / trials);
  });
  return out;
}

export function runoutOdds(hands: { playerId: string; cards: Card[] }[], board: Card[], opts: RunoutOptions = {}): Record<string, number> {
  const players = hands.filter((h) => h.cards.length === 2);
  const out: Record<string, number> = {};
  for (const h of hands) out[h.playerId] = 0;
  const n = players.length;
  if (n === 0) return out;
  if (n === 1) {
    out[players[0].playerId] = 1;
    return out;
  }
  const boardSize = opts.boardSize ?? Math.max(5, board.length);
  if (opts.extraCards && opts.extraCards.length > 0) return runoutOddsMulti(players, board, opts.extraCards, boardSize, out);
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
  const need = boardSize - board.length;
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

  // Exato com ≥ 3 cartas no board (no máximo C(45,2) = 990; C(45,3) com board de 6);
  // antes do flop, Monte Carlo. A chave do sorteio é a de sempre no board de 5.
  const key = players.map((h) => `${h.playerId}:${h.cards.join('')}`).join('|') + `/${board.join('')}` + (boardSize === 5 ? '' : `/b${boardSize}`);
  forEachRunout(deck, need, board.length >= 3, `odds:${key}`, evaluate);
  players.forEach((h, k) => {
    out[h.playerId] = round4(eq[k] / trials);
  });
  return out;
}
