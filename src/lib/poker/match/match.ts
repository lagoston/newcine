/**
 * Camada de partida (SPEC §4.4): funções puras e síncronas que devolvem um estado novo.
 * Todo `events` sai PRIVADO e passa por `toPublicEvents` antes de ir para a interface ou
 * para a rede.
 *
 * F0 (03/11/2026): só as assinaturas, para os pacotes B, C e D compilarem contra elas.
 * Toda função lança `not_implemented` até o A1.
 */
import type { Card } from '../cards.ts';
import type { LegalActions, PlayerAction } from '../engine.ts';
import type {
  LevelInfo,
  MatchConfig,
  MatchEvent,
  MatchOutcome,
  MatchState,
  MatchStep,
  MatchSummary,
  PlayerId,
  PublicEvent,
  TableView,
  TutorialScript,
} from '../types.ts';

export type { MatchStep, MatchOutcome } from '../types.ts';

function notImplemented(...args: unknown[]): never {
  void args;
  throw new Error('not_implemented');
}

/** Emite matchStarted e roda até a vez da pessoa. */
export function createMatch(cfg: MatchConfig): MatchStep {
  return notImplemented(cfg);
}

/**
 * Valida com getLegalActions (PokerRuleError → 'illegal'), aplica, roda os bots
 * (runBotsUntilHumanOrEnd), fecha mãos (eliminações → prêmio → tilt → modelo → tally → flags),
 * inicia a próxima mão (setBlinds pelo nível) e para na próxima vez da pessoa ou no fim.
 */
export function applyHumanAction(s: MatchState, a: PlayerAction, opts?: { show?: boolean }): MatchStep {
  return notImplemented(s, a, opts);
}

/** place = vivos; matchEnded{reason:'forfeit'}. */
export function forfeitMatch(s: MatchState): MatchStep {
  return notImplemented(s);
}

/** Idem, reason:'abandoned'. */
export function abandonMatch(s: MatchState): MatchStep {
  return notImplemented(s);
}

export function simulateRest(s: MatchState, maxHands = 300): { winnerId: PlayerId; places: Record<PlayerId, number> } {
  return notImplemented(s, maxHands);
}

export function humanLegal(s: MatchState): LegalActions | null {
  return notImplemented(s);
}

export function tableView(s: MatchState, viewer: 'human'): TableView {
  return notImplemented(s, viewer);
}

export function toPublicEvents(ev: MatchEvent[], viewer: 'human'): PublicEvent[] {
  return notImplemented(ev, viewer);
}

export function summarizeMatch(s: MatchState, meta: { clientId: string; startedAt: string; endedAt: string }): MatchSummary {
  return notImplemented(s, meta);
}

export function outcomeOf(prev: MatchState, next: MatchState): MatchOutcome {
  return notImplemented(prev, next);
}

export function startTutorialHand(script: TutorialScript, i: 0 | 1 | 2): MatchStep {
  return notImplemented(script, i);
}

/**
 * Exato com ≥ 3 cartas no board; antes do flop, Monte Carlo com 3.000 iterações e
 * semente = hash das cartas abertas (o mesmo número nos dois lados).
 */
export function runoutOdds(hands: { playerId: string; cards: Card[] }[], board: Card[]): Record<string, number> {
  return notImplemented(hands, board);
}

export function describeLevel(s: MatchState): LevelInfo {
  return notImplemented(s);
}
