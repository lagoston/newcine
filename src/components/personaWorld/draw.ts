import { MOOD_BY_LETTER } from '../../lib/moods';
import { MIST, NIGHT, PAPER, VELVET } from '../../lib/oracleTheme';
import { LETTERS, type PersonaWorld, type WorldState, type WorldTitle } from '../../lib/personaWorld';

// O desenho da Persona viva (13/11/2026): a cabine de projeção isométrica em
// pixel art e a mariposa. Tudo é desenhado num canvas pequeno (160 × 142) e
// ampliado pelo CSS em escala inteira, com image-rendering: pixelated — a
// cara da era do Habbo Hotel que o Bruno pediu, sem imagem pronta nem 3D pago.
//
// Cada coisa da cena nasce de um dado de quem avaliou:
//   • estante (parede direita): as nove prateleiras, na ordem das letras. Uma
//     lata colorida = 1 título; lata clara = 10; lata clara com fita dourada =
//     100. Tampa dourada na lata colorida = nota 9 ou 10. As três prateleiras
//     do código ficam acesas;
//   • tela (parede esquerda): o personagem da Persona (a foto do TMDB reduzida
//     a 38 × 29 pixels; sem foto, um vulto);
//   • néon: as três letras do código;
//   • pôsteres: os últimos títulos de nota 10 (o pôster de verdade, reduzido);
//   • caixa de arquivo: os títulos de fora das prateleiras;
//   • cores da sala: as do trio (parede = a mais forte, chão = a segunda);
//   • mobília: um móvel por bitola (projetor, poltrona, tapete, abajur,
//     pipoqueira, cortina, tela grande, letreiro);
//   • mariposa: o formato da asa vem da prateleira mais forte; as faixas, das
//     fatias de cada humor nos últimos 30 títulos; cada olho é um título de
//     nota 9 ou 10; a ponta das antenas tem a cor da terceira prateleira.
// Antes de a Persona nascer: um ovo (nada avaliado) ou uma lagarta com um gomo
// por título de prateleira.

type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

export const GOLD = '#F4C454';
export const RW = 160;
export const RH = 142;
const CX = 80;
const OY = 62;
const HW = 12;
const HH = 6;
const NT = 6;
const WALL = 56;
const EDGE = '#150E26';

// ---------- cor ----------
const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mixCache = new Map<string, string>();
const mix = (a: string, b: string, t: number): string => {
  const key = `${a}${b}${t}`;
  const hit = mixCache.get(key);
  if (hit) return hit;
  const x = rgb(a);
  const y = rgb(b);
  const out = `#${[0, 1, 2]
    .map((i) => {
      const v = Math.max(0, Math.min(255, Math.round(x[i] + (y[i] - x[i]) * t)));
      return (v < 16 ? '0' : '') + v.toString(16);
    })
    .join('')}`;
  mixCache.set(key, out);
  return out;
};
const dark = (c: string, t: number) => mix(c, '#0A0616', t);
const light = (c: string, t: number) => mix(c, '#FFFFFF', t);
const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
const moodColor = (letter: string | null | undefined): string => (letter && MOOD_BY_LETTER[letter]?.color) || MIST;

// ---------- primitivas ----------
const px = (ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) => {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w, h);
};
// polígono preenchido por varredura (sem suavização)
const poly = (ctx: Ctx, pts: Pt[], c: string) => {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  ctx.fillStyle = c;
  for (let y = y0; y <= y1; y += 1) {
    const xs: number[] = [];
    const yc = y + 0.5;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.round(xs[k]);
      const xb = Math.round(xs[k + 1]);
      if (xb > xa) ctx.fillRect(xa, y, xb - xa, 1);
    }
  }
};

const iso = (x: number, y: number, z = 0): Pt => [CX + (x - y) * HW, OY + (x + y) * HH - z];

type Side = 'L' | 'R';
// retângulo no plano da parede: u = distância do canto, v = altura a partir do chão
const wallRect = (ctx: Ctx, side: Side, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) {
    const ux = u + d;
    const X = side === 'R' ? CX + ux : CX - 1 - ux;
    ctx.fillRect(X, OY + (ux >> 1) - v - h, 1, h);
  }
};
// uma imagem já reduzida (w × h pixels) pregada na parede, coluna a coluna
const wallImage = (ctx: Ctx, side: Side, u: number, v: number, image: HTMLCanvasElement) => {
  const w = image.width;
  const h = image.height;
  ctx.imageSmoothingEnabled = false;
  for (let d = 0; d < w; d += 1) {
    const ux = u + d;
    const X = side === 'R' ? CX + ux : CX - 1 - ux;
    // na parede esquerda o "u" cresce para a esquerda: a imagem entra espelhada no laço
    ctx.drawImage(image, side === 'R' ? d : w - 1 - d, 0, 1, h, X, OY + (ux >> 1) - v - h, 1, h);
  }
};
// ponto da tela → (u, v) da parede daquele lado
const wallPoint = (x: number, y: number): { side: Side; u: number; v: number } => {
  const xi = Math.floor(x);
  const side: Side = xi >= CX ? 'R' : 'L';
  const u = side === 'R' ? xi - CX : CX - 1 - xi;
  return { side, u, v: OY + (u >> 1) - y };
};
// caixa isométrica (x, y = canto de trás; w ao longo de x, d ao longo de y, h de altura)
const box = (ctx: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, c: string) => {
  const A = iso(x, y, z + h);
  const B = iso(x + w, y, z + h);
  const C = iso(x + w, y + d, z + h);
  const D = iso(x, y + d, z + h);
  const C0 = iso(x + w, y + d, z);
  const D0 = iso(x, y + d, z);
  const B0 = iso(x + w, y, z);
  poly(ctx, [D, C, C0, D0], dark(c, 0.3));
  poly(ctx, [B, C, C0, B0], dark(c, 0.12));
  poly(ctx, [A, B, C, D], light(c, 0.16));
};

