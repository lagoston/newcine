import type React from 'react';
import type { TFunction } from 'i18next';
import { supabase } from './supabase';
import { RARITY_META, type PosterEffect, type PosterRarity, type TitleType } from './posterJackpot';

// Curadoria do catálogo de pôsteres (04/11/2026), pedido do Bruno: "ver todos
// os pôsteres que adicionamos até agora lado a lado em suas respectivas
// categorias, para ver como eles estão funcionando como um conjunto e se está
// coerente". A página /curadoria/posteres lê o catálogo inteiro pela função
// get_poster_catalog_review (migração 20261104120000), que só responde aos
// testadores do Poster Jackpot; para os outros ela levanta 'forbidden'.
// Aqui ficam os tipos, a chamada (lida com desconfiança, como o resto do
// Jackpot) e as contas que a página mostra.

export interface CurationPoster {
  id: number;
  media_type: TitleType;
  tmdb_id: number;
  rarity: PosterRarity;
  serial: number | null;
  file_path: string;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
  is_active: boolean;
  // 'poker' = um dos 9 exclusivos do Pôster Poker (fora da roleta, sempre com
  // o brilho dourado). null = pôster da roleta.
  exclusive: 'poker' | null;
  // Lote em que entrou (1, 2, 3…); null nos exclusivos do pôquer.
  batch: number | null;
  added_at: string;
  // Quantas pessoas têm o pôster (qualquer versão).
  owners: number;
}

export interface CurationCatalog {
  goal: Record<PosterRarity, number>;
  posters: CurationPoster[];
}

// Os efeitos que a vitrine deixa aplicar em todos de uma vez (o gold é só dos
// exclusivos, que sempre aparecem com ele).
export type CurationEffect = Exclude<PosterEffect, 'gold'>;
export const CURATION_EFFECTS: CurationEffect[] = ['none', 'holo', 'negative', 'ultra_red'];

export type CurationKind = 'all' | 'movie' | 'tv';
export type CurationSize = 's' | 'm' | 'l';

// A ordem das seções: do lendário ao comum; os exclusivos do pôquer à parte,
// no fim.
export const CURATION_RARITIES: PosterRarity[] = ['legendary', 'epic', 'rare', 'common'];
export type CurationSectionKey = PosterRarity | 'poker';

// O ouro dos exclusivos (o mesmo do efeito gold em EFFECT_META).
const POKER_TONE = '#F4C454';

// As variáveis de cor de uma seção (posterCuration.css): a cor da raridade,
// o brilho, o degradê do cabeçalho e o filete.
const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};
export const sectionTone = (key: CurationSectionKey): React.CSSProperties => {
  const color = key === 'poker' ? POKER_TONE : RARITY_META[key].color;
  return {
    ['--pc-tone' as string]: color,
    ['--pc-tone-glow' as string]: rgba(color, 0.45),
    ['--pc-tone-wash' as string]: rgba(color, 0.16),
    ['--pc-tone-line' as string]: rgba(color, 0.55),
    ['--pc-tone-ring' as string]: rgba(color, 0.6),
    ['--pj-gem-glow' as string]: key === 'poker' ? rgba(color, 0.7) : RARITY_META[key].glow,
  };
};

// A meta da migração, caso o servidor um dia não mande o campo.
const DEFAULT_GOAL: Record<PosterRarity, number> = { common: 80, rare: 60, epic: 40, legendary: 20 };

type Row = Record<string, unknown>;
const RARITY_SET = new Set<string>(CURATION_RARITIES);
const num = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

// O motivo de uma falha: sem permissão (a função levanta 'forbidden') ou
// qualquer outra coisa (rede, servidor), que a página trata com "tentar de novo".
export type CurationErrorCode = 'forbidden' | 'error';
export const curationErrorCode = (error: unknown): CurationErrorCode => {
  const message = (error as { message?: string })?.message || '';
  return message.includes('forbidden') ? 'forbidden' : 'error';
};

