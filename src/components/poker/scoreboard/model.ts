import type { PokerTeaserPrize } from '../../../lib/posterJackpot';
import { MARKS, toPrizeView } from '../jackpot/pokerMeta';

// O placar do Grande Blefe (03/11/2026): leitura defensiva do JSON de
// get_poker_scoreboard (migração 20261103062000) e as contas que a tela
// mostra. Campo faltando vira zero; nada aqui lança erro.

// Número no formato do idioma (1.240 / 1,240), com casas decimais fixas.
export const fmt = (value: number, lang: string, digits = 0) =>
  value.toLocaleString(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits });

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {});
const n = (value: unknown) => {
  const v = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(v) ? v : 0;
};

export interface BestHand {
  cards: string[];
  kind: string;
  score: number;
}

export interface Stats {
  matches: number;
  wins: number;
  podiums: number;
  placeSum: number;
  forfeits: number;
  loans: number;
  hands: number;
  handsWon: number;
  vpip: number;
  pfr: number;
  aggrBets: number;
  aggrCalls: number;
  cbetOpp: number;
  cbet: number;
  showdowns: number;
  showdownsWon: number;
  allinCount: number;
  allinWon: number;
  allinExpectedMilli: number;
  bluffsWorked: number;
  badBeatsSuffered: number;
  badBeatsDealt: number;
  comebackWins: number;
  prizesWon: number;
  streak: number;
  bestStreak: number;
  biggestPot: number;
  bestHand: BestHand | null;
  // Você × cada oráculo: quantas vezes você o eliminou e ele te eliminou.
  vs: Record<string, { elim: number; elimBy: number }>;
}

export type MatchStatus = 'won' | 'lost' | 'forfeit' | 'abandoned' | 'active' | 'void';

export interface RecentMatch {
  key: string;
  mode: 'free' | 'bounty';
  at: string;
  place: number | null;
  status: MatchStatus;
  hands: number;
  loan: boolean;
  prize: PokerTeaserPrize | null;
  captured: boolean;
}

export interface MarkView {
  tagId: string;
  key: (typeof MARKS)[number]['key'];
  name: string;
  emoji: string;
  description: string | null;
  requirement: string | null;
  unlockedAt: string | null;
}

export interface PrizeWon {
  key: string;
  prize: PokerTeaserPrize;
  day: string | null;
}

export interface ScoreboardData {
  free: Stats;
  bounty: Stats;
  titleWins: number;
  titleId: string | null;
  recent: RecentMatch[];
  prizes: PrizeWon[];
  marks: MarkView[];
  friendsWonToday: number;
}

const CARD_RE = /^[2-9TJQKA][shdc]$/;

function parseBestHand(value: unknown): BestHand | null {
  const r = asRow(value);
  const cards = Array.isArray(r.cards) ? r.cards.filter((c): c is string => typeof c === 'string' && CARD_RE.test(c)) : [];
  if (!cards.length || typeof r.kind !== 'string') return null;
  return { cards: cards.slice(0, 5), kind: r.kind, score: n(r.score) };
}

export function parseStats(value: unknown): Stats {
  const r = asRow(value);
  const vsRaw = asRow(r.vs);
  const vs: Stats['vs'] = {};
  Object.entries(vsRaw).forEach(([id, entry]) => {
    const e = asRow(entry);
    vs[id] = { elim: n(e.elim), elimBy: n(e.elim_by) };
  });
  return {
    matches: n(r.matches),
    wins: n(r.wins),
    podiums: n(r.podiums),
    placeSum: n(r.place_sum),
    forfeits: n(r.forfeits),
    loans: n(r.loans),
    hands: n(r.hands),
    handsWon: n(r.hands_won),
    vpip: n(r.vpip),
    pfr: n(r.pfr),
    aggrBets: n(r.aggr_bets),
    aggrCalls: n(r.aggr_calls),
    cbetOpp: n(r.cbet_opp),
    cbet: n(r.cbet),
    showdowns: n(r.showdowns),
    showdownsWon: n(r.showdowns_won),
    allinCount: n(r.allin_count),
    allinWon: n(r.allin_won),
    allinExpectedMilli: n(r.allin_expected_milli),
    bluffsWorked: n(r.bluffs_worked),
    badBeatsSuffered: n(r.bad_beats_suffered),
    badBeatsDealt: n(r.bad_beats_dealt),
    comebackWins: n(r.comeback_wins),
    prizesWon: n(r.prizes_won),
    streak: n(r.streak),
    bestStreak: n(r.best_streak),
    biggestPot: n(r.biggest_pot),
    bestHand: parseBestHand(r.best_hand),
    vs,
  };
}

