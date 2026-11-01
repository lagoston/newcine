import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Poster Jackpot (30/10/2026): a roleta do Oracle Hub que sorteia pôsteres
// alternativos (escolhidos à mão no TMDB) em 4 raridades e 3 efeitos
// especiais, sem nunca repetir um pôster. Todo sorteio, ticket e missão roda
// no banco (migrações 20261030300000, 20261030400000 e 20261030410000); aqui
// ficam os tipos, as chamadas e o pôster equipado de cada pessoa (que troca
// a capa na biblioteca dela e no menu do título).

export type PosterRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type PosterEffect = 'none' | 'holo' | 'negative' | 'ultra_red';
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
}

export interface JackpotMission {
  key: string;
  kind: 'rate_oracle' | 'rate_mood' | 'whisper' | 'review' | 'watchlist' | 'rate_any' | 'rate_series' | 'rate_classic';
  param: string | null;
  target: number;
  progress: number;
  claimed: boolean;
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
  };
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
