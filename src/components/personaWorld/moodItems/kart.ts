import { faceX, faceY, pokeFrame, sprite } from '../pixel';
import type { Ctx, Pt } from '../pixel';
import type { Kit } from '../studio';
import type { MoodDraw, MoodItemArt, MoodPaint } from './types';

// ----- O simulador de kart (17/11/2026): o móvel do humor Adrenalina (Z), que
// chega com a tag 🧨 Daredevil. Ideia do Bruno ("ideia melhor" que o assento
// ejetável, que fica de reserva): um simulador de kart de fliperama, em casa.
//
// Um kart baixo (chassi, banco concha com um adesivo de corrida, quatro pneus
// gordos, para-choque, volante, escapamento) e, na frente dele, um monitor de
// arcade num poste, com uma flâmula quadriculada no canto da viseira,
// mostrando uma pista em pixels: o asfalto com as duas faixas brancas fugindo
// para o horizonte, a faixa do meio tracejada, o gramado, o céu de fim de
// tarde e um sol dourado.
//
// Parado: a faixa do meio da pista corre (a estrada "anda") e a luzinha do
// painel, no miolo do volante, pisca em verde.
// Toque: o motor ronca. Um clarão na tela, um estouro de fogo no escapamento,
// e por uns 2 s o kart treme (1 pixel), a flâmula tremula, saem baforadas de
// fumaça e a tela entra no "turbo" (a faixa do meio dispara, o gramado passa
// em listras, riscos de velocidade nas beiradas, o horizonte fica dourado e a
// luz do painel pisca em vermelho e ouro). Depois tudo volta ao normal.
// Cuidado com quem é sensível a luz piscando: tirando o clarão do começo (um
// só), nada de área grande troca de claro para escuro mais de 2 vezes por
// segundo (as listras do gramado, a flâmula e a luz mudam a cada 2 quadros).
//
// Por que o kart está de costas: a tela tem de olhar para uma face que quem
// olha vê (+x ou +y). No desenho de base, com o banco, o volante e a tela em
// linha ao longo de x, a tela fica no fundo (x menor), virada para +x, e o
// kart na frente dela, virado para o fundo. É a vista clássica do fliperama
// de corrida: por cima do ombro de quem pilota, olhando a pista na tela.
//
// O adesivo: um disco branco com o miolo vermelho, nas costas do banco (no
// bico ele ficaria virado para a tela, a face −x, que nunca aparece). Já foi
// um 8; saiu porque número é escrita (as regras de conteúdo dos móveis) e, a
// 2×, virava um "B" branco. O disco é simétrico: o objeto girado é desenhado
// espelhado e ele continua igual.
//
// A bandeira: já foi uma bandeirinha num mastro de 17 px atrás do kart, mas
// ela saía 4 px para fora do lugar e invadia o móvel vizinho. Virou uma
// flâmula pequena no canto da viseira do monitor, dentro do lugar.
//
// O chão é 1,1 × 1,3 (cabe num lugar de 1,3 × 1,3): com 0,9 de fundo, a tela e
// o kart ficavam miúdos demais para ler a pista e os pneus. O monitor fica no
// alto de um poste e o bico do kart passa por baixo dele, para o kart ganhar
// comprimento sem sair do lugar.
//
// O desenho abaixo é feito ao longo de x (1,3 × 1,1: a tela à esquerda, o kart
// à direita) e entregue espelhado (mirrored, no fim do arquivo): 1,1 × 1,3, a
// tela à direita, virada para +y, e o kart à esquerda. É que no lugar de
// costume (11) o vizinho da direita, o frigobar (12), fica na frente e, aberto,
// tapava o banco e o adesivo; espelhado, o que tapa é só um pedaço dos pneus
// da frente. Girado pela pessoa, os dois espelhos se desfazem e volta o
// desenho de base.

// As medidas, em doze avos de ladrilho: 1 unidade = 1 pixel na tela ao longo
// de x (e meio para baixo). Assim cada peça cai em pixel inteiro.
const U = 1 / 12;
const DEEP = 13.2;

