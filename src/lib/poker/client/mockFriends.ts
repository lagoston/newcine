/**
 * Servidor falso da mesa com amigos e da casual de devolução (03/11/2026, fase 3 — G3).
 * Só para a prévia: espelha o rascunho do F3 (F3_NOTES.md) e roda a partida de verdade
 * com o motor do E3 (friendsConfig, applyPersonAction, timeoutPerson…). Os amigos são
 * simulados: aceitam o convite, escolhem pôsteres, ficam prontos e jogam com um tempo
 * de pensar; um deles (Duda) deixa o relógio estourar uma vez, para a tela mostrar.
 * Tudo em `poker.mock.friends.v1`, com horários absolutos (recarregar continua).
 *
 * Alavancas (localStorage): `poker.mock.invite = 1` (um convite do Tonico esperando),
 * `poker.mock.reclaim = 1` (a próxima casual é a de devolução), `poker.mock.myName`.
 */
import type { PlayerAction } from '../engine.ts';
import type { MatchState, PlayerId, PosterEffectId, PublicEvent, Rarity, RivalId } from '../types.ts';
import {
  applyHumanAction,
  applyPersonAction,
  createMatch,
  forfeitMatch,
  friendsConfig,
  friendsResult,
  leavePerson,
  outcomeOf,
  personBack,
  personLegal,
  rescueConfig,
  tableView,
  timeoutPerson,
  toPublicEvents,
  waitingFor,
} from '../match/match.ts';
import { PokerClientError, type BountyResult } from './apiTypes.ts';
import { randomSeed, uuid } from './freeStore.ts';
import { POSTER_POKER, posterDef } from './tournament.ts';
import type {
  CasualApi,
  CasualBegin,
  FriendsApi,
  FriendsHome,
  FriendsMatch,
  FriendsMember,
  FriendsPosterCard,
  FriendsResult,
  FriendsRoom,
  FriendsRoomReply,
  InviteState,
  RecoverResult,
} from './friends.ts';

const KEY = 'poker.mock.friends.v1';
const TURN_MS = 30_000;
const ME = '17bef49a-2c3f-40c9-a9b5-a741946b1b1b';

/** O que o mock precisa do banco falso principal (mockApi): a coleção da pessoa. */
export interface MockBridge {
  ppOwned: () => PosterEffectId[];
  posters: () => { item_id: number; effect: string; title: string | null; title_en: string | null; year: number | null; file_path: string; serial: number | null; rarity: Rarity; lost?: boolean }[];
  /** Ganhou ou perdeu um pôster apostado. */
  movePoster: (p: { itemId: number; effect: string; rarity: Rarity; title: string | null; titleEn: string | null; filePath: string; serial: number | null }, gain: boolean) => void;
}

interface FakeFriend {
  userId: string;
  username: string;
  avatarUrl: string | null;
  pp: PosterEffectId[];
  /** Um pôster da coleção por raridade (o que ele aposta). */
  stakes: Partial<Record<Rarity, FriendsPosterCard>>;
  /** Pensa mais devagar / deixa o relógio estourar na 2ª mão. */
  sleepy?: boolean;
}

const card = (itemId: number, title: string, titleEn: string, year: number, filePath: string, rarity: Rarity, effect: FriendsPosterCard['effect'] = 'none', serial = 1): FriendsPosterCard => ({
  itemId, effect, title, titleEn, year, filePath, serial, rarity,
});

const FRIENDS: FakeFriend[] = [
  {
    userId: '2e15d9d0-cca4-4c63-92da-495dc1346826', username: 'Tonico', avatarUrl: 'https://previa.local/avatar/tonico.svg', pp: ['opal', 'tell'],
    stakes: { common: card(51, 'Amnésia', 'Memento', 2000, '/yuNs09hvpHVU1cBTCAk9zxsL2oW.jpg', 'common'), rare: card(52, 'Oldboy', 'Oldboy', 2003, '/pWDtjs568ZfOTMbURQBYuT4Qxka.jpg', 'rare', 'holo') },
  },
  {
    userId: 'f0000000-0000-4000-8000-00000000a0a0', username: 'Ana Clara', avatarUrl: 'https://previa.local/avatar/ana.svg', pp: ['sixth_card'],
    // Ana já tem o Pulp Fiction holográfico da coleção de exemplo: apostar esse dá "someone_has".
    stakes: { common: card(14, 'Pulp Fiction', 'Pulp Fiction', 1994, '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', 'common', 'holo'), rare: card(53, 'Cidade de Deus', 'City of God', 2002, '/k7eYdWvhYQyRQoU2TB2A2Xu2TfD.jpg', 'rare') },
  },
  {
    userId: 'f0000000-0000-4000-8000-00000000d0d0', username: 'Duda', avatarUrl: null, pp: ['early_flop', 'double_pot'], sleepy: true,
    stakes: { common: card(54, 'Drive', 'Drive', 2011, '/602vevIURmpDfzbnv5Ubi6wIkQm.jpg', 'common'), rare: card(55, 'Whiplash', 'Whiplash', 2014, '/7fn624j5lj3xTme2SgiLCeuedmO.jpg', 'rare') },
  },
  {
    userId: 'f0000000-0000-4000-8000-00000000c1c1', username: 'Lia', avatarUrl: 'https://previa.local/avatar/lia.svg', pp: [],
    stakes: { common: card(56, 'Her', 'Her', 2013, '/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg', 'common') },
  },
];

