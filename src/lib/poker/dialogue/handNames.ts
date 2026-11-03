/**
 * Nomes das mãos em pt-BR e en (SPEC §6.5, item 6).
 *
 * `describeHand` é a forma longa da linha "Você tem: …" ("dois pares, ases e setes").
 * `handPhrase` é a forma curta, com artigo, que entra no lugar de `{mao}` nas falas
 * ("uma trinca de setes"). As duas recalculam a ordem das cartas pelo avaliador, então
 * aceitam `best5` em qualquer ordem (e também 1 a 4 cartas, antes do flop).
 */
import type { Card, Rank, Suit } from '../cards.ts';
import { isCard, rankOf, suitOf } from '../cards.ts';
import type { HandKind } from '../evaluator.ts';
import { evaluateHand } from '../evaluator.ts';

export type Lang = 'pt' | 'en';

// Índice = posto (2..14). Plural para pares/trincas/quadras, singular para "até o …".
const PT_PLURAL: Record<number, string> = {
  2: 'dois', 3: 'três', 4: 'quatros', 5: 'cincos', 6: 'seis', 7: 'setes', 8: 'oitos',
  9: 'noves', 10: 'dez', 11: 'valetes', 12: 'damas', 13: 'reis', 14: 'ases',
};
const PT_SINGULAR: Record<number, string> = {
  2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito',
  9: 'nove', 10: 'dez', 11: 'valete', 12: 'dama', 13: 'rei', 14: 'ás',
};
const EN_PLURAL: Record<number, string> = {
  2: 'deuces', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes', 7: 'sevens', 8: 'eights',
  9: 'nines', 10: 'tens', 11: 'jacks', 12: 'queens', 13: 'kings', 14: 'aces',
};
const EN_SINGULAR: Record<number, string> = {
  2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight',
  9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace',
};
const PT_SUIT: Record<Suit, string> = { s: 'espadas', h: 'copas', d: 'ouros', c: 'paus' };
const EN_SUIT: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

/**
 * Cinco iguais (Pôster Poker, efeito Cassino: 8 ases a mais no baralho). A categoria ainda
 * não tem nome fixo no avaliador do pacote E; qualquer `kind` que comece com "five" vale.
 */
function isFiveKind(kind: HandKind): boolean {
  return String(kind).startsWith('five');
}

/** "até o nove" / "até a dama" (dama é a única carta feminina). */
function ptUpTo(rank: number): string {
  return `até ${rank === 12 ? 'a' : 'o'} ${PT_SINGULAR[rank]}`;
}

interface Shape {
  kind: HandKind;
  ranks: Rank[]; // postos na ordem de importância (grupo principal, depois kickers)
  top: Rank; // carta mais alta da sequência (5 na roda A-2-3-4-5)
  suit: Suit;
  royal: boolean;
}

/** Recalcula a forma da mão a partir das cartas (a ordem recebida não importa). */
function shapeOf(kind: HandKind, best5: readonly Card[], royalHint: boolean): Shape | null {
  if (!best5 || best5.length === 0) return null;
  let cards: Card[] = [...best5];
  let k: HandKind = kind;
  let royal = royalHint;
  try {
    const v = evaluateHand(cards, { repeats: true });   // Cassino: cartas repetidas
    cards = v.best5;
    // Confia no avaliador quando ele concorda com a categoria pedida; senão usa a pedida.
    if (v.kind === kind) royal = royal || v.royal;
    else k = kind;
  } catch {
    // cartas inválidas: usa a ordem recebida
  }
  const ranks = cards.map(rankOf);
  let top = ranks[0];
  if ((k === 'straight' || k === 'straight_flush') && ranks.includes(14) && ranks.includes(5) && !ranks.includes(13)) {
    top = 5;
  }
  return { kind: k, ranks, top, suit: suitOf(cards[0]), royal: royal || (k === 'straight_flush' && top === 14) };
}

