// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/effects.ts
/**
 * Pôster Poker (BRIEF2, 03/11/2026): o pôster mágico do torneio da semana e os seus 9 efeitos.
 *
 * Tudo sai da semente: o cronograma (`<semente>:effect`), na criação da partida, e cada
 * sorteio de um efeito num fluxo próprio (`<semente>:effect:<efeito>:…`). O estado mora em
 * `MatchStateX.fx` (privado; o cronograma nunca sai para o cliente — só cada lançada, no
 * `effectCast`). Na mesa livre (e no treino) não há efeito: `fx` fica ausente.
 *
 * Quando cada efeito age:
 *  - eight_aces: logo depois do matchStarted (8 ases a mais no baralho, a partida inteira);
 *  - early_flop, double_pot, blackjack, reveal_one, tell, hand_bounty, opal: no começo da
 *    mão sorteada (logo depois do handStarted, antes das cartas);
 *  - sixth_card: armado a partir da mão sorteada; lança logo antes do river da primeira mão
 *    que chegar lá (o motor já sabe, desde o começo da mão armada, que o river terá 2 cartas).
 * Bônus da casa (double_pot, blackjack, hand_bounty, opal) entram no cacife no fim da mão,
 * antes do resumo (o `net` público já os inclui), e só para quem continua vivo depois da mão.
 */
import type { Card } from '../cards.ts';
import { fullDeck, rankOf } from '../cards.ts';
import type { HandFx, HandResult, PlayerState } from '../engine.ts';
import { MAX_SEATS } from '../engine.ts';
import type { HandKind } from '../evaluator.ts';
import { HAND_KINDS, evaluateHand } from '../evaluator.ts';
import { effectParams } from '../config.ts';
import { createRng } from '../rng.ts';
import type { EffectCastData, MatchConfig, PlayerId, PosterEffectId, TableView } from '../types.ts';
import type { EffectReveal, FxState, MatchStateX, StepCtx } from './internal.ts';
import { HUMAN, cloneCast, emit, markRevealed, playerOf } from './internal.ts';

/** Os 8 ases a mais do Cassino: 2 de cada naipe. */
export const EXTRA_ACES: readonly Card[] = ['As', 'As', 'Ah', 'Ah', 'Ad', 'Ad', 'Ac', 'Ac'];

/** Efeitos que agem na mão inteira em que lançam (o sixth_card lança antes do river). */
const HAND_EFFECTS: ReadonlySet<PosterEffectId> = new Set(['early_flop', 'double_pot', 'blackjack', 'reveal_one', 'tell', 'hand_bounty', 'opal']);

/** Jogada-alvo do Rain Man: dois pares 30%, trinca 40%, sequência 20%, flush 10%. */
const BOUNTY_TARGETS: readonly [HandKind, number][] = [['two_pair', 0.3], ['trips', 0.4], ['straight', 0.2], ['flush', 0.1]];

/** Mão "sem fim" para efeitos que valem até serem levados (ou a partida toda). */
const FOREVER = 1_000_000;

// ---------------------------------------------------------------------------
// Utilidades públicas
// ---------------------------------------------------------------------------

