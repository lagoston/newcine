// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/evaluator.ts
/**
 * Avaliador de mãos de poker (melhor mão de 5 entre 1 e 7 cartas).
 *
 * Em vez de gerar as 21 combinações de 5 cartas, a mão é representada por
 * 4 bitmasks de 13 bits (um por naipe; bit 0 = 2, bit 12 = Ás). Com isso:
 *  - cor (flush) = algum naipe com 5+ bits;
 *  - sequência = 5 bits consecutivos na união dos naipes (tabela pré-calculada);
 *  - pares/trincas/quadras saem de um "somador em fatias de bits": somamos os
 *    4 naipes bit a bit e obtemos, para cada valor de carta, quantas vezes ele
 *    aparece, sem laço por carta e sem alocar memória.
 *
 * Pontuação (score): inteiro de 24 bits = categoria (4 bits) seguida de até
 * 5 valores de carta (4 bits cada), do mais importante para o menos importante.
 * Basta comparar números: maior vence, igual empata (divide o pote).
 */
import type { Card, Rank, Suit } from './cards.ts';
import { RANK_CHARS, SUITS, cardIndex, isCard } from './cards.ts';

export type HandKind =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'quads'
  | 'straight_flush';

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Índice = categoria. */
export const HAND_KINDS: readonly HandKind[] = [
  'high_card',
  'pair',
  'two_pair',
  'trips',
  'straight',
  'flush',
  'full_house',
  'quads',
  'straight_flush',
];

export interface HandValue {
  /** 0 = carta alta ... 8 = straight flush. */
  category: HandCategory;
  /** Comparável: maior vence; igual = empate. */
  score: number;
  /** As 5 cartas que formam a mão, na ordem de importância (grupo principal, depois kickers). */
  best5: Card[];
  kind: HandKind;
  /** Straight flush até o Ás. */
  royal: boolean;
}

const CAT_SHIFT = 20;
const WHEEL_MASK = 0x100f; // A, 2, 3, 4, 5

/** STRAIGHT_HIGH[mask] = valor (5..14) da carta mais alta da maior sequência no mask, ou 0. */
const STRAIGHT_HIGH = new Uint8Array(8192);
/** POPCOUNT[mask] = quantidade de bits ligados. */
const POPCOUNT = new Uint8Array(8192);

for (let mask = 0; mask < 8192; mask++) {
  POPCOUNT[mask] = (mask & 1) + POPCOUNT[mask >> 1];
  let high = 0;
  for (let top = 12; top >= 4; top--) {
    const window = 0x1f << (top - 4);
    if ((mask & window) === window) {
      high = top + 2;
      break;
    }
  }
  // A roda (A-2-3-4-5) é a menor sequência: o Ás conta como 1 e a carta alta é o 5.
  if (high === 0 && (mask & WHEEL_MASK) === WHEEL_MASK) high = 5;
  STRAIGHT_HIGH[mask] = high;
}

/**
 * Acrescenta ao score até `n` kickers (os bits mais altos de `mask`) e completa
 * com zeros até ter 5 posições, para que mãos com menos cartas continuem comparáveis.
 */
function withKickers(score: number, used: number, mask: number, n: number): number {
  for (let i = 0; i < n && mask !== 0; i++) {
    const b = 31 - Math.clz32(mask);
    mask ^= 1 << b;
    score = (score << 4) | (b + 2);
    used++;
  }
  return score << ((5 - used) << 2);
}

/**
 * Núcleo do avaliador: recebe os bitmasks de espadas, copas, ouros e paus
 * (bit r-2 ligado = tem a carta de valor r daquele naipe) e devolve o score.
 * É o caminho mais rápido; a equidade usa diretamente.
 */
