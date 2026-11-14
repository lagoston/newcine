import type { PersonaWorld } from '../../lib/personaWorld';

// O estúdio (14/11/2026): a sala de estar da cabine.
//
// Pedido do Bruno (14/11, 17h08): o estúdio toma, na home, o lugar das portas
// do Jackpot e do Pôquer, "que agora se tornarão objetos dentro do estúdio do
// usuário: uma máquina caça-níquel e uma mesa". E mais: "dentro do estúdio
// devem haver espaços para colocar variados objetos conquistados pelo usuário,
// como uma árvore de Natal em futuros eventos, fora o espaço que já devem ter
// sempre reservados para os itens padrão, como a máquina de jackpot, a mesa de
// poker e o aquário"; "uma prateleira com um livro clicável". Às 17h23: "o
// portal de Halloween não é mais um item de banner, agora ele é um item de
// estúdio liberado pela tag, [...] dentro de uma caixa velha de papelão".
//
// A cabine ficou mais comprida para a direita (de 6 × 6 para 9 × 6 ladrilhos).
// A parte do cinema (a tela, a estante das latas, a poltrona, o projetor) não
// mudou de lugar. Na parte nova:
//   • encostados na parede: a máquina do Jackpot, a estante do livro e o
//     lugar alto (a árvore de Natal);
//   • no meio: a mesa de pôquer;
//   • na frente: o aquário (a Watchlist: um peixe por título que espera);
//   • os lugares de conquista, marcados no chão com fita, como as marcas de
//     um set de filmagem: a abóbora do Halloween, a caixa do Clube do Terror,
//     o amuleto do beta. Os que sobram ficam esperando os próximos eventos.
//
// Aqui só mora o desenho e a posição de cada coisa. O que cada objeto abre é
// assunto de quem monta a cena (StudioScene).

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

// As ferramentas de desenho da cabine (draw.ts), passadas de lá para cá.
export interface Kit {
  iso: (x: number, y: number, z?: number) => Pt;
  box: (ctx: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, c: string) => void;
  poly: (ctx: Ctx, pts: Pt[], c: string) => void;
  px: (ctx: Ctx, x: number, y: number, c: string, w?: number, h?: number) => void;
  mix: (a: string, b: string, t: number) => string;
  dark: (c: string, t: number) => string;
  light: (c: string, t: number) => string;
  moodColor: (letter: string | null | undefined) => string;
}

export interface StudioExtras {
  // a máquina do Jackpot: 'off' = não aparece (roleta desligada); 'on' =
  // parada; 'alert' = há algo esperando a pessoa (as luzes piscam)
  jackpot: 'off' | 'on' | 'alert';
  // a mesa de pôquer aparece (quem está olhando tem o Pôquer liberado)
  poker: boolean;
}
export const NO_EXTRAS: StudioExtras = { jackpot: 'on', poker: false };

const GOLD = '#F4C454';
const PAPER = '#F3EAD3';
const EDGE = '#150E26';

// Onde fica cada coisa, em ladrilhos (x ao longo da parede da direita, y ao
// longo da parede da esquerda; o canto do fundo é 0, 0).
const SLOT = { x: 6.12, y: 0.12, w: 0.8, d: 0.72, h: 26 };
const BOOKCASE = { x: 7.16, y: 0.1, w: 0.74, d: 0.44, h: 19 };
const TALL = { x: 8.18, y: 0.18, w: 0.66, d: 0.66 };
const TABLE = { x: 7.15, y: 2.85, r: 0.92, h: 7 };
const TANK = { x: 6.15, y: 4.7, w: 1.5, d: 0.7, h: 17 };
// os lugares de conquista no chão (marcados com fita)
const PLACES: { x: number; y: number }[] = [
  { x: 8.15, y: 1.35 },
  { x: 8.15, y: 3.45 },
  { x: 8.15, y: 5.05 },
  { x: 2.95, y: 5.1 },
  { x: 1.45, y: 5.1 },
];
const PLACE_SIZE = 0.72;

// ---------- as conquistas ----------
export type TrophyKind = 'tree' | 'terror' | 'pumpkin' | 'amulet';
export interface Trophy {
  kind: TrophyKind;
  // a árvore e a abóbora crescem com os passos do evento
  level: number;
  // 'tall' = o lugar alto, encostado na parede; número = o lugar do chão
  place: 'tall' | number;
}

