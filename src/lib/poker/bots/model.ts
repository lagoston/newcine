/**
 * Modelo do Raposo (SPEC §3.5): contadores por oponente, só com ações públicas e cartas
 * abertas. A cada mão nova todos os floats × 0,95; taxa = (x + prior·w)/(n + w), com
 * w = difficulty.adaptDelay. Rótulos com amostra mínima, os MESMOS para decidir e para as
 * falas (`styleRead`). Entre partidas fica 30% (livre → localStorage; prêmio → banco).
 */
import type { Card } from '../cards.ts';
import type { HandResult } from '../engine.ts';
import type { MatchState, OppCounters, PlayerId, StyleLabel } from '../types.ts';
import { isAirShown } from './buckets.ts';

export const DECAY = 0.95;
export const MEMORY_SHARE = 0.3;
export const PRIORS = { vpip: 0.30, pfr: 0.18, foldToCbet: 0.45, af: 1.5, riverBluff: 0.30 };

export function emptyCounters(): OppCounters {
  return {
    hands: 0, vpip: 0, pfr: 0,
    nCbetFaced: 0, foldToCbet: 0,
    postBets: 0, postCalls: 0,
    riverBetsShown: 0, riverBluffsShown: 0,
    pfShoves: 0,
    raw: { hands: 0, cbetFaced: 0, riverBetsShown: 0 },
  };
}

export interface Rates { vpip: number; pfr: number; foldToCbet: number; af: number; riverBluff: number }

export function ratesOf(c: OppCounters, w: number): Rates {
  const r = (x: number, n: number, prior: number): number => (x + prior * w) / (n + w);
  return {
    vpip: r(c.vpip, c.hands, PRIORS.vpip),
    pfr: r(c.pfr, c.hands, PRIORS.pfr),
    foldToCbet: r(c.foldToCbet, c.nCbetFaced, PRIORS.foldToCbet),
    af: (c.postBets + PRIORS.af * w) / (c.postCalls + w),
    riverBluff: r(c.riverBluffsShown, c.riverBetsShown, PRIORS.riverBluff),
  };
}

/** Rótulos que valem agora (§3.5). */
export function labelsOf(c: OppCounters, w: number): StyleLabel[] {
  const t = ratesOf(c, w);
  const out: StyleLabel[] = [];
  if (c.raw.hands >= 15 && t.vpip < 0.22) out.push('pedra');
  if (c.raw.hands >= 15 && t.vpip > 0.45) out.push('solto');
  if (c.raw.cbetFaced >= 6 && t.foldToCbet < 0.35) out.push('pagaTudo');
  if (c.raw.riverBetsShown >= 3 && t.riverBluff >= 0.40) out.push('blefador');
  return out;
}

export interface ModelView {
  rates(id: PlayerId): Rates;
  /**
   * Leitura rápida (A3, 03/11/2026): as mesmas taxas com o prior pesando um terço.
   * Só para sinais "altos" — quanto alguém aumenta antes do flop e o AF —, que mudam a
   * decisão já nas primeiras mãos (quem aumenta 60% das mãos se vê em 5 mãos). Os
   * rótulos (e as falas) continuam com o atraso normal.
   */
  quick(id: PlayerId): Rates;
  counters(id: PlayerId): OppCounters | undefined;
  has(id: PlayerId | null | undefined, label: StyleLabel): boolean;
  labels(id: PlayerId): Set<StyleLabel>;
}

export function modelView(model: Record<string, OppCounters> | undefined, w: number): ModelView | undefined {
  if (!model) return undefined;
  const get = (id: PlayerId): OppCounters => model[id] ?? emptyCounters();
  return {
    rates: (id) => ratesOf(get(id), w),
    quick: (id) => ratesOf(get(id), w / 3),
    counters: (id) => model[id],
    has: (id, label) => !!id && labelsOf(get(id), w).includes(label),
    labels: (id) => new Set(labelsOf(get(id), w)),
  };
}

const isAggr = (t: string): boolean => t === 'bet' || t === 'raise';

/**
 * Fim de mão: decaimento e contagem pública. `shown` = cartas que ficaram abertas
 * (showdown, runout, cardsShown). Altera `model` no lugar.
 */