const FONT5: Record<string, string[]> = {
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  X: ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X'],
  P: ['XXXX.', 'X...X', 'XXXX.', 'X....', 'X....'],
  A: ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X'],
  C: ['.XXXX', 'X....', 'X....', 'X....', '.XXXX'],
  Z: ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX'],
  R: ['XXXX.', 'X...X', 'XXXX.', 'X..X.', 'X...X'],
  F: ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....'],
  L: ['X....', 'X....', 'X....', 'X....', 'XXXXX'],
};

// ---------- geometria que o desenho e o toque compartilham ----------
// a área de imagem da tela (cresce com a "tela grande", bitola IMAX)
const screenRect = (stage: number) => (stage >= 8 ? { u: 5, v: 8, w: 43, h: 36 } : { u: 8, v: 13, w: 38, h: 29 });
export const SCREEN_SIZE = (stage: number): { w: number; h: number } => {
  const r = screenRect(stage);
  return { w: r.w, h: r.h };
};
export const POSTER_SIZE = { w: 7, h: 11 };
const POSTER_SLOTS: Pt[] = [
  [50, 26],
  [60, 26],
  [50, 10],
  [60, 10],
];
const shelfCell = (index: number) => ({ u: 6 + (index % 3) * 20, v: 4 + Math.floor((2 - Math.floor(index / 3)) * 15.5) });

// ---------- imagens de verdade (pôsteres e retrato), reduzidas a pixel ----------
// Recorta como object-fit: cover (com o ponto fx, fy no centro do recorte e um
// zoom opcional) e reduz por metades, para a miniatura sair limpa em vez de
// serrilhada.
export function shrinkCover(img: HTMLImageElement, w: number, h: number, fx = 0.5, fy = 0.5, zoom = 1): HTMLCanvasElement {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const scale = Math.max(w / W, h / H) * zoom;
  const sw = w / scale;
  const sh = h / scale;
  const sx = (W - sw) * fx;
  const sy = (H - sh) * fy;
  let cw = Math.max(w, Math.round(sw));
  let ch = Math.max(h, Math.round(sh));
  const make = (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d') as Ctx;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    return { canvas, context };
  };
  let cur = make(cw, ch);
  cur.context.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  while (cw > w || ch > h) {
    const nw = Math.max(w, Math.ceil(cw / 2));
    const nh = Math.max(h, Math.ceil(ch / 2));
    const next = make(nw, nh);
    next.context.drawImage(cur.canvas, 0, 0, cw, ch, 0, 0, nw, nh);
    cur = next;
    cw = nw;
    ch = nh;
  }
  return cur.canvas;
}

export interface SceneImages {
  // o retrato do personagem, já no tamanho da tela
  portrait: HTMLCanvasElement | null;
  // os pôsteres das notas 10 (7 × 11), na ordem de world.tens
  posters: (HTMLCanvasElement | null)[];
}
export const NO_IMAGES: SceneImages = { portrait: null, posters: [] };

// pôster de reserva (sem imagem): cores tiradas do nome do título
const miniPoster = (ctx: Ctx, side: Side, u: number, v: number, seed: string) => {
  const h = hash(seed);
  const hue = h % 360;
  const hue2 = (hue + 120 + ((h >> 9) % 120)) % 360;
  wallRect(ctx, side, u + 1, v + 1, 7, 11, `hsl(${hue},42%,24%)`);
  const kind = (h >> 4) % 3;
  if (kind === 0) {
    wallRect(ctx, side, u + 3, v + 6, 3, 4, `hsl(${hue2},70%,62%)`);
    wallRect(ctx, side, u + 2, v + 7, 5, 2, `hsl(${hue2},70%,62%)`);
  } else if (kind === 1) {
    wallRect(ctx, side, u + 1, v + 5, 7, 3, `hsl(${hue2},60%,55%)`);
    wallRect(ctx, side, u + 2, v + 8, 5, 2, `hsl(${hue2},60%,40%)`);
  } else {
    wallRect(ctx, side, u + 2, v + 4, 2, 7, `hsl(${hue2},65%,60%)`);
    wallRect(ctx, side, u + 5, v + 6, 2, 5, `hsl(${hue},55%,58%)`);
  }
  wallRect(ctx, side, u + 2, v + 2, 5, 1, PAPER);
};

