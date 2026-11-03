// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/runner.ts
/**
 * Núcleo da camada de partida: cria a mesa, começa mãos (nível e ante), aplica ações
 * (com o `actionMeta` privado), fecha mãos e roda os bots até a vez da pessoa.
 *
 * Ordem ao fechar uma mão (SPEC §4.4, ajustada para as marcas usarem o que os bots
 * mostraram): bots que mostram → marcas → resumo da mão → eliminações → prêmio → tilt
 * → tally → fim de partida / heads-up.
 */
import type { Card } from '../cards.ts';
import type { HandResult, PlayerAction, PokerEvent } from '../engine.ts';
import { PokerRuleError, applyAction, createTable, getLegalActions, setBlinds, startHand, timeoutAction } from '../engine.ts';
import { createRng, seedToRngState } from '../rng.ts';
import { blindsFor, levelFor } from '../config.ts';
import type { BotMemory, MatchConfig, OppCounters, PlayerId, RivalId } from '../types.ts';
import type { BotChoice } from '../bots/driver.ts';
import { defaultBotChoice } from '../bots/driver.ts';
import { bucketOf, isAirShown } from '../bots/buckets.ts';
import { emptyCounters, labelsOf, updateModel } from '../bots/model.ts';
import { tellsFor } from '../bots/tells.ts';
import { endOfHandTilt } from '../bots/tilt.ts';
import { computeFlags } from './flags.ts';
import { eliminatorOf } from './eliminator.ts';
import { emptyTally, updateTally } from './summary.ts';
import { scriptedChoice } from './scripted.ts';
import type { EndReason, MatchStateX, StepCtx } from './internal.ts';
import { HUMAN, emit, isAlive, isRevealed, markRevealed, playerOf, sizeClassOf } from './internal.ts';

/** Nos testes, ação ilegal de bot estoura em vez de virar check/fold. */
let strictBots = false;
export function setStrictBots(on: boolean): void {
  strictBots = on;
}

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

export function initialState(cfg: MatchConfig, buttonSeat?: number): MatchStateX {
  const s = cfg.settings;
  const lvl = levelFor(1, s);
  if (cfg.seats[HUMAN] === undefined) throw new Error('MatchConfig.seats precisa de human');
  const players = Object.entries(cfg.seats).map(([id, seat]) => ({
    id, seat, stack: s.startStack + (id === HUMAN ? cfg.loan : 0),
  }));
  const game = createTable(
    { smallBlind: lvl.sb, bigBlind: lvl.bb, ante: lvl.ante, historyLimit: 3, ...(buttonSeat !== undefined ? { buttonSeat } : {}) },
    players,
    cfg.seed,
  );
  const bots: Record<string, BotMemory> = {};
  for (const id of Object.keys(cfg.seats)) {
    if (id === HUMAN) continue;
    const prof = cfg.profiles[id];
    if (!prof) throw new Error(`MatchConfig.profiles sem ${id}`);
    const mem: BotMemory = { committed: false, facedFirstBet: false, tilt: null, labelsAnnounced: [] };
    if (prof.model.enabled) {
      const model: Record<string, OppCounters> = {};
      for (const other of Object.keys(cfg.seats)) {
        if (other === id) continue;
        const prior = cfg.memory?.[other];
        model[other] = prior ? { ...prior, raw: { ...prior.raw } } : emptyCounters();
      }
      mem.model = model as Record<PlayerId, OppCounters>;
    }
    bots[id] = mem;
  }
  const humanStack = s.startStack + cfg.loan;
  return {
    v: 1,
    config: cfg,
    game,
    levelIndex: lvl.index,
    eventNo: 0,
    actionNo: 0,
    holderId: cfg.prize?.carrierId ?? null,
    capturedHand: null,
    places: {},
    eliminatedBy: {},
    bots: bots as Record<RivalId, BotMemory>,
    tally: emptyTally(humanStack / lvl.bb),
    lastUncontested: null,
    status: 'running',
  };
}

export function emitMatchStarted(ctx: StepCtx): void {
  const st = ctx.st;
  const cfg = st.config;
  emit(ctx, {
    type: 'matchStarted',
    mode: cfg.mode,
    seats: st.game.players.map((p) => ({ id: p.id, seat: p.seat, stack: p.stack })),
    loan: cfg.loan,
    prize: cfg.prize ? { prizeId: cfg.prize.prizeId, holderId: cfg.prize.carrierId } : null,
    level: levelFor(1, cfg.settings),
  });
}

// ---------------------------------------------------------------------------
// Mãos
// ---------------------------------------------------------------------------

