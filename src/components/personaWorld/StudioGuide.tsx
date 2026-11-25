import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Hourglass, MapPin, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { MOOD_BY_LETTER, showCode, showLetter } from '../../lib/moods';
import { mapPersonaEntry, personaText, PERSONA_THRESHOLD, type PersonaEntry } from '../../lib/persona';
import { FURNITURE, LEVEL_AT, LETTERS, MAX_LEVEL, PET_GOAL, levelText, worldState, type PersonaWorld, type PetId, type WorldState } from '../../lib/personaWorld';
import { ORACLE_TAGS, PROGRESSION_TAGS } from '../../lib/tags';
import { FOCUS_RING, INK, MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import PersonasModal from '../PersonasModal';
import { LayerScope, useLayerEntry } from '../../overlays';
import { PersonaCard, PersonaCode } from '../PersonaBits';
import { drawLarva, drawMoth, drawRoom, GOLD, mothSpec, NO_IMAGES, paintFrame, RH, RW, studioItemArt, studioItemRect, studioSpots, type MothSpec } from './draw';
import { MOOD_ITEMS, MOOD_ITEM_GOAL, hasMoodItem, type MoodItem, type MoodItemId } from './moodItems';
import { hasPet, hasTerrorBox, NO_EXTRAS, PET_ITEMS, type SpotKind, type StudioExtras } from './studio';

// O guia do estúdio: o livro da estante.
//
// 14/11/2026 (tarde): nasceu como "o livro da mariposa", um livro de contos
// ("Era uma vez…") que contava a história de quem olhava, pedido pelo Bruno
// com o livro que abre o filme Shrek como referência (do filme veio só a
// ideia do livro que abre e vira as páginas; nada dele aparece aqui).
//
// 14/11/2026 (noite), correção do Bruno: "o conteúdo desse livro será adaptado
// inteiro, deixando de ser um livro de conto de fadas […] e sendo um livro
// informativo muito mais prático, mostrando as evoluções possíveis do estúdio,
// com os objetos que podem ser ganhos, mostrando como funcionam as prateleiras
// do usuário dentro do estúdio com uma legenda para as 'capas de pixel'
// douradas […] representando 10 filmes; depois disso […] 'O estúdio guarda
// tudo o que foi avaliado: 266 títulos.' e seu gráfico, que ficavam na extinta
// aba 'sempre'". E as personalidades saem do botão do modal e passam a ser
// "parte do conteúdo do livro".
//
// Então o livro continua sendo um livro (a capa, a folha que vira), mas por
// dentro é um manual, como o que vinha na caixa de um jogo: quadros de itens
// com o desenho de cada um, tabelas e frases curtas. Seis aberturas:
//   1. As evoluções: do ovo ao nível 10, quantos títulos cada nível pede e o
//      objeto que chega, com onde a pessoa está.
//   2. Os lugares do chão e os bichinhos (como arrumar o estúdio; o sapo, a
//      raposa e a cobra, com quanto falta para cada um) e os objetos do
//      estúdio (o que cada um abre e o que se conquista). Até 15/11/2026 à
//      tarde a página da esquerda era "A conta da asa" (a envergadura), que
//      o Bruno mandou tirar: "não dá nem para entender o que é aquilo".
//   3. As prateleiras (a estante de perto e a legenda das latas) e "O estúdio
//      guarda tudo o que foi avaliado", com o gráfico das nove prateleiras.
//   4. As três letras (como o código nasce e muda) e o começo das 84
//      personalidades.
//   5 a 7. O resto das 84 personalidades. Tocar numa abre a ficha dela.
//
// Os desenhos não são imagens prontas: são recortes do estúdio de quem é o
// livro, desenhado como ele fica em cada nível. Para destacar o objeto que
// chega, a sala é desenhada duas vezes (com e sem o nível) e comparada: o que
// mudou fica aceso, o resto na penumbra.
//
// No computador o livro abre em duas páginas e a folha vira em 3D em volta da
// lombada. No celular é uma página por vez e a folha vira para a esquerda. Com
// "reduzir movimento" nada gira e o livro não abre sozinho.
//
// 14/11/2026 (noite), mais duas correções do Bruno:
//   • "O guia do estúdio deve ter um botão de fechar, atualmente não tem como
//     sair dele." O X existia, mas era um círculo apagado no alto da tela e,
//     no celular com o site instalado (ou no app), ficava embaixo da barra do
//     relógio e da bateria: não dava para tocar. Agora o topo respeita essa
//     barra (safe-area), o botão diz "Fechar" com todas as letras e tocar fora
//     do livro também fecha.
//   • "As 84 personas dentro do livro devem aparecer com a foto dos
//     personagens, e não um amontoado de 3 letras." Cada personalidade virou o
//     retrato do personagem (o mesmo cartão da ficha, PersonaCard), com o
//     código por cima da foto e o título embaixo. Cabem 12 por página (eram
//     18 blocos de letras), e o livro ganhou uma abertura: sete no total.
//
// 17/11/2026: "Os móveis dos humores" ganharam a terceira abertura (oito no
// total): os sete móveis, com o desenho de cada um, a tag que traz cada um e
// quanto falta. Pedido do Bruno ao escolher os móveis, preocupado com quem
// ainda não tem nenhum ("pouquíssimos usuário tem sequer uma tag dessas"):
// assim todo mundo vê o que pode ganhar.

// as tintas sobre o papel (todas com contraste de leitura sobre o creme)
const INK_SOFT = '#5B4F6E';
const GOLD_INK = '#9A6A12';
const HERE = '#B5179E';
const PAST = '#256B41';
const FUTURE = '#655A7A';
const LEATHER = '#2B1A4A';
const DARK = '#1C1433';
const SHADE: [number, number, number] = [13, 9, 25];

// ---------------------------------------------------------------------------
// O desenho
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const canvasOf = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

// um estúdio sem nada avaliado
const EMPTY: PersonaWorld = {
  persona: null,
  rated: 0,
  out: 0,
  counted: 0,
  window: [],
  recent: {},
  first: [],
  eyes: [],
  last: [],
  best: {},
  molts: [],
  tags: [],
  posters: [],
  layout: {},
  stored: [],
  turn: {},
  oracle: { bogart: 0, fincher: 0, cypher: 0 },
  picks: {},
  items: [],
  pets: { frog: null, fox: null, snake: null },
};

interface GuideData {
  world: PersonaWorld;
  st: WorldState;
  // a mariposa de quem é o livro (null = ainda sem Persona: uma mariposa sem cor)
  spec: MothSpec | null;
  // a lagarta: a da pessoa, se ela ainda é lagarta; senão, uma de exemplo com os humores dela
  larvaWorld: PersonaWorld;
  extras: StudioExtras;
}

function guideData(world: PersonaWorld, st: WorldState, extras: StudioExtras): GuideData {
  const alive = st.rank.filter((letter) => st.films[letter] > 0);
  const pool = alive.length >= 3 ? alive : ['M', 'A', 'C', 'Z', 'R', 'F', 'L', 'P', 'X'];
  const sample = [0, 1, 0, 2, 1, 0, 3, 2, 0, 1].map((index) => pool[index % pool.length]);
  return {
    world,
    st,
    spec: mothSpec(st, world),
    larvaWorld: st.stage === 1 && world.first.length > 0 ? world : { ...EMPTY, rated: 10, counted: 10, first: sample },
    extras,
  };
}

const roomOf = (st: WorldState, world: PersonaWorld, extras: StudioExtras): HTMLCanvasElement => {
  const canvas = canvasOf(RW, RH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) drawRoom(ctx, st, world, NO_IMAGES, extras);
  return canvas;
};

// Recorta um pedaço da sala em volta de um ponto. Com `lit` (o que acendeu),
// o resto fica na penumbra, com um halo curto em volta do que acendeu.
function crop(source: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, lit?: Uint8Array): HTMLCanvasElement {
  const x0 = clamp(Math.round(cx - w / 2), 0, RW - w);
  const y0 = clamp(Math.round(cy - h / 2), 0, RH - h);
  const out = canvasOf(w, h);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return out;
  ctx.fillStyle = `rgb(${SHADE.join(',')})`;
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
      const shade = near ? 0.22 : 0.5;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c += 1) d[i + c] = Math.round(d[i + c] + (SHADE[c] - d[i + c]) * shade);
    }
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

