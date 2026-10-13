import { NIGHT, VELVET, PAPER, MIST, PIXEL_FONT_STACK, withAlpha } from './oracleTheme';
import { MOOD_BY_LETTER } from './moods';
import { getFrameClass } from './frames';
import { connectionTone, connectionPoster, connectionTitleName, type ConnectionDetail, type ConnectionSide, type ConnectionTitle } from './connection';
import {
  SANS_STACK,
  ensureCanvasFonts,
  loadCanvasImage,
  loadBrandMark,
  drawBrandMark,
  drawCover,
  roundRectPath,
  wrapLines,
  truncateToWidth,
  fitFont,
  noLig,
  setLetterSpacing,
  drawGlow,
  drawStarDust,
  drawGlassPanel,
  readFrameStyle,
  drawFramedAvatar,
  drawPersonaCode,
  drawSparkle,
  canvasToBlob,
  type CanvasImage,
} from './storyCanvas';

// Story da Conexão (13/10/2026): imagem 1080×1920 para os stories, com os
// dois avatares (com moldura), a % grande na cor da conexão, a faixa
// ("Mesma Sessão"), quantos títulos em comum, três pôsteres em leque de
// títulos que os dois amam, os dois códigos de personalidade e o convite
// "Qual é a sua conexão? cineoracle.com".
//
// Um elemento só chama atenção (a % entre os dois avatares); o resto é
// quieto. Nada romântico: sem corações nem "match".
//
// Zonas seguras do Instagram: a barra do perfil cobre o topo (y 0–250) e o
// campo "Enviar mensagem" cobre o rodapé (y 1670–1920). Tudo que importa
// fica entre as duas, centrado na altura que sobra. Fora delas só há
// enfeite (brilhos, estrelas, a faixa de cor no pé).

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;
const SAFE_TOP = 250;
const SAFE_BOTTOM = 1670;

// Textos já traduzidos (quem chama usa o t() do idioma do site).
export interface ConnectionCardCopy {
  // "Conexão"
  label: string;
  // Nome da faixa: "Mesma Sessão"
  tier: string;
  // "34 títulos em comum"
  shared: string;
  // "confiança média" / "prévia"
  confidence: string;
  // Título dos pôsteres: "Os dois amam"
  loved: string;
  // "Qual é a sua conexão?"
  cta: string;
}

export interface ConnectionCardInput {
  detail: ConnectionDetail;
  // Você (à esquerda) e a outra pessoa (à direita).
  me: ConnectionSide;
  other: ConnectionSide;
  language: string;
  copy: ConnectionCardCopy;
}

const TMDB_POSTER = 'https://image.tmdb.org/t/p/w342';
const FALLBACK_ACCENT = { me: '#8B5CF6', other: '#D946EF' };
const URL_COLOR = '#F0ABFC';

// Os títulos do leque: os que os dois mais amam (a menor das duas notas
// primeiro, depois a soma), de preferência com pôster.
export function pickStoryTitles(detail: ConnectionDetail, language: string, n = 3): ConnectionTitle[] {
  const score = (t: ConnectionTitle) => [Math.min(t.rating_me ?? 0, t.rating_other), (t.rating_me ?? 0) + t.rating_other];
  const sorted = [...(detail.loves || [])].sort((a, b) => {
    const [aMin, aSum] = score(a);
    const [bMin, bSum] = score(b);
    return bMin - aMin || bSum - aSum;
  });
  const withPoster = sorted.filter((t) => connectionPoster(t, language));
  const without = sorted.filter((t) => !connectionPoster(t, language));
  return [...withPoster, ...without].slice(0, n);
}

// Cor de cada pessoa: a do primeiro humor do código (sem código, violeta/fúcsia).
const sideAccent = (side: ConnectionSide, fallback: string) => MOOD_BY_LETTER[(side.persona_code || '').charAt(0)]?.color ?? fallback;

const initialOf = (side: ConnectionSide) => (side.username || '?').trim().charAt(0).toUpperCase() || '?';

// Nome do arquivo: cineoracle-conexao-bruno-icoagner.jpg
export const connectionStoryFileName = (me: ConnectionSide, other: ConnectionSide) =>
  `cineoracle-conexao-${me.username}-${other.username}.jpg`.toLowerCase();

