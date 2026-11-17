import { pokeFrame, sprite } from '../pixel';
import type { Ctx } from '../pixel';
import type { Kit } from '../studio';
import type { MoodDraw, MoodItemArt, MoodPaint } from './types';

// ----- A escultura impossível (17/11/2026): o móvel do humor Mind-Blowing (🧩 Enigmatic).
//
// Escolha do Bruno: um triângulo de Penrose (a tribarra impossível) de bronze
// polido (em ouro rosé: ver abaixo), num pedestal baixo de mármore escuro, com um pião que gira no
// vértice de cima e nunca cai (o aceno a um certo filme de sonhos dentro de
// sonhos: só o pião, nada mais).
//
// Parado: o pião gira (as listras dele dão a volta) e, de tempos em tempos,
// um brilho rosa corre pelo bronze e dá a volta inteira no triângulo, a volta
// que não poderia existir. Tocado: o pião bambeia, desacelera, quase cai pela
// beirada… e volta a girar firme, com um estalo de brilho; enquanto ele
// bambeia, a luz rosa dá duas voltas rápidas no triângulo.

// O chão: um pouco mais que o pedestal, para o vértice da esquerda da tribarra
// (que avança para fora dele) ainda caber no retângulo de toque.
const FOOT = 0.9;

// O desenho parado inteiro é um sprite, preso ao meio do chão arredondado para
// o pixel: a tribarra só se lê se cada degrau das barras cair no pixel certo, e
// com k.box em coordenadas quebradas (o lugar 3 começa em x = 4,6) ela "dança"
// um pixel de um lugar para outro.
//
// A tribarra é desenhada nos eixos da sala (o isométrico 2:1): uma barra ao
// longo de x, uma de pé (z) e uma ao longo de y, todas da mesma grossura. Num
// isométrico assim, andar o mesmo tanto em x, em y e em z volta ao mesmo ponto
// da tela, e é por isso que as três barras "fecham" um triângulo que não pode
// existir (por isso também ele tem um lado em pé, e não a base deitada do
// desenho clássico). As faces seguem a luz de toda a sala, como em k.box:
// tampo claro (T), face da direita média (X), face da esquerda escura (Y). Cada
// tom forma um "L" que dobra de uma barra para a outra; no vértice da esquerda
// o tampo de cima vira o tampo de baixo, e é ali que a figura se contradiz.
// Gerado a partir das três caixas e acertado à mão.
//
// Notas do diretor de arte (17/11/2026, noite): a 2× o bronze dourado se
// confundia com o ouro da máquina do Jackpot e o rosa do humor quase não
// aparecia. O bronze foi para o ouro rosé (tampo pêssego, face média cobre
// rosado, escuro vinho), com os três tons ainda bem separados para a ilusão
// continuar lendo, e o pedestal ganhou veios no rosa do humor e um friso rosa
// nas quinas do capitel e da base.
//
// H = o brilho do polido na aresta de cima, que perto do pião fica rosa (h: o
// bronze espelha o pião); x = a quina da barra de pé, polida, pegando luz; y =
// o reflexo no escuro da barra de baixo.
//
// O pedestal: capitel, fuste mais estreito e base, como os de museu, num
// mármore ameixa quase negro com veios rosa (a, b, c = tampo e faces, nas
// mesmas proporções de k.box; e = o friso rosa das quinas; v, w = os veios,
// u = um veio mais fundo; A = a sombra da barra no tampo). O escuro combina com
// as paredes roxas e se separa do chão verde-petróleo; o rosa dos veios e do
// friso é o do humor, como o pião.
const SCULPTURE = [
  '................hhhh..',
  '..............hhTTTTX.',
  '............hHTTTTxXX.',
  '..........HHTTTTXXxXX.',
  '........HHTTTTXXXXxXX.',
  '......HHTTTTXXXXXXxXX.',
  '....HHTTTTXXXXXXYYxXX.',
  '..HHTTTTXXXXXX.YYYxXX.',
  'HHTTTTXXXXXX...YYYxXX.',
  'YYTTTTTTXX.....YYYxXX.',
  'yYYYTTTTTT.....YYYxXX.',
  'YyYYYYTTTTTT...YYYxXX.',
  '..YyYYYYTTTTTT.YYYxXX.',
  '....YyYYYYTTTTTYYYxXX.',
  '......YyYYYYTTTYYYxXX.',
  '........YyYYYYTYYYxXX.',
  '......aaAAYyYYYYYYxXX.',
  '....aaaaawAAYyYYYYxXX.',
  '..aaaaaawaaaAAYyYYxXX.',
  '.eaaaaawaaaaaaAAYyxXe.',
  '.ceeaawaaaaaaaaaAeebb.',
  '..cccevaaaaaaaaeebbb..',
  '...cccvceeaaeebbbbb...',
  '...cccvcccbbbbbbbub...',
  '...ccccvcccbbbbbubb...',
  '..eccccvcccbbbbubbbe..',
  '.ceeccccvccbbbbbbbeeb.',
  '.ccceecccvbbbbbbeebbb.',
  '..cccccecvbbbbeebbbb..',
  '....cccccvcbeebbbb....',
  '......cccvcebbbb......',
  '........cccbbb........',
  '..........cb..........',
];
// onde o sprite começa, a partir do meio do chão
const OX = -11;
const OY = -28;
const MARBLE = '#3A2440';
const BRONZE: Record<string, string> = { h: '#FFBFDD', H: '#FFE2D4', T: '#EBAA82', X: '#A95A45', x: '#E39A86', Y: '#5A2630', y: '#77384A' };
const PINK = '#F472B6';

