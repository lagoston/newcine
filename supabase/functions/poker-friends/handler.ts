/**
 * poker-friends — a mesa COM AMIGOS do Pôster Poker e a casual de devolução, sem Deno nem rede.
 *
 * 03/11/2026 (pacote F3, fase 3). O index.ts cuida de HTTP, CORS e de quem chama (o uid do
 * token, ou a rotina agendada com a chave interna); aqui só entra o corpo já lido e as
 * dependências (rpc com a service role e o relógio), para o mesmo código rodar no Deno (Edge)
 * e no Node (scripts/poker/test-friends-protocol.ts, com um banco falso).
 *
 * Mesa com amigos (BRIEF3 item 4): o lobby (criar, convidar, entrar, apostar, pronto) é todo
 * do banco (RPCs poker_room_*); a partida roda aqui com o motor do E3 (friendsConfig,
 * applyPersonAction, timeoutPerson, personBack, leavePerson, waitingFor, friendsResult) e o
 * estado inteiro (privado) fica no banco. Cada aparelho recebe só a SUA visão:
 * tableView(state, eu) e toPublicEvents(eventos, eu) — cartas fechadas só as dele. O relógio
 * (30 s) é do banco: um "estourou" só passa com now() >= deadline_at (poker_room_step).
 *
 * Casual de devolução (item 5): o oráculo que tomou o pôster o carrega (rescueConfig, o
 * portador da fase 1). Capturou ou venceu a mesa = o banco devolve (poker_recover_step).
 *
 * Segurança: o uid nunca vem do corpo; o lugar de cada pessoa (userId → playerId) é o do
 * banco; cartas, oráculos e semente ficam no servidor (a semente sai só no fim).
 */
import { PokerRuleError } from '../poker-bounty/_engine/engine.ts';
import type { PlayerAction } from '../poker-bounty/_engine/engine.ts';
import { DEFAULT_SETTINGS } from '../poker-bounty/_engine/config.ts';
import { DEFAULT_PROFILES, mergeProfile } from '../poker-bounty/_engine/bots/profile.ts';
import {
  abandonMatch,
  applyHumanAction,
  applyPersonAction,
  createMatch,
  forfeitMatch,
  friendsConfig,
  friendsResult,
  leavePerson,
  outcomeOf,
  personBack,
  rescueConfig,
  summarizeMatch,
  tableView,
  timeoutPerson,
  toPublicEvents,
  waitingFor,
} from '../poker-bounty/_engine/match/match.ts';
import type {
  BotProfile,
  MatchEvent,
  MatchOutcome,
  MatchState,
  MatchStep,
  PlayerId,
  PokerSettings,
  PosterEffectId,
  PublicEvent,
  Rarity,
  RivalId,
  TableView,
} from '../poker-bounty/_engine/types.ts';
import { ENGINE_HASH } from '../poker-bounty/_engine/ENGINE_HASH.ts';

export interface Deps {
  /** Chama uma RPC com a service role. Erro do banco → lança. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Agora, em ISO. */
  nowIso(): string;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

type Row = Record<string, unknown>;

/** Protocolo desta Edge (separado do proto 2 da poker-bounty). */
export const FRIENDS_PROTO = 1;
/** 30 s por decisão de pessoa (BRIEF3). */
const CLOCK_SECS = 30;
const STATE_VERSION = 1;
/** Eventos públicos devolvidos num sync sem `since`. */
const RECENT_PUBLIC = 60;
const RECENT_STALE = 20;
const SWEEP_ROOMS = 10;
const SWEEP_BUDGET_MS = 20_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const STAKE_EFFECTS = ['none', 'holo', 'negative', 'ultra_red'];
const POSTER_EFFECTS: readonly PosterEffectId[] = [
  'early_flop', 'double_pot', 'blackjack', 'hand_bounty', 'eight_aces', 'reveal_one', 'sixth_card', 'opal', 'tell',
];
const EFFECT_INT_KEYS = ['casts', 'gapHands', 'amount', 'hands', 'spread'];
const ORACLES = ['bogart', 'fincher', 'cypher'];

const asRow = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);
const ok = (body: Row): Reply => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, code: string, extra: Row = {}): Reply => ({ status, body: { ok: false, code, ...extra } });
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

// ---------------------------------------------------------------------------
// Utilidades (as mesmas da poker-bounty)
// ---------------------------------------------------------------------------

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Semente de 128 bits do servidor (nunca do aparelho). */
function newSeed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return hex(b);
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hex(new Uint8Array(d));
}

/** A jogada da pessoa, com a forma exata do motor (nada a mais passa). */
function parseAction(v: unknown): PlayerAction | null {
  const a = asRow(v);
  if (!a || typeof a.type !== 'string') return null;
  switch (a.type) {
    case 'fold':
    case 'check':
    case 'call':
    case 'allIn':
      return { type: a.type };
    case 'bet':
    case 'raise':
      return isInt(a.amount) && a.amount > 0 && a.amount <= 1_000_000 ? { type: a.type, amount: a.amount } : null;
    default:
      return null;
  }
}