const RED = '#E0283A';
const MOOD = '#F87171';
const EDGE = '#150E26';
const PAPER = '#F3EAD3';
const GOLD = '#F4C454';
const MIST = '#BDB4D6';
const RUBBER = '#1B1724';
const TREAD = '#3A3346';
const WALL = '#2A2433';
const RIM = '#A9A2C4';
const HUB = '#5E5778';
const CASE = '#40365C';
const STEEL = '#4A4260';
const LED = '#4ADE80';

// O monitor: o corpo tem 3 de fundo e fica de z = 10 a 22; a viseira (na cor
// do humor) passa 1 unidade à frente da tela, como a de um fliperama.
const MON = { z: 10, h: 12, cols: 13 };
// a ponta do escapamento, ao lado do banco
const PIPE = { x: 14.6, y: 3.6, z: 4 };
// o miolo do volante (onde mora a luzinha do painel)
const WHEEL = { x: 7.5, y: 4.5, z: 7 };

// O canto de trás arredondado para o pixel inteiro mais perto: o lugar de um
// objeto pode cair em fração de pixel, e as caixas (k.box) e as faces (faceX,
// faceY) arredondam cada uma do seu jeito; com o canto inteiro, todas
// concordam, no parado, no girado e no que se mexe.
const snap = (k: Kit, x: number, y: number): [number, number] => {
  const p = k.iso(x, y);
  const dx = Math.round(p[0]) - p[0];
  const dy = Math.round(p[1]) - p[1];
  return [x + (dx / 12 + dy / 6) / 2, y + (dy / 6 - dx / 12) / 2];
};

// k.box em unidades (a partir do canto de trás do objeto)
type Box = (x0: number, y0: number, z0: number, w: number, d: number, h: number, c: string) => void;
const boxer =
  (k: Kit, ctx: Ctx, x: number, y: number): Box =>
  (x0, y0, z0, w, d, h, c) =>
    k.box(ctx, x + x0 * U, y + y0 * U, z0, w * U, d * U, h, c);

// Um desenho na face +x, escrito como se lê (da esquerda para a direita, de
// cima para baixo): na face, u cresce para a esquerda.
const glyphX = (ctx: Ctx, o: Pt, u0: number, v0: number, rows: string[], pal: Record<string, string>) => {
  const n = rows.length;
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      const color = pal[row[c]];
      if (color) faceX(ctx, o, u0 + row.length - 1 - c, v0 + n - 1 - r, 1, 1, color);
    }
  });
};

// Um pneu gordo (o eixo ao longo de y): camadas da banda de rodagem, de trás
// para a frente, cada uma um pixel para a esquerda, com os cantos cortados (o
// redondo) e a beirada de cima mais clara; na última, a lateral com a roda
// prateada. Os do lado de lá mostram só a borracha (a roda fica do outro lado).
const tire = (k: Kit, ctx: Ctx, x: number, y: number, x0: number, y0: number, len: number, dia: number, rim: boolean) => {
  const thick = 3;
  for (let s = 0; s <= thick; s += 1) {
    const o = k.iso(x + x0 * U, y + (y0 + s) * U, 0);
    const side = s === thick;
    for (let c = 0; c < len; c += 1) {
      const cut = c === 0 || c === len - 1 ? 1 : 0;
      faceY(ctx, o, c, cut, 1, dia - cut * 2, side ? WALL : RUBBER);
      if (!side) faceY(ctx, o, c, dia - cut - 1, 1, 1, TREAD);
    }
    if (side && rim) {
      const r = dia >= 6 ? 4 : 3;
      const hu = Math.floor((len - r) / 2);
      const hv = Math.floor((dia - r) / 2);
      for (let c = 0; c < r; c += 1) {
        const cut = r === 4 && (c === 0 || c === r - 1) ? 1 : 0;
        faceY(ctx, o, hu + c, hv + cut, 1, r - cut * 2, RIM);
      }
      faceY(ctx, o, hu + 1, hv + 1, r - 2, r - 2, HUB);
    }
  }
};