// Livre + prêmio, para o filtro "Geral". Sequência atual vem das partidas
// recentes (cada modo guarda a sua); a melhor é a maior das duas.
export function mergeStats(a: Stats, b: Stats): Stats {
  const sum = (k: keyof Stats) => (a[k] as number) + (b[k] as number);
  const vs: Stats['vs'] = {};
  [a.vs, b.vs].forEach((side) =>
    Object.entries(side).forEach(([id, v]) => {
      vs[id] = { elim: (vs[id]?.elim ?? 0) + v.elim, elimBy: (vs[id]?.elimBy ?? 0) + v.elimBy };
    })
  );
  const bestHand = !a.bestHand ? b.bestHand : !b.bestHand ? a.bestHand : a.bestHand.score >= b.bestHand.score ? a.bestHand : b.bestHand;
  return {
    matches: sum('matches'),
    wins: sum('wins'),
    podiums: sum('podiums'),
    placeSum: sum('placeSum'),
    forfeits: sum('forfeits'),
    loans: sum('loans'),
    hands: sum('hands'),
    handsWon: sum('handsWon'),
    vpip: sum('vpip'),
    pfr: sum('pfr'),
    aggrBets: sum('aggrBets'),
    aggrCalls: sum('aggrCalls'),
    cbetOpp: sum('cbetOpp'),
    cbet: sum('cbet'),
    showdowns: sum('showdowns'),
    showdownsWon: sum('showdownsWon'),
    allinCount: sum('allinCount'),
    allinWon: sum('allinWon'),
    allinExpectedMilli: sum('allinExpectedMilli'),
    bluffsWorked: sum('bluffsWorked'),
    badBeatsSuffered: sum('badBeatsSuffered'),
    badBeatsDealt: sum('badBeatsDealt'),
    comebackWins: sum('comebackWins'),
    prizesWon: sum('prizesWon'),
    streak: 0,
    bestStreak: Math.max(a.bestStreak, b.bestStreak),
    biggestPot: Math.max(a.biggestPot, b.biggestPot),
    bestHand,
    vs,
  };
}

const STATUSES: MatchStatus[] = ['won', 'lost', 'forfeit', 'abandoned', 'active', 'void'];

function parseRecent(raw: Row): RecentMatch[] {
  const free = (Array.isArray(raw.recent_free) ? raw.recent_free : []).map((entry, i): RecentMatch => {
    const r = asRow(entry);
    const summary = asRow(r.summary);
    const place = n(r.place) || null;
    const reason = summary.reason;
    const status: MatchStatus = place === 1 ? 'won' : reason === 'forfeit' ? 'forfeit' : reason === 'abandoned' ? 'abandoned' : 'lost';
    return {
      key: `f${typeof r.client_id === 'string' ? r.client_id : i}`,
      mode: 'free',
      at: typeof r.played_at === 'string' ? r.played_at : '',
      place,
      status,
      hands: n(r.hands),
      loan: r.loan === true,
      prize: null,
      captured: false,
    };
  });
  const bounty = (Array.isArray(raw.recent_bounty) ? raw.recent_bounty : []).map((entry, i): RecentMatch => {
    const r = asRow(entry);
    const status = STATUSES.includes(r.status as MatchStatus) ? (r.status as MatchStatus) : 'lost';
    return {
      key: `b${typeof r.id === 'string' ? r.id : i}`,
      mode: 'bounty',
      at: typeof r.finished_at === 'string' ? r.finished_at : typeof r.created_at === 'string' ? r.created_at : '',
      place: n(r.place) || null,
      status,
      hands: n(r.hands),
      loan: r.loan === true,
      prize: toPrizeView(r.prize),
      captured: r.captured_hand !== null && r.captured_hand !== undefined,
    };
  });
  return [...free, ...bounty].filter((m) => m.status !== 'void').sort((x, y) => (y.at > x.at ? 1 : y.at < x.at ? -1 : 0));
}

