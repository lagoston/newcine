import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { PersonaWorld, WorldState, WorldTitle } from '../../lib/personaWorld';
import { FOCUS_RING, NIGHT, PAPER } from '../../lib/oracleTheme';
import { drawLarva, drawMoth, drawRoom, mothSpec, paintFrame, studioArrange, studioPick, studioSpots, NO_IMAGES, RH, RW, type EyeHit, type SceneImages } from './draw';
import { loadSceneImages, sceneImagesKey } from './sceneImages';
import { NO_EXTRAS, type ItemId, type SpotKind, type StudioExtras } from './studio';
import { ambientInterval } from '../../lib/motion';

// As duas telas da Persona viva (13/11/2026): a cabine inteira (PersonaScene) e
// a mariposa de perto (MothCloseUp). As duas são um canvas pequeno ampliado em
// escala INTEIRA (cada pixel do desenho ocupa k × k pixels da tela), para o
// pixel art não borrar. O que se mexe roda a 8 quadros por segundo e para
// quando a aba do navegador está escondida; com "reduzir movimento" ligado,
// fica um quadro parado.

const FRAME_MS = 125;

// As imagens de verdade da cena (sceneImages.ts): a capa na tela e os pôsteres do Jackpot na parede.
function useSceneImages(world: PersonaWorld, stage: number): SceneImages {
  const [images, setImages] = useState<SceneImages>(NO_IMAGES);
  const key = sceneImagesKey(world, stage);
  const latest = useRef({ world, stage });
  latest.current = { world, stage };
  useEffect(() => {
    let alive = true;
    loadSceneImages(latest.current.world, latest.current.stage).then((value) => alive && setImages(value));
    return () => {
      alive = false;
    };
  }, [key]);
  return images;
}

