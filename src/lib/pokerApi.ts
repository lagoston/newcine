/**
 * O Grande Blefe — o único arquivo do pôquer que fala com o Supabase (SPEC §4.9).
 *
 * 03/11/2026 (pacote C):
 *   - As funções do lobby, do placar, da história e da partida livre chamam as
 *     RPCs do banco (migrações 20261103060000…066000). Fechado para a conta, o
 *     banco devolve {enabled:false, open:false} e nada mais.
 *   - A partida com prêmio (bounty.*) roda na Edge Function `poker-bounty`
 *     (verify_jwt): o aparelho só manda a jogada; cartas, bots, débito da
 *     ficha e prêmio ficam no servidor. Todo corpo leva `proto` (POKER_PROTO).
 *   - Os tipos espelham o JSON das RPCs e da Edge. Erro do protocolo vira
 *     PokerApiError {status, code, data} (mesmo formato do PokerClientError do
 *     mockApi, para a interface tratar os dois do mesmo jeito).
 *
 * 03/11/2026 (tarde, pacote F — Pôster Poker): proto 2. O prêmio do dia virou o
 * torneio da semana: get_poker_home traz `tournament`, `collection` e
 * `cobra_items` (bounty = null); bounty.start(week, prizeId, stake, idem?)
 * entra com fichas ou com um pôster apostado; a resposta final traz `rewards`.
 * Os tipos do torneio moram em poker/client/apiTypes.ts (os mesmos da interface).
 *
 * 03/11/2026 (noite, pacote F3 — fase 3): `friends` (mesa com amigos, Edge
 * `poker-friends`, FRIENDS_PROTO = 1, tempo real por Broadcast privado) e `casual`
 * (o contador de casuais e a casual de devolução). Formato em .../poker3/status/F3_NOTES.md.
 */
import { FunctionRegion, FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Card } from './poker/cards.ts';
import type { PlayerAction } from './poker/engine.ts';
import type { HandKind } from './poker/evaluator.ts';
import type {
  DifficultyRow,
  MatchSummary,
  PokerSettings,
  PosterEffectId,
  PrizeKind,
  PublicEvent,
  Rarity,
  RivalId,
  TableView,
  TitleId,
} from './poker/types.ts';
import type {
  BountyTournamentInfo,
  CasualApi,
  CasualBegin,
  CobraItemEntry,
  FriendsApi,
  FriendsHome,
  FriendsPing,
  FriendsRoomReply,
  InviteState,
  TournamentCollectionEntry,
  TournamentHome,
  TournamentRewards,
  TournamentStake,
  TournamentStakeJson,
} from './poker/client/apiTypes.ts';

export type {
  BountyTournamentInfo,
  CasualApi,
  CasualBegin,
  CobraItemEntry,
  CobraItemReward,
  FriendsApi,
  FriendsFriend,
  FriendsHome,
  FriendsInvite,
  FriendsMatch,
  FriendsMember,
  FriendsMemberStatus,
  FriendsPing,
  FriendsPosterCard,
  FriendsResult,
  FriendsRoom,
  FriendsRoomBrief,
  FriendsRoomReply,
  FriendsRoomStatus,
  FriendsSeat,
  FriendsStakeOutcome,
  FriendsStakeProblem,
  FriendsStartBlocker,
  InviteState,
  PosterVersionEffect,
  RecoverResult,
  TournamentCollectionEntry,
  TournamentHome,
  TournamentPrize,
  TournamentRewards,
  TournamentStake,
  TournamentStakeInfo,
  TournamentStakeJson,
  TournamentStakeOption,
} from './poker/client/apiTypes.ts';

/**
 * Versão do protocolo da Edge. O servidor recusa (426) abaixo de poker_settings.min_proto.
 * 2 = Pôster Poker (03/11/2026): start com week, prizeId e stake.
 */
export const POKER_PROTO = 2;

/**
 * Versão do protocolo da Edge poker-friends (mesa com amigos e casual de devolução),
 * separada da poker-bounty. 1 = fase 3 (03/11/2026).
 */
export const FRIENDS_PROTO = 1;