export async function fetchPosterCatalogReview(): Promise<CurationCatalog> {
  const { data, error } = await supabase.rpc('get_poster_catalog_review');
  if (error) throw error;
  const raw = (data || {}) as Row;
  const goalRaw = (raw.goal || {}) as Row;
  const goal = CURATION_RARITIES.reduce(
    (acc, rarity) => ({ ...acc, [rarity]: num(goalRaw[rarity]) || DEFAULT_GOAL[rarity] }),
    {} as Record<PosterRarity, number>
  );
  // Linha torta (sem raridade conhecida ou sem arquivo) fica de fora: a
  // vitrine nunca cai por causa de um pôster.
  const posters = (Array.isArray(raw.posters) ? (raw.posters as Row[]) : [])
    .filter((p) => p && RARITY_SET.has(p.rarity as string) && typeof p.file_path === 'string')
    .map(
      (p): CurationPoster => ({
        id: num(p.id),
        media_type: p.media_type === 'tv' ? 'tv' : 'movie',
        tmdb_id: num(p.tmdb_id),
        rarity: p.rarity as PosterRarity,
        serial: p.serial == null ? null : num(p.serial),
        file_path: p.file_path as string,
        title_pt: text(p.title_pt),
        title_en: text(p.title_en),
        year: p.year == null ? null : num(p.year) || null,
        is_active: p.is_active === true,
        exclusive: p.exclusive === 'poker' ? 'poker' : null,
        batch: p.batch == null ? null : num(p.batch) || null,
        added_at: typeof p.added_at === 'string' ? p.added_at : '',
        owners: num(p.owners),
      })
    );
  return { goal, posters };
}

// Pelo número de colecionador (sem número por último, pelo id).
export const bySerial = (a: CurationPoster, b: CurationPoster) =>
  (a.serial ?? Number.MAX_SAFE_INTEGER) - (b.serial ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;

// Busca sem acento e sem caixa ("amelie" acha "Amélie").
export const foldText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// O efeito que um pôster mostra na vitrine: os exclusivos sempre com o gold;
// os da roleta com o escolhido na barra.
export const tileEffect = (poster: Pick<CurationPoster, 'exclusive'>, effect: CurationEffect): PosterEffect => (poster.exclusive ? 'gold' : effect);

// "faltam 13", "meta atingida", "4 acima da meta".
export const goalStatus = (t: TFunction, count: number, goal: number) => {
  if (count > goal) return t('curation.posters.section.over', { count: count - goal });
  if (count === goal) return t('curation.posters.section.done');
  return t('curation.posters.section.missing', { count: goal - count });
};

// O id da seção na página (o resumo do topo rola até ela).
export const sectionDomId = (key: CurationSectionKey) => `pc-section-${key}`;

export const tmdbPageUrl =(poster: Pick<CurationPoster, 'media_type' | 'tmdb_id'>) =>
  `https://www.themoviedb.org/${poster.media_type === 'tv' ? 'tv' : 'movie'}/${poster.tmdb_id}`;

// O resumo do topo: a roleta (pôsteres não exclusivos e ativos) contra a meta.
export interface CurationTotals {
  roulette: number;
  goal: number;
  byRarity: Record<PosterRarity, number>;
  // Fora da roleta (is_active = false), por raridade; os exclusivos não entram.
  inactiveByRarity: Record<PosterRarity, number>;
  inactive: number;
  movies: number;
  series: number;
  exclusives: number;
  batches: number[];
}

const zero = (): Record<PosterRarity, number> => ({ common: 0, rare: 0, epic: 0, legendary: 0 });

export function curationTotals(catalog: CurationCatalog): CurationTotals {
  const byRarity = zero();
  const inactiveByRarity = zero();
  const batches = new Set<number>();
  let movies = 0;
  let series = 0;
  let exclusives = 0;
  catalog.posters.forEach((p) => {
    if (p.exclusive) {
      exclusives += 1;
      return;
    }
    if (p.batch) batches.add(p.batch);
    if (!p.is_active) {
      inactiveByRarity[p.rarity] += 1;
      return;
    }
    byRarity[p.rarity] += 1;
    if (p.media_type === 'tv') series += 1;
    else movies += 1;
  });
  const inactive = CURATION_RARITIES.reduce((sum, r) => sum + inactiveByRarity[r], 0);
  return {
    roulette: CURATION_RARITIES.reduce((sum, r) => sum + byRarity[r], 0),
    goal: CURATION_RARITIES.reduce((sum, r) => sum + catalog.goal[r], 0),
    byRarity,
    inactiveByRarity,
    inactive,
    movies,
    series,
    exclusives,
    batches: [...batches].sort((a, b) => a - b),
  };
}
