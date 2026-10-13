import { supabase } from './supabase';
import { cache } from './cache';
import { ratingTone } from './oracleTheme';

// Conexão entre cinéfilos (13/10/2026).
//
// O número é calculado no banco (ver a migração 20261013200000_connections.sql
// e o doc "Conexão" do projeto): compara só os títulos que os dois avaliaram,
// com cada nota ajustada ao jeito de avaliar da pessoa, e olha três coisas —
// se ordenam os filmes igual, se amam/detestam os mesmos títulos e se as
// notas ficam próximas. Com poucos títulos em comum, fica perto de 50%.
//
// Formato: "87%" com confiança média ou alta, "~72%" com confiança baixa
// (5 a 14 títulos em comum) e nada quando ainda não dá (menos de 5).

export type ConnectionConfidence = 'low' | 'medium' | 'high';
export type ConnectionTier = 'seat' | 'session' | 'cinema' | 'neighbors' | 'reverse';

// A conexão com uma pessoa, em listas e cartões.
export interface ConnectionScore {
  otherId: string;
  pct: number;
  confidence: ConnectionConfidence;
  sharedCount: number;
}

// Um título que os dois avaliaram (ou que só o outro avaliou, em "Afine").
export interface ConnectionTitle {
  movie_id: number;
  media_type: 'movie' | 'tv';
  title_pt: string | null;
  title_en: string | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  backdrop_path?: string | null;
  year: string | null;
  rating_me?: number;
  rating_other: number;
  vote_count?: number | null;
}

// A conexão completa com uma pessoa (a gaveta Conexão).
export interface ConnectionDetail {
  shared_count: number;
  pct: number | null;
  score: number | null;
  confidence: ConnectionConfidence | 'none';
  loved_both: number;
  hated_both: number;
  clashes: number;
  loves: ConnectionTitle[];
  hates: ConnectionTitle[];
  debates: ConnectionTitle[];
  calibrate: ConnectionTitle[];
}

// Uma pessoa no ranking ("Suas conexões") ou na descoberta ("Cinéfilos com o
// seu gosto").
export interface ConnectionPerson {
  user_id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  is_premium: boolean;
  top_moods: string[] | null;
  pct: number | null;
  confidence: ConnectionConfidence | null;
  shared_count: number | null;
  is_friend: boolean;
  posters: string[] | null;
}

// Um dos dois lados da conexão (você ou a outra pessoa), para a gaveta, o
// story e os avatares em dupla.
export interface ConnectionSide {
  id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  is_premium: boolean;
  // Código de 3 letras da personalidade (ex.: "MXC"), quando já tem.
  persona_code?: string | null;
}

// Menos que isso, não há número.
export const CONNECTION_MIN_SHARED = 5;

const SCORE_TTL = 5 * 60 * 1000;
const DETAIL_TTL = 2 * 60 * 1000;
const scoreKey = (otherId: string) => `connection:score:${otherId}`;
const detailKey = (otherId: string) => `connection:detail:${otherId}`;
const listKey = (scope: string, limit: number) => `connection:list:${scope}:${limit}`;
// Marca "sem conexão guardada" (para não pedir de novo a cada render).
const NONE = 'none' as const;

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

// Cor: a mesma faixa das notas (87% → nota 9 → verde; 95%+ → rosa).
export const connectionTone = (pct: number) => ratingTone(Math.max(0, Math.min(10, Math.round(pct / 10))));

// "87%" ou "~72%" (prévia).
export const formatConnection = (pct: number, confidence: ConnectionConfidence | 'none' | null | undefined) =>
  `${confidence === 'low' ? '~' : ''}${Math.round(pct)}%`;

// Faixas (validadas com os pares reais da comunidade; ver o doc "Conexão").
export const connectionTier = (pct: number): ConnectionTier => {
  if (pct >= 85) return 'seat';
  if (pct >= 70) return 'session';
  if (pct >= 55) return 'cinema';
  if (pct >= 40) return 'neighbors';
  return 'reverse';
};

// Chaves de tradução da faixa: nome e a frase curta.
export const tierLabelKey = (pct: number) => `connection.tier.${connectionTier(pct)}`;
export const tierLineKey = (pct: number) => `connection.tierLine.${connectionTier(pct)}`;
export const confidenceKey = (confidence: ConnectionConfidence) => `connection.confidence.${confidence}`;

// Título e pôster no idioma de quem vê.
export const connectionTitleName = (item: Pick<ConnectionTitle, 'title_pt' | 'title_en'>, language: string) =>
  (language.startsWith('pt') ? item.title_pt || item.title_en : item.title_en || item.title_pt) || '';