// O banco mora em São Paulo: a Edge roda na mesma região (menos latência por jogada).
const EDGE_REGION = FunctionRegion.SaEast1;

// ---------------------------------------------------------------------------
// Tipos (espelham o JSON do banco e da Edge)
// ---------------------------------------------------------------------------

export interface PokerPrize {
  id: string;
  kind: PrizeKind | (string & {});
  rarity: Rarity;
  name_pt: string;
  name_en: string;
  article_pt: 'o' | 'a' | 'os' | 'as' | null;
  blurb_pt: string | null;
  blurb_en: string | null;
  /** Pôster: o arquivo do TMDB (file_path); os outros: image_path ou null. */
  image: string | null;
  /** Pôster: {item_id, effect, poster: {id, media_type, tmdb_id, title_pt, title_en, year, file_path, effect, …}}. */
  payload: Record<string, unknown>;
  repeatable: boolean;
  carrier: RivalId | null;
  /** Pôster Poker: o efeito de mesa do pôster (null nos prêmios antigos). */
  effect_id: PosterEffectId | null;
}

export interface PokerSettingsJson {
  start_stack: number;
  hands_per_level: number;
  levels: [sb: number, bb: number, ante: number][];
  loan_amount: number;
  max_attempts: number;
  carrier_by_rarity: Record<Rarity, RivalId>;
  difficulty: Record<Rarity | 'free', DifficultyRow>;
  /** Pôster Poker: sobreposição dos DEFAULT_EFFECTS do motor ({} = padrões). */
  effects: NonNullable<PokerSettings['effects']>;
  /** Fichas da entrada do torneio por raridade ({common:1, rare:1, epic:2, legendary:3}). */
  entry_chips: Record<Rarity, number>;
}

/** poker_bot_params: Partial<BotProfile> por rival, com a versão (o cliente guarda em poker.home.v1). */
export type PokerBotParams = Record<RivalId, { version: number; params: Record<string, unknown> }>;

export interface PokerModeStats {
  mode: 'free' | 'bounty';
  matches: number;
  wins: number;
  /** 1º ou 2º lugar. */
  podiums: number;
  place_sum: number;
  forfeits: number;
  loans: number;
  hands: number;
  hands_won: number;
  vpip: number;
  pfr: number;
  aggr_bets: number;
  aggr_calls: number;
  cbet_opp: number;
  cbet: number;
  fold_cbet_opp: number;
  fold_cbet: number;
  showdowns: number;
  showdowns_won: number;
  allin_count: number;
  allin_won: number;
  allin_expected_milli: number;
  bluffs_worked: number;
  bad_beats_suffered: number;
  bad_beats_dealt: number;
  comeback_wins: number;
  prizes_won: number;
  streak: number;
  best_streak: number;
  biggest_pot: number;
  best_hand_score: number;
  best_hand: { cards: Card[]; kind: HandKind; score: number } | null;
  play_seconds: number;
  /** {"fincher": {"elim": 3, "elim_by": 7}} — quem a pessoa eliminou e quem a eliminou. */
  vs: Record<string, { elim?: number; elim_by?: number }>;
  last_match_at: string | null;
}

export interface PokerBountyHome {
  day: string;
  /** Meia-noite de Brasília (ISO). */
  ends_at: string;
  /** O prêmio efetivo desta pessoa (ou o da partida de hoje em andamento / o que já levou). */
  prize: PokerPrize;
  is_reserve: boolean;
  is_fallback: boolean;
  rarity: Rarity;
  carrier: RivalId;
  stars: 0 | 1 | 2 | 3 | 4;
  attempts_used: number;
  max_attempts: number;
  won_today: boolean;
  loan_next: boolean;
  friends_won: number;
  tomorrow: { rarity: Rarity; carrier: RivalId } | null;
  active: { match_id: string; hand: number; seq: number; day: string; prize_id: string } | null;
  tickets: number;
}

export interface PokerItem {
  id: string;
  kind: 'deck' | 'table' | 'rival' | 'poker_quip';
  name_pt: string;
  name_en: string;
  is_default: boolean;
  owned: boolean;
}