// As tags viram objetos. Cada objeto tem o seu lugar fixo (o mesmo estúdio
// para a mesma coleção de tags, sempre).
export function trophiesOf(world: PersonaWorld): Trophy[] {
  const has = (base: string) => world.tags.some((tag) => tag.id === base || new RegExp(`^${base}-[0-9]+$`).test(tag.id));
  const list: Trophy[] = [];
  // Natal: a árvore acende com o 1º filme; ganha os presentes com o sussurro e a estrela com a noite completa
  const lights = has('spark-of-grace');
  const gifts = has('secret-friend');
  const star = has('ho-ho-ho');
  if (lights || gifts || star) list.push({ kind: 'tree', level: (lights ? 1 : 0) | (gifts ? 2 : 0) | (star ? 4 : 0), place: 'tall' });
  // Halloween: a abóbora (1 filme), a vela dentro dela (2), a careta acesa (3)
  const pumpkin = has('pumpkin-head') ? 3 : has('deadly-sleeping') ? 2 : has('scary-clown') ? 1 : 0;
  if (pumpkin) list.push({ kind: 'pumpkin', level: pumpkin, place: 0 });
  // a Deadly Sleeping libera o portal do Clube do Terror, dentro da caixa de papelão
  if (has('deadly-sleeping')) list.push({ kind: 'terror', level: 1, place: 1 });
  if (has('beta-tester')) list.push({ kind: 'amulet', level: 1, place: 2 });
  return list;
}

// ---------- desenho ----------
// retângulo numa face que corre ao longo de x (a face +y de uma caixa). o =
// a ponta esquerda da face no chão dela; u = distância da ponta; v = altura.
const faceY = (ctx: Ctx, o: Pt, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) ctx.fillRect(Math.round(o[0]) + u + d, Math.round(o[1]) + ((u + d) >> 1) - v - h, 1, h);
};
// retângulo numa face que corre ao longo de y (a face +x). o = a ponta
// direita da face no chão dela; u cresce para a esquerda.
const faceX = (ctx: Ctx, o: Pt, u: number, v: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  for (let d = 0; d < w; d += 1) ctx.fillRect(Math.round(o[0]) - 1 - (u + d), Math.round(o[1]) + ((u + d) >> 1) - v - h, 1, h);
};
// elipse cheia (um círculo no chão, visto de cima em isométrico)
const disc = (ctx: Ctx, cx: number, cy: number, a: number, b: number, c: string) => {
  ctx.fillStyle = c;
  for (let dy = -Math.floor(b); dy <= Math.floor(b); dy += 1) {
    const half = Math.round(a * Math.sqrt(Math.max(0, 1 - (dy * dy) / (b * b))));
    if (half > 0) ctx.fillRect(Math.round(cx) - half, Math.round(cy) + dy, half * 2, 1);
  }
};

// as marcas de fita no chão de um lugar de conquista vazio
const tapeMarks = (k: Kit, ctx: Ctx, x: number, y: number) => {
  const c = 'rgba(243,234,211,0.32)';
  const s = PLACE_SIZE;
  const corner = (ax: number, ay: number, dx: number, dy: number) => {
    const a = k.iso(ax, ay);
    const b = k.iso(ax + dx * 0.22, ay);
    const d = k.iso(ax, ay + dy * 0.22);
    k.poly(ctx, [a, b, [b[0], b[1] + 1], [a[0], a[1] + 1]], c);
    k.poly(ctx, [a, d, [d[0], d[1] + 1], [a[0], a[1] + 1]], c);
  };
  corner(x, y, 1, 1);
  corner(x + s, y, -1, 1);
  corner(x, y + s, 1, -1);
  corner(x + s, y + s, -1, -1);
};

