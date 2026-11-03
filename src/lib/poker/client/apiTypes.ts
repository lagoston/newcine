/**
 * Tipos do que a interface recebe do servidor (SPEC §4.7, §4.9 e §5.3).
 *
 * 03/11/2026: o `src/lib/pokerApi.ts` (pacote C) ainda está sendo escrito; estes
 * tipos espelham o JSON do SPEC para a interface e o `mockApi.ts` compilarem já.
 * Quando o C publicar os dele, `api.ts` adapta (os nomes e campos são os do SPEC).
 */
import type { PlayerAction } from '../engine.ts';
import type {
  MatchSummary,
  PokerSettings,
  PosterEffectId,
  PrizeKind,
  PublicEvent,
  Rarity,
  RivalId,
  TableView,
  TitleId,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Pôster Poker (03/11/2026, tarde — pacote F): o torneio da semana.
// O formato é o de get_poker_home() e da Edge poker-bounty (proto 2); a
// descrição completa está em .../scratchpad/poker2/status/F_NOTES.md.
// ---------------------------------------------------------------------------

/** Efeito de um pôster da coleção (gold = só os 9 do Pôster Poker). */
export type PosterVersionEffect = 'none' | 'holo' | 'negative' | 'ultra_red' | 'gold';

/** Um dos 9 pôsteres do Pôster Poker (get_poker_home().tournament.prize e .collection[]). */
export interface TournamentPrize {
  /** poker_prizes.id: 'pp-the-sting', 'pp-21'… */
  id: string;
  /** poster_items.id (para desenhar com o mesmo componente da coleção do Jackpot). */
  item_id: number;
  rarity: Rarity;
  /** Número de colecionador (070, 075, 080 / 040, 045, 050 / 030, 035 / 020). */
  serial: number;
  title: string;
  title_en: string;
  year: number | null;
  file_path: string;
  /** O efeito que o pôster lança na mesa. */
  effect_id: PosterEffectId;
  /** O efeito do pôster ganho (sempre 'gold'). */
  effect: 'gold';
  blurb_pt: string | null;
  blurb_en: string | null;
}

export interface TournamentCollectionEntry extends TournamentPrize {
  /** A pessoa já tem a versão gold. */
  owned: boolean;
  /** A próxima semana (quinta, >= a atual) em que o pôster volta; a atual se for o da semana. */
  next_week: string;
  this_week: boolean;
}

/** Um pôster da coleção que pode ir de aposta (mesma raridade; nunca exclusivo/gold nem já apostado). */
export interface TournamentStakeOption {
  item_id: number;
  effect: Exclude<PosterVersionEffect, 'gold'>;
  title: string | null;
  title_en: string | null;
  year: number | null;
  file_path: string;
  serial: number | null;
  rarity: Rarity;
}

/** A aposta como o banco devolve (get_poker_home, active_match). */
export type TournamentStakeJson =
  | { kind: 'chips'; amount: number }
  | { kind: 'poster'; item_id: number; effect: PosterVersionEffect };

export interface TournamentHome {
  /** A quinta-feira (Brasília) em que a semana começou. */
  week: string;
  /** Quinta seguinte, 00h00 de Brasília (ISO). */
  ends_at: string;
  prize: TournamentPrize;
  /** Fichas da entrada (comum e raro 1, épico 2, lendário 3). */
  entry_chips: number;
  /** Saldo de fichas comuns da pessoa. */
  chips: number;
  /** Entradas hoje (dia de Brasília). */
  attempts_used: number;
  max_attempts: number;
  /** Já tem o pôster da semana (de um ciclo anterior): "Já é seu", sobra o Casual. */
  owned: boolean;
  /** Venceu o torneio nesta semana: fechado até quinta. */
  won_this_week: boolean;
  active_match: {
    match_id: string;
    week: string | null;
    hand: number;
    seq: number;
    prize_id: string;
    stake: TournamentStakeJson | null;
  } | null;
  stake_options: TournamentStakeOption[];
  /** Itens da Cobra que a pessoa ainda não tem (0 = a Cobra não traz nada). */
  cobra_pool: number;
  stars: 0 | 1 | 2 | 3 | 4;
  /** A próxima partida vem com o empréstimo do Sapo. */
  loan_next: boolean;
  /** Amigos que venceram o torneio desta semana. */
  friends_won: number;
  next: { week: string; prize_id: string; rarity: Rarity } | null;
}

/** A vitrine dos itens da Cobra (get_poker_home().cobra_items; vazia por enquanto). */
export interface CobraItemEntry {
  id: string;
  kind: 'deck' | 'table' | 'rival' | 'poker_quip';
  name_pt: string;
  name_en: string;
  owned: boolean;
}

/** A aposta enviada no start (Edge, proto 2). */
export type TournamentStake =
  | { kind: 'chips' }
  | { kind: 'poster'; itemId: number; effect: Exclude<PosterVersionEffect, 'gold'> };

/** A aposta como a Edge devolve (start/resume). */
export type TournamentStakeInfo =
  | { kind: 'chips'; amount: number }
  | { kind: 'poster'; itemId: number; effect: PosterVersionEffect };

/** O bloco `tournament` das respostas de start e resume da Edge. */
export interface BountyTournamentInfo {
  week: string;
  prize: TournamentPrize;
  effect: PosterEffectId;
  rarity: Rarity;
  /** A Cobra trouxe um item secreto (qual, só no fim). */
  cobraItem: boolean;
  stake: TournamentStakeInfo | null;
  /** Só no resume: held (em jogo) | returned | lost | spent. */
  stakeStatus?: 'held' | 'returned' | 'lost' | 'spent' | null;
  attemptsUsed: number | null;
  maxAttempts: number | null;
}

export interface CobraItemReward {
  id: string;
  name: string;
  nameEn: string;
  kind: string;
}

/** result.rewards (e `rewards` no topo da resposta final). */
export interface TournamentRewards {
  /** Só na vitória (1º lugar). */
  poster: {
    prizeId: string;
    itemId: number;
    title: string;
    titleEn: string;
    filePath: string;
    serial: number;
    rarity: Rarity;
    effect: 'gold';
    effectId: PosterEffectId;
  } | null;
  /** Só na vitória, se a Cobra trouxe item. */
  cobraItem: CobraItemReward | null;
  /** Só na derrota, se a Cobra trouxe item ("era isto"). */
  cobraRevealed: CobraItemReward | null;
  stake:
    | { kind: 'chips'; amount: number }
    | {
        kind: 'poster';
        itemId: number;
        effect: PosterVersionEffect;
        title: string | null;
        titleEn: string | null;
        filePath: string;
        serial: number | null;
        rarity: Rarity;
        /** Perdeu o pôster apostado (ficou com a Cobra). */
        lost: boolean;
      }
    | null;
}

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
  /** Pôster Poker: o efeito de mesa do pôster (null nos prêmios antigos). */
  effect_id?: PosterEffectId | null;
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
  /** Liberado para esta conta (is_open ou tester); fechado, o salão mostra "Em breve". */
  open?: boolean;
  proto_min?: number;
  settings?: Partial<{
    start_stack: number;
    hands_per_level: number;
    levels: [number, number, number][];
    loan_amount: number;
    max_attempts: number;
    carrier_by_rarity: PokerSettings['carrierByRarity'];
    difficulty: PokerSettings['difficulty'];
    /** Pôster Poker: sobreposição dos DEFAULT_EFFECTS ({} = padrões do motor). */
    effects: PokerSettings['effects'];
    entry_chips: Record<Rarity, number>;
  }>;
  bot_params?: Record<string, { version: number; params: unknown }>;
  /** O prêmio do dia acabou (03/11/2026): sempre null. Use `tournament`. */
  bounty?: PokerBountyHome | null;
  /** Pôster Poker: o torneio da semana (null só com o catálogo vazio). */
  tournament?: TournamentHome | null;
  /** Os 9 pôsteres do Pôster Poker. */
  collection?: TournamentCollectionEntry[];
  cobra_items?: CobraItemEntry[];
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
  /** Pôster Poker: partida de torneio. */
  tournament?: boolean;
  rewards?: TournamentRewards | null;
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
  /** Fichas que sobraram depois da entrada. */
  tickets?: number;
  tournament?: BountyTournamentInfo;
}

export interface BountyAct {
  ok: true;
  seq: number;
  events: PublicEvent[];
  view: TableView;
  result?: BountyResult;
  /** Só na resposta final de um torneio (= result.rewards). */
  rewards?: TournamentRewards | null;
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
  tournament?: BountyTournamentInfo;
  rewards?: TournamentRewards | null;
  /** Veio de um start repetido (mesmo idem): a partida que já estava aberta. */
  duplicate?: boolean;
}

export interface IntervalPick {
  movie_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  title_pt?: string | null;
  title_en?: string | null;
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
    /** Pôster Poker (proto 2): week = tournament.week, prizeId = tournament.prize.id. */
    start(week: string, prizeId: string, stake?: TournamentStake, idem?: string): Promise<BountyStart>;
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