export interface PokerHomeClosed {
  enabled: false;
  open: false;
}

export interface PokerHomeOpen {
  enabled: true;
  /** Liberado para esta conta (is_open ou tester). */
  open: true;
  proto_min: number;
  settings: PokerSettingsJson;
  bot_params: PokerBotParams;
  /** O prêmio do dia acabou (03/11/2026): sempre null. Use `tournament`. */
  bounty: PokerBountyHome | null;
  /** Pôster Poker: o torneio da semana (null só com o catálogo do torneio vazio). */
  tournament: TournamentHome | null;
  /** Os 9 pôsteres do Pôster Poker (comum → lendário, depois nº). */
  collection: TournamentCollectionEntry[];
  /** A vitrine dos itens da Cobra (vazia por enquanto). */
  cobra_items: CobraItemEntry[];
  player: {
    age_confirmed: boolean;
    /** casino_age_gate: a folha 18+ antes de qualquer partida (desligada na v1). */
    age_gate_all: boolean;
    tutorial_done: boolean;
    tutorial_chip: boolean;
    story: Record<string, string>;
    lifetime_matches: number;
    last_played_at: string | null;
  };
  stats: { free: PokerModeStats; bounty: PokerModeStats };
  title: { wins: number; id: TitleId };
  loadout: { deck: string; table: string; quips: string };
  owned_items: string[];
  items: PokerItem[];
  marks: { tag_id: string; unlocked_at: string }[];
  /** Saldo de fichas comuns do Jackpot. */
  tickets: number;
}

export type PokerHome = PokerHomeClosed | PokerHomeOpen;

export interface PokerMark {
  tag_id: string;
  name: string;
  emoji: string;
  description: string;
  description_pt: string | null;
  requirement: string;
  requirement_pt: string | null;
  /** null = ainda não conquistado (silhueta com a regra). */
  unlocked_at: string | null;
}

export interface PokerRecentFree {
  client_id: string;
  played_at: string;
  place: number;
  hands: number;
  loan: boolean;
  summary: MatchSummary;
}

/** Resumo gravado pela expiração (cron de hora em hora), sem as contagens da mão. */
export interface PokerMinimalSummary {
  v: 1;
  mode: 'bounty';
  minimal: true;
  hands: number;
  place: number;
  reason: 'abandoned';
  loan: boolean;
  prize: { prizeId: string; capturedHand: number | null };
}

export interface PokerRecentBounty {
  id: string;
  day: string;
  attempt: number;
  status: 'active' | 'won' | 'lost' | 'forfeit' | 'abandoned' | 'void';
  place: number | null;
  prize: Pick<PokerPrize, 'id' | 'kind' | 'rarity' | 'name_pt' | 'name_en' | 'image'> | null;
  carrier: RivalId;
  rarity: Rarity;
  loan: boolean;
  captured_hand: number | null;
  hands: number;
  created_at: string;
  finished_at: string | null;
  seed_hash: string;
  /** Só nas terminadas (commit-reveal). */
  seed: string | null;
  /** Só nas terminadas. A expiração (24 h sem jogar) grava o resumo mínimo. */
  summary: MatchSummary | PokerMinimalSummary | null;
  /** Pôster Poker (null nas partidas do prêmio do dia). */
  week: string | null;
  effect_id: PosterEffectId | null;
  stake: TournamentStakeJson | null;
  stake_status: 'held' | 'returned' | 'lost' | 'spent' | null;
  /** Só nas terminadas. */
  rewards: TournamentRewards | null;
}

export interface PokerScoreboardOpen {
  enabled: true;
  open: true;
  stats: { free: PokerModeStats; bounty: PokerModeStats };
  title: { wins: number; id: TitleId };
  recent_free: PokerRecentFree[];
  recent_bounty: PokerRecentBounty[];
  prizes: { prize_id: string; kind: string; day: string | null; week: string | null; granted_at: string; prize: PokerPrize }[];
  marks: PokerMark[];
  friends_won_today: number;
  /** Amigos que venceram o torneio desta semana. */
  friends_won_week: number;
}

