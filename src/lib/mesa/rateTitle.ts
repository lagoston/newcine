import { supabase } from '../supabase';
import { cache, CACHE_KEYS } from '../cache';
import { ensureMovieCachedIfMissing } from '../tmdb';
import { loadTitleCards, titleKey } from '../titleCards';

// A nota e a Watchlist pela Mesa (SPEC §7.6), 05/11/2026. É o MESMO caminho de
// src/components/connection/CalibrateRow.tsx (copiado, sem editar o original):
// o título garantido no banco, os gêneros para o espectrograma antigo e a linha
// em user_movies. Assim disparam os gatilhos de sempre (Persona, tags, Jackpot,
// acerto da previsão, Conexão) e o gatilho novo da Mesa preenche o veredito.
// O servidor nunca confia no número que a Mesa manda: mesa_react lê a nota
// daqui de user_movies.

export interface RateRef {
  id: number;
  media_type: 'movie' | 'tv';
}

function invalidate(userId: string) {
  cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId));
  cache.invalidatePattern('stats:');
}

export async function saveRating(userId: string, ref: RateRef, rating: number): Promise<void> {
  await ensureMovieCachedIfMissing(ref.id, ref.media_type);
  loadTitleCards([ref])
    .then((cards) => {
      const genres = cards.get(titleKey(ref))?.genres;
      if (genres && genres.length > 0) return supabase.rpc('cache_movie_genres', { p_movie_id: ref.id, p_genres: genres });
      return undefined;
    })
    .then(
      () => undefined,
      () => undefined
    );
  const { error } = await supabase.from('user_movies').insert({ movie_id: ref.id, media_type: ref.media_type, user_id: userId, rating });
  if (error) {
    // 23505: já estava na biblioteca (Watchlist): só ganha a nota.
    if (error.code !== '23505') throw error;
    const { error: e2 } = await supabase
      .from('user_movies')
      .update({ rating })
      .eq('user_id', userId)
      .eq('movie_id', ref.id)
      .eq('media_type', ref.media_type);
    if (e2) throw e2;
  }
  invalidate(userId);
}

// Watchlist = linha em user_movies com rating null. Se já existe (na lista ou
// avaliado), não mexe: 23505 é sucesso aqui.
export async function addToWatchlist(userId: string, ref: RateRef): Promise<void> {
  await ensureMovieCachedIfMissing(ref.id, ref.media_type);
  const { error } = await supabase.from('user_movies').insert({ movie_id: ref.id, media_type: ref.media_type, user_id: userId, rating: null });
  if (error && error.code !== '23505') throw error;
  invalidate(userId);
}
