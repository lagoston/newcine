import { supabase } from './supabase';
import { ShelfEntry, TitleMediaType } from './titleCards';

// Organizações dos avaliados na Biblioteca (10/10/2026): Notas, One Grid,
// Top 100 e Por década. A escolha fica no perfil (profiles.library_layout) —
// o perfil da pessoa na comunidade mostra a coleção do mesmo jeito.

export type RatedLayout = 'notes' | 'onegrid' | 'top100' | 'decades';

export const RATED_LAYOUTS: RatedLayout[] = ['notes', 'onegrid', 'top100', 'decades'];

export const asRatedLayout = (value: unknown): RatedLayout =>
  RATED_LAYOUTS.includes(value as RatedLayout) ? (value as RatedLayout) : 'notes';

// Escolha antiga, guardada só no aparelho (antes de ir para o perfil).
const LEGACY_LAYOUT_KEY = 'libraryRatedLayout';

export function readLegacyLayout(): RatedLayout | null {
  try {
    const value = localStorage.getItem(LEGACY_LAYOUT_KEY);
    return value ? asRatedLayout(value) : null;
  } catch {
    return null;
  }
}

export async function saveRatedLayout(userId: string, layout: RatedLayout) {
  try {
    localStorage.setItem(LEGACY_LAYOUT_KEY, layout);
  } catch {
    // sem armazenamento: vale o que está no perfil
  }
  const { error } = await supabase.from('profiles').update({ library_layout: layout }).eq('id', userId);
  if (error) throw error;
}

export async function fetchRatedLayout(userId: string): Promise<RatedLayout | null> {
  const { data, error } = await supabase.from('profiles').select('library_layout').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data.library_layout ? asRatedLayout(data.library_layout) : null;
}

// ---------------------------------------------------------------------------
// Top 100
// ---------------------------------------------------------------------------

export const TOP_LIMIT = 100;

export interface Top100Saved {
  // filmes (ids do TMDB) na ordem escolhida
  items: number[];
  // tirados do Top 100 pela pessoa: não voltam sozinhos
  excluded: number[];
}

export async function fetchTop100(userId: string): Promise<Top100Saved | null> {
  const { data, error } = await supabase.from('library_top100').select('items, excluded').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return { items: (data.items as number[]) || [], excluded: (data.excluded as number[]) || [] };
}

export async function saveTop100(userId: string, saved: Top100Saved) {
  const { error } = await supabase
    .from('library_top100')
    .upsert({ user_id: userId, items: saved.items, excluded: saved.excluded, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

// Um título avaliado (com a nota, o tipo e, quando se sabe, o ano).
export interface RatedTitle extends ShelfEntry {
  userRating: number;
  year?: number | null;
}

// O Top 100 que aparece: primeiro os filmes na ordem guardada (os que ainda
// estão avaliados); depois, até completar 100, os outros filmes avaliados
// que a pessoa não tirou, da maior nota para a menor (no empate, o mais
// recente — `rated` vem na ordem em que entraram na biblioteca, do mais
// novo para o mais antigo). Só filmes.
export function buildTop100(rated: RatedTitle[], saved: Top100Saved | null): RatedTitle[] {
  const films = rated.filter((title) => title.media_type === 'movie');
  const byId = new Map(films.map((title) => [title.id, title]));
  const ordered: RatedTitle[] = [];
  const used = new Set<number>();
  (saved?.items || []).forEach((id) => {
    const title = byId.get(id);
    if (title && !used.has(id)) {
      ordered.push(title);
      used.add(id);
    }
  });
  const excluded = new Set(saved?.excluded || []);
  const rest = films
    .map((title, index) => ({ title, index }))
    .filter(({ title }) => !used.has(title.id) && !excluded.has(title.id))
    .sort((a, b) => b.title.userRating - a.title.userRating || a.index - b.index)
    .map(({ title }) => title);
  return [...ordered, ...rest].slice(0, TOP_LIMIT);
}

// Os filmes avaliados que estão fora do Top 100 (pra pôr de volta), da
// maior nota para a menor.
export function outsideTop100(rated: RatedTitle[], top: RatedTitle[]): RatedTitle[] {
  const inTop = new Set(top.map((title) => title.id));
  return rated
    .filter((title) => title.media_type === 'movie' && !inTop.has(title.id))
    .map((title, index) => ({ title, index }))
    .sort((a, b) => b.title.userRating - a.title.userRating || a.index - b.index)
    .map(({ title }) => title);
}

// ---------------------------------------------------------------------------
// Por década
// ---------------------------------------------------------------------------

export interface DecadeShelf<T> {
  // 1950, 2000... null = sem data
  decade: number | null;
  items: T[];
}

// Uma prateleira por década, da mais nova para a mais antiga (sem data no
// fim). Dentro de cada uma, da maior nota para a menor; no empate, a ordem
// em que entraram.
export function groupByDecade<T extends { userRating?: number | null; year?: number | null }>(titles: T[]): DecadeShelf<T>[] {
  const groups = new Map<number | null, { title: T; index: number }[]>();
  titles.forEach((title, index) => {
    const decade = typeof title.year === 'number' && title.year > 0 ? Math.floor(title.year / 10) * 10 : null;
    const list = groups.get(decade) || [];
    list.push({ title, index });
    groups.set(decade, list);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
    .map(([decade, list]) => ({
      decade,
      items: list
        .sort((x, y) => (y.title.userRating ?? -1) - (x.title.userRating ?? -1) || x.index - y.index)
        .map(({ title }) => title),
    }));
}

export const yearOf = (date?: string | null): number | null => {
  const year = Number((date || '').slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
};

export const mediaTypeOf = (value: unknown): TitleMediaType => (value === 'tv' ? 'tv' : 'movie');
