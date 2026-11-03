/**
 * O que a interface desenha (SPEC §4.4, `TableView`). Só cartas visíveis para a pessoa:
 * as dela, as do board e as abertas nesta mão (runout, showdown ou cardsShown).
 */
import type { Card } from '../cards.ts';
import { getLegalActions, getPots, potTotal } from '../engine.ts';
import { levelFor } from '../config.ts';
import type { MatchState, PlayerId, TableView } from '../types.ts';
import { HUMAN, isInHand, isRevealed, x } from './internal.ts';
import { effectsView, tournamentView } from './effects.ts';

function peopleView(st: ReturnType<typeof x>): NonNullable<TableView['people']> {
  const out: Record<string, NonNullable<TableView['people']>[PlayerId]> = {};
  for (const [id, ps] of Object.entries(st.people ?? {})) {
    out[id] = { status: ps.leaving && ps.status === 'playing' ? 'left' : ps.status, away: ps.away, streak: ps.streak, place: ps.place ?? null };
  }
  return out as NonNullable<TableView['people']>;
}

/**
 * `viewer` = a pessoa que vê (pacote E3: qualquer id de pessoa da mesa de amigos; as cartas
 * fechadas são só as dela). Para tratar "eu" como 'human' no aparelho, passe por povView.
 */
export function tableView(s: MatchState, viewer: PlayerId = HUMAN): TableView {
  const st = x(s);
  const g = st.game;
  const hand = g.hand;
  const betting = g.phase === 'betting' && !!hand;
  const toActId = betting ? (hand!.toActId as PlayerId | null) : null;
  return {
    mode: st.config.mode,
    handNumber: g.handNumber,
    level: levelFor(Math.max(1, g.handNumber), st.config.settings),
    status: st.status,
    seats: g.players.map((p) => {
      const visible = p.id === viewer || isRevealed(st, p);
      const holding = p.holeCards.length > 0 && isInHand(p);
      return {
        id: p.id,
        seat: p.seat,
        stack: p.stack,
        streetBet: p.streetBet,
        status: p.status,
        holeCards: visible ? (p.holeCards.slice() as Card[]) : [],
        hasHiddenCards: holding && !visible,
        isButton: g.buttonSeat === p.seat,
        isSB: !!hand && hand.smallBlindSeat === p.seat,
        isBB: !!hand && hand.bigBlindSeat === p.seat,
        tilt: st.bots[p.id]?.tilt?.kind ?? null,
        place: st.places[p.id] ?? null,
      };
    }),
    board: hand ? hand.board.slice() : [],
    pots: betting ? getPots(g).map((p) => ({ amount: p.amount, eligibleIds: p.eligibleIds.slice() })) : [],
    potTotal: betting ? potTotal(g) : 0,
    toActId,
    legal: toActId === viewer && st.status === 'running' && (!st.people || st.people[viewer]?.status === 'playing') ? getLegalActions(g, viewer) : null,
    prize: st.config.prize ? { prizeId: st.config.prize.prizeId, holderId: st.holderId, captured: st.capturedHand !== null } : null,
    loan: st.config.loan,
    places: { ...st.places },
    tournament: tournamentView(st),
    ...(st.people ? { people: peopleView(st), effects: effectsView(st) } : {}),
  };
}
