/**
 * Sons da mesa (SPEC §7.11), todos sintetizados na hora com Web Audio, como os do
 * Poster Jackpot: mesmo mudo (`isJackpotMuted`), mesmo carrilhão (`playReveal`) e
 * os interruptores próprios da mesa (Efeitos, Vozes, Vibração).
 */
import { isJackpotMuted, playReveal } from '../../jackpotSound';
import type { RivalId } from '../types.ts';
import { getPokerSettings } from './settings.ts';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio(kind: 'fx' | 'voice' = 'fx'): AudioContext | null {
  if (typeof window === 'undefined' || isJackpotMuted()) return null;
  const s = getPokerSettings();
  if (kind === 'fx' && !s.effects) return null;
  if (kind === 'voice' && !s.voices) return null;
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

/** Chamado no primeiro toque na mesa: destrava o áudio no celular. */
export function primePokerAudio() {
  audio();
}

function tone(ac: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = 'sine', endFreq?: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.05);
  return osc;
}

function noise(ac: AudioContext, start: number, length: number, volume: number, filter: { type: BiquadFilterType; freq: number; q?: number }) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = filter.type;
  f.frequency.value = filter.freq;
  if (filter.q) f.Q.value = filter.q;
  const g = ac.createGain();
  g.gain.setValueAtTime(volume, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(start);
  src.stop(start + length + 0.02);
}

/** Distribuir: ruído curto com passa-alta de 2,5 kHz, uma vez por carta. */
export function playDeal(cards = 1) {
  const ac = audio();
  if (!ac) return;
  for (let i = 0; i < cards; i++) noise(ac, ac.currentTime + i * 0.09, 0.06, 0.12, { type: 'highpass', freq: 2500 });
}

/** Apostar: as fichas de cerâmica (senos de 2,8 e 4,1 kHz). */
export function playBet(chips = 1) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < Math.min(5, chips); i++) {
    tone(ac, 2800 + Math.random() * 120, t + i * 0.07, 0.08, 0.035);
    tone(ac, 4100, t + i * 0.07 + 0.01, 0.06, 0.02);
  }
}

/** Passar: "tum-tum" de dedo no feltro. */
export function playCheck() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 140, t, 0.09, 0.18, 'sine', 70);
  tone(ac, 130, t + 0.14, 0.09, 0.15, 'sine', 65);
}

/** Fim da rodada: as apostas varrem para o pote (tilintar). */
export function playSweep() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [0, 0.05, 0.11, 0.18].forEach((d, i) => tone(ac, 3200 - i * 180, t + d, 0.07, 0.025));
}

/** Flop: clique e ruído por carta virada. */
export function playFlop(cards = 3) {
  const ac = audio();
  if (!ac) return;
  for (let i = 0; i < cards; i++) {
    const s = ac.currentTime + i * 0.13;
    noise(ac, s, 0.05, 0.1, { type: 'bandpass', freq: 3200, q: 1.2 });
    tone(ac, 1800, s, 0.02, 0.03, 'square');
  }
}

/** River depois de all-in: grave crescente (900 ms). */
export function playRumble() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 55, t, 0.9, 0.12, 'sawtooth', 110);
  noise(ac, t, 0.9, 0.04, { type: 'lowpass', freq: 300 });
}

/** Showdown: o carrilhão do Jackpot. */
export function playShowdown(big = false) {
  if (!audio()) return;
  playReveal(big ? 'epic' : 'rare', false);
}

/** Eliminação: "uá-uá" de trombone. */
export function playElimination() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [[311, 294], [294, 277], [277, 262], [262, 196]].forEach(([a, b], i) => {
    const len = i === 3 ? 0.7 : 0.28;
    tone(ac, a, t + i * 0.3, len, 0.07, 'sawtooth', b);
    tone(ac, a * 2, t + i * 0.3, len, 0.015, 'square', b * 2);
  });
}

/** Corte Final: lâmpadas acendendo uma a uma. */
export function playCutFinal() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  for (let i = 0; i < 8; i++) {
    noise(ac, t + i * 0.12, 0.03, 0.08, { type: 'highpass', freq: 5000 });
    tone(ac, 880 + i * 60, t + i * 0.12, 0.08, 0.02, 'triangle');
  }
  tone(ac, 220, t + 1.0, 0.6, 0.06, 'sine');
}

/** Vitória: fanfarra curta. */
export function playVictory() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const N = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
  [[67, 0, 0.18], [72, 0.18, 0.18], [76, 0.36, 0.18], [79, 0.54, 0.5], [76, 1.08, 0.16], [79, 1.24, 1.0]].forEach(([n, d, l]) => {
    tone(ac, N(n), t + d, l, 0.06, 'square');
    tone(ac, N(n - 12), t + d, l, 0.04, 'triangle');
  });
}

/** Sua vez: sininho. */
export function playYourTurn() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 1568, t, 0.5, 0.05, 'sine');
  tone(ac, 2349, t + 0.08, 0.6, 0.03, 'sine');
}

/** Bipes de voz enquanto o balão digita (§7.11). */
export function playVoice(speaker: RivalId | 'human', chars: number) {
  if (speaker === 'human') return;
  const ac = audio('voice');
  if (!ac) return;
  const t = ac.currentTime;
  const n = Math.min(8, Math.max(2, Math.round(chars / 9)));
  for (let i = 0; i < n; i++) {
    const s = t + i * 0.085;
    if (speaker === 'bogart') tone(ac, 150 + (i % 3) * 12, s, 0.06, 0.05, 'square');
    else if (speaker === 'cypher') noise(ac, s, 0.05, 0.05, { type: 'bandpass', freq: 6000, q: 3 });
    else {
      const o = tone(ac, 300 + (i % 2) * 18, s, 0.07, 0.05, 'triangle');
      o.detune.setValueAtTime(0, s);
      o.detune.linearRampToValueAtTime(30, s + 0.07);
    }
  }
}

/** Vibração (§7.11), respeitando o interruptor. */
export function vibrate(pattern: number | number[]) {
  if (!getPokerSettings().vibration) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // aparelho sem vibração
  }
}
