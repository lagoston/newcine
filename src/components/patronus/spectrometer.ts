import { ratingBarColor, ratingTone } from '../../lib/oracleTheme';

// O Espectrômetro (14/11/2026): o aparelho de laboratório, em pixel art, onde
// o Patrono pousa para mostrar a nota prevista (menu do título).
//
// Pedido do Bruno: "um design mais Old Cartoon Network anos 2000, cartoonzão,
// Laboratório de Dexter", em sintonia com o modal Sua Persona. Por isso:
// contorno de tinta escura em tudo, cores chapadas (sem degradê), formas
// blocadas, parafusos nas laterais, pezinhos, uma antena com bolinha e um
// cursor de alavanca.
//
// A escala são onze lâmpadas, uma por nota, de 0 a 10, nas cores que o site
// já usa para nota (as mesmas das prateleiras da biblioteca): cinza no 0,
// vermelho de 1 a 3, amarelo de 4 a 6, verde de 7 a 9 e rosa no 10. Cada
// lâmpada tem três estados: apagada, meia-luz e acesa, conforme a chance de a
// nota cair ali.
//
// Só desenho: quem decide o que acende e onde está o cursor é o
// PredictionGauge.

type Ctx = CanvasRenderingContext2D;

const EDGE = '#150E26';
// o aço do aparelho, em três tons chapados (luz em cima, sombra embaixo)
const STEEL = '#6466B8';
const STEEL_LIGHT = '#9A9CE6';
const STEEL_DARK = '#42427F';
const BOLT = '#D8D2EE';
const TICK = '#C3C4F2';
const NEEDLE = '#F3EAD3';

// a primeira linha do aparelho (acima dela é o ar onde o Patrono voa)
export const DECK = 21;
// a caixa tem 17 linhas; embaixo, 2 de pezinhos
const BODY_ROWS = 17;
export const ROWS = DECK + BODY_ROWS + 2;
// onde começa o rasgo das lâmpadas dentro da caixa, e a altura delas
const SLOT = 3;
const LAMP = 7;
// folga dos lados: a asa do Patrono passa da ponta da escala, e é onde ficam
// os parafusos e a antena
const SIDE = 7;

export interface Layout {
  // largura de uma lâmpada e o passo de uma para a outra
  cell: number;
  pitch: number;
  // largura e altura do desenho, em pixels do desenho
  width: number;
  height: number;
  // onde começa a primeira lâmpada e a caixa do aparelho
  scaleX: number;
  bodyX: number;
  bodyW: number;
}

// O maior aparelho que cabe na largura disponível (em px de tela; o desenho é
// ampliado 2×). A folga dos lados pode passar da largura: o componente a
// deixa vazar para a margem da coluna.
export function layoutFor(available: number): Layout {
  let cell = 5;
  for (const candidate of [9, 8, 7, 6]) {
    if ((11 * candidate + 10 + 8) * 2 <= available) {
      cell = candidate;
      break;
    }
  }
  const bodyW = 11 * cell + 10 + 8;
  return { cell, pitch: cell + 1, width: bodyW + SIDE * 2, height: ROWS, scaleX: SIDE + 4, bodyX: SIDE, bodyW };
}

// A coluna onde fica o meio de uma nota (o cursor ocupa esta e a da esquerda).
export const columnOf = (layout: Layout, rating: number): number => Math.round(layout.scaleX + rating * layout.pitch + layout.cell / 2);

const mixHex = (a: string, b: string, t: number): string => {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const channel = (shift: number) => {
    const u = (x >> shift) & 255;
    const v = (y >> shift) & 255;
    return Math.round(u + (v - u) * t);
  };
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
};

const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

