import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Hourglass, MapPin, X } from 'lucide-react';
import { MOOD_BY_LETTER } from '../../lib/moods';
import { PERSONA_THRESHOLD } from '../../lib/persona';
import { FURNITURE, GAUGES, LETTERS, worldState, type PersonaWorld, type WorldState } from '../../lib/personaWorld';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import { drawLarva, drawMoth, drawRoom, GOLD, mothSpec, NO_IMAGES, paintFrame, RH, RW, type MothSpec } from './draw';
import { NO_EXTRAS, trophiesOf, type StudioExtras, type TrophyKind } from './studio';

// O livro da mariposa (14/11/2026).
//
// Pedido do Bruno: "Esclareça melhor a evolução da borboleta enquanto o
// usuário expande sua biblioteca, mostre os itens que são conquistas com essa
// evolução [...]. Adicione uma prateleira com um livro clicável, que deve
// apresentar a evolução como um livro que apresenta a história de 'Shrek',
// inclusive com animações parecidas."
//
// Do filme vem só a ideia: um livro de contos que se abre sozinho e vira as
// páginas, com uma gravura de um lado e o texto com capitular do outro. Nada
// do filme aparece aqui (nem nomes, nem desenhos, nem personagens).
//
// O livro conta, um capítulo por passo:
//   o ovo → a lagarta → o casulo → 8 mm (o projetor) → o segredo das asas (a
//   conta da envergadura, com as prateleiras de quem é o livro) → Super 8 (a
//   poltrona) → 16 mm (o tapete) → Super 16 (o abajur) → 35 mm (a pipoqueira)
//   → 70 mm (a cortina) → IMAX (a tela grande) → Cinerama (o letreiro) → os
//   tesouros do estúdio (os objetos de evento) → e a história continua.
//
// As gravuras não são imagens prontas: são o próprio estúdio de quem é o
// livro, desenhado como ele fica em cada bitola (drawRoom com a bitola
// trocada) e recortado em volta do móvel que chega. Para saber qual é o móvel
// novo, o livro desenha a sala duas vezes (com e sem a bitola) e compara: o
// que mudou fica aceso, o resto fica na penumbra. A mariposa no alto do texto
// é a da pessoa (as asas e os olhos dela), no tamanho de cada bitola: dá para
// ver ela crescer virando as páginas. Quem ainda não tem Persona vê uma
// mariposa sem cor.
//
// No computador o livro abre em duas páginas e a folha vira em 3D em volta da
// lombada. No celular é uma página por vez (a gravura em cima do texto) e a
// folha vira para a esquerda. Com "reduzir movimento" nada gira: a página só
// troca, e o livro não abre sozinho.

type Ctx = CanvasRenderingContext2D;

const SERIF: React.CSSProperties = { fontFamily: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Noto Serif", "Times New Roman", serif' };
// as tintas sobre o papel (todas com contraste de leitura sobre o creme)
const INK_SOFT = '#5B4F6E';
const GOLD_INK = '#9A6A12';
const HERE = '#B5179E';
const PAST = '#256B41';
const FUTURE = '#655A7A';
const LEATHER = '#2B1A4A';
const PLATE_BACK: [number, number, number] = [13, 9, 25];

// ---------------------------------------------------------------------------
// O desenho
// ---------------------------------------------------------------------------

const px = (ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w, h);
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const canvasOf = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

// um estúdio sem nada avaliado (o do capítulo do ovo)
const EMPTY: PersonaWorld = { persona: null, rated: 0, out: 0, counted: 0, window: [], recent: {}, first: [], eyes: [], tens: [], last: [], best: {}, molts: [], tags: [], watch: { count: 0, fish: [] } };

// O casulo do nascimento, grande: seda creme e uma faixa de cada humor do trio.
function drawBigCocoon(ctx: Ctx, cx: number, top: number, colors: string[]) {
  px(ctx, cx, 0, MIST, 1, top);
  const rows = 38;
  for (let r = 0; r < rows; r += 1) {
    const half = Math.max(1, Math.round(9 * Math.pow(Math.sin(Math.PI * (0.06 + 0.9 * (r / (rows - 1)))), 0.75)));
    const band = colors[Math.floor(r / 4) % colors.length];
    px(ctx, cx - half, top + r, r % 4 === 2 ? band : r % 2 ? '#CBBFA5' : '#A99C80', half * 2 + 1, 1);
    px(ctx, cx - half, top + r, 'rgba(21,14,38,0.4)');
    px(ctx, cx + half, top + r, 'rgba(21,14,38,0.4)');
    if (half > 3) px(ctx, cx - half + 2, top + r, 'rgba(255,255,255,0.3)');
  }
}

// O que o livro precisa saber de quem ele conta a história.
interface BookData {
  world: PersonaWorld;
  st: WorldState;
  // a mariposa da pessoa (null = ainda sem Persona: uma mariposa sem cor)
  spec: MothSpec | null;
  // a lagarta: a da pessoa, se ela ainda é lagarta; senão, uma de exemplo com os humores dela
  larvaWorld: PersonaWorld;
  // as três cores do casulo
  cocoon: string[];
  // a sala de estar como quem olha vê (com ou sem a máquina e a mesa)
  extras: StudioExtras;
}

function bookData(world: PersonaWorld, st: WorldState, extras: StudioExtras): BookData {
  const alive = st.rank.filter((letter) => st.films[letter] > 0);
  const pool = alive.length >= 3 ? alive : ['M', 'A', 'C', 'Z', 'R', 'F', 'L', 'P', 'X'];
  const sample = [0, 1, 0, 2, 1, 0, 3, 2, 0, 1].map((index) => pool[index % pool.length]);
  const trio = st.hasTrio ? st.trio : pool.slice(0, 3);
  return {
    world,
    st,
    spec: mothSpec(st, world),
    larvaWorld: st.stage === 1 && world.first.length > 0 ? world : { ...EMPTY, rated: 10, counted: 10, first: sample },
    cocoon: trio.map((letter) => MOOD_BY_LETTER[letter]?.color ?? MIST),
    extras,
  };
}

// a mariposa da pessoa no tamanho de uma bitola (a sem cor, para quem ainda não tem)
const specAt = (data: BookData, stage: number): MothSpec => (data.spec ? { ...data.spec, stage } : { shape: 'M', bands: [{ letter: '-', upTo: 1 }], eyes: [], third: '-', stage });

// ---- as gravuras ----
const PLATE = { w: 88, h: 66 };
const LOUNGE = { w: 110, h: 96 };

const roomOf = (st: WorldState, world: PersonaWorld, extras: StudioExtras): HTMLCanvasElement => {
  const canvas = canvasOf(RW, RH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) drawRoom(ctx, st, world, NO_IMAGES, extras);
  return canvas;
};

// Recorta a gravura em volta de um ponto da sala. Com `lit` (o que acendeu),
// o resto da sala fica na penumbra, com um halo curto em volta do que acendeu.
function cropPlate(source: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, lit?: Uint8Array): HTMLCanvasElement {
  const x0 = clamp(Math.round(cx - w / 2), 0, RW - w);
  const y0 = clamp(Math.round(cy - h / 2), 0, RH - h);
  const out = canvasOf(w, h);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return out;
  ctx.fillStyle = `rgb(${PLATE_BACK.join(',')})`;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x0, y0, w, h, 0, 0, w, h);
  if (!lit) return out;
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const isLit = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && lit[(y0 + y) * RW + x0 + x] === 1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (isLit(x, y)) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy += 1) for (let dx = -2; dx <= 2 && !near; dx += 1) near = isLit(x + dx, y + dy);
      const shade = near ? 0.22 : 0.46;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) d[i + c] = Math.round(d[i + c] + (PLATE_BACK[c] - d[i + c]) * shade);
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

