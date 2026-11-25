import { pokeFrame, type Ctx } from '../pixel';
import type { Kit } from '../studio';
import type { MoodItemArt } from './types';

// A luminária de lava, de chão (17/11/2026): o móvel do Sensorial, antes Psicodélico (🍭 Dreamwalker).
//
// Escolha do Bruno. Uma luminária de lava grande, de pé no chão: a base cônica
// de cobre escuro com o friso dourado e os furinhos por onde escapa a luz da
// lâmpada, a cápsula de vidro comprida (bojuda embaixo, afunilando devagar até
// o alto, como as clássicas) e o chapéu de cobre em cima. Dentro, o líquido
// aceso e a lava.
//
// Parado: as bolhas de lava se soltam da poça do fundo, sobem esticadas,
// descansam achatadas embaixo do chapéu e descem de novo, devagar (cada uma
// leva de 23 a 32 segundos para dar a volta); quando duas se cruzam, grudam.
// O líquido é sempre verde-água (a cor do humor); só a cor da lava gira, bem
// devagar: rosa, âmbar, violeta, rosa. Em volta do pé, a luz dela no chão.
//
// O toque: a lava ferve. As bolhas grandes se desfazem em muitas pequenas que
// sobem depressa, o líquido e a lava dão a volta inteira das cores (violeta,
// rosa, âmbar) em dois segundos e meio, a luz do chão pulsa; depois tudo volta
// ao ritmo calmo, de novo no verde-água.

const W = 0.6;
const D = 0.6;

// ---------------------------------------------------------------------------
// O desenho
// ---------------------------------------------------------------------------
// A silhueta é o que diz "luminária de lava": o cone do pé, a cintura fina
// onde o vidro encaixa, o vidro bojudo embaixo que afunila até o chapéu.
// Primeiro tentei um torno (cada altura um disco, como a mesa de pôquer), mas
// a 2× o pé virava um pote e o vidro uma garrafa; à mão, linha a linha, cada
// degrau da silhueta fica onde tem de ficar (como a planta e a cadeira).
//
// O metal é cobre escuro e não cromo: o cromo, cinza-lilás, sumia na parede
// roxa; o cobre é o oposto do verde-água, e o vidro aceso salta dele. A luz da
// sala vem da direita (as caixas têm a face da esquerda mais escura): no
// metal a esquerda é sombra, o brilho fica à direita do meio e a beirada da
// direita escurece de novo (é redondo). O friso dourado é o ouro da sala.
// o = vidro (pintado a cada quadro); * = os furinhos acesos do pé (as
// clássicas tinham estrelinhas recortadas); K = o contorno escuro, só no
// chapéu (sem ele, o cobre do chapéu sumia contra a madeira ou o metal de
// quem estivesse atrás) e embaixo do pé, onde ele encosta no chão.
const LAMP = [
  '.....KKK.....',
  '....KtTeK....',
  '...KbcdecK...',
  '...abbcdec...',
  '....abccb....',
  '....ooooo....',
  '....ooooo....',
  '....ooooo....',
  '....ooooo....',
  '...ooooooo...',
  '...ooooooo...',
  '...ooooooo...',
  '...ooooooo...',
  '...ooooooo...',
  '..ooooooooo..',
  '..ooooooooo..',
  '..ooooooooo..',
  '..ooooooooo..',
  '..ooooooooo..',
  '..ooooooooo..',
  '...ooooooo...',
  '....ooooo....',
  '...cttTTeT...',
  '...abbcdec...',
  '..ggGGGYYWG..',
  '..aabccddec..',
  '..aabccddec..',
  '.aabbcccdeec.',
  '.a*b*c*c*e*c.',
  '.aabbcccdeec.',
  'aabbbcccddeec',
  'aabbbcccddeec',
  'ffFFFhhhccddF',
  '.ffFFhhhhccF.',
  '..KKKKKKKKK..',
];
const METAL_COLORS: Record<string, string> = {
  a: '#2E1610',
  b: '#62301E',
  c: '#93502F',
  d: '#CC8650',
  e: '#F5C796',
  // o tampo (a boca do pé e o alto do chapéu): o cobre visto de cima, mais claro
  t: '#B96E40',
  T: '#E3A36C',
  // o friso
  g: '#7A4E12',
  G: '#F4C454',
  Y: '#FFE79A',
  W: '#FFF8DC',
  // a sapata, mais escura (a luz da lâmpada não chega ali)
  f: '#1F0E0B',
  F: '#4A2416',
  h: '#6E3A22',
  K: '#150E26',
};
// a coluna do meio do desenho e a linha do chão (o centro do pé): o pé tem 13
// pixels de largura, e a elipse dele no chão desce 3 linhas abaixo do centro
const MID = 6;
const FLOOR = LAMP.length - 4;

