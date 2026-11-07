import type { MediaFilter } from './types';
import { brtDay } from './day';

// O que a Mesa guarda no aparelho (SPEC §2.1, §2.2, §2.9, §7.8), 05/11/2026.
// Tudo atrás de try/catch: em aba anônima, WebView sem armazenamento ou cota
// cheia, a Mesa funciona igual, só sem lembrar.

const K = {
  media: 'cineoracle:mesa:media',
  sound: 'cineoracle:mesa-sound',
  entered: 'cineoracle:mesaEntered',
  askCounts: 'cineoracle:mesa:askCounts',
  days: 'cineoracle:mesa:days',
  dayState: (uid: string) => `cineoracle:mesa:day:${uid}`,
};

const read = (store: 'local' | 'session', key: string): string | null => {
  try {
    return (store === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const write = (store: 'local' | 'session', key: string, value: string) => {
  try {
    (store === 'local' ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    /* sem armazenamento: só não lembra */
  }
};

// Filmes e séries / Só filmes / Só séries (o menu ⋯).
export function getMediaPref(): MediaFilter {
  const v = read('local', K.media);
  return v === 'movie' || v === 'tv' ? v : 'all';
}
export const setMediaPref = (m: MediaFilter) => write('local', K.media, m);

// Som da Mesa: desligado por padrão (só '1' liga).
export const isMesaSoundOn = (): boolean => read('local', K.sound) === '1';
export const setMesaSound = (on: boolean) => write('local', K.sound, on ? '1' : '0');

// A entrada ritual acontece uma vez por aba.
export const ritualSeen = (): boolean => read('session', K.entered) === '1';
export const markRitualSeen = () => write('session', K.entered, '1');

// Quantas vezes a pessoa fez cada pergunta (as 2 mais feitas entram na mão).
export function getAskCounts(): Record<string, number> {
  try {
    const raw = read('local', K.askCounts);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
export function bumpAskCount(key: string) {
  const counts = getAskCounts();
  counts[key] = (counts[key] ?? 0) + 1;
  write('local', K.askCounts, JSON.stringify(counts));
}

// Dias distintos de uso (para "Virar as três" aparecer a partir do 3º).
export function touchUseDay(): number {
  const today = brtDay();
  let days: string[] = [];
  try {
    days = JSON.parse(read('local', K.days) || '[]') as string[];
    if (!Array.isArray(days)) days = [];
  } catch {
    days = [];
  }
  if (!days.includes(today)) days = [...days, today].slice(-10);
  write('local', K.days, JSON.stringify(days));
  return days.length;
}

// O estado do dia para a porta da home (contrato com o WP-ACERVO, §7.8):
// {"day":"2026-11-05","flipped":2,"total":3}. Só a tiragem do dia conta.
export function writeDayState(uid: string, day: string, flipped: number, total: number) {
  write('local', K.dayState(uid), JSON.stringify({ day, flipped, total }));
}