export function scoreMasks(spades: number, hearts: number, diamonds: number, clubs: number): number {
  const all = spades | hearts | diamonds | clubs;

  // Com até 7 cartas, no máximo um naipe chega a 5.
  let flush = 0;
  if (POPCOUNT[spades] >= 5) flush = spades;
  else if (POPCOUNT[hearts] >= 5) flush = hearts;
  else if (POPCOUNT[diamonds] >= 5) flush = diamonds;
  else if (POPCOUNT[clubs] >= 5) flush = clubs;

  if (flush !== 0) {
    // O straight flush é procurado só dentro do naipe da cor: uma sequência
    // "misturada" com uma cor ao lado não é straight flush.
    const sf = STRAIGHT_HIGH[flush];
    if (sf !== 0) return (8 << CAT_SHIFT) | (sf << 16);
  }

  // Somador em fatias de bits: (b2 b1 b0) = quantas vezes cada valor aparece (0..4).
  let b0 = spades;
  let b1 = 0;
  let b2 = 0;
  let carry = b0 & hearts;
  b0 ^= hearts;
  b1 = carry;
  carry = b0 & diamonds;
  b0 ^= diamonds;
  b2 |= b1 & carry;
  b1 ^= carry;
  carry = b0 & clubs;
  b0 ^= clubs;
  b2 |= b1 & carry;
  b1 ^= carry;

  const quads = b2; // 100
  const trips = b1 & b0; // 011
  const pairs = b1 & ~b0; // 010 (b2 só liga quando b1 e b0 estão desligados)

  if (quads !== 0) {
    const q = 31 - Math.clz32(quads);
    return withKickers((7 << 4) | (q + 2), 1, all ^ (1 << q), 1);
  }

  if (trips !== 0) {
    const t = 31 - Math.clz32(trips);
    // O "par" do full house pode vir de uma segunda trinca (7-7-7-5-5-5 = 7 full de 5)
    // e vale sempre o maior disponível entre trincas restantes e pares.
    const rest = (trips ^ (1 << t)) | pairs;
    if (rest !== 0) {
      const p = 31 - Math.clz32(rest);
      return ((6 << 8) | ((t + 2) << 4) | (p + 2)) << 12;
    }
  }

  if (flush !== 0) return withKickers(5, 0, flush, 5);

  const straight = STRAIGHT_HIGH[all];
  if (straight !== 0) return ((4 << 4) | straight) << 16;

  if (trips !== 0) {
    const t = 31 - Math.clz32(trips);
    return withKickers((3 << 4) | (t + 2), 1, all ^ (1 << t), 2);
  }

  if (pairs !== 0) {
    const p1 = 31 - Math.clz32(pairs);
    const others = pairs ^ (1 << p1);
    if (others !== 0) {
      // Com três pares, o terceiro par vira candidato a kicker (entra em `all`).
      const p2 = 31 - Math.clz32(others);
      return withKickers((((2 << 4) | (p1 + 2)) << 4) | (p2 + 2), 2, all ^ (1 << p1) ^ (1 << p2), 1);
    }
    return withKickers((1 << 4) | (p1 + 2), 1, all ^ (1 << p1), 3);
  }

  return withKickers(0, 0, all, 5);
}

/** Score a partir de cartas, sem validação (caminho rápido). Aceita de 1 a 7 cartas. */
export function scoreCards(cards: readonly Card[]): number {
  let s = 0;
  let h = 0;
  let d = 0;
  let c = 0;
  for (let i = 0; i < cards.length; i++) {
    const idx = cardIndex(cards[i]);
    const bit = 1 << (idx >> 2);
    switch (idx & 3) {
      case 0: s |= bit; break;
      case 1: h |= bit; break;
      case 2: d |= bit; break;
      default: c |= bit;
    }
  }
  return scoreMasks(s, h, d, c);
}

/** Score a partir de índices 0..51 (os `n` primeiros de `indices`). */
export function scoreIndices(indices: ArrayLike<number>, n: number = indices.length): number {
  let s = 0;
  let h = 0;
  let d = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const idx = indices[i];
    const bit = 1 << (idx >> 2);
    switch (idx & 3) {
      case 0: s |= bit; break;
      case 1: h |= bit; break;
      case 2: d |= bit; break;
      default: c |= bit;
    }
  }
  return scoreMasks(s, h, d, c);
}

export function categoryOfScore(score: number): HandCategory {
  return (score >>> CAT_SHIFT) as HandCategory;
}

