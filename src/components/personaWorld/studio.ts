import type { PersonaWorld } from '../../lib/personaWorld';
import { GLOW_GOLD, GLOW_SOFT, glowAlphas, glowOf, paintGlow } from './glow';

// O estúdio (14/11/2026): a sala de estar, ao lado do cinema.
//
// Pedido do Bruno (14/11, 17h08): o estúdio toma, na home, o lugar das portas
// do Jackpot e do Pôquer, "que agora se tornarão objetos dentro do estúdio do
// usuário: uma máquina caça-níquel e uma mesa"; "uma prateleira com um livro
// clicável". Às 17h23: "o portal de Halloween não é mais um item de banner,
// agora ele é um item de estúdio liberado pela tag, [...] dentro de uma caixa
// velha de papelão".
//
// Correções das 20h32, depois de ver a primeira versão no ar: "acho que ficou
// muita informação e dificultou encontrar o que é prioritário, o jackpot".
//   • saíram o aquário, a abóbora, o amuleto do beta ("o olho"), a árvore de
//     Natal e as marcas de fita no chão: "por enquanto temos apenas o item a
//     caixa com portal";
//   • a caixa perdeu o "TERROR" escrito em fita;
//   • a máquina do Jackpot cresceu, ganhou letreiro de lâmpadas e um brilho em
//     volta, mais forte que o dos outros objetos;
//   • tudo o que pode ser tocado brilha (glow.ts).
//
// O cinema (a tela, a estante das latas, a poltrona, o projetor) fica nos seis
// ladrilhos da esquerda. Nos três da direita:
//   • encostadas na parede: a máquina do Jackpot e a estante do guia;
//   • no meio: a mesa de pôquer (para quem tem o pôquer liberado);
//   • na frente: a caixa do Clube do Terror (para quem tem a Deadly Sleeping).
//
// Aqui só mora o desenho, a posição e o retângulo clicável de cada coisa. O
// que cada uma abre é assunto de useStudioDoors.

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

// As ferramentas de desenho do estúdio (draw.ts), passadas de lá para cá.
export interface Kit {
  iso: (x: number, y: number, z?: number) => Pt;
  box: (ctx: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, c: string) => void;
  poly: (ctx: Ctx, pts: Pt[], c: string) => void;
  px: (ctx: Ctx, x: number, y: number, c: string, w?: number, h?: number) => void;
  mix: (a: string, b: string, t: number) => string;
  dark: (c: string, t: number) => string;
  light: (c: string, t: number) => string;
  moodColor: (letter: string | null | undefined) => string;
  // o tamanho do canvas da cena
  size: [number, number];
}

export interface StudioExtras {
  // a máquina do Jackpot: 'off' = não aparece (roleta desligada); 'on' =
  // parada; 'alert' = há algo esperando a pessoa (a sirene pisca)
  jackpot: 'off' | 'on' | 'alert';
  // a mesa de pôquer aparece (quem está olhando tem o Pôquer liberado)
  poker: boolean;
}
export const NO_EXTRAS: StudioExtras = { jackpot: 'on', poker: false };

