/**
 * Perfis dos bots como dados (SPEC §3.2 e §3.3).
 *
 * - DEFAULT_PROFILES: o padrão embutido (bots/profiles/*.ts).
 * - LIMITS: o intervalo permitido de cada parâmetro ajustável pelo banco.
 * - mergeProfile(def, params, LIMITS): aplica `poker_bot_params.params` (jsonb, não
 *   confiável) por cima do padrão. Mescla profunda só nas chaves que o padrão tem; chave
 *   desconhecida é ignorada; número fora da faixa é preso nela; tipo errado vale o padrão.
 *   O resultado não compartilha nenhum objeto com `def`.
 */
import type { BotProfile, DifficultyRow } from '../types.ts';
import { BOGART_PROFILE } from './profiles/bogart.ts';
import { CYPHER_PROFILE } from './profiles/cypher.ts';
import { FINCHER_PROFILE } from './profiles/fincher.ts';

export type { BotProfile } from '../types.ts';

// ---------------------------------------------------------------------------
// Limites
// ---------------------------------------------------------------------------

/** [mín, máx] para um número. */
export type NumRange = readonly [min: number, max: number];
/** Folha com regras além do intervalo: inteiro, null, booleano ou textos aceitos. */
export interface FieldLimit {
  readonly $lim: true;
  readonly num?: NumRange;
  readonly int?: boolean;
  readonly nullable?: boolean;
  readonly bool?: boolean;
  readonly oneOf?: readonly string[];
}
export type LimitLeaf = NumRange | FieldLimit;
/** Espelha a forma do perfil; uma folha num nó vale para tudo o que está abaixo dele. */
export type LimitTree<T> =
  | LimitLeaf
  | (T extends readonly unknown[] ? never
    : T extends object ? { readonly [K in keyof T]-?: LimitTree<NonNullable<T[K]>> }
    : never);
/** `id` nunca muda pelo banco. */
export type ProfileLimits = { readonly [K in Exclude<keyof BotProfile, 'id'>]-?: LimitTree<NonNullable<BotProfile[K]>> };

function field(spec: Omit<FieldLimit, '$lim'>): FieldLimit {
  return { $lim: true, ...spec };
}

const PCT: NumRange = [0, 100];            // "top X%"
const FREQ: NumRange = [0, 1];             // frequências e probabilidades
const MARGIN: NumRange = [-20, 20];        // pp de equidade
const SIZE: NumRange = [0.2, 2.0];         // fração do pote
const DELTA_PP: NumRange = [-20, 20];      // deslocamento de VPIP/PFR
const OPEN_BB: NumRange = [2, 6];          // tamanho de abertura em BB
// O teste de vazamento exige thinkMs inteiro entre 300 e 7.000 (§4.5).
const THINK_MS = field({ num: [300, 7000], int: true });
const BOOL = field({ bool: true });

/**
 * Faixas da tabela do §3.3 (epsilon, noise, iters, percentuais, frequências,
 * callMarginPP, sizings, pushFold.maxBB, stinginess). As demais (abertura em BB, tilt,
 * prêmio, modelo, tempo) foram definidas no F0 com folga em volta dos números do §3.2.
 */
export const LIMITS: ProfileLimits = {
  rangeModel: field({ oneOf: ['random', 'static', 'bayes'] }),
  iters: field({ num: [100, 1500], int: true }),
  noise: [0, 0.2],
  epsilon: [0, 0.3],
  epsilonFloor: [0, 0.3],
  positionUse: FREQ,
  stinginess: [0, 2],
  feFixed: field({ num: FREQ, nullable: true }),
  targets: { vpip: PCT, pfr: PCT, af: [0, 10] },
  preflop: {
    entry: PCT,
    limpShare: FREQ,
    limpOnlySbVsPassiveBB: BOOL,
    raiseOnlyTopPct: field({ num: PCT, nullable: true }),
    open: OPEN_BB,
    openOOP: OPEN_BB,
    iso: OPEN_BB,
    isoPerExtraLimper: [0, 3],
    threeBetPct: PCT,
    threeBetBluffShare: FREQ,
    foldTo3bet: FREQ,
    foldTo4bet: FREQ,
    foldBBvsSteal: FREQ,
    callOpenPct: PCT,
  },
  post: {
    cbetHU: FREQ,
    cbetPairOnly: BOOL,
    barrelTurn: FREQ,
    riverAfterTwo: FREQ,
    checkRaise: FREQ,
    slowplay: FREQ,
    riverBluffShare: field({ num: FREQ, oneOf: ['balanced'] }),
    scareCardOverbet: FREQ,
    callMarginPP: MARGIN,
    raiseValueFreq: FREQ,
    semibluffFreq: FREQ,
  },
  sizings: {
    flopDry: SIZE,
    flopWet: SIZE,
    turn: SIZE,
    riverThin: SIZE,
    riverPolar: SIZE,
    monster: field({ num: SIZE, nullable: true }),
    scareOverbet: SIZE,
  },
  pushFold: { maxBB: [5, 20], shove: PCT },
  callAllIn: {
    topPct: field({ num: PCT, nullable: true }),
    eqVs: field({ oneOf: ['random', 'aggressorRange'], nullable: true }),
    eqMarginPP: MARGIN,
    icm3PP: [0, 20],
  },
  model: { enabled: BOOL, fe: FREQ, cbet: FREQ, callMarginPP: [0, 20], foldBBvsSteal: [0, 0.3] },
  tilt: {
    kind: field({ oneOf: ['veneno', 'orgulho', 'emburrado'] }),
    hands: field({ num: [0, 20], int: true }),
    trigger: {
      lostPotBB: field({ num: [5, 100], nullable: true }),
      lostStackShare: field({ num: FREQ, nullable: true }),
      ownBluffExposed: BOOL,
      bluffedByShown: BOOL,
    },
    effect: {
      vpipDelta: DELTA_PP,
      pfrDelta: DELTA_PP,
      bluffPP: [-30, 30],
      allInCallMul: [0.5, 3],
      callMarginPP: MARGIN,
      targeted: BOOL,
    },
  },
  showPolicy: FREQ,
  bounty: {
    carrier: { vpipDelta: DELTA_PP, allInMarginPP: MARGIN, tiltLostStackShare: field({ num: FREQ, nullable: true }) },
    hunterMarginPP: MARGIN,
  },
  tells: FREQ,
  think: { fidelity: FREQ, ranges: THINK_MS, tankChance: FREQ, tank: THINK_MS },
};

