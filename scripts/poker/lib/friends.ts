/**
 * Pacote E3 (03/11/2026): apoio aos testes e ao simulador da mesa de amigos. Joga partidas
 * inteiras com várias pessoas agindo ao acaso (ou como um substituto do simulador), com
 * estouros do relógio, "Voltar", saídas no meio e ida e volta pelo JSON, e confere as regras
 * que valem para QUALQUER combinação de efeitos (fichas, vazamento, tique, board, colocações).
 */
import {
  applyPersonAction, createMatch, createRng, friendsResult, leavePerson, logHash, personBack, personLegal, tableView,
  timeoutPerson, toPublicEvents, totalChips, waitingFor, stackedParams, effectLevels,
} from '../../../src/lib/poker/index.ts';
import type {
  Card, LegalActions, MatchConfig, MatchEvent, MatchState, MatchStep, PlayerAction, PosterEffectId, PublicEvent, Rng,
} from '../../../src/lib/poker/index.ts';
import type { MatchStateX } from '../../../src/lib/poker/match/internal.ts';
import { check, eq, randomHumanAction } from './harness.ts';

export type FriendsOp =
  | { op: 'act'; id: string; a: PlayerAction; show: boolean }
  | { op: 'timeout'; id: string }
  | { op: 'back'; id: string }
  | { op: 'leave'; id: string; reason: 'forfeit' | 'abandoned' };

export interface FriendsPlay {
  cfg: MatchConfig;
  steps: MatchStep[];
  states: MatchState[];
  ops: FriendsOp[];
  priv: MatchEvent[];
  final: MatchState;
}

export interface FriendsPlayOpts {
  /** Ações da pessoa (padrão: legais ao acaso). */
  policy?: (id: string, L: LegalActions, rng: Rng, s: MatchState) => PlayerAction;
  /** Probabilidades por decisão. */
  pTimeout?: number; pLeave?: number; pLeaveOther?: number; pBack?: number; showProb?: number;
  /** Ida e volta pelo JSON antes de cada chamada (o servidor guarda o estado). */
  roundTrip?: boolean;
  /** Repetir exatamente estas operações. */
  replay?: FriendsOp[];
  maxOps?: number;
}

function apply(s: MatchState, op: FriendsOp): MatchStep {
  switch (op.op) {
    case 'act': return applyPersonAction(s, op.id, op.a, { show: op.show });
    case 'timeout': return timeoutPerson(s, op.id);
    case 'back': return personBack(s, op.id);
    default: return leavePerson(s, op.id, op.reason);
  }
}

/** Joga uma mesa de amigos inteira. */
export function playFriends(cfg: MatchConfig, seed: string, opts: FriendsPlayOpts = {}): FriendsPlay {
  const rng = createRng(seed);
  let step = createMatch(cfg);
  const steps: MatchStep[] = [step];
  const states: MatchState[] = [step.state];
  const ops: FriendsOp[] = [];
  const priv: MatchEvent[] = [...step.events];
  const people = cfg.people ?? [];
  const maxOps = opts.maxOps ?? 6000;
  for (let k = 0; step.state.status === 'running' && k < maxOps; k++) {
    const s = step.state;
    let op: FriendsOp | undefined = opts.replay?.[k];
    if (!op) {
      const sx = s as MatchStateX;
      const who = waitingFor(s);
      if (!who) throw new Error(`mesa de amigos parada sem ninguém para agir (mão ${s.game.handNumber})`);
      const playing = people.filter((id) => sx.people?.[id]?.status === 'playing' && !sx.people?.[id]?.leaving);
      const away = playing.filter((id) => sx.people?.[id]?.away && id !== who);
      if (away.length > 0 && rng.nextFloat() < (opts.pBack ?? 0.05)) op = { op: 'back', id: away[rng.nextInt(away.length)] };
      else if (rng.nextFloat() < (opts.pLeaveOther ?? 0.002) && playing.length > 1) {
        const others = playing.filter((id) => id !== who);
        op = { op: 'leave', id: others[rng.nextInt(others.length)], reason: rng.nextFloat() < 0.5 ? 'forfeit' : 'abandoned' };
      } else if (rng.nextFloat() < (opts.pLeave ?? 0.004)) op = { op: 'leave', id: who, reason: 'forfeit' };
      else if (rng.nextFloat() < (opts.pTimeout ?? 0.05)) op = { op: 'timeout', id: who };
      else {
        const L = personLegal(s, who);
        if (!L) throw new Error(`vez de ${who} sem ações legais`);
        const a = opts.policy ? opts.policy(who, L, rng, s) : randomHumanAction(L, rng);
        op = { op: 'act', id: who, a, show: rng.nextFloat() < (opts.showProb ?? 0.3) };
      }
    }
    ops.push(op);
    const from = opts.roundTrip ? (JSON.parse(JSON.stringify(s)) as MatchState) : s;
    step = apply(from, op);
    steps.push(step);
    states.push(step.state);
    priv.push(...step.events);
  }
  return { cfg, steps, states, ops, priv, final: step.state };
}