// O que mudou entre duas salas (o objeto que chegou) e o meio do que mudou.
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

// O quadrinho de cada passo da evolução: 40 × 28 pixels do estúdio (o ovo, a
// lagarta e o nível 1) e um menor para os níveis de 2 a 10, que dividem uma
// página só.
const ITEM = { w: 40, h: 28 };
const ROW = { w: 32, h: 22 };
// A estante de perto.
const SHELVES = { w: 78, h: 80 };

// Os desenhos do livro, feitos uma vez cada (na primeira vez em que a página aparece).
function makeArt(data: GuideData): (key: string) => HTMLCanvasElement {
  const made = new Map<string, HTMLCanvasElement>();
  const build = (key: string): HTMLCanvasElement => {
    const { world, st, extras } = data;
    if (key === 'egg' || key === 'larva') {
      // a criatura sozinha, num quadrinho escuro
      const out = canvasOf(ITEM.w, ITEM.h);
      const ctx = out.getContext('2d');
      if (!ctx) return out;
      ctx.fillStyle = `rgb(${SHADE.join(',')})`;
      ctx.fillRect(0, 0, ITEM.w, ITEM.h);
      if (key === 'egg') drawLarva(ctx, ITEM.w / 2, ITEM.h / 2, 3, EMPTY);
      else drawLarva(ctx, ITEM.w / 2, ITEM.h / 2 - 2, 1, data.larvaWorld);
      return out;
    }
    if (key === 'shelves') return crop(roomOf(st, world, extras), 112, 50, SHELVES.w, SHELVES.h);
    if (key.startsWith('spot:')) {
      // Um objeto da sala de estar, recortado do estúdio de hoje com as luzes
      // acesas (um quadro parado da cena). A máquina, a mesa e a caixa
      // aparecem aqui mesmo para quem ainda não as tem: é o guia.
      const kind = key.slice(5) as SpotKind;
      const full: StudioExtras = { jackpot: 'on', poker: true };
      const shown = kind === 'terror' && !hasTerrorBox(world) ? { ...world, tags: [...world.tags, { id: 'deadly-sleeping', at: '' }] } : world;
      const scene = canvasOf(RW, RH);
      const ctx = scene.getContext('2d', { willReadFrequently: true });
      if (ctx) paintFrame(ctx, roomOf(st, shown, full), st, shown, data.spec, 0, true, full);
      const spot = studioSpots(shown, st, full).find((item) => item.kind === kind);
      if (!spot) return crop(scene, 120, 100, ITEM.w, ITEM.h);
      // o objeto inteiro, com uma folga em volta
      const w = Math.min(46, Math.round(spot.w) + 6);
      const h = Math.min(52, Math.round(spot.h) + 6);
      return crop(scene, spot.x + spot.w / 2, spot.y + spot.h / 2, w, h);
    }
    if (key.startsWith('mood:')) {
      // Um móvel de humor, sozinho e parado, no meio do quadrinho escuro.
      // Aparece mesmo para quem ainda não o tem: é o guia.
      const piece = studioItemArt(world, st, extras, key.slice(5) as MoodItemId);
      const w = piece ? Math.min(46, Math.max(30, piece.width + 8)) : ITEM.w;
      const h = piece ? Math.min(44, Math.max(26, piece.height + 6)) : ITEM.h;
      const out = canvasOf(w, h);
      const ctx = out.getContext('2d');
      if (!ctx) return out;
      ctx.fillStyle = `rgb(${SHADE.join(',')})`;
      ctx.fillRect(0, 0, w, h);
      if (piece) ctx.drawImage(piece, Math.round((w - piece.width) / 2), Math.max(0, h - piece.height - 3));
      return out;
    }
    if (key.startsWith('pet:')) {
      // Um bichinho, recortado do estúdio de hoje (parado). Aparece aqui mesmo
      // para quem ainda não o tem: é o guia.
      const pet = key.slice(4) as PetId;
      const entry = PET_ITEMS.find((item) => item.pet === pet);
      const shown = hasPet(world, pet) ? world : { ...world, pets: { ...world.pets, [pet]: 1 } };
      const scene = canvasOf(RW, RH);
      const ctx = scene.getContext('2d', { willReadFrequently: true });
      if (ctx) paintFrame(ctx, roomOf(st, shown, extras), st, shown, data.spec, 0, true, extras);
      const rect = entry ? studioItemRect(shown, st, extras, entry.item) : null;
      if (!rect) return crop(scene, 120, 100, ITEM.w, ITEM.h);
      return crop(scene, rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(26, Math.min(46, Math.round(rect.w) + 8)), Math.max(22, Math.min(40, Math.round(rect.h) + 8)));
    }
    // um nível: a sala com ele e sem ele; o objeto que chegou fica aceso
    const stage = Number(key);
    const size = stage >= 3 ? ROW : ITEM;
    const now = roomOf({ ...st, stage }, world, extras);
    const changed = whatChanged(now, roomOf({ ...st, stage: stage - 1 }, world, extras));
    return changed ? crop(now, changed.cx, changed.cy, size.w, size.h, changed.lit) : crop(now, 72, 80, size.w, size.h);
  };
  return (key) => {
    const hit = made.get(key);
    if (hit) return hit;
    const art = build(key);
    made.set(key, art);
    return art;
  };
}

