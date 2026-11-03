/**
 * Mesa com amigos (03/11/2026, fase 3 — G3): a partida roda no servidor (Edge
 * `poker-friends` do F3; na prévia, o mockFriends). Cada aparelho recebe um aviso de
 * mudança (Realtime, sem cartas) e pede a SUA visão (`sync`). Os eventos e a view vêm
 * crus (ids p1..p4) e aqui viram o ponto de vista de "eu" = 'human' (povEvents/povView
 * do E3), para a mesa, a narração e o Diretor tratarem igual às outras mesas.
 *
 * O relógio é do servidor: 30 s por decisão (`deadline`). Quando o prazo de quem está na
 * vez passa, qualquer aparelho pede o `tick` (o servidor confere). 3 estouros = ausente
 * (a mesa joga pela pessoa até ela tocar "Voltar"). Sair no meio = desistência.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlayerAction } from '../engine.ts';
import type { PlayerId, PosterEffectId, PublicEvent, RivalId, TableView } from '../types.ts';
import { povEvents, povView } from '../match/pov.ts';
import { PokerClientError } from './apiTypes.ts';
import type { CreditsData } from './creditsData.ts';
import { uuid } from './freeStore.ts';
import { friendsApi, type FriendsMatch, type FriendsRoom, type FriendsRoomReply } from './friends.ts';
import { personColor, setTablePeople, type SeatPerson } from './people.ts';
import { recordMatchEnd, touchSession } from './session.ts';
import { posterDef } from './tournament.ts';
import type { Rig } from './useRig.ts';
import type { MatchCtl } from './useFreeMatch.ts';
import { BLEFE_ROUTES } from '../../../components/poker/jackpot/pokerMeta.ts';

/** O relógio de quem está na vez (ids do ponto de vista de "eu"). */
export interface TurnClock {
  playerId: string;
  /** Fim do prazo no relógio deste aparelho (ms). */
  endsAt: number;
  total: number;
}

/** Um pôster de efeito na mesa (agrupado por efeito; `level` = pôsteres iguais). */
export interface TableEffectPoster {
  effect: PosterEffectId;
  level: number;
  filePath: string;
  title: string;
  titleEn: string;
}

/** Situação de cada pessoa à mesa (ids do ponto de vista de "eu"). */
export interface SeatPeopleInfo {
  status: 'playing' | 'out' | 'left';
  away: boolean;
  place: number | null;
}

export interface FriendsCtl extends MatchCtl {
  room: FriendsRoom | null;
  clock: TurnClock | null;
  /** Eu estou ausente (a mesa joga por mim). */
  away: boolean;
  back: () => void;
  /** Sair da mesa: desistência se eu ainda jogo; senão só volta para a sala. */
  leave: () => void;
  people: SeatPerson[];
  seatInfo: Record<string, SeatPeopleInfo>;
  effects: TableEffectPoster[];
  /** Fui eliminado e a mesa continua: assistindo. */
  watching: boolean;
}

