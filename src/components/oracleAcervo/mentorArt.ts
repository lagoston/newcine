// O salão dos três mentores do Acervo, em pixels (25/11/2026).
//
// Pedido do Bruno: remodelar o Acervo "naquela pegada mitológica, hotel
// habboolística, da dungeons and dragons": "os mini oráculos que aconchegam o
// nobre viajante em busca de filmes nos corredores da biblioteca da sabedoria
// de seus 3 mentores, os verá adaptados com suas cores as prateleiras que os
// usuários mais buscam aquele oráculo. Podemos ter um sapo adrenalina, uma
// raposa catártica mas uma cobra sensorial." E, na mesma noite: o resto do site
// é "o menu do jogo"; o jogo de verdade é aqui, e quem entra nele é "a
// mariposinha que vive no estúdio do cinéfilo".
//
// Este arquivo só desenha (nada de React nem de banco): um salão de pedra com
// três nichos de estante, um mentor em cada um (o sapo de capuz, a raposa de
// terno, a cobra de boina: os mesmos trajes dos retratos deles) e as tochas.
// O corpo de cada mentor leva a COR DA PRATELEIRA que a pessoa mais avalia
// naquele oráculo (como a mariposa, que muda de cor com as prateleiras dela).
// A mariposa é desenhada por quem chama (MentorHall), com o drawMoth do estúdio.
//
// Tudo é feito com retângulos de 1 pixel num canvas pequeno, ampliado em
// escala inteira pelo CSS (o mesmo jeito do estúdio). Só usa fillStyle,
// globalAlpha e fillRect: assim o mesmo desenho roda no navegador e no teste
// que gera uma imagem fora dele.

export interface PixelCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export type MentorId = 'bogart' | 'fincher' | 'cypher';
export const MENTORS: MentorId[] = ['bogart', 'fincher', 'cypher'];

// altura fixa da cena (em pixels dela); a largura acompanha a tela
export const HALL_H = 66;
// o chão começa aqui
const FLOOR_Y = HALL_H - 9;

const INK = '#150E26';
const STONE = '#1B1433';
const STONE_LINE = '#241B42';
const STONE_LIGHT = '#34295C';
const WOOD = '#3A2A45';
const WOOD_DARK = '#261B33';
const PAPER = '#F3EAD3';
const GOLD = '#F4C454';

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
export const mixHex = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return hex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
};
const dark = (c: string, t: number) => mixHex(c, '#0A0616', t);
const light = (c: string, t: number) => mixHex(c, '#FFFFFF', t);

