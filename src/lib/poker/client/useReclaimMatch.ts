/**
 * Casual de devolução (03/11/2026, fase 3 — item 5, G3). A cada 3 casuais, se a pessoa
 * perdeu um pôster para um oráculo (aposta do torneio, ou mesa com amigos vencida por
 * oráculo), o servidor (`casual.begin()` → `mode: 'server'`) faz esta casual rodar na
 * Edge, com o oráculo que tomou o pôster carregando ele na mesa — o portador da fase 1
 * ("Procurado"). Nada é anunciado: a mesa é a casual de sempre com o selo no oráculo.
 * Eliminar o portador (ou vencer a mesa) devolve o pôster; os créditos mostram. Perder:
 * nada de especial (ele volta daqui a 3 casuais).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayerAction } from '../engine.ts';
import type { PublicEvent, RivalId, TableView } from '../types.ts';
import { PokerClientError, type PokerPrize } from './apiTypes.ts';
import type { CreditsData } from './creditsData.ts';
import { casualApi, type CasualBegin, type FriendsPosterCard, type RecoverResult } from './friends.ts';
import { uuid } from './freeStore.ts';
import { recordMatchEnd, touchSession } from './session.ts';
import type { Rig } from './useRig.ts';
import type { MatchCtl } from './useFreeMatch.ts';
import { BLEFE_ROUTES } from '../../../components/poker/jackpot/pokerMeta.ts';

export interface ReclaimCtl extends MatchCtl {
  prize: PokerPrize | null;
}

const BACKOFF = [500, 1000, 2000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ServerBegin = Extract<CasualBegin, { mode: 'server' }>;

export function useReclaimMatch(rig: Rig, begin: ServerBegin, onGone: () => void): ReclaimCtl {
  const navigate = useNavigate();
  const { table } = rig;
  const api = casualApi();
  const [status, setStatus] = useState<MatchCtl['status']>('loading');
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [prize, setPrize] = useState<PokerPrize | null>(null);
  const [recap, setRecap] = useState<PublicEvent[] | null>(null);
  const m = useRef({ id: '', seq: 0, startedAt: Date.now() });
  const poster = useRef<FriendsPosterCard | null>(null);
  const pending = useRef(false);
  const showNext = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);
  const tableRef = useRef(table);
  tableRef.current = table;
  const events = useRef<PublicEvent[]>([]);

  const toCredits = useCallback((r: RecoverResult, o: { instant?: boolean } = {}) => {
    recordMatchEnd((Date.now() - m.current.startedAt) / 60000);
    const t = tableRef.current.getTable();
    const out = [...events.current].reverse().find((e) => e.t === 'eliminated' && e.playerId === 'human') as Extract<PublicEvent, { t: 'eliminated' }> | undefined;
    const back = r.recovered ? r.poster ?? poster.current : null;
    setCredits({
      mode: 'free',
      place: r.place,
      reason: r.status === 'won' ? 'won' : r.status === 'lost' ? 'eliminated' : r.status,
      eliminatedBy: out?.byId ?? t.eliminatedBy.human ?? null,
      eliminatedHand: out?.handNumber ?? t.eliminatedHand.human ?? null,
      tableWinner: null,
      bestHand: null,
      biggestPot: 0,
      title: null,
      marks: [],
      prize: null,
      captured: false,
      loan: false,
      retry: null,
      tomorrow: null,
      instant: o.instant,
      recovered: back ? { title: back.title ?? '', titleEn: back.titleEn ?? back.title ?? '', filePath: back.filePath, effect: back.effect, rarity: back.rarity } : null,
    });
  }, []);

  const setup = (p: PokerPrize | undefined | null, carrier: RivalId | null | undefined, card: FriendsPosterCard | null | undefined) => {
    setPrize(p ?? null);
    poster.current = card ?? null;
    // O Diretor sabe quem carrega; nada de "partida valendo" (H3): sem ctx.prize.
    rig.extras.current.prize = undefined;
    rig.extras.current.reclaim = { holderId: carrier ?? undefined };
  };

  const open = useCallback(async () => {
    if (!api) {
      onGone();
      return;
    }
    setStatus('loading');
    try {
      await rig.newMatch();
      if ('ticket' in begin) {
        rig.extras.current.returning = false;
        const r = await api.start(begin.ticket);
        m.current = { id: r.matchId, seq: r.seq, startedAt: Date.now() };
        setup(r.prize, r.carrier, r.recoverPrize ?? null);
        events.current = r.events.slice(-60);
        setStatus('playing');
        tableRef.current.enqueue({ events: r.events, view: r.view });
      } else {
        rig.extras.current.returning = true;
        const r = await api.resume(begin.matchId);
        m.current = { id: r.matchId, seq: r.seq, startedAt: Date.now() };
        setup(r.prize, r.carrier, r.recoverPrize ?? null);
        tableRef.current.load(r.view);
        events.current = r.recent;
        if (r.result) {
          toCredits(r.result, { instant: true });
        } else setRecap(r.recent);
        setStatus('playing');
      }
    } catch (e) {
      const err = e as PokerClientError;
      // 410 gone (bilhete vencido, nada a devolver) e 404: a casual de sempre, no aparelho.
      if (err?.status === 410 || err?.status === 404) {
        onGone();
        return;
      }
      if (err?.status === 0 || err?.code === 'network') {
        retryRef.current = () => void open();
        setStatus('offline');
        return;
      }
      setStatus(err?.status === 426 ? 'updateRequired' : 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, begin, toCredits]);

  useEffect(() => {
    void open();
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resync = useCallback(async () => {
    if (!api) return;
    try {
      const r = await api.resume(m.current.id);
      m.current.seq = r.seq;
      tableRef.current.load(r.view);
      if (r.result) toCredits(r.result);
    } catch {
      // fica a mesa como está
    }
  }, [api, toCredits]);

  const send = useCallback(
    async (a: PlayerAction, idem: string, show: boolean) => {
      if (!api) return;
      for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
        try {
          const r = await api.act(m.current.id, m.current.seq, idem, a, show);
          pending.current = false;
          m.current.seq = r.seq;
          setStatus('playing');
          events.current = [...events.current, ...r.events].slice(-60);
          tableRef.current.enqueue({ events: r.events, view: r.view });
          if (r.result) toCredits(r.result);
          return;
        } catch (e) {
          const err = e as PokerClientError;
          if (err?.status === 409 || err?.status === 422) {
            pending.current = false;
            const data = (err.data ?? {}) as { seq?: number; view?: TableView };
            if (typeof data.seq === 'number') m.current.seq = data.seq;
            if (data.view) tableRef.current.load(data.view);
            else await resync();
            setStatus('playing');
            return;
          }
          if (err?.status === 410) {
            pending.current = false;
            const data = (err.data ?? {}) as { result?: RecoverResult };
            if (data.result) toCredits(data.result);
            return;
          }
          if (attempt < BACKOFF.length) {
            setStatus('reconnecting');
            await sleep(BACKOFF[attempt]);
          }
        }
      }
      pending.current = false;
      retryRef.current = () => void send(a, idem, show);
      setStatus('offline');
    },
    [api, resync, toCredits],
  );

  const act = useCallback(
    (a: PlayerAction) => {
      if (pending.current) return;
      pending.current = true;
      tableRef.current.optimistic(a);
      touchSession();
      const show = showNext.current;
      showNext.current = false;
      void send(a, uuid(), show);
    },
    [send],
  );

  const forfeit = useCallback(() => {
    if (!api) return;
    void api.forfeit(m.current.id, m.current.seq).then(
      (r) => {
        tableRef.current.enqueue({
          events: [{ i: Number.MAX_SAFE_INTEGER, t: 'matchEnded', places: {} as Record<string, number>, winnerId: null, humanPlace: r.place, reason: 'forfeit', prizeCaptured: !!r.recovered }],
          view: null,
        });
        toCredits(r);
      },
      () => void resync(),
    );
  }, [api, resync, toCredits]);

  return {
    status,
    errorCode: null,
    interval: null,
    recap,
    credits,
    prize,
    act,
    forfeit,
    // Revanche: uma casual nova (o servidor decide de novo se é de devolução).
    rematch: () => navigate(BLEFE_ROUTES.free, { replace: true, state: { again: Date.now() } }),
    retry: status === 'offline' ? () => retryRef.current?.() : null,
    closeRecap: () => setRecap(null),
    continueAfterInterval: () => {},
    introDone: () => setStatus('playing'),
    show: () => {
      showNext.current = true;
    },
  };
}
