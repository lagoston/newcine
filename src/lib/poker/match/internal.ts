/**
 * Peças internas da camada de partida: estado estendido, emissão de eventos e utilidades.
 *
 * Campos privados extras (03/11/2026): o `MatchState` do types.ts está congelado, então o
 * que a camada precisa a mais mora aqui como SUBTIPO estrutural (o JSON salvo os carrega,
 * e quem trata o estado como opaco — pacotes C e D — não percebe). Proposta de inclusão
 * no types.ts registrada no relatório do pacote A.
 */
import type { Card } from '../cards.ts';
import type { ActionRecord, GameState, PlayerState, PokerEvent } from '../engine.ts';
import type {
  BotMemory, EffectCastData, EffectParams, HumanTally, LevelInfo, MatchConfig, MatchEvent, MatchOnlyEvent, MatchState, OppCounters,
  PersonStatus, PlayerId, PosterEffectId, RivalId, SizeClass, StyleLabel,
} from '../types.ts';

export const HUMAN = 'human';

export type EndReason = 'won' | 'eliminated' | 'forfeit' | 'abandoned';

export interface LastUncontestedX {
  hand: number;
  playerId: PlayerId;
  shown: boolean;
  /** Cartas de quem venceu sem showdown, guardadas só quando é a pessoa (para o "Mostrar"). */
  cards?: [Card, Card];
}

// Pôster Poker (pacote E, 03/11/2026): estado privado dos efeitos do pôster (effects.ts).
export interface EffectReveal { playerId: PlayerId; cards: Card[] }

/** Estado privado dos efeitos (vai no JSON salvo da partida). */
export interface FxState {
  effect: PosterEffectId;
  /** Números já mesclados com poker_settings.effects (ficam fixos na partida). */
  params: EffectParams;
  /** Mãos sorteadas para cada lançada. Segredo do servidor. */
  schedule: number[];
  /** Lançadas até agora. */
  castNo: number;
  lastCastHand: number | null;
  /** O que está em vigor e em que mãos (inclusive). */
  active: EffectCastData | null;
  activeFrom: number;
  activeTo: number;
  /** hand_bounty e opal: alguém já levou. */
  claimed: boolean;
  /** Cartas viradas por efeito na mão `hand`. */
  revealed: { hand: number; cards: EffectReveal[] } | null;
  /** Fichas de bônus que a pessoa ganhou (para o resumo). */
  bonusWon: number;
  /** Pacote E3 (mesa de amigos): pôsteres iguais na mesa (ausente = 1) e bônus por pessoa. */
  level?: number;
  bonusBy?: Record<string, number>;
  /** Pacote E3 (mesa de amigos): tudo o que a casa pagou com este efeito (também quando os oráculos terminam sozinhos). */
  paid?: number;
}

export function cloneCast(d: EffectCastData): EffectCastData {
  if (d.effect === 'eight_aces') return { effect: d.effect, added: d.added.slice() };
  return { ...d };
}

export function cloneFx(fx: FxState): FxState {
  return {
    ...fx,
    params: { ...fx.params, firstHand: [fx.params.firstHand[0], fx.params.firstHand[1]] },
    schedule: fx.schedule.slice(),
    active: fx.active ? cloneCast(fx.active) : null,
    revealed: fx.revealed ? { hand: fx.revealed.hand, cards: fx.revealed.cards.map((r) => ({ playerId: r.playerId, cards: r.cards.slice() })) } : null,
    ...(fx.bonusBy ? { bonusBy: { ...fx.bonusBy } } : {}),
  };
}

/**
 * Pacote E3 (03/11/2026): situação de cada pessoa da mesa de amigos. `streak` = estouros
 * seguidos do relógio; `away` = ausente (3 estouros; a vez dela é jogada na hora);
 * `leaving` = saiu no meio (desiste na vez dela e sai da mesa no fim da mão).
 */
export interface PersonState {
  status: PersonStatus;
  streak: number;
  away: boolean;
  leaving?: 'forfeit' | 'abandoned';
  place?: number;
  reason?: EndReason;
}

