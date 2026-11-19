import { useMemo } from 'react';
import { useTitleMe } from './useTitleMe';

// Mood da pool a que o título pertence — mostrado como mais um
// "gênero" ao lado dos reais. Independente de previsão: um título já
// avaliado, ou de um usuário sem questionário completo, ainda pode
// (e deve) mostrar essa tag, já que é informação sobre o título em
// si, não sobre a previsão pessoal de ninguém. Filmes e séries têm
// prateleiras próprias (recommendation_pools.movie_ids / tv_ids).
//
// Fica na casca do menu: a linha de gêneros e o placar esperam por ela.
// `moodLoaded` = a prateleira já foi consultada (a linha de gêneros espera
// por ela, pra não aparecer e depois ser empurrada).
//
// 19/11/2026 (Reborn, onda 3): as prateleiras vêm da resposta única "eu e este
// título" (useTitleMe → get_title_me, parte "pools", que é exatamente o que
// get_pools_containing_title devolve); antes era uma chamada só para isto. Sem
// login nada é mostrado, como antes.
export function useTitleMood(movieId: number, mediaType: 'movie' | 'tv', userId: string | null) {
  const me = useTitleMe(movieId, mediaType);
  const pools = userId ? me?.pools : undefined;
  return useMemo(() => {
    if (!pools) return { moodKey: null, moodLoaded: false };
    const realMood = pools.find((p) => p.mood_key !== 'random-surprise');
    return { moodKey: realMood?.mood_key || null, moodLoaded: true };
  }, [pools]);
}
