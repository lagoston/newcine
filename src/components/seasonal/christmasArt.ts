import { TREE_H, TREE_W, blitTree, paintTreeFx } from '../personaWorld/christmasTree';

// A sala de Natal em pixels (28/11/2026): a cena do painel de Natal da home.
//
// Pedido do Bruno (25/11): adaptar "habooisticamente" o design do modal de
// Natal, na mesma pegada do salão dos mentores do Acervo. A cena conta o
// progresso sem precisar de texto:
//   • três meias na lareira, uma por missão (🎁 amigo secreto, 🎄 avaliar um
//     filme, 🎅 resenha): apagada = ainda não; acesa, com um presentinho
//     saindo = conquistada;
//   • a árvore de latinha (a mesma que vai para o estúdio) acende quando a 2ª
//     missão é cumprida;
//   • um bilhete dourado encostado na lareira = há uma raspadinha esperando.
// Só retângulos de 1 pixel (fillStyle, globalAlpha, fillRect), como o salão.

export interface PixelCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export const ROOM_H = 64;
const FLOOR_Y = ROOM_H - 10;

const WALL = '#14241E';
const WALL_LINE = '#101D18';
const PANEL = '#1B2E26';
const RAIL = '#27402F';
const FLOOR = '#2B1C19';
const FLOOR_LINE = '#22150F';
const FLOOR_EDGE = '#3C2820';
const WOOD = '#6A4630';
const WOOD_DARK = '#4A2F20';
const CREAM = '#F3EAD3';
const RED = '#E5484D';
const RED_DARK = '#8E1F2F';
const GREEN = '#2FB36B';
const GOLD = '#F5C451';
const BLUE = '#7CC4F8';
const BRICK = '#7A3B35';
const BRICK_LINE = '#5A2926';
const SOOT = '#140A0C';
const NIGHT = '#0B1230';
const SNOW = '#DDE6F5';

const BULBS = [RED, GOLD, GREEN, BLUE];
export const STOCKING_COLORS = [RED, GREEN, GOLD];

