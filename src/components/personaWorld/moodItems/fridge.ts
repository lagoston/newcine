import type { Kit } from '../studio';
import { faceX, faceY, pokeFrame, sprite, type Ctx, type Pt } from '../pixel';
import type { MoodItemArt } from './types';

// ----- O frigobar do Muitas Risadas (😂 Punchliner), 17/11/2026.
//
// Ideia do Bruno: "um frigobar aberto, com latas caídas". É o fim da sessão de
// comédia com os amigos no sofá: o frigobar retrô verde (a cor do humor,
// #4ADE80), de quinas arredondadas, pés cromados e puxador cromado, ficou de
// porta escancarada. A luz de dentro está acesa e cai no chão; lá dentro, o
// congeladorzinho de gelo, as prateleiras com latas e uma garrafinha; na porta,
// duas grades verdes com mais latas. A bagunça: duas latas esquecidas em cima
// dele e três no chão (duas em pé, uma deitada). Latas sem marca: cor lisa e
// uma faixa creme.
//
// Parado: a lâmpada de dentro tremula de vez em quando (lâmpada de frigobar
// velho) e a lata deitada rola um pixel e volta.
// O toque é a piada: a porta bate e fecha (o frigobar dá um pulinho, as latas
// de cima saltam, risquinhos de tremor e um estalo na quina), um instante de
// silêncio, a luz escapa pela fresta, a porta se escancara sozinha de novo e
// cospe uma lata dourada, que quica e some rolando para debaixo do frigobar.
// Em ~2,6 s tudo está como antes (a lata extra ficou lá embaixo).
//
// A porta muda de lugar no toque, então ela mora só no `paint` (as latas de
// cima e a deitada também, porque pulam); o desenho parado tem o corpo, o
// miolo aceso e as duas latas em pé do chão, e o brilho de "tocável" abraça
// isso. Tudo é desenhado a partir do canto de trás preso ao pixel (anchor):
// o frigobar sai igual, pixel por pixel, em qualquer lugar da sala.

const ID = 'fridge';

// As medidas em doze avos de ladrilho: um doze avos anda um pixel ao longo de
// x ou de y na tela. O chão todo tem 15 × 15 (1,25 ladrilho de cada lado),
// com a porta aberta e as latas dentro.
const FW = 15;
const FD = 15;
// o corpo: dois passos para dentro de x (ali ficam a porta e o puxador),
// encostado no fundo; 9 de frente, 7 de fundo, pés de 2 px e 17 px de caixa
const BA = 2;
const BW = 9;
const BD = 7;
const LEG = 2;
const TOP = LEG + 17;
// a porta: a dobradiça na quina da frente da esquerda (BA, BD), 8 de largura
// (um pixel mais estreita que a frente: fechada, sobra a quina do corpo)
const DW = 8;

// ---------------------------------------------------------------------------
// As cores
// ---------------------------------------------------------------------------
const GREEN = '#4ADE80';
const EDGE = '#150E26';
const PAPER = '#F3EAD3';
const mixHex = (a: string, b: string, t: number): string => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
// as faces do corpo, sombreadas como as caixas da sala (k.box): a da frente
// mais escura, a do lado um pouco, o tampo no verde puro. Mais escuras que
// as de uma caixa comum (nota do diretor de arte, 17/11/2026): o frigobar
// aceso brilhava mais que a máquina do Jackpot, que tem de continuar sendo a
// coisa que mais chama na sala; o verde mais fundo também o separa da
// luminária verde-água.
const FRONT = mixHex(GREEN, '#0A0616', 0.45);
const SIDE = mixHex(GREEN, '#0A0616', 0.3);
const LID = GREEN;