function effectsFrom(raw: unknown): PokerSettings['effects'] | undefined {
  const fx = asRow(raw);
  if (!fx) return undefined;
  const out: Record<string, Record<string, unknown>> = {};
  for (const id of POSTER_EFFECTS) {
    const row = asRow(fx[id]);
    if (!row) continue;
    const p: Record<string, unknown> = {};
    for (const k of EFFECT_INT_KEYS) {
      const v = row[k];
      if (isInt(v) && v >= 0 && v <= 100_000) p[k] = v;
    }
    const fh = row.firstHand;
    if (Array.isArray(fh) && fh.length === 2 && fh.every((n) => isInt(n) && n >= 0 && n <= 500) && fh[0] <= fh[1]) {
      p.firstHand = [fh[0], fh[1]];
    }
    if (Object.keys(p).length > 0) out[id] = p;
  }
  return Object.keys(out).length > 0 ? (out as PokerSettings['effects']) : undefined;
}

function settingsFrom(raw: unknown): PokerSettings {
  const s = asRow(raw);
  if (!s) return DEFAULT_SETTINGS;
  const levels = Array.isArray(s.levels) && s.levels.length > 0 ? (s.levels as [number, number, number][]) : DEFAULT_SETTINGS.levels;
  const effects = effectsFrom(s.effects);
  return {
    startStack: isInt(s.start_stack) ? s.start_stack : DEFAULT_SETTINGS.startStack,
    handsPerLevel: isInt(s.hands_per_level) ? s.hands_per_level : DEFAULT_SETTINGS.handsPerLevel,
    levels,
    loanAmount: isInt(s.loan_amount) ? s.loan_amount : DEFAULT_SETTINGS.loanAmount,
    maxAttempts: isInt(s.max_attempts) ? s.max_attempts : DEFAULT_SETTINGS.maxAttempts,
    carrierByRarity: (asRow(s.carrier_by_rarity) as PokerSettings['carrierByRarity'] | null) ?? DEFAULT_SETTINGS.carrierByRarity,
    difficulty: (asRow(s.difficulty) as PokerSettings['difficulty'] | null) ?? DEFAULT_SETTINGS.difficulty,
    ...(effects ? { effects } : {}),
  };
}

/** Perfis = padrão do código + poker_bot_params (filtrado por LIMITS). Congelados na partida. */
function profilesFrom(raw: unknown): { profiles: Record<RivalId, BotProfile>; versions: Record<RivalId, number> } {
  const params = asRow(raw) ?? {};
  const profiles: Record<RivalId, BotProfile> = {} as Record<RivalId, BotProfile>;
  const versions: Record<RivalId, number> = {} as Record<RivalId, number>;
  for (const id of Object.keys(DEFAULT_PROFILES) as (keyof typeof DEFAULT_PROFILES)[]) {
    const row = asRow(params[id]);
    profiles[id] = row ? mergeProfile(DEFAULT_PROFILES[id], row.params) : DEFAULT_PROFILES[id];
    versions[id] = row && isInt(row.version) ? row.version : 1;
  }
  return { profiles, versions };
}

/** O seedHash vai no matchStarted (commit). Serve para eventos privados e públicos. */
function withSeedHash<T extends { type?: string; t?: string }>(events: T[], seedHash: string): T[] {
  return events.map((e) => (e.type === 'matchStarted' || e.t === 'matchStarted' ? { ...e, seedHash } : e));
}

function tail<T>(v: unknown, n: number): T[] {
  return Array.isArray(v) ? (v.slice(-n) as T[]) : [];
}

/** Resposta de erro do banco ({ok:false, status, code, …}) → Reply, sem os campos internos. */
function dbFail(r: Row | null): Reply {
  if (!r) return fail(500, 'server_error');
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) if (k !== 'ok' && k !== 'status' && k !== 'code') out[k] = v;
  return fail(isInt(r.status) ? r.status : 500, typeof r.code === 'string' ? r.code : 'server_error', out);
}

/** Uma RPC do lobby: devolve o JSON do banco como está (ok) ou o erro com o status do banco. */
async function lobbyCall(deps: Deps, fn: string, args: Row): Promise<Reply> {
  const r = asRow(await deps.rpc(fn, args));
  if (!r) return fail(500, 'server_error');
  if (r.ok !== true) return dbFail(r);
  const { ok: _ok, ...rest } = r;
  return ok(rest);
}

// ---------------------------------------------------------------------------
// A partida da mesa com amigos
// ---------------------------------------------------------------------------

interface RoomLoaded {
  id: string;
  status: 'lobby' | 'playing' | 'finished' | 'closed';
  host_id: string;
  seq: number;
  version: number;
  state: MatchState | null;
  events_tail: MatchEvent[];
  seats: { seat: number; playerId: string; kind: 'person' | 'oracle'; userId?: string; oracle?: string }[] | null;
  effects: PosterEffectId[];
  seed_hash: string | null;
  seed: string | null;
  to_act: string | null;
  deadline_at: string | null;
  deadline_passed: boolean;
  server_now: string;
  started_at: string | null;
  result: Row | null;
  room?: Row | null;
  me: { user_id: string; status: string; player_id: string | null; seat: number | null; last_idem: string | null; last_seq: number | null } | null;
}

async function loadRoom(deps: Deps, uid: string | null, roomId: string): Promise<RoomLoaded | null> {
  const r = asRow(await deps.rpc('poker_room_load', { p_uid: uid, p_room_id: roomId }));
  return r ? (r as unknown as RoomLoaded) : null;
}

