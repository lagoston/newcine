// As ferramentas de pixel do estúdio (17/11/2026).
//
// Moravam dentro de studio.ts. Saíram para cá quando chegaram os móveis dos
// humores (moodItems/), desenhados cada um no seu arquivo: os desenhos usam
// as mesmas ferramentas da sala, e studio.ts importa os móveis (se elas
// continuassem lá, um importaria o outro).
//
// Coordenadas: x ao longo da parede da direita, y ao longo da parede da
// esquerda, z para cima (em pixels). Um ladrilho tem 24 × 12 pixels na tela.

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

// retângulo numa face que corre ao longo de x (a face +y de uma caixa). o =
// a ponta esquerda da face no chão dela; u = distância da ponta; v = altura.
export const faceY = (ctx: Ctx, o: Pt, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) ctx.fillRect(Math.round(o[0]) + u + d, Math.round(o[1]) + ((u + d) >> 1) - v - h, 1, h);
};
// retângulo numa face que corre ao longo de y (a face +x). o = a ponta
// direita da face no chão dela; u cresce para a esquerda.
export const faceX = (ctx: Ctx, o: Pt, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) ctx.fillRect(Math.round(o[0]) - 1 - (u + d), Math.round(o[1]) + ((u + d) >> 1) - v - h, 1, h);
};
// elipse cheia (um círculo no chão, visto de cima em isométrico)
export const disc = (ctx: Ctx, cx: number, cy: number, a: number, b: number, c: string) => {
  ctx.fillStyle = c;
  for (let dy = -Math.floor(b); dy <= Math.floor(b); dy += 1) {
    const half = Math.round(a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b))));
    if (half > 0) ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2, 1);
  }
};
// Um desenho pequeno, linha a linha: cada letra é uma cor da paleta e o ponto
// é vazio. flip = espelhado (virado para o outro lado).
export const sprite = (ctx: Ctx, x: number, y: number, rows: string[], palette: Record<string, string>, flip = false) => {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      const color = palette[row[rx]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x0 + (flip ? row.length - 1 - rx : rx), y0 + ry, 1, 1);
    }
  });
};

// ---------------------------------------------------------------------------
// O toque num objeto (17/11/2026)
// ---------------------------------------------------------------------------
// Tocar num móvel de humor faz ele reagir por um instante (a porta do frigobar
// bate, o pião bambeia…), ao mesmo tempo em que o cartão dele abre. Quem toca
// avisa aqui (pokeItem) e o desenho pergunta, a cada quadro, há quantos
// quadros foi o toque (pokeFrame). Conta em tempo de relógio, não no número
// do quadro: a mesma sala pode estar desenhada em dois lugares (o cartão da
// home e a gaveta), cada um com o seu contador.
const FRAME_MS = 125;
// a reação dura no máximo 3 segundos (24 quadros)
export const POKE_FRAMES = 24;
const poked = new Map<string, number>();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// framesAgo: só a prévia dos desenhistas usa (para ver um quadro da reação)
export function pokeItem(id: string, framesAgo = 0): void {
  poked.set(id, now() - framesAgo * FRAME_MS - FRAME_MS / 2);
}
export function clearPoke(id: string): void {
  poked.delete(id);
}
// há quantos quadros o objeto foi tocado (0 = agora), ou -1 (sem toque recente)
export function pokeFrame(id: string): number {
  const at = poked.get(id);
  if (at === undefined) return -1;
  const frame = Math.floor((now() - at) / FRAME_MS);
  if (frame > POKE_FRAMES) {
    poked.delete(id);
    return -1;
  }
  return frame;
}
