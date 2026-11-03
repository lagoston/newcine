/**
 * Motor de Texas Hold'em No-Limit para 2 a 9 jogadores.
 *
 * Princípios:
 *  - Estado 100% serializável em JSON (só objetos, arrays, strings e números),
 *    para o servidor guardar num jsonb e retomar de onde parou.
 *  - Funções puras: `startHand` e `applyAction` recebem um estado e devolvem um
 *    NOVO estado + a lista de eventos do que aconteceu. O estado recebido nunca
 *    é alterado.
 *  - Toda a aleatoriedade vem do RNG com semente guardado no estado.
 *
 * Convenções:
 *  - Assentos 0..8; "sentido horário" = assento crescente, dando a volta.
 *  - Valores de aposta são sempre "até" (total apostado na rua depois da ação):
 *    `{ type: 'raise', amount: 600 }` = aumentar PARA 600, não "mais 600".
 *  - Fichas são inteiros.
 *
 * Pôster Poker (03/11/2026): três ganchos por mão, todos opcionais e desligados por
 * padrão (`StartHandOptions.fx`): cartas a mais no baralho (Cassino, com repetidas),
 * flop aberto antes das apostas do pré-flop (Golpe de Mestre) e river de 2 cartas
 * (Onze Homens). Sem `fx`, o motor faz exatamente o mesmo de antes.
 */
import type { Card } from './cards.ts';
import { fullDeck, isCard } from './cards.ts';
import type { RngState } from './rng.ts';
import { rngFromState, seedToRngState } from './rng.ts';
import type { HandCategory, HandKind } from './evaluator.ts';
import { evaluateHand } from './evaluator.ts';

export const MAX_SEATS = 9;
export const MIN_PLAYERS = 2;
export const DEFAULT_HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  /** Ante por jogador (0 = sem ante). */
  ante: number;
}

export interface TableConfig {
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  /** Assento do botão na primeira mão. Sem isso, o botão inicial é sorteado pela semente. */
  buttonSeat?: number;
  /** Quantas mãos finalizadas manter em `history` (padrão 20; 0 desliga). */
  historyLimit?: number;
}

export interface ResolvedTableConfig extends BlindLevel {
  buttonSeat: number | null;
  historyLimit: number;
}

export interface PlayerSetup {
  id: string;
  seat: number;
  stack: number;
}

/**
 * - active: na mão e ainda pode agir (entre mãos, todo jogador vivo fica 'active');
 * - folded: desistiu desta mão;
 * - allIn: todas as fichas no pote;
 * - eliminated: sem fichas, fora do jogo.
 */
export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'eliminated';
export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type BoardStreet = 'flop' | 'turn' | 'river';
/** waiting = mesa criada, nenhuma mão ainda; handComplete = entre mãos. */
export type GamePhase = 'waiting' | 'betting' | 'handComplete' | 'gameOver';

export interface PlayerState {
  id: string;
  seat: number;
  /** Fichas atrás (fora do pote). */
  stack: number;
  status: PlayerStatus;
  /** Cartas fechadas. Só o próprio jogador as vê (veja `publicView`). */
  holeCards: Card[];
  /** Apostado na rua atual (blinds contam; ante não). */
  streetBet: number;
  /** Total colocado no pote nesta mão, incluindo ante. Base dos side pots. */
  totalBet: number;
  /** Já agiu voluntariamente nesta rua (postar blind não conta). */
  hasActed: boolean;
  /** Maior aposta da rua logo após a última ação deste jogador. Decide se a ação foi "reaberta" para ele. */
  actedAtBet: number;
  /** Cartas expostas para todos (showdown ou all-in com board corrido). */
  showCards: boolean;
  /** Stack no início da mão (para ganhos líquidos e colocação de eliminação). */
  handStartStack: number;
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'allIn' };

/** No histórico, all-in vira call/bet/raise com `allIn: true` (é o que importa para modelar o adversário). */
export type RecordedActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface ActionRecord {
  street: Street;
  playerId: string;
  type: RecordedActionType;
  /** Fichas efetivamente colocadas nesta ação. */
  amount: number;
  /** Total do jogador na rua depois da ação. */
  to: number;
  /** Quanto faltava pagar antes de agir. */
  toCall: number;
  allIn: boolean;
  /** Raise/bet que não atingiu o mínimo (só possível em all-in): não reabre a ação. */
  shortAllIn: boolean;
  potAfter: number;
}

export interface ShownHand {
  playerId: string;
  cards: Card[];
  category: HandCategory;
  kind: HandKind;
  score: number;
  best5: Card[];
  royal: boolean;
}

export interface PotShare {
  playerId: string;
  amount: number;
}

export interface Pot {
  amount: number;
  eligibleIds: string[];
}

export interface PotResult extends Pot {
  potIndex: number;
  winners: PotShare[];
  /** Só um jogador concorria (todos os outros desistiram ou não cobriram). */
  uncontested: boolean;
  /** Categoria da mão vencedora quando houve comparação. */
  kind: HandKind | null;
}

export interface HandResult {
  handNumber: number;
  buttonSeat: number;
  blinds: BlindLevel;
  board: Card[];
  wentToShowdown: boolean;
  pots: PotResult[];
  /** Mãos abertas no showdown (vazio se todos desistiram). */
  shown: ShownHand[];
  /** Ganho líquido de cada jogador que recebeu cartas (pode ser negativo). */
  net: Record<string, number>;
  /** Jogadores que levaram fichas de algum pote. */
  winnerIds: string[];
  startStacks: Record<string, number>;
  eliminated: { playerId: string; place: number }[];
  /** Ações voluntárias da mão (sem blinds/antes, que estão em `blinds`). */
  actions: ActionRecord[];
}

/** Ganchos de efeito guardados na mão (Pôster Poker). */
export interface HandFxState {
  /** O baralho tem cartas repetidas: o showdown usa o caminho por contagem. */
  repeats?: boolean;
  /** O flop foi aberto antes das apostas do pré-flop: depois do pré-flop vem o turn. */
  earlyFlop?: boolean;
  /** Cartas do river (2 = board de 6). */
  riverCards?: number;
}

