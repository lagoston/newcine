/**
 * Equidade por Monte Carlo: com que frequência a mão vence (ou divide) contra
 * N oponentes, sorteando as cartas desconhecidas.
 *
 * O laço principal não aloca nada: o baralho restante fica num Uint8Array e
 * cada iteração faz um Fisher–Yates parcial (só sorteia as cartas necessárias).
 * Embaralhar parcialmente um array que já é uma permutação continua gerando
 * amostras uniformes, então não é preciso "resetar" o baralho entre iterações.
 * As mãos são avaliadas direto por bitmasks (scoreMasks).
 */
import type { Card } from './cards.ts';
import { cardIndex, isCard } from './cards.ts';
import type { Rng } from './rng.ts';
import { scoreMasks } from './evaluator.ts';

/**
 * Faixa ponderada de um oponente (gancho para a IA dos bots): lista de combos
 * possíveis e, opcionalmente, o peso de cada um (padrão 1). Combos que colidem
 * com cartas conhecidas são descartados automaticamente.
 */
export interface WeightedRange {
  combos: ReadonlyArray<readonly [Card, Card]>;
  weights?: ReadonlyArray<number>;
}

export interface EquityOptions {
  /** Suas 2 cartas. */
  hole: readonly Card[];
  /** Board conhecido (0, 3, 4 ou 5 cartas). */
  board?: readonly Card[];
  /** Quantos oponentes ainda estão na mão (1..8). */
  opponents: number;
  iterations: number;
  rng: Rng;
  /** Cartas que sabidamente não estão no baralho (ex.: mostradas por quem desistiu). */
  deadCards?: readonly Card[];
  /** ranges[i] restringe o oponente i; null/ausente = mão aleatória. */
  ranges?: ReadonlyArray<WeightedRange | null | undefined>;
}

export interface EquityResult {
  /** Vitórias + fração dos empates (o "quanto do pote é seu" em média). Entre 0 e 1. */
  equity: number;
  win: number;
  tie: number;
  lose: number;
  iterations: number;
}

// Scratch reaproveitado entre chamadas (o JS é single-thread; nada fica no estado).
const DECK = new Uint8Array(52);
const USED = new Uint8Array(52);
const ITER_USED = new Uint8Array(52);
const ITER_DECK = new Uint8Array(52);
const OPP_HOLES = new Uint8Array(18);
const BIT = new Int32Array(52);
const SUIT = new Uint8Array(52);
for (let i = 0; i < 52; i++) {
  BIT[i] = 1 << (i >> 2);
  SUIT[i] = i & 3;
}

interface PreparedRange {
  a: Uint8Array;
  b: Uint8Array;
  cumulative: Float64Array;
  total: number;
}

function prepareRange(range: WeightedRange): PreparedRange {
  const a: number[] = [];
  const b: number[] = [];
  const cum: number[] = [];
  let total = 0;
  range.combos.forEach((combo, i) => {
    const w = range.weights ? range.weights[i] ?? 0 : 1;
    if (!(w > 0)) return;
    const [c1, c2] = combo;
    if (!isCard(c1) || !isCard(c2) || c1 === c2) throw new Error(`Combo inválido na faixa: ${c1} ${c2}`);
    const i1 = cardIndex(c1);
    const i2 = cardIndex(c2);
    if (USED[i1] || USED[i2]) return; // colide com cartas conhecidas
    a.push(i1);
    b.push(i2);
    total += w;
    cum.push(total);
  });
  if (total <= 0) throw new Error('Faixa sem nenhum combo possível com as cartas conhecidas.');
  return { a: Uint8Array.from(a), b: Uint8Array.from(b), cumulative: Float64Array.from(cum), total };
}

