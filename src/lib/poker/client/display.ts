/**
 * O que está na tela (03/11/2026). A camada de partida devolve, a cada ação da
 * pessoa, um lote de eventos públicos e a `TableView` do fim do lote. A mesa não
 * pode pular direto para o fim (os bots "jogam" um de cada vez), então este
 * redutor aplica os eventos um a um sobre uma cópia própria da mesa, e a `view`
 * só corrige o que tiver escapado quando o lote termina.
 *
 * Só dados públicos: nada aqui vê carta fechada de bot.
 */
import type { Card } from '../cards.ts';
import type { LegalActions, PlayerStatus, RecordedActionType } from '../engine.ts';
import type { HandKind } from '../evaluator.ts';
import type { Cue, HandFlags, LevelInfo, MatchMode, PlayerId, PublicEvent, TableView, TiltKind } from '../types.ts';

export interface SeatShow {
  id: PlayerId;
  seat: number;
  stack: number;
  /** Apostado na rua atual (some quando a rua fecha). */
  bet: number;
  status: PlayerStatus;
  /** Cartas abertas (as da pessoa sempre; as dos bots quando mostradas). */
  cards: Card[];
  /** Tem cartas na mão (viradas, para os bots). */
  hasCards: boolean;
  isButton: boolean;
  isSB: boolean;
  isBB: boolean;
  place: number | null;
  tilt: TiltKind | null;
  /** Última ação nesta rua (rótulo da pílula: "Pagou", "Aumentou"…). */
  last: { kind: RecordedActionType | 'post'; amount: number; to: number; allIn: boolean } | null;
  /** Pista de corpo da última ação do bot (some na próxima ação dele ou no fim da mão). */
  cue: Cue | null;
  /** Número sequencial da ação que trouxe o `cue` (reinicia a animação do tell). */
  cueKey: number;
  /** % de chance no all-in com as cartas abertas (0–1). */
  odds: number | null;
  /** "+1.240" depois de ganhar um pote. */
  won: number | null;
  /** Showdown: a mão e as 5 cartas que valeram. */
  kind: HandKind | null;
  best5: Card[] | null;
  royal: boolean;
  /** Mostrou as cartas depois de vencer sem showdown. */
  shownAfterFold: boolean;
}

export interface TableShow {
  mode: MatchMode;
  handNumber: number;
  level: LevelInfo;
  seats: SeatShow[];
  board: Card[];
  potTotal: number;
  pots: { amount: number; eligibleIds: PlayerId[] }[];
  toActId: PlayerId | null;
  legal: LegalActions | null;
  thinkingId: PlayerId | null;
  prize: { prizeId: string; holderId: PlayerId | null; captured: boolean } | null;
  loan: number;
  runout: boolean;
  showdown: boolean;
  /** Vencedores do último pote (aro dourado). */
  winners: PlayerId[];
  headsUp: boolean;
  /** Mão do showdown que a mesa anuncia em letreiro ("Full house"). */
  winningHand: { playerId: PlayerId; kind: HandKind; best5: Card[]; royal: boolean } | null;
  flags: HandFlags | null;
  status: TableView['status'];
  ended: Extract<PublicEvent, { t: 'matchEnded' }> | null;
  /** Quem eliminou quem (para créditos e "Anteriormente em…"). */
  eliminatedBy: Partial<Record<PlayerId, PlayerId | null>>;
  /** Mão em que cada um caiu. */
  eliminatedHand: Partial<Record<PlayerId, number>>;
  /** Contador de ações (chave das animações). */
  actionNo: number;
}

const DEFAULT_LEVEL: LevelInfo = { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: { sb: 35, bb: 70, ante: 0 } };

function seatBlank(id: PlayerId, seat: number, stack: number): SeatShow {
  return {
    id, seat, stack, bet: 0, status: 'active', cards: [], hasCards: false, isButton: false, isSB: false, isBB: false,
    place: null, tilt: null, last: null, cue: null, cueKey: 0, odds: null, won: null, kind: null, best5: null, royal: false,
    shownAfterFold: false,
  };
}

export function emptyTable(mode: MatchMode): TableShow {
  return {
    mode, handNumber: 0, level: DEFAULT_LEVEL, seats: [], board: [], potTotal: 0, pots: [], toActId: null, legal: null,
    thinkingId: null, prize: null, loan: 0, runout: false, showdown: false, winners: [], headsUp: false, winningHand: null,
    flags: null, status: 'running', ended: null, eliminatedBy: {}, eliminatedHand: {}, actionNo: 0,
  };
}

