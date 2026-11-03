/**
 * Memória local do Diretor (`poker.dialogue.v1`, SPEC §4.6 e §6.3): a LRU das últimas 300
 * falas (nenhum id repete em 48 h quando houver alternativa) e as falas "uma vez por
 * sessão". Nada aqui é fonte de verdade: o que vale em qualquer aparelho vai por `story`.
 *
 * Único arquivo do Diretor que toca `Date` e `localStorage`, sempre com try/catch (janela
 * anônima, armazenamento cheio ou bloqueado, prévia sem `window`).
 */
import type { DialogueMemory, DialogueStorage } from './types.ts';

const KEY = 'poker.dialogue.v1';
export const LRU_MAX = 300;
export const LRU_WINDOW_MS = 48 * 3600 * 1000;
export const SESSION_GAP_MS = 30 * 60 * 1000;

export function emptyMemory(): DialogueMemory {
  return { v: 1, lru: [], session: { at: 0, ids: [] } };
}

function nowMs(): number {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function valid(m: unknown): m is DialogueMemory {
  const x = m as DialogueMemory;
  return !!x && x.v === 1 && Array.isArray(x.lru) && !!x.session && Array.isArray(x.session.ids);
}

/** O armazenamento padrão do navegador. Sem `localStorage`, vira só memória. */
export function browserStorage(): DialogueStorage {
  let fallback: DialogueMemory = emptyMemory();
  return {
    now: nowMs,
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(KEY);
        if (!raw) return fallback;
        const m = JSON.parse(raw) as unknown;
        return valid(m) ? m : emptyMemory();
      } catch {
        return fallback;
      }
    },
    save(m) {
      fallback = m;
      try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(m));
      } catch {
        // sem armazenamento: segue na memória
      }
    },
  };
}

/** Armazenamento só em memória (testes, ou quando o Diretor recebe `storage: null`). */
export function memoryStorage(clock?: () => number): DialogueStorage {
  let m = emptyMemory();
  return {
    now: clock ?? nowMs,
    load: () => m,
    save: (x) => {
      m = x;
    },
  };
}

/** Registra uma fala tocada na LRU e na sessão. */
export function remember(m: DialogueMemory, id: string, at: number): DialogueMemory {
  const lru = m.lru.filter(([x]) => x !== id);
  lru.push([id, at]);
  while (lru.length > LRU_MAX) lru.shift();
  const ids = m.session.ids.includes(id) ? m.session.ids : [...m.session.ids, id];
  return { v: 1, lru, session: { at, ids } };
}

/** Sessão nova (1ª partida da sessão ou mais de 30 min parado): zera os "uma vez por sessão". */
export function freshSession(m: DialogueMemory, at: number, firstOfSession: boolean): DialogueMemory {
  if (firstOfSession || at - m.session.at > SESSION_GAP_MS) return { ...m, session: { at, ids: [] } };
  return m;
}