// O que mudou entre duas salas (o móvel que chegou) e o meio do que mudou.
function whatChanged(now: HTMLCanvasElement, before: HTMLCanvasElement): { lit: Uint8Array; cx: number; cy: number } | null {
  const a = now.getContext('2d')?.getImageData(0, 0, RW, RH).data;
  const b = before.getContext('2d')?.getImageData(0, 0, RW, RH).data;
  if (!a || !b) return null;
  const lit = new Uint8Array(RW * RH);
  let x0 = RW;
  let y0 = RH;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0, i = 0; p < RW * RH; p += 1, i += 4) {
    if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3]) continue;
    lit[p] = 1;
    const x = p % RW;
    const y = (p / RW) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  return { lit, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// As gravuras do livro, feitas uma vez cada (na primeira vez em que a página aparece).
function makePlates(data: BookData): (key: string) => HTMLCanvasElement {
  const made = new Map<string, HTMLCanvasElement>();
  const build = (key: string): HTMLCanvasElement => {
    const { world, st, extras } = data;
    if (key === 'egg' || key === 'larva') {
      // o estúdio antes da Persona, com o ovo ou a lagarta no meio
      const w = key === 'egg' ? EMPTY : data.larvaWorld;
      const s = worldState(w);
      const frame = canvasOf(RW, RH);
      const ctx = frame.getContext('2d', { willReadFrequently: true });
      if (!ctx) return frame;
      const at = paintFrame(ctx, roomOf(s, w, extras), s, w, null, 0, true, extras);
      return cropPlate(frame, at[0], at[1] - 6, PLATE.w, PLATE.h);
    }
    if (key === 'cocoon') {
      const out = cropPlate(roomOf(worldState(EMPTY), EMPTY, extras), 70, 84, PLATE.w, PLATE.h);
      const ctx = out.getContext('2d');
      if (ctx) drawBigCocoon(ctx, 44, 10, data.cocoon);
      return out;
    }
    if (key === 'lounge') return cropPlate(roomOf(st, world, extras), 125, 94, LOUNGE.w, LOUNGE.h);
    if (key === 'today') {
      const frame = canvasOf(RW, RH);
      const ctx = frame.getContext('2d', { willReadFrequently: true });
      if (!ctx) return frame;
      const at = paintFrame(ctx, roomOf(st, world, extras), st, world, data.spec, 0, true, extras);
      return cropPlate(frame, at[0], at[1] + 6, PLATE.w, PLATE.h);
    }
    // uma bitola: a sala com ela e sem ela; o móvel que chegou fica aceso
    const stage = Number(key);
    const now = roomOf({ ...st, stage }, world, extras);
    const changed = whatChanged(now, roomOf({ ...st, stage: stage - 1 }, world, extras));
    return changed ? cropPlate(now, changed.cx, changed.cy, PLATE.w, PLATE.h, changed.lit) : cropPlate(now, 72, 80, PLATE.w, PLATE.h);
  };
  return (key) => {
    const hit = made.get(key);
    if (hit) return hit;
    const plate = build(key);
    made.set(key, plate);
    return plate;
  };
}

// ---- a criatura de cada capítulo (o ovo, a lagarta, o casulo, a mariposa) ----
type CreatureKind = 'egg' | 'larva' | 'cocoon' | 'moth';
const CREATURE_SIZE: Record<CreatureKind, [number, number]> = { egg: [36, 44], larva: [84, 22], cocoon: [36, 50], moth: [68, 60] };

function paintCreature(ctx: Ctx, kind: CreatureKind, stage: number, data: BookData, flap: number) {
  const [w, h] = CREATURE_SIZE[kind];
  ctx.clearRect(0, 0, w, h);
  if (kind === 'egg') {
    // o ovo no ninho de palha
    px(ctx, 5, 33, '#8A6B3A', 26, 3);
    px(ctx, 8, 36, '#6E5330', 20, 3);
    px(ctx, 3, 32, '#A98848', 4, 1);
    px(ctx, 29, 32, '#A98848', 4, 1);
    px(ctx, 12, 39, '#58421F', 12, 1);
    drawLarva(ctx, 18, 21, 4, EMPTY);
  } else if (kind === 'larva') drawLarva(ctx, 42, 8, 2, data.larvaWorld);
  else if (kind === 'cocoon') drawBigCocoon(ctx, 18, 10, data.cocoon);
  else drawMoth(ctx, 34, 31, 30, specAt(data, stage), flap);
}

const FLAP = [1, 0.9, 0.78, 0.9];

const Creature: React.FC<{ kind: CreatureKind; stage?: number; data: BookData; k: number; live?: boolean; className?: string }> = ({ kind, stage = 2, data, k, live = false, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, h] = CREATURE_SIZE[kind];
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    paintCreature(ctx, kind, stage, data, 1);
    if (!live || kind !== 'moth') return;
    // a mariposa da página aberta bate as asas devagar
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      paintCreature(ctx, kind, stage, data, FLAP[tick % FLAP.length]);
    }, 240);
    return () => window.clearInterval(timer);
  }, [kind, stage, data, live]);
  return <canvas ref={ref} width={w} height={h} aria-hidden className={`block shrink-0 ${className}`} style={{ width: w * k, height: h * k, imageRendering: 'pixelated' }} />;
};