const px = (ctx: PixelCtx, x: number, y: number, c: string, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

// um número estável a partir de um texto (para as lombadas não mudarem a cada quadro)
const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// ---------------------------------------------------------------------------
// Os três mentores (cada letra é uma cor da paleta; o ponto é vazio)
// ---------------------------------------------------------------------------
//   K contorno · B corpo (a cor da prateleira) · D corpo escuro · L corpo claro
//   W creme (barriga, peito) · E olho · P pupila · M boca/focinho
//   H capuz ou terno · h dobra clara do pano · C colarinho · T gravata · R boina

const FROG = [
  '........KKKKK........',
  '......KKHHHHHKK......',
  '....KKHHHHHHHHHKK....',
  '...KHHHHHHHHHHHHHK...',
  '..KHHHKKKKKKKKKHHHK..',
  '..KHHKBBBBBBBBBKHHK..',
  '.KHHKBEEBBBBBEEBKHHK.',
  '.KHHKEEPEBBBEPEEKHHK.',
  '.KHHKEPPEBBBEPPEKHHK.',
  '.KHHKBEEBLLLBEEBKHHK.',
  '.KHHKBBLLLLLLLBBKHHK.',
  '.KHHKBMMMMMMMMMBKHHK.',
  '.KHHKLWWWWWWWWWLKHHK.',
  '..KHHKWWWWWWWWWKHHK..',
  '..KHHHKKWWWWWKKHHHK..',
  '.KHHHHHHKKKKKHHHHHHK.',
  'KHHHHhHHHHHHHHHhHHHHK',
  'KHHHHhHHHHHHHHHhHHHHK',
  'KHHHhHHKBBKBBKHHhHHHK',
  '.KHHhHHKBBKBBKHHhHHK.',
  '.KHHHHHHKKKKKHHHHHHK.',
  '..KKBBBBKKKKKBBBBKK..',
  '...KKKKKK...KKKKKK...',
];

const FOX = [
  '..KK.............KK..',
  '.KBBK...........KBBK.',
  '.KBWBK.........KBWBK.',
  '.KBWWBK.......KBWWBK.',
  '.KBBWBBKKKKKKKBBWBBK.',
  '.KBBBBBBBBBBBBBBBBBK.',
  '..KBBBBBBBBBBBBBBBK..',
  '.KBBBKKBBBBBBBKKBBBK.',
  '.KBBKEPKBBBBBKPEKBBK.',
  '.KLBBKKBBBBBBBKKBBLK.',
  '.KWLBBBBBLLLBBBBBLWK.',
  '.KWWWLBBLLMLLBBLWWWK.',
  '..KWWWWWLMMMLWWWWWK..',
  '...KWWWWWWMWWWWWWK...',
  '....KKWWWWWWWWWKK....',
  '...KHHKKWWWWWKKHHK...',
  '..KHHHHCCWTWCCHHHHK..',
  '.KHHHHHHCTTTCHHHHHHK.',
  '.KHHHhHHHTTTHHHhHHHK.',
  '.KHHHhHHHTTTHHHhHHHK.',
  '.KHHHhHHHHTHHHHhHHHK.',
  '.KHHBBKHHHHHHHKBBHHK.',
  '..KKKKKKKKKKKKKKKKK..',
];

const SNAKE = [
  '......KKKKKKKKK......',
  '....KKRRRRRRRRRKK....',
  '...KRRRRRRRRRRRRRK...',
  '....KKRRRRRRRRRKK....',
  '.....KBBBBBBBBBK.....',
  '....KBBBBBBBBBBBK....',
  '....KBEPBBBBBPEBK....',
  '....KBEPBBBBBPEBK....',
  '...KKBBBBMBMBBBBKK...',
  '..KLLKBBBBBBBBBKLLK..',
  '.KLLLLKKBBBBBKKLLLLK.',
  'KLLLLLLLWWWWWLLLLLLLK',
  'KLLDLLLWWDDDWWLLLDLLK',
  'KLLDLLLWWWWWWWLLLDLLK',
  '.KLLLLLWWDDDWWLLLLLK.',
  '..KLLLLWWWWWWWLLLLK..',
  '...KKLLLWDDDWLLLKK...',
  '.....KKBWWWWWBKK.....',
  '....KBBBBWWWBBBBK....',
  '..KKBBBBBBBBBBBBBKK..',
  '.KBBBDDBBBBBBBDDBBBK.',
  '.KBBBBBBDDDDDBBBBBBK.',
  '..KKKKKKKKKKKKKKKKK..',
];

const SPRITES: Record<MentorId, string[]> = { bogart: FROG, fincher: FOX, cypher: SNAKE };
export const SPRITE_W = 21;
export const SPRITE_H = 23;

// As cores fixas de cada mentor (o traje do retrato dele) e as que vêm da prateleira.
const paletteOf = (id: MentorId, tint: string, blink: boolean): Record<string, string> => {
  const base: Record<string, string> = {
    K: INK,
    B: tint,
    D: dark(tint, 0.34),
    L: light(tint, 0.3),
    W: PAPER,
    M: dark(tint, 0.62),
    P: INK,
  };
  if (id === 'bogart') {
    // o sapo de capuz preto, de olhos cor de âmbar
    return { ...base, H: '#231B33', h: '#3A2E55', E: blink ? tint : '#F6C777', P: blink ? dark(tint, 0.34) : INK };
  }
  if (id === 'fincher') {
    // a raposa de terno escuro e gravata vinho
    return { ...base, H: '#231B33', h: '#3A2E55', C: '#FFFFFF', T: '#9B2C3F', E: blink ? tint : '#F6C777', P: blink ? dark(tint, 0.34) : INK, M: INK };
  }
  // a cobra de boina cor de pêssego, de olho amarelo
  return { ...base, R: '#F0A27A', E: blink ? tint : '#F2D34B', P: blink ? dark(tint, 0.34) : INK, M: dark(tint, 0.62) };
};

function drawSprite(ctx: PixelCtx, x: number, y: number, rows: string[], palette: Record<string, string>) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  rows.forEach((row, ry) => {
    let rx = 0;
    while (rx < row.length) {
      const color = palette[row[rx]];
      if (!color) {
        rx += 1;
        continue;
      }
      // junta os vizinhos da mesma cor num retângulo só (menos chamadas)
      let run = 1;
      while (rx + run < row.length && row[rx + run] === row[rx]) run += 1;
      ctx.fillStyle = color;
      ctx.fillRect(x0 + rx, y0 + ry, run, 1);
      rx += run;
    }
  });
}

// Só o mentor, num canvas próprio (os retratos pequenos fora do salão).
export function drawMentor(ctx: PixelCtx, id: MentorId, x: number, y: number, tint: string, blink = false) {
  drawSprite(ctx, x, y, SPRITES[id], paletteOf(id, tint, blink));
}