type Ev<T extends string> = Extract<MatchEvent, { type: T }>;

/** Cartas fechadas que `viewer` pode ver no estado (as dele + as abertas). */
function visibleTo(st: MatchStateX, viewer: string, id: string): boolean {
  if (id === viewer) return true;
  const p = st.game.players.find((q) => q.id === id)!;
  if (p.showCards) return true;
  return !!st.revealed && st.revealed.hand === st.game.handNumber && st.revealed.ids.includes(id);
}

export interface FriendsStats {
  hands: number; casts: Record<string, number>; bonus: number; leaves: number; timeouts: number; away: number;
  personWins: number; oracleWins: number; board6: number; fiveKind: number; tells: number; multiCastHands: number;
}

export function emptyFriendsStats(): FriendsStats {
  return { hands: 0, casts: {}, bonus: 0, leaves: 0, timeouts: 0, away: 0, personWins: 0, oracleWins: 0, board6: 0, fiveKind: 0, tells: 0, multiCastHands: 0 };
}

/**
 * Regras que valem para qualquer mesa de amigos (qualquer combinação de efeitos):
 *  - fichas: a soma da mesa = 2.000 × lugares + bônus da casa − fichas de quem saiu (passo a passo);
 *  - vazamento: cada pessoa só recebe as próprias cartas fechadas (eventos e visão), a visão só
 *    mostra mão inteira aberta, e durante a mão o efeito vira no máximo 1 carta por jogador;
 *  - tique: só de oráculo, só em mão de tique, nunca de pessoa;
 *  - board ≤ 6 (6 só na mão em que o Onze Homens lançou); lançadas ≤ o teto acumulado;
 *  - quem saiu nunca mais age por conta própria, não ganha bônus, sai com `eliminated{byId:null}`;
 *  - fim: um matchEnded só, todos com colocação, um 1º lugar = vencedor, `friendsResult` coerente.
 */
