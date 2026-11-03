/**
 * Formatação para a mesa: números (sempre tabulares, nunca em Cinzel), nomes de
 * carta para o leitor de tela e o nome da mão ("Você tem: …").
 */
import type { Card } from '../cards.ts';
import { rankOf, suitOf } from '../cards.ts';
import type { HandKind } from '../evaluator.ts';
import { evaluateHand } from '../evaluator.ts';
import { describeHand as describeB } from '../dialogue/handNames.ts';

export type Lang = 'pt' | 'en';

export const langOf = (language: string | undefined): Lang => (language && language.startsWith('pt') ? 'pt' : 'en');

const fmtCache: Partial<Record<Lang, Intl.NumberFormat>> = {};
/** 1.240 em pt, 1,240 em en. */
export function fmt(n: number, lang: Lang): string {
  const f = (fmtCache[lang] ??= new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 }));
  return f.format(Math.round(n));
}

const RANK_PT: Record<number, string> = {
  2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
  11: 'valete', 12: 'dama', 13: 'rei', 14: 'ás',
};
const RANK_EN: Record<number, string> = {
  2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
  11: 'jack', 12: 'queen', 13: 'king', 14: 'ace',
};
const RANK_PT_PLURAL: Record<number, string> = {
  2: 'dois', 3: 'três', 4: 'quatros', 5: 'cincos', 6: 'seis', 7: 'setes', 8: 'oitos', 9: 'noves', 10: 'dez',
  11: 'valetes', 12: 'damas', 13: 'reis', 14: 'ases',
};
const RANK_EN_PLURAL: Record<number, string> = {
  2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes', 7: 'sevens', 8: 'eights', 9: 'nines', 10: 'tens',
  11: 'jacks', 12: 'queens', 13: 'kings', 14: 'aces',
};
const SUIT_PT = { s: 'espadas', h: 'copas', d: 'ouros', c: 'paus' } as const;
const SUIT_EN = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const;

/** "ás de copas" / "ace of hearts". */
export function cardName(card: Card, lang: Lang): string {
  const r = rankOf(card);
  const s = suitOf(card);
  return lang === 'pt' ? `${RANK_PT[r]} de ${SUIT_PT[s]}` : `${RANK_EN[r]} of ${SUIT_EN[s]}`;
}

export function cardsName(cards: Card[], lang: Lang): string {
  return cards.map((c) => cardName(c, lang)).join(', ');
}

const KIND_PT: Record<HandKind, string> = {
  high_card: 'carta alta', pair: 'par', two_pair: 'dois pares', trips: 'trinca', straight: 'sequência',
  flush: 'flush', full_house: 'full house', quads: 'quadra', straight_flush: 'straight flush',
  five_kind: 'cinco iguais', // 03/11/2026: só com os 8 ases a mais do Cassino
};
const KIND_EN: Record<HandKind, string> = {
  high_card: 'high card', pair: 'a pair', two_pair: 'two pair', trips: 'three of a kind', straight: 'a straight',
  flush: 'a flush', full_house: 'a full house', quads: 'four of a kind', straight_flush: 'a straight flush',
  five_kind: 'five of a kind',
};

/**
 * Plano B do `describeHand` do pacote B (dialogue/handNames.ts): "dois pares, ases e
 * setes" / "two pair, aces and sevens". A interface prefere a do B quando ela existe.
 */