// ---------------------------------------------------------------------------
// O salão
// ---------------------------------------------------------------------------
export interface HallMentor {
  // a cor da prateleira que a pessoa mais avalia neste oráculo
  tint: string;
  // as cores das três prateleiras de cima dele (as lombadas dos livros do nicho)
  shelf: string[];
}

export interface HallState {
  active: MentorId;
  mentors: Record<MentorId, HallMentor>;
  // o relógio da cena (anda 1 por quadro); 0 = parada
  tick: number;
  // quantos pixels o mentor ativo está acima do chão (o pulinho de quando é chamado)
  hop?: number;
}

// o centro de cada nicho, para a largura dada
export const mentorCenters = (width: number): Record<MentorId, number> => {
  const third = width / 3;
  return { bogart: Math.round(third * 0.5), fincher: Math.round(third * 1.5), cypher: Math.round(third * 2.5) };
};
// onde o mentor pisa e onde fica o topo da cabeça dele (para a mariposa pairar)
export const MENTOR_FEET_Y = FLOOR_Y + 3;
export const MENTOR_HEAD_Y = MENTOR_FEET_Y - SPRITE_H;

const NICHE_W = 39;
const NICHE_TOP = 5;

function drawWall(ctx: PixelCtx, width: number) {
  px(ctx, 0, 0, STONE, width, FLOOR_Y);
  // as fiadas de pedra, desencontradas
  for (let y = 4; y < FLOOR_Y; y += 7) {
    px(ctx, 0, y, STONE_LINE, width, 1);
    const offset = (y / 7) % 2 ? 0 : 9;
    for (let x = offset; x < width; x += 18) px(ctx, x, y - 6, STONE_LINE, 1, 6);
  }
  // a cornija no alto
  px(ctx, 0, 0, STONE_LIGHT, width, 1);
  px(ctx, 0, 1, INK, width, 1);
}

function drawFloor(ctx: PixelCtx, width: number) {
  // ladrilhos em xadrez, como o chão do estúdio
  for (let y = FLOOR_Y; y < HALL_H; y += 3) {
    const row = (y - FLOOR_Y) / 3;
    const tile = 10 + row * 2;
    for (let x = -tile; x < width; x += tile) {
      const odd = (Math.floor((x + tile) / tile) + row) % 2 === 0;
      px(ctx, x + (row % 2 ? tile / 2 : 0), y, odd ? '#2A1F4A' : '#231A40', tile, 3);
    }
  }
  px(ctx, 0, FLOOR_Y, STONE_LIGHT, width, 1);
}

function drawNiche(ctx: PixelCtx, cx: number, id: MentorId, mentor: HallMentor, lit: boolean) {
  const left = cx - Math.floor(NICHE_W / 2);
  const top = NICHE_TOP;
  const bottom = FLOOR_Y;
  // a moldura de pedra em arco (três degraus fazem o arredondado)
  const frame = lit ? mixHex(STONE_LIGHT, mentor.tint, 0.35) : STONE_LIGHT;
  px(ctx, left + 4, top, frame, NICHE_W - 8, 1);
  px(ctx, left + 2, top + 1, frame, NICHE_W - 4, 1);
  px(ctx, left + 1, top + 2, frame, NICHE_W - 2, 2);
  px(ctx, left, top + 4, frame, NICHE_W, bottom - top - 4);
  // o fundo do nicho
  const inner = '#120C24';
  px(ctx, left + 5, top + 2, inner, NICHE_W - 10, 1);
  px(ctx, left + 3, top + 3, inner, NICHE_W - 6, 2);
  px(ctx, left + 2, top + 5, inner, NICHE_W - 4, bottom - top - 5);
  // as tábuas e as lombadas (as cores das prateleiras de cima deste mentor
  // aparecem entre livros de couro apagado)
  const leather = ['#4A3550', '#3B2E5C', '#5A3A3F', '#2F3A5E', '#4D4433'];
  let n = 0;
  for (let shelfY = top + 14; shelfY <= bottom - 2; shelfY += 12) {
    px(ctx, left + 2, shelfY, WOOD, NICHE_W - 4, 2);
    px(ctx, left + 2, shelfY + 2, WOOD_DARK, NICHE_W - 4, 1);
    let x = left + 3;
    while (x < left + NICHE_W - 4) {
      const seed = hash(`${id}:${shelfY}:${n}`);
      const w = 2 + (seed % 2);
      const h = 6 + (seed % 4);
      const pick = seed % 7;
      const own = pick < 3 && mentor.shelf.length > 0;
      const color = own ? mentor.shelf[pick % mentor.shelf.length] : leather[seed % leather.length];
      const shade = lit ? (own ? color : light(color, 0.06)) : dark(color, 0.35);
      if (x + w > left + NICHE_W - 3) break;
      px(ctx, x, shelfY - h, shade, w, h);
      px(ctx, x, shelfY - h, light(shade, 0.25), w, 1);
      if (own && lit && h > 7) px(ctx, x, shelfY - h + 3, GOLD, w, 1);
      x += w + ((seed >> 3) % 5 === 0 ? 2 : 1);
      n += 1;
    }
  }
  // a pedra do fecho, com a joia da prateleira
  px(ctx, cx - 2, top - 2, frame, 5, 4);
  px(ctx, cx - 1, top - 1, lit ? mentor.tint : dark(mentor.tint, 0.45), 3, 2);
  if (lit) px(ctx, cx - 1, top - 1, light(mentor.tint, 0.55), 1, 1);
}

