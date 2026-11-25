import { NIGHT, PAPER, MIST, INK, PIXEL_FONT_STACK } from './oracleTheme';
import { MOOD_BY_LETTER, showLetter } from './moods';
import { worldState, type PersonaWorld } from './personaWorld';
import { SANS_STACK, ensureCanvasFonts, loadBrandMark, drawBrandMark, roundRectPath, wrapLines, fitFont, drawGlow, drawStarDust, canvasToBlob } from './storyCanvas';
import { drawMoth, drawRoom, mothSpec, paintFrame, RH, RW } from '../components/personaWorld/draw';
import { loadSceneImages } from '../components/personaWorld/sceneImages';
import type { StudioExtras } from '../components/personaWorld/studio';

// O story do estúdio (1080×1920), desenhado direto num canvas (14/11/2026).
//
// Pedido do Bruno, ao rever o modal "Sua Persona": "adapte o que é
// compartilhado, o conteúdo do stories, com base nas novas implementações".
// Até aqui o story (lib/personaCard, de outubro) era a foto do personagem, o
// código e as três prateleiras: nada dele mostrava o estúdio nem a mariposa,
// que hoje são a Persona.
//
// Agora o story é o que a pessoa vê quando abre a gaveta, na mesma ordem:
//   • o estúdio dela, inteiro (o nível em que está, as latas nas prateleiras,
//     os quadros do Jackpot, a máquina e a mesa), em pixels grandes;
//   • a mariposa dela, de perto, ao lado do código, do título e do personagem;
//   • o nível do estúdio e quantos títulos ele guarda (desde 15/11/2026 é
//     "Estúdio nível N"; antes era a bitola, "Super 16" etc.);
//   • o @ e o convite, com o olho da marca.
//
// O estúdio e a mariposa são desenhados pelas mesmas funções da cena viva
// (drawRoom, paintFrame e drawMoth), num canvas pequeno, e ampliados em escala
// inteira sem suavizar: o story mostra exatamente o que está no app, parado.
//
// Zonas seguras do Instagram (as mesmas do story da Conexão): a barra do
// perfil cobre o topo (y 0–250) e o campo de mensagem cobre o pé (y
// 1670–1920). Tudo o que importa fica entre as duas.

type Ctx = CanvasRenderingContext2D;

const W = 1080;
const H = 1920;
const SAFE_TOP = 250;
const SAFE_BOTTOM = 1670;
const URL_COLOR = '#F0ABFC';

// a cena: 180 × 158 pixels, ampliada 5×
const SCENE_K = 5;
// a mariposa de perto: desenhada no mesmo quadro da gaveta (96 × 84) e
// ampliada o máximo que couber nesta caixa (a mariposa do nível 1 é bem menor
// que a do nível 10; no story as duas ocupam mais ou menos o mesmo espaço)
const MOTH = { w: 96, h: 84, maxW: 360, maxH: 300 };

// a parte do canvas que tem desenho
function inkBox(canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!data) return null;
  let x0 = canvas.width;
  let y0 = canvas.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] < 20) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface StudioCardInput {
  world: PersonaWorld;
  // a sala de estar como a pessoa vê (a máquina e a mesa aparecem?)
  extras: StudioExtras;
  // "Ouvinte das Estrelas" e "Ellie Arroway, em Contato (1997)"
  title: string;
  subtitle: string;
  // "Estúdio nível 4" e "266 títulos avaliados"
  gauge: string;
  rated: string;
  username?: string | null;
  cta: string;
}

const offscreen = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

