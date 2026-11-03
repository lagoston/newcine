/**
 * Grupo da mão no board (SPEC §3.5, "Buckets") e classe pré-flop.
 *
 * Depois do flop: as combinações possíveis do oponente (sem as cartas mortas) são
 * avaliadas com o board, e a mão entra pelo percentil (fração das combinações que a
 * vencem). ~1.000 avaliações por chamada (≈ 0,2 ms no Node); o chamador guarda por rua.
 */
import type { Card } from '../cards.ts';
import { cardIndex, rankOf, suitOf } from '../cards.ts';
import { scoreMasks } from '../evaluator.ts';
import type { HandBucket } from '../types.ts';
import { PREFLOP_RANK } from './preflopTable.ts';

const RANK_CHAR = '23456789TJQKA';

/** 'AKs', 'AKo', 'TT'. */
export function handClass(hole: readonly Card[]): string {
  const r1 = rankOf(hole[0]);
  const r2 = rankOf(hole[1]);
  const hi = Math.max(r1, r2);
  const lo = Math.min(r1, r2);
  const a = RANK_CHAR[hi - 2];
  const b = RANK_CHAR[lo - 2];
  if (hi === lo) return a + b;
  return a + b + (suitOf(hole[0]) === suitOf(hole[1]) ? 's' : 'o');
}

/** "Top X%" da mão inicial (menor = melhor). */
export function preflopPct(hole: readonly Card[]): number {
  return PREFLOP_RANK[handClass(hole)] ?? 100;
}

/** Equivalente pré-flop do bucket, só para tells e para mostrar cartas. */
export function preflopBucket(hole: readonly Card[]): HandBucket {
  const pct = preflopPct(hole);
  if (pct <= 3) return 'nuts';
  if (pct <= 10) return 'strong';
  if (pct <= 25) return 'medium';
  if (pct <= 50) return 'weak';
  return 'air';
}

function masksOf(cards: readonly Card[]): [number, number, number, number] {
  const m: [number, number, number, number] = [0, 0, 0, 0];
  for (const c of cards) {
    const i = cardIndex(c);
    m[i & 3] |= 1 << (i >> 2);
  }
  return m;
}

/** Fração (0..1) das mãos possíveis do oponente que vencem esta (empates contam metade). */
export function handPercentile(hole: readonly Card[], board: readonly Card[]): number {
  const dead = new Uint8Array(52);
  for (const c of hole) dead[cardIndex(c)] = 1;
  for (const c of board) dead[cardIndex(c)] = 1;
  const bm = masksOf(board);
  const hm = masksOf(hole);
  const hero = scoreMasks(bm[0] | hm[0], bm[1] | hm[1], bm[2] | hm[2], bm[3] | hm[3]);
  let better = 0;
  let total = 0;
  for (let a = 0; a < 52; a++) {
    if (dead[a]) continue;
    for (let b = a + 1; b < 52; b++) {
      if (dead[b]) continue;
      const m = [bm[0], bm[1], bm[2], bm[3]];
      m[a & 3] |= 1 << (a >> 2);
      m[b & 3] |= 1 << (b >> 2);
      const v = scoreMasks(m[0], m[1], m[2], m[3]);
      total++;
      if (v > hero) better++;
      else if (v === hero) better += 0.5;
    }
  }
  return total > 0 ? better / total : 0;
}

/** Categoria da melhor mão com as cartas (0 = carta alta … 8 = straight flush). */
export function categoryOf(cards: readonly Card[]): number {
  const m = masksOf(cards);
  return scoreMasks(m[0], m[1], m[2], m[3]) >>> 20;
}

/** Projeto: 4 cartas de um naipe (ao menos uma da mão) ou sequência aberta (com carta da mão). */
export function hasDraw(hole: readonly Card[], board: readonly Card[]): boolean {
  const all = [...hole, ...board];
  for (const s of ['s', 'h', 'd', 'c'] as const) {
    const n = all.filter((c) => suitOf(c) === s).length;
    if (n === 4 && hole.some((c) => suitOf(c) === s)) return true;
  }
  let mask = 0;
  for (const c of all) mask |= 1 << rankOf(c);
  if (mask & (1 << 14)) mask |= 1 << 1;   // ás baixo
  let holeMask = 0;
  for (const c of hole) holeMask |= 1 << rankOf(c);
  if (holeMask & (1 << 14)) holeMask |= 1 << 1;
  // Quatro seguidas com as duas pontas livres (aberta), usando ao menos uma carta da mão.
  for (let lo = 2; lo <= 10; lo++) {
    const four = 0b1111 << lo;
    if ((mask & four) !== four || (holeMask & four) === 0) continue;
    const below = lo - 1 >= 1 ? 1 << (lo - 1) : 0;
    const above = lo + 4 <= 14 ? 1 << (lo + 4) : 0;
    if (below && above && (mask & below) === 0 && (mask & above) === 0) return true;
  }
  return false;
}

/**
 * Bucket do §3.5: nuts ≤ 3% · strong ≤ 15% · medium ≤ 40% com par+ · weak par+ acima de 40%
 * · draw sem par com projeto (flop e turn) · air o resto. Antes do flop: preflopBucket.
 */
export function bucketOf(hole: readonly Card[], board: readonly Card[]): HandBucket {
  if (board.length < 3) return preflopBucket(hole);
  const pct = handPercentile(hole, board);
  if (pct <= 0.03) return 'nuts';
  if (pct <= 0.15) return 'strong';
  const cat = categoryOf([...hole, ...board]);
  if (cat >= 1) return pct <= 0.40 ? 'medium' : 'weak';
  if (board.length < 5 && hasDraw(hole, board)) return 'draw';
  return 'air';
}

/** Monstro (tells): nuts, ou strong com trinca ou melhor. Antes do flop, top 3%. */
export function isMonster(hole: readonly Card[], board: readonly Card[], bucket: HandBucket): boolean {
  if (board.length < 3) return preflopPct(hole) <= 3;
  if (bucket === 'nuts') return true;
  return bucket === 'strong' && categoryOf([...hole, ...board]) >= 3;
}

/** Grupo, monstro e "par ou melhor" da mão (para a decisão, os tells e os logs). */
export function handInfo(hole: readonly Card[], board: readonly Card[]): { bucket: HandBucket; monster: boolean; pairPlus: boolean } {
  const bucket = bucketOf(hole, board);
  const pairPlus = board.length === 0 ? rankOf(hole[0]) === rankOf(hole[1]) : categoryOf([...hole, ...board]) >= 1;
  return { bucket, monster: isMonster(hole, board, bucket), pairPlus };
}

/** "Ar ao mostrar" (falas de blefe, §3.5): carta alta, ou par formado só com cartas do board. */
export function isAirShown(hole: readonly Card[], board: readonly Card[]): boolean {
  if (board.length === 0) return rankOf(hole[0]) !== rankOf(hole[1]) && preflopPct(hole) > 50;
  const withHole = categoryOf([...hole, ...board]);
  if (withHole === 0) return true;
  if (withHole === 1 && board.length >= 2 && categoryOf(board) === 1) {
    // O par está no board e nenhuma carta da mão forma par com ele.
    const ranks = board.map(rankOf);
    return !hole.some((c) => ranks.includes(rankOf(c))) && rankOf(hole[0]) !== rankOf(hole[1]);
  }
  return false;
}
