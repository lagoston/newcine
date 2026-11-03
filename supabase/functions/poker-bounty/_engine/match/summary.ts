// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/summary.ts
/**
 * Números da pessoa (`HumanTally`, atualizado ao fim de cada mão com informação privada)
 * e o resumo da partida para o placar (`summarizeMatch`, SPEC §4.4, §2.9 e §5.3).
 */
import type { Card } from '../cards.ts';
import type { HandResult } from '../engine.ts';
import { evaluateHand, scoreCardsAny } from '../evaluator.ts';
import type { HandFlags, HumanTally, MatchState, MatchSummary, PlayerId } from '../types.ts';
import { isAirShown } from '../bots/buckets.ts';
import { HUMAN, x } from './internal.ts';

/** Até o pacote C gerar `engineHash.ts`, quem chama sobrescreve `engineHash` no resumo. */
export const ENGINE_HASH_UNSET = 'unset';

export function emptyTally(startStackBB: number): HumanTally {
  return {
    hands: 0, vpip: 0, pfr: 0, aggrBets: 0, aggrCalls: 0,
    cbetOpp: 0, cbet: 0, foldToCbetOpp: 0, foldToCbet: 0,
    showdowns: 0, showdownsWon: 0, handsWon: 0,
    allinCount: 0, allinWon: 0, allinExpectedMilli: 0,
    bluffsWorked: 0, oscarBluff: false, badBeatsSuffered: 0, badBeatsDealt: 0,
    biggestPot: 0, bestHand: null,
    minStackBB: Math.round(startStackBB * 100) / 100, eliminations: [],
  };
}

export interface TallyInput {
  result: HandResult;
  bb: number;
  /** Cartas fechadas de todos que receberam cartas (privado; só para a pessoa e o Blefe de Oscar). */
  holes: Record<string, Card[]>;
  flags: HandFlags;
  potTotal: number;
  /** Chances no runout (se houve). */
  odds: Record<string, number> | null;
  humanStackAfter: number;
  eliminations: { victimId: PlayerId; byId: PlayerId | null; hand: number }[];
  /** Pôster Poker: o que a casa somou ao pote da pessoa (Dinheiro dobrado). */
  potBonus?: number;
  /** Pôster Poker: o baralho tem cartas repetidas (Cassino). */
  repeats?: boolean;
}

/** Atualiza o tally (no lugar). */
export function updateTally(t: HumanTally, inp: TallyInput): void {
  const { result } = inp;
  for (const e of inp.eliminations) t.eliminations.push({ ...e });
  if (result.startStacks[HUMAN] === undefined) return;
  const mine = inp.holes[HUMAN] ?? [];
  const acts = result.actions;
  const board = result.board;
  t.hands += 1;

  const pre = acts.filter((a) => a.street === 'preflop');
  if (pre.some((a) => a.playerId === HUMAN && (a.type === 'call' || a.type === 'bet' || a.type === 'raise'))) t.vpip += 1;
  if (pre.some((a) => a.playerId === HUMAN && (a.type === 'bet' || a.type === 'raise'))) t.pfr += 1;
  for (const a of acts) {
    if (a.playerId !== HUMAN || a.street === 'preflop') continue;
    if (a.type === 'bet' || a.type === 'raise') t.aggrBets += 1;
    else if (a.type === 'call') t.aggrCalls += 1;
  }

  // C-bet: quem deu o último aumento antes do flop aposta primeiro no flop.
  const pfAggr = [...pre].reverse().find((a) => a.type === 'bet' || a.type === 'raise')?.playerId ?? null;
  const flop = acts.filter((a) => a.street === 'flop');
  if (pfAggr && flop.length > 0) {
    const firstBet = flop.findIndex((a) => a.type === 'bet' || a.type === 'raise');
    if (pfAggr === HUMAN) {
      const mineIdx = flop.findIndex((a) => a.playerId === HUMAN);
      if (mineIdx >= 0 && (firstBet < 0 || firstBet >= mineIdx)) {
        t.cbetOpp += 1;
        if (flop[mineIdx].type === 'bet') t.cbet += 1;
      }
    } else if (firstBet >= 0 && flop[firstBet].playerId === pfAggr && flop[firstBet].type === 'bet') {
      const reply = flop.slice(firstBet + 1).find((a) => a.playerId === HUMAN);
      const raisedBefore = reply ? flop.slice(firstBet + 1, flop.indexOf(reply)).some((a) => a.type === 'raise') : true;
      if (reply && !raisedBefore) {
        t.foldToCbetOpp += 1;
        if (reply.type === 'fold') t.foldToCbet += 1;
      }
    }
  }

  const won = result.winnerIds.includes(HUMAN);
  if (won) t.handsWon += 1;
  if (result.wentToShowdown && result.shown.some((s) => s.playerId === HUMAN)) {
    t.showdowns += 1;
    if (won) t.showdownsWon += 1;
  }

  const main = result.pots[0];
  const mainWinners = main ? main.winners.filter((w) => w.amount > 0).map((w) => w.playerId) : [];
  if (inp.odds && inp.odds[HUMAN] !== undefined) {
    t.allinCount += 1;
    t.allinExpectedMilli += Math.round(inp.odds[HUMAN] * 1000);
    if (mainWinners.length === 1 && mainWinners[0] === HUMAN) t.allinWon += 1;
  }

  const lastAggr = [...acts].reverse().find((a) => a.type === 'bet' || a.type === 'raise')?.playerId ?? null;
  const soleWinner = result.winnerIds.length === 1 && result.winnerIds[0] === HUMAN;
  if (!result.wentToShowdown && soleWinner && mine.length === 2 && board.length >= 3) {
    if (lastAggr === HUMAN && isAirShown(mine, board)) t.bluffsWorked += 1;
    // Blefe de Oscar: pote ≥ 20 BB sem showdown e alguém que largou tinha mão melhor no board.
    if (inp.potTotal >= 20 * inp.bb) {
      const myScore = scoreCardsAny([...mine, ...board]);
      const folders = new Set(acts.filter((a) => a.type === 'fold' && a.playerId !== HUMAN).map((a) => a.playerId));
      for (const id of folders) {
        const h = inp.holes[id];
        if (h && h.length === 2 && scoreCardsAny([...h, ...board]) > myScore) {
          t.oscarBluff = true;
          break;
        }
      }
    }
  }

  if (inp.flags.badBeat?.victimId === HUMAN) t.badBeatsSuffered += 1;
  if (inp.flags.badBeat?.winnerId === HUMAN) t.badBeatsDealt += 1;

  let gross = 0;
  for (const p of result.pots) for (const w of p.winners) if (w.playerId === HUMAN) gross += w.amount;
  gross += inp.potBonus ?? 0;   // o pote dobrado pela casa conta inteiro
  if (gross > t.biggestPot) t.biggestPot = gross;

  const folded = acts.some((a) => a.playerId === HUMAN && a.type === 'fold');
  // board de 5, ou de 6 no river de 2 cartas (Onze Homens)
  if (!folded && mine.length === 2 && board.length >= 5) {
    const v = evaluateHand([...mine, ...board], { repeats: inp.repeats === true });
    if (!t.bestHand || v.score > t.bestHand.score) t.bestHand = { cards: v.best5.slice(), kind: v.kind, score: v.score };
  }

  if (inp.humanStackAfter > 0 && inp.bb > 0) {
    const bbs = Math.round((inp.humanStackAfter / inp.bb) * 100) / 100;
    if (bbs < t.minStackBB) t.minStackBB = bbs;
  }
}

