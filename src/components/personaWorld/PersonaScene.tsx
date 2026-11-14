import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { posterUrl } from '../../lib/persona';
import type { PersonaWorld, WorldState, WorldTitle } from '../../lib/personaWorld';
import { FOCUS_RING, NIGHT, PAPER } from '../../lib/oracleTheme';
import { drawLarva, drawMoth, drawRoom, mothSpec, paintFrame, sceneHit, shrinkCover, studioSpots, NO_IMAGES, POSTER_SIZE, RH, RW, SCREEN_SIZE, type EyeHit, type Pt, type SceneHit, type SceneImages } from './draw';
import { NO_EXTRAS, type SpotKind, type StudioExtras } from './studio';

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

// A capa do filme da Persona (na tela) e os pôsteres das notas 10 (na parede),
// reduzidos a pixel. Enquanto não chegam (ou se o TMDB não responder), a cena
// usa os desenhos de reserva.
//
// 14/11/2026 (pedido do Bruno): a tela projeta a CAPA DO FILME, para todo
// mundo. Antes era a "foto do personagem", que para 70 das 84 Personas é uma
// cena larga do filme e para 14 é um pôster: uns estúdios mostravam a capa e
// outros, um recorte de cena. No dele (Contato) o recorte, feito para o
// cartão em pé, pegava mais da metade da cena e mostrava "um homem em pixels"
// ao lado da personagem. O personagem continua no cartão, embaixo da cena.
function useSceneImages(world: PersonaWorld, stage: number): SceneImages {
  const [images, setImages] = useState<SceneImages>(NO_IMAGES);
  const entry = world.persona?.code ? (world.persona.persona ?? null) : null;
  const cover = useMemo(() => (entry ? posterUrl(entry.posterPath, 'w342') : null), [entry]);
  const posterPaths = world.tens
    .slice(0, 4)
    .map((title) => title.poster ?? '')
    .join('|');
  const size = SCREEN_SIZE(stage);
  useEffect(() => {
    let alive = true;
    const posters = posterPaths.split('|').map((path) => posterUrl(path || null, 'w185'));
    Promise.all([cover ? loadImage(cover) : Promise.resolve(null), ...posters.map((src) => (src ? loadImage(src) : Promise.resolve(null)))]).then(([face, ...rest]) => {
      if (!alive) return;
      try {
        setImages({
          // a capa é em pé e a tela é deitada: entra a faixa de cima do pôster, de ponta a ponta
          portrait: face ? shrinkCover(face, size.w, size.h, 0.5, 0.14, 1) : null,
          posters: rest.map((img) => (img ? shrinkCover(img, POSTER_SIZE.w, POSTER_SIZE.h) : null)),
        });
      } catch {
        setImages(NO_IMAGES);
      }
    });
    return () => {
      alive = false;
    };
  }, [cover, posterPaths, size.w, size.h]);
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
    // De 316 a 359 px de largura (celulares estreitos) a cena de 180 px ainda
    // fica em 2×: as pontas das paredes passam um pouco da borda e são
    // cortadas. Sem isso ela cairia para 1× (metade do tamanho).
    const measure = () => {
      const fit = Math.floor(el.clientWidth / width);
      setK(Math.max(1, Math.min(maxScale, fit === 1 && el.clientWidth + 44 >= width * 2 ? 2 : fit)));
    };
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

// O que um objeto da sala de estar faz quando é tocado (a máquina do Jackpot,
// a mesa de pôquer, o aquário, o livro, a caixa do Clube do Terror).
export interface Hotspot {
  // o nome do objeto (aparece ao passar o mouse ou chegar pelo teclado, e é o que o leitor de tela lê)
  label: string;
  onClick?: () => void;
  // em vez de onClick: o objeto é um link
  to?: string;
  // um número no canto (o que está esperando a pessoa no Jackpot)
  badge?: number;
  // algo preso em cima do objeto (o balão da ficha do dia)
  above?: React.ReactNode;
}

const HOTSPOT_CLASS = `group/spot absolute block min-w-0 min-h-0 rounded-md transition-shadow duration-150 hover:shadow-[inset_0_0_0_2px_rgba(243,234,211,0.75)] focus-visible:shadow-[inset_0_0_0_2px_rgba(243,234,211,0.9)] ${FOCUS_RING}`;

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
  // a sala de estar: a máquina do Jackpot e a mesa de pôquer aparecem?
  extras?: StudioExtras;
  // os objetos que levam a algum lugar (sem isto, são só desenho)
  hotspots?: Partial<Record<SpotKind, Hotspot>>;
}> = ({ world, state, scale = 'fit', maxScale = 4, animated = true, onPick, label, className = '', extras = NO_EXTRAS, hotspots }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<HTMLCanvasElement | null>(null);
  const creatureRef = useRef<Pt | null>(null);
  const tickRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const k = useIntegerScale(wrapRef, RW, scale, maxScale);
  const images = useSceneImages(world, state.stage);
  const spec = useMemo(() => mothSpec(state, world), [state, world]);
  const { jackpot, poker } = extras;

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
    const lounge: StudioExtras = { jackpot, poker };
    drawRoom(roomCtx, state, world, images, lounge);
    const still = !animated || Boolean(reduceMotion);
    const paint = () => {
      creatureRef.current = paintFrame(ctx, room, state, world, spec, tickRef.current, still, lounge);
    };
    paint();
    if (still) return;
    return runFrames(canvas, tickRef, paint);
  }, [state, world, images, spec, animated, reduceMotion, jackpot, poker]);

  const pick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPick(sceneHit(((event.clientX - rect.left) / rect.width) * RW, ((event.clientY - rect.top) / rect.height) * RH, state, world, creatureRef.current));
  };

  // os objetos tocáveis: um botão (ou link) de verdade por cima de cada um,
  // para o teclado e o leitor de tela também chegarem neles
  const spots = useMemo(() => (hotspots ? studioSpots(world, { jackpot, poker }).filter((spot) => hotspots[spot.kind]) : []), [hotspots, world, jackpot, poker]);

  return (
    <div ref={wrapRef} className={`grid place-items-center overflow-hidden ${className}`}>
      <div className="relative shrink-0" style={{ width: RW * k, height: RH * k }}>
        <canvas
          ref={canvasRef}
          width={RW}
          height={RH}
          role="img"
          aria-label={label}
          onClick={onPick ? pick : undefined}
          className="block"
          style={{ width: RW * k, height: RH * k, imageRendering: 'pixelated', cursor: onPick ? 'pointer' : undefined }}
        />
        {spots.map((spot) => {
          const hotspot = hotspots?.[spot.kind];
          if (!hotspot) return null;
          const style: React.CSSProperties = { left: spot.x * k, top: spot.y * k, width: spot.w * k, height: spot.h * k };
          const inner = (
            <>
              <span
                className="pointer-events-none absolute left-1/2 bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold leading-none opacity-0 transition-opacity duration-150 group-hover/spot:opacity-100 group-focus-visible/spot:opacity-100"
                style={{ background: PAPER, color: NIGHT, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                aria-hidden
              >
                {hotspot.label}
              </span>
              {hotspot.badge ? (
                <span className="pointer-events-none absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-fuchsia-500 px-1 text-[11px] font-bold leading-none text-white shadow" aria-hidden>
                  {hotspot.badge}
                </span>
              ) : null}
            </>
          );
          return (
            <React.Fragment key={spot.kind}>
              {hotspot.to ? (
                <Link to={hotspot.to} className={HOTSPOT_CLASS} style={style} aria-label={hotspot.label} onClick={hotspot.onClick}>
                  {inner}
                </Link>
              ) : (
                <button type="button" className={HOTSPOT_CLASS} style={style} aria-label={hotspot.label} onClick={hotspot.onClick}>
                  {inner}
                </button>
              )}
              {hotspot.above && (
                <span className="absolute z-[2]" style={{ left: (spot.x + spot.w / 2) * k, top: spot.y * k }}>
                  {hotspot.above}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
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
