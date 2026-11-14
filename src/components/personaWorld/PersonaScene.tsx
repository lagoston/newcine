import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { personaPortrait, posterUrl } from '../../lib/persona';
import type { PersonaWorld, WorldState, WorldTitle } from '../../lib/personaWorld';
import { drawLarva, drawMoth, drawRoom, mothSpec, paintFrame, sceneHit, shrinkCover, NO_IMAGES, POSTER_SIZE, RH, RW, SCREEN_SIZE, type EyeHit, type Pt, type SceneHit, type SceneImages } from './draw';

// As duas telas da Persona viva (13/11/2026): a cabine inteira (PersonaScene) e
// a mariposa de perto (MothCloseUp). As duas são um canvas pequeno ampliado em
// escala INTEIRA (cada pixel do desenho ocupa k × k pixels da tela), para o
// pixel art não borrar. O que se mexe roda a 8 quadros por segundo e para
// quando a aba do navegador está escondida; com "reduzir movimento" ligado,
// fica um quadro parado.

const FRAME_MS = 125;

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    // sem isto o canvas fica "sujo" e não poderia virar imagem de compartilhar
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const focusPoint = (focus: string): [number, number] => {
  const parts = focus.split(/\s+/).map((part) => parseFloat(part) / 100);
  return [Number.isFinite(parts[0]) ? parts[0] : 0.5, Number.isFinite(parts[1]) ? parts[1] : 0.3];
};

// O retrato do personagem e os pôsteres das notas 10, reduzidos a pixel. Enquanto
// não chegam (ou se o TMDB não responder), a cena usa os desenhos de reserva.
function useSceneImages(world: PersonaWorld, stage: number): SceneImages {
  const [images, setImages] = useState<SceneImages>(NO_IMAGES);
  const entry = world.persona?.code ? (world.persona.persona ?? null) : null;
  const portrait = useMemo(() => (entry ? personaPortrait(entry) : null), [entry]);
  const posterPaths = world.tens
    .slice(0, 4)
    .map((title) => title.poster ?? '')
    .join('|');
  const size = SCREEN_SIZE(stage);
  useEffect(() => {
    let alive = true;
    const posters = posterPaths.split('|').map((path) => posterUrl(path || null, 'w185'));
    Promise.all([portrait?.src ? loadImage(portrait.src) : Promise.resolve(null), ...posters.map((src) => (src ? loadImage(src) : Promise.resolve(null)))]).then(([face, ...rest]) => {
      if (!alive) return;
      try {
        const [fx, fy] = focusPoint(portrait?.focus ?? '50% 30%');
        setImages({
          // a foto do personagem entra um pouco mais de perto (a tela é pequena)
          portrait: face ? shrinkCover(face, size.w, size.h, fx, fy, portrait?.isCharacter ? 1.25 : 1) : null,
          posters: rest.map((img) => (img ? shrinkCover(img, POSTER_SIZE.w, POSTER_SIZE.h) : null)),
        });
      } catch {
        setImages(NO_IMAGES);
      }
    });
    return () => {
      alive = false;
    };
  }, [portrait, posterPaths, size.w, size.h]);
  return images;
}

// Roda `paint` a 8 quadros por segundo enquanto o canvas está na tela e a aba
// do navegador está aberta (fora disso, nada é desenhado).
function runFrames(canvas: HTMLCanvasElement, tick: React.MutableRefObject<number>, paint: () => void): () => void {
  let visible = true;
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          visible = entries.some((entry) => entry.isIntersecting);
        });
  observer?.observe(canvas);
  const timer = window.setInterval(() => {
    if (document.hidden || !visible) return;
    tick.current += 1;
    paint();
  }, FRAME_MS);
  return () => {
    window.clearInterval(timer);
    observer?.disconnect();
  };
}