// O desenho em pedaços de linha (o metal) e pixels soltos (o vidro, os furinhos),
// a partir do centro do pé. Calculado uma vez.
type Run = [number, number, number, string];
const METAL: Run[] = [];
const GLASS_PX: [number, number][] = [];
const CUTS: [number, number][] = [];
// a largura do desenho em cada linha (a luz do chão não passa por cima do pé)
const SPAN = new Map<number, [number, number]>();
LAMP.forEach((row, i) => {
  const dy = i - FLOOR;
  for (let col = 0; col < row.length; col += 1) {
    const ch = row[col];
    if (ch === '.') continue;
    const dx = col - MID;
    const span = SPAN.get(dy);
    SPAN.set(dy, span ? [Math.min(span[0], dx), Math.max(span[1], dx)] : [dx, dx]);
    if (ch === 'o') GLASS_PX.push([dx, dy]);
    else if (ch === '*') CUTS.push([dx, dy]);
    else {
      const c = METAL_COLORS[ch];
      const last = METAL[METAL.length - 1];
      if (last && last[1] === dy && last[0] + last[2] === dx && last[3] === c) last[2] += 1;
      else METAL.push([dx, dy, 1, c]);
    }
  }
});
// o fundo do vidro (v = 0) e a meia-largura dele em cada altura v
const GLASS_FLOOR = Math.max(...GLASS_PX.map(([, dy]) => dy));
const GLASS_HALF: number[] = [];
GLASS_PX.forEach(([dx, dy]) => {
  const v = GLASS_FLOOR - dy;
  GLASS_HALF[v] = Math.max(GLASS_HALF[v] ?? 0, Math.abs(dx));
});
const halfAt = (v: number) => GLASS_HALF[Math.max(0, Math.min(GLASS_HALF.length - 1, Math.round(v)))];

const smooth = (t: number) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// As cores da lava
// ---------------------------------------------------------------------------
// O líquido é sempre verde-água: é a cor do humor, a que diz de quem é o
// móvel (no rosa ele virava o Mind-Blowing; no âmbar, a Família). O que gira
// devagar é só a lava: rosa → âmbar → violeta → rosa, três cores que saltam do
// verde-água. Cada cor tem a borda (a sombra), o corpo e o miolo aceso.
type Rgb = [number, number, number];
type Tones = Rgb[];
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const tones = (hexes: string[]): Tones => hexes.map(rgb);
// o líquido: escuro, meio, aceso
const TEAL = tones(['#0E6F68', '#2DD4BF', '#A6F7EA']);
const VIOLET = tones(['#3F2391', '#8B5CF6', '#CDB8FF']);
const PINK = tones(['#922565', '#F472B6', '#FFC8E4']);
const AMBER = tones(['#8A4A0C', '#F5A524', '#FFE29E']);
// a lava: borda, corpo, miolo
const LAVA_PINK = tones(['#9C1F5E', '#F0509A', '#FFC0DE']);
const LAVA_AMBER = tones(['#9A4A0A', '#FFA62B', '#FFE6A8']);
const LAVA_TEAL = tones(['#0E6F68', '#2DD4BF', '#B5FFF1']);
const LAVA_VIOLET = tones(['#3A1C8A', '#7C4DFF', '#CBB8FF']);
// a volta da lava, parada
const IDLE_LAVA = [LAVA_PINK, LAVA_AMBER, LAVA_VIOLET];
// A volta inteira, só na fervura (o toque): o líquido passa pelo violeta, pelo
// rosa e pelo âmbar e volta ao verde-água; a lava vai junto, sempre do lado
// oposto, para nunca sumir no líquido. A ordem mistura vizinhos (o azul entre
// o verde-água e o violeta, o coral entre o rosa e o âmbar), nunca um cinza.
const BOIL_LIQUID = [TEAL, VIOLET, PINK, AMBER];
const BOIL_LAVA = [LAVA_PINK, LAVA_AMBER, LAVA_TEAL, LAVA_VIOLET];