export function describeHandFallback(kind: HandKind, best5: Card[], lang: Lang, royal = false): string {
  const pt = lang === 'pt';
  if (royal) return 'royal flush';
  const ranks = best5.map(rankOf);
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(([r]) => r);
  const pl = pt ? RANK_PT_PLURAL : RANK_EN_PLURAL;
  const one = pt ? RANK_PT : RANK_EN;
  const base = pt ? KIND_PT[kind] : KIND_EN[kind];
  switch (kind) {
    case 'pair':
      return pt ? `par de ${pl[groups[0]]}` : `a pair of ${pl[groups[0]]}`;
    case 'two_pair':
      return pt ? `dois pares, ${pl[groups[0]]} e ${pl[groups[1]]}` : `two pair, ${pl[groups[0]]} and ${pl[groups[1]]}`;
    case 'trips':
      return pt ? `trinca de ${pl[groups[0]]}` : `three ${pl[groups[0]]}`;
    case 'quads':
      return pt ? `quadra de ${pl[groups[0]]}` : `four ${pl[groups[0]]}`;
    case 'five_kind':
      return pt ? `cinco ${pl[groups[0]]}` : `five ${pl[groups[0]]}`;
    case 'full_house':
      return pt ? `full house, ${pl[groups[0]]} com ${pl[groups[1]]}` : `a full house, ${pl[groups[0]]} over ${pl[groups[1]]}`;
    case 'straight':
    case 'straight_flush': {
      const top = ranks.includes(14) && ranks.includes(5) && !ranks.includes(13) ? 5 : Math.max(...ranks);
      return pt ? `${base} até o ${one[top]}` : `${base}, ${one[top]} high`;
    }
    case 'flush':
      return pt ? `flush, ${one[Math.max(...ranks)]} alto` : `a flush, ${one[Math.max(...ranks)]} high`;
    default:
      return pt ? `${one[Math.max(...ranks)]} alto` : `${one[Math.max(...ranks)]} high`;
  }
}

// O nome da mão vem do pacote B (dialogue/handNames.ts, o mesmo das falas), com o
// plano B local se ele falhar. 03/11/2026: import estático, o módulo é pequeno e
// assim a primeira mão já sai com o nome certo.
export function describeHand(kind: HandKind, best5: Card[], lang: Lang, royal = false): string {
  try {
    return describeB(kind, best5, lang, royal);
  } catch {
    return describeHandFallback(kind, best5, lang, royal);
  }
}

/** "Você tem: …": a melhor mão com o board aberto; antes do flop, o par ou as duas cartas. */
export function whatYouHave(hole: Card[], board: Card[], lang: Lang): { text: string; kind: HandKind; best5: Card[] } | null {
  if (hole.length !== 2) return null;
  if (board.length >= 3) {
    // repeats: com os 8 ases do Cassino a mesma carta pode aparecer duas vezes (E, 03/11/2026).
    const v = evaluateHand([...hole, ...board], { repeats: true });
    return { text: describeHand(v.kind, v.best5, lang, v.royal), kind: v.kind, best5: v.best5 };
  }
  const [a, b] = hole.map(rankOf);
  if (a === b) {
    const pl = lang === 'pt' ? RANK_PT_PLURAL : RANK_EN_PLURAL;
    return { text: lang === 'pt' ? `par de ${pl[a]}` : `a pair of ${pl[a]}`, kind: 'pair', best5: hole };
  }
  const one = lang === 'pt' ? RANK_PT : RANK_EN;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const suited = suitOf(hole[0]) === suitOf(hole[1]);
  const text = lang === 'pt'
    ? `${one[hi]} e ${one[lo]}${suited ? ' do mesmo naipe' : ''}`
    : `${one[hi]}-${one[lo]}${suited ? ' suited' : ''}`;
  return { text, kind: 'high_card', best5: hole };
}

/** Tempo até a troca do prêmio ("5 h 12 min"). */
export function timeLeft(endsAt: string, now: number, lang: Lang): string {
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  // 03/11/2026 (torneio semanal): com mais de um dia, dias e horas ("2 d 5 h").
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h <= 0) return lang === 'pt' ? `${m} min` : `${m} min`;
  return lang === 'pt' ? `${h} h ${m} min` : `${h} h ${m} min`;
}

/** "o Baralho Noir" / "the Noir Deck": o nome do prêmio com artigo, no meio da frase. */
export function prizeWithArticle(p: { name_pt: string; name_en: string; article_pt?: string | null }, lang: Lang): string {
  if (lang === 'en') return `the ${p.name_en}`;
  return p.article_pt ? `${p.article_pt} ${p.name_pt}` : p.name_pt;
}

/** Cinzel só em letreiro sem número (o "1" dela vira "I", §7.12); com dígito, sans. */
export const displayFont = (text: string): string => (/\d/.test(text) ? 'pk-sans font-extrabold tracking-wide uppercase' : 'pk-display');
