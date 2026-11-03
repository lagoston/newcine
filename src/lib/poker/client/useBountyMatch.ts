/**
 * Partida valendo (SPEC §2.6, §4.7 e §7.9): roda no servidor (ou no mockApi).
 * 03/11/2026 (tarde): é o TORNEIO DA SEMANA do Pôster Poker (o modo interno continua
 * 'bounty'). A entrada vai no `start` (fichas ou um pôster apostado, proto 2) e a
 * resposta final traz `rewards` (o pôster dourado, o item da Cobra, o que foi apostado).
 *
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
import type { BountyResult, BountyStart, PokerHome, PokerPrize } from './apiTypes.ts';
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
import { posterTitle, tournamentOf, type TournamentPrize, type TournamentRewards, type TournamentStake } from './tournament.ts';
import { BLEFE_ROUTES } from '../../../components/poker/jackpot/pokerMeta.ts';

/** O pôster apostado como a mesa mostra (a arte vem da coleção da pessoa). */
export interface StakeInfo {
  kind: 'chips' | 'poster';
  itemId?: number;
  effect?: string;
  title?: string;
  filePath?: string;
}

export interface TourneyInfo {
  prize: TournamentPrize;
  stake: StakeInfo | null;
}

export interface BountyCtl extends MatchCtl {
  prize: PokerPrize | null;
  /** Pôster Poker: o pôster da semana e o que a pessoa pôs na mesa. */
  tourney: TourneyInfo | null;
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
        const v = evaluateHand(mine.best5, { repeats: true });
        if (!tr.best || v.score > tr.best.score) tr.best = { cards: mine.best5, kind: mine.kind, score: v.score };
      }
    } else if (e.t === 'potAwarded') {
      const w = e.winners.find((x) => x.playerId === 'human');
      if (w && e.amount > tr.biggest) tr.biggest = e.amount;
    }
  }
}

// O start/resume do proto 2 traz `tournament` (o pôster, o efeito, a entrada).
type Row = Record<string, unknown>;
const rowOf = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);

function prizeFromResponse(r: unknown, fallback: TournamentPrize | null): TournamentPrize | null {
  const t = rowOf(rowOf(r)?.tournament);
  const p = rowOf(t?.prize);
  if (p && typeof p.file_path === 'string') return p as unknown as TournamentPrize;
  return fallback;
}

function rewardsOf(...sources: unknown[]): TournamentRewards | null {
  for (const s of sources) {
    const r = rowOf(rowOf(s)?.rewards);
    if (r) return r as TournamentRewards;
  }
  return null;
}

// O pôster apostado fica guardado por partida neste aparelho: na retomada o servidor
// só manda o item e o efeito, e a coleção (stake_options) já não lista o apostado.
const STAKE_KEY = 'poker.stake.v1';
function saveStake(matchId: string, stake: StakeInfo) {
  try {
    window.sessionStorage.setItem(STAKE_KEY, JSON.stringify({ matchId, stake }));
  } catch {
    // sem armazenamento: a retomada mostra só o cadeado
  }
}
function loadStake(matchId: string): StakeInfo | null {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(STAKE_KEY) || 'null') as { matchId?: string; stake?: StakeInfo } | null;
    return raw?.matchId === matchId ? raw.stake ?? null : null;
  } catch {
    return null;
  }
}

// `start(week, prizeId, stake)`: o 3º argumento é do proto 2 (o pacote F tipa no apiTypes).
type StartFn = (week: string, prizeId: string, stake: TournamentStake) => Promise<BountyStart>;