// Tudo o que pode ser tocado na cena. As quatro primeiras são objetos da sala
// de estar (aqui); as outras são do cinema (draw.ts).
export type SpotKind = 'jackpot' | 'poker' | 'book' | 'terror' | 'posters' | 'screen' | 'moth' | 'shelves';
export interface Spot {
  kind: SpotKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

const GOLD = '#F4C454';
const PAPER = '#F3EAD3';
const EDGE = '#150E26';

// Onde fica cada coisa, em ladrilhos (x ao longo da parede da direita, y ao
// longo da parede da esquerda; o canto do fundo é 0, 0).
//
// A máquina e a estante do guia ficam um pouco para dentro do canto da direita:
// num celular de 320 px a cena de 2× perde 10 pixels de cada lado, e a estante
// do guia encostada no canto ficava de fora (a ponta dela vai até o pixel 169
// de 180; o corte começa no 170).
const SLOT = { x: 6.1, y: 0.15, w: 1.1, d: 0.9, h: 36 };
const BOOKCASE = { x: 7.45, y: 0.1, w: 0.74, d: 0.44, h: 19 };
const TABLE = { x: 7.55, y: 3.05, r: 0.92, h: 7 };
const TERROR_BOX = { x: 6.4, y: 4.4, w: 1, d: 1, h: 11 };

// A caixa do Clube do Terror aparece para quem tem a Deadly Sleeping (qualquer edição).
export const hasTerrorBox = (world: PersonaWorld): boolean => world.tags.some((tag) => /^deadly-sleeping(-[0-9]+)?$/.test(tag.id));

// ---------- desenho ----------
// retângulo numa face que corre ao longo de x (a face +y de uma caixa). o =
// a ponta esquerda da face no chão dela; u = distância da ponta; v = altura.
const faceY = (ctx: Ctx, o: Pt, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) ctx.fillRect(Math.round(o[0]) + u + d, Math.round(o[1]) + ((u + d) >> 1) - v - h, 1, h);
};
// retângulo numa face que corre ao longo de y (a face +x). o = a ponta
// direita da face no chão dela; u cresce para a esquerda.
const faceX = (ctx: Ctx, o: Pt, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) ctx.fillRect(Math.round(o[0]) - 1 - (u + d), Math.round(o[1]) + ((u + d) >> 1) - v - h, 1, h);
};
// elipse cheia (um círculo no chão, visto de cima em isométrico)
const disc = (ctx: Ctx, cx: number, cy: number, a: number, b: number, c: string) => {
  ctx.fillStyle = c;
  for (let dy = -Math.floor(b); dy <= Math.floor(b); dy += 1) {
    const half = Math.round(a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b))));
    if (half > 0) ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2, 1);
  }
};

// A máquina do Jackpot: a base, o corpo com a janela das três bobinas, o
// letreiro dourado com lâmpadas, a sirene no alto e a alavanca do lado.
const SLOT_FRONT = (k: Kit): Pt => k.iso(SLOT.x + 0.04, SLOT.y + SLOT.d - 0.04, 11);
const SLOT_SIGN = (k: Kit): Pt => k.iso(SLOT.x, SLOT.y + SLOT.d, 26);
const drawSlot = (k: Kit, ctx: Ctx) => {
  const { x, y, w, d } = SLOT;
  k.box(ctx, x, y, 0, w, d, 11, '#1F2A72');
  k.box(ctx, x + 0.04, y + 0.04, 11, w - 0.08, d - 0.08, 15, '#2B3A9A');
  k.box(ctx, x, y, 26, w, d, 6, GOLD);
  k.box(ctx, x + 0.34, y + 0.26, 32, w - 0.68, d - 0.52, 4, '#C2333A');
  // a frente do corpo: a janela, as três bobinas e o friso
  const front = SLOT_FRONT(k);
  const width = Math.round((w - 0.08) * 12);
  faceY(ctx, front, 1, 4, width - 2, 9, EDGE);
  ['#E5484D', GOLD, '#4ADE80'].forEach((color, i) => {
    faceY(ctx, front, 2 + i * 3, 5, 2, 7, PAPER);
    faceY(ctx, front, 2 + i * 3, 7, 2, 3, color);
  });
  faceY(ctx, front, 0, 14, width, 1, GOLD);
  faceY(ctx, front, 0, 0, width, 2, GOLD);
  // a base: a bandeja com as fichas
  const base = k.iso(x, y + d, 0);
  faceY(ctx, base, 2, 4, 9, 4, EDGE);
  faceY(ctx, base, 3, 4, 7, 1, GOLD);
  faceY(ctx, base, 5, 5, 3, 1, GOLD);
  // o letreiro: uma fileira de lâmpadas (acendem em paintLounge)
  const sign = SLOT_SIGN(k);
  for (let i = 1; i < 13; i += 2) faceY(ctx, sign, i, 2, 1, 2, '#B8862B');
  // a alavanca, do lado
  const side = k.iso(x + w, y + 0.36, 15);
  k.px(ctx, side[0] + 1, side[1] - 10, '#BDB4D6', 1, 11);
  k.px(ctx, side[0], side[1] - 13, '#E5484D', 3, 3);
  k.px(ctx, side[0], side[1] - 13, '#FF9DA0', 1, 1);
};

