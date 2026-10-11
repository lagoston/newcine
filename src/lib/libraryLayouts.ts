import { supabase } from './supabase';
import { ShelfEntry, TitleMediaType, titleKey } from './titleCards';
import { PROGRESSION_TAGS } from './tags';

// Organizações dos avaliados na Biblioteca. A escolha fica no perfil
// (profiles.library_layout) — o perfil da pessoa na comunidade mostra a
// coleção do mesmo jeito.
//   • Notas: uma prateleira por nota, de 10 a 0.
//   • One Grid: filmes numa prateleira, séries em outra.
//   • Melhores da Década ('decades', desde 11/10/2026): uma prateleira por
//     década, dos melhores para baixo, na ordem que a pessoa quiser. Exige a
//     tag 🏆 Cine Elite (200 títulos avaliados); sem ela, volta para Notas.
//     Substituiu o Top 100 e o Por década (10/10/2026), que saíram.

export type RatedLayout = 'notes' | 'onegrid' | 'decades';

export const RATED_LAYOUTS: RatedLayout[] = ['notes', 'onegrid', 'decades'];

// 'top100' (o Top 100, que saiu) vira Melhores da Década.
export const asRatedLayout = (value: unknown): RatedLayout =>
  value === 'top100' ? 'decades' : RATED_LAYOUTS.includes(value as RatedLayout) ? (value as RatedLayout) : 'notes';

// ---------------------------------------------------------------------------
// Cine Elite: a tag que libera Melhores da Década
// ---------------------------------------------------------------------------

const ELITE_TAG = PROGRESSION_TAGS.find((tag) => tag.name === 'Cine Elite');

export const CINE_ELITE = {
  name: 'Cine Elite',
  emoji: ELITE_TAG?.emoji ?? '🏆',
  // títulos avaliados (filmes e séries), a mesma conta da tag no app e no banco
  min: ELITE_TAG?.minMovies ?? 200,
} as const;

export const hasCineElite = (ratedCount: number) => ratedCount >= CINE_ELITE.min;

// A organização que vale de fato: Melhores da Década sem a tag vira Notas.
export const effectiveLayout = (layout: RatedLayout, ratedCount: number): RatedLayout =>
  layout === 'decades' && !hasCineElite(ratedCount) ? 'notes' : layout;

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

// Um título avaliado (com a nota, o tipo e, quando se sabe, o ano).
export interface RatedTitle extends ShelfEntry {
  userRating: number;
  year?: number | null;
}

// ---------------------------------------------------------------------------
// Melhores da Década
// ---------------------------------------------------------------------------

export interface DecadeShelf<T> {
  // 1950, 2000... null = sem data
  decade: number | null;
  items: T[];
  // nota média da pessoa nos títulos da década
  average: number | null;
  // a pessoa mudou a ordem desta década
  customized: boolean;
}

// Ordem escolhida em cada década: chave da década (decadeKey) → chaves dos
// títulos ("movie:105" / "tv:105"). Década sem ordem salva = pela nota.
export type DecadeOrders = Record<string, string[]>;

// No banco, a década sem data é 0.
export const decadeKey = (decade: number | null) => String(decade ?? 0);

export async function fetchDecadeOrders(userId: string): Promise<DecadeOrders> {
  const { data, error } = await supabase.from('library_decade_order').select('decade, item_keys').eq('user_id', userId);
  if (error || !data) return {};
  const orders: DecadeOrders = {};
  (data as { decade: number; item_keys: string[] | null }[]).forEach((row) => {
    if (row.item_keys && row.item_keys.length > 0) orders[String(row.decade)] = row.item_keys;
  });
  return orders;
}

// keys vazio = volta para a ordem das notas.
export async function saveDecadeOrder(userId: string, decade: number | null, keys: string[]) {
  const { error } = await supabase.from('library_decade_order').upsert(
    { user_id: userId, decade: decade ?? 0, item_keys: keys, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,decade' }
  );
  if (error) throw error;
}

type Rankable = { id: number; media_type?: string | null; userRating?: number | null };

const ratingOf = (title: Rankable) => (typeof title.userRating === 'number' ? title.userRating : -1);

// Aplica a ordem salva a uma década já ordenada pela nota: primeiro os
// títulos na ordem da pessoa (os que continuam avaliados); os que não estão
// nela (avaliados depois) entram pela nota, logo antes do primeiro da ordem
// salva que tem nota menor — um 10 novo vai para junto dos outros 10.
export function applyDecadeOrder<T extends Rankable>(byRating: T[], saved: string[] | undefined): T[] {
  if (!saved || saved.length === 0) return byRating;
  const byKey = new Map(byRating.map((title) => [titleKey(title), title]));
  const ordered: T[] = [];
  const used = new Set<string>();
  saved.forEach((key) => {
    const title = byKey.get(key);
    if (title && !used.has(key)) {
      ordered.push(title);
      used.add(key);
    }
  });
  byRating.forEach((title) => {
    if (used.has(titleKey(title))) return;
    const rating = ratingOf(title);
    const at = ordered.findIndex((other) => ratingOf(other) < rating);
    if (at === -1) ordered.push(title);
    else ordered.splice(at, 0, title);
  });
  return ordered;
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

// Ouro, prata e bronze para os 3 primeiros de cada década.
export const RANK_MEDALS = ['#F5C451', '#D5DCE6', '#D99A6C'] as const;

// Selo curto da década ("'90"; "?" sem data).
export const decadeBadge = (decade: number | null) => (decade === null ? '?' : `'${String(decade).slice(2)}`);

// Uma prateleira por década, da mais nova para a mais antiga (sem data no
// fim). Dentro de cada uma, da maior nota para a menor (no empate, a ordem em
// que entraram) e, se a pessoa organizou a década, na ordem dela.
export function groupByDecade<T extends Rankable & { year?: number | null }>(titles: T[], orders: DecadeOrders = {}): DecadeShelf<T>[] {
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
      const byRating = list
        .sort((x, y) => ratingOf(y.title) - ratingOf(x.title) || x.index - y.index)
        .map(({ title }) => title);
      const saved = orders[decadeKey(decade)];
      return {
        decade,
        average,
        items: applyDecadeOrder(byRating, saved),
        customized: !!saved && saved.length > 0,
      };
    });
}

export const yearOf = (date?: string | null): number | null => {
  const year = Number((date || '').slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
};

export const mediaTypeOf = (value: unknown): TitleMediaType => (value === 'tv' ? 'tv' : 'movie');
