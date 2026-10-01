import { supabase } from './supabase';

// Sagas, trilogias e continuações (botão "Saga/Trilogia…" no menu do
// filme). Os dados moram nas tabelas movie_collections e
// movie_collection_parts, preenchidas pela edge function movie-collection a
// partir do TMDB (uma vez por filme/coleção, conferidas de novo a cada 30
// dias) — ou à mão no Supabase (source = 'manual'; ver a migração
// 20260930230000_movie_collections.sql).
//
// Fluxo: lê direto das tabelas; só chama a function quando o filme ainda
// não foi conferido, quando a coleção do TMDB está velha ou quando uma
// coleção manual tem partes ainda sem título.

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CollectionPart {
  movie_id: number;
  position: number | null;
  title_en: string | null;
  title_pt: string | null;
  release_date: string | null;
  poster_path: string | null;
  poster_path_pt: string | null;
}

export interface MovieCollection {
  id: number;
  name_en: string | null;
  name_pt: string | null;
  poster_path: string | null;
  source: 'tmdb' | 'manual';
  fetched_at: string;
  parts: CollectionPart[];
}

const isStale = (iso: string | null | undefined) => !iso || Date.now() - new Date(iso).getTime() > STALE_MS;

// Cache da sessão: o mesmo filme não vai ao banco duas vezes.
const sessionCollections = new Map<number, MovieCollection[]>();

async function readFromDb(movieId: number): Promise<MovieCollection[] | null> {
  const { data: memberships, error } = await supabase.from('movie_collection_parts').select('collection_id').eq('movie_id', movieId);
  if (error) return null;
  const ids = [...new Set((memberships || []).map((m) => m.collection_id as number))];
  if (ids.length === 0) return [];
  const [{ data: collections }, { data: parts }] = await Promise.all([
    supabase.from('movie_collections').select('*').in('id', ids),
    supabase.from('movie_collection_parts').select('*').in('collection_id', ids),
  ]);
  return (collections || []).map((c) => ({ ...c, parts: (parts || []).filter((p) => p.collection_id === c.id) })) as MovieCollection[];
}

async function askServer(movieId: number): Promise<MovieCollection[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('movie-collection', { body: { movieId } });
    if (error || !Array.isArray(data?.collections)) return null;
    return data.collections as MovieCollection[];
  } catch (err) {
    console.error('Error loading movie collection:', err);
    return null;
  }
}

export async function getMovieCollections(movieId: number): Promise<MovieCollection[]> {
  const cached = sessionCollections.get(movieId);
  if (cached) return cached;

  let collections = await readFromDb(movieId);

  if (collections && collections.length === 0) {
    // Ainda não está em nenhuma coleção: já foi conferido há pouco?
    const { data: check } = await supabase.from('movie_collection_checks').select('checked_at').eq('movie_id', movieId).maybeSingle();
    if (!check || isStale(check.checked_at)) collections = (await askServer(movieId)) ?? [];
  } else if (collections && collections.some((c) => (c.source === 'tmdb' && isStale(c.fetched_at)) || (c.source === 'manual' && c.parts.some((p) => !p.title_en)))) {
    collections = (await askServer(movieId)) ?? collections;
  } else if (!collections) {
    collections = (await askServer(movieId)) ?? [];
  }

  const result = collections.filter((c) => c.parts.length >= 2);
  sessionCollections.set(movieId, result);
  return result;
}

// "Duna: Coleção" / "Dune Collection" → "Duna" / "Dune".
export function collectionDisplayName(collection: MovieCollection, isPt: boolean): string {
  const raw = (isPt ? collection.name_pt || collection.name_en : collection.name_en || collection.name_pt) || '';
  return raw.replace(/\s*[-–—:]?\s*(Coleção|Colecção|Collection)$/i, '').trim() || raw;
}

// Partes em ordem: a posição manual quando houver; senão, a data de estreia
// (sem data vai pro fim).
export function sortedParts(collection: MovieCollection): CollectionPart[] {
  return [...collection.parts].sort((a, b) => {
    if (a.position !== null && b.position !== null) return a.position - b.position;
    if (a.position !== null) return -1;
    if (b.position !== null) return 1;
    if (!a.release_date) return 1;
    if (!b.release_date) return -1;
    return a.release_date.localeCompare(b.release_date);
  });
}