// ---------- a cabine (a parte parada) ----------
export function drawRoom(ctx: Ctx, st: WorldState, world: PersonaWorld, images: SceneImages = NO_IMAGES) {
  const t1 = st.hasTrio ? moodColor(st.trio[0]) : '#6B5FA0';
  const t2 = st.hasTrio ? moodColor(st.trio[1]) : '#5A5390';
  const t3 = st.hasTrio ? moodColor(st.trio[2]) : '#8B7FC0';
  const wallR = mix(t1, VELVET, 0.8);
  const wallL = dark(wallR, 0.22);
  const floorA = mix(t2, NIGHT, 0.74);
  const floorB = dark(floorA, 0.14);
  ctx.clearRect(0, 0, RW, RH);

  // paredes, rodapé, friso e listras discretas do papel de parede
  wallRect(ctx, 'R', 0, 0, 72, WALL, wallR);
  wallRect(ctx, 'L', 0, 0, 72, WALL, wallL);
  wallRect(ctx, 'R', 0, WALL - 1, 72, 1, light(wallR, 0.22));
  wallRect(ctx, 'L', 0, WALL - 1, 72, 1, light(wallL, 0.18));
  wallRect(ctx, 'R', 0, 0, 72, 2, dark(wallR, 0.3));
  wallRect(ctx, 'L', 0, 0, 72, 2, dark(wallL, 0.3));
  for (let s = 5; s < 72; s += 6) {
    wallRect(ctx, 'R', s, 2, 1, WALL - 3, light(wallR, 0.05));
    wallRect(ctx, 'L', s, 2, 1, WALL - 3, light(wallL, 0.04));
  }
  px(ctx, CX - 1, OY - WALL, dark(wallL, 0.4), 2, WALL);

  // chão xadrez, pixel a pixel
  for (let py = OY; py < OY + NT * HH * 2 + 1; py += 1) {
    for (let qx = CX - NT * HW; qx < CX + NT * HW; qx += 1) {
      const dx = qx + 0.5 - CX;
      const dy = py + 0.5 - OY;
      const fx = (dx / HW + dy / HH) / 2;
      const fy = (dy / HH - dx / HW) / 2;
      if (fx >= 0 && fx < NT && fy >= 0 && fy < NT) px(ctx, qx, py, (Math.floor(fx) + Math.floor(fy)) % 2 ? floorA : floorB);
    }
  }
  // a borda da frente do chão
  for (let ex = 0; ex < NT * HW; ex += 1) {
    px(ctx, CX - NT * HW + ex, OY + NT * HH + (ex >> 1) + 1, dark(floorB, 0.45), 1, 3);
    px(ctx, CX + NT * HW - 1 - ex, OY + NT * HH + (ex >> 1) + 1, dark(floorB, 0.3), 1, 3);
  }

  // ---- parede direita: a estante das nove prateleiras (3 × 3, na ordem das letras) ----
  wallRect(ctx, 'R', 5, 3, 62, 48, '#3A2A4A');
  LETTERS.forEach((letter, m) => {
    const { u: u0, v: v0 } = shelfCell(m);
    const c = moodColor(letter);
    const inTrio = st.hasTrio && st.trio.includes(letter);
    wallRect(ctx, 'R', u0, v0, 19, 14, inTrio ? mix(c, NIGHT, 0.72) : '#191128');
    if (inTrio) {
      wallRect(ctx, 'R', u0, v0 + 13, 19, 1, c);
      wallRect(ctx, 'R', u0, v0, 1, 14, c);
      wallRect(ctx, 'R', u0 + 18, v0, 1, 14, c);
    }
    wallRect(ctx, 'R', u0, v0, 19, 1, '#57406B');
    wallRect(ctx, 'R', u0, v0 + 12, 2, 2, c);
    const n = st.films[letter] ?? 0;
    const hundreds = Math.floor(n / 100);
    const tens = Math.floor((n % 100) / 10);
    const units = n % 10;
    const lids = units ? (world.recent[letter] ?? []).slice(-units) : [];
    for (let item = 0; item < hundreds + tens + units && item < 18; item += 1) {
      const sx = u0 + 1 + (item % 6) * 3;
      const sv = v0 + 1 + Math.floor(item / 6) * 4;
      if (item < hundreds + tens) {
        wallRect(ctx, 'R', sx, sv, 2, 3, PAPER);
        wallRect(ctx, 'R', sx, sv, 2, 1, dark(PAPER, 0.3));
        if (item < hundreds) wallRect(ctx, 'R', sx, sv + 1, 2, 1, GOLD);
      } else {
        const rating = lids[item - hundreds - tens];
        wallRect(ctx, 'R', sx, sv, 2, 3, c);
        wallRect(ctx, 'R', sx, sv + 2, 2, 1, rating >= 9 ? GOLD : light(c, 0.4));
        wallRect(ctx, 'R', sx, sv, 2, 1, dark(c, 0.35));
      }
    }
  });

  // ---- parede esquerda: a tela, o néon com o código e os pôsteres das notas 10 ----
  const screen = screenRect(st.stage);
  wallRect(ctx, 'L', screen.u - 1, screen.v - 1, screen.w + 2, screen.h + 2, '#0B0716');
  wallRect(ctx, 'L', screen.u, screen.v, screen.w, screen.h, st.hasTrio ? mix(t3, '#0B0716', 0.55) : '#15102A');
  if (st.hasTrio && st.code) {
    if (images.portrait && images.portrait.width === screen.w && images.portrait.height === screen.h) {
      wallImage(ctx, 'L', screen.u, screen.v, images.portrait);
    } else {
      // sem a foto: um vulto nas cores da Persona
      const bust = mix(t1, PAPER, 0.3);
      const face = mix(t1, PAPER, 0.6);
      const bu = screen.u + ((screen.w - 20) >> 1);
      wallRect(ctx, 'L', bu, screen.v + 1, 20, 6, bust);
      wallRect(ctx, 'L', bu + 2, screen.v + 7, 16, 2, bust);
      wallRect(ctx, 'L', bu + 7, screen.v + 9, 6, 2, face);
      wallRect(ctx, 'L', bu + 6, screen.v + 11, 8, 8, face);
      wallRect(ctx, 'L', bu + 7, screen.v + 19, 6, 1, face);
      wallRect(ctx, 'L', bu + 6, screen.v + 17, 8, 3, dark(bust, 0.25));
    }
    // as linhas de varredura da projeção
    for (let sl = screen.v + 2; sl < screen.v + screen.h; sl += 3) wallRect(ctx, 'L', screen.u, sl, screen.w, 1, 'rgba(255,255,255,0.05)');
    // néon com o código
    for (let ci = 0; ci < 3; ci += 1) {
      const glyph = FONT5[st.code[ci]];
      const cc = moodColor(st.code[ci]);
      const uL = 38 - ci * 8;
      if (!glyph) continue;
      wallRect(ctx, 'L', uL - 5, 45, 7, 7, `rgba(${rgb(cc).join(',')},0.16)`);
      for (let gy = 0; gy < 5; gy += 1) {
        for (let gx = 0; gx < 5; gx += 1) {
          if (glyph[gy][gx] === 'X') wallRect(ctx, 'L', uL - gx, 46 + (4 - gy), 1, 1, light(cc, 0.25));
        }
      }
    }
  }
  if (st.stage >= 7) {
    // a cortina da tela (70 mm): dois panos de veludo e o bandô
    const velvet = '#8E1F2F';
    wallRect(ctx, 'L', screen.u - 1, screen.v - 1, 4, screen.h + 2, velvet);
    wallRect(ctx, 'L', screen.u + screen.w - 3, screen.v - 1, 4, screen.h + 2, velvet);
    for (let fold = 0; fold < 2; fold += 1) {
      wallRect(ctx, 'L', screen.u + fold * 2, screen.v - 1, 1, screen.h + 2, dark(velvet, 0.3));
      wallRect(ctx, 'L', screen.u + screen.w - 2 + fold * 2 - 1, screen.v - 1, 1, screen.h + 2, dark(velvet, 0.3));
    }
    wallRect(ctx, 'L', screen.u - 2, screen.v + screen.h - 1, screen.w + 4, 2, light(velvet, 0.12));
    wallRect(ctx, 'L', screen.u - 2, screen.v + screen.h - 2, screen.w + 4, 1, GOLD);
  }
  world.tens.slice(0, POSTER_SLOTS.length).forEach((title, index) => {
    const [u, v] = POSTER_SLOTS[index];
    wallRect(ctx, 'L', u, v, 9, 13, PAPER);
    const image = images.posters[index];
    if (image) wallImage(ctx, 'L', u + 1, v + 1, image);
    else miniPoster(ctx, 'L', u, v, title.titlePt || title.titleEn || `${title.type}:${title.id}`);
  });
  if (st.stage >= 9) {
    // o letreiro de lâmpadas (Cinerama), no alto das duas paredes
    for (let b = 2; b < 72; b += 4) {
      wallRect(ctx, 'R', b, WALL - 4, 1, 1, GOLD);
      wallRect(ctx, 'L', b, WALL - 4, 1, 1, GOLD);
    }
  }

  // ---- mobília que chega com a bitola ----
  if (st.stage >= 4) {
    // tapete (16 mm)
    poly(ctx, [iso(1.1, 1.9), iso(3.7, 1.9), iso(3.7, 4.6), iso(1.1, 4.6)], mix(t3, NIGHT, 0.5));
    poly(ctx, [iso(1.4, 2.2), iso(3.4, 2.2), iso(3.4, 4.3), iso(1.4, 4.3)], mix(t3, NIGHT, 0.36));
  }
  if (st.stage >= 5) {
    // abajur (Super 16)
    box(ctx, 0.35, 0.35, 0, 0.3, 0.3, 2, '#4A3B63');
    const lp = iso(0.5, 0.5, 2);
    px(ctx, lp[0], lp[1] - 20, '#6F5E8E', 1, 20);
    poly(
      ctx,
      [
        [lp[0] - 4, lp[1] - 20],
        [lp[0] + 5, lp[1] - 20],
        [lp[0] + 3, lp[1] - 27],
        [lp[0] - 2, lp[1] - 27],
      ],
      GOLD,
    );
    ctx.fillStyle = 'rgba(244,196,84,0.10)';
    ctx.fillRect(lp[0] - 9, lp[1] - 24, 19, 26);
  }
  if (st.out > 0) {
    // o Arquivo: os títulos de fora das prateleiras (fichas creme numa caixa)
    box(ctx, 5.0, 0.3, 0, 0.8, 0.8, 7, '#6B5B4A');
    const ap = iso(5.4, 0.7, 7);
    for (let a = 0; a < Math.min(st.out, 9); a += 1) px(ctx, ap[0] - 4 + (a % 3) * 3, ap[1] - 3 - Math.floor(a / 3) * 2, PAPER, 2, 1);
  }
  if (st.stage >= 6) {
    // pipoqueira (35 mm)
    box(ctx, 4.7, 4.6, 0, 0.8, 0.8, 9, '#B3202E');
    box(ctx, 4.75, 4.65, 9, 0.7, 0.7, 7, '#F6E7A8');
    const pp = iso(5.1, 5.0, 16);
    px(ctx, pp[0] - 5, pp[1] - 1, PAPER, 10, 1);
    px(ctx, pp[0] - 2, pp[1] + 3, GOLD, 2, 2);
    px(ctx, pp[0] + 1, pp[1] + 4, GOLD, 2, 2);
  }
  if (st.stage >= 3) {
    // poltrona (Super 8), virada para a tela
    const vel = mix(t2, '#3A1D4F', 0.45);
    box(ctx, 2.1, 2.7, 0, 1.2, 1.3, 5, vel);
    box(ctx, 2.15, 2.95, 5, 0.85, 0.8, 1, light(vel, 0.18));
    box(ctx, 3.0, 2.7, 5, 0.3, 1.3, 10, vel);
    box(ctx, 2.1, 2.6, 5, 0.9, 0.22, 3, dark(vel, 0.15));
    box(ctx, 2.1, 3.85, 5, 0.9, 0.22, 3, dark(vel, 0.15));
  }
  if (st.stage >= 2) {
    // projetor: chega quando a Persona nasce (8 mm)
    box(ctx, 4.3, 2.9, 0, 0.6, 0.6, 12, '#3B3054');
    box(ctx, 4.15, 2.8, 12, 0.9, 0.8, 5, '#8D86A8');
    const pr = iso(4.6, 3.2, 17);
    ctx.fillStyle = '#2A2140';
    ctx.fillRect(pr[0] - 6, pr[1] - 7, 6, 6);
    ctx.fillRect(pr[0] + 1, pr[1] - 5, 5, 5);
    px(ctx, pr[0] - 4, pr[1] - 5, MIST, 2, 2);
    px(ctx, pr[0] + 3, pr[1] - 3, MIST, 1, 1);
  }
}

