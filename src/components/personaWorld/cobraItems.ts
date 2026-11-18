import type { PersonaWorld } from '../../lib/personaWorld';
import type { ItemEnv, Kit } from './studio';
import { disc, faceX, faceY, pokeFrame, type Ctx } from './pixel';

// Os móveis que a Cobra dá no pôquer (17/11/2026, noite).
//
// Pedido do Bruno: "adicione móveis para a cobra dar no poker - um rifle de
// parede (único objeto por enquanto a ficar fixo no spot único na parede que
// sobrou), um toca discos onde futuramente o usuário poderá escutar trilhas
// sonoras que vai ganhar em uma roleta especial totalmente nova".
//
// Os dois estão no catálogo secreto da Cobra (poker_items, tipo 'studio'): em
// 20% dos torneios ela traz uma caixinha com um item que a pessoa ainda não
// tem, e quem vence leva. O estúdio sabe quais a pessoa tem por
// get_persona_world.items. O rifle mora na parede (draw.ts, fixo); o
// toca-discos é um objeto de chão como os outros (aqui), que a pessoa muda de
// lugar, guarda e gira.

export const COBRA_RIFLE = 'studio-rifle';
export const COBRA_TURNTABLE = 'studio-turntable';
export const hasCobraItem = (world: PersonaWorld, id: string): boolean => world.items.includes(id) || Boolean(world.preview);

// ---------------------------------------------------------------------------
// O toca-discos
// ---------------------------------------------------------------------------
// Um móvel de nogueira baixo (com os discos guardados no nicho da frente) e,
// em cima, o toca-discos: o prato com o vinil, o rótulo verde da Cobra, o
// braço prateado e, em pé atrás, a capa do disco que está tocando (verde,
// com o vinil espiando). A primeira versão tinha a tampa de acrílico aberta
// atrás; na escala da sala ela virou um vulto cinza, e saiu. Parado, o disco espera,
// com a luzinha vermelha do aparelho acesa. Tocar põe o disco para girar: o
// braço desce, o rótulo gira e as notinhas sobem por uns 3 segundos. Um dia
// ele vai tocar as trilhas sonoras que a pessoa ganhar (um jogo que ainda
// não existe); até lá, a música é só a de pixel.
export const TURNTABLE = { w: 0.8, d: 0.8, h: 22 };
const WOOD = '#6A4630';
const DECK = '#2B2333';
const VINYL = '#141019';
const GROOVE = '#2C2634';
const LABEL = '#22C55E';
const LABEL_LIGHT = '#86EFAC';
const SILVER = '#C9CDD6';
const SILVER_DARK = '#7B8090';
const NOTE = '#F3EAD3';
const CABINET_H = 9;
const DECK_H = 3;
const TOP = CABINET_H + DECK_H;

// o centro do prato e o lugar da tampa
const platterAt = (k: Kit, x: number, y: number) => k.iso(x + 0.36, y + 0.42, TOP);

export function drawTurntable(k: Kit, ctx: Ctx, x: number, y: number) {
  const { w, d } = TURNTABLE;
  // o móvel de nogueira, com o nicho dos discos na frente
  k.box(ctx, x, y, 0, w, d, CABINET_H, WOOD);
  const front = k.iso(x, y + d, 0);
  const width = Math.round(w * 12);
  faceY(ctx, front, 1, 1, width - 2, CABINET_H - 2, '#2A1A14');
  ['#E5484D', '#F4C454', '#4ADE80', '#818CF8', '#FB923C', '#F3EAD3'].forEach((color, i) => faceY(ctx, front, 2 + i, 1, 1, 5 + ((i * 2) % 3), color));
  faceY(ctx, front, 0, CABINET_H - 1, width, 1, k.light(WOOD, 0.2));
  const side = k.iso(x + w, y, 0);
  faceX(ctx, side, 2, 3, 5, 1, k.dark(WOOD, 0.25));
  // o tampo do aparelho
  k.box(ctx, x + 0.04, y + 0.04, CABINET_H, w - 0.08, d - 0.08, DECK_H, DECK);
  // a capa do disco, em pé no fundo do tampo: verde da Cobra, com uma faixa
  // clara e o vinil espiando pelo lado
  const sleeve = k.iso(x + 0.1, y + 0.16, TOP);
  faceY(ctx, sleeve, 0, 0, 8, 9, '#14532D');
  faceY(ctx, sleeve, 1, 1, 6, 7, '#166534');
  faceY(ctx, sleeve, 1, 5, 6, 1, '#4ADE80');
  faceY(ctx, sleeve, 3, 2, 2, 2, '#86EFAC');
  faceY(ctx, sleeve, 8, 2, 1, 5, VINYL);
  faceY(ctx, sleeve, 9, 3, 1, 3, VINYL);
  // o prato com o disco (parado; o que gira é pintado por cima)
  const c = platterAt(k, x, y);
  disc(ctx, c[0], c[1], 6, 3, '#3A3442');
  disc(ctx, c[0], c[1] - 1, 6, 3, VINYL);
  disc(ctx, c[0], c[1] - 1, 4, 2, GROOVE);
  disc(ctx, c[0], c[1] - 1, 3, 1, VINYL);
  disc(ctx, c[0], c[1] - 1, 2, 1, LABEL);
  k.px(ctx, Math.round(c[0]), Math.round(c[1]) - 1, NOTE, 1, 1);
  // os botões e a luzinha vermelha (ligado)
  const knob = k.iso(x + w - 0.16, y + d - 0.12, TOP);
  k.px(ctx, Math.round(knob[0]) - 2, Math.round(knob[1]) - 1, SILVER_DARK, 2, 1);
  k.px(ctx, Math.round(knob[0]) + 1, Math.round(knob[1]) - 1, '#FF5A5F', 1, 1);
}