/** Política de mostrar dos bots (§3.2 `showPolicy`), com o fluxo `show` do RNG. */
function botShows(st: MatchStateX, result: HandResult): { playerId: string; cards: [Card, Card]; afterFold: boolean }[] {
  const out: { playerId: string; cards: [Card, Card]; afterFold: boolean }[] = [];
  if (st.config.mode === 'tutorial') return out;
  const board = result.board;
  const winner = !result.wentToShowdown && result.winnerIds.length === 1 ? result.winnerIds[0] : null;
  for (const p of st.game.players) {
    if (p.id === HUMAN || p.showCards || p.holeCards.length !== 2 || result.startStacks[p.id] === undefined) continue;
    const pol = st.config.profiles[p.id]?.showPolicy;
    if (!pol) continue;
    let chance = 0;
    let afterFold = false;
    const fold = result.actions.find((a) => a.playerId === p.id && a.type === 'fold');
    if (winner === p.id && pol.bluffWin > 0 && isAirShown(p.holeCards, board)) {
      chance = pol.bluffWin;
    } else if (fold && fold.street === 'river' && pol.strongFoldRiver > 0) {
      const b = bucketOf(p.holeCards, board);
      if (b === 'nuts' || b === 'strong' || b === 'medium') {
        chance = pol.strongFoldRiver;
        afterFold = true;
      }
    }
    if (chance <= 0) continue;
    if (createRng(`${st.config.seed}:show:${result.handNumber}:${p.seat}`).nextFloat() < chance) {
      out.push({ playerId: p.id, cards: [p.holeCards[0], p.holeCards[1]], afterFold });
    }
  }
  return out;
}

function capturePrize(ctx: StepCtx, hand: number): void {
  const st = ctx.st;
  if (!st.config.prize || st.capturedHand !== null) return;
  st.capturedHand = hand;
  st.holderId = HUMAN;
  emit(ctx, { type: 'prizeCaptured', handNumber: hand, prizeId: st.config.prize.prizeId });
}

/** Passagem e captura (§2.6): quem elimina o portador herda o prêmio. */
function processPrize(ctx: StepCtx, hand: number, victims: Set<string>): void {
  const st = ctx.st;
  if (!st.config.prize || st.capturedHand !== null) return;
  for (let guard = 0; guard < 4 && st.holderId && victims.has(st.holderId); guard++) {
    const from = st.holderId;
    const by = st.eliminatedBy[from] ?? null;
    if (!by) return;
    if (by === HUMAN) {
      capturePrize(ctx, hand);
      return;
    }
    st.holderId = by;
    emit(ctx, { type: 'prizeMoved', fromId: from, toId: by, handNumber: hand });
  }
}

export function emitMatchEnded(ctx: StepCtx, reason: EndReason, humanPlace: number): void {
  const st = ctx.st;
  emit(ctx, {
    type: 'matchEnded',
    places: { ...st.places } as Record<PlayerId, number>,
    winnerId: (st.game.winnerId as PlayerId | null) ?? null,
    humanPlace,
    reason,
    prizeCaptured: st.capturedHand !== null,
    ...(st.config.mode === 'bounty' ? { seed: st.config.seed } : {}),
  });
}

