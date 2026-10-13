import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion, useInView } from 'framer-motion';
import { PAPER, MIST, PIXEL, ratingTone } from '../../lib/oracleTheme';

// Peças comuns do observatório do perfil (12/10/2026, revisto em 13/10).
// A nota aparece sempre como número, na cor da faixa dela (as mesmas faixas
// do site inteiro: vermelho, amarelo, verde e rosa no 10). Ver
// lib/tasteStats.ts.

export const formatOne = (value: number, language: string) =>
  value.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Cor da nota média (a faixa da nota arredondada).
export const affinityColor = (avg: number | null | undefined) => (typeof avg === 'number' ? ratingTone(Math.round(avg)).color : MIST);

// Número que sobe até o valor quando o bloco aparece na tela (uma vez).
export function useCountUp(target: number, durationMs = 1100) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [value, setValue] = useState(reduceMotion ? target : 0);
  useEffect(() => {
    if (reduceMotion) {
      setValue(target);
      return;
    }
    if (!inView) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, inView, reduceMotion, durationMs]);
  return { ref, value };
}

// Anel: o arco mostra uma fração (0 a 1) e a cor, a nota.
export const Ring: React.FC<{
  size: number;
  stroke?: number;
  fraction: number;
  color: string;
  children?: React.ReactNode;
  className?: string;
  glow?: boolean;
}> = ({ size, stroke = 4, fraction, color, children, className = '', glow = true }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <span className={`relative inline-grid place-items-center shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          style={glow ? { filter: `drop-shadow(0 0 6px ${color}88)` } : undefined}
        />
      </svg>
      {children}
    </span>
  );
};

// Título de um bloco: Pixelify + uma linha de apoio.
export const ModuleTitle: React.FC<{ title: string; hint?: React.ReactNode; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg sm:text-xl leading-tight">
        {title}
      </h3>
      {hint && (
        <p className="mt-1 text-[13px] leading-snug" style={{ color: MIST }}>
          {hint}
        </p>
      )}
    </div>
    {action}
  </div>
);

// Largura de um elemento, acompanhando o redimensionamento.
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (typeof next === 'number') setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

// Largura de um texto na fonte do site (para arrumar palavras num círculo).
let measureCanvas: HTMLCanvasElement | null = null;
export function measureText(text: string, sizePx: number, weight = 500, family?: string): number {
  if (typeof document === 'undefined') return text.length * sizePx * 0.56;
  measureCanvas = measureCanvas || document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return text.length * sizePx * 0.56;
  const font = family || getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.font = `${weight} ${sizePx}px ${font}`;
  return ctx.measureText(text).width;
}