// o meio do chão, no pixel
const anchor = (k: Kit, x: number, y: number): [number, number] => {
  const c = k.iso(x + FOOT / 2, y + FOOT / 2);
  return [Math.round(c[0]), Math.round(c[1])];
};

const drawSculpture: MoodDraw = (k, ctx, x, y) => {
  const [ax, ay] = anchor(k, x, y);
  const top = k.light(MARBLE, 0.16);
  sprite(ctx, ax + OX, ay + OY, SCULPTURE, {
    ...BRONZE,
    a: top,
    b: k.dark(MARBLE, 0.12),
    c: k.dark(MARBLE, 0.3),
    e: '#D9559C',
    v: '#F472B6',
    w: '#FFA3D1',
    u: '#9C3D78',
    A: k.dark(top, 0.35),
  });
};

// ----- O brilho que dá a volta. Uma faixa de luz rosa atravessa a barra (como
// o reflexo correndo num metal polido) e anda de vértice em vértice: desce a
// barra de baixo, sobe a de pé, desce a de cima… e chega de volta ao começo.
// No desenho a volta fecha; no espaço ela não poderia fechar (como a escada
// sem fim): é o que faz a figura "explodir a cabeça", agora em movimento.
// Os pontos são o eixo de cada barra no sprite (o meio de cada pixel = +0,5).
const LOOP: [number, number][] = [
  [3, 10],
  [18, 17.5],
  [18, 2.5],
];
// Cada pixel de bronze ganha, uma vez só, o seu "lugar na volta": a distância,
// ao longo das barras, desde o vértice da esquerda (pela barra mais perto
// dele). A faixa de luz é o que está a até 2 pixels do ponto da volta em que
// a luz está (o miolo, a 1): corta a barra de lado a lado, nas duas faces.
const LOOP_SEGMENTS = LOOP.map((p, i) => {
  const q = LOOP[(i + 1) % LOOP.length];
  return { p, dx: q[0] - p[0], dy: q[1] - p[1], len: Math.hypot(q[0] - p[0], q[1] - p[1]) };
});
const LOOP_LEN = LOOP_SEGMENTS.reduce((sum, seg) => sum + seg.len, 0);
const SHINY = 'hHTXxYy';
const GLINT_MAP: [number, number, number, string][] = [];
SCULPTURE.forEach((row, r) => {
  for (let c = 0; c < row.length; c += 1) {
    if (!SHINY.includes(row[c])) continue;
    let best = Infinity;
    let at = 0;
    let start = 0;
    LOOP_SEGMENTS.forEach(({ p, dx, dy, len }) => {
      const t = Math.max(0, Math.min(1, ((c + 0.5 - p[0]) * dx + (r + 0.5 - p[1]) * dy) / (len * len)));
      const far = Math.hypot(c + 0.5 - (p[0] + dx * t), r + 0.5 - (p[1] + dy * t));
      if (far < best) {
        best = far;
        at = start + t * len;
      }
      start += len;
    });
    GLINT_MAP.push([c, r, at, row[c]]);
  }
});
// a cada 10 s (80 quadros), uma volta em 16 quadros (2 s)
const GLINT_EVERY = 80;
const GLINT_START = 12;
const GLINT_FRAMES = 16;
// o bronze sob a luz: o miolo quase branco, a beirada rosa (o reflexo do pião)
const GLINT_CORE: Record<string, string> = { h: '#FFFFFF', H: '#FFFFFF', T: '#FFF3F9', X: '#FFD9EC', x: '#FFD9EC', Y: '#F59ACA', y: '#F59ACA' };
const GLINT_EDGE: Record<string, string> = { h: '#FFD3E8', H: '#FFD3E8', T: '#FFC4E1', X: '#EE8CC0', x: '#EE8CC0', Y: '#B0507F', y: '#B0507F' };
const paintGlint = (ctx: Ctx, ox: number, oy: number, t: number) => {
  const g = t * LOOP_LEN;
  GLINT_MAP.forEach(([c, r, at, ch]) => {
    let d = Math.abs(at - g);
    d = Math.min(d, LOOP_LEN - d);
    if (d > 2.2) return;
    ctx.fillStyle = d < 1 ? GLINT_CORE[ch] : GLINT_EDGE[ch];
    ctx.fillRect(ox + c, oy + r, 1, 1);
  });
};