// Poucas cores (nota do diretor de arte, 17/11/2026: eram 36, os objetos da
// sala usam de 6 a 22): as letras dos desenhos continuam separadas, mas
// várias apontam para a mesma cor (um cromo claro, um cromo escuro, um verde
// de quina para as três quinas arredondadas).
const ROUND = mixHex(SIDE, LID, 0.45);
const CHROME = '#BAC1CE';
const CHROME_DARK = '#7E879D';
const PAL: Record<string, string> = {
  // o corpo: as faces, a quina arredondada (uma linha de luz entre a face e o
  // tampo, e o verniz da quina da frente), o pé da face do lado
  G: FRONT,
  X: SIDE,
  h: ROUND,
  v: ROUND,
  g: ROUND,
  d: FRONT,
  e: SIDE,
  K: EDGE,
  // o miolo aceso: luz quente, a parede de dentro na sombra, a lâmpada (o
  // único branco puro do móvel), as grades cromadas
  L: '#DCC890',
  l: '#DCC890',
  w: '#BFA46A',
  W: '#FFFFFF',
  s: CHROME,
  S: '#BFA46A',
  // o congeladorzinho: gelo azulado e a geada
  I: '#9ACADF',
  J: '#6FA6C2',
  z: '#9ACADF',
  // a porta por dentro: forro frio (não é ele que está aceso), a borracha e
  // as grades no verde do corpo
  F: '#93AD9F',
  k: '#4A6558',
  M: SIDE,
  n: FRONT,
  // o puxador cromado
  H: CHROME,
  j: CHROME_DARK,
  // as latas: cor lisa, uma faixa creme e a tampa prateada
  R: '#E5484D',
  r: '#A82D3A',
  E: '#E5484D',
  Y: '#F4C454',
  y: '#B8862B',
  c: '#DCCFAD',
  q: '#DCCFAD',
  m: CHROME_DARK,
  i: CHROME,
  // a garrafinha de vidro (a tampinha é dourada, o brilho no verde do humor)
  N: '#1F8A5A',
  o: GREEN,
};

// ---------------------------------------------------------------------------
// As ferramentas
// ---------------------------------------------------------------------------
// o canto de trás do chão, preso ao pixel
const anchor = (k: Kit, x: number, y: number): Pt => {
  const p = k.iso(x, y);
  return [Math.round(p[0]), Math.round(p[1])];
};
// um ponto do móvel: a ao longo de x, b ao longo de y (em doze avos), z para cima
const at = (o: Pt, a: number, b: number, z = 0): Pt => [o[0] + a - b, o[1] + (a + b) / 2 - z];
const shift = (p: Pt, dx: number, dy: number): Pt => [p[0] + dx, p[1] + dy];

// Um desenho pintado pixel a pixel numa face, escrito como se vê: a linha de
// cima primeiro e a primeira letra é a ponta da esquerda. side 'y' = a face
// da frente-esquerda (o = a ponta esquerda dela, no chão); side 'x' = a face
// da frente-direita (o = a ponta direita dela, no chão).
const onFace = (ctx: Ctx, side: 'x' | 'y', o: Pt, rows: readonly string[]) => {
  const top = rows.length - 1;
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length; i += 1) {
      const c = PAL[row[i]];
      if (!c) continue;
      if (side === 'y') faceY(ctx, o, i, top - r, 1, 1, c);
      else faceX(ctx, o, row.length - 1 - i, top - r, 1, 1, c);
    }
  });
};