// um desenho pronto, ampliado em escala inteira
const Pixels: React.FC<{ source: HTMLCanvasElement; k: number; label?: string; className?: string }> = ({ source, k, label, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, source.width, source.height);
    ctx.drawImage(source, 0, 0);
  }, [source]);
  return (
    <canvas
      ref={ref}
      width={source.width}
      height={source.height}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`block shrink-0 ${className}`}
      style={{ width: source.width * k, height: source.height * k, imageRendering: 'pixelated' }}
    />
  );
};

// a criatura da capa (o ovo, a lagarta ou a mariposa de quem é o livro)
const CoverCreature: React.FC<{ data: GuideData; live: boolean }> = ({ data, live }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const { st, world, spec } = data;
  const [w, h] = st.stage === 1 ? [84, 22] : st.stage === 0 ? [36, 40] : [68, 60];
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const paint = (flap: number) => {
      ctx.clearRect(0, 0, w, h);
      if (spec) drawMoth(ctx, 34, 31, 30, spec, flap);
      else if (world.rated === 0) drawLarva(ctx, 18, 20, 4, EMPTY);
      else drawLarva(ctx, 42, 8, 2, data.larvaWorld);
    };
    paint(1);
    if (!live || !spec) return;
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      paint([1, 0.9, 0.78, 0.9][tick % 4]);
    }, 240);
    return () => window.clearInterval(timer);
  }, [data, spec, world, w, h, live]);
  const k = st.stage === 1 ? 2 : 3;
  return <canvas ref={ref} width={w} height={h} aria-hidden className="block" style={{ width: w * k, height: h * k, imageRendering: 'pixelated' }} />;
};

// uma lata da estante, grande (a legenda das latas)
const Can: React.FC<{ body: string; lid: string; base: string; band?: string }> = ({ body, lid, base, band }) => (
  <span aria-hidden className="grid h-[30px] w-[20px] shrink-0 grid-rows-3 overflow-hidden rounded-[2px]" style={{ boxShadow: `0 0 0 2px ${DARK}` }}>
    <span style={{ background: lid }} />
    <span style={{ background: band ?? body }} />
    <span style={{ background: base }} />
  </span>
);

// ---------------------------------------------------------------------------
// As páginas
// ---------------------------------------------------------------------------

