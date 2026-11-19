import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { ensureMovieCachedIfMissing } from '../../lib/tmdb';
import { cache, CACHE_KEYS } from '../../lib/cache';
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
    // Onda 2b (Protocolo Reborn): aqui e no `remove` abaixo são os dois únicos
    // pontos em que o menu muda a biblioteca. Quando a camada de dados assumir,
    // o markSeasonalStale sai e entra o aviso do barramento (lib/bus.ts):
    // emit('title:rated', { id, mediaType, rating }) com nota, ou
    // emit('title:watchlist', { id, mediaType, on: true }) sem nota. Por ora
    // fica exatamente como era (junto com a prop onAddToLibrary).
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

    setIsInLibrary(false);
    setUserRating(null);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId));
    cache.invalidatePattern('stats:');
    markSeasonalStale();
    toast.success(t('library.movieRemovedSuccess'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  });

  return { isInLibrary, userRating, userRatingLoaded, add, remove };
}