// Um pôster (ou, sem imagem, o nome do título num cartão liso), girado
// `angle` graus em volta do centro.
function drawPoster(
  ctx: CanvasRenderingContext2D,
  img: CanvasImage | null,
  title: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  angle: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angle * Math.PI) / 180);
  const x = -w / 2;
  const y = -h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.fillStyle = VELVET;
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRectPath(ctx, x, y, w, h, 18);
  ctx.clip();
  if (img) {
    drawCover(ctx, img, x, y, w, h);
  } else {
    const bg = ctx.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, '#2A1F4A');
    bg.addColorStop(1, VELVET);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PAPER;
    ctx.font = `600 26px ${SANS_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapLines(ctx, title, w - 32).slice(0, 4);
    lines.forEach((line, i) => ctx.fillText(truncateToWidth(ctx, line, w - 32), 0, (i - (lines.length - 1) / 2) * 34));
  }
  ctx.restore();
  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, 17);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(243,234,211,0.18)';
  ctx.stroke();
  ctx.restore();
}

// Desenha o story num canvas 1080×1920.
export async function drawConnectionStory(input: ConnectionCardInput): Promise<HTMLCanvasElement> {
  const { detail, me, other, language, copy } = input;
  if (detail.pct === null || detail.confidence === 'none') throw new Error('connection has no score');
  const W = STORY_WIDTH;
  const H = STORY_HEIGHT;
  const pct = Math.round(detail.pct);
  const tone = connectionTone(pct).color;
  const accentMe = sideAccent(me, FALLBACK_ACCENT.me);
  const accentOther = sideAccent(other, FALLBACK_ACCENT.other);
  const codeMe = (me.persona_code || '').toUpperCase();
  const codeOther = (other.persona_code || '').toUpperCase();
  const sharedLetters = new Set(codeMe.split('').filter((l) => codeOther.includes(l)));
  const titles = pickStoryTitles(detail, language, 3);

  await ensureCanvasFonts();
  const [mark, avatarMe, avatarOther, ...posterImgs] = await Promise.all([
    loadBrandMark(),
    loadCanvasImage(me.avatar_url),
    loadCanvasImage(other.avatar_url),
    ...titles.map((t) => {
      const path = connectionPoster(t, language);
      return loadCanvasImage(path ? `${TMDB_POSTER}${path}` : null);
    }),
  ]);

  // ---- Medidas (de cima para baixo) e centro vertical na área segura ----
  const AV_R = 116;
  const AV_DX = 250;
  const hasCodes = Boolean(codeMe || codeOther);
  const PANEL_H = 406;
  const POSTER = { w: 204, h: 306 };
  const SIDE_POSTER = { w: 180, h: 270, dx: 172, dy: 22, angle: 8 };
  const FAN_H = titles.length >= 3 ? 324 : POSTER.h + 16;
  const heights = {
    avatars: AV_R * 2,
    names: 26 + 42,
    codes: hasCodes ? 14 + 52 : 0,
    panel: 46 + PANEL_H,
    fan: titles.length ? 48 + 40 + 26 + FAN_H : 0,
    footer: 46 + 38 + 18 + 46,
  };
  const total = Object.values(heights).reduce((a, b) => a + b, 0);
  let y = Math.round(SAFE_TOP + Math.max(0, (SAFE_BOTTOM - SAFE_TOP - total) / 2));

  const avY = y + AV_R;
  const ax = W / 2 - AV_DX;
  const bx = W / 2 + AV_DX;
  y += heights.avatars;
  const nameY = y + 26 + 21;
  y += heights.names;
  const codeY = y + 14 + 26;
  y += heights.codes;
  const panelY = y + 46;
  y += heights.panel;
  const fanCaptionY = y + 48 + 20;
  const fanTop = y + 48 + 40 + 26;
  y += heights.fan;
  const ctaY = y + 46 + 19;
  const urlY = y + 46 + 38 + 18 + 23;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d not available');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ---- Fundo: noite, a luz de cada pessoa, a luz da conexão ----
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  drawGlow(ctx, W * 0.9, 0, 640, '#8B5CF6', 0.2);
  drawGlow(ctx, ax, avY, 520, accentMe, 0.18);
  drawGlow(ctx, bx, avY, 520, accentOther, 0.18);
  drawGlow(ctx, W / 2, panelY + PANEL_H / 2, 620, tone, 0.12);
  drawStarDust(ctx, W, H);

  // ---- O fio entre os dois avatares, com um nó no meio ----
  const x1 = ax + AV_R + 24;
  const x2 = bx - AV_R - 24;
  const line = ctx.createLinearGradient(x1, 0, x2, 0);
  line.addColorStop(0, withAlpha(accentMe, 0.9));
  line.addColorStop(0.5, tone);
  line.addColorStop(1, withAlpha(accentOther, 0.9));
  ctx.save();
  ctx.shadowColor = tone;
  ctx.shadowBlur = 24;
  ctx.fillStyle = line;
  for (let x = x1; x < x2 - 6; x += 18) ctx.fillRect(Math.round(x), avY - 4, 10, 8);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = tone;
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(W / 2, avY, 30, 0, Math.PI * 2);
  ctx.fillStyle = NIGHT;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = withAlpha(tone, 0.7);
  ctx.stroke();
  ctx.restore();
  drawSparkle(ctx, W / 2, avY, 5, tone);

  // ---- Avatares, nomes e códigos ----
  drawFramedAvatar(ctx, avatarMe, ax, avY, AV_R, {
    frame: readFrameStyle(getFrameClass(me.avatar_frame || undefined, me.is_premium)),
    accent: accentMe,
    initial: initialOf(me),
  });
  drawFramedAvatar(ctx, avatarOther, bx, avY, AV_R, {
    frame: readFrameStyle(getFrameClass(other.avatar_frame || undefined, other.is_premium)),
    accent: accentOther,
    initial: initialOf(other),
  });
  ctx.font = `600 38px ${SANS_STACK}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(truncateToWidth(ctx, `@${me.username}`, AV_DX * 2 - 120), ax, nameY);
  ctx.fillText(truncateToWidth(ctx, `@${other.username}`, AV_DX * 2 - 120), bx, nameY);
  if (codeMe) drawPersonaCode(ctx, codeMe, ax, codeY, 50, sharedLetters);
  if (codeOther) drawPersonaCode(ctx, codeOther, bx, codeY, 50, sharedLetters);

  // ---- A conexão: rótulo, % grande, faixa e títulos em comum ----
  const panelX = 72;
  const panelW = W - panelX * 2;
  drawGlassPanel(ctx, panelX, panelY, panelW, PANEL_H, 44, tone);
  ctx.font = `600 28px ${SANS_STACK}`;
  ctx.fillStyle = MIST;
  setLetterSpacing(ctx, 3);
  ctx.fillText(copy.label, W / 2 + 1.5, panelY + 56);
  setLetterSpacing(ctx, 0);

  // "~" (prévia) e "%" menores, em névoa; o número na cor da conexão.
  const NUM = 220;
  const SMALL = Math.round(NUM * 0.42);
  const TILDE = Math.round(NUM * 0.9);
  const numText = String(pct);
  const prefix = detail.confidence === 'low' ? '~' : '';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `${NUM}px ${PIXEL_FONT_STACK}`;
  const numW = ctx.measureText(numText).width;
  ctx.font = `${SMALL}px ${PIXEL_FONT_STACK}`;
  const pctW = ctx.measureText('%').width;
  ctx.font = `${TILDE}px ${PIXEL_FONT_STACK}`;
  const preW = prefix ? ctx.measureText(prefix).width + 6 : 0;
  const numBase = panelY + 258;
  let nx = (W - (preW + numW + 10 + pctW)) / 2;
  if (prefix) {
    // O til fica na altura do meio dos algarismos.
    ctx.fillStyle = MIST;
    ctx.textBaseline = 'middle';
    ctx.fillText(prefix, nx, numBase - NUM * 0.32);
    ctx.textBaseline = 'alphabetic';
    nx += preW;
  }
  ctx.save();
  ctx.shadowColor = withAlpha(tone, 0.6);
  ctx.shadowBlur = 50;
  ctx.font = `${NUM}px ${PIXEL_FONT_STACK}`;
  ctx.fillStyle = tone;
  ctx.fillText(numText, nx, numBase);
  ctx.restore();
  ctx.font = `${SMALL}px ${PIXEL_FONT_STACK}`;
  ctx.fillStyle = MIST;
  ctx.fillText('%', nx + numW + 10, numBase);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const tierText = noLig(copy.tier);
  fitFont(ctx, tierText, { weight: 600, family: PIXEL_FONT_STACK, size: 50, min: 34, maxWidth: panelW - 80 });
  ctx.fillStyle = PAPER;
  ctx.fillText(tierText, W / 2, panelY + 312);
  const sub = `${copy.shared}  ·  ${copy.confidence}`;
  fitFont(ctx, sub, { weight: 500, family: SANS_STACK, size: 32, min: 24, maxWidth: panelW - 80 });
  ctx.fillStyle = MIST;
  ctx.fillText(sub, W / 2, panelY + 368);

  // ---- Leque de pôsteres: o melhor no meio, os outros girados atrás ----
  if (titles.length) {
    ctx.font = `600 38px ${PIXEL_FONT_STACK}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(noLig(copy.loved), W / 2, fanCaptionY);
    const name = (t: ConnectionTitle) => connectionTitleName(t, language);
    const centerY = fanTop + POSTER.h / 2;
    if (titles.length >= 3) {
      const sideY = centerY + SIDE_POSTER.dy;
      drawPoster(ctx, posterImgs[1], name(titles[1]), W / 2 - SIDE_POSTER.dx, sideY, SIDE_POSTER.w, SIDE_POSTER.h, -SIDE_POSTER.angle);
      drawPoster(ctx, posterImgs[2], name(titles[2]), W / 2 + SIDE_POSTER.dx, sideY, SIDE_POSTER.w, SIDE_POSTER.h, SIDE_POSTER.angle);
      drawPoster(ctx, posterImgs[0], name(titles[0]), W / 2, centerY, POSTER.w, POSTER.h, 0);
    } else if (titles.length === 2) {
      drawPoster(ctx, posterImgs[0], name(titles[0]), W / 2 - 112, centerY, POSTER.w, POSTER.h, -5);
      drawPoster(ctx, posterImgs[1], name(titles[1]), W / 2 + 112, centerY, POSTER.w, POSTER.h, 5);
    } else {
      drawPoster(ctx, posterImgs[0], name(titles[0]), W / 2, centerY, POSTER.w, POSTER.h, 0);
    }
  }

  // ---- Convite e endereço (com o olho da marca) ----
  ctx.font = `600 36px ${SANS_STACK}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(copy.cta, W / 2, ctaY, W - 160);
  ctx.font = `44px ${PIXEL_FONT_STACK}`;
  const urlW = ctx.measureText('cineoracle.com').width;
  const MARK_H = 40;
  const markW = mark ? (mark.cols / mark.rows) * MARK_H : 0;
  const gap = mark ? 16 : 0;
  let ux = (W - (markW + gap + urlW)) / 2;
  if (mark) {
    drawBrandMark(ctx, mark, ux, urlY - MARK_H / 2 - 2, MARK_H);
    ux += markW + gap;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = URL_COLOR;
  ctx.fillText('cineoracle.com', ux, urlY + 2);
  ctx.textAlign = 'center';

  // Faixa de cor no pé (enfeite; fica sob a interface do Instagram).
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, accentMe);
  bar.addColorStop(0.5, tone);
  bar.addColorStop(1, accentOther);
  ctx.fillStyle = bar;
  ctx.fillRect(0, H - 10, W, 10);

  return canvas;
}

// O story pronto para compartilhar: JPEG 0.92 (~200 KB; o Instagram
// recomprime de qualquer jeito, e o arquivo menor passa ~10× mais rápido
// pela ponte do app nativo que um PNG).
export async function renderConnectionStory(input: ConnectionCardInput): Promise<Blob> {
  const canvas = await drawConnectionStory(input);
  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}