// a estante do guia: uma estante baixa de madeira e, em cima, o livro grande
const drawBookcase = (k: Kit, ctx: Ctx) => {
  const { x, y, w, d, h } = BOOKCASE;
  const wood = '#6A4630';
  k.box(ctx, x, y, 0, w, d, h, wood);
  const front = k.iso(x, y + d, 0);
  const spines = ['#F472B6', '#38BDF8', '#FACC15', '#4ADE80', '#818CF8', '#FB923C', '#2DD4BF'];
  [2, 10].forEach((v, shelf) => {
    faceY(ctx, front, 1, v, 7, 7, '#2A1A14');
    for (let i = 0; i < 6; i += 1) faceY(ctx, front, 1 + i, v, 1, 4 + ((i + shelf) % 3), spines[(i + shelf * 3) % spines.length]);
  });
  // o livro, em pé em cima da estante, com o fecho dourado
  const top = k.iso(x + 0.08, y + d - 0.1, h);
  faceY(ctx, top, 0, 0, 7, 9, EDGE);
  faceY(ctx, top, 1, 1, 5, 7, '#8E2433');
  faceY(ctx, top, 1, 1, 1, 7, '#5E1622');
  faceY(ctx, top, 6, 1, 1, 7, PAPER);
  faceY(ctx, top, 3, 3, 2, 3, GOLD);
  faceY(ctx, top, 2, 4, 4, 1, GOLD);
};

// a mesa de pôquer: o pé, o aro de madeira e o feltro com as cartas e as fichas
const drawTable = (k: Kit, ctx: Ctx) => {
  const { x, y, r, h } = TABLE;
  k.box(ctx, x - 0.22, y - 0.22, 0, 0.44, 0.44, h - 1, '#3A2216');
  const c = k.iso(x, y, h);
  const a = r * 12 * Math.SQRT2;
  const b = r * 6 * Math.SQRT2;
  disc(ctx, c[0], c[1] + 2, a, b, '#3F2414');
  disc(ctx, c[0], c[1], a, b, '#8A5630');
  disc(ctx, c[0], c[1], a - 2, b - 1, '#17623E');
  disc(ctx, c[0], c[1] - 1, a - 5, b - 3, '#1F7A4D');
  // duas cartas e três pilhas de fichas
  k.px(ctx, c[0] - 5, c[1] - 2, PAPER, 3, 2);
  k.px(ctx, c[0] - 1, c[1] - 3, PAPER, 3, 2);
  k.px(ctx, c[0] - 4, c[1] - 2, '#E5484D', 1, 1);
  k.px(ctx, c[0], c[1] - 3, EDGE, 1, 1);
  k.px(ctx, c[0] + 5, c[1], '#3B82F6', 2, 2);
  k.px(ctx, c[0] + 8, c[1] - 1, GOLD, 2, 2);
  k.px(ctx, c[0] - 9, c[1] + 1, '#E5484D', 2, 2);
};

// A caixa velha de papelão do Clube do Terror: abas abertas, amassada, com
// uma tira de fita adesiva fechando a quina (sem nada escrito: o nome aparece
// na etiqueta, ao passar o mouse ou o foco). O portal gira dentro dela.
const drawTerrorBox = (k: Kit, ctx: Ctx) => {
  const { x, y, w, d, h } = TERROR_BOX;
  const card = '#94704A';
  k.box(ctx, x, y, 0, w, d, h, card);
  // por dentro, escuro (a boca da caixa)
  k.poly(ctx, [k.iso(x + 0.08, y + 0.08, h), k.iso(x + w - 0.08, y + 0.08, h), k.iso(x + w - 0.08, y + d - 0.08, h), k.iso(x + 0.08, y + d - 0.08, h)], '#1A0D14');
  // as abas abertas
  k.poly(ctx, [k.iso(x, y + d, h), k.iso(x + w, y + d, h), k.iso(x + w + 0.05, y + d + 0.3, h + 2), k.iso(x + 0.05, y + d + 0.3, h + 2)], k.dark(card, 0.12));
  k.poly(ctx, [k.iso(x + w, y, h), k.iso(x + w, y + d, h), k.iso(x + w + 0.3, y + d + 0.05, h + 2), k.iso(x + w + 0.3, y + 0.05, h + 2)], k.dark(card, 0.05));
  const left = k.iso(x, y + d, 0);
  const right = k.iso(x + w, y, 0);
  // a fita adesiva: uma tira clara que dá a volta na quina, mais gasta de um lado
  faceY(ctx, left, 5, 4, 7, 3, '#D9C9A0');
  faceX(ctx, right, 6, 4, 6, 3, '#CDBD94');
  faceY(ctx, left, 5, 4, 1, 3, k.dark(card, 0.08));
  // amassados e uma mancha
  faceY(ctx, left, 1, 0, 1, 2, k.dark(card, 0.25));
  faceY(ctx, left, 2, 8, 2, 1, k.dark(card, 0.2));
  faceX(ctx, right, 1, 9, 2, 1, k.dark(card, 0.25));
  faceX(ctx, right, 3, 1, 1, 2, k.dark(card, 0.22));
};
const terrorMouth = (k: Kit): Pt => k.iso(TERROR_BOX.x + TERROR_BOX.w / 2, TERROR_BOX.y + TERROR_BOX.d / 2, TERROR_BOX.h);

