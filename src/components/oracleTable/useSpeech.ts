import { useCallback, useEffect, useRef, useState } from 'react';
import type { Spoken } from '../../lib/mesa/dialogue/types';
import { playVoice } from '../../lib/mesa/sound';

// A fila da faixa de fala (SPEC §3.2), 05/11/2026: um balão por vez, cada um
// pelo tempo que o Diretor calculou (balloonMs do pôquer); um toque avança.
// Quando a fila acaba, a última fala fica na faixa, apagada (a faixa nunca
// fica num buraco vazio no meio da mesa).
//   replace  um gesto da pessoa: a reação dela entra no lugar do que falta
//   append   no fim da fila (a troca depois das três viradas)
//   front    interrompe e fala já (o selo)

export function useSpeech({ active, reduced }: { active: boolean; reduced: boolean }) {
  const [queue, setQueue] = useState<Spoken[]>([]);
  const [current, setCurrent] = useState<Spoken | null>(null);
  const [last, setLast] = useState<Spoken | null>(null);
  const timer = useRef<number | null>(null);

  const say = useCallback((lines: Spoken[], mode: 'replace' | 'append' | 'front' = 'append') => {
    const clean = lines.filter((l) => l && l.text);
    if (!clean.length && mode !== 'replace') return;
    if (mode === 'append') setQueue((q) => [...q, ...clean]);
    else {
      setQueue((q) => (mode === 'front' ? [...clean, ...q] : clean));
      setCurrent((cur) => {
        if (cur) setLast(cur);
        return null;
      });
    }
  }, []);

  const skip = useCallback(() => {
    setCurrent((cur) => {
      if (cur) setLast(cur);
      return null;
    });
  }, []);

  // Puxa a próxima da fila.
  useEffect(() => {
    if (!active || current || !queue.length) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
    playVoice(next.who, next.text.length);
  }, [active, current, queue]);

  // Cada balão dura o tempo dele (sem animação, um pouco menos).
  useEffect(() => {
    if (!current) return;
    const ms = Math.max(1800, current.ms - (reduced ? 200 : 0));
    timer.current = window.setTimeout(() => {
      setLast(current);
      setCurrent(null);
    }, ms);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [current, reduced]);

  return { current, last, say, skip, pending: queue.length };
}
