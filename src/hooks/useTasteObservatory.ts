import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchDecadeOrders, type DecadeOrders } from '../lib/libraryLayouts';
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
import type { MovieWithRating } from './useProfileData';

// Tudo o que o observatório do perfil mostra, a partir dos filmes que
// useProfileData já carregou — mais três leituras pequenas: em que
// prateleira está cada filme (roda dos humores), a ordem das décadas da
// Biblioteca e as fotos das pessoas destacadas.

export function useTasteObservatory(userId: string | undefined, movies: MovieWithRating[], persona: UserPersona | null) {
  const [moodByMovie, setMoodByMovie] = useState<Map<number, string> | null>(null);
  const [orders, setOrders] = useState<DecadeOrders>({});
  const [photos, setPhotos] = useState<Map<string, PersonPhoto>>(new Map());
  const ratedCount = useMemo(() => ratedOnly(movies).length, [movies]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.rpc('get_profile_mood_titles', { p_user_id: userId }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !Array.isArray(data)) {
        setMoodByMovie(null);
        return;
      }
      setMoodByMovie(new Map((data as { movie_id: number; mood_key: string }[]).map((row) => [row.movie_id, row.mood_key])));
    });
    fetchDecadeOrders(userId).then((found) => !cancelled && setOrders(found));
    return () => {
      cancelled = true;
    };
  }, [userId, ratedCount]);

  const prior = useMemo(() => averageRating(movies) ?? 7, [movies]);
  const moods = useMemo(() => moodSlices(movies, moodByMovie, persona, prior), [movies, moodByMovie, persona, prior]);
  const topKeywords = useMemo(() => keywordAffinity(movies, prior, { minCount: 3, limit: 10 }), [movies, prior]);
  const actors = useMemo(() => peopleAffinity(movies, prior, 'cast', 9), [movies, prior]);
  const directors = useMemo(() => peopleAffinity(movies, prior, 'director', 5), [movies, prior]);
  const bands = useMemo(() => decadeBands(movies, orders), [movies, orders]);
  const favorite = useMemo(() => favoriteBand(bands), [bands]);
  const gems = useMemo(() => hiddenGems(movies, 3), [movies]);

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
  };
}

export type TasteObservatory = ReturnType<typeof useTasteObservatory>;
export type ObservatoryPerson = TasteObservatory['actors'][number];