// o facho do projetor (por cima da mobília, por baixo da mariposa)
const drawBeam = (ctx: Ctx, st: WorldState, tick: number) => {
  if (st.stage < 2) return;
  const screen = screenRect(st.stage);
  const at = (u: number, v: number): Pt => [CX - 1 - u, OY + (u >> 1) - v];
  const lens = iso(4.15, 3.2, 15);
  const a = at(screen.u + screen.w, screen.v + screen.h);
  const b = at(screen.u, screen.v + screen.h);
  const c = at(screen.u, screen.v);
  const d = at(screen.u + screen.w, screen.v);
  ctx.globalAlpha = 0.1 + (tick % 4 === 0 ? 0.015 : 0);
  poly(ctx, [lens, a, b], PAPER);
  poly(ctx, [lens, b, c], PAPER);
  poly(ctx, [lens, c, d], PAPER);
  poly(ctx, [lens, d, a], PAPER);
  ctx.globalAlpha = 1;
};

// ---------- a mariposa ----------
// A forma da asa vem do humor mais forte do trio: comprimento, quão pontuda,
// recortes na borda (sc, m), tamanho da asa de trás e a cauda.
const WING: Record<string, { len: number; a: number; b: number; sc: number; m: number; hind: number; tail: number }> = {
  M: { len: 0.98, a: 0.9, b: 0.85, sc: 0, m: 0, hind: 0.64, tail: 0 },
  X: { len: 1.0, a: 0.62, b: 1.35, sc: 0.2, m: 4, hind: 0.56, tail: 0 },
  P: { len: 0.92, a: 1.0, b: 0.6, sc: 0.12, m: 2, hind: 0.72, tail: 0 },
  A: { len: 1.0, a: 0.85, b: 1.05, sc: 0, m: 0, hind: 0.6, tail: 0.45 },
  C: { len: 0.94, a: 1.1, b: 0.8, sc: 0, m: 0, hind: 0.74, tail: 0.2 },
  Z: { len: 1.02, a: 1.3, b: 1.7, sc: 0, m: 0, hind: 0.5, tail: 0 },
  R: { len: 0.9, a: 0.95, b: 0.7, sc: 0.2, m: 1, hind: 0.68, tail: 0 },
  F: { len: 0.84, a: 1.0, b: 0.5, sc: 0, m: 0, hind: 0.72, tail: 0 },
  L: { len: 0.94, a: 0.95, b: 0.8, sc: 0.16, m: 3, hind: 0.64, tail: 0 },
};
// a envergadura por bitola (a mariposa cresce até 70 mm)
const SIZE = [0, 0, 0.6, 0.68, 0.76, 0.84, 0.92, 1, 1, 1];
// 14/11/2026: o Patrono (a mariposa feita de luz, fora da cabine) é desenhado
// sempre do mesmo tamanho, qualquer que seja a bitola; ele divide a meia
// envergadura por este fator antes de chamar drawMoth.
export const mothScale = (stage: number): number => SIZE[stage] || 0.6;

