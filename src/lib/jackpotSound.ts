// Sons do Poster Jackpot, sintetizados na hora (Web Audio, nenhum arquivo):
// o "tic" de cada pôster que passa pela agulha da roleta e o carrilhão do
// prêmio, mais rico conforme a raridade. Só toca depois de um toque da pessoa
// (o giro) e pode ser desligado (fica salvo neste aparelho).

import type { PosterRarity } from './posterJackpot';

const MUTE_KEY = 'cineoracle:jackpot-muted';
let ctx: AudioContext | null = null;

export function isJackpotMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setJackpotMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || isJackpotMuted()) return null;
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Chamado no toque do botão: destrava o áudio no celular.
export function primeJackpotAudio() {
  audio();
}

function tone(ac: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
}

// O tic da agulha (um pouco diferente a cada vez, como uma roleta de verdade).
export function playTick() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 1500 + Math.random() * 400, t, 0.05, 0.05, 'triangle');
  tone(ac, 3200, t, 0.02, 0.015, 'square');
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// O carrilhão do prêmio: arpejo de caixinha de música, com mais notas (e um
// brilho no fim) quanto mais rara.
export function playReveal(rarity: PosterRarity, withEffect: boolean) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  const seqs: Record<PosterRarity, number[]> = {
    common: [72, 76, 79],
    rare: [72, 76, 79, 84],
    epic: [67, 72, 76, 79, 84, 88],
    legendary: [67, 72, 76, 79, 84, 88, 91, 96],
  };
  const step = rarity === 'legendary' ? 0.09 : 0.075;
  seqs[rarity].forEach((n, i) => {
    tone(ac, NOTE(n), t + i * step, 0.9, 0.09, 'sine');
    tone(ac, NOTE(n + 12), t + i * step, 0.45, 0.025, 'triangle');
  });
  const end = t + seqs[rarity].length * step;
  if (rarity === 'epic' || rarity === 'legendary') {
    [0, 4, 7, 12].forEach((d) => tone(ac, NOTE(72 + d), end, rarity === 'legendary' ? 1.8 : 1.2, 0.05, 'sine'));
  }
  if (withEffect || rarity === 'legendary') {
    for (let i = 0; i < 10; i++) tone(ac, NOTE(96 + (i % 5) * 2), end + 0.05 + i * 0.045, 0.25, 0.02, 'sine');
  }
}