// o maior múltiplo inteiro do desenho que cabe na largura do elemento
function useIntegerScale(ref: React.RefObject<HTMLElement>, width: number, scale: number | 'fit', maxScale: number): number {
  const [k, setK] = useState(typeof scale === 'number' ? scale : 2);
  useLayoutEffect(() => {
    if (scale !== 'fit') {
      setK(scale);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const measure = () => setK(Math.max(1, Math.min(maxScale, Math.floor(el.clientWidth / width))));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, width, scale, maxScale]);
  return k;
}

// ---------------------------------------------------------------------------
// A cabine
// ---------------------------------------------------------------------------

export const PersonaScene: React.FC<{
  world: PersonaWorld;
  state: WorldState;
  // 'fit' = o maior múltiplo inteiro que cabe na largura (até maxScale)
  scale?: number | 'fit';
  maxScale?: number;
  // false = um quadro parado (miniatura do perfil)
  animated?: boolean;
  // toque na cena (atalho: tudo o que ela abre também existe em botões)
  onPick?: (hit: SceneHit) => void;
  label: string;
  className?: string;
}> = ({ world, state, scale = 'fit', maxScale = 4, animated = true, onPick, label, className = '' }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<HTMLCanvasElement | null>(null);
  const creatureRef = useRef<Pt | null>(null);
  const tickRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const k = useIntegerScale(wrapRef, RW, scale, maxScale);
  const images = useSceneImages(world, state.stage);
  const spec = useMemo(() => mothSpec(state, world), [state, world]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const room = roomRef.current ?? document.createElement('canvas');
    roomRef.current = room;
    room.width = RW;
    room.height = RH;
    const roomCtx = room.getContext('2d');
    if (!roomCtx) return;
    drawRoom(roomCtx, state, world, images);
    const still = !animated || Boolean(reduceMotion);
    const paint = () => {
      creatureRef.current = paintFrame(ctx, room, state, world, spec, tickRef.current, still);
    };
    paint();
    if (still) return;
    return runFrames(canvas, tickRef, paint);
  }, [state, world, images, spec, animated, reduceMotion]);

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPick(sceneHit(((event.clientX - rect.left) / rect.width) * RW, ((event.clientY - rect.top) / rect.height) * RH, state, world, creatureRef.current));
  };

  return (
    <div ref={wrapRef} className={`grid place-items-center ${className}`}>
      <canvas
        ref={canvasRef}
        width={RW}
        height={RH}
        role="img"
        aria-label={label}
        onClick={onPick ? pick : undefined}
        className="block max-w-full"
        style={{ width: RW * k, height: RH * k, imageRendering: 'pixelated', cursor: onPick ? 'pointer' : undefined }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// A mariposa de perto (ou a lagarta, ou o ovo)
// ---------------------------------------------------------------------------

const CW = 96;
const CH = 80;

export const MothCloseUp: React.FC<{
  world: PersonaWorld;
  state: WorldState;
  // toque num olho da asa: o título de nota 9 ou 10 que ele é
  onOpenTitle?: (title: WorldTitle) => void;
  label: string;
  maxScale?: number;
  className?: string;
}> = ({ world, state, onOpenTitle, label, maxScale = 3, className = '' }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<EyeHit[]>([]);
  const tickRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const k = useIntegerScale(wrapRef, CW, 'fit', maxScale);
  const spec = useMemo(() => mothSpec(state, world), [state, world]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = Boolean(reduceMotion);
    const paint = () => {
      ctx.clearRect(0, 0, CW, CH);
      if (spec) {
        hitsRef.current = drawMoth(ctx, 48, 42, 46, spec, still ? 1 : [1, 0.9, 0.78, 0.9][(tickRef.current >> 1) % 4]);
      } else {
        hitsRef.current = [];
        drawLarva(ctx, 48, 42, world.rated === 0 ? 4 : 2, world);
      }
    };
    paint();
    if (still || !spec) return;
    return runFrames(canvas, tickRef, paint);
  }, [spec, world, reduceMotion]);

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onOpenTitle) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CW;
    const y = ((event.clientY - rect.top) / rect.height) * CH;
    // o olho mais perto do toque, com uma folga (o olho é pequeno para o dedo)
    let best: EyeHit | null = null;
    let bestDistance = Infinity;
    hitsRef.current.forEach((hit) => {
      const distance = Math.hypot(x - hit.x, y - hit.y);
      if (distance <= hit.r + 4 && distance < bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    });
    if (best) onOpenTitle((best as EyeHit).eye.title);
  };

  return (
    <div ref={wrapRef} className={`grid place-items-center ${className}`}>
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        role="img"
        aria-label={label}
        onClick={onOpenTitle && spec && spec.eyes.length > 0 ? pick : undefined}
        className="block max-w-full"
        style={{ width: CW * k, height: CH * k, imageRendering: 'pixelated', cursor: onOpenTitle && spec && spec.eyes.length > 0 ? 'pointer' : undefined }}
      />
    </div>
  );
};

export default PersonaScene;
