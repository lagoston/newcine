import { PET_ORACLE, type PersonaWorld, type PetId, type WorldState } from '../../lib/personaWorld';
import { GLOW_GOLD, GLOW_SOFT, glowAlphas, glowOf, paintGlow, silhouette } from './glow';

// O estúdio (14/11/2026): os objetos da sala, os lugares do chão e os bichinhos.
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
// Saíram o aquário, a abóbora, o amuleto do beta, a árvore de Natal e as
// marcas de fita no chão; a caixa perdeu o "TERROR" escrito em fita; a máquina
// do Jackpot cresceu e ganhou o brilho mais forte; tudo o que pode ser tocado
// brilha (glow.ts).
//
// 15/11/2026 (tarde), três pedidos do Bruno:
//   • "Antes você tinha deixado espaço para novos itens chegarem, né? Eu quero
//     que você volte esses espaços e deixe o usuário posicionar os itens que
//     ele já tem." O chão voltou a ter lugares marcados com fita (PLACES), e
//     cada objeto mora num lugar. A pessoa escolhe qual (o arranjo fica
//     guardado em world.layout); o que ela não mexeu fica no lugar de costume.
//     O projetor, o abajur e o tapete são do cinema e não saem do lugar.
//   • "As tags de 200 filmes dos três oráculos […] devem desbloquear um
//     animalzinho de estimação para o estúdio. O sapo vai liberar um sapinho
//     de pixel que vai ficar pulando ao redor do estúdio. A raposa vai liberar
//     uma raposinha com a caminha dela. E a cobra vai liberar aquele aquário
//     que a gente tinha excluído. Agora […] vai ter a cobra dentro dele."
//     A caminha e o aquário são objetos como os outros (têm lugar); o sapo
//     anda solto, pulando pelos lugares vazios e pela frente da sala.
//   • Os móveis chegam com o nível do estúdio (lib/personaWorld.ts), não mais
//     com a bitola; entraram a planta (nível 6) e a cadeira de diretor (8).
//
// Como a pessoa pode pôr qualquer objeto em qualquer lugar, nada aqui tem
// posição fixa: cada desenho recebe o canto de trás do seu lugar (x, y) e a
// ordem de pintura sai da profundidade (x + y do meio do lugar; o que está
// mais para a frente é pintado depois). O que se mexe por cima de um objeto
// (as luzes da máquina, o portal, a raposa, a cobra, o sapo) é pintado a cada
// quadro; se houver outro objeto na frente, ele é pintado de novo por cima,
// só naquele pedaço (redrawFront).
//
// 17/11/2026, três pedidos do Bruno:
//   • "Adicione um inventário quando clicamos em arrumar estúdio, para que seja
//     possível revisar os itens que temos, trocá-los e inseri-los." Um objeto
//     pode ficar guardado (world.stored): fora da sala, no inventário. A
//     máquina do Jackpot e a estante do guia não se guardam (são as portas de
//     sempre: a coisa mais importante da sala e o guia de quem chega).
//   • "Adicione uma opção para poder girar os objetos do estúdio também." Um
//     objeto girado (world.turn) troca a largura pela profundidade e é desenhado
//     espelhado em volta do meio do seu lugar: em isométrico, espelhar na
//     horizontal é o mesmo que trocar os eixos x e y, ou seja, virar o objeto de
//     frente para a outra parede (as faces que se veem continuam as mesmas, só
//     trocam de lado). São dois sentidos; as costas dos objetos nunca aparecem.
//   • "O item poltrona está bugado, com o braço direito dela passando por trás
//     das costas do móvel." O braço do fundo era pintado depois do encosto e
//     saía 0,08 ladrilho para fora da base; agora os braços ficam rentes à base
//     e o encosto, que está na frente deles, é pintado por último.
//
// Aqui só mora o desenho, a posição e o retângulo de cada coisa. O que cada
// uma abre é assunto de useStudioDoors.

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

// Tudo o que pode ser tocado na cena. As quatro primeiras são objetos (aqui);
// as outras são do cinema (draw.ts).
export type SpotKind = 'jackpot' | 'poker' | 'book' | 'terror' | 'posters' | 'screen' | 'moth' | 'shelves';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Spot extends Rect {
  kind: SpotKind;
}

const GOLD = '#F4C454';
const PAPER = '#F3EAD3';
const MIST = '#BDB4D6';
const EDGE = '#150E26';

// ---------------------------------------------------------------------------
// Os lugares
// ---------------------------------------------------------------------------
// Onde um objeto pode ficar, em ladrilhos (x ao longo da parede da direita, y
// ao longo da parede da esquerda; o canto do fundo é 0, 0). Cada lugar é um
// quadrado de PLACE_SIZE de lado, marcado no chão com fita quando está vazio,
// como as marcas de um set de filmagem.
//
// A sala tem 9 × 6 ladrilhos. Ficam livres de lugares: a frente da tela e da
// estante das latas (para nada tapar a capa do filme nem as latas), o facho
// do projetor e a beirada da frente (por onde o sapo passeia). Na fileira do
// fundo (wall) o objeto encosta na parede. O último lugar da direita fica um
// pouco para dentro: num celular de 320 px a cena de 2× perde 10 pixels de
// cada lado.
export interface Place {
  x: number;
  y: number;
  wall?: boolean;
}
export const PLACE_SIZE = 1.3;
export const PLACES: Place[] = [
  { x: 5.0, y: 0.8, wall: true },
  { x: 6.4, y: 0.8, wall: true },
  { x: 7.75, y: 0.8, wall: true },
  { x: 5.0, y: 2.2 },
  { x: 6.4, y: 2.2 },
  { x: 7.75, y: 2.2 },
  { x: 2.25, y: 3.6 },
  { x: 6.4, y: 3.6 },
  { x: 7.75, y: 3.6 },
  { x: 2.25, y: 5.0 },
  { x: 5.0, y: 5.0 },
  { x: 6.4, y: 5.0 },
  { x: 7.75, y: 5.0 },
];
// o quadrado de fita que marca um lugar vazio
const MARK_SIZE = 1.0;
// quanto o objeto fica afastado da parede, na fileira do fundo
const WALL_GAP = 0.12;

// Os objetos que têm lugar (a pessoa pode mudar) e os dois fixos do cinema.
export type ItemId = 'slot' | 'book' | 'table' | 'terror' | 'archive' | 'armchair' | 'popcorn' | 'plant' | 'chair' | 'fox' | 'tank';
type SolidId = ItemId | 'projector' | 'lamp';

// O que os desenhos precisam saber de quem é o estúdio.
export interface ItemEnv {
  world: PersonaWorld;
  st: WorldState;
  extras: StudioExtras;
  // as três cores da sala (as do trio; antes da Persona, lilases)
  tints: [string, string, string];
}

type Draw = (k: Kit, ctx: Ctx, x: number, y: number, env: ItemEnv) => void;
type Paint = (k: Kit, ctx: Ctx, x: number, y: number, env: ItemEnv, tick: number, still: boolean) => void;

interface ItemDef {
  id: SolidId;
  // o chão que o objeto ocupa (ladrilhos) e a altura dele (pixels)
  w: number;
  d: number;
  h: number;
  // o lugar de costume (o número em PLACES); os fixos têm a posição do canto de trás
  home?: number;
  fixed?: { x: number; y: number };
  owned: (env: ItemEnv) => boolean;
  draw: Draw;
  // o que se mexe, por cima do desenho parado
  paint?: Paint;
  // o que ele abre (useStudioDoors)
  spot?: SpotKind;
  // a folga do retângulo de toque
  pad?: number;
}

// A caixa do Clube do Terror aparece para quem tem a Deadly Sleeping (qualquer edição).
export const hasTerrorBox = (world: PersonaWorld): boolean => world.tags.some((tag) => /^deadly-sleeping(-[0-9]+)?$/.test(tag.id));
export const hasPet = (world: PersonaWorld, pet: PetId): boolean => world.pets[pet] !== null;

// ---------------------------------------------------------------------------
// As ferramentas de desenho
// ---------------------------------------------------------------------------
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
// Um desenho pequeno, linha a linha: cada letra é uma cor da paleta e o ponto
// é vazio. flip = espelhado (virado para o outro lado).
const sprite = (ctx: Ctx, x: number, y: number, rows: string[], palette: Record<string, string>, flip = false) => {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      const color = palette[row[rx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x0 + (flip ? row.length - 1 - rx : rx), y0 + ry, 1, 1);
    }
  });
};