// uma gravura pronta, ampliada em escala inteira
const Pixels: React.FC<{ source: HTMLCanvasElement; k: number; label: string }> = ({ source, k, label }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} width={source.width} height={source.height} role="img" aria-label={label} className="block" style={{ width: source.width * k, height: source.height * k, imageRendering: 'pixelated' }} />;
};

// ---------------------------------------------------------------------------
// Os capítulos
// ---------------------------------------------------------------------------

interface Chapter {
  id: string;
  // o número do capítulo (a folha de rosto e o fim não têm)
  no: number | null;
  // os capítulos que são um passo da evolução: a bitola de cada um
  stage?: number;
}
const CHAPTERS: Chapter[] = [
  { id: 'title', no: null },
  { id: 'egg', no: 1, stage: 0 },
  { id: 'larva', no: 2, stage: 1 },
  { id: 'cocoon', no: 3 },
  { id: 'g8', no: 4, stage: 2 },
  { id: 'wings', no: 5 },
  { id: 's8', no: 6, stage: 3 },
  { id: 'g16', no: 7, stage: 4 },
  { id: 's16', no: 8, stage: 5 },
  { id: 'g35', no: 9, stage: 6 },
  { id: 'g70', no: 10, stage: 7 },
  { id: 'imax', no: 11, stage: 8 },
  { id: 'cinerama', no: 12, stage: 9 },
  { id: 'treasures', no: 13 },
  { id: 'end', no: null },
];
const LAST = CHAPTERS.length - 1;
// os objetos de evento, na ordem em que o livro apresenta
const TREASURES: TrophyKind[] = ['pumpkin', 'terror', 'tree', 'amulet'];

type Status = 'past' | 'here' | 'future';

const useViewport = () => {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return size;
};

const PAGE_PAPER = 'radial-gradient(120% 90% at 50% 38%, #F8F1DE 0%, #F3EAD3 55%, #E8DBBC 100%)';

