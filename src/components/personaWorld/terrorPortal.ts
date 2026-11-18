import type { ItemEnv, Kit } from './studio';
import { sprite, type Ctx } from './pixel';

// O portal do Clube do Terror (17/11/2026, noite): o vórtice.
//
// Pedido do Bruno: "Lembro-me que pedi para você fazer versões da caixa do
// clube do terror, troque essa caixa atual pela do nível 2, não estou
// gostando do design da atual." As versões são as do plano da festa sazonal
// (claude/festa-sazonal.md; protótipo em src/__preview_festa__/festaArt.ts):
// I a caixa velha de papelão, II o vórtice, III o duende porteiro. A caixa
// saiu e o vórtice entrou no lugar dela (o desenho dela está no histórico do
// git, em studio.ts, antes deste dia).
//
// O vórtice: o portal não coube mais na caixa. Ela estourou e ficou aberta no
// chão, em cruz; o portal fica em pé, flutuando acima dela, com o aro de luz
// de vela, o anel de sangue seco e três braços em espiral girando para dentro
// do miolo escuro. Um halo violeta respira atrás, dois retalhos de papelão
// giram em volta e brasas são sugadas para o centro.
//
// Diferença do protótipo: lá o portal se abria uma vez (a fenda virava oval)
// ao aparecer. Aqui o portal aberto, parado, vai também no desenho de baixo
// (drawTerrorPortal), porque o brilho de "tocável" e o toque pelo desenho só
// enxergam o desenho de baixo: sem isso, o brilho abraçaria só a caixa no
// chão. Com o portal sempre inteiro embaixo, a abertura não tem como aparecer.

const WHITE = '#FFFFFF';
const CANDLE = '#FFB547';
const CREAM = '#FFF3C4';
const BLOOD = '#8E1B2B';
const CRYPT = '#0F0811';
const VIOLET = '#351B4B';
const VIOLET_MID = '#63328F';
const CARD = '#94704A';
const CARD_DARK = '#785B40';
const TAPE = '#D9C9A0';

export const TERROR_PORTAL = { w: 1.2, d: 1.2, h: 34 };

// a caixa estourada, aberta em cruz no chão
const CROSS = [
  '.............PPPP............',
  '........PPPPPkkkkPPPPP.......',
  '.....pPPPPPPkkkkkkPPPPPPp....',
  '...pPPPPPPPPPkkkkPPPPPPPPPp..',
  '.....pPPPTTPPPPPPPPTTPPPp....',
  '........pPPPPPPPPPPPPp.......',
  '.............pPPPp...........',
];
const CROSS_PAL: Record<string, string> = { P: CARD, p: CARD_DARK, k: '#1A0D14', T: TAPE };
// a largura do portal aberto (pixels)
const OPEN = 17;

// o portal oval, em pé: aro de vela, anel de sangue seco, fundo violeta, três
// braços em espiral para dentro e o miolo escuro. rot = quanto os braços giraram.
function portalOval(ctx: Ctx, cx: number, cy: number, rot: number) {
  const rx = OPEN / 2;
  const ry = 10;
  for (let dy = -ry; dy <= ry; dy += 1) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
      const nx = dx / (rx + 0.35);
      const ny = dy / (ry + 0.35);
      const r = Math.sqrt(nx * nx + ny * ny);
      if (r > 1) continue;
      let c: string;
      if (r > 0.86) c = CANDLE;
      else if (r > 0.7) c = BLOOD;
      else if (r < 0.26) c = CRYPT;
      else {
        const phase = Math.atan2(ny, nx) - 2.3 * Math.log(r) + rot;
        const arm = Math.cos(3 * phase);
        c = arm > 0.82 ? (r > 0.55 ? CREAM : CANDLE) : arm > 0.45 ? VIOLET_MID : VIOLET;
      }
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
    }
  }
}

// o meio do chão do objeto e o meio do portal
const centerOf = (k: Kit, x: number, y: number): { fx: number; fy: number; cx: number; cy: number } => {
  const foot = k.iso(x + TERROR_PORTAL.w / 2, y + TERROR_PORTAL.d / 2, 0);
  const fx = Math.round(foot[0]);
  const fy = Math.round(foot[1]);
  return { fx, fy, cx: fx, cy: fy - 15 };
};

// O desenho de baixo: a caixa em cruz, a sombra do portal no chão e o portal
// aberto, parado.
export function drawTerrorPortal(k: Kit, ctx: Ctx, x: number, y: number) {
  const { fx, fy, cx, cy } = centerOf(k, x, y);
  sprite(ctx, fx - 14, fy - 3, CROSS, CROSS_PAL);
  // a luz do portal no fundo da caixa
  ctx.fillStyle = 'rgba(255,181,71,0.22)';
  ctx.fillRect(fx - 3, fy - 2, 6, 2);
  portalOval(ctx, cx, cy, 0);
}

// O que se mexe: o halo que respira, os braços que giram, os retalhos em
// órbita (atrás do portal na metade de trás da volta) e as brasas sugadas.
// Parado ("reduzir movimento", o guia, o inventário): o halo aceso e só.
export function paintTerrorPortal(k: Kit, ctx: Ctx, x: number, y: number, _env: ItemEnv, tick: number, still: boolean) {
  const { cx, cy } = centerOf(k, x, y);
  // o halo violeta atrás
  ctx.fillStyle = `rgba(168,85,247,${still || (tick >> 3) % 2 === 0 ? 0.14 : 0.22})`;
  for (let dy = -13; dy <= 13; dy += 1) {
    const half = Math.round(11.5 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 169)));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
  const shreds: [number, number, boolean][] = [];
  if (!still) {
    for (let j = 0; j < 2; j += 1) {
      const a = ((tick % 24) / 24) * Math.PI * 2 + j * Math.PI;
      shreds.push([cx + Math.round(Math.cos(a) * 13), cy + 3 + Math.round(Math.sin(a) * 4), Math.sin(a) > 0]);
    }
  }
  const shred = ([sx, sy]: [number, number, boolean]) => {
    ctx.fillStyle = CARD;
    ctx.fillRect(sx, sy, 2, 1);
    ctx.fillStyle = CARD_DARK;
    ctx.fillRect(sx + 1, sy, 1, 1);
  };
  shreds.filter((s) => !s[2]).forEach(shred);
  // o portal de novo por cima do halo (os braços na volta deste quadro)
  const pose = still ? 0 : (tick >> 1) % 6;
  portalOval(ctx, cx, cy, -(pose * Math.PI) / 9);
  if (!still) {
    // as brasas sugadas: três pixels de vela correm do aro até o miolo
    for (let j = 0; j < 3; j += 1) {
      const t = ((tick + j * 2) % 6) / 6;
      const a = (j * 2 * Math.PI) / 3 + t * 1.6 - (pose * Math.PI) / 9;
      ctx.fillStyle = t < 0.5 ? CANDLE : CREAM;
      ctx.fillRect(Math.round(cx + Math.cos(a) * 7 * (1 - t)), Math.round(cy + Math.sin(a) * 9 * (1 - t)), 1, 1);
    }
  }
  shreds.filter((s) => s[2]).forEach(shred);
  // um brilho no miolo, de vez em quando
  if (!still && tick % 40 === 0) {
    ctx.fillStyle = WHITE;
    ctx.fillRect(cx, cy, 1, 1);
  }
}