// O corpo do kart, de trás para a frente: o chassi, o bico (com a faixa
// branca), o volante, o banco com o adesivo, o para-choque e o escapamento. lift = quantos pixels acima (o tremor do motor, no toque).
const body = (k: Kit, ctx: Ctx, x: number, y: number, lift: number) => {
  const B = boxer(k, ctx, x, y);
  B(2.5, 3.5, 1 + lift, 12, 6, 1, STEEL);
  B(1.5, 4, 1 + lift, 4.5, 5, 3, RED);
  const z = 4 + lift;
  k.poly(ctx, [k.iso(x + 1.5 * U, y + 6 * U, z), k.iso(x + 6 * U, y + 6 * U, z), k.iso(x + 6 * U, y + 7 * U, z), k.iso(x + 1.5 * U, y + 7 * U, z)], PAPER);
  // o volante, de frente para o banco: um aro escuro na coluna
  const wh = k.iso(x + WHEEL.x * U, y + WHEEL.y * U, WHEEL.z + lift);
  k.px(ctx, wh[0] - 2, wh[1] + 1, EDGE, 1, 3);
  faceX(ctx, wh, 1, 0, 2, 1, EDGE);
  faceX(ctx, wh, 0, 1, 1, 2, EDGE);
  faceX(ctx, wh, 3, 1, 1, 2, EDGE);
  faceX(ctx, wh, 1, 3, 2, 1, EDGE);
  faceX(ctx, wh, 1, 1, 2, 2, '#3A3150');
  // o banco concha: o assento, o encosto alto (de beirada na cor do humor) e,
  // nas costas, o adesivo: um disco branco de miolo vermelho, simétrico. Vai
  // reto, sem a inclinação da face: inclinado, o disco se quebrava e virava
  // um "C" (e letra é o que ele não pode parecer).
  B(9, 4, 2 + lift, 3, 5, 2, k.dark(RED, 0.35));
  B(12, 3.5, 2 + lift, 2, 6, 10, RED);
  B(12, 3.5, 12 + lift, 2, 6, 1, MOOD);
  const back = k.iso(x + 14 * U, y + 3.5 * U, 2 + lift);
  sprite(ctx, back[0] - 6, back[1] - 7, ['.PPP.', 'PPPPP', 'PPRPP', 'PPPPP', '.PPP.'], { P: PAPER, R: RED });
  B(14, 4, 1 + lift, 1.6, 5, 2, k.dark(RED, 0.1));
  // a boca do escapamento, de frente para quem olha
  const tip = k.iso(x + PIPE.x * U, y + PIPE.y * U, PIPE.z + lift);
  k.px(ctx, tip[0], tip[1] - 3, MIST, 3, 3);
  k.px(ctx, tip[0], tip[1] - 1, '#7A7396', 3, 1);
  k.px(ctx, tip[0] + 1, tip[1] - 2, EDGE, 1, 1);
};

// os dois pneus do lado de cá e, entre eles, o pontão vermelho
const nearSide = (k: Kit, ctx: Ctx, x: number, y: number) => {
  tire(k, ctx, x, y, 3, 9.5, 5, 5, true);
  k.box(ctx, x + 8 * U, y + 9.5 * U, 1, 2 * U, 2.5 * U, 3, RED);
  tire(k, ctx, x, y, 10, 9.5, 6, 6, true);
};

// A flâmula quadriculada (4 × 3) num toquinho de mastro, no canto da viseira
// que fica sobre o kart: dentro do lugar, e o ponto mais alto do móvel.
// Tremulando, o xadrez troca de casa.
const pennant = (k: Kit, ctx: Ctx, x: number, y: number, flip: boolean) => {
  const foot = k.iso(x + 3.5 * U, y + 0.5 * U, MON.z + MON.h + 2);
  k.px(ctx, foot[0], foot[1] - 4, '#8D86A8', 1, 4);
  sprite(ctx, foot[0] + 1, foot[1] - 4, ['KWKW', 'WKWK', 'KWKW'], flip ? { K: PAPER, W: EDGE } : { K: EDGE, W: PAPER });
};