type Status = 'past' | 'here' | 'future';
type CatalogEntry = PersonaEntry & { userCount: number };
// Quantas personalidades cabem numa página (os retratos: 4 por linha no
// computador, 3 no celular) e quantas são.
const PER_PAGE = 12;
const PERSONAS = 84;
// As cinco primeiras aberturas são o manual (a dos móveis dos humores entrou
// em 17/11/2026, como a 3ª); a 1ª página das personalidades fica na direita
// da 5ª e as outras vão de duas em duas.
const MOODS_SPREAD = 2;
const MANUAL = 5;
const spreadsFor = (personas: number) => MANUAL + Math.ceil((Math.ceil(personas / PER_PAGE) - 1) / 2);

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
// página única do celular). Quando o conteúdo não cabe, a página rola por
// dentro e uma seta no pé avisa que há mais para baixo.
type Side = 'left' | 'right' | 'single';
const Paper: React.FC<{ side: Side; pad: number; number: number | null; children: React.ReactNode }> = ({ side, pad, number, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro?.disconnect();
    };
  }, [measure]);
  // A mesma folha de papel recebe o conteúdo de outra página quando o livro
  // vira: mede de novo a cada desenho (e volta ao topo quando o conteúdo troca).
  useEffect(() => {
    measure();
  });
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
    measure();
  }, [number, measure]);
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${side === 'left' ? 'rounded-l-[5px]' : side === 'right' ? 'rounded-r-[5px]' : 'rounded-[5px]'}`}
      style={{ background: PAGE_PAPER, color: INK, boxShadow: side === 'left' ? '-1px 0 0 #D9CDAE, -3px 0 0 #EADFC3, -4px 0 0 #CFC2A0' : '1px 0 0 #D9CDAE, 3px 0 0 #EADFC3, 4px 0 0 #CFC2A0' }}
    >
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
        <span aria-hidden className={`pointer-events-none absolute bottom-[8px] text-[12px] ${side === 'left' ? 'left-4' : 'right-4'}`} style={{ color: INK_SOFT }}>
          {number}
        </span>
      )}
    </div>
  );
};

const NAV_BUTTON = `grid place-items-center w-11 h-11 rounded-full border border-white/15 hover:border-white/40 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-white/15 transition ${FOCUS_RING}`;
// o fechar: um botão com nome, bem à vista (o X sozinho passava despercebido)
const CLOSE_BUTTON = `inline-flex shrink-0 items-center gap-2 h-11 pl-3.5 pr-4 rounded-full border text-[15px] font-semibold hover:bg-white/10 transition ${FOCUS_RING}`;

interface StudioGuideProps {
  world: PersonaWorld;
  isOwn: boolean;
  // "@fulano", no estúdio de outra pessoa
  ownerName: string | null;
  // a sala de estar como quem olha vê (a máquina do Jackpot e a mesa de pôquer aparecem?)
  extras?: StudioExtras;
  onClose: () => void;
}

const StudioGuide: React.FC<StudioGuideProps> = ({ world, isOwn, ownerName, extras = NO_EXTRAS, onClose }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const viewerId = session?.user?.id ?? null;
  const reduce = Boolean(useReducedMotion());
  const { w: vw, h: vh } = useViewport();
  const st = useMemo(() => worldState(world), [world]);
  const { jackpot, poker } = extras;
  const data = useMemo(() => guideData(world, st, { jackpot, poker }), [world, st, jackpot, poker]);
  const art = useMemo(() => makeArt(data), [data]);
  const name = ownerName ?? '';
  const pt = i18n.language?.startsWith('pt');

  // ---- as medidas ----
  const spread = vw >= 860 && vh >= 600;
  const pageW = spread ? Math.min(440, Math.floor((vw - 64) / 2)) : Math.min(430, vw - 20);
  // A altura vem do espaço que sobra entre o topo e os botões de baixo (medido:
  // no celular com o site instalado as barras do sistema também comem altura).
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaH, setAreaH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setAreaH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const room = areaH ?? vh - 120;
  const pageH = Math.max(220, spread ? Math.min(640, room - 28) : Math.min(720, room - 20));
  const pad = spread ? 28 : vw < 360 ? 14 : 18;
  const inner = pageW - pad * 2;

  // ---- as personalidades (as 84), para as últimas páginas ----
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [personaCode, setPersonaCode] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc('get_personas_catalog').then(({ data: rows, error }) => {
      if (!alive || error || !Array.isArray(rows)) return;
      const order = (code: string) => code.split('').reduce((sum, letter) => sum * 10 + LETTERS.indexOf(letter), 0);
      setCatalog(
        (rows as Record<string, unknown>[])
          .map((row) => ({ ...mapPersonaEntry(row), userCount: Number(row.user_count) || 0 }))
          .filter((entry) => entry.code)
          .sort((a, b) => order(a.code) - order(b.code)),
      );
    });
    return () => {
      alive = false;
    };
  }, []);
  const titleOfCode = (code: string | null): string => {
    const entry = code ? catalog.find((item) => item.code === code) : null;
    return entry ? personaText(entry, i18n.language).title : '';
  };
  const personaTotal = catalog.length || PERSONAS;
  const spreads = spreadsFor(personaTotal);
  const last = spreads - 1;

  // ---- as páginas ----
  // -1 = o livro fechado (a capa); depois, uma abertura por assunto
  const [page, setPage] = useState(-1);
  const [turn, setTurn] = useState<{ from: number; to: number } | null>(null);
  const go = useCallback(
    (to: number) => {
      const target = clamp(to, -1, last);
      if (turn || target === page) return;
      if (reduce) setPage(target);
      else setTurn({ from: page, to: target });
    },
    [turn, page, reduce, last],
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
    }, 900);
    return () => window.clearTimeout(timer);
  }, [reduce]);
  const act = (to: number) => {
    touched.current = true;
    go(to);
  };
  const shown = turn ? turn.to : page;

  // ---- teclado, foco e rolagem da página de trás ----
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      before?.focus?.();
    };
  }, []);
  // 18/11/2026 (Protocolo Reborn, onda 2a): o guia entra na pilha de camadas do
  // app (src/overlays). A trava de rolagem e o Esc saíram daqui: o Esc e o
  // voltar fecham a camada de cima (a ficha de uma personalidade, se estiver
  // aberta, e só depois o livro). O 9996 virou o piso do z-index.
  const layer = useLayerEntry(true, onClose, { z: 9996 });
  useEffect(() => {
    // com a ficha de uma personalidade aberta por cima, o teclado é dela
    if (personaCode) return;
    const onKey = (event: KeyboardEvent) => {
      const next = event.key === 'ArrowRight' || event.key === 'PageDown';
      const previous = event.key === 'ArrowLeft' || event.key === 'PageUp';
      if (!next && !previous && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      touched.current = true;
      go(event.key === 'Home' ? 0 : event.key === 'End' ? last : page + (next ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page, personaCode, last]);

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

  // ---- números ----
  const lang = pt ? 'pt-BR' : 'en-US';
  const whole = (value: number) => value.toLocaleString(lang);
  const moodName = (letter: string | null) => (letter && MOOD_BY_LETTER[letter] ? t(MOOD_BY_LETTER[letter].labelKey) : '');
  const g = (key: string, options?: Record<string, unknown>) => t(`personaWorld.guide.${key}`, options) as string;

  // ---- pedaços de página ----
  const heading = (text: string) => (
    <h3 className={`${spread ? 'text-[26px]' : 'text-[23px]'} leading-[1.05]`} style={PIXEL}>
      {text}
    </h3>
  );
  const body = (text: string, className = '') => <p className={`text-[14.5px] leading-[1.5] ${className}`}>{text}</p>;
  const note = (text: string, className = '') => (
    <p className={`text-[13px] leading-[1.45] ${className}`} style={{ color: INK_SOFT }}>
      {text}
    </p>
  );
  // o quadrinho escuro de um item, com o desenho dentro
  const frame = (key: string, label?: string) => (
    <span className="block shrink-0 rounded-[3px] p-[3px]" style={{ background: DARK, boxShadow: `0 0 0 1.5px ${GOLD_INK}` }}>
      <Pixels source={art(key)} k={2} label={label} />
    </span>
  );
  const tile = (letter: string | null) => (
    <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] text-[12px] leading-none" style={{ ...PIXEL, color: letter ? (MOOD_BY_LETTER[letter]?.color ?? MIST) : PAPER, background: INK }}>
      {letter ? showLetter(letter) : '+'}
    </span>
  );

  // ---- 1. as evoluções: o ovo, a lagarta e os dez níveis do estúdio ----
  // (estágio 0 = ovo, 1 = lagarta; do 2 em diante, o nível é o estágio − 1)
  const statusOf = (stage: number): Status => (st.stage > stage ? 'past' : st.stage === stage ? 'here' : 'future');
  const stageRow = (stage: number) => {
    const level = stage - 1;
    const key = stage === 0 ? 'egg' : stage === 1 ? 'larva' : `level${level}`;
    const status = statusOf(stage);
    const color = status === 'past' ? PAST : status === 'here' ? HERE : FUTURE;
    const Icon = status === 'past' ? Check : status === 'here' ? MapPin : Hourglass;
    const needs = stage === 0 ? g('needs.egg') : stage === 1 ? g('needs.larva') : level === 1 ? g('needs.born') : g('needs.titles', { n: whole(LEVEL_AT[level]) });
    const brings = stage === 0 ? g('brings.egg') : stage === 1 ? g('brings.larva') : g(level === 1 ? 'brings.born' : 'brings.item', { item: t(`personaWorld.furniture.${FURNITURE[level]}`) });
    const left = status === 'future' && st.hasTrio && level >= 2 ? Math.max(1, LEVEL_AT[level] - st.rated) : null;
    const state = status === 'past' ? g('status.past') : status === 'here' ? (isOwn ? g('status.hereOwn') : g('status.hereOther', { name })) : left ? g('status.left', { count: left, left: whole(left) }) : g('status.future');
    return (
      <li key={key} className={`flex items-center gap-3 rounded-[6px] ${level >= 2 ? 'p-[3px]' : 'p-[5px]'}`} style={status === 'here' ? { background: 'rgba(181,23,158,0.09)', boxShadow: `inset 0 0 0 1.5px ${HERE}` } : undefined}>
        {frame(stage >= 2 ? String(stage) : key)}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className={`${level >= 2 ? 'text-[16px]' : 'text-[17px]'} leading-tight`} style={PIXEL}>
              {level >= 2 ? t('personaWorld.level.short', { n: level }) : levelText(t, { level: Math.max(0, level), stage })}
            </span>
            <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold leading-tight" style={{ color }}>
              <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden />
              {state}
            </span>
          </p>
          <p className={`${level >= 2 ? 'text-[12.5px]' : 'mt-[2px] text-[13px]'} leading-snug`} style={{ color: INK_SOFT }}>
            {needs}
          </p>
          <p className={`${level >= 2 ? 'text-[13px]' : 'text-[13.5px]'} font-semibold leading-snug`}>{brings}</p>
        </div>
      </li>
    );
  };
  const todayBox = () => {
    const threshold = world.persona?.threshold || PERSONA_THRESHOLD;
    const line =
      st.stage === 0
        ? g('today.egg')
        : st.stage === 1
          ? g('today.larva', { counted: world.counted, threshold })
          : st.nextAt
            ? g('today.level', { count: st.toNext, level: st.level, rated: whole(st.rated), left: whole(st.toNext), next: st.level + 1 })
            : g('today.max', { level: st.level, rated: whole(st.rated) });
    const bar = st.stage === 0 ? 0 : st.levelBar;
    return (
      <div className="mt-3 rounded-[6px] px-3 py-2.5" style={{ background: 'rgba(34,27,54,0.07)' }}>
        <p className="text-[12.5px] font-semibold" style={{ color: HERE }}>
          {isOwn ? g('today.labelOwn') : g('today.labelOther', { name })}
        </p>
        <p className="mt-[2px] text-[14px] leading-snug">{line}</p>
        <div className="mt-2 h-[6px] overflow-hidden rounded-full" style={{ background: 'rgba(34,27,54,0.14)' }} aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.round(bar * 100)}%`, background: HERE }} />
        </div>
      </div>
    );
  };

  // ---- 2. os lugares do chão, os bichinhos e os objetos ----
  const petRow = (pet: PetId, tagId: string) => {
    const entry = PET_ITEMS.find((item) => item.pet === pet);
    const tag = ORACLE_TAGS.find((item) => item.id === tagId);
    const has = hasPet(world, pet);
    const count = entry ? world.oracle[entry.oracle] : 0;
    return (
      <li key={pet} className="flex items-center gap-3">
        <span className="grid w-[98px] shrink-0 place-items-center">{frame(`pet:${pet}`)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-tight" style={PIXEL}>
            {g(`pets.${pet}`)}
          </p>
          <p className="mt-[2px] text-[13px] leading-snug" style={{ color: INK_SOFT }}>
            {g(`pets.${pet}What`, { tag: tag ? `${tag.emoji} ${tag.name}` : '' })}
          </p>
          <p className="mt-[2px] inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: has ? PAST : FUTURE }}>
            {has ? <Check className="h-[13px] w-[13px] shrink-0" aria-hidden /> : <Hourglass className="h-[13px] w-[13px] shrink-0" aria-hidden />}
            {has ? g('objects.has') : g('pets.progress', { count: whole(Math.min(count, PET_GOAL)), goal: PET_GOAL })}
          </p>
        </div>
      </li>
    );
  };
  const objectRow = (kind: SpotKind, label: string, what: string, state?: { has: boolean }) => (
    <li key={kind} className="flex items-center gap-3">
      {/* os objetos têm tamanhos diferentes: a coluna é fixa e o desenho fica no meio */}
      <span className="grid w-[98px] shrink-0 place-items-center">{frame(`spot:${kind}`)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-tight" style={PIXEL}>
          {label}
        </p>
        <p className="mt-[2px] text-[13px] leading-snug" style={{ color: INK_SOFT }}>
          {what}
        </p>
        {state && (
          <p className="mt-[2px] inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: state.has ? PAST : FUTURE }}>
            {state.has ? <Check className="h-[13px] w-[13px]" aria-hidden /> : <Hourglass className="h-[13px] w-[13px]" aria-hidden />}
            {state.has ? g('objects.has') : g('objects.missing')}
          </p>
        )}
      </div>
    </li>
  );

  // ---- 3. os móveis dos humores (17/11/2026) ----
  const moodRow = (item: MoodItem) => {
    const has = hasMoodItem(world, st, item);
    const count = st.films[item.letter] ?? 0;
    const tag = PROGRESSION_TAGS.find((entry) => entry.name === item.tag);
    return (
      <li key={item.id} className="flex items-center gap-3">
        <span className="grid w-[98px] shrink-0 place-items-center">{frame(`mood:${item.id}`)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-tight" style={PIXEL}>
            {t(`studio.inventory.names.${item.id}`)}
          </p>
          <p className="mt-[2px] text-[13px] leading-snug" style={{ color: INK_SOFT }}>
            {g('moods.what', { mood: moodName(item.letter), tag: tag ? `${tag.emoji} ${tag.name}` : item.tag })}
          </p>
          <p className="mt-[2px] inline-flex items-center gap-1 text-[12.5px] font-semibold" style={{ color: has ? PAST : FUTURE }}>
            {has ? <Check className="h-[13px] w-[13px] shrink-0" aria-hidden /> : <Hourglass className="h-[13px] w-[13px] shrink-0" aria-hidden />}
            {has ? g('objects.has') : g('pets.progress', { count: whole(Math.min(count, MOOD_ITEM_GOAL)), goal: MOOD_ITEM_GOAL })}
          </p>
        </div>
      </li>
    );
  };
  const moodsLeft = () => (
    <>
      {heading(g('moods.title'))}
      {body(g('moods.intro', { goal: MOOD_ITEM_GOAL }), 'mt-2')}
      <ul className="mt-3 grid gap-[7px]">{MOOD_ITEMS.slice(0, 4).map(moodRow)}</ul>
    </>
  );
  const moodsRight = () => (
    <>
      <ul className="grid gap-[7px]">{MOOD_ITEMS.slice(4).map(moodRow)}</ul>
      {note(g(isOwn ? 'moods.touchOwn' : 'moods.touchOther', { name }), 'mt-3')}
      {note(g('moods.others'), 'mt-2')}
    </>
  );

  // ---- 4 e 5. o gráfico das nove prateleiras e as três letras ----
  const chart = () => {
    const strongest = Math.max(1, ...st.rank.map((letter) => st.score[letter]));
    return (
      <ul className="mt-3 grid gap-[7px]">
        {st.rank.map((letter) => {
          const mood = MOOD_BY_LETTER[letter];
          const position = st.trio.indexOf(letter);
          return (
            <li key={letter} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2 text-[13.5px]">
              {tile(letter)}
              <span className="min-w-0 truncate font-semibold">
                {t(mood.labelKey)}
                {position >= 0 && (
                  <span className="ml-1.5 text-[12px] font-normal" style={{ color: INK_SOFT }}>
                    {t('personaWorld.always.trioRank', { rank: position + 1 })}
                  </span>
                )}
              </span>
              <span className="text-[12.5px] tabular-nums" style={{ color: INK_SOFT }}>
                {t('oracle.persona.films', { count: st.films[letter] })}
              </span>
              <span className="col-span-2 col-start-2 block h-[8px] overflow-hidden rounded-[2px]" style={{ background: 'rgba(34,27,54,0.12)' }} aria-hidden>
                <span className="block h-full" style={{ width: `${(st.score[letter] / strongest) * 100}%`, background: mood.color, boxShadow: 'inset 0 0 0 1px rgba(34,27,54,0.45)' }} />
              </span>
            </li>
          );
        })}
      </ul>
    );
  };
  const neighbor = () => {
    if (!st.hasTrio || !st.code) return null;
    const degree = st.neighbor === 'cocoon' ? 2 : st.neighbor === 'near' ? 1 : 0;
    const degrees = [t('personaWorld.next.far'), t('personaWorld.next.near'), t('personaWorld.next.cocoon')];
    return (
      <div className="mt-3 rounded-[6px] px-3 py-2.5" style={{ background: 'rgba(34,27,54,0.07)' }}>
        <p className="text-[12.5px] font-semibold" style={{ color: HERE }}>
          {isOwn ? g('letters.nowOwn') : g('letters.nowOther', { name })}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-[4px] px-1.5 py-[3px]" style={{ background: INK }}>
            <PersonaCode code={st.code} className="text-[17px] leading-none tracking-[0.06em]" />
          </span>
          <span className="text-[14px] font-semibold">{titleOfCode(st.code)}</span>
        </p>
        {st.nextCode && st.challenger && st.weakest ? (
          <>
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span style={{ color: INK_SOFT }}>{t('personaWorld.next.neighbor')}:</span>
              <span className="rounded-[4px] px-1.5 py-[3px]" style={{ background: INK }}>
                <PersonaCode code={st.nextCode} className="text-[15px] leading-none tracking-[0.06em]" />
              </span>
              <span className="font-semibold">{titleOfCode(st.nextCode)}</span>
              <span className="rounded-[4px] px-1.5 py-[2px] text-[12px]" style={{ ...PIXEL, background: INK, color: PAPER }}>
                {degrees[degree]}
              </span>
            </p>
            {note(
              t(degree === 2 ? 'personaWorld.next.cocoonLead' : degree === 1 ? 'personaWorld.next.nearLead' : 'personaWorld.next.farLead', { challenger: moodName(st.challenger), weakest: moodName(st.weakest) }),
              'mt-1.5',
            )}
          </>
        ) : (
          note(t('personaWorld.next.noNeighbor'), 'mt-1.5')
        )}
      </div>
    );
  };

  // ---- as 84 personalidades (12 por página): o retrato de cada personagem ----
  const personaPage = (index: number) => {
    const slice = catalog.slice(index * PER_PAGE, (index + 1) * PER_PAGE);
    if (catalog.length === 0) return note(g('personas.loading'));
    if (slice.length === 0) return null;
    return (
      <ul className={`grid ${spread ? 'grid-cols-4' : 'grid-cols-3'} gap-x-2 gap-y-3`}>
        {slice.map((entry) => {
          const mine = entry.code === st.code;
          const text = personaText(entry, i18n.language);
          const label = `${showCode(entry.code)}: ${text.title} (${text.character})${mine && isOwn ? ` · ${t('oracle.persona.yours')}` : ''}`;
          const inside = (
            <>
              <span className="relative block transition-transform duration-200 group-hover:-translate-y-0.5">
                <PersonaCard persona={entry} compact ring={mine ? HERE : undefined} alt="" className="shadow-[0_8px_16px_-10px_rgba(20,12,40,0.75)]" />
                {/* o código por cima da foto (no pé dela fica o fio das três prateleiras) */}
                <span aria-hidden className="absolute left-1 top-1 rounded-[4px] px-[5px] py-[3px]" style={{ background: 'rgba(18,13,34,0.86)' }}>
                  <PersonaCode code={entry.code} className="block text-[13px] leading-none tracking-[0.06em]" />
                </span>
              </span>
              <span
                aria-hidden
                className="mt-[5px] block text-[11.5px] font-semibold leading-[1.22]"
                style={{ color: mine ? HERE : INK, minHeight: '2.44em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {text.title}
              </span>
            </>
          );
          return (
            <li key={entry.code} className="min-w-0">
              {viewerId ? (
                <button type="button" onClick={() => setPersonaCode(entry.code)} aria-label={label} className={`group block w-full min-w-0 rounded-[10px] text-left ${FOCUS_RING}`}>
                  {inside}
                </button>
              ) : (
                <span role="img" aria-label={label} className="group block min-w-0">
                  {inside}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  // ---- as duas metades de cada abertura ----
  const titles = [g('evolutions.title'), g('places.title'), g('moods.title'), g('shelves.title'), g('letters.title'), ...Array.from({ length: spreads - MANUAL }, () => g('personas.title'))];
  // as personalidades: a 1ª página fica na 4ª abertura (à direita); depois, duas por abertura
  const personaRange = (first: number) => note(g('personas.range', { from: first * PER_PAGE + 1, to: Math.min(personaTotal, (first + 2) * PER_PAGE), total: personaTotal }), 'mt-1 mb-3');
  const manualLeft = (index: number): React.ReactNode => {
    if (index === 0) {
      return (
        <>
          {heading(g('evolutions.title'))}
          {body(g('evolutions.intro'), 'mt-2')}
          {todayBox()}
          <ul className="mt-3 grid gap-[6px]">{[0, 1, 2].map(stageRow)}</ul>
        </>
      );
    }
    if (index === 1) {
      return (
        <>
          {heading(g('places.title'))}
          {body(g('places.intro'), 'mt-2')}
          {body(g(isOwn ? 'places.howOwn' : 'places.howOther'), 'mt-2')}
          <h4 className="mt-4 text-[19px] leading-tight" style={PIXEL}>
            {g('pets.title')}
          </h4>
          {body(g('pets.intro', { goal: PET_GOAL }), 'mt-1.5')}
          <ul className="mt-3 grid gap-[7px]">
            {petRow('frog', 'quick-tongue')}
            {petRow('fox', 'keen-sense')}
            {petRow('snake', 'underworld-king')}
          </ul>
        </>
      );
    }
    if (index === 2) {
      // a estante de perto: no computador ela divide a página com a legenda; no celular a página rola
      const k = spread ? clamp(Math.floor((pageH - pad * 2 - 300) / SHELVES.h), 2, 3) : clamp(Math.floor((inner - 8) / SHELVES.w), 2, 4);
      const mood = MOOD_BY_LETTER[st.rank[0]] ?? MOOD_BY_LETTER.M;
      const dark = (hex: string, amount: number) => `color-mix(in srgb, ${hex}, #0D0919 ${Math.round(amount * 100)}%)`;
      const light = (hex: string, amount: number) => `color-mix(in srgb, ${hex}, #ffffff ${Math.round(amount * 100)}%)`;
      const row = (can: React.ReactNode, text: string) => (
        <li className="flex items-center gap-2.5">
          {can}
          <span className="text-[13.5px] leading-snug">{text}</span>
        </li>
      );
      return (
        <>
          {heading(g('shelves.title'))}
          {body(g('shelves.intro'), 'mt-2')}
          <figure className="m-0 mt-3 flex flex-col items-center">
            <span className="block rounded-[3px] p-1" style={{ background: DARK, boxShadow: `0 0 0 2px ${GOLD_INK}` }}>
              <Pixels source={art('shelves')} k={k} label={g('shelves.caption')} />
            </span>
            <figcaption className="mt-1.5 text-center text-[13px]" style={{ color: INK_SOFT }}>
              {g('shelves.caption')}
            </figcaption>
          </figure>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-[9px]">
            {row(<Can body={mood.color} lid={light(mood.color, 0.4)} base={dark(mood.color, 0.35)} />, g('shelves.one'))}
            {row(<Can body={mood.color} lid={GOLD} base={dark(mood.color, 0.35)} />, g('shelves.lid'))}
            {row(<Can body={GOLD} lid={light(GOLD, 0.45)} base={dark(GOLD, 0.34)} />, g('shelves.ten'))}
            {row(<Can body={GOLD} lid={light(GOLD, 0.45)} base={dark(GOLD, 0.34)} band={PAPER} />, g('shelves.hundred'))}
          </ul>
          {note(g('shelves.frame'), 'mt-3')}
          {note(g(isOwn ? 'shelves.room' : 'shelves.roomOther'), 'mt-1')}
        </>
      );
    }
    if (index === 3) {
      return (
        <>
          {heading(g('letters.title'))}
          {body(g('letters.birth'), 'mt-2')}
          {body(g('letters.rule'), 'mt-2')}
          {neighbor()}
          {note(g('letters.all'), 'mt-3')}
        </>
      );
    }
    const first = (index - 4) * 2 + 1;
    return (
      <>
        {heading(g('personas.title'))}
        {personaRange(first)}
        {personaPage(first)}
      </>
    );
  };
  const manualRight = (index: number): React.ReactNode => {
    if (index === 0) return <ul className="grid gap-[3px]">{Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 3).map(stageRow)}</ul>;
    if (index === 1) {
      const has = hasTerrorBox(world);
      return (
        <>
          {heading(g('objects.title'))}
          {body(g('objects.intro'), 'mt-2')}
          <ul className="mt-3 grid gap-[7px]">
            {objectRow('jackpot', g('objects.jackpot'), g('objects.jackpotWhat'))}
            {objectRow('poker', g('objects.poker'), g('objects.pokerWhat'))}
            {objectRow('book', g('objects.book'), g('objects.bookWhat'))}
            {objectRow('terror', g('objects.terror'), g('objects.terrorWhat'), { has })}
          </ul>
          {note(g('objects.more'), 'mt-3')}
          {note(g('objects.cobra'), 'mt-2')}
          {!isOwn && note(g('objects.other'), 'mt-2')}
        </>
      );
    }
    if (index === 2) {
      return (
        <>
          {heading(g('kept.title'))}
          {body(t('personaWorld.always.lead', { count: st.rated }), 'mt-2')}
          {chart()}
          {st.out > 0 && (
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug" style={{ color: INK_SOFT }}>
              {tile(null)}
              <span>{t('personaWorld.always.archive', { count: st.out })}</span>
            </p>
          )}
        </>
      );
    }
    if (index === 3) {
      return (
        <>
          {heading(g('personas.title'))}
          {body(g(viewerId ? 'personas.intro' : 'personas.introPlain'), 'mt-2 mb-3')}
          {personaPage(0)}
        </>
      );
    }
    return personaPage((index - 4) * 2 + 2);
  };

  // a abertura dos móveis entrou no meio: as de depois são as de antes, uma para a frente
  const leftOf = (index: number): React.ReactNode => (index === MOODS_SPREAD ? moodsLeft() : manualLeft(index > MOODS_SPREAD ? index - 1 : index));
  const rightOf = (index: number): React.ReactNode => (index === MOODS_SPREAD ? moodsRight() : manualRight(index > MOODS_SPREAD ? index - 1 : index));

  // ---- a capa ----
  const cover = (live: boolean) => (
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
      <CoverCreature data={data} live={live} />
      <p className={`${spread ? 'text-[36px]' : 'text-[31px]'} mt-6 leading-[1.04]`} style={{ ...PIXEL, color: GOLD, textShadow: '0 2px 0 #150E26' }}>
        {g('title')}
      </p>
      <p className="mt-3 text-[15px] leading-snug" style={{ color: PAPER }}>
        {isOwn ? g('coverOwn') : g('coverOther', { name })}
      </p>
      {page === -1 && !turn && (
        <button type="button" onClick={() => act(0)} className={`absolute bottom-8 inline-flex h-11 items-center rounded-xl border px-5 text-[14px] font-semibold transition hover:bg-white/10 ${FOCUS_RING}`} style={{ color: PAPER, borderColor: 'rgba(244,196,84,0.6)' }}>
          {g('open')}
        </button>
      )}
    </div>
  );

  const paper = (side: Side, content: React.ReactNode, number: number | null) => (
    <Paper side={side} pad={pad} number={number}>
      {content}
    </Paper>
  );
  const leftPage = (index: number) => (index < 0 ? null : paper('left', leftOf(index), index * 2 + 1));
  const rightPage = (index: number, live: boolean) => (index < 0 ? cover(live) : paper('right', rightOf(index), index * 2 + 2));
  const sheet = (index: number, live: boolean) =>
    index < 0
      ? cover(live)
      : paper(
          'single',
          <>
            {leftOf(index)}
            <div className="mt-4">{rightOf(index)}</div>
          </>,
          null,
        );

  // ---- a folha que vira ----
  const lo = turn ? Math.min(turn.from, turn.to) : page;
  const hi = turn ? Math.max(turn.from, turn.to) : page;
  const forward = turn ? turn.to > turn.from : true;
  const seconds = turn && lo === -1 ? 1.15 : spread ? 0.8 : 0.5;
  const ease: [number, number, number, number] = [0.45, 0.05, 0.2, 1];
  const closed = shown === -1;
  const FACE: React.CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  const position = shown < 0 ? g('cover') : g('pageOf', { no: shown + 1, total: spreads });
  // Tocar fora do livro (no escuro em volta dele) fecha o guia. Só quando o
  // toque começou e terminou ali: arrastar a folha e soltar fora do livro não fecha.
  const pressedOn = useRef<EventTarget | null>(null);
  const closeOnBackdrop = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && pressedOn.current === event.currentTarget) onClose();
  };

  return createPortal(
    <LayerScope layer={layer}>
    <div
      ref={dialogRef}
      {...layer.rootProps}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={g('dialogAria')}
      className="fixed inset-0 z-[9996] flex flex-col items-center outline-none"
      style={{ ...layer.style, background: 'radial-gradient(ellipse 70% 60% at 50% 46%, rgba(46,30,84,0.92), rgba(8,5,18,0.96) 70%)' }}
    >
      <motion.div className="flex h-full w-full flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
        onPointerDownCapture={(event) => {
          pressedOn.current = event.target;
        }}
        onClick={closeOnBackdrop}
      >
        {/* o topo desce abaixo da barra do relógio no celular (site instalado e app) */}
        <header className="w-full max-w-[960px] shrink-0 px-3 sm:px-5" style={{ paddingTop: 'env(safe-area-inset-top)' }} onClick={closeOnBackdrop}>
          <div className="flex h-14 items-center justify-between gap-3" onClick={closeOnBackdrop}>
            <p className="min-w-0 truncate text-[17px]" style={{ ...PIXEL, color: PAPER }}>
              {g('title')}
            </p>
            <button type="button" onClick={onClose} className={CLOSE_BUTTON} style={{ color: PAPER, borderColor: 'rgba(244,196,84,0.7)', background: 'rgba(43,26,74,0.85)' }} aria-label={g('close')}>
              <X className="h-[18px] w-[18px]" aria-hidden />
              {g('closeShort')}
            </button>
          </div>
        </header>

        <div ref={areaRef} className="grid min-h-0 w-full flex-1 place-items-center overflow-hidden" onClick={closeOnBackdrop}>
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
                <div className="absolute inset-y-0 left-0 w-1/2">{leftPage(lo)}</div>
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
                      {leftPage(hi)}
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
          <button type="button" onClick={() => act(page - 1)} disabled={shown <= -1} className={NAV_BUTTON} style={{ color: PAPER }} aria-label={g('prev')}>
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <p className="min-w-[92px] text-center text-[15px]" style={{ ...PIXEL, color: PAPER }} aria-hidden>
            {position}
          </p>
          <button type="button" onClick={() => act(page + 1)} disabled={shown >= last} className={NAV_BUTTON} style={{ color: PAPER }} aria-label={g('next')}>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </footer>
        <p className="sr-only" aria-live="polite">
          {shown < 0 ? g('cover') : g('pageAria', { no: shown + 1, total: spreads, title: titles[shown] })}
        </p>
      </motion.div>

      {/* a ficha de uma personalidade, por cima do livro */}
      {viewerId && (
        <PersonasModal
          isOpen={personaCode !== null}
          onClose={() => setPersonaCode(null)}
          viewerId={viewerId}
          viewerPersonaCode={isOwn ? st.code : null}
          initialCode={personaCode}
          zIndexClass="z-[9998]"
          onUserClick={(username) => {
            onClose();
            navigate(`/profile/${username}`);
          }}
        />
      )}
    </div>
    </LayerScope>,
    document.body,
  );
};

export default StudioGuide;
