/**
 * O que o bot vê (SPEC §3.1): montado a partir de `publicView(game, botId)`, então nunca
 * carrega cartas fechadas dos outros nem o baralho. O tipo BotView garante a regra.
 */
import type { Card } from '../cards.ts';
import { getLegalActions, publicView } from '../engine.ts';
import { levelFor } from '../config.ts';
import type { BotView, PlayerId, RivalId } from '../types.ts';
import type { MatchStateX } from '../match/internal.ts';
import { extraCardsOf, revealedNow } from '../match/effects.ts';

export function buildBotView(st: MatchStateX, botId: RivalId): BotView {
  const g = st.game;
  const hand = g.hand;
  const legal = getLegalActions(g, botId);
  if (!hand || !legal) throw new Error(`buildBotView: não é a vez de ${botId}`);
  const pv = publicView(g, botId);
  const me = pv.players.find((p) => p.id === botId)!;
  const seatId = (seat: number): PlayerId => pv.players.find((p) => p.seat === seat)!.id;
  const revealedIds = st.revealed && st.revealed.hand === g.handNumber ? st.revealed.ids : [];
  const shownThisHand: Record<string, Card[]> = {};
  for (const p of pv.players) {
    if (p.id === botId) continue;
    if ((p.showCards || revealedIds.includes(p.id)) && p.holeCards.length === 2) shownThisHand[p.id] = p.holeCards.slice();
  }
  // cardsShown não marca showCards no motor: as cartas vêm do estado (já são públicas).
  for (const id of revealedIds) {
    if (id === botId || shownThisHand[id]) continue;
    const p = g.players.find((q) => q.id === id);
    if (p && p.holeCards.length === 2) shownThisHand[id] = p.holeCards.slice();
  }
  // Pôster Poker: cartas viradas por efeito (1 no reveal_one; 2 no 21). Já são públicas.
  for (const [id, cards] of Object.entries(revealedNow(st))) {
    if (id === botId || (shownThisHand[id] && shownThisHand[id].length >= cards.length)) continue;
    shownThisHand[id] = cards.slice();
  }
  const extraCards = extraCardsOf(st);
  const level = levelFor(g.handNumber, st.config.settings);
  return {
    selfId: botId,
    seat: me.seat,
    hole: [me.holeCards[0], me.holeCards[1]],
    street: hand.street,
    board: hand.board.slice(),
    pot: legal.pot,
    toCall: legal.toCall,
    stack: me.stack,
    streetBet: me.streetBet,
    legal,
    players: pv.players.map((p) => ({
      id: p.id,
      seat: p.seat,
      stack: p.stack,
      status: p.status,
      streetBet: p.streetBet,
      totalBet: p.totalBet,
      hasCards: p.status === 'active' || p.status === 'allIn',
    })),
    buttonId: seatId(hand.buttonSeat),
    sbId: seatId(hand.smallBlindSeat),
    bbId: seatId(hand.bigBlindSeat),
    blinds: { ...hand.blinds },
    handNumber: g.handNumber,
    actions: hand.actions.map((a) => ({ ...a })),
    shownThisHand,
    match: {
      holderId: st.holderId,
      captured: st.capturedHand !== null,
      alive: g.players.filter((p) => p.status !== 'eliminated').length,
      levelIndex: st.levelIndex,
      handsToNextLevel: level.handsLeft,
    },
    ...(extraCards.length > 0 ? { extraCards } : {}),
  };
}
