/**
 * Memória local do Diretor da Mesa (`mesa.dialogue.v1`, SPEC §3.8). Porte do
 * `storage.ts` do pôquer (05/11/2026), com três diferenças:
 * - o carimbo é o DIA do payload (Brasília), não o relógio;
 * - a janela é de 14 dias, e só exclui falas tocadas em dias ANTERIORES: o próprio
 *   dia segue a semente, então recarregar a página repete as mesmas falas;
 * - `once=week` (7 dias) e `once=life`, numa lista própria com a tiragem: só a mesma
 *   tiragem (recarregar) repete no dia; outra pergunta no mesmo dia, não.
 *
 * Único arquivo do Diretor que toca `localStorage`, sempre com try/catch (janela
 * anônima, armazenamento cheio ou bloqueado, prévia sem `window`).
 */
import { dayDiff } from './slots.ts';
import type { DialogueMemory, DialogueStorage } from './types.ts';

const KEY = 'mesa.dialogue.v1';
export const LRU_MAX = 300;
export const ONCE_MAX = 200;
export const LRU_WINDOW_DAYS = 14;
export const WEEK_DAYS = 7;

export function emptyMemory(): DialogueMemory {
  return { v: 1, lru: [], once: [] };
}

function valid(m: unknown): m is DialogueMemory {
  const x = m as DialogueMemory;
  return !!x && x.v === 1 && Array.isArray(x.lru) && Array.isArray(x.once);
}

/** O armazenamento padrão do navegador. Sem `localStorage`, vira só memória. */
export function browserStorage(): DialogueStorage {
  let fallback: DialogueMemory = emptyMemory();
  return {
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
export function memoryStorage(): DialogueStorage {
  let m = emptyMemory();
  return {
    load: () => m,
    save: (x) => {
      m = x;
    },
  };
}

/** Registra uma fala tocada hoje (e, se ela tem `once`, a tiragem em que tocou). */
export function remember(m: DialogueMemory, id: string, day: string, draw: string, once?: 'week' | 'life'): DialogueMemory {
  const lru = m.lru.filter(([x]) => x !== id);
  lru.push([id, day]);
  while (lru.length > LRU_MAX) lru.shift();
  let onceList = m.once;
  if (once) {
    onceList = [...onceList.filter(([x]) => x !== id), [id, day, draw] as [string, string, string]];
    while (onceList.length > ONCE_MAX) onceList.shift();
  }
  return { v: 1, lru, once: onceList };
}

/** Último dia em que a fala tocou (null = nunca, na janela da LRU). */
export function lastDay(m: DialogueMemory, id: string): string | null {
  for (let i = m.lru.length - 1; i >= 0; i--) if (m.lru[i][0] === id) return m.lru[i][1];
  return null;
}

/** A fala não tocou em nenhum dia anterior dos últimos 14 (o próprio dia não conta). */
export function isFresh(m: DialogueMemory, id: string, today: string): boolean {
  const d = lastDay(m, id);
  if (d === null || d === today) return true;
  const diff = dayDiff(d, today);
  return !(diff > 0 && diff < LRU_WINDOW_DAYS);
}

/**
 * `once`: a mesma tiragem pode repetir (recarregar a página); outra tiragem, não:
 * semana = nada em menos de 7 dias (o próprio dia conta); vida = nunca mais.
 */
export function onceOk(m: DialogueMemory, id: string, once: 'week' | 'life' | undefined, today: string, draw: string): boolean {
  if (!once) return true;
  const hit = m.once.find(([x]) => x === id);
  if (!hit) return true;
  if (hit[1] === today && hit[2] === draw) return true;
  if (once === 'life') return false;
  const diff = dayDiff(hit[1], today);
  return !(diff >= 0 && diff < WEEK_DAYS);
}