export const connectionPoster = (item: Pick<ConnectionTitle, 'poster_path' | 'poster_path_pt'>, language: string) =>
  (language.startsWith('pt') ? item.poster_path_pt || item.poster_path : item.poster_path || item.poster_path_pt) || null;

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

const toScore = (row: { other_id: string; pct: number; confidence: string; shared_count: number }): ConnectionScore => ({
  otherId: row.other_id,
  pct: row.pct,
  confidence: row.confidence as ConnectionConfidence,
  sharedCount: row.shared_count,
});

// O que já está guardado (sem ir ao servidor). `null` = sem número;
// `undefined` = ainda não perguntado.
export function peekConnectionScore(otherId: string): ConnectionScore | null | undefined {
  const hit = cache.get<ConnectionScore | typeof NONE>(scoreKey(otherId));
  if (hit === null) return undefined;
  return hit === NONE ? null : hit;
}

// Conexão com várias pessoas de uma vez. Quem não tem número fica de fora do
// mapa. Pede ao servidor só quem ainda não está guardado.
export async function fetchConnectionScores(ids: string[]): Promise<Map<string, ConnectionScore>> {
  const out = new Map<string, ConnectionScore>();
  const missing: string[] = [];
  for (const id of Array.from(new Set(ids.filter(Boolean)))) {
    const hit = peekConnectionScore(id);
    if (hit === undefined) missing.push(id);
    else if (hit) out.set(id, hit);
  }
  for (let i = 0; i < missing.length; i += 300) {
    const chunk = missing.slice(i, i + 300);
    const { data, error } = await supabase.rpc('get_connection_scores', { p_ids: chunk });
    if (error) throw error;
    const found = new Set<string>();
    for (const row of (data || []) as { other_id: string; pct: number; confidence: string; shared_count: number }[]) {
      const score = toScore(row);
      found.add(score.otherId);
      out.set(score.otherId, score);
      cache.set(scoreKey(score.otherId), score, SCORE_TTL);
    }
    chunk.filter((id) => !found.has(id)).forEach((id) => cache.set(scoreKey(id), NONE, SCORE_TTL));
  }
  return out;
}

// A conexão completa com uma pessoa (calculada na hora). `null` quando não
// dá para ver (perfil privado, a própria pessoa, sem login).
export async function fetchConnection(otherId: string, options: { fresh?: boolean } = {}): Promise<ConnectionDetail | null> {
  if (!options.fresh) {
    const hit = cache.get<ConnectionDetail | typeof NONE>(detailKey(otherId));
    if (hit) return hit === NONE ? null : hit;
  }
  const { data, error } = await supabase.rpc('get_connection', { p_other: otherId });
  if (error) throw error;
  const detail = (data as ConnectionDetail | null) ?? null;
  cache.set(detailKey(otherId), detail ?? NONE, DETAIL_TTL);
  // O número ao vivo também vale para as listas.
  if (detail && detail.pct !== null && detail.confidence !== 'none') {
    cache.set(
      scoreKey(otherId),
      { otherId, pct: detail.pct, confidence: detail.confidence, sharedCount: detail.shared_count } satisfies ConnectionScore,
      SCORE_TTL,
    );
  }
  return detail;
}

// Seus amigos por conexão, ou cinéfilos que ainda não são seus amigos com
// gosto parecido (confiança média ou alta, só quem aceita aparecer).
export async function fetchMyConnections(scope: 'friends' | 'community', limit = 20): Promise<ConnectionPerson[]> {
  const key = listKey(scope, limit);
  const hit = cache.get<ConnectionPerson[]>(key);
  if (hit) return hit;
  const { data, error } = await supabase.rpc('get_my_connections', { p_scope: scope, p_limit: limit });
  if (error) throw error;
  const rows = ((data || []) as ConnectionPerson[]).map((row) => ({
    ...row,
    confidence: (row.confidence as ConnectionConfidence | null) ?? null,
  }));
  cache.set(key, rows, SCORE_TTL);
  rows.forEach((row) => {
    if (row.pct !== null && row.confidence) {
      cache.set(scoreKey(row.user_id), { otherId: row.user_id, pct: row.pct, confidence: row.confidence, sharedCount: row.shared_count ?? 0 }, SCORE_TTL);
    }
  });
  return rows;
}

// Depois de avaliar um título ou mudar uma amizade: esquece o que estava
// guardado (de uma pessoa ou de todas).
export function invalidateConnections(otherId?: string) {
  if (otherId) {
    cache.invalidate(scoreKey(otherId));
    cache.invalidate(detailKey(otherId));
  } else {
    cache.invalidatePattern('connection:score:');
    cache.invalidatePattern('connection:detail:');
  }
  cache.invalidatePattern('connection:list:');
}
