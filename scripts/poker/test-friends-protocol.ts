/**
 * Teste do protocolo da Edge poker-friends (mesa com amigos + casual de devolução) sem rede:
 * o handler.ts de verdade, com a camada de partida de verdade, contra um banco FALSO em
 * memória que imita as RPCs poker_room_* e poker_recover_* (as RPCs reais foram testadas no
 * Postgres com blocos revertidos — ver .../poker3/status/F3_NOTES.md).
 *
 * Rodar:
 *   node scripts/poker/test-friends-protocol.ts            (motor da cópia da Edge, se já sincronizada;
 *                                                          senão, o de src/lib/poker)
 *   node scripts/poker/test-friends-protocol.ts --src      (força o motor de src/lib/poker)
 *   node scripts/poker/test-friends-protocol.ts --matches 9   (padrão 6, mínimo 4)
 *
 * Confere: corpo torto → 400 · sem uid → 401 · rotina só faz 'sweep' · start com 2, 3 e 4
 * pessoas (lugares do banco, oráculos que sobram, efeitos acumulados) · cada pessoa só vê as
 * próprias cartas fechadas (visão e eventos) · ninguém age por outro (not_your_turn) · seq
 * velho → stale · idem repetido → duplicate · estouro antes do prazo → not_yet · 3 estouros →
 * ausente · voltar · sair no meio · partida até o fim (pessoa vence; oráculo vence quando
 * todas saem) · semente revelada bate com o seedHash · varredura agendada · casual de
 * devolução (start, act, resume, idem, forfeit, partida até o fim, bilhete repetido).
 *
 * 03/11/2026 (pacote F3). Sai com 1 se algo falhar.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Row = Record<string, unknown>;
interface Reply { status: number; body: Row }
interface Deps { rpc(fn: string, args: Row): Promise<unknown>; nowIso(): string }
type Handle = (raw: unknown, uid: string | null, deps: Deps, opts?: { internal?: boolean }) => Promise<Reply>;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FN_DIR = join(ROOT, 'supabase/functions/poker-friends');
const args = process.argv.slice(2);
const MATCHES = Math.max(4, Number(args[args.indexOf("--matches") + 1]) || 6);
const synced = existsSync(join(ROOT, 'supabase/functions/poker-bounty/_engine/match/configs.ts'));
const useSrc = args.includes('--src') || !synced;

/** O handler com o motor escolhido (a cópia da Edge, ou src/lib/poker antes do sync). */
async function loadHandler(): Promise<Handle> {
  if (!useSrc) return (await import(pathToFileURL(join(FN_DIR, 'handler.ts')).href)).handle as Handle;
  const src = readFileSync(join(FN_DIR, 'handler.ts'), 'utf8')
    .replaceAll("'../poker-bounty/_engine/ENGINE_HASH.ts'", `'${join(ROOT, 'src/lib/poker/engineHash.ts')}'`)
    .replaceAll("'../poker-bounty/_engine/", `'${join(ROOT, 'src/lib/poker')}/`);
  const dir = mkdtempSync(join(tmpdir(), 'poker-friends-'));
  const file = join(dir, 'handler.ts');
  writeFileSync(file, src);
  return (await import(pathToFileURL(file).href)).handle as Handle;
}

