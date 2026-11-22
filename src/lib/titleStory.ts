import { NIGHT, VELVET, PAPER, INK, MIST, PIXEL_FONT_STACK, ratingTone, ratingBarColor, withAlpha } from './oracleTheme';
import { RARITY_META, type PosterEffect, type PosterRarity } from './posterJackpot';
import {
  SANS_STACK,
  ensureCanvasFonts,
  loadCanvasImage,
  loadBrandMark,
  drawBrandMark,
  drawCover,
  roundRectPath,
  truncateToWidth,
  noLig,
  setLetterSpacing,
  drawGlow,
  drawStarDust,
  readFrameStyle,
  drawFramedAvatar,
  canvasToBlob,
  type BrandMark,
  type CanvasImage,
} from './storyCanvas';

// O story do título (1080×1920), desenhado direto num canvas (22/11/2026).
//
// Pedido do Bruno: o botão "Instagram" do menu de um título montava a imagem
// em cima de onze fundos prontos (public/assets/cineN.webp, com a logo antiga),
// só com o pôster e o título em Arial. "Não reflete o padrão de stories que
// temos dentro do site" e, "um detalhe muito importante", não levava a resenha.
// Também: o pôster que a pessoa equipou (Poster Jackpot) tem de valer aqui.
//
// O que a imagem conta agora, com as peças que o site já tem:
//   • o fundo é a noite do site acesa pela cor do pôster, desfocado (como no
//     story do Feed dos Amigos), com a poeira de estrelas dos outros stories;
//   • o pôster é o EQUIPADO, com o efeito parado (holográfico, negativo, ultra
//     vermelho, dourado: as mesmas camadas do posterJackpot.css) e a marca de
//     colecionador (cristal + número);
//   • a nota vai na fonte pixel, na cor da faixa da nota (ratingTone), com o
//     NOME que a nota tem na biblioteca ("Obra-Prima", "Doloroso"…). Ela fica
//     FORA do pôster: no story do feed a medalha cobre o canto de baixo à
//     direita, que é onde mora a marca de colecionador;
//   • a RESENHA é um balão de papel creme com a letra em tinta, o mesmo balão
//     em que os oráculos comentam o título no menu (OracleSeals): faixa na
//     cor de quem fala à esquerda, o título na fonte pixel e o rabicho apontando
//     para o avatar (com a moldura) de quem escreveu. O texto ganha o maior
//     corpo em que couber e, se não couber, é cortado entre palavras ("continua
//     no CineOracle"). Resenha com spoiler NUNCA tem o texto impresso: sai o
//     título dela, um mosaico no lugar do texto e o aviso;
//   • a assinatura é a marca nova: o Olho Lunar e o logotipo desenhados na
//     grade (retângulos lidos dos SVG de /brand), com o endereço.
//
// Duas composições, com as mesmas peças:
//   • com resenha: pôster à esquerda, título e nota à direita, o balão embaixo
//     de ponta a ponta (ele precisa da largura inteira para ser lido);
//   • sem resenha: o pôster grande no centro, o título e a nota embaixo.
// Nas duas, o pé é igual: a pessoa à esquerda, a marca à direita.
//
// Zonas seguras do Instagram (as mesmas dos stories da Conexão e do estúdio):
// a barra do perfil cobre o topo (y 0–250) e o campo de mensagem cobre o pé
// (y 1670–1920). Tudo o que importa fica entre as duas, centrado.
//
// Este arquivo é baixado só no toque do botão (import() em useShareStory): o
// pedaço do menu do título não cresce.

type Ctx = CanvasRenderingContext2D;

export const TITLE_STORY_WIDTH = 1080;
export const TITLE_STORY_HEIGHT = 1920;
const W = TITLE_STORY_WIDTH;
const H = TITLE_STORY_HEIGHT;
const SAFE_TOP = 250;
const SAFE_BOTTOM = 1670;
// margem lateral e largura útil
const M = 72;
const CW = W - M * 2;
// respiro entre a zona segura e o bloco
const PAD = 26;
const URL_COLOR = '#F0ABFC';
// as quatro faixas da lua da marca (claude/marca.md)
const MOON = ['#B9A6FF', '#E2A9F3', '#A6CFF5', '#86E3CC'];
// fora da biblioteca não há nota nem watchlist: o violeta da marca
const NEUTRAL = { light: '#C4B5FD', fill: '#8B5CF6' };

// 'rated' = tem nota; 'watchlist' = está na biblioteca sem nota; 'none' = fora
// da biblioteca (a pessoa só está mostrando o título).
export type TitleStoryState = 'rated' | 'watchlist' | 'none';

// Textos já traduzidos (quem chama usa o t() do idioma do site).
export interface TitleStoryCopy {
  // "Filme de 2019" / "Série de 2011"
  meta: string;
  // o nome da nota na biblioteca: "Obra-Prima" (vazio fora de 'rated')
  ratingName: string;
  // "Na watchlist"
  onWatchlist: string;
  // o que a pessoa fez, embaixo do @: "avaliou", "quer ver", "compartilhou"
  action: string;
  // resenha que não coube inteira: "continua no CineOracle"
  more: string;
  // resenha com spoiler: "Resenha com spoilers" e "Leia no CineOracle depois de assistir."
  spoilerTitle: string;
  spoilerHint: string;
}

export interface TitleStoryInput {
  title: string;
  state: TitleStoryState;
  // de 0 a 10; só vale com state 'rated'
  rating: number | null;
  // endereço completo da capa (a equipada, quando houver)
  posterUrl: string | null;
  // o pôster é um equipado do Poster Jackpot: efeito e marca de colecionador
  equipped?: { effect: PosterEffect; rarity: PosterRarity; serial: number | null } | null;
  // a resenha da própria pessoa (texto inteiro: o desenho corta o que não
  // couber). Com spoiler, quem chama manda o texto vazio: ele não é desenhado.
  review?: { title: string | null; text: string; spoiler: boolean } | null;
  // frameClass: a classe da moldura (getFrameClass), lida do cosmetics.css
  owner?: { username: string; avatarUrl: string | null; frameClass: string | null } | null;
  language: string;
  copy: TitleStoryCopy;
}

const offscreen = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
};

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const pixelFont = (size: number, weight = 400) => `${weight} ${size}px ${PIXEL_FONT_STACK}`;
const sansFont = (size: number, weight = 400) => `${weight} ${size}px ${SANS_STACK}`;

// "7,5" em português, "7.5" em inglês; nota inteira sai sem casa decimal.
export function formatStoryRating(rating: number, language: string): string {
  const value = Math.round(rating * 10) / 10;
  try {
    return value.toLocaleString(language, { maximumFractionDigits: 1 });
  } catch {
    return String(value);
  }
}

