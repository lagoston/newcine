/**
 * O projetor da mesa (03/11/2026): recebe os lotes de eventos públicos da partida
 * (Worker na livre, servidor no prêmio) e os "projeta" um a um, com o tempo de
 * pensar de cada bot, as viradas de carta e as pausas de fim de mão. Quando o lote
 * acaba, a `TableView` corrige qualquer diferença e, se for a vez da pessoa, a mesa
 * abre os botões.
 *
 * Tocar no feltro (`skipAnim`) termina na hora a espera em curso (§7.9).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import type { Card } from '../cards.ts';
import type { PlayerAction } from '../engine.ts';
import type { EffectCastData, MatchMode, PosterEffectId, PublicEvent, TableView } from '../types.ts';
import { applyEvent, castThisHand, emptyTable, fromView, seatOf, type TableShow } from './display.ts';
import type { Director, TableContext } from './useDirector.ts';
import type { MatchClient } from './matchClient.ts';
import { getPokerSettings, speedFactor } from './settings.ts';
import { narrate } from './narrate.ts';
import type { Lang } from './format.ts';
import {
  playBet,
  playCatchaw,
  playCheck,
  playHouseChips,
  playCutFinal,
  playDeal,
  playElimination,
  playFlop,
  playRumble,
  playShowdown,
  playSweep,
  playVictory,
  playYourTurn,
  vibrate,
} from './sound.ts';

// 03/11/2026: as % do all-in são arredondadas pelo maior resto, para a soma na
// mesa dar 100 (87% contra 14% parecia conta errada). Empates divididos já vêm
// do motor; aqui só muda o arredondamento do que se mostra.
function roundOddsTo100(odds: Record<string, number>): Record<string, number> {
  const ids = Object.keys(odds);
  const total = Math.round(ids.reduce((a, id) => a + odds[id] * 100, 0));
  const base = ids.map((id) => ({ id, raw: odds[id] * 100, int: Math.floor(odds[id] * 100) }));
  let left = total - base.reduce((a, b) => a + b.int, 0);
  [...base].sort((a, b) => b.raw - b.int - (a.raw - a.int)).forEach((b) => {
    if (left > 0) {
      b.int += 1;
      left -= 1;
    }
  });
  return Object.fromEntries(base.map((b) => [b.id, b.int / 100]));
}

// Pôster Poker: o board vai a 6 na mão do Onze Homens (o effectCast sai antes do river).
function boardTarget(t: TableShow): number {
  return castThisHand(t.tournament, 'sixth_card', t.handNumber) ? 6 : 5;
}

/** O que as contas de % precisam saber dos efeitos: os 8 ases do Cassino e o board de 6. */
export function oddsFx(t: TableShow): { extra?: Card[]; boardSize?: number } {
  const out: { extra?: Card[]; boardSize?: number } = {};
  if (t.tournament?.extra.length) out.extra = t.tournament.extra;
  if (boardTarget(t) === 6) out.boardSize = 6;
  return out;
}

export type TablePhase = 'idle' | 'playing' | 'human' | 'submitting' | 'ended';
export interface Batch {
  events: PublicEvent[];
  view: TableView | null;
}
export interface Banner {
  id: number;
  kind: 'level' | 'cutFinal' | 'prize' | 'showdown';
  text?: string;
}

/** O pôster mágico lançando o efeito (o CATCHAW na tela, Pôster Poker). */
export interface CastShow {
  id: number;
  effect: PosterEffectId;
  data: EffectCastData;
  handNumber: number;
  castNo: number;
}

/**
 * Durações de referência, em ms (§7.11 e 05 §3). A velocidade multiplica (settings.ts:
 * 03/11/2026, o Normal vale 1,4× estes números e a Calma 2×).
 */
