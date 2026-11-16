// Ferramentas da Conta Diretor (16/11/2026): prateleiras dos oráculos, pôsteres
// novos da roleta e o diário (ver lib/director.ts e a migração
// 20261116170000_director_tools.sql).
//
// Cada chamada vai a uma função public.director_* que confere o papel e o nível
// no banco: 2 = código do app autenticador nesta sessão, 3 = código digitado há
// menos de 15 minutos. A tela só pede o código antes, para não deixar a pessoa
// bater na parede.
import { supabase } from './supabase';
import { cacheTitles, tmdbFetch, type TitleType } from './tmdb';
import type { MoodKey } from './moods';
import type { OracleId } from './oracleTheme';

export type Lang = 'pt' | 'en';

export interface Shelf {
  id: string;
  card: OracleId;
  mood: MoodKey;
  movieIds: number[];
  tvIds: number[];
}

const ORACLE_IDS: OracleId[] = ['bogart', 'fincher', 'cypher'];

export async function fetchShelves(): Promise<Shelf[]> {
  const { data, error } = await supabase
    .from('recommendation_pools')
    .select('id, card_type, mood_key, movie_ids, tv_ids')
    .neq('mood_key', 'random-surprise');
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[])
    .filter((row) => ORACLE_IDS.includes(row.card_type as OracleId))
    .map((row) => ({
      id: String(row.id),
      card: row.card_type as OracleId,
      mood: row.mood_key as MoodKey,
      movieIds: Array.isArray(row.movie_ids) ? (row.movie_ids as unknown[]).map(Number).filter(Number.isFinite) : [],
      tvIds: Array.isArray(row.tv_ids) ? (row.tv_ids as unknown[]).map(Number).filter(Number.isFinite) : [],
    }));
}

export interface TitleCard {
  id: number;
  media: TitleType;
  title: string;
  year: string | null;
  poster: string | null;
}

export const titleKey = (media: TitleType, id: number) => `${media}:${id}`;

const yearOf = (date: unknown): string | null => (typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : null);

// Nome, ano e pôster de vários títulos, direto do banco (em lotes, para a URL
// não passar do tamanho).
export async function fetchTitleCards(refs: { id: number; media: TitleType }[], lang: Lang): Promise<Map<string, TitleCard>> {
  const out = new Map<string, TitleCard>();
  for (const media of ['movie', 'tv'] as TitleType[]) {
    const ids = Array.from(new Set(refs.filter((r) => r.media === media).map((r) => r.id)));
    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const { data, error } = await supabase
        .from('movie_cache')
        .select('tmdb_id, media_type, title_pt, title_en, release_date, poster_path, poster_path_pt')
        .eq('media_type', media)
        .in('tmdb_id', chunk);
      if (error) throw error;
      ((data || []) as Record<string, unknown>[]).forEach((row) => {
        const id = Number(row.tmdb_id);
        const title = String((lang === 'pt' ? row.title_pt || row.title_en : row.title_en || row.title_pt) || `#${id}`);
        out.set(titleKey(media, id), {
          id,
          media,
          title,
          year: yearOf(row.release_date),
          poster: (lang === 'pt' ? (row.poster_path_pt as string) || (row.poster_path as string) : (row.poster_path as string)) || null,
        });
      });
    }
  }
  return out;
}

export interface SearchHit extends TitleCard {
  overview: string;
}