interface MMember {
  userId: string;
  status: FriendsMember['status'];
  isHost: boolean;
  ready: boolean;
  effects: number[];
  stake: { itemId: number; effect: string } | null;
  invitedAt: number;
  /** Simulação: quando o amigo aceita / fica pronto. */
  acceptAt?: number;
  readyAt?: number;
  order: number;
}

interface MMatch {
  state: MatchState;
  log: PublicEvent[];
  ids: Record<string, string>;
  seq: number;
  turnAt: number;
  plan: { id: string; at: number; key: string; kind: 'act' | 'timeout' } | null;
  sleptOnce: boolean;
}

interface MRoom {
  id: string;
  code: string;
  status: FriendsRoom['status'];
  hostId: string;
  stakeRarity: Rarity | null;
  version: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  members: MMember[];
  match: MMatch | null;
  result: FriendsResult | null;
  /** Quando quem criou (amigo) começa sozinho. */
  hostStartAt?: number;
}

interface MDb {
  v: 1;
  room: MRoom | null;
  /** Convites recebidos (simulados). */
  invites: { roomId: string; code: string; hostId: string; stakeRarity: Rarity | null; at: number; state: InviteState['state'] }[];
  wins: Record<string, { wins: number; matches: number }>;
  casualCount: number;
  recover: { matchId: string; state: MatchState; tail: PublicEvent[]; seq: number; status: 'active' | 'done'; poster: FriendsPosterCard; carrier: RivalId; result?: RecoverResult } | null;
}

function knob(key: string): string | null {
  try {
    return window.localStorage.getItem(`poker.mock.${key}`);
  } catch {
    return null;
  }
}
const myName = () => knob('myName') || 'Bruno';

function load(): MDb {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as MDb;
      if (db?.v === 1) return db;
    }
  } catch {
    // começa do zero
  }
  return { v: 1, room: null, invites: [], wins: {}, casualCount: 0, recover: null };
}
function save(db: MDb) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // sem armazenamento
  }
}

const latency = () => new Promise((r) => setTimeout(r, 90 + Math.random() * 160));
const friendOf = (id: string) => FRIENDS.find((f) => f.userId === id) ?? null;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
// Uma pseudo-sorte estável por chave (tempo de pensar dos amigos).
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

function goldCard(effect: PosterEffectId): FriendsPosterCard {
  const d = posterDef(effect)!;
  const i = POSTER_POKER.indexOf(d);
  return { itemId: 100 + i, effect: 'gold', title: d.titlePt, titleEn: d.titleEn, year: d.year, filePath: d.filePath, serial: d.serial, rarity: d.rarity, prizeId: d.id, effectId: d.effect };
}
const goldByItem = (itemId: number) => {
  const d = POSTER_POKER[itemId - 100];
  return d ? goldCard(d.effect) : null;
};

