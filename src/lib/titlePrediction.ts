import { supabase } from './supabase';
import { ensureMovieCached } from './tmdb';

// A nota prevista de UM título, para o menu do título (15/11/2026).
//
// Pedido do Bruno: "agilize o início do efeito da previsão da borboleta que
// demora muito para carregar". O menu pedia a previsão à função de borda
// predict-single-movie, e ela levava de 4 a 5,5 s quando "acordava" (mais o
// pedido de permissão do navegador antes de cada chamada). Agora a pergunta
// vai direto ao banco (get_title_prediction, ~0,6 s), e a resposta fica na
// memória por alguns minutos: abrir de novo o mesmo título é instantâneo.
//
// No mesmo dia veio a fórmula paralela: filmes fora das prateleiras dos
// oráculos também têm previsão (scope 'outside'), mais aberta (sigma 25 %
// maior) e sem o selo 9/10 — ver
// supabase/migrations/20261115233000_prediction_outside_shelves.sql.
// Séries fora das prateleiras continuam sem previsão.

export type PredictionScope = 'shelf' | 'outside';

export interface TitlePrediction {
  predictedRating: number;
  mu: number | null;
  sigma: number | null;
  tenChance: number | null;
  scope: PredictionScope;
}

interface Answer {
  status?: string;
  scope?: string;
  predictedRating?: unknown;
  mu?: unknown;
  sigma?: unknown;
  tenChance?: unknown;
}

// Na memória da aba: tempo bastante para quem volta ao título, curto o
// bastante para a previsão acompanhar as notas novas da pessoa.
const FRESH_MS = 5 * 60 * 1000;
const memory = new Map<string, { at: number; value: TitlePrediction | null }>();
const inflight = new Map<string, Promise<TitlePrediction | null>>();

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const ask = async (id: number, mediaType: 'movie' | 'tv'): Promise<Answer> => {
  const { data, error } = await supabase.rpc('get_title_prediction', { p_id: id, p_media_type: mediaType });
  if (error) throw error;
  return (data ?? {}) as Answer;
};

const toPrediction = (answer: Answer): TitlePrediction | null => {
  const predicted = numberOrNull(answer.predictedRating);
  if (answer.status !== 'ok' || predicted === null) return null;
  return {
    predictedRating: predicted,
    mu: numberOrNull(answer.mu),
    sigma: numberOrNull(answer.sigma),
    tenChance: numberOrNull(answer.tenChance),
    scope: answer.scope === 'outside' ? 'outside' : 'shelf',
  };
};

// A previsão já guardada (para o medidor já nascer com ela), ou undefined.
export function peekTitlePrediction(userId: string, id: number, mediaType: 'movie' | 'tv'): TitlePrediction | null | undefined {
  const hit = memory.get(`${userId}:${mediaType}:${id}`);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.value : undefined;
}

// null = sem previsão (já avaliado, sem questionário, série de fora, filme
// com poucos votos…). Erro de rede sobe para quem chamou.
export function fetchTitlePrediction(userId: string, id: number, mediaType: 'movie' | 'tv'): Promise<TitlePrediction | null> {
  const key = `${userId}:${mediaType}:${id}`;
  const known = peekTitlePrediction(userId, id, mediaType);
  if (known !== undefined) return Promise.resolve(known);
  const running = inflight.get(key);
  if (running) return running;

  const request = (async () => {
    let answer = await ask(id, mediaType);
    if (answer.status === 'not_cached') {
      // título que ainda não está no banco de filmes (aberto pela busca, por
      // exemplo): guarda e pergunta de novo, uma vez
      await ensureMovieCached(id, mediaType);
      answer = await ask(id, mediaType);
    }
    const value = toPrediction(answer);
    // guarda só o que não muda com um clique: "já avaliou" e "sem
    // questionário" podem virar previsão logo em seguida
    if (value !== null || answer.status === 'few_votes' || answer.status === 'outside_series') {
      memory.set(key, { at: Date.now(), value });
    }
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}