function closeHand(ctx: StepCtx, result: HandResult, runout: { board: Card[]; hands: { playerId: string; cards: Card[] }[] } | null): void {
  const st = ctx.st;
  const g = st.game;
  const cfg = st.config;
  const n = result.handNumber;
  const bb = result.blinds.bigBlind;
  const tutorial = cfg.mode === 'tutorial';
  const holes: Record<string, Card[]> = {};
  for (const p of g.players) if (result.startStacks[p.id] !== undefined && p.holeCards.length === 2) holes[p.id] = p.holeCards.slice();

  // 1) bots que mostram depois de vencer sem showdown ou de largar no river
  const shownAfter = botShows(st, result);
  for (const s of shownAfter) {
    markRevealed(st, s.playerId);
    emit(ctx, { type: 'cardsShown', playerId: s.playerId, cards: s.cards, afterFold: s.afterFold });
  }
  // 2) marcas (só dados públicos)
  const { flags, potTotal, odds } = computeFlags({ result, bb, runout, shownAfter });
  // 3) treino: todas as cartas viram no fim
  if (tutorial) {
    for (const p of g.players) {
      if (p.id === HUMAN || !holes[p.id] || isRevealed(st, p)) continue;
      markRevealed(st, p.id);
      emit(ctx, { type: 'cardsShown', playerId: p.id, cards: [p.holeCards[0], p.holeCards[1]], afterFold: p.status === 'folded' });
    }
  }
  // 4) resumo público da mão
  const net: Record<string, number> = {};
  for (const p of g.players) net[p.id] = result.net[p.id] ?? 0;
  emit(ctx, {
    type: 'handSummary', handNumber: n, net: net as Record<PlayerId, number>, winnerIds: result.winnerIds.slice(),
    wentToShowdown: result.wentToShowdown, potBB: Math.round((potTotal / bb) * 10) / 10, flags,
  });
  // 5) eliminações (uma regra só: eliminatorOf)
  const elims: { victimId: PlayerId; byId: PlayerId | null; hand: number }[] = [];
  for (const e of result.eliminated) {
    const byId = eliminatorOf(result, e.playerId);
    st.places[e.playerId] = e.place;
    st.eliminatedBy[e.playerId] = byId;
    elims.push({ victimId: e.playerId, byId, hand: n });
    emit(ctx, { type: 'eliminated', playerId: e.playerId, place: e.place, byId, handNumber: n });
  }
  if (g.phase === 'gameOver' && g.winnerId) st.places[g.winnerId] = 1;
  // 6) prêmio
  if (elims.length > 0) processPrize(ctx, n, new Set(elims.map((e) => e.victimId)));
  if (g.phase === 'gameOver' && g.winnerId === HUMAN) capturePrize(ctx, n);
  // 7) tilt
  if (!tutorial) for (const t of endOfHandTilt(st, result, flags, potTotal, bb)) emit(ctx, { type: 'tilt', ...t });
  // 8) modelo do Raposo (só dados públicos) e leituras novas sobre a pessoa
  if (!tutorial) {
    const shown: Record<string, Card[]> = {};
    for (const sh of result.shown) shown[sh.playerId] = sh.cards;
    for (const sh of shownAfter) shown[sh.playerId] = sh.cards;
    for (const [id, mem] of Object.entries(st.bots)) {
      const alive = g.players.some((p) => p.id === id && p.status !== 'eliminated');
      if (!mem.model || !cfg.profiles[id]?.model.enabled || !alive) continue;
      updateModel(mem.model, result, shown);
      const human = mem.model.human;
      if (st.status !== 'running' || !human) continue;
      for (const label of labelsOf(human, cfg.difficulty.adaptDelay)) {
        if (mem.labelsAnnounced.includes(label)) continue;
        mem.labelsAnnounced.push(label);
        emit(ctx, { type: 'styleRead', by: id, targetId: 'human', label });
      }
    }
  }
  // 9) números da pessoa (enquanto ela joga)
  if (st.status === 'running' && !tutorial) {
    updateTally(st.tally, { result, bb, holes, flags, potTotal, odds, humanStackAfter: playerOf(g, HUMAN).stack, eliminations: elims });
  }
  // 9) último pote sem showdown (para o "Mostrar")
  if (!result.wentToShowdown && result.winnerIds.length === 1) {
    const w = result.winnerIds[0];
    const mine = w === HUMAN ? holes[HUMAN] : undefined;
    st.lastUncontested = {
      hand: n, playerId: w, shown: shownAfter.some((s) => s.playerId === w),
      ...(mine ? { cards: [mine[0], mine[1]] as [Card, Card] } : {}),
    };
  } else {
    st.lastUncontested = null;
  }
  // 10) fim da partida, ou aviso de heads-up
  if (tutorial) {
    st.status = 'finished';
    return;
  }
  if (st.status !== 'running') return;   // simulateRest: só bots
  if (elims.some((e) => e.victimId === HUMAN)) {
    st.status = 'humanOut';
    st.endReason = 'eliminated';
    emitMatchEnded(ctx, 'eliminated', st.places[HUMAN] ?? g.players.length);
    return;
  }
  if (g.phase === 'gameOver') {
    st.status = 'finished';
    st.endReason = 'won';
    emitMatchEnded(ctx, 'won', 1);
    return;
  }
  const alive = g.players.filter(isAlive);
  if (alive.length === 2 && Object.keys(result.startStacks).length >= 3) {
    emit(ctx, { type: 'headsUp', ids: [alive[0].id, alive[1].id], handNumber: n + 1 });
  }
}

function processEngine(ctx: StepCtx, events: PokerEvent[], boardBefore: Card[]): void {
  const st = ctx.st;
  let board = boardBefore.slice();
  let runout: { board: Card[]; hands: { playerId: string; cards: Card[] }[] } | null = null;
  let result: HandResult | null = null;
  for (const e of events) {
    if (e.type === 'handStarted') emit(ctx, { ...e, level: levelFor(e.handNumber, st.config.settings) });
    else emit(ctx, e);
    if (e.type === 'streetDealt') board = e.board.slice();
    else if (e.type === 'allInRunout') runout = { board: board.slice(), hands: e.hands.map((h) => ({ playerId: h.playerId, cards: h.cards.slice() })) };
    else if (e.type === 'handComplete') result = e.result;
  }
  if (result) closeHand(ctx, result, runout);
}