/** Eventos privados com i > since (puxando o actionMeta que completa a primeira ação). */
function privateSince(evs: MatchEvent[], since: number): MatchEvent[] {
  let k = evs.findIndex((e) => e.i > since);
  if (k < 0) return [];
  if (k > 0 && evs[k - 1].type === 'actionMeta') k -= 1;
  return evs.slice(k);
}

/**
 * O que UM aparelho recebe (FriendsMatch do F3_NOTES): a visão e os eventos públicos de
 * quem pede (tableView/toPublicEvents com o id dele), crus (o aparelho aplica povView/povEvents
 * se quiser tratar "eu" como 'human').
 */
function matchPayload(
  L: RoomLoaded, state: MatchState, privTail: MatchEvent[], pid: string, since: number | null,
  extra: { seq?: number; deadline?: string | null; toAct?: string | null; serverNow?: string; result?: Row | null } = {},
): Row {
  const view: TableView = tableView(state, pid as PlayerId);
  let events: PublicEvent[];
  let gap = false;
  if (since === null) {
    events = toPublicEvents(privTail, pid as PlayerId).slice(-RECENT_PUBLIC);
  } else {
    const first = privTail.length > 0 ? privTail[0].i : null;
    gap = first !== null && first > since + 1;
    events = toPublicEvents(privateSince(privTail, since), pid as PlayerId).filter((e) => e.i > since);
  }
  const people = (view as unknown as { people?: Record<string, { away?: boolean } | undefined> }).people ?? {};
  return {
    seq: extra.seq ?? L.seq,
    seedHash: L.seed_hash,
    myPlayerId: pid,
    mySeat: state.config.seats[pid as PlayerId] ?? null,
    seats: L.seats ?? [],
    effects: L.effects ?? [],
    view,
    events,
    gap,
    toAct: extra.toAct !== undefined ? extra.toAct : L.to_act,
    deadline: extra.deadline !== undefined ? extra.deadline : L.deadline_at,
    serverNow: extra.serverNow ?? L.server_now ?? null,
    away: Object.entries(people).filter(([, p]) => p?.away === true).map(([id]) => id),
    result: extra.result !== undefined ? extra.result : L.result ?? null,
  };
}

/** {p2: {away, streak, place, status}} para o banco (poker_room_members). */
function peopleRow(state: MatchState): Row {
  const res = friendsResult(state);
  const out: Row = {};
  for (const [id, p] of Object.entries(res.people)) {
    out[id] = { away: p.away, streak: p.streak, place: p.place, status: p.status };
  }
  return out;
}

type StepKind = 'act' | 'timeout' | 'back' | 'leave';

interface Saved {
  reply: Reply | null;
  seq: number;
  tailAfter: MatchEvent[];
  toAct: string | null;
  deadline: string | null;
  serverNow: string | null;
  result: Row | null;
}

/** Grava um passo (poker_room_step). Erro do banco → reply preenchida. */
async function saveRoomStep(
  deps: Deps, L: RoomLoaded, step: MatchStep, kind: StepKind, actor: string | null, idem: string | null,
): Promise<Saved> {
  const res = friendsResult(step.state);
  const to = res.done ? null : waitingFor(step.state);
  // Voltar/sair não dão tempo a mais a quem já está na vez (-1 = mantém o prazo).
  const keep = (kind === 'back' || kind === 'leave') && to !== null && to === L.to_act;
  const secs = to === null ? null : keep ? -1 : CLOCK_SECS;
  const finished = res.done ? { winnerId: res.winnerId, places: res.places } : null;
  const saved = asRow(
    await deps.rpc('poker_room_step', {
      p_room_id: L.id,
      p_expected_seq: L.seq,
      p_kind: kind,
      p_actor: actor,
      p_idem: idem,
      p_state: step.state,
      p_events_append: step.events,
      p_to_act: to,
      p_deadline_secs: secs,
      p_hands: step.state.game.handNumber,
      p_people: peopleRow(step.state),
      p_finished: finished,
    }),
  );
  const tailAfter = [...(L.events_tail ?? []), ...step.events].slice(-200);
  if (!saved || saved.ok !== true) {
    return { reply: dbFail(saved), seq: L.seq, tailAfter, toAct: L.to_act, deadline: L.deadline_at, serverNow: null, result: null };
  }
  return {
    reply: null,
    seq: isInt(saved.seq) ? saved.seq : L.seq + 1,
    tailAfter,
    toAct: typeof saved.toAct === 'string' ? saved.toAct : null,
    deadline: typeof saved.deadline === 'string' ? saved.deadline : null,
    serverNow: typeof saved.serverNow === 'string' ? saved.serverNow : deps.nowIso(),
    result: asRow(saved.result),
  };
}

/** Depois de gravar: a resposta de quem pediu (a visão dele já com o passo). */
function afterStep(L: RoomLoaded, step: MatchStep, s: Saved, pid: string, since: number | null): Reply {
  // Sem `since`: só os eventos deste passo.
  const from = since ?? (step.events.length > 0 ? step.events[0].i - 1 : null);
  return ok({
    // A sala como estava ao carregar (membros/apostas não mudam numa jogada; ausente e
    // colocação vêm na visão, view.people).
    room: L.room ?? null,
    match: matchPayload(L, step.state, s.tailAfter, pid, from, {
      seq: s.seq, toAct: s.toAct, deadline: s.deadline, serverNow: s.serverNow ?? undefined, result: s.result,
    }),
  });
}

function parseSince(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  return isInt(v) && v >= -1 && v <= 10_000_000 ? v : undefined;
}

