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
 *
 * Pacote E3 (03/11/2026): a mesa de amigos tem uma LISTA de efeitos (`MatchStateX.fxs`, um
 * estado por efeito distinto, na ordem fixa EFFECT_ORDER, com `level` = pôsteres iguais e os
 * números de config.ts stackedParams). O torneio continua com o efeito único em `fx` e o mesmo
 * comportamento de antes (mesmos fluxos de RNG, mesmos eventos). Todos os ganchos percorrem a
 * lista (`fxList`). Regras de convivência:
 *  - os cronogramas são independentes (fluxo `<semente>:effect:<efeito>`); vários efeitos podem
 *    lançar na mesma mão, cada um com o seu `effectCast` (na ordem fixa);
 *  - cartas viradas por efeitos diferentes na mesma mão se somam por jogador (união de
 *    multiconjunto: com os ases repetidos do Cassino, [A♠] ∪ [A♠ A♠] = [A♠ A♠]); durante a mão
 *    só a leitura vira carta (1 por jogador); o resto vira no fim da mão;
 *  - bônus do fim da mão, nesta ordem: Dinheiro dobrado (só os potes) → 21 → Raymond → opala;
 *    cada um é pago à parte e todos se somam (nenhum bônus é dobrado);
 *  - o baralho com repetidas (Cassino) vale para todos os efeitos (avaliação com repeats);
 *  - opala com o Cassino: se a opala é um ás, pode haver mais de um dono — quem levar pote com
 *    ela divide o bônus;
 *  - quem saiu no meio (mesa de amigos) não ganha bônus e não concorre ao Raymond nem à opala.
 */
import type { Card } from '../cards.ts';
import { fullDeck, rankOf } from '../cards.ts';
import type { HandFx, HandResult, PlayerState } from '../engine.ts';
import { MAX_SEATS } from '../engine.ts';
import type { HandKind } from '../evaluator.ts';
import { HAND_KINDS, evaluateHand } from '../evaluator.ts';
import { effectLevels, effectParams, stackedParams } from '../config.ts';
import { createRng } from '../rng.ts';
import type { EffectCastData, MatchConfig, PlayerId, PosterEffectId, TableView } from '../types.ts';
import type { EffectReveal, FxState, MatchStateX, StepCtx } from './internal.ts';
import { HUMAN, cloneCast, emit, fxList, isPerson, isRevealed, markRevealed, playerOf } from './internal.ts';

/** Os 8 ases a mais do Cassino: 2 de cada naipe. */
export const EXTRA_ACES: readonly Card[] = ['As', 'As', 'Ah', 'Ah', 'Ad', 'Ad', 'Ac', 'Ac'];

/** Efeitos que agem na mão inteira em que lançam (o sixth_card lança antes do river). */
const HAND_EFFECTS: ReadonlySet<PosterEffectId> = new Set(['early_flop', 'double_pot', 'blackjack', 'reveal_one', 'tell', 'hand_bounty', 'opal']);
/** Efeitos que valem até alguém levar (na mesa de amigos podem lançar de novo depois disso). */
const UNTIL_CLAIMED: ReadonlySet<PosterEffectId> = new Set(['hand_bounty', 'opal']);

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

/** A partida tem efeito? (torneio com `tournament`, ou mesa de amigos com pôsteres de efeito). */
export function hasEffects(cfg: MatchConfig): boolean {
  if (cfg.mode === 'bounty') return !!cfg.tournament;
  return cfg.mode === 'friends' && effectLevels(cfg.effects).length > 0;
}

/** Cartas a mais no baralho desta partida (público: anunciado no effectCast do Cassino). */
export function extraCardsOf(st: MatchStateX): Card[] {
  for (const fx of fxList(st)) if (fx.effect === 'eight_aces' && fx.castNo > 0) return EXTRA_ACES.slice();
  return [];
}

// ---------------------------------------------------------------------------
// Criação e cronograma
// ---------------------------------------------------------------------------

/** Estado inicial do efeito do torneio (undefined fora do torneio). */
export function initEffects(cfg: MatchConfig): FxState | undefined {
  if (cfg.mode !== 'bounty' || !cfg.tournament) return undefined;
  const effect = cfg.tournament.effect;
  return newFx(effect, effectParams(cfg.settings, effect), `${cfg.seed}:effect`);
}