// ---------------------------------------------------------------------------
// O corpo
// ---------------------------------------------------------------------------
// A frente do corpo, aberta: a moldura verde, a parede de dentro da esquerda
// na sombra, a lâmpada no alto e, do lado dela, o congeladorzinho de gelo
// azulado (o azul frio é o que diz "geladeira" de longe, no meio do creme
// quente da luz). Duas prateleiras de grade cromada: em cima, uma lata
// vermelha e uma dourada; embaixo, uma dourada, a garrafinha verde e um vão (a
// lata do chão saiu dali). As latas ficam em colunas pares: a face desce um
// pixel a cada dois, e uma lata de dois pixels começando numa coluna par
// fica reta.
const FRONT_ROWS = [
  'hhhhhhhhh',
  'GGGGGGGGG',
  'GwWWIIIIG',
  'GwLLIzzIG',
  'GwLLJJJJG',
  'GwmiLLmiG',
  'GwrRLLyYG',
  'GwrRLLyYG',
  'GSssssssG',
  'GwLLLiLLG',
  'GwmiLNLLG',
  'GwyYNoLLG',
  'GwqcNoLLG',
  'GwyYNNllG',
  'GSssssssG',
  'GGGGGGGGG',
  'GGGGGGGGG',
];
// O lado do corpo: liso, com o verniz da quina da frente e um friso cromado.
const SIDE_ROWS = [
  'vvvvvv.',
  'gXXXXXX',
  'gXXXXXX',
  'gssssss',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'gXXXXXX',
  'ddddddd',
];

const drawBody = (k: Kit, ctx: Ctx, o: Pt) => {
  // o tampo (um pixel mais fundo: as faces vêm por cima e não fica fresta)
  k.poly(ctx, [at(o, BA, 0, TOP), at(o, BA + BW, 0, TOP), at(o, BA + BW, BD, TOP - 1), at(o, BA, BD, TOP - 1)], LID);
  // os pés: os dois da frente e o de trás da direita
  const front = at(o, BA, BD, 0);
  const side = at(o, BA + BW, 0, 0);
  faceY(ctx, front, 0, 0, 1, LEG, CHROME_DARK);
  faceY(ctx, front, BW - 1, 0, 1, LEG, CHROME_DARK);
  faceX(ctx, side, 0, 0, 1, LEG, CHROME_DARK);
  onFace(ctx, 'y', at(o, BA, BD, LEG), FRONT_ROWS);
  onFace(ctx, 'x', at(o, BA + BW, 0, LEG), SIDE_ROWS);
};

// ---------------------------------------------------------------------------
// A porta
// ---------------------------------------------------------------------------
// Aberta (90°), vista por dentro: o puxador cromado saindo da quina, a borda
// verde da porta (o tampo dela num verde mais escuro que o do corpo, para a
// porta não se fundir com ele), a borracha escura e o forro frio: embaixo, a
// grade verde com uma fileira de latas (uma dourada, uma vermelha); em cima,
// só o friso verde de uma grade vazia (uma fileira só de latas: menos
// confete). A primeira coluna é o puxador; a segunda, a borda; a última, a
// borracha do lado da dobradiça. As latas, de novo, em pares de colunas que
// descem juntos.
const DOOR_IN = [
  '.vvvvvvvvv',
  '.ekkkkkkkk',
  '.ekFFFFFFk',
  '.ekFFFFFFk',
  '.ekFFFFFFk',
  'HHkFFFFFFk',
  'jeknMMMMMk',
  'HekFFFFFFk',
  'HekFFFFFFk',
  'HekFFFFFFk',
  'HHkFFFFFFk',
  '.ekFmimiFk',
  '.ekFyYrRFk',
  '.ekFyYrRFk',
  '.eknMMMMMk',
  '.ekMMMMMMk',
  '.ekkkkkkkk',
];
// Fechada, vista por fora: verde, com o puxador cromado perto da borda. A
// última coluna é a quina da porta (do lado de x).
const DOOR_OUT = [
  'hhhhhhhhv',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'GGGGGHjGe',
  'GGGGGHjGe',
  'GGGGGHjGe',
  'GGGGGHjGe',
  'GGGGGHjGe',
  'GGGGGHjGe',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'GGGGGGGGe',
  'KKKKKKKKK',
];