/**
 * Forma longa, para "Você tem: …" e para os créditos.
 * pt: "par de damas", "dois pares, ases e setes", "sequência até o nove", "flush de copas".
 * en: "pair of queens", "two pair, aces and sevens", "straight, nine high", "flush in hearts".
 */
export function describeHand(kind: HandKind, best5: Card[], lang: Lang, royal = false): string {
  const s = shapeOf(kind, best5, royal);
  if (!s) return lang === 'pt' ? 'carta alta' : 'high card';
  const [r0, r1, r2, r3] = s.ranks;
  if (isFiveKind(kind)) return lang === 'pt' ? `cinco ${PT_PLURAL[r0]}` : `five ${EN_PLURAL[r0]}`;
  if (lang === 'pt') {
    switch (s.kind) {
      case 'high_card': return `carta alta, ${PT_SINGULAR[r0]}`;
      case 'pair': return `par de ${PT_PLURAL[r0]}`;
      case 'two_pair': return `dois pares, ${PT_PLURAL[r0]} e ${PT_PLURAL[r2 ?? r1]}`;
      case 'trips': return `trinca de ${PT_PLURAL[r0]}`;
      case 'straight': return `sequência ${ptUpTo(s.top)}`;
      case 'flush': return `flush de ${PT_SUIT[s.suit]}`;
      case 'full_house': return `full house, ${PT_PLURAL[r0]} e ${PT_PLURAL[r3 ?? r1]}`;
      case 'quads': return `quadra de ${PT_PLURAL[r0]}`;
      case 'straight_flush': return s.royal ? 'royal flush' : `straight flush ${ptUpTo(s.top)}`;
      default: return 'carta alta';
    }
  }
  switch (s.kind) {
    case 'high_card': return `${EN_SINGULAR[r0]} high`;
    case 'pair': return `pair of ${EN_PLURAL[r0]}`;
    case 'two_pair': return `two pair, ${EN_PLURAL[r0]} and ${EN_PLURAL[r2 ?? r1]}`;
    case 'trips': return `three ${EN_PLURAL[r0]}`;
    case 'straight': return `straight, ${EN_SINGULAR[s.top]} high`;
    case 'flush': return `flush in ${EN_SUIT[s.suit]}`;
    case 'full_house': return `full house, ${EN_PLURAL[r0]} over ${EN_PLURAL[r3 ?? r1]}`;
    case 'quads': return `four ${EN_PLURAL[r0]}`;
    case 'straight_flush': return s.royal ? 'royal flush' : `straight flush, ${EN_SINGULAR[s.top]} high`;
    default: return 'high card';
  }
}

/**
 * Forma curta com artigo, para `{mao}` dentro das falas ("Larguei {mao}.").
 * pt: "um par de damas", "dois pares", "uma trinca de setes", "uma sequência".
 * en: "a pair of queens", "two pair", "three sevens", "a straight".
 */
export function handPhrase(kind: HandKind, best5: Card[], lang: Lang, royal = false): string {
  const s = shapeOf(kind, best5, royal);
  if (!s) return lang === 'pt' ? 'carta alta' : 'high card';
  const r0 = s.ranks[0];
  if (isFiveKind(kind)) return lang === 'pt' ? `cinco ${PT_PLURAL[r0]}` : `five ${EN_PLURAL[r0]}`;
  if (lang === 'pt') {
    switch (s.kind) {
      case 'high_card': return 'carta alta';
      case 'pair': return `um par de ${PT_PLURAL[r0]}`;
      case 'two_pair': return 'dois pares';
      case 'trips': return `uma trinca de ${PT_PLURAL[r0]}`;
      case 'straight': return 'uma sequência';
      case 'flush': return 'um flush';
      case 'full_house': return 'um full house';
      case 'quads': return `uma quadra de ${PT_PLURAL[r0]}`;
      case 'straight_flush': return s.royal ? 'um royal flush' : 'um straight flush';
      default: return 'carta alta';
    }
  }
  switch (s.kind) {
    case 'high_card': return `${EN_SINGULAR[r0]} high`;
    case 'pair': return `a pair of ${EN_PLURAL[r0]}`;
    case 'two_pair': return 'two pair';
    case 'trips': return `three ${EN_PLURAL[r0]}`;
    case 'straight': return 'a straight';
    case 'flush': return 'a flush';
    case 'full_house': return 'a full house';
    case 'quads': return `four ${EN_PLURAL[r0]}`;
    case 'straight_flush': return s.royal ? 'a royal flush' : 'a straight flush';
    default: return 'high card';
  }
}

