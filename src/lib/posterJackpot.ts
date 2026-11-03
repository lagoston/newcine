import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Poster Jackpot (30/10/2026): a roleta do Oracle Hub que sorteia pôsteres
// alternativos (escolhidos à mão no TMDB) em 4 raridades e 3 efeitos
// especiais, sem nunca repetir um pôster. Todo sorteio, ticket e missão roda
// no banco (migrações 20261030300000, 20261030400000 e 20261030410000); aqui
// ficam os tipos, as chamadas e o pôster equipado de cada pessoa (que troca
// a capa na biblioteca dela e no menu do título).

export type PosterRarity = 'common' | 'rare' | 'epic' | 'legendary';
// 'gold' (03/11/2026, Pôster Poker): o brilho dourado, só dos 9 pôsteres do torneio
// semanal do pôquer. Fica fora de EFFECTS: a roleta nunca sorteia.
export type PosterEffect = 'none' | 'holo' | 'negative' | 'ultra_red' | 'gold';
export type TitleType = 'movie' | 'tv';

export const RARITIES: PosterRarity[] = ['legendary', 'epic', 'rare', 'common'];
export const EFFECTS: PosterEffect[] = ['holo', 'negative', 'ultra_red'];

// Cor de cada raridade (o cinza, o azul, o roxo e o dourado pedidos pelo
// Bruno) e a chance num ticket (a mesma do banco).
export const RARITY_META: Record<PosterRarity, { color: string; glow: string; odds: number }> = {
  common: { color: '#B9B4AE', glow: 'rgba(185,180,174,0.5)', odds: 55 },
  rare: { color: '#5EA8FF', glow: 'rgba(94,168,255,0.6)', odds: 28 },
  epic: { color: '#C77DFF', glow: 'rgba(199,125,255,0.65)', odds: 13 },
  legendary: { color: '#FFC83D', glow: 'rgba(255,200,61,0.7)', odds: 4 },
};

export const EFFECT_META: Record<Exclude<PosterEffect, 'none'>, { color: string; odds: number }> = {
  holo: { color: '#67E8F9', odds: 80 },
  negative: { color: '#E5E7EB', odds: 15 },
  ultra_red: { color: '#F87171', odds: 5 },
  gold: { color: '#F4C454', odds: 0 },
};

