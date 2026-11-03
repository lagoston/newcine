/**
 * Pôster Poker (03/11/2026, tarde): o torneio da semana, a coleção dos 9 pôsteres e a
 * entrada (fichas ou um pôster apostado), do jeito que a interface recebe do servidor.
 *
 * Os tipos espelham o `get_poker_home()` e a Edge `proto: 2` do BRIEF2. O pacote F
 * escreve os dele em `apiTypes.ts`/`pokerApi.ts`; até lá a interface lê `home.tournament`
 * e `home.collection` por estes acessores (TROCAR pelos tipos do F quando chegarem).
 *
 * O catálogo abaixo é só para mostrar (título em inglês, nome e regra do efeito, ordem
 * do ciclo); quem diz o que vale é o servidor.
 */
import type { PosterEffectId, Rarity } from '../types.ts';

export interface TournamentPrize {
  id: string;
  item_id: number;
  rarity: Rarity;
  serial: number;
  title: string;
  title_en?: string | null;
  year: number | null;
  file_path: string;
  effect_id: PosterEffectId;
}

/** Um pôster da coleção da pessoa que pode ir para a mesa como entrada. */
export interface StakeOption {
  item_id: number;
  effect: string;
  title: string;
  title_en?: string | null;
  year: number | null;
  file_path: string;
  serial: number | null;
  rarity: Rarity;
}

export type TournamentStake = { kind: 'chips' } | { kind: 'poster'; itemId: number; effect: string };

export interface TournamentHome {
  /** Quinta-feira que abriu a semana (AAAA-MM-DD, Brasília). */
  week: string;
  /** Próxima quinta 00h00 de Brasília (ISO). */
  ends_at: string;
  prize: TournamentPrize;
  /** Fichas da entrada: 1 (comum, raro), 2 (épico), 3 (lendário). */
  entry_chips: number;
  /** Saldo de fichas do Jackpot. */
  chips: number;
  attempts_used: number;
  max_attempts: number;
  /** Já tem este pôster (de um ciclo anterior): o torneio fecha ("Já é seu"). */
  owned: boolean;
  won_this_week: boolean;
  active_match: { match_id: string; stake: { kind: 'chips' | 'poster'; item_id?: number; effect?: string } } | null;
  stake_options: StakeOption[];
  cobra_pool: number;
  stars: number;
}

export interface CollectionEntry {
  id: string;
  item_id: number;
  rarity: Rarity;
  serial: number;
  title: string;
  title_en?: string | null;
  year: number | null;
  file_path: string;
  effect_id: PosterEffectId;
  owned: boolean;
  /** Próxima quinta em que volta ao torneio (AAAA-MM-DD). */
  next_week: string | null;
}

export interface CobraItem {
  id: string;
  name: string;
  kind: string;
}

/** O que a resposta final da Edge (`matchEnded`) traz no torneio. */
export interface TournamentRewards {
  poster?: { prizeId: string; itemId: number; title: string; filePath: string; serial: number; rarity: Rarity } | null;
  cobraItem?: CobraItem | null;
  cobraRevealed?: CobraItem | null;
  stake?: { kind: 'chips'; amount: number } | { kind: 'poster'; itemId: number; effect: string; title: string; filePath: string; lost: boolean } | null;
}

// ---------------------------------------------------------------------------
// Os 9 pôsteres (BRIEF2): números de 5 em 5, um efeito cada, ciclo de 9 semanas
// ---------------------------------------------------------------------------

export interface PosterPokerDef {
  /** poker_prizes.id (pacote F). */
  id: string;
  effect: PosterEffectId;
  rarity: Rarity;
  serial: number;
  titlePt: string;
  titleEn: string;
  year: number;
  filePath: string;
}

export const POSTER_POKER: PosterPokerDef[] = [
  { id: 'pp-21', effect: 'blackjack', rarity: 'common', serial: 70, titlePt: 'Quebrando a Banca', titleEn: '21', year: 2008, filePath: '/bZdfpXmTOGKpVNNP1lximCo9Lfq.jpg' },
  { id: 'pp-color-of-money', effect: 'double_pot', rarity: 'common', serial: 75, titlePt: 'A Cor do Dinheiro', titleEn: 'The Color of Money', year: 1986, filePath: '/wgnduoIofLovoWsfW2ziosfmQYE.jpg' },
  { id: 'pp-the-sting', effect: 'early_flop', rarity: 'common', serial: 80, titlePt: 'Golpe de Mestre', titleEn: 'The Sting', year: 1973, filePath: '/ho0bLp3w1ZBphrhaZDdRJZqvbF4.jpg' },
  { id: 'pp-rain-man', effect: 'hand_bounty', rarity: 'rare', serial: 40, titlePt: 'Rain Man', titleEn: 'Rain Man', year: 1988, filePath: '/6Ou94c5bAzWguHu03pLFFKNhF5H.jpg' },
  { id: 'pp-casino', effect: 'eight_aces', rarity: 'rare', serial: 45, titlePt: 'Cassino', titleEn: 'Casino', year: 1995, filePath: '/zFa5k1XomqXniHLJqL1AoLRQiLA.jpg' },
  { id: 'pp-rounders', effect: 'reveal_one', rarity: 'rare', serial: 50, titlePt: 'Cartas na Mesa', titleEn: 'Rounders', year: 1998, filePath: '/osc2XRp6TFLvIP8itEt1j6oh46y.jpg' },
  { id: 'pp-oceans-eleven', effect: 'sixth_card', rarity: 'epic', serial: 30, titlePt: 'Onze Homens e um Segredo', titleEn: "Ocean's Eleven", year: 2001, filePath: '/pfdabSiUVW6WqO9Dq4nyebkbHVv.jpg' },
  { id: 'pp-uncut-gems', effect: 'opal', rarity: 'epic', serial: 35, titlePt: 'Joias Brutas', titleEn: 'Uncut Gems', year: 2019, filePath: '/1o12GnGlFNW4qYlfGgXIKLaFAjF.jpg' },
  { id: 'pp-casino-royale', effect: 'tell', rarity: 'legendary', serial: 20, titlePt: '007: Cassino Royale', titleEn: 'Casino Royale', year: 2006, filePath: '/v6az3cLRIJ9MR3jllvf1NLv7b3X.jpg' },
];