// a máquina do Jackpot
const drawSlot = (k: Kit, ctx: Ctx) => {
  const { x, y, w, d } = SLOT;
  const blue = '#2B3A9A';
  k.box(ctx, x, y, 0, w, d, 9, '#1F2A72');
  k.box(ctx, x + 0.03, y + 0.03, 9, w - 0.06, d - 0.06, 13, blue);
  k.box(ctx, x + 0.08, y + 0.08, 22, w - 0.16, d - 0.16, 3, GOLD);
  // a frente (a face virada para a sala): a janela das três bobinas e a bandeja
  const front = k.iso(x + 0.03, y + d - 0.03, 9);
  faceY(ctx, front, 1, 4, 7, 6, EDGE);
  faceY(ctx, front, 1, 5, 2, 4, PAPER);
  faceY(ctx, front, 4, 5, 2, 4, PAPER);
  faceY(ctx, front, 7, 5, 1, 4, PAPER);
  faceY(ctx, front, 1, 6, 2, 2, '#E5484D');
  faceY(ctx, front, 4, 6, 2, 2, GOLD);
  faceY(ctx, front, 7, 6, 1, 2, '#4ADE80');
  faceY(ctx, front, 0, 11, 9, 1, GOLD);
  const base = k.iso(x, y + d, 0);
  faceY(ctx, base, 2, 3, 6, 2, EDGE);
  faceY(ctx, base, 3, 3, 4, 1, GOLD);
  // a alavanca, do lado
  const side = k.iso(x + w, y + 0.3, 12);
  k.px(ctx, side[0] + 1, side[1] - 7, '#BDB4D6', 1, 8);
  k.px(ctx, side[0], side[1] - 9, '#E5484D', 3, 3);
  k.px(ctx, side[0], side[1] - 9, '#FF9DA0', 1, 1);
};

// a estante do livro: uma estante baixa de madeira e, em cima, o livro grande
const drawBookcase = (k: Kit, ctx: Ctx) => {
  const { x, y, w, d, h } = BOOKCASE;
  const wood = '#6A4630';
  k.box(ctx, x, y, 0, w, d, h, wood);
  const front = k.iso(x, y + d, 0);
  const spines = ['#F472B6', '#38BDF8', '#FACC15', '#4ADE80', '#818CF8', '#FB923C', '#2DD4BF'];
  [2, 10].forEach((v, shelf) => {
    faceY(ctx, front, 1, v, 7, 7, '#2A1A14');
    for (let i = 0; i < 6; i += 1) faceY(ctx, front, 1 + i, v, 1, 4 + ((i + shelf) % 3), spines[(i + shelf * 3) % spines.length]);
  });
  // o livro, em pé em cima da estante, com o fecho dourado
  const top = k.iso(x + 0.08, y + d - 0.1, h);
  faceY(ctx, top, 0, 0, 7, 9, EDGE);
  faceY(ctx, top, 1, 1, 5, 7, '#8E2433');
  faceY(ctx, top, 1, 1, 1, 7, '#5E1622');
  faceY(ctx, top, 6, 1, 1, 7, PAPER);
  faceY(ctx, top, 3, 3, 2, 3, GOLD);
  faceY(ctx, top, 2, 4, 4, 1, GOLD);
};

// a mesa de pôquer: o pé, o aro de madeira e o feltro com as cartas e as fichas
const drawTable = (k: Kit, ctx: Ctx) => {
  const { x, y, r, h } = TABLE;
  k.box(ctx, x - 0.22, y - 0.22, 0, 0.44, 0.44, h - 1, '#3A2216');
  const c = k.iso(x, y, h);
  const a = r * 12 * Math.SQRT2;
  const b = r * 6 * Math.SQRT2;
  disc(ctx, c[0], c[1] + 2, a, b, '#3F2414');
  disc(ctx, c[0], c[1], a, b, '#8A5630');
  disc(ctx, c[0], c[1], a - 2, b - 1, '#17623E');
  disc(ctx, c[0], c[1] - 1, a - 5, b - 3, '#1F7A4D');
  // duas cartas e três pilhas de fichas
  k.px(ctx, c[0] - 5, c[1] - 2, PAPER, 3, 2);
  k.px(ctx, c[0] - 1, c[1] - 3, PAPER, 3, 2);
  k.px(ctx, c[0] - 4, c[1] - 2, '#E5484D', 1, 1);
  k.px(ctx, c[0], c[1] - 3, EDGE, 1, 1);
  k.px(ctx, c[0] + 5, c[1], '#3B82F6', 2, 2);
  k.px(ctx, c[0] + 8, c[1] - 1, GOLD, 2, 2);
  k.px(ctx, c[0] - 9, c[1] + 1, '#E5484D', 2, 2);
};