// A porta num ângulo qualquer (graus; 0 = fechada, 90 = escancarada), para o
// meio do movimento: a placa vista do lado que aparece, a borda e o tampo.
const doorSwing = (k: Kit, ctx: Ctx, o: Pt, deg: number) => {
  const t = (deg * Math.PI) / 180;
  const ua = Math.cos(t);
  const ub = Math.sin(t);
  // a espessura da porta, para fora
  const na = -ub;
  const nb = ua;
  const fa = BA + DW * ua;
  const fb = BD + DW * ub;
  const quad = (a0: number, b0: number, a1: number, b1: number, lo: number, hi: number, c: string) =>
    k.poly(ctx, [at(o, a0, b0, lo), at(o, a1, b1, lo), at(o, a1, b1, hi), at(o, a0, b0, hi)], c);
  if (ub > ua) {
    // por dentro: a borracha, o forro e as duas grades
    quad(BA, BD, fa, fb, LEG, TOP, PAL.k);
    const ia = BA + ua;
    const ib = BD + ub;
    const ja = BA + ua * (DW - 1);
    const jb = BD + ub * (DW - 1);
    quad(ia, ib, ja, jb, LEG + 1, TOP - 2, PAL.F);
    quad(ia, ib, ja, jb, LEG + 1, LEG + 3, PAL.M);
    quad(ia, ib, ja, jb, LEG + 3, LEG + 5, PAL.Y);
    quad(ia, ib, ja, jb, LEG + 10, LEG + 11, PAL.M);
  } else {
    quad(BA + na, BD + nb, fa + na, fb + nb, LEG, TOP, FRONT);
    // o puxador, perto da borda
    const pa = BA + na + ua * (DW - 2.5);
    const pb = BD + nb + ub * (DW - 2.5);
    quad(pa, pb, pa + ua, pb + ub, LEG + 5, LEG + 11, PAL.H);
  }
  // a borda da porta e o tampo
  quad(fa, fb, fa + na, fb + nb, LEG, TOP, SIDE);
  k.poly(ctx, [at(o, BA, BD, TOP), at(o, fa, fb, TOP), at(o, fa + na, fb + nb, TOP), at(o, BA + na, BD + nb, TOP)], PAL.v);
};

const paintDoor = (k: Kit, ctx: Ctx, o: Pt, deg: number) => {
  if (deg === 90) {
    // a sombra da porta no chão (ela fica 2 px acima dele, na altura do corpo, que tem pés)
    k.poly(ctx, [at(o, BA - 1, BD), at(o, BA, BD), at(o, BA, BD + DW), at(o, BA - 1, BD + DW)], 'rgba(8,5,18,0.4)');
    onFace(ctx, 'x', at(o, BA, BD, LEG), DOOR_IN);
  } else if (deg === 0) onFace(ctx, 'y', at(o, BA, BD + 1, LEG), DOOR_OUT);
  else doorSwing(k, ctx, o, deg);
};

// ---------------------------------------------------------------------------
// As latas do chão
// ---------------------------------------------------------------------------
// em pé (o pé no meio da segunda coluna): a tampa prateada, a cor e a faixa
const CAN_UP = ['mim', 'rRE', 'qcc', 'rRE', 'rRR'];
// deitada, com a tampa virada para a direita; rolando, o brilho troca de lugar
const CAN_LYING = [
  ['EEcEi', 'RRcRm', 'rrqrm'],
  ['RRcRi', 'EEcEm', 'rrqrm'],
];
// tombando, no ar
const CAN_TILT = ['..im', '.ERm', 'rRc.', 'rq..'];
// as cores de cada lata (a sombra, a cor, o brilho): só vermelha e dourada
// (a rosa saiu: rosa é a cor do Mind-Blowing, e o móvel tinha confete demais)
const tint = (base: string, dark: string, light: string): Record<string, string> => ({ ...PAL, R: base, r: dark, E: light });
const RED = tint('#E5484D', '#A82D3A', '#E5484D');
const GOLD = tint('#F4C454', '#B8862B', '#F4C454');

