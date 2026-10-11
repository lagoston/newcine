import { useCallback, useEffect, useState } from 'react';
import type { Movie } from './tmdb';

// Histórico de busca (11/10/2026): os últimos 10 títulos que a pessoa abriu
// pela busca (a do celular e a do topo do computador), do mais recente para
// o mais antigo. Aparece ao abrir a busca, antes de digitar.
//
// Fica neste aparelho (localStorage), separado por conta. Guarda só o que a
// linha precisa para aparecer na hora (título, pôster, ano, nota do TMDB) —
// ao tocar, os detalhes completos são buscados como num resultado comum.

export const SEARCH_HISTORY_LIMIT = 10;

export interface SearchHistoryItem {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  year: string;
  vote_average: number;
}

const EVENT = 'cineoracle:search-history';
const storageKey = (userId?: string | null) => `cineoracle:searchHistory:${userId || 'anon'}`;

export function readSearchHistory(userId?: string | null): SearchHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SearchHistoryItem[]).filter((item) => item && typeof item.id === 'number').slice(0, SEARCH_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeSearchHistory(userId: string | null | undefined, items: SearchHistoryItem[]) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(items.slice(0, SEARCH_HISTORY_LIMIT)));
  } catch {
    // sem armazenamento (aba anônima etc.): o histórico vale só nesta tela
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: storageKey(userId) }));
}

export const historyItemFromMovie = (movie: Movie): SearchHistoryItem => ({
  id: movie.id,
  media_type: movie.media_type === 'tv' ? 'tv' : 'movie',
  title: movie.title || movie.name || '',
  poster_path: movie.poster_path || null,
  year: (movie.release_date || movie.first_air_date || '').slice(0, 4),
  vote_average: typeof movie.vote_average === 'number' ? movie.vote_average : 0,
});

// Abriu um título pela busca: ele vai para o topo (sem repetir).
export function addToSearchHistory(userId: string | null | undefined, movie: Movie) {
  const item = historyItemFromMovie(movie);
  if (!item.title) return;
  const rest = readSearchHistory(userId).filter((old) => !(old.id === item.id && old.media_type === item.media_type));
  writeSearchHistory(userId, [item, ...rest]);
}

export function removeFromSearchHistory(userId: string | null | undefined, item: Pick<SearchHistoryItem, 'id' | 'media_type'>) {
  writeSearchHistory(
    userId,
    readSearchHistory(userId).filter((old) => !(old.id === item.id && old.media_type === item.media_type))
  );
}

export function clearSearchHistory(userId: string | null | undefined) {
  writeSearchHistory(userId, []);
}

// O histórico da conta, atualizado quando muda (em qualquer uma das buscas).
export function useSearchHistory(userId?: string | null) {
  const [items, setItems] = useState<SearchHistoryItem[]>(() => readSearchHistory(userId));
  useEffect(() => {
    setItems(readSearchHistory(userId));
    const onChange = () => setItems(readSearchHistory(userId));
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, [userId]);
  const add = useCallback((movie: Movie) => addToSearchHistory(userId, movie), [userId]);
  const remove = useCallback((item: SearchHistoryItem) => removeFromSearchHistory(userId, item), [userId]);
  const clear = useCallback(() => clearSearchHistory(userId), [userId]);
  return { items, add, remove, clear };
}