interface Palette {
  // o líquido: a beirada do vidro, o lado da sombra, o meio, o fundo (perto da lâmpada)
  rim: string;
  shade: string;
  mid: string;
  low: string;
  // a lava: a borda da sombra, o corpo, o miolo
  edge: string;
  body: string;
  core: string;
  // a luz: a dos furinhos e a do chão (r,g,b)
  light: string;
  glow: string;
}
const blend = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as Rgb;
const blendTones = (a: Tones, b: Tones, t: number): Tones => a.map((c, n) => blend(c, b[n], t));
// uma posição q numa volta de cores (0 = a primeira; 1 = a segunda…)
const ringOf = (ring: Tones[], q: number): Tones => {
  const i = Math.floor(q);
  return blendTones(ring[((i % ring.length) + ring.length) % ring.length], ring[(((i + 1) % ring.length) + ring.length) % ring.length], q - i);
};
const css = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;
const paletteOf = (liquid: Tones, lava: Tones): Palette => ({
  rim: css(liquid[0]),
  shade: css(blend(liquid[0], liquid[1], 0.55)),
  mid: css(liquid[1]),
  low: css(blend(liquid[1], liquid[2], 0.6)),
  edge: css(lava[0]),
  body: css(lava[1]),
  core: css(lava[2]),
  light: css(liquid[2]),
  glow: liquid[1].join(','),
});
// A lava parada muda em 16 passos por cor: aos pouquinhos, e as 48 paletas
// possíveis ficam guardadas (nada de cor nova a cada quadro).
const STEPS = 16;
const stepOf = (q: number): number => Math.round(q * STEPS) / STEPS;
const idlePalettes = new Map<number, Palette>();
const idlePalette = (q: number): Palette => {
  const key = stepOf(q) % IDLE_LAVA.length;
  const hit = idlePalettes.get(key);
  if (hit) return hit;
  const palette = paletteOf(TEAL, ringOf(IDLE_LAVA, key));
  idlePalettes.set(key, palette);
  return palette;
};
// Na fervura (f = o quadro do toque), as cores dão a volta inteira em 20
// quadros, mais depressa no meio. A volta entra e sai aos poucos (em 3 e 4
// quadros) por cima das cores paradas, e termina onde começou (verde-água com
// lava rosa): no fim sobra só a cor parada, sem salto.
const boilPalette = (q: number, f: number): Palette => {
  const sweep = 4 * smooth(Math.min(1, f / 20));
  const weight = f < 3 ? f / 3 : f < 17 ? 1 : Math.max(0, (21 - f) / 4);
  const liquid = blendTones(TEAL, ringOf(BOIL_LIQUID, sweep), weight);
  const lava = blendTones(ringOf(IDLE_LAVA, stepOf(q)), ringOf(BOIL_LAVA, sweep), weight);
  return paletteOf(liquid, lava);
};

// A volta da lava parada, no tempo (quadros, 8 por segundo): 16 s de rosa,
// depois 5 s de passagem para o âmbar, 12 s nele, 5 s para o violeta, 12 s
// nele e 5 s de volta ao rosa. Uns 55 s ao todo.
// Cada pedaço: [quadros, de onde, para onde] na volta da lava.
const TIMELINE: [number, number, number][] = [
  [128, 0, 0],
  [40, 0, 1],
  [96, 1, 1],
  [40, 1, 2],
  [96, 2, 2],
  [40, 2, 3],
];
const LOOP = TIMELINE.reduce((sum, [n]) => sum + n, 0);
const ringAt = (tick: number): number => {
  let t = tick % LOOP;
  for (const [n, from, to] of TIMELINE) {
    if (t < n) return from + (to - from) * smooth(t / n);
    t -= n;
  }
  return 0;
};

