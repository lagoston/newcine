/**
 * Testes do núcleo do poker. Rodar com:
 *   node scripts/poker/test-engine.ts            (Node 22.18+ remove os tipos sozinho)
 *   node --experimental-strip-types scripts/poker/test-engine.ts   (Node 22.6–22.17)
 *   npx tsx scripts/poker/test-engine.ts
 *
 * Sai com código 1 se alguma asserção falhar.
 */
import {
  applyAction,
  cardFromIndex,
  cardIndex,
  cardLabel,
  computePots,
  createRng,
  createTable,
  estimateEquity,
  evaluateHand,
  eventsForViewer,
  fullDeck,
  getLegalActions,
  parseCards,
  publicView,
  ranksOfScore,
  rngFromState,
  scoreCards,
  scoreCardsAny,
  scoreIndicesAny,
  scoreIndicesMulti,
  scoreMasks,
  setBlinds,
  startHand,
  totalChips,
} from '../../src/lib/poker/index.ts';
import type {
  Card,
  EngineResult,
  GameState,
  HandKind,
  PlayerAction,
  PokerEvent,
  TableConfig,
} from '../../src/lib/poker/index.ts';

// ---------------------------------------------------------------------------
// Mini framework de asserções
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];
let currentSection = '';

function section(name: string): void {
  currentSection = name;
  console.log(`\n== ${name}`);
}

function check(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`[${currentSection}] ${msg}`);
    console.log(`  FALHOU: ${msg}`);
  }
}