// o aquário: o móvel, o vidro, a areia e as plantas (os peixes entram a cada quadro)
const tankFront = (k: Kit): Pt => k.iso(TANK.x + 0.02, TANK.y + TANK.d - 0.02, 7);
const drawTank = (k: Kit, ctx: Ctx) => {
  const { x, y, w, d } = TANK;
  k.box(ctx, x, y, 0, w, d, 7, '#4A3324');
  k.box(ctx, x + 0.02, y + 0.02, 7, w - 0.04, d - 0.04, 10, '#2F86BE');
  const front = tankFront(k);
  const width = Math.round((w - 0.04) * 12);
  faceY(ctx, front, 0, 0, width, 10, '#16598C');
  faceY(ctx, front, 0, 9, width, 1, '#8FD8F8');
  faceY(ctx, front, 0, 0, width, 1, '#D9C79A');
  faceY(ctx, front, 2, 1, 1, 4, '#2FA36B');
  faceY(ctx, front, 3, 1, 1, 2, '#2FA36B');
  faceY(ctx, front, width - 4, 1, 1, 5, '#3DBB7C');
  faceY(ctx, front, width - 3, 1, 1, 3, '#2FA36B');
  const side = k.iso(x + w - 0.02, y + 0.02, 7);
  const depth = Math.round((d - 0.04) * 12);
  faceX(ctx, side, 0, 0, depth, 10, '#124B78');
  faceX(ctx, side, 0, 9, depth, 1, '#7CC8EC');
  faceX(ctx, side, 0, 0, depth, 1, '#BFAE85');
};

// ----- os objetos de conquista -----
const drawPumpkin = (k: Kit, ctx: Ctx, at: Pt, level: number) => {
  const [x, y] = at;
  const body = '#F08A24';
  if (level >= 3) {
    ctx.fillStyle = 'rgba(255,181,71,0.16)';
    ctx.fillRect(x - 7, y - 10, 15, 13);
  }
  disc(ctx, x, y - 3, 5, 3.6, k.dark(body, 0.28));
  disc(ctx, x, y - 4, 5, 3.6, body);
  k.px(ctx, x - 2, y - 7, k.dark(body, 0.2), 1, 6);
  k.px(ctx, x + 1, y - 7, k.dark(body, 0.2), 1, 6);
  k.px(ctx, x - 1, y - 9, '#3F7A3A', 2, 2);
  if (level >= 2) {
    // a vela acesa por dentro: os olhos
    k.px(ctx, x - 3, y - 5, GOLD, 1, 1);
    k.px(ctx, x + 2, y - 5, GOLD, 1, 1);
  }
  if (level >= 3) {
    k.px(ctx, x - 3, y - 6, GOLD, 2, 1);
    k.px(ctx, x + 1, y - 6, GOLD, 2, 1);
    k.px(ctx, x - 3, y - 3, GOLD, 6, 1);
    k.px(ctx, x - 2, y - 2, GOLD, 1, 1);
    k.px(ctx, x + 1, y - 2, GOLD, 1, 1);
  }
};

const drawAmulet = (k: Kit, ctx: Ctx, at: Pt) => {
  const [x, y] = at;
  k.px(ctx, x - 2, y - 1, '#3A2E5E', 4, 1);
  k.px(ctx, x - 1, y - 4, '#BDB4D6', 1, 3);
  disc(ctx, x, y - 8, 3.4, 3.4, '#1E4FD8');
  disc(ctx, x, y - 8, 2.2, 2.2, PAPER);
  disc(ctx, x, y - 8, 1.2, 1.2, '#38BDF8');
  k.px(ctx, x - 1, y - 9, EDGE, 1, 1);
};

