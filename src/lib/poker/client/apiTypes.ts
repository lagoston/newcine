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

// ---------------------------------------------------------------------------
// Pôster Poker — fase 3 (03/11/2026, pacote F3): mesa com amigos e devolução na casual.
// Edge `poker-friends` (FRIENDS_PROTO = 1), RPCs get_poker_friends_home / get_poker_invites /
// poker_casual_begin. Formato completo em .../poker3/status/F3_NOTES.md. Os nomes são os
// mesmos que a interface (G3) já usava em client/friends.ts.
// ---------------------------------------------------------------------------

export type FriendsRoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';
export type FriendsMemberStatus = 'invited' | 'joined' | 'declined' | 'left' | 'expired';

/** Por que a aposta de alguém não vale (member.stakeProblem, stake_invalid.reason). */
export type FriendsStakeProblem =
  | 'missing' | 'rarity' | 'exclusive' | 'not_owned' | 'staked' | 'someone_has' | 'no_stake_room';

/** O que impede quem criou de começar (room.blockers, start_blocked.blockers). */
export type FriendsStartBlocker = 'need_players' | 'not_ready' | 'stake_problem' | 'member_closed';

/** Um pôster na sala: de efeito (gold do Pôster Poker) ou apostado (da coleção). */
export interface FriendsPosterCard {
  itemId: number;
  effect: PosterVersionEffect;
  title: string | null;
  titleEn: string | null;
  year: number | null;
  filePath: string;
  serial: number | null;
  rarity: Rarity;
  /** Só nos pôsteres de efeito (gold do Pôster Poker). */
  prizeId?: string;
  effectId?: PosterEffectId;
  /** Só em member.stake: held (travado) | returned | transferred | lost. */
  status?: 'held' | 'returned' | 'transferred' | 'lost' | null;
}

export interface FriendsMember {
  userId: string;
  username: string;
  avatarUrl: string | null;
  avatarFrame: string | null;
  status: FriendsMemberStatus;
  isHost: boolean;
  /** Quem criou conta sempre como pronto. */
  ready: boolean;
  effectPosters: FriendsPosterCard[];
  stake: FriendsPosterCard | null;
  /** Só no lobby, numa sala valendo pôster. */
  stakeProblem: FriendsStakeProblem | string | null;
  /** Na partida. */
  seat: number | null;
  playerId: string | null;
  away: boolean;
  place: number | null;
}

export interface FriendsStakeOutcome extends FriendsPosterCard {
  ownerId: string;
  /** returned = voltou ao dono (venceu, ou quem venceu já tinha a cópia); transferred = foi para quem venceu; lost = ficou com o oráculo. */
  outcome: 'returned' | 'transferred' | 'lost';
  toUserId: string | null;
  oracle: RivalId | null;
}

export interface FriendsResult {
  winner: { kind: 'person'; playerId: string; userId: string } | { kind: 'oracle'; playerId: string; oracle: RivalId };
  places: { playerId: string; place: number | null; userId?: string | null; oracle?: RivalId | null }[];
  stakes: FriendsStakeOutcome[];
  /** A semente revelada (sha256(seed) = seedHash). */
  seed: string;
}

export interface FriendsRoom {
  id: string;
  /** 6 letras/números, sem I, O, 0 e 1. */
  code: string;
  status: FriendsRoomStatus;
  hostId: string;
  /** null = sem aposta. */
  stakeRarity: Rarity | null;
  /** Sobe a cada mudança (o ping traz o mesmo número). */
  version: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** 'host_left' | 'idle' (lobby parado 2 h) | 'stuck' (partida parada 24 h: apostas devolvidas). */
  closedReason?: string | null;
  me: { userId: string; status: FriendsMemberStatus | null; isHost: boolean };
  /** joined + invited pendentes (+ quem jogou, depois do começo). */
  members: FriendsMember[];
  /** Todos os efeitos da mesa (repetido = acumula). */
  effects: PosterEffectId[];
  canStart: boolean;
  blockers: (FriendsStartBlocker | string)[];
  /** Só no lobby, só os MEUS: pôsteres de efeito que tenho e pôsteres que posso apostar NESTA sala. */
  options: { effects: FriendsPosterCard[]; stakes: FriendsPosterCard[] } | null;
  result: FriendsResult | null;
}

export interface FriendsSeat {
  seat: number;
  playerId: string;
  kind: 'person' | 'oracle';
  userId?: string;
  oracle?: RivalId;
}

/**
 * A partida vista por UMA pessoa. `view`/`events` são crus (ids p1..p4 e dos oráculos; só as
 * cartas fechadas de `myPlayerId`); para tratar "eu" como 'human', passe por povView/povEvents.
 */
export interface FriendsMatch {
  seq: number;
  seedHash: string;
  myPlayerId: string | null;
  /** O meu lugar no motor (0..3). */
  mySeat?: number | null;
  seats: FriendsSeat[];
  /** Os efeitos da mesa. */
  effects?: PosterEffectId[];
  view: TableView;
  /** Eventos públicos com i > since (sem since: os últimos 60; numa jogada: os dela). */
  events: PublicEvent[];
  /** true = faltam eventos antes destes (redesenhe pela view). */
  gap: boolean;
  /** playerId da pessoa cuja decisão a mesa espera. */
  toAct: string | null;
  /** Prazo dessa decisão (ISO, relógio do servidor). */
  deadline: string | null;
  serverNow: string;
  /** playerIds ausentes. */
  away: string[];
  result: FriendsResult | null;
}

