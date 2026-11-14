import { drawMoth, mothScale, type MothSpec } from '../personaWorld/draw';

// O Espectro Patrono (14/11/2026): a mariposa da pessoa, feita de luz.
//
// Pedido do Bruno: uma diretriz de design nova, "adaptada à nossa querida
// borboleta, o Espectro Patrono do usuário, como em Harry Potter". Na cabine
// (o modal Sua Persona) a mariposa é de carne e cor. Fora dela, quando o
// Oráculo precisa dizer alguma coisa sobre a pessoa, quem aparece é o Patrono:
// a mesma mariposa (a asa do humor mais forte, as faixas, os olhos), só que em
// luz clara, com uma aura da cor do que ela está indicando.
//
//   • Corpóreo: quem já tem Persona. A silhueta é a da mariposa da pessoa.
//   • Incorpóreo: quem ainda não tem. Uma fagulha de luz, como o Patrono que
//     ainda não tomou forma.
//
// Por que em luz, e não nas cores dos humores: o Patrono pousa em cima de
// escalas coloridas (vermelho = nota baixa, verde = nota boa). Uma asa
// vermelha de Adrenalina em cima de uma escala em que vermelho é "ruim"
// diria a coisa errada. A cor fica com a escala; a mariposa fica com a forma.
//
// Tudo aqui é pixel art no mesmo canvas pequeno da cabine, ampliado em escala
// inteira pelo CSS.

type Ctx = CanvasRenderingContext2D;

export interface Sprite {
  canvas: HTMLCanvasElement;
  // onde fica o centro do corpo dentro do desenho
  ax: number;
  ay: number;
}

// a cor do Patrono antes de indicar alguma coisa (o azul de "ainda sem nota" do site)
export const PATRONUS_SKY = '#7DD3FC';

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const blend = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const lum = (c: [number, number, number]) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

// As cores fixas que drawMoth usa (o resto são as cores dos humores).
const EDGE = key(0x15, 0x0e, 0x26);
const BODY_A = key(0x2b, 0x21, 0x40);
const BODY_B = key(0x3b, 0x2f, 0x57);
const PAPER = key(0xf3, 0xea, 0xd3);
const GOLD = key(0xf4, 0xc4, 0x54);
const MIST = key(0xbd, 0xb4, 0xd6);

// A luz do Patrono. O aparelho, que é matéria, tem contorno de tinta escura;
// o Patrono, que é luz, tem contorno de luz (um azul vivo) e miolo branco.
const RIM = rgb('#4A9CE8');
const PUPIL = rgb('#1B2459');
const BODY_LIGHT: [number, number, number] = [0xe6, 0xf3, 0xfe];
const BODY_DARK: [number, number, number] = [0xb9, 0xdc, 0xf9];
const ANTENNA: [number, number, number] = [0xd3, 0xea, 0xfd];
const WHITE: [number, number, number] = [255, 255, 255];
// três tons de asa: quase tudo branco; as faixas da pessoa aparecem como uma
// sombra azulada, e a borda de dentro como um azul um pouco mais fechado
const WING: [number, number, number][] = [rgb('#A9D4F8'), rgb('#DCEEFD'), rgb('#FFFFFF')];