/** O sync de uma pessoa: a sala (lobby, membros, resultado) e, se houver partida, a visão dela. */
async function opSync(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const roomId = body.roomId;
  const since = parseSince(body.since);
  if (!isUuid(roomId) || since === undefined) return fail(400, 'bad_request');
  const L = await loadRoom(deps, uid, roomId);
  if (!L || !L.me) return fail(404, 'no_room');
  const pid = L.me.player_id;
  const match = L.state && pid && L.status !== 'lobby' ? matchPayload(L, L.state, L.events_tail ?? [], pid, since) : null;
  return ok({ room: L.room ?? null, match });
}

/** Erro do motor → resposta (com a visão atual para o aparelho se acertar). */
function ruleFail(e: PokerRuleError, L: RoomLoaded, pid: string): Reply {
  const match = L.state ? matchPayload(L, L.state, L.events_tail ?? [], pid, null) : null;
  if (e.code === 'not_your_turn') return fail(409, 'not_your_turn', { match });
  // 03/11/2026 (E3 final): quem já caiu ou saiu recebe game_over do motor. A mesa das
  // outras pessoas segue: código claro, nada gravado (nunca 500, nunca trava a sala).
  if (e.code === 'game_over') {
    return L.status === 'playing' ? fail(409, 'not_playing', { match }) : fail(410, 'finished', { match });
  }
  return fail(422, 'illegal', { match });
}

/**
 * De quem o relógio estourou: a pessoa que o MOTOR espera agora (o to_act do banco é o
 * mesmo; se um dia divergirem, vale o estado, para a sala nunca ficar presa num lugar que
 * não decide mais).
 */
function clockOwner(L: RoomLoaded): PlayerId | null {
  if (!L.state) return null;
  return waitingFor(L.state) ?? null;
}

/** Partida em andamento e a pessoa sentada nela (com lugar). null = segue. */
function seatedCheck(L: RoomLoaded | null): Reply | null {
  if (!L || !L.me) return fail(404, 'no_room');
  if (L.status === 'lobby') return fail(409, 'not_started');
  if (L.status !== 'playing' || !L.state) {
    return fail(410, 'finished', { match: L.state && L.me.player_id ? matchPayload(L, L.state, L.events_tail ?? [], L.me.player_id, null) : null });
  }
  if (!L.me.player_id) return fail(403, 'not_seated');
  return null;
}

async function opAct(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { roomId, seq, idem } = body;
  const since = parseSince(body.since);
  if (!isUuid(roomId) || !isInt(seq) || !isUuid(idem) || since === undefined) return fail(400, 'bad_request');
  const action = parseAction(body.action);
  if (!action) return fail(400, 'bad_request');
  const L = await loadRoom(deps, uid, roomId);
  const bad = seatedCheck(L);
  if (bad) return bad;
  const pid = L!.me!.player_id!;
  // Repetição de rede (o mesmo idem): a jogada já foi; devolve a visão atual.
  if (L!.me!.last_idem === idem) {
    return ok({ duplicate: true, room: L!.room ?? null, match: matchPayload(L!, L!.state!, L!.events_tail ?? [], pid, since) });
  }
  // Saiu da sala (desistiu): não joga mais; a mesa segue para os outros.
  if (L!.me!.status !== 'joined') return fail(409, 'not_playing', { match: matchPayload(L!, L!.state!, L!.events_tail ?? [], pid, since) });
  if (seq !== L!.seq) return fail(409, 'stale', { seq: L!.seq, match: matchPayload(L!, L!.state!, L!.events_tail ?? [], pid, since) });
  let step: MatchStep;
  try {
    step = applyPersonAction(L!.state!, pid as PlayerId, action, { show: body.show === true });
  } catch (e) {
    if (e instanceof PokerRuleError) return ruleFail(e, L!, pid);
    throw e;
  }
  const s = await saveRoomStep(deps, L!, step, 'act', uid, idem);
  if (s.reply) return s.reply;
  return afterStep(L!, step, s, pid, since);
}

/** O prazo da vez passou: qualquer aparelho da sala pede; o banco confere o prazo. */
async function opTick(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { roomId, seq } = body;
  const since = parseSince(body.since);
  if (!isUuid(roomId) || !isInt(seq) || since === undefined) return fail(400, 'bad_request');
  const L = await loadRoom(deps, uid, roomId);
  const bad = seatedCheck(L);
  if (bad) return bad;
  const pid = L!.me!.player_id!;
  if (seq !== L!.seq) return fail(409, 'stale', { seq: L!.seq, match: matchPayload(L!, L!.state!, L!.events_tail ?? [], pid, since) });
  const owner = clockOwner(L!);
  if (!L!.deadline_passed || !owner) {
    return fail(409, 'not_yet', { deadline: L!.deadline_at, serverNow: L!.server_now });
  }
  let step: MatchStep;
  try {
    step = timeoutPerson(L!.state!, owner);
  } catch (e) {
    if (e instanceof PokerRuleError) return ruleFail(e, L!, pid);
    throw e;
  }
  const s = await saveRoomStep(deps, L!, step, 'timeout', null, null);
  if (s.reply) return s.reply;
  return afterStep(L!, step, s, pid, since);
}