// ---------------------------------------------------------------------------
// Mescla
// ---------------------------------------------------------------------------

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isRange(l: LimitLeaf): l is NumRange {
  return Array.isArray(l);
}

function isLeaf(l: unknown): l is LimitLeaf {
  return Array.isArray(l) || (isRecord(l) && l.$lim === true);
}

function mergeLeaf(def: unknown, patch: unknown, lim: LimitLeaf): unknown {
  if (patch === undefined) return def;
  const f: Omit<FieldLimit, '$lim'> = isRange(lim) ? { num: lim } : lim;
  if (typeof patch === 'number') {
    if (!Number.isFinite(patch) || !f.num) return def;
    const v = Math.min(f.num[1], Math.max(f.num[0], patch));
    return f.int ? Math.round(v) : v;
  }
  if (patch === null) return f.nullable ? null : def;
  if (typeof patch === 'boolean') return f.bool ? patch : def;
  if (typeof patch === 'string') return f.oneOf?.includes(patch) ? patch : def;
  return def;
}

function mergeNode(def: unknown, patch: unknown, lim: unknown): unknown {
  // Tupla: mesmo limite para todos os itens; o tamanho é o do padrão.
  if (Array.isArray(def)) {
    const items: unknown[] = Array.isArray(patch) ? patch : [];
    return def.map((d, i) => mergeNode(d, items[i], isLeaf(lim) ? lim : undefined));
  }
  if (isRecord(def)) {
    const p = isRecord(patch) ? patch : {};
    const out: Record<string, unknown> = {};
    // Só as chaves do padrão: as desconhecidas (e __proto__ & cia.) nunca entram.
    for (const key of Object.keys(def)) {
      const sub = isLeaf(lim) ? lim : isRecord(lim) ? lim[key] : undefined;
      const value = Object.prototype.hasOwnProperty.call(p, key) ? p[key] : undefined;
      out[key] = mergeNode(def[key], value, sub);
    }
    return out;
  }
  // Folha sem limite (ex.: `id`) não é ajustável.
  return isLeaf(lim) ? mergeLeaf(def, patch, lim) : def;
}

/** Perfil efetivo = padrão + `poker_bot_params.params` filtrado pelos limites. */
export function mergeProfile(def: BotProfile, params: unknown, limits: ProfileLimits = LIMITS): BotProfile {
  const merged = mergeNode(def, params, limits) as BotProfile;
  merged.id = def.id;
  return merged;
}

/** ε_final = max(epsilon × epsilonMul, epsilonFloor) (§3.4). */
export function effectiveEpsilon(profile: BotProfile, difficulty: DifficultyRow): number {
  return Math.max(profile.epsilon * difficulty.epsilonMul, profile.epsilonFloor);
}

// ---------------------------------------------------------------------------
// Padrões
// ---------------------------------------------------------------------------

// Congela os padrões: um bot que alterasse o perfil compartilhado mudaria as outras
// partidas do mesmo Worker/isolate. Com o freeze, o erro estoura na hora.
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export const DEFAULT_PROFILES: Record<'bogart' | 'cypher' | 'fincher', BotProfile> = deepFreeze({
  bogart: BOGART_PROFILE,
  cypher: CYPHER_PROFILE,
  fincher: FINCHER_PROFILE,
});

deepFreeze(LIMITS);
