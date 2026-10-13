import { VELVET, PAPER, MIST, PIXEL_FONT_STACK, PIXEL_FONT_SAMPLE, withAlpha } from './oracleTheme';
import { MOOD_BY_LETTER } from './moods';

// Ajudantes para desenhar imagens de stories (1080×1920) direto num canvas
// (13/10/2026). Usados pelo story da Conexão (lib/connectionCard.ts) e
// prontos para as outras artes (personalidade, insights do mês…).
//
// Por que canvas à mão e não html2canvas: o html2canvas deslocava a fonte
// pixel e não sabe desenhar as molduras de avatar (gradientes cônicos e
// máscaras do cosmetics.css). Aqui a prévia e o arquivo são o mesmo canvas.

export const SANS_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type CanvasImage = HTMLImageElement | ImageBitmap;
type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------------------
// Fontes e imagens
// ---------------------------------------------------------------------------

// As fontes precisam estar prontas antes do primeiro fillText (senão o
// canvas desenha com a fonte de reserva e não redesenha depois). Teto de
// 3 s: sem rede, segue com a fonte que houver.
export async function ensureCanvasFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const load = (async () => {
    try {
      // A amostra inclui 2, 5, 7, L e Z: eles vêm da fonte de glifos.
      await Promise.all([
        document.fonts.load(`400 200px ${PIXEL_FONT_STACK}`, PIXEL_FONT_SAMPLE),
        document.fonts.load(`600 40px ${PIXEL_FONT_STACK}`, PIXEL_FONT_SAMPLE),
        document.fonts.load(`600 30px ${SANS_STACK}`),
      ]);
      await document.fonts.ready;
    } catch {
      /* segue com a fonte que houver */
    }
  })();
  await Promise.race([load, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

const blobToImage = (blob: Blob): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

const imgTag = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    // Sem CORS liberado a imagem falha (e entra o fundo liso) em vez de
    // "sujar" o canvas, o que impediria de gerar o arquivo.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Endereço diferente do <img> da tela, para não pegar a cópia sem CORS
    // do cache do navegador (ver loadCanvasImage).
    img.src = url.startsWith('data:') || url.startsWith('blob:') ? url : `${url}${url.includes('?') ? '&' : '?'}canvas=1`;
  });

