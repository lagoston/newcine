import { disc, faceX, pokeFrame, sprite, type Ctx, type Pt } from '../pixel';
import type { Kit } from '../studio';
import type { MoodDraw, MoodItemArt, MoodPaint } from './types';

// A cabana de cobertor (17/11/2026): o móvel do humor Família (🧚‍♂️ Peter Pan),
// escolhido pelo Bruno. É o forte de lençol que as crianças armam na sala para
// a sessão de cinema em família: um cobertor amarelo, na cor do humor, com a
// barra laranja, jogado por cima do encosto de duas cadeiras, afundando no
// meio e caindo em dobras até o chão. Na ponta da frente, a porta aberta (as
// abas amarradas dos dois lados) mostra o escuro lá de dentro, a lanterna acesa
// no chão e o travesseiro saindo para fora. Um varal de pisca-pisca corre pela
// beirada de cima do pano e desce a quina.
//
// Parado: as lampadinhas acendem e apagam devagar, em onda (a vez passa de uma
// para a seguinte a cada meio segundo), e a lanterna lá dentro respira.
// Toque (2,5 s): a lanterna acende forte (a porta clareia num estalo), o pano
// acende por dentro e uma estrela de luz aparece no teto da cabana, perto da
// cumeeira, com uma segunda estrela piscando logo à direita (a das histórias da
// Terra do Nunca, sem ninguém delas em cena); depois tudo volta ao normal.
//
// As escolhas, depois de seis provas na bancada:
//   • Tenda e não caixa. O pano caindo reto, com o tampo chato, parecia uma
//     coroa (ou um vaso); o "A" é o que se lê como tendinha a 2×.
//   • Em cima, o pano é chato na largura do encosto e só então cai. Num "A"
//     pontudo os pés da cadeira ficavam soltos no ar, como antenas.
//   • Os encostos têm o travessão em cima e uma travessa no meio (encosto de
//     escada). Só os dois pés liam como orelhas de bicho; com o travessão e sem
//     a travessa, como alça de bolsa; com as ripas em pé, como pente.
//   • A estrela é branca com borda laranja e um halo: branca pura, sobre o
//     amarelo aceso, sumia.
//   • O travesseiro são duas elipses (fofo); como caixa, parecia um torrão de
//     açúcar.
//   • No toque, nada de luz derramada no chão: sobre o chão escuro ela virava
//     uma mancha. Quem pega a luz é o travesseiro.
//
// Notas do diretor de arte (17/11/2026, noite), aplicadas:
//   • Era o objeto mais claro da sala (luminância média 0,51, contra 0,22 da
//     máquina do Jackpot, que tem de continuar a coisa que mais chama). O pano
//     escureceu um tom inteiro (tampo, encosta e empena; agora 0,38) e o
//     #FACC15 puro ficou só para a lampadinha amarela, o acento da cor do humor.
//   • O desenho é entregue espelhado (mirrored, no fim do arquivo), como o do
//     kart: a porta fica na face +y. Na fileira da frente a face +y nunca fica
//     tapada; com a porta em +x, o vizinho do lugar 11 (o kart) a cobria. A
//     estrela do toque subiu para perto da cumeeira, que o vizinho não tapa.
//   • O travesseiro era o ponto mais branco da sala e a 2× parecia nuvem: ficou
//     menor e cor de papel.
//   • Saíram as estrelinhas de 1 pixel da estampa e as dobras de tensão do
//     tampo (não liam a 2×), e as cores repetidas se juntaram: as lampadinhas
//     apagadas têm uma cor só, o fio é da cor da madeira escura, a dobra da
//     encosta é da cor da empena, e o halo só acende na lampadinha da crista da
//     onda (de 42 cores para 21).
//
// Coordenadas do desenho de base, em ladrilhos a partir do canto de trás do
// chão: a cumeeira corre ao longo de x, de XB (a cadeira de trás) a XE (a da
// frente, onde fica a porta); o pano vai de YC - HB a YC + HB no chão.

// o chão do desenho de base (ao longo de x, y); entregue espelhado, vira D × W
const W = 1.3;
const D = 1.25;
const XB = 0.06;
const XE = 1.0;
const LEN = XE - XB;
const YC = 0.62;
// meia largura do encosto (o pano é chato em cima nessa largura) e meia largura do pano no chão
const RW = 0.22;
const HB = 0.6;
// a altura do pano nas cadeiras e quanto ele afunda no meio
const H = 15;
const SAG = 3;
// a porta: meia largura e altura no meio
const DW = 0.3;
const DOOR_H = 10;

