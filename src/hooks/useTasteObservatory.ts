import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { decadeKey, fetchDecadeOrders, saveDecadeOrder as persistDecadeOrder, type DecadeOrders } from '../lib/libraryLayouts';
import {
  averageRating,
  decadeBands,
  favoriteBand,
  hiddenGems,
  keywordAffinity,
  moodSlices,
  peopleAffinity,
  ratedOnly,
  type PersonAffinity,
} from '../lib/tasteStats';
import { getPeoplePhotos, type PersonPhoto } from '../lib/peoplePhotos';
import type { UserPersona } from '../lib/persona';
import { titleKey } from '../lib/titleCards';
import type { MovieWithRating } from './useProfileData';

// Tudo o que o observatório do perfil mostra, a partir dos filmes que
// useProfileData já carregou — mais três leituras pequenas: em que
// prateleira está cada filme (roda dos humores), a ordem das décadas da
// Biblioteca e as fotos das pessoas destacadas.

export function useTasteObservatory(userId: string | undefined, movies: MovieWithRating[], persona: UserPersona | null) {
  // Prateleira de cada título avaliado, por "movie:123" / "tv:456" (filmes e
  // séries; desde 21/10/2026 as séries das prateleiras também contam).
  const [moodByMovie, setMoodByMovie] = useState<Map<string, string> | null>(null);
  const [orders, setOrders] = useState<DecadeOrders>({});
  const [photos, setPhotos] = useState<Map<string, PersonPhoto>>(new Map());
  const ratedCount = useMemo(() => ratedOnly(movies).length, [movies]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc('get_profile_mood_titles_v2', { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setMoodByMovie(null);
        return;
      }
      setMoodByMovie(
        new Map((data as { movie_id: number; media_type: string; mood_key: string }[]).map((row) => [titleKey({ id: row.movie_id, media_type: row.media_type }), row.mood_key]))
      );
    });
    fetchDecadeOrders(userId).then((found) => !cancelled && setOrders(found));
    return () => {
      cancelled = true;
    };
  }, [userId, ratedCount]);

  const prior = useMemo(() => averageRating(movies) ?? 7, [movies]);
  const moods = useMemo(() => moodSlices(movies, moodByMovie, persona, prior), [movies, moodByMovie, persona, prior]);
  const topKeywords = useMemo(() => keywordAffinity(movies, prior, { minCount: 3, limit: 10 }), [movies, prior]);
  const actors = useMemo(() => peopleAffinity(movies, prior, 'cast', 5), [movies, prior]);
  const directors = useMemo(() => peopleAffinity(movies, prior, 'director', 5), [movies, prior]);
  const bands = useMemo(() => decadeBands(movies, orders), [movies, orders]);
  const favorite = useMemo(() => favoriteBand(bands), [bands]);
  const gems = useMemo(() => hiddenGems(movies, 3), [movies]);

  // Nova ordem de uma década (só no seu perfil): grava no mesmo lugar da
  // Biblioteca e já reordena a fileira. Vazio = volta para a ordem das notas.
  const saveDecadeOrder = useCallback(
    async (decade: number, keys: string[]) => {
      if (!userId) return;
      await persistDecadeOrder(userId, decade, keys);
      setOrders((prev) => {
        const next = { ...prev };
        if (keys.length > 0) next[decadeKey(decade)] = keys;
        else delete next[decadeKey(decade)];
        return next;
      });
    },
    [userId]
  );

  // Fotos das pessoas em destaque.
  const peopleKey = [...actors, ...directors].map((p) => p.key).join('|');
  useEffect(() => {
    if (!peopleKey) return;
    let cancelled = false;
    const refs = [
      ...actors.map((p) => ({ key: `cast:${p.key}`, id: p.id, name: p.name, role: 'cast' as const })),
      ...directors.map((p) => ({ key: `director:${p.key}`, id: p.id, name: p.name, role: 'director' as const })),
    ];
    getPeoplePhotos(refs).then((found) => !cancelled && setPhotos(found));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleKey]);

  const withPhoto = (list: PersonAffinity[], role: 'cast' | 'director') =>
    list.map((p) => {
      const found = photos.get(`${role}:${p.key}`);
      return { ...p, id: p.id ?? found?.id ?? null, photo: found?.photo ?? null, photoLoaded: photos.has(`${role}:${p.key}`) };
    });

  return {
    prior,
    moods,
    moodsCounted: moods.reduce((sum, m) => sum + m.films, 0),
    topKeywords,
    actors: withPhoto(actors, 'cast'),
    directors: withPhoto(directors, 'director'),
    bands,
    favorite,
    gems,
    saveDecadeOrder,
  };
}

export type TasteObservatory = ReturnType<typeof useTasteObservatory>;
export type ObservatoryPerson = TasteObservatory['actors'][number];