export const DUR = {
  handStarted: 380,
  blinds: 420,
  deal: 900,
  action: 520,
  human: 240,
  uncalled: 380,
  runout: 900,
  flop: 950,
  turn: 760,
  river: 760,
  riverRunout: 1100,
  showdown: 1600,
  cardsShown: 1000,
  potAwarded: 820,
  handComplete: 950,
  eliminated: 1150,
  prizeMoved: 950,
  prizeCaptured: 1700,
  levelUp: 1300,
  headsUp: 1750,
  // Pôster Poker (03/11/2026): a aproximação + CATCHAW + o nome do efeito; as cartas
  // que o efeito vira; as fichas da casa voando; o tique (curto, sai junto da aposta).
  effectCast: 2300,
  effectReveal: 1150,
  effectBonus: 1250,
  tellMark: 380,
  earlyFlop: 1350,
};

/** O CATCHAW nunca passa rápido demais para ler o nome do efeito. */
const CAST_MIN_MS = 1700;

export interface UseTableOptions {
  mode: MatchMode;
  director: Director;
  ctx: () => TableContext | null;
  compute: MatchClient | null;
  t: TFunction;
  lang: Lang;
  /** Chamado depois de cada evento projetado; se devolver uma promessa, a projeção espera (beats do treino). */
  afterEvent?: (e: PublicEvent, table: TableShow) => void | Promise<void>;
  /** Antes de abrir a vez da pessoa (o treino toca o beat da rua aqui). */
  beforeTurn?: (table: TableShow) => void | Promise<void>;
}

export interface UseTable {
  table: TableShow;
  phase: TablePhase;
  banner: Banner | null;
  /** O pôster lançando um efeito agora (some quando a espera termina ou com um toque). */
  cast: CastShow | null;
  /** Texto para o `aria-live="polite"`. */
  live: string;
  /** Texto para o `aria-live="assertive"` (a vez da pessoa). */
  alert: string;
  /** Roteiro da mesa: as últimas jogadas em texto. */
  log: { id: number; text: string; speaker?: string }[];
  addLog: (text: string, speaker?: string) => void;
  /** Mesa direto de uma `view` (retomada), sem projetar nada. */
  load: (view: TableView) => void;
  enqueue: (batch: Batch) => void;
  /** Mostra a própria ação na hora, antes da resposta (§4.7, ~400 ms). */
  optimistic: (action: PlayerAction) => void;
  /** Volta a mesa para "sua vez" depois de um erro de envio. */
  reopen: () => void;
  skipAnim: () => void;
  /** Segura a projeção até a promessa resolver (o "Estrelando…"). */
  hold: (p: Promise<void>) => void;
  lastView: TableView | null;
  getView: () => TableView | null;
  getTable: () => TableShow;
  /** Algo ainda na fila ou sendo projetado. */
  busy: () => boolean;
  /** Resolve quando a fila esvazia e a mesa terminou de projetar o último lote. */
  whenIdle: () => Promise<void>;
}

