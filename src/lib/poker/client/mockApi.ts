/**
 * `PokerApi` falso (SPEC §4.9 e §8): roda a partida valendo com a camada de partida
 * local, guardando tudo em `poker.mock.v2`, para o fluxo inteiro funcionar sem servidor.
 *
 * 03/11/2026 (tarde, Pôster Poker): espelha o `get_poker_home()` novo (torneio da semana,
 * coleção dos 9 pôsteres, vitrine da Cobra) e a Edge `proto: 2` (entrada com fichas ou
 * pôster, erros novos, `rewards` no fim). Os efeitos vêm do próprio motor (pacote E):
 * basta a partida ter `config.tournament`.
 *
 * Alavancas da prévia (localStorage): `poker.mock.week` = um efeito (força o pôster da
 * semana), `poker.mock.castAt` = mão da 1ª lançada, `poker.mock.cobra = 1` (a Cobra traz
 * um item), `poker.mock.edge404 = 1` (Edge ainda não publicada).
 *
 * Só para a prévia e para o desenvolvimento: não concede nada de verdade.
 */
import type { PlayerAction } from '../engine.ts';
import type { MatchState, MatchSummary, PosterEffectId, PublicEvent, Rarity, TitleId } from '../types.ts';
import { DEFAULT_DIFFICULTY } from '../config.ts';
import { applyHumanAction, createMatch, forfeitMatch, outcomeOf, tableView, toPublicEvents } from '../match/match.ts';
import type { BountyAct, BountyResult, BountyResume, BountyStart, IntervalPick, PokerApiLike, PokerHome, PokerPrize } from './apiTypes.ts';
import { PokerClientError } from './apiTypes.ts';
import { buildConfig } from './matchConfig.ts';
import { randomSeed, uuid } from './freeStore.ts';
import { POKER_PREVIEW } from './flags.ts';
import {
  CYCLE,
  ENTRY_CHIPS,
  POSTER_POKER,
  STARS,
  cycleIndex,
  nextWeekOf,
  posterDef,
  weekEndsAt,
  weekOf,
  type CobraItem,
  type StakeOption,
  type TournamentPrize,
  type TournamentRewards,
  type TournamentStake,
} from './tournament.ts';

const KEY = 'poker.mock.v2';

interface MockMatch {
  id: string;
  week: string;
  day: string;
  seq: number;
  seed: string;
  prize: TournamentPrize;
  stake: TournamentStake;
  cobra: CobraItem | null;
  state: MatchState;
  tail: PublicEvent[];
  status: 'active' | 'won' | 'lost' | 'forfeit';
  result?: BountyResult;
  rewards?: TournamentRewards;
  lastIdem?: string;
  lastResponse?: BountyAct;
}

interface MockPoster extends StakeOption {
  lost?: boolean;
}

interface MockDb {
  v: 2;
  tickets: number;
  ageConfirmed: boolean;
  tutorialDone: boolean;
  tutorialChip: boolean;
  story: Record<string, string>;
  /** Entradas no torneio por dia de Brasília. */
  attempts: Record<string, number>;
  wonWeek: Record<string, boolean>;
  /** Efeitos dos pôsteres do Pôster Poker que a pessoa tem (o gold). */
  ppOwned: PosterEffectId[];
  /** A coleção do Jackpot (o que dá para apostar). */
  posters: MockPoster[];
  lossStreak: number;
  free: { matches: number; wins: number };
  bounty: { matches: number; wins: number };
  reported: string[];
  loadout: { deck: string; table: string; quips: string };
  owned: string[];
  active: MockMatch | null;
}

