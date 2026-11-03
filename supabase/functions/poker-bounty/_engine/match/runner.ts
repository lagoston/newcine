// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/runner.ts
/**
 * Núcleo da camada de partida: cria a mesa, começa mãos (nível e ante), aplica ações
 * (com o `actionMeta` privado), fecha mãos e roda os bots até a vez da pessoa.
 *
 * Ordem ao fechar uma mão (SPEC §4.4, ajustada para as marcas usarem o que os bots
 * mostraram): bots que mostram → marcas → resumo da mão → eliminações → prêmio → tilt
 * → tally → fim de partida / heads-up.
 *
 * Pôster Poker (03/11/2026): os efeitos do pôster (effects.ts) entram por ganchos — depois
 * do matchStarted, do handStarted, das cartas fechadas e de cada aposta de bot, antes do
 * river, e no fim da mão logo depois dos bots que mostram (viradas e bônus da casa, que já
 * entram no `net` do resumo).
 *
 * Mesa de amigos (pacote E3, 03/11/2026): vários lugares de pessoas (`config.people`). O laço
 * para na vez de qualquer pessoa presente; quem está ausente (3 estouros) ou saiu é jogado na
 * hora pelo servidor (`auto`). Quem saiu deixa a mesa no fim da mão (as fichas saem com ela).
 * Sem pessoa jogando, os oráculos terminam a partida sozinhos (sem eventos) e sai o matchEnded.
 * Os modos de uma pessoa ('human') seguem exatamente o caminho de antes.
 */
import type { Card } from '../cards.ts';
import type { HandResult, PlayerAction, PokerEvent } from '../engine.ts';
import { PokerRuleError, applyAction, createTable, getLegalActions, setBlinds, startHand, timeoutAction } from '../engine.ts';
import { createRng, seedToRngState } from '../rng.ts';
import { blindsFor, levelFor } from '../config.ts';
import type { AutoActionKind, BotMemory, EndReasonPublic, HumanTally, MatchConfig, OppCounters, PlayerId, RivalId, StyleLabel } from '../types.ts';
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
import type { EndReason, MatchStateX, PersonState, StepCtx } from './internal.ts';
import { HUMAN, emit, isAlive, isPerson, isRevealed, markRevealed, peopleOf, playerOf, sizeClassOf } from './internal.ts';
import {
  beforeRiver, extraCardsOf, handFxFor, initEffectList, initEffects, onBotAggression, onHandEnd, onHandStarted, onHoleCards,
  onMatchStarted, revealedNow,
} from './effects.ts';
import { effectLevels } from '../config.ts';

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
  const people = peopleOf(cfg);
  for (const id of people) if (cfg.seats[id] === undefined) throw new Error(`MatchConfig.seats precisa de ${id}`);
  if (cfg.mode === 'friends' && cfg.people === undefined) throw new Error('mesa de amigos precisa de MatchConfig.people');
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
    if (people.includes(id)) continue;
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
  const fx = initEffects(cfg);
  const fxs = initEffectList(cfg);
  // Mesa de amigos: situação e números de cada pessoa.
  let friends: Pick<MatchStateX, 'people' | 'tallies'> = {};
  if (cfg.mode === 'friends') {
    const ppl: Record<string, PersonState> = {};
    const tallies: Record<string, HumanTally> = {};
    for (const id of people) {
      ppl[id] = { status: 'playing', streak: 0, away: false };
      tallies[id] = emptyTally(s.startStack / lvl.bb);
    }
    friends = { people: ppl, tallies };
  }
  return {
    ...(fx ? { fx } : {}),
    ...(fxs ? { fxs } : {}),
    ...friends,
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
    ...(cfg.mode === 'bounty' && cfg.tournament ? { tournament: { ...cfg.tournament } } : {}),
    ...(cfg.mode === 'friends' ? { people: peopleOf(cfg) as PlayerId[], effects: effectLevels(cfg.effects) } : {}),
    ...(cfg.reclaim && cfg.prize ? { reclaim: true as const } : {}),
  });
  onMatchStarted(ctx);
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
    if (isPerson(st, p.id) || p.showCards || p.holeCards.length !== 2 || result.startStacks[p.id] === undefined) continue;
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

