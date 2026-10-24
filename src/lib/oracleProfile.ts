import { supabase } from './supabase';
import type { OracleId } from './oracleTheme';

// Perfil do oráculo (21/10/2026): os números das nove prateleiras dele, os
// destaques, o Top 10 de filmes e de séries, os diretores que ele mais guarda
// e "você e ele". Vem pronto de get_oracle_profile — ver as migrações
// 20261021233000_oracle_profile.sql e 20261024120000_oracle_profile_top_by_shelf.sql.
//
// Top 10 (desde 24/10/2026): o 1º é uma surpresa sorteada entre os 10 mais
// bem avaliados do oráculo; os outros, o mais bem avaliado de cada uma das
// nove prateleiras, na ordem das favoritas da pessoa (composeTop). Nada
// lançado nos últimos 365 dias.

export type HighlightKey = 'popular' | 'best' | 'newest' | 'oldest' | 'gem' | 'bomb' | 'obscure';

export interface OracleTitle {
  id: number;
  type: 'movie' | 'tv';
  titlePt: string | null;
  titleEn: string | null;
  poster: string | null;
  posterPt: string | null;
  year: number | null;
  vote: number | null;
  votes: number;
  mood: string;
  // Na biblioteca da pessoa (nota, ou Watchlist quando rating é null).
  inLibrary: boolean;
  rating: number | null;
}

// Os candidatos do Top 10: os 10 melhores do oráculo (para a surpresa) e os
// 3 melhores de cada prateleira, na ordem da pessoa.
export interface OracleTopSet {
  overall: OracleTitle[];
  shelves: { mood: string; items: OracleTitle[] }[];
}

export interface OracleTopEntry {
  title: OracleTitle;
  surprise: boolean;
}

export interface OracleProfile {
  oracle: OracleId;
  movies: number;
  series: number;
  avgVote: number | null;
  hours: number | null;
  countries: number;
  topCountry: string | null;
  years: { min: number | null; max: number | null };
  decades: { decade: number; count: number }[];
  directors: { id: number | null; name: string; count: number; photo: string | null }[];
  highlights: Partial<Record<HighlightKey, OracleTitle>>;
  top: { movies: OracleTopSet; series: OracleTopSet };
  you: { rated: number; avg: number | null; overall: number | null; watchlist: number; loved: number } | null;
}

// Os três destaques de cada oráculo, conforme o jeito dele: o Bogart é
// popular e moderno, o Fincher é clássico e cult, o Cypher guarda o
// underground e as bombas.
export const ORACLE_HIGHLIGHTS: Record<OracleId, HighlightKey[]> = {
  bogart: ['popular', 'newest', 'gem'],
  fincher: ['oldest', 'popular', 'gem'],
  cypher: ['bomb', 'obscure', 'gem'],
};

type Row = Record<string, unknown>;
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : value == null ? null : Number(value) || null);
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const toTitle = (row: unknown): OracleTitle | null => {
  if (!row || typeof row !== 'object') return null;
  const r = row as Row;
  const id = Number(r.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    type: r.type === 'tv' ? 'tv' : 'movie',
    titlePt: str(r.title_pt),
    titleEn: str(r.title_en),
    poster: str(r.poster),
    posterPt: str(r.poster_pt),
    year: num(r.year),
    vote: num(r.vote),
    votes: Number(r.votes) || 0,
    mood: str(r.mood) || '',
    inLibrary: r.lib === true,
    rating: typeof r.rating === 'number' ? r.rating : null,
  };
};
const toTitles = (value: unknown) => (Array.isArray(value) ? value.map(toTitle).filter((t): t is OracleTitle => t !== null) : []);
const toTopSet = (value: unknown): OracleTopSet => {
  const raw = (value && typeof value === 'object' ? value : {}) as Row;
  return {
    overall: toTitles(raw.overall),
    shelves: Array.isArray(raw.shelves)
      ? (raw.shelves as Row[]).map((s) => ({ mood: str(s.mood) || '', items: toTitles(s.items) })).filter((s) => s.mood)
      : [],
  };
};

// Monta o Top 10: a surpresa (sorteada com `seed`, entre 0 e 1) e, depois, o
// melhor de cada prateleira que ainda não apareceu.
export function composeTop(set: OracleTopSet, seed: number): OracleTopEntry[] {
  const out: OracleTopEntry[] = [];
  const used = new Set<string>();
  const keyOf = (title: OracleTitle) => `${title.type}:${title.id}`;
  if (set.overall.length > 0) {
    const pick = set.overall[Math.min(set.overall.length - 1, Math.floor(seed * set.overall.length))];
    out.push({ title: pick, surprise: true });
    used.add(keyOf(pick));
  }
  for (const shelf of set.shelves) {
    const best = shelf.items.find((item) => !used.has(keyOf(item)));
    if (!best) continue;
    out.push({ title: best, surprise: false });
    used.add(keyOf(best));
  }
  return out.slice(0, 10);
}

const cache = new Map<OracleId, OracleProfile>();

export function peekOracleProfile(id: OracleId): OracleProfile | undefined {
  return cache.get(id);
}

export async function getOracleProfile(id: OracleId): Promise<OracleProfile> {
  const { data, error } = await supabase.rpc('get_oracle_profile', { p_oracle: id });
  if (error) throw error;
  if (!data) throw new Error('oracle profile: empty');
  const raw = data as Row;
  const highlightsRaw = (raw.highlights || {}) as Row;
  const highlights: OracleProfile['highlights'] = {};
  (Object.keys(highlightsRaw) as HighlightKey[]).forEach((key) => {
    const title = toTitle(highlightsRaw[key]);
    if (title) highlights[key] = title;
  });
  const top = (raw.top || {}) as Row;
  const you = raw.you as Row | null;
  const years = (raw.years || {}) as Row;
  const profile: OracleProfile = {
    oracle: id,
    movies: Number(raw.movies) || 0,
    series: Number(raw.series) || 0,
    avgVote: num(raw.avg_vote),
    hours: num(raw.hours),
    countries: Number(raw.countries) || 0,
    topCountry: str(raw.top_country),
    years: { min: num(years.min), max: num(years.max) },
    decades: Array.isArray(raw.decades) ? (raw.decades as Row[]).map((d) => ({ decade: Number(d.d), count: Number(d.n) || 0 })) : [],
    directors: Array.isArray(raw.directors)
      ? (raw.directors as Row[]).map((d) => ({ id: num(d.id), name: str(d.name) || '', count: Number(d.n) || 0, photo: str(d.photo) }))
      : [],
    highlights,
    top: { movies: toTopSet(top.movies), series: toTopSet(top.series) },
    you: you
      ? {
          rated: Number(you.rated) || 0,
          avg: num(you.avg),
          overall: num(you.overall),
          watchlist: Number(you.watchlist) || 0,
          loved: Number(you.loved) || 0,
        }
      : null,
  };
  cache.set(id, profile);
  return profile;
}

// Título e capa no idioma da tela.
export const oracleTitleName = (title: OracleTitle, lang: string) =>
  (lang.startsWith('pt') ? title.titlePt || title.titleEn : title.titleEn || title.titlePt) || '';
export const oracleTitlePoster = (title: OracleTitle, lang: string) =>
  (lang.startsWith('pt') ? title.posterPt || title.poster : title.poster || title.posterPt) || null;