// o braço: o pivô atrás, à direita, e a agulha fora do disco (parado) ou em cima dele (tocando)
const drawArm = (k: Kit, ctx: Ctx, x: number, y: number, playing: boolean) => {
  const pivot = k.iso(x + 0.66, y + 0.18, TOP);
  const px0 = Math.round(pivot[0]);
  const py0 = Math.round(pivot[1]);
  k.px(ctx, px0 - 1, py0 - 3, SILVER_DARK, 3, 2);
  k.px(ctx, px0, py0 - 4, SILVER, 1, 1);
  // o braço desce em diagonal até a cabeça
  const steps = playing ? [[0, 0], [-1, 1], [-2, 1], [-3, 2], [-4, 3], [-5, 3]] : [[0, 0], [0, 1], [0, 2], [0, 3], [-1, 4], [-1, 5]];
  steps.forEach(([dx, dy]) => k.px(ctx, px0 + dx, py0 - 3 + dy, SILVER, 1, 1));
  const [hx, hy] = steps[steps.length - 1];
  k.px(ctx, px0 + hx - 1, py0 - 3 + hy, SILVER_DARK, 2, 1);
};

export function paintTurntable(k: Kit, ctx: Ctx, x: number, y: number, _env: ItemEnv, tick: number, still: boolean) {
  const f = still ? -1 : pokeFrame('turntable');
  const playing = f >= 0;
  const c = platterAt(k, x, y);
  const cx = Math.round(c[0]);
  const cy = Math.round(c[1]) - 1;
  if (playing) {
    // o rótulo girando: um ponto claro dá a volta no rótulo, e um brilho corre no vinil
    const a = (f * Math.PI) / 3;
    k.px(ctx, cx + Math.round(Math.cos(a) * 2), cy + Math.round(Math.sin(a)), LABEL_LIGHT, 1, 1);
    const b = (f * Math.PI) / 4 + Math.PI;
    k.px(ctx, cx + Math.round(Math.cos(b) * 5), cy + Math.round(Math.sin(b) * 2), '#4A4256', 1, 1);
  }
  drawArm(k, ctx, x, y, playing);
  if (playing && f >= 2) {
    // as notinhas sobem, balançando, e somem
    for (let n = 0; n < 3; n += 1) {
      const age = f - 2 - n * 5;
      if (age < 0 || age > 12) continue;
      const nx = cx + 3 + n * 3 + (age % 4 < 2 ? 0 : 1);
      const ny = cy - 6 - age;
      ctx.fillStyle = n === 1 ? LABEL_LIGHT : NOTE;
      ctx.fillRect(nx, ny, 2, 1);
      ctx.fillRect(nx + 1, ny - 3, 1, 3);
      ctx.fillRect(nx + 2, ny - 3, 1, 1);
    }
  } else if (!still && tick % 48 < 2) {
    // parado: o disco brilha de leve de vez em quando
    k.px(ctx, cx - 4, cy - 1, '#5A5268', 2, 1);
  }
}