export function updateModel(model: Record<string, OppCounters>, result: HandResult, shown: Record<string, Card[]>): void {
  const acts = result.actions;
  const pre = acts.filter((a) => a.street === 'preflop');
  const pfAggr = [...pre].reverse().find((a) => isAggr(a.type))?.playerId ?? null;
  const flop = acts.filter((a) => a.street === 'flop');
  const firstBet = flop.findIndex((a) => isAggr(a.type));
  const cbet = pfAggr && firstBet >= 0 && flop[firstBet].playerId === pfAggr && flop[firstBet].type === 'bet' ? firstBet : -1;
  for (const [id, c] of Object.entries(model)) {
    c.hands *= DECAY; c.vpip *= DECAY; c.pfr *= DECAY; c.nCbetFaced *= DECAY; c.foldToCbet *= DECAY;
    c.postBets *= DECAY; c.postCalls *= DECAY; c.riverBetsShown *= DECAY; c.riverBluffsShown *= DECAY; c.pfShoves *= DECAY;
    if (result.startStacks[id] === undefined) continue;
    c.hands += 1;
    c.raw.hands += 1;
    const mine = acts.filter((a) => a.playerId === id);
    const minePre = mine.filter((a) => a.street === 'preflop');
    if (minePre.some((a) => a.type === 'call' || isAggr(a.type))) c.vpip += 1;
    if (minePre.some((a) => isAggr(a.type))) c.pfr += 1;
    if (minePre.some((a) => isAggr(a.type) && a.allIn)) c.pfShoves += 1;
    for (const a of mine) {
      if (a.street === 'preflop') continue;
      if (isAggr(a.type)) c.postBets += 1;
      else if (a.type === 'call') c.postCalls += 1;
    }
    if (cbet >= 0 && pfAggr !== id) {
      const reply = flop.slice(cbet + 1).find((a) => a.playerId === id);
      if (reply) {
        c.nCbetFaced += 1;
        c.raw.cbetFaced += 1;
        if (reply.type === 'fold') c.foldToCbet += 1;
      }
    }
    const riverAggr = mine.some((a) => a.street === 'river' && isAggr(a.type));
    const cards = shown[id];
    if (riverAggr && cards && cards.length === 2) {
      c.riverBetsShown += 1;
      c.raw.riverBetsShown += 1;
      if (isAirShown(cards, result.board)) c.riverBluffsShown += 1;
    }
  }
}

/** A pessoa (ou outro) mostrou depois de levar sem showdown: conta a aposta de river vista. */
export function modelOnShow(model: Record<string, OppCounters>, result: HandResult, id: PlayerId, cards: Card[]): void {
  const c = model[id];
  if (!c) return;
  const riverAggr = result.actions.some((a) => a.playerId === id && a.street === 'river' && isAggr(a.type));
  if (!riverAggr) return;
  c.riverBetsShown += 1;
  c.raw.riverBetsShown += 1;
  if (isAirShown(cards, result.board)) c.riverBluffsShown += 1;
}

/** Memória que o Raposo leva para a próxima partida: 30% dos contadores sobre a pessoa. */
export function raposoMemory(s: MatchState): Record<PlayerId, OppCounters> | null {
  for (const [id, mem] of Object.entries(s.bots)) {
    if (!mem.model || !s.config.profiles[id]?.model.enabled) continue;
    const c = mem.model.human;
    if (!c) return null;
    const k = MEMORY_SHARE;
    return {
      human: {
        hands: c.hands * k, vpip: c.vpip * k, pfr: c.pfr * k, nCbetFaced: c.nCbetFaced * k, foldToCbet: c.foldToCbet * k,
        postBets: c.postBets * k, postCalls: c.postCalls * k, riverBetsShown: c.riverBetsShown * k,
        riverBluffsShown: c.riverBluffsShown * k, pfShoves: c.pfShoves * k,
        raw: { hands: Math.round(c.raw.hands * k), cbetFaced: Math.round(c.raw.cbetFaced * k), riverBetsShown: Math.round(c.raw.riverBetsShown * k) },
      },
    } as Record<PlayerId, OppCounters>;
  }
  return null;
}