// Baixa uma imagem para desenhar no canvas: fetch (CORS) → ImageBitmap
// (decodificado fora da thread principal); se não der, <img crossorigin>.
// Nunca lança erro e nunca trava: devolve null depois de `timeoutMs`.
export async function loadCanvasImage(url: string | null | undefined, timeoutMs = 6000): Promise<CanvasImage | null> {
  if (!url) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctrl?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const attempt = (async (): Promise<CanvasImage | null> => {
    try {
      // `no-store`: o pôster quase sempre já apareceu na tela num <img>
      // comum, e o navegador guardou essa cópia SEM a permissão de CORS. Se
      // o fetch reaproveitar a cópia, o CORS falha e entra a capa genérica
      // (foi o que aconteceu no story da Conexão em 13/10/2026). Os outros
      // stories que funcionam (Insights, story do filme) já pediam assim.
      const res = await fetch(url, { mode: 'cors', cache: 'no-store', signal: ctrl?.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (typeof createImageBitmap === 'function') {
        try {
          return await createImageBitmap(blob);
        } catch {
          /* SVG e formatos que o createImageBitmap não abre: vai de <img> */
        }
      }
      return await blobToImage(blob);
    } catch {
      return await imgTag(url);
    }
  })();
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const imageSize = (img: CanvasImage) => ({
  w: (img as HTMLImageElement).naturalWidth || img.width,
  h: (img as HTMLImageElement).naturalHeight || img.height,
});

export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('canvas.toBlob failed');
  return blob;
}

// ---------------------------------------------------------------------------
// Formas e texto
// ---------------------------------------------------------------------------

// Desenha a imagem cobrindo o retângulo (como object-fit: cover).
export function drawCover(ctx: Ctx, img: CanvasImage, x: number, y: number, w: number, h: number) {
  const { w: iw, h: ih } = imageSize(img);
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Quebra o texto em linhas que cabem em maxWidth (com a fonte atual).
export function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Corta com reticências o que não cabe em maxWidth (com a fonte atual).
export function truncateToWidth(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Diminui a fonte (de 2 em 2 px, até `min`) até o texto caber. Deixa a
// fonte escolhida em ctx.font e devolve o tamanho.
export function fitFont(ctx: Ctx, text: string, opts: { weight: number | string; family: string; size: number; min: number; maxWidth: number }): number {
  let size = opts.size;
  ctx.font = `${opts.weight} ${size}px ${opts.family}`;
  while (size > opts.min && ctx.measureText(text).width > opts.maxWidth) {
    size -= 2;
    ctx.font = `${opts.weight} ${size}px ${opts.family}`;
  }
  return size;
}

// A ligadura "fi" da Pixelify faz "filme" parecer "Alme" — no canvas não dá
// para desligar ligaduras, então um separador invisível (ZWNJ) impede a junção.
export const noLig = (text: string) => text.replace(/f(?=[il])/g, 'f‌');

// Espaçamento entre letras (onde o navegador suporta; senão, nada).
export function setLetterSpacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// ---------------------------------------------------------------------------
// Fundo e painéis
// ---------------------------------------------------------------------------

// Uma mancha de luz redonda (sobre o canvas inteiro).
export function drawGlow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// "Poeira de estrelas" em pixels, sempre igual (semente fixa).
export function drawStarDust(ctx: Ctx, width: number, height: number, count = 70, seed = 7) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const size = rnd() < 0.8 ? 3 : 5;
    ctx.fillStyle = `rgba(243,234,211,${(0.08 + rnd() * 0.18).toFixed(3)})`;
    ctx.fillRect(Math.round(rnd() * width), Math.round(rnd() * height), size, size);
  }
}

// O painel de vidro do site (oracleTheme.glassPanel) traduzido para canvas:
// superfície translúcida, reflexo da cor do painel no canto de cima e no
// contorno, e um fio de luz no alto. Sem desfoque (como no site).
export function drawGlassPanel(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, accent: string) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(28,20,51,0.56)';
  ctx.fill();
  ctx.clip();
  const a = ctx.createRadialGradient(x + w, y, 0, x + w, y, Math.max(w, h) * 1.05);
  a.addColorStop(0, withAlpha(accent, 0.22));
  a.addColorStop(0.62, withAlpha(accent, 0));
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  const b = ctx.createRadialGradient(x, y + h, 0, x, y + h, Math.max(w, h) * 0.75);
  b.addColorStop(0, withAlpha(accent, 0.1));
  b.addColorStop(0.7, withAlpha(accent, 0));
  ctx.fillStyle = b;
  ctx.fillRect(x, y, w, h);
  const sheen = ctx.createLinearGradient(0, y, 0, y + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0.012)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);
  ctx.lineWidth = 2;
  ctx.strokeStyle = withAlpha(accent, 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + r, y + 2.5);
  ctx.lineTo(x + w - r, y + 2.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Molduras de avatar
// ---------------------------------------------------------------------------

export interface ConicStop {
  color: string;
  pos: number;
}
export interface FrameStyle {
  rim: { from: number; stops: ConicStop[] };
  glow: string;
  edge: string;
}

// Lê o conic-gradient do aro (--co-rim). Quando há outras camadas antes
// (as joias da moldura Vingadores), fica só com o gradiente cônico.
export function parseConicGradient(value: string): FrameStyle['rim'] | null {
  const m = value.match(/conic-gradient\(\s*(?:from\s+(-?[\d.]+)deg\s*,)?([\s\S]*)\)\s*$/);
  if (!m) return null;
  const parts = m[2].split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean);
  const stops: { color: string; pos: number | null }[] = [];
  for (const part of parts) {
    const mm = part.match(/^(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s*([\d.]+%)?$/i);
    if (mm) stops.push({ color: mm[1], pos: mm[2] ? parseFloat(mm[2]) / 100 : null });
  }
  if (stops.length < 2) return null;
  if (stops[0].pos === null) stops[0].pos = 0;
  if (stops[stops.length - 1].pos === null) stops[stops.length - 1].pos = 1;
  // Paradas sem posição ficam distribuídas entre as vizinhas (como no CSS).
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].pos !== null) continue;
    let j = i;
    while (stops[j].pos === null) j++;
    const a = stops[i - 1].pos as number;
    const b = stops[j].pos as number;
    for (let k = i; k < j; k++) stops[k].pos = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  return { from: parseFloat(m[1] || '0'), stops: stops.map((s) => ({ color: s.color, pos: Math.min(1, Math.max(0, s.pos as number)) })) };
}

// As molduras moram no cosmetics.css (fonte única): um <span> invisível
// com a classe da moldura devolve as variáveis --co-rim, --co-glow e
// --co-edge, que viram o aro desenhado no canvas. Sem moldura ("ring-0"
// ou classe vazia) → null.
export function readFrameStyle(className: string | null | undefined): FrameStyle | null {
  if (typeof document === 'undefined' || !className || className === 'ring-0') return null;
  const el = document.createElement('span');
  el.className = className;
  el.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:1px;animation:none;pointer-events:none';
  document.body.appendChild(el);
  try {
    const cs = getComputedStyle(el);
    const rim = parseConicGradient(cs.getPropertyValue('--co-rim').trim());
    if (!rim) return null;
    return {
      rim,
      glow: cs.getPropertyValue('--co-glow').trim() || 'rgba(139,92,246,0.3)',
      edge: cs.getPropertyValue('--co-edge').trim() || 'rgba(243,234,211,0.35)',
    };
  } finally {
    el.remove();
  }
}