export const posterUrl = (filePath: string, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w342') =>
  `https://image.tmdb.org/t/p/${size}${filePath}`;

export interface PosterItem {
  id: number;
  media_type: TitleType;
  tmdb_id: number;
  rarity: PosterRarity;
  // Número de colecionador dentro da raridade (Lendário nº 7…): por ordem de
  // entrada no catálogo e fixo para sempre (migração 20261031090000).
  serial: number | null;
  file_path: string;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
}

export interface OwnedPoster extends PosterItem {
  effect: PosterEffect;
  equipped: boolean;
  in_library: boolean;
  first_pulled_at: string;
  // 03/11/2026 (pôquer): false = prêmio da mesa do Grande Blefe, que não entra
  // em trocas. Ausente nos servidores antigos (vale como true).
  tradeable?: boolean;
}

export interface JackpotMission {
  key: string;
  // 'poker_play' (03/11/2026): partidas de pôquer até o fim, só a partir da
  // semana em que o servidor ligar a missão.
  kind: 'rate_oracle' | 'rate_mood' | 'whisper' | 'review' | 'watchlist' | 'rate_any' | 'rate_series' | 'rate_classic' | 'poker_play';
  param: string | null;
  target: number;
  progress: number;
  claimed: boolean;
}

// O resumo do pôquer dentro do estado do Jackpot (poker_teaser no banco).
export interface PokerTeaserPrize {
  id: string;
  kind: string;
  rarity: PosterRarity;
  namePt: string;
  nameEn: string;
  articlePt: string | null;
  image: string | null;
  payload: Record<string, unknown>;
}

export interface PokerTeaser {
  day: string;
  // Prêmio de hoje (null num dia sem prêmio gravado).
  prize: PokerTeaserPrize | null;
  // Quem carrega o prêmio na mesa ('bogart' | 'cypher' | 'fincher' | rival novo).
  carrier: string | null;
  stars: number;
  attemptsUsed: number;
  maxAttempts: number;
  wonToday: boolean;
  // Há uma partida com prêmio em andamento.
  active: boolean;
  // A faixa de feltro da home (regra do veredito Q5, decidida no servidor).
  homeStrip: boolean;
  wins: number;
  matches: number;
  // Confirmação 18+ (null enquanto o servidor não mandar o campo).
  ageConfirmed: boolean | null;
}

// Fichas (01/11/2026): o que era "ticket" no Jackpot virou "ficha" na tela
// (num porta-fichas de cassino). No banco e aqui os campos continuam com os
// nomes antigos: tickets = fichas comuns; special* = fichas especiais.
export interface JackpotState {
  enabled: boolean;
  tickets: number;
  premium: boolean;
  // Fichas especiais: a semanal do Premium (não acumula) + as guardadas
  // (convites e outros meios; acumulam). specialCount soma as duas.
  specialWeekly: boolean;
  specialTickets: number;
  specialAvailable: boolean;
  specialCount: number;
  // A barra da sorte: a cada LUCKY_GOAL giros pagos, um Giro da Sorte grátis
  // (50% épico, 50% lendário). luckyProgress vai de 0 a 9; luckySpins são
  // os Giros da Sorte guardados (acumulam).
  luckyProgress: number;
  luckySpins: number;
  luckyGoal: number;
  weekEndsAt: string | null;
  missions: JackpotMission[];
  catalog: Record<PosterRarity | 'total', number>;
  owned: number;
  // Versões novas que ainda podem sair (nunca sai repetido): em qualquer
  // ticket / no especial (só as com efeito).
  remaining: number;
  remainingSpecial: number;
  // Presente ainda não avisado (02/11/2026): hoje só o da sexta-feira 13 da
  // tag Scary Clown (3 fichas especiais). O aviso marca com
  // markJackpotGiftSeen().
  gift: JackpotGift | null;
  // A pessoa tem a Scary Clown: a gaveta lembra a próxima sexta-feira 13.
  friday13Perk: boolean;
  // A ficha grátis de hoje ainda está lá (02/11/2026): o balão da porta.
  dailyChip: boolean;
  // O Grande Blefe (03/11/2026): o resumo do pôquer que o get_jackpot_state
  // traz. null = fechado para esta conta, servidor antigo ou campo torto —
  // nesse caso nada do pôquer aparece (aba, linha, faixa da home).
  poker: PokerTeaser | null;
}

// A ficha do dia acabou de ser pega: a aba Missões mostra a recompensa.
// at = quando (chave para a ficha cair uma vez só).
export interface DailyReward {
  tickets: number;
  at: number;
}

export interface JackpotGift {
  kind: 'friday13';
  amount: number;
  day: string;
}

// Um pôster do catálogo (para a fita da roleta).
export interface CatalogPoster {
  id: number;
  rarity: PosterRarity;
  serial: number | null;
  file_path: string;
  media_type: TitleType;
  tmdb_id: number;
}

// Com o que se gira: ficha comum, ficha especial ou o Giro da Sorte.
export type PullKind = 'normal' | 'special' | 'lucky';

export const LUCKY_GOAL = 10;
// O Giro da Sorte: meio a meio entre épico e lendário (os efeitos seguem o
// giro com ficha comum).
export const LUCKY_ODDS: Partial<Record<PosterRarity, number>> = { epic: 50, legendary: 50 };

export interface PullResult {
  item: PosterItem;
  effect: PosterEffect;
  kind: PullKind;
  tickets: number;
  specialTickets: number;
  specialWeekly: boolean;
  luckyProgress: number;
  luckySpins: number;
  // Este giro completou a barra (ganhou um Giro da Sorte).
  luckyEarned: boolean;
}

// Monta os campos da ficha especial a partir da semanal e das guardadas.
export const specialFields = (weekly: boolean, bonus: number) => ({
  specialWeekly: weekly,
  specialTickets: bonus,
  specialAvailable: weekly || bonus > 0,
  specialCount: (weekly ? 1 : 0) + bonus,
});

// A fonte dos letreiros (Cinzel Decorative), carregada só quando a roleta
// aparece.
let fontRequested = false;
export function loadJackpotFont() {
  if (fontRequested || typeof document === 'undefined') return;
  fontRequested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&display=swap';
  document.head.appendChild(link);
}

export const titleOf = (item: Pick<PosterItem, 'title_pt' | 'title_en'>, isPt: boolean) =>
  (isPt ? item.title_pt || item.title_en : item.title_en || item.title_pt) || '';

type Row = Record<string, unknown>;
const num = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);

const RARITY_SET = new Set<PosterRarity>(['common', 'rare', 'epic', 'legendary']);