async function opBack(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { roomId } = body;
  const since = parseSince(body.since);
  if (!isUuid(roomId) || since === undefined) return fail(400, 'bad_request');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const L = await loadRoom(deps, uid, roomId);
    const bad = seatedCheck(L);
    if (bad) return bad;
    const pid = L!.me!.player_id!;
    let step: MatchStep;
    try {
      step = personBack(L!.state!, pid as PlayerId);
    } catch (e) {
      if (e instanceof PokerRuleError) return ruleFail(e, L!, pid);
      throw e;
    }
    if (step.events.length === 0) return ok({ room: L!.room ?? null, match: matchPayload(L!, L!.state!, L!.events_tail ?? [], pid, since) });
    const s = await saveRoomStep(deps, L!, step, 'back', uid, null);
    if (s.reply && s.reply.body.code === 'stale') continue;
    if (s.reply) return s.reply;
    return afterStep(L!, step, s, pid, since);
  }
  return fail(409, 'busy');
}

/** Sair: no lobby, sai (quem criou fecha a sala); na partida, desiste (a aposta vai para quem vencer). */
async function opLeave(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { roomId } = body;
  if (!isUuid(roomId)) return fail(400, 'bad_request');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const L = await loadRoom(deps, uid, roomId);
    if (!L || !L.me) return fail(404, 'no_room');
    if (L.status !== 'playing') return lobbyCall(deps, 'poker_room_leave_lobby', { p_uid: uid, p_room_id: roomId });
    const pid = L.me.player_id;
    if (!pid || !L.state || L.me.status !== 'joined') return lobbyCall(deps, 'poker_room_detach', { p_uid: uid, p_room_id: roomId });
    const me = friendsResult(L.state).people[pid as PlayerId];
    // Já caiu (só assistia): solta a sala sem mexer no jogo.
    if (!me || me.status !== 'playing') return lobbyCall(deps, 'poker_room_detach', { p_uid: uid, p_room_id: roomId });
    let step: MatchStep;
    try {
      step = leavePerson(L.state, pid as PlayerId, 'forfeit');
    } catch (e) {
      if (e instanceof PokerRuleError) return lobbyCall(deps, 'poker_room_detach', { p_uid: uid, p_room_id: roomId });
      throw e;
    }
    const s = await saveRoomStep(deps, L, step, 'leave', uid, null);
    if (s.reply && s.reply.body.code === 'stale') continue;
    if (s.reply) return s.reply;
    // A sala já com a saída (eu 'left'); a partida segue para os outros.
    return opSync({ roomId }, uid, deps);
  }
  return fail(409, 'busy');
}

/** Começar (quem criou): o banco confere e ordena as pessoas; o motor sorteia os lugares pela semente. */
async function opStart(body: Row, uid: string, deps: Deps, retry: number): Promise<Reply> {
  const { roomId } = body;
  const idem = body.idem ?? null;
  if (!isUuid(roomId) || (idem !== null && !isUuid(idem))) return fail(400, 'bad_request');
  const prep = asRow(await deps.rpc('poker_room_prepare', { p_uid: uid, p_room_id: roomId, p_idem: idem }));
  if (!prep) return fail(500, 'server_error');
  if (prep.ok !== true) {
    if (prep.code === 'duplicate') return opSync({ roomId }, uid, deps);
    return dbFail(prep);
  }
  const people = (Array.isArray(prep.people) ? prep.people : []) as { userId: string; playerId: string }[];
  if (people.length < 2 || people.length > 4) return fail(409, 'start_blocked', { blockers: ['need_players'] });
  const seed = newSeed();
  const seedHash = await sha256Hex(seed);
  const settings = settingsFrom(prep.settings);
  const { profiles, versions } = profilesFrom(prep.bot_params);
  const cfg = friendsConfig({
    seed, people: people.length, effects: Array.isArray(prep.effects) ? prep.effects : [], settings, profiles, paramsVersion: versions,
  });
  const step = createMatch(cfg);
  const events = withSeedHash(step.events, seedHash);
  const seats = Object.entries(step.state.config.seats)
    .map(([id, seat]) => {
      const person = people.find((p) => p.playerId === id);
      return person
        ? { seat, playerId: id, kind: 'person', userId: person.userId }
        : { seat, playerId: id, kind: 'oracle', oracle: id };
    })
    .sort((a, b) => a.seat - b.seat);
  if (seats.some((s) => s.kind === 'oracle' && !ORACLES.includes(s.playerId))) return fail(500, 'server_error');
  const res = friendsResult(step.state);
  const to = res.done ? null : waitingFor(step.state);
  const opened = asRow(
    await deps.rpc('poker_room_open', {
      p_uid: uid,
      p_room_id: roomId,
      p_version: prep.version,
      p_idem: idem,
      p_seed: seed,
      p_seed_hash: seedHash,
      p_engine_hash: ENGINE_HASH,
      p_state_version: STATE_VERSION,
      p_proto: FRIENDS_PROTO,
      p_params_version: versions,
      p_seats: seats,
      p_effects: step.state.config.effects ?? [],
      p_state: step.state,
      p_events: events,
      p_to_act: to,
      p_deadline_secs: to ? CLOCK_SECS : null,
      p_hands: step.state.game.handNumber,
    }),
  );
  if (!opened) return fail(500, 'server_error');
  if (opened.ok !== true) {
    if (opened.code === 'duplicate') return opSync({ roomId }, uid, deps);
    // Alguém entrou, saiu ou mexeu na aposta entre o prepare e o open: refaz uma vez.
    if (opened.code === 'state_changed' && retry === 0) return opStart(body, uid, deps, retry + 1);
    return dbFail(opened);
  }
  return opSync({ roomId, since: -1 }, uid, deps);
}