export interface HandState {
  handNumber: number;
  buttonSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  blinds: BlindLevel;
  street: Street;
  board: Card[];
  /** Cartas restantes, na ordem em que sairão. Nunca vai para o cliente. */
  deck: Card[];
  /** Maior aposta da rua (o "nível" que todos precisam igualar). */
  currentBet: number;
  /** Tamanho mínimo do próximo aumento = último aumento completo (ou o big blind). */
  minRaise: number;
  toActId: string | null;
  lastAggressorId: string | null;
  /** Todos all-in (ou só um ainda podia apostar): board corrido sem apostas. */
  runout: boolean;
  actions: ActionRecord[];
  result: HandResult | null;
  /** Efeitos desta mão (ausente = mão normal). */
  fx?: HandFxState;
}

export interface GameState {
  version: 1;
  config: ResolvedTableConfig;
  /** Ordenados por assento. */
  players: PlayerState[];
  phase: GamePhase;
  handNumber: number;
  /** Assento do botão na mão atual/última (null antes da primeira mão). */
  buttonSeat: number | null;
  hand: HandState | null;
  /** Estado do RNG. Segredo do servidor: `publicView` remove. */
  rng: RngState;
  /** Últimas mãos finalizadas (só informação pública). */
  history: HandResult[];
  winnerId: string | null;
}

export interface PlayerRef {
  playerId: string;
  amount: number;
}

export type PokerEvent =
  | {
      type: 'handStarted';
      handNumber: number;
      buttonSeat: number;
      buttonPlayerId: string;
      smallBlindPlayerId: string;
      bigBlindPlayerId: string;
      blinds: BlindLevel;
      players: { playerId: string; seat: number; stack: number }[];
    }
  | {
      type: 'blindsPosted';
      antes: PlayerRef[];
      smallBlind: PlayerRef;
      bigBlind: PlayerRef;
      potAfter: number;
      /** Quem ficou all-in só de postar. */
      allInPlayerIds: string[];
    }
  | { type: 'holeCardsDealt'; hands: { playerId: string; cards: Card[] }[] }
  | {
      type: 'actionTaken';
      street: Street;
      playerId: string;
      action: RecordedActionType;
      amount: number;
      to: number;
      toCall: number;
      potAfter: number;
      allIn: boolean;
      shortAllIn: boolean;
    }
  | { type: 'uncalledBetReturned'; playerId: string; amount: number }
  | { type: 'allInRunout'; hands: { playerId: string; cards: Card[] }[] }
  /** `early`: flop do Golpe de Mestre, aberto antes das apostas do pré-flop. */
  | { type: 'streetDealt'; street: BoardStreet; cards: Card[]; board: Card[]; early?: true }
  | { type: 'showdown'; hands: ShownHand[] }
  | {
      type: 'potAwarded';
      potIndex: number;
      amount: number;
      eligibleIds: string[];
      winners: PotShare[];
      uncontested: boolean;
      kind: HandKind | null;
    }
  | { type: 'playerEliminated'; playerId: string; place: number; handNumber: number }
  | { type: 'handComplete'; result: HandResult }
  | { type: 'gameOver'; winnerId: string };

export interface EngineResult {
  state: GameState;
  events: PokerEvent[];
}

export interface LegalActions {
  playerId: string;
  street: Street;
  /** Fichas necessárias para pagar (0 = pode dar check). */
  toCall: number;
  pot: number;
  stack: number;
  streetBet: number;
  /** Desistir é sempre permitido na sua vez (mesmo quando o check é de graça). */
  canFold: true;
  canCheck: boolean;
  /** `amount` = fichas colocadas (menor que toCall quando o call é all-in). */
  call: { amount: number; allIn: boolean } | null;
  /** Primeira aposta da rua; valores "até". */
  bet: { min: number; max: number } | null;
  /** Aumento; valores "até". */
  raise: { min: number; max: number } | null;
  /** Ir com tudo: `to` = total na rua. Pode ser call, bet ou raise (inclusive abaixo do mínimo). */
  allIn: { amount: number; to: number; kind: 'call' | 'bet' | 'raise' } | null;
}

/** Efeitos de uma mão (Pôster Poker). Vêm do servidor (camada de partida), nunca do cliente. */
export interface HandFx {
  /** Cartas a mais no baralho desta mão (podem repetir as do baralho normal). */
  extraCards?: Card[];
  /** Abre o flop logo depois das cartas fechadas, antes das apostas do pré-flop. */
  earlyFlop?: boolean;
  /** 2 = o river vem com duas cartas (board de 6). */
  riverCards?: 1 | 2;
}

export interface StartHandOptions {
  fx?: HandFx;
  /**
   * SOMENTE para testes e tutoriais: fixa cartas fechadas de alguns jogadores
   * e/ou o board. O resto continua vindo do baralho embaralhado.
   * Nunca aceite isto vindo do cliente.
   */
  preset?: {
    holeCards?: Record<string, Card[]>;
    board?: Card[];
  };
}

export type PokerErrorCode =
  | 'invalid_config'
  | 'invalid_preset'
  | 'hand_in_progress'
  | 'game_over'
  | 'not_enough_players'
  | 'not_your_turn'
  | 'illegal_action'
  | 'invalid_amount'
  | 'internal';

export class PokerRuleError extends Error {
  readonly code: PokerErrorCode;
  constructor(code: PokerErrorCode, message: string) {
    super(message);
    this.name = 'PokerRuleError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Cópia das partes que o motor altera. Registros já finalizados (ações,
 * resultados, histórico) são imutáveis e podem ser compartilhados — é bem mais
 * barato que structuredClone e mantém a pureza.
 */
function cloneState(s: GameState): GameState {
  return {
    ...s,
    config: { ...s.config },
    players: s.players.map((p) => ({ ...p, holeCards: p.holeCards.slice() })),
    hand: s.hand
      ? { ...s.hand, blinds: { ...s.hand.blinds }, board: s.hand.board.slice(), deck: s.hand.deck.slice(), actions: s.hand.actions.slice() }
      : null,
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]],
    history: s.history.slice(),
  };
}

