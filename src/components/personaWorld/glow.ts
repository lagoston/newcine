// O brilho do que pode ser tocado no estúdio (14/11/2026, noite).
//
// Correção do Bruno: "ao invés de qualquer lugar clicado abrir o 'sua persona',
// vamos deixar brilhando tudo que é possível ser clicado"; e "a máquina de
// jackpot deve possuir um brilho ao redor dela, anseando para ser clicada".
//
// O brilho é pixel art, como o resto: um contorno de luz em volta da silhueta
// do objeto, que respira devagar. Para saber onde fica o contorno, o objeto é
// desenhado sozinho num canvas vazio e os pixels vazios encostados nele viram
// o primeiro anel; os encostados nesses, o segundo; e assim até o terceiro.
// Os anéis ficam guardados (o desenho de um objeto não muda de um quadro para
// o outro) e a cada quadro só se pinta o que está guardado.
//
// A máquina do Jackpot usa os três anéis, em ouro e com a respiração mais
// rápida: é ela que mais chama. O resto usa um anel forte e um fraco, em luz
// clara. Com "reduzir movimento" o brilho fica parado.
//
// 14/11/2026 (noite), correção do Bruno: "o brilho do canto de trás da
// máquina caça níquel está atravessando a estante que está na frente". O
// brilho é pintado por cima da sala inteira, então o anel do lado direito da
// máquina passava por cima da estante do guia, que fica na frente dela. Agora
// quem pede o brilho diz também o que fica na frente do objeto (`cover`): os
// pixels do anel que caem em cima dessas coisas são tirados, e o brilho passa
// por trás delas, como a própria máquina.

type Ctx = CanvasRenderingContext2D;

export interface Glow {
  // os três anéis em volta da silhueta: pares x, y
  rings: [Int16Array, Int16Array, Int16Array];
}

const cache = new Map<string, Glow>();

// A silhueta de um desenho: 1 onde ele pinta, 0 onde fica vazio.
const silhouette = (w: number, h: number, draw: (ctx: Ctx) => void): Uint8Array | null => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  draw(ctx);
  const data = ctx.getImageData(0, 0, w, h).data;
  const shape = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) shape[p] = data[p * 4 + 3] > 40 ? 1 : 0;
  return shape;
};

// Desenha a coisa sozinha (draw) num canvas de w × h e devolve os anéis dela.
// key: o nome para guardar (null = quem chama guarda por conta própria); ele
// precisa mudar quando muda o que fica na frente.
// cover: desenha o que fica na frente da coisa; o anel some onde isso pinta.
export function glowOf(key: string | null, w: number, h: number, draw: (ctx: Ctx) => void, cover?: (ctx: Ctx) => void): Glow {
  const hit = key ? cache.get(key) : undefined;
  if (hit) return hit;
  const found: number[][] = [[], [], []];
  const shape = silhouette(w, h, draw);
  const front = shape && cover ? silhouette(w, h, cover) : null;
  if (shape) {
    let reached: Uint8Array = shape;
    for (let ring = 0; ring < 3; ring += 1) {
      const next: Uint8Array = reached.slice();
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const p = y * w + x;
          if (reached[p]) continue;
          // encostado pelos lados (sem as diagonais: o canto fica redondo)
          if ((x > 0 && reached[p - 1]) || (x < w - 1 && reached[p + 1]) || (y > 0 && reached[p - w]) || (y < h - 1 && reached[p + w])) {
            next[p] = 1;
            // o anel continua crescendo por trás do que está na frente, mas ali não é pintado
            if (!front || !front[p]) found[ring].push(x, y);
          }
        }
      }
      reached = next;
    }
  }
  const glow: Glow = { rings: [Int16Array.from(found[0]), Int16Array.from(found[1]), Int16Array.from(found[2])] };
  if (key) cache.set(key, glow);
  return glow;
}

// as duas luzes: o ouro da máquina e a luz clara do resto ("r,g,b")
export const GLOW_GOLD = '255,214,106';
export const GLOW_SOFT = '255,238,200';

// A força de cada anel neste quadro. strong = a máquina do Jackpot.
export function glowAlphas(tick: number, still: boolean, strong: boolean): [number, number, number] {
  const wave = still ? 0.75 : 0.5 + 0.5 * Math.sin(tick / (strong ? 2.6 : 4.5));
  return strong ? [0.6 + 0.4 * wave, 0.3 + 0.4 * wave, 0.1 + 0.26 * wave] : [0.3 + 0.5 * wave, 0.06 + 0.2 * wave, 0];
}

// Pinta os anéis, deslocados de (dx, dy).
export function paintGlow(ctx: Ctx, glow: Glow, dx: number, dy: number, rgb: string, alphas: [number, number, number]) {
  for (let ring = 0; ring < 3; ring += 1) {
    const alpha = alphas[ring];
    if (alpha < 0.02) continue;
    ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
    const points = glow.rings[ring];
    for (let i = 0; i < points.length; i += 2) ctx.fillRect(points[i] + dx, points[i + 1] + dy, 1, 1);
  }
}