function eq<T>(actual: T, expected: T, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${msg} — esperado ${e}, obtido ${a}`);
}

function throws(fn: () => unknown, msg: string, code?: string): void {
  try {
    fn();
    check(false, `${msg} — deveria lançar erro`);
  } catch (err) {
    const c = (err as { code?: string }).code;
    check(code === undefined || c === code, `${msg} — código esperado ${code}, obtido ${c} (${(err as Error).message})`);
  }
}

const c = (s: string): Card[] => parseCards(s);

// ---------------------------------------------------------------------------
// Avaliador: casos conhecidos
// ---------------------------------------------------------------------------

section('Avaliador — casos conhecidos');

const kindCases: [string, HandKind, number[], string?][] = [
  ['As Ks Qs Js Ts', 'straight_flush', [14], 'royal'],
  ['Ah Kh Qh Jh Th 9h 8h', 'straight_flush', [14], '7 copas: royal'],
  ['9h 8h 7h 6h 5h', 'straight_flush', [9]],
  ['5d 4d 3d 2d Ad', 'straight_flush', [5], 'roda de ouros'],
  ['9c 8c 7c 6c 5c Td Jd', 'straight_flush', [9], 'SF escondido com sequência maior misturada'],
  ['Ac 9c 8c 7c 6c 5c 2d', 'straight_flush', [9], 'SF vence flush de Ás do mesmo naipe'],
  ['2s 3s 4s 5s 6s 7h 8d', 'straight_flush', [6], 'SF 6 vence sequência 8 misturada'],
  ['6h 7h 8h 9h Th Jh 2c', 'straight_flush', [11], 'seis cartas seguidas do naipe: pega a maior'],
  ['Ts Js Qs Ks As 9s 8s', 'straight_flush', [14], '7 espadas'],
  ['9s 9h 9d 9c Ks 2d 3c', 'quads', [9, 13]],
  ['8s 8h 8d 8c 2s Ac 3d', 'quads', [8, 14], 'quadra na mesa, kicker na mão'],
  ['8s 8h 8d 8c 2s Kc Qd', 'quads', [8, 13]],
  ['Qd Qc Qh Qs', 'quads', [12], '4 cartas'],
  ['Ks Kh Kd 2s 2h', 'full_house', [13, 2]],
  ['7s 7h 7d 5s 5h 5d Ac', 'full_house', [7, 5], 'duas trincas'],
  ['Qs Qh Qd 9s 9h 8s 8h', 'full_house', [12, 9], 'trinca + dois pares'],
  ['3s 3h 3d As Ah Ad 2c', 'full_house', [14, 3], 'duas trincas, a maior é a trinca'],
  ['Ks Kh Kd 2s 2h Ac Ad', 'full_house', [13, 14], 'par de ases melhora o full'],
  ['Ah Jh 8h 6h 2h', 'flush', [14, 11, 8, 6, 2]],
  ['Ah Kh 9h 7h 4h 2h 3c', 'flush', [14, 13, 9, 7, 4], '6 cartas do naipe: top 5'],
  ['9h 8h 7c 6h 5d 2h Kh', 'flush', [13, 9, 8, 6, 2], 'flush vence sequência'],
  ['Ah 2c 3d 4s 5h', 'straight', [5], 'roda'],
  ['Ah Kc Qd Js Th', 'straight', [14], 'broadway'],
  ['Ac 2d 3h 4s 5c 6d Kh', 'straight', [6], 'roda + 6 = sequência de 6'],
  ['3c 4d 5h 6s 7c 8d 9h', 'straight', [9], '7 seguidas'],
  ['5s 6h 7d 8c 9s 9d 2h', 'straight', [9], 'sequência com par'],
  ['Kh Ac 2d 3s 4h', 'high_card', [14, 13, 4, 3, 2], 'sem sequência "dando a volta"'],
  ['Js Jh Jd 9c 4s 2d 3h', 'trips', [11, 9, 4]],
  ['As Ad Ks Kd 2c 3h 4s', 'two_pair', [14, 13, 4]],
  ['As Ad Ks Kd Qs Qh 2c', 'two_pair', [14, 13, 12], 'três pares: o terceiro vira kicker'],
  ['9s 9d 8s 8d 7s 7h Ac', 'two_pair', [9, 8, 14], 'três pares, kicker Ás solto'],
  ['Ts Td 8c 6h 4s 3d 2c', 'pair', [10, 8, 6, 4]],
  ['Ad Jc 9h 7s 5d 3c 2h', 'high_card', [14, 11, 9, 7, 5]],
  ['Ad Ac', 'pair', [14], '2 cartas (pré-flop)'],
  ['As Ks Qs Js 9d 8c', 'high_card', [14, 13, 12, 11, 9], '6 cartas'],
];

for (const [cards, kind, ranks, note] of kindCases) {
  const v = evaluateHand(c(cards));
  const label = `${cards}${note ? ` (${note})` : ''}`;
  eq(v.kind, kind, `${label}: categoria`);
  eq(ranksOfScore(v.score), ranks, `${label}: valores`);
  check(v.score === scoreCards(c(cards)), `${label}: evaluateHand e scoreCards concordam`);
  check(v.best5.length === Math.min(5, c(cards).length), `${label}: best5 com ${Math.min(5, c(cards).length)} cartas`);
}
check(evaluateHand(c('As Ks Qs Js Ts')).royal, 'royal flag no royal flush');
check(!evaluateHand(c('Ks Qs Js Ts 9s')).royal, 'K-high SF não é royal');
check(!evaluateHand(c('5d 4d 3d 2d Ad')).royal, 'roda de ouros não é royal');
eq(evaluateHand(c('Ah Kh 9h 7h 4h 2h 3c')).best5, c('Ah Kh 9h 7h 4h'), 'best5 do flush com 6 cartas');
eq(evaluateHand(c('5d 4d 3d 2d Ad 6c 7c')).best5, c('5d 4d 3d 2d Ad'), 'best5 do steel wheel (vence sequência 7)');
eq(evaluateHand(c('7s 7h 7d 5s 5h 5d Ac')).best5, c('7s 7h 7d 5s 5h'), 'best5 do full com duas trincas');
eq(evaluateHand(c('Ah 2c 3d 4s 5h 9c Kd')).best5, c('5h 4s 3d 2c Ah'), 'best5 da roda (Ás no fim)');
eq(evaluateHand(c('As Ad Ks Kd Qs Qh 2c')).best5, c('As Ad Ks Kd Qs'), 'best5 com três pares');

section('Avaliador — comparações');
const cmp = (a: string, b: string): number => Math.sign(scoreCards(c(a)) - scoreCards(c(b)));
const compareCases: [string, -1 | 0 | 1, string, string][] = [
  ['As Ad Kc 7s 4d', 1, 'Ah Ac Qc 7d 4s', 'par de A: kicker K > Q'],
  ['As Ks Qs Js Ts 2c 3d', 0, 'As Ks Qs Js Ts 4c 5d', 'royal na mesa: split exato'],
  ['Ah Ad Kc Ks Qd', 0, 'Ac As Kh Kd Qh', 'mesmos dois pares e kicker, naipes diferentes'],
  ['Ah Kd Qc Js 9h', 1, 'Ac Kh Qd Jc 8s', 'quinto kicker decide'],
  ['Ah Ad Kc Qs Jd 3c 2h', 0, 'Ac As Kd Qh Jc 5d 4s', '6ª e 7ª cartas não contam'],
  ['Ah Kd Qc Js Th', 1, 'Kh Qd Jc Ts 9h', 'broadway > K-high'],
  ['2c 3d 4h 5s 6c', 1, 'Ac 2d 3h 4s 5c', 'sequência de 6 > roda'],
  ['Ks Kh Kd 2s 2h', 1, 'Ah Jh 8h 6h 2h', 'full > flush'],
  ['2s 2h 2d 2c 3h', 1, 'As Ah Ad Ks Kh', 'quadra > full'],
  ['2s 2h 2d 4c 3h', 1, 'As Ah Kd Ks Qh', 'trinca > dois pares'],
  ['Ah Ad Kc Ks Qd', 1, 'Ah Ad Kc Ks Jd', 'kicker dos dois pares'],
  ['4s 4h 4d 2s 2h', 1, '3s 3h 3d As Ah', 'full: a trinca vale mais que o par'],
  ['Ah Kh 8h 6h 2h', 1, 'As Qs 9s 7s 3s', 'flush: segunda carta decide'],
  ['As Ad Kc 5s 4d', 1, 'Ah Ac Qd Js Td', 'par: kicker K vence Q-J-T'],
  ['2h 3h 4h 5h 6h', 1, 'Ad 2d 3d 4d 5d', 'SF 6 > steel wheel'],
  ['Ks Kh Kd Kc Ah 2c 3d', 0, 'Ks Kh Kd Kc Ah 7c 8d', 'quadra + kicker na mesa: split'],
  ['2c 2d As Ad Ks Kd Qc', 0, '3c 3d As Ad Ks Kd Qc', 'par na mão "falsificado" pela mesa: split'],
  ['Ah Ad 9c 9s 5h 5d 2c', 1, 'Ah Ad 9c 9s 4h 4d 3c', 'três pares: kicker 5 > 4'],
  ['9h 8h 7h 6h 5h', 1, 'Ah Ad Ac As Kh', 'straight flush > quadra'],
  ['Ac Kc Qc Jc 9c', 1, 'Ah Kd Qc Js Th', 'flush > sequência'],
];
for (const [a, expected, b, note] of compareCases) eq(cmp(a, b), expected, note);
throws(() => evaluateHand(c('As As Kd Qc Jh')), 'carta repetida lança erro');
throws(() => evaluateHand(['Ax' as Card, 'Kd', 'Qc', 'Jh', 'Th']), 'carta inválida lança erro');
// Pôster Poker (03/11/2026): até 8 cartas (board de 6 do Onze Homens).
throws(() => evaluateHand(c('As Ks Qs Js Ts 9s 8s 7s 6s')), 'mais de 8 cartas lança erro');
eq(evaluateHand(c('As Ks Qs Js Ts 9s 8s 7s')).kind, 'straight_flush', '8 cartas: royal entre elas');
eq(cardLabel('As'), 'A♠', 'cardLabel As');
eq(cardLabel('Th'), '10♥', 'cardLabel Th');
eq(c('10h as KD'), ['Th', 'As', 'Kd'] as Card[], 'parseCards aceita formas soltas');
check(fullDeck().length === 52 && new Set(fullDeck()).size === 52, 'baralho com 52 cartas distintas');
check(fullDeck().every((card, i) => cardIndex(card) === i && cardFromIndex(i) === card), 'índices de carta consistentes');

// ---------------------------------------------------------------------------
// Avaliador: conferência contra um avaliador ingênuo (força bruta)
// ---------------------------------------------------------------------------

section('Avaliador — força bruta (21 combinações) em mãos aleatórias');

function naive5(idx: number[]): number {
  const ranks = idx.map((i) => (i >> 2) + 2);
  const suits = idx.map((i) => i & 3);
  const flush = suits.every((s) => s === suits[0]);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = [...counts.keys()].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5 && uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
  if (uniq.join(',') === '14,5,4,3,2') straightHigh = 5;
  let cat: number;
  let vals: number[];
  if (straightHigh && flush) [cat, vals] = [8, [straightHigh]];
  else if (groups[0][1] === 4) [cat, vals] = [7, [groups[0][0], groups[1][0]]];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [cat, vals] = [6, [groups[0][0], groups[1][0]]];
  else if (flush) [cat, vals] = [5, uniq];
  else if (straightHigh) [cat, vals] = [4, [straightHigh]];
  else if (groups[0][1] === 3) [cat, vals] = [3, groups.map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [cat, vals] = [2, groups.map((g) => g[0])];
  else if (groups[0][1] === 2) [cat, vals] = [1, groups.map((g) => g[0])];
  else [cat, vals] = [0, uniq];
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (vals[i] ?? 0);
  return s;
}

function naiveBest(idx: number[]): number {
  const n = idx.length;
  if (n === 5) return naive5(idx);
  let best = -1;
  const pick: number[] = [];
  const rec = (start: number): void => {
    if (pick.length === 5) {
      best = Math.max(best, naive5(pick));
      return;
    }
    for (let i = start; i < n; i++) {
      pick.push(idx[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}

{
  const rng = createRng('cross-check');
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let mismatches = 0;
  const perCategory = new Array<number>(9).fill(0);
  const N = 120000;
  for (let t = 0; t < N; t++) {
    const n = t % 10 === 0 ? 5 : t % 10 === 1 ? 6 : 7;
    for (let k = 0; k < n; k++) {
      const j = k + rng.nextInt(52 - k);
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
    }
    const hand = deck.slice(0, n);
    const fast = scoreCards(hand.map(cardFromIndex));
    const slow = naiveBest(hand);
    perCategory[fast >>> 20]++;
    if (fast !== slow) {
      mismatches++;
      if (mismatches <= 5) console.log('  divergência:', hand.map(cardFromIndex).join(' '), fast, slow);
    }
  }
  eq(mismatches, 0, `${N} mãos aleatórias (5, 6 e 7 cartas) idênticas ao avaliador ingênuo`);
  // Força alguns straight flushes e quadras, que são raros em amostra aleatória.
  const forced = ['Ah Kh Qh Jh Th 2c 3c', '5c 4c 3c 2c Ac Kd Qd', '7d 7c 7h 7s 2d 3d 4d', '9s 8s 7s 6s 5s 4s 3s'];
  for (const f of forced) {
    const idx = c(f).map(cardIndex);
    eq(scoreCards(c(f)), naiveBest(idx), `forçado: ${f}`);
  }
  console.log(`  distribuição por categoria (0..8): ${perCategory.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Avaliador: cartas repetidas e 8 cartas (Pôster Poker, 03/11/2026)
// ---------------------------------------------------------------------------

section('Avaliador — cartas repetidas (Cassino) e 8 cartas (Onze Homens)');

/** Ingênuo para 5 cartas que podem repetir: cinco iguais (9) e flush com valores repetidos. */
function naive5Multi(idx: number[]): number {
  const ranks = idx.map((i) => (i >> 2) + 2);
  const suits = idx.map((i) => i & 3);
  const flush = suits.every((x) => x === suits[0]);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const uniq = [...counts.keys()].sort((a, b) => b - a);
  const sorted = ranks.slice().sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5 && uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
  if (uniq.join(',') === '14,5,4,3,2') straightHigh = 5;
  let cat: number;
  let vals: number[];
  if (groups[0][1] >= 5) [cat, vals] = [9, [groups[0][0]]];
  else if (straightHigh && flush) [cat, vals] = [8, [straightHigh]];
  else if (groups[0][1] === 4) [cat, vals] = [7, [groups[0][0], groups[1][0]]];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [cat, vals] = [6, [groups[0][0], groups[1][0]]];
  else if (flush) [cat, vals] = [5, sorted];
  else if (straightHigh) [cat, vals] = [4, [straightHigh]];
  else if (groups[0][1] === 3) [cat, vals] = [3, groups.map((g) => g[0])];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [cat, vals] = [2, groups.map((g) => g[0])];
  else if (groups[0][1] === 2) [cat, vals] = [1, groups.map((g) => g[0])];
  else [cat, vals] = [0, uniq];
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 16 + (vals[i] ?? 0);
  return v;
}

function naiveBestMulti(idx: number[]): number {
  if (idx.length === 5) return naive5Multi(idx);
  let best = -1;
  const pick: number[] = [];
  const rec = (start: number): void => {
    if (pick.length === 5) {
      best = Math.max(best, naive5Multi(pick));
      return;
    }
    for (let i = start; i < idx.length; i++) {
      pick.push(idx[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return best;
}

{
  const rng = createRng('cross-check-multi');
  const aces = c('As As Ah Ah Ad Ad Ac Ac').map(cardIndex);
  const deck60 = [...Array.from({ length: 52 }, (_, i) => i), ...aces];
  let mism = 0;
  let mism8 = 0;
  let withRepeat = 0;
  const perCat = new Array<number>(10).fill(0);
  const N = 60000;
  for (let t = 0; t < N; t++) {
    const n = 5 + (t % 4);   // 5..8 cartas
    const d = deck60.slice();
    for (let k = 0; k < n; k++) {
      const j = k + rng.nextInt(d.length - k);
      const tmp = d[k];
      d[k] = d[j];
      d[j] = tmp;
    }
    const hand = d.slice(0, n);
    if (new Set(hand).size < n) withRepeat++;
    const fast = scoreIndicesAny(hand, n);
    perCat[fast >>> 20]++;
    if (fast !== naiveBestMulti(hand)) {
      mism++;
      if (mism <= 5) console.log('  divergência (repetidas):', hand.map(cardFromIndex).join(' '), fast.toString(16), naiveBestMulti(hand).toString(16));
    }
    // Sem repetida, o caminho por contagem dá o mesmo número das máscaras.
    if (new Set(hand).size === n) check(scoreIndicesMulti(hand, n) === scoreCards(hand.map(cardFromIndex)), 'contagem = máscaras sem repetida');
  }
  eq(mism, 0, `${N} mãos do baralho de 60 (5 a 8 cartas; ${withRepeat} com repetida) iguais ao ingênuo`);
  console.log(`  distribuição por categoria (0..9): ${perCat.join(', ')}`);
  // 8 cartas distintas: as máscaras continuam certas.
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let t = 0; t < 20000; t++) {
    for (let k = 0; k < 8; k++) {
      const j = k + rng.nextInt(52 - k);
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
    }
    const hand = deck.slice(0, 8);
    if (scoreCards(hand.map(cardFromIndex)) !== naiveBestMulti(hand)) mism8++;
  }
  eq(mism8, 0, '20.000 mãos de 8 cartas distintas iguais ao ingênuo');

  const ev = (cards: string): ReturnType<typeof evaluateHand> => evaluateHand(c(cards), { repeats: true });
  eq(ev('As As Ad Ac Ah Kd 2c').kind, 'five_kind', 'cinco ases = cinco iguais');
  eq(ev('As As Ad Ac Ah Kd 2c').category, 9, 'cinco iguais é a categoria 9');
  check(ev('As As Ad Ac Ah').score > ev('As Ks Qs Js Ts').score, 'cinco iguais > royal flush');
  eq(ev('As As Ks Qs Js 3d 2c').kind, 'flush', 'flush com valor repetido (A♠ A♠ K♠ Q♠ J♠)');
  check(ev('As As Ks Qs Js').score > ev('As Ks Qs Js 9s').score, 'flush A-A-K-Q-J > A-K-Q-J-9');
  eq(ev('As As Ah Ks Kd').kind, 'full_house', 'trinca de ases com 2 iguais + par');
  eq(ev('As As Kd Qc Jh').kind, 'pair', 'par com duas cartas iguais');
  eq(ev('As As Ks Qs Js Ts').kind, 'straight_flush', 'sequência usa valores distintos');
  eq(ev('As As Ah Ad Kd').best5.length, 5, 'best5 com repetidas tem 5 cartas');
  for (const h of ['As As Ad Ac Ah Kd 2c', 'As As Ks Qs Js 3d 2c', 'Ah Ah Ad Ad Kc Kc 2s 3s']) {
    const v = ev(h);
    eq(naive5Multi(v.best5.map(cardIndex)), v.score, `best5 confere com o score (${h})`);
  }
  eq(scoreCardsAny(c('As As Ad Ac Ah')) >>> 20, 9, 'scoreCardsAny: cinco iguais');
  eq(scoreCardsAny(c('As Kd Qc Jh 9s')), scoreCards(c('As Kd Qc Jh 9s')), 'scoreCardsAny sem repetida = scoreCards');
  throws(() => evaluateHand(c('As As Kd Qc Jh')), 'sem repeats, carta repetida continua sendo erro');
  check(evaluateHand(c('As Ks Qs Js Ts 9s 8s 2c')).royal, 'royal em 8 cartas');
}

// ---------------------------------------------------------------------------
// Engine: utilitários de teste
// ---------------------------------------------------------------------------

function makeTable(stacks: number[], cfg: Partial<TableConfig> = {}, seats?: number[], seed = 'mesa-teste'): GameState {
  return createTable(
    { smallBlind: 50, bigBlind: 100, buttonSeat: seats ? seats[0] : 0, ...cfg },
    stacks.map((stack, i) => {
      const seat = seats ? seats[i] : i;
      return { id: `p${seat}`, seat, stack };
    }),
    seed,
  );
}

class Driver {
  state: GameState;
  events: PokerEvent[] = [];
  total: number;
  constructor(state: GameState) {
    this.state = state;
    this.total = totalChips(state);
  }
  private take(r: EngineResult): void {
    this.state = r.state;
    this.events.push(...r.events);
    check(totalChips(this.state) === this.total, `fichas conservadas (${totalChips(this.state)} vs ${this.total})`);
  }
  start(preset?: { holeCards?: Record<string, Card[]>; board?: Card[] }): this {
    this.events = [];
    this.take(startHand(this.state, preset ? { preset } : {}));
    return this;
  }
  act(id: string, action: PlayerAction): this {
    eq(this.state.hand?.toActId ?? null, id, `vez de ${id} antes de ${action.type}`);
    this.take(applyAction(this.state, id, action));
    return this;
  }
  stack(id: string): number {
    return this.state.players.find((p) => p.id === id)!.stack;
  }
  ofType<T extends PokerEvent['type']>(type: T): Extract<PokerEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<PokerEvent, { type: T }> => e.type === type);
  }
}

// ---------------------------------------------------------------------------
// Engine: blinds e botão girando
// ---------------------------------------------------------------------------

section('Engine — blinds e botão girando (4 jogadores)');
{
  const d = new Driver(makeTable([10000, 10000, 10000, 10000]));
  const expected = [
    { btn: 0, sb: 'p1', bb: 'p2', first: 'p3' },
    { btn: 1, sb: 'p2', bb: 'p3', first: 'p0' },
    { btn: 2, sb: 'p3', bb: 'p0', first: 'p1' },
    { btn: 3, sb: 'p0', bb: 'p1', first: 'p2' },
    { btn: 0, sb: 'p1', bb: 'p2', first: 'p3' },
  ];
  for (const exp of expected) {
    d.start();
    const hs = d.ofType('handStarted')[0];
    eq([hs.buttonSeat, hs.smallBlindPlayerId, hs.bigBlindPlayerId], [exp.btn, exp.sb, exp.bb], `mão ${hs.handNumber}: botão/SB/BB`);
    eq(d.state.hand!.toActId, exp.first, `mão ${hs.handNumber}: primeiro a agir`);
    const bp = d.ofType('blindsPosted')[0];
    eq([bp.smallBlind.amount, bp.bigBlind.amount, bp.potAfter], [50, 100, 150], 'valores dos blinds');
    // Todos desistem até o big blind (fold geral).
    const order = ['p0', 'p1', 'p2', 'p3'];
    let id = exp.first;
    for (let k = 0; k < 3; k++) {
      d.act(id, { type: 'fold' });
      id = order[(order.indexOf(id) + 1) % 4];
    }
    eq(d.state.phase, 'handComplete', 'mão termina com fold geral');
    const ret = d.ofType('uncalledBetReturned');
    eq(ret.map((e) => [e.playerId, e.amount]), [[exp.bb, 50]], 'BB recebe de volta os 50 não pagos');
    const pa = d.ofType('potAwarded');
    eq(pa.map((e) => [e.winners[0].playerId, e.amount, e.uncontested]), [[exp.bb, 100, true]], 'BB leva o pote sem showdown');
    check(d.ofType('showdown').length === 0, 'sem evento de showdown');
    eq(d.state.hand!.result!.wentToShowdown, false, 'resultado: sem showdown');
  }
  eq(d.stack('p1') + d.stack('p2') + d.stack('p3') + d.stack('p0'), 40000, 'soma final');
  eq(d.state.history.length, 5, 'histórico com 5 mãos');

  // Ante
  const a = new Driver(makeTable([1000, 1000, 1000], { smallBlind: 10, bigBlind: 20, ante: 5 }));
  a.start();
  const bp = a.ofType('blindsPosted')[0];
  eq(bp.antes.map((x) => x.amount), [5, 5, 5], 'antes postados');
  eq(bp.potAfter, 45, 'pote = 3 antes + SB + BB');
  eq(getLegalActions(a.state, 'p0')!.toCall, 20, 'ante não conta para pagar o BB');
  a.act('p0', { type: 'call' }).act('p1', { type: 'call' }).act('p2', { type: 'check' });
  eq(a.state.hand!.street, 'flop', 'flop depois do limp');
  eq(a.state.hand!.board.length, 3, 'flop com 3 cartas');
  eq(a.ofType('streetDealt')[0].cards.length, 3, 'evento streetDealt do flop');
}

// ---------------------------------------------------------------------------
// Engine: heads-up
// ---------------------------------------------------------------------------

section('Engine — heads-up');
{
  const d = new Driver(makeTable([1000, 1000], {}, [0, 5]));
  d.start();
  const hs = d.ofType('handStarted')[0];
  eq([hs.buttonPlayerId, hs.smallBlindPlayerId, hs.bigBlindPlayerId], ['p0', 'p0', 'p5'], 'botão posta o small blind');
  eq(d.state.hand!.toActId, 'p0', 'botão (SB) age primeiro no pré-flop');
  d.act('p0', { type: 'call' });
  const l = getLegalActions(d.state, 'p5')!;
  check(l.canCheck && l.raise !== null && l.raise.min === 200, 'BB tem a opção (check ou aumentar para 200)');
  d.act('p5', { type: 'check' });
  eq(d.state.hand!.street, 'flop', 'flop');
  eq(d.state.hand!.toActId, 'p5', 'BB age primeiro depois do flop');
  d.act('p5', { type: 'bet', amount: 100 }).act('p0', { type: 'fold' });
  eq(d.stack('p5'), 1100, 'BB ganha 100');
  d.start();
  const hs2 = d.ofType('handStarted')[0];
  eq([hs2.buttonPlayerId, hs2.smallBlindPlayerId, hs2.bigBlindPlayerId], ['p5', 'p5', 'p0'], 'botão passa para p5, que posta o SB');
  eq(d.state.hand!.toActId, 'p5', 'novo botão age primeiro');

  // BB curto all-in: ninguém precisa agir, o excesso do SB volta.
  const s = new Driver(makeTable([1000, 30], {}, [0, 1]));
  s.start({ holeCards: { p0: c('7c 2d'), p1: c('Ah Ac') }, board: c('Kd 8s 4h 3c Jd') });
  eq(s.state.phase, 'handComplete', 'BB all-in com 30: mão corre sozinha');
  eq([s.stack('p0'), s.stack('p1')], [970, 60], 'BB curto dobra (30 x 30)');
  eq(s.ofType('uncalledBetReturned').map((e) => [e.playerId, e.amount]), [['p0', 20]], 'SB recebe 20 de volta');
  eq(s.ofType('potAwarded').reduce((t, e) => t + e.amount, 0), 60, 'pote de 60');
  check(s.ofType('allInRunout').length === 1 && s.ofType('streetDealt').length === 3, 'board corrido com cartas abertas');
}

// ---------------------------------------------------------------------------
// Engine: aumento mínimo
// ---------------------------------------------------------------------------

section('Engine — aumento mínimo');
{
  const d = new Driver(makeTable([10000, 10000, 10000, 10000]));
  d.start();
  let l = getLegalActions(d.state, 'p3')!;
  eq([l.call?.amount, l.raise?.min, l.raise?.max, l.bet], [100, 200, 10000, null], 'UTG: call 100, raise 200..10000');
  d.act('p3', { type: 'raise', amount: 300 });
  l = getLegalActions(d.state, 'p0')!;
  eq(l.raise?.min, 500, 'depois de aumentar para 300 (+200), mínimo é 500');
  throws(() => applyAction(d.state, 'p0', { type: 'raise', amount: 499 }), 'raise para 499 é recusado', 'invalid_amount');
  throws(() => applyAction(d.state, 'p0', { type: 'raise', amount: 10001 }), 'raise acima do stack é recusado', 'invalid_amount');
  throws(() => applyAction(d.state, 'p0', { type: 'raise', amount: 450.5 }), 'valor fracionado é recusado', 'invalid_amount');
  throws(() => applyAction(d.state, 'p1', { type: 'fold' }), 'agir fora da vez é recusado', 'not_your_turn');
  throws(() => applyAction(d.state, 'p0', { type: 'check' }), 'check devendo é recusado', 'illegal_action');
  d.act('p0', { type: 'raise', amount: 500 });
  eq(getLegalActions(d.state, 'p1')!.raise?.min, 700, 'mínimo agora é 700');
  d.act('p1', { type: 'raise', amount: 2000 });
  eq(getLegalActions(d.state, 'p2')!.raise?.min, 3500, 'aumento de 1500 → mínimo 3500');
  d.act('p2', { type: 'fold' }).act('p3', { type: 'fold' }).act('p0', { type: 'call' });
  eq(d.state.hand!.street, 'flop', 'flop');
  eq(d.state.hand!.toActId, 'p1', 'primeiro ativo à esquerda do botão age no flop');
  l = getLegalActions(d.state, 'p1')!;
  eq([l.canCheck, l.bet?.min, l.raise], [true, 100, null], 'no flop: aposta mínima = big blind');
  d.act('p1', { type: 'raise', amount: 250 }); // 'raise' sem aposta anterior = bet
  eq(d.state.hand!.actions.at(-1)!.type, 'bet', 'raise sem aposta anterior é registrado como bet');
  eq(getLegalActions(d.state, 'p0')!.raise?.min, 500, 'raise mínimo sobre bet de 250 é 500');
}

// ---------------------------------------------------------------------------
// Engine: all-in curto não reabre a ação
// ---------------------------------------------------------------------------

section('Engine — all-in curto');
{
  const d = new Driver(makeTable([10000, 400, 10000]));
  d.start();
  eq(d.state.hand!.toActId, 'p0', '3 jogadores: botão age primeiro no pré-flop');
  d.act('p0', { type: 'raise', amount: 300 });
  d.act('p1', { type: 'allIn' });
  const rec = d.state.hand!.actions.at(-1)!;
  eq([rec.type, rec.to, rec.allIn, rec.shortAllIn], ['raise', 400, true, true], 'SB all-in para 400 = aumento curto');
  eq(getLegalActions(d.state, 'p2')!.raise?.min, 600, 'BB (ainda não agiu) pode aumentar: mínimo 400 + 200');
  d.act('p2', { type: 'call' });
  const l = getLegalActions(d.state, 'p0')!;
  eq([l.toCall, l.raise, l.allIn, l.canCheck], [100, null, null, false], 'quem já agiu só pode pagar ou desistir');
  throws(() => applyAction(d.state, 'p0', { type: 'raise', amount: 1000 }), 'aumentar é recusado', 'illegal_action');
  throws(() => applyAction(d.state, 'p0', { type: 'allIn' }), 'all-in também é recusado', 'illegal_action');
  d.act('p0', { type: 'call' });
  eq([d.state.hand!.street, d.state.hand!.toActId], ['flop', 'p2'], 'flop; SB all-in é pulado');

  // Dois all-ins curtos que, somados, viram um aumento completo: reabre.
  const e = new Driver(makeTable([400, 520, 10000, 10000]));
  e.start();
  e.act('p3', { type: 'raise', amount: 300 });
  e.act('p0', { type: 'allIn' }); // 400 (curto: +100)
  e.act('p1', { type: 'allIn' }); // 520 (curto: +120)
  eq(getLegalActions(e.state, 'p2')!.raise?.min, 720, 'BB pode aumentar para 720');
  e.act('p2', { type: 'call' });
  const l2 = getLegalActions(e.state, 'p3')!;
  eq([l2.toCall, l2.raise?.min], [220, 720], 'UTG enfrenta +220 (≥ 200) desde sua ação: ação reaberta');
  e.act('p3', { type: 'raise', amount: 1500 }).act('p2', { type: 'call' });
  eq(e.state.hand!.street, 'flop', 'flop com dois all-in e dois ativos');
  const pots = computePots(e.state.players);
  eq(pots.map((p) => [p.amount, p.eligibleIds.length]), [[1600, 4], [360, 3], [1960, 2]], 'potes 400×4, 120×3, 980×2');
}

// ---------------------------------------------------------------------------
// Engine: três all-ins e side pots
// ---------------------------------------------------------------------------

section('Engine — side pots com três all-ins');
{
  const d = new Driver(makeTable([200, 500, 1000, 2000], { smallBlind: 5, bigBlind: 10 }));
  d.start({
    holeCards: { p0: c('As Ad'), p1: c('Ks Kd'), p2: c('Qs Qd'), p3: c('4c 5d') },
    board: c('2c 7d 9h Js 3s'),
  });
  d.act('p3', { type: 'raise', amount: 1500 });
  d.act('p0', { type: 'allIn' }).act('p1', { type: 'allIn' }).act('p2', { type: 'allIn' });
  eq(d.state.phase, 'handComplete', 'mão termina sozinha (board corrido)');
  eq(d.state.hand!.board, c('2c 7d 9h Js 3s'), 'board do preset');
  eq(d.ofType('uncalledBetReturned').map((e) => [e.playerId, e.amount]), [['p3', 500]], 'excesso de 500 volta para p3');
  const types = d.events.map((e) => e.type);
  check(types.indexOf('allInRunout') < types.indexOf('streetDealt'), 'cartas abertas antes de correr o board');
  eq(d.ofType('streetDealt').map((e) => e.street), ['flop', 'turn', 'river'], 'flop, turn e river');
  const pa = d.ofType('potAwarded');
  eq(
    pa.map((e) => [e.amount, e.eligibleIds, e.winners]),
    [
      [800, ['p0', 'p1', 'p2', 'p3'], [{ playerId: 'p0', amount: 800 }]],
      [900, ['p1', 'p2', 'p3'], [{ playerId: 'p1', amount: 900 }]],
      [1000, ['p2', 'p3'], [{ playerId: 'p2', amount: 1000 }]],
    ],
    'pote principal p0, side 1 p1, side 2 p2',
  );
  eq(['p0', 'p1', 'p2', 'p3'].map((id) => d.stack(id)), [800, 900, 1000, 1000], 'stacks finais');
  eq(
    d.ofType('showdown')[0].hands.map((h) => [h.playerId, h.kind]),
    [['p1', 'pair'], ['p2', 'pair'], ['p3', 'high_card'], ['p0', 'pair']],
    'mãos no showdown, a partir da esquerda do botão',
  );
  eq(d.state.hand!.result!.net, { p0: 600, p1: 400, p2: 0, p3: -1000 }, 'ganho líquido');

  // Mesmo cenário, mas o maior stack vence tudo: três eliminados de uma vez.
  const e = new Driver(makeTable([200, 500, 1000, 2000], { smallBlind: 5, bigBlind: 10 }));
  e.start({
    holeCards: { p0: c('Ks Kd'), p1: c('Qs Qd'), p2: c('Jh Jd'), p3: c('As Ad') },
    board: c('2c 7d 9h Tc 3s'),
  });
  e.act('p3', { type: 'raise', amount: 1500 });
  e.act('p0', { type: 'allIn' }).act('p1', { type: 'allIn' }).act('p2', { type: 'allIn' });
  eq(e.stack('p3'), 3700, 'p3 leva todos os potes');
  eq(
    e.ofType('playerEliminated').map((x) => [x.playerId, x.place]),
    [['p2', 2], ['p1', 3], ['p0', 4]],
    'eliminação simultânea: maior stack inicial fica melhor colocado',
  );
  eq(e.state.phase, 'gameOver', 'jogo acaba');
  eq(e.ofType('gameOver').map((x) => x.winnerId), ['p3'], 'evento gameOver com o campeão');
  throws(() => startHand(e.state), 'não começa mão depois do fim', 'game_over');
}

// ---------------------------------------------------------------------------
// Engine: split com odd chip
// ---------------------------------------------------------------------------

section('Engine — split com odd chip');
{
  const d = new Driver(makeTable([1000, 1000, 1000], { smallBlind: 5, bigBlind: 10 }));
  d.start({ holeCards: { p0: c('2c 3d'), p1: c('4c 5d'), p2: c('6c 7d') }, board: c('As Ks Qs Js Ts') });
  d.act('p0', { type: 'call' }).act('p1', { type: 'fold' }).act('p2', { type: 'check' });
  for (let street = 0; street < 3; street++) d.act('p2', { type: 'check' }).act('p0', { type: 'check' });
  const pa = d.ofType('potAwarded');
  eq(pa.length, 1, 'um pote');
  eq(pa[0].amount, 25, 'pote ímpar de 25');
  eq(pa[0].winners, [{ playerId: 'p2', amount: 13 }, { playerId: 'p0', amount: 12 }], 'ficha extra para o primeiro à esquerda do botão');
  eq(pa[0].kind, 'straight_flush', 'royal na mesa');
  eq([d.stack('p0'), d.stack('p1'), d.stack('p2')], [1002, 995, 1003], 'stacks finais');
  check(d.ofType('showdown')[0].hands.every((h) => h.royal), 'todas as mãos são royal');
}

// ---------------------------------------------------------------------------
// Engine: fold geral, eliminação e fim de jogo
// ---------------------------------------------------------------------------

section('Engine — fold geral, eliminação e fim de jogo');
{
  const d = new Driver(makeTable([10000, 10000, 10000, 10000]));
  d.start();
  d.act('p3', { type: 'raise', amount: 300 }).act('p0', { type: 'fold' }).act('p1', { type: 'fold' }).act('p2', { type: 'fold' });
  eq(d.ofType('uncalledBetReturned').map((e) => e.amount), [200], 'aumento não pago volta (200)');
  eq(d.ofType('potAwarded').map((e) => [e.amount, e.winners[0].playerId]), [[250, 'p3']], 'p3 leva 250');
  eq(d.state.hand!.result!.net.p3, 150, 'p3 lucra 150');

  const h = new Driver(makeTable([500, 3000, 1000], { smallBlind: 10, bigBlind: 20 }));
  h.start({ holeCards: { p0: c('7c 2d'), p1: c('Ah Ac'), p2: c('9s 9h') }, board: c('Kd 8s 4h 3c Jd') });
  h.act('p0', { type: 'allIn' }).act('p1', { type: 'call' }).act('p2', { type: 'fold' });
  eq(h.ofType('playerEliminated').map((e) => [e.playerId, e.place]), [['p0', 3]], 'p0 eliminado em 3º');
  eq(h.state.players.find((p) => p.id === 'p0')!.status, 'eliminated', 'status eliminado');
  h.start({ holeCards: { p1: c('Kh Kc'), p2: c('Qh Qc') }, board: c('2d 7s 4h 3c Jd') });
  const hs = h.ofType('handStarted')[0];
  eq(hs.players.map((p) => p.playerId), ['p1', 'p2'], 'eliminado não recebe cartas');
  eq(h.state.hand!.toActId, hs.buttonPlayerId, 'heads-up depois da eliminação: botão age primeiro');
  h.act(hs.buttonPlayerId, { type: 'allIn' });
  h.act(hs.bigBlindPlayerId, { type: 'call' });
  eq(h.ofType('playerEliminated').map((e) => [e.playerId, e.place]), [['p2', 2]], 'p2 eliminado em 2º');
  eq([h.state.phase, h.state.winnerId], ['gameOver', 'p1'], 'p1 campeão');
}

// ---------------------------------------------------------------------------
// Engine: visão pública
// ---------------------------------------------------------------------------

section('Engine — publicView e eventos por espectador');
{
  const d = new Driver(makeTable([1000, 1000, 1000]));
  d.start();
  const v = publicView(d.state, 'p1');
  const json = JSON.stringify(v);
  check(!('rng' in v), 'sem estado do RNG');
  check(v.hand !== null && !('deck' in v.hand) && v.hand.deckCount === 52 - 6, 'sem baralho, só a contagem');
  eq(v.players.find((p) => p.id === 'p1')!.holeCards, d.state.players.find((p) => p.id === 'p1')!.holeCards, 'vê as próprias cartas');
  for (const other of ['p0', 'p2']) {
    const pv = v.players.find((p) => p.id === other)!;
    check(pv.holeCards.length === 0 && pv.hasHiddenCards, `${other}: cartas escondidas`);
    for (const card of d.state.players.find((p) => p.id === other)!.holeCards) {
      check(!json.includes(`"${card}"`), `${other}: carta ${card} não vaza no JSON`);
    }
  }
  const evs = eventsForViewer(d.events, 'p1');
  const dealt = evs.find((e) => e.type === 'holeCardsDealt');
  check(
    dealt !== undefined && dealt.type === 'holeCardsDealt' && dealt.hands.every((h) => (h.playerId === 'p1') === (h.cards.length === 2)),
    'holeCardsDealt filtrado',
  );
  // All-in e showdown: as cartas viram públicas.
  d.act('p0', { type: 'allIn' }).act('p1', { type: 'call' }).act('p2', { type: 'call' });
  const v2 = publicView(d.state, null);
  check(v2.players.every((p) => p.holeCards.length === 2 && !p.hasHiddenCards), 'depois do showdown todos veem as mãos');
  check(JSON.stringify(JSON.parse(JSON.stringify(d.state))) === JSON.stringify(d.state), 'estado é JSON puro (ida e volta idêntica)');
}

// ---------------------------------------------------------------------------
// Engine: ganchos de efeito do Pôster Poker (03/11/2026)
// ---------------------------------------------------------------------------

section('Engine — efeitos do Pôster Poker (cartas a mais, flop antecipado, river de 2)');
{
  const ACES = c('As As Ah Ah Ad Ad Ac Ac');
  // Sem fx o baralho é o mesmo de sempre (mesma semente = mesmas cartas).
  const plain = startHand(makeTable([1000, 1000, 1000], {}, undefined, 'fx-seed'));
  const empty = startHand(makeTable([1000, 1000, 1000], {}, undefined, 'fx-seed'), { fx: {} });
  eq(empty.state.hand!.deck, plain.state.hand!.deck, 'fx vazio não muda o baralho');
  check(plain.state.hand!.fx === undefined, 'mão normal sem fx no estado');

  // Cassino: 60 cartas, 12 ases, showdown com repetidas.
  let fives = 0;
  let repeatsSeen = 0;
  for (let k = 0; k < 400; k++) {
    const d = new Driver(makeTable([1000, 1000, 1000, 1000], {}, undefined, `fx-aces-${k}`));
    const r = startHand(d.state, { fx: { extraCards: ACES } });
    const h = r.state.hand!;
    const all = [...h.deck, ...h.board, ...r.state.players.flatMap((p) => p.holeCards)];
    if (k === 0) {
      eq(all.length, 60, 'baralho do Cassino: 60 cartas');
      eq(all.filter((x) => x[0] === 'A').length, 12, '12 ases (4 + 8)');
      eq(h.fx?.repeats, true, 'mão marcada com repetidas');
    }
    d.state = r.state;
    // Todo mundo paga até o fim.
    for (let guard = 0; guard < 40 && d.state.phase === 'betting'; guard++) {
      const to = d.state.hand!.toActId!;
      const L = getLegalActions(d.state, to)!;
      d.act(to, L.canCheck ? { type: 'check' } : { type: 'call' });
    }
    const sd = d.ofType('showdown')[0];
    check(!!sd, 'mão do Cassino chega ao showdown');
    for (const hh of sd?.hands ?? []) {
      if (hh.kind === 'five_kind') fives++;
      const seven = [...hh.cards, ...d.state.hand!.board];
      if (new Set(seven).size < seven.length) repeatsSeen++;
      eq(hh.score, scoreCardsAny(seven), 'showdown usa o avaliador que aceita repetidas');
    }
  }
  check(repeatsSeen > 0, `houve mãos com carta repetida no showdown (${repeatsSeen}; cinco iguais: ${fives})`);
  throws(() => startHand(makeTable([1000, 1000]), { fx: { extraCards: ['Ax' as Card] } }), 'carta a mais inválida é recusada', 'invalid_config');

  // Golpe de Mestre: flop antes das apostas do pré-flop, depois direto para o turn.
  {
    const d = new Driver(makeTable([1000, 1000, 1000]));
    d.events = [];
    const r = startHand(d.state, { fx: { earlyFlop: true } });
    d.state = r.state;
    d.events.push(...r.events);
    const types = r.events.map((e) => e.type);
    eq(types.slice(0, 4), ['handStarted', 'blindsPosted', 'holeCardsDealt', 'streetDealt'], 'flop sai logo depois das cartas fechadas');
    const early = d.ofType('streetDealt')[0];
    eq([early.street, early.early, early.cards.length], ['flop', true, 3], 'streetDealt do flop com early: true');
    eq(d.state.hand!.street, 'preflop', 'a rua continua sendo o pré-flop');
    eq(d.state.hand!.currentBet, 100, 'nível a pagar = big blind');
    eq(getLegalActions(d.state, d.state.hand!.toActId!)!.street, 'preflop', 'ações legais do pré-flop');
    d.act('p0', { type: 'call' }).act('p1', { type: 'call' }).act('p2', { type: 'check' });
    const streets = d.ofType('streetDealt');
    eq(streets.map((e) => e.street), ['flop', 'turn'], 'depois do pré-flop vem o turn (sem segunda rodada de flop)');
    eq(d.state.hand!.board.length, 4, 'board com 4 no turn');
    eq(d.state.hand!.actions.filter((a) => a.street === 'flop').length, 0, 'nenhuma ação de flop');
    for (const id of ['p1', 'p2', 'p0']) d.act(id, { type: 'check' });
    for (const id of ['p1', 'p2', 'p0']) d.act(id, { type: 'check' });
    eq(d.ofType('showdown').length, 1, 'showdown no fim');
    eq(d.state.hand!.board.length, 5, 'board de 5 no fim');
  }
  {
    // Flop antecipado + all-in no pré-flop: corre turn e river.
    const d = new Driver(makeTable([1000, 1000]));
    const r = startHand(d.state, { fx: { earlyFlop: true } });
    d.state = r.state;
    d.events = r.events.slice();
    const to = d.state.hand!.toActId!;
    d.act(to, { type: 'allIn' });
    d.act(d.state.hand!.toActId!, { type: 'call' });
    eq(d.ofType('streetDealt').map((e) => e.street), ['flop', 'turn', 'river'], 'all-in com flop antecipado: turn e river');
    eq(d.state.hand!.board.length, 5, 'board de 5');
  }

  // Onze Homens: river com 2 cartas (board de 6), showdown com 8 cartas.
  {
    const d = new Driver(makeTable([1000, 1000, 1000]));
    const r = startHand(d.state, { fx: { riverCards: 2 }, preset: { holeCards: { p1: c('As Ks') }, board: c('Qh Jd 2c 7d 3c Ts') } });
    d.state = r.state;
    d.events = r.events.slice();
    d.act('p0', { type: 'call' }).act('p1', { type: 'call' }).act('p2', { type: 'check' });
    for (let street = 0; street < 3; street++) for (const id of ['p1', 'p2', 'p0']) d.act(id, { type: 'check' });
    const river = d.ofType('streetDealt').find((e) => e.street === 'river')!;
    eq(river.cards, c('3c Ts'), 'river com 2 cartas (preset de 6)');
    eq(d.state.hand!.board, c('Qh Jd 2c 7d 3c Ts'), 'board de 6');
    const sd = d.ofType('showdown')[0];
    const p1 = sd.hands.find((h) => h.playerId === 'p1')!;
    eq(p1.kind, 'straight', 'p1 faz a sequência com a 6ª carta (avaliado com 8 cartas)');
    check(p1.best5.includes('Ts'), 'a 6ª carta entra no best5');
    throws(() => startHand(makeTable([1000, 1000]), { preset: { board: c('2c 7d 9h Th 3s Qs') } }), 'board de 6 sem riverCards: 2 é recusado', 'invalid_preset');
  }
}

// ---------------------------------------------------------------------------
// RNG determinístico e retomada
// ---------------------------------------------------------------------------

section('RNG — determinismo e retomada');
{
  const a = createRng('semente-x');
  const b = createRng('semente-x');
  const other = createRng('semente-y');
  const seqA = Array.from({ length: 20 }, () => a.nextUint32());
  const seqB = Array.from({ length: 20 }, () => b.nextUint32());
  const seqO = Array.from({ length: 20 }, () => other.nextUint32());
  eq(seqA, seqB, 'mesma semente = mesma sequência');
  check(JSON.stringify(seqA) !== JSON.stringify(seqO), 'semente diferente = sequência diferente');
  eq(createRng('baralho').shuffle(fullDeck()), createRng('baralho').shuffle(fullDeck()), 'mesma semente = mesmo baralho');
  const saved = JSON.parse(JSON.stringify(a.getState()));
  const cont = Array.from({ length: 50 }, () => a.nextInt(52));
  const resumed = rngFromState(saved);
  eq(Array.from({ length: 50 }, () => resumed.nextInt(52)), cont, 'retomada pelo estado salvo continua igual');
  const buckets = new Array<number>(6).fill(0);
  const r = createRng('dado');
  for (let i = 0; i < 60000; i++) buckets[r.nextInt(6)]++;
  check(buckets.every((n) => Math.abs(n - 10000) < 400), `nextInt(6) uniforme: ${buckets.join(', ')}`);
  let inRange = true;
  for (let i = 0; i < 10000; i++) {
    const f = r.nextFloat();
    if (!(f >= 0 && f < 1)) inRange = false;
  }
  check(inRange, 'nextFloat em [0, 1)');

  // Engine: mesma semente → mesmas cartas; retomada pelo JSON → mesmo resultado.
  const t1 = startHand(makeTable([1000, 1000, 1000], {}, undefined, 'seed-A')).state;
  const t2 = startHand(makeTable([1000, 1000, 1000], {}, undefined, 'seed-A')).state;
  const t3 = startHand(makeTable([1000, 1000, 1000], {}, undefined, 'seed-B')).state;
  eq(t1.players.map((p) => p.holeCards), t2.players.map((p) => p.holeCards), 'mesma semente: mesmas cartas');
  check(JSON.stringify(t1.players.map((p) => p.holeCards)) !== JSON.stringify(t3.players.map((p) => p.holeCards)), 'outra semente: outras cartas');
  const script: [string, PlayerAction][] = [
    ['p0', { type: 'call' }],
    ['p1', { type: 'call' }],
    ['p2', { type: 'check' }],
    ['p1', { type: 'bet', amount: 200 }],
    ['p2', { type: 'call' }],
    ['p0', { type: 'fold' }],
  ];
  let live = t1;
  let restored = JSON.parse(JSON.stringify(t1)) as GameState;
  const frozen = JSON.stringify(t1);
  for (const [id, act] of script) {
    live = applyAction(live, id, act).state;
    restored = applyAction(JSON.parse(JSON.stringify(restored)) as GameState, id, act).state;
  }
  check(JSON.stringify(t1) === frozen, 'applyAction não altera o estado recebido (função pura)');
  eq(JSON.stringify(restored), JSON.stringify(live), 'estado salvo em JSON e retomado chega ao mesmo lugar');
  // Várias mãos seguidas a partir do JSON: mesmo baralho de novo.
  let x = live;
  let y = JSON.parse(JSON.stringify(live)) as GameState;
  while (x.phase === 'betting') {
    const id = x.hand!.toActId!;
    x = applyAction(x, id, { type: 'call' }).state;
    y = applyAction(y, id, { type: 'call' }).state;
  }
  x = startHand(x).state;
  y = startHand(JSON.parse(JSON.stringify(y)) as GameState).state;
  eq(x.players.map((p) => p.holeCards), y.players.map((p) => p.holeCards), 'mão seguinte idêntica após retomada');
  eq(setBlinds(x, { bigBlind: 400, smallBlind: 200 }).config.bigBlind, 400, 'setBlinds');
  throws(() => setBlinds(x, { smallBlind: 500, bigBlind: 400 }), 'SB maior que BB é recusado', 'invalid_config');
  throws(() => createTable({ smallBlind: 1, bigBlind: 2 }, [{ id: 'a', seat: 0, stack: 10 }], 's'), '1 jogador é recusado', 'invalid_config');
  throws(
    () => createTable({ smallBlind: 1, bigBlind: 2 }, [{ id: 'a', seat: 0, stack: 10 }, { id: 'b', seat: 0, stack: 10 }], 's'),
    'assento repetido é recusado',
    'invalid_config',
  );
}

// ---------------------------------------------------------------------------
// Conservação de fichas em mãos aleatórias
// ---------------------------------------------------------------------------

section('Engine — 20.000 mãos aleatórias com ações legais aleatórias');
{
  const rng = createRng('fuzz-20k');
  const TARGET = 20000;
  let hands = 0;
  let tables = 0;
  let actions = 0;
  let illegalRejected = 0;
  const stats = { showdowns: 0, sidePots: 0, runouts: 0, eliminations: 0, shortAllIns: 0, splits: 0, gameOvers: 0, longestGame: 0 };
  let problems = 0;
  const problem = (msg: string): void => {
    problems++;
    if (problems <= 10) console.log(`  problema: ${msg}`);
  };
  const t0 = performance.now();
  while (hands < TARGET) {
    tables++;
    const n = 2 + rng.nextInt(8);
    const seats = Array.from({ length: 9 }, (_, i) => i);
    rng.shuffle(seats);
    const chosen = seats.slice(0, n).sort((a, b) => a - b);
    const bb = 2 + rng.nextInt(200);
    const sb = rng.nextInt(bb + 1);
    const ante = rng.nextInt(3) === 0 ? rng.nextInt(Math.max(1, bb >> 2)) + 1 : 0;
    const players = chosen.map((seat) => ({
      id: `s${seat}`,
      seat,
      // Mistura stacks minúsculos (menores que os blinds) e grandes.
      stack: rng.nextInt(5) === 0 ? 1 + rng.nextInt(bb * 2) : bb * (5 + rng.nextInt(100)),
    }));
    let st = createTable({ smallBlind: sb, bigBlind: bb, ante, historyLimit: 5 }, players, `fuzz-${tables}`);
    // Metade das mesas joga "passivo" (muito fold/call, raises pequenos, all-in raro):
    // partidas longas exercitam a rotação do botão, a subida de blinds e o histórico.
    const passive = tables % 2 === 0;
    const [pFold, pCall, pRaise] = passive ? [35, 90, 99] : [12, 60, 88];
    const total = totalChips(st);
    let handsHere = 0;
    while (st.phase !== 'gameOver' && hands < TARGET && handsHere < 150) {
      if (handsHere > 0 && handsHere % 25 === 0) st = setBlinds(st, { smallBlind: sb * 2, bigBlind: bb * 2 });
      const prevButton = st.buttonSeat;
      // Vivos ANTES da mão (se a mão acabar dentro do startHand, já haverá eliminados).
      const aliveBefore = st.players.filter((x) => x.status !== 'eliminated');
      let r = startHand(st);
      st = r.state;
      {
        // Botão no próximo vivo; heads-up: botão = SB; senão SB e BB são os dois vivos seguintes.
        const nextAliveSeat = (seat: number): number => {
          const after = aliveBefore.find((x) => x.seat > seat);
          return (after ?? aliveBefore[0]).seat;
        };
        const h = st.hand!;
        if (prevButton !== null && h.buttonSeat !== nextAliveSeat(prevButton)) problem('botão não foi para o próximo vivo');
        const expSb = aliveBefore.length === 2 ? h.buttonSeat : nextAliveSeat(h.buttonSeat);
        if (h.smallBlindSeat !== expSb || h.bigBlindSeat !== nextAliveSeat(expSb)) problem('posição dos blinds errada');
      }
      hands++;
      handsHere++;
      let evs = r.events.slice();
      let steps = 0;
      while (st.phase === 'betting') {
        const id = st.hand!.toActId!;
        const legal = getLegalActions(st, id);
        if (!legal) {
          problem(`sem ações legais para ${id}`);
          break;
        }
        const p = st.players.find((x) => x.id === id)!;
        if (p.status !== 'active') problem(`jogador da vez não está ativo: ${p.status}`);
        if (legal.raise && (legal.raise.min !== st.hand!.currentBet + st.hand!.minRaise || legal.raise.max !== p.streetBet + p.stack)) {
          problem('faixa de raise inconsistente');
        }
        // De vez em quando, tenta algo ilegal e confere que é recusado sem mudar nada.
        if (rng.nextInt(20) === 0) {
          const before = JSON.stringify(st);
          const bad: PlayerAction = legal.canCheck
            ? { type: 'raise', amount: (legal.raise?.max ?? legal.bet?.max ?? p.streetBet + p.stack) + 1 }
            : { type: 'check' };
          try {
            applyAction(st, id, bad);
            problem(`ação ilegal aceita: ${JSON.stringify(bad)}`);
          } catch {
            illegalRejected++;
          }
          if (JSON.stringify(st) !== before) problem('ação recusada alterou o estado');
        }
        const roll = rng.nextInt(100);
        const range = legal.bet ?? legal.raise;
        let action: PlayerAction;
        if (roll < pFold) action = { type: 'fold' };
        else if (roll < pCall) action = legal.canCheck ? { type: 'check' } : { type: 'call' };
        else if (roll < pRaise && range) {
          const span = range.max - range.min;
          const wide = !passive && rng.nextInt(3) === 0;
          const amount = range.min + (wide ? rng.nextInt(span + 1) : rng.nextInt(Math.min(span, bb * 3) + 1));
          action = { type: legal.bet ? 'bet' : 'raise', amount };
        } else if (legal.allIn) action = { type: 'allIn' };
        else action = legal.canCheck ? { type: 'check' } : { type: 'call' };
        r = applyAction(st, id, action);
        st = r.state;
        evs = evs.concat(r.events);
        actions++;
        steps++;
        if (totalChips(st) !== total) problem(`fichas não conservadas: ${totalChips(st)} ≠ ${total}`);
        if (st.players.some((x) => x.stack < 0 || !Number.isInteger(x.stack))) problem('stack negativo ou fracionado');
        if (steps > 400) {
          problem('mão não termina');
          break;
        }
      }
      // Invariantes de fim de mão
      const res = st.hand!.result;
      if (!res) {
        problem('mão sem resultado');
        continue;
      }
      if (totalChips(st) !== total) problem('fichas não conservadas no fim da mão');
      if (st.players.some((x) => x.totalBet !== 0 || x.streetBet !== 0)) problem('sobrou aposta depois da mão');
      const netSum = Object.values(res.net).reduce((a, b) => a + b, 0);
      if (netSum !== 0) problem(`soma dos ganhos líquidos ≠ 0 (${netSum})`);
      const awarded = res.pots.reduce((a, pot) => a + pot.amount, 0);
      const paid = res.pots.reduce((a, pot) => a + pot.winners.reduce((x, w) => x + w.amount, 0), 0);
      if (awarded !== paid) problem('pote distribuído diferente do valor do pote');
      if (res.wentToShowdown && res.board.length !== 5) problem('showdown sem board completo');
      if (evs.filter((e) => e.type === 'handComplete').length !== 1) problem('handComplete ausente ou repetido');
      if (evs[0].type !== 'handStarted') problem('primeiro evento não é handStarted');
      if (res.wentToShowdown) stats.showdowns++;
      if (res.pots.length > 1) stats.sidePots++;
      if (res.pots.some((pot) => pot.winners.length > 1)) stats.splits++;
      if (evs.some((e) => e.type === 'allInRunout')) stats.runouts++;
      stats.eliminations += res.eliminated.length;
      stats.shortAllIns += res.actions.filter((a) => a.shortAllIn).length;
      stats.longestGame = Math.max(stats.longestGame, handsHere);
      if (st.phase === 'gameOver') {
        stats.gameOvers++;
        const alive = st.players.filter((x) => x.status !== 'eliminated');
        if (alive.length !== 1 || alive[0].stack !== total) problem('gameOver sem um único campeão com todas as fichas');
      }
    }
  }
  const ms = performance.now() - t0;
  eq(problems, 0, `${hands} mãos em ${tables} mesas sem violar invariantes`);
  check(illegalRejected > 0, 'ações ilegais foram recusadas');
  check(stats.sidePots > 100 && stats.runouts > 100 && stats.shortAllIns > 10 && stats.splits > 10, 'cobertura: side pots, runouts, all-ins curtos e splits apareceram');
  console.log(
    `  ${hands} mãos, ${actions} ações, ${tables} mesas em ${(ms / 1000).toFixed(1)} s` +
      ` | showdowns ${stats.showdowns}, side pots ${stats.sidePots}, splits ${stats.splits}, board corrido ${stats.runouts},` +
      ` all-ins curtos ${stats.shortAllIns}, eliminações ${stats.eliminations}, fins de jogo ${stats.gameOvers}, partida mais longa ${stats.longestGame} mãos,` +
      ` ilegais recusadas ${illegalRejected}`,
  );
}

// ---------------------------------------------------------------------------
// Equidade
// ---------------------------------------------------------------------------

section('Equidade — valores conhecidos');
{
  const rng = createRng('equity');
  const eqv = (hole: string, opponents: number, iterations = 30000, board = ''): number =>
    estimateEquity({ hole: c(hole), board: board ? c(board) : [], opponents, iterations, rng }).equity;
  const near = (v: number, target: number, tol: number, msg: string): void =>
    check(Math.abs(v - target) <= tol, `${msg}: ${(v * 100).toFixed(1)}% (esperado ~${(target * 100).toFixed(1)}%)`);
  near(eqv('As Ah', 1), 0.852, 0.012, 'AA x 1 aleatória');
  near(eqv('7c 2d', 1), 0.346, 0.012, '72o x 1 aleatória');
  near(eqv('As Ks', 1), 0.67, 0.012, 'AKs x 1 aleatória');
  near(eqv('As Ah', 4), 0.559, 0.015, 'AA x 4 aleatórias');
  eq(eqv('As Ah', 2, 2000, 'Ad Ac 2s 3h 9d'), 1, 'quadra de ases no river com board seco: 100%');
  const tie = estimateEquity({ hole: c('2c 3d'), board: c('As Ks Qs Js Ts'), opponents: 1, iterations: 2000, rng });
  eq([tie.tie, tie.equity], [1, 0.5], 'royal na mesa: sempre empate, equidade 50%');
  const kkVsAA = estimateEquity({
    hole: c('Ks Kh'),
    opponents: 1,
    iterations: 30000,
    rng,
    ranges: [{ combos: [c('Ac Ad'), c('Ac Ah'), c('Ac As'), c('Ad Ah'), c('Ad As'), c('Ah As')] as [Card, Card][] }],
  }).equity;
  near(kkVsAA, 0.18, 0.012, 'KK contra faixa {AA}');
  const dead = estimateEquity({ hole: c('As Ah'), opponents: 1, iterations: 20000, rng, deadCards: c('Ad Ac') }).equity;
  check(dead < 0.85, `cartas mortas (os outros dois ases) reduzem a equidade do AA: ${(dead * 100).toFixed(1)}%`);
  throws(() => estimateEquity({ hole: c('As As'), opponents: 1, iterations: 10, rng }), 'carta repetida na equidade lança erro');
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

section('Benchmarks');
{
  const rng = createRng('bench');
  const N = 1_000_000;
  const masks = new Int32Array(N * 4);
  const cardsList: Card[][] = [];
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let t = 0; t < N; t++) {
    for (let k = 0; k < 7; k++) {
      const j = k + rng.nextInt(52 - k);
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
      masks[t * 4 + (deck[k] & 3)] |= 1 << (deck[k] >> 2);
    }
    if (t < 200_000) cardsList.push(deck.slice(0, 7).map(cardFromIndex));
  }
  let sink = 0;
  for (let t = 0; t < 200_000; t++) sink ^= scoreMasks(masks[t * 4], masks[t * 4 + 1], masks[t * 4 + 2], masks[t * 4 + 3]); // aquecimento
  let t0 = performance.now();
  for (let t = 0; t < N; t++) sink ^= scoreMasks(masks[t * 4], masks[t * 4 + 1], masks[t * 4 + 2], masks[t * 4 + 3]);
  const msMasks = performance.now() - t0;
  t0 = performance.now();
  for (const h of cardsList) sink ^= scoreCards(h);
  const msCards = performance.now() - t0;
  t0 = performance.now();
  for (let t = 0; t < 100_000; t++) sink ^= evaluateHand(cardsList[t]).score;
  const msFull = performance.now() - t0;
  console.log(`  scoreMasks (núcleo, 7 cartas):     ${((N / msMasks) * 1000 / 1e6).toFixed(1)} M avaliações/s`);
  console.log(`  scoreCards (a partir de strings):  ${((200_000 / msCards) * 1000 / 1e6).toFixed(1)} M avaliações/s`);
  console.log(`  evaluateHand (com best5):          ${((100_000 / msFull) * 1000 / 1e6).toFixed(2)} M avaliações/s`);

  const runs = 30;
  for (const [hole, board, opps] of [
    ['As Kd', '', 1],
    ['As Kd', '', 3],
    ['As Kd', '', 5],
    ['Th 9h', 'Jh 8c 2h', 2],
  ] as [string, string, number][]) {
    const opts = { hole: c(hole), board: board ? c(board) : [], opponents: opps, iterations: 1000, rng };
    for (let i = 0; i < 30; i++) estimateEquity(opts); // aquecimento (JIT)
    t0 = performance.now();
    for (let i = 0; i < runs; i++) sink ^= estimateEquity(opts).win;
    const ms = (performance.now() - t0) / runs;
    console.log(`  equidade 1000 iterações, ${hole}${board ? ` / ${board}` : ''} x ${opps}: ${ms.toFixed(2)} ms`);
    check(ms < 25, `equidade (${opps} oponentes) abaixo de 25 ms neste computador`);
  }
  if (sink === 0.123) console.log(''); // evita que o otimizador descarte os laços
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} asserções ok, ${failed} falharam.`);
if (failed > 0) {
  console.log('\nFalhas:');
  for (const f of failures) console.log(`  - ${f}`);
  (globalThis as { process?: { exitCode?: number } }).process!.exitCode = 1;
}
