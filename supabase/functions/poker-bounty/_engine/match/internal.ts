// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/internal.ts
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
  BotMemory, HumanTally, LevelInfo, MatchEvent, MatchOnlyEvent, MatchState, OppCounters, PlayerId, RivalId, SizeClass,
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

export interface MatchStateX extends MatchState {
  lastUncontested: LastUncontestedX | null;
  /** Como a partida terminou para a pessoa (summarizeMatch e outcomeOf precisam). */
  endReason?: EndReason;
  /** Quem mostrou as cartas por `cardsShown` na mão `hand` (o motor só marca showdown/runout). */
  revealed?: { hand: number; ids: string[] };
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
  return out;
}

export function newCtx(s: MatchState, record = true): StepCtx {
  return { st: cloneMatch(s), ev: [], record, decisions: 0, maxDecisions: 200 };
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