const mix = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[16, 8, 0].map((shift) => ch(shift).toString(16).padStart(2, '0')).join('')}`;
};

const rect = (ctx: PixelCtx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};

const rows = (ctx: PixelCtx, x: number, y: number, art: string[], palette: Record<string, string>) => {
  art.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      const color = palette[row[rx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x) + rx, Math.round(y) + ry, 1, 1);
    }
  });
};

const STOCKING = [
  '.CCCCC.',
  '.CCCCC.',
  '..BBB..',
  '..BBB..',
  '..BBB..',
  '..BBBB.',
  '..BBBBB',
  '...BBBB',
  '....BB.',
];
const WREATH = [
  '..GGGGG..',
  '.GGgGgGG.',
  'GGg...gGG',
  'GG.....GG',
  'Gg.....gG',
  'GG.....GG',
  'GGg...gGG',
  '.GGRRRGG.',
  '..GRWRG..',
];
const BOX_A = ['.YY.YY.', '..YYY...', 'RRRYRRRR', 'RRRYRRRR', 'YYYYYYYY', 'RRRYRRRR', 'RRRYRRRR'].map((row) => row.slice(0, 8).padEnd(8, '.'));
const BOX_B = ['..W...', 'GGWGGG', 'WWWWWW', 'GGWGGG', 'GGWGGG'];
const TICKET = ['YYYYYYYYY', 'YrrrrrrrY', 'YrYYYYYrY', 'YrrrrrrrY', 'YYYYYYYYY'];

export interface ChristmasRoomState {
  // as três missões, na ordem: conquistada?
  done: [boolean, boolean, boolean];
  // a missão em andamento (0, 1, 2) ou -1 (tudo feito)
  current: number;
  // há uma raspadinha esperando para ser raspada
  ticket: boolean;
  // o relógio da cena (anda 1 por quadro); 0 = parada
  tick: number;
}

// onde ficam as coisas numa cena de `width` pixels (quem desenha a mariposa precisa saber)
export function roomLayout(width: number) {
  const hearth = Math.round(width / 2);
  const mantelY = FLOOR_Y - 30;
  return {
    hearth,
    mantelY,
    treeX: Math.max(5, Math.round(width * 0.13) - 7),
    treeY: FLOOR_Y + 1 - TREE_H,
    windowX: Math.min(width - 28, Math.round(width * 0.84) - 12),
    // onde a mariposa paira: acima da lareira, à direita da guirlanda
    mothX: hearth + 17,
    mothY: mantelY - 7,
  };
}

export function drawChristmasRoom(ctx: PixelCtx, width: number, state: ChristmasRoomState): void {
  const { tick } = state;
  const moving = tick > 0;
  const at = roomLayout(width);
  ctx.globalAlpha = 1;

  // ---- a parede, o lambri e o chão ----
  rect(ctx, 0, 0, width, FLOOR_Y, WALL);
  for (let x = 9; x < width; x += 14) rect(ctx, x, 2, 1, 38, WALL_LINE);
  rect(ctx, 0, 40, width, FLOOR_Y - 40, PANEL);
  rect(ctx, 0, 40, width, 1, RAIL);
  rect(ctx, 0, 0, width, 2, RAIL);
  rect(ctx, 0, FLOOR_Y, width, ROOM_H - FLOOR_Y, FLOOR);
  rect(ctx, 0, FLOOR_Y, width, 1, FLOOR_EDGE);
  for (let y = FLOOR_Y + 3; y < ROOM_H; y += 3) rect(ctx, 0, y, width, 1, FLOOR_LINE);

  // ---- a janela, com a neve caindo lá fora ----
  const wx = at.windowX;
  const wy = 12;
  rect(ctx, wx, wy, 24, 21, WOOD);
  rect(ctx, wx + 1, wy + 1, 22, 18, NIGHT);
  for (let i = 0; i < 9; i += 1) {
    const fx = (i * 7 + 3) % 22;
    const fy = (i * 11 + (moving ? Math.floor(tick / 3) : 0) + (i % 3)) % 18;
    rect(ctx, wx + 1 + fx, wy + 1 + fy, 1, 1, SNOW);
  }
  rect(ctx, wx + 12, wy + 1, 1, 18, WOOD);
  rect(ctx, wx + 1, wy + 9, 22, 1, WOOD);
  // a neve acumulada no parapeito
  rect(ctx, wx + 1, wy + 18, 22, 1, SNOW);
  rect(ctx, wx - 1, wy + 20, 26, 2, WOOD_DARK);
  rect(ctx, wx + 3, wy + 17, 5, 1, SNOW);
  rect(ctx, wx + 15, wy + 17, 6, 1, SNOW);

  // ---- a lareira ----
  const cx = at.hearth;
  const my = at.mantelY;
  rect(ctx, cx - 22, my + 3, 44, FLOOR_Y - my - 3, BRICK);
  for (let y = my + 6; y < FLOOR_Y; y += 4) {
    rect(ctx, cx - 22, y, 44, 1, BRICK_LINE);
    const shift = ((y - my) / 4) % 2 === 0 ? 0 : 4;
    for (let x = cx - 22 + shift; x < cx + 22; x += 8) rect(ctx, x, y - 3, 1, 3, BRICK_LINE);
  }
  // a boca, com os cantos de cima arredondados
  rect(ctx, cx - 12, FLOOR_Y - 16, 24, 16, SOOT);
  rect(ctx, cx - 10, FLOOR_Y - 18, 20, 2, SOOT);
  // a lenha e o fogo (duas alturas que se alternam)
  rect(ctx, cx - 7, FLOOR_Y - 2, 14, 2, '#3B2416');
  const HEIGHTS = [9, 8, 8, 6, 5, 4, 2];
  for (let dx = -6; dx <= 6; dx += 1) {
    const flick = moving && (tick + dx * 3 + 40) % 4 < 2 ? 1 : 0;
    const h = HEIGHTS[Math.abs(dx)] + flick;
    rect(ctx, cx + dx, FLOOR_Y - 2 - h, 1, h, '#E5622A');
    if (Math.abs(dx) <= 4) rect(ctx, cx + dx, FLOOR_Y - 2 - Math.max(1, h - 3), 1, Math.max(1, h - 3), GOLD);
    if (Math.abs(dx) <= 1) rect(ctx, cx + dx, FLOOR_Y - 4, 1, 2, '#FFF3C4');
  }
  // o clarão do fogo no chão
  ctx.globalAlpha = moving && tick % 8 < 4 ? 0.2 : 0.14;
  rect(ctx, cx - 18, FLOOR_Y + 1, 36, 5, '#F5A14A');
  ctx.globalAlpha = 1;
  // a prateleira da lareira
  rect(ctx, cx - 25, my, 50, 3, '#D8C9A8');
  rect(ctx, cx - 25, my + 2, 50, 1, '#9C8E72');

  // ---- as três meias (as três missões) ----
  [-15, 0, 15].forEach((dx, index) => {
    const done = state.done[index];
    const current = state.current === index;
    const base = STOCKING_COLORS[index];
    // trancada: quase apagada; em andamento: a cor dela; conquistada: acesa
    const color = done || current ? base : mix(base, PANEL, 0.72);
    const cuff = done || current ? CREAM : mix(CREAM, PANEL, 0.7);
    const sx = cx + dx - 3;
    const sy = my + 3;
    if (done) {
      // o presentinho saindo da meia e a estrela que pisca
      rect(ctx, sx + 2, sy - 3, 3, 3, index === 1 ? RED : GREEN);
      rect(ctx, sx + 3, sy - 3, 1, 3, GOLD);
      if (!moving || (tick + index * 5) % 16 < 10) rect(ctx, sx + 5, sy - 5, 1, 1, '#FFFFFF');
    } else if (current && moving && tick % 12 < 6) {
      // a da vez chama com um ponto de luz
      rect(ctx, sx + 3, sy - 2, 1, 1, GOLD);
    }
    rows(ctx, sx, sy, STOCKING, { C: cuff, B: color });
  });

  // ---- a guirlanda em cima da lareira ----
  rows(ctx, cx - 4, my - 12, WREATH, { G: '#2E8B57', g: '#4DB37A', R: RED, W: GOLD });

  // ---- o tapete ----
  rect(ctx, cx - 20, FLOOR_Y + 4, 40, 4, RED_DARK);
  for (let x = cx - 19; x < cx + 20; x += 3) rect(ctx, x, FLOOR_Y + 4, 1, 1, CREAM);
  for (let x = cx - 19; x < cx + 20; x += 3) rect(ctx, x, FLOOR_Y + 7, 1, 1, CREAM);

  // ---- a árvore de latinha e os presentes ----
  const treeLit = state.done[1];
  blitTree(ctx as unknown as CanvasRenderingContext2D, at.treeX, at.treeY, treeLit);
  paintTreeFx(ctx as unknown as CanvasRenderingContext2D, at.treeX, at.treeY, tick, !moving, treeLit);
  rows(ctx, at.treeX + TREE_W + 1, FLOOR_Y - 6, BOX_A, { R: RED, Y: GOLD });
  rows(ctx, at.treeX + TREE_W + 7, FLOOR_Y - 3, BOX_B, { G: GREEN, W: CREAM });

  // ---- a raspadinha esperando ----
  if (state.ticket) {
    const tx = cx + 27;
    const ty = FLOOR_Y - 6;
    rows(ctx, tx, ty, TICKET, { Y: GOLD, r: RED });
    if (!moving || tick % 10 < 6) {
      rect(ctx, tx + 9, ty - 2, 1, 3, '#FFFFFF');
      rect(ctx, tx + 8, ty - 1, 3, 1, '#FFFFFF');
    }
  }

  // ---- o varal de luzes, por cima de tudo ----
  for (let x = 0; x < width; x += 1) {
    const sag = Math.round(3 * Math.sin((Math.PI * (x % 30)) / 30));
    rect(ctx, x, 4 + sag, 1, 1, '#0A1310');
    if (x % 6 === 3) {
      const i = Math.floor(x / 6);
      const base = BULBS[i % 4];
      const dim = moving && (i + Math.floor(tick / 5)) % 4 === 0;
      rect(ctx, x, 5 + sag, 2, 2, dim ? mix(base, WALL, 0.6) : base);
    }
  }
}