export function useTable(opts: UseTableOptions): UseTable {
  const [table, setTable] = useState<TableShow>(() => emptyTable(opts.mode));
  const [phase, setPhase] = useState<TablePhase>('idle');
  const [banner, setBanner] = useState<Banner | null>(null);
  const [cast, setCast] = useState<CastShow | null>(null);
  const castNo = useRef(0);
  const [live, setLive] = useState('');
  const [alert, setAlert] = useState('');
  const [log, setLog] = useState<{ id: number; text: string; speaker?: string }[]>([]);
  const tableRef = useRef<TableShow>(table);
  const queueRef = useRef<Batch[]>([]);
  const runningRef = useRef(false);
  const skipRef = useRef<(() => void) | null>(null);
  const holdRef = useRef<Promise<void> | null>(null);
  const aliveRef = useRef(true);
  const lastViewRef = useRef<TableView | null>(null);
  const bannerNo = useRef(0);
  const logNo = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const idleWaiters = useRef<(() => void)[]>([]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      skipRef.current?.();
    };
  }, []);

  const commit = useCallback((t: TableShow) => {
    tableRef.current = t;
    setTable(t);
  }, []);

  const addLog = useCallback((text: string, speaker?: string) => {
    logNo.current += 1;
    const id = logNo.current;
    setLog((l) => [...l.slice(-79), { id, text, speaker }]);
  }, []);

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      if (ms <= 0 || !aliveRef.current) {
        resolve();
        return;
      }
      let timer = 0;
      const done = () => {
        window.clearTimeout(timer);
        if (skipRef.current === done) skipRef.current = null;
        resolve();
      };
      timer = window.setTimeout(done, ms);
      skipRef.current = done;
    });
  }, []);

  const showBanner = useCallback((b: Omit<Banner, 'id'>, ms: number) => {
    bannerNo.current += 1;
    const id = bannerNo.current;
    setBanner({ ...b, id });
    window.setTimeout(() => setBanner((cur) => (cur && cur.id === id ? null : cur)), ms);
  }, []);

  // % de chance no all-in, a partir das cartas abertas (§2.3.2). Assíncrono: só
  // aplica se a mesa ainda estiver na mesma mão.
  const refreshOdds = useCallback((t: TableShow) => {
    const client = optsRef.current.compute;
    if (!client || t.board.length >= boardTarget(t)) return;
    const hands = t.seats
      .filter((s) => s.cards.length === 2 && (s.status === 'allIn' || s.status === 'active') && s.hasCards)
      .map((s) => ({ playerId: s.id, cards: s.cards }));
    if (hands.length < 2) return;
    const hand = t.handNumber;
    const boardLen = t.board.length;
    const fx = oddsFx(t);
    void client.call({ op: 'odds', hands, board: t.board, ...fx }).then((r) => {
      if (r.kind !== 'odds' || !aliveRef.current) return;
      const cur = tableRef.current;
      if (cur.handNumber !== hand || cur.board.length !== boardLen || cur.showdown) return;
      const shown = roundOddsTo100(r.odds);
      commit({ ...cur, seats: cur.seats.map((s) => (s.id in shown ? { ...s, odds: shown[s.id] } : s)) });
    });
  }, [commit]);

  const playEvent = useCallback(
    async (e: PublicEvent) => {
      const { t, lang, director, ctx } = optsRef.current;
      const sp = speedFactor(getPokerSettings().speed);
      const A = (ms: number) => ms * sp.anim;
      const before = tableRef.current;

      // O bot pensa antes de agir: o tempo é um tell (§3.6), e Rápido/Turbo mantêm a proporção.
      if (e.t === 'action' && e.playerId !== 'human' && typeof e.thinkMs === 'number') {
        commit({ ...before, thinkingId: e.playerId, toActId: e.playerId });
        await wait(e.thinkMs * sp.think);
      }

      const after = applyEvent(tableRef.current, e);
      commit(after);

      const c = ctx();
      if (c) {
        try {
          director.onEvent(e, c);
        } catch {
          // o Diretor nunca derruba a mesa
        }
      }
      const text = narrate(t, lang, e, after);
      if (text) {
        setLive(text);
        addLog(text);
      }

      let ms = 0;
      switch (e.t) {
        case 'handStarted':
          ms = DUR.handStarted;
          break;
        case 'blindsPosted':
          playBet(2);
          ms = DUR.blinds;
          break;
        case 'holeCards':
          playDeal(after.seats.filter((s) => s.hasCards).length * 2);
          ms = DUR.deal;
          break;
        case 'action':
          if (e.action === 'check') playCheck();
          else if (e.action !== 'fold') playBet(e.allIn ? 5 : e.sizeClass === 'big' || e.sizeClass === 'overbet' ? 3 : 1);
          if (e.allIn) vibrate(30);
          ms = e.playerId === 'human' ? DUR.human : DUR.action;
          break;
        case 'uncalledReturned':
          ms = DUR.uncalled;
          break;
        case 'runout':
          refreshOdds(after);
          ms = DUR.runout;
          break;
        case 'street':
          if (e.early) {
            // O telegrama: o flop vira antes das apostas, sem varrer as blinds.
            playFlop(e.cards.length);
            ms = DUR.earlyFlop;
            break;
          }
          if (before.seats.some((s) => s.bet > 0)) playSweep();
          if (after.runout && e.street === 'river') playRumble();
          else playFlop(e.cards.length);
          if (after.runout) refreshOdds(after);
          ms = e.street === 'flop' ? DUR.flop : after.runout && e.street === 'river' ? DUR.riverRunout : DUR.turn;
          break;
        case 'showdown':
          playShowdown(false);
          ms = DUR.showdown;
          break;
        case 'cardsShown':
          ms = DUR.cardsShown;
          break;
        case 'potAwarded':
          if (e.winners.some((w) => w.playerId === 'human')) vibrate([20, 40, 40]);
          if (after.winningHand && e.potIndex === 0) showBanner({ kind: 'showdown' }, A(1600));
          ms = DUR.potAwarded;
          break;
        case 'handComplete':
          ms = DUR.handComplete;
          break;
        case 'eliminated':
          playElimination();
          if (e.playerId === 'human') vibrate(80);
          ms = DUR.eliminated;
          break;
        case 'prizeMoved':
          ms = DUR.prizeMoved;
          break;
        case 'prizeCaptured':
          showBanner({ kind: 'prize' }, A(DUR.prizeCaptured) + 300);
          ms = DUR.prizeCaptured;
          break;
        case 'levelUp':
          showBanner({ kind: 'level' }, A(DUR.levelUp) + 400);
          ms = DUR.levelUp;
          break;
        case 'headsUp':
          playCutFinal();
          showBanner({ kind: 'cutFinal' }, A(DUR.headsUp) + 300);
          ms = DUR.headsUp;
          break;
        case 'effectCast': {
          // Não pausa o Diretor: a fala que explica o efeito sai junto (pedido do H).
          castNo.current += 1;
          setCast({ id: castNo.current, effect: e.effect, data: e.data, handNumber: e.handNumber, castNo: e.castNo });
          playCatchaw();
          vibrate([40, 30, 90]);
          await wait(Math.max(CAST_MIN_MS, A(DUR.effectCast)));
          setCast(null);
          break;
        }
        case 'effectReveal':
          playFlop(Math.min(4, e.cards.reduce((a, c) => a + c.cards.length, 0)));
          ms = DUR.effectReveal;
          break;
        case 'effectBonus':
          playHouseChips();
          if (e.playerId === 'human') vibrate([20, 40, 40]);
          ms = DUR.effectBonus;
          break;
        case 'tellMark':
          ms = DUR.tellMark;
          break;
        case 'matchEnded':
          if (e.humanPlace === 1) {
            playVictory();
            vibrate([30, 40, 60, 40, 90]);
          }
          break;
        default:
          break;
      }
      // A ação da própria pessoa já apareceu na hora (otimista): passa rápido.
      if (ms) await wait(A(ms));
      if (optsRef.current.afterEvent) await optsRef.current.afterEvent(e, tableRef.current);
    },
    [addLog, commit, refreshOdds, showBanner, wait],
  );

  const settle = useCallback(() => {
    const t = tableRef.current;
    if (t.ended || t.status !== 'running') {
      setPhase('ended');
      return;
    }
    if (t.toActId === 'human' && t.legal) {
      setPhase('human');
      const { tt, lang } = { tt: optsRef.current.t, lang: optsRef.current.lang };
      const me = seatOf(t, 'human');
      const f = new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'en-US');
      setAlert(tt('poker.actions.yourTurnAria', { pot: f.format(t.legal.pot), toCall: f.format(t.legal.toCall), stack: f.format(me?.stack ?? 0) }));
      playYourTurn();
      vibrate(12);
      return;
    }
    setPhase('idle');
  }, []);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase('playing');
    while (queueRef.current.length > 0 && aliveRef.current) {
      const batch = queueRef.current.shift()!;
      for (const e of batch.events) {
        if (!aliveRef.current) break;
        if (holdRef.current) {
          await holdRef.current;
          holdRef.current = null;
        }
        await playEvent(e);
      }
      if (batch.view) {
        lastViewRef.current = batch.view;
        commit(fromView(batch.view, tableRef.current));
      }
    }
    const t = tableRef.current;
    if (aliveRef.current && optsRef.current.beforeTurn && t.toActId === 'human' && t.legal && !t.ended) await optsRef.current.beforeTurn(t);
    runningRef.current = false;
    if (aliveRef.current) {
      // Chegou lote novo enquanto esperava: continua projetando.
      if (queueRef.current.length > 0) {
        void run();
        return;
      }
      settle();
    }
    const waiters = idleWaiters.current.splice(0);
    waiters.forEach((w) => w());
  }, [commit, playEvent, settle]);

  const enqueue = useCallback(
    (batch: Batch) => {
      // O Diretor lê a view do fim do lote desde o primeiro evento (contexto da mesa).
      if (batch.view) lastViewRef.current = batch.view;
      queueRef.current.push(batch);
      void run();
    },
    [run],
  );

  const load = useCallback(
    (view: TableView) => {
      lastViewRef.current = view;
      commit(fromView(view, null));
      settle();
    },
    [commit, settle],
  );

  const optimistic = useCallback(
    (action: PlayerAction) => {
      const t = tableRef.current;
      const legal = t.legal;
      const me = seatOf(t, 'human');
      setPhase('submitting');
      setAlert('');
      if (!legal || !me) return;
      let to = me.bet;
      let amount = 0;
      let kind: 'fold' | 'check' | 'call' | 'bet' | 'raise' = 'check';
      if (action.type === 'fold') kind = 'fold';
      else if (action.type === 'call' && legal.call) {
        kind = 'call';
        amount = legal.call.amount;
        to = me.bet + amount;
      } else if (action.type === 'bet' || action.type === 'raise') {
        kind = action.type;
        to = action.amount;
        amount = to - me.bet;
      } else if (action.type === 'allIn' && legal.allIn) {
        kind = legal.allIn.kind;
        to = legal.allIn.to;
        amount = legal.allIn.amount;
      }
      const allIn = amount >= me.stack && amount > 0;
      if (kind === 'check') playCheck();
      else if (kind !== 'fold') playBet(allIn ? 5 : 1);
      commit({
        ...t,
        toActId: null,
        legal: null,
        potTotal: t.potTotal + amount,
        seats: t.seats.map((s) =>
          s.id === 'human'
            ? {
                ...s,
                stack: s.stack - amount,
                bet: to,
                status: kind === 'fold' ? 'folded' : allIn ? 'allIn' : s.status,
                last: { kind, amount, to, allIn },
              }
            : s,
        ),
      });
    },
    [commit],
  );

  const reopen = useCallback(() => {
    const v = lastViewRef.current;
    if (v) commit(fromView(v, tableRef.current));
    settle();
  }, [commit, settle]);

  const skipAnim = useCallback(() => {
    skipRef.current?.();
  }, []);

  const hold = useCallback((p: Promise<void>) => {
    holdRef.current = p;
  }, []);

  return {
    table,
    phase,
    banner,
    cast,
    live,
    alert,
    log,
    addLog,
    load,
    enqueue,
    optimistic,
    reopen,
    skipAnim,
    hold,
    lastView: lastViewRef.current,
    getView: () => lastViewRef.current,
    getTable: () => tableRef.current,
    busy: () => runningRef.current || queueRef.current.length > 0,
    whenIdle: () =>
      runningRef.current || queueRef.current.length > 0
        ? new Promise<void>((resolve) => idleWaiters.current.push(resolve))
        : Promise.resolve(),
  };
}