// duas latas em pé paradas no chão (uma vermelha diante da quina da frente,
// uma dourada do lado do frigobar) e a vermelha deitada, mais para a frente
// (ela se mexe: só no paint)
const CAN_A: [number, number] = [11.5, 9];
const CAN_B: [number, number] = [13.5, 3];
const CAN_L: [number, number] = [3.5, 14];
const canUp = (ctx: Ctx, p: Pt, colors: Record<string, string>) => sprite(ctx, p[0] - 1, p[1] - 5, CAN_UP, colors);
const lyingCan = (ctx: Ctx, p: Pt, frame: number, colors: Record<string, string>) => sprite(ctx, p[0] - 2, p[1] - 3, CAN_LYING[frame % 2], colors);
const drawFloorCans = (ctx: Ctx, o: Pt) => {
  canUp(ctx, at(o, CAN_B[0], CAN_B[1]), GOLD);
  canUp(ctx, at(o, CAN_A[0], CAN_A[1]), RED);
};

// ---------------------------------------------------------------------------
// O desenho parado
// ---------------------------------------------------------------------------
const draw: MoodItemArt['draw'] = (k, ctx, x, y) => {
  const o = anchor(k, x, y);
  // a sombra no chão, embaixo do corpo (aparece entre os pés)
  k.poly(ctx, [at(o, BA - 1, -1), at(o, BA + BW + 1, -1), at(o, BA + BW + 1, BD + 1), at(o, BA - 1, BD + 1)], 'rgba(8,5,18,0.45)');
  drawBody(k, ctx, o);
  drawFloorCans(ctx, o);
};

// ---------------------------------------------------------------------------
// O que se mexe
// ---------------------------------------------------------------------------
// a luz que sai da porta aberta e se abre no chão da frente: uma mancha
// larga e, por cima, uma mais forte junto da porta. Quase branca: no chão
// verde-petróleo, amarelo vira lama, e o branco vira luz.
const spill = (k: Kit, ctx: Ctx, o: Pt, alpha: number) => {
  const c = (t: number) => `rgba(255,248,222,${(alpha * t).toFixed(3)})`;
  k.poly(ctx, [at(o, BA + 1, BD), at(o, BA + BW, BD), at(o, BA + BW + 2, BD + 7), at(o, BA + 1, BD + 9)], c(1));
  k.poly(ctx, [at(o, BA + 1, BD), at(o, BA + BW, BD), at(o, BA + BW, BD + 3), at(o, BA + 1, BD + 4)], c(0.8));
};
// a lâmpada piscando: o miolo escurece um instante e a lâmpada apaga
const dimInside = (ctx: Ctx, o: Pt) => {
  const front = at(o, BA, BD, LEG);
  faceY(ctx, front, 1, 2, BW - 2, 13, 'rgba(40,24,60,0.34)');
  faceY(ctx, front, 2, 14, 2, 1, '#D9C79A');
};
// os quadros (de 60) em que a lâmpada pisca: uma piscada longa e uma curta,
// a cada 7,5 s
const FLICKER = [41, 42, 44];
// a lata deitada rola um pixel e volta, a cada 44 quadros (5,5 s; os dois
// ritmos não batem, e as duas coisas quase nunca acontecem juntas)
const ROLL_EVERY = 44;
const ROLL_AT = 20;

// As duas latas em cima do frigobar, esquecidas ali: uma em pé, uma deitada.
// Só no paint, porque pulam quando a porta bate.
const TOP_UP: [number, number] = [BA + 6, 2];
const TOP_LYING: [number, number] = [BA + 3, 4.5];
const topCans = (ctx: Ctx, o: Pt, up: number, lying: number) => {
  canUp(ctx, at(o, TOP_UP[0], TOP_UP[1], TOP + up), GOLD);
  lyingCan(ctx, at(o, TOP_LYING[0], TOP_LYING[1], TOP + lying), 0, RED);
};