// levels: o estado de cada lâmpada (0 apagada, 1 meia-luz, 2 acesa).
// beacon: a cor da bolinha da antena (null = apagada).
export function drawConsole(ctx: Ctx, layout: Layout, levels: number[], beacon: string | null) {
  const { bodyX: bx, bodyW: bw, scaleX: sx, cell, pitch } = layout;
  const y = DECK;
  const bottom = y + BODY_ROWS - 1;

  // a antena, no canto esquerdo: a haste e a bolinha
  rect(ctx, bx, y - 8, 4, 9, EDGE);
  rect(ctx, bx + 1, y - 8, 2, 9, BOLT);
  rect(ctx, bx, y - 14, 4, 6, EDGE);
  rect(ctx, bx - 1, y - 13, 6, 4, EDGE);
  rect(ctx, bx, y - 13, 4, 4, beacon ?? STEEL_DARK);
  if (beacon) rect(ctx, bx, y - 13, 1, 1, '#FFFFFF');

  // os pezinhos
  [bx + 5, bx + bw - 12].forEach((x) => {
    rect(ctx, x, bottom + 1, 7, 2, EDGE);
    rect(ctx, x + 1, bottom + 1, 5, 1, STEEL_DARK);
  });
  // os parafusos das laterais
  [bx - 2, bx + bw - 1].forEach((x) => {
    rect(ctx, x, y + 5, 3, 7, EDGE);
    rect(ctx, x + 1, y + 6, 1, 5, BOLT);
  });

  // a caixa: contorno de tinta, com os ombros chanfrados (mais estreita em cima)
  rect(ctx, bx + 3, y, bw - 6, 1, EDGE);
  rect(ctx, bx + 1, y + 1, bw - 2, 2, EDGE);
  rect(ctx, bx, y + 3, bw, BODY_ROWS - 4, EDGE);
  rect(ctx, bx + 1, bottom, bw - 2, 1, EDGE);
  // a chapa, em três tons chapados: luz no alto, sombra embaixo
  rect(ctx, bx + 1, y + 3, bw - 2, BODY_ROWS - 4, STEEL);
  rect(ctx, bx + 3, y + 1, bw - 6, 1, STEEL_LIGHT);
  rect(ctx, bx + 2, y + 2, bw - 4, 1, STEEL_LIGHT);
  rect(ctx, bx + 1, bottom - 2, bw - 2, 2, STEEL_DARK);
  // dois rebites no alto
  rect(ctx, bx + 4, y + 2, 1, 1, EDGE);
  rect(ctx, bx + bw - 5, y + 2, 1, 1, EDGE);

  // o rasgo onde ficam as lâmpadas
  rect(ctx, sx - 1, y + SLOT, 11 * pitch + 1, LAMP + 2, EDGE);
  for (let rating = 0; rating <= 10; rating += 1) {
    const x = sx + rating * pitch;
    const top = y + SLOT + 1;
    const level = levels[rating] ?? 0;
    const fill = ratingBarColor(rating);
    if (level >= 2) {
      rect(ctx, x, top, cell, LAMP, fill);
      rect(ctx, x, top, cell, 2, ratingTone(rating).color);
      rect(ctx, x + 1, top + 1, 2, 1, '#FFFFFF');
      rect(ctx, x, top + LAMP - 1, cell, 1, mixHex(fill, EDGE, 0.3));
    } else if (level === 1) {
      rect(ctx, x, top, cell, LAMP, mixHex(fill, EDGE, 0.45));
      rect(ctx, x, top, cell, 1, mixHex(fill, EDGE, 0.25));
    } else {
      rect(ctx, x, top, cell, LAMP, mixHex(fill, EDGE, 0.76));
      rect(ctx, x, top, cell, 1, mixHex(fill, EDGE, 0.68));
    }
    // os cantos cortados: a lâmpada fica com cara de botão
    [
      [x, top],
      [x + cell - 1, top],
      [x, top + LAMP - 1],
      [x + cell - 1, top + LAMP - 1],
    ].forEach(([cx, cy]) => rect(ctx, cx, cy, 1, 1, EDGE));
    // a régua embaixo: um risco por nota; o 0, o 5 e o 10 são mais compridos
    const middle = columnOf(layout, rating);
    rect(ctx, middle - 1, y + SLOT + LAMP + 2, 2, rating % 5 === 0 ? 2 : 1, TICK);
  }
}

// O cursor: uma haste clara de contorno escuro que atravessa as lâmpadas, com
// a cabeça redonda onde o Patrono pousa. column = a coluna do meio (columnOf).
export function drawNeedle(ctx: Ctx, column: number) {
  const y = DECK;
  // a haste
  rect(ctx, column - 2, y, 4, SLOT + LAMP + 2, EDGE);
  rect(ctx, column - 1, y, 2, SLOT + LAMP + 1, NEEDLE);
  // a cabeça
  rect(ctx, column - 2, y - 5, 4, 6, EDGE);
  rect(ctx, column - 3, y - 4, 6, 4, EDGE);
  rect(ctx, column - 2, y - 4, 4, 4, NEEDLE);
  rect(ctx, column - 1, y - 4, 1, 1, '#FFFFFF');
}

// Riscos de velocidade atrás de quem corre (o "zum" do desenho animado).
export function drawSpeedLines(ctx: Ctx, fromX: number, toX: number, y: number, color: string) {
  const left = Math.min(fromX, toX);
  const length = Math.abs(toX - fromX);
  if (length < 4) return;
  ctx.fillStyle = color;
  [-5, 0, 5].forEach((dy, index) => {
    const inset = index === 1 ? 0 : Math.round(length * 0.25);
    ctx.fillRect(left + inset, y + dy, length - inset * 2, 1);
  });
}