// ---------------------------------------------------------------------------
// A lava
// ---------------------------------------------------------------------------
// Bolhas "de metal líquido" (metaballs): cada bolha soma um campo, e onde a
// soma passa de LAVA_AT é lava. Assim duas bolhas que se encostam viram uma
// só, a que se solta da poça sai puxando um pescoço, e nada precisa ser
// desenhado à mão quadro a quadro. O campo de cada bolha acaba a 1,4 raio dela
// (o campo clássico, 1/d², não acaba nunca: na fervura, com nove bolhinhas num
// vidro de 5 a 9 pixels de largura, as caudas somadas viravam um bloco só de
// lava). São uns 120 pixels de vidro: o cálculo cabe folgado em cada quadro.
const LAVA_AT = 0.25;
// e onde passa de CORE_AT, o miolo aceso
const CORE_AT = 0.75;
interface Blob {
  u: number;
  v: number;
  r: number;
  // o esticão: sx alarga, sy alonga
  sx: number;
  sy: number;
}
// v = linhas acima do fundo do vidro; u = colunas a partir do meio.
// Onde a bolha descansa: logo abaixo do chapéu.
const TOP_V = GLASS_HALF.length - 2.5;
// as três bolhas: cada uma com o seu tempo de volta (quadros), o seu atraso e o seu lado
const LAVA = [
  { period: 216, at: 0, r: 2.0, side: 0.7 },
  { period: 256, at: 150, r: 1.7, side: -0.9 },
  { period: 184, at: 70, r: 1.4, side: 0.3 },
];
// onde está uma bolha numa fração p da volta dela
const blobAt = (spec: (typeof LAVA)[number], p: number): Blob => {
  let v: number;
  let sx = 1;
  let sy = 1;
  if (p < 0.12) {
    // soltando-se da poça: sai esticada, puxando o pescoço
    const s = p / 0.12;
    v = 0.5 + 2.5 * s;
    sy = 1 + 0.5 * s;
    sx = 1 - 0.15 * s;
  } else if (p < 0.42) {
    // subindo, comprida
    v = 3 + (TOP_V - 3) * smooth((p - 0.12) / 0.3);
    sy = 1.35;
    sx = 0.95;
  } else if (p < 0.58) {
    // descansando embaixo do chapéu, achatada (esfria)
    v = TOP_V;
    sy = 0.8;
    sx = 1.15;
  } else if (p < 0.9) {
    // descendo
    v = TOP_V - (TOP_V - 2.5) * smooth((p - 0.58) / 0.32);
    sy = 1.3;
    sx = 0.9;
  } else {
    // de volta para a poça
    v = 2.5 - 2 * ((p - 0.9) / 0.1);
  }
  const room = Math.max(0, halfAt(v) - spec.r * sx * 0.6);
  const u = Math.max(-room, Math.min(room, spec.side * Math.sin(Math.PI * p) * 2 + 0.4 * Math.sin(p * Math.PI * 6)));
  return { u, v, r: spec.r, sx, sy };
};
// o retrato parado: uma grande subindo no bojo, uma pequena descendo do alto,
// a menor se soltando da poça (o gargalo fica livre: o verde-água aparece inteiro)
const STILL_PHASES = [0.22, 0.66, 0.02];
// A fervura (o toque): cada bolha grande se parte em duas bolhinhas que sobem
// depressa (desvio para o lado, linhas por quadro) e a poça solta mais três
// (coluna, linhas por quadro, quadro em que sai). Chegando ao chapéu, a
// bolhinha volta a sair do fundo, até a fervura passar.
const SPLIT: [number, number][] = [
  [-0.8, 1.3],
  [0.9, 1.9],
];
const SPRING: [number, number, number][] = [
  [-1, 1.6, 1],
  [1, 1.4, 3],
  [0, 1.8, 5],
];
// a força da fervura em cada quadro do toque: sobe num instante, fica, assenta
const boilOf = (f: number): number => (f < 0 ? 0 : f < 2 ? f / 2 : f < 12 ? 1 : f < 20 ? 1 - (f - 12) / 8 : 0);