// A parte parada da sala de estar (vai junto com o cinema, em drawRoom). Do fundo para a frente.
export function drawLounge(k: Kit, ctx: Ctx, world: PersonaWorld, extras: StudioExtras) {
  if (extras.jackpot !== 'off') drawSlot(k, ctx);
  drawBookcase(k, ctx);
  if (extras.poker) drawTable(k, ctx);
  if (hasTerrorBox(world)) drawTerrorBox(k, ctx);
}

// O que se mexe na sala de estar, a cada quadro: o brilho do que pode ser
// tocado, as lâmpadas e a sirene da máquina, o brilho do livro e o portal
// dentro da caixa. glow = o que pode ser tocado agora; still = parado.
export function paintLounge(k: Kit, ctx: Ctx, world: PersonaWorld, extras: StudioExtras, tick: number, still: boolean, glow: ReadonlySet<SpotKind>) {
  const [w, h] = k.size;
  const soft = glowAlphas(tick, still, false);
  if (glow.has('book')) paintGlow(ctx, glowOf('book', w, h, (c) => drawBookcase(k, c)), 0, 0, GLOW_SOFT, soft);
  if (glow.has('poker') && extras.poker) paintGlow(ctx, glowOf('poker', w, h, (c) => drawTable(k, c)), 0, 0, GLOW_SOFT, soft);
  const terror = hasTerrorBox(world);
  if (glow.has('terror') && terror) paintGlow(ctx, glowOf('terror', w, h, (c) => drawTerrorBox(k, c)), 0, 0, GLOW_SOFT, soft);

  if (extras.jackpot !== 'off') {
    // a máquina: o brilho mais forte da sala, em ouro
    if (glow.has('jackpot')) paintGlow(ctx, glowOf('jackpot', w, h, (c) => drawSlot(k, c)), 0, 0, GLOW_GOLD, glowAlphas(tick, still, true));
    // as lâmpadas do letreiro correm (paradas: todas acesas)
    const sign = SLOT_SIGN(k);
    for (let i = 1, n = 0; i < 13; i += 2, n += 1) {
      const lit = still || (n + (tick >> 1)) % 3 !== 0;
      faceY(ctx, sign, i, 2, 1, 2, lit ? '#FFF3C4' : '#B8862B');
    }
    // a sirene do alto: acesa; piscando quando há algo esperando
    const top = k.iso(SLOT.x + SLOT.w / 2, SLOT.y + SLOT.d / 2, SLOT.h);
    const alert = extras.jackpot === 'alert';
    const lit = alert && !still ? (tick >> 2) % 2 === 0 : alert;
    if (lit) {
      k.px(ctx, top[0] - 2, top[1] - 1, '#FF8A8F', 4, 2);
      k.px(ctx, top[0] - 1, top[1] - 2, '#FFE3E4', 2, 1);
      ctx.fillStyle = 'rgba(255,90,96,0.24)';
      ctx.fillRect(top[0] - 5, top[1] - 5, 10, 8);
    }
    // uma bobina troca de cor de vez em quando, como máquina ligada
    if (!still) {
      const front = SLOT_FRONT(k);
      const reel = (tick >> 3) % 3;
      faceY(ctx, front, 2 + reel * 3, 7, 2, 3, ['#38BDF8', '#F472B6', GOLD][(tick >> 3) % 3]);
    }
  }

  // o livro pisca de leve, chamando
  if (!still && tick % 24 < 3) {
    const book = k.iso(BOOKCASE.x + 0.08, BOOKCASE.y + BOOKCASE.d - 0.1, BOOKCASE.h);
    k.px(ctx, Math.round(book[0]) + 6, Math.round(book[1]) - 9, '#FFFFFF', 1, 1);
    if (tick % 24 === 1) {
      k.px(ctx, Math.round(book[0]) + 5, Math.round(book[1]) - 9, '#FFF3C4', 3, 1);
      k.px(ctx, Math.round(book[0]) + 6, Math.round(book[1]) - 10, '#FFF3C4', 1, 3);
    }
  }

  // o portal do Clube do Terror, dentro da caixa: uma espiral à luz de vela
  if (terror) {
    const mouth = terrorMouth(k);
    const turn = still ? 0 : tick >> 1;
    ctx.fillStyle = 'rgba(255,181,71,0.2)';
    ctx.fillRect(mouth[0] - 5, mouth[1] - 8, 11, 9);
    disc(ctx, mouth[0], mouth[1] - 1, 4, 2, '#8E1B2B');
    const arms: Pt[] = [
      [-3, -1],
      [-1, -2],
      [2, -2],
      [3, 0],
      [1, 1],
      [-2, 1],
    ];
    arms.forEach(([dx, dy], i) => k.px(ctx, mouth[0] + dx, mouth[1] - 1 + dy, (i + turn) % 3 === 0 ? '#FFF3C4' : '#FFB547', 1, 1));
    k.px(ctx, mouth[0], mouth[1] - 1, '#FFF3C4', 1, 1);
    // as brasas que sobem
    if (!still) {
      const rise = tick % 8;
      k.px(ctx, mouth[0] - 2 + (tick % 3), mouth[1] - 4 - rise, 'rgba(255,181,71,0.85)', 1, 1);
      k.px(ctx, mouth[0] + 2 - (tick % 2), mouth[1] - 3 - ((rise + 4) % 8), 'rgba(255,243,196,0.7)', 1, 1);
    }
  }
}