export interface MothEye {
  letter: string;
  gold: boolean;
  title: WorldTitle;
}
export interface MothSpec {
  shape: string;
  bands: { letter: string; upTo: number }[];
  eyes: MothEye[];
  third: string;
  stage: number;
}
export interface EyeHit {
  x: number;
  y: number;
  r: number;
  eye: MothEye;
}

// as faixas da asa: a fatia de cada humor (em área), da maior para a menor
const bandsOf = (dist: Record<string, number>): MothSpec['bands'] => {
  const list = LETTERS.filter((l) => dist[l] >= 0.04).sort((a, b) => dist[b] - dist[a]);
  const sum = list.reduce((s, l) => s + dist[l], 0) || 1;
  let acc = 0;
  return list.map((l) => {
    acc += dist[l] / sum;
    return { letter: l, upTo: acc };
  });
};

export function mothSpec(st: WorldState, world: PersonaWorld): MothSpec | null {
  if (!st.hasTrio) return null;
  const bands = bandsOf(st.now);
  return {
    shape: st.trio[0],
    bands: bands.length ? bands : [{ letter: st.trio[0], upTo: 1 }],
    eyes: world.eyes
      .filter((title) => title.letter)
      .slice(0, 6)
      .map((title) => ({ letter: title.letter as string, gold: title.rating >= 10, title })),
    third: st.trio[2],
    stage: st.stage,
  };
}