/** Pacote E3: efeitos da mesa de amigos (um estado por efeito distinto; undefined sem efeitos). */
export function initEffectList(cfg: MatchConfig): FxState[] | undefined {
  if (cfg.mode !== 'friends') return undefined;
  const levels = effectLevels(cfg.effects);
  if (levels.length === 0) return undefined;
  return levels.map(({ effect, level }) => ({
    ...newFx(effect, stackedParams(cfg.settings, effect, level), `${cfg.seed}:effect:${effect}`),
    level, bonusBy: {}, paid: 0,
  }));
}

function newFx(effect: PosterEffectId, params: FxState['params'], schedKey: string): FxState {
  const rng = createRng(schedKey);
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
  if (fx.lastCastHand === null) return s;
  // Raymond e opala com mais de uma lançada (mesa de amigos): a seguinte só depois de alguém
  // levar a anterior, `gapHands` mãos depois. (No torneio lançam uma vez só: não chega aqui.)
  if (UNTIL_CLAIMED.has(fx.effect)) return fx.claimed ? Math.max(s, fx.activeTo + fx.params.gapHands) : FOREVER;
  return Math.max(s, fx.lastCastHand + fx.params.gapHands);
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

function cast(ctx: StepCtx, fx: FxState, hand: number, data: EffectCastData, from: number, to: number): void {
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
  for (const fx of fxList(ctx.st)) {
    if (fx.effect !== 'eight_aces' || fx.castNo >= fx.schedule.length) continue;
    cast(ctx, fx, 0, { effect: 'eight_aces', added: EXTRA_ACES.slice() }, 0, FOREVER);
  }
}

/** Opções do motor para a mão `n` (cartas a mais, flop antecipado, river de 2). */
export function handFxFor(st: MatchStateX, n: number): HandFx | undefined {
  const list = fxList(st);
  if (list.length === 0) return undefined;
  const out: HandFx = {};
  const extra = extraCardsOf(st);
  if (extra.length > 0) out.extraCards = extra;
  for (const fx of list) {
    const due = n >= nextArm(fx);
    if (due && fx.effect === 'early_flop') out.earlyFlop = true;
    if (due && fx.effect === 'sixth_card') out.riverCards = 2;
  }
  return out.extraCards || out.earlyFlop || out.riverCards ? out : undefined;
}

/** Logo depois do handStarted: efeitos de mão lançam aqui (vários, na ordem fixa). */
export function onHandStarted(ctx: StepCtx, n: number): void {
  for (const fx of fxList(ctx.st)) castAtHandStart(ctx, fx, n);
}

function castAtHandStart(ctx: StepCtx, fx: FxState, n: number): void {
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
      cast(ctx, fx, n, { effect: 'hand_bounty', target, amount }, n, FOREVER);
      return;
    }
    case 'opal': {
      const card = fullDeck()[createRng(`${seed}:effect:opal:${fx.castNo + 1}`).nextInt(52)];
      fx.claimed = false;
      cast(ctx, fx, n, { effect: 'opal', card, amount }, n, FOREVER);
      return;
    }
    case 'blackjack':
      cast(ctx, fx, n, { effect: 'blackjack', amount }, n, n);
      return;
    case 'tell': {
      const hands = fx.params.hands ?? 3;
      cast(ctx, fx, n, { effect: 'tell', hands }, n, n + hands - 1);
      return;
    }
    case 'early_flop':
    case 'double_pot':
    case 'reveal_one':
      cast(ctx, fx, n, { effect: fx.effect }, n, n);
      return;
    default:
      return;
  }
}

/** Depois das cartas fechadas: a leitura (reveal_one) vira uma carta de cada um. */
export function onHoleCards(ctx: StepCtx, n: number, hands: { playerId: string; cards: Card[] }[]): void {
  const fx = fxList(ctx.st).find((f) => f.effect === 'reveal_one');
  if (!fx || !isActiveAt(fx, n)) return;
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
  const fx = fxList(ctx.st).find((f) => f.effect === 'sixth_card');
  if (!fx || riverCards !== 2) return;
  cast(ctx, fx, n, { effect: 'sixth_card' }, n, n);
}