/** A rotina agendada (chave interna): resolve os prazos vencidos de salas sem ninguém. */
async function opSweep(deps: Deps): Promise<Reply> {
  const t0 = Date.now();
  const ids = (await deps.rpc('poker_room_due', { p_limit: SWEEP_ROOMS })) as unknown;
  let processed = 0;
  let skipped = 0;
  for (const id of Array.isArray(ids) ? ids : []) {
    if (Date.now() - t0 > SWEEP_BUDGET_MS) break;
    if (!isUuid(id)) continue;
    try {
      const L = await loadRoom(deps, null, id);
      const owner = L ? clockOwner(L) : null;
      if (!L || L.status !== 'playing' || !L.state || !L.deadline_passed || !owner) {
        skipped += 1;
        continue;
      }
      const step = timeoutPerson(L.state, owner);
      const s = await saveRoomStep(deps, L, step, 'timeout', null, null);
      if (s.reply) skipped += 1;
      else processed += 1;
    } catch (e) {
      skipped += 1;
      console.error('poker-friends sweep', id, e instanceof Error ? e.message : e);
    }
  }
  return ok({ processed, skipped });
}

// ---------------------------------------------------------------------------
// A casual de devolução (o portador carrega o pôster perdido)
// ---------------------------------------------------------------------------

interface RecoverLoaded {
  id: string;
  status: string;
  seq: number;
  last_idem: string | null;
  last_response: Row | null;
  state: MatchState;
  public_view: TableView;
  events_tail: PublicEvent[];
  seed: string;
  seed_hash: string;
  created_at: string;
  result: Row | null;
  carrier: RivalId;
  poster: Row | null;
  recovered: boolean;
  expired: boolean;
}

/**
 * O pôster que o oráculo carrega, no formato PokerPrize que a mesa do torneio/fase 1 já
 * desenha ("Procurado"), mais o cartão de pôster (recoverPrize) das telas do Pôster Poker.
 */
function recoverPrize(prizeId: unknown, poster: Row | null, carrier: string): Row {
  return {
    id: typeof prizeId === 'string' ? prizeId : null,
    kind: 'poster',
    rarity: poster?.rarity ?? 'common',
    name_pt: poster?.title ?? '',
    name_en: poster?.titleEn ?? poster?.title ?? '',
    article_pt: 'o',
    blurb_pt: null,
    blurb_en: null,
    image: poster?.filePath ?? null,
    payload: { item_id: poster?.itemId ?? null, effect: poster?.effect ?? 'none' },
    repeatable: false,
    carrier,
    effect_id: null,
  };
}

async function loadRecover(deps: Deps, uid: string, matchId: string | null): Promise<RecoverLoaded | null> {
  const m = asRow(await deps.rpc('poker_recover_load', { p_uid: uid, p_match_id: matchId }));
  return m ? (m as unknown as RecoverLoaded) : null;
}

async function saveRecoverStep(
  deps: Deps, uid: string, m: RecoverLoaded, prev: MatchState, step: MatchStep, humanAction: Row | null, idem: string | null,
): Promise<Reply> {
  const out: MatchOutcome = outcomeOf(prev, step.state);
  const pub = toPublicEvents(step.events, 'human');
  const view = tableView(step.state, 'human');
  const result = out.finished
    ? { status: out.finished.status, place: out.finished.place, prizeCaptured: step.state.capturedHand !== null, seed: m.seed, seedHash: m.seed_hash }
    : undefined;
  const response: Row = { ok: true, seq: m.seq + 1, events: pub, view, ...(result ? { result } : {}) };
  let finished: Row | null = null;
  if (out.finished) {
    const summary = summarizeMatch(step.state, { clientId: m.id, startedAt: m.created_at, endedAt: deps.nowIso() });
    summary.engineHash = ENGINE_HASH;
    finished = { ...out.finished, summary };
  }
  const saved = asRow(
    await deps.rpc('poker_recover_step', {
      p_uid: uid,
      p_match_id: m.id,
      p_expected_seq: m.seq,
      p_state: step.state,
      p_public_view: view,
      p_events_append: pub,
      p_human_action: humanAction,
      p_idem: idem,
      p_response: response,
      p_hands: step.state.game.handNumber,
      p_captured: out.captured ?? null,
      p_finished: finished,
    }),
  );
  if (!saved || saved.ok !== true) {
    const code = typeof saved?.code === 'string' ? saved.code : 'stale';
    if (code === 'not_found') return fail(404, 'not_found');
    if (code === 'finished') return fail(410, 'finished', { result: saved?.result ?? null });
    if (code === 'bad_request') return fail(500, 'server_error');
    return fail(409, 'stale', { seq: saved?.seq, view: saved?.view, recent: tail(saved?.recent, RECENT_STALE) });
  }
  return { status: 200, body: (asRow(saved.response) ?? response) as Row };
}

/** Parada há mais de 24 h: vira 'abandoned' com o motor (o pôster continua com o oráculo). */
async function abandonRecover(deps: Deps, uid: string, m: RecoverLoaded): Promise<Row | null> {
  const step = abandonMatch(m.state);
  const r = await saveRecoverStep(deps, uid, m, m.state, step, { seq: m.seq, abandon: true }, null);
  return asRow(r.body.result) ?? null;
}

