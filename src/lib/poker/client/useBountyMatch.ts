/**
 * Partida com prêmio (SPEC §2.6, §4.7 e §7.9): roda no servidor (ou no mockApi).
 * A própria ação aparece na hora; a chamada `act` repete com o mesmo `idem` até 3
 * vezes (0,5 s, 1 s, 2 s) mostrando "Reconectando à mesa…" e, se não der, a mesa
 * fica "Sem conexão" com [Tentar de novo]. 409 recarrega a view; 410 vai aos
 * créditos; 426 pede atualização do app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Card } from '../cards.ts';
import type { PlayerAction } from '../engine.ts';
import { evaluateHand } from '../evaluator.ts';
import type { HandKind } from '../evaluator.ts';
import type { PublicEvent, TableView } from '../types.ts';
import type { BountyResult, PokerHome, PokerPrize } from './apiTypes.ts';
import { PokerClientError } from './apiTypes.ts';
import { pokerApi } from './api.ts';
import type { CreditsData } from './creditsData.ts';
import { uuid } from './freeStore.ts';
// O Diretor recebe o nome do prêmio já com artigo ("o Baralho Noir" / "the Noir Deck").
import { prizeWithArticle } from './format.ts';
import { invalidatePokerHome } from './usePokerHome.ts';
import { recordMatchEnd, touchSession } from './session.ts';
import type { Rig } from './useRig.ts';
import type { MatchCtl } from './useFreeMatch.ts';

export interface BountyCtl extends MatchCtl {
  prize: PokerPrize | null;
  /** O servidor pediu a confirmação 18+ antes de começar. */
  needAge: boolean;
  ageConfirmed: () => void;
  ageDeclined: () => void;
}

const BACKOFF = [500, 1000, 2000];

// 404 que não é do protocolo (a Edge Function ainda não foi publicada): a mesa
// do prêmio "abre em breve", sem quebrar. O protocolo usa 404 só com 'none' e
// 'not_found' (§4.7).
const PROTOCOL_404 = ['none', 'not_found'];
const edgeMissing = (err: PokerClientError | undefined) => err?.status === 404 && !PROTOCOL_404.includes(err.code);

