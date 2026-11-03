/**
 * Faixas dos oponentes (SPEC §3.5, "Faixas"): pesos sobre as 1.326 combinações
 * (`ALL_COMBOS`, compartilhadas; só os pesos mudam), convertidos em WeightedRange.
 *  - random (Sapo): null = mão aleatória;
 *  - static (Cobra): faixa pela ação antes do flop; cada aposta/aumento depois do flop
 *    zera os 40% mais fracos (pelo score no board) do que sobrou;
 *  - bayes (Raposo): faixa pelo modelo (VPIP/PFR daquele oponente); depois do flop cada
 *    ação multiplica os pesos por L[ação][bucket].
 */
import type { Card } from '../cards.ts';
import { cardFromIndex, cardIndex } from '../cards.ts';
import type { ActionRecord } from '../engine.ts';
import type { WeightedRange } from '../equity.ts';
import { scoreIndicesAny, scoreMasks } from '../evaluator.ts';
import type { BotView, HandBucket, PlayerId, RangeModel, StyleLabel } from '../types.ts';
import { handClass } from './buckets.ts';
import { PREFLOP_RANK } from './preflopTable.ts';

export const N_COMBOS = 1326;
const IDX_A = new Uint8Array(N_COMBOS);
const IDX_B = new Uint8Array(N_COMBOS);
export const ALL_COMBOS: ReadonlyArray<readonly [Card, Card]> = (() => {
  const out: [Card, Card][] = [];
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      IDX_A[out.length] = a;
      IDX_B[out.length] = b;
      out.push([cardFromIndex(a), cardFromIndex(b)]);
    }
  }
  return out;
})();

/** [início, fim] do "top %" de cada combinação (a classe ocupa uma faixa). */
const PCT_START = new Float32Array(N_COMBOS);
const PCT_END = new Float32Array(N_COMBOS);
{
  const width: Record<string, number> = {};
  for (const combo of ALL_COMBOS) {
    const cls = handClass(combo);
    width[cls] = cls.length === 2 ? 6 : cls.endsWith('s') ? 4 : 12;
  }
  ALL_COMBOS.forEach((combo, i) => {
    const cls = handClass(combo);
    PCT_END[i] = PREFLOP_RANK[cls];
    PCT_START[i] = PREFLOP_RANK[cls] - (width[cls] / N_COMBOS) * 100;
  });
}

