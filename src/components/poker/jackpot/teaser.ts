import { useSyncExternalStore } from 'react';
import type { PokerTeaser } from '../../../lib/posterJackpot';

// O resumo do pôquer que veio no get_jackpot_state, guardado num módulo
// (03/11/2026). A porta do Jackpot publica a cada carga e a faixa de feltro
// da home escuta: nenhuma chamada nova ao banco (SPEC §7.1, item 3).
// O SPEC previa este arquivo em lib/poker/client/teaser.ts; ele mora aqui
// porque a pasta client/ é do pacote D1.

let current: PokerTeaser | null = null;
const listeners = new Set<() => void>();

export function publishPokerTeaser(value: PokerTeaser | null | undefined) {
  const next = value ?? null;
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

export const getPokerTeaser = () => current;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePokerTeaser(): PokerTeaser | null {
  return useSyncExternalStore(subscribe, getPokerTeaser, getPokerTeaser);
}