// o código, alinhado à esquerda, cada letra na cor do seu humor
function drawCodeLeft(ctx: Ctx, code: string, x: number, cy: number, size: number): number {
  ctx.save();
  ctx.font = `${size}px ${PIXEL_FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const gap = size * 0.08;
  let at = x;
  code.split('').forEach((letter) => {
    ctx.fillStyle = MOOD_BY_LETTER[letter]?.color ?? MIST;
    // 25/11/2026: a letra que a pessoa vê (o Sensorial é "S" na tela)
    ctx.fillText(showLetter(letter), at, cy);
    at += ctx.measureText(showLetter(letter)).width + gap;
  });
  ctx.restore();
  return at - gap - x;
}

const codeWidth = (ctx: Ctx, code: string, size: number): number => {
  ctx.save();
  ctx.font = `${size}px ${PIXEL_FONT_STACK}`;
  const width = code.split('').reduce((sum, letter) => sum + ctx.measureText(showLetter(letter)).width, 0) + size * 0.08 * (code.length - 1);
  ctx.restore();
  return width;
};

export async function drawStudioCard(input: StudioCardInput): Promise<HTMLCanvasElement> {
  const { world } = input;
  const st = worldState(world);
  const code = st.code ?? world.persona?.code ?? '';
  // parado, a luz da máquina não pisca: 'alert' e 'on' dão o mesmo desenho
  const extras: StudioExtras = { jackpot: input.extras.jackpot === 'off' ? 'off' : 'on', poker: input.extras.poker };

  await ensureCanvasFonts();
  const [mark, images] = await Promise.all([loadBrandMark(), loadSceneImages(world, st.stage)]);

  // ---- o estúdio e a mariposa, em pixels ----
  const room = offscreen(RW, RH);
  const roomCtx = room.getContext('2d');
  if (roomCtx) drawRoom(roomCtx, st, world, images, extras);
  const scene = offscreen(RW, RH);
  const sceneCtx = scene.getContext('2d');
  const spec = mothSpec(st, world);
  if (sceneCtx) paintFrame(sceneCtx, room, st, world, spec, 0, true, extras);
  const moth = offscreen(MOTH.w, MOTH.h);
  const mothCtx = moth.getContext('2d', { willReadFrequently: true });
  if (mothCtx && spec) drawMoth(mothCtx, 48, 42, 46, spec, 1);
  const mothBox = (spec && inkBox(moth)) || { x: 0, y: 0, w: MOTH.w, h: MOTH.h };
  // escala inteira, para o pixel não borrar
  const mothK = Math.max(2, Math.min(6, Math.floor(MOTH.maxW / mothBox.w), Math.floor(MOTH.maxH / mothBox.h)));

  const canvas = offscreen(W, H);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d not available');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // ---- as medidas (o bloco inteiro fica centrado entre as zonas seguras) ----
  const sceneW = RW * SCENE_K;
  const sceneH = RH * SCENE_K;
  const mothW = mothBox.w * mothK;
  const mothH = mothBox.h * mothK;
  const TEXT_MAX = W - 160 - mothW - 44;
  const CODE_SIZE = 116;
  const titleSize = fitFont(ctx, input.title, { weight: 700, family: SANS_STACK, size: 54, min: 44, maxWidth: TEXT_MAX });
  ctx.font = `700 ${titleSize}px ${SANS_STACK}`;
  const titleLines = wrapLines(ctx, input.title, TEXT_MAX).slice(0, 2);
  const titleLH = Math.round(titleSize * 1.16);
  const titleW = Math.max(...titleLines.map((line) => ctx.measureText(line).width));
  ctx.font = `400 30px ${SANS_STACK}`;
  const subLines = wrapLines(ctx, input.subtitle, TEXT_MAX).slice(0, 2);
  const subW = Math.max(...subLines.map((line) => ctx.measureText(line).width));
  const textH = 104 + 16 + titleLines.length * titleLH + 12 + subLines.length * 38;
  const textW = Math.min(TEXT_MAX, Math.max(codeWidth(ctx, code, CODE_SIZE), titleW, subW));
  const rowH = Math.max(mothH, textH);

  const heights = {
    scene: sceneH,
    row: 30 + rowH,
    stats: 34 + 60,
    name: input.username ? 30 + 40 : 0,
    footer: 40 + 38 + 18 + 46,
  };
  const total = Object.values(heights).reduce((a, b) => a + b, 0);
  let y = Math.round(SAFE_TOP + Math.max(0, (SAFE_BOTTOM - SAFE_TOP - total) / 2));
  const sceneY = y;
  y += heights.scene;
  const rowY = y + 30;
  y += heights.row;
  const statsY = y + 34 + 30;
  y += heights.stats;
  const nameY = y + 30 + 20;
  y += heights.name;
  const ctaY = y + 40 + 19;
  const urlY = y + 40 + 38 + 18 + 23;

  const tints = code.length === 3 ? code.split('').map((letter) => MOOD_BY_LETTER[letter]?.color ?? '#8B5CF6') : ['#A78BFA', '#F0ABFC', '#38BDF8'];

  // ---- o fundo: noite, a luz do estúdio e as três cores do código ----
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W, H);
  drawGlow(ctx, W * 0.9, 0, 640, '#8B5CF6', 0.2);
  drawGlow(ctx, W / 2, sceneY + sceneH * 0.55, 700, tints[0], 0.2);
  drawGlow(ctx, W * 0.16, rowY + rowH / 2, 460, tints[1], 0.16);
  drawGlow(ctx, W * 0.88, rowY + rowH / 2, 460, tints[2], 0.12);
  drawStarDust(ctx, W, H);

  // ---- o estúdio ----
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scene, Math.round((W - sceneW) / 2), sceneY, sceneW, sceneH);

  // ---- a mariposa, o código, o título e o personagem ----
  const rowW = mothW + 44 + textW;
  const rowX = Math.round((W - rowW) / 2);
  if (spec) ctx.drawImage(moth, mothBox.x, mothBox.y, mothBox.w, mothBox.h, rowX, Math.round(rowY + (rowH - mothH) / 2), mothW, mothH);
  ctx.imageSmoothingEnabled = true;
  const textX = rowX + mothW + 44;
  let ty = Math.round(rowY + (rowH - textH) / 2);
  drawCodeLeft(ctx, code, textX, ty + 56, CODE_SIZE);
  ty += 104 + 16;
  ctx.textAlign = 'left';
  ctx.font = `700 ${titleSize}px ${SANS_STACK}`;
  ctx.fillStyle = PAPER;
  titleLines.forEach((line, index) => ctx.fillText(line, textX, ty + titleLH / 2 + index * titleLH));
  ty += titleLines.length * titleLH + 12;
  ctx.font = `400 30px ${SANS_STACK}`;
  ctx.fillStyle = MIST;
  subLines.forEach((line, index) => ctx.fillText(line, textX, ty + 19 + index * 38));

  // ---- o nível do estúdio e quantos títulos ele guarda ----
  ctx.font = `44px ${PIXEL_FONT_STACK}`;
  const gaugeW = ctx.measureText(input.gauge).width + 44;
  ctx.font = `500 34px ${SANS_STACK}`;
  const ratedW = ctx.measureText(input.rated).width;
  let sx = Math.round((W - (gaugeW + 24 + ratedW)) / 2);
  roundRectPath(ctx, sx, statsY - 30, gaugeW, 60, 12);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.font = `44px ${PIXEL_FONT_STACK}`;
  ctx.fillStyle = INK;
  ctx.fillText(input.gauge, sx + 22, statsY + 2);
  sx += gaugeW + 24;
  ctx.font = `500 34px ${SANS_STACK}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(input.rated, sx, statsY + 1);
  ctx.textAlign = 'center';

  if (input.username) {
    ctx.font = `500 34px ${SANS_STACK}`;
    ctx.fillStyle = MIST;
    ctx.fillText(`@${input.username}`, W / 2, nameY, W - 160);
  }

  // ---- o convite e o endereço (com o olho da marca) ----
  ctx.font = `600 36px ${SANS_STACK}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(input.cta, W / 2, ctaY, W - 160);
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

  // a faixa das três cores no pé (enfeite; fica sob a interface do Instagram)
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, tints[0]);
  bar.addColorStop(0.5, tints[1]);
  bar.addColorStop(1, tints[2]);
  ctx.fillStyle = bar;
  ctx.fillRect(0, H - 10, W, 10);

  return canvas;
}

// O story pronto para compartilhar: JPEG 0.92 (o Instagram recomprime de
// qualquer jeito, e o arquivo menor passa mais rápido pela ponte do app).
export async function renderStudioStory(input: StudioCardInput): Promise<Blob> {
  return canvasToBlob(await drawStudioCard(input), 'image/jpeg', 0.92);
}
