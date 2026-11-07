import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { getCachedPayload, mesaAck, mesaGet, mesaReact as mesaReactNow, mesaRefresh, setCachedPayload, type MesaAction } from '../../lib/mesa/api';
import { addToWatchlist, saveRating } from '../../lib/mesa/rateTitle';
import { bumpAskCount, writeDayState } from '../../lib/mesa/prefs';
import { brtDay } from '../../lib/mesa/day';
import { playDeal, playFlip } from '../../lib/mesa/sound';
import { revealModeFor, markRevealSeen, type RevealMode } from '../../lib/personaReveal';
import { fetchUserPersona, type UserPersona } from '../../lib/persona';
import type { MediaFilter, MesaCard, MesaPayload, OracleSlot, PassedSeat, ReactResult, Seat, VerdictCategory } from '../../lib/mesa/types';
import type { DirectorCtx, Spoken } from '../../lib/mesa/dialogue/types';
import { getMesaDirector } from './director';
import { posterSrc } from './mesaText';
import { useSpeech } from './useSpeech';

// O estado e as chamadas da Mesa (SPEC §7.3), 05/11/2026. Uma chamada principal
// (mesa_get) por pergunta; os gestos vão por mesa_react e aplicam no payload o
// que o servidor devolve (a carta, a substituta, quem passou a vez). As falas
// vêm do Diretor (WP-FALAS) e passam pela faixa (useSpeech). Atualizações
// otimistas só onde o gesto é reversível (virar, Quero ver); o resto espera o
// servidor, porque a carta nova vem dele.

export const ORACLE_SEATS: OracleSlot[] = ['bogart', 'fincher', 'cypher'];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type SealUi = 'locked' | 'ready' | 'breaking' | null;

export interface RevealState {
  persona: UserPersona;
  mode: RevealMode;
  code: string;
  film: number | null;
}

// A categoria do veredito, só para quando o servidor não mandar (a régua grava
// a nota e a reação sai na hora). É a mesma regra de public.mesa_category
// (conferida no banco em 05/11/2026): 10 com até 1 ponto abaixo da prevista
// vira 'ten'; 0 = exact; 1 = near; +2 ou mais = over; o resto = under.
function localCategory(pred: number | null, rating: number): VerdictCategory {
  if (pred === null) return 'near';
  const d = rating - pred;
  if (rating === 10 && d >= -1) return 'ten';
  if (d === 0) return 'exact';
  if (Math.abs(d) === 1) return 'near';
  return d >= 2 ? 'over' : 'under';
}

// Os pôsteres das cartas baixam assim que a tiragem chega (decode()); a virada
// espera o da carta no máximo 600 ms (SPEC §2.3).
const posterPromises = new Map<string, Promise<void>>();
function preloadPoster(url: string | null): Promise<void> {
  if (!url) return Promise.resolve();
  let p = posterPromises.get(url);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      const done = () => resolve();
      if (typeof img.decode === 'function') img.decode().then(done, done);
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
    posterPromises.set(url, p);
  }
  return p;
}

interface Options {
  initialAsk: string | null;
  initialMedia: MediaFilter;
  desktop: boolean;
  reduced: boolean;
  // A entrada ritual terminou: só então a faixa começa a falar.
  stageReady: boolean;
}

