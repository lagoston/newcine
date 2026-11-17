import { disc, pokeFrame, sprite, type Ctx, type Pt } from '../pixel';
import type { Kit } from '../studio';
import type { MoodItemArt } from './types';

// ----- A redoma das almas (17/11/2026): o móvel da Catarse (☯️ Soul Collector),
// os filmes que fazem chorar, o desabafo, a alma lavada. Escolha do Bruno: uma
// redoma de vidro de museu (a "cloche", com o puxador de latão no alto) sobre
// um pé de madeira escura torneada, como um fruteiro alto: o prato largo, o
// pescoço fino com um bojo e a base redonda. Na frente do prato, uma plaquinha
// de latão sem nada escrito, de peça de coleção (Soul Collector). Dentro, duas
// almas: uma clara (creme) e uma escura (violeta fundo, de borda acesa em anil
// para se ver no escuro), girando uma em volta da outra como o ☯️ da tag, cada
// uma puxando o seu rastrinho.
//
// Parado: as duas orbitam devagar (uma volta a cada 4 s), numa órbita
// inclinada (ver TILT): a alma que passa por trás fica mais apagada e é pintada
// antes da outra. De vez em quando um reflexo do vidro pisca no alto da cúpula.
// Toque: as duas se aproximam em espiral, cada vez mais rápidas, se encontram
// no meio num clarão branco e anil que acende o vidro por dentro (e vaza um
// pouco em volta da redoma), soltam umas faíscas que sobem e se separam de
// novo, voltando para a órbita de sempre (pouco mais de 2 s ao todo).
//
// O vidro: o contorno e o miolo (anil bem escuro, um pouco transparente) vão no
// desenho parado; as almas e os reflexos da frente vão no paint, os reflexos
// por cima das almas (um reflexo translúcido pintado nos dois ficaria dobrado
// onde não passa alma). A cor do humor está no vidro todo: o contorno, a luz
// do miolo e a borda acesa da alma escura.

const ID = 'souljar';
const W = 1;
const D = 1;

const ANIL = '#818CF8';
const PAPER = '#F3EAD3';
const GOLD = '#F4C454';

// a madeira escura do pé (nogueira), da sombra ao friso que pega luz
const WOOD = { x: '#2E1A10', d: '#45271A', m: '#653C23', w: '#84522F', e: '#B07A48' };

// O vidro, linha a linha a partir do alto da cúpula: a meia largura de cada
// linha (em pixels, a partir do meio; a redoma tem largura par). A cúpula (4
// linhas), as paredes retas e, por último, a frente da boca (a elipse do pé da
// redoma, que desce na frente do prato).
const CAP = [3, 5, 6, 7];
const SIDE = 8;
const MOUTH = [7, 6, 4];
const DOME = [...CAP, ...Array<number>(SIDE).fill(7), ...MOUTH];
// a linha do meio da boca (onde a redoma pousa no prato), contada do alto
const LIP = CAP.length + SIDE - 1;
// a altura do tampo do prato de madeira (pixels acima do chão)
const PLATE_TOP = 16;
// a órbita das almas: o meio (linhas acima da boca) e os raios na tela. A
// órbita é um pouco inclinada (TILT: o lado direito sobe, o esquerdo desce):
// deitada certinha, as duas ficavam lado a lado na mesma altura e a redoma
// virava um capacete com dois olhos; inclinada, elas passam na diagonal, como
// as duas gotas do ☯️, e o giro parece o de um giroscópio.
const ORBIT_UP = 4;
const RX = 3;
const RY = 2;
const TILT = 3;
const ORBIT_TICKS = 32;

// O pé torneado, desenhado à mão (18 colunas, o meio entre a 9ª e a 10ª), da
// linha de baixo da boca da redoma até o chão: a borda moldada do prato, o
// colarinho na sombra do prato, o pescoço, o bojo, o pescoço e a base redonda.
// O lado esquerdo é o mais escuro (como a face +y das caixas da sala) e o
// torneado pega um fio de luz à direita do meio.
const STAND = [
  'ew..............we',
  'xew............wed',
  'xxeee........eeedd',
  '.xxddeeeeeeeemddd.',
  '..xxxddQPPpwmdxx..',
  '.....xxpppnmd.....',
  '......xxddmd......',
  '.......xdmd.......',
  '......xdmwed......',
  '......xdmmwd......',
  '.......xdmd.......',
  '.....wwxdmdww.....',
  '...wwmxddmmdmww...',
  '...wwwwmmmmwwww...',
  '...eewwwwwwwwee...',
  '...xxeeeeeeeedd...',
  '...xxdddmmwmddd...',
  '.....xdddmmdd.....',
];