const DEG = Math.PI / 180;
const FORE = [-78 * DEG, 16 * DEG];
const HIND = [8 * DEG, 88 * DEG];

// Desenha a mariposa centrada em (cx, cy), com meia envergadura `half` em
// pixels. flap: 1 = asas abertas … 0.5 = fechando. Devolve onde ficou cada olho.
// flat (14/11/2026, para o Patrono, que é pequeno): cor chapada, sem o
// pontilhado de escama, e cada olho vira uma pinta dourada lisa.
export function drawMoth(ctx: Ctx, cx: number, cy: number, half: number, spec: MothSpec, flap: number, flat = false): EyeHit[] {
  const W = WING[spec.shape] ?? WING.M;
  const U = half * (SIZE[spec.stage] || 0.6);
  const hits: EyeHit[] = [];
  // as seis cores de cada faixa: asa da frente e de trás × (lisa, escama, borda)
  const palette = spec.bands.map((band) => {
    const base = moodColor(band.letter);
    const hind = dark(base, 0.14);
    return [base, dark(base, 0.1), dark(base, 0.32), hind, dark(hind, 0.1), dark(hind, 0.32)];
  });
  const x0 = Math.floor(cx - U - 2);
  const y0 = Math.floor(cy - U * 0.95);
  const gw = Math.ceil(cx + U + 2) - x0 + 1;
  const gh = Math.ceil(cy + U * 0.9) - y0 + 1;

  const wing = (side: 1 | -1) => {
    const grid: (string | null)[] = new Array(gw * gh).fill(null);
    for (let gy = 0; gy < gh; gy += 1) {
      for (let gx = 0; gx < gw; gx += 1) {
        const x = x0 + gx;
        const y = y0 + gy;
        const ux = ((x + 0.5 - cx) * side) / U / flap;
        const uy = (y + 0.5 - cy) / U;
        const dx = ux - 0.05;
        const dy = uy + 0.1;
        let d = 2;
        let fore = false;
        if (dx > 0) {
          const th = Math.atan2(dy, dx);
          if (th >= FORE[0] && th <= FORE[1]) {
            const t = (th - FORE[0]) / (FORE[1] - FORE[0]);
            let R = W.len * Math.pow(Math.sin(Math.PI * Math.pow(t, W.a)), W.b);
            if (W.sc && spec.stage >= 4) R *= 1 - W.sc * 0.5 * (1 + Math.cos(2 * Math.PI * W.m * t));
            const r = Math.sqrt(dx * dx + dy * dy);
            if (r <= R) {
              d = r / R;
              fore = true;
            }
          }
        }
        if (d > 1) {
          const ex = ux - 0.04;
          const ey = uy - 0.02;
          if (ex > 0) {
            const th2 = Math.atan2(ey, ex);
            if (th2 >= HIND[0] && th2 <= HIND[1]) {
              const t2 = (th2 - HIND[0]) / (HIND[1] - HIND[0]);
              let R2 = W.hind * Math.pow(Math.sin(Math.PI * Math.pow(t2, 0.8)), 0.75);
              if (W.tail && spec.stage >= 5) R2 += W.tail * Math.exp(-Math.pow((t2 - 0.72) / 0.08, 2));
              const r2 = Math.sqrt(ex * ex + ey * ey);
              if (r2 <= R2) d = r2 / R2;
            }
          }
        }
        if (d <= 1) {
          const area = d * d;
          let bi = spec.bands.length - 1;
          for (let k = 0; k < spec.bands.length; k += 1) {
            if (area <= spec.bands[k].upTo) {
              bi = k;
              break;
            }
          }
          const tone = d > 0.9 ? 2 : !flat && (x + y) % 2 === 0 ? 1 : 0;
          grid[gy * gw + gx] = palette[bi][(fore ? 0 : 3) + tone];
        }
      }
    }
    for (let gy = 0; gy < gh; gy += 1) {
      for (let gx = 0; gx < gw; gx += 1) {
        const color = grid[gy * gw + gx];
        if (!color) continue;
        const rim = gx === 0 || gy === 0 || gx === gw - 1 || gy === gh - 1 || !grid[gy * gw + gx + 1] || !grid[gy * gw + gx - 1] || !grid[(gy + 1) * gw + gx] || !grid[(gy - 1) * gw + gx];
        px(ctx, x0 + gx, y0 + gy, rim ? EDGE : color);
      }
    }
    // olhos: cada um é um título de nota 9 ou 10 (posição polar, sempre dentro da asa)
    const foreAt = (t: number, d: number): Pt => {
      const R = W.len * Math.pow(Math.sin(Math.PI * Math.pow(t, W.a)), W.b);
      const th = FORE[0] + t * (FORE[1] - FORE[0]);
      return [0.05 + d * R * Math.cos(th), -0.1 + d * R * Math.sin(th)];
    };
    const hindAt = (t: number, d: number): Pt => {
      const R = W.hind * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
      const th = HIND[0] + t * (HIND[1] - HIND[0]);
      return [0.04 + d * R * Math.cos(th), 0.02 + d * R * Math.sin(th)];
    };
    const peak = Math.pow(0.5, 1 / W.a);
    const spots = [foreAt(peak, 0.62), hindAt(0.42, 0.6), foreAt(Math.min(0.92, peak + 0.26), 0.56)];
    spots.forEach((spot, s) => {
      const eye = spec.eyes[s * 2 + (side < 0 ? 0 : 1)];
      if (!eye) return;
      const ox = Math.round(cx + side * spot[0] * U * flap);
      const oy = Math.round(cy + spot[1] * U);
      // no Patrono (flat) o olho é uma pinta de um pixel: com o raio normal,
      // os seis olhos cobririam a asa inteira de uma mariposa tão pequena
      const rr = flat ? 0.5 : Math.max(1.5, U * 0.085);
      const reach = Math.ceil(rr);
      for (let yy = -reach; yy <= reach; yy += 1) {
        for (let xx = -reach; xx <= reach; xx += 1) {
          const q = Math.sqrt(xx * xx + yy * yy);
          if (q <= rr) px(ctx, ox + xx, oy + yy, flat ? GOLD : q > rr * 0.62 ? (eye.gold ? GOLD : PAPER) : q > rr * 0.3 ? moodColor(eye.letter) : EDGE);
        }
      }
      hits.push({ x: ox, y: oy, r: rr + 2, eye });
    });
  };
  wing(-1);
  wing(1);

  // corpo felpudo, colarinho creme, olhos
  const bw = Math.max(1, Math.round(U * 0.09));
  const top = Math.round(cy - U * 0.3);
  const bot = Math.round(cy + U * 0.42);
  for (let by = top; by <= bot; by += 1) {
    const tt = (by - top) / (bot - top);
    const w = Math.max(1, Math.round(bw * (tt < 0.25 ? 0.9 : tt < 0.5 ? 1.15 : 1.15 - (tt - 0.5) * 1.3)));
    px(ctx, cx - w, by, tt < 0.22 ? '#2B2140' : tt < 0.34 ? PAPER : by % 2 ? '#3B2F57' : '#2B2140', w * 2, 1);
  }
  if (U > 14) {
    const hw = bw + 1;
    px(ctx, cx - hw, top - 2, '#2B2140', hw * 2, 4);
    px(ctx, cx - hw + 1, top - 3, '#2B2140', hw * 2 - 2, 1);
    px(ctx, cx - hw, top - 1, PAPER, 2, 2);
    px(ctx, cx + hw - 2, top - 1, PAPER, 2, 2);
    px(ctx, cx - hw + 1, top, EDGE);
    px(ctx, cx + hw - 2, top, EDGE);
  } else {
    px(ctx, cx - bw, top, EDGE, bw * 2, 1);
  }
  // antenas, com a ponta na cor do terceiro humor
  const tip = moodColor(spec.third);
  const an = Math.max(3, Math.round(U * 0.42));
  for (let ai = 1; ai <= an; ai += 1) {
    const ax = Math.round(ai * 0.62 + (ai * ai) / (an * 2.2));
    const ay = top - ai;
    px(ctx, cx - 1 - ax, ay, ai > an - 2 ? tip : MIST);
    px(ctx, cx + ax, ay, ai > an - 2 ? tip : MIST);
    if (spec.stage >= 4 && ai % 2 === 0 && U > 12) {
      px(ctx, cx - 2 - ax, ay + 1, MIST);
      px(ctx, cx + 1 + ax, ay + 1, MIST);
    }
  }
  return hits;
}