// ---------------------------------------------------------------------------
// Datas ISO sem `Date` (proibido em src/lib/poker, §3.7)
// ---------------------------------------------------------------------------

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 'YYYY-MM-DDTHH:MM[:SS[.fff]][Z|±HH:MM]' → ms desde 1970 (UTC), ou NaN. */
export function isoToMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(iso.trim());
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s, frac, tz] = m;
  let ms = daysFromCivil(+y, +mo, +d) * 86400000 + (+h * 3600 + +mi * 60 + (s ? +s : 0)) * 1000;
  if (frac) ms += Math.round(Number(`0.${frac}`) * 1000);
  if (tz && tz !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    const digits = tz.slice(1).replace(':', '');
    ms -= sign * (+digits.slice(0, 2) * 60 + +digits.slice(2, 4)) * 60000;
  }
  return ms;
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

const CORE_RIVALS = ['bogart', 'cypher', 'fincher'] as const;

export function summarizeMatch(s: MatchState, meta: { clientId: string; startedAt: string; endedAt: string }): MatchSummary {
  const st = x(s);
  if (st.config.mode === 'tutorial') throw new Error('summarizeMatch: treino não tem resumo');
  const g = st.game;
  const alive = g.players.filter((p) => p.status !== 'eliminated').length;
  const humanWon = g.winnerId === HUMAN || st.endReason === 'won';
  const place = (st.places[HUMAN] ?? (humanWon ? 1 : alive)) as 1 | 2 | 3 | 4;
  const reason = st.endReason ?? (humanWon ? 'won' : st.places[HUMAN] !== undefined ? 'eliminated' : 'abandoned');
  const start = isoToMs(meta.startedAt);
  const end = isoToMs(meta.endedAt);
  const durationS = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : 0;
  const { eliminations, oscarBluff, ...human } = st.tally;
  return {
    v: 1,
    clientId: meta.clientId,
    mode: st.config.mode === 'bounty' ? 'bounty' : 'free',
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    durationS,
    hands: g.handNumber,
    place,
    winnerId: (g.winnerId as PlayerId | null) ?? null,
    reason,
    loan: st.config.loan > 0,
    human: { ...human, bestHand: human.bestHand ? { ...human.bestHand, cards: human.bestHand.cards.slice() } : null },
    eliminations: eliminations.map((e) => ({ ...e })),
    comeback: reason === 'won' && st.tally.minStackBB < 5,
    marks: {
      firstWinCandidate: reason === 'won',
      foxHunter: st.eliminatedBy.fincher === HUMAN,
      cleanSweep: CORE_RIVALS.every((r) => st.eliminatedBy[r] === HUMAN),
      oscarBluff,
    },
    prize: st.config.prize ? { prizeId: st.config.prize.prizeId, capturedHand: st.capturedHand } : null,
    engineHash: ENGINE_HASH_UNSET,
    paramsVersion: { ...st.config.paramsVersion },
    // Pôster Poker: quem vence a mesa (1º lugar) leva o pôster da semana; a Edge concede.
    ...(st.config.mode === 'bounty' && st.config.tournament ? {
      tournament: {
        prizeId: st.config.tournament.prizeId, effect: st.config.tournament.effect, won: reason === 'won',
        casts: st.fx?.castNo ?? 0, bonusWon: st.fx?.bonusWon ?? 0,
      },
    } : {}),
  };
}
