/**
 * `PokerApi` falso (SPEC §4.9 e §8, pacote D): roda o prêmio com a camada de
 * partida local, guardando tudo em `poker.mock.v1`, para o fluxo inteiro (lobby →
 * mesa do prêmio → captura → créditos) funcionar sem servidor.
 *
 * 03/11/2026: só para a prévia e para o desenvolvimento. Não concede nada de
 * verdade: em produção o salão fica fechado até o pacote C publicar o pokerApi.
 */
import type { PlayerAction } from '../engine.ts';
import type { MatchState, MatchSummary, PublicEvent, Rarity, RivalId, TitleId } from '../types.ts';
import { applyHumanAction, createMatch, forfeitMatch, outcomeOf, tableView, toPublicEvents } from '../match/match.ts';
import type {
  BountyAct,
  BountyResult,
  BountyResume,
  BountyStart,
  IntervalPick,
  PokerApiLike,
  PokerHome,
  PokerPrize,
} from './apiTypes.ts';
import { PokerClientError } from './apiTypes.ts';
import { buildConfig } from './matchConfig.ts';
import { randomSeed, uuid } from './freeStore.ts';
import { POKER_PREVIEW } from './flags.ts';

const KEY = 'poker.mock.v1';

interface MockMatch {
  id: string;
  day: string;
  seq: number;
  seed: string;
  prizeId: string;
  state: MatchState;
  tail: PublicEvent[];
  status: 'active' | 'won' | 'lost' | 'forfeit';
  result?: BountyResult;
  lastIdem?: string;
  lastResponse?: BountyAct;
}

interface MockDb {
  v: 1;
  tickets: number;
  ageConfirmed: boolean;
  tutorialDone: boolean;
  tutorialChip: boolean;
  story: Record<string, string>;
  attempts: Record<string, number>;
  wonDay: Record<string, boolean>;
  lossStreak: number;
  free: { matches: number; wins: number };
  bounty: { matches: number; wins: number };
  reported: string[];
  loadout: { deck: string; table: string; quips: string };
  owned: string[];
  active: MockMatch | null;
}

const PRIZES: (PokerPrize & { carrier: RivalId })[] = [
  { id: 'deck-noir', kind: 'deck', rarity: 'epic', name_pt: 'Baralho Noir', name_en: 'Noir Deck', article_pt: 'o',
    blurb_pt: 'Verso preto e prata, em art déco.', blurb_en: 'Black and silver art deco back.', payload: { item_id: 'deck-noir' },
    repeatable: false, carrier: 'cypher' },
  { id: 'table-meia-noite', kind: 'table', rarity: 'legendary', name_pt: 'Feltro Meia-Noite', name_en: 'Midnight Felt',
    article_pt: 'o', blurb_pt: 'O feltro azul-noite da sessão.', blurb_en: 'The midnight-blue felt.',
    payload: { item_id: 'table-meia-noite' }, repeatable: false, carrier: 'fincher' },
  { id: 'fichas-2', kind: 'tickets', rarity: 'common', name_pt: '2 fichas', name_en: '2 chips', article_pt: 'as',
    payload: { amount: 2 }, repeatable: true, carrier: 'bogart' },
];

function today(): string {
  // Dia de Brasília (UTC−3), como o servidor (§2.6).
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

// O dia de Brasília termina às 03:00 UTC do dia seguinte.
function endsAt(day: string): string {
  return new Date(new Date(`${day}T03:00:00Z`).getTime() + 86_400_000).toISOString();
}

function prizeOf(day: string) {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRIZES[h % PRIZES.length];
}

function load(): MockDb {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      if (db?.v === 1) return db;
    }
  } catch {
    // começa do zero
  }
  return {
    v: 1, tickets: 7, ageConfirmed: false, tutorialDone: false, tutorialChip: false, story: {}, attempts: {}, wonDay: {},
    lossStreak: 0, free: { matches: 0, wins: 0 }, bounty: { matches: 0, wins: 0 }, reported: [],
    loadout: { deck: 'deck-classico', table: 'table-feltro-verde', quips: 'quips-padrao' }, owned: [], active: null,
  };
}

function save(db: MockDb) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // sem armazenamento
  }
}

const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 220));

function titleFor(wins: number): TitleId {
  if (wins >= 150) return 'lenda';
  if (wins >= 60) return 'estrela';
  if (wins >= 25) return 'protagonista';
  if (wins >= 10) return 'coadjuvante';
  if (wins >= 3) return 'duble';
  return 'figurante';
}

