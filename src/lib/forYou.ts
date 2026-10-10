import { supabase } from './supabase';
import { Movie } from './tmdb';
import { getTitleCardsInOrder } from './titleCards';
import type { OracleId } from './oracleTheme';

// "Filmes Para Você" e "Séries Para Você" (home): o top 10 de cada tipo,
// tirado das 3 prateleiras favoritas do usuário nos 3 oráculos, na ordem
// da nota prevista. O banco calcula e guarda o resultado
// (get_for_you_titles — migrações 20261008110000_for_you_titles.sql e
// 20261008120000_for_you_cache.sql); aqui só juntamos os cartões leves das
// obras (lib/titleCards — sem as temporadas das séries, que só vêm ao abrir).

export interface ForYouInfo {
  predicted: number | null;
  // chance de virar um 9 ou 10 (0 a 1)
  chance9: number | null;
  oracle: OracleId;
  moodKey: string;
}

export interface ForYouShelf {
  movies: Movie[];
  // chave "<movie|tv>:<id>"
  info: Record<string, ForYouInfo>;
}

interface ForYouRow {
  id: number;
  media_type: 'movie' | 'tv';
  predicted_rating: number | null;
  chance_9plus: number | null;
  card_type: OracleId;
  mood_key: string;
}

export const EMPTY_FOR_YOU: ForYouShelf = { movies: [], info: {} };

export async function getForYouShelf(mediaType: 'movie' | 'tv', limit = 10): Promise<ForYouShelf> {
  const { data, error } = await supabase.rpc('get_for_you_titles', { p_media_type: mediaType, p_limit: limit });
  if (error) throw error;
  const rows = (data ?? []) as ForYouRow[];
  if (rows.length === 0) return EMPTY_FOR_YOU;

  const movies = await getTitleCardsInOrder(rows.map((row) => ({ id: row.id, media_type: mediaType })));
  const info: Record<string, ForYouInfo> = {};
  rows.forEach((row) => {
    info[`${mediaType}:${row.id}`] = {
      predicted: row.predicted_rating,
      chance9: row.chance_9plus,
      oracle: row.card_type,
      moodKey: row.mood_key,
    };
  });

  return { movies: movies.map((movie) => ({ ...movie, media_type: movie.media_type || mediaType })), info };
}