// Uma página de papel. side: de que lado da lombada ela fica ('single' = a
// página única do celular). Quando o texto não cabe, a página rola por dentro
// e uma seta no pé avisa que há mais para baixo.
type Side = 'left' | 'right' | 'single';
const Paper: React.FC<{ side: Side; pad: number; number: number | null; children: React.ReactNode }> = ({ side, pad, number, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, []);
  return (
    <div className={`relative h-full w-full overflow-hidden ${side === 'left' ? 'rounded-l-[5px]' : side === 'right' ? 'rounded-r-[5px]' : 'rounded-[5px]'}`} style={{ background: PAGE_PAPER, color: INK, boxShadow: side === 'left' ? '-1px 0 0 #D9CDAE, -3px 0 0 #EADFC3, -4px 0 0 #CFC2A0' : '1px 0 0 #D9CDAE, 3px 0 0 #EADFC3, 4px 0 0 #CFC2A0' }}>
      <div ref={ref} className="h-full w-full overflow-y-auto overscroll-contain" style={{ padding: pad }}>
        {children}
      </div>
      {/* a sombra da lombada */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 w-[9%] ${side === 'left' ? 'right-0' : 'left-0'}`}
        style={{ background: `linear-gradient(${side === 'left' ? 270 : 90}deg, rgba(34,27,54,${side === 'single' ? 0.12 : 0.17}), rgba(34,27,54,0.04) 50%, transparent)` }}
      />
      {more && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center pb-1" style={{ background: 'linear-gradient(180deg, rgba(232,219,188,0), #E8DBBC 78%)' }}>
          <ChevronDown className="h-5 w-5 motion-safe:animate-bounce" style={{ color: INK_SOFT }} />
        </span>
      )}
      {number !== null && !more && (
        <span aria-hidden className={`pointer-events-none absolute bottom-[10px] text-[12px] ${side === 'left' ? 'left-4' : 'right-4'}`} style={{ ...SERIF, color: INK_SOFT }}>
          {number}
        </span>
      )}
    </div>
  );
};
const NAV_BUTTON = `grid place-items-center w-11 h-11 rounded-full border border-white/15 hover:border-white/40 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-white/15 transition ${FOCUS_RING}`;

interface EvolutionBookProps {
  world: PersonaWorld;
  isOwn: boolean;
  // "@fulano", no estúdio de outra pessoa
  ownerName: string | null;
  // a sala de estar como quem olha vê (a máquina do Jackpot e a mesa de pôquer aparecem?)
  extras?: StudioExtras;
  onClose: () => void;
}

const EvolutionBook: React.FC<EvolutionBookProps> = ({ world, isOwn, ownerName, extras = NO_EXTRAS, onClose }) => {
  const { t, i18n } = useTranslation();
  const reduce = Boolean(useReducedMotion());
  const { w: vw, h: vh } = useViewport();
  const st = useMemo(() => worldState(world), [world]);
  const { jackpot, poker } = extras;
  const data = useMemo(() => bookData(world, st, { jackpot, poker }), [world, st, jackpot, poker]);
  const plateOf = useMemo(() => makePlates(data), [data]);
  const name = ownerName ?? '';

  // ---- as medidas ----
  const spread = vw >= 860 && vh >= 600;
  const pageW = spread ? Math.min(440, Math.floor((vw - 64) / 2)) : Math.min(430, vw - 20);
  const pageH = Math.max(220, spread ? Math.min(600, vh - 148) : Math.min(720, vh - 140));
  const pad = spread ? 32 : vw < 360 ? 14 : 18;
  const inner = pageW - pad * 2;
  const plateK = (size: { w: number; h: number }) => Math.max(1, Math.min(Math.floor((inner - 8) / size.w), Math.floor((spread ? pageH - pad * 2 - 70 : pageH * 0.36) / size.h)));
  const creatureK = spread && pageH >= 580 ? 3 : 2;

  // ---- as páginas ----
  // -1 = o livro fechado (a capa); 0 = a folha de rosto; depois, um capítulo por abertura
  const [page, setPage] = useState(-1);
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const go = useCallback(
    (to: number) => {
      const target = clamp(to, -1, LAST);
      if (turn || target === page) return;
      if (reduce) setPage(target);
      else setTurn({ from: page, to: target });
    },
    [turn, page, reduce],
  );
  const finishTurn = () => {
    if (!turn) return;
    setPage(turn.to);
    setTurn(null);
  };
  // o livro abre sozinho, um instante depois de aparecer
  const touched = useRef(false);
  useEffect(() => {
    if (reduce) return;
    const timer = window.setTimeout(() => {
      if (!touched.current) setTurn((current) => current ?? { from: -1, to: 0 });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [reduce]);
  const act = (to: number) => {
    touched.current = true;
    go(to);
  };

  const shown = turn ? turn.to : page;
  const hereIndex = CHAPTERS.findIndex((chapter) => chapter.stage === st.stage);

  // ---- teclado, foco e rolagem da página de trás ----
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      before?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      const next = event.key === 'ArrowRight' || event.key === 'PageDown';
      const previous = event.key === 'ArrowLeft' || event.key === 'PageUp';
      if (!next && !previous && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      touched.current = true;
      go(event.key === 'Home' ? 0 : event.key === 'End' ? LAST : page + (next ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page, onClose]);

  // ---- o toque: metade direita avança, metade esquerda volta; arrastar também ----
  const drag = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 44 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    swiped.current = true;
    act(page + (dx < 0 ? 1 : -1));
  };
  const onBookClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest('button, a')) return;
    if (page === -1) {
      act(0);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const where = (event.clientX - rect.left) / rect.width;
    act(page + (where < (spread ? 0.5 : 0.33) ? -1 : 1));
  };

  // ---- números e nomes ----
  const lang = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US';
  const one = (value: number) => value.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const whole = (value: number) => value.toLocaleString(lang);
  const titleOf = (chapter: Chapter): string => {
    if (chapter.id === 'title') return t('personaWorld.book.title');
    if (chapter.stage !== undefined && chapter.stage >= 2) return t(`personaWorld.gauges.${chapter.id}`);
    return t(`personaWorld.book.chapters.${chapter.id}.title`);
  };
  const statusOf = (chapter: Chapter): Status | null => {
    if (chapter.id === 'cocoon') return st.stage >= 2 ? 'past' : 'future';
    if (chapter.stage === undefined) return null;
    return st.stage > chapter.stage ? 'past' : st.stage === chapter.stage ? 'here' : 'future';
  };

  // ---- pedaços de página ----
  const plateFigure = (key: string, size: { w: number; h: number }, caption: string) => (
    <figure className="m-0 flex flex-col items-center">
      <div className="rounded-[2px] p-1" style={{ background: '#1C1433', boxShadow: `0 0 0 2px ${GOLD_INK}, 0 0 0 4px #1C1433, 0 8px 16px rgba(34,27,54,0.32)` }}>
        <Pixels source={plateOf(key)} k={plateK(size)} label={caption} />
      </div>
      <figcaption className="mt-3 text-[13px] italic leading-snug text-center" style={{ ...SERIF, color: INK_SOFT }}>
        {caption}
      </figcaption>
    </figure>
  );

  // o texto com capitular (o leitor de tela lê a frase inteira, sem a letra solta)
  const story = (text: string) => (
    <>
      <p className="sr-only">{text}</p>
      <p aria-hidden className={`${spread ? 'text-[16px]' : 'text-[15px]'} leading-[1.62]`} style={SERIF}>
        <span className="float-left mr-2 mt-[3px] text-[50px] leading-[0.8]" style={{ ...PIXEL, color: GOLD_INK }}>
          {text.charAt(0)}
        </span>
        {text.slice(1)}
      </p>
    </>
  );

  const fact = (label: string, value: string) => (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 italic" style={{ color: INK_SOFT }}>
        {label}
      </dt>
      <span aria-hidden className="flex-1 -translate-y-[3px] border-b border-dotted" style={{ borderColor: 'rgba(34,27,54,0.32)' }} />
      <dd className="m-0 text-right font-semibold">{value}</dd>
    </div>
  );

  const statusLine = (chapter: Chapter) => {
    const status = statusOf(chapter);
    if (!status) return null;
    const stage = chapter.stage;
    let lead: string;
    let detail: string | null = null;
    let bar: number | null = null;
    if (status === 'past') {
      lead = isOwn ? t('personaWorld.book.status.pastOwn') : t('personaWorld.book.status.pastOther', { name });
      const birth = chapter.id === 'cocoon' ? world.molts.find((molt) => molt.from === null) : null;
      if (birth?.no) detail = `${t('personaWorld.always.born', { no: birth.no })}.`;
    } else if (status === 'here') {
      lead = isOwn ? t('personaWorld.book.status.hereOwn') : t('personaWorld.book.status.hereOther', { name });
      if (stage === 0) detail = isOwn ? t('personaWorld.book.status.eggOwn') : null;
      else if (stage === 1) {
        const threshold = world.persona?.threshold || PERSONA_THRESHOLD;
        detail = world.counted >= threshold ? t('personaWorld.plate.needShelves') : t('personaWorld.book.status.segments', { counted: world.counted, threshold });
        bar = clamp(world.counted / threshold, 0, 1);
      } else if (st.nextGaugeKey && stage !== undefined && stage < GAUGES.length - 1) {
        detail = t('personaWorld.book.status.wingspanNext', { g: one(st.G), left: one(Math.max(0.1, GAUGES[stage + 1].minG - st.G)), next: t(`personaWorld.gauges.${st.nextGaugeKey}`) });
        bar = st.gaugeBar;
      } else detail = t('personaWorld.book.status.wingspanMax', { g: one(st.G) });
    } else {
      lead = t('personaWorld.book.status.future');
      if (st.hasTrio && stage !== undefined && stage >= 3) detail = t('personaWorld.book.status.futureLeft', { left: one(Math.max(0.1, GAUGES[stage].minG - st.G)) });
    }
    const color = status === 'past' ? PAST : status === 'here' ? HERE : FUTURE;
    const Icon = status === 'past' ? Check : status === 'here' ? MapPin : Hourglass;
    return (
      <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(34,27,54,0.16)' }}>
        <p className="flex items-start gap-2 text-[14px] leading-snug">
          <Icon className="mt-[2px] h-4 w-4 shrink-0" style={{ color }} aria-hidden />
          <span>
            <strong style={{ color }}>{lead}</strong>
            {detail ? <span style={{ color: INK_SOFT }}> {detail}</span> : null}
          </span>
        </p>
        {bar !== null && (
          <div className="mt-2 h-[6px] overflow-hidden rounded-full" style={{ background: 'rgba(34,27,54,0.14)' }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.round(bar * 100)}%`, background: HERE }} />
          </div>
        )}
      </div>
    );
  };

  // tall = o capítulo tem criatura: a linha do título tem sempre a altura da
  // mariposa, para o título não subir e descer de uma página para a outra
  const heading = (chapter: Chapter, creature: React.ReactNode, tall = false) => (
    <div className="flex items-end justify-between gap-3" style={{ minHeight: tall && spread ? CREATURE_SIZE.moth[1] * creatureK : undefined }}>
      <div className="min-w-0 pb-1">
        {chapter.no !== null && (
          <p className="text-[13px] italic" style={{ ...SERIF, color: INK_SOFT }}>
            {t('personaWorld.book.chapter', { no: chapter.no })}
          </p>
        )}
        <h3 className={`${spread ? 'text-[32px]' : 'text-[27px]'} mt-1 leading-[1.02]`} style={PIXEL}>
          {titleOf(chapter)}
        </h3>
      </div>
      {creature}
    </div>
  );

  // ---- as duas metades de cada abertura ----
  // live = a página está aberta de verdade (a mariposa dela bate as asas)
  const leftOf = (index: number, live: boolean): React.ReactNode => {
    const chapter = CHAPTERS[index];
    if (chapter.id === 'title') {
      const kind: CreatureKind = st.stage === 0 ? 'egg' : st.stage === 1 ? 'larva' : 'moth';
      return (
        <div className={`flex flex-col items-center justify-center text-center ${spread ? 'h-full' : 'pt-3'}`}>
          <div className="w-full rounded-[3px] px-4 py-6" style={{ boxShadow: 'inset 0 0 0 1px rgba(34,27,54,0.28), inset 0 0 0 4px rgba(243,234,211,0.01), inset 0 0 0 5px rgba(34,27,54,0.14)' }}>
            <div className="grid place-items-center">
              <Creature kind={kind} stage={st.stage} data={data} k={creatureK} live={live} />
            </div>
            <p className={`${spread ? 'mt-6 text-[17px]' : 'mt-4 text-[15px]'} italic leading-snug`} style={SERIF}>
              {isOwn ? t('personaWorld.book.exlibrisOwn') : t('personaWorld.book.exlibrisOther', { name })}
            </p>
            <p className="mt-2 text-[13px]" style={{ color: INK_SOFT }}>
              {t('personaWorld.book.today', { gauge: t(`personaWorld.gauges.${st.gaugeKey}`), rated: t('personaWorld.book.rated', { count: world.rated }) })}
            </p>
          </div>
        </div>
      );
    }
    if (chapter.id === 'wings') {
      // a conta da asa: quanto cada prateleira empurra
      const rows = LETTERS.map((letter) => ({ letter, n: st.films[letter] ?? 0 }));
      const top = Math.max(1, ...rows.map((row) => Math.sqrt(row.n)), Math.sqrt(st.out));
      const line = (key: string, tile: React.ReactNode, label: string, n: number, color: string) => (
        <tr key={key} style={{ opacity: n > 0 ? 1 : 0.5 }}>
          <th scope="row" className="py-[3px] pr-2 text-left font-normal">
            <span className="flex min-w-0 items-center gap-2">
              {tile}
              <span className="min-w-0 truncate">{label}</span>
            </span>
          </th>
          <td className="py-[3px] pr-3 text-right tabular-nums">{whole(n)}</td>
          <td className="py-[3px] text-right tabular-nums">
            <span className="flex items-center justify-end gap-2">
              <span aria-hidden className="hidden h-[7px] w-14 overflow-hidden rounded-[2px] min-[380px]:block" style={{ background: 'rgba(34,27,54,0.12)' }}>
                <span className="block h-full" style={{ width: `${(Math.sqrt(n) / top) * 100}%`, background: color, boxShadow: 'inset 0 0 0 1px rgba(34,27,54,0.45)' }} />
              </span>
              <span className="w-9 font-semibold">{n > 0 ? one(Math.sqrt(n)) : '–'}</span>
            </span>
          </td>
        </tr>
      );
      const tile = (letter: string, color: string) => (
        <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] text-[12px] leading-none" style={{ ...PIXEL, color, background: INK }}>
          {letter}
        </span>
      );
      return (
        <div className={spread ? 'flex h-full flex-col justify-center' : ''}>
          <table className="w-full table-fixed border-collapse text-[13.5px]">
            <colgroup>
              <col />
              <col className="w-[52px]" />
              <col className="w-[44px] min-[380px]:w-[108px]" />
            </colgroup>
            <caption className="pb-2 text-left text-[15px] italic" style={SERIF}>
              {isOwn ? t('personaWorld.book.wings.ledgerOwn') : t('personaWorld.book.wings.ledgerOther', { name })}
            </caption>
            <thead>
              <tr className="text-[12px]" style={{ color: INK_SOFT }}>
                <th scope="col" className="pb-1 text-left font-normal italic">
                  {t('personaWorld.book.wings.shelf')}
                </th>
                <th scope="col" className="pb-1 pr-3 text-right font-normal italic">
                  {t('personaWorld.book.wings.titles')}
                </th>
                <th scope="col" className="pb-1 text-right font-normal italic">
                  {t('personaWorld.book.wings.push')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => line(row.letter, tile(row.letter, MOOD_BY_LETTER[row.letter]?.color ?? MIST), t(MOOD_BY_LETTER[row.letter]?.labelKey ?? ''), row.n, MOOD_BY_LETTER[row.letter]?.color ?? MIST))}
              {line('archive', tile('+', PAPER), t('personaWorld.book.wings.archive'), st.out, PAPER)}
            </tbody>
            <tfoot>
              <tr className="border-t" style={{ borderColor: 'rgba(34,27,54,0.4)' }}>
                <th scope="row" className="pt-2 text-left text-[15px]" style={PIXEL}>
                  {t('personaWorld.book.wings.total')}
                </th>
                <td className="pt-2 pr-3 text-right tabular-nums">{whole(st.rated)}</td>
                <td className="pt-2 text-right text-[17px] tabular-nums" style={{ ...PIXEL, color: HERE }}>
                  {one(st.G)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }
    const center = spread ? 'flex h-full flex-col justify-center' : '';
    if (chapter.id === 'treasures') return <div className={center}>{plateFigure('lounge', LOUNGE, t('personaWorld.book.treasures.caption'))}</div>;
    if (chapter.id === 'end') return <div className={center}>{plateFigure('today', PLATE, t(st.hasTrio ? 'personaWorld.book.end.captionMoth' : 'personaWorld.book.end.captionRoom'))}</div>;
    const key = chapter.stage !== undefined && chapter.stage >= 2 ? String(chapter.stage) : chapter.id;
    return <div className={center}>{plateFigure(key, PLATE, t(`personaWorld.book.chapters.${chapter.id}.caption`))}</div>;
  };

  const rightOf = (index: number, live: boolean): React.ReactNode => {
    const chapter = CHAPTERS[index];
    const column = spread ? 'flex h-full flex-col' : 'flex flex-col';
    if (chapter.id === 'title') {
      return (
        <div className={`${column} ${spread ? 'justify-center' : 'pt-5'}`}>
          <h3 className={`${spread ? 'text-[46px]' : 'text-[36px]'} leading-none`} style={{ ...PIXEL, color: GOLD_INK }}>
            {t('personaWorld.book.once')}
          </h3>
          <p className={`${spread ? 'text-[18px]' : 'text-[16px]'} mt-4 leading-[1.62]`} style={SERIF}>
            {t('personaWorld.book.intro')}
          </p>
          <p className="mt-6 flex items-center gap-1 text-[14px] italic" style={{ ...SERIF, color: INK_SOFT }}>
            {t('personaWorld.book.turn')}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </p>
        </div>
      );
    }
    if (chapter.id === 'wings') {
      return (
        <div className={column}>
          {heading(chapter, null)}
          <div className="mt-4">{story(t('personaWorld.book.wings.p1'))}</div>
          <p className={`${spread ? 'text-[16px]' : 'text-[15px]'} mt-3 leading-[1.62]`} style={SERIF}>
            {t('personaWorld.book.wings.p2')}
          </p>
          <p className={`${spread ? 'text-[16px]' : 'text-[15px]'} mt-3 leading-[1.62]`} style={SERIF}>
            {t('personaWorld.book.wings.p3')}
          </p>
        </div>
      );
    }
    if (chapter.id === 'treasures') {
      const mine = new Set(trophiesOf(world).map((trophy) => trophy.kind));
      // os objetos de lugar reservado que este estúdio mostra
      const standing = [t('personaWorld.book.treasures.tank'), jackpot !== 'off' ? t('personaWorld.book.treasures.machine') : null, poker ? t('personaWorld.book.treasures.table') : null].filter((item): item is string => Boolean(item));
      return (
        <div className={column}>
          {heading(chapter, null)}
          <div className="mt-4">{story(t('personaWorld.book.treasures.text', { standing: standing.join(', ') }))}</div>
          <ul className="m-0 mt-4 list-none space-y-2 p-0 text-[14px]">
            {TREASURES.map((kind) => {
              const has = mine.has(kind);
              return (
                <li key={kind} className="flex items-start gap-2">
                  <span className="mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full" style={{ background: has ? PAST : 'transparent', boxShadow: has ? undefined : 'inset 0 0 0 1.5px rgba(34,27,54,0.4)' }} aria-hidden>
                    {has && <Check className="h-3 w-3" style={{ color: PAPER }} />}
                  </span>
                  <span className="leading-snug">
                    <strong>{t(`personaWorld.book.treasures.items.${kind}.name`)}</strong>
                    <span style={{ color: INK_SOFT }}>
                      {' '}
                      {t(`personaWorld.book.treasures.items.${kind}.hint`)}. {has ? t('personaWorld.book.treasures.has') : t('personaWorld.book.treasures.missing')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[14px] italic leading-snug" style={{ ...SERIF, color: INK_SOFT }}>
            {t('personaWorld.book.treasures.more')}
          </p>
        </div>
      );
    }
    if (chapter.id === 'end') {
      return (
        <div className={`${column} ${spread ? 'justify-center' : ''}`}>
          <h3 className={`${spread ? 'text-[34px]' : 'text-[28px]'} leading-[1.05]`} style={PIXEL}>
            {t('personaWorld.book.end.title')}
          </h3>
          <div className="mt-4">{story(t('personaWorld.book.end.text'))}</div>
          {isOwn && world.rated > 0 && (
            <p className={`${spread ? 'text-[16px]' : 'text-[15px]'} mt-3 leading-[1.62]`} style={SERIF}>
              {t('personaWorld.book.end.replay')}
            </p>
          )}
          <div className="mt-6">
            <button type="button" onClick={onClose} className={`inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold transition hover:brightness-125 ${FOCUS_RING}`} style={{ background: INK, color: PAPER }}>
              {t('personaWorld.book.close')}
            </button>
          </div>
        </div>
      );
    }
    // um passo da evolução
    const stage = chapter.stage;
    const kind: CreatureKind = chapter.id === 'egg' ? 'egg' : chapter.id === 'larva' ? 'larva' : chapter.id === 'cocoon' ? 'cocoon' : 'moth';
    const creature = <Creature kind={kind} stage={stage} data={data} k={kind === 'larva' ? 2 : creatureK} live={live} className={kind === 'cocoon' ? 'self-start' : ''} />;
    // a lagarta é comprida: no celular fica embaixo do título, não ao lado
    const below = kind === 'larva' && !spread;
    return (
      <div className={column}>
        {heading(chapter, below ? null : creature, !below)}
        {below && <div className="mt-3">{creature}</div>}
        <div className="mt-4">{story(t(`personaWorld.book.chapters.${chapter.id}.text`))}</div>
        <dl className={`${spread ? 'mt-auto pt-5' : 'mt-5'} m-0 space-y-[6px] text-[14px]`}>
          {chapter.id === 'egg' && fact(t('personaWorld.book.facts.hatches'), t('personaWorld.book.facts.firstTitle'))}
          {chapter.id === 'larva' && fact(t('personaWorld.book.facts.grows'), t('personaWorld.book.facts.shelfTitles'))}
          {chapter.id === 'cocoon' && fact(t('personaWorld.book.facts.closes'), t('personaWorld.book.facts.tenInThree'))}
          {stage !== undefined && stage >= 3 && (
            <>
              {fact(t('personaWorld.book.facts.needs'), t('personaWorld.book.facts.wingspan', { g: whole(GAUGES[stage].minG) }))}
              {fact(t('personaWorld.book.facts.atLeast'), t('personaWorld.book.facts.titlesSpread', { n: whole(Math.ceil((GAUGES[stage].minG * GAUGES[stage].minG) / 10)) }))}
            </>
          )}
          {stage !== undefined && FURNITURE[stage] && fact(t('personaWorld.book.facts.arrives'), t(`personaWorld.furniture.${FURNITURE[stage]}`))}
        </dl>
        {statusLine(chapter)}
      </div>
    );
  };

  // ---- a capa ----
  const cover = (live: boolean) => {
    const kind: CreatureKind = st.stage === 0 ? 'egg' : st.stage === 1 ? 'larva' : 'moth';
    return (
      <div
        className="relative flex h-full w-full flex-col items-center justify-center rounded-r-[6px] px-8 text-center"
        style={{
          background: 'linear-gradient(150deg, #3B2566 0%, #2B1A4A 55%, #1F1238 100%)',
          boxShadow: `inset 0 0 0 4px #1F1238, inset 0 0 0 6px ${GOLD}, inset 0 0 0 11px ${LEATHER}, inset 0 0 0 12px rgba(244,196,84,0.45)`,
        }}
      >
        {/* a sombra da lombada e os cravos dos cantos */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[9%]" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent)' }} />
        {['left-[18px] top-[18px]', 'right-[18px] top-[18px]', 'left-[18px] bottom-[18px]', 'right-[18px] bottom-[18px]'].map((at) => (
          <span key={at} aria-hidden className={`absolute h-[6px] w-[6px] ${at}`} style={{ background: GOLD, boxShadow: '0 1px 0 #150E26' }} />
        ))}
        <Creature kind={kind} stage={st.stage} data={data} k={kind === 'larva' ? 2 : 3} live={live} />
        <p className={`${spread ? 'text-[36px]' : 'text-[31px]'} mt-6 leading-[1.04]`} style={{ ...PIXEL, color: GOLD, textShadow: '0 2px 0 #150E26' }}>
          {t('personaWorld.book.title')}
        </p>
        <p className="mt-3 text-[15px] italic leading-snug" style={{ ...SERIF, color: PAPER }}>
          {isOwn ? t('personaWorld.book.coverOwn') : t('personaWorld.book.coverOther', { name })}
        </p>
        {page === -1 && !turn && (
          <button type="button" onClick={() => act(0)} className={`absolute bottom-8 inline-flex h-11 items-center rounded-xl border px-5 text-[14px] font-semibold transition hover:bg-white/10 ${FOCUS_RING}`} style={{ color: PAPER, borderColor: 'rgba(244,196,84,0.6)' }}>
            {t('personaWorld.book.open')}
          </button>
        )}
      </div>
    );
  };

  const paper = (side: Side, content: React.ReactNode, number: number | null) => (
    <Paper side={side} pad={pad} number={number}>
      {content}
    </Paper>
  );
  const leftPage = (index: number, live: boolean) => (index < 0 ? null : paper('left', leftOf(index, live), index === 0 ? null : index * 2));
  const rightPage = (index: number, live: boolean) => (index < 0 ? cover(live) : paper('right', rightOf(index, live), index === 0 ? null : index * 2 + 1));
  const sheet = (index: number, live: boolean) =>
    index < 0
      ? cover(live)
      : paper(
          'single',
          <>
            {leftOf(index, live)}
            <div className="mt-5">{rightOf(index, live)}</div>
          </>,
          null,
        );

  // ---- a folha que vira ----
  const lo = turn ? Math.min(turn.from, turn.to) : page;
  const hi = turn ? Math.max(turn.from, turn.to) : page;
  const forward = turn ? turn.to > turn.from : true;
  const seconds = turn && lo === -1 ? 1.25 : spread ? 0.9 : 0.55;
  const ease: [number, number, number, number] = [0.45, 0.05, 0.2, 1];
  const closed = shown === -1;
  const FACE: React.CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };

  const bookmark = hereIndex >= 0 && hereIndex !== shown;
  const position = shown < 0 ? t('personaWorld.book.cover') : t('personaWorld.book.pageOf', { no: shown + 1, total: CHAPTERS.length });

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t('personaWorld.book.dialogAria')}
      className="fixed inset-0 z-[9996] flex flex-col items-center outline-none"
      style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 46%, rgba(46,30,84,0.92), rgba(8,5,18,0.96) 70%)' }}
    >
      <motion.div className="flex h-full w-full flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
        <header className="flex h-14 w-full max-w-[960px] shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
          <p className="min-w-0 truncate text-[17px]" style={{ ...PIXEL, color: PAPER }}>
            {t('personaWorld.book.title')}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {bookmark && (
              <button
                type="button"
                onClick={() => act(hereIndex)}
                className={`inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-3 text-[13px] font-semibold transition hover:border-white/40 hover:bg-white/10 sm:px-4 ${FOCUS_RING}`}
                style={{ color: PAPER }}
                aria-label={isOwn ? t('personaWorld.book.bookmarkOwn') : t('personaWorld.book.bookmarkOther', { name })}
              >
                <Bookmark className="h-4 w-4 text-fuchsia-300" aria-hidden />
                <span className="hidden sm:inline">{isOwn ? t('personaWorld.book.bookmarkOwn') : t('personaWorld.book.bookmarkOther', { name })}</span>
              </button>
            )}
            <button type="button" onClick={onClose} className={NAV_BUTTON} style={{ color: PAPER }} aria-label={t('personaWorld.book.close')}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 w-full flex-1 place-items-center overflow-hidden">
          <motion.div
            className="relative cursor-pointer select-none"
            style={{ width: spread ? pageW * 2 : pageW, height: pageH, perspective: spread ? 2400 : 1500, touchAction: 'pan-y' }}
            initial={reduce ? false : { scale: 0.9, y: 24 }}
            animate={{ scale: 1, y: 0, x: spread && closed ? -pageW / 2 : 0 }}
            transition={{ scale: { type: 'spring', stiffness: 220, damping: 22 }, y: { type: 'spring', stiffness: 220, damping: 22 }, x: { duration: reduce ? 0 : seconds, ease } }}
            onClick={onBookClick}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
          >
            {/* a luz que sai do livro aberto */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-[18%] transition-opacity duration-1000"
              style={{ background: 'radial-gradient(closest-side, rgba(244,196,84,0.22), rgba(244,196,84,0.06) 55%, transparent)', opacity: closed ? 0 : 1 }}
            />
            {/* as capas de couro por baixo das páginas */}
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-y-[7px] -right-[7px] rounded-[9px]"
              style={{ left: spread && closed ? pageW - 7 : -7, background: LEATHER, boxShadow: '0 30px 70px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(244,196,84,0.28)', transition: reduce ? undefined : `left ${seconds}s cubic-bezier(0.45,0.05,0.2,1)` }}
            />

            {spread ? (
              <>
                <div className="absolute inset-y-0 left-0 w-1/2">{leftPage(lo, !turn)}</div>
                <div className="absolute inset-y-0 right-0 w-1/2">{rightPage(hi, !turn)}</div>
                {turn && (
                  <motion.div
                    key={`${turn.from}:${turn.to}`}
                    className="absolute inset-y-0 right-0 z-[5] w-1/2"
                    style={{ transformOrigin: 'left center', transformStyle: 'preserve-3d' }}
                    initial={{ rotateY: forward ? 0 : -180 }}
                    animate={{ rotateY: forward ? -180 : 0 }}
                    transition={{ duration: seconds, ease }}
                    onAnimationComplete={finishTurn}
                  >
                    <div style={FACE}>
                      {rightPage(lo, false)}
                      <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: '#150E26' }} initial={false} animate={{ opacity: forward ? [0, 0.3, 0.3] : [0.3, 0.3, 0] }} transition={{ duration: seconds, times: [0, 0.5, 1] }} />
                    </div>
                    <div style={{ ...FACE, transform: 'rotateY(180deg)' }}>
                      {leftPage(hi, false)}
                      <motion.span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: '#150E26' }} initial={false} animate={{ opacity: forward ? [0.3, 0.3, 0] : [0, 0.3, 0.3] }} transition={{ duration: seconds, times: [0, 0.5, 1] }} />
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <>
                <div className="absolute inset-0">{sheet(hi, !turn)}</div>
                {turn && (
                  <motion.div
                    key={`${turn.from}:${turn.to}`}
                    className="absolute inset-0 z-[5]"
                    style={{ transformOrigin: 'left center' }}
                    initial={{ rotateY: forward ? 0 : -104, opacity: forward ? 1 : 0 }}
                    animate={{ rotateY: forward ? -104 : 0, opacity: forward ? [1, 1, 0] : [0, 1, 1] }}
                    transition={{ rotateY: { duration: seconds, ease }, opacity: { duration: seconds, times: forward ? [0, 0.72, 1] : [0, 0.28, 1] } }}
                    onAnimationComplete={finishTurn}
                  >
                    {sheet(lo, false)}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        </div>

        <footer className="flex h-16 shrink-0 items-center gap-4 pb-[env(safe-area-inset-bottom)]">
          <button type="button" onClick={() => act(page - 1)} disabled={shown <= -1} className={NAV_BUTTON} style={{ color: PAPER }} aria-label={t('personaWorld.book.prev')}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="min-w-[92px] text-center text-[15px]" style={{ ...PIXEL, color: PAPER }} aria-hidden>
            {position}
          </p>
          <button type="button" onClick={() => act(page + 1)} disabled={shown >= LAST} className={NAV_BUTTON} style={{ color: PAPER }} aria-label={t('personaWorld.book.next')}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </footer>
        <p className="sr-only" aria-live="polite">
          {shown < 0 ? t('personaWorld.book.cover') : t('personaWorld.book.pageAria', { no: shown + 1, total: CHAPTERS.length, title: titleOf(CHAPTERS[shown]) })}
        </p>
      </motion.div>
    </div>,
    document.body,
  );
};

export default EvolutionBook;
