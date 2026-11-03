/**
 * Camada de partida (SPEC §4.4): funções puras e síncronas que devolvem um estado novo
 * (a entrada nunca é alterada). Todo `events` sai PRIVADO e passa por `toPublicEvents`
 * antes de ir para a interface ou para a rede.
 */
import type { LegalActions, PlayerAction } from '../engine.ts';
import { PokerRuleError, getLegalActions } from '../engine.ts';
import { levelFor } from '../config.ts';
import type { LevelInfo, MatchConfig, MatchOutcome, MatchState, MatchStep, PlayerId } from '../types.ts';
import { tiltOnHumanShow } from '../bots/tilt.ts';
import { modelOnShow } from '../bots/model.ts';

export { raposoMemory } from '../bots/model.ts';
import type { EndReason } from './internal.ts';
import { HUMAN, emit, isAlive, newCtx, x } from './internal.ts';
import { applyAndProcess, botAct, emitMatchEnded, emitMatchStarted, initialState, runUntilHuman, startNextHand } from './runner.ts';
import { startTutorialFrom } from './tutorialRunner.ts';

export type { MatchStep, MatchOutcome } from '../types.ts';
export { tableView } from './tableView.ts';
export { toPublicEvents } from './publicEvents.ts';
export { summarizeMatch } from './summary.ts';
export { runoutOdds } from './odds.ts';
export { startTutorialHand } from './tutorialRunner.ts';
export { eliminatorOf } from './eliminator.ts';
export { logHash } from './logHash.ts';

/** Emite matchStarted e roda até a vez da pessoa. */
export function createMatch(cfg: MatchConfig): MatchStep {
  if (cfg.mode === 'tutorial') return startTutorialFrom(cfg, 0);
  const st = initialState(cfg);
  const ctx = { st, ev: [], record: true, decisions: 0, maxDecisions: 200 };
  emitMatchStarted(ctx);
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

/**
 * Valida com getLegalActions (PokerRuleError → 'illegal'), aplica, roda os bots, fecha
 * mãos e para na próxima vez da pessoa ou no fim. `show` = a pessoa tocou em "Mostrar"
 * depois de levar o pote anterior sem showdown: sai `cardsShown` antes da ação.
 */
export function applyHumanAction(s: MatchState, a: PlayerAction, opts?: { show?: boolean }): MatchStep {
  const sx = x(s);
  if (sx.status !== 'running') throw new PokerRuleError('game_over', 'A partida acabou para a pessoa.');
  if (!getLegalActions(sx.game, HUMAN)) throw new PokerRuleError('not_your_turn', 'Não é a vez da pessoa.');
  const ctx = newCtx(s);
  const st = ctx.st;
  const lu = st.lastUncontested;
  if (opts?.show && lu && lu.playerId === HUMAN && !lu.shown && lu.cards && lu.hand === st.game.handNumber - 1) {
    lu.shown = true;
    emit(ctx, { type: 'cardsShown', playerId: HUMAN, cards: [lu.cards[0], lu.cards[1]], afterFold: false });
    const res = st.game.history.find((h) => h.handNumber === lu.hand);
    if (res) {
      for (const t of tiltOnHumanShow(st, res, lu.cards)) emit(ctx, { type: 'tilt', ...t });
      for (const mem of Object.values(st.bots)) if (mem.model) modelOnShow(mem.model, res, HUMAN, lu.cards);
    }
  }
  applyAndProcess(ctx, HUMAN, a, null);
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

function endForHuman(s: MatchState, reason: EndReason): MatchStep {
  const sx = x(s);
  if (sx.status !== 'running') throw new PokerRuleError('game_over', 'A partida já acabou para a pessoa.');
  const ctx = newCtx(s);
  const st = ctx.st;
  st.status = 'finished';
  st.endReason = reason;
  if (st.config.mode === 'tutorial') return { state: st, events: ctx.ev };
  const place = st.game.players.filter(isAlive).length;
  st.places[HUMAN] = place;
  emitMatchEnded(ctx, reason, place);
  return { state: st, events: ctx.ev };
}

/** place = vivos (contando a pessoa); matchEnded{reason:'forfeit'}. */
export function forfeitMatch(s: MatchState): MatchStep {
  return endForHuman(s, 'forfeit');
}

/** Idem, reason:'abandoned'. */
export function abandonMatch(s: MatchState): MatchStep {
  return endForHuman(s, 'abandoned');
}

/**
 * Quem levaria a mesa depois que a pessoa caiu (partida livre, em segundo plano):
 * os bots jogam até sobrar um, com a mesma semente. Passou de `maxHands`, vence o maior
 * cacife e os outros ficam pela ordem dos cacifes.
 */
export function simulateRest(s: MatchState, maxHands = 300): { winnerId: PlayerId; places: Record<PlayerId, number> } {
  const sx = x(s);
  if (sx.status === 'running') throw new PokerRuleError('illegal_action', 'A pessoa ainda está na mesa.');
  const ctx = newCtx(s, false);
  ctx.maxDecisions = Number.POSITIVE_INFINITY;
  const st = ctx.st;
  const startHand = st.game.handNumber;
  while (st.game.phase !== 'gameOver' && st.game.handNumber - startHand < maxHands) {
    const g = st.game;
    if (g.phase !== 'betting') {
      startNextHand(ctx);
      continue;
    }
    const to = g.hand!.toActId;
    if (!to) break;
    botAct(ctx, to);
  }
  const g = st.game;
  const places: Record<string, number> = {};
  for (const [k, v] of Object.entries(st.places)) if (v !== undefined) places[k] = v;
  const alive = g.players.filter((p) => isAlive(p) && places[p.id] === undefined).sort((p, q) => q.stack - p.stack);
  alive.forEach((p, k) => {
    places[p.id] = k + 1;
  });
  const winnerId = (g.winnerId ?? alive[0]?.id ?? Object.keys(places).find((k) => places[k] === 1)) as PlayerId;
  return { winnerId, places: places as Record<PlayerId, number> };
}

export function humanLegal(s: MatchState): LegalActions | null {
  return x(s).status === 'running' ? getLegalActions(s.game, HUMAN) : null;
}

const OUTCOME: Record<EndReason, 'won' | 'lost' | 'forfeit' | 'abandoned'> = {
  won: 'won', eliminated: 'lost', forfeit: 'forfeit', abandoned: 'abandoned',
};

export function outcomeOf(prev: MatchState, next: MatchState): MatchOutcome {
  const out: MatchOutcome = {};
  const nx = x(next);
  if (prev.capturedHand === null && next.capturedHand !== null && next.config.prize) {
    out.captured = { hand: next.capturedHand, prizeId: next.config.prize.prizeId };
  }
  if (prev.status === 'running' && next.status !== 'running') {
    const reason: EndReason = nx.endReason ?? (next.game.winnerId === HUMAN ? 'won' : 'eliminated');
    out.finished = { status: OUTCOME[reason], place: next.places[HUMAN] ?? (reason === 'won' ? 1 : next.game.players.length) };
  }
  return out;
}

export function describeLevel(s: MatchState): LevelInfo {
  return levelFor(Math.max(1, s.game.handNumber), s.config.settings);
}