// A caixa velha de papelão do Clube do Terror.
//
// Pedido do Bruno (14/11/2026): "o mesmo portal agora dentro de uma caixa
// velha de papelão escrito com fita adesiva o nome do modal". O nome vai
// escrito com pedaços de fita (letras retas, de 3 × 5 pixels), dando a volta
// na quina da caixa: "TER" numa face e "ROR" na outra. A caixa tem um ladrilho
// de lado (12 pixels por face): é o que cabe de nome sem ela ficar maior que a
// mesa de pôquer. O nome inteiro, "Clube do Terror", aparece na etiqueta ao
// passar o mouse ou o foco, e no livro.
const TERROR_BOX = { w: 1, d: 1, h: 11 };
const terrorBoxAt = (place: { x: number; y: number }) => ({ x: place.x - 0.18, y: place.y - 0.04 });
const TAPE_GLYPHS: Record<string, string[]> = {
  T: ['111', '010', '010', '010', '010'],
  E: ['111', '100', '110', '100', '111'],
  R: ['110', '101', '110', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
};
const drawTerrorBox = (k: Kit, ctx: Ctx, place: { x: number; y: number }) => {
  const { w, d, h } = TERROR_BOX;
  const { x, y } = terrorBoxAt(place);
  const card = '#94704A';
  k.box(ctx, x, y, 0, w, d, h, card);
  // por dentro, escuro (a boca da caixa)
  k.poly(ctx, [k.iso(x + 0.08, y + 0.08, h), k.iso(x + w - 0.08, y + 0.08, h), k.iso(x + w - 0.08, y + d - 0.08, h), k.iso(x + 0.08, y + d - 0.08, h)], '#1A0D14');
  // as abas abertas
  const flap = k.dark(card, 0.12);
  k.poly(ctx, [k.iso(x, y + d, h), k.iso(x + w, y + d, h), k.iso(x + w + 0.05, y + d + 0.3, h + 2), k.iso(x + 0.05, y + d + 0.3, h + 2)], flap);
  k.poly(ctx, [k.iso(x + w, y, h), k.iso(x + w, y + d, h), k.iso(x + w + 0.3, y + d + 0.05, h + 2), k.iso(x + w + 0.3, y + 0.05, h + 2)], k.dark(card, 0.05));
  // amassados e uma mancha (antes das letras, para não cortar a fita)
  const left = k.iso(x, y + d, 0); // a face da esquerda: da ponta esquerda até a quina
  const right = k.iso(x + w, y, 0); // a face da direita: a ponta direita dela (a quina fica à esquerda)
  faceY(ctx, left, 1, 0, 1, 2, k.dark(card, 0.25));
  faceX(ctx, right, 1, 9, 2, 1, k.dark(card, 0.25));
  // o nome em fita: cada letra tem 3 colunas e 5 linhas, com 1 coluna de vão.
  // put(c, v) pinta um pedaço de fita na coluna c (da esquerda para a direita) e na altura v.
  const tape = '#F3EAD3';
  const write = (word: string, put: (c: number, v: number) => void) => {
    word.split('').forEach((letter, index) => {
      TAPE_GLYPHS[letter].forEach((row, r) => {
        row.split('').forEach((bit, c) => {
          if (bit === '1') put(index * 4 + c, 7 - r);
        });
      });
    });
  };
  write('TER', (c, v) => faceY(ctx, left, c, v, 1, 1, tape));
  write('ROR', (c, v) => faceX(ctx, right, 10 - c, v, 1, 1, tape));
};
const terrorMouth = (k: Kit, place: { x: number; y: number }): Pt => {
  const { x, y } = terrorBoxAt(place);
  return k.iso(x + TERROR_BOX.w / 2, y + TERROR_BOX.d / 2, TERROR_BOX.h);
};

// a árvore de Natal: três andares, as luzes (1), os presentes (2) e a estrela (4)
const drawTree = (k: Kit, ctx: Ctx, at: Pt, level: number) => {
  const [x, y] = at;
  k.px(ctx, x - 1, y - 4, '#5A3A24', 2, 4);
  const green = '#1F7A4D';
  [
    [9, 4, 10],
    [7, 10, 9],
    [5, 16, 8],
  ].forEach(([half, up, tall]) => {
    for (let row = 0; row < tall; row += 1) {
      const width = Math.max(1, Math.round(half * (1 - row / tall)));
      k.px(ctx, x - width, y - up - row, row % 3 === 2 ? k.dark(green, 0.18) : green, width * 2, 1);
    }
  });
  if (level & 1) {
    const bulbs = ['#E5484D', GOLD, '#38BDF8', '#F472B6', GOLD, '#E5484D', '#38BDF8'];
    [
      [-5, 6],
      [3, 8],
      [-2, 11],
      [4, 13],
      [-3, 16],
      [1, 19],
      [-1, 22],
    ].forEach(([dx, up], i) => k.px(ctx, x + dx, y - up, bulbs[i], 1, 1));
  }
  if (level & 2) {
    k.px(ctx, x - 9, y - 3, '#E5484D', 4, 3);
    k.px(ctx, x - 8, y - 3, GOLD, 1, 3);
    k.px(ctx, x + 5, y - 2, '#38BDF8', 3, 2);
    k.px(ctx, x + 6, y - 2, PAPER, 1, 2);
  }
  if (level & 4) {
    k.px(ctx, x - 1, y - 27, GOLD, 2, 3);
    k.px(ctx, x - 2, y - 26, GOLD, 4, 1);
  }
};

// o centro do chão de um lugar de conquista (onde o objeto pisa)
const placeFoot = (k: Kit, place: 'tall' | number): Pt =>
  place === 'tall' ? k.iso(TALL.x + TALL.w / 2, TALL.y + TALL.d / 2, 0) : k.iso(PLACES[place].x + PLACE_SIZE / 2, PLACES[place].y + PLACE_SIZE / 2, 0);

// A parte parada da sala de estar (vai junto com a cabine, em drawRoom).
export function drawLounge(k: Kit, ctx: Ctx, world: PersonaWorld, extras: StudioExtras) {
  const trophies = trophiesOf(world);
  const taken = new Set(trophies.map((trophy) => trophy.place));
  // primeiro o chão: as marcas de fita dos lugares ainda vazios
  if (!taken.has('tall')) tapeMarks(k, ctx, TALL.x - 0.03, TALL.y - 0.03);
  PLACES.forEach((place, index) => {
    if (!taken.has(index)) tapeMarks(k, ctx, place.x, place.y);
  });
  // do fundo para a frente
  if (extras.jackpot !== 'off') drawSlot(k, ctx);
  drawBookcase(k, ctx);
  const tree = trophies.find((trophy) => trophy.kind === 'tree');
  if (tree) drawTree(k, ctx, placeFoot(k, 'tall'), tree.level);
  const byPlace = (index: number) => trophies.find((trophy) => trophy.place === index);
  const paintPlace = (index: number) => {
    const trophy = byPlace(index);
    if (!trophy) return;
    if (trophy.kind === 'pumpkin') drawPumpkin(k, ctx, placeFoot(k, index), trophy.level);
    else if (trophy.kind === 'amulet') drawAmulet(k, ctx, placeFoot(k, index));
    else if (trophy.kind === 'terror') drawTerrorBox(k, ctx, PLACES[index]);
  };
  paintPlace(0);
  if (extras.poker) drawTable(k, ctx);
  paintPlace(1);
  paintPlace(3);
  paintPlace(4);
  drawTank(k, ctx);
  paintPlace(2);
}

// O que se mexe na sala de estar, a cada quadro: os peixes, as luzes da
// máquina, o brilho do livro e o portal dentro da caixa. still = parado.
export function paintLounge(k: Kit, ctx: Ctx, world: PersonaWorld, extras: StudioExtras, tick: number, still: boolean) {
  // os peixes: um por título da Watchlist (até 6 na frente do vidro)
  const front = tankFront(k);
  const width = Math.round((TANK.w - 0.04) * 12);
  world.watch.fish.slice(0, 6).forEach((letter, i) => {
    const color = letter ? k.moodColor(letter) : PAPER;
    const lane = 2 + ((i * 3) % 6);
    const span = width - 6;
    const phase = still ? i * 2.1 : tick / (11 + i * 2) + i * 2.1;
    const u = 2 + Math.round((span / 2) * (1 + Math.sin(phase)));
    const right = Math.cos(phase) >= 0;
    faceY(ctx, front, u, lane, 2, 1, color);
    faceY(ctx, front, right ? u - 1 : u + 2, lane, 1, 1, k.dark(color, 0.35));
  });
  // a luz do alto da máquina: acesa; piscando quando há algo esperando
  if (extras.jackpot !== 'off') {
    const top = k.iso(SLOT.x + SLOT.w / 2, SLOT.y + SLOT.d / 2, SLOT.h);
    const lit = extras.jackpot === 'alert' && !still ? (tick >> 2) % 2 === 0 : true;
    k.px(ctx, top[0] - 1, top[1] - 2, lit ? '#FFF3C4' : '#B8862B', 3, 2);
    if (extras.jackpot === 'alert' && lit) {
      ctx.fillStyle = 'rgba(244,196,84,0.22)';
      ctx.fillRect(top[0] - 3, top[1] - 4, 7, 6);
    }
  }
  // o livro pisca de leve, chamando
  if (!still && tick % 24 < 3) {
    const book = k.iso(BOOKCASE.x + 0.08, BOOKCASE.y + BOOKCASE.d - 0.1, BOOKCASE.h);
    k.px(ctx, Math.round(book[0]) + 6, Math.round(book[1]) - 9, '#FFFFFF', 1, 1);
    if (tick % 24 === 1) {
      k.px(ctx, Math.round(book[0]) + 5, Math.round(book[1]) - 9, '#FFF3C4', 3, 1);
      k.px(ctx, Math.round(book[0]) + 6, Math.round(book[1]) - 10, '#FFF3C4', 1, 3);
    }
  }
  // o portal do Clube do Terror, dentro da caixa: uma espiral à luz de vela
  const terror = trophiesOf(world).find((trophy) => trophy.kind === 'terror');
  if (terror && typeof terror.place === 'number') {
    const mouth = terrorMouth(k, PLACES[terror.place]);
    const turn = still ? 0 : tick >> 1;
    ctx.fillStyle = 'rgba(255,181,71,0.2)';
    ctx.fillRect(mouth[0] - 5, mouth[1] - 8, 11, 9);
    disc(ctx, mouth[0], mouth[1] - 1, 4, 2, '#8E1B2B');
    const arms: Pt[] = [
      [-3, -1],
      [-1, -2],
      [2, -2],
      [3, 0],
      [1, 1],
      [-2, 1],
    ];
    arms.forEach(([dx, dy], i) => k.px(ctx, mouth[0] + dx, mouth[1] - 1 + dy, (i + turn) % 3 === 0 ? '#FFF3C4' : '#FFB547', 1, 1));
    k.px(ctx, mouth[0], mouth[1] - 1, '#FFF3C4', 1, 1);
    // as brasas que sobem
    if (!still) {
      const rise = tick % 8;
      k.px(ctx, mouth[0] - 2 + (rise % 3), mouth[1] - 3 - rise, 'rgba(255,181,71,0.8)', 1, 1);
      k.px(ctx, mouth[0] + 2 - (rise % 2), mouth[1] - 2 - ((rise + 4) % 8), 'rgba(255,214,140,0.7)', 1, 1);
    }
  }
}

// ---------- onde tocar ----------
export type SpotKind = 'jackpot' | 'poker' | 'aquarium' | 'book' | 'terror';
export interface Spot {
  kind: SpotKind;
  // o retângulo do objeto na cena, em pixels do desenho
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectOf = (k: Kit, x: number, y: number, w: number, d: number, h: number, pad = 1): Omit<Spot, 'kind'> => {
  const left = k.iso(x, y + d)[0];
  const right = k.iso(x + w, y)[0];
  const top = k.iso(x, y, h)[1];
  const bottom = k.iso(x + w, y + d, 0)[1];
  return { x: Math.floor(left) - pad, y: Math.floor(top) - pad, w: Math.ceil(right - left) + pad * 2, h: Math.ceil(bottom - top) + pad * 2 };
};

// Os objetos que levam a algum lugar, com o retângulo de cada um.
export function loungeSpots(k: Kit, world: PersonaWorld, extras: StudioExtras): Spot[] {
  const spots: Spot[] = [];
  if (extras.jackpot !== 'off') spots.push({ kind: 'jackpot', ...rectOf(k, SLOT.x, SLOT.y, SLOT.w, SLOT.d, SLOT.h + 2) });
  spots.push({ kind: 'book', ...rectOf(k, BOOKCASE.x, BOOKCASE.y, BOOKCASE.w, BOOKCASE.d, BOOKCASE.h + 9) });
  if (extras.poker) spots.push({ kind: 'poker', ...rectOf(k, TABLE.x - TABLE.r, TABLE.y - TABLE.r, TABLE.r * 2, TABLE.r * 2, TABLE.h + 2, 0) });
  spots.push({ kind: 'aquarium', ...rectOf(k, TANK.x, TANK.y, TANK.w, TANK.d, TANK.h) });
  const terror = trophiesOf(world).find((trophy) => trophy.kind === 'terror');
  if (terror && typeof terror.place === 'number') {
    const place = PLACES[terror.place];
    const at = terrorBoxAt(place);
    spots.push({ kind: 'terror', ...rectOf(k, at.x, at.y, TERROR_BOX.w + 0.3, TERROR_BOX.d + 0.3, TERROR_BOX.h + 8) });
  }
  return spots;
}
