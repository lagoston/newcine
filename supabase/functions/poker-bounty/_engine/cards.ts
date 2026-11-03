// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/cards.ts
/**
 * Cartas como strings compactas ("As", "Td", "9c"): legíveis em log, baratas em
 * JSON e fáceis de comparar. Para o avaliador, cada carta também tem um índice
 * 0..51 = (rank - 2) * 4 + naipe, que permite montar bitmasks sem alocar nada.
 */

export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type RankChar = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = `${RankChar}${Suit}`;

/** Ordem dos naipes nos índices: espadas, copas, ouros, paus. */
export const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'];
export const RANK_CHARS: readonly RankChar[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

// Tabelas por código de caractere: transformar "Td" em índice vira duas leituras de array.
const RANK_CODE = new Int8Array(128).fill(-1);
const SUIT_CODE = new Int8Array(128).fill(-1);
RANK_CHARS.forEach((ch, i) => {
  RANK_CODE[ch.charCodeAt(0)] = i;
  RANK_CODE[ch.toLowerCase().charCodeAt(0)] = i;
});
SUITS.forEach((ch, i) => {
  SUIT_CODE[ch.charCodeAt(0)] = i;
  SUIT_CODE[ch.toUpperCase().charCodeAt(0)] = i;
});

const INDEX_TO_CARD: Card[] = [];
for (let r = 0; r < 13; r++) {
  for (let s = 0; s < 4; s++) INDEX_TO_CARD.push(`${RANK_CHARS[r]}${SUITS[s]}` as Card);
}

export function rankOf(card: Card): Rank {
  return (RANK_CODE[card.charCodeAt(0)] + 2) as Rank;
}

export function suitOf(card: Card): Suit {
  return card[1] as Suit;
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return `${RANK_CHARS[rank - 2]}${suit}` as Card;
}

/** Índice 0..51 da carta. Não valida (caminho rápido); use `isCard` antes se a origem não for confiável. */
export function cardIndex(card: Card): number {
  return RANK_CODE[card.charCodeAt(0)] * 4 + SUIT_CODE[card.charCodeAt(1)];
}

export function cardFromIndex(index: number): Card {
  const card = INDEX_TO_CARD[index];
  if (card === undefined) throw new RangeError(`Índice de carta inválido: ${index}`);
  return card;
}

/** Verifica o formato canônico exato ("As", nunca "as" ou "10s"). */
export function isCard(value: unknown): value is Card {
  return (
    typeof value === 'string' &&
    value.length === 2 &&
    RANK_CHARS.includes(value[0] as RankChar) &&
    SUITS.includes(value[1] as Suit)
  );
}

/**
 * Aceita entradas mais soltas ("as", "10h", "AH") e devolve a forma canônica.
 * Útil em testes, ferramentas de depuração e tutoriais.
 */
export function parseCard(text: string): Card {
  const t = text.trim();
  const rankPart = t.length === 3 && t.startsWith('10') ? 'T' : t.slice(0, t.length - 1);
  const suitPart = t[t.length - 1];
  if (rankPart.length !== 1 || suitPart === undefined) throw new Error(`Carta inválida: "${text}"`);
  const r = RANK_CODE[rankPart.charCodeAt(0)];
  const s = SUIT_CODE[suitPart.charCodeAt(0)];
  if (r === undefined || r < 0 || s === undefined || s < 0) throw new Error(`Carta inválida: "${text}"`);
  return INDEX_TO_CARD[r * 4 + s];
}

/** "As Kd 9c" ou ["As", "Kd"] → Card[]. */
export function parseCards(input: string | readonly string[]): Card[] {
  const parts = typeof input === 'string' ? input.split(/[\s,]+/).filter(Boolean) : input;
  return parts.map(parseCard);
}

/** Baralho novo e ordenado (2s, 2h, 2d, 2c, 3s, ...). Embaralhe com `Rng.shuffle`. */
export function fullDeck(): Card[] {
  return INDEX_TO_CARD.slice();
}

/** "A", "K", "10", "9"... (o 10 aparece por extenso na interface). */
export function rankLabel(rank: Rank): string {
  return rank === 10 ? '10' : RANK_CHARS[rank - 2];
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'h' || suit === 'd';
}

/** Rótulo para a interface: "A♠", "10♥". */
export function cardLabel(card: Card): string {
  return rankLabel(rankOf(card)) + SUIT_SYMBOLS[suitOf(card)];
}