// A mariposa da pessoa em luz. span = meia envergadura em pixels (igual para
// todo mundo, qualquer que seja a bitola); flap: 1 = asas abertas … 0.5 =
// fechando; tint = a cor da aura e das pintas (a do que o Patrono está
// indicando); gaze = para onde ela olha (-1 esquerda, 0 em frente, 1 direita).
export function patronusSprite(spec: MothSpec, span: number, flap: number, tint: string, gaze = 0): Sprite {
  const pad = 4;
  const w = span * 2 + pad * 2 + 2;
  const h = span * 2 + pad * 2 + 1;
  const ax = pad + span + 1;
  const ay = pad + span;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { canvas, ax, ay };
  drawMoth(ctx, ax, ay, span / mothScale(spec.stage), spec, flap, true);

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const tintRgb = rgb(tint);
  const rim = blend(RIM, tintRgb, 0.55);
  // as cores de asa deste desenho, da mais escura à mais clara
  const wingTones: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const k = key(data[i], data[i + 1], data[i + 2]);
    if (k === EDGE || k === BODY_A || k === BODY_B || k === PAPER || k === GOLD || k === MIST) continue;
    const l = Math.round(lum([data[i], data[i + 1], data[i + 2]]) * 255);
    if (!wingTones.includes(l)) wingTones.push(l);
  }
  wingTones.sort((p, q) => p - q);
  const toneOf = (l: number): number => {
    // a metade mais clara é branca; o tom mais escuro (a borda de dentro) é o azul
    const rank = wingTones.indexOf(l);
    if (wingTones.length <= 1) return 2;
    if (rank === 0) return 0;
    return rank >= wingTones.length / 2 ? 2 : 1;
  };
  const solid = new Uint8Array(w * h);
  const put = (i: number, color: [number, number, number]) => {
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = 255;
  };
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    if (data[i + 3] === 0) continue;
    solid[p] = 1;
    const k = key(data[i], data[i + 1], data[i + 2]);
    if (k === EDGE) put(i, rim);
    else if (k === BODY_A) put(i, blend(BODY_DARK, tintRgb, 0.15));
    else if (k === BODY_B) put(i, blend(BODY_LIGHT, tintRgb, 0.1));
    else if (k === PAPER) put(i, WHITE);
    // as pintas (os títulos de nota 9 e 10) na cor do que o Patrono indica
    else if (k === GOLD) put(i, blend(tintRgb, PUPIL, 0.1));
    else if (k === MIST) put(i, blend(ANTENNA, tintRgb, 0.15));
    else {
      const tone = toneOf(Math.round(lum([data[i], data[i + 1], data[i + 2]]) * 255));
      put(i, blend(WING[tone], tintRgb, [0.3, 0.12, 0][tone]));
    }
  }
  // a cara: a cabeça clara e dois pontos de olho, que olham para onde ela vai
  const top = Math.round(ay - span * 0.3);
  const face = (x: number, y: number, color: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    put((y * w + x) * 4, color);
    solid[y * w + x] = 1;
  };
  for (let y = top - 2; y <= top; y += 1) {
    for (let x = ax - 2; x <= ax + 1; x += 1) face(x, y, WHITE);
  }
  for (let x = ax - 2; x <= ax + 1; x += 1) face(x, top - 3, rim);
  face(ax - 3, top - 2, rim);
  face(ax + 2, top - 2, rim);
  face(ax - 3, top - 1, rim);
  face(ax + 2, top - 1, rim);
  face(ax - 2 + (gaze > 0 ? 1 : 0), top - 1, PUPIL);
  face(ax + 1 - (gaze < 0 ? 1 : 0), top - 1, PUPIL);

  // a aura: dois anéis em volta da silhueta, na cor do que ela indica
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (solid[y * w + x]) continue;
      let near = 9;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !solid[yy * w + xx]) continue;
          const d = dx * dx + dy * dy;
          if (d < near) near = d;
        }
      }
      if (near > 5) continue;
      const i = (y * w + x) * 4;
      data[i] = tintRgb[0];
      data[i + 1] = tintRgb[1];
      data[i + 2] = tintRgb[2];
      data[i + 3] = near <= 2 ? 150 : 60;
    }
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, ax, ay };
}

// O Patrono incorpóreo: uma fagulha de luz. twinkle alterna as duas poses
// (um losango cheio e uma cruz com as pontas compridas).
export function wispSprite(twinkle: boolean, tint: string): Sprite {
  const size = 13;
  const c = 6;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, ax: c, ay: c };
  const tintRgb = rgb(tint);
  const css = (color: [number, number, number], alpha = 1) => `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = Math.abs(x - c);
      const dy = Math.abs(y - c);
      const d = dx + dy;
      const arm = (dx === 0 || dy === 0) && d <= 4;
      let color: string | null = null;
      if (twinkle) {
        if (d <= 1) color = css(WHITE);
        else if (arm && d <= 3) color = css(blend(WHITE, tintRgb, 0.3));
        else if (arm) color = css(blend(WHITE, tintRgb, 0.7));
        else if (d === 2) color = css(blend(WHITE, tintRgb, 0.55));
        else if (d === 3) color = css(tintRgb, 0.4);
        else if (d === 4 || (dx === 0 || dy === 0 ? d === 5 : false)) color = css(tintRgb, 0.17);
      } else if (d <= 1) color = css(WHITE);
      else if (d === 2) color = css(blend(WHITE, tintRgb, 0.35));
      else if (d === 3) color = css(blend(WHITE, tintRgb, 0.75));
      else if (d === 4) color = css(tintRgb, 0.4);
      else if (d === 5) color = css(tintRgb, 0.17);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { canvas, ax: c, ay: c };
}

// O clarão em que a fagulha vira mariposa (e o do 10): raios curtos saindo de
// um ponto. step 0, 1 e 2 = os três desenhos, do menor ao maior.
export function drawBurst(ctx: Ctx, x: number, y: number, step: number, color: string, core = '#FFFFFF') {
  const from = [1, 3, 6][step] ?? 6;
  const to = [3, 6, 8][step] ?? 8;
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  dirs.forEach(([dx, dy], index) => {
    const diagonal = index >= 4;
    const a = diagonal ? Math.round(from * 0.7) : from;
    const b = diagonal ? Math.round(to * 0.7) : to;
    for (let r = a; r <= b; r += 1) {
      // no último desenho só sobram as pontas
      if (step === 2 && r < b) continue;
      ctx.fillStyle = r === b ? color : core;
      ctx.fillRect(x + dx * r, y + dy * r, 1, 1);
    }
  });
  if (step === 0) {
    ctx.fillStyle = core;
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
}