// ---------------------------------------------------------------------------
// Os objetos
// ---------------------------------------------------------------------------

// ----- A máquina do Jackpot: a base, o corpo com a janela das três bobinas, o
// letreiro dourado com lâmpadas, a sirene no alto e a alavanca do lado.
const SLOT = { w: 1.1, d: 0.9, h: 36 };
const slotFront = (k: Kit, x: number, y: number): Pt => k.iso(x + 0.04, y + SLOT.d - 0.04, 11);
const slotSign = (k: Kit, x: number, y: number): Pt => k.iso(x, y + SLOT.d, 26);
const drawSlot: Draw = (k, ctx, x, y) => {
  const { w, d } = SLOT;
  k.box(ctx, x, y, 0, w, d, 11, '#1F2A72');
  k.box(ctx, x + 0.04, y + 0.04, 11, w - 0.08, d - 0.08, 15, '#2B3A9A');
  k.box(ctx, x, y, 26, w, d, 6, GOLD);
  k.box(ctx, x + 0.34, y + 0.26, 32, w - 0.68, d - 0.52, 4, '#C2333A');
  // a frente do corpo: a janela, as três bobinas e o friso
  const front = slotFront(k, x, y);
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
  // o letreiro: uma fileira de lâmpadas (acendem em paintSlot)
  const sign = slotSign(k, x, y);
  for (let i = 1; i < 13; i += 2) faceY(ctx, sign, i, 2, 1, 2, '#B8862B');
  // a alavanca, do lado
  const side = k.iso(x + w, y + 0.36, 15);
  k.px(ctx, side[0] + 1, side[1] - 10, '#BDB4D6', 1, 11);
  k.px(ctx, side[0], side[1] - 13, '#E5484D', 3, 3);
  k.px(ctx, side[0], side[1] - 13, '#FF9DA0', 1, 1);
};
const paintSlot: Paint = (k, ctx, x, y, env, tick, still) => {
  // as lâmpadas do letreiro correm (paradas: todas acesas)
  const sign = slotSign(k, x, y);
  for (let i = 1, n = 0; i < 13; i += 2, n += 1) {
    const lit = still || (n + (tick >> 1)) % 3 !== 0;
    faceY(ctx, sign, i, 2, 1, 2, lit ? '#FFF3C4' : '#B8862B');
  }
  // a sirene do alto: acesa; piscando quando há algo esperando
  const top = k.iso(x + SLOT.w / 2, y + SLOT.d / 2, SLOT.h);
  const alert = env.extras.jackpot === 'alert';
  const lit = alert && !still ? (tick >> 2) % 2 === 0 : alert;
  if (lit) {
    k.px(ctx, top[0] - 2, top[1] - 1, '#FF8A8F', 4, 2);
    k.px(ctx, top[0] - 1, top[1] - 2, '#FFE3E4', 2, 1);
    ctx.fillStyle = 'rgba(255,90,96,0.24)';
    ctx.fillRect(top[0] - 5, top[1] - 5, 10, 8);
  }
  // uma bobina troca de cor de vez em quando, como máquina ligada
  if (!still) {
    const front = slotFront(k, x, y);
    const reel = (tick >> 3) % 3;
    faceY(ctx, front, 2 + reel * 3, 7, 2, 3, ['#38BDF8', '#F472B6', GOLD][(tick >> 3) % 3]);
  }
};