/** Valor de blackjack das cartas: Ás 11 ou 1, figuras e 10 valem 10. */
export function blackjackValue(cards: readonly Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 14) {
      aces++;
      total += 11;
    } else {
      total += r >= 10 ? 10 : r;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/** O torneio desta partida tem efeito? (só no modo 'bounty' com `tournament`). */
export function hasEffects(cfg: MatchConfig): boolean {
  return cfg.mode === 'bounty' && !!cfg.tournament;
}

/** Cartas a mais no baralho desta partida (público: anunciado no effectCast do Cassino). */
export function extraCardsOf(st: MatchStateX): Card[] {
  const fx = st.fx;
  return fx && fx.effect === 'eight_aces' && fx.castNo > 0 ? EXTRA_ACES.slice() : [];
}

// ---------------------------------------------------------------------------
// Criação e cronograma
// ---------------------------------------------------------------------------

/** Estado inicial dos efeitos (undefined fora do torneio). */
export function initEffects(cfg: MatchConfig): FxState | undefined {
  if (!hasEffects(cfg)) return undefined;
  const effect = cfg.tournament!.effect;
  const params = effectParams(cfg.settings, effect);
  const rng = createRng(`${cfg.seed}:effect`);
  const schedule: number[] = [];
  if (effect !== 'eight_aces') {
    const [lo, hi] = params.firstHand;
    let h = lo + rng.nextInt(hi - lo + 1);
    for (let k = 0; k < params.casts; k++) {
      schedule.push(h);
      h += params.gapHands + rng.nextInt((params.spread ?? 3) + 1);
    }
  } else if (params.casts > 0) {
    schedule.push(0);
  }
  return {
    effect, params, schedule, castNo: 0, lastCastHand: null, active: null, activeFrom: 0, activeTo: -1,
    claimed: false, revealed: null, bonusWon: 0,
  };
}

/** Primeira mão em que a próxima lançada pode sair (FOREVER = acabaram). */
function nextArm(fx: FxState): number {
  if (fx.castNo >= fx.schedule.length) return FOREVER;
  const s = fx.schedule[fx.castNo];
  return fx.lastCastHand === null ? s : Math.max(s, fx.lastCastHand + fx.params.gapHands);
}

function isActiveAt(fx: FxState, n: number): boolean {
  return fx.active !== null && n >= fx.activeFrom && n <= fx.activeTo;
}

function addRevealed(fx: FxState, n: number, cards: EffectReveal[]): void {
  if (!fx.revealed || fx.revealed.hand !== n) fx.revealed = { hand: n, cards: [] };
  for (const c of cards) {
    const prev = fx.revealed.cards.find((r) => r.playerId === c.playerId);
    if (!prev) fx.revealed.cards.push({ playerId: c.playerId, cards: c.cards.slice() });
    else if (c.cards.length >= prev.cards.length) prev.cards = c.cards.slice();
  }
}

function cast(ctx: StepCtx, hand: number, data: EffectCastData, from: number, to: number): void {
  const fx = ctx.st.fx!;
  fx.castNo += 1;
  fx.lastCastHand = hand;
  fx.active = data;
  fx.activeFrom = from;
  fx.activeTo = to;
  emit(ctx, { type: 'effectCast', effect: fx.effect, handNumber: hand, castNo: fx.castNo, data: cloneCast(data) });
}

// ---------------------------------------------------------------------------
// Ganchos da camada de partida
// ---------------------------------------------------------------------------

/** Logo depois do matchStarted: o Cassino lança aqui. */
export function onMatchStarted(ctx: StepCtx): void {
  const fx = ctx.st.fx;
  if (!fx || fx.effect !== 'eight_aces' || fx.castNo >= fx.schedule.length) return;
  cast(ctx, 0, { effect: 'eight_aces', added: EXTRA_ACES.slice() }, 0, FOREVER);
}

/** Opções do motor para a mão `n` (cartas a mais, flop antecipado, river de 2). */
export function handFxFor(st: MatchStateX, n: number): HandFx | undefined {
  const fx = st.fx;
  if (!fx) return undefined;
  const out: HandFx = {};
  if (fx.effect === 'eight_aces' && fx.castNo > 0) out.extraCards = EXTRA_ACES.slice();
  const due = n >= nextArm(fx);
  if (due && fx.effect === 'early_flop') out.earlyFlop = true;
  if (due && fx.effect === 'sixth_card') out.riverCards = 2;
  return out.extraCards || out.earlyFlop || out.riverCards ? out : undefined;
}

/** Logo depois do handStarted: efeitos de mão lançam aqui. */
export function onHandStarted(ctx: StepCtx, n: number): void {
  const fx = ctx.st.fx;
  if (!fx) return;
  if (fx.revealed && fx.revealed.hand !== n) fx.revealed = null;
  if (!HAND_EFFECTS.has(fx.effect) || n < nextArm(fx)) return;
  const seed = ctx.st.config.seed;
  const amount = fx.params.amount ?? 0;
  switch (fx.effect) {
    case 'hand_bounty': {
      const u = createRng(`${seed}:effect:hand_bounty:${fx.castNo + 1}`).nextFloat();
      let acc = 0;
      let target: HandKind = 'trips';
      for (const [kind, w] of BOUNTY_TARGETS) {
        acc += w;
        if (u < acc) {
          target = kind;
          break;
        }
      }
      fx.claimed = false;
      cast(ctx, n, { effect: 'hand_bounty', target, amount }, n, FOREVER);
      return;
    }
    case 'opal': {
      const card = fullDeck()[createRng(`${seed}:effect:opal:${fx.castNo + 1}`).nextInt(52)];
      fx.claimed = false;
      cast(ctx, n, { effect: 'opal', card, amount }, n, FOREVER);
      return;
    }
    case 'blackjack':
      cast(ctx, n, { effect: 'blackjack', amount }, n, n);
      return;
    case 'tell': {
      const hands = fx.params.hands ?? 3;
      cast(ctx, n, { effect: 'tell', hands }, n, n + hands - 1);
      return;
    }
    case 'early_flop':
    case 'double_pot':
    case 'reveal_one':
      cast(ctx, n, { effect: fx.effect }, n, n);
      return;
    default:
      return;
  }
}

/** Depois das cartas fechadas: a leitura (reveal_one) vira uma carta de cada um. */
export function onHoleCards(ctx: StepCtx, n: number, hands: { playerId: string; cards: Card[] }[]): void {
  const fx = ctx.st.fx;
  if (!fx || fx.effect !== 'reveal_one' || !isActiveAt(fx, n)) return;
  const rng = createRng(`${ctx.st.config.seed}:effect:reveal_one:${n}`);
  const cards: EffectReveal[] = [];
  for (const h of hands) {
    if (h.cards.length !== 2) continue;
    cards.push({ playerId: h.playerId as PlayerId, cards: [h.cards[rng.nextInt(2)]] });
  }
  addRevealed(fx, n, cards);
  emit(ctx, { type: 'effectReveal', effect: 'reveal_one', handNumber: n, cards: cards.map((c) => ({ playerId: c.playerId, cards: c.cards.slice() })) });
}

/** Logo antes do river: o Onze Homens lança quando o river vem com 2 cartas. */
export function beforeRiver(ctx: StepCtx, n: number, riverCards: number): void {
  const fx = ctx.st.fx;
  if (!fx || fx.effect !== 'sixth_card' || riverCards !== 2) return;
  cast(ctx, n, { effect: 'sixth_card' }, n, n);
}

/** O tique de Le Chiffre: depois de cada aposta/aumento de oráculo nas mãos do efeito. */
export function onBotAggression(ctx: StepCtx, n: number, playerId: string, bucket: string | null, monster: boolean): void {
  const fx = ctx.st.fx;
  if (!fx || fx.effect !== 'tell' || !isActiveAt(fx, n)) return;
  const weak = bucket === 'weak' || bucket === 'draw' || bucket === 'air';
  emit(ctx, { type: 'tellMark', handNumber: n, playerId, mark: weak && !monster ? 'blefe' : 'valor' });
}

// ---------------------------------------------------------------------------
// Fim de mão: revelações e bônus da casa
// ---------------------------------------------------------------------------

function seatDistance(seat: number, buttonSeat: number): number {
  const d = (seat - buttonSeat + MAX_SEATS) % MAX_SEATS;
  return d === 0 ? MAX_SEATS : d;
}

/** Divide `amount` entre `ids`; a ficha que sobra vai a partir do primeiro à esquerda do botão. */
function split(st: MatchStateX, ids: string[], amount: number, buttonSeat: number): { playerId: string; amount: number }[] {
  const seat = (id: string): number => playerOf(st.game, id).seat;
  const order = ids.slice().sort((a, b) => seatDistance(seat(a), buttonSeat) - seatDistance(seat(b), buttonSeat));
  const share = Math.floor(amount / order.length);
  const rest = amount - share * order.length;
  return order.map((playerId, i) => ({ playerId, amount: share + (i < rest ? 1 : 0) }));
}

function alive(p: PlayerState): boolean {
  return p.status !== 'eliminated';
}

/**
 * Fim da mão: viradas e bônus do efeito, já somados ao cacife. Devolve o bônus de cada um
 * (para o `net` do resumo) e a parte do Dinheiro dobrado (o "pote" da pessoa no placar).
 */
export function onHandEnd(ctx: StepCtx, result: HandResult): { bonus: Record<string, number>; potBonus: Record<string, number> } {
  const st = ctx.st;
  const fx = st.fx;
  const bonus: Record<string, number> = {};
  const potBonus: Record<string, number> = {};
  if (!fx) return { bonus, potBonus };
  const g = st.game;
  const n = result.handNumber;
  const dealt = g.players.filter((p) => result.startStacks[p.id] !== undefined && p.holeCards.length === 2);
  const repeats = fx.effect === 'eight_aces';
  const pay = (effect: PosterEffectId, list: { playerId: string; amount: number }[]): void => {
    for (const w of list) {
      if (w.amount <= 0) continue;
      const p = playerOf(g, w.playerId);
      if (!alive(p)) continue;
      p.stack += w.amount;
      bonus[w.playerId] = (bonus[w.playerId] ?? 0) + w.amount;
      if (effect === 'double_pot') potBonus[w.playerId] = (potBonus[w.playerId] ?? 0) + w.amount;
      if (w.playerId === HUMAN) fx.bonusWon += w.amount;
      emit(ctx, { type: 'effectBonus', effect, handNumber: n, playerId: w.playerId as PlayerId, amount: w.amount });
    }
  };
  const reveal = (effect: 'blackjack' | 'hand_bounty' | 'opal', cards: EffectReveal[]): void => {
    if (cards.length === 0) return;
    addRevealed(fx, n, cards);
    for (const c of cards) if (c.cards.length === 2) markRevealed(st, c.playerId);
    emit(ctx, { type: 'effectReveal', effect, handNumber: n, cards: cards.map((c) => ({ playerId: c.playerId, cards: c.cards.slice() })) });
  };

  if (fx.effect === 'double_pot' && isActiveAt(fx, n)) {
    // A casa dobra cada pote: o vencedor recebe de novo o que levou (somando os potes dele).
    const won: Record<string, number> = {};
    const order: string[] = [];
    for (const pot of result.pots) {
      for (const w of pot.winners) {
        if (w.amount <= 0) continue;
        if (won[w.playerId] === undefined) order.push(w.playerId);
        won[w.playerId] = (won[w.playerId] ?? 0) + w.amount;
      }
    }
    pay('double_pot', order.map((id) => ({ playerId: id, amount: won[id] })));
  }

  if (fx.effect === 'blackjack' && isActiveAt(fx, n)) {
    reveal('blackjack', dealt.map((p) => ({ playerId: p.id as PlayerId, cards: p.holeCards.slice() })));
    const live = dealt.filter(alive);
    let best = -1;
    for (const p of live) best = Math.max(best, blackjackValue(p.holeCards));
    const winners = live.filter((p) => blackjackValue(p.holeCards) === best).map((p) => p.id);
    if (winners.length > 0) pay('blackjack', split(st, winners, fx.params.amount ?? 0, result.buttonSeat));
  }

  if (fx.effect === 'hand_bounty' && fx.active?.effect === 'hand_bounty' && !fx.claimed && n >= fx.activeFrom) {
    // Quem chegou ao fim sem desistir (showdown, ou o único que sobrou) e continua vivo.
    const target = HAND_KINDS.indexOf(fx.active.target);
    const finalists = result.wentToShowdown
      ? result.shown.map((s) => playerOf(g, s.playerId))
      : dealt.filter((p) => result.winnerIds.includes(p.id));
    let best = -1;
    const scores: Record<string, number> = {};
    for (const p of finalists) {
      if (!alive(p)) continue;
      const v = evaluateHand([...p.holeCards, ...result.board], { repeats });
      if (v.category < target) continue;
      scores[p.id] = v.score;
      best = Math.max(best, v.score);
    }
    const winners = Object.keys(scores).filter((id) => scores[id] === best);
    if (winners.length > 0) {
      if (!result.wentToShowdown) reveal('hand_bounty', winners.map((id) => ({ playerId: id as PlayerId, cards: playerOf(g, id).holeCards.slice() })));
      fx.claimed = true;
      fx.activeTo = n;
      pay('hand_bounty', split(st, winners, fx.params.amount ?? 0, result.buttonSeat));
    }
  }

  if (fx.effect === 'opal' && fx.active?.effect === 'opal' && !fx.claimed && n >= fx.activeFrom) {
    const opal = fx.active.card;
    const holder = dealt.find((p) => p.holeCards.includes(opal));
    if (holder && alive(holder) && result.winnerIds.includes(holder.id)) {
      if (!result.wentToShowdown) reveal('opal', [{ playerId: holder.id as PlayerId, cards: [opal] }]);
      fx.claimed = true;
      fx.activeTo = n;
      pay('opal', [{ playerId: holder.id, amount: fx.params.amount ?? 0 }]);
    }
  }
  return { bonus, potBonus };
}

// ---------------------------------------------------------------------------
// Visão e resumo
// ---------------------------------------------------------------------------

export function tournamentView(st: MatchStateX): TableView['tournament'] {
  const t = st.config.tournament;
  if (!t || st.config.mode !== 'bounty') return null;
  const fx = st.fx;
  const n = st.game.handNumber;
  return {
    prizeId: t.prizeId, rarity: t.rarity, effect: t.effect, cobraItem: t.cobraItem,
    casts: fx?.castNo ?? 0,
    active: fx && isActiveAt(fx, n) ? cloneCast(fx.active!) : null,
    revealed: fx?.revealed && fx.revealed.hand === n ? fx.revealed.cards.map((r) => ({ playerId: r.playerId, cards: r.cards.slice() })) : [],
  };
}

/** Cartas viradas por efeito nesta mão, por jogador (para o BotView). */
export function revealedNow(st: MatchStateX): Record<string, Card[]> {
  const out: Record<string, Card[]> = {};
  const fx = st.fx;
  if (!fx?.revealed || fx.revealed.hand !== st.game.handNumber) return out;
  for (const r of fx.revealed.cards) out[r.playerId] = r.cards.slice();
  return out;
}
