import { pokeFrame, sprite } from '../pixel';
import type { Ctx } from '../pixel';
import type { Kit } from '../studio';
import type { MoodItemArt } from './types';

// A namoradeira (17/11/2026): o móvel do humor Romântico (💕 Cine Cupid), que
// chega com 50 filmes de amor avaliados. Escolha do Bruno: o sofazinho em S de
// dois lugares, o tête-à-tête vitoriano, em que o casal senta lado a lado
// virado para lados opostos, frente a frente. O nome em português já é a piada.
//
// Como ele fica na sala: o S corre ao longo de x (1,25 × 1 ladrilho). O lugar
// da esquerda olha para a face +y (para quem olha a sala): o encosto com
// capitonê atrás dele, o braço enrolado na ponta (com a roseta dourada) e a
// almofada-coração. O meio do S é a aleta que vem para a frente e vira o
// encosto do lugar da direita, que olha para o fundo: dele só se vê o avesso do
// encosto, o braço baixo e, espiando por cima, a outra almofada-coração, de
// costas (rosa com contorno escuro e o brilho do outro lado: dois corações
// virados para lados opostos). Um friso dourado corre por todo o alto do
// encosto e desenha o S; é ele que faz o móvel ler como namoradeira e não como
// poltrona na escala da sala. Na crista do S (arredondada, 6 px) o friso
// termina numa voluta, como nos encostos entalhados; com uma ponta fina a
// aleta lia como espinho (nota do diretor de arte, 17/11). Veludo na cor do
// humor (#FB923C) com as sombras puxando para o coral e o rosa queimado,
// assento num pêssego mais apagado (para não brigar com os corações), pés de
// madeira torneada com ponteira de latão.
//
// É um desenho à mão (sprite), como a planta e a cadeira de diretor: o S tem
// curvas que as caixas do estúdio não fazem. As faces seguem a regra das caixas
// (tampo claro, face +x média, face +y escura).
//
// Parado: quase nada (a sala já tem muita coisa se mexendo). A cada 8 s um
// coraçãozinho de 3 px sai da almofada, sobe balançando e some.
// Toque: as duas almofadas batem juntas (tum-tum, duas vezes; a da frente
// cresce, a de trás acende) e três coraçõezinhos sobem flutuando e somem
// (os dois primeiros com 5 × 4 px, para lerem a 2×).

// g friso dourado · T tampo do veludo · V veludo (a cor do humor, faces +x) ·
// S veludo coral (faces +y) · K saia · k vinco/barra · H assento · c brilho ·
// w h d madeira · P p q coração · z sombra no chão
const NAMORADEIRA = [
  '..................gggg.......',
  '...........gggggggTTTTg......',
  '.........ggTTTTTTgTVgkg......',
  '.......ggTTSSSkSgTVVVg.......',
  '.....gggTPPSPPSgTVVVVS.......',
  '...gggTTTPpPPPSgTVVVVqq.qq...',
  '.gggTTTTTPPPPqgTVVVVVqPqpq...',
  '.TTTTTTVHHPPqHTgVVVVVqPPPq...',
  '.gSTTVHHHHHqHHSTgVVVVSqPq..gg',
  '.SSVcHHHHHHHHHSSTgVVVVHqHggTT',
  '..SSHccHHHHHHHSSSTgVVHHggTTVV',
  '..KKSSHHHHHHHHSSSSTggggTTVVVV',
  '..KKKKSSHHHHHTSSSSSTTTTVVVVKK',
  '..KkkKKKSSHTTkSSSSSSSVVVVKKKK',
  '..kwhKKKKKSKKkkKSSSSSVVKKKkkK',
  '..zwdkKKKKKKKkKKKKSSSKKKKKwhk',
  '..zgdzkkKKKKKkKKKKKKSKKKKkwdz',
  '.....zzzkkkkkkkkKKKKKKKkkzgdz',
  '......zzzzwhzzzzkkkkKkkzzz...',
  '........zzwdzzzzzzwhKzzzz....',
  '..........gd....zzwdkzz......',
  '..................gdz........',
];
// o canto de trás do chão do móvel, dentro do desenho (coluna, linha)
const ORIGIN = [13, 11];
const COLORS: Record<string, string> = {
  g: '#F4C454',
  T: '#FDAE70',
  V: '#FB923C',
  S: '#E8673F',
  K: '#B8434A',
  k: '#8E2E40',
  H: '#F4C49A',
  c: '#FFDDB8',
  w: '#6E3B22',
  h: '#B4703C',
  d: '#3A1C16',
  P: '#F0466E',
  p: '#FFA3BA',
  q: '#A81E4C',
  z: 'rgba(8,5,18,0.35)',
};
// onde ficam as duas almofadas, dentro do desenho (o canto de cima à esquerda)
const HEART_FRONT = [9, 4];
const HEART_BACK = [21, 5];
// a da frente, batendo: um pixel maior para cada lado (cobre a parada inteira)
const HEART_BEAT = ['.PP.PP.', 'PppPPPP', 'PpPPPPq', '.PPPPq.', '..PPq..', '...q...'];
// a de trás, acesa (do mesmo tamanho: ela fica atrás do encosto e do braço);
// parada ela tem o corpo rosa e o contorno escuro, o brilho do lado de lá
const HEART_LIT = ['PP.PP', 'PpPpP', 'PpppP', '.PpP.', '..P..'];
// os coraçõezinhos que sobem: 5 × 4 os dois primeiros do toque, 3 × 3 os outros
const SMALL = ['PP.PP', 'PPPPP', '.PPP.', '..P..'];
const TINY = ['P.P', 'PPP', '.P.'];
// os quadros do toque em que as almofadas batem: tum-tum, pausa, tum-tum
const BEATS = [0, 1, 3, 6, 7, 9];
// o coraçãozinho do parado sai a cada 64 quadros (8 s) e dura 14
const IDLE_EVERY = 64;

