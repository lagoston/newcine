import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
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
export function useTitleMood(movieId: number, mediaType: 'movie' | 'tv', userId: string | null) {
  const [state, setState] = useState<{ moodKey: string | null; moodLoaded: boolean }>({ moodKey: null, moodLoaded: false });
  // 19/11/2026 (Reborn, onda 3): as prateleiras vêm da resposta única "eu e
  // este título" (useTitleMe → get_title_me, parte "pools", que é exatamente o
  // que get_pools_containing_title devolve). undefined = ainda não chegou;
  // null = plano B: a RPC de sempre, abaixo.
  const me = useTitleMe(movieId, mediaType);
  const pools = me === undefined ? undefined : me === null ? null : me.pools;

  useEffect(() => {
    if (!userId) return;
    if (pools) {
      const realMood = pools.find((p) => p.mood_key !== 'random-surprise');
      setState({ moodKey: realMood?.mood_key || null, moodLoaded: true });
      return;
    }
    let alive = true;
    setState((prev) => (prev.moodKey === null && !prev.moodLoaded ? prev : { moodKey: null, moodLoaded: false }));
    if (pools === undefined) return;
    (async () => {
      let moodKey: string | null = null;
      try {
        const { data, error } = await supabase.rpc('get_pools_containing_title', { p_id: movieId, p_media_type: mediaType });

        if (error) throw error;

        const realMood = (data || []).find((p: { mood_key: string }) => p.mood_key !== 'random-surprise');
        moodKey = realMood?.mood_key || null;
      } catch (error) {
        console.error('Error loading movie mood:', error);
      }
      if (alive) setState({ moodKey, moodLoaded: true });
    })();
    return () => {
      alive = false;
    };
  }, [userId, movieId, mediaType, pools]);

  return state;
}
