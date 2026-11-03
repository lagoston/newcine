/**
 * Tempo de pensar e pista de corpo (SPEC §3.6). Sorteados por quem tem as cartas, com o
 * fluxo `think` do RNG, a partir do perfil (tabelas `tells` e `think`).
 */
import type { Rng } from '../rng.ts';
import type { BotProfile, Cue, HandBucket, MinMax, SizeClass, TellSituation, ThinkSituation } from '../types.ts';

export interface TellInput {
  /** Ação como o motor a registra (all-in vira call/bet/raise). */
  type: 'fold' | 'check' | 'call' | 'bet' | 'raise';
  street: 'preflop' | 'flop' | 'turn' | 'river';
  sizeClass: SizeClass | null;
  allIn: boolean;
  shortAllIn: boolean;
  /** Pagou/enfrentou aposta (toCall > 0 antes de agir). */
  facingBet: boolean;
  bucket: HandBucket;
  monster: boolean;
  /** Par ou melhor com as cartas da mão + board. */
  pairPlus: boolean;
}

const CUES: readonly Cue[] = ['calado', 'nervoso', 'confiante', 'neutro'];

function isAggressive(t: TellInput): boolean {
  return t.type === 'bet' || t.type === 'raise';
}

/** Aposta/aumento grande: ≥ 0,75 do pote, ou all-in que não é curto. */
function isBigBet(t: TellInput): boolean {
  return isAggressive(t) && (t.sizeClass === 'big' || t.sizeClass === 'overbet' || (t.allIn && !t.shortAllIn));
}

function isBluffBet(t: TellInput): boolean {
  return isAggressive(t) && (t.bucket === 'air' || t.bucket === 'draw' || t.bucket === 'weak');
}

/** Situação da tabela de tells, na ordem em que o §3.6 lista as linhas. */
export function tellSituation(p: BotProfile, t: TellInput): TellSituation {
  const has = (s: TellSituation): boolean => p.tells[s] !== undefined;
  if (has('bigBetMonster') && isBigBet(t)) return t.monster ? 'bigBetMonster' : 'bigBetNoMonster';
  if (has('callWeakPair') && t.type === 'call' && (t.bucket === 'medium' || t.bucket === 'weak') && t.pairPlus) return 'callWeakPair';
  if (has('otherPairPlus') || has('otherNoPair')) return t.pairPlus ? 'otherPairPlus' : 'otherNoPair';
  if (has('bluffBet') && isBluffBet(t)) return 'bluffBet';
  if (has('valueBet') && isAggressive(t) && (t.bucket === 'strong' || t.bucket === 'nuts')) return 'valueBet';
  if (has('passiveDraw') && (t.type === 'call' || t.type === 'check') && t.bucket === 'draw') return 'passiveDraw';
  if (has('riverNuts') && t.street === 'river' && t.bucket === 'nuts') return 'riverNuts';
  return 'rest';
}

/** Situação da faixa de tempo. */
export function thinkSituation(p: BotProfile, t: TellInput): ThinkSituation {
  const has = (s: ThinkSituation): boolean => p.think.ranges[s] !== undefined;
  if (has('monster') && t.monster) return 'monster';
  if (has('bluff') && isBluffBet(t)) return 'bluff';
  if (has('strong') && (t.bucket === 'strong' || t.bucket === 'nuts')) return 'strong';
  if (has('doubt') && t.facingBet && (t.bucket === 'weak' || t.bucket === 'medium')) return 'doubt';
  return 'rest';
}

function uniformMs(r: MinMax, rng: Rng): number {
  const lo = Math.round(r.min);
  const hi = Math.max(lo, Math.round(r.max));
  return lo + Math.floor(rng.nextFloat() * (hi - lo + 1));
}

function clampMs(ms: number): number {
  return Math.min(7000, Math.max(300, Math.round(ms)));
}

/** thinkMs (inteiro entre 300 e 7.000) e cue. Ordem fixa de consumo do RNG. */
export function tellsFor(p: BotProfile, t: TellInput, rng: Rng): { thinkMs: number; cue: Cue } {
  // 1) tempo
  const tank = rng.nextFloat() < p.think.tankChance;
  const swap = rng.nextFloat() >= p.think.fidelity;
  let range: MinMax | undefined;
  if (tank) {
    range = p.think.tank;
  } else {
    const keys = (Object.keys(p.think.ranges) as ThinkSituation[]).filter((k) => p.think.ranges[k]);
    const own = thinkSituation(p, t);
    let key = own;
    if (swap && keys.length > 1) {
      const others = keys.filter((k) => k !== own);
      key = others[Math.floor(rng.nextFloat() * others.length)] ?? own;
    }
    range = p.think.ranges[key] ?? p.think.ranges.rest ?? { min: 800, max: 1600 };
  }
  const thinkMs = clampMs(uniformMs(range, rng));
  // 2) pista de corpo
  const row = p.tells[tellSituation(p, t)] ?? p.tells.rest;
  let cue: Cue = 'neutro';
  if (row) {
    const u = rng.nextFloat();
    let acc = 0;
    for (const c of CUES) {
      acc += row[c] ?? 0;
      if (u < acc) {
        cue = c;
        break;
      }
    }
  }
  return { thinkMs, cue };
}
