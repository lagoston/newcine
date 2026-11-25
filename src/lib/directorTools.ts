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

// As capas que o site já mostra para um título: pt = a brasileira (quando o
// título tem uma), en = a original. 25/11/2026: a tela dos pôsteres marca as
// duas, para o pôster novo não ser igual ao que todo mundo já vê.
export interface TitleCovers {
  pt: string | null;
  en: string | null;
}

export interface TitleInfo {
  inDb: boolean;
  shelves: { card: OracleId; mood: MoodKey }[];
  raters: number;
  // owners: quantas pessoas têm o pôster (vem do banco desde 25/11/2026)
  posters: { id: number; rarity: string; serial: number | null; file_path: string; is_active: boolean; exclusive: string | null; owners?: number }[];
  covers: TitleCovers;
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
    covers: {
      pt: typeof (raw.covers as TitleCovers | null)?.pt === 'string' ? (raw.covers as TitleCovers).pt : null,
      en: typeof (raw.covers as TitleCovers | null)?.en === 'string' ? (raw.covers as TitleCovers).en : null,
    },
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
//
// 24/11/2026 (pedido do Bruno: "Pôsteres às vezes não carregam no modo diretor
// quando tento implantar um novo"): até aqui vinham só as artes marcadas como
// português, inglês ou sem idioma, e só as 40 primeiras (O Exterminador do
// Futuro 2 tem 163). Agora vêm todas, de todos os idiomas, na ordem do TMDB;
// quem filtra e mostra em lotes é a tela (director/PosterArtPicker.tsx).
// Sem `language` o TMDB devolveria tudo, mas tmdbFetch põe o idioma do site
// em todo pedido que não traz um; por isso a lista explícita de idiomas.
// Lembrete: o tmdb-proxy guarda esta lista por 7 dias. Uma arte enviada ao
// TMDB depois disso não aparece até o prazo vencer; para ela existe o campo
// de colar o link (posterPathFromLink).
const POSTER_LANGS =
  'pt,en,null,es,fr,de,it,ja,ko,zh,cn,ru,pl,tr,nl,sv,da,no,fi,cs,hu,el,he,ar,hi,th,uk,ro,bg,hr,sr,sk,sl,lt,lv,et,vi,id,ms,fa,ca';
const POSTER_FILE = /^\/[A-Za-z0-9_-]{5,64}\.(jpg|jpeg|png)$/;

export async function fetchPosterImages(media: TitleType, id: number): Promise<TmdbImage[]> {
  const data = await tmdbFetch(`/${media}/${id}/images?include_image_language=${POSTER_LANGS}`);
  const seen = new Set<string>();
  return ((data?.posters || []) as Record<string, unknown>[])
    .map((p) => ({
      file_path: String(p.file_path || ''),
      lang: (p.iso_639_1 as string) || null,
      votes: Number(p.vote_count) || 0,
      width: Number(p.width) || 0,
      height: Number(p.height) || 0,
    }))
    .filter((p) => {
      if (!POSTER_FILE.test(p.file_path) || seen.has(p.file_path)) return false;
      seen.add(p.file_path);
      return true;
    });
}

// O arquivo de uma arte a partir do que a pessoa colou: o link do TMDB
// (https://image.tmdb.org/t/p/original/abc.jpg), o endereço da página da
// imagem ou só o nome do arquivo. Devolve "/abc.jpg" (a forma que o banco
// aceita em director_poster_create) ou null.
export function posterPathFromLink(text: string): string | null {
  const clean = text.trim().split(/[?#]/)[0];
  const match = clean.match(/(?:^|\/)([A-Za-z0-9_-]{5,64}\.(?:jpg|jpeg|png))$/i);
  if (!match) return null;
  const path = `/${match[1].replace(/\.(JPG|JPEG|PNG)$/, (ext) => ext.toLowerCase())}`;
  return POSTER_FILE.test(path) ? path : null;
}

export type PosterRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const posterCreate = (media: TitleType, id: number, rarity: PosterRarity, filePath: string, reason?: string) =>
  call('director_poster_create', { p_media: media, p_tmdb_id: id, p_rarity: rarity, p_file_path: filePath, p_reason: reason || null });

export const posterSetActive = (id: number, active: boolean, reason?: string) =>
  call('director_poster_set_active', { p_id: id, p_active: active, p_reason: reason || null });

// 25/11/2026 (pedido do Bruno): apagar um rascunho. O banco só apaga o que
// está fora do sorteio e que ninguém nunca teve, girou, trocou ou apostou; o
// resto ele recusa (in_draw, in_use). Dá para desfazer pelo Diário.
export const posterDelete = (id: number, reason?: string) => call('director_poster_delete', { p_id: id, p_reason: reason || null });

// 25/11/2026 (pedido do Bruno): trocar a raridade e/ou a arte de um pôster da
// roleta. Vale na hora para quem o tem (a coleção aponta para o pôster). Só
// vai o que mudou: null = fica como está. Se alguém tem o pôster, o banco pede
// o código do app digitado nos últimos 15 minutos.
export const posterUpdate = (id: number, change: { rarity?: PosterRarity | null; filePath?: string | null }, reason?: string) =>
  call('director_poster_update', { p_id: id, p_rarity: change.rarity ?? null, p_file_path: change.filePath ?? null, p_reason: reason || null });

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
    pt: 'Alguém já teve este pôster: ele não se apaga. Deixe-o fora do sorteio.',
    en: 'Someone already had this poster: it cannot be deleted. Leave it out of the draw.',
  },
  in_draw: {
    pt: 'Este pôster está no sorteio. Tire-o do sorteio antes de apagar.',
    en: 'This poster is in the draw. Take it out of the draw before deleting.',
  },
  poster_not_found: { pt: 'Este pôster não existe mais.', en: 'This poster no longer exists.' },
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