// o meio do chão do objeto, em pixels inteiros
const footOf = (k: Kit, x: number, y: number): Pt => {
  const p = k.iso(x + W / 2, y + D / 2, 0);
  return [Math.round(p[0]), Math.round(p[1])];
};

// O contorno do vidro: em cada linha, quantos pixels da ponta são borda (o
// degrau até a linha de cima ou de baixo, no mínimo 1).
const edgeOf = (i: number): number => Math.max(1, DOME[i] - Math.min(DOME[i - 1] ?? 0, DOME[i + 1] ?? 0));
// o miolo do vidro, linha a linha (sem o contorno)
// (a partir da linha first, contada do alto)
const fillInside = (ctx: Ctx, cx: number, apex: number, color: string, first = 0) => {
  ctx.fillStyle = color;
  DOME.forEach((half, i) => {
    const e = edgeOf(i);
    if (i >= first && half > e) ctx.fillRect(cx - half + e, apex + i, (half - e) * 2, 1);
  });
};
// o contorno do vidro, numa cor só (ou uma para cada lado)
const outline = (ctx: Ctx, cx: number, apex: number, left: (i: number) => string, right: (i: number) => string) => {
  DOME.forEach((half, i) => {
    const e = edgeOf(i);
    ctx.fillStyle = left(i);
    ctx.fillRect(cx - half, apex + i, e, 1);
    ctx.fillStyle = right(i);
    ctx.fillRect(cx + half - e, apex + i, e, 1);
    // a linha de cima da cúpula e a de baixo da boca são borda inteira
    if (half <= e) ctx.fillRect(cx - half, apex + i, half * 2, 1);
  });
};

// ---------------------------------------------------------------------------
// O desenho parado
// ---------------------------------------------------------------------------
const draw = (k: Kit, ctx: Ctx, x: number, y: number) => {
  const [cx, cy] = footOf(k, x, y);
  const lip = cy - PLATE_TOP;
  const apex = lip - LIP;
  // a sombra no chão e o tampo do prato (o resto do pé vem depois da redoma)
  disc(ctx, cx, cy + 1, 7, 3, 'rgba(8,5,18,0.4)');
  disc(ctx, cx, lip, 9, 4.5, WOOD.w);
  // o tampo visto através do vidro escuro: quase sem cor (com a madeira
  // aparecendo, o fundo da redoma virava uma almofada marrom)
  fillInside(ctx, cx, apex, '#262056', LIP - 4);

  // o miolo: anil escuro, um pouco transparente. 17/11/2026 (notas do diretor
  // de arte): era quase marinho (24,20,66) e, colado na máquina azul-royal do
  // Jackpot, a redoma lia azul-marinho, não anil; puxado para o anil, com mais
  // luz no meio
  fillInside(ctx, cx, apex, 'rgba(34,30,92,0.82)');
  // a luz das almas tinge o miolo de anil, mais forte no meio da órbita
  const oy = lip - ORBIT_UP;
  disc(ctx, cx, oy, 6, 5, 'rgba(129,140,248,0.28)');
  disc(ctx, cx, oy, 3, 2.5, 'rgba(129,140,248,0.14)');
  // a borda de trás da boca, vista através do vidro (diz que a redoma é oca)
  ctx.fillStyle = 'rgba(165,180,252,0.2)';
  ctx.fillRect(cx - 3, lip - 3, 6, 1);
  ctx.fillRect(cx - 5, lip - 2, 2, 1);
  ctx.fillRect(cx + 3, lip - 2, 2, 1);
  ctx.fillRect(cx - 6, lip - 1, 1, 1);
  ctx.fillRect(cx + 5, lip - 1, 1, 1);
  // o contorno: aceso do lado direito, mais apagado no esquerdo, claro no alto
  // da cúpula e na boca (onde o vidro é mais grosso)
  const tone = (side: string) => (i: number) => (i < 2 ? '#D6DBFF' : i > LIP ? '#B9C1FF' : side);
  outline(ctx, cx, apex, tone('#7F86E0'), tone('#C3CAFF'));
  // o puxador de latão, no alto (um botão redondo sobre um anel)
  sprite(ctx, cx - 2, apex - 3, ['.HG.', 'HGGg', 'gggn'], { H: '#FFE9A8', G: GOLD, g: '#B8862B', n: '#7A5418' });
  // o pé torneado
  sprite(ctx, cx - 9, lip + 1, STAND, { ...WOOD, Q: '#FFE9A8', P: GOLD, p: '#B8862B', n: '#7A5418' });
};