export function parseScoreboard(value: unknown): ScoreboardData | null {
  const raw = asRow(value);
  if (raw.enabled !== true) return null;
  const stats = asRow(raw.stats);
  const title = asRow(raw.title);
  const markRows = (Array.isArray(raw.marks) ? raw.marks : []).map(asRow);
  // As 9 tags do Pôster Poker sempre aparecem (silhueta quando faltam); o banco
  // completa a descrição e a data.
  const marks: MarkView[] = MARKS.map((mark) => {
    const row = markRows.find((r) => r.tag_id === mark.tagId) ?? {};
    return {
      tagId: mark.tagId,
      key: mark.key,
      // Adendo de 03/11/2026: nome e emoji são os da tabela nova (tags da categoria
      // Jogos), mesmo que o banco ainda tenha os antigos.
      name: mark.name,
      emoji: mark.emoji,
      description: typeof row.description_pt === 'string' ? row.description_pt : null,
      requirement: typeof row.requirement_pt === 'string' ? row.requirement_pt : null,
      unlockedAt: typeof row.unlocked_at === 'string' ? row.unlocked_at : null,
    };
  });
  const prizes: PrizeWon[] = (Array.isArray(raw.prizes) ? raw.prizes : [])
    .map((entry, i) => {
      const r = asRow(entry);
      const prize = toPrizeView(r.prize);
      return prize ? { key: `${prize.id}:${typeof r.granted_at === 'string' ? r.granted_at : i}`, prize, day: typeof r.day === 'string' ? r.day : null } : null;
    })
    .filter((p): p is PrizeWon => !!p);
  return {
    free: parseStats(stats.free),
    bounty: parseStats(stats.bounty),
    titleWins: n(title.wins),
    titleId: typeof title.id === 'string' ? title.id : null,
    recent: parseRecent(raw),
    prizes,
    marks,
    friendsWonToday: n(raw.friends_won_today),
  };
}

// Sequência atual a partir das partidas mais recentes (terminadas).
export function currentStreak(recent: RecentMatch[]): number {
  let count = 0;
  for (const match of recent) {
    if (match.status === 'active') continue;
    if (match.place === 1) count += 1;
    else break;
  }
  return count;
}

// Colocações exatas a partir de partidas, vitórias (1º), pódios (1º + 2º) e
// a soma das colocações: 3º e 4º saem de duas equações. Sem mais nenhum dado.
export function placements(s: Stats): [number, number, number, number] {
  const first = Math.max(0, s.wins);
  const second = Math.max(0, s.podiums - s.wins);
  const fourth = Math.max(0, s.placeSum + 2 * s.wins + (s.podiums - s.wins) - 3 * s.matches);
  const third = Math.max(0, s.matches - first - second - fourth);
  return [first, second, third, fourth];
}

// Números de jogador (§7.7 item 8): valor, faixa normal numa mesa de 4 e a
// amostra mínima para o número dizer alguma coisa.
export interface PlayerNumber {
  key: 'vpip' | 'pfr' | 'af' | 'cbet' | 'wtsd' | 'wsd' | 'place';
  value: number | null;
  // Escala do trilho e a faixa normal (na unidade do valor).
  min: number;
  max: number;
  band: [number, number];
  unit: '%' | 'x' | 'º';
}

const ratio = (a: number, b: number, minSample: number) => (b >= minSample && b > 0 ? a / b : null);

export function playerNumbers(s: Stats): PlayerNumber[] {
  const pct = (v: number | null) => (v === null ? null : v * 100);
  return [
    { key: 'vpip', value: pct(ratio(s.vpip, s.hands, 20)), min: 0, max: 100, band: [25, 38], unit: '%' },
    { key: 'pfr', value: pct(ratio(s.pfr, s.hands, 20)), min: 0, max: 100, band: [15, 28], unit: '%' },
    { key: 'af', value: ratio(s.aggrBets, s.aggrCalls, 8), min: 0, max: 5, band: [1.5, 3], unit: 'x' },
    { key: 'cbet', value: pct(ratio(s.cbet, s.cbetOpp, 5)), min: 0, max: 100, band: [55, 75], unit: '%' },
    { key: 'wtsd', value: pct(ratio(s.showdowns, s.hands, 20)), min: 0, max: 40, band: [8, 16], unit: '%' },
    { key: 'wsd', value: pct(ratio(s.showdownsWon, s.showdowns, 5)), min: 0, max: 100, band: [47, 57], unit: '%' },
    { key: 'place', value: ratio(s.placeSum, s.matches, 3), min: 1, max: 4, band: [2.3, 2.7], unit: 'º' },
  ];
}
