/**
 * Tipos do que a interface recebe do servidor (SPEC §4.7, §4.9 e §5.3).
 *
 * 03/11/2026: o `src/lib/pokerApi.ts` (pacote C) ainda está sendo escrito; estes
 * tipos espelham o JSON do SPEC para a interface e o `mockApi.ts` compilarem já.
 * Quando o C publicar os dele, `api.ts` adapta (os nomes e campos são os do SPEC).
 */
import type { PlayerAction } from '../engine.ts';
import type { MatchSummary, PokerSettings, PrizeKind, PublicEvent, Rarity, RivalId, TableView, TitleId } from '../types.ts';

export interface PokerPrize {
  id: string;
  kind: PrizeKind | (string & {});
  rarity: Rarity;
  name_pt: string;
  name_en: string;
  article_pt?: string;
  blurb_pt?: string;
  blurb_en?: string;
  image?: string | null;
  payload?: Record<string, unknown>;
  repeatable?: boolean;
}

export interface PokerBountyHome {
  day: string;
  ends_at: string;
  prize: PokerPrize;
  is_reserve: boolean;
  is_fallback: boolean;
  carrier: RivalId;
  stars: 0 | 1 | 2 | 3 | 4;
  attempts_used: number;
  max_attempts: number;
  won_today: boolean;
  loan_next: boolean;
  friends_won: number;
  tomorrow: { rarity: Rarity; carrier: RivalId } | null;
  active: { match_id: string; hand: number; seq: number } | null;
}

export interface PokerModeStats {
  matches: number;
  wins: number;
  [k: string]: unknown;
}

export interface PokerHome {
  enabled: boolean;
  proto_min?: number;
  settings?: Partial<{
    start_stack: number;
    hands_per_level: number;
    levels: [number, number, number][];
    loan_amount: number;
    max_attempts: number;
    carrier_by_rarity: PokerSettings['carrierByRarity'];
    difficulty: PokerSettings['difficulty'];
  }>;
  bot_params?: Record<string, { version: number; params: unknown }>;
  bounty?: PokerBountyHome | null;
  player?: {
    age_confirmed: boolean;
    age_gate_all: boolean;
    tutorial_done: boolean;
    tutorial_chip: boolean;
    story: Record<string, string>;
    lifetime_matches: number;
    last_played_at: string | null;
  };
  stats?: { free?: PokerModeStats; bounty?: PokerModeStats };
  title?: { wins: number; id: TitleId };
  loadout?: { deck: string; table: string; quips: string };
  owned_items?: string[];
  marks?: { tag_id: string; unlocked_at: string }[];
  /** Saldo de fichas do Jackpot (o lobby mostra "Você tem 7 fichas"). */
  tickets?: number;
}

export interface BountyResult {
  status: 'won' | 'lost' | 'forfeit' | 'abandoned';
  place: number;
  prizeCaptured: boolean;
  prize?: PokerPrize;
  seed?: string;
  seedHash?: string;
  marks: string[];
  title: { wins: number; id: TitleId; rankUp: boolean };
}

export interface BountyStart {
  ok: true;
  matchId: string;
  seq: number;
  seedHash: string;
  attempt: number;
  loan: number;
  prize: PokerPrize;
  carrier: RivalId;
  stars: number;
  events: PublicEvent[];
  view: TableView;
}

export interface BountyAct {
  ok: true;
  seq: number;
  events: PublicEvent[];
  view: TableView;
  result?: BountyResult;
}

export interface BountyResume {
  ok: true;
  matchId: string;
  seq: number;
  seedHash: string;
  prize: PokerPrize;
  carrier: RivalId;
  stars: number;
  loan: number;
  view: TableView;
  recent: PublicEvent[];
  result?: BountyResult;
}

export interface IntervalPick {
  movie_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  title_pt?: string | null;
  poster_path: string | null;
  oracle: RivalId;
}

export interface PokerApiLike {
  getHome(): Promise<PokerHome>;
  confirmAge(): Promise<void>;
  claimTutorialChip(): Promise<{ granted: boolean; tickets: number }>;
  markStory(keys: string[]): Promise<void>;
  equip(slot: 'deck' | 'table' | 'quips', itemId: string): Promise<void>;
  reportFreeMatch(s: MatchSummary): Promise<{ ok: boolean; wins: number; title: TitleId }>;
  intervalPick(): Promise<IntervalPick | null>;
  bounty: {
    start(day: string, prizeId: string): Promise<BountyStart>;
    act(matchId: string, seq: number, idem: string, action: PlayerAction, show?: boolean): Promise<BountyAct>;
    forfeit(matchId: string, seq: number): Promise<BountyResult>;
    resume(matchId?: string): Promise<BountyResume>;
  };
}

/** Erro com o status HTTP e o código do protocolo (§4.7). */
export class PokerClientError extends Error {
  status: number;
  code: string;
  data?: unknown;
  constructor(status: number, code: string, data?: unknown) {
    super(code);
    this.name = 'PokerClientError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}