// ---------------------------------------------------------------------------
// O que se mexe
// ---------------------------------------------------------------------------
// As duas almas, 4 × 4 pixels: a clara (com um ponto branco no alto) e a
// escura (violeta fundo, de borda acesa em anil).
const LIGHT_SOUL = ['.cc.', 'cWwc', 'cwwc', '.cc.'];
const DARK_SOUL = ['.LL.', 'LDdL', 'LddL', '.LL.'];
// o rastro de cada alma: onde ela estava 3 a 8 quadros atrás, cada vez mais
// apagado (com a alma na frente, parece a vírgula de cada metade do ☯️)
const TRAIL = [3, 4, 5, 6, 7, 8];
const TRAIL_ALPHA = [0.6, 0.48, 0.36, 0.26, 0.17, 0.1];
// parado (still), a órbita fica no quadro 2: a clara no alto à direita (longe
// do reflexo da cúpula) e a escura embaixo à esquerda, na diagonal do ☯️, as
// duas bem acesas
const STILL_TICK = 2;

const ease = (t: number) => t * t * (3 - 2 * t);
// O ângulo da órbita num quadro e quanto as duas estão afastadas (1 = a órbita
// de sempre, 0 = juntas no meio), contando o toque (f = quadros desde o toque).
const orbitAt = (tick: number, f: number): { angle: number; reach: number } => {
  const base = (tick / ORBIT_TICKS) * Math.PI * 2;
  if (f < 0 || f > 18) return { angle: base, reach: 1 };
  // uma volta a mais durante a reação (no fim ela "some": 2π é a mesma posição)
  const extra = Math.PI * 2 * ease(Math.min(1, f / 18));
  const reach = f < 6 ? 1 - ease(f / 6) : f < 9 ? 0 : ease(Math.min(1, (f - 9) / 9));
  return { angle: base + extra, reach };
};
// a posição (o meio, em pixels) de uma alma: side 0 = a clara, 1 = a escura
const soulAt = (ox: number, oy: number, angle: number, reach: number, side: number): Pt => {
  const a = angle + side * Math.PI;
  return [ox + Math.cos(a) * RX * reach, oy + (Math.sin(a) * RY - Math.cos(a) * TILT) * reach];
};
// quanto a alma está na frente: -1 = bem atrás, 1 = bem na frente
const depthOf = (angle: number, side: number): number => Math.sin(angle + side * Math.PI);
// a força do clarão em cada quadro do toque (0 = nenhum, 1 = o encontro)
const FLASH = [0, 0, 0, 0, 0.1, 0.3, 1, 0.85, 0.6, 0.4, 0.25, 0.12];
// as faíscas que sobem depois do clarão: a distância do meio, a pressa e a cor
const MOTES: [number, number, string][] = [
  [-3, 0.7, '243,234,211'],
  [-1, 1.1, '199,210,254'],
  [1, 0.9, '243,234,211'],
  [3, 0.6, '199,210,254'],
];