/** O tique de Le Chiffre: depois de cada aposta/aumento de oráculo nas mãos do efeito. */
export function onBotAggression(ctx: StepCtx, n: number, playerId: string, bucket: string | null, monster: boolean): void {
  const fx = fxList(ctx.st).find((f) => f.effect === 'tell');
  // O tique é só de oráculo: nunca sai para a ação de uma pessoa (nem a automática).
  if (!fx || !isActiveAt(fx, n) || isPerson(ctx.st, playerId)) return;
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

/** Pode receber bônus/concorrer: vivo depois da mão e não saiu da mesa (mesa de amigos). */
function eligible(st: MatchStateX, p: PlayerState): boolean {
  return alive(p) && !st.people?.[p.id]?.leaving;
}

/** União de multiconjunto (as duas listas são partes da mesma mão de 2 cartas). */
function unionCards(a: readonly Card[], b: readonly Card[]): Card[] {
  const out = a.slice();
  const left = a.slice();
  for (const c of b) {
    const k = left.indexOf(c);
    if (k >= 0) left.splice(k, 1);
    else out.push(c);
  }
  return out;
}

/** Cartas viradas por efeito na mão `n`, somadas entre os efeitos (por jogador). */
function revealedUnion(st: MatchStateX, n: number): EffectReveal[] {
  const list = fxList(st).filter((f) => f.revealed && f.revealed.hand === n);
  if (list.length === 1) return list[0].revealed!.cards.map((r) => ({ playerId: r.playerId, cards: r.cards.slice() }));
  const out: EffectReveal[] = [];
  for (const fx of list) {
    for (const r of fx.revealed!.cards) {
      const prev = out.find((o) => o.playerId === r.playerId);
      if (!prev) out.push({ playerId: r.playerId, cards: r.cards.slice() });
      else prev.cards = unionCards(prev.cards, r.cards);
    }
  }
  // Mão inteira aberta: na ordem das cartas do jogador.
  for (const o of out) {
    if (o.cards.length < 2) continue;
    const p = st.game.players.find((q) => q.id === o.playerId);
    if (p && p.holeCards.length === 2) o.cards = p.holeCards.slice();
  }
  return out;
}

/**
 * Fim da mão: viradas e bônus dos efeitos, já somados ao cacife. Devolve o bônus de cada um
 * (para o `net` do resumo) e a parte do Dinheiro dobrado (o "pote" da pessoa no placar).
 */
export function onHandEnd(ctx: StepCtx, result: HandResult): { bonus: Record<string, number>; potBonus: Record<string, number> } {
  const st = ctx.st;
  const list = fxList(st);
  const bonus: Record<string, number> = {};
  const potBonus: Record<string, number> = {};
  if (list.length === 0) return { bonus, potBonus };
  const g = st.game;
  const n = result.handNumber;
  const dealt = g.players.filter((p) => result.startStacks[p.id] !== undefined && p.holeCards.length === 2);
  const repeats = extraCardsOf(st).length > 0;
  const multi = !!st.fxs;
  for (const fx of list) {
    const pay = (effect: PosterEffectId, wins: { playerId: string; amount: number }[]): void => {
      for (const w of wins) {
        if (w.amount <= 0) continue;
        const p = playerOf(g, w.playerId);
        if (!eligible(st, p)) continue;
        p.stack += w.amount;
        bonus[w.playerId] = (bonus[w.playerId] ?? 0) + w.amount;
        if (effect === 'double_pot') potBonus[w.playerId] = (potBonus[w.playerId] ?? 0) + w.amount;
        if (w.playerId === HUMAN) fx.bonusWon += w.amount;
        if (fx.bonusBy && isPerson(st, w.playerId)) fx.bonusBy[w.playerId] = (fx.bonusBy[w.playerId] ?? 0) + w.amount;
        if (fx.paid !== undefined) fx.paid += w.amount;
        emit(ctx, { type: 'effectBonus', effect, handNumber: n, playerId: w.playerId as PlayerId, amount: w.amount });
      }
    };
    const reveal = (effect: 'blackjack' | 'hand_bounty' | 'opal', cards: EffectReveal[]): void => {
      // Mesa com vários efeitos: não vira de novo o que já está aberto (showdown, mostrada ou outro efeito).
      const fresh = multi ? cards.filter((c) => !alreadyOpen(st, n, c)) : cards;
      if (fresh.length === 0) return;
      addRevealed(fx, n, fresh);
      for (const c of fresh) if (c.cards.length === 2) markRevealed(st, c.playerId);
      emit(ctx, { type: 'effectReveal', effect, handNumber: n, cards: fresh.map((c) => ({ playerId: c.playerId, cards: c.cards.slice() })) });
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
      const live = dealt.filter((p) => eligible(st, p));
      let best = -1;
      for (const p of live) best = Math.max(best, blackjackValue(p.holeCards));
      const winners = live.filter((p) => blackjackValue(p.holeCards) === best).map((p) => p.id);
      if (winners.length > 0) pay('blackjack', split(st, winners, fx.params.amount ?? 0, result.buttonSeat));
    }

    if (fx.effect === 'hand_bounty' && fx.active?.effect === 'hand_bounty' && !fx.claimed && n >= fx.activeFrom) {
      // Quem chegou ao fim sem desistir (showdown, ou o único que sobrou) e continua vivo.
      const target = HAND_KINDS.indexOf(fx.active.target);
      const finalists = result.wentToShowdown
        ? result.shown.map((sh) => playerOf(g, sh.playerId))
        : dealt.filter((p) => result.winnerIds.includes(p.id));
      let best = -1;
      const scores: Record<string, number> = {};
      for (const p of finalists) {
        if (!eligible(st, p)) continue;
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
      // Com o Cassino a opala pode ser um ás repetido: quem levar pote com ela divide o bônus.
      const opal = fx.active.card;
      const holders = dealt.filter((p) => p.holeCards.includes(opal) && eligible(st, p) && result.winnerIds.includes(p.id));
      if (holders.length > 0) {
        if (!result.wentToShowdown) reveal('opal', holders.map((p) => ({ playerId: p.id as PlayerId, cards: [opal] })));
        fx.claimed = true;
        fx.activeTo = n;
        pay('opal', split(st, holders.map((p) => p.id), fx.params.amount ?? 0, result.buttonSeat));
      }
    }
  }
  return { bonus, potBonus };
}

/** As cartas `c` já estão abertas para todos nesta mão? (mesa com vários efeitos). */
function alreadyOpen(st: MatchStateX, n: number, c: EffectReveal): boolean {
  const p = st.game.players.find((q) => q.id === c.playerId);
  if (p && isRevealed(st, p)) return true;
  const prev = revealedUnion(st, n).find((r) => r.playerId === c.playerId);
  return !!prev && unionCards(prev.cards, c.cards).length === prev.cards.length;
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

/** Pacote E3: efeitos da mesa de amigos para a TableView (null sem efeitos). */
export function effectsView(st: MatchStateX): TableView['effects'] {
  const list = st.fxs;
  if (!list || list.length === 0) return null;
  const n = st.game.handNumber;
  return {
    list: list.map((fx) => ({
      effect: fx.effect, level: fx.level ?? 1, casts: fx.castNo, active: isActiveAt(fx, n) ? cloneCast(fx.active!) : null,
    })),
    revealed: revealedUnion(st, n),
  };
}

/** Cartas viradas por efeito nesta mão, por jogador (para o BotView). */
export function revealedNow(st: MatchStateX): Record<string, Card[]> {
  const out: Record<string, Card[]> = {};
  for (const r of revealedUnion(st, st.game.handNumber)) out[r.playerId] = r.cards;
  return out;
}

/** Bônus de efeito ganhos por `id` (resumo). */
export function bonusOf(st: MatchStateX, id: string): number {
  let sum = 0;
  for (const fx of fxList(st)) sum += fx.bonusBy ? fx.bonusBy[id] ?? 0 : id === HUMAN ? fx.bonusWon : 0;
  return sum;
}
