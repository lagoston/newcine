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
// PLANO B: se a função não existir neste banco (PGRST202), falhar ou responder
// vazio, a MESMA leitura roda as consultas que cada hook sempre rodou (lado a
// lado) e monta a resposta no mesmo formato. Os hooks só conhecem um caminho —
// e a casca do menu redesenha uma vez só quando a resposta chega, nos dois casos.

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

type Row = Record<string, unknown>;
const NOTHING: TitleMe = { relation: null, episodes: [], pools: [], oracle_comments: [], prediction: null };

// As consultas de sempre, uma por parte (o que cada hook fazia até 19/11/2026).
// Cada parte que falha fica vazia e registrada, como antes; visitante só pede
// os comentários (as outras partes nunca foram pedidas sem login).
async function loadTitleMeOld(uid: string | null, movieId: number, mediaType: 'movie' | 'tv'): Promise<TitleMe> {
  const [relation, episodes, pools, comments] = await Promise.all([
    uid
      ? supabase.from('user_movies').select('id, rating, movies!inner(media_type)').eq('user_id', uid).eq('movie_id', movieId).eq('movies.media_type', mediaType).maybeSingle()
      : null,
    uid && mediaType === 'tv' ? supabase.from('watched_episodes').select('season_number, episode_number').eq('user_id', uid).eq('tmdb_id', movieId) : null,
    uid ? supabase.rpc('get_pools_containing_title', { p_id: movieId, p_media_type: mediaType }) : null,
    supabase.rpc('get_title_oracle_comments', { p_id: movieId, p_media_type: mediaType }),
  ]);
  if (relation?.error) console.warn('Error checking library:', relation.error);
  if (episodes?.error) console.error('Error loading watched episodes:', episodes.error);
  if (pools?.error) console.error('Error loading movie mood:', pools.error);
  if (comments.error) console.error('Error fetching oracle comments:', comments.error);
  const row = relation && !relation.error ? (relation.data as Row | null) : null;
  return {
    relation: row ? { id: String(row.id), rating: (row.rating as number | null) ?? null } : null,
    episodes: episodes && !episodes.error && Array.isArray(episodes.data) ? (episodes.data as TitleMe['episodes']) : [],
    pools: pools && !pools.error && Array.isArray(pools.data) ? (pools.data as TitleMe['pools']) : [],
    oracle_comments: !comments.error && Array.isArray(comments.data) ? (comments.data as TitleMe['oracle_comments']) : [],
    prediction: null,
  };
}

// A função não existe neste banco: não se pergunta de novo nesta visita.
let missing = false;

async function loadTitleMe(uid: string | null, movieId: number, mediaType: 'movie' | 'tv'): Promise<TitleMe> {
  if (missing) return loadTitleMeOld(uid, movieId, mediaType);
  const withPrediction = !!uid && peekTitlePrediction(uid, movieId, mediaType) === undefined;
  const { data, error } = await supabase.rpc('get_title_me', { p_id: movieId, p_media_type: mediaType, p_with_prediction: withPrediction });
  if (isMissingFunction(error)) missing = true;
  // erro de verdade: fica registrado; as consultas de sempre tentam em seguida
  else if (error) console.error('get_title_me:', error);
  const raw = error ? null : (data as Partial<TitleMe> | null);
  if (!raw || typeof raw !== 'object') return loadTitleMeOld(uid, movieId, mediaType);
  return {
    relation: raw.relation && typeof raw.relation === 'object' ? raw.relation : null,
    episodes: Array.isArray(raw.episodes) ? raw.episodes : [],
    pools: Array.isArray(raw.pools) ? raw.pools : [],
    oracle_comments: Array.isArray(raw.oracle_comments) ? raw.oracle_comments : [],
    prediction: raw.prediction && typeof raw.prediction === 'object' ? raw.prediction : null,
  };
}

// undefined = ainda não chegou; objeto = a resposta (se tudo falhou, vazia:
// fora da biblioteca, sem prateleira, sem comentário — como as falhas de antes).
// Visitante também pede (vêm só prateleiras e comentários).
export function useTitleMe(movieId: number, mediaType: 'movie' | 'tv'): TitleMe | undefined {
  const owner = useOwner();
  const query = useCached<TitleMe>(Q.titleMe(owner, mediaType, movieId), () => loadTitleMe(owner ?? null, movieId, mediaType));
  return query.error ? NOTHING : query.data;
}

// A mesma resposta, fora de componente (a previsão usa: lib/titlePrediction).
export function fetchTitleMe(uid: string, movieId: number, mediaType: 'movie' | 'tv'): Promise<TitleMe | null> {
  return fetchCached<TitleMe>(Q.titleMe(uid, mediaType, movieId), () => loadTitleMe(uid, movieId, mediaType)).catch(() => null);
}

// Quem acabou de gravar corrige a cópia guardada (o menu aberto não relê).
export function patchTitleMe(uid: string | null, movieId: number, mediaType: 'movie' | 'tv', patch: Partial<TitleMe>): void {
  if (!uid) return;
  patchCached<TitleMe>(Q.titleMe(uid, mediaType, movieId), (current) => ({ ...current, ...patch }));
}