function sampleCombo(r: PreparedRange, rng: Rng): number {
  const x = rng.nextFloat() * r.total;
  let lo = 0;
  let hi = r.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r.cumulative[mid] > x) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function estimateEquity(options: EquityOptions): EquityResult {
  const { hole, opponents, iterations, rng } = options;
  const board = options.board ?? [];
  const dead = options.deadCards ?? [];
  if (hole.length !== 2) throw new Error('estimateEquity: são necessárias 2 cartas fechadas.');
  if (board.length > 5) throw new Error('estimateEquity: board com mais de 5 cartas.');
  if (!Number.isInteger(opponents) || opponents < 1 || opponents > 8) throw new Error('estimateEquity: opponents entre 1 e 8.');
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('estimateEquity: iterations precisa ser >= 1.');

  USED.fill(0);
  const mark = (c: Card): number => {
    if (!isCard(c)) throw new Error(`Carta inválida: ${String(c)}`);
    const i = cardIndex(c);
    if (USED[i]) throw new Error(`Carta repetida: ${c}`);
    USED[i] = 1;
    return i;
  };

  // Máscaras de naipe: só o board conhecido, e mão + board.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0;
  for (const c of board) {
    const i = mark(c);
    switch (SUIT[i]) { case 0: b0 |= BIT[i]; break; case 1: b1 |= BIT[i]; break; case 2: b2 |= BIT[i]; break; default: b3 |= BIT[i]; }
  }
  let h0 = 0, h1 = 0, h2 = 0, h3 = 0;
  for (const c of hole) {
    const i = mark(c);
    switch (SUIT[i]) { case 0: h0 |= BIT[i]; break; case 1: h1 |= BIT[i]; break; case 2: h2 |= BIT[i]; break; default: h3 |= BIT[i]; }
  }
  for (const c of dead) mark(c);

  let deckLen = 0;
  for (let i = 0; i < 52; i++) if (!USED[i]) DECK[deckLen++] = i;

  const boardNeed = 5 - board.length;
  const prepared: (PreparedRange | null)[] = [];
  let rangedOpps = 0;
  for (let o = 0; o < opponents; o++) {
    const r = options.ranges?.[o];
    prepared.push(r ? prepareRange(r) : null);
    if (r) rangedOpps++;
  }
  const anyRange = rangedOpps > 0;
  // Cartas sorteadas do baralho por iteração: o que falta do board + mãos dos oponentes sem faixa.
  const need = boardNeed + 2 * (opponents - rangedOpps);
  if (boardNeed + 2 * opponents > deckLen) throw new Error('estimateEquity: cartas insuficientes no baralho.');

  let wins = 0;
  let ties = 0;
  let equitySum = 0;

  for (let it = 0; it < iterations; it++) {
    // Baralho desta iteração e cartas dos oponentes com faixa.
    let deck = DECK;
    let len = deckLen;
    if (anyRange) {
      ITER_USED.set(USED);
      for (let o = 0; o < opponents; o++) {
        const r = prepared[o];
        if (!r) continue;
        // Rejeição: sorteia combos até achar um que não colida com outro oponente.
        let tries = 0;
        let k = sampleCombo(r, rng);
        while ((ITER_USED[r.a[k]] || ITER_USED[r.b[k]]) && ++tries < 64) k = sampleCombo(r, rng);
        if (tries >= 64) throw new Error('Faixas incompatíveis entre si (cartas esgotadas).');
        ITER_USED[r.a[k]] = 1;
        ITER_USED[r.b[k]] = 1;
        OPP_HOLES[2 * o] = r.a[k];
        OPP_HOLES[2 * o + 1] = r.b[k];
      }
      len = 0;
      for (let i = 0; i < deckLen; i++) if (!ITER_USED[DECK[i]]) ITER_DECK[len++] = DECK[i];
      deck = ITER_DECK;
    }

    // Fisher–Yates parcial: as cartas sorteadas vão para o fim do array.
    for (let k = 0; k < need; k++) {
      const last = len - 1 - k;
      const j = rng.nextInt(last + 1);
      const tmp = deck[j];
      deck[j] = deck[last];
      deck[last] = tmp;
    }
    let p = len - 1;

    let s0 = b0, s1 = b1, s2 = b2, s3 = b3;
    for (let k = 0; k < boardNeed; k++) {
      const c = deck[p--];
      switch (SUIT[c]) { case 0: s0 |= BIT[c]; break; case 1: s1 |= BIT[c]; break; case 2: s2 |= BIT[c]; break; default: s3 |= BIT[c]; }
    }
    const hero = scoreMasks(s0 | h0, s1 | h1, s2 | h2, s3 | h3);

    let lost = false;
    let tiedWith = 0;
    for (let o = 0; o < opponents; o++) {
      let c1: number;
      let c2: number;
      if (anyRange && prepared[o]) {
        c1 = OPP_HOLES[2 * o];
        c2 = OPP_HOLES[2 * o + 1];
      } else {
        c1 = deck[p--];
        c2 = deck[p--];
      }
      let o0 = s0, o1 = s1, o2 = s2, o3 = s3;
      switch (SUIT[c1]) { case 0: o0 |= BIT[c1]; break; case 1: o1 |= BIT[c1]; break; case 2: o2 |= BIT[c1]; break; default: o3 |= BIT[c1]; }
      switch (SUIT[c2]) { case 0: o0 |= BIT[c2]; break; case 1: o1 |= BIT[c2]; break; case 2: o2 |= BIT[c2]; break; default: o3 |= BIT[c2]; }
      const v = scoreMasks(o0, o1, o2, o3);
      if (v > hero) {
        lost = true;
        break; // basta um oponente melhor para perder
      }
      if (v === hero) tiedWith++;
    }
    if (lost) continue;
    if (tiedWith === 0) {
      wins++;
      equitySum += 1;
    } else {
      ties++;
      equitySum += 1 / (tiedWith + 1);
    }
  }

  return {
    equity: equitySum / iterations,
    win: wins / iterations,
    tie: ties / iterations,
    lose: (iterations - wins - ties) / iterations,
    iterations,
  };
}