// Falha de rede ao abrir a mesa: se o banco responde, quem não responde é a
// Edge (sem CORS quando a função não existe) e a mesa do prêmio fica para depois.
async function edgeDown(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await pokerApi.getHome();
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Tracker {
  best: { cards: Card[]; kind: HandKind; score: number } | null;
  biggest: number;
}

// Melhor mão e maior pote da pessoa, só com o que ela viu (cartas dela e o board).
function track(tr: Tracker, events: PublicEvent[]) {
  for (const e of events) {
    if (e.t === 'showdown') {
      const mine = e.hands.find((h) => h.playerId === 'human');
      if (mine) {
        const v = evaluateHand(mine.best5);
        if (!tr.best || v.score > tr.best.score) tr.best = { cards: mine.best5, kind: mine.kind, score: v.score };
      }
    } else if (e.t === 'potAwarded') {
      const w = e.winners.find((x) => x.playerId === 'human');
      if (w && e.amount > tr.biggest) tr.biggest = e.amount;
    }
  }
}

export function useBountyMatch(rig: Rig, home: PokerHome | null, params: { start: boolean; day: string | null; prizeId: string | null }): BountyCtl {
  const navigate = useNavigate();
  const { table, dir } = rig;
  const [status, setStatus] = useState<MatchCtl['status']>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [recap, setRecap] = useState<PublicEvent[] | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [prize, setPrize] = useState<PokerPrize | null>(null);
  const [needAge, setNeedAge] = useState(false);
  const m = useRef<{ id: string; seq: number; loan: number; startedAt: number }>({ id: '', seq: 0, loan: 0, startedAt: Date.now() });
  const pendingAct = useRef<{ action: PlayerAction; idem: string; show: boolean } | null>(null);
  const showNext = useRef(false);
  const introResolve = useRef<(() => void) | null>(null);
  const tr = useRef<Tracker>({ best: null, biggest: 0 });
  const tableRef = useRef(table);
  tableRef.current = table;
  const homeRef = useRef(home);
  homeRef.current = home;
  const prizeRef = useRef<PokerPrize | null>(null);
  // O que [Tentar de novo] refaz: a jogada pendente, ou abrir/retomar a mesa.
  const retryRef = useRef<(() => void) | null>(null);

  const lastEvents = useRef<PublicEvent[]>([]);
  const toCredits = useCallback((result: BountyResult, o: { instant?: boolean } = {}) => {
    invalidatePokerHome();
    recordMatchEnd((Date.now() - m.current.startedAt) / 60000);
    const t = tableRef.current.getTable();
    const out = [...lastEvents.current].reverse().find((e) => e.t === 'eliminated' && e.playerId === 'human') as
      | Extract<PublicEvent, { t: 'eliminated' }>
      | undefined;
    const b = homeRef.current?.bounty;
    const used = (b?.attempts_used ?? 0) + (params.start ? 1 : 0);
    const max = b?.max_attempts ?? 3;
    setCredits({
      mode: 'bounty',
      place: result.place,
      reason: result.status === 'won' ? 'won' : result.status === 'lost' ? 'eliminated' : result.status,
      eliminatedBy: out?.byId ?? t.eliminatedBy.human ?? null,
      eliminatedHand: out?.handNumber ?? t.eliminatedHand.human ?? null,
      bestHand: tr.current.best,
      biggestPot: tr.current.biggest,
      title: result.title ? { id: result.title.id, rankUp: result.title.rankUp } : null,
      marks: result.marks ?? [],
      prize: result.prize ?? prizeRef.current,
      captured: result.prizeCaptured,
      loan: m.current.loan > 0,
      retry: !result.prizeCaptured && used < max ? { n: used + 1, max } : null,
      tomorrow: b?.tomorrow ?? null,
      instant: o.instant,
    });
    if (result.title?.rankUp) dir.director.onMoment?.({ t: 'rankUp', title: result.title.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir.director]);

  // `fresh`: a mesa abrindo agora (Diretor novo e "Anteriormente em…"); sem ele, só
  // ressincroniza com o servidor no meio da partida (409 sem view).
  const resume = useCallback(async (o: { fresh?: boolean } = {}) => {
    const fresh = o.fresh !== false;
    if (fresh) setStatus('loading');
    try {
      if (fresh) {
        await rig.newMatch();
        rig.extras.current.returning = true;
      }
      const r = await pokerApi.bounty.resume();
      m.current = { id: r.matchId, seq: r.seq, loan: r.loan, startedAt: Date.now() };
      setPrize(r.prize);
      prizeRef.current = r.prize;
      rig.extras.current.prize = { name: prizeWithArticle(r.prize, rig.lang), kind: r.prize.kind as never, rarity: r.prize.rarity };
      tableRef.current.load(r.view);
      track(tr.current, r.recent);
      // Quem eliminou a pessoa sai da cauda do servidor (a mesa retomada não projetou nada).
      lastEvents.current = r.recent;
      if (r.result) {
        toCredits(r.result, { instant: true });
        setStatus('playing');
        return;
      }
      if (fresh) setRecap(r.recent);
      setStatus('playing');
    } catch (e) {
      const err = e as PokerClientError;
      if (edgeMissing(err)) {
        setStatus('unavailable');
        return;
      }
      if (err?.status === 404) {
        navigate('/blefe', { replace: true });
        return;
      }
      if (err?.status === 0 || err?.code === 'network') {
        retryRef.current = () => void resume();
        setStatus((await edgeDown()) ? 'unavailable' : 'offline');
        return;
      }
      setErrorCode(err?.code ?? 'error');
      setStatus(err?.status === 426 ? 'updateRequired' : 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, toCredits]);

  const start = useCallback(async () => {
    if (!params.day || !params.prizeId) return resume();
    setStatus('loading');
    try {
      await rig.newMatch();
      rig.extras.current.returning = false;
      const r = await pokerApi.bounty.start(params.day, params.prizeId);
      // Daqui em diante, recarregar retoma (e nunca cobra outra ficha). Só a barra de
      // endereço muda: trocar a rota remontaria a mesa no meio da abertura.
      try {
        window.history.replaceState(window.history.state, '', '/blefe/premio');
      } catch {
        // sem history: recarregar cai no lobby, que mostra "Continuar"
      }
      invalidatePokerHome();
      m.current = { id: r.matchId, seq: r.seq, loan: r.loan, startedAt: Date.now() };
      setPrize(r.prize);
      prizeRef.current = r.prize;
      rig.extras.current.prize = { name: prizeWithArticle(r.prize, rig.lang), kind: r.prize.kind as never, rarity: r.prize.rarity };
      setStatus('intro');
      track(tr.current, r.events);
      tableRef.current.enqueue({ events: r.events.slice(0, 1), view: null });
      tableRef.current.hold(new Promise<void>((res) => (introResolve.current = res)));
      tableRef.current.enqueue({ events: r.events.slice(1), view: r.view });
    } catch (e) {
      const err = e as PokerClientError;
      const code = err?.code ?? 'error';
      if (code === 'age_required') {
        setNeedAge(true);
        return;
      }
      if (code === 'active_exists') {
        navigate('/blefe/premio', { replace: true });
        return resume();
      }
      if (err?.status === 426) {
        setStatus('updateRequired');
        return;
      }
      if (edgeMissing(err)) {
        setStatus('unavailable');
        return;
      }
      if (err?.status === 0 || code === 'network') {
        // Sem resposta: tentar de novo é seguro (uma partida ativa por pessoa; a
        // repetição cai em active_exists e retoma, sem outro débito).
        retryRef.current = () => void start();
        setStatus((await edgeDown()) ? 'unavailable' : 'offline');
        return;
      }
      // stale_day, prize_changed, limit, won_today, no_chips, closed: volta ao lobby, que mostra o estado certo.
      invalidatePokerHome();
      navigate('/blefe', { replace: true, state: { pokerError: code } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, params.day, params.prizeId, resume]);

  useEffect(() => {
    void (params.start ? start() : resume({ fresh: true }));
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(async () => {
    const p = pendingAct.current;
    if (!p) return;
    for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
      try {
        const r = await pokerApi.bounty.act(m.current.id, m.current.seq, p.idem, p.action, p.show);
        pendingAct.current = null;
        m.current.seq = r.seq;
        setStatus('playing');
        track(tr.current, r.events);
        lastEvents.current = [...lastEvents.current, ...r.events].slice(-60);
        tableRef.current.enqueue({ events: r.events, view: r.view });
        if (r.result) toCredits(r.result);
        return;
      } catch (e) {
        const err = e as PokerClientError;
        if (err?.status === 409 || err?.status === 422) {
          // Outra aba jogou, ou a jogada não valia mais: a mesa volta para a view do servidor.
          pendingAct.current = null;
          const data = (err.data ?? {}) as { seq?: number; view?: TableView };
          if (typeof data.seq === 'number') m.current.seq = data.seq;
          if (data.view) tableRef.current.load(data.view);
          else await resume({ fresh: false });
          setStatus('playing');
          return;
        }
        if (err?.status === 410) {
          pendingAct.current = null;
          const data = (err.data ?? {}) as { result?: BountyResult };
          if (data.result) toCredits(data.result);
          setStatus('playing');
          return;
        }
        if (err?.status === 426) {
          setStatus('updateRequired');
          return;
        }
        if (attempt < BACKOFF.length) {
          setStatus('reconnecting');
          await sleep(BACKOFF[attempt]);
        }
      }
    }
    retryRef.current = () => void send();
    setStatus('offline');
  }, [resume, toCredits]);

  const act = useCallback(
    (a: PlayerAction) => {
      if (pendingAct.current) return;
      tableRef.current.optimistic(a);
      touchSession();
      pendingAct.current = { action: a, idem: uuid(), show: showNext.current };
      showNext.current = false;
      void send();
    },
    [send],
  );

  const forfeit = useCallback(() => {
    void (async () => {
      try {
        const r = await pokerApi.bounty.forfeit(m.current.id, m.current.seq);
        tableRef.current.enqueue({
          events: [{ i: Number.MAX_SAFE_INTEGER, t: 'matchEnded', places: {} as Record<string, number>, winnerId: null, humanPlace: r.place, reason: 'forfeit', prizeCaptured: r.prizeCaptured }],
          view: null,
        });
        toCredits(r);
      } catch (e) {
        const err = e as PokerClientError;
        if (err?.status === 410) {
          const data = (err.data ?? {}) as { result?: BountyResult };
          if (data.result) toCredits(data.result);
        }
      }
    })();
  }, [toCredits]);

  return {
    status,
    errorCode,
    interval: null,
    recap,
    credits,
    prize,
    needAge,
    ageConfirmed: () => {
      setNeedAge(false);
      void start();
    },
    ageDeclined: () => {
      setNeedAge(false);
      navigate('/blefe', { replace: true });
    },
    act,
    forfeit,
    // "Revanche grátis": no prêmio, abre uma mesa livre (§7.6).
    rematch: () => navigate('/blefe/mesa'),
    retry: status === 'offline' ? () => retryRef.current?.() : null,
    closeRecap: () => setRecap(null),
    continueAfterInterval: () => {},
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