// ---------- os retângulos clicáveis ----------
const rectOf = (k: Kit, x: number, y: number, w: number, d: number, h: number, pad = 1): Omit<Spot, 'kind'> => {
  const left = k.iso(x, y + d)[0];
  const right = k.iso(x + w, y)[0];
  const top = k.iso(x, y, h)[1];
  const bottom = k.iso(x + w, y + d, 0)[1];
  return { x: Math.floor(left) - pad, y: Math.floor(top) - pad, w: Math.ceil(right - left) + pad * 2, h: Math.ceil(bottom - top) + pad * 2 };
};

// Os objetos da sala de estar que levam a algum lugar, com o retângulo de cada um.
export function loungeSpots(k: Kit, world: PersonaWorld, extras: StudioExtras): Spot[] {
  const spots: Spot[] = [];
  if (extras.jackpot !== 'off') spots.push({ kind: 'jackpot', ...rectOf(k, SLOT.x, SLOT.y, SLOT.w, SLOT.d, SLOT.h + 1, 2) });
  spots.push({ kind: 'book', ...rectOf(k, BOOKCASE.x, BOOKCASE.y, BOOKCASE.w, BOOKCASE.d, BOOKCASE.h + 9) });
  if (extras.poker) spots.push({ kind: 'poker', ...rectOf(k, TABLE.x - TABLE.r, TABLE.y - TABLE.r, TABLE.r * 2, TABLE.r * 2, TABLE.h + 2, 0) });
  if (hasTerrorBox(world)) spots.push({ kind: 'terror', ...rectOf(k, TERROR_BOX.x, TERROR_BOX.y, TERROR_BOX.w + 0.3, TERROR_BOX.d + 0.3, TERROR_BOX.h + 8) });
  return spots;
}