const isAlive = (p: PlayerState): boolean => p.status !== 'eliminated';
const isInHand = (p: PlayerState): boolean => p.status === 'active' || p.status === 'allIn';
const canAct = (p: PlayerState): boolean => p.status === 'active';

/** Próximo índice (sentido horário) depois de `from` que satisfaz `pred`, ou -1. */
function nextIndex(players: PlayerState[], from: number, pred: (p: PlayerState) => boolean): number {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (pred(players[idx])) return idx;
  }
  return -1;
}

function indexOfSeat(players: PlayerState[], seat: number): number {
  return players.findIndex((p) => p.seat === seat);
}

function sumTotalBets(players: PlayerState[]): number {
  let t = 0;
  for (const p of players) t += p.totalBet;
  return t;
}

/** Coloca fichas no pote (limitado ao stack). Devolve o valor efetivo. */
function commit(p: PlayerState, amount: number, countsForStreet: boolean): number {
  const actual = Math.min(amount, p.stack);
  p.stack -= actual;
  p.totalBet += actual;
  if (countsForStreet) p.streetBet += actual;
  if (p.stack === 0 && p.status === 'active') p.status = 'allIn';
  return actual;
}

/** Distância em sentido horário a partir do botão: 1 = primeiro à esquerda; o botão é o último (MAX_SEATS). */
function seatDistanceFromButton(seat: number, buttonSeat: number): number {
  const d = (seat - buttonSeat + MAX_SEATS) % MAX_SEATS;
  return d === 0 ? MAX_SEATS : d;
}

/**
 * Valor que o jogador precisa igualar. Normalmente é a maior aposta da rua; mas
 * se ninguém mais pode agir (todos os outros all-in), não faz sentido pagar
 * além do que algum adversário consegue cobrir.
 */
function callTarget(state: GameState, p: PlayerState): number {
  const hand = state.hand!;
  let othersCanAct = false;
  let maxOther = 0;
  for (const o of state.players) {
    if (o === p || !isInHand(o)) continue;
    if (canAct(o)) othersCanAct = true;
    if (o.streetBet > maxOther) maxOther = o.streetBet;
  }
  return othersCanAct ? hand.currentBet : Math.min(hand.currentBet, maxOther);
}

function needsToAct(state: GameState, p: PlayerState): boolean {
  return canAct(p) && (!p.hasActed || p.streetBet < state.hand!.currentBet);
}

function isBettingRoundComplete(state: GameState): boolean {
  const actors = state.players.filter(canAct);
  if (actors.length === 0) return true;
  if (actors.length === 1) {
    // Sozinho com chance de agir: só precisa decidir se ainda está devendo a alguém.
    const p = actors[0];
    return p.streetBet >= callTarget(state, p);
  }
  return actors.every((p) => p.hasActed && p.streetBet === state.hand!.currentBet);
}

function nextToAct(state: GameState, fromIdx: number): string {
  const idx = nextIndex(state.players, fromIdx, (p) => needsToAct(state, p));
  if (idx < 0) throw new PokerRuleError('internal', 'Rodada de apostas aberta sem ninguém para agir.');
  return state.players[idx].id;
}

// ---------------------------------------------------------------------------
// Criação da mesa
// ---------------------------------------------------------------------------

function isNonNegInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

function validateBlinds(level: BlindLevel): void {
  if (!isNonNegInt(level.bigBlind) || level.bigBlind < 1) {
    throw new PokerRuleError('invalid_config', 'bigBlind precisa ser um inteiro >= 1.');
  }
  if (!isNonNegInt(level.smallBlind) || level.smallBlind > level.bigBlind) {
    throw new PokerRuleError('invalid_config', 'smallBlind precisa ser um inteiro entre 0 e o bigBlind.');
  }
  if (!isNonNegInt(level.ante)) throw new PokerRuleError('invalid_config', 'ante precisa ser um inteiro >= 0.');
}

/** Cria a mesa. A semente define todos os baralhos e o botão inicial (se não informado). */
export function createTable(config: TableConfig, players: PlayerSetup[], seed: string): GameState {
  const resolved: ResolvedTableConfig = {
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    ante: config.ante ?? 0,
    buttonSeat: config.buttonSeat ?? null,
    historyLimit: config.historyLimit ?? DEFAULT_HISTORY_LIMIT,
  };
  validateBlinds(resolved);
  if (!isNonNegInt(resolved.historyLimit)) {
    throw new PokerRuleError('invalid_config', 'historyLimit precisa ser um inteiro >= 0.');
  }
  if (resolved.buttonSeat !== null && (!isNonNegInt(resolved.buttonSeat) || resolved.buttonSeat >= MAX_SEATS)) {
    throw new PokerRuleError('invalid_config', `buttonSeat precisa estar entre 0 e ${MAX_SEATS - 1}.`);
  }
  if (players.length < MIN_PLAYERS || players.length > MAX_SEATS) {
    throw new PokerRuleError('invalid_config', `A mesa aceita de ${MIN_PLAYERS} a ${MAX_SEATS} jogadores.`);
  }
  const ids = new Set<string>();
  const seats = new Set<number>();
  for (const p of players) {
    if (typeof p.id !== 'string' || p.id === '') throw new PokerRuleError('invalid_config', 'Jogador sem id.');
    if (ids.has(p.id)) throw new PokerRuleError('invalid_config', `id repetido: ${p.id}`);
    if (!isNonNegInt(p.seat) || p.seat >= MAX_SEATS) {
      throw new PokerRuleError('invalid_config', `Assento inválido para ${p.id}: ${p.seat}`);
    }
    if (seats.has(p.seat)) throw new PokerRuleError('invalid_config', `Assento repetido: ${p.seat}`);
    if (!isNonNegInt(p.stack) || p.stack < 1) {
      throw new PokerRuleError('invalid_config', `Stack inválido para ${p.id}: ${p.stack}`);
    }
    ids.add(p.id);
    seats.add(p.seat);
  }
  return {
    version: 1,
    config: resolved,
    players: players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        seat: p.seat,
        stack: p.stack,
        status: 'active',
        holeCards: [],
        streetBet: 0,
        totalBet: 0,
        hasActed: false,
        actedAtBet: 0,
        showCards: false,
        handStartStack: p.stack,
      })),
    phase: 'waiting',
    handNumber: 0,
    buttonSeat: null,
    hand: null,
    rng: seedToRngState(seed),
    history: [],
    winnerId: null,
  };
}

