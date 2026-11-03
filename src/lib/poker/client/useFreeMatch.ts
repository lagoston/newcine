/**
 * Partida livre no aparelho (SPEC §2.5, §4.6 e §7.8): cria no Worker, salva depois
 * de cada ação (24 h), retoma com "Anteriormente em…", abre com o Intervalo quando
 * é hora e, no fim, relata uma vez só (fila local + `clientId` idempotente).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerAction } from '../engine.ts';
import type { MatchState, MatchSummary, PublicEvent, TitleId } from '../types.ts';
import type { IntervalPick, PokerHome } from './apiTypes.ts';
import { pokerApi } from './api.ts';
import { buildConfig } from './matchConfig.ts';
import type { CoreReply } from './matchCore.ts';
import {
  FREE_TTL_MS,
  dropPendingReport,
  finishFreeMatch,
  loadFoxMemory,
  loadFreeMatch,
  pendingReports,
  randomSeed,
  saveFoxMemory,
  saveFreeMatch,
  uuid,
} from './freeStore.ts';
import { intervalDue, markIntervalShown, recordMatchEnd, touchSession } from './session.ts';
import type { Rig } from './useRig.ts';
import type { CreditsData } from './creditsData.ts';

export type FreeStatus = 'loading' | 'interval' | 'intro' | 'playing' | 'unavailable' | 'error';

export interface MatchCtl {
  status: FreeStatus | 'reconnecting' | 'offline' | 'updateRequired';
  errorCode: string | null;
  interval: IntervalPick | null;
  recap: PublicEvent[] | null;
  credits: CreditsData | null;
  act: (a: PlayerAction) => void;
  forfeit: (() => void) | null;
  rematch: () => void;
  retry: (() => void) | null;
  closeRecap: () => void;
  continueAfterInterval: (rated: boolean) => void;
  introDone: () => void;
  show: () => void;
}

/** Envia os relatos que ficaram na fila (sem rede na hora, app fechado…). */
export async function flushPendingReports(): Promise<{ wins: number; title: TitleId } | null> {
  let last: { wins: number; title: TitleId } | null = null;
  for (const s of pendingReports()) {
    try {
      const r = await pokerApi.reportFreeMatch(s);
      dropPendingReport(s.clientId);
      if (r.ok) last = { wins: r.wins, title: r.title };
    } catch {
      break; // sem rede: tenta na próxima abertura
    }
  }
  return last;
}