/** Mesa a partir da `TableView` (retomada, ou correção no fim de um lote). */
export function fromView(view: TableView, prev?: TableShow | null): TableShow {
  const base = prev ?? emptyTable(view.mode);
  const prevSeat = (id: PlayerId) => base.seats.find((s) => s.id === id);
  const sameHand = !!prev && prev.handNumber === view.handNumber;
  const seats: SeatShow[] = [...view.seats]
    .sort((a, b) => a.seat - b.seat)
    .map((v) => {
      const p = sameHand ? prevSeat(v.id) : undefined;
      const s = p ? { ...p } : seatBlank(v.id, v.seat, v.stack);
      s.seat = v.seat;
      s.stack = v.stack;
      s.bet = v.streetBet;
      s.status = v.status;
      s.cards = v.holeCards.length > 0 ? v.holeCards : sameHand ? s.cards : [];
      s.hasCards = v.hasHiddenCards || v.holeCards.length > 0;
      s.isButton = v.isButton;
      s.isSB = v.isSB;
      s.isBB = v.isBB;
      s.tilt = v.tilt;
      s.place = v.place;
      if (v.status === 'eliminated') s.hasCards = false;
      return s;
    });
  return {
    ...base,
    mode: view.mode,
    handNumber: view.handNumber,
    level: view.level,
    seats,
    board: view.board,
    potTotal: view.potTotal,
    pots: view.pots,
    toActId: view.toActId,
    legal: view.legal,
    thinkingId: null,
    prize: view.prize,
    loan: view.loan,
    status: view.status,
  };
}

const mapSeat = (t: TableShow, id: PlayerId, f: (s: SeatShow) => SeatShow): TableShow => ({
  ...t,
  seats: t.seats.map((s) => (s.id === id ? f({ ...s }) : s)),
});

const allSeats = (t: TableShow, f: (s: SeatShow) => SeatShow): TableShow => ({ ...t, seats: t.seats.map((s) => f({ ...s })) });