export function checkFriends(p: FriendsPlay, label: string, stats?: FriendsStats, deep = true): void {
  const cfg = p.cfg;
  const people = cfg.people ?? [];
  const seats = Object.keys(cfg.seats).length;
  const start = cfg.settings.startStack * seats;
  const levels = effectLevels(cfg.effects);
  const maxCasts: Record<string, number> = {};
  for (const l of levels) maxCasts[l.effect] = stackedParams(cfg.settings, l.effect, l.level).casts;
  const tellOn = levels.some((l) => l.effect === 'tell');
  let bonus = 0;
  let left = 0;
  const leftIds = new Set<string>();
  const tellWindows: [number, number][] = [];
  const castsBy: Record<string, number> = {};
  const castHand: Record<number, number> = {};
  let ended = 0;
  for (let k = 0; k < p.states.length; k++) {
    const st = p.states[k] as MatchStateX;
    const evs = p.steps[k].events;
    for (const e of evs) {
      if (e.type === 'effectBonus') {
        bonus += e.amount;
        check(!leftIds.has(e.playerId) || false, `${label}: bônus para quem saiu (${e.playerId})`);
      } else if (e.type === 'eliminated' && e.stackLeft !== undefined) {
        left += e.stackLeft;
        check(e.byId === null, `${label}: quem saiu sai com byId null`);
      } else if (e.type === 'personLeft') {
        leftIds.add(e.playerId);
        if (stats) stats.leaves++;
      } else if (e.type === 'clockOut') {
        if (stats) stats.timeouts++;
      } else if (e.type === 'away' && e.on) {
        if (stats) stats.away++;
      } else if (e.type === 'effectCast') {
        castsBy[e.effect] = (castsBy[e.effect] ?? 0) + 1;
        eq(e.castNo, castsBy[e.effect], `${label}: castNo crescente por efeito (${e.effect})`);
        castHand[e.handNumber] = (castHand[e.handNumber] ?? 0) + 1;
        if (e.data.effect === 'tell') tellWindows.push([e.handNumber, e.handNumber + e.data.hands - 1]);
      } else if (e.type === 'tellMark') {
        if (stats) stats.tells++;
        check(tellOn, `${label}: tique sem o efeito tell`);
        check(!people.includes(e.playerId), `${label}: tique de uma pessoa (${e.playerId})`);
        check(tellWindows.some(([a, b]) => e.handNumber >= a && e.handNumber <= b), `${label}: tique fora da janela (mão ${e.handNumber})`);
      } else if (e.type === 'actionMeta') {
        if (leftIds.has(e.playerId)) check(e.auto === 'left', `${label}: quem saiu agiu sozinho (${e.playerId})`);
        if (people.includes(e.playerId)) check(!e.bot, `${label}: pessoa com meta de bot`);
      } else if (e.type === 'streetDealt') {
        check(e.board.length <= 6, `${label}: board com ${e.board.length} cartas`);
        if (e.board.length === 6) {
          if (stats) stats.board6++;
          check(levels.some((l) => l.effect === 'sixth_card'), `${label}: board de 6 sem o Onze Homens`);
        }
      } else if (e.type === 'showdown') {
        for (const h of e.hands) if (h.kind === 'five_kind') {
          if (stats) stats.fiveKind++;
          check(levels.some((l) => l.effect === 'eight_aces'), `${label}: cinco iguais sem o Cassino`);
        }
      } else if (e.type === 'matchEnded') {
        ended++;
      }
    }
    // fichas (só a casa injeta; quem sai leva as dele). `paid` inclui o que a casa pagou com os
    // oráculos terminando a partida sozinhos (sem eventos).
    const paid = (st.fxs ?? []).reduce((acc, f) => acc + (f.paid ?? 0), 0);
    if (st.status === 'running') eq(paid, bonus, `${label}: bônus dos eventos = pago pela casa (passo ${k})`);
    eq(totalChips(st.game), start + paid - left, `${label}: fichas no passo ${k}`);
    if (!deep) continue;
    // vazamento por pessoa
    for (const viewer of people) {
      const pub = toPublicEvents(evs, viewer);
      for (const e of pub) {
        if (e.t === 'holeCards') {
          const dealt = evs.find((x): x is Ev<'holeCardsDealt'> => x.i === e.i && x.type === 'holeCardsDealt');
          const mine = dealt?.hands.find((h) => h.playerId === viewer);
          check(!!mine && JSON.stringify(mine.cards) === JSON.stringify(e.cards), `${label}: holeCards de ${viewer} não são as dele`);
        }
        if (e.t === 'tellMark') check(!people.includes(e.playerId), `${label}: tique público de pessoa`);
      }
      const v = tableView(st, viewer);
      for (const seat of v.seats) {
        if (seat.holeCards.length === 0) continue;
        check(seat.holeCards.length === 2, `${label}: mão parcial na visão (${seat.id})`);
        check(visibleTo(st, viewer, seat.id), `${label}: ${viewer} vê as cartas fechadas de ${seat.id} sem estarem abertas`);
      }
      check(v.legal === null || (v.toActId === viewer), `${label}: legal na visão de quem não tem a vez`);
      if (v.effects) {
        if (st.game.phase === 'betting') {
          for (const r of v.effects.revealed) {
            const pl = st.game.players.find((q) => q.id === r.playerId)!;
            if (!pl.showCards) check(r.cards.length <= 1, `${label}: durante a mão o efeito virou ${r.cards.length} cartas de ${r.playerId}`);
            for (const c of r.cards) check(pl.holeCards.includes(c), `${label}: carta virada que não é de ${r.playerId}`);
          }
        }
      }
    }
  }
  // Cronograma de cada efeito (com o acúmulo): 1ª lançada a partir de firstHand, intervalos ≥
  // gapHands, Raymond/opala só depois de alguém levar a anterior (+2 mãos), janelas de tique sem encostar.
  const castList = p.priv.filter((e): e is Ev<'effectCast'> => e.type === 'effectCast');
  const claims = p.priv.filter((e): e is Ev<'effectBonus'> => e.type === 'effectBonus');
  for (const l of levels) {
    if (l.effect === 'eight_aces') continue;
    const prm = stackedParams(cfg.settings, l.effect, l.level);
    const mine = castList.filter((c) => c.effect === l.effect);
    mine.forEach((c, k) => {
      if (k === 0) {
        check(c.handNumber >= prm.firstHand[0], `${label}: ${l.effect} 1ª lançada na mão ${c.handNumber} < ${prm.firstHand[0]}`);
        return;
      }
      const prev = mine[k - 1];
      if (l.effect === 'hand_bounty' || l.effect === 'opal') {
        const claim = claims.find((b) => b.effect === l.effect && b.handNumber >= prev.handNumber && b.handNumber < c.handNumber);
        check(!!claim, `${label}: ${l.effect} lançou de novo sem ninguém levar a anterior`);
        if (claim) check(c.handNumber >= claim.handNumber + prm.gapHands, `${label}: ${l.effect} ${prm.gapHands}+ mãos depois de levar`);
      } else {
        check(c.handNumber - prev.handNumber >= prm.gapHands, `${label}: ${l.effect} ${prm.gapHands}+ mãos entre lançadas (${prev.handNumber} → ${c.handNumber})`);
      }
    });
  }
  for (let k = 1; k < tellWindows.length; k++) check(tellWindows[k][0] > tellWindows[k - 1][1], `${label}: janelas de tique encostadas`);
  for (const [e, n] of Object.entries(castsBy)) {
    if (e === 'eight_aces') check(n === 1, `${label}: Cassino lança 1 vez`);
    else check(n <= maxCasts[e], `${label}: ${e} lançou ${n} > ${maxCasts[e]}`);
    if (stats) stats.casts[e] = (stats.casts[e] ?? 0) + n;
  }
  if (stats) {
    stats.bonus += bonus;
    stats.hands += p.final.game.handNumber;
    stats.multiCastHands += Object.values(castHand).filter((n) => n >= 2).length;
  }
  // fim
  const fin = p.final as MatchStateX;
  eq(fin.status, 'finished', `${label}: terminou`);
  eq(ended, 1, `${label}: um matchEnded só`);
  const r = friendsResult(fin);
  check(r.done && !!r.winnerId, `${label}: tem vencedor`);
  const ids = Object.keys(cfg.seats);
  for (const id of ids) check(fin.places[id] !== undefined, `${label}: ${id} sem colocação`);
  const firsts = ids.filter((id) => fin.places[id] === 1);
  eq(firsts, [r.winnerId], `${label}: um 1º lugar = vencedor`);
  for (const id of people) {
    const pr = r.people[id];
    check(pr.place !== null && pr.reason !== null, `${label}: ${id} sem colocação/motivo`);
    if (leftIds.has(id)) check(pr.reason === 'forfeit' || pr.reason === 'abandoned' || (pr.reason === 'won' && r.winnerId === id), `${label}: motivo de quem saiu (${pr.reason})`);
    if (pr.reason === 'won') check(r.winnerId === id, `${label}: 'won' sem ser o vencedor`);
  }
  if (stats) {
    if (r.winnerIsPerson) stats.personWins++;
    else stats.oracleWins++;
  }
  const me = p.priv.find((e): e is Ev<'matchEnded'> => e.type === 'matchEnded');
  check(!!me && me.winnerId === r.winnerId, `${label}: matchEnded.winnerId`);
  for (const id of people) {
    const pubEnd = toPublicEvents(me ? [me] : [], id)[0];
    check(pubEnd?.t === 'matchEnded' && pubEnd.humanPlace === r.people[id].place, `${label}: humanPlace de ${id}`);
  }
}

/** Log determinístico: as mesmas operações dão o mesmo hash. */
export function friendsHash(p: FriendsPlay): string {
  return logHash(p.priv);
}

export function cardsOf(st: MatchState, id: string): Card[] {
  return st.game.players.find((q) => q.id === id)?.holeCards.slice() ?? [];
}

export type { PosterEffectId, PublicEvent };