const MOOD = '#FACC15';
const PAPER = '#F3EAD3';
const MIST = '#BDB4D6';
const C_TOP = '#EDC43C';
const C_SLOPE = '#D4A214';
const C_GABLE = '#C99210';
const C_FOLD_L = '#EBC548';
const C_HEM = '#9A6408';
const STRIPE = '#EE7424';
const STRIPE_G = '#D45E1C';
const TIE = '#E5484D';
const WOOD = '#C99B62';
const WOOD_D = '#7A5230';
const WOOD_L = '#EBC593';
const INSIDE = '#2A140C';
const GLOW_1 = '#5A2C10';
const BULB_OFF = '#6B4A1E';

// a altura da beirada de cima do pano: s = da cadeira de trás (0) à da frente (1)
const ridge = (s: number) => H - SAG * Math.sin(Math.PI * s);
// um ponto na encosta da frente: t = da beirada de cima (0) à barra, no chão (1)
const slopePt = (k: Kit, x: number, y: number, s: number, t: number): Pt => k.iso(x + XB + s * LEN, y + YC + RW + t * (HB - RW), ridge(s) * (1 - t));
// um ponto no fundo do tampo (o pano por cima dos encostos)
const backPt = (k: Kit, x: number, y: number, s: number): Pt => k.iso(x + XB + s * LEN, y + YC - RW, ridge(s));

// uma linha de pixels de a até b (sag = quanto ela barriga no meio, para o fio)
const line = (k: Kit, ctx: Ctx, a: Pt, b: Pt, c: string, sag = 0) => {
  const ax = Math.round(a[0]);
  const ay = Math.round(a[1]);
  const bx = Math.round(b[0]);
  const by = Math.round(b[1]);
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1);
  for (let i = 0; i <= n; i += 1) {
    const dip = Math.round(sag * Math.sin((Math.PI * i) / n));
    k.px(ctx, Math.round(ax + ((bx - ax) * i) / n), Math.round(ay + ((by - ay) * i) / n) + dip, c, 1, 1);
  }
};

// A empena da frente (a face +x do desenho de base, em XE), coluna a coluna
// (u = y × 12): a altura do pano em cada coluna e a da porta (um arco no meio).
const dist = (u: number) => Math.abs((u + 0.5) / 12 - YC);
const gableTop = (u: number) => (dist(u) <= RW ? H : Math.max(0, Math.round((H * (HB - dist(u))) / (HB - RW))));
const doorTop = (u: number) => (dist(u) >= DW ? 0 : Math.max(3, Math.round(DOOR_H * Math.sqrt(1 - (dist(u) / DW) ** 2))));
const DOOR_U: number[] = [];
for (let u = 0; u < Math.round(D * 12); u += 1) if (doorTop(u) > 0) DOOR_U.push(u);

// O encosto de uma cadeira saindo de cima do pano: os dois pés, a travessa e
// o travessão (encosto de escada; ver as escolhas lá em cima).
const chair = (k: Kit, ctx: Ctx, x: number, y: number, cx: number) => {
  const o = k.iso(x + cx, y, 0);
  const a = Math.round((YC - RW) * 12);
  const b = Math.round((YC + RW) * 12) - 1;
  faceX(ctx, o, a, H, 1, 5, WOOD_D);
  faceX(ctx, o, b, H, 1, 5, WOOD);
  faceX(ctx, o, a + 1, H + 2, b - a - 1, 1, WOOD_D);
  faceX(ctx, o, a - 1, H + 4, b - a + 3, 2, WOOD);
  faceX(ctx, o, a - 1, H + 5, b - a + 3, 1, WOOD_L);
};

// O travesseiro, saindo pela porta (fofo: duas elipses, cor de papel com a
// sombra de névoa). lit = pegando a luz da lanterna (no toque).
const pillow = (k: Kit, ctx: Ctx, x: number, y: number, lit = false) => {
  const c = k.iso(x + XE + 0.08, y + YC + 0.26, 0);
  const cx = Math.round(c[0]);
  const cy = Math.round(c[1]);
  disc(ctx, cx, cy - 1, 3.5, 1.8, lit ? '#E0A86A' : MIST);
  disc(ctx, cx, cy - 2, 3.5, 1.8, lit ? '#FFE3B0' : PAPER);
};