// Pôsteres de exemplo da coleção do Jackpot (arquivos reais do TMDB).
const SAMPLE_POSTERS: MockPoster[] = [
  { item_id: 12, effect: 'none', title: 'Clube da Luta', title_en: 'Fight Club', year: 1999, file_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', serial: 12, rarity: 'common' },
  { item_id: 14, effect: 'holo', title: 'Pulp Fiction', title_en: 'Pulp Fiction', year: 1994, file_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', serial: 14, rarity: 'common' },
  { item_id: 21, effect: 'none', title: 'Parasita', title_en: 'Parasite', year: 2019, file_path: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', serial: 21, rarity: 'rare' },
  { item_id: 23, effect: 'negative', title: 'Interestelar', title_en: 'Interstellar', year: 2014, file_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', serial: 23, rarity: 'rare' },
  { item_id: 31, effect: 'none', title: 'O Cavaleiro das Trevas', title_en: 'The Dark Knight', year: 2008, file_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg', serial: 11, rarity: 'epic' },
  { item_id: 41, effect: 'ultra_red', title: 'O Poderoso Chefão', title_en: 'The Godfather', year: 1972, file_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', serial: 3, rarity: 'legendary' },
];

// O item secreto que a Cobra traz quando a prévia pede (o catálogo de verdade está vazio).
const COBRA_SAMPLE: CobraItem = { id: 'deck-noir', name: 'Baralho Noir', kind: 'deck' };

function today(): string {
  // Dia de Brasília (UTC−3), como o servidor (§2.6).
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

function knob(key: string): string | null {
  try {
    return window.localStorage.getItem(`poker.mock.${key}`);
  } catch {
    return null;
  }
}

function weekPrize(week: string): TournamentPrize {
  const forced = knob('week') as PosterEffectId | null;
  const def = posterDef(forced && CYCLE.includes(forced) ? forced : CYCLE[cycleIndex(week)]) ?? POSTER_POKER[0];
  return {
    id: def.id,
    item_id: 100 + POSTER_POKER.indexOf(def),
    rarity: def.rarity,
    serial: def.serial,
    title: def.titlePt,
    title_en: def.titleEn,
    year: def.year,
    file_path: def.filePath,
    effect_id: def.effect,
  };
}

// O prêmio no formato antigo (poker_prize_json), que o start/resume ainda mandam.
function legacyPrize(p: TournamentPrize): PokerPrize {
  return {
    id: p.id, kind: 'poster', rarity: p.rarity, name_pt: p.title, name_en: p.title_en ?? p.title, article_pt: 'o', image: p.file_path,
    payload: { item_id: p.item_id, effect: 'gold', poster: { file_path: p.file_path, effect: 'gold', serial: p.serial } }, repeatable: false,
  };
}

function blankDb(): MockDb {
  return {
    v: 2, tickets: 7, ageConfirmed: false, tutorialDone: false, tutorialChip: false, story: {}, attempts: {}, wonWeek: {}, ppOwned: [],
    posters: SAMPLE_POSTERS.map((p) => ({ ...p })), lossStreak: 0, free: { matches: 0, wins: 0 }, bounty: { matches: 0, wins: 0 }, reported: [],
    loadout: { deck: 'deck-classico', table: 'table-feltro-verde', quips: 'quips-padrao' }, owned: [], active: null,
  };
}

function load(): MockDb {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      if (db?.v === 2) return { ...blankDb(), ...db };
    }
  } catch {
    // começa do zero
  }
  return blankDb();
}

function save(db: MockDb) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // sem armazenamento
  }
}

const latency = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 220));

// Só na prévia: `poker.mock.edge404 = 1` imita a Edge Function ainda não publicada.
const edgeMissing = () => knob('edge404') === '1';

function titleFor(wins: number): TitleId {
  if (wins >= 150) return 'lenda';
  if (wins >= 60) return 'estrela';
  if (wins >= 25) return 'protagonista';
  if (wins >= 10) return 'coadjuvante';
  if (wins >= 3) return 'duble';
  return 'figurante';
}

function stakeOptions(db: MockDb, rarity: Rarity): StakeOption[] {
  const staked = db.active && db.active.status === 'active' && db.active.stake.kind === 'poster' ? db.active.stake : null;
  return db.posters
    .filter((p) => !p.lost && p.rarity === rarity && !(staked && staked.kind === 'poster' && staked.itemId === p.item_id && staked.effect === p.effect))
    .map((p) => {
      const o: StakeOption & { lost?: boolean } = { ...p };
      delete o.lost;
      return o;
    });
}

function tournamentJson(m: MockMatch) {
  return {
    week: m.week, prize: m.prize, effect: m.prize.effect_id, rarity: m.prize.rarity, cobraItem: !!m.cobra,
    stake: m.stake.kind === 'chips' ? { kind: 'chips', amount: ENTRY_CHIPS[m.prize.rarity] } : { kind: 'poster', item_id: m.stake.itemId, effect: m.stake.effect },
  };
}

// O fim da partida: o pôster dourado e o item da Cobra para quem venceu; o pôster
// apostado volta (vitória) ou fica na mesa (derrota).
function finish(db: MockDb, m: MockMatch, status: BountyResult['status'], place: number): BountyResult {
  const before = db.free.wins + db.bounty.wins;
  db.bounty.matches += 1;
  const won = status === 'won' && place === 1;
  if (won) db.bounty.wins += 1;
  db.lossStreak = won ? 0 : db.lossStreak + 1;
  const rewards: TournamentRewards = {};
  if (won) {
    if (!db.ppOwned.includes(m.prize.effect_id)) db.ppOwned.push(m.prize.effect_id);
    db.wonWeek[m.week] = true;
    rewards.poster = { prizeId: m.prize.id, itemId: m.prize.item_id, title: m.prize.title, filePath: m.prize.file_path, serial: m.prize.serial, rarity: m.prize.rarity };
    rewards.cobraItem = m.cobra;
    rewards.cobraRevealed = null;
  } else {
    rewards.cobraItem = null;
    rewards.cobraRevealed = m.cobra;
  }
  if (m.stake.kind === 'chips') rewards.stake = { kind: 'chips', amount: ENTRY_CHIPS[m.prize.rarity] };
  else {
    const st = m.stake;
    const p = db.posters.find((x) => x.item_id === st.itemId && x.effect === st.effect);
    if (p && !won) p.lost = true;
    rewards.stake = { kind: 'poster', itemId: st.itemId, effect: st.effect, title: p?.title ?? '', filePath: p?.file_path ?? '', lost: !won };
  }
  const wins = db.free.wins + db.bounty.wins;
  const marks: string[] = [];
  if (won && db.bounty.wins === 1) marks.push('poker-first-win');
  if (won && m.stake.kind === 'poster') marks.push('poker-high-stakes');
  if (m.state.eliminatedBy?.fincher === 'human') marks.push('poker-fox-hunter');
  m.rewards = rewards;
  return {
    status, place, prizeCaptured: won, prize: legacyPrize(m.prize), seed: m.seed, seedHash: 'mock', marks,
    title: { wins, id: titleFor(wins), rankUp: titleFor(wins) !== titleFor(before) },
    ...({ rewards } as object),
  } as BountyResult;
}

export const mockApi: PokerApiLike = {
  async getHome(): Promise<PokerHome> {
    await latency();
    const db = load();
    const week = weekOf();
    const day = today();
    const prize = weekPrize(week);
    const wins = db.free.wins + db.bounty.wins;
    const active = db.active && db.active.status === 'active' ? db.active : null;
    const home = {
      enabled: POKER_PREVIEW,
      open: POKER_PREVIEW,
      proto_min: 2,
      bounty: null,
      tournament: {
        week, ends_at: weekEndsAt(week), prize, entry_chips: ENTRY_CHIPS[prize.rarity], chips: db.tickets,
        attempts_used: db.attempts[day] ?? 0, max_attempts: 3, owned: db.ppOwned.includes(prize.effect_id), won_this_week: !!db.wonWeek[week],
        active_match: active
          ? { match_id: active.id, week: active.week, hand: active.state.game.handNumber, seq: active.seq, prize_id: active.prize.id,
              stake: active.stake.kind === 'chips' ? { kind: 'chips', amount: ENTRY_CHIPS[active.prize.rarity] } : { kind: 'poster', item_id: active.stake.itemId, effect: active.stake.effect } }
          : null,
        stake_options: stakeOptions(db, prize.rarity), cobra_pool: 0, stars: STARS[prize.rarity], loan_next: db.lossStreak >= 3,
      },
      collection: POSTER_POKER.map((p, i) => ({
        id: p.id, item_id: 100 + i, rarity: p.rarity, serial: p.serial, title: p.titlePt, title_en: p.titleEn, year: p.year, file_path: p.filePath,
        effect_id: p.effect, owned: db.ppOwned.includes(p.effect), next_week: p.effect === prize.effect_id ? week : nextWeekOf(p.effect, week),
        this_week: p.effect === prize.effect_id,
      })),
      cobra_items: [],
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
    return home as unknown as PokerHome;
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
    // proto 2: start(week, prizeId, stake).
    async start(week: string, prizeId: string, stake?: TournamentStake): Promise<BountyStart> {
      await latency();
      if (edgeMissing()) throw new PokerClientError(404, 'http_404');
      const db = load();
      const cur = weekOf();
      const prize = weekPrize(cur);
      const day = today();
      if (week !== cur) throw new PokerClientError(409, 'stale_week', { tournament: { week: cur, prize } });
      if (prizeId !== prize.id) throw new PokerClientError(409, 'prize_changed', { prize });
      if (!db.ageConfirmed) throw new PokerClientError(403, 'age_required');
      if (db.ppOwned.includes(prize.effect_id)) throw new PokerClientError(403, 'owned');
      if (db.wonWeek[cur]) throw new PokerClientError(403, 'won_this_week');
      if ((db.attempts[day] ?? 0) >= 3) throw new PokerClientError(403, 'attempts', { attempts_used: db.attempts[day], max_attempts: 3 });
      if (db.active && db.active.status === 'active') throw new PokerClientError(409, 'active_exists', { matchId: db.active.id });
      const entry: TournamentStake = stake ?? { kind: 'chips' };
      const need = ENTRY_CHIPS[prize.rarity];
      if (entry.kind === 'chips') {
        if (db.tickets < need) throw new PokerClientError(402, 'no_chips', { need, have: db.tickets });
      } else if (!stakeOptions(db, prize.rarity).some((o) => o.item_id === entry.itemId && o.effect === entry.effect)) {
        throw new PokerClientError(400, 'stake_invalid', { reason: 'rarity' });
      }
      const loan = db.lossStreak >= 3 ? 500 : 0;
      const seed = randomSeed();
      const cfg = buildConfig({ mode: 'bounty', seed, home: null, loan, prize: null });
      cfg.difficulty = cfg.settings.difficulty?.[prize.rarity] ?? DEFAULT_DIFFICULTY[prize.rarity];
      const cobra = knob('cobra') === '1' ? COBRA_SAMPLE : null;
      cfg.tournament = { prizeId: prize.id, rarity: prize.rarity, effect: prize.effect_id, cobraItem: !!cobra };
      // Prévia: a 1ª lançada cedo, para ver o efeito sem jogar 9 mãos.
      const castAt = Number(knob('castAt'));
      if (castAt > 0) {
        cfg.settings = { ...cfg.settings, effects: { [prize.effect_id]: { firstHand: [castAt, castAt], gapHands: 3, spread: 0 } } as never };
      }
      const step = createMatch(cfg);
      const events = toPublicEvents(step.events, 'human');
      if (entry.kind === 'chips') db.tickets -= need;
      db.attempts[day] = (db.attempts[day] ?? 0) + 1;
      db.active = { id: uuid(), week: cur, day, seq: 1, seed, prize, stake: entry, cobra, state: step.state, tail: events.slice(-60), status: 'active' };
      save(db);
      const out = {
        ok: true, matchId: db.active.id, seq: 1, seedHash: 'mock', attempt: db.attempts[day], loan, prize: legacyPrize(prize), carrier: null,
        stars: STARS[prize.rarity], events, view: tableView(step.state, 'human'), tickets: db.tickets,
        tournament: { ...tournamentJson(db.active), attemptsUsed: db.attempts[day], maxAttempts: 3 },
      };
      return out as unknown as BountyStart;
    },

    async act(matchId, seq, idem, action: PlayerAction, show) {
      await latency();
      const db = load();
      const m = db.active;
      if (!m || m.id !== matchId) throw new PokerClientError(404, 'not_found');
      if (m.status !== 'active') throw new PokerClientError(410, 'finished', { result: m.result, rewards: m.rewards });
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
      let result: BountyResult | undefined;
      if (out.finished) {
        m.status = out.finished.status === 'won' ? 'won' : out.finished.status === 'forfeit' ? 'forfeit' : 'lost';
        result = finish(db, m, out.finished.status, out.finished.place);
        m.result = result;
      }
      const response = { ok: true, seq: m.seq, events, view: tableView(step.state, 'human'), result, ...(result ? { rewards: m.rewards } : {}) } as BountyAct;
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
      if (m.status !== 'active') throw new PokerClientError(410, 'finished', { result: m.result, rewards: m.rewards });
      const step = forfeitMatch(m.state);
      const out = outcomeOf(m.state, step.state);
      m.state = step.state;
      m.status = 'forfeit';
      const result = finish(db, m, 'forfeit', out.finished?.place ?? 4);
      m.result = result;
      save(db);
      return result;
    },

    async resume(matchId?: string): Promise<BountyResume> {
      await latency();
      if (edgeMissing()) throw new PokerClientError(404, 'http_404');
      const db = load();
      const m = db.active;
      if (!m || (matchId && m.id !== matchId)) throw new PokerClientError(404, 'none');
      const out = {
        ok: true, matchId: m.id, seq: m.seq, seedHash: 'mock', prize: legacyPrize(m.prize), carrier: null, stars: STARS[m.prize.rarity],
        loan: m.state.config.loan, view: tableView(m.state, 'human'), recent: m.tail, tournament: tournamentJson(m),
        result: m.status === 'active' ? undefined : m.result, ...(m.status === 'active' ? {} : { rewards: m.rewards }),
      };
      return out as unknown as BountyResume;
    },
  },
};