export function useFreeMatch(rig: Rig, home: PokerHome | null): MatchCtl {
  const { table, client, dir } = rig;
  const [status, setStatus] = useState<FreeStatus>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [interval, setIntervalPick] = useState<IntervalPick | null>(null);
  const [recap, setRecap] = useState<PublicEvent[] | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const meta = useRef<{ clientId: string; startedAt: string; tail: PublicEvent[]; state: MatchState | null }>({
    clientId: '',
    startedAt: '',
    tail: [],
    state: null,
  });
  const showNext = useRef(false);
  const introResolve = useRef<(() => void) | null>(null);
  const busy = useRef(false);
  const homeRef = useRef(home);
  homeRef.current = home;
  const tableRef = useRef(table);
  tableRef.current = table;

  const persist = (state: MatchState, events: PublicEvent[]) => {
    meta.current.state = state;
    meta.current.tail = saveFreeMatch({ startedAt: meta.current.startedAt, clientId: meta.current.clientId, state }, events, meta.current.tail);
  };

  // Fim da partida: relato na fila no mesmo passo em que o "em andamento" some
  // (recarregar no meio dos créditos nunca relata duas vezes).
  const finish = useCallback(
    async (state: MatchState, events: PublicEvent[] = []) => {
      const endedAt = new Date().toISOString();
      const sum = await client.call({ op: 'summarize', meta: { clientId: meta.current.clientId, startedAt: meta.current.startedAt, endedAt } });
      if (sum.kind !== 'summary') return;
      const summary: MatchSummary = sum.summary;
      finishFreeMatch(summary);
      saveFoxMemory(state.bots?.fincher?.model);
      recordMatchEnd(summary.durationS / 60);
      // Quem eliminou sai dos eventos do lote (a mesa ainda nem projetou o fim).
      const t = tableRef.current.getTable();
      const out = [...meta.current.tail, ...events].reverse().find((e) => e.t === 'eliminated' && e.playerId === 'human') as
        | Extract<PublicEvent, { t: 'eliminated' }>
        | undefined;
      const base: CreditsData = {
        mode: 'free',
        place: summary.place,
        reason: summary.reason,
        eliminatedBy: out?.byId ?? t.eliminatedBy.human ?? null,
        eliminatedHand: out?.handNumber ?? t.eliminatedHand.human ?? null,
        tableWinner: summary.place === 1 ? 'human' : undefined,
        bestHand: summary.human.bestHand ? { cards: summary.human.bestHand.cards, kind: summary.human.bestHand.kind } : null,
        biggestPot: summary.human.biggestPot,
        title: null,
        marks: [],
        prize: null,
        captured: false,
        loan: false,
        retry: null,
        tomorrow: null,
      };
      setCredits(base);
      // Quem levou a mesa: os bots jogam o resto no Worker, sem desenhar (§2.3.4).
      if (summary.place > 1) {
        void client.call({ op: 'simulateRest' }).then((r) => {
          const winnerId = r.kind === 'rest' ? r.winnerId : null;
          setCredits((c) => (c ? { ...c, tableWinner: winnerId } : c));
          if (winnerId) dir.director.onMoment?.({ t: 'tableWinner', winnerId });
        });
      }
      const before = homeRef.current?.title?.id ?? null;
      try {
        const r = await pokerApi.reportFreeMatch(summary);
        dropPendingReport(summary.clientId);
        if (r.ok) {
          const rankUp = !!before && before !== r.title;
          setCredits((c) => (c ? { ...c, title: { id: r.title, rankUp } } : c));
          if (rankUp) dir.director.onMoment?.({ t: 'rankUp', title: r.title });
        }
      } catch {
        // fica na fila; vai na próxima abertura
      }
    },
    [client, dir.director],
  );

  const handleReply = useCallback(
    (r: CoreReply, introFirst = false) => {
      if (r.kind !== 'step') return false;
      persist(r.state, r.events);
      if (introFirst && r.events.length > 0) {
        tableRef.current.enqueue({ events: r.events.slice(0, 1), view: null });
        tableRef.current.hold(new Promise<void>((res) => (introResolve.current = res)));
        tableRef.current.enqueue({ events: r.events.slice(1), view: r.view });
      } else {
        tableRef.current.enqueue({ events: r.events, view: r.view });
      }
      if (r.state.status !== 'running') void finish(r.state, r.events);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finish],
  );

  const create = useCallback(async () => {
    setCredits(null);
    setRecap(null);
    setStatus('loading');
    meta.current = { clientId: uuid(), startedAt: new Date().toISOString(), tail: [], state: null };
    const cfg = buildConfig({ mode: 'free', seed: randomSeed(), home: homeRef.current, memory: loadFoxMemory() });
    const r = await client.call({ op: 'create', cfg });
    if (r.kind === 'error') {
      setErrorCode(r.code);
      setStatus(r.code === 'not_implemented' ? 'unavailable' : 'error');
      return;
    }
    setStatus('intro');
    handleReply(r, true);
  }, [client, handleReply]);

  // Abertura: relatos pendentes, retomada (ou abandono depois de 24 h), Intervalo.
  useEffect(() => {
    let alive = true;
    (async () => {
      void flushPendingReports();
      const saved = loadFreeMatch();
      if (saved && saved.state.status === 'running') {
        const restored = await client.call({ op: 'restore', state: saved.state });
        if (!alive) return;
        if (restored.kind !== 'step') {
          setErrorCode(restored.kind === 'error' ? restored.code : 'error');
          setStatus('error');
          return;
        }
        meta.current = { clientId: saved.clientId, startedAt: saved.startedAt, tail: saved.tail, state: saved.state };
        if (Date.now() - saved.savedAt > FREE_TTL_MS) {
          // Passou de 24 h sem ação: relatada como abandonada, e a mesa recomeça.
          const ab = await client.call({ op: 'abandon' });
          if (ab.kind === 'step') await finish(ab.state);
          setCredits(null);
        } else {
          tableRef.current.load(restored.view);
          setRecap(saved.tail);
          setStatus('playing');
          return;
        }
      } else if (saved) {
        // Partida já terminada que não chegou a fechar (app fechado no fim).
        await client.call({ op: 'restore', state: saved.state });
        meta.current = { clientId: saved.clientId, startedAt: saved.startedAt, tail: saved.tail, state: saved.state };
        await finish(saved.state);
        setCredits(null);
      }
      if (!alive) return;
      if (intervalDue()) {
        try {
          const pick = await pokerApi.intervalPick();
          if (!alive) return;
          if (pick) {
            setIntervalPick(pick);
            setStatus('interval');
            return;
          }
        } catch {
          // sem watchlist ou sem rede: segue sem Intervalo
        }
        markIntervalShown();
      }
      await create();
    })();
    return () => {
      alive = false;
    };
    // Só na abertura da mesa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = useCallback(
    (a: PlayerAction) => {
      if (busy.current) return;
      busy.current = true;
      tableRef.current.optimistic(a);
      touchSession();
      const show = showNext.current;
      showNext.current = false;
      void (async () => {
        let r = await client.call({ op: 'act', action: a, show });
        // O Worker caiu e voltou vazio: restaura do salvo e tenta de novo.
        if (r.kind === 'error' && r.code === 'no_match' && meta.current.state) {
          await client.call({ op: 'restore', state: meta.current.state });
          r = await client.call({ op: 'act', action: a, show });
        }
        busy.current = false;
        if (r.kind !== 'step') {
          tableRef.current.reopen();
          return;
        }
        handleReply(r);
      })();
    },
    [client, handleReply],
  );

  const forfeit = useCallback(() => {
    void (async () => {
      const r = await client.call({ op: 'forfeit' });
      if (r.kind === 'step') handleReply(r);
    })();
  }, [client, handleReply]);

  const rematch = useCallback(() => {
    dir.director.onMoment?.({ t: 'rematch' });
    void create();
  }, [create, dir.director]);

  return {
    status,
    errorCode,
    interval,
    recap,
    credits,
    act,
    forfeit,
    rematch,
    retry: null,
    closeRecap: () => setRecap(null),
    continueAfterInterval: (rated) => {
      markIntervalShown();
      setIntervalPick(null);
      if (rated) dir.director.onMoment?.({ t: 'intervalReturn' });
      void create();
    },
    introDone: () => {
      introResolve.current?.();
      introResolve.current = null;
      setStatus('playing');
    },
    show: () => {
      showNext.current = true;
    },
  };
}