async function opRecoverResume(body: Row, uid: string, deps: Deps, duplicate = false): Promise<Reply> {
  const matchId = body.matchId;
  if (matchId !== undefined && matchId !== null && !isUuid(matchId)) return fail(400, 'bad_request');
  let m = await loadRecover(deps, uid, isUuid(matchId) ? matchId : null);
  if (!m) return fail(404, 'none');
  if (m.status === 'active' && m.expired) {
    await abandonRecover(deps, uid, m);
    m = (await loadRecover(deps, uid, m.id)) ?? m;
  }
  const prizeId = m.state?.config?.prize?.prizeId ?? null;
  return ok({
    ...(duplicate ? { duplicate: true } : {}),
    matchId: m.id,
    seq: m.seq,
    seedHash: m.seed_hash,
    carrier: m.carrier,
    prizeId,
    prize: recoverPrize(prizeId, m.poster, m.carrier),
    recoverPrize: m.poster,
    poster: m.poster,
    stars: 0,
    loan: 0,
    view: m.public_view,
    recent: tail(m.events_tail, 60),
    ...(m.status !== 'active' && m.result ? { result: m.result } : {}),
  });
}

async function opRecoverStart(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const ticket = body.ticket;
  if (!isUuid(ticket)) return fail(400, 'bad_request');
  const prep = asRow(await deps.rpc('poker_recover_prepare', { p_uid: uid, p_ticket: ticket }));
  if (!prep) return fail(500, 'server_error');
  if (prep.ok !== true) {
    if (prep.code === 'duplicate' && isUuid(prep.matchId)) return opRecoverResume({ matchId: prep.matchId }, uid, deps, true);
    return dbFail(prep);
  }
  const carrier = String(prep.carrier) as RivalId;
  const rarity = String(prep.rarity) as Rarity;
  if (!ORACLES.includes(carrier) || !RARITIES.includes(rarity) || typeof prep.prize_id !== 'string') return fail(500, 'server_error');
  const seed = newSeed();
  const seedHash = await sha256Hex(seed);
  const settings = settingsFrom(prep.settings);
  const { profiles, versions } = profilesFrom(prep.bot_params);
  const cfg = rescueConfig({ seed, carrierId: carrier, prizeId: prep.prize_id, rarity, settings, profiles, paramsVersion: versions });
  const step = createMatch(cfg);
  const events = withSeedHash(toPublicEvents(step.events, 'human'), seedHash);
  const view = tableView(step.state, 'human');
  const opened = asRow(
    await deps.rpc('poker_recover_open', {
      p_uid: uid,
      p_match_id: prep.match_id,
      p_seed: seed,
      p_seed_hash: seedHash,
      p_engine_hash: ENGINE_HASH,
      p_state_version: STATE_VERSION,
      p_proto: FRIENDS_PROTO,
      p_params_version: versions,
      p_state: step.state,
      p_public_view: view,
      p_events_tail: events,
    }),
  );
  if (!opened) return fail(500, 'server_error');
  if (opened.ok !== true) {
    if (opened.code === 'duplicate' && isUuid(opened.matchId)) return opRecoverResume({ matchId: opened.matchId }, uid, deps, true);
    return dbFail(opened);
  }
  const poster = asRow(prep.poster);
  return ok({
    matchId: opened.match_id,
    seq: 1,
    seedHash,
    attempt: 0,
    loan: 0,
    stars: 0,
    carrier,
    prizeId: prep.prize_id,
    prize: recoverPrize(prep.prize_id, poster, carrier),
    recoverPrize: poster,
    poster,
    events,
    view,
  });
}

async function opRecoverAct(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { matchId, seq, idem } = body;
  if (!isUuid(matchId) || !isInt(seq) || !isUuid(idem)) return fail(400, 'bad_request');
  const action = parseAction(body.action);
  if (!action) return fail(400, 'bad_request');
  const m = await loadRecover(deps, uid, matchId);
  if (!m) return fail(404, 'not_found');
  if (m.status !== 'active') return fail(410, 'finished', { result: m.result });
  if (m.expired) return fail(410, 'finished', { result: await abandonRecover(deps, uid, m) });
  if (seq === m.seq - 1 && idem === m.last_idem && m.last_response) return { status: 200, body: m.last_response };
  if (seq !== m.seq) return fail(409, 'stale', { seq: m.seq, view: m.public_view, recent: tail(m.events_tail, RECENT_STALE) });
  let step: MatchStep;
  try {
    step = applyHumanAction(m.state, action, { show: body.show === true });
  } catch (e) {
    if (e instanceof PokerRuleError) return fail(422, 'illegal', { view: m.public_view });
    throw e;
  }
  return saveRecoverStep(deps, uid, m, m.state, step, { seq: m.seq, action, show: body.show === true }, idem);
}