// ---------------------------------------------------------------------------
// Mesa de amigos (pacote E3, 03/11/2026): situação das pessoas e saída da mesa
// ---------------------------------------------------------------------------

function setOut(ps: PersonState, place: number, reason: EndReason): void {
  ps.status = ps.leaving ? 'left' : 'out';
  ps.place = place;
  ps.reason = ps.leaving ?? reason;
  ps.away = false;
}

/** Alguma pessoa joga e está presente (não ausente, não saindo)? */
function someonePresent(st: MatchStateX): boolean {
  return Object.values(st.people ?? {}).some((p) => p.status === 'playing' && !p.away && !p.leaving);
}

/** Alguma pessoa ainda joga (mesmo ausente)? Quem está saindo não conta. */
function anyPlaying(st: MatchStateX): boolean {
  return Object.values(st.people ?? {}).some((p) => p.status === 'playing' && !p.leaving);
}

/**
 * Tira da mesa quem saiu: cacife zerado (as fichas saem com a pessoa), colocação = vivos
 * agora (contando ela), `eliminated{ byId: null }`. Se sobrar um só, a partida acaba.
 */
export function removeLeaver(ctx: StepCtx, id: string, hand: number, elims?: { victimId: PlayerId; byId: PlayerId | null; hand: number }[]): void {
  const st = ctx.st;
  const g = st.game;
  const p = playerOf(g, id);
  const ps = st.people![id];
  if (p.status === 'eliminated') {
    setOut(ps, st.places[id] ?? g.players.filter(isAlive).length + 1, ps.leaving ?? 'forfeit');
    return;
  }
  // Saiu estando all-in e a mão (já decidida pelas cartas) o deixou como o único vivo: vence.
  if (g.phase === 'gameOver' && g.winnerId === id) {
    ps.status = 'left';
    ps.place = 1;
    ps.reason = 'won';
    return;
  }
  const place = g.players.filter(isAlive).length;
  const stackLeft = p.stack;
  p.stack = 0;
  p.status = 'eliminated';
  st.places[id] = place;
  st.eliminatedBy[id] = null;
  setOut(ps, place, ps.leaving ?? 'forfeit');
  elims?.push({ victimId: id, byId: null, hand });
  emit(ctx, { type: 'eliminated', playerId: id, place, byId: null, handNumber: hand, stackLeft });
  // `g` já é a cópia desta chamada (closeHand vem do motor; leavePerson copia antes).
  const alive = g.players.filter((q) => isAlive(q) && q.stack > 0);
  if (alive.length <= 1 && g.phase !== 'betting') {
    g.phase = 'gameOver';
    g.winnerId = alive[0]?.id ?? null;
    if (alive[0]) st.places[alive[0].id] = 1;
  }
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
  // 1b) Pôster Poker: viradas e bônus do efeito (já somados ao cacife)
  const fxEnd = onHandEnd(ctx, result);
  const extraCards = extraCardsOf(st);
  // 2) marcas (só dados públicos)
  const { flags, potTotal, odds } = computeFlags({ result, bb, runout, shownAfter, extraCards });
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
  for (const p of g.players) net[p.id] = (result.net[p.id] ?? 0) + (fxEnd.bonus[p.id] ?? 0);
  emit(ctx, {
    type: 'handSummary', handNumber: n, net: net as Record<PlayerId, number>, winnerIds: result.winnerIds.slice(),
    wentToShowdown: result.wentToShowdown, potBB: Math.round((potTotal / bb) * 10) / 10, flags,
  });
  // 5) eliminações (uma regra só: eliminatorOf)
  const elims: { victimId: PlayerId; byId: PlayerId | null; hand: number }[] = [];
  const persons = cfg.people ?? [HUMAN];
  for (const e of result.eliminated) {
    const byId = eliminatorOf(result, e.playerId, persons);
    st.places[e.playerId] = e.place;
    st.eliminatedBy[e.playerId] = byId;
    elims.push({ victimId: e.playerId, byId, hand: n });
    emit(ctx, { type: 'eliminated', playerId: e.playerId, place: e.place, byId, handNumber: n });
    const ps = st.people?.[e.playerId];
    if (ps && ps.status === 'playing') setOut(ps, e.place, ps.leaving ?? 'eliminated');
  }
  // 5b) mesa de amigos: quem saiu no meio deixa a mesa agora (as fichas saem com a pessoa)
  if (st.people) {
    for (const id of persons) {
      const ps = st.people[id];
      if (ps.status === 'playing' && ps.leaving) removeLeaver(ctx, id, n, elims);
    }
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
    for (const [id, cards] of Object.entries(revealedNow(st))) if (cards.length === 2) shown[id] = cards;
    for (const [id, mem] of Object.entries(st.bots)) {
      const alive = g.players.some((p) => p.id === id && p.status !== 'eliminated');
      if (!mem.model || !cfg.profiles[id]?.model.enabled || !alive) continue;
      updateModel(mem.model, result, shown);
      if (st.people) {
        // Mesa de amigos: uma leitura por pessoa que ainda joga.
        if (st.status !== 'running') continue;
        const by = mem.labelsBy ?? (mem.labelsBy = {} as Record<PlayerId, StyleLabel[]>);
        for (const pid of persons) {
          const c = mem.model[pid];
          if (!c || st.people[pid].status !== 'playing' || st.people[pid].leaving) continue;
          const done = by[pid] ?? (by[pid] = []);
          for (const label of labelsOf(c, cfg.difficulty.adaptDelay)) {
            if (done.includes(label)) continue;
            done.push(label);
            emit(ctx, { type: 'styleRead', by: id, targetId: pid, label });
          }
        }
        continue;
      }
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
  if (st.tallies) {
    // Mesa de amigos: os números de cada pessoa (só conta a mão de quem recebeu cartas).
    if (!ctx.completing) {
      for (const pid of persons) {
        const t = st.tallies[pid];
        if (!t) continue;
        updateTally(t, {
          result, bb, holes, flags, potTotal, odds, humanStackAfter: playerOf(g, pid).stack, eliminations: elims,
          potBonus: fxEnd.potBonus[pid] ?? 0, repeats: extraCards.length > 0,
        }, pid);
      }
    }
  } else if (st.status === 'running' && !tutorial) {
    updateTally(st.tally, {
      result, bb, holes, flags, potTotal, odds, humanStackAfter: playerOf(g, HUMAN).stack, eliminations: elims,
      potBonus: fxEnd.potBonus[HUMAN] ?? 0, repeats: extraCards.length > 0,
    });
  }
  // 9) último pote sem showdown (para o "Mostrar")
  if (!result.wentToShowdown && result.winnerIds.length === 1) {
    const w = result.winnerIds[0];
    const mine = isPerson(st, w) ? holes[w] : undefined;
    st.lastUncontested = {
      hand: n, playerId: w, shown: shownAfter.some((s) => s.playerId === w) || isRevealed(st, playerOf(g, w)),
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
  if (st.people) {
    if (ctx.completing) return;
    if (g.phase === 'gameOver' || !anyPlaying(st)) {
      // Quem termina a mesa é o laço (runUntilHuman): os oráculos ainda podem ter de jogar sozinhos.
      ctx.finishPending = true;
      return;
    }
    const aliveNow = g.players.filter(isAlive);
    if (aliveNow.length === 2 && Object.keys(result.startStacks).length >= 3) {
      emit(ctx, { type: 'headsUp', ids: [aliveNow[0].id, aliveNow[1].id], handNumber: n + 1 });
    }
    return;
  }
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

function processEngine(ctx: StepCtx, events: PokerEvent[], boardBefore: Card[], afterAction?: () => void): void {
  const st = ctx.st;
  let board = boardBefore.slice();
  let runout: { board: Card[]; hands: { playerId: string; cards: Card[] }[] } | null = null;
  let result: HandResult | null = null;
  const n = st.game.handNumber;
  for (const e of events) {
    if (e.type === 'streetDealt' && e.street === 'river') beforeRiver(ctx, n, e.cards.length);
    if (e.type === 'handStarted') emit(ctx, { ...e, level: levelFor(e.handNumber, st.config.settings) });
    else emit(ctx, e);
    if (e.type === 'handStarted') onHandStarted(ctx, e.handNumber);
    else if (e.type === 'holeCardsDealt') onHoleCards(ctx, n, e.hands);
    else if (e.type === 'actionTaken') afterAction?.();
    if (e.type === 'streetDealt') board = e.board.slice();
    else if (e.type === 'allInRunout') runout = { board: board.slice(), hands: e.hands.map((h) => ({ playerId: h.playerId, cards: h.cards.slice() })) };
    else if (e.type === 'handComplete') result = e.result;
  }
  if (result) closeHand(ctx, result, runout);
}

/**
 * Começa a próxima mão. `testPreset` (SÓ testes: cenários exatos de combinação de efeitos)
 * fixa cartas como o preset do treino; nunca vem de fora.
 */
export function startNextHand(ctx: StepCtx, testPreset?: { holeCards?: Record<string, Card[]>; board?: Card[] }): void {
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
    : testPreset;
  const fx = handFxFor(st, n);
  const r = startHand(g, {
    ...(preset ? { preset: { holeCards: preset.holeCards, board: preset.board } } : {}),
    ...(fx ? { fx } : {}),
  });
  st.game = r.state;
  processEngine(ctx, r.events, []);
}

/** Aplica uma ação (da pessoa ou de bot) e processa o que o motor devolveu. */
export function applyAndProcess(ctx: StepCtx, id: string, action: PlayerAction, bot: BotChoice | null, auto?: AutoActionKind): void {
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
  emit(ctx, {
    type: 'actionMeta', playerId: id, handNumber, stackBefore, sizeClass, ...(botMeta ? { bot: botMeta } : {}), ...(auto ? { auto } : {}),
  });
  st.game = r.state;
  // O tique (efeito tell) sai logo depois da aposta/aumento do oráculo.
  const aggr = bot && (rec.type === 'bet' || rec.type === 'raise');
  processEngine(ctx, r.events, boardBefore, aggr ? () => onBotAggression(ctx, handNumber, id, bot!.bucket, bot!.monster) : undefined);
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

// ---------------------------------------------------------------------------
// Mesa de amigos (pacote E3, 03/11/2026): ação automática e fim da mesa
// ---------------------------------------------------------------------------

/** Ação automática pela pessoa: passa se puder, senão desiste (quem saiu sempre desiste). */
export function autoAct(ctx: StepCtx, id: string, auto: AutoActionKind): void {
  const g = ctx.st.game;
  const a = auto === 'left' ? { type: 'fold' as const } : timeoutAction(g, id);
  if (!a) throw new PokerRuleError('not_your_turn', `Não é a vez de ${id}.`);
  applyAndProcess(ctx, id, a, null, auto);
}

/** Sem pessoa jogando: os oráculos terminam a partida sozinhos (sem eventos), até 300 mãos. */
function completeWithBots(ctx: StepCtx): void {
  const st = ctx.st;
  const rec = ctx.record;
  const maxD = ctx.maxDecisions;
  ctx.record = false;
  ctx.completing = true;
  ctx.maxDecisions = Number.POSITIVE_INFINITY;
  const start = st.game.handNumber;
  try {
    while (st.game.phase !== 'gameOver' && st.game.handNumber - start < 300) {
      const g = st.game;
      if (g.phase !== 'betting') {
        startNextHand(ctx);
        continue;
      }
      const to = g.hand!.toActId;
      if (!to) break;
      if (isPerson(st, to)) autoAct(ctx, to, 'left');
      else botAct(ctx, to);
    }
  } finally {
    ctx.record = rec;
    ctx.completing = false;
    ctx.maxDecisions = maxD;
  }
  // Ninguém viu essas mãos: a visão final não mostra o board nem cartas delas (só cacifes e colocações).
  if (st.game.handNumber > start) {
    const g = st.game;
    st.game = { ...g, hand: null, players: g.players.map((p) => ({ ...p, holeCards: [], showCards: false })) };
    delete st.revealed;
    for (const fx of st.fxs ?? []) fx.revealed = null;
  }
}

/** Fim da mesa de amigos: colocações de todos, vencedor e o matchEnded (com `people`). */
export function finishFriends(ctx: StepCtx): void {
  const st = ctx.st;
  if (st.game.phase === 'betting' || (st.game.phase !== 'gameOver' && st.game.players.filter((p) => isAlive(p) && p.stack > 0).length >= 2)) {
    completeWithBots(ctx);
  }
  const g = st.game;
  // Passou do limite de mãos: vence o maior cacife; os outros vivos pela ordem dos cacifes.
  const alive = g.players.filter((p) => isAlive(p) && st.places[p.id] === undefined).sort((p, q) => q.stack - p.stack || p.seat - q.seat);
  alive.forEach((p, k) => {
    st.places[p.id] = k + 1;
  });
  const winnerId = (g.winnerId ?? alive[0]?.id ?? Object.keys(st.places).find((k) => st.places[k] === 1) ?? null) as PlayerId | null;
  if (winnerId) st.places[winnerId] = 1;
  const people: Record<string, { place: number; reason: EndReasonPublic }> = {};
  for (const [id, ps] of Object.entries(st.people ?? {})) {
    if (ps.status === 'playing') {
      ps.place = st.places[id];
      ps.reason = id === winnerId ? 'won' : 'eliminated';
      ps.status = id === winnerId ? 'playing' : 'out';
    }
    people[id] = { place: ps.place ?? st.places[id] ?? g.players.length, reason: ps.reason ?? 'eliminated' };
  }
  st.status = 'finished';
  const winnerIsPerson = !!winnerId && isPerson(st, winnerId);
  emit(ctx, {
    type: 'matchEnded', places: { ...st.places } as Record<PlayerId, number>, winnerId, humanPlace: 0,
    reason: winnerIsPerson ? 'won' : 'eliminated', prizeCaptured: false, people: people as Record<PlayerId, { place: number; reason: EndReasonPublic }>,
  });
}

/**
 * Roda até a vez de uma pessoa presente, o fim da partida para ela, ou o fim do treino.
 * Mesa de amigos: quem saiu desiste na hora; quem está ausente passa/desiste na hora, a
 * menos que todas as pessoas que ainda jogam estejam ausentes (aí a mesa espera o relógio).
 */
export function runUntilHuman(ctx: StepCtx): void {
  for (;;) {
    const st = ctx.st;
    if (ctx.finishPending) {
      ctx.finishPending = false;
      finishFriends(ctx);
      return;
    }
    const g = st.game;
    if (st.status !== 'running' || g.phase === 'gameOver') return;
    if (g.phase !== 'betting') {
      startNextHand(ctx);
      continue;
    }
    const to = g.hand!.toActId;
    if (!to) return;
    if (!isPerson(st, to)) {
      botAct(ctx, to);
      continue;
    }
    const ps = st.people?.[to];
    if (ps?.leaving) {
      autoAct(ctx, to, 'left');
      continue;
    }
    if (ps?.away && someonePresent(st)) {
      autoAct(ctx, to, 'away');
      continue;
    }
    return;
  }
}
