/**
 * Camada de partida (SPEC §4.4): funções puras e síncronas que devolvem um estado novo
 * (a entrada nunca é alterada). Todo `events` sai PRIVADO e passa por `toPublicEvents`
 * antes de ir para a interface ou para a rede.
 */
import type { LegalActions, PlayerAction } from '../engine.ts';
import { PokerRuleError, getLegalActions } from '../engine.ts';
import { levelFor } from '../config.ts';
import type { EndReasonPublic, LevelInfo, MatchConfig, MatchOutcome, MatchState, MatchStep, PersonStatus, PlayerId } from '../types.ts';
import { tiltOnHumanShow } from '../bots/tilt.ts';
import { modelOnShow } from '../bots/model.ts';

export { raposoMemory } from '../bots/model.ts';
import type { EndReason, MatchStateX } from './internal.ts';
import { HUMAN, emit, isAlive, isPerson, newCtx, x } from './internal.ts';
import {
  applyAndProcess, autoAct, botAct, emitMatchEnded, emitMatchStarted, finishFriends, initialState, removeLeaver, runUntilHuman,
  startNextHand,
} from './runner.ts';
import { startTutorialFrom } from './tutorialRunner.ts';

export type { MatchStep, MatchOutcome } from '../types.ts';
export { tableView } from './tableView.ts';
export { toPublicEvents } from './publicEvents.ts';
export { summarizeMatch } from './summary.ts';
export { runoutOdds } from './odds.ts';
export { startTutorialHand } from './tutorialRunner.ts';
export { eliminatorOf } from './eliminator.ts';
export { logHash } from './logHash.ts';
// Pôster Poker (pacote E, 03/11/2026): utilidades públicas dos efeitos.
export { EXTRA_ACES, blackjackValue, extraCardsOf, hasEffects } from './effects.ts';
export type { RunoutOptions } from './odds.ts';
// Pacote E3 (03/11/2026): mesa de amigos, ponto de vista e casual de devolução.
export { PERSON_IDS, ORACLE_SEATS, cleanEffects, friendsConfig, friendsSeating, rescueConfig } from './configs.ts';
export { friendsPayload, povEvents, povView } from './pov.ts';