export type PokerScoreboard = PokerHomeClosed | PokerScoreboardOpen;

export interface IntervalPick {
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  /** = tmdb_id (nome que a interface já usava). */
  movie_id: number;
  title_pt: string | null;
  title_en: string | null;
  /** title_pt, ou title_en se faltar. */
  title: string;
  poster_path: string | null;
  poster_path_pt: string | null;
  year: number | null;
  oracle: RivalId;
}

export interface BountyResult {
  status: 'won' | 'lost' | 'forfeit' | 'abandoned';
  place: number;
  prizeCaptured: boolean;
  prize?: PokerPrize | null;
  seed: string;
  seedHash: string;
  /** Ids das tags novas (poker-first-win, poker-fox-hunter, …). */
  marks: string[];
  title: { wins: number; id: TitleId; rankUp: boolean };
  /** Pôster Poker: partida de torneio (prizeCaptured = venceu em 1º). */
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
  /** null no torneio (não há portador). */
  carrier: RivalId | null;
  stars: number;
  events: PublicEvent[];
  view: TableView;
  /** Fichas que sobraram depois do débito. */
  tickets: number;
  tournament: BountyTournamentInfo;
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
  /** null no torneio. */
  carrier: RivalId | null;
  stars: number;
  loan: number;
  view: TableView;
  /** Últimos ≤ 60 eventos públicos (dedupe pelo `i`). */
  recent: PublicEvent[];
  result?: BountyResult;
  tournament?: BountyTournamentInfo;
  rewards?: TournamentRewards | null;
  /** Veio de um start repetido (mesmo idem): a partida que já estava aberta, sem nova cobrança. */
  duplicate?: boolean;
}

/**
 * Códigos do protocolo (proto 2, Pôster Poker): 426 update_required {min_proto} ·
 * 403 closed | age_required | bot | owned | won_this_week | attempts {attempts_used,
 * max_attempts} · 409 stale_week {tournament: {week, prize}} | prize_changed {prize} |
 * active_exists {matchId} | stale {seq, view, recent} · 400 stake_invalid {reason:
 * bad | not_owned | rarity | exclusive | staked} | bad_request · 402 no_chips {need,
 * have} · 422 illegal {view} · 404 not_found | none · 410 finished {result}.
 * status 0 = sem rede.
 */
export class PokerApiError extends Error {
  status: number;
  code: string;
  data?: unknown;
  constructor(status: number, code: string, data?: unknown) {
    super(code);
    this.name = 'PokerApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export interface PokerApi {
  getHome(): Promise<PokerHome>;
  getScoreboard(): Promise<PokerScoreboard>;
  confirmAge(): Promise<void>;
  claimTutorialChip(): Promise<{ granted: boolean; tickets: number }>;
  markStory(keys: string[]): Promise<void>;
  equip(slot: 'deck' | 'table' | 'quips', itemId: string): Promise<void>;
  reportFreeMatch(s: MatchSummary): Promise<{ ok: boolean; wins: number; title: TitleId; duplicate?: boolean; reason?: string }>;
  intervalPick(): Promise<IntervalPick | null>;
  /** Molduras e banners ganhos na mesa: "frame:gold", "banner:gold"… */
  cosmeticUnlocks(): Promise<Set<string>>;
  bounty: {
    /**
     * Entra no torneio da semana: week = tournament.week, prizeId = tournament.prize.id,
     * stake = fichas ou um pôster de stake_options. idem (uuid) torna o start repetível.
     */
    start(week: string, prizeId: string, stake?: TournamentStake, idem?: string): Promise<BountyStart>;
    act(matchId: string, seq: number, idem: string, action: PlayerAction, show?: boolean): Promise<BountyAct>;
    forfeit(matchId: string, seq: number): Promise<BountyResult>;
    resume(matchId?: string): Promise<BountyResume>;
  };
  /**
   * Fase 3: mesa com amigos (Edge poker-friends). Erros (PokerApiError): 403 closed | bot |
   * age_required | not_host | not_friend | not_seated · 404 no_room | not_invited · 409 full |
   * started | room_closed | in_room {roomId} | not_started | stale {seq, match} | not_yet
   * {deadline, serverNow} | not_your_turn {match} | start_blocked {blockers} | state_changed |
   * busy · 400 bad_request | stake_invalid {reason} | effects_invalid {reason} · 422 illegal
   * {match} · 410 finished {match} · 429 too_many.
   */
  friends: FriendsApi;
  /**
   * Fase 3: a casual de devolução. begin() a cada casual; mode 'server' → start(ticket) e a
   * partida segue como a do torneio (act/forfeit/resume). Erros: 410 gone (jogue no aparelho),
   * 404 not_found | none, 409 stale, 422 illegal, 410 finished.
   */
  casual: CasualApi;
}

// ---------------------------------------------------------------------------
// Chamadas
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : null);