async function opRecoverForfeit(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { matchId, seq } = body;
  if (!isUuid(matchId) || !isInt(seq)) return fail(400, 'bad_request');
  const m = await loadRecover(deps, uid, matchId);
  if (!m) return fail(404, 'not_found');
  if (m.status !== 'active') return fail(410, 'finished', { result: m.result });
  if (seq !== m.seq) return fail(409, 'stale', { seq: m.seq, view: m.public_view, recent: tail(m.events_tail, RECENT_STALE) });
  const step = forfeitMatch(m.state);
  const r = await saveRecoverStep(deps, uid, m, m.state, step, { seq: m.seq, forfeit: true }, null);
  if (r.status !== 200) return r;
  return ok({ result: r.body.result ?? null });
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Corpo do lobby → argumentos da RPC (forma exata; nada a mais passa). null = corpo torto. */
function lobbyArgs(op: string, body: Row, uid: string): { fn: string; args: Row } | null {
  const roomId = body.roomId;
  switch (op) {
    case 'create': {
      const r = body.stakeRarity ?? null;
      if (r !== null && !(typeof r === 'string' && RARITIES.includes(r))) return null;
      return { fn: 'poker_room_create', args: { p_uid: uid, p_stake_rarity: r } };
    }
    case 'invite': {
      const ids = body.userIds;
      if (!isUuid(roomId) || !Array.isArray(ids) || ids.length < 1 || ids.length > 8 || !ids.every(isUuid)) return null;
      return { fn: 'poker_room_invite', args: { p_uid: uid, p_room_id: roomId, p_user_ids: ids } };
    }
    case 'respond':
      if (!isUuid(roomId) || typeof body.accept !== 'boolean') return null;
      return { fn: 'poker_room_respond', args: { p_uid: uid, p_room_id: roomId, p_accept: body.accept } };
    case 'join':
      if (typeof body.code !== 'string' || body.code.length > 12) return null;
      return { fn: 'poker_room_join', args: { p_uid: uid, p_code: body.code } };
    case 'config': {
      const r = body.stakeRarity ?? null;
      if (!isUuid(roomId) || (r !== null && !(typeof r === 'string' && RARITIES.includes(r)))) return null;
      return { fn: 'poker_room_config', args: { p_uid: uid, p_room_id: roomId, p_stake_rarity: r } };
    }
    case 'effects': {
      const items = body.itemIds;
      if (!isUuid(roomId) || !Array.isArray(items) || items.length > 2 || !items.every((n) => isInt(n) && n > 0 && n < 1_000_000)) return null;
      return { fn: 'poker_room_set_effects', args: { p_uid: uid, p_room_id: roomId, p_items: items } };
    }
    case 'stake': {
      const item = body.itemId ?? null;
      if (!isUuid(roomId)) return null;
      if (item === null) return { fn: 'poker_room_set_stake', args: { p_uid: uid, p_room_id: roomId, p_item: null, p_effect: null } };
      if (!isInt(item) || item <= 0 || item >= 1_000_000 || typeof body.effect !== 'string' || !STAKE_EFFECTS.includes(body.effect)) return null;
      return { fn: 'poker_room_set_stake', args: { p_uid: uid, p_room_id: roomId, p_item: item, p_effect: body.effect } };
    }
    case 'ready':
      if (!isUuid(roomId) || typeof body.ready !== 'boolean') return null;
      return { fn: 'poker_room_set_ready', args: { p_uid: uid, p_room_id: roomId, p_ready: body.ready } };
    default:
      return null;
  }
}

const LOBBY_OPS = ['create', 'invite', 'respond', 'join', 'config', 'effects', 'stake', 'ready'];

/**
 * Entrada única: corpo já lido (JSON). `uid` = o do token (pessoa); `internal` = a rotina
 * agendada (chave interna conferida pelo index.ts), que só pode pedir 'sweep'.
 */
export async function handle(raw: unknown, uid: string | null, deps: Deps, opts: { internal?: boolean } = {}): Promise<Reply> {
  const body = asRow(raw);
  if (!body || !isInt(body.proto) || body.proto < 1 || typeof body.op !== 'string') return fail(400, 'bad_request');
  if (body.proto < FRIENDS_PROTO) return fail(426, 'update_required', { min_proto: FRIENDS_PROTO });
  const op = body.op;
  const t0 = performance.now();
  try {
    if (opts.internal) return op === 'sweep' ? await opSweep(deps) : fail(403, 'forbidden');
    if (!uid || !isUuid(uid)) return fail(401, 'unauthorized');
    if (LOBBY_OPS.includes(op)) {
      const call = lobbyArgs(op, body, uid);
      return call ? await lobbyCall(deps, call.fn, call.args) : fail(400, 'bad_request');
    }
    switch (op) {
      case 'start':
        return await opStart(body, uid, deps, 0);
      case 'sync':
        return await opSync(body, uid, deps);
      case 'act':
        return await opAct(body, uid, deps);
      case 'tick':
        return await opTick(body, uid, deps);
      case 'back':
        return await opBack(body, uid, deps);
      case 'leave':
        return await opLeave(body, uid, deps);
      case 'recover.start':
        return await opRecoverStart(body, uid, deps);
      case 'recover.act':
        return await opRecoverAct(body, uid, deps);
      case 'recover.forfeit':
        return await opRecoverForfeit(body, uid, deps);
      case 'recover.resume':
        return await opRecoverResume(body, uid, deps);
      default:
        return fail(400, 'bad_request');
    }
  } catch (e) {
    // Nada foi gravado (cada passo grava numa transação só, no fim).
    console.error('poker-friends', op, e instanceof Error ? e.message : e);
    return fail(500, 'server_error');
  } finally {
    const ms = Math.round(performance.now() - t0);
    if (ms > 400) console.warn('poker-friends lento', op, `${ms} ms`);
  }
}
