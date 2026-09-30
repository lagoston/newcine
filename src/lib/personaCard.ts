import { NIGHT, VELVET, PAPER, MIST, PIXEL_FONT_STACK, PIXEL_FONT_SAMPLE, withAlpha } from './oracleTheme';

// Arte 9:16 (1080×1920) da personalidade, desenhada direto num canvas.
// Antes usava html2canvas, que deslocava o texto (a fonte pixel descia e
// encavalava nas linhas de baixo) e media a prévia reduzida em vez da arte.
// Desenhando à mão, a prévia e a imagem baixada são exatamente iguais.

export interface PersonaCardShelf {
  letter: string;
  label: string;
  color: string;
}

export interface PersonaCardInput {
  code: string;
  codeColors: string[];
  label: string;
  title: string;
  subtitle: string;
  shelves: PersonaCardShelf[];
  username?: string | null;
  cta: string;
  posterUrl: string | null;
  glow: string;
  oracles: { avatar: string; color: string }[];
}

const W = 1080;
const H = 1920;
const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    // Sem CORS liberado a imagem falha e entra o fundo liso — nunca
    // "suja" o canvas (o que impediria de gerar o arquivo).
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

const roundRectPath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

// Desenha a imagem cobrindo o retângulo (como object-fit: cover).
const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
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
};

