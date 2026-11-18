import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { ensureMovieCachedIfMissing } from '../../lib/tmdb';
import { cache, CACHE_KEYS } from '../../lib/cache';
import { emit } from '../../lib/bus';
import { markSeasonalStale } from '../../contexts/SeasonalEventContext';
import { useEvent } from '../../hooks/useEvent';

// O título na biblioteca de quem olha: está lá? com que nota? Mais as duas
// ações do rodapé (adicionar e remover). Fica na casca do menu, porque o
// placar, o rodapé, as temporadas e as resenhas dependem disto.
//
// 18/11/2026 (otimização, rede.md A3): "está na minha biblioteca?" e "minha
// nota" numa consulta só (eram duas), já com o tipo do título — a nota antes
// vinha sem filtrar filme/série, e um filme e uma série com o mesmo número
// no TMDB faziam o maybeSingle falhar (a nota sumia).
export function useTitleRelation(
  movieId: number,
  mediaType: 'movie' | 'tv',
  userId: string | null,
  onAddToLibrary?: () => void
) {
  const { t } = useTranslation();
  const [isInLibrary, setIsInLibrary] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(null);
  // A nota do próprio usuário chega por uma consulta separada — até ela
  // voltar, o espaço da nota fica com um esqueleto (sem piscar a prevista).
  const [userRatingLoaded, setUserRatingLoaded] = useState(false);
  // de qual pedido é a resposta (trocar de título no meio não pode pôr a nota
  // do anterior no novo)
  const request = useRef(0);

  useEffect(() => {
    if (!userId) return;
    const mine = ++request.current;
    setUserRatingLoaded(false);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_movies')
          .select(`
          id,
          rating,
          movies!inner(media_type)
        `)
          .eq('user_id', userId)
          .eq('movie_id', movieId)
          .eq('movies.media_type', mediaType)
          .maybeSingle();

        if (mine !== request.current) return;
        if (error) {
          console.warn('Error checking library:', error);
          return;
        }

        setIsInLibrary(data !== null);
        setUserRating(data?.rating !== undefined ? data.rating : null);
      } catch (error) {
        console.error('Error checking library:', error);
      } finally {
        if (mine === request.current) setUserRatingLoaded(true);
      }
    })();
  }, [userId, movieId, mediaType]);

  const add = useEvent(async (rating?: number) => {
    if (!userId) return;

    // O título entra no banco antes (cache-title, só se faltar). A linha em
    // movies, que a biblioteca exige, o próprio banco cria ao inserir
    // (gatilho ensure_movies_row_for_library, 12/10/2026).
    await ensureMovieCachedIfMissing(movieId, mediaType);

    const insertData: Record<string, unknown> = {
      movie_id: movieId,
      media_type: mediaType,
      user_id: userId,
    };
    if (rating !== undefined) insertData.rating = rating;

    const { error: libraryError } = await supabase
      .from('user_movies')
      .insert(insertData);

    if (libraryError) throw libraryError;

    setIsInLibrary(true);
    setUserRating(rating !== undefined ? rating : null);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId));
    cache.invalidatePattern('stats:');
    // pode ter avançado o evento sazonal: confere na próxima troca de página
    markSeasonalStale();
    // 18/11/2026 (Protocolo Reborn): o menu também avisa pelo barramento
    // (lib/bus.ts) o que mudou, com o título e a nota; as telas e a camada de
    // dados escutam. As props onAddToLibrary continuam chamadas como antes.
    if (rating !== undefined) emit('title:rated', { id: movieId, mediaType, rating });
    else emit('title:watchlist', { id: movieId, mediaType, on: true });
    toast.success(t('library.inLibrary'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  });

  const remove = useEvent(async () => {
    if (!userId) return;

    const { error } = await supabase
      .from('user_movies')
      .delete()
      .eq('movie_id', movieId)
      .eq('media_type', mediaType)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing from library:', error);
      toast.error(t('common.error'));
      return;
    }

    const hadRating = userRating !== null;
    setIsInLibrary(false);
    setUserRating(null);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId));
    cache.invalidatePattern('stats:');
    markSeasonalStale();
    if (hadRating) emit('title:rated', { id: movieId, mediaType, rating: null });
    else emit('title:watchlist', { id: movieId, mediaType, on: false });
    toast.success(t('library.movieRemovedSuccess'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  });

  return { isInLibrary, userRating, userRatingLoaded, add, remove };
}
