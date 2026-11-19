import { useEffect, useState } from 'react';
import { prefetchPatronus } from '../patronus/patronus';
import { fetchTitlePrediction, peekTitlePrediction, type Answer, type PredictionScope, type TitlePrediction } from '../../lib/titlePrediction';
import { fetchTitleMe } from './useTitleMe';

// Nota Prevista para Você — mesmo modelo usado nas prateleiras da
// Biblioteca dos Oráculos e no Match Movie. Fica vazia quando o usuário
// ainda não completou o questionário de personalidade, quando já avaliou,
// em séries fora das prateleiras e em filmes ainda sem nota do público.
// Enquanto a previsão carrega, o medidor fica apagado com a fagulha
// esperando (sem empurrar nada).
//
// 15/11/2026 (pedidos do Bruno): a previsão vem direto do banco
// (get_title_prediction, ~0,6 s, em vez dos 4 a 5,5 s da função de borda
// quando ela "acordava"), fica na memória por alguns minutos, e os filmes
// fora das prateleiras ganharam previsão pela fórmula paralela (mais
// aberta, sem o selo 9/10). A predict-single-movie continua lá para os apps
// antigos.
//
// 18/11/2026 (otimização): mora neste hook, usado só pelo placar
// (TitleScoreboard). Os cinco estados que mudavam juntos viraram um objeto só.
export interface PredictionView {
  predictedRating: number | null;
  // Chance de o título virar nota 10 da pessoa (0 a 1) — aparece no menu
  // quando a nota prevista é 9 ou menos (ver lib/prediction).
  tenChance: number | null;
  // A expectativa e a largura da previsão (14/11/2026): o medidor do placar
  // desenha o espectro das notas e o balanço da agulha a partir delas.
  mu: number | null;
  sigma: number | null;
  // De onde veio a previsão (15/11/2026): 'shelf' = título de prateleira (v4),
  // 'outside' = filme de fora, pela fórmula paralela (lib/titlePrediction).
  scope: PredictionScope | null;
  loading: boolean;
}
const LOADING: PredictionView = { predictedRating: null, tenChance: null, mu: null, sigma: null, scope: null, loading: true };

const viewOf = (value: TitlePrediction | null): PredictionView => ({
  predictedRating: value ? value.predictedRating : null,
  tenChance: value ? value.tenChance : null,
  mu: value ? value.mu : null,
  sigma: value ? value.sigma : null,
  scope: value ? value.scope : null,
  loading: false,
});

export function useTitlePrediction(movieId: number, mediaType: 'movie' | 'tv', userId: string | null): PredictionView {
  const [view, setView] = useState<PredictionView>(LOADING);

  useEffect(() => {
    if (!userId) return;
    // trocar de título no meio da conta não pode pôr a previsão do anterior
    // no novo
    let alive = true;
    // o Patrono (a mariposa do medidor) já vai sendo buscado
    prefetchPatronus(userId);

    // já guardada: o medidor nasce com ela
    const known = peekTitlePrediction(userId, movieId, mediaType);
    if (known !== undefined) {
      setView(viewOf(known));
      return;
    }

    setView(LOADING);
    (async () => {
      try {
        // 19/11/2026 (Reborn, onda 3): a previsão viaja na resposta única "eu
        // e este título" (get_title_me), a mesma que a casca do menu já pede;
        // sem ela (plano B), fetchTitlePrediction pergunta ao banco como sempre.
        const value = await fetchTitlePrediction(userId, movieId, mediaType, () =>
          fetchTitleMe(userId, movieId, mediaType).then((me) => (me?.prediction as Answer | null | undefined) ?? null),
        );
        if (alive) setView(viewOf(value));
      } catch (error) {
        console.error('Error loading predicted rating:', error);
        if (alive) setView(viewOf(null));
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, movieId, mediaType]);

  return view;
}