// Quebra em linhas que cabem em maxWidth (com a fonte atual). Diferente do
// wrapLines do storyCanvas: uma "palavra" maior que a linha (um link, um
// "kkkkkkkkkk") é partida, senão ela sairia do balão.
function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let word = raw;
    while (ctx.measureText(word).width > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      // Array.from: não parte um emoji ao meio
      const chars = Array.from(word);
      let n = chars.length - 1;
      while (n > 1 && ctx.measureText(chars.slice(0, n).join('')).width > maxWidth) n -= 1;
      lines.push(chars.slice(0, n).join(''));
      word = chars.slice(n).join('');
    }
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Fica com as primeiras `max` linhas. O corte é sempre entre palavras: a
// última linha perde palavras inteiras até caber com as reticências.
function clampLines(ctx: Ctx, lines: string[], max: number, maxWidth: number): { lines: string[]; cut: boolean } {
  if (lines.length <= max) return { lines, cut: false };
  const kept = lines.slice(0, Math.max(1, max));
  const tidy = (s: string) => s.replace(/[\s.,;:!?…–—-]+$/, '');
  let last = kept[kept.length - 1];
  while (last && ctx.measureText(`${tidy(last)}…`).width > maxWidth) {
    const space = last.lastIndexOf(' ');
    last = space > 0 ? last.slice(0, space) : Array.from(last).slice(0, -1).join('');
  }
  kept[kept.length - 1] = `${tidy(last)}…`;
  return { lines: kept, cut: true };
}

interface Fitted {
  size: number;
  lines: string[];
  lineHeight: number;
  cut: boolean;
}

// O título na fonte pixel: o maior tamanho da lista em que ele cabe na
// largura, na altura e no número de linhas; no menor, corta com reticências.
function fitTitle(ctx: Ctx, title: string, opts: { width: number; height: number; sizes: number[]; maxLines: number; weight: number }): Fitted {
  const text = noLig(title);
  let fitted: Fitted | null = null;
  for (const size of opts.sizes) {
    ctx.font = pixelFont(size, opts.weight);
    const lineHeight = Math.round(size * 1.12);
    const lines = wrapText(ctx, text, opts.width);
    fitted = { size, lines, lineHeight, cut: false };
    if (lines.length <= opts.maxLines && lines.length * lineHeight <= opts.height) return fitted;
  }
  const last = fitted as Fitted;
  ctx.font = pixelFont(last.size, opts.weight);
  const room = Math.max(1, Math.min(opts.maxLines, Math.floor(opts.height / last.lineHeight)));
  const clamped = clampLines(ctx, last.lines, room, opts.width);
  return { ...last, lines: clamped.lines, cut: clamped.cut };
}

// ---------------------------------------------------------------------------
// O pôster com o efeito (parado)
// ---------------------------------------------------------------------------