// antes da Persona: o ovo (nada avaliado) ou a lagarta (um gomo por título de prateleira)
export function drawLarva(ctx: Ctx, cx: number, cy: number, unit: number, world: PersonaWorld) {
  if (world.rated === 0) {
    for (let y = -3 * unit; y <= 3 * unit; y += 1) {
      for (let x = -2 * unit; x <= 2 * unit; x += 1) {
        const q = (x * x) / (4.4 * unit * unit) + (y * y) / (9.6 * unit * unit);
        if (q <= 1) px(ctx, cx + x, cy + y, q > 0.72 ? dark(PAPER, 0.3) : (x * 7 + y * 3) % 11 === 0 ? MIST : PAPER);
      }
    }
    return;
  }
  const segs = world.first.slice(0, 12);
  const n = segs.length;
  const s = 3 * unit;
  const x0 = Math.round(cx - ((n + 1) * s) / 2);
  segs.forEach((letter, j) => {
    const c = moodColor(letter);
    const bob = j % 2 ? 0 : -unit;
    px(ctx, x0 + j * s, cy + bob, c, s, s);
    px(ctx, x0 + j * s, cy + bob, light(c, 0.35), s, unit);
    px(ctx, x0 + j * s, cy + bob + s - unit, dark(c, 0.3), s, unit);
    px(ctx, x0 + j * s + unit, cy + bob + s, '#2B2140', unit, unit);
  });
  px(ctx, x0 + n * s, cy - unit, '#2B2140', s, s);
  px(ctx, x0 + n * s + s - unit, cy, PAPER, unit, unit);
  px(ctx, x0 + n * s + unit, cy - 2 * unit, MIST, unit, unit);
}