async function rpc(fn: string, args?: Row): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as unknown;
}

// A Edge responde {ok:false, code, …} com o status HTTP do protocolo. O
// functions.invoke manda o token da sessão (renovado sozinho) e devolve o
// erro com a Response em `context`.
async function edge<T>(body: Row, fn: 'poker-bounty' | 'poker-friends' = 'poker-bounty'): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { proto: fn === 'poker-friends' ? FRIENDS_PROTO : POKER_PROTO, ...body },
    region: EDGE_REGION,
  });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError || error instanceof FunctionsRelayError) {
    const res = error.context as Response | undefined;
    let payload: Row | null = null;
    try {
      payload = asRow(await res?.json());
    } catch {
      payload = null;
    }
    const status = res?.status ?? 500;
    const code = typeof payload?.code === 'string' ? payload.code : `http_${status}`;
    throw new PokerApiError(status, code, payload ?? undefined);
  }
  if (error instanceof FunctionsFetchError) throw new PokerApiError(0, 'network', error.context);
  throw new PokerApiError(0, 'network', error);
}

function closedError(): PokerApiError {
  return new PokerApiError(403, 'closed');
}

async function getHome(): Promise<PokerHome> {
  const raw = asRow(await rpc('get_poker_home'));
  if (!raw || raw.enabled !== true) return { enabled: false, open: false };
  const home = raw as unknown as PokerHomeOpen;
  return {
    ...home,
    tickets: typeof raw.tickets === 'number' ? raw.tickets : home.tournament?.chips ?? 0,
    collection: Array.isArray(raw.collection) ? home.collection : [],
    cobra_items: Array.isArray(raw.cobra_items) ? home.cobra_items : [],
  };
}

async function getScoreboard(): Promise<PokerScoreboard> {
  const raw = asRow(await rpc('get_poker_scoreboard'));
  if (!raw || raw.enabled !== true) return { enabled: false, open: false };
  return raw as unknown as PokerScoreboardOpen;
}

async function confirmAge(): Promise<void> {
  const raw = asRow(await rpc('poker_confirm_age'));
  if (!raw || raw.ok !== true) throw closedError();
}

async function claimTutorialChip(): Promise<{ granted: boolean; tickets: number }> {
  const raw = asRow(await rpc('poker_claim_tutorial_chip'));
  if (!raw || raw.enabled === false) throw closedError();
  return { granted: raw.granted === true, tickets: typeof raw.tickets === 'number' ? raw.tickets : 0 };
}

async function markStory(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await rpc('poker_mark_story', { p_keys: keys });
}

async function equip(slot: 'deck' | 'table' | 'quips', itemId: string): Promise<void> {
  const raw = asRow(await rpc('poker_equip', { p_slot: slot, p_item_id: itemId }));
  if (!raw || raw.enabled === false) throw closedError();
  if (raw.ok !== true) throw new PokerApiError(400, typeof raw.reason === 'string' ? raw.reason : 'equip_failed', raw);
}