/** Peso de cada combinação no "top pct%" (a classe na fronteira entra pela fração). */
export function topWeights(pct: number, out = new Float64Array(N_COMBOS)): Float64Array {
  for (let i = 0; i < N_COMBOS; i++) {
    const s = PCT_START[i];
    const e = PCT_END[i];
    out[i] = pct >= e ? 1 : pct <= s ? 0 : (pct - s) / (e - s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ranking de todas as combinações num board (cache pequeno: o mesmo board se repete
// em várias decisões da mesma mão)
// ---------------------------------------------------------------------------

export const BUCKETS: readonly HandBucket[] = ['nuts', 'strong', 'medium', 'weak', 'draw', 'air'];

export interface BoardInfo {
  /** Score de cada combinação com o board (−1 = colide com o board). */
  score: Int32Array;
  /** Índice em BUCKETS (255 = colide). */
  bucket: Uint8Array;
}

const cache = new Map<string, BoardInfo>();

function flushOrOpenDraw(bs: Int32Array, a: number, b: number): boolean {
  // projeto de flush: 4 do naipe, ao menos uma da mão
  for (let s = 0; s < 4; s++) {
    let m = bs[s];
    let mine = 0;
    if ((a & 3) === s) { m |= 1 << (a >> 2); mine++; }
    if ((b & 3) === s) { m |= 1 << (b >> 2); mine++; }
    if (mine > 0) {
      let n = 0;
      for (let x = m; x; x &= x - 1) n++;
      if (n === 4) return true;
    }
  }
  // sequência aberta com carta da mão (bits 0..12 = 2..A; ás baixo no bit −1)
  const all = bs[0] | bs[1] | bs[2] | bs[3] | (1 << (a >> 2)) | (1 << (b >> 2));
  const handM = (1 << (a >> 2)) | (1 << (b >> 2));
  const r = (all << 1) | ((all >> 12) & 1);
  const h = (handM << 1) | ((handM >> 12) & 1);
  for (let lo = 1; lo <= 9; lo++) {
    const four = 0b1111 << lo;
    if ((r & four) !== four || (h & four) === 0) continue;
    const below = 1 << (lo - 1);
    const above = lo + 4 <= 13 ? 1 << (lo + 4) : 0;
    if (above && (r & below) === 0 && (r & above) === 0) return true;
  }
  return false;
}

export function boardInfo(board: readonly Card[]): BoardInfo {
  const key = board.join('');
  const hit = cache.get(key);
  if (hit) return hit;
  const bs = new Int32Array(4);
  const used = new Uint8Array(52);
  // Board com carta repetida (Cassino): as máscaras perderiam a cópia; avalia por contagem.
  let repeated = false;
  for (const c of board) {
    const i = cardIndex(c);
    if (used[i]) repeated = true;
    used[i] = 1;
    bs[i & 3] |= 1 << (i >> 2);
  }
  const buf = new Uint8Array(board.length + 2);
  board.forEach((c, k) => { buf[k] = cardIndex(c); });
  const score = new Int32Array(N_COMBOS).fill(-1);
  const order: number[] = [];
  for (let k = 0; k < N_COMBOS; k++) {
    const a = IDX_A[k];
    const b = IDX_B[k];
    if (used[a] || used[b]) continue;
    if (repeated) {
      buf[board.length] = a;
      buf[board.length + 1] = b;
      score[k] = scoreIndicesAny(buf, board.length + 2);
    } else {
      const m0 = bs[0], m1 = bs[1], m2 = bs[2], m3 = bs[3];
      const ma = [m0, m1, m2, m3];
      ma[a & 3] |= 1 << (a >> 2);
      ma[b & 3] |= 1 << (b >> 2);
      score[k] = scoreMasks(ma[0], ma[1], ma[2], ma[3]);
    }
    order.push(k);
  }
  order.sort((x, y) => score[y] - score[x]);
  const n = order.length;
  const bucket = new Uint8Array(N_COMBOS).fill(255);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && score[order[j]] === score[order[i]]) j++;
    const pct = (i + (j - i - 1) / 2) / n;   // fração que vence esta mão (empates: metade)
    for (let t = i; t < j; t++) {
      const k = order[t];
      const cat = score[k] >>> 20;
      let b: number;
      if (pct <= 0.03) b = 0;
      else if (pct <= 0.15) b = 1;
      else if (cat >= 1) b = pct <= 0.40 ? 2 : 3;
      else if (board.length < 5 && flushOrOpenDraw(bs, IDX_A[k], IDX_B[k])) b = 4;
      else b = 5;
      bucket[k] = b;
    }
    i = j;
  }
  const info = { score, bucket };
  if (cache.size >= 24) cache.delete(cache.keys().next().value as string);
  cache.set(key, info);
  return info;
}

// ---------------------------------------------------------------------------
// Faixas por oponente
// ---------------------------------------------------------------------------

/**
 * Quanto uma aposta/aumento estreita a faixa (calibração A3, 03/11/2026). O §3.5 manda
 * cortar 40% (estática) e usar L[aposta] cheio (bayes); com isso os bots largavam demais
 * para quem aposta sempre (o maniac vencia 23%) e quase nunca pagavam o valor de quem
 * joga direito (o médio perdia fichas). Os bots agora acreditam pouco em aposta: pagam
 * demais — o vazamento que o TAG explora apostando valor e que é o certo contra o maniac.
 */
const STATIC_BET_CUT = 0.15;
const BAYES_BET_WEIGHT = 0.5;

/** L[ação][bucket] do §3.5 (ordem de BUCKETS). */
const L_AGGR = [1.0, 0.9, 0.5, 0.25, 0.6, 0.35];
const L_CALL = [0.6, 0.9, 1.0, 0.6, 0.9, 0.15];
const L_CHECK = [0.4, 0.6, 0.9, 1.0, 0.8, 1.0];

export interface RangeCtx {
  /** Taxas do modelo do Raposo para este oponente (frações). */
  rates?: { vpip: number; pfr: number };
  labels?: ReadonlySet<StyleLabel>;
  /** 1 = aposta informa normalmente; perto de 0 = não informa (quem aposta tudo); até 2
   *  contra quem quase nunca aposta (a aposta dele vale o L cheio do §3.5). */
  aggrWeight?: number;
}

function boardAt(v: BotView, street: ActionRecord['street']): Card[] {
  // Pôster Poker: no river vale o board inteiro (6 cartas no Onze Homens). Com o flop
  // antecipado (Golpe de Mestre) não há ação de 'flop'; o turn já tem 4 cartas.
  if (street === 'river') return v.board.slice();
  const n = street === 'flop' ? 3 : 4;
  return v.board.slice(0, n);
}

/** A faixa de `oppId` vista por quem decide. null = mão aleatória. */
export function rangeFor(oppId: PlayerId, v: BotView, model: RangeModel, ctx: RangeCtx = {}): WeightedRange | null {
  if (model === 'random') return null;
  const acts = v.actions.filter((a) => a.playerId === oppId);
  const pre = v.actions.filter((a) => a.street === 'preflop');
  const raiseNo = (rec: ActionRecord): number => pre.slice(0, pre.indexOf(rec) + 1).filter((a) => a.type === 'bet' || a.type === 'raise').length;
  const myPre = acts.filter((a) => a.street === 'preflop');
  const lastRaise = [...myPre].reverse().find((a) => a.type === 'bet' || a.type === 'raise');
  const called = myPre.some((a) => a.type === 'call');
  const w = new Float64Array(N_COMBOS);
  if (model === 'static') {
    if (lastRaise) {
      const k = raiseNo(lastRaise);
      topWeights(k === 1 ? 35 : k === 2 ? 10 : 5, w);
    } else if (called) topWeights(45, w);
    else w.fill(1);
  } else {
    const vpip = 100 * (ctx.rates?.vpip ?? 0.30);
    const pfr = 100 * (ctx.rates?.pfr ?? 0.18);
    if (lastRaise) {
      const k = raiseNo(lastRaise);
      topWeights(k === 1 ? Math.max(4, pfr) : k === 2 ? Math.max(3, pfr * 0.4) : Math.max(2, pfr * 0.2), w);
    } else if (called) {
      const top = topWeights(Math.max(vpip, 5));
      const cut = topWeights(0.6 * pfr);
      for (let i = 0; i < N_COMBOS; i++) w[i] = Math.max(0.05 * top[i], top[i] - cut[i]);
    } else w.fill(1);
  }
  // Cartas que quem decide conhece (a própria mão e o board) não podem estar com o oponente.
  const dead = new Uint8Array(52);
  for (const c of [...v.hole, ...v.board]) dead[cardIndex(c)] = 1;
  for (let k = 0; k < N_COMBOS; k++) if (dead[IDX_A[k]] || dead[IDX_B[k]]) w[k] = 0;

  for (const a of acts) {
    if (a.street === 'preflop' || a.type === 'fold') continue;
    const info = boardInfo(boardAt(v, a.street));
    const aggr = a.type === 'bet' || a.type === 'raise';
    if (model === 'static') {
      if (!aggr) continue;
      // Zera os 40% mais fracos (por massa de peso) do que sobrou.
      const live: number[] = [];
      let mass = 0;
      for (let k = 0; k < N_COMBOS; k++) if (w[k] > 0 && info.score[k] >= 0) { live.push(k); mass += w[k]; }
      live.sort((x, y) => info.score[x] - info.score[y]);
      let cut = STATIC_BET_CUT * mass;
      for (const k of live) {
        if (cut <= 0) break;
        cut -= w[k];
        w[k] = 0;
      }
    } else {
      const L = aggr ? L_AGGR.slice() : a.type === 'call' ? L_CALL.slice() : L_CHECK;
      if (aggr && ctx.labels?.has('blefador')) L[5] = 0.70;
      if (aggr) {
        // Peso da aposta: metade do L[aposta] do §3.5, vezes a leitura do modelo (até 2×
        // contra quem quase não agride — aí vale o L cheio; bem menos contra quem agride
        // demais). Sem modelo, só a metade.
        const k = Math.min(1, BAYES_BET_WEIGHT * (ctx.aggrWeight ?? 1));
        for (let i = 0; i < L.length; i++) L[i] = 1 - (1 - L[i]) * k;
      }
      if (a.type === 'call' && ctx.labels?.has('pagaTudo')) L[3] = 0.9;
      for (let k = 0; k < N_COMBOS; k++) {
        const b = info.bucket[k];
        if (w[k] > 0 && b !== 255) w[k] *= L[b];
      }
    }
  }
  let total = 0;
  for (let k = 0; k < N_COMBOS; k++) total += w[k];
  if (total < 1) return null;   // faixa vazia ou quase: trata como aleatória
  return { combos: ALL_COMBOS, weights: Array.from(w) };
}

/**
 * Pôster Poker (03/11/2026, Cartas na Mesa): o oponente tem cartas viradas (1 ou 2). A faixa
 * fica só com as combinações que contêm essas cartas (mantendo os pesos da leitura; se a
 * leitura zerou todas, vale qualquer uma que as contenha). Sem carta conhecida, a faixa
 * volta como veio (null = aleatória).
 */
export function withKnown(range: WeightedRange | null, known: readonly Card[] | undefined, deadCards: readonly Card[]): WeightedRange | null {
  if (!known || known.length === 0) return range;
  const dead = new Set<string>(deadCards);
  const fits = (combo: readonly [Card, Card]): boolean => {
    if (dead.has(combo[0]) && !known.includes(combo[0])) return false;
    if (dead.has(combo[1]) && !known.includes(combo[1])) return false;
    return known.length === 1 ? combo[0] === known[0] || combo[1] === known[0]
      : (combo[0] === known[0] && combo[1] === known[1]) || (combo[0] === known[1] && combo[1] === known[0]);
  };
  if (known.length >= 2) return { combos: [[known[0], known[1]]] };
  const w = new Array<number>(N_COMBOS).fill(0);
  let total = 0;
  ALL_COMBOS.forEach((combo, i) => {
    if (!fits(combo)) return;
    w[i] = range && range.combos === ALL_COMBOS ? range.weights?.[i] ?? 1 : 1;
    total += w[i];
  });
  if (total <= 0) ALL_COMBOS.forEach((combo, i) => { w[i] = fits(combo) ? 1 : 0; });
  return { combos: ALL_COMBOS, weights: w };
}