// o casulo: a forma vizinha, pendurada no alto da parede esquerda, acima dos
// pôsteres (as três cores do próximo código)
const drawCocoon = (ctx: Ctx, x: number, y: number, nextCode: string) => {
  px(ctx, x, y - 3, MIST, 1, 3);
  const silk = '#CBBFA5';
  for (let r = 0; r < 11; r += 1) {
    const w = r < 2 ? 2 : r < 9 ? 3 : 2;
    px(ctx, x - w + 1, y + r, r % 3 === 1 ? moodColor(nextCode[Math.floor(r / 3) % 3]) : r % 2 ? silk : dark(silk, 0.18), w * 2 - 1, 1);
  }
  ctx.fillStyle = 'rgba(243,234,211,0.14)';
  ctx.fillRect(x - 5, y - 2, 11, 15);
};
const COCOON_AT: Pt = [CX - 1 - 60, OY + 30 - WALL + 4];

// ---------- um quadro da cena ----------
// `room` é a cabine já desenhada (drawRoom) num canvas à parte; aqui entram só
// as partes que se mexem. Devolve onde a criatura ficou (para o toque).
export function paintFrame(ctx: Ctx, room: HTMLCanvasElement, st: WorldState, world: PersonaWorld, spec: MothSpec | null, tick: number, still: boolean): Pt {
  ctx.clearRect(0, 0, RW, RH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(room, 0, 0);
  if (st.hasTrio && st.neighbor === 'cocoon' && st.nextCode) drawCocoon(ctx, COCOON_AT[0], COCOON_AT[1], st.nextCode);
  if (st.stage >= 9 && !still) {
    // as lâmpadas do letreiro piscam alternadas
    for (let b = 2; b < 72; b += 4) {
      if ((b / 4 + (tick >> 2)) % 2 < 1) {
        wallRect(ctx, 'R', b, WALL - 4, 1, 1, PAPER);
        wallRect(ctx, 'L', b, WALL - 4, 1, 1, PAPER);
      }
    }
  }
  drawBeam(ctx, st, still ? 1 : tick);
  if (spec) {
    const a = tick / 10;
    const p = still ? iso(2.3, 3.3, 30) : iso(2.3 + Math.sin(a) * 0.5, 3.1 + Math.cos(a * 1.3) * 0.35, 30 + Math.sin(a * 2.1) * 3);
    const at: Pt = [Math.round(p[0]), Math.round(p[1])];
    drawMoth(ctx, at[0], at[1], 15, spec, still ? 1 : [1, 0.78, 0.5, 0.78][tick % 4]);
    return at;
  }
  const q = world.rated === 0 ? iso(3, 3, 7) : iso(3 + (still ? 0 : Math.sin(tick / 14) * 0.5), 3.2, 5);
  const at: Pt = [Math.round(q[0]), Math.round(q[1])];
  drawLarva(ctx, at[0], at[1], 2, world);
  return at;
}

// ---------- o toque ----------
export type SceneHit = { kind: 'creature' } | { kind: 'cocoon' } | { kind: 'screen' } | { kind: 'poster'; title: WorldTitle } | { kind: 'shelf'; letter: string } | { kind: 'room' };

// O que há no ponto (x, y) da cena (em pixels da cena). `creature` é onde a
// mariposa (ou a lagarta) está no quadro de agora.
export function sceneHit(x: number, y: number, st: WorldState, world: PersonaWorld, creature: Pt | null): SceneHit {
  if (creature && Math.abs(x - creature[0]) < 16 && Math.abs(y - creature[1]) < 14) return { kind: 'creature' };
  if (st.hasTrio && st.neighbor === 'cocoon' && Math.abs(x - COCOON_AT[0]) < 8 && y > COCOON_AT[1] - 6 && y < COCOON_AT[1] + 14) return { kind: 'cocoon' };
  const p = wallPoint(x, y);
  if (p.v >= 0 && p.v < WALL && p.u < 72) {
    if (p.side === 'L') {
      const tens = world.tens.slice(0, POSTER_SLOTS.length);
      for (let i = 0; i < tens.length; i += 1) {
        const [u, v] = POSTER_SLOTS[i];
        if (p.u >= u - 1 && p.u < u + 10 && p.v >= v - 1 && p.v < v + 14) return { kind: 'poster', title: tens[i] };
      }
      const screen = screenRect(st.stage);
      if (st.hasTrio && p.u >= screen.u && p.u < screen.u + screen.w && p.v >= screen.v && p.v < screen.v + screen.h) return { kind: 'screen' };
    } else {
      for (let m = 0; m < LETTERS.length; m += 1) {
        const cell = shelfCell(m);
        if (p.u >= cell.u && p.u < cell.u + 19 && p.v >= cell.v && p.v < cell.v + 14) return { kind: 'shelf', letter: LETTERS[m] };
      }
    }
  }
  return { kind: 'room' };
}
