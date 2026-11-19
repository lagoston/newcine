import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { ensureMovieCachedIfMissing } from '../../lib/tmdb';
import { cache, CACHE_KEYS } from '../../lib/cache';
import { emit } from '../../lib/bus';
import { useEvent } from '../../hooks/useEvent';
import { patchTitleMe, useTitleMe, type TitleMe } from './useTitleMe';

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
  // 19/11/2026 (Reborn, onda 3): a biblioteca e a nota vêm da resposta única
  // "eu e este título" (useTitleMe → get_title_me), a mesma que serve os
  // episódios, as prateleiras, os comentários e a previsão — antes era uma
  // consulta só para isto. `me` undefined = ainda não chegou (o espaço da nota
  // fica com o esqueleto, sem piscar a prevista).
  const me = useTitleMe(movieId, mediaType);
  // O que a pessoa acabou de fazer (adicionar, remover) vale na hora, por cima
  // da resposta em que se baseou; quando a resposta muda (a cópia guardada é
  // corrigida no mesmo instante), ela volta a mandar.
  const [override, setOverride] = useState<{ on: TitleMe | undefined; relation: TitleMe['relation'] } | null>(null);
  const relation = !userId ? null : override && override.on === me ? override.relation : (me?.relation ?? null);
  const isInLibrary = relation !== null;
  const userRating = relation ? relation.rating : null;
  const userRatingLoaded = !!userId && (me !== undefined || (override !== null && override.on === me));

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

    // vale na hora na tela, e a cópia guardada de "eu e este título" já fica
    // certa (o menu não relê)
    const added = { id: relation?.id ?? '', rating: rating !== undefined ? rating : null };
    setOverride({ on: me, relation: added });
    patchTitleMe(userId, movieId, mediaType, { relation: added });
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId));
    cache.invalidatePattern('stats:');
    // 19/11/2026 (Reborn, onda 2b): aqui e no `remove` abaixo são os dois
    // únicos pontos em que o menu muda a biblioteca. O menu AVISA no barramento
    // (lib/bus.ts) e a camada de dados marca como vencido o que dependia disso
    // (lib/data/events.ts: evento sazonal e estado do Jackpot, sem pedir nada na
    // hora — refazem na próxima troca de página ou quando a tela pedir). Antes
    // era um markSeasonalStale() direto. A prop onAddToLibrary segue como era.
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

    // o que saiu: um título com nota, ou só um item da Watchlist
    const wasRated = userRating !== null;
    setOverride({ on: me, relation: null });
    patchTitleMe(userId, movieId, mediaType, { relation: null });
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(userId));
    cache.invalidatePattern('stats:');
    if (wasRated) emit('title:rated', { id: movieId, mediaType, rating: null });
    else emit('title:watchlist', { id: movieId, mediaType, on: false });
    toast.success(t('library.movieRemovedSuccess'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  });

  return { isInLibrary, userRating, userRatingLoaded, add, remove };
}