function stars(r: Rarity): 1 | 2 | 3 | 4 {
  return r === 'common' ? 1 : r === 'rare' ? 2 : r === 'epic' ? 3 : 4;
}

function finishResult(db: MockDb, m: MockMatch, status: BountyResult['status'], place: number): BountyResult {
  const before = db.free.wins + db.bounty.wins;
  db.bounty.matches += 1;
  if (status === 'won') db.bounty.wins += 1;
  const captured = m.state.capturedHand != null;
  db.lossStreak = captured ? 0 : db.lossStreak + 1;
  const wins = db.free.wins + db.bounty.wins;
  const prize = PRIZES.find((p) => p.id === m.prizeId);
  const marks: string[] = [];
  if (status === 'won' && db.bounty.wins === 1) marks.push('poker-first-win');
  if (m.state.eliminatedBy?.fincher === 'human') marks.push('poker-fox-hunter');
  return {
    status, place, prizeCaptured: captured, prize, seed: m.seed, seedHash: 'mock', marks,
    title: { wins, id: titleFor(wins), rankUp: titleFor(wins) !== titleFor(before) },
  };
}

export const mockApi: PokerApiLike = {
  async getHome(): Promise<PokerHome> {
    await latency();
    const db = load();
    const day = today();
    const p = prizeOf(day);
    const owned = db.owned.includes(p.id) && !p.repeatable;
    const prize = owned ? PRIZES[2] : p;
    const tomorrow = prizeOf(new Date(Date.now() + 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10));
    const wins = db.free.wins + db.bounty.wins;
    return {
      enabled: POKER_PREVIEW,
      proto_min: 1,
      bounty: {
        day, ends_at: endsAt(day), prize, is_reserve: false, is_fallback: owned, carrier: owned ? PRIZES[2].carrier : p.carrier,
        stars: stars(prize.rarity), attempts_used: db.attempts[day] ?? 0, max_attempts: 3, won_today: !!db.wonDay[day],
        loan_next: db.lossStreak >= 3, friends_won: 2, tomorrow: { rarity: tomorrow.rarity, carrier: tomorrow.carrier },
        active: db.active && db.active.status === 'active'
          ? { match_id: db.active.id, hand: db.active.state.game.handNumber, seq: db.active.seq }
          : null,
      },
      player: {
        age_confirmed: db.ageConfirmed, age_gate_all: false, tutorial_done: db.tutorialDone, tutorial_chip: db.tutorialChip,
        story: db.story, lifetime_matches: db.free.matches + db.bounty.matches, last_played_at: null,
      },
      stats: { free: { ...db.free }, bounty: { ...db.bounty } },
      title: { wins, id: titleFor(wins) },
      loadout: db.loadout,
      owned_items: db.owned,
      marks: [],
      tickets: db.tickets,
    };
  },

  async confirmAge() {
    await latency();
    const db = load();
    db.ageConfirmed = true;
    save(db);
  },

  async claimTutorialChip() {
    await latency();
    const db = load();
    const granted = !db.tutorialChip;
    db.tutorialChip = true;
    db.tutorialDone = true;
    if (granted) db.tickets += 1;
    save(db);
    return { granted, tickets: db.tickets };
  },

  async markStory(keys: string[]) {
    const db = load();
    const now = new Date().toISOString();
    keys.forEach((k) => {
      db.story[k] = now;
    });
    save(db);
  },

  async equip(slot, itemId) {
    await latency();
    const db = load();
    db.loadout = { ...db.loadout, [slot]: itemId };
    save(db);
  },

  async reportFreeMatch(s: MatchSummary) {
    await latency();
    const db = load();
    if (!db.reported.includes(s.clientId)) {
      db.reported = [...db.reported.slice(-50), s.clientId];
      db.free.matches += 1;
      if (s.place === 1) db.free.wins += 1;
      save(db);
    }
    const wins = db.free.wins + db.bounty.wins;
    return { ok: true, wins, title: titleFor(wins) };
  },

  async intervalPick(): Promise<IntervalPick | null> {
    await latency();
    return { movie_id: 598, media_type: 'movie', title: 'City of God', title_pt: 'Cidade de Deus', poster_path: null, oracle: 'bogart' };
  },

  bounty: {
    async start(day: string, prizeId: string): Promise<BountyStart> {
      await latency();
      const db = load();
      if (day !== today()) throw new PokerClientError(409, 'stale_day');
      const p = prizeOf(day);
      const eff = db.owned.includes(p.id) && !p.repeatable ? PRIZES[2] : p;
      if (eff.id !== prizeId) throw new PokerClientError(409, 'prize_changed', { prize: eff });
      if (!db.ageConfirmed) throw new PokerClientError(403, 'age_required');
      if (db.wonDay[day]) throw new PokerClientError(403, 'won_today');
      if ((db.attempts[day] ?? 0) >= 3) throw new PokerClientError(403, 'limit');
      if (db.active && db.active.status === 'active') throw new PokerClientError(409, 'active_exists', { matchId: db.active.id });
      if (db.tickets < 1) throw new PokerClientError(402, 'no_chips');
      const loan = db.lossStreak >= 3 ? 500 : 0;
      const seed = randomSeed();
      const cfg = buildConfig({ mode: 'bounty', seed, home: null, loan, prize: { prizeId: eff.id, carrierId: eff.carrier, rarity: eff.rarity } });
      const step = createMatch(cfg);
      const events = toPublicEvents(step.events, 'human');
      db.tickets -= 1;
      db.attempts[day] = (db.attempts[day] ?? 0) + 1;
      db.active = { id: uuid(), day, seq: 1, seed, prizeId: eff.id, state: step.state, tail: events.slice(-60), status: 'active' };
      save(db);
      return {
        ok: true, matchId: db.active.id, seq: 1, seedHash: 'mock', attempt: db.attempts[day], loan, prize: eff, carrier: eff.carrier,
        stars: stars(eff.rarity), events, view: tableView(step.state, 'human'),
      };
    },

    async act(matchId, seq, idem, action: PlayerAction, show) {
      await latency();
      const db = load();
      const m = db.active;
      if (!m || m.id !== matchId) throw new PokerClientError(404, 'not_found');
      if (m.status !== 'active') throw new PokerClientError(410, 'finished', { result: m.result });
      if (seq === m.seq - 1 && idem === m.lastIdem && m.lastResponse) return m.lastResponse;
      if (seq !== m.seq) throw new PokerClientError(409, 'stale', { seq: m.seq, view: tableView(m.state, 'human'), recent: m.tail.slice(-20) });
      let step;
      try {
        step = applyHumanAction(m.state, action, { show: show === true });
      } catch (e) {
        if ((e as Error)?.name === 'PokerRuleError') throw new PokerClientError(422, 'illegal', { view: tableView(m.state, 'human') });
        throw e;
      }
      const out = outcomeOf(m.state, step.state);
      const events = toPublicEvents(step.events, 'human');
      m.state = step.state;
      m.tail = [...m.tail, ...events].slice(-60);
      m.seq += 1;
      if (out.captured) {
        db.wonDay[m.day] = true;
        const pr = PRIZES.find((p) => p.id === m.prizeId);
        if (pr?.kind === 'tickets') db.tickets += Number((pr.payload as { amount?: number })?.amount ?? 0);
        else if (pr && !db.owned.includes(pr.id)) db.owned.push(pr.id);
      }
      let result: BountyResult | undefined;
      if (out.finished) {
        m.status = out.finished.status === 'won' ? 'won' : out.finished.status === 'forfeit' ? 'forfeit' : 'lost';
        result = finishResult(db, m, out.finished.status, out.finished.place);
        m.result = result;
      }
      const response: BountyAct = { ok: true, seq: m.seq, events, view: tableView(step.state, 'human'), result };
      m.lastIdem = idem;
      m.lastResponse = response;
      save(db);
      return response;
    },

    async forfeit(matchId) {
      await latency();
      const db = load();
      const m = db.active;
      if (!m || m.id !== matchId) throw new PokerClientError(404, 'not_found');
      if (m.status !== 'active') throw new PokerClientError(410, 'finished', { result: m.result });
      const step = forfeitMatch(m.state);
      const out = outcomeOf(m.state, step.state);
      m.state = step.state;
      m.status = 'forfeit';
      const result = finishResult(db, m, 'forfeit', out.finished?.place ?? 4);
      m.result = result;
      save(db);
      return result;
    },

    async resume(matchId?: string): Promise<BountyResume> {
      await latency();
      const db = load();
      const m = db.active;
      if (!m || (matchId && m.id !== matchId)) throw new PokerClientError(404, 'none');
      const prize = PRIZES.find((p) => p.id === m.prizeId) ?? PRIZES[2];
      return {
        ok: true, matchId: m.id, seq: m.seq, seedHash: 'mock', prize, carrier: m.state.config.prize?.carrierId ?? prize.carrier,
        stars: stars(prize.rarity), loan: m.state.config.loan, view: tableView(m.state, 'human'), recent: m.tail,
        result: m.status === 'active' ? undefined : m.result,
      };
    },
  },
};