export interface MatchStateX extends MatchState {
  lastUncontested: LastUncontestedX | null;
  /** Como a partida terminou para a pessoa (summarizeMatch e outcomeOf precisam). */
  endReason?: EndReason;
  /** Quem mostrou as cartas por `cardsShown` na mão `hand` (o motor só marca showdown/runout). */
  revealed?: { hand: number; ids: string[] };
  /** Pôster Poker: efeitos do torneio (ausente na mesa livre e no treino). */
  fx?: FxState;
  /** Pacote E3: efeitos da mesa de amigos (um por efeito distinto, na ordem EFFECT_ORDER). */
  fxs?: FxState[];
  /** Pacote E3: pessoas da mesa de amigos e os números de cada uma. */
  people?: Record<string, PersonState>;
  tallies?: Record<string, HumanTally>;
}

/** O handStarted privado leva também o nível da mão (toPublicEvents não tem o estado). */
export type HandStartedX = Extract<PokerEvent, { type: 'handStarted' }> & { level: LevelInfo };

export interface StepCtx {
  st: MatchStateX;
  ev: MatchEvent[];
  /** false no simulateRest: roda sem guardar eventos. */
  record: boolean;
  /** Decisões de bot nesta chamada (o servidor corta em 200). */
  decisions: number;
  maxDecisions: number;
  /** Pacote E3: os oráculos terminam a mesa de amigos sozinhos (closeHand não fecha a partida). */
  completing?: boolean;
  /** Pacote E3: closeHand viu o fim da mesa de amigos; runUntilHuman termina (finishFriends). */
  finishPending?: boolean;
}

export function emit(ctx: StepCtx, e: PokerEvent | MatchOnlyEvent | HandStartedX): void {
  ctx.st.eventNo += 1;
  if (ctx.record) ctx.ev.push({ i: ctx.st.eventNo, ...e } as MatchEvent);
}

export function x(s: MatchState): MatchStateX {
  return s as MatchStateX;
}

function cloneCounters(c: OppCounters): OppCounters {
  return { ...c, raw: { ...c.raw } };
}

function cloneMemory(m: BotMemory): BotMemory {
  const out: BotMemory = {
    committed: m.committed,
    facedFirstBet: m.facedFirstBet,
    tilt: m.tilt ? { ...m.tilt } : null,
    labelsAnnounced: m.labelsAnnounced.slice(),
  };
  if (m.labelsBy) {
    const by: Record<string, StyleLabel[]> = {};
    for (const [k, v] of Object.entries(m.labelsBy)) by[k] = v.slice();
    out.labelsBy = by as Record<PlayerId, StyleLabel[]>;
  }
  if (m.model) {
    const model: Record<string, OppCounters> = {};
    for (const [k, v] of Object.entries(m.model)) model[k] = cloneCounters(v);
    out.model = model as Record<PlayerId, OppCounters>;
  }
  return out;
}

export function cloneTally(t: HumanTally): HumanTally {
  return {
    ...t,
    bestHand: t.bestHand ? { ...t.bestHand, cards: t.bestHand.cards.slice() } : null,
    eliminations: t.eliminations.map((e) => ({ ...e })),
  };
}

/** Cópia das partes que a camada altera (o `game` o motor já devolve novo; `config` nunca muda). */
export function cloneMatch(s: MatchState): MatchStateX {
  const sx = x(s);
  const bots: Record<string, BotMemory> = {};
  for (const [k, v] of Object.entries(s.bots)) bots[k] = cloneMemory(v);
  const out: MatchStateX = {
    ...sx,
    places: { ...s.places },
    eliminatedBy: { ...s.eliminatedBy },
    bots: bots as Record<RivalId, BotMemory>,
    tally: cloneTally(s.tally),
    lastUncontested: sx.lastUncontested ? { ...sx.lastUncontested, cards: sx.lastUncontested.cards?.slice() as [Card, Card] | undefined } : null,
  };
  if (out.lastUncontested && !out.lastUncontested.cards) delete out.lastUncontested.cards;
  if (sx.revealed) out.revealed = { hand: sx.revealed.hand, ids: sx.revealed.ids.slice() };
  if (sx.fx) out.fx = cloneFx(sx.fx);
  if (sx.fxs) out.fxs = sx.fxs.map(cloneFx);
  if (sx.people) {
    const people: Record<string, PersonState> = {};
    for (const [k, v] of Object.entries(sx.people)) people[k] = { ...v };
    out.people = people;
  }
  if (sx.tallies) {
    const tallies: Record<string, HumanTally> = {};
    for (const [k, v] of Object.entries(sx.tallies)) tallies[k] = cloneTally(v);
    out.tallies = tallies;
  }
  return out;
}