// A lanterna, no chão lá dentro, à direita do travesseiro (para ele não a
// tapar). glow: 0 = fraca … 3 = acesa forte (o toque).
const LAMP_U = Math.round((YC - 0.18) * 12);
const lamp = (ctx: Ctx, o: Pt, glow: number) => {
  const warm = ['#6E3410', '#A85418', '#D9771F', '#FFB547'][glow];
  faceX(ctx, o, LAMP_U - 2, 0, 5, 3, warm);
  faceX(ctx, o, LAMP_U - 1, 0, 3, 5, warm);
  faceX(ctx, o, LAMP_U, 0, 1, 1, INSIDE);
  faceX(ctx, o, LAMP_U, 1, 1, 2, glow === 3 ? '#FFF6D8' : '#FFE9A8');
  faceX(ctx, o, LAMP_U, 3, 1, 1, INSIDE);
};

// O pisca-pisca: cinco lampadinhas pela beirada de cima da encosta (barrigando
// junto com o pano) e duas descendo a quina da frente. As amarelas, no amarelo
// puro do humor, intercaladas com as coloridas.
const BULB_COLORS = [MOOD, '#FF7AB6', '#6EE7F0', MOOD, '#8BEA7B', '#FF7AB6', MOOD];
const bulbs = (k: Kit, x: number, y: number): Pt[] => {
  const out: Pt[] = [];
  [0.08, 0.29, 0.5, 0.71, 0.92].forEach((s) => out.push(slopePt(k, x, y, s, 0.07)));
  [0.42, 0.72].forEach((t) => out.push(slopePt(k, x, y, 1, t)));
  return out;
};

// o contorno do pano que se vê de cima e da frente (o tampo e a encosta), para o brilho do toque
const clothPoly = (k: Kit, x: number, y: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i += 1) pts.push(backPt(k, x, y, i / 8));
  pts.push(slopePt(k, x, y, 1, 0), slopePt(k, x, y, 1, 1), slopePt(k, x, y, 0, 1), slopePt(k, x, y, 0, 0));
  return pts;
};