// Roda `paint` a 8 quadros por segundo enquanto o canvas está na tela e o app
// está na frente (fora disso, nada é desenhado).
// 18/11/2026 (Reborn, bateria): o temporizador agora é do orçamento de
// movimento (lib/motion.ts). Ele só existe enquanto a cena pode ser vista
// (antes acordava 8 vezes por segundo, mesmo fora da tela ou com o app no
// fundo, só para desistir) e, no modo economia, desenha a metade dos quadros
// no mesmo ritmo: o relógio da cena anda de 2 em 2 (sempre par, para os
// brilhos que acendem num tique certo não se perderem todos).
function runFrames(canvas: HTMLCanvasElement, tick: React.MutableRefObject<number>, paint: () => void): () => void {
  return ambientInterval(
    canvas,
    (steps) => {
      tick.current = steps === 1 ? tick.current + 1 : ((tick.current >> 1) + 1) << 1;
      paint();
    },
    FRAME_MS
  );
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

// O que uma coisa da cena faz quando é tocada (a máquina do Jackpot, a mesa de
// pôquer, o guia, a caixa do Clube do Terror, os quadros, a tela, a mariposa,
// a estante das latas).
//
// 14/11/2026 (noite), correção do Bruno: tocar em qualquer ponto não abre mais
// nada. Só o que está aqui é tocável, e o que é tocável brilha (glow.ts).
export interface Hotspot {
  // o nome (aparece ao passar o mouse ou chegar pelo teclado, e é o que o leitor de tela lê)
  label: string;
  onClick?: () => void;
  // em vez de onClick: é um link
  to?: string;
  // um número no canto (o que está esperando a pessoa no Jackpot)
  badge?: number;
  // algo preso em cima (o balão da ficha do dia)
  above?: React.ReactNode;
  // false = tocável, mas sem brilho (a estante das latas)
  glow?: boolean;
}

const HOTSPOT_CLASS = `group/spot absolute block min-w-0 min-h-0 cursor-pointer rounded-md ${FOCUS_RING}`;

// Arrumar o estúdio (15/11/2026, tarde). Pedido do Bruno: "deixe o usuário
// posicionar os itens que ele já tem". Com isto a cena troca os botões de
// sempre por dois tipos: um por objeto que pode mudar de lugar e um por lugar
// do chão. Quem decide o que cada toque faz é quem monta a cena (pegar um
// objeto, levá-lo a um lugar vazio, trocar dois de lugar).
//
// O toque e o mouse são conferidos no desenho, pixel a pixel (studioPick): em
// isométrico o retângulo de um objeto cobre o chão dos lugares de trás, e um
// botão retangular por objeto roubava o toque do lugar. Os botões continuam
// existindo para o teclado e o leitor de tela, sem receber o toque.
export interface SceneArrange {
  // o objeto que a pessoa pegou
  picked: ItemId | null;
  // 17/11/2026: há um objeto do inventário na mão (não está na sala)
  carrying?: boolean;
  onItem: (id: ItemId) => void;
  onPlace: (place: number) => void;
  // os nomes, para o leitor de tela e para quem passa o mouse
  itemLabel: (id: ItemId, picked: boolean) => string;
  placeLabel: (place: number, free: boolean) => string;
}
const ARRANGE_BUTTON = `absolute block min-w-0 min-h-0 pointer-events-none rounded-md ${FOCUS_RING}`;

export const PersonaScene: React.FC<{
  world: PersonaWorld;
  state: WorldState;
  // 'fit' = o maior múltiplo inteiro que cabe na largura (até maxScale)
  scale?: number | 'fit';
  maxScale?: number;
  // false = um quadro parado
  animated?: boolean;
  label: string;
  className?: string;
  // a sala de estar: a máquina do Jackpot e a mesa de pôquer aparecem?
  extras?: StudioExtras;
  // o que pode ser tocado (sem isto, a cena é só desenho)
  hotspots?: Partial<Record<SpotKind, Hotspot>>;
  // arrumando o estúdio: no lugar dos hotspots, os objetos e os lugares do chão
  arrange?: SceneArrange | null;
}> = ({ world, state, scale = 'fit', maxScale = 4, animated = true, label, className = '', extras = NO_EXTRAS, hotspots, arrange = null }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<HTMLCanvasElement | null>(null);
  const tickRef = useRef(0);
  const reduceMotion = useReducedMotion();
  const k = useIntegerScale(wrapRef, RW, scale, maxScale);
  const images = useSceneImages(world, state.stage);
  const spec = useMemo(() => mothSpec(state, world), [state, world]);
  const { jackpot, poker } = extras;
  // o que brilha: tudo o que é tocável, menos o que pediu para não brilhar
  const glowKey = Object.entries(hotspots ?? {})
    .filter(([, hotspot]) => hotspot && hotspot.glow !== false)
    .map(([kind]) => kind)
    .sort()
    .join(',');
  const arranging = Boolean(arrange);
  const picked = arrange?.picked ?? null;
  const carrying = Boolean(arrange?.carrying);

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
    const moving = arranging ? { picked, carrying } : null;
    drawRoom(roomCtx, state, world, images, lounge, moving);
    const still = !animated || Boolean(reduceMotion);
    const glow = new Set(glowKey ? (glowKey.split(',') as SpotKind[]) : []);
    const paint = () => {
      paintFrame(ctx, room, state, world, spec, tickRef.current, still, lounge, glow, moving);
    };
    paint();
    if (still) return;
    return runFrames(canvas, tickRef, paint);
  }, [state, world, images, spec, animated, reduceMotion, jackpot, poker, glowKey, arranging, picked, carrying]);

  // os objetos tocáveis: um botão (ou link) de verdade por cima de cada um,
  // para o teclado e o leitor de tela também chegarem neles
  const spots = useMemo(() => (hotspots && !arranging ? studioSpots(world, state, { jackpot, poker }).filter((spot) => hotspots[spot.kind]) : []), [hotspots, arranging, world, state, jackpot, poker]);
  // arrumando: os lugares do chão e, por cima, os objetos (de trás para a frente)
  const targets = useMemo(() => (arranging ? studioArrange(world, state, { jackpot, poker }) : null), [arranging, world, state, jackpot, poker]);

  return (
    // place-content-center: quando a cena é mais larga que a tela (celular
    // estreito, 2×), o que sobra é cortado por igual dos dois lados. Só com
    // place-items a cena ficava encostada à esquerda e o corte ia todo para a
    // direita, em cima da máquina e do guia.
    <div ref={wrapRef} className={`grid place-content-center place-items-center overflow-hidden ${className}`}>
      <div className="relative shrink-0" style={{ width: RW * k, height: RH * k }}>
        <canvas
          ref={canvasRef}
          width={RW}
          height={RH}
          role="img"
          aria-label={label}
          className="block"
          style={{ width: RW * k, height: RH * k, imageRendering: 'pixelated' }}
        />
        {arrange && (
          // o toque: o que estiver desenhado no ponto tocado
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const hit = studioPick(world, state, { jackpot, poker }, ((event.clientX - box.left) / box.width) * RW, ((event.clientY - box.top) / box.height) * RH);
              if (!hit) return;
              if ('item' in hit) arrange.onItem(hit.item);
              else arrange.onPlace(hit.place);
            }}
          />
        )}
        {arrange &&
          targets?.places.map((place) => (
            <button
              key={`place-${place.index}`}
              type="button"
              className={ARRANGE_BUTTON}
              style={{ left: place.rect.x * k, top: place.rect.y * k, width: place.rect.w * k, height: place.rect.h * k }}
              aria-label={arrange.placeLabel(place.index, place.free)}
              onClick={() => arrange.onPlace(place.index)}
            />
          ))}
        {arrange &&
          targets?.items.map((item) => (
            <button
              key={`item-${item.id}`}
              type="button"
              className={ARRANGE_BUTTON}
              style={{ left: item.rect.x * k, top: item.rect.y * k, width: item.rect.w * k, height: item.rect.h * k }}
              aria-pressed={arrange.picked === item.id}
              aria-label={arrange.itemLabel(item.id, arrange.picked === item.id)}
              onClick={() => arrange.onItem(item.id)}
            />
          ))}
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
                // no ombro do objeto (o canto de cima da caixa do toque fica no ar, longe do desenho)
                <span className="pointer-events-none absolute -right-1 top-[12%] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-fuchsia-500 px-1 text-[11px] font-bold leading-none text-white shadow" aria-hidden>
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