/** Muda blinds/ante (níveis de torneio). Vale a partir da próxima mão. */
export function setBlinds(state: GameState, level: Partial<BlindLevel>): GameState {
  const s = cloneState(state);
  const next: BlindLevel = {
    smallBlind: level.smallBlind ?? s.config.smallBlind,
    bigBlind: level.bigBlind ?? s.config.bigBlind,
    ante: level.ante ?? s.config.ante,
  };
  validateBlinds(next);
  s.config = { ...s.config, ...next };
  return s;
}

// ---------------------------------------------------------------------------
// Potes
// ---------------------------------------------------------------------------

/**
 * Monta pote principal e side pots a partir do que cada um colocou na mão
 * (inclusive quem desistiu: as fichas ficam no pote, mas a pessoa não concorre).
 * Cada "degrau" de contribuição vira um pote; degraus com os mesmos
 * concorrentes são fundidos.
 */
export function computePots(players: readonly PlayerState[]): Pot[] {
  const levels = Array.from(new Set(players.filter((p) => p.totalBet > 0).map((p) => p.totalBet))).sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  let carry = 0;
  for (const level of levels) {
    let amount = carry;
    for (const p of players) amount += Math.min(p.totalBet, level) - Math.min(p.totalBet, prev);
    prev = level;
    const eligibleIds = players.filter((p) => isInHand(p) && p.totalBet >= level).map((p) => p.id);
    if (eligibleIds.length === 0) {
      // Só acontece se quem desistiu tinha a maior contribuição (não deveria, pois
      // o excesso não pago é devolvido); por segurança, as fichas sobem de degrau.
      carry = amount;
      continue;
    }
    carry = 0;
    const last = pots[pots.length - 1];
    if (last && last.eligibleIds.length === eligibleIds.length && last.eligibleIds.every((id, i) => id === eligibleIds[i])) {
      last.amount += amount;
    } else if (amount > 0) {
      pots.push({ amount, eligibleIds });
    }
  }
  if (carry > 0 && pots.length > 0) pots[pots.length - 1].amount += carry;
  return pots;
}

/**
 * Aposta que ninguém igualou volta para o dono (ex.: aumento a 300, todos
 * desistem: os 200 acima do big blind voltam). Só a maior aposta da rua pode
 * ter excesso: o excesso é a diferença para a segunda maior.
 */
function returnUncalled(s: GameState, events: PokerEvent[]): void {
  let maxIdx = -1;
  let max = 0;
  let second = 0;
  s.players.forEach((p, i) => {
    if (p.streetBet > max) {
      second = max;
      max = p.streetBet;
      maxIdx = i;
    } else if (p.streetBet > second) {
      second = p.streetBet;
    }
  });
  if (maxIdx < 0 || max <= second) return;
  const p = s.players[maxIdx];
  const refund = max - second;
  p.streetBet -= refund;
  p.totalBet -= refund;
  p.stack += refund;
  if (p.status === 'allIn') p.status = 'active';
  events.push({ type: 'uncalledBetReturned', playerId: p.id, amount: refund });
}