// linear-gradient(<ângulo>, …) do CSS pintado na caixa (bx, by, bw, bh). No CSS
// 0deg aponta para cima e o ângulo cresce no sentido horário; a linha do
// gradiente passa pelo centro da caixa e mede |w·sen| + |h·cos|.
function cssLinear(ctx: Ctx, angle: number, bx: number, by: number, bw: number, bh: number, stops: [number, string][]): CanvasGradient {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(bw * dx) + Math.abs(bh * dy)) / 2;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const gradient = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  stops.forEach(([at, color]) => gradient.addColorStop(Math.min(1, Math.max(0, at)), color));
  return gradient;
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Os filtros que o CSS aplica na imagem (.pj-negative > img etc.), feitos
// ponto a ponto: o ctx.filter não existe em todo navegador (WebKit antigo), e
// o story tem de sair igual no celular de qualquer pessoa. Cada função do CSS
// corta em 0–255 antes da seguinte, como o navegador faz.
function filterPixels(ctx: Ctx, w: number, h: number, effect: PosterEffect) {
  let image: ImageData;
  try {
    image = ctx.getImageData(0, 0, w, h);
  } catch {
    // imagem sem CORS "suja" o canvas: fica sem o filtro (as camadas ainda entram)
    return;
  }
  const d = image.data;
  const saturate = (r: number, g: number, b: number, s: number): [number, number, number] => [
    clamp255((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    clamp255((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    clamp255((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
  ];
  const contrast = (v: number, c: number) => clamp255((v - 127.5) * c + 127.5);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (effect === 'negative') {
      // invert(1) contrast(1.08) saturate(1.1)
      [r, g, b] = saturate(contrast(255 - r, 1.08), contrast(255 - g, 1.08), contrast(255 - b, 1.08), 1.1);
    } else if (effect === 'ultra_red') {
      // grayscale(1) contrast(1.45) brightness(1.1)
      const gray = clamp255(contrast(0.2126 * r + 0.7152 * g + 0.0722 * b, 1.45) * 1.1);
      r = gray;
      g = gray;
      b = gray;
    } else if (effect === 'holo') {
      // saturate(1.15) contrast(1.05)
      [r, g, b] = saturate(r, g, b, 1.15);
      r = contrast(r, 1.05);
      g = contrast(g, 1.05);
      b = contrast(b, 1.05);
    } else if (effect === 'gold') {
      // sepia(0.18) saturate(1.15) contrast(1.06) brightness(1.03)
      const k = 1 - 0.18;
      const sr = clamp255((0.393 + 0.607 * k) * r + (0.769 - 0.769 * k) * g + (0.189 - 0.189 * k) * b);
      const sg = clamp255((0.349 - 0.349 * k) * r + (0.686 + 0.314 * k) * g + (0.168 - 0.168 * k) * b);
      const sb = clamp255((0.272 - 0.272 * k) * r + (0.534 - 0.534 * k) * g + (0.131 + 0.869 * k) * b);
      [r, g, b] = saturate(sr, sg, sb, 1.15);
      r = clamp255(contrast(r, 1.06) * 1.03);
      g = clamp255(contrast(g, 1.06) * 1.03);
      b = clamp255(contrast(b, 1.06) * 1.03);
    }
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(image, 0, 0);
}

// As camadas de cada efeito, com as medidas e as cores do posterJackpot.css.
// No site elas correm (background-position animado); aqui é um quadro parado
// da mesma animação, escolhido com o brilho atravessando o pôster. O
// "transparent" do CSS vira a cor vizinha com alfa 0: o canvas mistura as
// paradas sem pré-multiplicar o alfa e o preto transparente sujaria a borda.
function paintEffectLayers(ctx: Ctx, w: number, h: number, effect: PosterEffect) {
  ctx.save();
  if (effect === 'ultra_red') {
    // .pj-ultra-tint: vermelho, multiply
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = '#ff1e2d';
    ctx.fillRect(0, 0, w, h);
    // .pj-ultra-lift: radial-gradient(120% 90% at 50% 28%, …), screen
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(w * 0.5, h * 0.28);
    ctx.scale(w * 1.2, h * 0.9);
    const lift = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    lift.addColorStop(0, 'rgba(255,110,80,0.32)');
    lift.addColorStop(0.7, 'rgba(70,0,10,0.25)');
    lift.addColorStop(1, 'rgba(70,0,10,0.25)');
    ctx.fillStyle = lift;
    ctx.fillRect(-1, -1, 2, 2);
  } else if (effect === 'holo') {
    // .pj-holo-foil: faixas de arco-íris que se repetem a cada 20% da linha
    // (120deg, caixa de 200%), color-dodge, opacidade 0.5
    const band: [number, string][] = [
      [0, 'rgba(255,64,160,0.55)'],
      [0.04, 'rgba(255,220,60,0.5)'],
      [0.08, 'rgba(60,255,170,0.5)'],
      [0.12, 'rgba(60,180,255,0.55)'],
      [0.16, 'rgba(170,80,255,0.5)'],
    ];
    const foil: [number, string][] = [];
    for (let rep = 0; rep < 5; rep += 1) band.forEach(([at, color]) => foil.push([rep * 0.2 + at, color]));
    foil.push([1, 'rgba(255,64,160,0.55)']);
    ctx.globalCompositeOperation = 'color-dodge';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = cssLinear(ctx, 120, 0, 0, w * 2, h * 2, foil);
    ctx.fillRect(0, 0, w, h);
    // .pj-holo-layer: o arco-íris largo (115deg, caixa de 260%), overlay.
    // Quadro com o arco no meio do pôster (background-position 50% 50%).
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = cssLinear(ctx, 115, -0.8 * w, -0.8 * h, w * 2.6, h * 2.6, [
      [0.15, 'rgba(255,0,153,0)'],
      [0.3, 'rgba(255,0,153,0.55)'],
      [0.4, 'rgba(255,230,0,0.5)'],
      [0.5, 'rgba(0,255,170,0.5)'],
      [0.6, 'rgba(0,170,255,0.55)'],
      [0.7, 'rgba(170,0,255,0.5)'],
      [0.85, 'rgba(170,0,255,0)'],
    ]);
    ctx.fillRect(0, 0, w, h);
    // .pj-holo-sheen: o brilho branco (115deg, caixa de 320%), soft-light.
    // Quadro com o brilho um pouco depois do arco (background-position 38%).
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = cssLinear(ctx, 115, -2.2 * w * 0.38, -2.2 * h * 0.38, w * 3.2, h * 3.2, [
      [0.4, 'rgba(255,255,255,0)'],
      [0.5, 'rgba(255,255,255,0.55)'],
      [0.6, 'rgba(255,255,255,0)'],
    ]);
    ctx.fillRect(0, 0, w, h);
  } else if (effect === 'gold') {
    // as medidas em px do CSS valem para o pôster do menu do título (264 px)
    const k = w / 264;
    // .pj-gold-wash: soft-light, opacidade 0.42
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = cssLinear(ctx, 140, 0, 0, w, h, [
      [0, '#8c5a12'],
      [0.3, '#ffe7a1'],
      [0.52, '#e8b54a'],
      [0.7, '#fff3c4'],
      [1, '#6e430b'],
    ]);
    ctx.fillRect(0, 0, w, h);
    // .pj-gold-grain: o fio escovado (1 px claro a cada 3), overlay
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,240,200,0.07)';
    for (let x = 0; x < w; x += 3 * k) ctx.fillRect(x, 0, k, h);
    // .pj-gold-sheen: a lâmina de luz (105deg, caixa de 300% × 100%),
    // color-dodge, na opacidade do pôster parado (0.55). Quadro no meio da
    // passada (background-position 60% 0).
    ctx.globalCompositeOperation = 'color-dodge';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = cssLinear(ctx, 105, -2 * w * 0.6, 0, w * 3, h, [
      [0.38, 'rgba(255,214,120,0)'],
      [0.44, 'rgba(255,214,120,0.25)'],
      [0.49, 'rgba(255,244,205,0.95)'],
      [0.5, 'rgba(255,255,255,1)'],
      [0.51, 'rgba(255,244,205,0.95)'],
      [0.56, 'rgba(255,214,120,0.25)'],
      [0.62, 'rgba(255,214,120,0)'],
    ]);
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// .pj-gold-rim: o friso de ouro por dentro da borda (dois fios e um brilho).
function paintGoldRim(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = w / 264;
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  // o brilho de dentro: a sombra de um contorno desenhado por fora do recorte
  ctx.shadowColor = 'rgba(255,196,80,0.5)';
  ctx.shadowBlur = 22 * k;
  ctx.lineWidth = 8 * k;
  ctx.strokeStyle = 'rgba(255,196,80,1)';
  roundRectPath(ctx, x - 4 * k, y - 4 * k, w + 8 * k, h + 8 * k, r + 4 * k);
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  // o fio escuro (até 3 px) e, por cima, o fio claro (1,5 px)
  ctx.lineWidth = 6 * k;
  ctx.strokeStyle = 'rgba(140,90,18,0.85)';
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = 'rgba(255,231,161,0.95)';
  roundRectPath(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

// Mistura uma cor "#RRGGBB" com branco (amount > 0) ou preto (amount < 0): a
// mesma conta do CollectorMark.tsx, para o cristal sair com as mesmas facetas.
const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
};

// O cristal da raridade (RarityGem, grade de 24): cabochão, esmeralda,
// hexágono e brilhante.
function drawGem(ctx: Ctx, rarity: PosterRarity, x: number, y: number, size: number) {
  const base = RARITY_META[rarity].color;
  const light = shade(base, 0.45);
  const lighter = shade(base, 0.7);
  const mid = shade(base, 0.15);
  const dark = shade(base, -0.28);
  const darker = shade(base, -0.45);
  const u = size / 24;
  const poly = (points: number[], fill: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = 0; i < points.length; i += 2) {
      if (i === 0) ctx.moveTo(x + points[i] * u, y + points[i + 1] * u);
      else ctx.lineTo(x + points[i] * u, y + points[i + 1] * u);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, fill: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(x + cx * u, y + cy * u, rx * u, ry * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  ctx.save();
  // o brilho da raridade em volta (drop-shadow do .pj-gem)
  ctx.shadowColor = RARITY_META[rarity].glow;
  ctx.shadowBlur = size * 0.3;
  if (rarity === 'common') ellipse(12, 12, 9.5, 9.5, dark);
  else if (rarity === 'rare') poly([7, 2.5, 17, 2.5, 21.5, 7, 21.5, 17, 17, 21.5, 7, 21.5, 2.5, 17, 2.5, 7], base);
  else if (rarity === 'epic') poly([12, 1.5, 21.5, 7, 21.5, 17, 12, 22.5, 2.5, 17, 2.5, 7], base);
  else poly([6, 3, 18, 3, 23, 9, 12, 22, 1, 9], base);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  if (rarity === 'common') {
    ellipse(12, 11.2, 8.6, 8.6, base);
    ellipse(9.4, 8.6, 4.4, 3, lighter, 0.85);
    ellipse(14.5, 16.2, 4.6, 2.2, darker, 0.35);
  } else if (rarity === 'rare') {
    poly([7, 2.5, 17, 2.5, 15, 7, 9, 7], lighter);
    poly([2.5, 7, 7, 9, 7, 15, 2.5, 17], light);
    poly([21.5, 7, 21.5, 17, 17, 15, 17, 9], dark);
    poly([7, 21.5, 17, 21.5, 15, 17, 9, 17], darker);
    poly([9, 7, 15, 7, 17, 9, 17, 15, 15, 17, 9, 17, 7, 15, 7, 9], mid);
    poly([9, 7, 15, 7, 13.5, 9.5, 10.5, 9.5], lighter, 0.7);
  } else if (rarity === 'epic') {
    poly([12, 1.5, 2.5, 7, 7.5, 9.5, 12, 7], light);
    poly([12, 1.5, 21.5, 7, 16.5, 9.5, 12, 7], lighter);
    poly([21.5, 7, 21.5, 17, 16.5, 14.5, 16.5, 9.5], mid);
    poly([21.5, 17, 12, 22.5, 12, 17, 16.5, 14.5], darker);
    poly([12, 22.5, 2.5, 17, 7.5, 14.5, 12, 17], dark);
    poly([2.5, 17, 2.5, 7, 7.5, 9.5, 7.5, 14.5], base);
    poly([12, 7, 16.5, 9.5, 16.5, 14.5, 12, 17, 7.5, 14.5, 7.5, 9.5], light, 0.9);
  } else {
    poly([6, 3, 9, 9, 1, 9], light);
    poly([6, 3, 18, 3, 15, 9, 9, 9], lighter);
    poly([18, 3, 23, 9, 15, 9], mid);
    poly([1, 9, 9, 9, 12, 22], dark);
    poly([9, 9, 15, 9, 12, 22], base);
    poly([15, 9, 23, 9, 12, 22], darker);
    poly([8.2, 4.2, 11, 4.2, 9.6, 7.2], '#FFFFFF', 0.75);
    // o brilho do Lendário (no site ele acende de tempos em tempos; aqui, aceso)
    ctx.beginPath();
    ctx.moveTo(x + 19 * u, y + 0.5 * u);
    ctx.quadraticCurveTo(x + 19.4 * u, y + 3.6 * u, x + 22.5 * u, y + 4 * u);
    ctx.quadraticCurveTo(x + 19.4 * u, y + 4.4 * u, x + 19 * u, y + 7.5 * u);
    ctx.quadraticCurveTo(x + 18.6 * u, y + 4.4 * u, x + 15.5 * u, y + 4 * u);
    ctx.quadraticCurveTo(x + 18.6 * u, y + 3.6 * u, x + 19 * u, y + 0.5 * u);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
  ctx.restore();
}

// A marca de colecionador (.pj-mark--lg): a plaquinha de vidro escuro com
// filete dourado, o cristal e "Nº 007" em Cinzel Decorative, no canto de baixo
// à direita do pôster. Todas as medidas em em, como no CSS.
function drawCollectorMark(ctx: Ctx, rarity: PosterRarity, serial: number, right: number, bottom: number, em: number) {
  const family = "'Cinzel Decorative', 'Cinzel', Georgia, serif";
  const number = String(serial).padStart(3, '0');
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  setLetterSpacing(ctx, em * 0.06);
  ctx.font = `700 ${em}px ${family}`;
  const numberW = ctx.measureText(number).width;
  setLetterSpacing(ctx, em * 0.02);
  ctx.font = `700 ${em * 0.72}px ${family}`;
  const noW = ctx.measureText('Nº').width;
  const gem = em * 1.5;
  const gap = em * 0.28;
  const h = em * 1.95;
  const w = em * 0.3 + (gem - em * 0.12) + gap + noW + gap * 0.8 + numberW + em * 0.62;
  const x = right - em * 0.6 - w;
  const y = bottom - em * 0.6 - h;
  // a plaquinha, com a sombra
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = em * 0.8;
  ctx.shadowOffsetY = em * 0.35;
  roundRectPath(ctx, x, y, w, h, h / 2);
  const glass = ctx.createLinearGradient(0, y, 0, y + h);
  glass.addColorStop(0, 'rgba(24,30,84,0.92)');
  glass.addColorStop(1, 'rgba(8,10,32,0.95)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.restore();
  roundRectPath(ctx, x, y, w, h, h / 2);
  const sheen = ctx.createLinearGradient(0, y, 0, y + h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.1)');
  sheen.addColorStop(0.46, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fill();
  const line = Math.max(1.5, em * 0.08);
  roundRectPath(ctx, x + line / 2, y + line / 2, w - line, h - line, (h - line) / 2);
  ctx.lineWidth = line;
  ctx.strokeStyle = 'rgba(255,232,163,0.46)';
  ctx.stroke();
  // o cristal salta um pouco da plaquinha
  let at = x + em * 0.3 - em * 0.12;
  drawGem(ctx, rarity, at, y + (h - gem) / 2, gem);
  at += gem + gap;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowOffsetY = Math.max(1, em * 0.05);
  ctx.font = `700 ${em * 0.72}px ${family}`;
  ctx.fillStyle = '#f4c454';
  ctx.fillText('Nº', at, y + h / 2 + em * 0.06);
  at += noW + gap * 0.8;
  setLetterSpacing(ctx, em * 0.06);
  ctx.font = `700 ${em}px ${family}`;
  ctx.fillStyle = '#fff4d6';
  ctx.fillText(number, at, y + h / 2 + em * 0.06);
  setLetterSpacing(ctx, 0);
  ctx.restore();
}

interface PosterBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A arte do pôster no tamanho em que vai ser desenhada, já com o efeito. É
// feita uma vez e serve aos dois: ao pôster e ao fundo (a luz de trás tem de
// ser a do pôster que se vê: com o negativo equipado o fundo clareia junto, com
// o ultra vermelho fica vermelho).
function posterArt(img: CanvasImage | null, w: number, h: number, effect: PosterEffect): HTMLCanvasElement | null {
  if (!img) return null;
  const art = offscreen(w, h);
  const artCtx = art.getContext('2d', { willReadFrequently: effect !== 'none' });
  if (!artCtx) return null;
  artCtx.imageSmoothingQuality = 'high';
  drawCover(artCtx, img, 0, 0, art.width, art.height);
  if (effect !== 'none') {
    filterPixels(artCtx, art.width, art.height, effect);
    paintEffectLayers(artCtx, art.width, art.height, effect);
  }
  return art;
}

// O pôster no lugar: sombra, a luz da nota em volta, a arte, o fio de luz na
// borda e a marca de colecionador. Sem imagem: um cartão de veludo com o olho
// da marca (o título já está escrito ao lado).
function drawPoster(ctx: Ctx, box: PosterBox, art: HTMLCanvasElement | null, input: TitleStoryInput, mark: BrandMark | null, tone: string) {
  const { x, y, w, h } = box;
  const r = Math.round(w * 0.058);
  const effect: PosterEffect = (art && input.equipped?.effect) || 'none';

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 34;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = VELVET;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.shadowColor = withAlpha(tone, 0.2);
  ctx.shadowBlur = 70;
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = VELVET;
  ctx.fill();
  ctx.restore();

  if (art) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.drawImage(art, x, y, w, h);
    ctx.restore();
  } else {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2A1F4A');
    bg.addColorStop(1, VELVET);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    drawGlow(ctx, x + w / 2, y + h * 0.42, w * 0.7, tone, 0.2);
    ctx.translate(x, y);
    drawStarDust(ctx, w, h, 26, 11);
    ctx.translate(-x, -y);
    if (mark) {
      const cell = Math.max(3, Math.round(w / 60));
      const markW = mark.cols * cell;
      const markH = mark.rows * cell;
      ctx.globalAlpha = 0.9;
      drawBrandMark(ctx, mark, Math.round(x + (w - markW) / 2), Math.round(y + h * 0.42 - markH / 2), markH);
    }
    ctx.restore();
  }

  if (effect === 'gold') paintGoldRim(ctx, x, y, w, h, r);
  else {
    roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
  }
  if (art && input.equipped?.serial) drawCollectorMark(ctx, input.equipped.rarity, input.equipped.serial, x + w, y + h, Math.max(18, w * 0.05));
}

// ---------------------------------------------------------------------------
// O fundo
// ---------------------------------------------------------------------------

// A capa desfocada para acender o fundo. Sem ctx.filter (não existe em todo
// navegador): a imagem desce em degraus até 9 px de largura e volta a subir,
// também em degraus; cada degrau suaviza o anterior. No menor degrau as cores
// ganham saturação (o saturate(1.25) do story do feed): sobram duas ou três
// manchas grandes de cor, sem desenho nenhum da capa.
function ambientOf(art: HTMLCanvasElement): HTMLCanvasElement {
  const steps: [number, number][] = [
    [288, 512],
    [144, 256],
    [72, 128],
    [36, 64],
    [18, 32],
    [9, 16],
  ];
  let current = offscreen(steps[0][0], steps[0][1]);
  const first = current.getContext('2d');
  if (first) {
    first.imageSmoothingQuality = 'high';
    // cobre o quadro 9:16 um pouco ampliada (o scale-125 do story do feed):
    // some a borda da capa
    const scale = Math.max(360 / art.width, 640 / art.height);
    const sw = 360 / scale;
    const sh = 640 / scale;
    first.drawImage(art, (art.width - sw) / 2, (art.height - sh) / 2, sw, sh, -36, -64, 360, 640);
  }
  const resample = (w: number, h: number) => {
    const next = offscreen(w, h);
    const nextCtx = next.getContext('2d', { willReadFrequently: true });
    if (nextCtx) {
      nextCtx.imageSmoothingQuality = 'high';
      nextCtx.drawImage(current, 0, 0, w, h);
    }
    current = next;
  };
  steps.slice(1).forEach(([w, h]) => resample(w, h));
  const small = current.getContext('2d', { willReadFrequently: true });
  if (small) {
    try {
      const image = small.getImageData(0, 0, current.width, current.height);
      const d = image.data;
      const count = d.length / 4;
      const mean = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) {
        mean[0] += d[i] / count;
        mean[1] += d[i + 1] / count;
        mean[2] += d[i + 2] / count;
      }
      const s = 1.25;
      // cada ponto vem meio caminho para a cor média da capa: fica a COR do
      // pôster, sem as manchas claras (um rosto, um letreiro) que apareciam
      // atrás do título como uma névoa suja
      const pull = 0.5;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] + (mean[0] - d[i]) * pull;
        const g = d[i + 1] + (mean[1] - d[i + 1]) * pull;
        const b = d[i + 2] + (mean[2] - d[i + 2]) * pull;
        d[i] = clamp255((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b);
        d[i + 1] = clamp255((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b);
        d[i + 2] = clamp255((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b);
      }
      small.putImageData(image, 0, 0);
    } catch {
      /* canvas "sujo" (imagem sem CORS): fica sem o acerto de cor */
    }
  }
  [...steps].reverse().slice(1).forEach(([w, h]) => resample(w, h));
  return current;
}

// A cor da nota NÃO vira mancha no fundo: sobre a capa desfocada, um verde ou
// um rosa espalhado dá cinza (testado no laboratório). A cor fica no número.
function drawBackground(ctx: Ctx, poster: HTMLCanvasElement | null) {
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  if (poster) {
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ambientOf(poster), 0, 0, W, H);
    ctx.restore();
    // o véu do story do feed, um pouco mais fechado: aqui há texto em cima
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(18,13,34,0.84)');
    veil.addColorStop(0.2, 'rgba(18,13,34,0.46)');
    veil.addColorStop(0.5, 'rgba(18,13,34,0.52)');
    veil.addColorStop(0.8, 'rgba(18,13,34,0.92)');
    veil.addColorStop(1, 'rgba(18,13,34,0.97)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  } else {
    drawGlow(ctx, W * 0.12, H * 0.78, 620, '#D946EF', 0.1);
  }
  // o brilho violeta do canto de cima (o fundo das páginas do site)
  drawGlow(ctx, W * 0.9, 0, 640, '#8B5CF6', poster ? 0.12 : 0.2);
  drawStarDust(ctx, W, H, 64);
}

// ---------------------------------------------------------------------------
// A nota
// ---------------------------------------------------------------------------

// O marcador da watchlist em pixels (8 × 11).
function drawBookmark(ctx: Ctx, x: number, y: number, unit: number, color: string) {
  ctx.save();
  ctx.shadowColor = withAlpha(color, 0.6);
  ctx.shadowBlur = unit * 3;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, unit * 8, unit * 9);
  ctx.fillRect(x, y + unit * 9, unit * 3, unit);
  ctx.fillRect(x + unit * 5, y + unit * 9, unit * 3, unit);
  ctx.fillRect(x, y + unit * 10, unit * 2, unit);
  ctx.fillRect(x + unit * 6, y + unit * 10, unit * 2, unit);
  ctx.restore();
}

interface Verdict {
  // o que vai em letras grandes: "10", "7,5" ou vazio (watchlist e fora da biblioteca)
  number: string;
  // "Obra-Prima" ou "Na watchlist"
  label: string;
  watchlist: boolean;
}

const verdictOf = (input: TitleStoryInput): Verdict | null => {
  if (input.state === 'rated' && input.rating !== null) {
    return { number: formatStoryRating(input.rating, input.language), label: input.copy.ratingName, watchlist: false };
  }
  if (input.state === 'watchlist') return { number: '', label: input.copy.onWatchlist, watchlist: true };
  return null;
};

// O número na fonte pixel, na cor da nota, com o "/10" pequeno ao lado (quem
// vê o story fora do site precisa saber que a régua vai até 10). `x` é a
// esquerda e `base` a linha de base. Devolve a largura.
function drawNumber(ctx: Ctx, verdict: Verdict, x: number, base: number, size: number, tone: string, draw = true): number {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = pixelFont(size);
  const numberW = ctx.measureText(verdict.number).width;
  const small = Math.round(size * 0.3);
  ctx.font = pixelFont(small);
  const outOfW = ctx.measureText('/10').width;
  const gap = Math.round(size * 0.06);
  if (draw) {
    ctx.save();
    ctx.shadowColor = withAlpha(tone, 0.55);
    ctx.shadowBlur = Math.round(size * 0.24);
    ctx.font = pixelFont(size);
    ctx.fillStyle = tone;
    ctx.fillText(verdict.number, x, base);
    ctx.restore();
    ctx.font = pixelFont(small);
    ctx.fillStyle = MIST;
    ctx.fillText('/10', x + numberW + gap, base);
  }
  ctx.restore();
  return numberW + gap + outOfW;
}

// ---------------------------------------------------------------------------
// O balão da resenha
// ---------------------------------------------------------------------------

const BALLOON = { padX: 48, bar: 12, padTop: 42, padBottom: 44, radius: 30, tail: 30 };

interface BalloonPlan {
  height: number;
  title: Fitted | null;
  body: Fitted | null;
  spoiler: boolean;
  more: boolean;
}

// A resenha em uma linha de texto corrido (os parágrafos viram espaço).
const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

const BODY_LEADING = 1.36;
const TITLE_GAP = 20;
const MORE_ROW = 56;
const MOSAIC_H = 120;
const QUOTE = { w: 70, h: 40 };

// Mede o balão: o título da resenha na fonte pixel (até 2 linhas) e o texto
// no maior corpo em que couber inteiro; se não couber nem no menor, corta
// entre palavras e avisa que continua no site.
function planBalloon(ctx: Ctx, input: TitleStoryInput, maxHeight: number): BalloonPlan | null {
  const review = input.review;
  if (!review) return null;
  const inner = CW - BALLOON.bar - BALLOON.padX * 2;
  const titleText = flat(review.title || '');
  const bodyText = flat(review.text || '');
  // resenha com spoiler sempre tem balão (o aviso), mesmo sem título e sem o texto
  if (!review.spoiler && !titleText && !bodyText) return null;

  let title: Fitted | null = null;
  if (titleText) {
    // ao lado das aspas em pixel
    title = fitTitle(ctx, titleText, { width: inner - QUOTE.w - 22, height: 120, sizes: [48, 44, 40], maxLines: 2, weight: 500 });
  }
  const headH = Math.max(QUOTE.h, title ? title.lines.length * title.lineHeight : 0);
  const chrome = BALLOON.padTop + headH + BALLOON.padBottom;

  if (review.spoiler) {
    // o texto NUNCA é impresso: o mosaico e o aviso ocupam o lugar dele
    return { height: chrome + TITLE_GAP + MOSAIC_H + 24 + 48 + 46, title, body: null, spoiler: true, more: false };
  }
  if (!bodyText) return { height: chrome, title, body: null, spoiler: false, more: false };

  const room = maxHeight - chrome - TITLE_GAP;
  const length = Array.from(bodyText).length;
  const start = length <= 26 ? 76 : length <= 70 ? 60 : length <= 150 ? 52 : length <= 280 ? 46 : 42;
  for (let size = start; size >= 38; size -= 2) {
    ctx.font = sansFont(size);
    const lineHeight = Math.round(size * BODY_LEADING);
    const lines = wrapText(ctx, bodyText, inner);
    if (lines.length * lineHeight <= room) {
      return { height: chrome + TITLE_GAP + lines.length * lineHeight, title, body: { size, lines, lineHeight, cut: false }, spoiler: false, more: false };
    }
  }
  // não coube: corpo 40 (ainda confortável no celular), cortado entre palavras
  const size = 40;
  ctx.font = sansFont(size);
  const lineHeight = Math.round(size * BODY_LEADING);
  const maxLines = Math.max(2, Math.floor((room - MORE_ROW) / lineHeight));
  const all = wrapText(ctx, bodyText, inner);
  // Se o que cabe termina uma frase perto do fim, o trecho para ali (lê melhor
  // do que parar no meio de uma ideia; o "continua no CineOracle" já diz que
  // há mais). Senão, corta entre palavras, com reticências.
  const fits = all.slice(0, maxLines).join(' ');
  let stop = -1;
  for (const match of fits.matchAll(/[.!?…](?=\s)/g)) stop = match.index ?? stop;
  const lines = stop >= fits.length * 0.6 ? wrapText(ctx, fits.slice(0, stop + 1), inner) : clampLines(ctx, all, maxLines, inner).lines;
  return {
    height: chrome + TITLE_GAP + lines.length * lineHeight + MORE_ROW,
    title,
    body: { size, lines, lineHeight, cut: true },
    spoiler: false,
    more: true,
  };
}

// As aspas em pixels: o mesmo desenho do ícone que abre a resenha no story do
// feed (duas vírgulas, o corpo em cima e o rabicho descendo para a esquerda).
function drawPixelQuote(ctx: Ctx, x: number, y: number, color: string) {
  const u = QUOTE.h / 4;
  ctx.fillStyle = color;
  [0, 4].forEach((dx) => {
    ctx.fillRect(x + dx * u, y, u * 3, u * 2);
    ctx.fillRect(x + (dx + 1) * u, y + u * 2, u * 2, u);
    ctx.fillRect(x + dx * u, y + u * 3, u * 2, u);
  });
}

// O véu do spoiler: um mosaico no lugar do texto. As larguras vêm de uma
// semente fixa, nunca da resenha (nada dela pode ser adivinhado pela imagem).
function drawMosaic(ctx: Ctx, x: number, y: number, width: number) {
  let s = 23;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cell = 16;
  const rows = [0.94, 1, 0.58];
  rows.forEach((share, row) => {
    const top = y + row * 44;
    let at = x;
    const end = x + width * share;
    while (at < end - cell) {
      const word = (2 + Math.floor(rnd() * 6)) * cell;
      const stop = Math.min(end, at + word);
      for (let cx = at; cx < stop - 1; cx += cell) {
        for (let cy = 0; cy < 2; cy += 1) {
          ctx.fillStyle = `rgba(34,27,54,${(0.1 + rnd() * 0.3).toFixed(3)})`;
          ctx.fillRect(cx, top + cy * cell, cell, cell);
        }
      }
      at = stop + cell;
    }
  });
}

function drawBalloon(ctx: Ctx, input: TitleStoryInput, plan: BalloonPlan, y: number, fill: string, tailX: number | null) {
  const x = M;
  const h = plan.height;
  // a sombra
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 26;
  roundRectPath(ctx, x, y, CW, h, BALLOON.radius);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
  // o rabicho, apontando para o avatar de quem escreveu
  if (tailX !== null) {
    ctx.beginPath();
    ctx.moveTo(tailX - 26, y + h - 2);
    ctx.lineTo(tailX + 26, y + h - 2);
    ctx.lineTo(tailX, y + h + BALLOON.tail);
    ctx.closePath();
    ctx.fillStyle = PAPER;
    ctx.fill();
  }
  // o papel e a faixa da cor de quem fala (a borda esquerda dos balões dos oráculos)
  ctx.save();
  roundRectPath(ctx, x, y, CW, h, BALLOON.radius);
  ctx.clip();
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y, CW, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, BALLOON.bar, h);
  ctx.restore();

  const left = x + BALLOON.bar + BALLOON.padX;
  const inner = CW - BALLOON.bar - BALLOON.padX * 2;
  let ty = y + BALLOON.padTop;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  drawPixelQuote(ctx, left, ty + (plan.title ? Math.round((plan.title.lineHeight - QUOTE.h) / 2) : 0), fill);
  if (plan.title) {
    const title = plan.title;
    ctx.font = pixelFont(title.size, 500);
    ctx.fillStyle = INK;
    title.lines.forEach((line, i) => ctx.fillText(line, left + QUOTE.w + 22, ty + i * title.lineHeight + Math.round(title.size * 0.84)));
  }
  ty += Math.max(QUOTE.h, plan.title ? plan.title.lines.length * plan.title.lineHeight : 0) + TITLE_GAP;

  if (plan.spoiler) {
    drawMosaic(ctx, left, ty + 6, inner);
    ty += MOSAIC_H + 24;
    ctx.font = sansFont(38, 600);
    ctx.fillStyle = INK;
    ctx.fillText(truncateToWidth(ctx, input.copy.spoilerTitle, inner), left, ty + 32);
    ctx.font = sansFont(33);
    ctx.fillStyle = withAlpha(INK, 0.78);
    ctx.fillText(truncateToWidth(ctx, input.copy.spoilerHint, inner), left, ty + 32 + 48);
    return;
  }
  if (plan.body) {
    const body = plan.body;
    ctx.font = sansFont(body.size);
    ctx.fillStyle = INK;
    body.lines.forEach((line, i) => ctx.fillText(line, left, ty + i * body.lineHeight + Math.round(body.size * 0.98)));
    ty += body.lines.length * body.lineHeight;
    if (plan.more) {
      ctx.font = pixelFont(34, 500);
      ctx.fillStyle = fill;
      ctx.textAlign = 'right';
      ctx.fillText(noLig(input.copy.more), x + CW - BALLOON.padX, ty + MORE_ROW - 8);
      ctx.textAlign = 'left';
    }
  }
}

// ---------------------------------------------------------------------------
// O pé: a pessoa à esquerda, a marca à direita
// ---------------------------------------------------------------------------

const FOOT_H = 124;
const AVATAR_R = 56;
// a grade da marca em pixels inteiros: olho com 63 px de altura, logotipo com 36
const BRAND_CELL = 3;

function drawFooter(
  ctx: Ctx,
  y: number,
  input: TitleStoryInput,
  art: { mark: BrandMark | null; wordmark: BrandMark | null; avatar: CanvasImage | null },
  tone: string,
) {
  const { mark, wordmark } = art;
  const markW = mark ? mark.cols * BRAND_CELL : 0;
  const markH = mark ? mark.rows * BRAND_CELL : 0;
  const wordW = wordmark ? wordmark.cols * BRAND_CELL : 0;
  const wordH = wordmark ? wordmark.rows * BRAND_CELL : 36;
  ctx.font = pixelFont(32);
  const urlW = ctx.measureText('cineoracle.com').width;
  const textW = Math.max(wordW, urlW);
  const brandW = markW + (mark ? 20 : 0) + textW;
  const owner = input.owner;
  // sem a pessoa (o perfil não veio), a marca fica no centro
  let bx = owner ? W - M - brandW : Math.round((W - brandW) / 2);
  const cy = y + FOOT_H / 2;
  if (mark) {
    drawBrandMark(ctx, mark, bx, Math.round(cy - markH / 2 - 3), markH);
    bx += markW + 20;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (wordmark) drawBrandMark(ctx, wordmark, bx, Math.round(cy - 40), wordH);
  ctx.font = pixelFont(32);
  ctx.fillStyle = URL_COLOR;
  ctx.fillText('cineoracle.com', bx, Math.round(cy - 40 + wordH + 36));

  if (!owner) return;
  const ax = M + AVATAR_R;
  drawFramedAvatar(ctx, art.avatar, ax, cy, AVATAR_R, {
    frame: readFrameStyle(owner.frameClass),
    accent: tone,
    initial: (owner.username || '?').trim().charAt(0).toUpperCase() || '?',
  });
  const tx = ax + AVATAR_R + 24;
  const room = W - M - brandW - 36 - tx;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = sansFont(40, 600);
  ctx.fillStyle = PAPER;
  ctx.fillText(truncateToWidth(ctx, `@${owner.username}`, room), tx, cy - 6);
  ctx.font = sansFont(32);
  ctx.fillStyle = MIST;
  ctx.fillText(truncateToWidth(ctx, input.copy.action, room), tx, cy + 38);
}

// ---------------------------------------------------------------------------
// O story
// ---------------------------------------------------------------------------

export async function drawTitleStory(input: TitleStoryInput): Promise<HTMLCanvasElement> {
  const verdict = verdictOf(input);
  const tone = input.state === 'none' ? NEUTRAL.light : ratingTone(input.state === 'rated' ? Math.floor(input.rating ?? 0) : null).color;
  const fill = input.state === 'none' ? NEUTRAL.fill : ratingBarColor(input.state === 'rated' ? Math.floor(input.rating ?? 0) : null);

  await ensureCanvasFonts();
  const wantsMarkFont = Boolean(input.equipped?.serial) && typeof document !== 'undefined' && document.fonts;
  const [mark, wordmark, poster, avatar] = await Promise.all([
    loadBrandMark(),
    loadBrandMark('/brand/cineoracle-wordmark.svg'),
    loadCanvasImage(input.posterUrl),
    loadCanvasImage(input.owner?.avatarUrl),
    // a letra da marca de colecionador (Cinzel Decorative), com teto de 2,5 s
    wantsMarkFont
      ? Promise.race([document.fonts.load("700 30px 'Cinzel Decorative'", 'Nº0123456789').catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 2500))])
      : null,
  ]);

  const canvas = offscreen(W, H);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d not available');
  ctx.imageSmoothingQuality = 'high';

  const AVAIL = SAFE_BOTTOM - SAFE_TOP - PAD * 2;
  const withOwner = Boolean(input.owner);
  const effect: PosterEffect = input.equipped?.effect ?? 'none';

  // ---- com resenha: pôster à esquerda, título e nota à direita, o balão ----
  const POSTER_MIN = 540;
  const GAP_BALLOON = 50;
  const GAP_FOOT = BALLOON.tail + 14;
  const balloon = planBalloon(ctx, input, AVAIL - POSTER_MIN - GAP_BALLOON - GAP_FOOT - FOOT_H);

  if (balloon) {
    const rest = GAP_BALLOON + balloon.height + GAP_FOOT + FOOT_H;
    const posterH = Math.round(Math.min(720, Math.max(POSTER_MIN, AVAIL - rest)));
    const posterW = Math.round((posterH * 2) / 3);
    const top = Math.round(SAFE_TOP + PAD + Math.max(0, (AVAIL - posterH - rest) / 2));
    const box: PosterBox = { x: M, y: top, w: posterW, h: posterH };
    const colX = M + posterW + 46;
    const colW = W - M - colX;

    const art = posterArt(poster, posterW, posterH, effect);
    drawBackground(ctx, art);
    drawPoster(ctx, box, art, input, mark, tone);

    // A coluna da direita é um bloco só (título, "Filme de 2019", a nota e o
    // nome dela), centrado na altura do pôster. Na primeira versão o título
    // ficava no alto e a nota no pé: com título curto sobrava um buraco no meio.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const META_ROW = 54;
    const GAP_VERDICT = 46;
    const GAP_LABEL = 26;
    let numberSize = 0;
    let markH = 0;
    let labelSize = 50;
    let labelLines: string[] = [];
    let labelLH = 0;
    if (verdict) {
      const labelText = noLig(verdict.label);
      ctx.font = pixelFont(labelSize, 500);
      while (labelSize > 36 && ctx.measureText(labelText).width > colW) {
        labelSize -= 2;
        ctx.font = pixelFont(labelSize, 500);
      }
      labelLines = wrapText(ctx, labelText, colW).slice(0, 2);
      labelLH = Math.round(labelSize * 1.12);
      if (verdict.watchlist) markH = 9 * 11;
      else {
        numberSize = 210;
        while (numberSize > 120 && drawNumber(ctx, verdict, 0, 0, numberSize, tone, false) > colW) numberSize -= 10;
        ctx.font = pixelFont(numberSize);
        markH = Math.round(ctx.measureText(verdict.number).actualBoundingBoxAscent || numberSize * 0.66);
      }
    }
    const verdictH = verdict ? GAP_VERDICT + markH + GAP_LABEL + labelLines.length * labelLH : 0;
    const title = fitTitle(ctx, input.title, { width: colW, height: posterH - META_ROW - verdictH, sizes: [76, 68, 60, 54, 48, 44], maxLines: 6, weight: 500 });
    const blockH = title.lines.length * title.lineHeight + META_ROW + verdictH;
    let ty = Math.round(top + Math.max(0, (posterH - blockH) / 2));
    ctx.font = pixelFont(title.size, 500);
    ctx.fillStyle = PAPER;
    title.lines.forEach((line, i) => ctx.fillText(line, colX, ty + i * title.lineHeight + Math.round(title.size * 0.8)));
    ty += title.lines.length * title.lineHeight;
    ctx.font = sansFont(34, 500);
    ctx.fillStyle = MIST;
    ctx.fillText(truncateToWidth(ctx, input.copy.meta, colW), colX, ty + 40);
    ty += META_ROW;
    if (verdict) {
      ty += GAP_VERDICT;
      if (verdict.watchlist) drawBookmark(ctx, colX, ty, 9, tone);
      // o número avança um pouco para a esquerda: o desenho do algarismo tem margem
      else drawNumber(ctx, verdict, colX - Math.round(numberSize * 0.03), ty + markH, numberSize, tone);
      ty += markH + GAP_LABEL;
      ctx.font = pixelFont(labelSize, 500);
      ctx.fillStyle = PAPER;
      labelLines.forEach((line, i) => ctx.fillText(line, colX, ty + i * labelLH + Math.round(labelSize * 0.78)));
    }

    const balloonY = top + posterH + GAP_BALLOON;
    const footY = balloonY + balloon.height + GAP_FOOT;
    drawBalloon(ctx, input, balloon, balloonY, fill, withOwner ? M + AVATAR_R : null);
    drawFooter(ctx, footY, input, { mark, wordmark, avatar }, tone);
  } else {
    // ---- sem resenha: o pôster grande no centro, o título e a nota embaixo ----
    const GAP_TITLE = 46;
    // Primeiro tenta caber em até 2 linhas (diminuindo a letra); só um título
    // muito comprido vai para 3. Cada linha a menos é pôster a mais.
    let title = fitTitle(ctx, input.title, { width: CW, height: 200, sizes: [80, 72, 64, 60, 56], maxLines: 2, weight: 500 });
    if (title.cut) title = fitTitle(ctx, input.title, { width: CW, height: 200, sizes: [58, 54, 50], maxLines: 3, weight: 500 });
    const titleH = title.lines.length * title.lineHeight;
    const META_H = 50;
    const verdictH = verdict ? 34 + (verdict.watchlist ? 100 : 132) : 0;
    const GAP_FOOT_P = 50;
    const rest = GAP_TITLE + titleH + META_H + verdictH + GAP_FOOT_P + FOOT_H;
    const posterH = Math.round(Math.min(900, Math.max(560, AVAIL - rest)));
    const posterW = Math.round((posterH * 2) / 3);
    const top = Math.round(SAFE_TOP + PAD + Math.max(0, (AVAIL - posterH - rest) / 2));
    const box: PosterBox = { x: Math.round((W - posterW) / 2), y: top, w: posterW, h: posterH };

    const art = posterArt(poster, posterW, posterH, effect);
    drawBackground(ctx, art);
    drawPoster(ctx, box, art, input, mark, tone);

    let y = top + posterH + GAP_TITLE;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = pixelFont(title.size, 500);
    ctx.fillStyle = PAPER;
    title.lines.forEach((line, i) => ctx.fillText(line, W / 2, y + i * title.lineHeight + Math.round(title.size * 0.8)));
    y += titleH;
    ctx.font = sansFont(34, 500);
    ctx.fillStyle = MIST;
    ctx.fillText(truncateToWidth(ctx, input.copy.meta, CW), W / 2, y + 38);
    y += META_H;

    if (verdict) {
      y += 34;
      const labelText = noLig(verdict.label);
      ctx.textAlign = 'left';
      if (verdict.watchlist) {
        const unit = 8;
        ctx.font = pixelFont(58, 500);
        const labelW = ctx.measureText(labelText).width;
        const total = unit * 8 + 28 + labelW;
        const x0 = Math.round((W - total) / 2);
        drawBookmark(ctx, x0, y + 6, unit, tone);
        ctx.fillStyle = PAPER;
        ctx.fillText(labelText, x0 + unit * 8 + 28, y + 6 + unit * 11 - 22);
      } else {
        // "10/10  Obra-Prima" numa linha só, na mesma linha de base
        const size = 170;
        const numberW = drawNumber(ctx, verdict, 0, 0, size, tone, false);
        let labelSize = 58;
        ctx.font = pixelFont(labelSize, 500);
        while (labelSize > 36 && numberW + 34 + ctx.measureText(labelText).width > CW) {
          labelSize -= 2;
          ctx.font = pixelFont(labelSize, 500);
        }
        const total = numberW + 34 + ctx.measureText(labelText).width;
        const x0 = Math.round((W - total) / 2);
        const base = y + 124;
        drawNumber(ctx, verdict, x0, base, size, tone);
        ctx.font = pixelFont(labelSize, 500);
        ctx.fillStyle = PAPER;
        ctx.fillText(labelText, x0 + numberW + 34, base);
      }
      y += verdictH - 34;
    }
    drawFooter(ctx, y + GAP_FOOT_P, input, { mark, wordmark, avatar }, tone);
  }

  // a faixa da lua da marca no pé (enfeite; fica sob a interface do Instagram)
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  MOON.forEach((color, i) => bar.addColorStop(i / (MOON.length - 1), color));
  ctx.fillStyle = bar;
  ctx.fillRect(0, H - 10, W, 10);

  return canvas;
}

// O story pronto para compartilhar: JPEG 0.92 (o Instagram recomprime de
// qualquer jeito, e o arquivo menor passa mais rápido pela ponte do app).
export async function renderTitleStory(input: TitleStoryInput): Promise<Blob> {
  return canvasToBlob(await drawTitleStory(input), 'image/jpeg', 0.92);
}

// cineoracle-parasita.jpg
export const titleStoryFileName = (title: string) => {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `cineoracle-${slug || 'story'}.jpg`;
};