export function kindOfScore(score: number): HandKind {
  return HAND_KINDS[score >>> CAT_SHIFT];
}

/** Valores relevantes codificados no score (sem os zeros de preenchimento). */
export function ranksOfScore(score: number): Rank[] {
  const out: Rank[] = [];
  for (let shift = 16; shift >= 0; shift -= 4) {
    const r = (score >>> shift) & 15;
    if (r !== 0) out.push(r as Rank);
  }
  return out;
}

/** > 0 se `a` vence, < 0 se `b` vence, 0 se empatam. */
export function compareScores(a: number, b: number): number {
  return a - b;
}

/**
 * Avaliação completa (com as 5 cartas e a categoria). Valida as cartas e
 * rejeita duplicadas. Aceita de 1 a 7 cartas: com menos de 5, as categorias
 * que exigem 5 cartas (sequência, cor) simplesmente não aparecem — útil para
 * mostrar "par de ases" ainda no pré-flop.
 */
export function evaluateHand(cards: readonly Card[]): HandValue {
  const n = cards.length;
  if (n < 1 || n > 7) throw new RangeError(`evaluateHand: esperado de 1 a 7 cartas, recebeu ${n}.`);
  const masks = [0, 0, 0, 0];
  for (const card of cards) {
    if (!isCard(card)) throw new Error(`Carta inválida: "${String(card)}"`);
    const idx = cardIndex(card);
    const bit = 1 << (idx >> 2);
    if ((masks[idx & 3] & bit) !== 0) throw new Error(`Carta repetida: ${card}`);
    masks[idx & 3] |= bit;
  }
  const score = scoreMasks(masks[0], masks[1], masks[2], masks[3]);
  const category = categoryOfScore(score);
  const ranks = ranksOfScore(score);

  const used = new Array<boolean>(n).fill(false);
  const best5: Card[] = [];
  const take = (rank: number, count: number, suit: Suit | null): void => {
    const ch = RANK_CHARS[rank - 2];
    for (let i = 0; i < n && count > 0; i++) {
      if (used[i]) continue;
      const card = cards[i];
      if (card[0] !== ch || (suit !== null && card[1] !== suit)) continue;
      used[i] = true;
      best5.push(card);
      count--;
    }
  };
  const straightRanks = (high: number): number[] =>
    high === 5 ? [5, 4, 3, 2, 14] : [high, high - 1, high - 2, high - 3, high - 4];
  let flushSuit: Suit | null = null;
  for (let s = 0; s < 4; s++) if (POPCOUNT[masks[s]] >= 5) flushSuit = SUITS[s];

  switch (category) {
    case 8:
      for (const r of straightRanks(ranks[0])) take(r, 1, flushSuit);
      break;
    case 7:
      take(ranks[0], 4, null);
      if (ranks[1] !== undefined) take(ranks[1], 1, null);
      break;
    case 6:
      take(ranks[0], 3, null);
      take(ranks[1], 2, null);
      break;
    case 5:
      for (const r of ranks) take(r, 1, flushSuit);
      break;
    case 4:
      for (const r of straightRanks(ranks[0])) take(r, 1, null);
      break;
    case 3:
      take(ranks[0], 3, null);
      for (const r of ranks.slice(1)) take(r, 1, null);
      break;
    case 2:
      take(ranks[0], 2, null);
      take(ranks[1], 2, null);
      for (const r of ranks.slice(2)) take(r, 1, null);
      break;
    case 1:
      take(ranks[0], 2, null);
      for (const r of ranks.slice(1)) take(r, 1, null);
      break;
    default:
      for (const r of ranks) take(r, 1, null);
  }

  return {
    category,
    score,
    best5,
    kind: HAND_KINDS[category],
    royal: category === 8 && ranks[0] === 14,
  };
}

/** Compara duas mãos de 5–7 cartas: > 0 se `a` vence, < 0 se `b` vence, 0 = empate. */
export function compareHands(a: readonly Card[], b: readonly Card[]): number {
  return scoreCards(a) - scoreCards(b);
}