// as bolhas de um quadro (a poça do fundo é uma bolha larga, sempre lá)
const blobsOf = (tick: number, still: boolean, f: number): Blob[] => {
  const boil = boilOf(f);
  const shake = boil > 0 ? Math.sin(f * 1.7) * 0.25 * boil : 0;
  const blobs: Blob[] = [{ u: 0, v: -0.8 + boil * 0.6, r: 2.2 * (1 + shake), sx: 1.6, sy: 1 }];
  // uma bolhinha da fervura, na altura v (dá a volta pelo fundo) e perto da coluna u
  const bubble = (u: number, rise: number) => {
    const v = rise % (TOP_V + 2);
    const room = Math.max(0, halfAt(v) - 0.5);
    blobs.push({ u: Math.max(-room, Math.min(room, u + Math.sin(v * 0.9 + u) * 0.5)), v, r: 0.95 * (0.6 + 0.4 * boil), sx: 1, sy: 1.15 });
  };
  LAVA.forEach((spec, i) => {
    const p = still ? STILL_PHASES[i] : ((tick + spec.at) % spec.period) / spec.period;
    const blob = blobAt(spec, p);
    if (boil > 0) {
      SPLIT.forEach(([du, speed]) => bubble(blob.u + du, blob.v + f * speed));
      // a grande encolhe enquanto as pequenas saem dela
      blob.r *= 1 - 0.75 * boil;
    }
    if (blob.r > 0.3) blobs.push(blob);
  });
  if (boil > 0) {
    SPRING.forEach(([u, speed, start]) => {
      if (f >= start) bubble(u, (f - start) * speed);
    });
  }
  return blobs;
};

// ---------------------------------------------------------------------------
// A pintura
// ---------------------------------------------------------------------------
const field = new Float32Array(GLASS_PX.length);
const fieldAt = (blobs: Blob[], u: number, v: number): number => {
  let sum = 0;
  for (let i = 0; i < blobs.length; i += 1) {
    const blob = blobs[i];
    const du = (u - blob.u) / blob.sx;
    const dv = (v - blob.v) / blob.sy;
    const q = (du * du + dv * dv) / (2 * blob.r * blob.r);
    if (q < 1) sum += (1 - q) * (1 - q);
  }
  return sum;
};

// o vidro inteiro (o líquido, a lava e o reflexo) e os furinhos acesos
const paintGlass = (ctx: Ctx, cx: number, cy: number, palette: Palette, blobs: Blob[]) => {
  for (let i = 0; i < GLASS_PX.length; i += 1) {
    const [dx, dy] = GLASS_PX[i];
    field[i] = fieldAt(blobs, dx, GLASS_FLOOR - dy);
  }
  let runX = 0;
  let runY = 0;
  let runW = 0;
  let runC = '';
  const flush = () => {
    if (runW > 0) {
      ctx.fillStyle = runC;
      ctx.fillRect(runX, runY, runW, 1);
    }
    runW = 0;
  };
  for (let i = 0; i < GLASS_PX.length; i += 1) {
    const [dx, dy] = GLASS_PX[i];
    const v = GLASS_FLOOR - dy;
    const half = halfAt(v);
    const f = field[i];
    let c: string;
    if (f >= LAVA_AT) {
      // a lava: o miolo aceso, a borda da esquerda na sombra
      const left = i > 0 && GLASS_PX[i - 1][1] === dy ? field[i - 1] : 0;
      c = f >= CORE_AT ? palette.core : left < LAVA_AT || dx === -half ? palette.edge : palette.body;
    } else if (Math.abs(dx) === half) c = palette.rim;
    else if (dx === 1 - half) c = palette.shade;
    else c = v <= 1 ? palette.low : palette.mid;
    const x = cx + dx;
    const y = cy + dy;
    if (runW > 0 && runY === y && runX + runW === x && runC === c) runW += 1;
    else {
      flush();
      runX = x;
      runY = y;
      runW = 1;
      runC = c;
    }
  }
  flush();
  // o reflexo do vidro: um fio claro à direita do meio, que segue a curva
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let v = 3; v <= 12; v += 1) ctx.fillRect(cx + halfAt(v) - 1, cy + GLASS_FLOOR - v, 1, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(cx - halfAt(4) + 1, cy + GLASS_FLOOR - 5, 1, 2);
  // os furinhos do pé, acesos
  ctx.fillStyle = palette.light;
  CUTS.forEach(([dx, dy]) => ctx.fillRect(cx + dx, cy + dy, 1, 1));
};