// De trás para a frente: a sombra, a cadeira de trás, o pano (a encosta de
// trás, o tampo, a encosta da frente), a empena com a porta, a cadeira da
// frente, o travesseiro e o varal.
const drawBase = (k: Kit, ctx: Ctx, x: number, y: number) => {
  k.poly(ctx, [k.iso(x + XB - 0.04, y + YC - HB), k.iso(x + XE + 0.14, y + YC - HB), k.iso(x + XE + 0.14, y + D - 0.01), k.iso(x + XB - 0.04, y + D - 0.01)], 'rgba(8,5,18,0.35)');
  chair(k, ctx, x, y, XB);
  const N = 10;
  const back: Pt[] = [];
  const top: Pt[] = [];
  const front: Pt[] = [];
  for (let i = 0; i <= N; i += 1) {
    back.push(backPt(k, x, y, i / N));
    front.push(slopePt(k, x, y, i / N, 0));
  }
  top.push(...back);
  // a encosta de trás quase não aparece (só tapa algum furo do afundado)
  back.push(k.iso(x + XE, y + YC - HB, 0), k.iso(x + XB, y + YC - HB, 0));
  k.poly(ctx, back, C_GABLE);
  for (let i = N; i >= 0; i -= 1) top.push(slopePt(k, x, y, i / N, 0));
  k.poly(ctx, top, C_TOP);
  front.push(slopePt(k, x, y, 1, 1), slopePt(k, x, y, 0, 1));
  k.poly(ctx, front, C_SLOPE);
  // as dobras da encosta (sombra e, ao lado, o vinco que pega luz)
  [0.32, 0.7].forEach((s) => {
    line(k, ctx, slopePt(k, x, y, s, 0.35), slopePt(k, x, y, s, 1), C_GABLE);
    line(k, ctx, slopePt(k, x, y, s + 0.07, 0.45), slopePt(k, x, y, s + 0.07, 1), C_FOLD_L);
  });
  // a barra laranja do cobertor
  for (let i = 0; i < N; i += 1) {
    line(k, ctx, slopePt(k, x, y, i / N, 0.8), slopePt(k, x, y, (i + 1) / N, 0.8), STRIPE);
    line(k, ctx, slopePt(k, x, y, i / N, 0.86), slopePt(k, x, y, (i + 1) / N, 0.86), STRIPE);
  }
  line(k, ctx, slopePt(k, x, y, 0, 1), slopePt(k, x, y, 1, 1), C_HEM);
  // o pano empoça no chão onde as dobras chegam
  [0.32, 0.7].forEach((s) => {
    const p = slopePt(k, x, y, s, 1);
    k.px(ctx, Math.round(p[0]) - 1, Math.round(p[1]) + 1, C_HEM, 3, 1);
  });
  // a empena da frente, com a barra e a porta (o escuro de dentro, a luz quente
  // no chão e a beirada clara das abas dobradas para trás)
  const o = k.iso(x + XE, y, 0);
  for (let u = 0; u < Math.round(D * 12); u += 1) {
    const t = gableTop(u);
    if (t <= 0) continue;
    faceX(ctx, o, u, 0, 1, t, C_GABLE);
    if (t > 3) faceX(ctx, o, u, 2, 1, 2, STRIPE_G);
    faceX(ctx, o, u, 0, 1, 1, C_HEM);
    const dt = doorTop(u);
    if (dt > 0) {
      faceX(ctx, o, u, 0, 1, dt, INSIDE);
      faceX(ctx, o, u, 0, 1, Math.min(dt, 3), GLOW_1);
      faceX(ctx, o, u, dt, 1, 1, PAPER);
    }
  }
  lamp(ctx, o, 1);
  // as fitas que amarram as abas e as dobras dos dois lados da porta
  const mid = Math.round(YC * 12);
  const side = Math.round(DW * 12);
  faceX(ctx, o, mid - side - 1, 4, 1, 1, TIE);
  faceX(ctx, o, mid + side, 4, 1, 1, TIE);
  faceX(ctx, o, mid - side - 3, 0, 1, 6, C_HEM);
  faceX(ctx, o, mid + side + 2, 0, 1, 5, C_HEM);
  chair(k, ctx, x, y, XE);
  pillow(k, ctx, x, y);
  // o varal: o fio (da cor da madeira escura) barrigando entre as lampadinhas,
  // todas apagadas (acendem em paint)
  const pts = bulbs(k, x, y);
  pts.forEach((p, i) => {
    if (i > 0) line(k, ctx, [pts[i - 1][0], pts[i - 1][1] - 1], [p[0], p[1] - 1], WOOD_D, i < 5 ? 1 : 0);
  });
  pts.forEach((p) => k.px(ctx, Math.round(p[0]), Math.round(p[1]), BULB_OFF, 1, 2));
};

// A estrela projetada: miolo branco e borda laranja (a luz atravessando o pano).
// Ela nasce pequena, cresce, fica, e encolhe de volta.
const STAR_BIG = ['....O....', '...OWO...', 'OOOOWOOOO', 'OWWWWWWWO', '.OWWWWWO.', '..OWWWO..', '.OWWOWWO.', '.OWO.OWO.', '.OO...OO.'];
const STAR_MID = ['...O...', '..OWO..', 'OOWWWOO', '.OWWWO.', '.OWOWO.', '.OO.OO.'];
const STAR_SMALL = ['.O.', 'OWO', '.O.'];
const STAR_COLORS = { W: '#FFFFFF', O: '#FF9F43' };
// quantos quadros dura a reação (2,5 s)
const POKE_LEN = 20;