// O relato nunca concede nada; recusado (ok:false) não adianta reenviar. Erro de
// rede é LANÇADO, para a fila offline (poker.pending.v1) tentar de novo.
async function reportFreeMatch(s: MatchSummary): Promise<{ ok: boolean; wins: number; title: TitleId; duplicate?: boolean; reason?: string }> {
  const raw = asRow(await rpc('poker_report_free_match', { p_summary: s }));
  if (!raw) return { ok: false, wins: 0, title: 'figurante', reason: 'empty' };
  return {
    ok: raw.ok === true,
    wins: typeof raw.wins === 'number' ? raw.wins : 0,
    title: (typeof raw.title === 'string' ? raw.title : 'figurante') as TitleId,
    duplicate: raw.duplicate === true ? true : undefined,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
  };
}

async function intervalPick(): Promise<IntervalPick | null> {
  const raw = asRow(await rpc('poker_interval_pick'));
  if (!raw || raw.enabled === false || typeof raw.tmdb_id !== 'number') return null;
  const titlePt = typeof raw.title_pt === 'string' ? raw.title_pt : null;
  const titleEn = typeof raw.title_en === 'string' ? raw.title_en : null;
  return {
    media_type: raw.media_type === 'tv' ? 'tv' : 'movie',
    tmdb_id: raw.tmdb_id,
    movie_id: raw.tmdb_id,
    title_pt: titlePt,
    title_en: titleEn,
    title: titlePt || titleEn || '',
    poster_path: typeof raw.poster_path === 'string' ? raw.poster_path : null,
    poster_path_pt: typeof raw.poster_path_pt === 'string' ? raw.poster_path_pt : null,
    year: typeof raw.year === 'number' ? raw.year : null,
    oracle: (typeof raw.oracle === 'string' ? raw.oracle : 'bogart') as RivalId,
  };
}

async function cosmeticUnlocks(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const data = await rpc('get_my_cosmetic_unlocks');
    (Array.isArray(data) ? data : []).forEach((row) => {
      const r = asRow(row);
      if (r && typeof r.category === 'string' && typeof r.cosmetic_id === 'string') set.add(`${r.category}:${r.cosmetic_id}`);
    });
  } catch {
    // Servidor antigo (sem a função): nada desbloqueado a mais.
  }
  return set;
}

const bounty: PokerApi['bounty'] = {
  start: (week, prizeId, stake, idem) =>
    edge<BountyStart>({ op: 'start', week, prizeId, ...(stake ? { stake } : {}), ...(idem ? { idem } : {}) }),
  act: (matchId, seq, idem, action, show) =>
    edge<BountyAct>(show ? { op: 'act', matchId, seq, idem, action, show: true } : { op: 'act', matchId, seq, idem, action }),
  forfeit: async (matchId, seq) => (await edge<{ ok: true; result: BountyResult }>({ op: 'forfeit', matchId, seq })).result,
  resume: (matchId) => edge<BountyResume>(matchId ? { op: 'resume', matchId } : { op: 'resume' }),
};

// ---------------------------------------------------------------------------
// Fase 3 (03/11/2026, pacote F3): mesa com amigos e casual de devolução
// ---------------------------------------------------------------------------

const friendsEdge = <T>(body: Row): Promise<T> => edge<T>(body, 'poker-friends');

async function friendsHome(): Promise<FriendsHome> {
  const raw = asRow(await rpc('get_poker_friends_home'));
  if (!raw || raw.enabled !== true) return { enabled: false };
  return raw as unknown as FriendsHome;
}

async function inviteStates(roomIds: string[]): Promise<InviteState[]> {
  if (roomIds.length === 0) return [];
  const data = await rpc('get_poker_invites', { p_room_ids: roomIds.slice(0, 100) });
  return (Array.isArray(data) ? data : []) as InviteState[];
}

/**
 * Tempo real da sala: Broadcast PRIVADO no tópico `poker-room:<id>`, evento `ping` (só membros
 * recebem: RLS em realtime.messages). O ping não tem cartas; ao receber, chame sync(roomId, since).
 */
