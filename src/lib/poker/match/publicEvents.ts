/**
 * Eventos privados → públicos (SPEC §4.5). Tudo que sai para a interface ou para a rede
 * passa por aqui: só as cartas da pessoa, as do board e as abertas (runout, showdown,
 * cardsShown); nada de score, bucket, equidade, baralho ou semente (menos a semente
 * revelada no `matchEnded` do prêmio). `i` é o mesmo número do evento privado.
 */
import type { Card } from '../cards.ts';
import type { MatchEvent, PlayerId, PublicEvent } from '../types.ts';
import type { HandStartedX } from './internal.ts';

type MetaEvent = Extract<MatchEvent, { type: 'actionMeta' }>;

function fill<T>(ids: string[], get: (id: string) => T | undefined, dflt: T): Record<PlayerId, T> {
  const out: Record<string, T> = {};
  for (const id of ids) out[id] = get(id) ?? dflt;
  return out as Record<PlayerId, T>;
}

export function toPublicEvents(ev: MatchEvent[], viewer: 'human'): PublicEvent[] {
  const out: PublicEvent[] = [];
  let meta: MetaEvent | null = null;
  for (const e of ev) {
    const i = e.i;
    switch (e.type) {
      case 'matchStarted':
        out.push({
          i, t: 'matchStarted', mode: e.mode, seats: e.seats.map((s) => ({ ...s })), loan: e.loan,
          prize: e.prize ? { ...e.prize } : null, level: { ...e.level, next: e.level.next ? { ...e.level.next } : null },
          ...(e.seedHash ? { seedHash: e.seedHash } : {}),
        });
        break;
      case 'levelUp':
        out.push({ i, t: 'levelUp', level: { ...e.level, next: e.level.next ? { ...e.level.next } : null }, handNumber: e.handNumber });
        break;
      case 'handStarted': {
        const hx = e as unknown as HandStartedX & { i: number };
        out.push({
          i, t: 'handStarted', handNumber: e.handNumber, buttonId: e.buttonPlayerId, sbId: e.smallBlindPlayerId,
          bbId: e.bigBlindPlayerId, level: { ...hx.level, next: hx.level.next ? { ...hx.level.next } : null },
          stacks: fill(e.players.map((p) => p.playerId), (id) => e.players.find((p) => p.playerId === id)?.stack, 0),
        });
        break;
      }
      case 'blindsPosted':
        out.push({
          i, t: 'blindsPosted', antes: e.antes.map((a) => ({ ...a })), sb: { ...e.smallBlind }, bb: { ...e.bigBlind },
          potAfter: e.potAfter, allInIds: e.allInPlayerIds.slice(),
        });
        break;
      case 'holeCardsDealt': {
        const mine = e.hands.find((h) => h.playerId === viewer);
        if (mine && mine.cards.length === 2) out.push({ i, t: 'holeCards', cards: [mine.cards[0], mine.cards[1]] });
        break;
      }
      case 'actionMeta':
        meta = e;
        break;
      case 'actionTaken': {
        const m = meta && meta.playerId === e.playerId ? meta : null;
        meta = null;
        out.push({
          i, t: 'action', playerId: e.playerId, street: e.street, action: e.action, amount: e.amount, to: e.to,
          toCall: e.toCall, potAfter: e.potAfter, allIn: e.allIn, shortAllIn: e.shortAllIn,
          stackBefore: m ? m.stackBefore : e.amount, sizeClass: m ? m.sizeClass : null,
          ...(m?.bot ? { thinkMs: m.bot.thinkMs, cue: m.bot.cue } : {}),
        });
        break;
      }
      case 'uncalledBetReturned':
        out.push({ i, t: 'uncalledReturned', playerId: e.playerId, amount: e.amount });
        break;
      case 'allInRunout':
        out.push({ i, t: 'runout', hands: e.hands.map((h) => ({ playerId: h.playerId, cards: h.cards.slice() })) });
        break;
      case 'streetDealt':
        out.push({ i, t: 'street', street: e.street, cards: e.cards.slice(), board: e.board.slice() });
        break;
      case 'showdown':
        out.push({
          i, t: 'showdown',
          hands: e.hands.map((h) => ({ playerId: h.playerId, cards: h.cards.slice(), kind: h.kind, best5: h.best5.slice(), royal: h.royal })),
        });
        break;
      case 'cardsShown':
        out.push({ i, t: 'cardsShown', playerId: e.playerId, cards: [e.cards[0], e.cards[1]] as [Card, Card], afterFold: e.afterFold });
        break;
      case 'potAwarded':
        out.push({
          i, t: 'potAwarded', potIndex: e.potIndex, amount: e.amount, eligibleIds: e.eligibleIds.slice(),
          winners: e.winners.map((w) => ({ playerId: w.playerId, amount: w.amount })), uncontested: e.uncontested, kind: e.kind,
        });
        break;
      case 'handSummary':
        out.push({
          i, t: 'handComplete', handNumber: e.handNumber, net: { ...e.net }, winnerIds: e.winnerIds.slice(),
          wentToShowdown: e.wentToShowdown, potBB: e.potBB, flags: JSON.parse(JSON.stringify(e.flags)),
        });
        break;
      case 'eliminated':
        out.push({ i, t: 'eliminated', playerId: e.playerId, place: e.place, byId: e.byId, handNumber: e.handNumber });
        break;
      case 'prizeMoved':
        out.push({ i, t: 'prizeMoved', fromId: e.fromId, toId: e.toId, handNumber: e.handNumber });
        break;
      case 'prizeCaptured':
        out.push({ i, t: 'prizeCaptured', handNumber: e.handNumber, prizeId: e.prizeId });
        break;
      case 'tilt':
        out.push({ i, t: 'tilt', playerId: e.playerId, kind: e.kind, on: e.on, ...(e.targetId ? { targetId: e.targetId } : {}) });
        break;
      case 'styleRead':
        out.push({ i, t: 'styleRead', by: e.by, targetId: e.targetId, label: e.label });
        break;
      case 'headsUp':
        out.push({ i, t: 'headsUp', ids: [e.ids[0], e.ids[1]], handNumber: e.handNumber });
        break;
      case 'matchEnded':
        out.push({
          i, t: 'matchEnded', places: { ...e.places }, winnerId: e.winnerId, humanPlace: e.humanPlace, reason: e.reason,
          prizeCaptured: e.prizeCaptured, ...(e.seed ? { seed: e.seed } : {}),
        });
        break;
      default:
        // playerEliminated, handComplete e gameOver do motor: substituídos pelos da partida.
        break;
    }
  }
  return out;
}