/** Emite matchStarted e roda até a vez da pessoa. */
export function createMatch(cfg: MatchConfig): MatchStep {
  if (cfg.mode === 'tutorial') return startTutorialFrom(cfg, 0);
  const st = initialState(cfg);
  const ctx = { st, ev: [], record: true, decisions: 0, maxDecisions: 200 };
  emitMatchStarted(ctx);
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

/** A pessoa `id` está na mesa e ainda joga? (erro com o código certo se não estiver). */
function assertPlaying(sx: MatchStateX, id: string): void {
  if (sx.status !== 'running') throw new PokerRuleError('game_over', 'A partida acabou para a pessoa.');
  if (!isPerson(sx, id)) throw new PokerRuleError('illegal_action', `${id} não é uma pessoa desta mesa.`);
  const ps = sx.people?.[id];
  if (ps && (ps.status !== 'playing' || ps.leaving)) throw new PokerRuleError('game_over', 'A partida acabou para esta pessoa.');
}

function assertFriends(sx: MatchStateX): void {
  if (!sx.people) throw new PokerRuleError('illegal_action', 'Só na mesa de amigos.');
}

/**
 * Pacote E3: ação da pessoa `id` (na mesa de uma pessoa, `id` = 'human' — é o applyHumanAction).
 * Na mesa de amigos, agir zera os estouros do relógio e tira a pessoa do "ausente".
 */
export function applyPersonAction(s: MatchState, id: PlayerId, a: PlayerAction, opts?: { show?: boolean }): MatchStep {
  const sx = x(s);
  assertPlaying(sx, id);
  if (!getLegalActions(sx.game, id)) throw new PokerRuleError('not_your_turn', 'Não é a vez da pessoa.');
  const ctx = newCtx(s);
  const st = ctx.st;
  const ps = st.people?.[id];
  if (ps) {
    ps.streak = 0;
    if (ps.away) {
      ps.away = false;
      emit(ctx, { type: 'away', playerId: id, on: false, handNumber: st.game.handNumber });
    }
  }
  const lu = st.lastUncontested;
  if (opts?.show && lu && lu.playerId === id && !lu.shown && lu.cards && lu.hand === st.game.handNumber - 1) {
    lu.shown = true;
    emit(ctx, { type: 'cardsShown', playerId: id, cards: [lu.cards[0], lu.cards[1]], afterFold: false });
    const res = st.game.history.find((h) => h.handNumber === lu.hand);
    if (res) {
      for (const t of tiltOnHumanShow(st, res, lu.cards, id)) emit(ctx, { type: 'tilt', ...t });
      for (const mem of Object.values(st.bots)) if (mem.model) modelOnShow(mem.model, res, id, lu.cards);
    }
  }
  applyAndProcess(ctx, id, a, null);
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

/**
 * Valida com getLegalActions (PokerRuleError → 'illegal'), aplica, roda os bots, fecha
 * mãos e para na próxima vez da pessoa ou no fim. `show` = a pessoa tocou em "Mostrar"
 * depois de levar o pote anterior sem showdown: sai `cardsShown` antes da ação.
 */
export function applyHumanAction(s: MatchState, a: PlayerAction, opts?: { show?: boolean }): MatchStep {
  return applyPersonAction(s, HUMAN, a, opts);
}

/**
 * Pacote E3: o relógio (30 s, contado pelo servidor) de `id` estourou: passa se puder, senão
 * desiste. O 3º estouro seguido deixa a pessoa ausente (a vez dela passa a ser jogada na hora).
 */
export function timeoutPerson(s: MatchState, id: PlayerId): MatchStep {
  const sx = x(s);
  assertFriends(sx);
  assertPlaying(sx, id);
  if (!getLegalActions(sx.game, id)) throw new PokerRuleError('not_your_turn', 'Não é a vez da pessoa.');
  const ctx = newCtx(s);
  const st = ctx.st;
  const ps = st.people![id];
  const n = st.game.handNumber;
  ps.streak += 1;
  emit(ctx, { type: 'clockOut', playerId: id, handNumber: n, streak: ps.streak });
  if (ps.streak >= 3 && !ps.away) {
    ps.away = true;
    emit(ctx, { type: 'away', playerId: id, on: true, handNumber: n });
  }
  autoAct(ctx, id, 'timeout');
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

/** Pacote E3: a pessoa voltou (sai do "ausente" sem precisar agir). Sem efeito se não estava ausente. */
export function personBack(s: MatchState, id: PlayerId): MatchStep {
  const sx = x(s);
  assertFriends(sx);
  assertPlaying(sx, id);
  const ctx = newCtx(s);
  const ps = ctx.st.people![id];
  if (!ps.away && ps.streak === 0) return { state: ctx.st, events: [] };
  ps.streak = 0;
  if (ps.away) {
    ps.away = false;
    emit(ctx, { type: 'away', playerId: id, on: false, handNumber: ctx.st.game.handNumber });
  }
  // Agora há alguém presente: quem está ausente e tem a vez é jogado na hora.
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

/**
 * Pacote E3: a pessoa saiu no meio (desistência ou abandono). Desiste quando a vez chegar nela
 * (ou já, se for a vez); no fim da mão sai da mesa (as fichas saem com ela). A partida das
 * outras continua; sem pessoa jogando, os oráculos terminam a partida e sai o matchEnded.
 */
export function leavePerson(s: MatchState, id: PlayerId, reason: 'forfeit' | 'abandoned' = 'forfeit'): MatchStep {
  const sx = x(s);
  assertFriends(sx);
  assertPlaying(sx, id);
  const ctx = newCtx(s);
  const st = ctx.st;
  const ps = st.people![id];
  ps.leaving = reason === 'abandoned' ? 'abandoned' : 'forfeit';
  ps.away = false;
  emit(ctx, { type: 'personLeft', playerId: id, reason: ps.leaving, handNumber: st.game.handNumber });
  const g = st.game;
  if (g.phase === 'betting' && g.hand?.toActId === id) {
    autoAct(ctx, id, 'left');
  } else if (g.phase !== 'betting') {
    // Entre mãos (raro: a mesa sempre para numa vez): sai já, numa cópia do jogo.
    st.game = { ...g, players: g.players.map((p) => ({ ...p, holeCards: p.holeCards.slice() })) };
    removeLeaver(ctx, id, g.handNumber);
    const stillPlaying = Object.values(st.people!).some((p) => p.status === 'playing' && !p.leaving);
    if (st.game.phase === 'gameOver' || !stillPlaying) finishFriends(ctx);
  }
  runUntilHuman(ctx);
  return { state: ctx.st, events: ctx.ev };
}

/** Pacote E3: a pessoa cuja decisão a mesa espera agora (para o relógio), ou null. */
export function waitingFor(s: MatchState): PlayerId | null {
  const sx = x(s);
  const g = sx.game;
  if (sx.status !== 'running' || g.phase !== 'betting' || !g.hand?.toActId) return null;
  const to = g.hand.toActId;
  return isPerson(sx, to) ? (to as PlayerId) : null;
}

/** Pacote E3: ações legais da pessoa `id` agora (null se não for a vez dela ou se ela não joga mais). */
export function personLegal(s: MatchState, id: PlayerId): LegalActions | null {
  const sx = x(s);
  if (sx.status !== 'running' || !isPerson(sx, id)) return null;
  const ps = sx.people?.[id];
  if (ps && (ps.status !== 'playing' || ps.leaving)) return null;
  return getLegalActions(sx.game, id);
}

export interface FriendsResult {
  done: boolean;
  winnerId: PlayerId | null;
  winnerIsPerson: boolean;
  places: Partial<Record<PlayerId, number>>;
  people: Record<PlayerId, { status: PersonStatus; place: number | null; reason: EndReasonPublic | null; away: boolean; streak: number }>;
}

/** Pacote E3: situação da mesa de amigos (para a Edge: fim, vencedor, colocações, cada pessoa). */
export function friendsResult(s: MatchState): FriendsResult {
  const sx = x(s);
  assertFriends(sx);
  const done = sx.status === 'finished';
  const winnerId = done
    ? ((sx.game.winnerId ?? Object.keys(sx.places).find((k) => sx.places[k] === 1) ?? null) as PlayerId | null)
    : null;
  const people: Record<string, FriendsResult['people'][PlayerId]> = {};
  for (const [id, ps] of Object.entries(sx.people!)) {
    people[id] = { status: ps.status, place: ps.place ?? null, reason: ps.reason ?? null, away: ps.away, streak: ps.streak };
  }
  return { done, winnerId, winnerIsPerson: !!winnerId && isPerson(sx, winnerId), places: { ...sx.places }, people: people as FriendsResult['people'] };
}

function endForHuman(s: MatchState, reason: EndReason): MatchStep {
  const sx = x(s);
  if (sx.people) throw new PokerRuleError('illegal_action', 'Mesa de amigos: use leavePerson.');
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
  if (sx.people) throw new PokerRuleError('illegal_action', 'Mesa de amigos: o motor já termina a partida (friendsResult).');
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
  // Mesa de amigos: não há "a pessoa" — o desfecho de cada uma está em friendsResult.
  if (nx.people) return out;
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
