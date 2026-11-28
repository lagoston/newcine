import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { getMovieDetails, getMoviesFromCacheByType, type Movie } from './tmdb';
import type { SeasonalEventState } from './seasonalEvents';

// A lista de filmes de um evento sazonal, pronta para a tela (28/11/2026).
//
// Estas três leituras moravam dentro do painel do evento. Saíram para cá porque
// agora dois lugares mostram a lista: o painel do Halloween (como sempre) e a
// prateleira "Lista de Natal" da home (pedido do Bruno em 25/11: o painel de
// Natal "deve 'perder' sua lista de filmes que vai ser transportada como uma
// lista extra e por primeiro, acima de popular agora").
//
//   movies       os filmes, na ordem do evento (null = ainda chegando)
//   own          o que a pessoa tem desses filmes: nota, ou null = na Watchlist
//   predictions  a nota prevista (o mesmo modelo das prateleiras dos oráculos)

export interface SeasonalList {
  movies: Movie[] | null;
  own: Map<number, number | null>;
  predictions: Record<number, number>;
}

export function useSeasonalList(event: SeasonalEventState | null): SeasonalList {
  const { i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [movies, setMovies] = useState<Movie[] | null>(null);
  const [own, setOwn] = useState<Map<number, number | null>>(new Map());
  const [predictions, setPredictions] = useState<Record<number, number>>({});
  const predictedFor = useRef('');

  const hasEvent = Boolean(event);
  const idsKey = event ? event.items.map((item) => item.id).join(',') : '';

  // Filmes da seleção, na ordem do evento (cache do banco; o TMDB só se faltar).
  useEffect(() => {
    if (!idsKey) {
      // sem evento: nada; evento sem lista: lista vazia (a tela avisa)
      setMovies(hasEvent ? [] : null);
      return;
    }
    let cancelled = false;
    const ids = idsKey.split(',').map(Number);
    (async () => {
      const cached = await getMoviesFromCacheByType(ids.map((id) => ({ movie_id: id, media_type: 'movie' })));
      const list = await Promise.all(
        ids.map(async (id) => cached.get(`${id}_movie`) ?? (await getMovieDetails(id, 'movie').catch(() => null))),
      );
      if (!cancelled) setMovies(list.filter((movie): movie is Movie => Boolean(movie?.poster_path)));
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, hasEvent, i18n.language]);

  // Notas e watchlist da pessoa nesses filmes (de novo a cada atualização do evento).
  useEffect(() => {
    if (!userId || !idsKey) return;
    let cancelled = false;
    supabase
      .from('user_movies')
      .select('movie_id, rating, media_type')
      .eq('user_id', userId)
      .in('movie_id', idsKey.split(',').map(Number))
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as { movie_id: number; rating: number | null; media_type: string | null }[];
        setOwn(new Map(rows.filter((row) => (row.media_type ?? 'movie') === 'movie').map((row) => [row.movie_id, row.rating])));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, idsKey, event]);

  // Nota prevista (uma vez por lista).
  useEffect(() => {
    if (!userId || !idsKey || predictedFor.current === idsKey) return;
    predictedFor.current = idsKey;
    supabase.functions
      .invoke('predict-watchlist-ratings', { body: { movieIds: idsKey.split(',').map(Number) } })
      .then(({ data }) => setPredictions((data?.ratings as Record<number, number>) ?? {}))
      .catch(() => {});
  }, [userId, idsKey]);

  return { movies, own, predictions };
}