function awardPots(s: GameState, events: PokerEvent[], shown: Record<string, ShownHand> | null): PotResult[] {
  const hand = s.hand!;
  const pots = computePots(s.players);
  const seatOf: Record<string, number> = {};
  for (const p of s.players) seatOf[p.id] = p.seat;
  const results: PotResult[] = pots.map((pot, potIndex) => {
    let winnerIds: string[];
    let kind: HandKind | null = null;
    if (pot.eligibleIds.length === 1) {
      winnerIds = pot.eligibleIds.slice();
    } else {
      if (!shown) throw new PokerRuleError('internal', 'Pote disputado sem showdown.');
      let best = -1;
      for (const id of pot.eligibleIds) best = Math.max(best, shown[id].score);
      winnerIds = pot.eligibleIds.filter((id) => shown[id].score === best);
      kind = shown[winnerIds[0]].kind;
    }
    // Odd chip: a ficha que não divide vai, uma a uma, para os vencedores a
    // partir do primeiro à esquerda do botão.
    winnerIds.sort((a, b) => seatDistanceFromButton(seatOf[a], hand.buttonSeat) - seatDistanceFromButton(seatOf[b], hand.buttonSeat));
    const share = Math.floor(pot.amount / winnerIds.length);
    const remainder = pot.amount - share * winnerIds.length;
    const winners: PotShare[] = winnerIds.map((playerId, i) => ({ playerId, amount: share + (i < remainder ? 1 : 0) }));
    for (const w of winners) s.players.find((p) => p.id === w.playerId)!.stack += w.amount;
    const result: PotResult = {
      potIndex,
      amount: pot.amount,
      eligibleIds: pot.eligibleIds,
      winners,
      uncontested: pot.eligibleIds.length === 1,
      kind,
    };
    events.push({ type: 'potAwarded', ...result, eligibleIds: result.eligibleIds.slice(), winners: winners.map((w) => ({ ...w })) });
    return result;
  });
  for (const p of s.players) {
    p.totalBet = 0;
    p.streetBet = 0;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Fluxo da mão
// ---------------------------------------------------------------------------

function dealStreet(s: GameState, events: PokerEvent[]): void {
  const hand = s.hand!;
  const next: Record<Street, BoardStreet | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null };
  let street = next[hand.street];
  if (!street) throw new PokerRuleError('internal', 'Não há rua depois do river.');
  // Golpe de Mestre: o flop já saiu antes das apostas do pré-flop; segue para o turn.
  if (street === 'flop' && hand.board.length >= 3) street = 'turn';
  hand.deck.shift(); // queima uma carta, como na mesa de verdade
  const count = street === 'flop' ? 3 : street === 'river' ? hand.fx?.riverCards ?? 1 : 1;
  const cards = hand.deck.splice(0, count);
  hand.board.push(...cards);
  hand.street = street;
  hand.currentBet = 0;
  hand.minRaise = hand.blinds.bigBlind;
  events.push({ type: 'streetDealt', street, cards: cards.slice(), board: hand.board.slice() });
}

function resetStreetBets(s: GameState): void {
  for (const p of s.players) {
    p.streetBet = 0;
    p.hasActed = false;
    p.actedAtBet = 0;
  }
  s.hand!.currentBet = 0;
}

function finishHand(s: GameState, events: PokerEvent[], pots: PotResult[], shown: ShownHand[], wentToShowdown: boolean): void {
  const hand = s.hand!;
  const net: Record<string, number> = {};
  const startStacks: Record<string, number> = {};
  const dealt = s.players.filter((p) => p.holeCards.length > 0);
  for (const p of dealt) {
    net[p.id] = p.stack - p.handStartStack;
    startStacks[p.id] = p.handStartStack;
  }

  // Eliminações: quem começou a mão com mais fichas fica com a melhor colocação;
  // empate de stack inicial divide a mesma colocação.
  const busted = dealt.filter((p) => p.stack === 0).sort((a, b) => b.handStartStack - a.handStartStack);
  const aliveAfter = s.players.filter((p) => isAlive(p) && p.stack > 0);
  const eliminated: { playerId: string; place: number }[] = [];
  busted.forEach((p, i) => {
    const prev = eliminated[i - 1];
    const place = prev && busted[i - 1].handStartStack === p.handStartStack ? prev.place : aliveAfter.length + 1 + i;
    p.status = 'eliminated';
    eliminated.push({ playerId: p.id, place });
  });

  const winnerIds = Array.from(new Set(pots.flatMap((pot) => pot.winners.filter((w) => w.amount > 0).map((w) => w.playerId))));
  const result: HandResult = {
    handNumber: hand.handNumber,
    buttonSeat: hand.buttonSeat,
    blinds: { ...hand.blinds },
    board: hand.board.slice(),
    wentToShowdown,
    pots,
    shown,
    net,
    winnerIds,
    startStacks,
    eliminated,
    actions: hand.actions.slice(),
  };
  hand.result = result;
  hand.toActId = null;
  if (s.config.historyLimit > 0) {
    s.history = [...s.history, result].slice(-s.config.historyLimit);
  }
  for (const e of eliminated) events.push({ type: 'playerEliminated', playerId: e.playerId, place: e.place, handNumber: hand.handNumber });
  events.push({ type: 'handComplete', result });
  if (aliveAfter.length <= 1) {
    s.phase = 'gameOver';
    s.winnerId = aliveAfter[0]?.id ?? null;
    if (s.winnerId) events.push({ type: 'gameOver', winnerId: s.winnerId });
  } else {
    s.phase = 'handComplete';
  }
}

function playersFromLeftOfButton(s: GameState): PlayerState[] {
  const btn = indexOfSeat(s.players, s.hand!.buttonSeat);
  const n = s.players.length;
  const out: PlayerState[] = [];
  for (let i = 1; i <= n; i++) out.push(s.players[(btn + i) % n]);
  return out;
}

function showdown(s: GameState, events: PokerEvent[]): void {
  const hand = s.hand!;
  const shownList: ShownHand[] = [];
  const shownById: Record<string, ShownHand> = {};
  // Decisão de produto: no showdown todas as mãos que chegaram ao fim são
  // mostradas (sem "muck"), como em Poker Night — é o que alimenta as falas.
  for (const p of playersFromLeftOfButton(s)) {
    if (!isInHand(p)) continue;
    const v = evaluateHand([...p.holeCards, ...hand.board], { repeats: hand.fx?.repeats === true });
    const sh: ShownHand = {
      playerId: p.id,
      cards: p.holeCards.slice(),
      category: v.category,
      kind: v.kind,
      score: v.score,
      best5: v.best5,
      royal: v.royal,
    };
    p.showCards = true;
    shownList.push(sh);
    shownById[p.id] = sh;
  }
  events.push({ type: 'showdown', hands: shownList });
  hand.toActId = null;
  const pots = awardPots(s, events, shownById);
  finishHand(s, events, pots, shownList, true);
}

function winWithoutShowdown(s: GameState, events: PokerEvent[]): void {
  returnUncalled(s, events);
  s.hand!.toActId = null;
  const pots = awardPots(s, events, null);
  finishHand(s, events, pots, [], false);
}

/** Fecha a rua e segue: próxima rua com apostas, board corrido ou showdown. */
function closeBettingRound(s: GameState, events: PokerEvent[]): void {
  const hand = s.hand!;
  for (;;) {
    returnUncalled(s, events);
    resetStreetBets(s);
    if (hand.street === 'river') {
      showdown(s, events);
      return;
    }
    const actors = s.players.filter(canAct).length;
    if (actors < 2 && !hand.runout) {
      // Ninguém mais pode apostar: as cartas são abertas antes de correr o board
      // (como nas transmissões e nos sites), o que dá o suspense na interface.
      hand.runout = true;
      const hands: { playerId: string; cards: Card[] }[] = [];
      for (const p of playersFromLeftOfButton(s)) {
        if (!isInHand(p)) continue;
        p.showCards = true;
        hands.push({ playerId: p.id, cards: p.holeCards.slice() });
      }
      events.push({ type: 'allInRunout', hands });
    }
    dealStreet(s, events);
    if (actors >= 2) {
      hand.toActId = nextToAct(s, indexOfSeat(s.players, hand.buttonSeat));
      return;
    }
  }
}

/** Depois de qualquer ação (ou dos blinds): decide quem age, ou fecha a rua/mão. */
function proceed(s: GameState, events: PokerEvent[], fromIdx: number): void {
  if (s.players.filter(isInHand).length === 1) {
    winWithoutShowdown(s, events);
  } else if (isBettingRoundComplete(s)) {
    closeBettingRound(s, events);
  } else {
    s.hand!.toActId = nextToAct(s, fromIdx);
  }
}

// ---------------------------------------------------------------------------
// API: iniciar mão
// ---------------------------------------------------------------------------

function validatePreset(s: GameState, holes: Record<string, Card[]>, board: Card[], maxBoard: number): Set<Card> {
  const reserved = new Set<Card>();
  const add = (c: Card): void => {
    if (!isCard(c)) throw new PokerRuleError('invalid_preset', `Carta inválida no preset: ${String(c)}`);
    if (reserved.has(c)) throw new PokerRuleError('invalid_preset', `Carta repetida no preset: ${c}`);
    reserved.add(c);
  };
  for (const [id, cards] of Object.entries(holes)) {
    const p = s.players.find((x) => x.id === id);
    if (!p || !isInHand(p)) throw new PokerRuleError('invalid_preset', `Jogador do preset não está na mão: ${id}`);
    if (cards.length !== 2) throw new PokerRuleError('invalid_preset', `Preset de ${id} precisa de 2 cartas.`);
    cards.forEach(add);
  }
  if (board.length > maxBoard) throw new PokerRuleError('invalid_preset', `Board do preset tem mais de ${maxBoard} cartas.`);
  board.forEach(add);
  return reserved;
}

/**
 * Começa a próxima mão: gira o botão, posta antes e blinds, embaralha e distribui.
 *
 * Botão "simplificado" (como na maioria dos jogos online casuais): ele sempre
 * avança para o próximo jogador vivo, e os blinds são os dois vivos seguintes.
 * Não há botão morto nem blinds perdidos quando alguém é eliminado.
 */
export function startHand(state: GameState, options: StartHandOptions = {}): EngineResult {
  if (state.phase === 'betting') throw new PokerRuleError('hand_in_progress', 'Já existe uma mão em andamento.');
  if (state.phase === 'gameOver') throw new PokerRuleError('game_over', 'O jogo acabou.');
  const s = cloneState(state);
  const events: PokerEvent[] = [];
  const players = s.players;
  const aliveIdx = players.map((p, i) => (isAlive(p) && p.stack > 0 ? i : -1)).filter((i) => i >= 0);
  if (aliveIdx.length < MIN_PLAYERS) throw new PokerRuleError('not_enough_players', 'Jogadores insuficientes.');
  const rng = rngFromState(s.rng);
  const alive = (p: PlayerState): boolean => isAlive(p) && p.stack > 0;

  s.handNumber += 1;
  for (const p of players) {
    if (alive(p)) p.status = 'active';
    p.holeCards = [];
    p.streetBet = 0;
    p.totalBet = 0;
    p.hasActed = false;
    p.actedAtBet = 0;
    p.showCards = false;
    p.handStartStack = p.stack;
  }

  // Botão
  let btnIdx: number;
  if (s.buttonSeat === null) {
    const wanted = s.config.buttonSeat;
    if (wanted !== null) {
      const atOrAfter = aliveIdx.find((i) => players[i].seat >= wanted);
      btnIdx = atOrAfter ?? aliveIdx[0];
    } else {
      btnIdx = aliveIdx[rng.nextInt(aliveIdx.length)];
    }
  } else {
    btnIdx = nextIndex(players, indexOfSeat(players, s.buttonSeat), alive);
  }
  // Heads-up: o botão é o small blind (e por isso age primeiro no pré-flop e por último depois).
  const headsUp = aliveIdx.length === 2;
  const sbIdx = headsUp ? btnIdx : nextIndex(players, btnIdx, alive);
  const bbIdx = nextIndex(players, sbIdx, alive);
  s.buttonSeat = players[btnIdx].seat;

  const blinds: BlindLevel = { smallBlind: s.config.smallBlind, bigBlind: s.config.bigBlind, ante: s.config.ante };
  events.push({
    type: 'handStarted',
    handNumber: s.handNumber,
    buttonSeat: s.buttonSeat,
    buttonPlayerId: players[btnIdx].id,
    smallBlindPlayerId: players[sbIdx].id,
    bigBlindPlayerId: players[bbIdx].id,
    blinds: { ...blinds },
    players: aliveIdx.map((i) => ({ playerId: players[i].id, seat: players[i].seat, stack: players[i].stack })),
  });

  // Antes são "dinheiro morto": entram no pote (e nos side pots), mas não contam
  // como aposta da rua — quem pagou ante ainda precisa pagar o big blind inteiro.
  const antes: PlayerRef[] = [];
  if (blinds.ante > 0) {
    for (const i of aliveIdx) antes.push({ playerId: players[i].id, amount: commit(players[i], blinds.ante, false) });
  }
  const sbAmount = commit(players[sbIdx], blinds.smallBlind, true);
  const bbAmount = commit(players[bbIdx], blinds.bigBlind, true);

  s.hand = {
    handNumber: s.handNumber,
    buttonSeat: s.buttonSeat,
    smallBlindSeat: players[sbIdx].seat,
    bigBlindSeat: players[bbIdx].seat,
    blinds,
    street: 'preflop',
    board: [],
    deck: [],
    // O nível a pagar é o big blind cheio mesmo que o BB esteja all-in com menos.
    currentBet: Math.max(blinds.bigBlind, sbAmount, bbAmount),
    minRaise: blinds.bigBlind,
    toActId: null,
    lastAggressorId: null,
    runout: false,
    actions: [],
    result: null,
  };
  events.push({
    type: 'blindsPosted',
    antes,
    smallBlind: { playerId: players[sbIdx].id, amount: sbAmount },
    bigBlind: { playerId: players[bbIdx].id, amount: bbAmount },
    potAfter: sumTotalBets(players),
    allInPlayerIds: aliveIdx.filter((i) => players[i].status === 'allIn').map((i) => players[i].id),
  });

  // Embaralha e distribui (uma carta por vez, começando à esquerda do botão).
  const fx = options.fx;
  const extra = fx?.extraCards ?? [];
  for (const c of extra) if (!isCard(c)) throw new PokerRuleError('invalid_config', `Carta a mais inválida: ${String(c)}`);
  const riverCards = fx?.riverCards === 2 ? 2 : 1;
  if (extra.length > 0 || fx?.earlyFlop || riverCards === 2) {
    s.hand.fx = {
      ...(extra.length > 0 ? { repeats: true } : {}),
      ...(fx?.earlyFlop ? { earlyFlop: true } : {}),
      ...(riverCards === 2 ? { riverCards: 2 } : {}),
    };
  }
  // Sem cartas a mais o baralho é o mesmo de sempre (mesma semente = mesmas cartas).
  let deck = rng.shuffle(extra.length > 0 ? fullDeck().concat(extra) : fullDeck());
  s.rng = rng.getState();
  const presetHoles = options.preset?.holeCards ?? {};
  const presetBoard = options.preset?.board ?? [];
  const reserved = validatePreset(s, presetHoles, presetBoard, 4 + riverCards);
  if (reserved.size > 0) {
    // Tira UMA cópia de cada carta reservada (o baralho do Cassino tem repetidas).
    const left = new Set(reserved);
    deck = deck.filter((c) => !(left.has(c) && left.delete(c)));
  }
  // Aqui o critério é "está na mão" (e não "tem fichas"): quem ficou all-in só
  // de postar ante/blind tem stack 0, mas recebe cartas normalmente.
  const dealOrder: PlayerState[] = [];
  for (let k = 0, i = btnIdx; k < aliveIdx.length; k++) {
    i = nextIndex(players, i, isInHand);
    dealOrder.push(players[i]);
  }
  for (let round = 0; round < 2; round++) {
    for (const p of dealOrder) {
      const preset = presetHoles[p.id];
      if (preset) {
        if (round === 0) p.holeCards = preset.slice();
      } else {
        p.holeCards.push(deck.shift()!);
      }
    }
  }
  if (presetBoard.length > 0) {
    // Ordem de saída: queima, flop (3), queima, turn, queima, river (1 ou 2).
    const layout: (number | null)[] = riverCards === 2 ? [null, 0, 1, 2, null, 3, null, 4, 5] : [null, 0, 1, 2, null, 3, null, 4];
    const arranged: Card[] = [];
    for (const slot of layout) {
      arranged.push(slot !== null && slot < presetBoard.length ? presetBoard[slot] : deck.shift()!);
    }
    deck = [...arranged, ...deck];
  }
  s.hand.deck = deck;
  events.push({ type: 'holeCardsDealt', hands: dealOrder.map((p) => ({ playerId: p.id, cards: p.holeCards.slice() })) });
  if (fx?.earlyFlop) {
    // Golpe de Mestre: queima e abre o flop já agora; a rua continua sendo o pré-flop
    // (blinds e aumento mínimo intactos) e, fechadas as apostas, vem o turn.
    const hand = s.hand;
    hand.deck.shift();
    const cards = hand.deck.splice(0, 3);
    hand.board.push(...cards);
    events.push({ type: 'streetDealt', street: 'flop', cards: cards.slice(), board: hand.board.slice(), early: true });
  }

  s.phase = 'betting';
  proceed(s, events, bbIdx);
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// API: ações
// ---------------------------------------------------------------------------

/** Ações permitidas para o jogador agora, ou null se não for a vez dele. */
export function getLegalActions(state: GameState, playerId: string): LegalActions | null {
  const hand = state.hand;
  if (state.phase !== 'betting' || !hand || hand.toActId !== playerId) return null;
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !canAct(p)) return null;

  const toCall = Math.max(0, callTarget(state, p) - p.streetBet);
  const maxTo = p.streetBet + p.stack;
  const othersCanAct = state.players.some((o) => o !== p && canAct(o));
  // Regra do all-in curto: quem já agiu só pode voltar a aumentar se, desde a
  // sua última ação, a aposta subiu pelo menos um aumento completo (somando
  // eventuais all-ins curtos). Quem ainda não agiu na rua sempre pode aumentar.
  const reopened = !p.hasActed || hand.currentBet - p.actedAtBet >= hand.minRaise;
  // Sem adversário que possa responder, aumentar não tem sentido (e não é permitido).
  const canRaise = othersCanAct && reopened && p.stack > toCall;
  let range: { min: number; max: number } | null = null;
  if (canRaise) {
    const minTo = hand.currentBet + hand.minRaise;
    if (maxTo >= minTo) range = { min: minTo, max: maxTo };
  }
  const isBet = hand.currentBet === 0;
  let allIn: LegalActions['allIn'] = null;
  if (p.stack > 0 && p.stack <= toCall) allIn = { amount: p.stack, to: maxTo, kind: 'call' };
  else if (canRaise) allIn = { amount: p.stack, to: maxTo, kind: isBet ? 'bet' : 'raise' };

  return {
    playerId,
    street: hand.street,
    toCall,
    pot: sumTotalBets(state.players),
    stack: p.stack,
    streetBet: p.streetBet,
    canFold: true,
    canCheck: toCall === 0,
    call: toCall > 0 ? { amount: Math.min(toCall, p.stack), allIn: p.stack <= toCall } : null,
    bet: isBet ? range : null,
    raise: isBet ? null : range,
    allIn,
  };
}

/** Ação padrão quando o tempo acaba: check se for de graça, senão fold. */
export function timeoutAction(state: GameState, playerId: string): PlayerAction | null {
  const legal = getLegalActions(state, playerId);
  if (!legal) return null;
  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

/**
 * Aplica a ação do jogador da vez. Lança PokerRuleError se for ilegal.
 *
 * Tolerâncias (para facilitar a vida dos bots e da interface):
 *  - 'bet' e 'raise' são sinônimos ("apostar até X"), validados contra a faixa certa;
 *  - 'call' sem nada a pagar vira check;
 *  - bet/raise com valor igual ao stack inteiro vira all-in (mesmo abaixo do mínimo).
 */
export function applyAction(state: GameState, playerId: string, action: PlayerAction): EngineResult {
  const legal = getLegalActions(state, playerId);
  if (!legal) {
    if (state.phase !== 'betting') throw new PokerRuleError('illegal_action', 'Não há mão em andamento.');
    throw new PokerRuleError('not_your_turn', `Não é a vez de ${playerId}.`);
  }
  const s = cloneState(state);
  const hand = s.hand!;
  const idx = s.players.findIndex((p) => p.id === playerId);
  const p = s.players[idx];
  const events: PokerEvent[] = [];
  const toCallBefore = legal.toCall;
  let recorded: RecordedActionType = 'fold';
  let added = 0;
  let shortAllIn = false;

  const doCheck = (): void => {
    p.hasActed = true;
    p.actedAtBet = hand.currentBet;
    recorded = 'check';
  };
  const doCall = (amount: number): void => {
    added = commit(p, amount, true);
    p.hasActed = true;
    p.actedAtBet = hand.currentBet;
    recorded = 'call';
  };
  const doRaiseTo = (to: number): void => {
    const prevBet = hand.currentBet;
    added = commit(p, to - p.streetBet, true);
    const increment = to - prevBet;
    if (increment >= hand.minRaise) {
      hand.minRaise = increment;
    } else {
      // All-in abaixo do mínimo: sobe o nível a pagar, mas não muda o tamanho do
      // aumento mínimo nem reabre a ação de quem já agiu.
      shortAllIn = true;
    }
    hand.currentBet = to;
    hand.lastAggressorId = p.id;
    p.hasActed = true;
    p.actedAtBet = to;
    recorded = prevBet === 0 ? 'bet' : 'raise';
  };
  const doAllIn = (): void => {
    const a = legal.allIn;
    if (!a) throw new PokerRuleError('illegal_action', 'All-in não permitido agora.');
    if (a.kind === 'call') doCall(a.amount);
    else doRaiseTo(a.to);
  };

  switch (action.type) {
    case 'fold':
      p.status = 'folded';
      p.hasActed = true;
      recorded = 'fold';
      break;
    case 'check':
      if (!legal.canCheck) throw new PokerRuleError('illegal_action', `Check não permitido: faltam ${legal.toCall} para pagar.`);
      doCheck();
      break;
    case 'call':
      if (legal.call) doCall(legal.call.amount);
      else doCheck();
      break;
    case 'bet':
    case 'raise': {
      const amount = action.amount;
      if (!Number.isInteger(amount)) throw new PokerRuleError('invalid_amount', `Valor inválido: ${amount}`);
      const range = legal.bet ?? legal.raise;
      if (legal.allIn && amount === legal.allIn.to) {
        doAllIn();
      } else if (!range) {
        throw new PokerRuleError('illegal_action', 'Aumentar não é permitido agora.');
      } else if (amount < range.min || amount > range.max) {
        throw new PokerRuleError('invalid_amount', `Valor fora da faixa: ${amount} (mínimo ${range.min}, máximo ${range.max}).`);
      } else {
        doRaiseTo(amount);
      }
      break;
    }
    case 'allIn':
      doAllIn();
      break;
    default:
      throw new PokerRuleError('illegal_action', `Ação desconhecida: ${(action as { type: string }).type}`);
  }

  const record: ActionRecord = {
    street: hand.street,
    playerId,
    type: recorded,
    amount: added,
    to: p.streetBet,
    toCall: toCallBefore,
    allIn: p.status === 'allIn',
    shortAllIn,
    potAfter: sumTotalBets(s.players),
  };
  hand.actions.push(record);
  events.push({
    type: 'actionTaken',
    street: record.street,
    playerId,
    action: record.type,
    amount: record.amount,
    to: record.to,
    toCall: record.toCall,
    potAfter: record.potAfter,
    allIn: record.allIn,
    shortAllIn,
  });

  proceed(s, events, idx);
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Consultas e visão pública
// ---------------------------------------------------------------------------

/** Fichas no pote agora (inclui as apostas da rua atual). */
export function potTotal(state: GameState): number {
  return sumTotalBets(state.players);
}

/** Pote principal e side pots como estão agora (para exibir durante a mão). */
export function getPots(state: GameState): Pot[] {
  return computePots(state.players);
}

export function currentPlayerId(state: GameState): string | null {
  return state.phase === 'betting' ? state.hand?.toActId ?? null : null;
}

/**
 * Soma de todas as fichas da mesa (stacks + pote). O motor nunca a muda; no Pôster
 * Poker a camada de partida soma os bônus da casa (`effectBonus`) por fora.
 */
export function totalChips(state: GameState): number {
  let t = 0;
  for (const p of state.players) t += p.stack + p.totalBet;
  return t;
}

export interface PublicPlayerState extends PlayerState {
  /** Tem cartas na mão que este espectador não pode ver. */
  hasHiddenCards: boolean;
}

export interface PublicHandState extends Omit<HandState, 'deck' | 'fx'> {
  deckCount: number;
}

export interface PublicGameState extends Omit<GameState, 'rng' | 'hand' | 'players'> {
  viewerId: string | null;
  players: PublicPlayerState[];
  hand: PublicHandState | null;
}

/**
 * O que o servidor manda para um cliente: sem as cartas fechadas dos outros
 * (exceto as abertas no showdown/all-in), sem o baralho e sem o estado do RNG
 * (com ele daria para prever todas as cartas seguintes).
 */
export function publicView(state: GameState, viewerId: string | null): PublicGameState {
  const { rng: _rng, hand, players, ...rest } = state;
  void _rng;
  return {
    ...rest,
    config: { ...state.config },
    history: state.history.slice(),
    viewerId,
    players: players.map((p) => {
      // Cartas abertas no showdown continuam visíveis mesmo se o dono acabou eliminado na mão.
      const visible = p.id === viewerId || p.showCards;
      const holding = p.holeCards.length > 0 && isInHand(p);
      return {
        ...p,
        holeCards: visible ? p.holeCards.slice() : [],
        hasHiddenCards: holding && !visible,
      };
    }),
    hand: hand
      ? (() => {
          // `fx` fica de fora: o river de 2 cartas armado (Onze Homens) é segredo até o anúncio.
          const { deck, fx: _fx, ...h } = hand;
          void _fx;
          return { ...h, board: h.board.slice(), actions: h.actions.slice(), deckCount: deck.length };
        })()
      : null,
  };
}

/** Filtra eventos para um espectador: esconde as cartas fechadas dos outros. */
export function eventsForViewer(events: readonly PokerEvent[], viewerId: string | null): PokerEvent[] {
  return events.map((e) =>
    e.type === 'holeCardsDealt'
      ? { ...e, hands: e.hands.map((h) => ({ playerId: h.playerId, cards: h.playerId === viewerId ? h.cards.slice() : [] })) }
      : e,
  );
}
