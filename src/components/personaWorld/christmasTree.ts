import type { ItemEnv, Kit } from './studio';
import { pokeFrame, type Ctx, type Pt } from './pixel';

// A árvore de latinha (28/11/2026): o objeto de Natal do estúdio.
//
// Pedido do Bruno (16/11): "uma tag de Natal deve dar o item árvore de Natal
// com latas de refri como efeito (que deve evoluir para uma árvore de Natal
// cada vez mais glamurosa por 3 anos)". E em 25/11: "O modal de Natal deve dar
// aquela arvorezinha de Natal de energético na tag 2".
//
// Quem dá: a 2ª tag do Natal, 🎄 Spark of Grace (avaliar um filme da Lista de
// Natal). A árvore fica no estúdio para sempre, como a tag.
//
// O desenho é o nível I do plano da festa (claude/festa-sazonal.md): um
// pinheirinho torto numa lata de tinta, enfeitado com latinhas e anéis de
// lata; a estrela recortada de uma lata. O brilho que passa de lata em lata
// faz as vezes do pisca-pisca que não havia. Os níveis II (pisca-pisca, 2027)
// e III (gala, 2028) estão desenhados no protótipo (src/__preview_festa__/
// festaArt.ts, fora do git) e entram aqui quando a 2ª edição existir.
//
// O mesmo desenho aparece em dois lugares: no chão do estúdio (drawStudioTree)
// e na cena do painel de Natal da home (blitTree, com o canto em pixels).

const WHITE = '#FFFFFF';

const ROWS = [
  '.......H.......',
  '......HxH......',
  '.......H.......',
  '.......G.......',
  '......GgG......',
  '.....DGgGG.....',
  '....DGG.GGG....',
  '......DWG.HH...',
  '.....DGgGGRR...',
  '....DGGgGGRRG..',
  '...DGH.GgH.GGH.',
  '..HH.GGgGGGG...',
  '..VVDGGgG.GGG..',
  '..VVGG.gGGGHH..',
  '.DGGGGGgGGGSSG.',
  'DGG.GGgGGG.SSGG',
  '....D..W..D....',
  '.......W.......',
  '...aHHHHHHHa...',
  '...aAAAAAAAH...',
  '...aPPPPPPPH...',
  '...aPPPPPPPH...',
  '...aAAAAAAAH...',
  '...aAAAAAAAH...',
  '....aaaaaaa....',
];
const PALETTE: Record<string, string> = {
  H: '#D8DCE6', x: '#E5484D', G: '#3C8A4E', g: '#5DA86A', D: '#275F38', W: '#6A4630',
  R: '#E5484D', V: '#2FB36B', S: '#C9CFDB', A: '#9AA3B5', a: '#6B7285', P: '#F3EAD3',
};
// fora da época a árvore descansa: as mesmas cores, mais apagadas
const RESTING: Record<string, string> = {
  H: '#9EA3B0', x: '#9C3B40', G: '#2F6B3E', g: '#427F50', D: '#1F4A2D', W: '#523728',
  R: '#9C3B40', V: '#2A7F52', S: '#9096A3', A: '#747B8B', a: '#525869', P: '#B5AE9D',
};

export const TREE_W = ROWS[0].length;
export const TREE_H = ROWS.length;
// o chão que ela ocupa no estúdio (ladrilhos) e a altura (pixels)
export const CHRISTMAS_TREE = { w: 0.8, d: 0.8, h: 26 };

// o canto de cima à esquerda de cada latinha (grupo de uma letra)
const corners = (letter: string): Pt[] => {
  const out: Pt[] = [];
  ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== letter) continue;
      if (row[x - 1] === letter || ROWS[y - 1]?.[x] === letter) continue;
      out.push([x, y]);
    }
  });
  return out;
};
// a ordem do brilho: vermelha → prata → verde → vermelha
const CANS: Pt[] = [corners('R')[0], corners('S')[0], corners('V')[0], corners('R')[0]];
const STAR: Pt[] = [[7, 0], [6, 1], [8, 1], [7, 2]];

// A época da árvore: de 1º/12 ao Dia de Reis (6/1), no calendário de Brasília.
export function treeSeason(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return month === 12 || (month === 1 && day <= 6);
}

// O desenho parado, com o canto de cima à esquerda em (px, py).
export function blitTree(ctx: Ctx, px: number, py: number, lit = true): void {
  const palette = lit ? PALETTE : RESTING;
  const x0 = Math.round(px);
  const y0 = Math.round(py);
  ROWS.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      const color = palette[row[rx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x0 + rx, y0 + ry, 1, 1);
    }
  });
}

// O que se mexe: a luz passando de latinha em latinha e, de vez em quando, a
// estrela. `burst` (0 a 7, ou -1) é o toque: todas as latas e a estrela
// piscam juntas por um instante.
export function paintTreeFx(ctx: Ctx, px: number, py: number, tick: number, still: boolean, lit = true, burst = -1): void {
  const x0 = Math.round(px);
  const y0 = Math.round(py);
  const dot = (p: Pt, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x0 + p[0], y0 + p[1], 1, 1);
  };
  if (!still && burst >= 0 && burst < 8) {
    if (burst % 2 === 0) {
      CANS.forEach((p) => dot(p, WHITE));
      STAR.forEach((p) => dot(p, WHITE));
    }
    return;
  }
  if (still || !lit) return;
  dot(CANS[(tick >> 1) % 4], WHITE);
  if (tick % 32 < 2) STAR.forEach((p) => dot(p, WHITE));
}

// ---------------------------------------------------------------------------
// No estúdio
// ---------------------------------------------------------------------------
const cornerOf = (k: Kit, x: number, y: number): { at: Pt; foot: Pt } => {
  const foot = k.iso(x + CHRISTMAS_TREE.w / 2, y + CHRISTMAS_TREE.d / 2, 0);
  return { foot, at: [Math.round(foot[0] - (TREE_W - 1) / 2), Math.round(foot[1]) + 2 - TREE_H] };
};

export function drawStudioTree(k: Kit, ctx: Ctx, x: number, y: number, _env: ItemEnv): void {
  const { at, foot } = cornerOf(k, x, y);
  // a sombra no chão
  ctx.fillStyle = 'rgba(8,5,18,0.35)';
  ctx.fillRect(Math.round(foot[0] - 6), Math.round(foot[1]), 12, 2);
  ctx.fillRect(Math.round(foot[0] - 4), Math.round(foot[1]) + 2, 8, 1);
  blitTree(ctx, at[0], at[1], treeSeason());
}

export function paintStudioTree(k: Kit, ctx: Ctx, x: number, y: number, _env: ItemEnv, tick: number, still: boolean): void {
  const { at } = cornerOf(k, x, y);
  paintTreeFx(ctx, at[0], at[1], tick, still, treeSeason(), still ? -1 : pokeFrame('tree'));
}
