/**
 * Pacote E3 (03/11/2026): configurações prontas da mesa de amigos e da casual de devolução.
 * Puras e determinísticas (os lugares saem da semente), para a Edge e os testes montarem igual.
 */
import { DEFAULT_DIFFICULTY, DEFAULT_SETTINGS, DEFAULT_EFFECTS, MAX_TABLE_EFFECTS } from '../config.ts';
import { DEFAULT_PROFILES } from '../bots/profile.ts';
import { createRng } from '../rng.ts';
import type { BotProfile, MatchConfig, OppCounters, PersonSeatId, PlayerId, PokerSettings, PosterEffectId, Rarity, RivalId } from '../types.ts';

/** Ids das pessoas na mesa de amigos, na ordem de entrada (p1 = quem criou). */
export const PERSON_IDS: readonly PersonSeatId[] = ['p1', 'p2', 'p3', 'p4'];
/** Os 4 lugares de sempre: a pessoa (ou quem criou) no 0 e os oráculos nos seus. */
export const ORACLE_SEATS: Readonly<Record<'bogart' | 'fincher' | 'cypher', number>> = { bogart: 1, fincher: 2, cypher: 3 };
const ORACLES = ['bogart', 'fincher', 'cypher'] as const;

/**
 * Lugares da mesa de amigos: p1 no lugar 0; cada pessoa a mais toma, ao acaso, o lugar de um
 * oráculo (fluxo `<semente>:seats`). Com 2 pessoas ficam 2 oráculos, com 3 fica 1, com 4 nenhum.
 */
export function friendsSeating(seed: string, people: number): { seats: Record<PlayerId, number>; people: PlayerId[]; oracles: RivalId[] } {
  const n = Math.max(1, Math.min(4, Math.floor(people) || 1));
  const rng = createRng(`${seed}:seats`);
  const free = rng.shuffle(ORACLES.slice());
  const taken = new Set(free.slice(0, n - 1));
  const seats: Record<string, number> = { p1: 0 };
  const ids: string[] = ['p1'];
  free.slice(0, n - 1).forEach((oracle, k) => {
    const id = PERSON_IDS[k + 1];
    seats[id] = ORACLE_SEATS[oracle];
    ids.push(id);
  });
  const oracles = ORACLES.filter((o) => !taken.has(o));
  for (const o of oracles) seats[o] = ORACLE_SEATS[o];
  return { seats: seats as Record<PlayerId, number>, people: ids as PlayerId[], oracles: oracles as RivalId[] };
}

/** Lista de efeitos válida: só ids conhecidos, no máximo 8 (repetidos ficam: acumulam). */
export function cleanEffects(list: readonly unknown[] | null | undefined): PosterEffectId[] {
  const out: PosterEffectId[] = [];
  for (const e of list ?? []) {
    if (typeof e === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_EFFECTS, e)) out.push(e as PosterEffectId);
    if (out.length >= MAX_TABLE_EFFECTS) break;
  }
  return out;
}

/**
 * Mesa de amigos (BRIEF3 item 4): grátis, cacife e estrutura da casual, oráculos no padrão da
 * casual (sem estrelas), sem empréstimo, sem prêmio, sem memória do Raposo.
 */
export function friendsConfig(opts: {
  seed: string; people: number; effects?: readonly unknown[] | null;
  settings?: PokerSettings; profiles?: Partial<Record<RivalId, BotProfile>>; paramsVersion?: Partial<Record<RivalId, number>>;
}): MatchConfig {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const seating = friendsSeating(opts.seed, opts.people);
  const profiles: Record<string, BotProfile> = {};
  const versions: Record<string, number> = {};
  for (const o of seating.oracles) {
    profiles[o] = opts.profiles?.[o] ?? DEFAULT_PROFILES[o as 'bogart'];
    versions[o] = opts.paramsVersion?.[o] ?? 1;
  }
  return {
    mode: 'friends',
    seed: opts.seed,
    settings,
    seats: seating.seats,
    profiles: profiles as Record<RivalId, BotProfile>,
    paramsVersion: versions as Record<RivalId, number>,
    difficulty: settings.difficulty?.free ?? DEFAULT_DIFFICULTY.free,
    loan: 0,
    prize: null,
    memory: null,
    tournament: null,
    people: seating.people,
    effects: cleanEffects(opts.effects),
  };
}

/**
 * Casual de devolução (BRIEF3 item 5): a casual de sempre (sem estrelas), jogada no servidor,
 * com o oráculo `carrierId` carregando o pôster perdido (`prizeId`, à escolha da Edge). É o
 * portador da fase 1: eliminar o portador ou vencer a mesa = prizeCaptured; se outro oráculo
 * eliminar o portador, o pôster passa para ele (prizeMoved).
 */
export function rescueConfig(opts: {
  seed: string; carrierId: RivalId; prizeId: string; rarity: Rarity; loan?: number;
  settings?: PokerSettings; profiles?: Partial<Record<RivalId, BotProfile>>; paramsVersion?: Partial<Record<RivalId, number>>;
  memory?: Record<PlayerId, OppCounters> | null;
}): MatchConfig {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  if (!(ORACLES as readonly string[]).includes(opts.carrierId)) throw new Error(`rescueConfig: portador desconhecido ${opts.carrierId}`);
  const profiles: Record<string, BotProfile> = {};
  const versions: Record<string, number> = {};
  for (const o of ORACLES) {
    profiles[o] = opts.profiles?.[o] ?? DEFAULT_PROFILES[o];
    versions[o] = opts.paramsVersion?.[o] ?? 1;
  }
  return {
    mode: 'free',
    seed: opts.seed,
    settings,
    seats: { human: 0, bogart: 1, fincher: 2, cypher: 3 },
    profiles: profiles as Record<RivalId, BotProfile>,
    paramsVersion: versions as Record<RivalId, number>,
    difficulty: settings.difficulty?.free ?? DEFAULT_DIFFICULTY.free,
    loan: opts.loan ?? 0,
    prize: { prizeId: opts.prizeId, carrierId: opts.carrierId, rarity: opts.rarity },
    memory: opts.memory ?? null,
    tournament: null,
    reclaim: true,
  };
}