// ----- O pião, em pé no vértice de cima (a ponta toca o tampo da barra de pé).
// Visto um pouco de cima, como tudo na sala: a haste dourada, o tampo do pião
// (claro, uma elipse), a aba larga e o cone que afina até a ponta. Mais largo
// que alto, para ler como pião e não como pedra preciosa. O claro fica à
// direita e o escuro à esquerda, como nas faces das caixas.
const TOP_ROWS = [
  '...S...',
  '...s...',
  '.LLsLL.',
  'MPPPPLP',
  '.DPPLP.',
  '..DPL..',
  '...D...',
  '...K...',
];
const TOP_COLORS: Record<string, string> = { S: '#FFE08A', s: '#D9A53A', L: '#FFC1E0', P: PINK, M: '#D9559C', D: '#B43F7E', K: '#6E1D4C' };
// as listras: [linha, meia largura, atraso] (o atraso faz a espiral até a ponta)
const STRIPES: [number, number, number][] = [
  [3, 3, 0],
  [4, 2, 0.5],
  [5, 1, 1],
];
// a ponta, no sprite (o meio do tampo do vértice de cima)
const TIP_X = 18;
const TIP_Y = 1;
// O pião girando: duas listras escuras, opostas, dão a volta no corpo (angle,
// em radianos; 1/8 de volta por quadro = cada listra anda um pixel para a
// direita, some atrás e a outra aparece do lado esquerdo). lean = quanto a
// haste tomba (pixels; + = para a direita), slide = a ponta escorregando.
const paintTop = (ctx: Ctx, tx: number, ty: number, angle: number, lean: number, slide: number) => {
  const n = TOP_ROWS.length;
  // a sombrinha do pião no bronze
  ctx.fillStyle = BRONZE.X;
  ctx.fillRect(tx + slide - 1, ty, 1, 1);
  ctx.fillRect(tx + slide + 1, ty, 1, 1);
  // tombar é empurrar cada linha para o lado, mais quanto mais longe da ponta;
  // tombado de vez (3 px), o pião também fica mais baixo: a haste encolhe
  const shiftOf = (r: number) => Math.round((lean * (n - 1 - r)) / (n - 1));
  const low = Math.abs(lean) >= 3;
  TOP_ROWS.forEach((row, r) => {
    if (low && r === 1) return;
    const x0 = tx + slide - 3 + shiftOf(r);
    const y0 = ty - (n - 1) + r + (low && r === 0 ? 1 : 0);
    for (let c = 0; c < row.length; c += 1) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = TOP_COLORS[ch];
      ctx.fillRect(x0 + c, y0, 1, 1);
    }
  });
  ctx.fillStyle = TOP_COLORS.K;
  STRIPES.forEach(([r, half, lag]) => {
    for (let s = 0; s < 2; s += 1) {
      const a = angle - lag + s * Math.PI;
      // só a listra do lado de cá
      if (Math.cos(a) < -0.01) continue;
      ctx.fillRect(tx + slide + shiftOf(r) + Math.round(half * Math.sin(a)), ty - (n - 1) + r, 1, 1);
    }
  });
};
const SPIN = Math.PI / 4;