export function makeMockFriends(bridge: MockBridge): { friends: FriendsApi; casual: CasualApi } {
  const myCards = (): FriendsPosterCard[] =>
    bridge
      .posters()
      .filter((p) => !p.lost)
      .map((p) => ({ itemId: p.item_id, effect: p.effect as FriendsPosterCard['effect'], title: p.title, titleEn: p.title_en, year: p.year, filePath: p.file_path, serial: p.serial, rarity: p.rarity }));
  const myGold = () => bridge.ppOwned().map(goldCard);

  const stakeCardOf = (m: MMember): FriendsPosterCard | null => {
    if (!m.stake) return null;
    if (m.userId === ME) return myCards().find((c) => c.itemId === m.stake!.itemId && c.effect === m.stake!.effect) ?? null;
    const f = friendOf(m.userId);
    return Object.values(f?.stakes ?? {}).find((c) => c?.itemId === m.stake!.itemId) ?? null;
  };
  const effectCardsOf = (m: MMember): FriendsPosterCard[] => m.effects.map(goldByItem).filter((x): x is FriendsPosterCard => !!x);

  // Alguém da sala já tem uma cópia idêntica (o Pulp Fiction holográfico, com a Ana).
  const stakeProblem = (r: MRoom, m: MMember): string | null => {
    if (!r.stakeRarity) return null;
    if (!m.stake) return 'missing';
    const c = stakeCardOf(m);
    if (!c) return 'not_owned';
    if (c.rarity !== r.stakeRarity) return 'rarity';
    const others = r.members.filter((o) => o.userId !== m.userId && o.status === 'joined');
    if (m.userId === ME && c.itemId === 14 && c.effect === 'holo' && others.some((o) => o.userId === FRIENDS[1].userId)) return 'someone_has';
    return null;
  };

  const memberJson = (r: MRoom, m: MMember): FriendsMember => {
    const f = friendOf(m.userId);
    const pid = r.match?.ids[m.userId] ?? null;
    const view = r.match ? friendsResult(r.match.state).people[pid as PlayerId] : null;
    return {
      userId: m.userId,
      username: m.userId === ME ? myName() : f?.username ?? '?',
      avatarUrl: m.userId === ME ? null : f?.avatarUrl ?? null,
      avatarFrame: null,
      status: m.status,
      isHost: m.isHost,
      ready: m.ready,
      effectPosters: effectCardsOf(m),
      stake: stakeCardOf(m),
      stakeProblem: m.status === 'joined' ? stakeProblem(r, m) : null,
      seat: r.match ? r.match.state.config.seats[pid as PlayerId] ?? null : null,
      playerId: pid,
      away: !!view?.away,
      place: view?.place ?? null,
    };
  };

  const blockersOf = (r: MRoom): string[] => {
    const joined = r.members.filter((m) => m.status === 'joined');
    const out: string[] = [];
    if (joined.length < 2) out.push('need_players');
    if (joined.some((m) => !m.ready)) out.push('not_ready');
    if (joined.some((m) => stakeProblem(r, m))) out.push('stake_problem');
    return out;
  };

  const roomJson = (r: MRoom): FriendsRoom => {
    const me = r.members.find((m) => m.userId === ME);
    const joined = r.members.filter((m) => m.status === 'joined');
    const blockers = blockersOf(r);
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      hostId: r.hostId,
      stakeRarity: r.stakeRarity,
      version: r.version,
      createdAt: r.createdAt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      me: { userId: ME, status: me?.status ?? 'invited', isHost: r.hostId === ME },
      members: r.members.filter((m) => m.status !== 'declined' && m.status !== 'expired').sort((a, b) => a.order - b.order).map((m) => memberJson(r, m)),
      effects: joined.flatMap((m) => effectCardsOf(m).map((c) => c.effectId!)),
      canStart: r.hostId === ME && r.status === 'lobby' && blockers.length === 0,
      blockers: r.hostId === ME ? blockers : [],
      options: r.status === 'lobby' ? { effects: myGold(), stakes: r.stakeRarity ? myCards().filter((c) => c.rarity === r.stakeRarity) : [] } : null,
      result: r.result,
    };
  };

  // --- A partida ---------------------------------------------------------

  const myPid = (r: MRoom) => r.match?.ids[ME] ?? null;
  const record = (r: MRoom, events: Parameters<typeof toPublicEvents>[0]) => {
    const mm = r.match!;
    const pid = myPid(r) as PlayerId;
    mm.log = [...mm.log, ...toPublicEvents(events, pid)].slice(-400);
    mm.seq += 1;
    r.version += 1;
  };

  const finish = (db: MDb, r: MRoom) => {
    const mm = r.match!;
    const res = friendsResult(mm.state);
    if (!res.done || r.result) return;
    const byPid = Object.fromEntries(Object.entries(mm.ids).map(([u, p]) => [p, u]));
    const winnerId = res.winnerId as string;
    const winnerUser = byPid[winnerId] ?? null;
    const winner: FriendsResult['winner'] = winnerUser
      ? { kind: 'person', playerId: winnerId, userId: winnerUser }
      : { kind: 'oracle', playerId: winnerId, oracle: winnerId as RivalId };
    const stakes: FriendsResult['stakes'] = [];
    if (r.stakeRarity) {
      for (const m of r.members.filter((x) => x.status === 'joined' || x.status === 'left')) {
        const c = stakeCardOf(m);
        if (!c) continue;
        let outcome: 'returned' | 'transferred' | 'lost' = 'lost';
        let toUserId: string | null = null;
        let oracle: RivalId | null = null;
        if (winner.kind === 'oracle') oracle = winner.oracle;
        else if (winner.userId === m.userId) outcome = 'returned';
        else {
          outcome = 'transferred';
          toUserId = winner.userId;
        }
        stakes.push({ ...c, ownerId: m.userId, outcome, toUserId, oracle });
        // A coleção da pessoa da prévia muda de verdade (o mock principal guarda).
        if (m.userId === ME && outcome !== 'returned') bridge.movePoster({ ...c, titleEn: c.titleEn }, false);
        if (toUserId === ME && m.userId !== ME) bridge.movePoster({ ...c, titleEn: c.titleEn }, true);
      }
    }
    const places = Object.entries(res.places).map(([pid, place]) => ({
      playerId: pid,
      place: place as number,
      ...(byPid[pid] ? { userId: byPid[pid] } : { oracle: pid as RivalId }),
    }));
    r.result = { winner, places, stakes, seed: mm.state.config.seed };
    r.status = 'finished';
    r.finishedAt = new Date().toISOString();
    for (const m of r.members.filter((x) => x.status === 'joined' || x.status === 'left')) {
      const w = (db.wins[m.userId] = db.wins[m.userId] ?? { wins: 0, matches: 0 });
      w.matches += 1;
      if (winner.kind === 'person' && winner.userId === m.userId) w.wins += 1;
    }
    r.version += 1;
  };

  const startMatch = (r: MRoom, now: number) => {
    const joined = r.members.filter((m) => m.status === 'joined').sort((a, b) => a.order - b.order);
    // Quem criou é o p1 (lugar 0); os outros na ordem de entrada.
    joined.sort((a, b) => Number(b.isHost) - Number(a.isHost));
    const effects = joined.flatMap((m) => effectCardsOf(m).map((c) => c.effectId!));
    const cfg = friendsConfig({ seed: randomSeed(), people: joined.length, effects });
    const ids: Record<string, string> = {};
    joined.forEach((m, i) => (ids[m.userId] = cfg.people![i] as string));
    const step = createMatch(cfg);
    r.match = { state: step.state, log: [], ids, seq: 0, turnAt: now, plan: null, sleptOnce: false };
    record(r, step.events);
    r.status = 'playing';
    r.startedAt = new Date(now).toISOString();
    r.members.forEach((m) => {
      if (m.status === 'invited') m.status = 'expired';
    });
  };

  // Escolha de um amigo: passa se der, paga se for barato, às vezes aumenta o mínimo.
  const friendMove = (state: MatchState, pid: string, key: string): PlayerAction => {
    const l = personLegal(state, pid as PlayerId);
    const roll = hash01(`${key}:move`);
    if (!l) return { type: 'fold' };
    if (l.canCheck) {
      if (l.bet && roll > 0.82) return { type: 'bet', amount: l.bet.min };
      return { type: 'check' };
    }
    if (l.call && (l.toCall <= l.stack * 0.22 || roll > 0.7)) {
      if (l.raise && roll > 0.93) return { type: 'raise', amount: l.raise.min };
      return { type: 'call' };
    }
    return { type: 'fold' };
  };

  /** Anda o relógio: amigos agem quando chega a hora; a vez estourada vira tique. */
  const advance = (db: MDb, r: MRoom, now = Date.now()) => {
    // Lobby: convites aceitos, pôsteres escolhidos, prontos, e o amigo que criou começa.
    if (r.status === 'lobby') {
      let changed = false;
      for (const m of r.members) {
        const f = friendOf(m.userId);
        if (!f) continue;
        if (m.status === 'invited' && m.acceptAt && now >= m.acceptAt) {
          m.status = 'joined';
          m.effects = f.pp.slice(0, 2).map((e) => goldCard(e).itemId);
          changed = true;
        }
        if (m.status === 'joined' && !m.ready && m.readyAt && now >= m.readyAt) {
          m.stake = r.stakeRarity && f.stakes[r.stakeRarity] ? { itemId: f.stakes[r.stakeRarity]!.itemId, effect: f.stakes[r.stakeRarity]!.effect } : null;
          m.ready = true;
          changed = true;
        }
      }
      if (r.hostId !== ME && r.hostStartAt && now >= r.hostStartAt && blockersOf(r).length === 0) {
        startMatch(r, now);
        changed = true;
      }
      if (changed) r.version += 1;
      return;
    }
    if (r.status !== 'playing' || !r.match) return;
    const mm = r.match;
    for (let guard = 0; guard < 40; guard++) {
      if (mm.state.status !== 'running') break;
      const w = waitingFor(mm.state);
      if (!w) break;
      const deadline = mm.turnAt + TURN_MS;
      if (w === myPid(r)) {
        if (now < deadline) break;
        const step = timeoutPerson(mm.state, w);
        mm.state = step.state;
        mm.turnAt = deadline;
        record(r, step.events);
        continue;
      }
      const key = `${mm.state.game.handNumber}:${mm.seq}:${w}`;
      if (!mm.plan || mm.plan.key !== key) {
        const uid = Object.entries(mm.ids).find(([, p]) => p === w)?.[0];
        const f = uid ? friendOf(uid) : null;
        const sleepNow = !!f?.sleepy && !mm.sleptOnce && mm.state.game.handNumber >= 2;
        const think = (f?.sleepy ? 3500 : 1600) + hash01(key) * 3800;
        mm.plan = sleepNow ? { id: w, at: deadline, key, kind: 'timeout' } : { id: w, at: mm.turnAt + think, key, kind: 'act' };
        if (sleepNow) mm.sleptOnce = true;
      }
      if (now < mm.plan.at) break;
      const step = mm.plan.kind === 'timeout' ? timeoutPerson(mm.state, w) : applyPersonAction(mm.state, w, friendMove(mm.state, w, key));
      mm.turnAt = mm.plan.at;
      mm.plan = null;
      mm.state = step.state;
      record(r, step.events);
    }
    if (mm.state.status !== 'running') finish(db, r);
  };

  const matchJson = (r: MRoom, since?: number): FriendsMatch | null => {
    const mm = r.match;
    if (!mm) return null;
    const pid = myPid(r);
    const oldest = mm.log[0]?.i ?? 0;
    const events = typeof since === 'number' ? mm.log.filter((e) => e.i > since) : mm.log.slice(-150);
    const w = mm.state.status === 'running' ? waitingFor(mm.state) : null;
    const res = friendsResult(mm.state);
    const byPid = Object.fromEntries(Object.entries(mm.ids).map(([u, p]) => [p, u]));
    return {
      seq: mm.seq,
      seedHash: 'mock',
      myPlayerId: pid,
      seats: Object.entries(mm.state.config.seats).map(([id, seat]) => ({
        seat: seat as number,
        playerId: id,
        kind: byPid[id] ? ('person' as const) : ('oracle' as const),
        ...(byPid[id] ? { userId: byPid[id] } : { oracle: id as RivalId }),
      })),
      view: tableView(mm.state, (pid ?? 'p1') as PlayerId),
      events: events.slice(-150),
      gap: typeof since === 'number' && since > 0 && since < oldest - 1,
      toAct: w,
      deadline: w ? new Date(mm.turnAt + TURN_MS).toISOString() : null,
      serverNow: new Date().toISOString(),
      away: Object.entries(res.people).filter(([, p]) => p.away).map(([id]) => id),
      result: r.result,
    };
  };

  const reply = (db: MDb, r: MRoom, since?: number, extra: Partial<FriendsRoomReply> = {}): FriendsRoomReply => {
    save(db);
    return { ok: true, room: roomJson(r), match: matchJson(r, since), ...extra };
  };

  const mine = (roomId: string): { db: MDb; r: MRoom } => {
    const db = load();
    const r = db.room;
    if (!r || r.id !== roomId) throw new PokerClientError(404, 'no_room');
    advance(db, r);
    return { db, r };
  };
  const meIn = (r: MRoom) => r.members.find((m) => m.userId === ME) ?? null;
  const touch = (r: MRoom) => {
    r.version += 1;
  };

  // A sala do Tonico (convite ou código): ele já está pronto; a Ana entra logo.
  const tonicoRoom = (code: string, stakeRarity: Rarity | null, id = uuid()): MRoom => {
    const now = Date.now();
    const t = FRIENDS[0];
    return {
      id, code, status: 'lobby', hostId: t.userId, stakeRarity, version: 1, createdAt: new Date(now).toISOString(), startedAt: null, finishedAt: null,
      members: [
        { userId: t.userId, status: 'joined', isHost: true, ready: true, effects: t.pp.map((e) => goldCard(e).itemId), stake: stakeRarity && t.stakes[stakeRarity] ? { itemId: t.stakes[stakeRarity]!.itemId, effect: t.stakes[stakeRarity]!.effect } : null, invitedAt: now, order: 0 },
        { userId: FRIENDS[1].userId, status: 'invited', isHost: false, ready: false, effects: [], stake: null, invitedAt: now, acceptAt: now + 2500, readyAt: now + 4000, order: 2 },
      ],
      match: null,
      result: null,
    };
  };
  const joinTonico = (db: MDb, code: string, stakeRarity: Rarity | null, roomId?: string) => {
    const r = tonicoRoom(code, stakeRarity, roomId);
    r.members.push({ userId: ME, status: 'joined', isHost: false, ready: false, effects: [], stake: null, invitedAt: Date.now(), order: 1 });
    db.room = r;
    return r;
  };

  const ensureInvite = (db: MDb) => {
    if (knob('invite') === '1' && !db.invites.some((i) => i.state === 'open') && !db.room) {
      db.invites.push({ roomId: uuid(), code: 'K7M2QX', hostId: FRIENDS[0].userId, stakeRarity: 'common', at: Date.now() - 60_000, state: 'open' });
    }
  };

  const friends: FriendsApi = {
    async home(): Promise<FriendsHome> {
      await latency();
      const db = load();
      ensureInvite(db);
      if (db.room) advance(db, db.room);
      save(db);
      const r = db.room && (db.room.status === 'lobby' || db.room.status === 'playing') && meIn(db.room)?.status === 'joined' ? db.room : null;
      return {
        enabled: true,
        room: r ? { id: r.id, code: r.code, status: r.status, hostId: r.hostId, stakeRarity: r.stakeRarity, members: r.members.filter((m) => m.status === 'joined').length, version: r.version } : null,
        invites: db.invites
          .filter((i) => i.state === 'open')
          .map((i) => ({ roomId: i.roomId, code: i.code, host: { userId: i.hostId, username: friendOf(i.hostId)?.username ?? '?', avatarUrl: friendOf(i.hostId)?.avatarUrl ?? null }, stakeRarity: i.stakeRarity, members: 2, invitedAt: new Date(i.at).toISOString() })),
        friends: FRIENDS.map((f) => ({ userId: f.userId, username: f.username, avatarUrl: f.avatarUrl, avatarFrame: null, inRoom: false })),
        effectPosters: myGold(),
        scoreboard: [
          { userId: ME, username: myName(), avatarUrl: null, ...(db.wins[ME] ?? { wins: 0, matches: 0 }) },
          ...FRIENDS.slice(0, 3).map((f) => ({ userId: f.userId, username: f.username, avatarUrl: f.avatarUrl, ...(db.wins[f.userId] ?? { wins: 0, matches: 0 }) })),
        ],
      };
    },
    async inviteStates(roomIds) {
      const db = load();
      ensureInvite(db);
      return db.invites.filter((i) => roomIds.includes(i.roomId)).map((i) => ({ roomId: i.roomId, state: i.state, stakeRarity: i.stakeRarity, members: 2, code: i.code }));
    },
    async create(stakeRarity) {
      await latency();
      const db = load();
      if (db.room && (db.room.status === 'lobby' || db.room.status === 'playing') && meIn(db.room)?.status === 'joined') throw new PokerClientError(409, 'in_room', { roomId: db.room.id });
      const now = Date.now();
      db.room = {
        id: uuid(), code: newCode(), status: 'lobby', hostId: ME, stakeRarity, version: 1, createdAt: new Date(now).toISOString(), startedAt: null, finishedAt: null,
        // Quem criou conta sempre como pronto (F3).
        members: [{ userId: ME, status: 'joined', isHost: true, ready: true, effects: [], stake: null, invitedAt: now, order: 0 }],
        match: null, result: null,
      };
      return reply(db, db.room);
    },
    async invite(roomId, userIds) {
      await latency();
      const { db, r } = mine(roomId);
      const now = Date.now();
      const invited: string[] = [];
      const skipped: { userId: string; reason: string }[] = [];
      for (const uid of userIds) {
        if (r.members.some((m) => m.userId === uid && m.status !== 'declined')) {
          skipped.push({ userId: uid, reason: 'already' });
          continue;
        }
        if (r.members.filter((m) => m.status === 'joined' || m.status === 'invited').length >= 4) {
          skipped.push({ userId: uid, reason: 'full' });
          continue;
        }
        const k = r.members.length;
        r.members.push({ userId: uid, status: 'invited', isHost: false, ready: false, effects: [], stake: null, invitedAt: now, acceptAt: now + 1200 + k * 700, readyAt: now + 2600 + k * 900, order: k });
        invited.push(uid);
      }
      touch(r);
      return reply(db, r, undefined, { invited, skipped });
    },
    async respond(roomId, accept) {
      await latency();
      const db = load();
      const inv = db.invites.find((i) => i.roomId === roomId);
      if (!inv) throw new PokerClientError(404, 'not_invited');
      if (inv.state !== 'open') throw new PokerClientError(409, inv.state === 'started' ? 'started' : 'room_closed');
      inv.state = accept ? 'joined' : 'declined';
      if (!accept) {
        save(db);
        return { ok: true, room: roomJson(tonicoRoom(inv.code, inv.stakeRarity, roomId)) };
      }
      const r = joinTonico(db, inv.code, inv.stakeRarity, roomId);
      return reply(db, r);
    },
    async join(code) {
      await latency();
      const db = load();
      const c = code.trim().toUpperCase();
      if (db.room && db.room.code === c && (db.room.status === 'lobby' || db.room.status === 'playing')) return reply(db, db.room);
      const inv = db.invites.find((i) => i.code === c);
      if (c !== 'K7M2QX' && !inv) throw new PokerClientError(404, 'no_room');
      if (inv) inv.state = 'joined';
      const r = joinTonico(db, c, inv?.stakeRarity ?? 'common', inv?.roomId);
      return reply(db, r);
    },
    async leave(roomId) {
      await latency();
      const { db, r } = mine(roomId);
      const me = meIn(r);
      if (me) me.status = 'left';
      if (r.status === 'lobby' && r.hostId === ME) r.status = 'closed';
      if (r.status === 'playing' && r.match) {
        const pid = myPid(r) as PlayerId;
        try {
          const step = leavePerson(r.match.state, pid, 'forfeit');
          r.match.state = step.state;
          record(r, step.events);
        } catch {
          // já estava fora
        }
        // Sem a pessoa na tela, os amigos terminam a mesa sem esperar.
        for (let i = 0; i < 2000 && r.match.state.status === 'running'; i++) advance(db, r, Date.now() + (i + 1) * 40_000);
      }
      touch(r);
      return reply(db, r);
    },
    async configure(roomId, stakeRarity) {
      await latency();
      const { db, r } = mine(roomId);
      if (r.hostId !== ME) throw new PokerClientError(403, 'not_host');
      r.stakeRarity = stakeRarity;
      const now = Date.now();
      r.members.forEach((m) => {
        m.stake = null;
        if (m.isHost) m.ready = true;
        else if (m.userId !== ME && m.status === 'joined') {
          m.ready = false;
          m.readyAt = now + 1400;
        } else m.ready = false;
      });
      touch(r);
      return reply(db, r);
    },
    async setEffects(roomId, itemIds) {
      await latency();
      const { db, r } = mine(roomId);
      const own = new Set(myGold().map((c) => c.itemId));
      if (itemIds.length > 2 || itemIds.some((id) => !own.has(id))) throw new PokerClientError(400, 'effects_invalid', { reason: 'not_owned' });
      const me = meIn(r)!;
      me.effects = Array.from(new Set(itemIds));
      if (!me.isHost) me.ready = false;
      touch(r);
      return reply(db, r);
    },
    async setStake(roomId, itemId, effect) {
      await latency();
      const { db, r } = mine(roomId);
      if (!r.stakeRarity) throw new PokerClientError(400, 'stake_invalid', { reason: 'no_stake_room' });
      const me = meIn(r)!;
      if (itemId == null) me.stake = null;
      else {
        const c = myCards().find((x) => x.itemId === itemId && (!effect || x.effect === effect));
        if (!c) throw new PokerClientError(400, 'stake_invalid', { reason: 'not_owned' });
        if (c.rarity !== r.stakeRarity) throw new PokerClientError(400, 'stake_invalid', { reason: 'rarity' });
        me.stake = { itemId: c.itemId, effect: c.effect };
      }
      if (!me.isHost) me.ready = false;
      touch(r);
      return reply(db, r);
    },
    async setReady(roomId, ready) {
      await latency();
      const { db, r } = mine(roomId);
      const me = meIn(r)!;
      me.ready = me.isHost ? true : ready;
      // Na sala do amigo, ele começa logo depois que todos ficam prontos.
      if (r.hostId !== ME) r.hostStartAt = Date.now() + 2200;
      touch(r);
      return reply(db, r);
    },
    async start(roomId) {
      await latency();
      const { db, r } = mine(roomId);
      if (r.hostId !== ME) throw new PokerClientError(403, 'not_host');
      if (r.status !== 'lobby') throw new PokerClientError(409, 'started');
      const blockers = blockersOf(r);
      if (blockers.length) throw new PokerClientError(409, 'start_blocked', { blockers });
      startMatch(r, Date.now());
      return reply(db, r);
    },
    async sync(roomId, since) {
      const { db, r } = mine(roomId);
      return reply(db, r, since);
    },
    async act(roomId, seq, _idem, action, show) {
      await latency();
      const { db, r } = mine(roomId);
      const mm = r.match;
      if (!mm || r.status !== 'playing') throw new PokerClientError(410, 'finished', { room: roomJson(r) });
      if (seq !== mm.seq) throw new PokerClientError(409, 'stale', { seq: mm.seq });
      const pid = myPid(r) as PlayerId;
      const before = mm.log[mm.log.length - 1]?.i ?? 0;
      try {
        const step = applyPersonAction(mm.state, pid, action, { show: show === true });
        mm.state = step.state;
        mm.turnAt = Date.now();
        record(r, step.events);
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === 'not_your_turn') throw new PokerClientError(409, 'not_your_turn', { seq: mm.seq });
        throw new PokerClientError(422, 'illegal', { seq: mm.seq });
      }
      advance(db, r);
      return reply(db, r, before);
    },
    async tick(roomId, seq) {
      const { db, r } = mine(roomId);
      const mm = r.match;
      if (!mm) throw new PokerClientError(410, 'finished');
      if (seq !== mm.seq) return reply(db, r);
      if (Date.now() < mm.turnAt + TURN_MS) throw new PokerClientError(409, 'not_yet', { deadline: new Date(mm.turnAt + TURN_MS).toISOString(), serverNow: new Date().toISOString() });
      return reply(db, r);
    },
    async back(roomId) {
      await latency();
      const { db, r } = mine(roomId);
      const mm = r.match;
      if (mm && mm.state.status === 'running') {
        const step = personBack(mm.state, myPid(r) as PlayerId);
        mm.state = step.state;
        if (step.events.length) record(r, step.events);
      }
      return reply(db, r);
    },
    // Sem Realtime na prévia: um relógio de meio segundo faz o papel do ping.
    subscribe(roomId, onPing) {
      let last = -1;
      const id = window.setInterval(() => {
        const db = load();
        const r = db.room;
        if (!r || r.id !== roomId) return;
        advance(db, r);
        save(db);
        if (r.version !== last) {
          last = r.version;
          onPing({ version: r.version, seq: r.match?.seq });
        }
      }, 500);
      return () => window.clearInterval(id);
    },
  };

  // --- A casual de devolução --------------------------------------------

  const reclaimPoster = (): FriendsPosterCard =>
    myCards().find((c) => c.rarity === 'rare') ?? card(23, 'Interestelar', 'Interstellar', 2014, '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', 'rare', 'negative', 23);

  const recoverResult = (m: NonNullable<MDb['recover']>, status: BountyResult['status'], place: number, captured: boolean): RecoverResult => ({
    status, place, prizeCaptured: captured, prize: null as never, seed: m.state.config.seed, seedHash: 'mock', marks: [], title: null as never, recovered: captured, poster: captured ? m.poster : null,
  });

  const casual: CasualApi = {
    async begin(): Promise<CasualBegin> {
      await latency();
      const db = load();
      if (db.recover && db.recover.status === 'active') return { enabled: true, mode: 'server', matchId: db.recover.matchId, resume: true };
      db.casualCount += 1;
      save(db);
      if (knob('reclaim') === '1') return { enabled: true, mode: 'server', ticket: `t-${uuid()}` };
      return { enabled: true, mode: 'device' };
    },
    async start() {
      await latency();
      const db = load();
      const poster = reclaimPoster();
      const carrier: RivalId = 'fincher';
      const cfg = rescueConfig({ seed: randomSeed(), carrierId: carrier, prizeId: `recover-${poster.itemId}`, rarity: poster.rarity });
      const step = createMatch(cfg);
      const events = toPublicEvents(step.events, 'human');
      db.recover = { matchId: uuid(), state: step.state, tail: events.slice(-60), seq: 1, status: 'active', poster, carrier };
      save(db);
      return {
        ok: true, matchId: db.recover.matchId, seq: 1, seedHash: 'mock', attempt: 0, loan: 0, carrier, stars: 0, events, view: tableView(step.state, 'human'),
        prize: { id: `recover-${poster.itemId}`, kind: 'poster', rarity: poster.rarity, name_pt: poster.title ?? '', name_en: poster.titleEn ?? poster.title ?? '', article_pt: 'o', image: poster.filePath, payload: { item_id: poster.itemId, effect: poster.effect }, repeatable: false } as never,
        recoverPrize: poster,
      };
    },
    async act(matchId, seq, _idem, action, show) {
      await latency();
      const db = load();
      const m = db.recover;
      if (!m || m.matchId !== matchId) throw new PokerClientError(404, 'not_found');
      if (m.status !== 'active') throw new PokerClientError(410, 'finished', { result: m.result });
      if (seq !== m.seq) throw new PokerClientError(409, 'stale', { seq: m.seq, view: tableView(m.state, 'human') });
      const step = applyHumanAction(m.state, action, { show: show === true });
      const out = outcomeOf(m.state, step.state);
      const events = toPublicEvents(step.events, 'human');
      m.state = step.state;
      m.tail = [...m.tail, ...events].slice(-60);
      m.seq += 1;
      let result: RecoverResult | undefined;
      const captured = events.some((e) => e.t === 'prizeCaptured');
      if (captured && m.state.status === 'running') {
        // Capturou e a mesa segue: o pôster já voltou (o resultado sai no fim).
        m.result = recoverResult(m, 'won', 1, true);
      }
      if (out.finished) {
        m.status = 'done';
        result = recoverResult(m, out.finished.status, out.finished.place, captured || !!m.result?.recovered || (out.finished.status === 'won' && out.finished.place === 1));
        m.result = result;
      }
      save(db);
      return { ok: true, seq: m.seq, events, view: tableView(step.state, 'human'), result };
    },
    async forfeit(matchId) {
      await latency();
      const db = load();
      const m = db.recover;
      if (!m || m.matchId !== matchId) throw new PokerClientError(404, 'not_found');
      const step = forfeitMatch(m.state);
      const out = outcomeOf(m.state, step.state);
      m.state = step.state;
      m.status = 'done';
      m.result = recoverResult(m, 'forfeit', out.finished?.place ?? 4, !!m.result?.recovered);
      save(db);
      return m.result;
    },
    async resume(matchId) {
      await latency();
      const db = load();
      const m = db.recover;
      if (!m || (matchId && m.matchId !== matchId)) throw new PokerClientError(404, 'none');
      const poster = m.poster;
      return {
        ok: true, matchId: m.matchId, seq: m.seq, seedHash: 'mock', carrier: m.carrier, stars: 0, loan: 0, view: tableView(m.state, 'human'), recent: m.tail,
        prize: { id: `recover-${poster.itemId}`, kind: 'poster', rarity: poster.rarity, name_pt: poster.title ?? '', name_en: poster.titleEn ?? '', article_pt: 'o', image: poster.filePath, payload: {}, repeatable: false } as never,
        result: m.status === 'active' ? undefined : m.result,
      };
    },
  };

  return { friends, casual };
}

/** Só para a prévia: zera a sala falsa (e os convites). */
export function resetMockFriends(patch: Partial<Pick<MDb, 'wins' | 'casualCount'>> = {}) {
  save({ v: 1, room: null, invites: [], wins: {}, casualCount: 0, recover: null, ...patch });
}