// A piada do toque, quadro a quadro (8 por segundo): o ângulo da porta. Ela
// bate (0), fica fechada um instante, range (3°, 8°: a luz escapa pela
// fresta), se escancara passando do ponto (100°) e volta aos 90°.
const SLAM = [40, 0, 0, 0, 0, 0, 0, 3, 8, 30, 62, 100];
// o pulinho do frigobar quando a porta bate (dx, dy por quadro)
const JOLT: Pt[] = [
  [0, 0],
  [0, -1],
  [1, 0],
];
const STILL_JOLT: Pt = [0, 0];
// quanto as latas de cima pulam (a em pé, a deitada), por quadro
const HOP: Pt[] = [
  [0, 0],
  [3, 2],
  [1, 1],
];
// A lata extra: a porta, batendo nos 100°, cospe uma lata dourada pelo vão
// da prateleira de baixo; ela sobe num arco, cai, quica (tlim) e rola de
// volta para debaixo do frigobar, por um caminho livre, para se ver ela
// sumindo. [a, b, z, desenho] a partir do quadro 11; desenho 0/1 = deitada
// (rolando: o brilho troca de lugar), 2 = tombando no ar.
const EXTRA: [number, number, number, number][] = [
  [8.5, 7.5, 5, 2],
  [8, 9, 7, 2],
  [7.5, 10.5, 3, 2],
  [7, 11.5, 0, 0],
  [6.5, 12, 2, 1],
  [6.5, 12, 0, 0],
  [6.5, 10.5, 0, 1],
  [6.5, 9, 0, 0],
  [6.5, 7.5, 0, 1],
  [6.5, 6, 0, 0],
];
// o quadro (contado de EXTRA) em que ela bate no chão
const EXTRA_LANDS = 3;
const EXTRA_FROM = 11;
const paintExtra = (ctx: Ctx, o: Pt, can: [number, number, number, number]) => {
  const p = at(o, can[0], can[1], can[2]);
  if (can[3] === 2) sprite(ctx, p[0] - 2, p[1] - 4, CAN_TILT, GOLD);
  else lyingCan(ctx, p, can[3], GOLD);
};

// a batida: um estalo na quina que fecha, risquinhos de tremor dos dois
// lados e um pouco de poeira nos pés (f = 1, 2, 3: cada vez menos)
const slamMarks = (k: Kit, ctx: Ctx, o: Pt, f: number) => {
  const n = 4 - f;
  const left = at(o, BA, BD + 1, TOP - 4);
  const right = at(o, BA + BW, 0, TOP - 4);
  for (let i = 0; i < n; i += 1) {
    k.px(ctx, left[0] - 3 - i, left[1] + i * 3, PAPER, 2, 1);
    k.px(ctx, right[0] + 1 + i, right[1] + i * 3, PAPER, 2, 1);
  }
  if (f === 1) {
    const seam = at(o, BA + DW, BD + 1, 10);
    k.px(ctx, seam[0] - 1, seam[1], '#FFF3C4', 3, 1);
    k.px(ctx, seam[0], seam[1] - 1, '#FFF3C4', 1, 3);
    [-2, 2].forEach((dx) => [-2, 2].forEach((dy) => k.px(ctx, seam[0] + dx, seam[1] + dy, '#FFF3C4', 1, 1)));
  }
  const foot = at(o, BA, BD + 1, 0);
  const foot2 = at(o, BA + BW + 1, BD - 1, 0);
  k.px(ctx, foot[0] - 2 - f, foot[1] - 1, 'rgba(189,180,214,0.6)', 2, 1);
  k.px(ctx, foot2[0] + f, foot2[1] - 1, 'rgba(189,180,214,0.6)', 2, 1);
};