export async function drawPersonaCard(input: PersonaCardInput, scale = 0.66): Promise<HTMLCanvasElement> {
  // As fontes precisam estar prontas antes do primeiro fillText.
  try {
    // A amostra inclui L e Z: as letras do código vêm da fonte de glifos.
    await Promise.all([document.fonts.load(`200px ${PIXEL_FONT_STACK}`, PIXEL_FONT_SAMPLE), document.fonts.load(`600 30px ${SANS}`)]);
    await document.fonts.ready;
  } catch {
    /* segue com a fonte que houver */
  }
  const [poster, ...avatars] = await Promise.all([input.posterUrl ? loadImage(input.posterUrl) : Promise.resolve(null), ...input.oracles.map((o) => loadImage(o.avatar))]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Fundo: noite, brilho da cor da primeira letra e o violeta da marca.
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  const glowA = ctx.createRadialGradient(540, 620, 0, 540, 620, 820);
  glowA.addColorStop(0, withAlpha(input.glow, 0.22));
  glowA.addColorStop(1, withAlpha(input.glow, 0));
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, W, H);
  const glowB = ctx.createRadialGradient(920, 0, 0, 920, 0, 620);
  glowB.addColorStop(0, 'rgba(139,92,246,0.28)');
  glowB.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, W, H);

  // Marca: os três oráculos + CineOracle.
  ctx.font = `64px ${PIXEL_FONT_STACK}`;
  const brandW = ctx.measureText('CineOracle').width;
  const avatarSize = 76;
  const avatarsW = avatarSize * 3 - 18 * 2;
  let bx = (W - (avatarsW + 28 + brandW)) / 2;
  const by = 128;
  input.oracles.forEach((oracle, i) => {
    const cx = bx + avatarSize / 2 + i * (avatarSize - 18);
    ctx.beginPath();
    ctx.arc(cx, by, avatarSize / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = NIGHT;
    ctx.fill();
    const img = avatars[i];
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, by, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = VELVET;
    ctx.fillRect(cx - avatarSize / 2, by - avatarSize / 2, avatarSize, avatarSize);
    if (img) drawCover(ctx, img, cx - avatarSize / 2, by - avatarSize / 2, avatarSize, avatarSize);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, by, avatarSize / 2 - 2.5, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = oracle.color;
    ctx.stroke();
  });
  bx += avatarsW + 28;
  ctx.textAlign = 'left';
  ctx.fillStyle = PAPER;
  ctx.fillText('CineOracle', bx, by + 4);
  ctx.textAlign = 'center';

  // Pôster do filme do personagem.
  const px = 305;
  const py = 215;
  const pw = 470;
  const ph = 705;
  ctx.save();
  ctx.shadowColor = withAlpha(input.glow, 0.55);
  ctx.shadowBlur = 90;
  ctx.shadowOffsetY = 40;
  roundRectPath(ctx, px, py, pw, ph, 32);
  ctx.fillStyle = VELVET;
  ctx.fill();
  ctx.restore();
  if (poster) {
    ctx.save();
    roundRectPath(ctx, px, py, pw, ph, 32);
    ctx.clip();
    drawCover(ctx, poster, px, py, pw, ph);
    ctx.restore();
  }
  roundRectPath(ctx, px + 2, py + 2, pw - 4, ph - 4, 30);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(243,234,211,0.18)';
  ctx.stroke();

  // Código, uma cor por letra.
  let y = 1060;
  ctx.font = `200px ${PIXEL_FONT_STACK}`;
  const letters = input.code.split('');
  const widths = letters.map((l) => ctx.measureText(l).width);
  const codeW = widths.reduce((a, b) => a + b, 0);
  let lx = (W - codeW) / 2;
  ctx.textAlign = 'left';
  letters.forEach((letter, i) => {
    ctx.fillStyle = input.codeColors[i] || PAPER;
    ctx.fillText(letter, lx, y);
    lx += widths[i];
  });
  ctx.textAlign = 'center';

  // Rótulo, título (até duas linhas) e personagem.
  y += 132;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = MIST;
  ctx.fillText(input.label, W / 2, y);

  y += 58;
  ctx.font = `700 64px ${SANS}`;
  ctx.fillStyle = PAPER;
  const titleLines = wrapLines(ctx, input.title, 940).slice(0, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, W / 2, y + i * 74));
  y += (titleLines.length - 1) * 74;

  y += 62;
  ctx.font = `34px ${SANS}`;
  ctx.fillStyle = MIST;
  ctx.fillText(input.subtitle, W / 2, y, 960);

  // As três prateleiras, em uma ou duas linhas.
  y += 56;
  ctx.font = `600 30px ${SANS}`;
  const chips = input.shelves.map((s) => ({ ...s, w: 10 + 50 + 14 + ctx.measureText(s.label).width + 26 }));
  const rows: (typeof chips)[] = [];
  let row: typeof chips = [];
  let rowW = 0;
  for (const chip of chips) {
    const next = rowW + (row.length ? 16 : 0) + chip.w;
    if (row.length && next > 960) {
      rows.push(row);
      row = [chip];
      rowW = chip.w;
    } else {
      row.push(chip);
      rowW = next;
    }
  }
  if (row.length) rows.push(row);
  rows.forEach((r, ri) => {
    const total = r.reduce((sum, c) => sum + c.w, 0) + 16 * (r.length - 1);
    let cx = (W - total) / 2;
    const top = y + ri * 86;
    r.forEach((chip) => {
      roundRectPath(ctx, cx, top, chip.w, 72, 36);
      ctx.fillStyle = withAlpha(chip.color, 0.14);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = withAlpha(chip.color, 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 10 + 25, top + 36, 25, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(chip.color, 0.25);
      ctx.fill();
      ctx.font = `32px ${PIXEL_FONT_STACK}`;
      ctx.fillStyle = chip.color;
      ctx.fillText(chip.letter, cx + 10 + 25, top + 37);
      ctx.font = `600 30px ${SANS}`;
      ctx.fillStyle = PAPER;
      ctx.textAlign = 'left';
      ctx.fillText(chip.label, cx + 10 + 50 + 14, top + 37);
      ctx.textAlign = 'center';
      cx += chip.w + 16;
    });
  });
  y += rows.length * 86 - 14;

  if (input.username) {
    y += 52;
    ctx.font = `500 36px ${SANS}`;
    ctx.fillStyle = MIST;
    ctx.fillText(`@${input.username}`, W / 2, y);
  }

  // Rodapé.
  ctx.font = `600 36px ${SANS}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(input.cta, W / 2, H - 146, 960);
  ctx.font = `42px ${PIXEL_FONT_STACK}`;
  ctx.fillStyle = '#F0ABFC';
  ctx.fillText('cineoracle.com', W / 2, H - 78);
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, '#7c3aed');
  bar.addColorStop(0.5, '#c026d3');
  bar.addColorStop(1, input.glow);
  ctx.fillStyle = bar;
  ctx.fillRect(0, H - 10, W, 10);

  return canvas;
}
