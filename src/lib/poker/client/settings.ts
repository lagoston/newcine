/**
 * Ajustes da mesa (`poker.settings.v1`, SPEC §4.6, §6.3, §7.9–7.11). Só preferências
 * deste aparelho: nada aqui é fonte de verdade. Todo acesso ao localStorage tem
 * try/catch (janela anônima, armazenamento cheio ou bloqueado).
 */
import { useSyncExternalStore } from 'react';

export type TalkMode = 'all' | 'important' | 'none';
// 'slow' (03/11/2026): a Calma, mais lenta que o Normal.
export type Speed = 'slow' | 'normal' | 'fast' | 'turbo';

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
    const speed = parsed.speed && ['slow', 'normal', 'fast', 'turbo'].includes(parsed.speed) ? parsed.speed : DEFAULTS.speed;
    return { ...DEFAULTS, ...parsed, speed, v: 1 };
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

/**
 * Multiplicador das durações (§7.9) sobre os tempos de `DUR` (useTable) e o pensar dos bots.
 * 03/11/2026 (Pôster Poker), pedido do Bruno: "a velocidade mais baixa está rápida para mim".
 * Todas ficaram mais lentas e nasceu a Calma (a mais lenta); o Normal de hoje vale 1,4× o
 * de antes. Proporções do pensar mantidas (o tempo de pensar é um tell, §3.6).
 */
export function speedFactor(speed: Speed): { anim: number; think: number } {
  if (speed === 'slow') return { anim: 2, think: 1.9 };
  if (speed === 'fast') return { anim: 0.8, think: 0.75 };
  if (speed === 'turbo') return { anim: 0.4, think: 0.35 };
  return { anim: 1.4, think: 1.35 };
}

/** Da mais lenta à mais rápida (o botão da barra da mesa gira nesta ordem). */
export const SPEEDS: Speed[] = ['slow', 'normal', 'fast', 'turbo'];

/** Rótulo curto do botão da barra, relativo ao Normal. */
export const SPEED_TAG: Record<Speed, string> = { slow: '½×', normal: '1×', fast: '2×', turbo: '4×' };