// Avatar redondo com a moldura (ou, sem moldura, um aro na cor `accent`).
// Sem foto: a inicial.
export function drawFramedAvatar(
  ctx: Ctx,
  img: CanvasImage | null,
  cx: number,
  cy: number,
  r: number,
  opts: { frame: FrameStyle | null; accent: string; initial: string },
) {
  const { frame, accent } = opts;
  // Brilho em volta (o mesmo --co-glow da moldura).
  ctx.save();
  ctx.shadowColor = frame?.glow || withAlpha(accent, 0.5);
  ctx.shadowBlur = Math.round(r * 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = VELVET;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = VELVET;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (img) {
    drawCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const bg = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    bg.addColorStop(0, withAlpha(accent, 0.28));
    bg.addColorStop(1, withAlpha(accent, 0.06));
    ctx.fillStyle = bg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = PAPER;
    ctx.font = `700 ${Math.round(r * 0.9)}px ${SANS_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.initial, cx, cy + r * 0.04);
  }
  ctx.restore();

  if (frame) {
    const inner = Math.min(r * 0.88, r - 3);
    let fill: CanvasGradient | string = frame.rim.stops[0].color;
    if (typeof ctx.createConicGradient === 'function') {
      // CSS: 0° é para cima; canvas: 0 é para a direita.
      const g = ctx.createConicGradient(((frame.rim.from - 90) * Math.PI) / 180, cx, cy);
      frame.rim.stops.forEach((s) => g.addColorStop(s.pos, s.color));
      fill = g;
    } else {
      const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      frame.rim.stops.forEach((s) => g.addColorStop(s.pos, s.color));
      fill = g;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(10,6,20,0.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = frame.edge;
    ctx.stroke();
  } else {
    const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, accent);
    ring.addColorStop(1, withAlpha(accent, 0.45));
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = ring;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Peças da marca
// ---------------------------------------------------------------------------

// O código de 3 letras da personalidade, centrado em cx, cada letra na cor
// do seu humor. Letras em `shared` ganham um traço brilhante embaixo (os
// humores que duas pessoas têm em comum).
export function drawPersonaCode(ctx: Ctx, code: string, cx: number, cy: number, size: number, shared?: Set<string>) {
  ctx.save();
  ctx.font = `${size}px ${PIXEL_FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const letters = code.split('');
  const gap = size * 0.08;
  const widths = letters.map((l) => ctx.measureText(l).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (letters.length - 1);
  let x = cx - total / 2;
  letters.forEach((letter, i) => {
    const color = MOOD_BY_LETTER[letter]?.color ?? MIST;
    ctx.fillStyle = color;
    ctx.fillText(letter, x, cy);
    if (shared?.has(letter)) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillRect(Math.round(x + widths[i] * 0.15), Math.round(cy + size * 0.48), Math.round(widths[i] * 0.7), Math.max(3, Math.round(size * 0.1)));
      ctx.restore();
    }
    x += widths[i] + gap;
  });
  ctx.restore();
}

// Brilho em pixels (em vez de emoji: cada celular desenha emoji de um jeito).
export function drawSparkle(ctx: Ctx, cx: number, cy: number, unit: number, color: string) {
  ctx.fillStyle = color;
  const px = (dx: number, dy: number, w = 1, h = 1) =>
    ctx.fillRect(Math.round(cx + dx * unit), Math.round(cy + dy * unit), Math.ceil(w * unit), Math.ceil(h * unit));
  px(-0.5, -3.5, 1, 7);
  px(-3.5, -0.5, 7, 1);
  px(-1.5, -1.5, 3, 3);
}

// O olho da marca (public/brand/cineoracle-mark.svg, 24×21 "pixels").
// O SVG é lido e vira retângulos — desenhar SVG no canvas varia entre
// navegadores, retângulos não.
export interface BrandMark {
  cols: number;
  rows: number;
  rects: { color: string; x: number; y: number; w: number; h: number }[];
}

let brandMarkPromise: Promise<BrandMark | null> | null = null;
export function loadBrandMark(url = '/brand/cineoracle-mark.svg'): Promise<BrandMark | null> {
  if (!brandMarkPromise) {
    brandMarkPromise = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const svg = await res.text();
        const box = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
        const rects: BrandMark['rects'] = [];
        for (const path of svg.matchAll(/<path fill="(#[0-9a-fA-F]{3,8})" d="([^"]+)"/g)) {
          for (const r of path[2].matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
            rects.push({ color: path[1], x: +r[1], y: +r[2], w: +r[3], h: +r[4] });
          }
        }
        if (!box || !rects.length) return null;
        return { cols: +box[1], rows: +box[2], rects };
      } catch {
        brandMarkPromise = null;
        return null;
      }
    })();
  }
  return brandMarkPromise;
}

// Desenha o olho com `height` px de altura a partir de (x, y) (canto de
// cima à esquerda). Devolve a largura usada.
export function drawBrandMark(ctx: Ctx, mark: BrandMark, x: number, y: number, height: number): number {
  const cell = height / mark.rows;
  mark.rects.forEach((r) => {
    ctx.fillStyle = r.color;
    ctx.fillRect(Math.round(x + r.x * cell), Math.round(y + r.y * cell), Math.ceil(r.w * cell), Math.ceil(r.h * cell));
  });
  return mark.cols * cell;
}