export function useMesa({ initialAsk, initialMedia, desktop, reduced, stageReady }: Options) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language.startsWith('pt') ? 'pt' : 'en';
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const director = useMemo(() => getMesaDirector(), []);

  const [ask, setAskState] = useState<string | null>(initialAsk);
  const [media, setMediaState] = useState<MediaFilter>(initialMedia);
  const [payload, setPayloadState] = useState<MesaPayload | null>(() => getCachedPayload(initialAsk, initialMedia, brtDay()));
  const payloadRef = useRef<MesaPayload | null>(payload);
  // O ref é a fonte da verdade e muda NA HORA: logo depois de virar, o estado
  // do dia e o fecho do Espelho leem a mesa já com a carta virada (o updater
  // do setState só roda no próximo render).
  const setPayload = useCallback((p: MesaPayload | null | ((prev: MesaPayload | null) => MesaPayload | null)) => {
    const next = typeof p === 'function' ? p(payloadRef.current) : p;
    payloadRef.current = next;
    if (next) setCachedPayload(next.ask?.key ?? null, next.media, next);
    setPayloadState(next);
  }, []);
  const [loading, setLoading] = useState(!payload);
  const [error, setError] = useState(false);
  const [focusSeat, setFocusSeat] = useState<Seat | null>(null);
  const [ruler, setRuler] = useState<Seat | null>(null);
  const [saving, setSaving] = useState<Seat | null>(null);
  const [busy, setBusy] = useState<Seat | null>(null);
  const [mirror, setMirror] = useState<Spoken | null>(null);
  const [shake, setShake] = useState<{ seat: Seat; n: number } | null>(null);
  const [sealHint, setSealHint] = useState(false);
  const [breaking, setBreaking] = useState(false);
  const [seenFlash, setSeenFlash] = useState<Record<string, number>>({});
  const [dealKey, setDealKey] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [flipOnMount, setFlipOnMount] = useState<Set<string>>(() => new Set());
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const revealedRef = useRef<'new' | 'changed' | null>(null);
  const speech = useSpeech({ active: stageReady, reduced });
  const pendingAck = useRef<{ lineId: string; ids: string[] } | null>(null);
  const sealSpoken = useRef<Set<string>>(new Set());
  const closedDraws = useRef<Set<string>>(new Set());
  const loadSeq = useRef(0);
  const pendingReveal = useRef<MesaPayload['me']['persona'] | null>(null);
  // Os gestos vão ao servidor UM DE CADA VEZ, na ordem (QA m1): virar 1→2→3
  // depressa (ou sem animação) mandava o "flip" da Cypher antes de o do Fincher
  // gravar, e o servidor respondia "sealed". A fila guarda a ordem dos toques.
  const reactQueue = useRef<Promise<unknown>>(Promise.resolve());
  const mesaReact = useCallback((id: string, action: MesaAction): Promise<ReactResult> => {
    const run = reactQueue.current.then(() => mesaReactNow(id, action));
    reactQueue.current = run.catch(() => undefined);
    return run;
  }, []);

  const ctx = useCallback(
    (p: MesaPayload): DirectorCtx => {
      const now = new Date();
      return { lang, payload: p, hour: now.getHours(), weekday: now.getDay(), reveal: revealedRef.current };
    },
    [lang]
  );

  const drawKey = (p: MesaPayload) => `${p.draw_id}|${p.ask?.key ?? ''}`;
  const cardAt = (p: MesaPayload | null, seat: Seat): MesaCard | null => p?.cards.find((c) => c.seat === seat) ?? null;
  const passedAt = (p: MesaPayload | null, seat: Seat): PassedSeat | null => p?.passed.find((x) => x.seat === seat) ?? null;

  // A Cypher fica selada enquanto Bogart ou Fincher estão para baixo (quem
  // passou a vez conta como feito). O `sealed` do servidor diz se ela começou
  // selada; o resto é conferido aqui, com o estado atual da mesa.
  const sealOf = useCallback(
    (p: MesaPayload | null): SealUi => {
      const c = cardAt(p, 'cypher');
      if (!c || c.state !== 'down' || !c.sealed) return null;
      if (breaking) return 'breaking';
      const othersDown = (['bogart', 'fincher'] as const).some((s) => cardAt(p, s)?.state === 'down');
      return othersDown ? 'locked' : 'ready';
    },
    [breaking]
  );

  // ---- Persona: a revelação abre por cima quando nasce ou muda (§2.11) --------
  const checkPersona = useCallback(
    async (persona: MesaPayload['me']['persona'] | undefined) => {
      if (!persona || !uid) return;
      const mode = revealModeFor(uid, persona.code, persona.film_tmdb);
      if (!mode) return;
      try {
        const full = await fetchUserPersona(uid);
        if (full?.code && full.persona) setReveal({ persona: full, mode, code: persona.code, film: persona.film_tmdb });
      } catch {
        /* sem a ficha completa, a porta da home revela depois */
      }
    },
    [uid]
  );
  useEffect(() => {
    if (stageReady && pendingReveal.current) {
      const p = pendingReveal.current;
      pendingReveal.current = null;
      void checkPersona(p);
    }
  }, [stageReady, checkPersona]);

  const closeReveal = useCallback(() => {
    setReveal((r) => {
      if (r && uid) {
        markRevealSeen(uid, r.code, r.film);
        revealedRef.current = r.mode === 'first' ? 'new' : 'changed';
        const p = payloadRef.current;
        if (p) setMirror(director.mirror(ctx(p)));
      }
      return null;
    });
  }, [uid, director, ctx]);

  // ---- Estado do dia para a porta da home (§7.8) ------------------------------
  const syncDayState = useCallback(
    (p: MesaPayload | null) => {
      if (!p || p.ask || !uid) return;
      const oracleCards = p.cards.filter((c) => c.seat !== 'espelho');
      writeDayState(uid, p.day, oracleCards.filter((c) => c.state !== 'down').length, oracleCards.length);
    },
    [uid]
  );

  // Quando as três (as não passadas) estão viradas: o fecho do Espelho e, às
  // vezes, uma troca entre os três (uma vez por tiragem).
  const maybeAllFlipped = useCallback(
    (p: MesaPayload) => {
      const cards = p.cards.filter((c) => c.seat !== 'espelho');
      if (!cards.length || cards.some((c) => c.state === 'down')) return;
      const key = drawKey(p);
      if (closedDraws.current.has(key)) return;
      closedDraws.current.add(key);
      const close = director.mirrorClose(ctx(p));
      // Numa pergunta as cartas viram sozinhas: a frase dela fica uns segundos
      // antes do fecho (senão ninguém lê). Na tiragem, o fecho vem logo.
      if (close)
        window.setTimeout(() => {
          const now = payloadRef.current;
          if (now && drawKey(now) === key) setMirror(close);
        }, p.ask ? 6000 : reduced ? 0 : 900);
      const banter = director.allFlipped(ctx(p));
      if (banter.length) speech.say(banter, 'append');
    },
    [director, ctx, reduced, speech]
  );

  // ---- Virar ---------------------------------------------------------------------
  const applyCard = useCallback(
    (cardId: string, patch: Partial<MesaCard>) => {
      setPayload((prev) => (prev ? { ...prev, cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...patch, my: { ...c.my, ...(patch.my ?? {}) } } : c)) } : prev));
    },
    [setPayload]
  );

  const flip = useCallback(
    async (seat: Seat, opts: { auto?: boolean } = {}) => {
      const p = payloadRef.current;
      const c = cardAt(p, seat);
      if (!p || !c) return;
      if (c.state !== 'down') {
        setFocusSeat(seat);
        return;
      }
      const seal = sealOf(p);
      if (seat === 'cypher' && seal === 'locked') {
        if (!reduced) setShake((s) => ({ seat, n: (s?.n ?? 0) + 1 }));
        setSealHint(true);
        window.setTimeout(() => setSealHint(false), 2000);
        const key = drawKey(p);
        if (!sealSpoken.current.has(key)) {
          sealSpoken.current.add(key);
          const line = director.seal(ctx(p));
          if (line) speech.say([line], 'front');
        }
        return;
      }
      const wasSealed = seat === 'cypher' && seal === 'ready';
      if (wasSealed && !reduced) {
        setBreaking(true);
        await sleep(200);
      }
      await Promise.race([preloadPoster(posterSrc(c.title, lang, desktop ? 'w500' : 'w342')), sleep(600)]);
      setBreaking(false);
      // Na virada automática (perguntas), a leitura fica na primeira carta.
      if (!opts.auto) setFocusSeat(seat);
      else setFocusSeat((f) => f ?? seat);
      applyCard(c.id, { state: 'up', sealed: false });
      playFlip();
      const after = payloadRef.current;
      if (after) {
        syncDayState(after);
        if (wasSealed) {
          const line = director.sealOpen(ctx(after));
          if (line) speech.say([line], 'front');
        }
        maybeAllFlipped(after);
      }
      try {
        const res = await mesaReact(c.id, 'flip');
        if (!res.ok && res.error === 'sealed') {
          applyCard(c.id, { state: 'down', sealed: true });
          if (!reduced) setShake((s) => ({ seat, n: (s?.n ?? 0) + 1 }));
        }
      } catch {
        /* virar é só registro: a carta fica virada na tela, e o servidor
           confere a ordem do selo no próximo gesto */
      }
    },
    [sealOf, reduced, director, ctx, speech, lang, desktop, applyCard, syncDayState, maybeAllFlipped, mesaReact]
  );

  // Nas perguntas, as cartas viram sozinhas, em sequência: Bogart, Fincher
  // (300 ms entre elas), depois a Cypher (a ordem do selo). Com "reduzir
  // movimento", todas de uma vez.
  const autoFlip = useCallback(
    async (p: MesaPayload) => {
      const seq = ORACLE_SEATS.filter((s) => cardAt(p, s)?.state === 'down');
      if (!seq.length) return;
      if (!reduced) await sleep(3 * 90 + 300);
      for (const s of seq) {
        if (payloadRef.current?.draw_id !== p.draw_id || payloadRef.current?.ask?.key !== p.ask?.key) return;
        await flip(s, { auto: true });
        if (!reduced) await sleep(300);
      }
    },
    [flip, reduced]
  );

  // ---- Carga ---------------------------------------------------------------------
  const load = useCallback(
    async (askKey: string | null, mediaF: MediaFilter, opts: { quiet?: boolean } = {}) => {
      const seq = (loadSeq.current += 1);
      if (!opts.quiet) {
        setError(false);
        setFocusSeat(null);
        setRuler(null);
      }
      // Recolhe as cartas atuais (240 ms) enquanto a resposta não chega.
      const hadCards = !!payloadRef.current && !opts.quiet;
      if (hadCards && !reduced) setCollecting(true);
      if (!payloadRef.current) setLoading(true);
      try {
        const [p] = await Promise.all([mesaGet(askKey, mediaF), hadCards && !reduced ? sleep(240) : Promise.resolve()]);
        if (seq !== loadSeq.current) return;
        p.cards.forEach((c) => void preloadPoster(posterSrc(c.title, lang, desktop ? 'w500' : 'w342')));
        setPayload(p);
        setLoading(false);
        setCollecting(false);
        if (opts.quiet) return p;
        setDealKey((k) => k + 1);
        playDeal(p.cards.length);
        // As vozes desta tiragem.
        const allPassed = p.cards.filter((c) => c.seat !== 'espelho').length === 0 && p.passed.length > 0;
        setMirror(allPassed ? director.system('empty_all', lang) : director.mirror(ctx(p)));
        const opening = director.opening(ctx(p));
        if (p.verdicts.length && opening.length >= 2) {
          pendingAck.current = { lineId: opening[0].id, ids: p.verdicts.map((v) => v.card_id) };
        } else if (p.verdicts.length) {
          // O Diretor não tocou a reação de ontem (teto de balões): mesmo assim
          // ela vai para o Livro, e os vereditos ficam ouvidos.
          void mesaAck(p.verdicts.map((v) => v.card_id)).catch(() => undefined);
        }
        // Quem passou a vez por falta de carta (empty) ou de propósito (colo)
        // diz por quê, logo na abertura (no máximo um; pedido do WP-FALAS). A
        // 2ª recusa já falou na hora do gesto e não se repete ao reabrir.
        const passed = p.passed.find((x) => x.reason === 'empty' || x.reason === 'colo');
        const passLine = passed ? director.reaction(ctx(p), passed.seat, 'pass', { passReason: passed.reason }) : null;
        speech.say(passLine ? [...opening, passLine] : opening, 'replace');
        // Persona: só depois da entrada.
        if (p.me.persona) {
          if (stageReady) void checkPersona(p.me.persona);
          else pendingReveal.current = p.me.persona;
        }
        syncDayState(p);
        if (p.ask) {
          // Pergunta que já chega virada (repetida no mesmo dia): a leitura
          // abre na primeira carta, como depois da virada automática (§2.8).
          const first = ORACLE_SEATS.find((s) => cardAt(p, s));
          if (first && !p.cards.some((c) => c.state === 'down')) setFocusSeat(first);
          void autoFlip(p);
        } else maybeAllFlipped(p);
        return p;
      } catch {
        if (seq !== loadSeq.current) return;
        setCollecting(false);
        setLoading(false);
        if (!opts.quiet) {
          setError(true);
          setMirror(director.system('error', lang));
        }
        return null;
      }
    },
    [reduced, lang, desktop, setPayload, director, ctx, speech, stageReady, checkPersona, syncDayState, autoFlip, maybeAllFlipped]
  );

  // A reação de ontem tocou: os vereditos ficam ouvidos (mesa_ack).
  useEffect(() => {
    const cur = speech.current;
    const pend = pendingAck.current;
    if (cur && pend && cur.id === pend.lineId) {
      pendingAck.current = null;
      void mesaAck(pend.ids).catch(() => undefined);
    }
  }, [speech.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Primeira carga (e a revalidação do payload do cache entre rotas).
  const firstLoad = useRef(false);
  useEffect(() => {
    if (firstLoad.current) return;
    firstLoad.current = true;
    if (payloadRef.current) {
      const p = payloadRef.current;
      setLoading(false);
      setMirror(director.mirror(ctx(p)));
      speech.say(director.opening(ctx(p)), 'replace');
      void load(ask, media, { quiet: true });
    } else void load(ask, media);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Perguntas e mídia ------------------------------------------------------------
  const setAsk = useCallback(
    (key: string | null) => {
      if (key) bumpAskCount(key);
      setAskState(key);
      void load(key, media);
    },
    [load, media]
  );
  const setMedia = useCallback(
    (m: MediaFilter) => {
      setMediaState(m);
      void load(ask, m);
    },
    [load, ask]
  );
  const retry = useCallback(() => void load(ask, media), [load, ask, media]);
  const reloadToday = useCallback(() => {
    setAskState(null);
    void load(null, media);
  }, [load, media]);

  // ---- Trocar uma carta pela que o servidor mandou ------------------------------
  const applyResult = useCallback(
    (seat: Seat, oldId: string, res: ReactResult) => {
      setPayload((prev) => {
        if (!prev) return prev;
        let cards = prev.cards;
        let passed = prev.passed;
        if (res.replacement) {
          const rep = res.replacement;
          cards = cards.map((c) => (c.id === oldId ? rep : c));
        } else {
          cards = cards.filter((c) => c.id !== oldId);
        }
        if (res.pass && !passed.some((x) => x.seat === res.pass!.seat)) passed = [...passed, res.pass];
        const me = res.me ? { ...prev.me, ...res.me } : prev.me;
        const persona = res.persona !== undefined ? res.persona : prev.me.persona;
        return { ...prev, cards, passed, me: { ...me, persona } };
      });
      if (res.replacement) {
        const id = res.replacement.id;
        setFlipOnMount((s) => new Set(s).add(id));
        setFocusSeat(seat);
      }
    },
    [setPayload]
  );

  const sayReaction = useCallback(
    (seat: Seat, kind: 'want' | 'refuse' | 'pass' | 'replace' | 'notSeen' | 'verdict', extra?: { category?: VerdictCategory; rating?: number; passReason?: PassedSeat['reason']; cardId?: string }, mode: 'replace' | 'append' = 'replace') => {
      const p = payloadRef.current;
      if (!p) return;
      const line = director.reaction(ctx(p), seat, kind, extra);
      if (line) speech.say([line], mode);
    },
    [director, ctx, speech]
  );

  // ---- Quero ver ---------------------------------------------------------------------
  const want = useCallback(
    async (seat: Seat) => {
      const c = cardAt(payloadRef.current, seat);
      // Já na lista ANTES (carta que veio da Watchlist): não grava de novo, mas o
      // servidor registra o "want" (a profecia e o Livro, QA m7).
      if (!c || !uid || c.state === 'want') return;
      const prevState = c.state;
      const wasListed = c.my.in_watchlist;
      applyCard(c.id, { state: 'want', my: { ...c.my, in_watchlist: true } });
      setBusy(seat);
      try {
        if (!wasListed) await addToWatchlist(uid, { id: c.title.tmdb_id, media_type: c.title.media_type });
      } catch {
        applyCard(c.id, { state: prevState, my: { ...c.my, in_watchlist: wasListed } });
        setBusy(null);
        toast.error(t('mesa.toast.wantError'));
        return;
      }
      setBusy(null);
      sayReaction(seat, 'want');
      try {
        const res = await mesaReact(c.id, 'want');
        if (!res.ok) throw new Error(res.error);
      } catch {
        // A Watchlist foi gravada de verdade; só a profecia não ficou registrada.
        toast.error(t('mesa.toast.reactError'));
      }
    },
    [uid, applyCard, sayReaction, t, mesaReact]
  );

  // ---- Já vi → régua → carta nova ----------------------------------------------------
  const runSeen = useCallback(
    async (seat: Seat, c: MesaCard, rating: number) => {
      let res: ReactResult | null = null;
      try {
        res = await mesaReact(c.id, 'seen');
        if (!res.ok) res = null;
      } catch {
        res = null;
      }
      setSaving(null);
      setRuler(null);
      setSeenFlash((s) => ({ ...s, [c.id]: rating }));
      // A leitura já mostra "Você deu N" enquanto o olho aparece na face.
      applyCard(c.id, { my: { ...c.my, rating } });
      const category = res?.verdict?.category ?? localCategory(c.pred.value, rating);
      // cardId: a fala ao vivo é a mesma que o Livro mostra depois.
      sayReaction(seat, 'verdict', { category, rating, cardId: c.id });
      await sleep(reduced ? 300 : 600);
      if (res) {
        applyResult(seat, c.id, res);
        if (res.replacement) sayReaction(seat, 'replace', undefined, 'append');
        if (res.persona) void checkPersona(res.persona);
      } else {
        applyCard(c.id, { state: 'seen', my: { ...c.my, rating } });
        toast.error(t('mesa.toast.reactError'));
      }
      mesaRefresh();
      const after = payloadRef.current;
      if (after) {
        syncDayState(after);
      }
    },
    [reduced, sayReaction, applyResult, checkPersona, applyCard, t, syncDayState, mesaReact]
  );

  const rate = useCallback(
    async (seat: Seat, rating: number) => {
      const c = cardAt(payloadRef.current, seat);
      if (!c || !uid || saving) return;
      setSaving(seat);
      try {
        await saveRating(uid, { id: c.title.tmdb_id, media_type: c.title.media_type }, rating);
      } catch {
        setSaving(null);
        toast.error(t('mesa.ruler.error'));
        return;
      }
      await runSeen(seat, c, rating);
    },
    [uid, saving, runSeen, t]
  );

  // ---- Não é pra mim / Não vi ------------------------------------------------------
  const decline = useCallback(
    async (seat: Seat, action: Extract<MesaAction, 'refuse' | 'not_seen'>) => {
      const c = cardAt(payloadRef.current, seat);
      if (!c || busy) return;
      setBusy(seat);
      let res: ReactResult;
      try {
        res = await mesaReact(c.id, action);
        if (!res.ok) throw new Error(res.error);
      } catch {
        setBusy(null);
        toast.error(t('mesa.toast.reactError'));
        return;
      }
      setBusy(null);
      applyResult(seat, c.id, res);
      if (res.replacement) sayReaction(seat, action === 'refuse' ? 'refuse' : 'notSeen');
      else if (res.pass) {
        sayReaction(seat, 'pass', { passReason: res.pass.reason });
        setFocusSeat(null);
      } else setFocusSeat(null);
    },
    [busy, applyResult, sayReaction, t, mesaReact]
  );

  // ---- Depois do modal de detalhes (§2.6) ------------------------------------------
  // A Mesa relê a tiragem (barato) e, se apareceu uma nota numa carta virada,
  // segue o fluxo do "Já vi" sozinha.
  const afterDetails = useCallback(
    async (cardId: string | null) => {
      const before = payloadRef.current;
      const fresh = await load(ask, media, { quiet: true });
      if (!fresh || !before || !cardId) return;
      const old = before.cards.find((c) => c.id === cardId);
      const now = fresh.cards.find((c) => c.id === cardId);
      if (old && now && old.my.rating === null && now.my.rating !== null && now.state !== 'down') {
        setPayload((prev) => prev && { ...prev, cards: prev.cards.map((c) => (c.id === cardId ? old : c)) });
        setSaving(now.seat);
        await runSeen(now.seat, old, now.my.rating);
      }
    },
    [load, ask, media, setPayload, runSeen]
  );

  const flipAll = useCallback(async () => {
    const p = payloadRef.current;
    if (!p) return;
    for (const s of ORACLE_SEATS) {
      if (cardAt(payloadRef.current, s)?.state === 'down') {
        await flip(s, { auto: true });
        if (!reduced) await sleep(300);
      }
    }
  }, [flip, reduced]);

  const consumeFlipOnMount = useCallback((id: string) => {
    setFlipOnMount((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  return {
    lang,
    uid,
    payload,
    ask,
    media,
    loading,
    error,
    focusSeat,
    setFocusSeat,
    ruler,
    setRuler,
    saving,
    busy,
    mirror,
    shake,
    sealHint,
    seal: sealOf(payload),
    seenFlash,
    dealKey,
    collecting,
    flipOnMount,
    consumeFlipOnMount,
    reveal,
    closeReveal,
    speech,
    cardAt: (seat: Seat) => cardAt(payload, seat),
    passedAt: (seat: Seat) => passedAt(payload, seat),
    flip,
    flipAll,
    want,
    rate,
    refuse: (seat: Seat) => decline(seat, 'refuse'),
    notSeen: (seat: Seat) => decline(seat, 'not_seen'),
    setAsk,
    setMedia,
    retry,
    reloadToday,
    afterDetails,
  };
}

export type MesaApi = ReturnType<typeof useMesa>;