const paintBase = (k: Kit, ctx: Ctx, x: number, y: number, tick: number, still: boolean) => {
  const f = still ? -1 : pokeFrame('fort');
  const poke = f >= 0 && f < POKE_LEN;
  const fade = f < 15 ? 1 : (POKE_LEN - f) / 5;
  const o = k.iso(x + XE, y, 0);
  if (poke) {
    // o pano acende por dentro (e apaga nos últimos cinco quadros)
    k.poly(ctx, clothPoly(k, x, y), `rgba(255,246,214,${((f < 2 ? 0.3 : 0.2) * fade).toFixed(2)})`);
    // a porta clareia: o estalo claro no primeiro quadro; depois claro embaixo
    // (a lanterna está no chão) e mais quente em cima
    const hot = f === 0 || f >= 15 ? 0 : 1;
    DOOR_U.forEach((u) => {
      const t = doorTop(u);
      faceX(ctx, o, u, 0, 1, t, f === 0 ? '#FFF6D8' : f < 15 ? '#C8641C' : '#8A4214');
      faceX(ctx, o, u, 0, 1, Math.min(t, 6), f === 0 ? '#FFF6D8' : ['#D9771F', '#F0A040'][hot]);
      faceX(ctx, o, u, 0, 1, Math.min(t, 3), f === 0 ? '#FFF6D8' : ['#F0A040', '#FFD98A'][hot]);
    });
    lamp(ctx, o, 3);
  } else {
    // a lanterna respira: um ciclo de 4 s, mais tempo acesa que fraca
    const breath = still ? 2 : [1, 1, 2, 2, 2, 1, 1, 0][(tick >> 2) % 8];
    lamp(ctx, o, breath);
  }
  // o travesseiro por cima da porta (e pegando a luz no toque)
  pillow(k, ctx, x, y, poke && f < POKE_LEN - 3);
  // as lampadinhas: cada uma fica acesa 2,5 s e apagada 1,5 s, a onda andando
  // uma lampadinha a cada meio segundo; a da crista da onda brilha mais (miolo
  // claro e um halo). Paradas (e no toque): todas acesas, sem halo.
  bulbs(k, x, y).forEach((p, i) => {
    const phase = ((((tick >> 2) - i) % 8) + 8) % 8;
    if (!still && !poke && phase >= 5) return;
    const bx = Math.round(p[0]);
    const by = Math.round(p[1]);
    const crest = !still && !poke && phase === 0;
    if (crest) {
      ctx.fillStyle = 'rgba(255,240,190,0.28)';
      ctx.fillRect(bx - 1, by - 1, 3, 4);
    }
    k.px(ctx, bx, by, BULB_COLORS[i], 1, 2);
    if (crest) k.px(ctx, bx, by + 1, PAPER, 1, 1);
  });
  // a estrela no teto da cabana, perto da cumeeira, com o halo da luz
  // atravessando o pano (do tamanho certo para não sair do pano); por cima das
  // lampadinhas, que ela atravessa
  if (poke && f >= 2 && f < POKE_LEN - 1) {
    const c = slopePt(k, x, y, 0.6, 0.25);
    const cx = Math.round(c[0]);
    const cy = Math.round(c[1]);
    const rows = f === 2 || f === POKE_LEN - 2 ? STAR_SMALL : f === 3 || f === POKE_LEN - 3 ? STAR_MID : STAR_BIG;
    const half = (rows[0].length - 1) / 2;
    disc(ctx, cx, cy, half + 2, half + 2, `rgba(255,250,228,${(0.4 * fade).toFixed(2)})`);
    sprite(ctx, cx - half, cy - half, rows, STAR_COLORS);
    // e a segunda estrela, piscando: à esquerda no desenho de base, que é a
    // direita de quem olha no desenho entregue (espelhado)
    if (f >= 5 && f < POKE_LEN - 3 && f % 4 !== 3) sprite(ctx, cx - 7, cy - 6, STAR_SMALL, STAR_COLORS);
  }
};

// O desenho de base tem W ao longo de x e D ao longo de y, com a porta em +x.
// Entregue espelhado em volta do meio do chão (como o motor faz com um objeto
// girado, withTurn em studio.ts, e como o kart), ele vira D × W, com a porta
// virada para +y. Girado pela pessoa, os dois espelhos se desfazem e volta o
// desenho de base, com a porta em +x.
const mirrored = (k: Kit, ctx: Ctx, x: number, y: number, run: (x: number, y: number) => void) => {
  const cx = x + D / 2;
  const cy = y + W / 2;
  const axis = Math.round(k.iso(cx, cy)[0] * 2);
  ctx.save();
  ctx.translate(axis, 0);
  ctx.scale(-1, 1);
  run(cx - W / 2, cy - D / 2);
  ctx.restore();
};

const draw: MoodDraw = (k, ctx, x, y) => mirrored(k, ctx, x, y, (bx, by) => drawBase(k, ctx, bx, by));
const paint: MoodPaint = (k, ctx, x, y, _env, tick, still) => mirrored(k, ctx, x, y, (bx, by) => paintBase(k, ctx, bx, by, tick, still));

const ART: MoodItemArt = {
  w: D,
  d: W,
  // o ponto mais alto é o travessão da cadeira de trás (H + 6 acima do chão, um pouco para dentro)
  h: 19,
  draw,
  paint,
};

export default ART;