function drawTorch(ctx: PixelCtx, x: number, tick: number) {
  const y = 20;
  px(ctx, x, y + 4, '#5B4630', 1, 7);
  px(ctx, x - 1, y + 3, '#8A6B3C', 3, 2);
  const flick = tick ? Math.floor(tick / 2) % 3 : 0;
  px(ctx, x - 1, y, '#F59E3A', 3, 3);
  px(ctx, x, y - 1 - (flick === 1 ? 1 : 0), '#FBD16B', 1, 2 + (flick === 1 ? 1 : 0));
  if (flick === 2) px(ctx, x + 1, y - 1, '#F59E3A', 1, 1);
  // o clarão na parede
  ctx.globalAlpha = 0.1;
  px(ctx, x - 4, y - 4, '#FBD16B', 9, 12);
  ctx.globalAlpha = 1;
}

// O salão inteiro. A mariposa não é desenhada aqui.
export function drawHall(ctx: PixelCtx, width: number, state: HallState) {
  const centers = mentorCenters(width);
  drawWall(ctx, width);
  MENTORS.forEach((id) => drawNiche(ctx, centers[id], id, state.mentors[id], id === state.active));
  // uma tocha entre os nichos (só onde há folga entre eles)
  if (centers.fincher - centers.bogart >= NICHE_W + 9) {
    drawTorch(ctx, Math.round((centers.bogart + centers.fincher) / 2), state.tick);
    drawTorch(ctx, Math.round((centers.fincher + centers.cypher) / 2), state.tick + 3);
  }
  drawFloor(ctx, width);

  MENTORS.forEach((id, index) => {
    const mentor = state.mentors[id];
    const cx = centers[id];
    const isActive = id === state.active;
    // o círculo de runas no chão de quem está falando
    if (isActive) {
      const glow = state.tick ? 0.55 + 0.25 * Math.sin(state.tick / 5) : 0.7;
      ctx.globalAlpha = glow;
      px(ctx, cx - 13, MENTOR_FEET_Y - 1, mentor.tint, 27, 1);
      px(ctx, cx - 15, MENTOR_FEET_Y, mentor.tint, 31, 1);
      px(ctx, cx - 13, MENTOR_FEET_Y + 1, mentor.tint, 27, 1);
      ctx.globalAlpha = 1;
      px(ctx, cx - 9, MENTOR_FEET_Y, light(mentor.tint, 0.5), 2, 1);
      px(ctx, cx + 8, MENTOR_FEET_Y, light(mentor.tint, 0.5), 2, 1);
    } else {
      ctx.globalAlpha = 0.35;
      px(ctx, cx - 9, MENTOR_FEET_Y, INK, 19, 1);
      ctx.globalAlpha = 1;
    }
    // pisca de tempos em tempos, cada um no seu compasso; o ativo dá um pulinho ao ser chamado
    const phase = state.tick ? (state.tick + index * 17) % 46 : 9;
    const blink = phase < 2;
    const x = cx - Math.floor(SPRITE_W / 2);
    const y = MENTOR_HEAD_Y - (isActive ? Math.round(state.hop ?? 0) : 0);
    drawSprite(ctx, x, y, SPRITES[id], paletteOf(id, mentor.tint, blink));
    // quem não está falando fica na penumbra
    if (!isActive) {
      ctx.globalAlpha = 0.2;
      SPRITES[id].forEach((row, ry) => {
        const first = row.search(/[^.]/);
        if (first < 0) return;
        const last = row.length - 1 - row.split('').reverse().join('').search(/[^.]/);
        px(ctx, x + first, y + ry, '#0A0616', last - first + 1, 1);
      });
      ctx.globalAlpha = 1;
    }
  });
}