// ----- A estante do guia: uma estante baixa de madeira e, em cima, o livro grande.
const BOOKCASE = { w: 0.74, d: 0.44, h: 19 };
const drawBookcase: Draw = (k, ctx, x, y) => {
  const { w, d, h } = BOOKCASE;
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
// o livro pisca de leve, chamando
const paintBookcase: Paint = (k, ctx, x, y, _env, tick, still) => {
  if (still || tick % 24 >= 3) return;
  const book = k.iso(x + 0.08, y + BOOKCASE.d - 0.1, BOOKCASE.h);
  k.px(ctx, Math.round(book[0]) + 6, Math.round(book[1]) - 9, '#FFFFFF', 1, 1);
  if (tick % 24 === 1) {
    k.px(ctx, Math.round(book[0]) + 5, Math.round(book[1]) - 9, '#FFF3C4', 3, 1);
    k.px(ctx, Math.round(book[0]) + 6, Math.round(book[1]) - 10, '#FFF3C4', 1, 3);
  }
};

// ----- A mesa de pôquer: o pé, o aro de madeira e o feltro com as cartas e as
// fichas. Um pouco menor desde 15/11/2026 (o raio era 0,92), para caber num lugar.
const TABLE = { r: 0.78, h: 7 };
const drawTable: Draw = (k, ctx, x, y) => {
  const { r, h } = TABLE;
  const cx = x + r;
  const cy = y + r;
  k.box(ctx, cx - 0.22, cy - 0.22, 0, 0.44, 0.44, h - 1, '#3A2216');
  const c = k.iso(cx, cy, h);
  const a = r * 12 * Math.SQRT2;
  const b = r * 6 * Math.SQRT2;
  disc(ctx, c[0], c[1] + 2, a, b, '#3F2414');
  disc(ctx, c[0], c[1], a, b, '#8A5630');
  disc(ctx, c[0], c[1], a - 2, b - 1, '#17623E');
  disc(ctx, c[0], c[1] - 1, a - 4, b - 2, '#1F7A4D');
  // duas cartas e três pilhas de fichas
  k.px(ctx, c[0] - 5, c[1] - 2, PAPER, 3, 2);
  k.px(ctx, c[0] - 1, c[1] - 3, PAPER, 3, 2);
  k.px(ctx, c[0] - 4, c[1] - 2, '#E5484D', 1, 1);
  k.px(ctx, c[0], c[1] - 3, EDGE, 1, 1);
  k.px(ctx, c[0] + 4, c[1], '#3B82F6', 2, 2);
  k.px(ctx, c[0] + 7, c[1] - 1, GOLD, 2, 2);
  k.px(ctx, c[0] - 8, c[1] + 1, '#E5484D', 2, 2);
};

// ----- A caixa velha de papelão do Clube do Terror: abas abertas, amassada,
// com uma tira de fita adesiva fechando a quina (sem nada escrito: o nome
// aparece na etiqueta, ao passar o mouse ou o foco). O portal gira dentro dela.
const TERROR_BOX = { w: 1, d: 1, h: 11 };
const drawTerrorBox: Draw = (k, ctx, x, y) => {
  const { w, d, h } = TERROR_BOX;
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
// o portal do Clube do Terror, dentro da caixa: uma espiral à luz de vela
const paintTerrorBox: Paint = (k, ctx, x, y, _env, tick, still) => {
  const mouth = k.iso(x + TERROR_BOX.w / 2, y + TERROR_BOX.d / 2, TERROR_BOX.h);
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
};

// ----- O Arquivo: os títulos de fora das prateleiras (fichas creme numa caixa).
const drawArchive: Draw = (k, ctx, x, y, env) => {
  k.box(ctx, x, y, 0, 0.8, 0.8, 7, '#6B5B4A');
  const ap = k.iso(x + 0.4, y + 0.4, 7);
  const cards = env.st.out || (env.world.preview ? 9 : 0);
  for (let a = 0; a < Math.min(cards, 9); a += 1) k.px(ctx, ap[0] - 4 + (a % 3) * 3, ap[1] - 3 - Math.floor(a / 3) * 2, PAPER, 2, 1);
};

// ----- A poltrona (nível 2), virada para a tela. De trás para a frente: a
// base, o braço do fundo, o assento, o braço da frente e, por último, o
// encosto (17/11/2026: antes o braço do fundo vinha depois do encosto e passava
// por cima dele, e os dois braços saíam um pouco para fora da base).
const drawArmchair: Draw = (k, ctx, x, y, env) => {
  const vel = k.mix(env.tints[1], '#3A1D4F', 0.45);
  const arm = k.dark(vel, 0.15);
  k.box(ctx, x, y, 0, 1.2, 1.3, 5, vel);
  k.box(ctx, x, y, 5, 0.9, 0.24, 4, arm);
  k.box(ctx, x + 0.04, y + 0.26, 5, 0.86, 0.78, 1, k.light(vel, 0.18));
  k.box(ctx, x, y + 1.06, 5, 0.9, 0.24, 4, arm);
  k.box(ctx, x + 0.9, y, 5, 0.3, 1.3, 10, vel);
};

// ----- A pipoqueira (nível 5).
const drawPopcorn: Draw = (k, ctx, x, y) => {
  k.box(ctx, x, y, 0, 0.8, 0.8, 9, '#B3202E');
  k.box(ctx, x + 0.05, y + 0.05, 9, 0.7, 0.7, 7, '#F6E7A8');
  const pp = k.iso(x + 0.4, y + 0.4, 16);
  k.px(ctx, pp[0] - 5, pp[1] - 1, PAPER, 10, 1);
  k.px(ctx, pp[0] - 2, pp[1] + 3, GOLD, 2, 2);
  k.px(ctx, pp[0] + 1, pp[1] + 4, GOLD, 2, 2);
};

// ----- A planta (nível 6): uma costela-de-adão num vaso de barro.
const PLANT_LEAVES = [
  '.....DGG.....',
  '...DGGgGG....',
  '..GGGgGGG.DG.',
  '.DGgGG.GGGGgG',
  'GGGG.G.G.GgGG',
  'GgGG..S..GGG.',
  '.GG.DGSG..G..',
  '...GGgSGG....',
  '...GG.S.G....',
  '......S......',
];
const drawPlant: Draw = (k, ctx, x, y) => {
  const pot = '#B4623A';
  k.box(ctx, x + 0.1, y + 0.1, 0, 0.5, 0.5, 6, pot);
  const top = k.iso(x + 0.35, y + 0.35, 6);
  k.px(ctx, top[0] - 3, top[1] - 1, '#3B2416', 6, 2);
  sprite(ctx, top[0] - 6, top[1] - 10, PLANT_LEAVES, { G: '#3FA560', g: '#7BD08A', D: '#236B40', S: '#2B7C49' });
};

// ----- A cadeira de diretor (nível 8): pernas cruzadas de madeira e lona,
// de costas para a sala, virada para a tela.
const CHAIR = [
  'W.......W',
  'WCCCCCCCW',
  'WCCcCcCCW',
  'W.......W',
  'W.......W',
  'SSSSSSSSS',
  'sSSSSSSSs',
  '.Ww...wW.',
  '..Ww.wW..',
  '...WwW...',
  '..Ww.wW..',
  '.Ww...wW.',
  'WW.....WW',
];
const drawChair: Draw = (k, ctx, x, y, env) => {
  const cloth = k.mix(env.tints[0], '#C2333A', 0.6);
  const foot = k.iso(x + 0.4, y + 0.4, 0);
  ctx.fillStyle = 'rgba(8,5,18,0.35)';
  ctx.fillRect(foot[0] - 5, foot[1] - 1, 10, 2);
  sprite(ctx, foot[0] - 4, foot[1] - 13, CHAIR, { W: '#C99B62', w: '#8A6238', C: cloth, c: k.light(cloth, 0.35), S: k.dark(cloth, 0.12), s: k.dark(cloth, 0.3) });
};

// ----- O projetor (nível 1, fixo): chega quando a Persona nasce.
const drawProjector: Draw = (k, ctx, x, y) => {
  k.box(ctx, x + 0.15, y + 0.1, 0, 0.6, 0.6, 12, '#3B3054');
  k.box(ctx, x, y, 12, 0.9, 0.8, 5, '#8D86A8');
  const pr = k.iso(x + 0.45, y + 0.4, 17);
  ctx.fillStyle = '#2A2140';
  ctx.fillRect(pr[0] - 6, pr[1] - 7, 6, 6);
  ctx.fillRect(pr[0] + 1, pr[1] - 5, 5, 5);
  k.px(ctx, pr[0] - 4, pr[1] - 5, MIST, 2, 2);
  k.px(ctx, pr[0] + 3, pr[1] - 3, MIST, 1, 1);
};

// ----- O abajur (nível 4, fixo no canto).
const drawLamp: Draw = (k, ctx, x, y) => {
  k.box(ctx, x, y, 0, 0.3, 0.3, 2, '#4A3B63');
  const lp = k.iso(x + 0.15, y + 0.15, 2);
  k.px(ctx, lp[0], lp[1] - 20, '#6F5E8E', 1, 20);
  k.poly(
    ctx,
    [
      [lp[0] - 4, lp[1] - 20],
      [lp[0] + 5, lp[1] - 20],
      [lp[0] + 3, lp[1] - 27],
      [lp[0] - 2, lp[1] - 27],
    ],
    GOLD,
  );
  ctx.fillStyle = 'rgba(244,196,84,0.10)';
  ctx.fillRect(lp[0] - 9, lp[1] - 24, 19, 26);
};

// ---------------------------------------------------------------------------
// Os bichinhos
// ---------------------------------------------------------------------------
// São versões pequenas dos três oráculos do site: o Sapo Bogart (verde, de
// olhos castanhos), o Raposo Fincher (ruivo, de focinho branco) e a Cobra
// Cypher (cáqui, de boina salmão e olho amarelo).

// ----- A raposa, dormindo enrolada na caminha. Ela respira; de tempos em
// tempos levanta a cabeça, olha em volta, mexe a orelha e volta a dormir.
const FOX = { w: 1.2, d: 1.2, h: 9 };
const FOX_COLORS = { O: '#E8742C', o: '#B8501A', W: '#FBF1E0', K: '#2A1A14', A: '#F4C454' };
// dormindo enrolada: a cabeça à direita, de olho fechado, e o rabo dando a
// volta pela frente até a ponta branca, embaixo do queixo (soltando o ar e puxando o ar)
const FOX_SLEEP = [
  ['..........K..K..', '..........OO.OO.', '...OOOOO.OOOOOOO', '.OOOOOOOOOOOKKOO', 'OOOOOOoOOOOOWWKW', 'OOOOOooOOOOWWWW.', 'OoooooooWWWWW...', '.oooooooWWW.....'],
  ['..........K..K..', '...OOOO...OO.OO.', '..OOOOOO.OOOOOOO', '.OOOOOOOOOOOKKOO', 'OOOOOOoOOOOOWWKW', 'OOOOOooOOOOWWWW.', 'OoooooooWWWWW...', '.oooooooWWW.....'],
];
// acordada: a cabeça erguida, o olho aberto (e piscando), a orelha mexendo
const FOX_AWAKE = [
  ['..........K..K..', '..........OO.OO.', '.........OOOOOOO', '.........OOAKOOO', '...OOOOO.OOOWWKW', '.OOOOOOOOOOWWWW.', 'OOOOOOoOOOOOO...', 'OOOOOooOOOOO....', 'OoooooooWWWW....', '.oooooooWWW.....'],
  ['.........K...K..', '..........OO.OO.', '.........OOOOOOO', '.........OOAKOOO', '...OOOOO.OOOWWKW', '.OOOOOOOOOOWWWW.', 'OOOOOOoOOOOOO...', 'OOOOOooOOOOO....', 'OoooooooWWWW....', '.oooooooWWW.....'],
  ['..........K..K..', '..........OO.OO.', '.........OOOOOOO', '.........OOKKOOO', '...OOOOO.OOOWWKW', '.OOOOOOOOOOWWWW.', 'OOOOOOoOOOOOO...', 'OOOOOooOOOOO....', 'OoooooooWWWW....', '.oooooooWWW.....'],
];
const FOX_CYCLE = 144;
// a caminha: um cesto de vime com a almofada azul (o desenho parado)
const drawFox: Draw = (k, ctx, x, y) => {
  const c = k.iso(x + FOX.w / 2, y + FOX.d / 2, 0);
  disc(ctx, c[0], c[1] + 1, 10, 5, '#3D2413');
  disc(ctx, c[0], c[1] - 1, 10, 5, '#8A5A32');
  disc(ctx, c[0], c[1] - 2, 10, 4.6, '#B07A45');
  disc(ctx, c[0], c[1] - 2, 8, 3.6, '#2F4A7A');
  disc(ctx, c[0] - 1, c[1] - 3, 6, 2.4, '#4266A0');
  for (let i = -8; i <= 8; i += 3) k.px(ctx, c[0] + i, c[1] + 3 - Math.round(Math.abs(i) / 4), '#5E3A1E', 1, 1);
};
// a raposa, por cima da caminha, a cada quadro
const paintFox: Paint = (k, ctx, x, y, _env, tick, still) => {
  const c = k.iso(x + FOX.w / 2, y + FOX.d / 2, 0);
  const t = still ? 0 : tick % FOX_CYCLE;
  const awake = !still && t >= 104 && t < 132;
  if (awake) {
    const blink = t === 116 || t === 117;
    const ear = t >= 108 && t < 112;
    sprite(ctx, c[0] - 8, c[1] - 13, FOX_AWAKE[blink ? 2 : ear ? 1 : 0], FOX_COLORS);
    // a ponta do rabo abana
    if ((t >> 1) % 2 === 0) k.px(ctx, c[0] + 4, c[1] - 6, FOX_COLORS.W, 1, 1);
    return;
  }
  sprite(ctx, c[0] - 8, c[1] - 11, FOX_SLEEP[still ? 0 : (tick >> 3) % 2], FOX_COLORS);
  if (still) return;
  // os "z" do sono, subindo
  const z = tick % 32;
  if (z < 20) {
    const zx = c[0] + 8 + (z >> 2);
    const zy = c[1] - 13 - (z >> 1);
    ctx.fillStyle = `rgba(243,234,211,${(1 - z * 0.04).toFixed(2)})`;
    ctx.fillRect(zx, zy, 3, 1);
    ctx.fillRect(zx + 1, zy + 1, 1, 1);
    ctx.fillRect(zx, zy + 2, 3, 1);
  }
};

// ----- O aquário da cobra: o móvel de madeira, o vidro, a areia, um galho e a
// planta. A cobra desliza de um lado para o outro, para, levanta a cabeça e
// põe a língua para fora.
const TANK = { w: 1.3, d: 0.75, h: 19 };
const GLASS = 12;
const SNAKE = { body: '#E0D56C', shade: '#A59C3C', belly: '#F4EEC2', eye: '#1B1410', beret: '#EE8F7C', tongue: '#F0506A' };
const SNAKE_CYCLE = 112;
// O que a cobra faz em cada quadro: desliza esticada para um lado, enrola-se
// no canto (ergue a cabeça e põe a língua para fora), desliza de volta.
// head = a coluna da cabeça na face da frente; dir = para que lado ela olha.
const snakePose = (tick: number, still: boolean): { coiled: boolean; head: number; dir: 1 | -1; t: number } => {
  if (still) return { coiled: true, head: 9, dir: 1, t: 0 };
  const t = tick % SNAKE_CYCLE;
  if (t < 28) return { coiled: false, head: 7 + Math.floor(t / 5), dir: 1, t };
  if (t < 56) return { coiled: true, head: 10, dir: t < 44 ? 1 : -1, t: t - 28 };
  if (t < 84) return { coiled: false, head: 7 - Math.floor((t - 56) / 5), dir: -1, t };
  return { coiled: true, head: 4, dir: t < 100 ? -1 : 1, t: t - 84 };
};
const drawTankAt = (k: Kit, ctx: Ctx, x: number, y: number, tick: number, still: boolean, whole: boolean) => {
  const { w, d } = TANK;
  if (whole) {
    k.box(ctx, x, y, 0, w, d, 7, '#4A3324');
    k.box(ctx, x + 0.02, y + 0.02, 7, w - 0.04, d - 0.04, GLASS, '#3A8B74');
    // a tampa de tela
    k.poly(ctx, [k.iso(x + 0.1, y + 0.1, 7 + GLASS), k.iso(x + w - 0.1, y + 0.1, 7 + GLASS), k.iso(x + w - 0.1, y + d - 0.1, 7 + GLASS), k.iso(x + 0.1, y + d - 0.1, 7 + GLASS)], '#1D2B2A');
    const side = k.iso(x + w - 0.02, y + 0.02, 7);
    const depth = Math.round((d - 0.04) * 12);
    faceX(ctx, side, 0, 0, depth, GLASS, '#1F4A40');
    faceX(ctx, side, 0, GLASS - 1, depth, 1, '#8FDCC8');
    faceX(ctx, side, 0, 0, depth, 2, '#BCA97E');
    faceX(ctx, side, 0, 0, 1, GLASS, '#241B30');
  }
  // a face da frente inteira, a cada quadro (apaga a cobra de antes)
  const front = k.iso(x + 0.02, y + d - 0.02, 7);
  const width = Math.round((w - 0.04) * 12);
  faceY(ctx, front, 0, 0, width, GLASS, '#2A6456');
  faceY(ctx, front, 0, 6, width, GLASS - 6, '#31725F');
  faceY(ctx, front, 0, 0, width, 2, '#E0CFA0');
  faceY(ctx, front, 4, 1, 2, 1, '#BCA97E');
  faceY(ctx, front, 9, 0, 3, 1, '#BCA97E');
  // a planta de cada canto
  faceY(ctx, front, 1, 2, 1, 6, '#2FA36B');
  faceY(ctx, front, 2, 2, 1, 4, '#4CC98A');
  faceY(ctx, front, width - 3, 2, 1, 7, '#2FA36B');
  faceY(ctx, front, width - 2, 2, 1, 5, '#4CC98A');
  // a cobra
  const pose = snakePose(tick, still);
  const seg = (u: number, v: number, dark: boolean) => {
    faceY(ctx, front, u, v, 1, 2, dark ? SNAKE.shade : SNAKE.body);
    faceY(ctx, front, u, v, 1, 1, SNAKE.belly);
  };
  // a cabeça com a boina e o olho (a coluna de trás e a da frente), a partir da altura v
  const head = (back: number, v: number) => {
    const fore = back + pose.dir;
    const left = Math.min(back, fore);
    faceY(ctx, front, left, v, 2, 3, SNAKE.body);
    faceY(ctx, front, left, v, 2, 1, SNAKE.belly);
    faceY(ctx, front, fore, v + 1, 1, 1, SNAKE.eye);
    faceY(ctx, front, left, v + 3, 2, 1, SNAKE.beret);
    faceY(ctx, front, back - pose.dir, v + 3, 1, 1, SNAKE.beret);
    faceY(ctx, front, back, v + 4, 1, 1, SNAKE.beret);
    return fore;
  };
  if (pose.coiled) {
    // enrolada: duas voltas, a cabeça por cima olhando para um lado
    const c = pose.head;
    for (let i = -3; i <= 3; i += 1) seg(c + i, 2, (i + 9) % 3 === 0);
    for (let i = -2; i <= 2; i += 1) seg(c + i, 4, (i + 9) % 3 === 1);
    const fore = head(c, 6);
    // a língua, de vez em quando
    if (!still && (pose.t % 9 === 4 || pose.t % 9 === 5)) faceY(ctx, front, fore + pose.dir, 6, 1, 1, SNAKE.tongue);
  } else {
    // esticada: o corpo ondula atrás da cabeça
    for (let i = 6; i >= 1; i -= 1) seg(pose.head - pose.dir * i, 2 + (Math.sin(i * 1.2 + pose.t * 0.9) > 0.1 ? 1 : 0), i % 3 === 0);
    faceY(ctx, front, pose.head, 2, 1, 2, SNAKE.body);
    head(pose.head, 3);
  }
  // o vidro: a borda de cima, os cantos e um reflexo
  faceY(ctx, front, 0, GLASS - 1, width, 1, '#A8EAD8');
  faceY(ctx, front, 0, 0, 1, GLASS, '#241B30');
  faceY(ctx, front, width - 1, 0, 1, GLASS, '#241B30');
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let i = 0; i < 4; i += 1) ctx.fillRect(Math.round(front[0]) + 4 + i, Math.round(front[1]) + ((4 + i) >> 1) - (GLASS - 1) + i, 1, 2);
};
const drawTank: Draw = (k, ctx, x, y) => drawTankAt(k, ctx, x, y, 0, true, true);
const paintTank: Paint = (k, ctx, x, y, _env, tick, still) => {
  if (!still) drawTankAt(k, ctx, x, y, tick, false, false);
};

// ---------------------------------------------------------------------------
// A lista dos objetos
// ---------------------------------------------------------------------------
// O nível sai do estágio da cena (nível + 1): o guia desenha a sala "como se"
// ela estivesse em outro nível trocando só o estágio.
const levelOf = (env: ItemEnv) => Math.max(0, env.st.stage - 1);
// Os lugares de costume foram escolhidos para a máquina do Jackpot ficar sempre
// à vista (os dois lugares diante dela começam vazios) e para a raposa, na
// frente da sala, não ficar atrás de nada.
const ITEMS: ItemDef[] = [
  { id: 'slot', ...SLOT, home: 1, owned: (env) => env.extras.jackpot !== 'off', draw: drawSlot, paint: paintSlot, spot: 'jackpot', pad: 2 },
  { id: 'book', w: BOOKCASE.w, d: BOOKCASE.d, h: BOOKCASE.h + 9, home: 2, owned: () => true, draw: drawBookcase, paint: paintBookcase, spot: 'book' },
  { id: 'table', w: TABLE.r * 2, d: TABLE.r * 2, h: TABLE.h + 2, home: 8, owned: (env) => env.extras.poker, draw: drawTable, spot: 'poker', pad: 0 },
  { id: 'terror', w: TERROR_BOX.w, d: TERROR_BOX.d, h: TERROR_BOX.h + 8, home: 11, owned: (env) => hasTerrorBox(env.world), draw: drawTerrorBox, paint: paintTerrorBox, spot: 'terror', pad: 3 },
  { id: 'archive', w: 0.8, d: 0.8, h: 10, home: 0, owned: (env) => env.st.out > 0 || Boolean(env.world.preview), draw: drawArchive },
  { id: 'armchair', w: 1.2, d: 1.3, h: 16, home: 6, owned: (env) => levelOf(env) >= 2, draw: drawArmchair },
  { id: 'popcorn', w: 0.8, d: 0.8, h: 18, home: 10, owned: (env) => levelOf(env) >= 5, draw: drawPopcorn },
  { id: 'plant', w: 0.7, d: 0.7, h: 17, home: 7, owned: (env) => levelOf(env) >= 6, draw: drawPlant, pad: 3 },
  { id: 'chair', w: 0.8, d: 0.8, h: 14, home: 9, owned: (env) => levelOf(env) >= 8, draw: drawChair },
  { id: 'fox', ...FOX, h: 14, home: 12, owned: (env) => hasPet(env.world, 'fox'), draw: drawFox, paint: paintFox, pad: 2 },
  { id: 'tank', ...TANK, h: TANK.h + 2, home: 3, owned: (env) => hasPet(env.world, 'snake'), draw: drawTank, paint: paintTank },
  { id: 'projector', w: 0.9, d: 0.8, h: 24, fixed: { x: 4.15, y: 2.8 }, owned: (env) => levelOf(env) >= 1, draw: drawProjector },
  { id: 'lamp', w: 0.3, d: 0.3, h: 29, fixed: { x: 0.35, y: 0.35 }, owned: (env) => levelOf(env) >= 4, draw: drawLamp, pad: 5 },
];
// os que a pessoa pode mudar de lugar, na ordem em que disputam um lugar
export const MOVABLE: ItemId[] = ITEMS.filter((item) => item.home !== undefined).map((item) => item.id as ItemId);
// os que podem ir para o inventário (a máquina do Jackpot e o guia ficam sempre na sala)
export const KEEP_IN_ROOM: ItemId[] = ['slot', 'book'];
export const canStore = (id: ItemId): boolean => !KEEP_IN_ROOM.includes(id);
// o lugar de costume de cada um
export const HOME: Record<ItemId, number> = Object.fromEntries(ITEMS.filter((item) => item.home !== undefined).map((item) => [item.id, item.home])) as Record<ItemId, number>;
// a lente do projetor (de onde sai o facho; draw.ts)
export const PROJECTOR_LENS: [number, number, number] = [4.15, 3.2, 15];

// ---------------------------------------------------------------------------
// O arranjo: que objeto está em que lugar
// ---------------------------------------------------------------------------
export interface Solid {
  id: SolidId;
  def: ItemDef;
  // o lugar (null = fixo)
  place: number | null;
  // girado (17/11/2026): a largura e a profundidade trocam e o desenho espelha
  turned: boolean;
  // o chão que ocupa na sala (já com o giro)
  fw: number;
  fd: number;
  // o canto de trás
  x: number;
  y: number;
  // quanto mais para a frente, maior
  depth: number;
  // a caixa do desenho na cena
  rect: Rect;
}
export interface StudioLayout {
  // tudo o que está na sala, de trás para a frente
  solids: Solid[];
  // o lugar de cada objeto que tem lugar
  at: Partial<Record<ItemId, number>>;
  // os objetos de lugar que a pessoa tem (na sala ou guardados), na ordem de ITEMS
  owned: ItemId[];
  // os guardados no inventário
  stored: ItemId[];
  // os lugares vazios
  empty: number[];
  // o que identifica este arranjo (para guardar brilhos e rotas)
  key: string;
  env: ItemEnv;
}

const rectOf = (k: Kit, x: number, y: number, w: number, d: number, h: number, pad = 1): Rect => {
  const left = k.iso(x, y + d)[0];
  const right = k.iso(x + w, y)[0];
  const top = k.iso(x, y, h)[1];
  const bottom = k.iso(x + w, y + d, 0)[1];
  return { x: Math.floor(left) - pad, y: Math.floor(top) - pad, w: Math.ceil(right - left) + pad * 2, h: Math.ceil(bottom - top) + pad * 2 };
};
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Os lugares de cada objeto: primeiro o que a pessoa escolheu (se o lugar
// existe e ninguém pegou antes), depois o de costume; se o de costume está
// ocupado por outro que ela pôs ali, o lugar vazio mais perto dele.
export function resolvePlaces(all: ItemId[], saved: Record<string, number>, stored: readonly string[] = []): Partial<Record<ItemId, number>> {
  const at: Partial<Record<ItemId, number>> = {};
  const taken = new Set<number>();
  // os guardados (17/11/2026) não ocupam lugar
  const owned = all.filter((id) => !(stored.includes(id) && canStore(id)));
  owned.forEach((id) => {
    const place = saved[id];
    if (place === undefined || place >= PLACES.length || taken.has(place)) return;
    at[id] = place;
    taken.add(place);
  });
  owned.forEach((id) => {
    if (at[id] !== undefined) return;
    const home = PLACES[HOME[id]];
    const order = PLACES.map((place, index) => ({ index, far: Math.hypot(place.x - home.x, place.y - home.y) })).sort((a, b) => a.far - b.far || a.index - b.index);
    const free = order.find((option) => !taken.has(option.index));
    if (!free) return;
    at[id] = free.index;
    taken.add(free.index);
  });
  return at;
}

const layouts = new WeakMap<PersonaWorld, Map<string, StudioLayout>>();
const DEFAULT_TINTS: [string, string, string] = ['#6B5FA0', '#5A5390', '#8B7FC0'];

// O arranjo do estúdio de alguém, como quem olha vê (a máquina e a mesa dependem de quem olha).
export function studioLayout(k: Kit, world: PersonaWorld, st: WorldState, extras: StudioExtras): StudioLayout {
  const tints: [string, string, string] = st.hasTrio ? [k.moodColor(st.trio[0]), k.moodColor(st.trio[1]), k.moodColor(st.trio[2])] : DEFAULT_TINTS;
  const variant = `${st.stage}|${st.out > 0 || world.preview ? 1 : 0}|${extras.jackpot}|${extras.poker ? 1 : 0}|${tints.join('')}`;
  let byVariant = layouts.get(world);
  if (!byVariant) {
    byVariant = new Map();
    layouts.set(world, byVariant);
  }
  const hit = byVariant.get(variant);
  if (hit) return hit;

  const env: ItemEnv = { world, st, extras, tints };
  const owned = ITEMS.filter((item) => item.owned(env));
  const movable = owned.filter((item) => item.home !== undefined).map((item) => item.id as ItemId);
  const stored = movable.filter((id) => world.stored.includes(id) && canStore(id));
  const at = resolvePlaces(movable, world.layout, stored);
  const solids: Solid[] = [];
  owned.forEach((def) => {
    let place: number | null = null;
    let x: number;
    let y: number;
    let depth: number;
    let turned = false;
    let fw = def.w;
    let fd = def.d;
    if (def.fixed) {
      x = def.fixed.x;
      y = def.fixed.y;
      depth = x + def.w / 2 + y + def.d / 2;
    } else {
      const index = at[def.id as ItemId];
      if (index === undefined) return;
      place = index;
      turned = (world.turn[def.id] ?? 0) % 2 === 1;
      if (turned) {
        fw = def.d;
        fd = def.w;
      }
      const spot = PLACES[index];
      x = spot.x - fw / 2;
      y = spot.wall ? WALL_GAP : spot.y - fd / 2;
      depth = spot.x + spot.y;
    }
    solids.push({ id: def.id, def, place, turned, fw, fd, x, y, depth, rect: rectOf(k, x, y, fw, fd, def.h, def.pad ?? 1) });
  });
  solids.sort((a, b) => a.depth - b.depth || a.y - b.y);
  const taken = new Set(Object.values(at));
  const layout: StudioLayout = {
    solids,
    at,
    owned: movable,
    stored,
    empty: PLACES.map((_, index) => index).filter((index) => !taken.has(index)),
    key: `${variant}|${solids.map((solid) => `${solid.id}${solid.place ?? 'f'}${solid.turned ? 't' : ''}`).join(',')}|${hasPet(world, 'frog') ? 'frog' : ''}`,
    env,
  };
  byVariant.set(variant, layout);
  return layout;
}

// ---------------------------------------------------------------------------
// O desenho parado (vai junto com a sala, em drawRoom)
// ---------------------------------------------------------------------------
const placeCorners = (k: Kit, place: Place): [Pt, Pt, Pt, Pt] => {
  const half = PLACE_SIZE / 2;
  return [k.iso(place.x - half, place.y - half), k.iso(place.x + half, place.y - half), k.iso(place.x + half, place.y + half), k.iso(place.x - half, place.y + half)];
};
// As marcas de fita de um lugar: o contorno do quadrado, tracejado (dois
// pixels de fita, dois de chão), com os quatro cantos inteiros. A marca é
// menor que o lugar, para as de dois lugares vizinhos não se juntarem.
const tapeMarks = (k: Kit, ctx: Ctx, place: Place, color: string) => {
  const half = MARK_SIZE / 2;
  const corners: Pt[] = [k.iso(place.x - half, place.y - half), k.iso(place.x + half, place.y - half), k.iso(place.x + half, place.y + half), k.iso(place.x - half, place.y + half)];
  ctx.fillStyle = color;
  corners.forEach((from, index) => {
    const to = corners[(index + 1) % 4];
    const steps = Math.round(Math.abs(to[0] - from[0]));
    for (let i = 0; i <= steps; i += 1) {
      // os cantos (3 pixels de cada ponta) ficam inteiros; no meio, tracejado
      if (i > 2 && i < steps - 2 && i % 4 >= 2) continue;
      ctx.fillRect(Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps), 1, 1);
    }
  });
};

// O desenho de um objeto no lugar dele. Girado, o desenho de sempre é feito
// com o chão de sempre centrado no mesmo ponto e espelhado em volta da coluna
// de pixels do meio do lugar: em isométrico, (cx + u, cy + v) → (cx + v, cy + u)
// é exatamente o espelho horizontal em volta de iso(cx, cy). O eixo vai
// arredondado ao meio pixel para os pixels continuarem inteiros.
const withTurn = (k: Kit, ctx: Ctx, solid: Solid, run: (x: number, y: number) => void) => {
  if (!solid.turned) {
    run(solid.x, solid.y);
    return;
  }
  const cx = solid.x + solid.fw / 2;
  const cy = solid.y + solid.fd / 2;
  const axis = Math.round(k.iso(cx, cy)[0] * 2);
  ctx.save();
  ctx.translate(axis, 0);
  ctx.scale(-1, 1);
  run(cx - solid.def.w / 2, cy - solid.def.d / 2);
  ctx.restore();
};
const drawSolid = (k: Kit, ctx: Ctx, solid: Solid, env: ItemEnv) => withTurn(k, ctx, solid, (x, y) => solid.def.draw(k, ctx, x, y, env));
const paintSolid = (k: Kit, ctx: Ctx, solid: Solid, env: ItemEnv, tick: number, still: boolean) =>
  withTurn(k, ctx, solid, (x, y) => solid.def.paint?.(k, ctx, x, y, env, tick, still));

// Quando a pessoa está arrumando o estúdio: o objeto que ela pegou.
export interface Arranging {
  picked: ItemId | null;
  // 17/11/2026: há um objeto do inventário na mão (fora da sala)
  carrying?: boolean;
}

// O chão dos lugares e os objetos, de trás para a frente. Arrumando, todos os
// lugares acendem: os vazios em ouro (é para onde o objeto pode ir) e os
// ocupados em luz clara (tocar num troca os dois de lugar).
export function drawLounge(k: Kit, ctx: Ctx, layout: StudioLayout, arranging: Arranging | null = null) {
  PLACES.forEach((place, index) => {
    const free = layout.empty.includes(index);
    if (!arranging) {
      if (free) tapeMarks(k, ctx, place, 'rgba(243,234,211,0.2)');
      return;
    }
    const mine = arranging.picked !== null && layout.at[arranging.picked] === index;
    const [a, b, c, d] = placeCorners(k, place);
    const holding = arranging.picked !== null || Boolean(arranging.carrying);
    k.poly(ctx, [a, b, c, d], mine ? 'rgba(244,196,84,0.3)' : free ? (holding ? 'rgba(244,196,84,0.2)' : 'rgba(243,234,211,0.1)') : 'rgba(243,234,211,0.07)');
    tapeMarks(k, ctx, place, free || mine ? GOLD : 'rgba(243,234,211,0.6)');
  });
  layout.solids.forEach((solid) => drawSolid(k, ctx, solid, layout.env));
}

// ---------------------------------------------------------------------------
// O que se mexe, a cada quadro
// ---------------------------------------------------------------------------
// Pinta de novo, só dentro de `rect`, o que está na frente de `depth`.
function redrawFront(k: Kit, ctx: Ctx, layout: StudioLayout, depth: number, rect: Rect) {
  const fronts = layout.solids.filter((solid) => solid.depth > depth && overlaps(solid.rect, rect));
  if (fronts.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  fronts.forEach((solid) => drawSolid(k, ctx, solid, layout.env));
  ctx.restore();
}

// O brilho de um objeto passa por trás do que fica na frente dele (glow.ts).
const solidGlow = (k: Kit, layout: StudioLayout, solid: Solid) => {
  const [w, h] = k.size;
  const index = layout.solids.indexOf(solid);
  return glowOf(
    `${solid.id}|${layout.key}`,
    w,
    h,
    (c) => drawSolid(k, c, solid, layout.env),
    (c) => layout.solids.slice(index + 1).forEach((front) => drawSolid(k, c, front, layout.env)),
  );
};

// O brilho do que pode ser tocado, as luzes da máquina, o livro, o portal, a
// raposa e a cobra. glow = o que pode ser tocado agora; still = parado.
// Arrumando, brilha o que pode ser mudado de lugar (e o objeto pego, em ouro).
export function paintLounge(k: Kit, ctx: Ctx, layout: StudioLayout, tick: number, still: boolean, glow: ReadonlySet<SpotKind>, arranging: Arranging | null = null) {
  const soft = glowAlphas(tick, still, false);
  const strong = glowAlphas(tick, still, true);
  layout.solids.forEach((solid) => {
    const { def } = solid;
    if (arranging) {
      if (solid.place !== null) {
        const picked = arranging.picked === solid.id;
        if (picked || arranging.picked === null) paintGlow(ctx, solidGlow(k, layout, solid), 0, 0, picked ? GLOW_GOLD : GLOW_SOFT, picked ? strong : soft);
      }
    } else if (def.spot && glow.has(def.spot)) {
      // a máquina: o brilho mais forte da sala, em ouro
      const gold = def.spot === 'jackpot';
      paintGlow(ctx, solidGlow(k, layout, solid), 0, 0, gold ? GLOW_GOLD : GLOW_SOFT, gold ? strong : soft);
    }
    if (def.paint) {
      paintSolid(k, ctx, solid, layout.env, tick, still);
      redrawFront(k, ctx, layout, solid.depth, solid.rect);
    }
  });
  // a seta em cima do objeto pego
  if (arranging?.picked) {
    const solid = layout.solids.find((item) => item.id === arranging.picked);
    if (solid) {
      const cx = Math.round(solid.rect.x + solid.rect.w / 2);
      const top = solid.rect.y - 5 - (still ? 0 : (tick >> 1) % 2);
      k.px(ctx, cx - 2, top, GOLD, 5, 1);
      k.px(ctx, cx - 1, top + 1, GOLD, 3, 1);
      k.px(ctx, cx, top + 2, GOLD, 1, 1);
      k.px(ctx, cx - 2, top - 1, EDGE, 5, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// O sapo
// ---------------------------------------------------------------------------
// Ele anda solto: pula de um lugar vazio para outro e pela beirada da frente
// da sala, descansa, pisca, coaxa (o papo incha) e de vez em quando lança a
// língua numa mosca. A rota é sorteada uma vez por arranjo, sempre igual para
// o mesmo arranjo, e volta ao começo; onde ele está em cada quadro sai só do
// número do quadro (nada fica guardado entre um quadro e outro).
const FROG_COLORS = { G: '#74B548', g: '#3E7B2A', C: '#EDE5B5', E: '#D07A2C', K: '#1B1410', T: '#F08A9A', W: '#FFFFFF' };
const FROG_SIT = ['.EE....EE.', 'GEKGGGGEKG', 'GGGGGGGGGG', 'GggggggggG', 'GCCCCCCCCG', 'gGCCCCCCGg', 'gg.CCCC.gg'];
const FROG_BLINK = ['.gg....gg.', 'GggGGGGggG', 'GGGGGGGGGG', 'GggggggggG', 'GCCCCCCCCG', 'gGCCCCCCGg', 'gg.CCCC.gg'];
const FROG_CROAK = ['.EE....EE.', 'GEKGGGGEKG', 'GGGGGGGGGG', 'GCWWWWWWCG', 'gCWWWWWWCg', 'ggCWWWWCgg', 'gg.CCCC.gg'];
const FROG_JUMP = ['.EE....EE.', 'GEKGGGGEKG', 'GGGGGGGGGG', 'GCCCCCCCCG', '.gCCCCCCg.', '.g......g.', 'g........g'];
// pontos livres da sala que não são lugares: a beirada da frente, dois cantos e o tapete diante da tela
const FROG_SPOTS: [number, number][] = [
  [0.5, 5.83],
  [1.6, 5.83],
  [2.9, 5.83],
  [4.3, 5.83],
  [5.7, 5.83],
  [7.1, 5.83],
  [8.4, 5.83],
  [0.85, 5.0],
  [3.6, 5.0],
  [5.4, 3.55],
  [1.0, 3.5],
];
const FROG_REACH = 1.8;
const HOP = 5;
interface FrogStep {
  from: number;
  to: number;
  // quando o pulo começa, quantos quadros ele dura e quanto o sapo descansa depois
  start: number;
  air: number;
  rest: number;
  // o que ele faz descansando: 0 = nada, 1 = coaxa, 2 = lança a língua
  act: number;
}
interface FrogRoute {
  nodes: [number, number][];
  steps: FrogStep[];
  total: number;
}
const frogRoutes = new Map<string, FrogRoute>();
function frogRoute(layout: StudioLayout): FrogRoute {
  const hit = frogRoutes.get(layout.key);
  if (hit) return hit;
  const nodes: [number, number][] = FROG_SPOTS.concat(layout.empty.map((index) => [PLACES[index].x, PLACES[index].y] as [number, number]));
  const near = nodes.map((a, i) => nodes.map((b, j) => (i !== j && Math.hypot(a[0] - b[0], a[1] - b[1]) <= FROG_REACH ? j : -1)).filter((j) => j >= 0));
  // o sorteio, sempre igual para o mesmo arranjo
  let seed = 2166136261;
  for (let i = 0; i < layout.key.length; i += 1) seed = Math.imul(seed ^ layout.key.charCodeAt(i), 16777619);
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const path: number[] = [3];
  for (let n = 0; n < 36; n += 1) {
    const here = path[path.length - 1];
    const before = path[path.length - 2];
    const options = near[here].filter((j) => j !== before);
    const pool = options.length > 0 ? options : near[here];
    if (pool.length === 0) break;
    path.push(pool[Math.floor(rand() * pool.length)]);
  }
  // de volta ao começo pelo caminho mais curto, para a rota fechar
  const back = new Map<number, number>([[path[path.length - 1], -1]]);
  const queue = [path[path.length - 1]];
  while (queue.length > 0 && !back.has(path[0])) {
    const here = queue.shift() as number;
    near[here].forEach((j) => {
      if (!back.has(j)) {
        back.set(j, here);
        queue.push(j);
      }
    });
  }
  if (back.has(path[0]) && path.length > 1) {
    const home: number[] = [];
    for (let at = path[0]; at !== path[path.length - 1]; at = back.get(at) as number) home.unshift(at);
    path.push(...home);
  }
  const steps: FrogStep[] = [];
  let clock = 10;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const [a, b] = [nodes[path[i]], nodes[path[i + 1]]];
    const air = Math.hypot(a[0] - b[0], a[1] - b[1]) > 1.05 ? HOP * 2 : HOP;
    const rest = 14 + Math.floor(rand() * 30);
    steps.push({ from: path[i], to: path[i + 1], start: clock, air, rest, act: rest >= 26 ? (rand() < 0.5 ? 1 : 2) : rest >= 20 ? 1 : 0 });
    clock += air + rest;
  }
  const route: FrogRoute = { nodes, steps, total: Math.max(clock, 1) };
  if (frogRoutes.size > 60) frogRoutes.clear();
  frogRoutes.set(layout.key, route);
  return route;
}

interface FrogPose {
  x: number;
  y: number;
  // a altura do pulo, em pixels
  z: number;
  rows: string[];
  // virado para a esquerda
  flip: boolean;
  // a língua para fora (quantos pixels)
  tongue: number;
}
function frogPose(k: Kit, route: FrogRoute, tick: number, still: boolean): FrogPose {
  const first = route.nodes[route.steps[0]?.from ?? 3];
  if (still || route.steps.length === 0) return { x: first[0], y: first[1], z: 0, rows: FROG_SIT, flip: false, tongue: 0 };
  const t = tick % route.total;
  let step = route.steps[route.steps.length - 1];
  let before = true;
  for (let i = 0; i < route.steps.length; i += 1) {
    if (t >= route.steps[i].start) {
      step = route.steps[i];
      before = false;
    }
  }
  const a = route.nodes[step.from];
  const b = route.nodes[step.to];
  const flip = k.iso(b[0], b[1])[0] < k.iso(a[0], a[1])[0];
  // antes do primeiro pulo: sentado no começo
  if (before) return { x: first[0], y: first[1], z: 0, rows: t % 23 === 5 ? FROG_BLINK : FROG_SIT, flip: false, tongue: 0 };
  const into = t - step.start;
  if (into < step.air) {
    // no ar: um pulo, ou dois em seguida quando é longe
    const hops = step.air / HOP;
    const f = (into + 1) / step.air;
    const within = (f * hops) % 1 || 1;
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: Math.round(Math.sin(Math.PI * within) * 6), rows: within < 1 ? FROG_JUMP : FROG_SIT, flip, tongue: 0 };
  }
  // descansando
  const r = into - step.air;
  const croak = step.act === 1 && r >= 6 && r < 14 && (r >> 1) % 2 === 0;
  const tongue = step.act === 2 && r >= 9 && r < 12 ? (r === 10 ? 6 : 3) : 0;
  return { x: b[0], y: b[1], z: 0, rows: croak ? FROG_CROAK : r % 23 === 5 ? FROG_BLINK : FROG_SIT, flip, tongue };
}

// O sapo deste quadro (por cima dos objetos de trás dele, por baixo dos da frente).
export function paintFrog(k: Kit, ctx: Ctx, layout: StudioLayout, tick: number, still: boolean) {
  if (!hasPet(layout.env.world, 'frog')) return;
  const pose = frogPose(k, frogRoute(layout), tick, still);
  const foot = k.iso(pose.x, pose.y, 0);
  const fx = Math.round(foot[0]);
  const fy = Math.round(foot[1]);
  // a sombra no chão (menor quando ele está no ar)
  ctx.fillStyle = 'rgba(8,5,18,0.4)';
  ctx.fillRect(fx - (pose.z > 2 ? 3 : 4), fy, pose.z > 2 ? 6 : 8, 1);
  sprite(ctx, fx - 5, fy - 7 - pose.z, pose.rows, FROG_COLORS, pose.flip);
  if (pose.tongue > 0) {
    const dir = pose.flip ? -1 : 1;
    const from = pose.flip ? fx - 6 : fx + 5;
    for (let i = 0; i < pose.tongue; i += 1) k.px(ctx, from + dir * i, fy - 4, FROG_COLORS.T, 1, 1);
    // a mosca, na ponta
    if (pose.tongue < 6) k.px(ctx, from + dir * 6, fy - 5, FROG_COLORS.K, 1, 1);
  }
  redrawFront(k, ctx, layout, pose.x + pose.y, { x: fx - 13, y: fy - 16, w: 26, h: 18 });
}
// onde o sapo fica parado (o guia recorta o desenho dele dali)
export function frogHome(k: Kit, layout: StudioLayout): Rect {
  const route = frogRoute(layout);
  const first = route.nodes[route.steps[0]?.from ?? 3];
  const foot = k.iso(first[0], first[1], 0);
  return { x: Math.round(foot[0]) - 6, y: Math.round(foot[1]) - 8, w: 12, h: 10 };
}

// ---------------------------------------------------------------------------
// Os retângulos
// ---------------------------------------------------------------------------
// Os objetos que levam a algum lugar, com o retângulo de cada um (de trás para a frente).
export function loungeSpots(layout: StudioLayout): Spot[] {
  return layout.solids.filter((solid) => solid.def.spot).map((solid) => ({ kind: solid.def.spot as SpotKind, ...solid.rect }));
}

// Arrumando: os objetos que podem ser pegos e os lugares do chão, com o
// retângulo de cada um (os botões do teclado e do leitor de tela).
export interface ArrangeTargets {
  items: { id: ItemId; rect: Rect }[];
  places: { index: number; rect: Rect; free: boolean }[];
}
export function arrangeTargets(k: Kit, layout: StudioLayout): ArrangeTargets {
  const half = PLACE_SIZE / 2;
  return {
    items: layout.solids.filter((solid) => solid.place !== null).map((solid) => ({ id: solid.id as ItemId, rect: solid.rect })),
    places: PLACES.map((place, index) => ({ index, rect: rectOf(k, place.x - half, place.y - half, PLACE_SIZE, PLACE_SIZE, 0, 0), free: layout.empty.includes(index) })),
  };
}

// Arrumando: o que há no ponto tocado (px, py, em pixels da cena). O retângulo
// de uma caixa em isométrico cobre também o chão dos lugares de trás, então o
// toque é conferido no desenho de verdade: primeiro os objetos, do da frente
// para o de trás (com dois pixels de folga, para o dedo); depois o chão.
// Tocar no projetor ou no abajur, que são fixos, não pega nada.
const masks = new Map<string, Uint8Array | null>();
export function pickAt(k: Kit, layout: StudioLayout, px: number, py: number): { item: ItemId } | { place: number } | null {
  const [w, h] = k.size;
  const x = Math.floor(px);
  const y = Math.floor(py);
  for (let i = layout.solids.length - 1; i >= 0; i -= 1) {
    const solid = layout.solids[i];
    const { rect } = solid;
    if (x < rect.x - 3 || y < rect.y - 3 || x > rect.x + rect.w + 3 || y > rect.y + rect.h + 3) continue;
    const key = `${solid.id}|${layout.key}`;
    if (!masks.has(key)) {
      if (masks.size > 80) masks.clear();
      masks.set(
        key,
        silhouette(w, h, (c) => {
          drawSolid(k, c, solid, layout.env);
          paintSolid(k, c, solid, layout.env, 0, true);
        }),
      );
    }
    const mask = masks.get(key);
    if (!mask) continue;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && mask[qy * w + qx]) return solid.place === null ? null : { item: solid.id as ItemId };
      }
    }
  }
  // o chão: de pixel para ladrilho
  const origin = k.iso(0, 0);
  const along = k.iso(1, 0);
  const hw = along[0] - origin[0];
  const hh = along[1] - origin[1];
  const dx = px - origin[0];
  const dy = py - origin[1];
  const fx = (dx / hw + dy / hh) / 2;
  const fy = (dy / hh - dx / hw) / 2;
  const half = PLACE_SIZE / 2;
  const place = PLACES.findIndex((spot) => Math.abs(fx - spot.x) <= half && Math.abs(fy - spot.y) <= half);
  return place >= 0 ? { place } : null;
}

// O desenho de um objeto sozinho, para o inventário (17/11/2026): feito num
// lugar do meio da sala, parado, e recortado nos pixels que ele pinta.
export function itemPortrait(k: Kit, layout: StudioLayout, id: ItemId, turned: boolean): HTMLCanvasElement | null {
  const def = ITEMS.find((item) => item.id === id);
  if (!def || typeof document === 'undefined') return null;
  const fw = turned ? def.d : def.w;
  const fd = turned ? def.w : def.d;
  const x = 4.5 - fw / 2;
  const y = 3 - fd / 2;
  const solid: Solid = { id, def, place: null, turned, fw, fd, x, y, depth: 0, rect: rectOf(k, x, y, fw, fd, def.h, 6) };
  const [w, h] = k.size;
  const full = document.createElement('canvas');
  full.width = w;
  full.height = h;
  const c = full.getContext('2d');
  if (!c) return null;
  drawSolid(k, c, solid, layout.env);
  paintSolid(k, c, solid, layout.env, 0, true);
  const r = solid.rect;
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(w, r.x + r.w);
  const y1 = Math.min(h, r.y + r.h);
  const data = c.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let py = 0; py < y1 - y0; py += 1) {
    for (let qx = 0; qx < x1 - x0; qx += 1) {
      if (data[(py * (x1 - x0) + qx) * 4 + 3] < 24) continue;
      minX = Math.min(minX, qx);
      maxX = Math.max(maxX, qx);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
  }
  if (maxX < 0) return null;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')?.drawImage(full, x0 + minX, y0 + minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// O retângulo de um objeto no arranjo (o guia recorta o desenho dele dali).
export const solidRect = (layout: StudioLayout, id: ItemId): Rect | null => layout.solids.find((solid) => solid.id === id)?.rect ?? null;

// Mudar um objeto de lugar: se o lugar tem dono, os dois trocam.
export function moveItem(at: Partial<Record<ItemId, number>>, id: ItemId, place: number): Partial<Record<ItemId, number>> {
  const from = at[id];
  if (from === undefined || from === place) return at;
  const next = { ...at, [id]: place };
  const other = (Object.keys(at) as ItemId[]).find((key) => key !== id && at[key] === place);
  if (other) next[other] = from;
  return next;
}

// O inventário (17/11/2026). O arranjo inteiro: onde cada objeto está (o `at`
// já resolvido, com os de costume), o que está guardado e o que está girado.
export interface ArrangeState {
  at: Partial<Record<ItemId, number>>;
  off: string[];
  rot: Record<string, number>;
}
const occupantOf = (at: Partial<Record<ItemId, number>>, place: number): ItemId | undefined => (Object.keys(at) as ItemId[]).find((key) => at[key] === place);

// Levar um objeto (da sala ou do inventário) para um lugar. Na sala, num lugar
// ocupado os dois trocam; vindo do inventário, quem estava ali vai para o
// inventário. Devolve null quando não pode (quem estava ali não se guarda).
export function placeItem(state: ArrangeState, id: ItemId, place: number): ArrangeState | null {
  if (state.at[id] !== undefined) return { ...state, at: moveItem(state.at, id, place) };
  const other = occupantOf(state.at, place);
  if (other && !canStore(other)) return null;
  const at = { ...state.at, [id]: place };
  if (other) delete at[other];
  const off = state.off.filter((item) => item !== id);
  if (other) off.push(other);
  return { ...state, at, off };
}

// Guardar no inventário (a máquina do Jackpot e o guia não se guardam).
export function storeItem(state: ArrangeState, id: ItemId): ArrangeState {
  if (!canStore(id) || state.at[id] === undefined) return state;
  const at = { ...state.at };
  delete at[id];
  return { ...state, at, off: state.off.includes(id) ? state.off : [...state.off, id] };
}

// Girar: dois sentidos (0 e 1).
export function turnItem(state: ArrangeState, id: ItemId): ArrangeState {
  const rot = { ...state.rot };
  if ((rot[id] ?? 0) % 2 === 1) delete rot[id];
  else rot[id] = 1;
  return { ...state, rot };
}

// qual oráculo libera cada bichinho (para o guia)
export const PET_ITEMS: { pet: PetId; item: ItemId | 'frog'; oracle: 'bogart' | 'fincher' | 'cypher' }[] = [
  { pet: 'frog', item: 'frog', oracle: PET_ORACLE.frog },
  { pet: 'fox', item: 'fox', oracle: PET_ORACLE.fox },
  { pet: 'snake', item: 'tank', oracle: PET_ORACLE.snake },
];