export function newCtx(s: MatchState, record = true): StepCtx {
  return { st: cloneMatch(s), ev: [], record, decisions: 0, maxDecisions: 200 };
}

// ---------------------------------------------------------------------------
// Pessoas (pacote E3, 03/11/2026)
// ---------------------------------------------------------------------------

/** Lugares controlados por pessoas (os modos de uma pessoa: só 'human'). */
export function peopleOf(cfg: MatchConfig): string[] {
  return cfg.people && cfg.people.length > 0 ? cfg.people.slice() : [HUMAN];
}

export function isPerson(st: MatchState, id: string): boolean {
  const ppl = st.config.people;
  return ppl && ppl.length > 0 ? ppl.includes(id) : id === HUMAN;
}

export function isFriends(st: MatchState): boolean {
  return st.config.mode === 'friends';
}

/** Números da pessoa `id` (na mesa de uma pessoa, `st.tally`). */
export function tallyOf(st: MatchStateX, id: string): HumanTally | undefined {
  if (st.tallies) return st.tallies[id];
  return id === HUMAN ? st.tally : undefined;
}

/** Lista de efeitos do estado: a da mesa de amigos, ou o efeito único do torneio. */
export function fxList(st: MatchStateX): FxState[] {
  if (st.fxs) return st.fxs;
  return st.fx ? [st.fx] : [];
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export const isAlive = (p: PlayerState): boolean => p.status !== 'eliminated';
export const isInHand = (p: PlayerState): boolean => p.status === 'active' || p.status === 'allIn';

export function playerOf(g: GameState, id: string): PlayerState {
  const p = g.players.find((q) => q.id === id);
  if (!p) throw new Error(`jogador desconhecido: ${id}`);
  return p;
}

export function idAtSeat(g: GameState, seat: number): string {
  const p = g.players.find((q) => q.seat === seat);
  if (!p) throw new Error(`assento vazio: ${seat}`);
  return p.id;
}

export function aliveCount(g: GameState): number {
  return g.players.filter(isAlive).length;
}

/** O id está "vendo" estas cartas? (as próprias, showdown/runout do motor ou `cardsShown`). */
export function isRevealed(st: MatchStateX, p: PlayerState): boolean {
  if (p.showCards) return true;
  const r = st.revealed;
  return !!r && r.hand === st.game.handNumber && r.ids.includes(p.id);
}

export function markRevealed(st: MatchStateX, id: string): void {
  const hand = st.game.handNumber;
  if (!st.revealed || st.revealed.hand !== hand) st.revealed = { hand, ids: [] };
  if (!st.revealed.ids.includes(id)) st.revealed.ids.push(id);
}

/**
 * Classe do tamanho de uma aposta/aumento (§4.3): o aumento comparado ao pote depois de
 * pagar. small < 0,5 · medium 0,5–0,75 · big ≥ 0,75 ou ≥ 30% do cacife · overbet > 1,0.
 */
export function sizeClassOf(
  rec: ActionRecord, potBefore: number, prevBet: number, streetBetBefore: number, stackBefore: number,
): SizeClass | null {
  if (rec.type !== 'bet' && rec.type !== 'raise') return null;
  const raiseBy = rec.to - prevBet;
  const potAfterCall = potBefore + Math.max(0, prevBet - streetBetBefore);
  const frac = potAfterCall > 0 ? raiseBy / potAfterCall : 1;
  if (frac > 1.0) return 'overbet';
  if (frac >= 0.75 || rec.amount >= 0.3 * stackBefore) return 'big';
  if (frac >= 0.5) return 'medium';
  return 'small';
}

/** Arredonda para 4 casas (números estáveis no JSON, iguais nos dois lados). */
export function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
