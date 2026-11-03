/**
 * O miolo da partida no aparelho (SPEC §4.6): guarda o `MatchState` e responde às
 * mensagens da mesa. Roda dentro do Web Worker (`matchWorker.ts`) e, se o Worker
 * não subir, no thread principal (`matchClient.ts`), com o mesmo código.
 *
 * Toda saída já passa por `toPublicEvents` e `tableView`: a interface nunca vê
 * evento privado. O estado completo volta só para ser salvo no localStorage.
 */
import type { Card } from '../cards.ts';
import type { PlayerAction } from '../engine.ts';
import { estimateEquity, type WeightedRange } from '../equity.ts';
import { createRng } from '../rng.ts';
import type { MatchConfig, MatchState, MatchStep, MatchSummary, PlayerId, PublicEvent, TableView, TutorialScript } from '../types.ts';
import {
  abandonMatch,
  applyHumanAction,
  createMatch,
  forfeitMatch,
  runoutOdds,
  simulateRest,
  startTutorialHand,
  summarizeMatch,
  tableView,
  toPublicEvents,
} from '../match/match.ts';

export type CoreRequest =
  | { op: 'create'; cfg: MatchConfig }
  | { op: 'restore'; state: MatchState }
  | { op: 'act'; action: PlayerAction; show?: boolean }
  | { op: 'forfeit' }
  | { op: 'abandon' }
  | { op: 'simulateRest' }
  | { op: 'summarize'; meta: { clientId: string; startedAt: string; endedAt: string } }
  | { op: 'tutorial'; script: TutorialScript; hand: 0 | 1 | 2 }
  | { op: 'thermo'; hole: Card[]; board: Card[]; opponents: number; dead: Card[] }
  | { op: 'odds'; hands: { playerId: string; cards: Card[] }[]; board: Card[] };

export interface StepReply {
  state: MatchState;
  events: PublicEvent[];
  view: TableView;
}

export type CoreReply =
  | ({ kind: 'step' } & StepReply)
  | { kind: 'rest'; winnerId: PlayerId; places: Record<PlayerId, number> }
  | { kind: 'summary'; summary: MatchSummary }
  | { kind: 'equity'; value: number }
  | { kind: 'odds'; odds: Record<string, number> }
  | { kind: 'error'; code: string; message: string };

let state: MatchState | null = null;

function stepReply(step: MatchStep): CoreReply {
  state = step.state;
  return { kind: 'step', state: step.state, events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human') };
}

/** Plano B do runoutOdds (A1 ainda não chegou): Monte Carlo com as mãos abertas. */
function oddsFallback(hands: { playerId: string; cards: Card[] }[], board: Card[]): Record<string, number> {
  const out: Record<string, number> = {};
  const seedKey = [...hands.flatMap((h) => h.cards), ...board].join('');
  hands.forEach((h, i) => {
    const others = hands.filter((_, j) => j !== i);
    const ranges: WeightedRange[] = others.map((o) => ({ combos: [[o.cards[0], o.cards[1]]] }));
    const r = estimateEquity({
      hole: h.cards,
      board,
      opponents: others.length,
      iterations: board.length >= 3 ? 1500 : 3000,
      rng: createRng(`odds:${seedKey}`),
      ranges,
    });
    out[h.playerId] = r.equity;
  });
  return out;
}

export function handleCore(req: CoreRequest): CoreReply {
  try {
    switch (req.op) {
      case 'create':
        return stepReply(createMatch(req.cfg));
      case 'restore':
        state = req.state;
        return { kind: 'step', state: req.state, events: [], view: tableView(req.state, 'human') };
      case 'act':
        if (!state) return { kind: 'error', code: 'no_match', message: 'no match' };
        return stepReply(applyHumanAction(state, req.action, { show: req.show === true }));
      case 'forfeit':
        if (!state) return { kind: 'error', code: 'no_match', message: 'no match' };
        return stepReply(forfeitMatch(state));
      case 'abandon':
        if (!state) return { kind: 'error', code: 'no_match', message: 'no match' };
        return stepReply(abandonMatch(state));
      case 'simulateRest': {
        if (!state) return { kind: 'error', code: 'no_match', message: 'no match' };
        const r = simulateRest(state);
        return { kind: 'rest', winnerId: r.winnerId, places: r.places };
      }
      case 'summarize':
        if (!state) return { kind: 'error', code: 'no_match', message: 'no match' };
        return { kind: 'summary', summary: summarizeMatch(state, req.meta) };
      case 'tutorial':
        return stepReply(startTutorialHand(req.script, req.hand));
      case 'thermo': {
        // Termômetro (§7.3): equidade contra mãos aleatórias de quem ainda está na mão.
        const opp = Math.max(1, Math.min(8, req.opponents));
        const r = estimateEquity({
          hole: req.hole,
          board: req.board,
          opponents: opp,
          iterations: req.board.length >= 3 ? 300 : 600,
          rng: createRng(`thermo:${req.hole.join('')}${req.board.join('')}:${opp}`),
          deadCards: req.dead,
        });
        return { kind: 'equity', value: r.equity };
      }
      case 'odds': {
        let odds: Record<string, number>;
        try {
          odds = runoutOdds(req.hands, req.board);
        } catch {
          odds = oddsFallback(req.hands, req.board);
        }
        return { kind: 'odds', odds };
      }
      default:
        return { kind: 'error', code: 'unknown_op', message: 'unknown op' };
    }
  } catch (e) {
    const err = e as { code?: string; message?: string; name?: string };
    const code = err?.message === 'not_implemented' ? 'not_implemented' : err?.name === 'PokerRuleError' ? 'illegal' : err?.code ?? 'error';
    return { kind: 'error', code, message: String(err?.message ?? e) };
  }
}
