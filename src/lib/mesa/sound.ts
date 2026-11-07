import { isJackpotMuted } from '../jackpotSound';
import { isMesaSoundOn } from './prefs';
import type { Seat } from './types';

// Sons da Mesa (SPEC §7.5), 05/11/2026: todos sintetizados na hora (Web Audio,
// sem arquivo), DESLIGADOS por padrão. Tocam só com a chave da Mesa ligada
// (cineoracle:mesa-sound = '1'), nunca com o mudo geral do site
// (isJackpotMuted) e nunca antes do primeiro toque (primeMesaAudio).
// playVoice é cópia dos bipes do pôquer (coaxar, triângulo desafinado,
// sibilo); o pôquer não é importado para não puxar o pacote dele.

let ctx: AudioContext | null = null;
let primed = false;
let noiseBuf: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !primed || !isMesaSoundOn() || isJackpotMuted()) return null;
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

// Chamado no primeiro gesto dentro da Mesa: destrava o áudio no celular.
export function primeMesaAudio() {
  primed = true;
  audio();
}

function tone(ac: AudioContext, freq: number, start: number, length: number, volume: number, type: OscillatorType = 'sine') {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
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
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
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

// Dar as cartas: um ruído curto filtrado em 2 kHz, por carta.
export function playDeal(cards = 1) {
  const ac = audio();
  if (!ac) return;
  for (let i = 0; i < cards; i += 1) noise(ac, ac.currentTime + i * 0.09, 0.06, 0.1, { type: 'bandpass', freq: 2000, q: 0.8 });
}

// Virar: dois tons, 660 e 990 Hz, em 40 ms.
export function playFlip() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 660, t, 0.04, 0.05, 'triangle');
  tone(ac, 990, t + 0.04, 0.05, 0.045, 'triangle');
}

// A voz de cada bicho (cópia do pôquer). O Espelho não tem voz.
export function playVoice(who: Seat, chars: number) {
  if (who === 'espelho') return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const n = Math.min(8, Math.max(2, Math.round(chars / 9)));
  for (let i = 0; i < n; i += 1) {
    const s = t + i * 0.085;
    if (who === 'bogart') tone(ac, 150 + (i % 3) * 12, s, 0.06, 0.05, 'square');
    else if (who === 'cypher') noise(ac, s, 0.05, 0.05, { type: 'bandpass', freq: 6000, q: 3 });
    else {
      const o = tone(ac, 300 + (i % 2) * 18, s, 0.07, 0.05, 'triangle');
      o.detune.setValueAtTime(0, s);
      o.detune.linearRampToValueAtTime(30, s + 0.07);
    }
  }
}