// a luz no chão, em volta do pé (só onde o pé não está na frente)
const paintHalo = (ctx: Ctx, cx: number, cy: number, palette: Palette, power: number) => {
  const layers: [number, number, number][] = [
    [11, 5.5, 0.12 * power],
    [8.5, 3.8, 0.15 * power],
  ];
  layers.forEach(([a, b, alpha]) => {
    ctx.fillStyle = `rgba(${palette.glow},${alpha.toFixed(3)})`;
    for (let dy = -Math.floor(b); dy <= Math.floor(b); dy += 1) {
      const half = Math.round(a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b))));
      if (half <= 0) continue;
      const span = SPAN.get(dy);
      if (!span) {
        ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
        continue;
      }
      if (span[0] > -half) ctx.fillRect(cx - half, cy + dy, span[0] + half, 1);
      if (span[1] < half) ctx.fillRect(cx + span[1] + 1, cy + dy, half - span[1], 1);
    }
  });
};

// o centro do pé na tela (a coluna do meio fica simétrica ao girar)
const anchor = (k: Kit, x: number, y: number): [number, number] => {
  const [sx, sy] = k.iso(x + W / 2, y + D / 2, 0);
  return [Math.floor(sx), Math.round(sy)];
};

const drawLamp = (k: Kit, ctx: Ctx, x: number, y: number) => {
  const [cx, cy] = anchor(k, x, y);
  METAL.forEach(([dx, dy, w, c]) => {
    ctx.fillStyle = c;
    ctx.fillRect(cx + dx, cy + dy, w, 1);
  });
  paintGlass(ctx, cx, cy, idlePalette(0), blobsOf(0, true, -1));
};

const paintLamp = (k: Kit, ctx: Ctx, x: number, y: number, tick: number, still: boolean) => {
  const [cx, cy] = anchor(k, x, y);
  const f = still ? -1 : pokeFrame('lavalamp');
  const boil = boilOf(f);
  const q = still ? 0 : ringAt(tick);
  const palette = f >= 0 && f <= 21 ? boilPalette(q, f) : idlePalette(q);
  const flicker = boil > 0 ? 0.25 * Math.sin(f * 2.1) : 0;
  paintHalo(ctx, cx, cy, palette, 1 + 0.9 * boil + flicker);
  if (still) return;
  paintGlass(ctx, cx, cy, palette, blobsOf(tick, false, f));
};

const ART: MoodItemArt = {
  w: W,
  d: D,
  // do chão (o canto de trás, 3,6 px acima do centro do pé) até o alto do chapéu (31 px)
  h: 28,
  // a luz do chão sai do quadrado do objeto (11 pixels para cada lado do
  // meio): o retângulo cresce junto, para o que estiver na frente ser
  // pintado de novo por cima dela (e um alvo de toque mais largo, para uma
  // luminária fina, não faz mal)
  pad: 5,
  draw: (k, ctx, x, y) => drawLamp(k, ctx, x, y),
  paint: (k, ctx, x, y, _env, tick, still) => paintLamp(k, ctx, x, y, tick, still),
};

export default ART;
