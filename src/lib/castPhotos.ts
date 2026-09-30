import { supabase } from './supabase';

// Fotos do elenco. A foto de cada artista é "cadastrada" uma vez só na
// tabela people (pela edge function cast-photos, que busca no TMDB) e daí
// em diante vem sempre do banco do site — em qualquer filme em que ele
// apareça. Nada aqui é atualizado periodicamente como o movie_cache.
//
// Fluxo: 1) lê do banco os artistas pedidos; 2) só se faltar alguém chama
// a function, que cadastra o elenco daquele título e devolve as fotos.

export const PROFILE_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';

type PhotoMap = Record<number, string | null>;

// Cache da sessão: o mesmo artista em vários filmes não vai ao banco de novo.
const sessionPhotos = new Map<number, string | null>();

export async function getCastPhotos(movieId: number, mediaType: 'movie' | 'tv', personIds: number[]): Promise<PhotoMap> {
  const ids = [...new Set(personIds.filter((id) => Number.isInteger(id) && id > 0))];
  const result: PhotoMap = {};
  if (ids.length === 0) return result;

  const pending = ids.filter((id) => {
    if (sessionPhotos.has(id)) {
      result[id] = sessionPhotos.get(id) ?? null;
      return false;
    }
    return true;
  });
  if (pending.length === 0) return result;

  // 1) O que já está cadastrado no banco.
  const { data, error } = await supabase.from('people').select('tmdb_id, profile_path').in('tmdb_id', pending);
  if (!error) {
    for (const row of data || []) {
      result[row.tmdb_id] = row.profile_path ?? null;
      sessionPhotos.set(row.tmdb_id, row.profile_path ?? null);
    }
  }

  // 2) Quem ainda não foi cadastrado: pede à function (uma vez por título).
  const missing = pending.filter((id) => !(id in result));
  if (missing.length > 0) {
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('cast-photos', {
        body: { movieId, mediaType, ids: missing },
      });
      if (!fnError && fnData?.photos) {
        for (const [key, path] of Object.entries(fnData.photos as Record<string, string | null>)) {
          const id = Number(key);
          result[id] = path ?? null;
          sessionPhotos.set(id, path ?? null);
        }
      }
    } catch (fnErr) {
      console.error('Error registering cast photos:', fnErr);
    }
  }

  return result;
}
