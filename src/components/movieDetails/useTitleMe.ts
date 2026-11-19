import { supabase } from '../../lib/supabase';
import { Q, fetchCached, isMissingFunction, patchCached, useCached, useOwner } from '../../lib/data';
import { peekTitlePrediction } from '../../lib/titlePrediction';

// "Eu e este título" numa ida só (19/11/2026, Reborn, onda 3; rede.md A3).
//
// Abrir o menu de um título disparava, cada um por si: "está na minha
// biblioteca? com que nota?" (useTitleRelation), os episódios vistos
// (useTitleEpisodes), as prateleiras (useTitleMood), os comentários dos
// oráculos (useOracleComments) e a nota prevista (lib/titlePrediction). Eram 4
// pedidos num filme e 5 numa série, medidos na prévia de rede. A RPC
// get_title_me devolve tudo de uma vez; os hooks continuam separados (cada
// seção redesenha só com o que é dela), mas leem da MESMA resposta:
//   • uma chamada por título aberto, por pessoa (Q.titleMe; pedidos ao mesmo
//     tempo viram um), guardada 2 min — reabrir o título não pede de novo;
//   • a previsão só entra no pedido quando não está guardada em
//     lib/titlePrediction (ela custa ~55–90 ms no banco; o resto, ~1 ms);
//   • quem grava (adicionar, remover, marcar episódio) corrige a cópia com
//     patchTitleMe; os avisos do barramento (title:rated, title:watchlist,
//     title:episodes) apagam a cópia de quem não está com o menu aberto.
//
// PLANO B: se a função não existir neste banco (PGRST202) ou falhar, a
// resposta é null e CADA hook roda a consulta que sempre rodou.

export interface TitleMe {
  // a linha de user_movies; null = fora da biblioteca; rating null = Watchlist
  relation: { id: string; rating: number | null } | null;
  episodes: { season_number: number; episode_number: number }[];
  // o que get_pools_containing_title devolve
  pools: { card_type?: string; mood_key: string }[];
  // o que get_title_oracle_comments devolve
  oracle_comments: { card_type: string; mood_key: string; pt: string | null; en: string | null }[];
  // o que get_title_prediction devolve; null = não foi pedida (ou falhou por dentro)
  prediction: Record<string, unknown> | null;
}

// A função não existe neste banco: não se pergunta de novo nesta visita.
let missing = false;

async function loadTitleMe(uid: string | null, movieId: number, mediaType: 'movie' | 'tv'): Promise<TitleMe | null> {
  if (missing) return null;
  const withPrediction = !!uid && peekTitlePrediction(uid, movieId, mediaType) === undefined;
  const { data, error } = await supabase.rpc('get_title_me', { p_id: movieId, p_media_type: mediaType, p_with_prediction: withPrediction });
  if (isMissingFunction(error)) {
    missing = true;
    return null;
  }
  if (error) {
    // erro de verdade: fica registrado, e cada hook tenta a consulta de sempre
    console.error('get_title_me:', error);
    return null;
  }
  const raw = data as Partial<TitleMe> | null;
  if (!raw || typeof raw !== 'object') return null;
  return {
    relation: raw.relation && typeof raw.relation === 'object' ? raw.relation : null,
    episodes: Array.isArray(raw.episodes) ? raw.episodes : [],
    pools: Array.isArray(raw.pools) ? raw.pools : [],
    oracle_comments: Array.isArray(raw.oracle_comments) ? raw.oracle_comments : [],
    prediction: raw.prediction && typeof raw.prediction === 'object' ? raw.prediction : null,
  };
}

// undefined = ainda não chegou; null = plano B (o hook usa a consulta antiga);
// objeto = a resposta. Visitante também pede (vêm só prateleiras e comentários).
export function useTitleMe(movieId: number, mediaType: 'movie' | 'tv'): TitleMe | null | undefined {
  const owner = useOwner();
  const query = useCached<TitleMe | null>(Q.titleMe(owner, mediaType, movieId), () => loadTitleMe(owner ?? null, movieId, mediaType));
  return query.error ? null : query.data;
}

// A mesma resposta, fora de componente (a previsão usa: lib/titlePrediction).
export function fetchTitleMe(uid: string, movieId: number, mediaType: 'movie' | 'tv'): Promise<TitleMe | null> {
  return fetchCached<TitleMe | null>(Q.titleMe(uid, mediaType, movieId), () => loadTitleMe(uid, movieId, mediaType)).catch(() => null);
}

// Quem acabou de gravar corrige a cópia guardada (o menu aberto não relê).
export function patchTitleMe(uid: string | null, movieId: number, mediaType: 'movie' | 'tv', patch: Partial<TitleMe>): void {
  if (!uid) return;
  patchCached<TitleMe | null>(Q.titleMe(uid, mediaType, movieId), (current) => (current ? { ...current, ...patch } : current));
}
