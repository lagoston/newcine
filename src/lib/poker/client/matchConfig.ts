/**
 * Monta o `MatchConfig` da partida no aparelho (livre e, no mockApi, o prêmio) a
 * partir do lobby (`get_poker_home`) ou, sem rede, dos números padrão do código.
 */
import { DEFAULT_DIFFICULTY, DEFAULT_SETTINGS } from '../config.ts';
import { DEFAULT_PROFILES, mergeProfile } from '../bots/profile.ts';
import type { BotProfile, MatchConfig, MatchMode, OppCounters, PlayerId, PokerSettings, Rarity, RivalId } from '../types.ts';
import type { PokerHome } from './apiTypes.ts';

export const RIVALS: RivalId[] = ['bogart', 'fincher', 'cypher'];
export const SEATS: Record<PlayerId, number> = { human: 0, bogart: 1, fincher: 2, cypher: 3 };

export function settingsFrom(home: PokerHome | null): PokerSettings {
  const s = home?.settings;
  if (!s) return DEFAULT_SETTINGS;
  return {
    startStack: s.start_stack ?? DEFAULT_SETTINGS.startStack,
    handsPerLevel: s.hands_per_level ?? DEFAULT_SETTINGS.handsPerLevel,
    levels: Array.isArray(s.levels) && s.levels.length > 0 ? s.levels : DEFAULT_SETTINGS.levels,
    loanAmount: s.loan_amount ?? DEFAULT_SETTINGS.loanAmount,
    maxAttempts: s.max_attempts ?? DEFAULT_SETTINGS.maxAttempts,
    carrierByRarity: s.carrier_by_rarity ?? DEFAULT_SETTINGS.carrierByRarity,
    difficulty: s.difficulty ?? DEFAULT_SETTINGS.difficulty,
  };
}

export function profilesFrom(home: PokerHome | null): { profiles: Record<RivalId, BotProfile>; versions: Record<RivalId, number> } {
  const profiles = {} as Record<RivalId, BotProfile>;
  const versions = {} as Record<RivalId, number>;
  (Object.keys(DEFAULT_PROFILES) as (keyof typeof DEFAULT_PROFILES)[]).forEach((id) => {
    const row = home?.bot_params?.[id];
    profiles[id] = row ? mergeProfile(DEFAULT_PROFILES[id], row.params) : DEFAULT_PROFILES[id];
    versions[id] = row?.version ?? 1;
  });
  return { profiles, versions };
}

export function buildConfig(opts: {
  mode: MatchMode;
  seed: string;
  home: PokerHome | null;
  loan?: number;
  prize?: { prizeId: string; carrierId: RivalId; rarity: Rarity } | null;
  memory?: Record<PlayerId, OppCounters> | null;
}): MatchConfig {
  const settings = settingsFrom(opts.home);
  const { profiles, versions } = profilesFrom(opts.home);
  const diffKey: Rarity | 'free' = opts.prize ? opts.prize.rarity : 'free';
  return {
    mode: opts.mode,
    seed: opts.seed,
    settings,
    seats: { ...SEATS },
    profiles,
    paramsVersion: versions,
    difficulty: settings.difficulty?.[diffKey] ?? DEFAULT_DIFFICULTY[diffKey],
    loan: opts.loan ?? 0,
    prize: opts.prize ?? null,
    memory: opts.memory ?? null,
  };
}
