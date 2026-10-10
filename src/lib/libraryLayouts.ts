import { supabase } from './supabase';
import { ShelfEntry, TitleMediaType, titleKey } from './titleCards';

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

// Desde 10/10/2026 o Top 100 tem filmes e séries, guardados por chave
// ("movie:105" / "tv:105" — os números do TMDB se repetem entre os dois).
export interface Top100Saved {
  // títulos na ordem escolhida
  items: string[];
  // tirados do Top 100 pela pessoa: não voltam sozinhos
  excluded: string[];
  // Duelo: o começo da lista já confirmado em duelos (pra continuar de onde
  // parou), os desafiantes de fora que perderam e quantos duelos já foram.
  duelSorted: string[];
  duelRejected: string[];
  duelCount: number;
}

export const EMPTY_TOP100: Top100Saved = { items: [], excluded: [], duelSorted: [], duelRejected: [], duelCount: 0 };

export async function fetchTop100(userId: string): Promise<Top100Saved | null> {
  const { data, error } = await supabase
    .from('library_top100')
    .select('item_keys, excluded_keys, duel_sorted, duel_rejected, duel_count')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    items: (data.item_keys as string[]) || [],
    excluded: (data.excluded_keys as string[]) || [],
    duelSorted: (data.duel_sorted as string[]) || [],
    duelRejected: (data.duel_rejected as string[]) || [],
    duelCount: (data.duel_count as number) || 0,
  };
}

export async function saveTop100(userId: string, saved: Top100Saved) {
  const { error } = await supabase.from('library_top100').upsert(
    {
      user_id: userId,
      item_keys: saved.items,
      excluded_keys: saved.excluded,
      duel_sorted: saved.duelSorted,
      duel_rejected: saved.duelRejected,
      duel_count: saved.duelCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

// Um título avaliado (com a nota, o tipo e, quando se sabe, o ano).
export interface RatedTitle extends ShelfEntry {
  userRating: number;
  year?: number | null;
}

// O Top 100 que aparece: primeiro os títulos na ordem guardada (os que
// ainda estão avaliados); depois, até completar 100, os outros avaliados que
// a pessoa não tirou, da maior nota para a menor (no empate, o mais recente —
// `rated` vem na ordem em que entraram na biblioteca, do mais novo para o
// mais antigo). Filmes e séries.
export function buildTop100(rated: RatedTitle[], saved: Top100Saved | null): RatedTitle[] {
  const byKey = new Map(rated.map((title) => [titleKey(title), title]));
  const ordered: RatedTitle[] = [];
  const used = new Set<string>();
  (saved?.items || []).forEach((key) => {
    const title = byKey.get(key);
    if (title && !used.has(key)) {
      ordered.push(title);
      used.add(key);
    }
  });
  const excluded = new Set(saved?.excluded || []);
  const rest = rated
    .map((title, index) => ({ title, index }))
    .filter(({ title }) => !used.has(titleKey(title)) && !excluded.has(titleKey(title)))
    .sort((a, b) => b.title.userRating - a.title.userRating || a.index - b.index)
    .map(({ title }) => title);
  return [...ordered, ...rest].slice(0, TOP_LIMIT);
}

// Os avaliados que estão fora do Top 100 (pra pôr de volta), da maior nota
// para a menor.
export function outsideTop100(rated: RatedTitle[], top: RatedTitle[]): RatedTitle[] {
  const inTop = new Set(top.map(titleKey));
  return rated
    .map((title, index) => ({ title, index }))
    .filter(({ title }) => !inTop.has(titleKey(title)))
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
  // nota média da pessoa nos títulos da década
  average: number | null;
}

// Cores das eras — as mesmas do card "Década favorita" do Perfil
// (ProfileTaste): cinema de avô até os anos 70 (âmbar), nostálgico dos 80
// aos 2000 (azul), moderno dos 2010 em diante (verde).
export const DECADE_ERA_COLORS = {
  grandpa: '#F59E0B',
  nostalgic: '#38BDF8',
  modern: '#34D399',
} as const;

export type DecadeEra = keyof typeof DECADE_ERA_COLORS;

export const decadeEra = (decade: number): DecadeEra => (decade < 1980 ? 'grandpa' : decade < 2010 ? 'nostalgic' : 'modern');

export const decadeColor = (decade: number | null): string | undefined =>
  decade === null ? undefined : DECADE_ERA_COLORS[decadeEra(decade)];

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
    .map(([decade, list]) => {
      const rated = list.filter(({ title }) => typeof title.userRating === 'number');
      const average = rated.length > 0 ? rated.reduce((sum, { title }) => sum + (title.userRating as number), 0) / rated.length : null;
      return {
        decade,
        average,
        items: list
          .sort((x, y) => (y.title.userRating ?? -1) - (x.title.userRating ?? -1) || x.index - y.index)
          .map(({ title }) => title),
      };
    });
}

export const yearOf = (date?: string | null): number | null => {
  const year = Number((date || '').slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
};

export const mediaTypeOf = (value: unknown): TitleMediaType => (value === 'tv' ? 'tv' : 'movie');