// Busca no TMDB (pelo tmdb-proxy, a mesma da barra do site).
export async function searchTitles(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await tmdbFetch(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false&page=1`);
  return ((data?.results || []) as Record<string, unknown>[])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 12)
    .map((r) => ({
      id: Number(r.id),
      media: r.media_type as TitleType,
      title: String(r.title || r.name || ''),
      year: yearOf(r.release_date || r.first_air_date),
      poster: (r.poster_path as string) || null,
      overview: String(r.overview || ''),
    }));
}

// Garante o título no banco (as prateleiras e a roleta só leem dele).
export async function ensureTitleInDb(media: TitleType, id: number): Promise<boolean> {
  const rows = await cacheTitles([{ id, media_type: media }]);
  return rows.has(titleKey(media, id));
}

export interface TitleInfo {
  inDb: boolean;
  shelves: { card: OracleId; mood: MoodKey }[];
  raters: number;
  posters: { id: number; rarity: string; serial: number | null; file_path: string; is_active: boolean; exclusive: string | null }[];
}

export async function fetchTitleInfo(media: TitleType, id: number): Promise<TitleInfo> {
  const { data, error } = await supabase.rpc('director_title_info', { p_media: media, p_tmdb_id: id });
  if (error) throw error;
  const raw = (data || {}) as Record<string, unknown>;
  return {
    inDb: raw.in_db === true,
    shelves: Array.isArray(raw.shelves) ? (raw.shelves as TitleInfo['shelves']) : [],
    raters: Number(raw.raters) || 0,
    posters: Array.isArray(raw.posters) ? (raw.posters as TitleInfo['posters']) : [],
  };
}

type Result = { ok: boolean; changed?: boolean; audit_id?: number; id?: number; serial?: number };

async function call(name: string, args: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return (data || { ok: true }) as Result;
}

export const poolAdd = (card: OracleId, mood: MoodKey, media: TitleType, id: number, reason?: string) =>
  call('director_pool_add', { p_card: card, p_mood: mood, p_media: media, p_tmdb_id: id, p_reason: reason || null });

export const poolRemove = (card: OracleId, mood: MoodKey, media: TitleType, id: number, reason?: string) =>
  call('director_pool_remove', { p_card: card, p_mood: mood, p_media: media, p_tmdb_id: id, p_reason: reason || null });

export const poolMove = (from: { card: OracleId; mood: MoodKey }, to: { card: OracleId; mood: MoodKey }, media: TitleType, id: number, reason?: string) =>
  call('director_pool_move', {
    p_from_card: from.card,
    p_from_mood: from.mood,
    p_to_card: to.card,
    p_to_mood: to.mood,
    p_media: media,
    p_tmdb_id: id,
    p_reason: reason || null,
  });

export interface TmdbImage {
  file_path: string;
  lang: string | null;
  votes: number;
  width: number;
  height: number;
}

// As artes de pôster de um título (só a conta diretor passa no tmdb-proxy).
export async function fetchPosterImages(media: TitleType, id: number): Promise<TmdbImage[]> {
  const data = await tmdbFetch(`/${media}/${id}/images?include_image_language=pt,en,null`);
  return ((data?.posters || []) as Record<string, unknown>[])
    .map((p) => ({
      file_path: String(p.file_path || ''),
      lang: (p.iso_639_1 as string) || null,
      votes: Number(p.vote_count) || 0,
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
    }))
    .filter((p) => /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$/.test(p.file_path))
    .slice(0, 40);
}

export type PosterRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const posterCreate = (media: TitleType, id: number, rarity: PosterRarity, filePath: string, reason?: string) =>
  call('director_poster_create', { p_media: media, p_tmdb_id: id, p_rarity: rarity, p_file_path: filePath, p_reason: reason || null });

export const posterSetActive = (id: number, active: boolean, reason?: string) =>
  call('director_poster_set_active', { p_id: id, p_active: active, p_reason: reason || null });

export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  kind: string;
  target: string | null;
  reason: string | null;
  reversible: boolean;
  undone_at: string | null;
  undone_by: number | null;
  meta: Record<string, unknown> | null;
}

export async function fetchAudit(beforeId?: number | null): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('director_audit_list', { p_before_id: beforeId ?? null, p_limit: 50 });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as AuditEntry[];
}

export const undoAudit = (id: number) => call('director_undo', { p_audit_id: id });

// O que dizer quando o banco recusa (a mensagem vem do raise exception).
const ERRORS: Record<string, Record<Lang, string>> = {
  forbidden: {
    pt: 'O banco pediu o código do app autenticador. Digite o código e tente de novo.',
    en: 'The database asked for the authenticator code. Enter the code and try again.',
  },
  not_in_db: { pt: 'Este título ainda não está no banco.', en: 'This title is not in the database yet.' },
  pool_not_found: { pt: 'Prateleira não encontrada.', en: 'Shelf not found.' },
  not_on_shelf: { pt: 'O título não está nesta prateleira.', en: 'The title is not on this shelf.' },
  rate_limited: { pt: 'Muitas mudanças nesta hora. Espere um pouco.', en: 'Too many changes this hour. Wait a bit.' },
  changed_since: {
    pt: 'Isso mudou depois. Desfaça as mudanças mais novas primeiro.',
    en: 'This changed afterwards. Undo the newer changes first.',
  },
  in_use: {
    pt: 'Alguém já teve este pôster: ele não se apaga. Tire-o do sorteio.',
    en: 'Someone already had this poster: it cannot be deleted. Take it out of the draw.',
  },
  duplicate_image: { pt: 'Esta arte já está na roleta.', en: 'This artwork is already in the wheel.' },
  bad_image: { pt: 'Arte inválida.', en: 'Invalid artwork.' },
  bad_rarity: { pt: 'Raridade inválida.', en: 'Invalid rarity.' },
  exclusive: { pt: 'Exclusivo do Pôster Poker: não passa por aqui.', en: 'Poster Poker exclusive: not handled here.' },
  not_undoable: { pt: 'Isto não se desfaz.', en: 'This cannot be undone.' },
};

export function directorErrorText(error: unknown, lang: Lang): string {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : '';
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  if (key) return ERRORS[key][lang];
  return lang === 'pt' ? 'Não deu certo. Tente de novo.' : "That didn't work. Try again.";
}
