import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Poster Jackpot (30/10/2026): a máquina de cápsulas do Oracle Hub que
// sorteia pôsteres alternativos (escolhidos à mão no TMDB) em 4 raridades e
// 3 efeitos especiais. Todo sorteio, ticket e missão roda no banco
// (migração 20261030300000_poster_jackpot.sql); aqui ficam os tipos, as
// chamadas e o pôster equipado de cada pessoa (que troca a capa na
// biblioteca dela).

export type PosterRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type PosterEffect = 'none' | 'holo' | 'negative' | 'ultra_red';
export type TitleType = 'movie' | 'tv';

export const RARITIES: PosterRarity[] = ['legendary', 'epic', 'rare', 'common'];
export const EFFECTS: PosterEffect[] = ['holo', 'negative', 'ultra_red'];

// Cor de cada raridade (o cinza, o azul, o roxo e o dourado pedidos pelo
// Bruno) e a chance num ticket (a mesma do banco).
export const RARITY_META: Record<PosterRarity, { color: string; glow: string; odds: number; fragments: number }> = {
  common: { color: '#A8A29E', glow: 'rgba(168,162,158,0.45)', odds: 55, fragments: 1 },
  rare: { color: '#60A5FA', glow: 'rgba(96,165,250,0.55)', odds: 28, fragments: 2 },
  epic: { color: '#C084FC', glow: 'rgba(192,132,252,0.6)', odds: 13, fragments: 3 },
  legendary: { color: '#FBBF24', glow: 'rgba(251,191,36,0.65)', odds: 4, fragments: 5 },
};

export const EFFECT_META: Record<Exclude<PosterEffect, 'none'>, { color: string; odds: number }> = {
  holo: { color: '#67E8F9', odds: 80 },
  negative: { color: '#E5E7EB', odds: 15 },
  ultra_red: { color: '#F87171', odds: 5 },
};

export const FRAGMENTS_PER_TICKET = 5;

export const posterUrl = (filePath: string, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w342') =>
  `https://image.tmdb.org/t/p/${size}${filePath}`;

export interface PosterItem {
  id: number;
  media_type: TitleType;
  tmdb_id: number;
  rarity: PosterRarity;
  file_path: string;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
}

export interface OwnedPoster extends PosterItem {
  effect: PosterEffect;
  copies: number;
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

export interface JackpotState {
  enabled: boolean;
  tickets: number;
  fragments: number;
  premium: boolean;
  specialAvailable: boolean;
  weekEndsAt: string | null;
  missions: JackpotMission[];
  catalog: Record<PosterRarity | 'total', number>;
  owned: number;
}

export interface PullResult {
  item: PosterItem;
  effect: PosterEffect;
  kind: 'normal' | 'special';
  duplicate: boolean;
  copies: number;
  fragmentsGained: number;
  bonusTickets: number;
  tickets: number;
  fragments: number;
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
    fragments: num(raw.fragments),
    premium: raw.premium === true,
    specialAvailable: raw.special_available === true,
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
  };
}

export async function pullJackpot(kind: 'normal' | 'special'): Promise<PullResult> {
  const { data, error } = await supabase.rpc('jackpot_pull', { p_kind: kind });
  if (error) throw error;
  const raw = data as Row;
  notifyPostersChanged();
  return {
    item: raw.item as PosterItem,
    effect: raw.effect as PosterEffect,
    kind: raw.kind as 'normal' | 'special',
    duplicate: raw.duplicate === true,
    copies: num(raw.copies),
    fragmentsGained: num(raw.fragments_gained),
    bonusTickets: num(raw.bonus_tickets),
    tickets: num(raw.tickets),
    fragments: num(raw.fragments),
  };
}

export async function claimMission(key: string): Promise<{ tickets: number; fragments: number }> {
  const { data, error } = await supabase.rpc('jackpot_claim_mission', { p_key: key });
  if (error) throw error;
  const raw = data as Row;
  return { tickets: num(raw.tickets), fragments: num(raw.fragments) };
}

// ---------------------------------------------------------------------------
// Coleção e pôster equipado (guardados na memória da página; qualquer
// sorteio ou troca avisa quem estiver mostrando).
// ---------------------------------------------------------------------------

const CHANGED_EVENT = 'cineoracle:posters-changed';
let myPostersPromise: Promise<OwnedPoster[]> | null = null;
const equippedCache = new Map<string, Promise<EquippedMap>>();

export type EquippedPoster = { item_id: number; effect: PosterEffect; rarity: PosterRarity; file_path: string };
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