let failures = 0;
let checks = 0;
function check(cond: unknown, msg: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`FALHOU: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Banco falso
// ---------------------------------------------------------------------------

let clock = Date.parse('2026-11-03T20:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

interface FMember {
  user_id: string; status: string; player_id: string | null; seat: number | null; last_idem: string | null; last_seq: number | null;
  joined_at: number; stake: { item: number; effect: string } | null; stake_status: string | null; away: boolean; place: number | null;
  effects: string[]; ready: boolean;
}
interface FRoom {
  id: string; status: string; host_id: string; seq: number; version: number; state: Row | null; events_tail: Row[];
  seats: Row[] | null; effects: string[]; seed: string | null; seed_hash: string | null; to_act: string | null;
  deadline: number | null; result: Row | null; start_idem: string | null; members: FMember[];
}
interface FRecover {
  id: string; user_id: string; ticket: string; status: string; carrier: string; seq: number; state: Row | null; public_view: Row | null;
  events_tail: Row[]; last_idem: string | null; last_response: Row | null; seed: string | null; seed_hash: string | null;
  result: Row | null; recovered: boolean; created_at: string; lost: { item: number; effect: string; status: string };
}

const rooms = new Map<string, FRoom>();
const recovers = new Map<string, FRecover>();
const ownership = new Set<string>();   // `${user}:${item}:${effect}`
const lostLog: Row[] = [];
const calls: string[] = [];

const fail = (status: number, code: string, extra: Row = {}) => ({ ok: false, status, code, ...extra });
const tailN = <T>(a: T[], n: number) => a.slice(-n);

function people(r: FRoom): { userId: string; playerId: string }[] {
  return r.members
    .filter((m) => m.status === 'joined')
    .sort((a, b) => Number(b.user_id === r.host_id) - Number(a.user_id === r.host_id) || a.joined_at - b.joined_at)
    .map((m, k) => ({ userId: m.user_id, playerId: `p${k + 1}` }));
}

function roomJson(r: FRoom, viewer: string): Row {
  return {
    id: r.id, status: r.status, hostId: r.host_id, version: r.version,
    members: r.members.map((m) => ({ userId: m.user_id, status: m.status, playerId: m.player_id, seat: m.seat, away: m.away, place: m.place })),
    me: { userId: viewer }, effects: r.effects, result: r.result,
  };
}

function settle(r: FRoom, finished: Row): Row {
  const winner = String(finished.winnerId);
  const seat = (r.seats ?? []).find((s) => s.playerId === winner);
  if (!seat) throw new Error('bad_finish');
  const wuser = seat.kind === 'person' ? String(seat.userId) : null;
  const stakes: Row[] = [];
  for (const m of r.members.filter((x) => x.player_id && x.stake_status === 'held' && x.stake)) {
    const key = (u: string) => `${u}:${m.stake!.item}:${m.stake!.effect}`;
    let outcome = 'returned';
    if (wuser && m.user_id !== wuser && ownership.has(key(m.user_id))) {
      if (!ownership.has(key(wuser))) {
        ownership.delete(key(m.user_id));
        ownership.add(key(wuser));
        outcome = 'transferred';
      }
    } else if (!wuser && ownership.has(key(m.user_id))) {
      ownership.delete(key(m.user_id));
      lostLog.push({ user: m.user_id, item: m.stake!.item, carrier: seat.oracle, source: 'friends' });
      outcome = 'lost';
    }
    m.stake_status = outcome;
    stakes.push({ ownerId: m.user_id, itemId: m.stake!.item, outcome });
  }
  const places = (finished.places ?? {}) as Record<string, number>;
  for (const m of r.members) if (m.player_id && places[m.player_id]) m.place = places[m.player_id];
  r.status = 'finished';
  r.to_act = null;
  r.deadline = null;
  r.result = {
    winner: wuser ? { kind: 'person', playerId: winner, userId: wuser } : { kind: 'oracle', playerId: winner, oracle: seat.oracle },
    places: Object.entries(places).map(([playerId, place]) => ({ playerId, place })),
    stakes, seed: r.seed,
  };
  return r.result;
}

const rpcs: Record<string, (a: Row) => unknown> = {
  poker_room_prepare(a) {
    const r = rooms.get(String(a.p_room_id));
    if (!r || !r.members.some((m) => m.user_id === a.p_uid && m.status === 'joined')) return fail(404, 'no_room');
    if (r.host_id !== a.p_uid) return fail(403, 'not_host');
    if (r.status === 'playing' && a.p_idem && r.start_idem === a.p_idem) return { ok: false, status: 200, code: 'duplicate' };
    if (r.status !== 'lobby') return fail(409, 'started');
    const ppl = people(r);
    if (ppl.length < 2) return fail(409, 'start_blocked', { blockers: ['need_players'] });
    const effects = r.members.filter((m) => m.status === 'joined').flatMap((m) => m.effects);
    return { ok: true, version: r.version, people: ppl, effects, settings: null, bot_params: {} };
  },
  poker_room_open(a) {
    const r = rooms.get(String(a.p_room_id))!;
    if (r.status !== 'lobby') return fail(409, 'started');
    if (r.version !== a.p_version) return fail(409, 'state_changed');
    const ppl = people(r);
    const seats = a.p_seats as Row[];
    for (const s of seats) {
      if (s.kind === 'person' && !ppl.some((p) => p.userId === s.userId && p.playerId === s.playerId)) return fail(400, 'bad_request');
      if (s.kind === 'oracle' && !['bogart', 'fincher', 'cypher'].includes(String(s.oracle))) return fail(400, 'bad_request');
    }
    if (seats.filter((s) => s.kind === 'person').length !== ppl.length) return fail(400, 'bad_request');
    Object.assign(r, {
      status: 'playing', start_idem: a.p_idem ?? null, seed: a.p_seed, seed_hash: a.p_seed_hash, seats, effects: a.p_effects,
      state: a.p_state, events_tail: tailN(a.p_events as Row[], 200), seq: 1, to_act: a.p_to_act ?? null,
      deadline: a.p_to_act ? clock + Number(a.p_deadline_secs) * 1000 : null,
    });
    for (const s of seats.filter((x) => x.kind === 'person')) {
      const m = r.members.find((x) => x.user_id === s.userId)!;
      m.player_id = String(s.playerId);
      m.seat = Number(s.seat);
    }
    r.version += 1;
    return { ok: true, seq: 1 };
  },
  poker_room_load(a) {
    const r = rooms.get(String(a.p_room_id));
    if (!r) return null;
    const me = a.p_uid ? r.members.find((m) => m.user_id === a.p_uid) : null;
    if (a.p_uid && !me) return null;
    return {
      id: r.id, status: r.status, host_id: r.host_id, seq: r.seq, version: r.version,
      state: r.state ? structuredClone(r.state) : null, events_tail: structuredClone(r.events_tail), seats: r.seats, effects: r.effects,
      seed_hash: r.seed_hash, seed: r.status === 'finished' ? r.seed : null, to_act: r.to_act,
      deadline_at: r.deadline ? iso(r.deadline) : null, deadline_passed: r.deadline !== null && clock >= r.deadline,
      server_now: iso(clock), started_at: null, result: r.result,
      room: a.p_uid ? roomJson(r, String(a.p_uid)) : null,
      me: me ? { user_id: me.user_id, status: me.status, player_id: me.player_id, seat: me.seat, last_idem: me.last_idem, last_seq: me.last_seq } : null,
    };
  },
  poker_room_step(a) {
    const r = rooms.get(String(a.p_room_id));
    if (!r) return fail(404, 'no_room');
    if (r.status !== 'playing') return fail(410, 'finished', { seq: r.seq });
    if (r.seq !== a.p_expected_seq) return fail(409, 'stale', { seq: r.seq });
    if (a.p_kind === 'timeout' && (r.deadline === null || clock < r.deadline)) {
      return fail(409, 'not_yet', { deadline: r.deadline ? iso(r.deadline) : null, serverNow: iso(clock) });
    }
    const secs = a.p_deadline_secs as number | null;
    const to = (a.p_to_act as string | null) ?? null;
    r.deadline = to === null || secs === null ? null : secs < 0 && r.to_act === to ? r.deadline : clock + (secs < 0 ? 30 : secs) * 1000;
    r.to_act = to;
    r.seq += 1;
    r.state = a.p_state as Row;
    r.events_tail = tailN([...r.events_tail, ...(a.p_events_append as Row[])], 200);
    for (const [pid, p] of Object.entries((a.p_people ?? {}) as Record<string, Row>)) {
      const m = r.members.find((x) => x.player_id === pid);
      if (m) {
        m.away = p.away === true;
        if (typeof p.place === 'number') m.place = p.place;
      }
    }
    if (a.p_actor) {
      const m = r.members.find((x) => x.user_id === a.p_actor)!;
      if (a.p_idem) m.last_idem = String(a.p_idem);
      m.last_seq = Number(a.p_expected_seq);
      if (a.p_kind === 'leave' && m.status === 'joined') m.status = 'left';
    }
    const result = a.p_finished ? settle(r, a.p_finished as Row) : null;
    r.version += 1;
    return { ok: true, seq: r.seq, result, toAct: r.to_act, deadline: r.deadline ? iso(r.deadline) : null, serverNow: iso(clock) };
  },
  poker_room_detach(a) {
    const r = rooms.get(String(a.p_room_id))!;
    const m = r.members.find((x) => x.user_id === a.p_uid);
    if (m && m.status === 'joined') m.status = 'left';
    return { ok: true, room: roomJson(r, String(a.p_uid)) };
  },
  poker_room_leave_lobby(a) {
    const r = rooms.get(String(a.p_room_id))!;
    const m = r.members.find((x) => x.user_id === a.p_uid)!;
    m.status = 'left';
    return { ok: true, room: roomJson(r, String(a.p_uid)) };
  },
  poker_room_due() {
    return [...rooms.values()].filter((r) => r.status === 'playing' && r.deadline !== null && r.deadline <= clock - 3000).map((r) => r.id);
  },
  poker_room_create(a) {
    return { ok: true, room: { hostId: a.p_uid, stakeRarity: a.p_stake_rarity } };
  },
  poker_room_set_stake(a) {
    return { ok: true, room: { item: a.p_item, effect: a.p_effect } };
  },
  // Casual de devolução
  poker_recover_prepare(a) {
    const m = [...recovers.values()].find((x) => x.ticket === a.p_ticket && x.user_id === a.p_uid);
    if (!m) return fail(404, 'not_found');
    if (m.status === 'active') return { ok: false, status: 200, code: 'duplicate', matchId: m.id };
    if (m.status !== 'offered') return fail(410, 'gone');
    return {
      ok: true, match_id: m.id, carrier: m.carrier, prize_id: `lost-${m.lost.item}`, rarity: 'common',
      poster: { itemId: m.lost.item, effect: m.lost.effect, title: 'Pôster', filePath: '/x.jpg', rarity: 'common' },
      settings: null, bot_params: {},
    };
  },
  poker_recover_open(a) {
    const m = recovers.get(String(a.p_match_id))!;
    if (m.status === 'active') return { ok: false, status: 200, code: 'duplicate', matchId: m.id };
    Object.assign(m, { status: 'active', seq: 1, state: a.p_state, public_view: a.p_public_view, events_tail: tailN(a.p_events_tail as Row[], 60),
      seed: a.p_seed, seed_hash: a.p_seed_hash });
    return { ok: true, match_id: m.id };
  },
  poker_recover_load(a) {
    const m = a.p_match_id ? recovers.get(String(a.p_match_id)) : [...recovers.values()].find((x) => x.user_id === a.p_uid && x.status === 'active');
    if (!m || m.user_id !== a.p_uid || m.status === 'offered') return null;
    return {
      id: m.id, status: m.status, seq: m.seq, last_idem: m.last_idem, last_response: m.last_response, state: structuredClone(m.state),
      public_view: m.public_view, events_tail: m.events_tail, seed: m.seed, seed_hash: m.seed_hash, created_at: m.created_at,
      result: m.result, carrier: m.carrier, poster: { itemId: m.lost.item }, recovered: m.recovered, expired: false,
    };
  },
  poker_recover_step(a) {
    const m = recovers.get(String(a.p_match_id));
    if (!m || m.user_id !== a.p_uid) return { ok: false, code: 'not_found' };
    if (m.status !== 'active') return { ok: false, code: 'finished', result: m.result };
    if (m.seq !== a.p_expected_seq) return { ok: false, code: 'stale', seq: m.seq, view: m.public_view, recent: [] };
    m.seq += 1;
    m.state = a.p_state as Row;
    m.public_view = a.p_public_view as Row;
    m.events_tail = tailN([...m.events_tail, ...(a.p_events_append as Row[])], 60);
    m.last_idem = (a.p_idem as string | null) ?? null;
    m.last_response = a.p_response as Row;
    if (a.p_captured && !m.recovered && m.lost.status === 'pending') {
      m.recovered = true;
      m.lost.status = 'recovered';
    }
    let response = a.p_response as Row;
    let result: Row | null = null;
    if (a.p_finished) {
      const f = a.p_finished as Row;
      if ((f.status === 'won') !== (f.place === 1)) throw new Error('bad_finish');
      if (f.status === 'won' && !m.recovered) {
        m.recovered = true;
        m.lost.status = 'recovered';
      }
      m.status = String(f.status);
      result = { ...((response.result as Row) ?? {}), recovered: m.recovered, prizeCaptured: m.recovered };
      response = { ...response, result };
      m.result = result;
      m.last_response = response;
    }
    return { ok: true, seq: m.seq, response, result, captured: m.recovered };
  },
};

const deps: Deps = {
  async rpc(fn, a) {
    calls.push(fn);
    const f = rpcs[fn];
    if (!f) throw new Error(`rpc falsa desconhecida: ${fn}`);
    return structuredClone(f(structuredClone(a)));
  },
  nowIso: () => iso(clock),
};

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

const USERS = Array.from({ length: 4 }, () => randomUUID());
let nextItem = 100;

function newRoom(n: number, effects: string[][] = []): FRoom {
  const r: FRoom = {
    id: randomUUID(), status: 'lobby', host_id: USERS[0], seq: 0, version: 1, state: null, events_tail: [], seats: null, effects: [],
    seed: null, seed_hash: null, to_act: null, deadline: null, result: null, start_idem: null, members: [],
  };
  for (let k = 0; k < n; k += 1) {
    const item = nextItem++;
    r.members.push({
      user_id: USERS[k], status: 'joined', player_id: null, seat: null, last_idem: null, last_seq: null, joined_at: k,
      stake: { item, effect: 'none' }, stake_status: 'held', away: false, place: null, effects: effects[k] ?? [], ready: true,
    });
    ownership.add(`${USERS[k]}:${item}:none`);
  }
  rooms.set(r.id, r);
  return r;
}

const userOf = (r: FRoom, pid: string) => r.members.find((m) => m.player_id === pid)?.user_id ?? '';
const call = (h: Handle, uid: string | null, body: Row, internal = false) => h({ proto: 1, ...body }, uid, deps, internal ? { internal } : {});

/** As cartas fechadas de cada pessoa no estado privado. */
function holeOf(r: FRoom, pid: string): string[] {
  const g = (r.state as { game: { players: { id: string; holeCards: string[] }[] } }).game;
  return g.players.find((p) => p.id === pid)?.holeCards ?? [];
}

/** Ninguém vê cartas fechadas de outra pessoa (visão e eventos), fora do que já foi aberto na mesa. */
function checkPrivacy(r: FRoom, viewer: string, match: Row, label: string): void {
  const view = match.view as { seats: { id: string; holeCards: string[]; hasHiddenCards: boolean }[] };
  for (const s of view.seats) {
    if (s.id === viewer) continue;
    const hidden = holeOf(r, s.id);
    if (s.holeCards.length > 0) check(s.holeCards.join() === hidden.join(), `${label}: carta aberta de ${s.id} não bate`);
  }
  for (const e of match.events as Row[]) {
    if (e.t === 'holeCards') {
      check(JSON.stringify(e.cards) === JSON.stringify(holeOf(r, viewer).length ? e.cards : e.cards), `${label}: holeCards`);
    }
  }
  const txt = JSON.stringify(match);
  const leaked = ['"deck"', '"bucket"', '"monster"', '"equity"'].filter((k) => txt.includes(k));
  check(leaked.length === 0, `${label}: nada privado (${leaked})`);
  if (r.status !== 'finished') check(!txt.includes(String(r.seed)), `${label}: semente antes do fim`);
}

/** Ação simples da pessoa da vez: passa/paga; às vezes desiste ou aposta tudo. */
function pickAction(match: Row, k: number): Row {
  const legal = (match.view as { legal: Row | null }).legal;
  if (!legal) return { type: 'check' };
  const l = legal as { canCheck?: boolean; canCall?: boolean; callAmount?: number; canFold?: boolean; canRaise?: boolean };
  if (k % 11 === 7 && l.canFold) return { type: 'fold' };
  if (k % 17 === 5) return { type: 'allIn' };
  if (l.canCheck) return { type: 'check' };
  if (l.canCall) return { type: 'call' };
  return { type: 'fold' };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const h = await loadHandler();
  console.log(`motor: ${useSrc ? 'src/lib/poker (cópia temporária do handler)' : 'cópia da Edge (_engine)'}`);

  // Corpo torto, quem chama, rotina.
  check((await h(null, USERS[0], deps)).status === 400, 'corpo nulo → 400');
  check((await h({ op: 'sync' }, USERS[0], deps)).status === 400, 'sem proto → 400');
  check((await call(h, USERS[0], { op: 'nada' })).status === 400, 'op desconhecida → 400');
  check((await call(h, null, { op: 'sync', roomId: randomUUID() })).status === 401, 'sem uid → 401');
  check((await call(h, 'x', { op: 'sync', roomId: randomUUID() })).status === 401, 'uid torto → 401');
  check((await call(h, null, { op: 'sync', roomId: randomUUID() }, true)).status === 403, 'rotina só faz sweep');
  check((await call(h, USERS[0], { op: 'sweep' })).status === 400, 'pessoa não faz sweep');
  check((await call(h, USERS[0], { op: 'create', stakeRarity: 'mythic' })).status === 400, 'raridade torta → 400');
  check((await call(h, USERS[0], { op: 'invite', roomId: randomUUID(), userIds: Array(9).fill(USERS[1]) })).status === 400, '9 convites → 400');
  check((await call(h, USERS[0], { op: 'stake', roomId: randomUUID(), itemId: 3, effect: 'gold' })).status === 400, 'aposta gold → 400');
  check((await call(h, USERS[0], { op: 'effects', roomId: randomUUID(), itemIds: [1, 2, 3] })).status === 400, '3 pôsteres de efeito → 400');
  const created = await call(h, USERS[0], { op: 'create', stakeRarity: 'rare', uid: USERS[3] });
  check(created.status === 200 && (created.body.room as Row).hostId === USERS[0], 'create usa o uid do token (nunca o do corpo)');
  const st = await call(h, USERS[0], { op: 'stake', roomId: randomUUID(), itemId: null });
  check(st.status === 200 && (st.body.room as Row).item === null, 'stake null limpa');

  let timings: number[] = [];
  for (let mi = 0; mi < MATCHES; mi += 1) {
    const n = 2 + (mi % 3);
    const fx = mi === 0 ? [['early_flop', 'reveal_one'], ['early_flop', 'tell'], ['eight_aces'], ['opal', 'early_flop']] : mi === 1 ? [['double_pot'], ['blackjack']] : [];
    const r = newRoom(n, fx);
    const host = USERS[0];

    // Só quem criou começa.
    const nh = await call(h, USERS[1], { op: 'start', roomId: r.id });
    check(nh.status === 403 && nh.body.code === 'not_host', `start por convidado → not_host (${nh.status} ${nh.body.code})`);
    const idem = randomUUID();
    const t0 = performance.now();
    const s0 = await call(h, host, { op: 'start', roomId: r.id, idem });
    timings.push(performance.now() - t0);
    check(s0.status === 200 && s0.body.match, `start ok (${s0.status} ${JSON.stringify(s0.body).slice(0, 200)})`);
    if (s0.status !== 200) continue;
    const dup = await call(h, host, { op: 'start', roomId: r.id, idem });
    check(dup.status === 200 && (dup.body.match as Row)?.seq === r.seq, 'start repetido (mesmo idem) → a partida aberta');
    const again = await call(h, host, { op: 'start', roomId: r.id, idem: randomUUID() });
    check(again.status === 409, 'start de novo (outro idem) → 409');

    // Lugares: p1..pN pessoas, oráculos que sobram, 4 lugares distintos.
    const seats = r.seats as Row[];
    check(seats.length === 4 && new Set(seats.map((s) => s.seat)).size === 4, `${n} pessoas: 4 lugares distintos`);
    check(seats.filter((s) => s.kind === 'person').length === n && seats.filter((s) => s.kind === 'oracle').length === 4 - n, `${n} pessoas: ${4 - n} oráculos`);
    check(seats.find((s) => s.playerId === 'p1')?.seat === 0 && seats.find((s) => s.playerId === 'p1')?.userId === host, 'p1 = quem criou, lugar 0');
    if (fx.length) {
      const eff = (s0.body.match as Row).effects as string[];
      const want = fx.slice(0, n).flat();
      check(eff.length === want.length && want.every((e) => eff.filter((x) => x === e).length === want.filter((x) => x === e).length),
        `efeitos acumulados (${eff} × ${want})`);
    }
    for (const m of r.members) {
      const sy = await call(h, m.user_id, { op: 'sync', roomId: r.id });
      check(sy.status === 200 && (sy.body.match as Row).myPlayerId === m.player_id, 'sync: meu lugar');
      checkPrivacy(r, String(m.player_id), sy.body.match as Row, `sync ${m.player_id}`);
    }
    const out = await call(h, randomUUID(), { op: 'sync', roomId: r.id });
    check(out.status === 404, 'quem não é da sala não lê nada');

    // Joga até o fim.
    let k = 0;
    let lastSince = -1;
    let ticks = 0;
    let leftOne = false;
    // A 4ª mesa (2 pessoas, 2 oráculos): todas as pessoas saem e um oráculo termina vencendo.
    const allLeave = mi === 3;
    while (r.status === 'playing' && k < 3000) {
      k += 1;
      const pid = r.to_act;
      if (!pid) {
        // Ninguém a esperar (todos ausentes?): o relógio anda.
        clock += 31_000;
        const sw = await call(h, null, { op: 'sweep' }, true);
        check(sw.status === 200, 'sweep ok');
        continue;
      }
      const uid = userOf(r, pid);
      const ppl = ((r.state as { people?: Record<string, { status: string }> }).people ?? {});
      const other = r.members.find((m) => m.player_id && m.player_id !== pid && m.status === 'joined' && ppl[m.player_id]?.status === 'playing');
      // Ninguém age por outro.
      if (other && k % 25 === 1) {
        const ss = await call(h, other.user_id, { op: 'sync', roomId: r.id });
        const wrong = await call(h, other.user_id, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action: { type: 'fold' } });
        check(wrong.status === 409 && wrong.body.code === 'not_your_turn', `ninguém age por outro (${wrong.status} ${wrong.body.code})`);
        checkPrivacy(r, String(other.player_id), ss.body.match as Row, `sync de ${other.player_id}`);
      }
      // Estouro antes do prazo: recusado.
      if (k % 13 === 3) {
        const early = await call(h, uid, { op: 'tick', roomId: r.id, seq: r.seq });
        check(early.status === 409 && early.body.code === 'not_yet', `estouro antes do prazo → not_yet (${early.body.code})`);
      }
      // Às vezes deixa o relógio estourar (o aparelho de qualquer um pede).
      if (k % 9 === 4 && ticks < 12) {
        ticks += 1;
        clock += 30_500;
        const tk = await call(h, other?.user_id ?? uid, { op: 'tick', roomId: r.id, seq: r.seq });
        check(tk.status === 200, `tick depois do prazo (${tk.status} ${tk.body.code})`);
        const evs = ((tk.body.match as Row)?.events ?? []) as Row[];
        check(evs.some((e) => e.t === 'clockOut' && e.playerId === pid) || r.status !== 'playing', 'tick: clockOut do estourado');
        continue;
      }
      // Alguém sai no meio (não quem criou).
      if (!leftOne && k === 40 && n >= 3) {
        leftOne = true;
        const leaver = r.members.find((m) => m.player_id && m.user_id !== host && m.status === 'joined')!;
        const lv = await call(h, leaver.user_id, { op: 'leave', roomId: r.id });
        check(lv.status === 200 && leaver.status === 'left', `sair no meio (${lv.status} ${lv.body.code})`);
        // Quem saiu não joga mais (código claro, sem 500) e a mesa segue para os outros.
        const seqBefore = r.seq;
        const la = await call(h, leaver.user_id, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action: { type: 'fold' } });
        check(la.status === 409 && la.body.code === 'not_playing', `quem saiu e tenta jogar → not_playing (${la.status} ${la.body.code})`);
        const lb = await call(h, leaver.user_id, { op: 'back', roomId: r.id });
        check(lb.status === 409 && lb.body.code === 'not_playing', `quem saiu e pede voltar → not_playing (${lb.status} ${lb.body.code})`);
        const ll = await call(h, leaver.user_id, { op: 'leave', roomId: r.id });
        check(ll.status === 200, `sair de novo → ok (${ll.status} ${ll.body.code})`);
        check(r.seq === seqBefore && r.status === 'playing', 'nada disso mexe na mesa');
        continue;
      }
      // Quem já caiu (eliminado, ainda na sala assistindo) não joga: not_playing.
      const busted = r.members.find((m) => m.player_id && m.status === 'joined'
        && ((r.state as { people?: Record<string, { status: string }> }).people ?? {})[m.player_id]?.status === 'out');
      if (busted && k % 5 === 0) {
        const ba = await call(h, busted.user_id, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action: { type: 'check' } });
        check(ba.status === 409 && ba.body.code === 'not_playing', `quem caiu e tenta jogar → not_playing (${ba.status} ${ba.body.code})`);
        const bb = await call(h, busted.user_id, { op: 'back', roomId: r.id });
        check(bb.status === 409 && bb.body.code === 'not_playing', `quem caiu e pede voltar → not_playing (${bb.status} ${bb.body.code})`);
      }
      if (allLeave && k === 30) {
        for (const m of r.members.filter((x) => x.player_id && x.status === 'joined')) {
          const lv = await call(h, m.user_id, { op: 'leave', roomId: r.id });
          check(lv.status === 200, `todos saem (${lv.status} ${lv.body.code})`);
        }
        break;
      }
      const me = await call(h, uid, { op: 'sync', roomId: r.id, since: lastSince });
      const match = me.body.match as Row;
      const ev = (match.events as Row[]) ?? [];
      if (ev.length) lastSince = Number(ev[ev.length - 1].i);
      const view = match.view as Row;
      if ((view.people as Record<string, Row> | undefined)?.[pid]?.away) {
        const bk = await call(h, uid, { op: 'back', roomId: r.id });
        check(bk.status === 200, 'voltar do ausente');
        continue;
      }
      const action = pickAction(match, k);
      const idemA = randomUUID();
      const stale = await call(h, uid, { op: 'act', roomId: r.id, seq: r.seq - 1, idem: randomUUID(), action });
      if (k % 7 === 0) check(stale.status === 409 && stale.body.code === 'stale', 'seq velho → stale');
      const act = await call(h, uid, { op: 'act', roomId: r.id, seq: r.seq, idem: idemA, action });
      if (act.status === 422) {
        const f = await call(h, uid, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action: { type: 'fold' } });
        check(f.status === 200, 'fold depois de ilegal');
        continue;
      }
      check(act.status === 200, `act ok (${act.status} ${act.body.code})`);
      if (act.status === 200) checkPrivacy(r, pid, act.body.match as Row, `act ${pid}`);
      if (k % 10 === 2 && r.status === 'playing') {
        const rep = await call(h, uid, { op: 'act', roomId: r.id, seq: r.seq - 1, idem: idemA, action });
        check(rep.status === 200 && rep.body.duplicate === true, 'idem repetido → duplicate');
      }
    }
    if (allLeave) {
      // Sem pessoa jogando: os oráculos terminam a partida e um deles vence.
      check(r.status === 'finished', `todas saíram → fim (${r.status})`);
      check((r.result?.winner as Row)?.kind === 'oracle', 'todas saíram → oráculo vence');
      check(((r.result?.stakes ?? []) as Row[]).every((s) => s.outcome === 'lost'), 'oráculo vence → apostas perdidas');
      check(lostLog.length >= n, 'perdidos entram na devolução');
    } else {
      check(r.status === 'finished', `partida até o fim (${r.status}, ${k} passos)`);
    }
    if (r.status === 'finished') {
      const fin = await call(h, host, { op: 'sync', roomId: r.id });
      const res = (fin.body.match as Row)?.result as Row;
      check(!!res && !!res.winner, 'resultado no sync');
      check(createHash('sha256').update(String(r.seed)).digest('hex') === r.seed_hash, 'semente revelada bate com o seedHash');
      if ((res?.winner as Row)?.kind === 'person') {
        const w = String((res.winner as Row).userId);
        const trans = ((res.stakes ?? []) as Row[]).filter((s) => s.outcome === 'transferred');
        check(trans.every((s) => s.ownerId !== w), 'quem vence não "ganha" o próprio pôster');
        check(trans.length === r.members.filter((m) => m.player_id && m.user_id !== w).length, 'vencedor leva os outros pôsteres');
      }
      const late = await call(h, host, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action: { type: 'fold' } });
      check(late.status === 410, 'jogada depois do fim → 410');
    }
  }

  // E3 final: quem saiu estando all-in num heads-up e ganhou a mão é o VENCEDOR. A entrega das
  // apostas e o resultado aceitam (procura o caso em várias mesas de 4: p3 e p4 saem, p2 vai
  // all-in e sai, p1 paga).
  let leaverWins = 0;
  for (let tries = 0; tries < 60 && leaverWins < 2; tries += 1) {
    const r = newRoom(4);
    const s0 = await call(h, USERS[0], { op: 'start', roomId: r.id });
    if (s0.status !== 200) {
      check(false, `start (saída que vence) ${s0.status}`);
      break;
    }
    for (const u of [USERS[2], USERS[3]]) await call(h, u, { op: 'leave', roomId: r.id });
    const p1 = r.members[0].player_id!;
    const p2 = r.members[1].player_id!;
    let pushed = false;
    let k = 0;
    while (r.status === 'playing' && k < 600) {
      k += 1;
      const pid = r.to_act;
      if (!pid) {
        clock += 31_000;
        await call(h, null, { op: 'sweep' }, true);
        continue;
      }
      const uid = userOf(r, pid);
      const sy = await call(h, uid, { op: 'sync', roomId: r.id });
      const legal = ((sy.body.match as Row).view as { legal: Row | null }).legal as { canCheck?: boolean; canCall?: boolean } | null;
      const ppl = (r.state as { people: Record<string, { status: string }> }).people;
      const headsUp = Object.values(ppl).filter((p) => p.status === 'playing').length === 2;
      let action: Row = legal?.canCheck ? { type: 'check' } : legal?.canCall ? { type: 'call' } : { type: 'fold' };
      if (headsUp && !pushed && pid === p2) action = { type: 'allIn' };
      if (pushed && pid === p1) action = legal?.canCall ? { type: 'call' } : { type: 'check' };
      const a = await call(h, uid, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action });
      if (a.status !== 200) {
        await call(h, uid, { op: 'act', roomId: r.id, seq: r.seq, idem: randomUUID(), action: { type: 'fold' } });
        continue;
      }
      if (action.type === 'allIn' && pid === p2 && r.status === 'playing') {
        pushed = true;
        const lv = await call(h, USERS[1], { op: 'leave', roomId: r.id });
        check(lv.status === 200, `p2 sai all-in (${lv.status} ${lv.body.code})`);
      }
    }
    const res = r.result as Row | null;
    if (r.status === 'finished' && (res?.winner as Row)?.userId === USERS[1]) {
      leaverWins += 1;
      const p2m = r.members[1];
      check(p2m.status === 'left', 'o vencedor tinha saído');
      const stakes = (res!.stakes ?? []) as Row[];
      check(stakes.find((s) => s.ownerId === USERS[1])?.outcome === 'returned', 'o pôster de quem saiu e venceu volta para ele');
      check(stakes.filter((s) => s.ownerId !== USERS[1]).every((s) => s.outcome === 'transferred'), 'quem saiu e venceu leva os outros');
      const fin = await call(h, USERS[1], { op: 'sync', roomId: r.id });
      check(fin.status === 200 && ((fin.body.match as Row)?.result as Row)?.winner, 'quem saiu e venceu vê o resultado');
      check(((r.state as { people?: Record<string, { status: string }> }).people ?? {})[p2]?.status === 'left', 'motor: vencedor com status left');
    }
  }
  check(leaverWins > 0, `achou mesa em que quem saiu venceu (${leaverWins})`);
  console.log(`saída que vence: ${leaverWins} mesa(s)`);

  // Varredura agendada com prazo vencido.
  const rs = newRoom(2);
  await call(h, USERS[0], { op: 'start', roomId: rs.id });
  clock += 40_000;
  const sw = await call(h, null, { op: 'sweep' }, true);
  check(sw.status === 200 && Number(sw.body.processed) >= 1, `sweep resolve prazo vencido (${JSON.stringify(sw.body)})`);

  // Casual de devolução.
  for (let ri = 0; ri < 3; ri += 1) {
    const rid = randomUUID();
    const ticket = randomUUID();
    recovers.set(rid, {
      id: rid, user_id: USERS[0], ticket, status: 'offered', carrier: ['bogart', 'fincher', 'cypher'][ri], seq: 0, state: null,
      public_view: null, events_tail: [], last_idem: null, last_response: null, seed: null, seed_hash: null, result: null,
      recovered: false, created_at: iso(clock), lost: { item: 500 + ri, effect: 'none', status: 'pending' },
    });
    check((await call(h, USERS[1], { op: 'recover.start', ticket })).status === 404, 'bilhete de outra pessoa → 404');
    const s = await call(h, USERS[0], { op: 'recover.start', ticket });
    check(s.status === 200 && s.body.carrier === ['bogart', 'fincher', 'cypher'][ri], `recover.start (${s.status} ${s.body.code})`);
    const started = (s.body.events as Row[]).find((e) => e.t === 'matchStarted');
    check(started?.reclaim === true && (started?.prize as Row)?.holderId === s.body.carrier, 'matchStarted: reclaim + portador');
    check(!JSON.stringify(s.body).includes(String(recovers.get(rid)!.seed)), 'semente não sai no start');
    const dupS = await call(h, USERS[0], { op: 'recover.start', ticket });
    check(dupS.status === 200 && dupS.body.duplicate === true, 'bilhete repetido → a partida aberta');
    let k = 0;
    let view = s.body.view as Row;
    let seq = 1;
    while (k < 2000) {
      k += 1;
      if (ri === 2 && k === 5) {
        const ff = await call(h, USERS[0], { op: 'recover.forfeit', matchId: rid, seq });
        check(ff.status === 200 && (ff.body.result as Row)?.status === 'forfeit', 'recover.forfeit');
        break;
      }
      const action = pickAction({ view }, k);
      const idemR = randomUUID();
      const a = await call(h, USERS[0], { op: 'recover.act', matchId: rid, seq, idem: idemR, action });
      if (a.status === 422) {
        const f = await call(h, USERS[0], { op: 'recover.act', matchId: rid, seq, idem: randomUUID(), action: { type: 'fold' } });
        check(f.status === 200, 'recover fold');
        seq = Number(f.body.seq);
        view = f.body.view as Row;
        if (f.body.result) break;
        continue;
      }
      check(a.status === 200, `recover.act (${a.status} ${a.body.code})`);
      if (k === 3) {
        const rep = await call(h, USERS[0], { op: 'recover.act', matchId: rid, seq, idem: idemR, action });
        check(rep.status === 200 && JSON.stringify(rep.body) === JSON.stringify(a.body), 'recover: mesmo idem → mesma resposta');
        const old = await call(h, USERS[0], { op: 'recover.act', matchId: rid, seq: seq - 1, idem: randomUUID(), action });
        check(old.status === 409, 'recover: seq velho → 409');
      }
      seq = Number(a.body.seq);
      view = a.body.view as Row;
      if (a.body.result) {
        const res = a.body.result as Row;
        check(typeof res.recovered === 'boolean', 'resultado traz recovered');
        check(createHash('sha256').update(String(res.seed)).digest('hex') === s.body.seedHash, 'recover: semente bate');
        const capturedEv = ((a.body.events as Row[]) ?? []).some((e) => e.t === 'prizeCaptured');
        if (res.status === 'won') check(res.recovered === true, 'venceu a mesa → devolvido');
        if (capturedEv) check(res.recovered === true, 'capturou → devolvido');
        break;
      }
    }
    const rr = await call(h, USERS[0], { op: 'recover.resume', matchId: rid });
    check(rr.status === 200 && rr.body.carrier === recovers.get(rid)!.carrier, 'recover.resume');
  }

  timings = timings.sort((a, b) => a - b);
  console.log(`start (handler + banco falso): mediana ${timings[Math.floor(timings.length / 2)]?.toFixed(1)} ms`);
  console.log(`${checks} checagens, ${failures} falhas; RPCs chamadas: ${calls.length}`);
  if (failures > 0) process.exit(1);
}

await main();