// Lê o campo "poker" com desconfiança: qualquer coisa fora do formato vira
// null (o Jackpot nunca cai por causa do pôquer). Só "enabled: true" abre.
export function parsePokerTeaser(value: unknown): PokerTeaser | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Row;
  if (raw.enabled !== true) return null;
  const p = raw.prize && typeof raw.prize === 'object' ? (raw.prize as Row) : null;
  const prize: PokerTeaserPrize | null =
    p && typeof p.id === 'string'
      ? {
          id: p.id,
          kind: typeof p.kind === 'string' ? p.kind : 'unknown',
          rarity: RARITY_SET.has(p.rarity as PosterRarity) ? (p.rarity as PosterRarity) : 'common',
          namePt: typeof p.name_pt === 'string' ? p.name_pt : typeof p.name_en === 'string' ? p.name_en : p.id,
          nameEn: typeof p.name_en === 'string' ? p.name_en : typeof p.name_pt === 'string' ? p.name_pt : p.id,
          articlePt: typeof p.article_pt === 'string' ? p.article_pt : null,
          image: typeof p.image === 'string' ? p.image : null,
          payload: p.payload && typeof p.payload === 'object' ? (p.payload as Record<string, unknown>) : {},
        }
      : null;
  return {
    day: typeof raw.day === 'string' ? raw.day : '',
    prize,
    carrier: typeof raw.carrier === 'string' ? raw.carrier : null,
    stars: Math.max(0, Math.min(4, num(raw.stars))),
    attemptsUsed: num(raw.attempts_used),
    maxAttempts: num(raw.max_attempts) || 3,
    wonToday: raw.won_today === true,
    active: raw.active === true,
    homeStrip: raw.home_strip === true,
    wins: num(raw.wins),
    matches: num(raw.matches),
    ageConfirmed: typeof raw.age_confirmed === 'boolean' ? raw.age_confirmed : null,
  };
}

export async function fetchJackpotState(): Promise<JackpotState> {
  const { data, error } = await supabase.rpc('get_jackpot_state');
  if (error) throw error;
  const raw = (data || {}) as Row;
  const catalog = (raw.catalog || {}) as Row;
  return {
    enabled: raw.enabled === true,
    tickets: num(raw.tickets),
    premium: raw.premium === true,
    ...specialFields(raw.special_weekly === true, num(raw.special_tickets)),
    luckyProgress: num(raw.lucky_progress),
    luckySpins: num(raw.lucky_spins),
    luckyGoal: num(raw.lucky_goal) || LUCKY_GOAL,
    weekEndsAt: typeof raw.week_ends_at === 'string' ? raw.week_ends_at : null,
    missions: Array.isArray(raw.missions) ? (raw.missions as JackpotMission[]) : [],
    catalog: {
      common: num(catalog.common),
      rare: num(catalog.rare),
      epic: num(catalog.epic),
      legendary: num(catalog.legendary),
      total: num(catalog.total),
    },
    owned: num(raw.owned),
    remaining: num(raw.remaining),
    remainingSpecial: num(raw.remaining_special),
    gift: parseGift(raw.gift),
    friday13Perk: raw.friday13_perk === true,
    dailyChip: raw.daily_chip === true,
    poker: parsePokerTeaser(raw.poker),
  };
}

// Pega a ficha grátis de hoje (uma por dia, dia de Brasília).
// reason: 'already' (já foi pega hoje) ou 'closed' (Jackpot fechado).
export async function claimDailyChip(): Promise<{ ok: boolean; reason?: 'already' | 'closed'; tickets: number | null }> {
  const { data, error } = await supabase.rpc('jackpot_claim_daily');
  if (error) throw error;
  const raw = (data || {}) as Row;
  return {
    ok: raw.ok === true,
    reason: raw.reason === 'already' || raw.reason === 'closed' ? raw.reason : undefined,
    tickets: typeof raw.tickets === 'number' ? raw.tickets : null,
  };
}

const parseGift = (value: unknown): JackpotGift | null => {
  const gift = value as Row | null;
  if (!gift || gift.kind !== 'friday13') return null;
  return { kind: 'friday13', amount: num(gift.amount) || 3, day: typeof gift.day === 'string' ? gift.day : '' };
};

// O aviso do presente foi mostrado (não aparece de novo).
export async function markJackpotGiftSeen(): Promise<void> {
  const { error } = await supabase.rpc('jackpot_gift_seen');
  if (error) throw error;
}

// A próxima sexta-feira 13 a partir de hoje (incluindo hoje), no fuso de
// quem está olhando — para a gaveta lembrar quem tem a Scary Clown.
export function nextFriday13(from = new Date()): Date {
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 28; i += 1) {
    const candidate = new Date(day.getFullYear(), day.getMonth() + i, 13);
    if (candidate >= day && candidate.getDay() === 5) return candidate;
  }
  return day;
}

let catalogPromise: Promise<CatalogPoster[]> | null = null;
export function fetchJackpotCatalog(): Promise<CatalogPoster[]> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const { data, error } = await supabase.rpc('get_jackpot_catalog');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as CatalogPoster[];
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

