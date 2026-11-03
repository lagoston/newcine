// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/flags.ts
/**
 * Marcas da mão (SPEC §4.5, `HandFlags`), derivadas SÓ de dados públicos: ações, board,
 * mãos do showdown, cartas do runout e cartas mostradas por `cardsShown`.
 */
import type { Card } from '../cards.ts';
import type { HandResult } from '../engine.ts';
import type { HandFlags } from '../types.ts';
import { bucketOf, categoryOf, isAirShown } from '../bots/buckets.ts';
import { runoutOdds } from './odds.ts';

export interface PublicHandInfo {
  result: HandResult;
  bb: number;
  /** Cartas abertas no all-in e o board naquele momento. */
  runout: { board: Card[]; hands: { playerId: string; cards: Card[] }[] } | null;
  /** cardsShown desta mão (política de mostrar dos bots), antes do fim. */
  shownAfter: { playerId: string; cards: Card[]; afterFold: boolean }[];
}

export interface FlagsOut {
  flags: HandFlags;
  potTotal: number;
  /** Chances no momento do runout (para o Índice de sorte), ou null. */
  odds: Record<string, number> | null;
}

export function computeFlags(info: PublicHandInfo): FlagsOut {
  const { result, bb } = info;
  const flags: HandFlags = {};
  const potTotal = result.pots.reduce((a, p) => a + p.amount, 0);
  if (potTotal >= 20 * bb) flags.bigPot = true;

  const main = result.pots[0];
  const mainWinners = main ? main.winners.filter((w) => w.amount > 0).map((w) => w.playerId) : [];
  const aggr = [...result.actions].reverse().find((a) => a.type === 'bet' || a.type === 'raise') ?? null;

  let odds: Record<string, number> | null = null;
  if (info.runout && info.runout.hands.length >= 2) {
    odds = runoutOdds(info.runout.hands, info.runout.board);
    let victim: string | null = null;
    for (const h of info.runout.hands) if (victim === null || odds[h.playerId] > odds[victim]) victim = h.playerId;
    if (victim !== null && odds[victim] >= 0.75 && main && !mainWinners.includes(victim) && mainWinners.length > 0) {
      flags.badBeat = { victimId: victim, winnerId: mainWinners[0], victimOdds: odds[victim] };
    }
  }

  const board = result.board;
  if (!result.wentToShowdown) {
    // Blefe que funcionou e foi mostrado: quem levou é o último agressor e abriu "ar".
    const winner = result.winnerIds.length === 1 ? result.winnerIds[0] : null;
    const shown = winner ? info.shownAfter.find((s) => s.playerId === winner && !s.afterFold) : undefined;
    if (winner && aggr && aggr.playerId === winner && shown && isAirShown(shown.cards, board)) {
      flags.bluffShown = { playerId: winner };
    }
  } else {
    const byId: Record<string, HandResult['shown'][number]> = {};
    for (const s of result.shown) byId[s.playerId] = s;
    // Blefe pago: a última agressão foi no river (ou um all-in), quem apostou abriu "ar" e perdeu.
    if (aggr && (aggr.street === 'river' || aggr.allIn) && byId[aggr.playerId]
        && isAirShown(byId[aggr.playerId].cards, board) && !mainWinners.includes(aggr.playerId) && mainWinners.length > 0) {
      flags.bluffCaught = { blufferId: aggr.playerId, catcherId: mainWinners[0] };
    }
    // Valor escondido: venceu com trinca+ sem apostar nem aumentar antes do river.
    const w = mainWinners[0];
    if (w && byId[w] && byId[w].category >= 3
        && !result.actions.some((a) => a.playerId === w && a.street !== 'river' && (a.type === 'bet' || a.type === 'raise'))) {
      flags.valueShown = { playerId: w };
    }
  }
  // Largou e mostrou mão forte.
  for (const s of info.shownAfter) {
    if (!s.afterFold || board.length < 3) continue;
    const b = bucketOf(s.cards, board);
    if (b === 'nuts' || b === 'strong' || (b === 'medium' && categoryOf([...s.cards, ...board]) >= 1)) {
      flags.heroFold = { playerId: s.playerId };
      break;
    }
  }
  return { flags, potTotal, odds };
}
