import { useCallback, useEffect, useMemo, useState } from 'react';
import { decadeKey, fetchDecadeOrders, saveDecadeOrder as persistDecadeOrder, type DecadeOrders } from '../lib/libraryLayouts';
import {
  averageRating,
  decadeBands,
  favoriteBand,
  hiddenGems,
  peopleAffinity,
  ratedOnly,
  type PersonAffinity,
} from '../lib/tasteStats';
import { getPeoplePhotos, type PersonPhoto } from '../lib/peoplePhotos';
import type { MovieWithRating } from './useProfileData';

// Tudo o que o observatório do perfil mostra, a partir dos filmes que
// useProfileData já carregou — mais duas leituras pequenas: a ordem das
// décadas da Biblioteca e as fotos das pessoas destacadas.
//
// 15/11/2026: as prateleiras de cada título e os temas saíram daqui. Eram do
// bloco da personalidade, que virou o cartão do estúdio; hoje os potinhos e os
// temas moram no modal "Sua Persona" e vêm de get_persona_world e de
// get_persona_themes (lib/personaThemes.ts).

export function useTasteObservatory(userId: string | undefined, movies: MovieWithRating[]) {
  const [orders, setOrders] = useState<DecadeOrders>({});
  const [photos, setPhotos] = useState<Map<string, PersonPhoto>>(new Map());
  const ratedCount = useMemo(() => ratedOnly(movies).length, [movies]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchDecadeOrders(userId).then((found) => !cancelled && setOrders(found));
    return () => {
      cancelled = true;
    };
  }, [userId, ratedCount]);

  const prior = useMemo(() => averageRating(movies) ?? 7, [movies]);
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