// A tela (11 × 9, como se lê): o céu com uma estrela, o sol dourado no
// horizonte (na cor do humor), o gramado e a pista. l = as faixas das beiradas
// (brancas) e c = a faixa do meio, tracejada (corre com phase).
const SCREEN = ['sssssssPsss', 'SSSSSoSSSSS', 'hhhhooohhhh', 'gggggrggggg', 'gggglrlgggg', 'ggglrcrlggg', 'gglrrcrrlgg', 'glrrrcrrrlg', 'lrrrrcrrrrl'];
const SCREEN_W = 11;
const screenFace = (k: Kit, x: number, y: number) => k.iso(x + 3 * U, y, MON.z);
const paintScreen = (k: Kit, ctx: Ctx, x: number, y: number, phase: number, turbo: boolean) => {
  const rows = SCREEN.map((row, r) =>
    row.replace(/./g, (ch, c: number) => {
      if (ch === 'c') return (r + phase) % 3 === 0 ? 'r' : 'l';
      if (ch === 'g' && turbo) {
        // no turbo: riscos de velocidade nas beiradas e o gramado em listras
        if ((c === 0 || c === SCREEN_W - 1) && r === 3 + (phase % 6)) return 'l';
        // (as listras trocam a cada 2 quadros: área grande, nada de piscar rápido)
        if ((r + (phase >> 1)) % 2 === 0) return 'G';
      }
      return ch;
    }),
  );
  glyphX(ctx, screenFace(k, x, y), 1, 2, rows, {
    s: '#1E1A52',
    S: '#45307E',
    P: PAPER,
    o: turbo ? PAPER : GOLD,
    h: turbo ? GOLD : MOOD,
    g: '#1F6E48',
    G: '#2A8A57',
    r: '#615A7E',
    l: PAPER,
  });
};

// Uma baforada de fumaça, da saída do cano até se desfazer: nasce um ponto
// claro, engorda, escurece e se esfarela (cores cheias, sem transparência,
// para ler como fumaça de pixel e não como um borrão cinza).
const PUFFS = [['P'], ['PM', 'MM'], ['.P.', 'PMM', '.MM'], ['.PM.', 'PMMM', 'MMMD', '.MD.'], ['.D.D', 'D...', '...D', 'D.D.']];
const PUFF_AGE = [0, 1, 1, 2, 2, 3, 3, 4, 4];
const PUFF_COLORS = { P: PAPER, M: MIST, D: '#77708F' };

// o desenho de base (ao longo de x; ver mirrored)
const drawKart: MoodDraw = (k, ctx, x0, y0) => {
  const [x, y] = snap(k, x0, y0);
  const B = boxer(k, ctx, x, y);
  // o monitor: o pé, o poste, o corpo, a viseira e a moldura escura da tela
  B(0, 4, 0, 3, 5, 1, '#2A2238');
  B(0, 5.5, 1, 1.5, 2, MON.z - 1, '#6A6288');
  B(0, 0, MON.z, 3, DEEP, MON.h, CASE);
  B(0, 0, MON.z + MON.h, 4, DEEP, 2, MOOD);
  const face = screenFace(k, x, y);
  faceX(ctx, face, 0, 0, MON.cols, MON.h, '#17112A');
  // a beirada da viseira em xadrez, como a faixa de largada
  const lip = k.iso(x + 4 * U, y, MON.z + MON.h);
  for (let i = 0; i < MON.cols; i += 1) {
    faceX(ctx, lip, i, 0, 1, 1, i % 2 ? PAPER : EDGE);
    faceX(ctx, lip, i, 1, 1, 1, i % 2 ? EDGE : PAPER);
  }
  paintScreen(k, ctx, x, y, 0, false);
  pennant(k, ctx, x, y, false);
  // a sombra do kart no chão
  k.poly(ctx, [k.iso(x + 3 * U, y + 2.5 * U), k.iso(x + 15 * U, y + 2.5 * U), k.iso(x + 15 * U, y + 12 * U), k.iso(x + 3 * U, y + 12 * U)], 'rgba(8,5,18,0.35)');
  // o kart: os pneus do lado de lá, o corpo e os do lado de cá
  tire(k, ctx, x, y, 3, 0.5, 5, 5, false);
  tire(k, ctx, x, y, 10, 0.5, 6, 6, false);
  body(k, ctx, x, y, 0);
  nearSide(k, ctx, x, y);
};

// o toque: o turbo dura 18 quadros (2,25 s); a fumaça some um pouco depois
const TURBO = 18;

