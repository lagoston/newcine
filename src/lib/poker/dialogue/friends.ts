/**
 * Mesa com amigos (pacote H3, 03/11/2026): o que o Diretor precisa para tratar "eu" como a
 * visita num aparelho de várias pessoas.
 *
 * O Diretor foi escrito para uma pessoa só, que nos eventos se chama 'human'. Na mesa com
 * amigos cada aparelho tem o seu "eu" (`friends.selfId`). Em vez de espalhar o selfId pelo
 * rastreador inteiro, a entrada do Diretor troca os ids do evento: selfId ↔ 'human' (uma
 * permutação, então nada se confunde, mesmo que 'human' seja de outra pessoa). As outras
 * pessoas ficam com os próprios ids e viram convidados. Nenhum nome de pessoa entra aqui:
 * só ids de lugar.
 */
import type { PlayerId, RivalId } from '../types.ts';

const HUMAN = 'human';

/** Chaves cujo valor é um id de lugar (em qualquer evento ou visão). */
const ID_KEYS = new Set(['playerId', 'byId', 'holderId', 'toId', 'fromId', 'buttonId', 'sbId', 'bbId', 'victimId',
  'winnerId', 'blufferId', 'catcherId', 'targetId', 'id', 'by', 'toActId', 'carrierId']);
/** Chaves cujo valor é uma lista de ids. */
const ID_LISTS = new Set(['ids', 'eligibleIds', 'winnerIds', 'allInIds', 'victimIds', 'people']);
/** Chaves cujo valor é um registro indexado por id (`people` é lista no matchStarted e registro no fim). */
const ID_RECORDS = new Set(['stacks', 'net', 'places', 'eliminatedBy', 'people']);

export type IdMap = (id: string) => string;

/** A troca deste aparelho: selfId ↔ 'human'. Sem troca quando o selfId já é 'human'. */
export function selfSwap(selfId: PlayerId | undefined): IdMap | null {
  if (!selfId || selfId === HUMAN) return null;
  return (id: string) => (id === selfId ? HUMAN : id === HUMAN ? selfId : id);
}

function remapValue(v: unknown, map: IdMap, key: string | null, depth: number): unknown {
  if (depth > 6 || v === null || typeof v !== 'object') {
    if (typeof v === 'string' && key !== null && ID_KEYS.has(key)) return map(v);
    return v;
  }
  if (Array.isArray(v)) {
    if (key !== null && ID_LISTS.has(key)) return v.map((x) => (typeof x === 'string' ? map(x) : remapValue(x, map, null, depth + 1)));
    return v.map((x) => remapValue(x, map, null, depth + 1));
  }
  const out: Record<string, unknown> = {};
  const rec = key !== null && ID_RECORDS.has(key);
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    out[rec ? map(k) : k] = rec ? x : remapValue(x, map, k, depth + 1);
  }
  return out;
}

/** Cópia do evento (ou de qualquer dado com ids) com os ids trocados. */
export function remapIds<T>(e: T, map: IdMap | null): T {
  return map ? (remapValue(e, map, null, 0) as T) : e;
}

// ---------------------------------------------------------------------------
// Citações de oráculos no texto (para o oráculo ausente nunca "aparecer" numa fala)
// ---------------------------------------------------------------------------

/**
 * Nomes e apelidos de cada oráculo nas falas. "Cobra" só com maiúscula (em pt "cobra" também
 * é verbo); "Crítico"/"Vovô" são o Sapo e o Raposo na boca dos outros.
 */
const MENTION: Record<string, RegExp> = {
  bogart: /\b(Sapo|sapo|Sapinho|sapinho|Crítico|crítico|Frog|frog|Froggy|froggy|Critic)\b/,
  cypher: /\b(Cobra|Cobrinha|cobrinha|[Vv]íbora|Snake|[Vv]iper)\b|\bsnake\b/,
  fincher: /\b(Raposo|Vovô|Fox|Grandpa)\b/,
};

const mentionCache = new Map<string, RivalId[]>();

/** Oráculos citados num texto (sem contar quem fala). */
export function mentionsOf(text: string, speaker?: string): RivalId[] {
  const key = `${speaker ?? ''}|${text}`;
  const hit = mentionCache.get(key);
  if (hit) return hit;
  const out: RivalId[] = [];
  for (const [id, re] of Object.entries(MENTION)) if (id !== speaker && re.test(text)) out.push(id);
  if (mentionCache.size > 4000) mentionCache.clear();
  mentionCache.set(key, out);
  return out;
}