// ----- O toque: o pião bambeia para um lado e para o outro, cada vez mais,
// desacelera, quase cai pela beirada do vértice (para fora do triângulo, com a
// ponta escorregando até a quina)… e se endireita de uma vez, girando firme,
// com um estalo de brilho na haste. 16 quadros de bambeio + 3 de estalo = 2,4 s.
// Um item por quadro: [tombo da haste (px; + = para a direita), escorregão da
// ponta (px), lentidão do giro (1 = normal; 6 = quase parando)]
const WOBBLE: [number, number, number][] = [
  [1, 0, 1],
  [0, 0, 1],
  [-1, 0, 2],
  [-1, 0, 2],
  [0, 0, 2],
  [1, 0, 2],
  [2, 0, 2],
  [1, 0, 3],
  [-1, 0, 3],
  [-2, -1, 3],
  [-2, -1, 3],
  [0, 0, 4],
  [2, 1, 4],
  [3, 1, 5],
  [3, 2, 6],
  [3, 2, 6],
];
// o estalo, de pé de novo: uma estrelinha na ponta da haste, que cresce e some
const paintSpark = (ctx: Ctx, cx: number, cy: number, f: number) => {
  const arm = f + 1;
  ctx.fillStyle = f === 2 ? 'rgba(255,240,247,0.55)' : '#FFF0F7';
  ctx.fillRect(cx - arm, cy, 1, 1);
  ctx.fillRect(cx + arm, cy, 1, 1);
  ctx.fillRect(cx, cy - arm, 1, 1);
  if (f < 2) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx, cy, 1, 1);
  }
  if (f === 1) {
    ctx.fillStyle = PINK;
    ctx.fillRect(cx - 1, cy - 1, 1, 1);
    ctx.fillRect(cx + 1, cy - 1, 1, 1);
  }
};

const paintSculpture: MoodPaint = (k, ctx, x, y, _env, tick, still) => {
  const [ax, ay] = anchor(k, x, y);
  const ox = ax + OX;
  const oy = ay + OY;
  const tx = ox + TIP_X;
  const ty = oy + TIP_Y;
  if (still) {
    paintTop(ctx, tx, ty, SPIN, 0, 0);
    return;
  }
  const f = pokeFrame('sculpture');
  if (f >= 0 && f < WOBBLE.length) {
    const [lean, slide, slow] = WOBBLE[f];
    // a luz dá duas voltas rápidas no triângulo (uma por segundo): o impossível
    // aparece junto com o susto do pião. É uma faixa andando, não um clarão.
    paintGlint(ctx, ox, oy, (f % 8) / 8);
    paintTop(ctx, tx, ty, (tick * SPIN) / slow, lean, slide);
    return;
  }
  // a volta do brilho (de vez em quando)
  const g = (tick - GLINT_START) % GLINT_EVERY;
  if (g >= 0 && g < GLINT_FRAMES) paintGlint(ctx, ox, oy, g / GLINT_FRAMES);
  paintTop(ctx, tx, ty, tick * SPIN, 0, 0);
  // de pé de novo: o estalo
  const back = f - WOBBLE.length;
  if (back >= 0 && back < 3) paintSpark(ctx, tx, ty - (TOP_ROWS.length - 1), back);
};

const ART: MoodItemArt = {
  w: FOOT,
  d: FOOT,
  // do canto de trás do chão até a ponta da haste do pião (29) e o estalo do toque por cima (32)
  h: 32,
  // o pião tombado de vez chega a 14 px à direita do meio (o chão vai até 10,8):
  // a folga cobre, mesmo com o meio arredondado para o pixel do lado
  pad: 5,
  draw: drawSculpture,
  paint: paintSculpture,
};

export default ART;