/** Maior `handPhrase` possível por idioma (é o peso de `{mao}` na conta dos 88 caracteres). */
export function longestHandPhrase(lang: Lang): number {
  const pl = lang === 'pt' ? PT_PLURAL : EN_PLURAL;
  const sg = lang === 'pt' ? PT_SINGULAR : EN_SINGULAR;
  const longestPl = Math.max(...Object.values(pl).map((x) => x.length));
  const longestSg = Math.max(...Object.values(sg).map((x) => x.length));
  const fixed = lang === 'pt'
    ? ['carta alta', 'dois pares', 'uma sequência', 'um flush', 'um full house', 'um royal flush', 'um straight flush']
    : ['two pair', 'a straight', 'a flush', 'a full house', 'a royal flush', 'a straight flush'];
  const withRank = lang === 'pt'
    ? ['um par de ', 'uma trinca de ', 'uma quadra de '].map((p) => p.length + longestPl)
    : ['a pair of ', 'three ', 'four '].map((p) => p.length + longestPl).concat([longestSg + ' high'.length]);
  const five = (lang === 'pt' ? 'cinco ' : 'five ').length + longestPl;
  return Math.max(...fixed.map((x) => x.length), ...withRank, five);
}

// ---------------------------------------------------------------------------
// Pôster Poker (03/11/2026): {alvo} e {carta}
// ---------------------------------------------------------------------------

const PT_TARGET: Record<string, string> = {
  high_card: 'carta alta', pair: 'um par', two_pair: 'dois pares', trips: 'uma trinca', straight: 'uma sequência',
  flush: 'um flush', full_house: 'um full house', quads: 'uma quadra', straight_flush: 'um straight flush',
};
const EN_TARGET: Record<string, string> = {
  high_card: 'high card', pair: 'a pair', two_pair: 'two pair', trips: 'three of a kind', straight: 'a straight',
  flush: 'a flush', full_house: 'a full house', quads: 'four of a kind', straight_flush: 'a straight flush',
};

/** A jogada-alvo do Rain Man, sem posto: "uma trinca" / "three of a kind". */
export function targetPhrase(kind: HandKind, lang: Lang): string {
  if (isFiveKind(kind)) return lang === 'pt' ? 'cinco iguais' : 'five of a kind';
  return (lang === 'pt' ? PT_TARGET : EN_TARGET)[kind] ?? String(kind);
}

export function longestTargetPhrase(lang: Lang): number {
  return Math.max(...Object.values(lang === 'pt' ? PT_TARGET : EN_TARGET).map((x) => x.length), (lang === 'pt' ? 'cinco iguais' : 'five of a kind').length);
}

/** Uma carta com artigo: "o valete de espadas", "a dama de copas" / "the jack of spades". */
export function cardPhrase(card: Card, lang: Lang): string {
  if (!isCard(card)) return String(card);
  const r = rankOf(card);
  const s = suitOf(card);
  if (lang === 'pt') return `${r === 12 ? 'a' : 'o'} ${PT_SINGULAR[r]} de ${PT_SUIT[s]}`;
  return `the ${EN_SINGULAR[r]} of ${EN_SUIT[s]}`;
}

export function longestCardPhrase(lang: Lang): number {
  const sg = lang === 'pt' ? PT_SINGULAR : EN_SINGULAR;
  const su = lang === 'pt' ? PT_SUIT : EN_SUIT;
  const r = Math.max(...Object.values(sg).map((x) => x.length));
  const s = Math.max(...Object.values(su).map((x) => x.length));
  return (lang === 'pt' ? 'o  de '.length : 'the  of '.length) + r + s;
}