// o canto de cima à esquerda do desenho, a partir do canto de trás do chão
const corner = (k: Kit, x: number, y: number): [number, number] => {
  const p = k.iso(x, y);
  return [Math.round(p[0]) - ORIGIN[0], Math.round(p[1]) - ORIGIN[1]];
};

const draw = (k: Kit, ctx: Ctx, x: number, y: number) => {
  const [cx, cy] = corner(k, x, y);
  sprite(ctx, cx, cy, NAMORADEIRA, COLORS);
};

// um coraçãozinho subindo (age = quadros desde que saiu): sobe 1 px por quadro,
// balança de leve e, na segunda metade da vida, vai sumindo
const floatHeart = (ctx: Ctx, x: number, y: number, age: number, life: number, shape = TINY) => {
  if (age < 0 || age >= life) return;
  const fade = age < life / 2 ? 1 : 1 - (age - life / 2) / (life / 2);
  const sway = Math.round(Math.sin(age * 0.9));
  sprite(ctx, x + sway, y - age, shape, { P: `rgba(240,70,110,${fade.toFixed(2)})` });
};

const paint = (k: Kit, ctx: Ctx, x: number, y: number, _env: unknown, tick: number, still: boolean) => {
  // parado de vez (inventário, guia, reduzir movimento): o desenho já está completo
  if (still) return;
  const [cx, cy] = corner(k, x, y);
  const fx = cx + HEART_FRONT[0];
  const fy = cy + HEART_FRONT[1];
  const f = pokeFrame('loveseat');
  if (f >= 0) {
    if (BEATS.includes(f)) {
      sprite(ctx, fx - 1, fy - 1, HEART_BEAT, COLORS);
      sprite(ctx, cx + HEART_BACK[0], cy + HEART_BACK[1], HEART_LIT, COLORS);
    }
    floatHeart(ctx, fx, fy - 4, f, 14, SMALL);
    floatHeart(ctx, fx - 3, fy - 3, f - 4, 12, SMALL);
    floatHeart(ctx, cx + HEART_BACK[0] + 1, cy + HEART_BACK[1] - 3, f - 7, 12);
    return;
  }
  floatHeart(ctx, fx + 1, fy - 3, tick % IDLE_EVERY, 14);
};

const ART: MoodItemArt = {
  w: 15 / 12,
  d: 1,
  // os coraçõezinhos sobem até 24 px acima do canto de trás (uns 30 acima do
  // meio do chão): o retângulo de toque e o recorte cobrem até lá
  h: 24,
  draw,
  paint,
};

export default ART;