function subscribeRoom(roomId: string, onPing: (p: FriendsPing) => void): () => void {
  const ch = supabase
    .channel(`poker-room:${roomId}`, { config: { private: true } })
    .on('broadcast', { event: 'ping' }, ({ payload }) => {
      const p = asRow(payload) ?? {};
      onPing({
        roomId: typeof p.roomId === 'string' ? p.roomId : roomId,
        version: typeof p.version === 'number' ? p.version : 0,
        seq: typeof p.seq === 'number' ? p.seq : undefined,
        status: typeof p.status === 'string' ? (p.status as FriendsPing['status']) : undefined,
        toAct: typeof p.toAct === 'string' ? p.toAct : null,
        deadline: typeof p.deadline === 'string' ? p.deadline : null,
      });
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}

const friends: FriendsApi = {
  home: friendsHome,
  inviteStates,
  create: (stakeRarity) => friendsEdge<FriendsRoomReply>({ op: 'create', stakeRarity }),
  invite: (roomId, userIds) => friendsEdge<FriendsRoomReply>({ op: 'invite', roomId, userIds }),
  respond: (roomId, accept) => friendsEdge<FriendsRoomReply>({ op: 'respond', roomId, accept }),
  join: (code) => friendsEdge<FriendsRoomReply>({ op: 'join', code: code.trim().toUpperCase() }),
  leave: (roomId) => friendsEdge<FriendsRoomReply>({ op: 'leave', roomId }),
  configure: (roomId, stakeRarity) => friendsEdge<FriendsRoomReply>({ op: 'config', roomId, stakeRarity }),
  setEffects: (roomId, itemIds) => friendsEdge<FriendsRoomReply>({ op: 'effects', roomId, itemIds }),
  setStake: (roomId, itemId, effect) =>
    friendsEdge<FriendsRoomReply>(itemId === null ? { op: 'stake', roomId, itemId: null } : { op: 'stake', roomId, itemId, effect }),
  setReady: (roomId, ready) => friendsEdge<FriendsRoomReply>({ op: 'ready', roomId, ready }),
  start: (roomId, idem) => friendsEdge<FriendsRoomReply>(idem ? { op: 'start', roomId, idem } : { op: 'start', roomId }),
  sync: (roomId, since) => friendsEdge<FriendsRoomReply>(since === undefined ? { op: 'sync', roomId } : { op: 'sync', roomId, since }),
  act: (roomId, seq, idem, action, show) =>
    friendsEdge<FriendsRoomReply>(show ? { op: 'act', roomId, seq, idem, action, show: true } : { op: 'act', roomId, seq, idem, action }),
  tick: (roomId, seq) => friendsEdge<FriendsRoomReply>({ op: 'tick', roomId, seq }),
  back: (roomId) => friendsEdge<FriendsRoomReply>({ op: 'back', roomId }),
  subscribe: subscribeRoom,
};

async function casualBegin(): Promise<CasualBegin> {
  const raw = asRow(await rpc('poker_casual_begin'));
  if (!raw || raw.enabled !== true) return { enabled: false };
  if (raw.mode === 'server' && typeof raw.ticket === 'string') return { enabled: true, mode: 'server', ticket: raw.ticket };
  if (raw.mode === 'server' && typeof raw.matchId === 'string') return { enabled: true, mode: 'server', matchId: raw.matchId, resume: true };
  return { enabled: true, mode: 'device' };
}

const casual: CasualApi = {
  begin: casualBegin,
  start: (ticket) => friendsEdge({ op: 'recover.start', ticket }),
  act: (matchId, seq, idem, action, show) =>
    friendsEdge(show ? { op: 'recover.act', matchId, seq, idem, action, show: true } : { op: 'recover.act', matchId, seq, idem, action }),
  forfeit: async (matchId, seq) =>
    (await friendsEdge<{ ok: true; result: Awaited<ReturnType<CasualApi['forfeit']>> }>({ op: 'recover.forfeit', matchId, seq })).result,
  resume: (matchId) => friendsEdge(matchId ? { op: 'recover.resume', matchId } : { op: 'recover.resume' }),
};

export const pokerApi: PokerApi = {
  getHome,
  getScoreboard,
  confirmAge,
  claimTutorialChip,
  markStory,
  equip,
  reportFreeMatch,
  intervalPick,
  cosmeticUnlocks,
  bounty,
  friends,
  casual,
};

export default pokerApi;
