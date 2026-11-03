/**
 * Apoio comum aos testes e ao simulador do poker (pacote A): asserções, configs de
 * partida e uma "pessoa" que joga ações legais ao acaso.
 */
import {
  DEFAULT_DIFFICULTY, DEFAULT_PROFILES, DEFAULT_SETTINGS, applyHumanAction, createMatch, createRng, humanLegal,
} from '../../../src/lib/poker/index.ts';
import type {
  LegalActions, MatchConfig, MatchEvent, MatchState, MatchStep, PlayerAction, PosterEffectId, Rarity, Rng,
} from '../../../src/lib/poker/index.ts';

// ---------------------------------------------------------------------------
// Asserções
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSection = '';

export function section(name: string): void {
  currentSection = name;
  console.log(`\n== ${name}`);
}

export function check(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    if (failures.length < 200) failures.push(`[${currentSection}] ${msg}`);
    if (failed <= 30) console.log(`  FALHOU: ${msg}`);
  }
}

export function eq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${msg} — esperado ${e}, obtido ${a}`);
}

export function throws(fn: () => unknown, msg: string, code?: string): void {
  try {
    fn();
    check(false, `${msg} — deveria lançar erro`);
  } catch (err) {
    const c = (err as { code?: string }).code;
    check(code === undefined || c === code, `${msg} — código esperado ${code}, obtido ${c} (${(err as Error).message})`);
  }
}

export function finish(): void {
  console.log(`\n${passed} asserções ok, ${failed} falharam.`);
  if (failed > 0) {
    console.log('\nFalhas:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Configs
// ---------------------------------------------------------------------------

/** Raridade de cada pôster do Pôster Poker (BRIEF2): define as estrelas do torneio. */
export const EFFECT_RARITY: Record<PosterEffectId, Rarity> = {
  blackjack: 'common', double_pot: 'common', early_flop: 'common',
  hand_bounty: 'rare', eight_aces: 'rare', reveal_one: 'rare',
  sixth_card: 'epic', opal: 'epic', tell: 'legendary',
};
export const ALL_EFFECTS = Object.keys(EFFECT_RARITY) as PosterEffectId[];

export function makeConfig(opts: {
  mode?: 'free' | 'bounty'; seed: string; loan?: number; rarity?: Rarity; carrierId?: 'bogart' | 'cypher' | 'fincher';
  /** Pôster Poker: torneio da semana com este efeito (modo 'bounty', sem portador). */
  effect?: PosterEffectId; cobraItem?: boolean;
}): MatchConfig {
  if (opts.effect) {
    const rarity = opts.rarity ?? EFFECT_RARITY[opts.effect];
    return {
      mode: 'bounty',
      seed: opts.seed,
      settings: DEFAULT_SETTINGS,
      seats: { human: 0, bogart: 1, fincher: 2, cypher: 3 },
      profiles: { bogart: DEFAULT_PROFILES.bogart, cypher: DEFAULT_PROFILES.cypher, fincher: DEFAULT_PROFILES.fincher },
      paramsVersion: { bogart: 1, cypher: 1, fincher: 1 },
      difficulty: DEFAULT_DIFFICULTY[rarity],
      loan: opts.loan ?? 0,
      prize: null,
      memory: null,
      tournament: { prizeId: `pp-${opts.effect}`, rarity, effect: opts.effect, cobraItem: opts.cobraItem ?? false },
    };
  }
  const mode = opts.mode ?? 'free';
  const rarity = opts.rarity ?? 'common';
  return {
    mode,
    seed: opts.seed,
    settings: DEFAULT_SETTINGS,
    seats: { human: 0, bogart: 1, fincher: 2, cypher: 3 },
    profiles: { bogart: DEFAULT_PROFILES.bogart, cypher: DEFAULT_PROFILES.cypher, fincher: DEFAULT_PROFILES.fincher },
    paramsVersion: { bogart: 1, cypher: 1, fincher: 1 },
    difficulty: mode === 'bounty' ? DEFAULT_DIFFICULTY[rarity] : DEFAULT_DIFFICULTY.free,
    loan: opts.loan ?? 0,
    prize: mode === 'bounty'
      ? { prizeId: 'fichas-2', carrierId: opts.carrierId ?? DEFAULT_SETTINGS.carrierByRarity[rarity] as 'bogart', rarity }
      : null,
    memory: null,
  };
}

// ---------------------------------------------------------------------------
// Pessoa aleatória (ações legais)
// ---------------------------------------------------------------------------

export function randomHumanAction(L: LegalActions, rng: Rng): PlayerAction {
  const u = rng.nextFloat();
  const range = L.bet ?? L.raise;
  if (L.toCall === 0) {
    if (range && u < 0.2) {
      const to = range.min + Math.floor(rng.nextFloat() * (range.max - range.min + 1) * 0.3);
      return { type: L.bet ? 'bet' : 'raise', amount: Math.min(range.max, to) };
    }
    if (L.allIn && u < 0.23) return { type: 'allIn' };
    if (u < 0.25) return { type: 'fold' };   // largar de graça também é legal
    return { type: 'check' };
  }
  if (u < 0.3) return { type: 'fold' };
  if (range && u < 0.4) return { type: 'raise', amount: range.min };
  if (L.allIn && u < 0.44) return { type: 'allIn' };
  return { type: 'call' };
}

export interface PlayedMatch {
  steps: MatchStep[];
  final: MatchState;
  allEvents: MatchEvent[];
}

/** Joga uma partida inteira com a pessoa aleatória. `onStep` vê cada passo. */
export function playRandomMatch(
  cfg: MatchConfig,
  humanSeed: string,
  onStep?: (step: MatchStep, prev: MatchState | null) => void,
  policy?: (L: LegalActions, rng: Rng, s: MatchState) => PlayerAction,
  showProb = 0.5,
): PlayedMatch {
  const rng = createRng(humanSeed);
  const steps: MatchStep[] = [];
  let step = createMatch(cfg);
  steps.push(step);
  onStep?.(step, null);
  let s = step.state;
  for (let guard = 0; s.status === 'running' && guard < 5000; guard++) {
    const L = humanLegal(s);
    if (!L) throw new Error('vez da pessoa sem ações legais');
    const a = policy ? policy(L, rng, s) : randomHumanAction(L, rng);
    const show = rng.nextFloat() < showProb;
    const prev = s;
    step = applyHumanAction(s, a, { show });
    steps.push(step);
    onStep?.(step, prev);
    s = step.state;
  }
  return { steps, final: s, allEvents: steps.flatMap((x) => x.events) };
}