const paintKart: MoodPaint = (k, ctx, x0, y0, _env, tick, still) => {
  const [x, y] = snap(k, x0, y0);
  const f = still ? -1 : pokeFrame('kart');
  const turbo = f >= 0 && f < TURBO;
  // a tela: o clarão nos dois primeiros quadros, depois a pista (no turbo, a mil)
  const face = screenFace(k, x, y);
  if (f === 0 || f === 1) {
    if (f === 0) faceX(ctx, face, -1, -1, MON.cols + 1, MON.h + 2, 'rgba(255,243,196,0.3)');
    faceX(ctx, face, 1, 2, SCREEN_W, SCREEN.length, f === 0 ? PAPER : '#FFE7B0');
  } else {
    paintScreen(k, ctx, x, y, still ? 0 : turbo ? f : tick >> 1, turbo);
  }
  // o motor treme: o corpo sobe um pixel, quadro sim, quadro não (os pneus ficam no chão)
  const lift = turbo && f % 2 === 0 ? 1 : 0;
  if (lift) {
    body(k, ctx, x, y, 1);
    nearSide(k, ctx, x, y);
  }
  // a flâmula tremula e a luzinha do painel pisca em vermelho e ouro (a cada
  // 2 quadros); fora do turbo, a luzinha é verde e pisca devagar
  if (turbo) pennant(k, ctx, x, y, (f >> 1) % 2 === 1);
  const wh = k.iso(x + WHEEL.x * U, y + WHEEL.y * U, WHEEL.z + lift);
  if (turbo) faceX(ctx, wh, 1, 2, 1, 1, (f >> 1) % 2 ? GOLD : RED);
  else if (still || tick % 16 < 8) faceX(ctx, wh, 1, 2, 1, 1, LED);
  if (f < 0) return;
  // o estouro no escapamento e as baforadas, que sobem e se abrem
  const tip = k.iso(x + PIPE.x * U, y + PIPE.y * U, PIPE.z + lift);
  if (f === 0) sprite(ctx, tip[0] + 1, tip[1] - 4, ['.OO.', 'GPPO', 'OGG.'], { O: '#FB923C', G: GOLD, P: PAPER });
  if (f === 1) sprite(ctx, tip[0] + 2, tip[1] - 3, ['GO', 'O.'], { O: '#FB923C', G: GOLD });
  // uma baforada a cada 2 quadros; cada uma sobe reto, ao lado do banco, e se
  // desfaz em 9
  for (let i = 0; i < 7; i += 1) {
    const age = f - 1 - i * 2;
    if (age < 0 || age >= PUFF_AGE.length) continue;
    const shape = PUFFS[PUFF_AGE[age]];
    const cx = tip[0] - (i % 2);
    const top = tip[1] - 4 - Math.round(age * 1.5);
    sprite(ctx, cx - (shape[0].length >> 1), top - shape.length, shape, PUFF_COLORS);
  }
};

// O desenho de base tem 1,3 ao longo de x e 1,1 ao longo de y. Entregue
// espelhado em volta do meio do chão (como o motor faz com um objeto girado,
// withTurn em studio.ts), ele vira 1,1 × 1,3, com a tela virada para +y.
const BASE = { w: 1.3, d: 1.1 };
const mirrored = (k: Kit, ctx: Ctx, x: number, y: number, run: (x: number, y: number) => void) => {
  const cx = x + BASE.d / 2;
  const cy = y + BASE.w / 2;
  const axis = Math.round(k.iso(cx, cy)[0] * 2);
  ctx.save();
  ctx.translate(axis, 0);
  ctx.scale(-1, 1);
  run(cx - BASE.w / 2, cy - BASE.d / 2);
  ctx.restore();
};

const ART: MoodItemArt = {
  w: BASE.d,
  d: BASE.w,
  // a flâmula, no alto da viseira, é o ponto mais alto (26 px)
  h: 26,
  draw: (k, ctx, x, y, env) => mirrored(k, ctx, x, y, (bx, by) => drawKart(k, ctx, bx, by, env)),
  paint: (k, ctx, x, y, env, tick, still) => mirrored(k, ctx, x, y, (bx, by) => paintKart(k, ctx, bx, by, env, tick, still)),
  // a folga cobre o meio pixel do arredondamento (snap)
  pad: 2,
};

export default ART;