export function startNextHand(ctx: StepCtx): void {
  const st = ctx.st;
  const cfg = st.config;
  let g = st.game;
  const n = g.handNumber + 1;
  const lvl = levelFor(n, cfg.settings);
  if (lvl.index !== st.levelIndex) {
    g = setBlinds(g, blindsFor(lvl));
    if (lvl.index > st.levelIndex) emit(ctx, { type: 'levelUp', level: lvl, handNumber: n });
    st.levelIndex = lvl.index;
  }
  for (const m of Object.values(st.bots)) {
    m.committed = false;
    m.facedFirstBet = false;
  }
  // Baralho de cada mão sai da semente + número da mão: independente do histórico.
  g = { ...g, rng: seedToRngState(`${cfg.seed}:deck:${n}`) };
  const preset = cfg.mode === 'tutorial' && cfg.tutorial && st.tutorialHand !== undefined
    ? cfg.tutorial.hands[st.tutorialHand]?.preset
    : undefined;
  const r = startHand(g, preset ? { preset: { holeCards: preset.holeCards, board: preset.board } } : {});
  st.game = r.state;
  processEngine(ctx, r.events, []);
}

/** Aplica uma ação (da pessoa ou de bot) e processa o que o motor devolveu. */
export function applyAndProcess(ctx: StepCtx, id: string, action: PlayerAction, bot: BotChoice | null): void {
  const st = ctx.st;
  const g = st.game;
  const hand = g.hand;
  const legal = getLegalActions(g, id);
  if (!hand || !legal) throw new PokerRuleError('not_your_turn', `Não é a vez de ${id}.`);
  const p = playerOf(g, id);
  const stackBefore = p.stack;
  const streetBetBefore = p.streetBet;
  const prevBet = hand.currentBet;
  const boardBefore = hand.board.slice();
  const handNumber = g.handNumber;
  const actionNo = st.actionNo;
  const r = applyAction(g, id, action);
  const acts = r.state.hand!.actions;
  const rec = acts[acts.length - 1];
  const sizeClass = sizeClassOf(rec, legal.pot, prevBet, streetBetBefore, stackBefore);
  let botMeta: { thinkMs: number; cue: 'confiante' | 'nervoso' | 'calado' | 'neutro'; bucket: BotChoice['bucket']; monster: boolean } | undefined;
  if (bot) {
    const t = st.config.mode === 'tutorial'
      ? { thinkMs: 900, cue: 'neutro' as const }
      : tellsFor(st.config.profiles[id], {
          type: rec.type, street: rec.street, sizeClass, allIn: rec.allIn, shortAllIn: rec.shortAllIn,
          facingBet: legal.toCall > 0, bucket: bot.bucket, monster: bot.monster, pairPlus: bot.pairPlus,
        }, createRng(`${st.config.seed}:think:${handNumber}:${actionNo}`));
    botMeta = { thinkMs: t.thinkMs, cue: t.cue, bucket: bot.bucket, monster: bot.monster };
  }
  st.actionNo += 1;
  emit(ctx, { type: 'actionMeta', playerId: id, handNumber, stackBefore, sizeClass, ...(botMeta ? { bot: botMeta } : {}) });
  st.game = r.state;
  processEngine(ctx, r.events, boardBefore);
}

// ---------------------------------------------------------------------------
// Laço dos bots
// ---------------------------------------------------------------------------

export function botAct(ctx: StepCtx, botId: string): void {
  if (++ctx.decisions > ctx.maxDecisions) throw new Error('bot_decision_limit');
  const st = ctx.st;
  const choice = st.config.mode === 'tutorial' ? scriptedChoice(st, botId) : defaultBotChoice(st, botId);
  try {
    applyAndProcess(ctx, botId, choice.action, choice);
  } catch (e) {
    if (strictBots || !(e instanceof PokerRuleError)) throw e;
    // Rede de segurança: um bot nunca trava a partida.
    applyAndProcess(ctx, botId, timeoutAction(st.game, botId) ?? { type: 'fold' }, choice);
  }
}

/** Roda até a vez da pessoa, o fim da partida para ela, ou o fim do treino. */
export function runUntilHuman(ctx: StepCtx): void {
  for (;;) {
    const st = ctx.st;
    const g = st.game;
    if (st.status !== 'running' || g.phase === 'gameOver') return;
    if (g.phase !== 'betting') {
      startNextHand(ctx);
      continue;
    }
    const to = g.hand!.toActId;
    if (!to || to === HUMAN) return;
    botAct(ctx, to);
  }
}