export function useBountyMatch(
  rig: Rig,
  home: PokerHome | null,
  params: { start: boolean; week: string | null; prizeId: string | null; stake: TournamentStake | null },
): BountyCtl {
  const navigate = useNavigate();
  const { table, dir } = rig;
  const [status, setStatus] = useState<MatchCtl['status']>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [recap, setRecap] = useState<PublicEvent[] | null>(null);
  const [credits, setCredits] = useState<CreditsData | null>(null);
  const [prize, setPrize] = useState<PokerPrize | null>(null);
  const [tourney, setTourney] = useState<TourneyInfo | null>(null);
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
  const tourneyRef = useRef<TourneyInfo | null>(null);
  // O que [Tentar de novo] refaz: a jogada pendente, ou abrir/retomar a mesa.
  const retryRef = useRef<(() => void) | null>(null);

  const homeTourney = tournamentOf(home);

  // O pôster apostado: a arte vem da coleção (stake_options) que a tela do torneio mostrou.
  const stakeInfo = (s: TournamentStake | { kind: string; item_id?: number; itemId?: number; effect?: string } | null | undefined): StakeInfo | null => {
    if (!s) return null;
    if (s.kind !== 'poster') return { kind: 'chips' };
    const itemId = 'itemId' in s && typeof s.itemId === 'number' ? s.itemId : 'item_id' in s ? s.item_id : undefined;
    const opt = tournamentOf(homeRef.current)?.stake_options.find((o) => o.item_id === itemId && (!s.effect || o.effect === s.effect));
    return {
      kind: 'poster',
      itemId,
      effect: s.effect ?? opt?.effect,
      title: opt ? posterTitle(opt, rig.lang) : undefined,
      filePath: opt?.file_path,
    };
  };

  const applyTourney = (next: TourneyInfo | null) => {
    tourneyRef.current = next;
    setTourney(next);
    if (next) {
      const title = posterTitle(next.prize, rig.lang);
      rig.extras.current.prize = { name: title, kind: 'poster', rarity: next.prize.rarity };
      rig.extras.current.tournament = { stake: next.stake?.kind === 'poster' ? 'poster' : 'chips' };
    }
  };

  const lastEvents = useRef<PublicEvent[]>([]);
  const toCredits = useCallback((result: BountyResult, o: { instant?: boolean; rewards?: TournamentRewards | null } = {}) => {
    invalidatePokerHome();
    recordMatchEnd((Date.now() - m.current.startedAt) / 60000);
    const t = tableRef.current.getTable();
    const out = [...lastEvents.current].reverse().find((e) => e.t === 'eliminated' && e.playerId === 'human') as
      | Extract<PublicEvent, { t: 'eliminated' }>
      | undefined;
    const tt = tournamentOf(homeRef.current);
    const used = (tt?.attempts_used ?? 0) + (params.start ? 1 : 0);
    const max = tt?.max_attempts ?? 3;
    const won = result.status === 'won' && result.place === 1;
    const tour = tourneyRef.current;
    const rewards = o.rewards ?? rewardsOf(result);
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
      // O torneio tem a própria cerimônia (o pôster dourado); a antiga fica desligada.
      captured: tour ? false : result.prizeCaptured,
      loan: m.current.loan > 0,
      retry: !won && used < max ? { n: used + 1, max } : null,
      tomorrow: null,
      instant: o.instant,
      tournament: tour
        ? {
            prize: tour.prize,
            won,
            rewards,
            stake: tour.stake ? { kind: tour.stake.kind, title: tour.stake.title, filePath: tour.stake.filePath, effect: tour.stake.effect } : null,
          }
        : null,
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
      const tp = prizeFromResponse(r, homeTourney?.prize ?? null);
      const am = homeTourney?.active_match;
      const respStake = rowOf(rowOf(rowOf(r)?.tournament)?.stake) as { kind: string; item_id?: number; itemId?: number; effect?: string } | null;
      if (tp) applyTourney({ prize: tp, stake: loadStake(r.matchId) ?? stakeInfo(respStake ?? am?.stake ?? null) });
      else rig.extras.current.prize = { name: prizeWithArticle(r.prize, rig.lang), kind: r.prize.kind as never, rarity: r.prize.rarity };
      tableRef.current.load(r.view);
      track(tr.current, r.recent);
      // Quem eliminou a pessoa sai da cauda do servidor (a mesa retomada não projetou nada).
      lastEvents.current = r.recent;
      if (r.result) {
        toCredits(r.result, { instant: true, rewards: rewardsOf(r, r.result) });
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
        navigate(BLEFE_ROUTES.tournament, { replace: true });
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
    if (!params.week || !params.prizeId) return resume();
    setStatus('loading');
    try {
      await rig.newMatch();
      rig.extras.current.returning = false;
      const stake: TournamentStake = params.stake ?? { kind: 'chips' };
      const r = await (pokerApi.bounty.start as unknown as StartFn)(params.week, params.prizeId, stake);
      // Daqui em diante, recarregar retoma (e nunca cobra outra ficha). Só a barra de
      // endereço muda: trocar a rota remontaria a mesa no meio da abertura.
      try {
        window.history.replaceState(window.history.state, '', BLEFE_ROUTES.resume);
      } catch {
        // sem history: recarregar cai na tela do torneio, que mostra "Continuar"
      }
      invalidatePokerHome();
      m.current = { id: r.matchId, seq: r.seq, loan: r.loan, startedAt: Date.now() };
      setPrize(r.prize);
      prizeRef.current = r.prize;
      const tp = prizeFromResponse(r, homeTourney?.prize ?? null);
      const si = stakeInfo(stake);
      if (si && si.kind === 'poster') saveStake(r.matchId, si);
      if (tp) applyTourney({ prize: tp, stake: si });
      else rig.extras.current.prize = { name: prizeWithArticle(r.prize, rig.lang), kind: r.prize.kind as never, rarity: r.prize.rarity };
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
        navigate(BLEFE_ROUTES.resume, { replace: true });
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
      // stale_week, prize_changed, attempts, owned, won_this_week, no_chips, stake_invalid,
      // closed: volta à tela do torneio, que mostra o estado certo.
      invalidatePokerHome();
      navigate(BLEFE_ROUTES.tournament, { replace: true, state: { pokerError: code } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, params.week, params.prizeId, resume]);

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
        if (r.result) toCredits(r.result, { rewards: rewardsOf(r, r.result) });
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
          if (data.result) toCredits(data.result, { rewards: rewardsOf(err.data, data.result) });
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
          if (data.result) toCredits(data.result, { rewards: rewardsOf(err.data, data.result) });
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
    tourney,
    needAge,
    ageConfirmed: () => {
      setNeedAge(false);
      void start();
    },
    ageDeclined: () => {
      setNeedAge(false);
      navigate(BLEFE_ROUTES.tournament, { replace: true });
    },
    act,
    forfeit,
    // "Revanche grátis": no torneio, abre o Casual (§7.6).
    rematch: () => navigate(BLEFE_ROUTES.free),
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
