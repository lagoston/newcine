/**
 * Ajustes da mesa (`poker.settings.v1`, SPEC §4.6, §6.3, §7.9–7.11). Só preferências
 * deste aparelho: nada aqui é fonte de verdade. Todo acesso ao localStorage tem
 * try/catch (janela anônima, armazenamento cheio ou bloqueado).
 */
import { useSyncExternalStore } from 'react';

export type TalkMode = 'all' | 'important' | 'none';
export type Speed = 'normal' | 'fast' | 'turbo';

export interface PokerSettingsLocal {
  v: 1;
  talk: TalkMode;
  speed: Speed;
  effects: boolean;
  voices: boolean;
  vibration: boolean;
  fourColor: boolean;
  bigCards: boolean;
  /** null = ainda não decidido (liga para quem fez o treino, desliga para quem pulou). */
  thermo: boolean | null;
  leftHanded: boolean;
  shortcuts: boolean;
}

const KEY = 'poker.settings.v1';
const DEFAULTS: PokerSettingsLocal = {
  v: 1,
  talk: 'all',
  speed: 'normal',
  effects: true,
  voices: true,
  vibration: true,
  fourColor: false,
  bigCards: false,
  thermo: null,
  leftHanded: false,
  shortcuts: true,
};

function read(): PokerSettingsLocal {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<PokerSettingsLocal>;
    if (parsed?.v !== 1) return DEFAULTS;
    return { ...DEFAULTS, ...parsed, v: 1 };
  } catch {
    return DEFAULTS;
  }
}

let current: PokerSettingsLocal | null = null;
const listeners = new Set<() => void>();

export function getPokerSettings(): PokerSettingsLocal {
  if (!current) current = typeof window === 'undefined' ? DEFAULTS : read();
  return current;
}

export function setPokerSettings(patch: Partial<PokerSettingsLocal>) {
  current = { ...getPokerSettings(), ...patch, v: 1 };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePokerSettings(): PokerSettingsLocal {
  return useSyncExternalStore(subscribe, getPokerSettings, () => DEFAULTS);
}

/** Multiplicador das durações (§7.9): Rápido = metade; Turbo = quase nada, mantendo as proporções do pensar. */
export function speedFactor(speed: Speed): { anim: number; think: number } {
  if (speed === 'fast') return { anim: 0.5, think: 0.5 };
  if (speed === 'turbo') return { anim: 0.2, think: 0.2 };
  return { anim: 1, think: 1 };
}

export const SPEEDS: Speed[] = ['normal', 'fast', 'turbo'];