/** Aplica um evento público. Tipo desconhecido: devolve a mesa igual (APK antigo vivo, §4.5). */
export function applyEvent(t0: TableShow, e: PublicEvent): TableShow {
  let t = t0;
  switch (e.t) {
    case 'matchStarted':
      return {
        ...emptyTable(e.mode),
        level: e.level,
        loan: e.loan,
        prize: e.prize ? { prizeId: e.prize.prizeId, holderId: e.prize.holderId, captured: false } : null,
        seats: [...e.seats].sort((a, b) => a.seat - b.seat).map((s) => seatBlank(s.id, s.seat, s.stack)),
      };
    case 'levelUp':
      return { ...t, level: e.level };
    case 'handStarted':
      t = {
        ...t,
        handNumber: e.handNumber,
        level: e.level,
        board: [],
        potTotal: 0,
        pots: [],
        toActId: null,
        legal: null,
        thinkingId: null,
        runout: false,
        showdown: false,
        winners: [],
        winningHand: null,
        flags: null,
      };
      return allSeats(t, (s) => {
        const stack = e.stacks[s.id];
        if (typeof stack === 'number') s.stack = stack;
        const out = s.status === 'eliminated' || s.place != null;
        s.status = out ? 'eliminated' : 'active';
        s.hasCards = !out;
        s.cards = [];
        s.bet = 0;
        s.last = null;
        s.cue = null;
        s.odds = null;
        s.won = null;
        s.kind = null;
        s.best5 = null;
        s.royal = false;
        s.shownAfterFold = false;
        s.isButton = s.id === e.buttonId;
        s.isSB = s.id === e.sbId;
        s.isBB = s.id === e.bbId;
        return s;
      });
    case 'blindsPosted': {
      const ante = new Map(e.antes.map((a) => [a.playerId, a.amount]));
      t = allSeats(t, (s) => {
        const a = ante.get(s.id) ?? 0;
        if (a) s.stack -= a;
        if (s.id === e.sb.playerId) {
          s.stack -= e.sb.amount;
          s.bet = e.sb.amount;
          s.last = { kind: 'post', amount: e.sb.amount, to: e.sb.amount, allIn: false };
        }
        if (s.id === e.bb.playerId) {
          s.stack -= e.bb.amount;
          s.bet = e.bb.amount;
          s.last = { kind: 'post', amount: e.bb.amount, to: e.bb.amount, allIn: false };
        }
        if (e.allInIds.includes(s.id)) s.status = 'allIn';
        return s;
      });
      return { ...t, potTotal: e.potAfter };
    }
    case 'holeCards':
      return mapSeat(t, 'human', (s) => ({ ...s, cards: e.cards, hasCards: true }));
    case 'action': {
      const no = t.actionNo + 1;
      t = mapSeat(t, e.playerId, (s) => {
        s.stack = Math.max(0, e.stackBefore - e.amount);
        s.bet = e.to;
        if (e.action === 'fold') {
          s.status = 'folded';
          s.hasCards = false;
        } else if (e.allIn) s.status = 'allIn';
        s.last = { kind: e.action, amount: e.amount, to: e.to, allIn: e.allIn };
        s.cue = e.cue ?? null;
        s.cueKey = no;
        return s;
      });
      return { ...t, potTotal: e.potAfter, thinkingId: null, toActId: null, legal: null, actionNo: no };
    }
    case 'uncalledReturned':
      t = mapSeat(t, e.playerId, (s) => ({ ...s, stack: s.stack + e.amount, bet: Math.max(0, s.bet - e.amount) }));
      return { ...t, potTotal: Math.max(0, t.potTotal - e.amount) };
    case 'runout': {
      const shown = new Map(e.hands.map((h) => [h.playerId, h.cards]));
      t = allSeats(t, (s) => {
        const c = shown.get(s.id);
        if (c && c.length) s.cards = c;
        return s;
      });
      return { ...t, runout: true };
    }
    case 'street':
      t = allSeats(t, (s) => {
        s.bet = 0;
        if (s.last && !s.last.allIn) s.last = null;
        return s;
      });
      return { ...t, board: e.board };
    case 'showdown': {
      const shown = new Map(e.hands.map((h) => [h.playerId, h]));
      t = allSeats(t, (s) => {
        const h = shown.get(s.id);
        if (h) {
          s.cards = h.cards;
          s.kind = h.kind;
          s.best5 = h.best5;
          s.royal = h.royal;
        }
        s.bet = 0;
        s.odds = null;
        return s;
      });
      return { ...t, showdown: true };
    }
    case 'cardsShown':
      return mapSeat(t, e.playerId, (s) => ({ ...s, cards: e.cards, shownAfterFold: e.afterFold }));
    case 'potAwarded': {
      const win = new Map(e.winners.map((w) => [w.playerId, w.amount]));
      t = allSeats(t, (s) => {
        const w = win.get(s.id);
        if (w) {
          s.stack += w;
          s.won = (s.won ?? 0) + w;
        }
        s.bet = 0;
        return s;
      });
      const first = e.winners[0]?.playerId;
      const ws = first ? t.seats.find((s) => s.id === first) : undefined;
      const winningHand =
        !e.uncontested && ws && ws.kind && ws.best5 && e.potIndex === 0
          ? { playerId: ws.id, kind: ws.kind, best5: ws.best5, royal: ws.royal }
          : t.winningHand;
      return {
        ...t,
        potTotal: Math.max(0, t.potTotal - e.amount),
        winners: Array.from(new Set([...t.winners, ...e.winners.map((w) => w.playerId)])),
        winningHand,
      };
    }
    case 'handComplete':
      return { ...t, flags: e.flags };
    case 'eliminated':
      t = mapSeat(t, e.playerId, (s) => ({ ...s, status: 'eliminated', place: e.place, hasCards: false, bet: 0 }));
      return {
        ...t,
        eliminatedBy: { ...t.eliminatedBy, [e.playerId]: e.byId },
        eliminatedHand: { ...t.eliminatedHand, [e.playerId]: e.handNumber },
      };
    case 'prizeMoved':
      return t.prize ? { ...t, prize: { ...t.prize, holderId: e.toId } } : t;
    case 'prizeCaptured':
      return { ...t, prize: { prizeId: e.prizeId, holderId: 'human', captured: true } };
    case 'tilt':
      return mapSeat(t, e.playerId, (s) => ({ ...s, tilt: e.on ? e.kind : null }));
    case 'headsUp':
      return { ...t, headsUp: true };
    case 'matchEnded':
      return {
        ...t,
        ended: e,
        status: e.reason === 'won' ? 'finished' : 'humanOut',
        toActId: null,
        legal: null,
        thinkingId: null,
      };
    default:
      return t;
  }
}

export function seatOf(t: TableShow, id: PlayerId): SeatShow | undefined {
  return t.seats.find((s) => s.id === id);
}

/** Maior aposta da rua (o "nível" para a pré-ação "Pagar X"). */
export function currentBet(t: TableShow): number {
  return t.seats.reduce((m, s) => Math.max(m, s.bet), 0);
}

/** Quanto a pessoa pagaria agora (pré-ações). */
export function humanToCall(t: TableShow): number {
  const me = seatOf(t, 'human');
  if (!me) return 0;
  return Math.max(0, Math.min(me.stack, currentBet(t) - me.bet));
}

export function aliveIds(t: TableShow): PlayerId[] {
  return t.seats.filter((s) => s.status !== 'eliminated').map((s) => s.id);
}

/** Quem ainda está na mão (para o termômetro: n adversários). */
export function inHandIds(t: TableShow): PlayerId[] {
  return t.seats.filter((s) => s.hasCards && (s.status === 'active' || s.status === 'allIn')).map((s) => s.id);
}