const paint = (k: Kit, ctx: Ctx, x: number, y: number, tick: number, still: boolean) => {
  const [cx, cy] = footOf(k, x, y);
  const lip = cy - PLATE_TOP;
  const apex = lip - LIP;
  // o meio da órbita fica entre duas colunas (a redoma tem largura par)
  const ox = cx - 0.5;
  const oy = lip - ORBIT_UP - 0.5;
  const f = still ? -1 : pokeFrame(ID);
  const t = still ? STILL_TICK : tick;
  const now = orbitAt(t, f);

  const flash = f < 0 ? 0 : (FLASH[f] ?? 0);
  if (flash > 0) {
    // a luz que vaza do vidro, em volta da redoma
    disc(ctx, cx, apex + 8, 11, 12, `rgba(129,140,248,${(0.16 * flash).toFixed(2)})`);
    // o vidro se acende por dentro
    fillInside(ctx, cx, apex, `rgba(165,180,252,${(0.55 * flash).toFixed(2)})`);
    disc(ctx, cx, Math.round(oy), 5, 4, `rgba(255,255,255,${(0.4 * flash).toFixed(2)})`);
  }

  // os rastros (com o toque, a espiral fica mais rápida e o rastro, mais comprido)
  TRAIL.forEach((back, n) => {
    const was = orbitAt(t - back, f < 0 || f - back < 0 ? -1 : f - back);
    const size = n < 2 ? 2 : 1;
    [0, 1].forEach((side) => {
      const [sx, sy] = soulAt(ox, oy, was.angle, was.reach, side);
      ctx.fillStyle = `rgba(${side === 0 ? '243,234,211' : '129,140,248'},${TRAIL_ALPHA[n]})`;
      ctx.fillRect(Math.round(sx - size / 2), Math.round(sy - size / 2), size, size);
    });
  });

  if (f >= 6 && f <= 8) {
    // o encontro: uma estrela branca e anil no meio
    const big = f === 7;
    const sx = Math.round(ox) - 1;
    const sy = Math.round(oy) - 1;
    k.px(ctx, sx - (big ? 5 : 3), sy, ANIL, big ? 12 : 8, 2);
    k.px(ctx, sx, sy - (big ? 4 : 3), ANIL, 2, big ? 10 : 8);
    k.px(ctx, sx - (big ? 3 : 2), sy, '#E0E7FF', big ? 8 : 6, 2);
    k.px(ctx, sx, sy - (big ? 3 : 2), '#E0E7FF', 2, big ? 8 : 6);
    k.px(ctx, sx - 1, sy - 1, '#FFFFFF', 4, 4);
  } else {
    // as duas almas: a de trás (mais alta na tela) primeiro, mais apagada
    const souls = [0, 1].map((side) => ({ side, at: soulAt(ox, oy, now.angle, now.reach, side), depth: depthOf(now.angle, side) * now.reach }));
    souls.sort((p, q) => p.depth - q.depth);
    souls.forEach(({ side, at, depth }) => {
      // 0 = bem atrás, 1 = bem na frente (em 5 degraus: as cores de mix ficam guardadas)
      const near = still ? 1 : Math.round((depth + 1) * 2) / 4;
      const sx = Math.round(at[0] - 2);
      const sy = Math.round(at[1] - 2);
      if (side === 0) sprite(ctx, sx, sy, LIGHT_SOUL, { W: '#FFFFFF', w: k.mix('#E2D9EA', '#FFF6DE', near), c: k.mix('#B3A9C9', PAPER, near) });
      else sprite(ctx, sx, sy, DARK_SOUL, { L: k.mix('#6E76D6', '#B4C0FF', near), d: '#22185E', D: '#3F33A0' });
    });
  }

  // as faíscas do encontro, subindo e apagando
  if (f >= 8 && f < 16) {
    const alpha = (1 - (f - 8) / 8).toFixed(2);
    MOTES.forEach(([dx, rise, rgb]) => {
      const my = Math.round(oy - (f - 7) * rise * 1.3);
      if (my <= apex + 2) return;
      ctx.fillStyle = `rgba(${rgb},${alpha})`;
      ctx.fillRect(Math.round(ox + dx * (1 + (f - 7) * 0.12)), my, 1, 1);
    });
  }

  // os reflexos da frente do vidro (por cima das almas): o arco da cúpula e a
  // faixa que desce rente à borda esquerda; um fio do lado direito
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(cx - 3, apex + 1, 2, 1);
  ctx.fillRect(cx - 5, apex + 2, 1, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.fillRect(cx - 6, apex + 3, 1, LIP - 5);
  ctx.fillRect(cx + 5, lip - 6, 1, 3);
  // um brilho que pisca no alto da cúpula, de vez em quando
  const glint = still ? 1 : tick % 40;
  if (glint < 3) {
    k.px(ctx, cx - 5, apex + 2, '#FFFFFF', 1, 1);
    if (glint === 1) {
      k.px(ctx, cx - 6, apex + 2, 'rgba(255,255,255,0.75)', 3, 1);
      k.px(ctx, cx - 5, apex + 1, 'rgba(255,255,255,0.75)', 1, 3);
    }
  }
  // o clarão acende também o contorno
  if (flash >= 0.4) {
    const lit = k.mix('#C3CAFF', '#FFFFFF', flash * 0.8);
    outline(ctx, cx, apex, () => lit, () => lit);
  }
};

// h: a altura acima do canto de trás do chão (é de lá que o retângulo de
// toque mede). O puxador e o clarão do toque chegam a 30 pixels acima do meio
// do chão, que fica 6 pixels abaixo do canto de trás: 24. Com 30 (a altura
// contada do meio), o retângulo passava 6 pixels da cúpula e, no lugar 0,
// roubava o toque da estante (notas do diretor de arte, 17/11/2026).
const ART: MoodItemArt = {
  w: W,
  d: D,
  h: 24,
  draw: (k, ctx, x, y) => draw(k, ctx, x, y),
  paint: (k, ctx, x, y, _env, tick, still) => paint(k, ctx, x, y, tick, still),
  pad: 2,
};

export default ART;