/** A ordem do ciclo, a partir da semana de quinta 29/10/2026 (BRIEF2). */
export const CYCLE: PosterEffectId[] = ['early_flop', 'reveal_one', 'double_pot', 'sixth_card', 'hand_bounty', 'blackjack', 'eight_aces', 'opal', 'tell'];
export const CYCLE_START = '2026-10-29';

export const posterDef = (effect: PosterEffectId | string | null | undefined): PosterPokerDef | undefined =>
  POSTER_POKER.find((p) => p.effect === effect);

/** Título do pôster no idioma da pessoa (o servidor manda o título em português). */
export function posterTitle(p: { title: string; title_en?: string | null; effect_id?: string } | null | undefined, lang: 'pt' | 'en'): string {
  if (!p) return '';
  if (lang === 'pt') return p.title;
  return p.title_en || posterDef(p.effect_id)?.titleEn || p.title;
}

/** Fichas da entrada por raridade (comum e raro 1; épico 2; lendário 3). */
export const ENTRY_CHIPS: Record<Rarity, number> = { common: 1, rare: 1, epic: 2, legendary: 3 };

/** Estrelas da dificuldade por raridade (a mesma régua do prêmio do dia). */
export const STARS: Record<Rarity, number> = { common: 1, rare: 2, epic: 3, legendary: 4 };

// ---------------------------------------------------------------------------
// Leitura do get_poker_home (o F tipa depois)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

export function tournamentOf(home: unknown): TournamentHome | null {
  if (!isRow(home)) return null;
  const t = home.tournament;
  if (!isRow(t) || !isRow(t.prize) || typeof t.week !== 'string') return null;
  const raw = t as unknown as TournamentHome;
  return {
    ...raw,
    stake_options: Array.isArray(raw.stake_options) ? raw.stake_options : [],
    active_match: raw.active_match ?? null,
    cobra_pool: raw.cobra_pool ?? 0,
  };
}

export function collectionOf(home: unknown): CollectionEntry[] {
  if (!isRow(home) || !Array.isArray(home.collection)) return [];
  return (home.collection as unknown[]).filter((c): c is CollectionEntry => isRow(c) && typeof c.effect_id === 'string');
}

// ---------------------------------------------------------------------------
// Datas (Brasília = UTC−3, sem horário de verão)
// ---------------------------------------------------------------------------

const DAY = 86_400_000;

/** A quinta (Brasília) que abriu a semana de `now`. */
export function weekOf(now = Date.now()): string {
  const br = new Date(now - 3 * 3_600_000);
  const dow = br.getUTCDay(); // 0 domingo … 4 quinta
  const back = (dow - 4 + 7) % 7;
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()) - back * DAY).toISOString().slice(0, 10);
}

/** Quinta seguinte, 00h00 de Brasília (= 03h00 UTC). */
export function weekEndsAt(week: string): string {
  return new Date(new Date(`${week}T03:00:00Z`).getTime() + 7 * DAY).toISOString();
}

/** Posição da semana no ciclo de 9. */
export function cycleIndex(week: string): number {
  const n = Math.round((new Date(`${week}T00:00:00Z`).getTime() - new Date(`${CYCLE_START}T00:00:00Z`).getTime()) / (7 * DAY));
  return ((n % CYCLE.length) + CYCLE.length) % CYCLE.length;
}

/** A próxima quinta (a partir de `week`, exclusive) em que o efeito volta. */
export function nextWeekOf(effect: PosterEffectId, week: string): string {
  const at = cycleIndex(week);
  const target = CYCLE.indexOf(effect);
  let steps = (target - at + CYCLE.length) % CYCLE.length;
  if (steps === 0) steps = CYCLE.length;
  return new Date(new Date(`${week}T00:00:00Z`).getTime() + steps * 7 * DAY).toISOString().slice(0, 10);
}

/**
 * O pôster da semana para mostrar (botão da home, abertura, título): o do servidor,
 * senão o do ciclo pela data (o servidor ainda sem o torneio, ou sem rede).
 */
export function weekPrizeOf(home: unknown, now = Date.now()): TournamentPrize {
  const t = tournamentOf(home);
  if (t) return t.prize;
  const week = weekOf(now);
  const def = posterDef(CYCLE[cycleIndex(week)])!;
  return {
    id: def.id,
    item_id: 0,
    rarity: def.rarity,
    serial: def.serial,
    title: def.titlePt,
    title_en: def.titleEn,
    year: def.year,
    file_path: def.filePath,
    effect_id: def.effect,
  };
}