const paint: MoodItemArt['paint'] = (k, ctx, x, y, _env, tick, still) => {
  const o = anchor(k, x, y);
  const f = still ? -1 : pokeFrame(ID);
  const rest = f < 0;
  const deg = rest || f >= SLAM.length ? 90 : SLAM[f];

  // a luz no chão (acompanha a abertura da porta) e a lâmpada que pisca
  const flick = rest && !still && FLICKER.includes(tick % 60);
  if (deg > 20) spill(k, ctx, o, (flick ? 0.06 : 0.14) * Math.min(1, deg / 90));
  if (flick) dimInside(ctx, o);

  // a lata extra do toque; entrando debaixo do frigobar, ela vai antes do
  // corpo (que é pintado de novo por cima dela) e fica na sombra
  const step = rest ? -1 : f - EXTRA_FROM;
  const extra = step >= 0 && step < EXTRA.length ? EXTRA[step] : null;
  const under = extra !== null && extra[2] === 0 && extra[1] < BD + 2;
  if (extra && under) {
    paintExtra(ctx, o, extra);
    const p = at(o, extra[0], extra[1]);
    k.px(ctx, p[0] - 2, p[1] - 3, 'rgba(8,5,18,0.5)', 5, 3);
  }

  // o corpo, a porta e as latas de cima; quando a porta bate, tudo de novo
  // um pixel ao lado (o pulinho)
  const jolt = rest || f >= JOLT.length ? STILL_JOLT : JOLT[f];
  const hop = rest || f >= HOP.length ? STILL_JOLT : HOP[f];
  ctx.save();
  ctx.translate(jolt[0], jolt[1]);
  if (jolt[0] !== 0 || jolt[1] !== 0 || under) drawBody(k, ctx, o);
  paintDoor(k, ctx, o, deg);
  topCans(ctx, o, hop[0], hop[1]);
  ctx.restore();

  // as latas do chão, por cima da porta (estão na frente dela)
  if (extra && !under) paintExtra(ctx, o, extra);
  drawFloorCans(ctx, o);
  // a lata deitada: parada, de vez em quando rola um pixel para a frente (o
  // brilho gira) e volta; no toque, pula com a batida
  const r = tick % ROLL_EVERY;
  const rolling = rest && !still && r >= ROLL_AT && r < ROLL_AT + 3;
  const lp = at(o, CAN_L[0], CAN_L[1], rest ? 0 : hop[1]);
  lyingCan(ctx, shift(lp, 0, rolling && r === ROLL_AT + 1 ? 1 : 0), rolling && r !== ROLL_AT + 1 ? 1 : 0, RED);

  if (rest) return;
  if (f >= 1 && f <= 3) slamMarks(k, ctx, o, f);
  // a fresta: a luz escapa pela beirada da porta
  if (deg > 0 && deg < 20) {
    const gap = at(o, BA + DW, BD + 1, LEG);
    k.px(ctx, gap[0], gap[1] - 16, '#FFF3C4', 1, 16);
    k.poly(ctx, [at(o, BA + DW, BD + 1), at(o, BA + DW + 1, BD + 1), at(o, BA + DW + 3, BD + 6), at(o, BA + DW - 1, BD + 6)], 'rgba(255,248,222,0.2)');
  }
  // a lata extra bate no chão: um tlim
  if (step === EXTRA_LANDS) {
    const p = at(o, EXTRA[EXTRA_LANDS][0], EXTRA[EXTRA_LANDS][1]);
    k.px(ctx, p[0] + 3, p[1] - 5, '#FFF3C4', 1, 1);
    k.px(ctx, p[0] + 4, p[1] - 6, '#FFF3C4', 1, 1);
    k.px(ctx, p[0] - 4, p[1] - 5, '#FFF3C4', 1, 1);
  }
};

const ART: MoodItemArt = {
  w: FW / 12,
  d: FD / 12,
  // o mais alto, parado, é a lata em pé de cima (19 px acima do canto de
  // trás); no pulo da batida ela sobe mais 3
  h: TOP + 4,
  draw,
  paint,
};

export default ART;