// O motivo de um giro recusado pelo banco (mensagem da exceção).
export const pullErrorCode = (error: unknown): string => {
  const message = (error as { message?: string })?.message || '';
  return ['no_tickets', 'no_special', 'no_lucky', 'collection_complete', 'jackpot_closed'].find((code) => message.includes(code)) || 'error';
};

export async function pullJackpot(kind: PullKind): Promise<PullResult> {
  const { data, error } = await supabase.rpc('jackpot_pull', { p_kind: kind });
  if (error) throw error;
  const raw = data as Row;
  notifyPostersChanged();
  return {
    item: raw.item as PosterItem,
    effect: raw.effect as PosterEffect,
    kind: raw.kind as PullKind,
    tickets: num(raw.tickets),
    specialTickets: num(raw.special_tickets),
    specialWeekly: raw.special_weekly === true,
    luckyProgress: num(raw.lucky_progress),
    luckySpins: num(raw.lucky_spins),
    luckyEarned: raw.lucky_earned === true,
  };
}

export async function claimMission(key: string): Promise<{ tickets: number }> {
  const { data, error } = await supabase.rpc('jackpot_claim_mission', { p_key: key });
  if (error) throw error;
  const raw = data as Row;
  return { tickets: num(raw.tickets) };
}

// ---------------------------------------------------------------------------
// Coleção e pôster equipado (guardados na memória da página; qualquer
// sorteio ou troca avisa quem estiver mostrando).
// ---------------------------------------------------------------------------

const CHANGED_EVENT = 'cineoracle:posters-changed';
let myPostersPromise: Promise<OwnedPoster[]> | null = null;
const equippedCache = new Map<string, Promise<EquippedMap>>();

export type EquippedPoster = { item_id: number; effect: PosterEffect; rarity: PosterRarity; serial: number | null; file_path: string };
export type EquippedMap = Map<string, EquippedPoster>;
export const posterKey = (mediaType: string | null | undefined, id: number) => `${mediaType === 'tv' ? 'tv' : 'movie'}:${id}`;

export function notifyPostersChanged() {
  myPostersPromise = null;
  equippedCache.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function loadMyPosters(): Promise<OwnedPoster[]> {
  if (!myPostersPromise) {
    myPostersPromise = (async () => {
      const { data, error } = await supabase.rpc('get_my_posters');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as OwnedPoster[];
    })().catch((error) => {
      myPostersPromise = null;
      throw error;
    });
  }
  return myPostersPromise;
}

function loadEquipped(ownerId: string): Promise<EquippedMap> {
  let cached = equippedCache.get(ownerId);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase.rpc('get_equipped_posters', { p_user_id: ownerId });
      if (error) throw error;
      const map: EquippedMap = new Map();
      (Array.isArray(data) ? (data as Row[]) : []).forEach((row) => {
        map.set(posterKey(row.media_type as string, num(row.tmdb_id)), {
          item_id: num(row.item_id),
          effect: row.effect as PosterEffect,
          rarity: row.rarity as PosterRarity,
          serial: row.serial == null ? null : num(row.serial),
          file_path: row.file_path as string,
        });
      });
      return map;
    })().catch((error) => {
      equippedCache.delete(ownerId);
      throw error;
    });
    equippedCache.set(ownerId, cached);
  }
  return cached;
}

// Os pôsteres equipados de uma pessoa (a dona da biblioteca na tela).
export function useEquippedPosters(ownerId: string | null | undefined): EquippedMap {
  const [map, setMap] = useState<EquippedMap>(() => new Map());
  useEffect(() => {
    if (!ownerId) {
      setMap(new Map());
      return;
    }
    let alive = true;
    const load = () =>
      loadEquipped(ownerId)
        .then((result) => alive && setMap(result))
        .catch(() => undefined);
    load();
    window.addEventListener(CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED_EVENT, load);
    };
  }, [ownerId]);
  return map;
}

// A coleção de quem está logado (para o menu de equipar na biblioteca).
export function useMyPosters(enabled: boolean): OwnedPoster[] | null {
  const [list, setList] = useState<OwnedPoster[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      loadMyPosters()
        .then((result) => alive && setList(result))
        .catch(() => alive && setList([]));
    load();
    window.addEventListener(CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED_EVENT, load);
    };
  }, [enabled]);
  return list;
}

export async function equipPoster(itemId: number, effect: PosterEffect) {
  const { error } = await supabase.rpc('equip_poster', { p_item_id: itemId, p_effect: effect });
  if (error) throw error;
  notifyPostersChanged();
}

export async function unequipPoster(mediaType: TitleType, tmdbId: number) {
  const { error } = await supabase.rpc('unequip_poster', { p_media_type: mediaType, p_tmdb_id: tmdbId });
  if (error) throw error;
  notifyPostersChanged();
}