const TURN_MS = 30_000;
const BACKOFF = [500, 1000, 2000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Os efeitos da sala agrupados (repetido = acumula), na ordem em que entraram. */
export function groupEffects(list: PosterEffectId[]): TableEffectPoster[] {
  const out: TableEffectPoster[] = [];
  for (const e of list) {
    const hit = out.find((x) => x.effect === e);
    if (hit) hit.level += 1;
    else {
      const d = posterDef(e);
      if (d) out.push({ effect: e, level: 1, filePath: d.filePath, title: d.titlePt, titleEn: d.titleEn });
    }
  }
  return out;
}

export function useFriendsMatch(rig: Rig, roomId: string | null): FriendsCtl {
  const navigate = useNavigate();
  const { table } = rig;
  const api = friendsApi();
  const [status, setStatus] = useState<MatchCtl['status']>('loading');
  const [room, setRoom] = useState<FriendsRoom | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [clock, setClock] = useState<TurnClock | null>(null);
  const [away, setAway] = useState(false);
  const [people, setPeople] = useState<SeatPerson[]>([]);
  const [seatInfo, setSeatInfo] = useState<Record<string, SeatPeopleInfo>>({});
  const [watching, setWatching] = useState(false);
  const tableRef = useRef(table);
  tableRef.current = table;
  const m = useRef({ lastI: 0, seq: 0, version: 0, myPid: null as string | null, mySeat: 0, started: false, ended: false, startedAt: Date.now() });
  const pending = useRef(false);
  const showNext = useRef(false);
  const syncing = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const retryRef = useRef<(() => void) | null>(null);
  const lastPing = useRef(Date.now());

  // Ids crus → "eu" = 'human'.
  const toPov = useCallback((id: string | null | undefined): string | null => {
    if (!id) return null;
    return id === m.current.myPid ? 'human' : id;
  }, []);
  const povE = (events: PublicEvent[]): PublicEvent[] => {
    const pid = m.current.myPid;
    return pid && pid !== 'human' ? povEvents(events, pid as PlayerId, m.current.mySeat) : events;
  };
  const povV = (view: TableView): TableView => {
    const pid = m.current.myPid;
    if (!pid || pid === 'human' || view.seats.some((s) => s.id === 'human')) return view;
    return povView(view, pid as PlayerId);
  };

  const buildCredits = (r: FriendsRoom, mt: FriendsMatch): CreditsData | null => {
    const res = r.result ?? mt.result;
    if (!res) return null;
    const pid = m.current.myPid;
    const mine = res.places.find((p) => p.playerId === pid);
    const ended = [...(tableRef.current.getTable().ended ? [tableRef.current.getTable().ended!] : [])][0];
    const out = tableRef.current.getTable();
    const nameOf = (userId: string | null | undefined) => r.members.find((x) => x.userId === userId)?.username ?? '';
    const meUser = r.me.userId;
    const place = mine?.place ?? ended?.humanPlace ?? 4;
    const reason: CreditsData['reason'] = place === 1 ? 'won' : ended?.reason === 'forfeit' || r.me.status === 'left' ? 'forfeit' : 'eliminated';
    return {
      mode: 'friends',
      place,
      reason,
      eliminatedBy: out.eliminatedBy.human ?? null,
      eliminatedHand: out.eliminatedHand.human ?? null,
      tableWinner: toPov(res.winner.playerId),
      bestHand: null,
      biggestPot: 0,
      title: null,
      marks: [],
      prize: null,
      captured: false,
      loan: false,
      retry: null,
      tomorrow: null,
      friends: {
        winner: res.winner.kind === 'person' ? { name: nameOf(res.winner.userId), me: res.winner.userId === meUser, oracle: null } : { name: '', me: false, oracle: res.winner.oracle },
        oracles: mt.seats.filter((s) => s.kind === 'oracle' && s.oracle).map((s) => s.oracle as RivalId),
        people: mt.seats
          .filter((s) => s.kind === 'person')
          .sort((a, b) => a.seat - b.seat)
          .map((s, i) => ({ name: nameOf(s.userId), color: personColor(i), me: s.userId === meUser })),
        stakes: res.stakes.map((s) => ({
          title: s.title ?? '',
          titleEn: s.titleEn ?? s.title ?? '',
          filePath: s.filePath,
          effect: s.effect,
          rarity: s.rarity,
          outcome: s.outcome,
          owner: nameOf(s.ownerId),
          mine: s.ownerId === meUser,
          to: s.toUserId ? nameOf(s.toUserId) : null,
          toMe: s.toUserId === meUser,
          oracle: s.oracle,
        })),
      },
    };
  };

  const apply = useCallback(
    async (reply: FriendsRoomReply, o: { fresh?: boolean } = {}) => {
      const r = reply.room;
      setRoom(r);
      m.current.version = Math.max(m.current.version, r.version);
      if (r.status === 'lobby' || r.status === 'closed') {
        navigate(`${BLEFE_ROUTES.friends}`, { replace: true });
        return;
      }
      const mt = reply.match;
      if (!mt) return;
      // Quem eu sou na mesa (e em que lugar), uma vez.
      if (!m.current.myPid && mt.myPlayerId) {
        m.current.myPid = mt.myPlayerId;
        m.current.mySeat = mt.seats.find((s) => s.playerId === mt.myPlayerId)?.seat ?? 0;
      }
      // As pessoas da mesa: nome, foto e cor da placa por lugar.
      const ppl: SeatPerson[] = mt.seats
        .filter((s) => s.kind === 'person')
        .sort((a, b) => a.seat - b.seat)
        .map((s, i) => {
          const mem = r.members.find((x) => x.userId === s.userId);
          return { playerId: toPov(s.playerId) ?? s.playerId, userId: s.userId ?? '', name: mem?.username ?? '?', avatarUrl: mem?.avatarUrl ?? null, color: personColor(i) };
        });
      setTablePeople(ppl);
      setPeople(ppl);
      rig.extras.current.friends = {
        selfId: 'human',
        people: ppl.map((p) => p.playerId),
        oracles: mt.seats.filter((s) => s.kind === 'oracle').map((s) => s.oracle as RivalId),
        stake: r.stakeRarity,
        effects: r.effects,
      };

      const view = povV(mt.view);
      const fresh = o.fresh && !m.current.started;
      const evs = povE(mt.events.filter((e) => e.i > m.current.lastI));
      if (fresh) {
        m.current.started = true;
        // Partida começando agora: projeta desde o matchStarted. Chegando tarde: a mesa como está.
        if (evs[0]?.t === 'matchStarted' && view.handNumber <= 2 && evs.length < 140) tableRef.current.enqueue({ events: evs, view });
        else tableRef.current.load(view);
      } else if (mt.gap) {
        tableRef.current.load(view);
      } else if (evs.length || view) {
        tableRef.current.enqueue({ events: evs, view });
      }
      if (mt.events.length) m.current.lastI = Math.max(m.current.lastI, ...mt.events.map((e) => e.i));
      m.current.seq = mt.seq;

      // Relógio: o prazo do servidor no relógio deste aparelho.
      const offset = Date.parse(mt.serverNow) - Date.now();
      const to = toPov(mt.toAct);
      setClock(to && mt.deadline ? { playerId: to, endsAt: Date.parse(mt.deadline) - (Number.isFinite(offset) ? offset : 0), total: TURN_MS } : null);
      const pid = m.current.myPid;
      setAway(!!pid && mt.away.includes(pid));
      const info: Record<string, SeatPeopleInfo> = {};
      Object.entries(view.people ?? {}).forEach(([id, p]) => (info[id] = { status: p.status, away: p.away, place: p.place }));
      setSeatInfo(info);
      setWatching(!!info.human && info.human.status !== 'playing' && !r.result);
      setStatus('playing');

      // Fim: os créditos depois que a mesa projetou o matchEnded.
      if ((r.result || mt.result) && !m.current.ended) {
        m.current.ended = true;
        recordMatchEnd((Date.now() - m.current.startedAt) / 60000);
        void tableRef.current.whenIdle().then(() => {
          const c = buildCredits(r, mt);
          if (c) setCredits(c);
          const res = r.result ?? mt.result;
          if (res) {
            const dest = res.stakes.find((s) => s.outcome === 'transferred')?.toUserId;
            const destSeat = mt.seats.find((s) => s.userId === dest);
            rig.dir.director.onMoment?.({ t: 'stakeResult', toId: destSeat ? toPov(destSeat.playerId) : null });
          }
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, rig, toPov],
  );

  const sync = useCallback(
    async (o: { fresh?: boolean } = {}) => {
      if (!api || !roomId) return;
      if (syncing.current) {
        again.current = true;
        return syncing.current;
      }
      const run = (async () => {
        try {
          const reply = await api.sync(roomId, o.fresh ? undefined : m.current.lastI || undefined);
          await apply(reply, o);
        } catch (e) {
          const err = e as PokerClientError;
          if (err?.status === 404) {
            navigate(BLEFE_ROUTES.friends, { replace: true });
            return;
          }
          if (o.fresh) {
            retryRef.current = () => void sync({ fresh: true });
            setStatus(err?.status === 0 || err?.code === 'network' ? 'offline' : 'error');
          }
        }
      })();
      syncing.current = run;
      await run;
      syncing.current = null;
      if (again.current) {
        again.current = false;
        await sync();
      }
    },
    [api, apply, navigate, roomId],
  );

  // Abertura: a sala e a minha visão; depois, os avisos de mudança.
  useEffect(() => {
    if (!api || !roomId) {
      setStatus('unavailable');
      return;
    }
    let off: (() => void) | null = null;
    void (async () => {
      await rig.newMatch();
      rig.extras.current.returning = false;
      await sync({ fresh: true });
      off = api.subscribe(roomId, (p) => {
        lastPing.current = Date.now();
        if (p.version > m.current.version || (typeof p.seq === 'number' && p.seq > m.current.seq)) void sync();
      });
    })();
    // Rede de segurança (F3): sem aviso há 8 s com a mesa aberta, pede assim mesmo.
    const safety = window.setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - lastPing.current > 8000) {
        lastPing.current = Date.now();
        void sync();
      }
    }, 2000);
    return () => {
      off?.();
      window.clearInterval(safety);
      setTablePeople(null);
    };
    // Só na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // O prazo de quem está na vez passou: qualquer aparelho pede o tique (o servidor confere).
  useEffect(() => {
    if (!clock || !api || !roomId) return;
    const wait = Math.max(0, clock.endsAt - Date.now()) + 700;
    const id = window.setTimeout(() => {
      api
        .tick(roomId, m.current.seq)
        .then((r) => apply(r))
        .catch((e) => {
          const err = e as PokerClientError;
          const data = (err?.data ?? {}) as { deadline?: string; serverNow?: string };
          if (err?.code === 'not_yet' && data.deadline && data.serverNow) {
            const offset = Date.parse(data.serverNow) - Date.now();
            setClock((c) => (c ? { ...c, endsAt: Date.parse(data.deadline!) - offset } : c));
          } else void sync();
        });
    }, wait);
    return () => window.clearTimeout(id);
  }, [clock, api, roomId, apply, sync]);

  const act = useCallback(
    (a: PlayerAction) => {
      if (!api || !roomId || pending.current) return;
      pending.current = true;
      tableRef.current.optimistic(a);
      touchSession();
      const show = showNext.current;
      showNext.current = false;
      const idem = uuid();
      void (async () => {
        for (let attempt = 0; attempt <= BACKOFF.length; attempt++) {
          try {
            const r = await api.act(roomId, m.current.seq, idem, a, show);
            pending.current = false;
            setStatus('playing');
            await apply(r);
            return;
          } catch (e) {
            const err = e as PokerClientError;
            if (err?.status === 409 || err?.status === 422 || err?.status === 410) {
              // Outro aparelho jogou, o relógio estourou antes, ou a jogada não valia: a visão do servidor.
              pending.current = false;
              const reply = await api.sync(roomId).catch(() => null);
              if (reply?.match) tableRef.current.load(povV(reply.match.view));
              if (reply) await apply({ ...reply, match: reply.match ? { ...reply.match, events: [] } : reply.match });
              return;
            }
            if (attempt < BACKOFF.length) {
              setStatus('reconnecting');
              await sleep(BACKOFF[attempt]);
            }
          }
        }
        pending.current = false;
        retryRef.current = () => void sync();
        setStatus('offline');
      })();
    },
    [api, apply, roomId, sync],
  );

  const back = useCallback(() => {
    if (!api || !roomId) return;
    setAway(false);
    void api.back(roomId).then((r) => apply(r), () => void sync());
  }, [api, apply, roomId, sync]);

  const leave = useCallback(() => {
    const playing = seatInfo.human?.status === 'playing' && !m.current.ended;
    if (api && roomId && playing) {
      rig.dir.director.onMoment?.({ t: 'playerLeaves' });
      void api.leave(roomId).catch(() => {});
    }
    navigate(BLEFE_ROUTES.friends);
  }, [api, navigate, rig.dir.director, roomId, seatInfo]);

  return {
    status,
    errorCode: null,
    interval: null,
    recap: null,
    credits,
    act,
    forfeit: watching || !api ? null : leave,
    rematch: () => navigate(BLEFE_ROUTES.friends),
    retry: status === 'offline' ? () => retryRef.current?.() : null,
    closeRecap: () => {},
    continueAfterInterval: () => {},
    introDone: () => setStatus('playing'),
    show: () => {
      showNext.current = true;
    },
    room,
    clock,
    away,
    back,
    leave,
    people,
    seatInfo,
    effects: groupEffects(room?.effects ?? []),
    watching,
  };
}