export interface FriendsRoomReply {
  ok: true;
  room: FriendsRoom;
  match?: FriendsMatch | null;
  /** invite. */
  invited?: string[];
  skipped?: { userId: string; reason: 'self' | 'not_friend' | 'closed' | 'already' | 'too_soon' | 'full' | string }[];
  /** act repetido (mesmo idem): a jogada já tinha sido feita. */
  duplicate?: boolean;
}

export interface FriendsRoomBrief {
  id: string;
  code: string;
  status: FriendsRoomStatus;
  hostId: string;
  stakeRarity: Rarity | null;
  members: number;
  version: number;
}

export interface FriendsInvite {
  roomId: string;
  code: string;
  host: { userId: string; username: string; avatarUrl: string | null };
  stakeRarity: Rarity | null;
  members: number;
  invitedAt: string;
}

export interface FriendsFriend {
  userId: string;
  username: string;
  avatarUrl: string | null;
  avatarFrame: string | null;
  /** Já sentado numa sala aberta (lobby ou partida). */
  inRoom: boolean;
}

export type FriendsHome =
  | { enabled: false }
  | {
      enabled: true;
      room: FriendsRoomBrief | null;
      invites: FriendsInvite[];
      friends: FriendsFriend[];
      effectPosters: FriendsPosterCard[];
      scoreboard: { userId: string; username: string; avatarUrl: string | null; wins: number; matches: number }[];
    };

/** O estado de um convite citado nos Sussurros (get_poker_invites). */
export interface InviteState {
  roomId: string;
  state: 'open' | 'joined' | 'declined' | 'full' | 'started' | 'closed';
  stakeRarity: Rarity | null;
  members: number;
  code: string;
}

/** O aviso do tempo real (Broadcast privado `poker-room:<id>`, evento `ping`). Sem cartas. */
export interface FriendsPing {
  roomId?: string;
  version: number;
  seq?: number;
  status?: FriendsRoomStatus;
  toAct?: string | null;
  deadline?: string | null;
}

export interface FriendsApi {
  home(): Promise<FriendsHome>;
  inviteStates(roomIds: string[]): Promise<InviteState[]>;
  create(stakeRarity: Rarity | null): Promise<FriendsRoomReply>;
  invite(roomId: string, userIds: string[]): Promise<FriendsRoomReply>;
  respond(roomId: string, accept: boolean): Promise<FriendsRoomReply>;
  join(code: string): Promise<FriendsRoomReply>;
  leave(roomId: string): Promise<FriendsRoomReply>;
  configure(roomId: string, stakeRarity: Rarity | null): Promise<FriendsRoomReply>;
  setEffects(roomId: string, itemIds: number[]): Promise<FriendsRoomReply>;
  setStake(roomId: string, itemId: number | null, effect?: string): Promise<FriendsRoomReply>;
  setReady(roomId: string, ready: boolean): Promise<FriendsRoomReply>;
  start(roomId: string, idem?: string): Promise<FriendsRoomReply>;
  sync(roomId: string, since?: number): Promise<FriendsRoomReply>;
  act(roomId: string, seq: number, idem: string, action: PlayerAction, show?: boolean): Promise<FriendsRoomReply>;
  tick(roomId: string, seq: number): Promise<FriendsRoomReply>;
  back(roomId: string): Promise<FriendsRoomReply>;
  /** Tempo real: chama `onPing` a cada mudança da sala. Devolve o "desligar". */
  subscribe(roomId: string, onPing: (p: FriendsPing) => void): () => void;
}

/** poker_casual_begin(): chame ao começar TODA casual. */
export type CasualBegin =
  | { enabled: false }
  | { enabled: true; mode: 'device' }
  | { enabled: true; mode: 'server'; ticket: string }
  | { enabled: true; mode: 'server'; matchId: string; resume: true };

export interface RecoverResult extends BountyResult {
  /** O pôster voltou (capturou o portador ou venceu a mesa). */
  recovered?: boolean;
  poster?: FriendsPosterCard | null;
}

export interface CasualApi {
  begin(): Promise<CasualBegin>;
  /** 410 gone = não há mais o que devolver: jogue a casual no aparelho. */
  start(ticket: string): Promise<BountyStart & { recoverPrize?: FriendsPosterCard | null; prizeId?: string }>;
  act(matchId: string, seq: number, idem: string, action: PlayerAction, show?: boolean): Promise<BountyAct & { result?: RecoverResult }>;
  forfeit(matchId: string, seq: number): Promise<RecoverResult>;
  resume(matchId?: string): Promise<BountyResume & { result?: RecoverResult; recoverPrize?: FriendsPosterCard | null; prizeId?: string }>;
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
  /** Fase 3 (F3): mesa com amigos (Edge poker-friends). Opcional: o mock antigo não tem. */
  friends?: FriendsApi;
  /** Fase 3 (F3): o contador de casuais e a casual de devolução. */
  casual?: CasualApi;
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
