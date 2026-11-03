/**
 * O que a mesa diz em texto (leitor de tela e "Roteiro da mesa", SPEC §7.10):
 * "Sapo paga 40.", "Flop: ás de copas, sete de paus, sete de ouros.".
 */
import type { TFunction } from 'i18next';
import type { PlayerId, PublicEvent } from '../types.ts';
import type { TableShow } from './display.ts';
import { cardsName, describeHand, fmt, type Lang } from './format.ts';

export function whoName(t: TFunction, id: PlayerId | null | undefined): string {
  if (!id) return '';
  if (id === 'human') return t('poker.table.you');
  return t(`poker.oracles.${id}.short`, { defaultValue: id });
}

/** Com artigo: "a Cobra", "O Raposo", "pelo Sapo" (pt) / "the Snake" (en). */
export function theName(t: TFunction, id: PlayerId | null | undefined, form: 'the' | 'The' | 'by' = 'the'): string {
  if (!id) return '';
  return t(`poker.oracles.${id}.${form}`, { defaultValue: whoName(t, id) });
}

export function blindsText(t: TFunction, lang: Lang, sb: number, bb: number, ante: number): string {
  return ante > 0
    ? t('poker.table.blindsAnte', { sb: fmt(sb, lang), bb: fmt(bb, lang), ante: fmt(ante, lang) })
    : t('poker.table.blinds', { sb: fmt(sb, lang), bb: fmt(bb, lang) });
}

/** Frase de um evento, ou null quando ele não merece ser lido. */
export function narrate(t: TFunction, lang: Lang, e: PublicEvent, table: TableShow): string | null {
  const n = (x: number) => fmt(x, lang);
  switch (e.t) {
    case 'handStarted':
      return t('poker.narrate.hand', { n: e.handNumber, who: whoName(t, e.buttonId) });
    case 'holeCards':
      return t('poker.narrate.holeCards', { cards: cardsName(e.cards, lang) });
    case 'action': {
      const who = whoName(t, e.playerId);
      if (e.allIn && e.action !== 'fold' && e.action !== 'check') return t('poker.narrate.allIn', { who, amount: n(e.to) });
      if (e.action === 'fold') return t('poker.narrate.fold', { who });
      if (e.action === 'check') return t('poker.narrate.check', { who });
      if (e.action === 'call') return t('poker.narrate.call', { who, amount: n(e.amount) });
      if (e.action === 'bet') return t('poker.narrate.bet', { who, amount: n(e.to) });
      return t('poker.narrate.raise', { who, amount: n(e.to) });
    }
    case 'street':
      return t(`poker.narrate.${e.street}`, { cards: cardsName(e.cards, lang) });
    case 'showdown':
      return e.hands
        .map((h) => t('poker.narrate.showdown', { who: whoName(t, h.playerId), cards: cardsName(h.cards, lang), hand: describeHand(h.kind, h.best5, lang, h.royal) }))
        .join(' ');
    case 'cardsShown':
      return t('poker.narrate.shows', { who: whoName(t, e.playerId), cards: cardsName(e.cards, lang) });
    case 'potAwarded':
      return e.winners.map((w) => t('poker.narrate.pot', { who: whoName(t, w.playerId), amount: n(w.amount) })).join(' ');
    case 'eliminated':
      return t('poker.narrate.eliminated', { who: whoName(t, e.playerId), place: e.place });
    case 'prizeMoved':
      return t('poker.narrate.prizeMoved', { who: whoName(t, e.toId) });
    case 'prizeCaptured':
      return t('poker.narrate.prizeCaptured');
    case 'headsUp':
      return t('poker.narrate.headsUp', { a: whoName(t, e.ids[0]), b: whoName(t, e.ids[1]) });
    case 'levelUp':
      return t('poker.narrate.levelUp', { blinds: blindsText(t, lang, e.level.sb, e.level.bb, e.level.ante) });
    case 'matchEnded':
      return e.humanPlace === 1 ? t('poker.narrate.won') : t('poker.narrate.ended', { place: e.humanPlace });
    default:
      void table;
      return null;
  }
}


/** A mesa inteira em uma frase (tecla T, §7.10). */
export function readTable(t: TFunction, lang: Lang, table: TableShow): string {
  const parts: string[] = [];
  parts.push(t('poker.table.hand', { n: table.handNumber }) + '. ' + blindsText(t, lang, table.level.sb, table.level.bb, table.level.ante) + '.');
  if (table.board.length) parts.push(t('poker.narrate.board', { cards: cardsName(table.board, lang) }));
  parts.push(t('poker.narrate.potIs', { amount: fmt(table.potTotal, lang) }));
  table.seats.forEach((s) => {
    const who = whoName(t, s.id);
    if (s.status === 'eliminated') parts.push(t('poker.narrate.seatOut', { who, place: s.place ?? '' }));
    else parts.push(t('poker.narrate.seat', { who, stack: fmt(s.stack, lang), bet: fmt(s.bet, lang) }) + (s.status === 'folded' ? ` ${t('poker.table.folded')}.` : ''));
  });
  const me = table.seats.find((s) => s.id === 'human');
  if (me && me.cards.length === 2) parts.push(t('poker.narrate.holeCards', { cards: cardsName(me.cards, lang) }));
  return parts.join(' ');
}
