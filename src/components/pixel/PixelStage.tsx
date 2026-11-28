import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ambientInterval, useCalm } from '../../lib/motion';

// Um palco de pixel art (28/11/2026): um canvas baixinho (a cena tem `height`
// pixels de altura) ampliado um número inteiro de vezes para o pixel não
// borrar, com a largura acompanhando a da tela. É a mesma receita do salão dos
// mentores do Acervo, separada para as cenas novas (a sala de Natal).
//
// Quem usa passa `paint(ctx, largura, relógio, parado)`. O relógio anda 1 por
// quadro (8 por segundo) só com a cena na tela e o app na frente (lib/motion);
// com "menos movimento" ou no modo economia ele fica em 0 e a cena é um quadro
// parado. `repaintKey` muda → a cena é redesenhada na hora.

interface PixelStageProps {
  height: number;
  paint: (ctx: CanvasRenderingContext2D, width: number, tick: number, still: boolean) => void;
  repaintKey?: unknown;
  frameMs?: number;
  className?: string;
  // quantas vezes ampliar (número inteiro) para uma largura de tela em px;
  // o padrão é o do salão dos mentores: 2× no celular, 3× a partir de 620 px
  scale?: (width: number) => number;
}

const defaultScale = (width: number) => (width >= 620 ? 3 : 2);

const PixelStage: React.FC<PixelStageProps> = ({ height, paint, repaintKey, frameMs = 125, className = '', scale = defaultScale }) => {
  const calm = useCalm();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ k: 2, w: 164 });
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const tick = useRef(1);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (!width) return;
      const k = Math.max(1, Math.round(scaleRef.current(width)));
      const w = Math.ceil(width / k);
      setBox((current) => (current.k === k && current.w === w ? current : { k, w }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, box.w, height);
    paintRef.current(ctx, box.w, calm ? 0 : tick.current, calm);
  }, [box, calm, height]);

  useEffect(() => {
    draw();
    if (calm) return;
    return ambientInterval(
      wrapRef.current,
      (steps) => {
        tick.current += steps;
        draw();
      },
      frameMs,
    );
  }, [draw, calm, frameMs]);

  useEffect(() => {
    draw();
  }, [repaintKey, draw]);

  return (
    <div ref={wrapRef} aria-hidden className={`overflow-hidden ${className}`} style={{ height: height * box.k }}>
      <canvas
        ref={canvasRef}
        width={box.w}
        height={height}
        className="block max-w-none"
        style={{ width: box.w * box.k, height: height * box.k, imageRendering: 'pixelated' }}
      />
    </div>
  );
};

export default PixelStage;
