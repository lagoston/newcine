import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/auth';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { loadJackpotFont } from '../../lib/posterJackpot';
import { playReveal, primeJackpotAudio } from '../../lib/jackpotSound';
import {
  UFO_FLIGHT_MS,
  catchUfo,
  fetchUfoStatus,
  isUfoDayDone,
  launchUfo,
  markUfoDayDone,
  notifyJackpotChipsChanged,
  type UfoCatch,
  type UfoRefusal,
} from '../../lib/flyingChip';
import { ChipFace } from './Chips';
import '../../styles/flyingChip.css';

// Fichas voadoras (02/11/2026): o "OVNI" do Howrse no CineOracle. Montado uma
// vez no App para quem está logado. Pergunta ao banco se hoje tem ficha (ao
// abrir o site, ao voltar para a aba e, de vez em quando, ao trocar de
// página); se tiver, espera a hora sorteada pelo banco e um momento em que a
// pessoa esteja de fato usando o site (aba visível, fora do login, mexeu em
// algo no último minuto), avisa a decolagem e a ficha atravessa a tela.
// Tocou nela: o banco confere a janela e credita +1 ficha comum (uma vez só).
// Não tocou: ela sai pelo outro lado e o dia acabou.

// ---------------------------------------------------------------------------
// Tempos do agendador
// ---------------------------------------------------------------------------

// Sem mexer em nada há mais que isso: a pessoa não está olhando; a ficha
// espera o próximo toque/rolagem para não voar para ninguém.
const IDLE_MS = 45_000;
// Já pode voar ao abrir a página: espera a pessoa se ajeitar (a ficha surge
// enquanto ela navega, não no meio do carregamento).
const DUE_SETTLE_MS: [number, number] = [6_000, 18_000];
// A pessoa voltou a mexer (ou a aba voltou): um respiro antes da decolagem.
const WAKE_MS: [number, number] = [1_500, 4_000];
// Quanto da janela do banco fica reservado para a ida e a volta da pega.
const CATCH_SLACK_S = 3;
// Recarregou a página no meio do voo: só retoma se ainda der para pegar.
const MIN_RESUME_S = 6;
// Intervalos mínimos entre perguntas ao banco (ao voltar para a aba / ao
// trocar de página). O dia encerrado nem pergunta (fica salvo no aparelho).
const VISIBLE_RECHECK_MS = 30_000;
const ROUTE_RECHECK_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const blockedPath = (path: string) => path.startsWith('/auth') || path.startsWith('/reset-password');

// Só no ambiente de desenvolvimento: ?ufo=1 faz uma ficha de demonstração
// voar sem perguntar nada ao banco (a pega também é de mentira). No build de
// produção import.meta.env.DEV vira false e esse caminho some do código.
const devDemoRequested = () => new URLSearchParams(window.location.search).get('ufo') === '1';

// ---------------------------------------------------------------------------
// O voo
// ---------------------------------------------------------------------------

interface Flight {
  id: number;
  demo: boolean;
  duration: number;
  fromLeft: boolean;
  // Altura de entrada e de saída (fração da tela), o balanço (px), quantas
  // ondas na travessia e a fase inicial.
  y0: number;
  y1: number;
  amp: number;
  waves: number;
  phase: number;
  // De quanto em quanto tempo a moeda dá uma cambalhota.
  flipEvery: number;
}

let flightSeq = 0;
function makeFlight(duration: number, demo: boolean): Flight {
  const y0 = rand(0.22, 0.58);
  return {
    id: ++flightSeq,
    demo,
    duration,
    fromLeft: Math.random() < 0.5,
    y0,
    y1: clamp(y0 + rand(-0.16, 0.16), 0.2, 0.62),
    amp: rand(18, 30),
    waves: rand(1.6, 2.3),
    phase: rand(0, Math.PI * 2),
    flipEvery: rand(2500, 3000),
  };
}

type FlightEvent =
  | { kind: 'caught'; tickets: number }
  | { kind: 'escaped'; reason: UfoRefusal }
  | { kind: 'retry' }
  | { kind: 'missed' };

// Faíscas e fumaça dourada: elementos soltos numa camada só deles (fora do
// React, um por partícula, cada um some quando a própria animação acaba).
const TRAIL_COLORS = ['#FFE8A3', '#F4C454', '#FFFFFF', '#FFE8A3', '#F4C454', '#FF7AD9', '#8FE9FF'] as const;
const BURST_COLORS = ['#FFE8A3', '#F4C454', '#FFFFFF', '#FFC83D', '#FF7AD9', '#8FE9FF'] as const;

function spawn(layer: HTMLElement, className: string, x: number, y: number, vars: Record<string, string> = {}, text?: string) {
  const el = document.createElement('span');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  Object.entries(vars).forEach(([key, value]) => el.style.setProperty(key, value));
  if (text) el.textContent = text;
  el.addEventListener('animationend', () => el.remove(), { once: true });
  layer.appendChild(el);
}

function emitTrail(layer: HTMLElement, x: number, y: number, dir: number) {
  if (layer.childElementCount > 44) return;
  const dust = Math.random() < 0.4;
  spawn(layer, dust ? 'fc-trail fc-trail--dust' : 'fc-trail', x + rand(-6, 6), y + rand(-15, 15), {
    '--c': pick(TRAIL_COLORS),
    '--s': `${dust ? rand(3, 5.5) : rand(6, 11)}px`,
    '--dx': `${-dir * rand(8, 26)}px`,
    '--dy': `${rand(10, 30)}px`,
    '--d': `${rand(0.85, 1.3)}s`,
  });
}

function burst(layer: HTMLElement, x: number, y: number) {
  spawn(layer, 'fc-flash', x, y);
  spawn(layer, 'fc-ring', x, y);
  spawn(layer, 'fc-ring fc-ring--late', x, y);
  const count = 18;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand(-0.14, 0.14);
    const dist = rand(58, 124);
    spawn(layer, 'fc-spark', x, y, {
      '--dx': `${Math.cos(angle) * dist}px`,
      '--dy': `${Math.sin(angle) * dist}px`,
      '--s': `${rand(7, 15)}px`,
      '--c': pick(BURST_COLORS),
      '--d': `${rand(0.65, 1.05)}s`,
      '--r': `${rand(90, 260)}deg`,
    });
  }
}

// A espessura da ficha: discos empilhados em profundidade (de -3 a +3 px),
// com as duas faces por cima. De lado, vira a borda listrada da ficha.
const EDGES = [-3, -2, -1, 0, 1, 2, 3];

const ChipFlight: React.FC<{
  flight: Flight;
  reduceMotion: boolean;
  onEvent: (event: FlightEvent) => void;
  onGone: () => void;
}> = ({ flight, reduceMotion, onEvent, onGone }) => {
  const { t } = useTranslation();
  const fxRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const bankRef = useRef<HTMLSpanElement>(null);
  const coinRef = useRef<HTMLSpanElement>(null);
  const stage = useRef<'flying' | 'grabbing' | 'leaving'>('flying');
  const pos = useRef({ x: -500, y: -500 });
  const startAt = useRef(0);
  const retried = useRef(false);
  const timers = useRef<number[]>([]);
  const callbacks = useRef({ onEvent, onGone });
  callbacks.current = { onEvent, onGone };
  const [announce, setAnnounce] = useState('');

  // Para leitores de tela: a região "status" só anuncia o que muda depois de
  // existir, então o texto entra um instante depois.
  useEffect(() => {
    const id = window.setTimeout(() => setAnnounce(t('jackpot.ufo.appeared')), 300);
    return () => window.clearTimeout(id);
  }, [t]);

  useEffect(() => {
    loadJackpotFont();
    const list = timers.current;
    return () => list.forEach((id) => window.clearTimeout(id));
  }, []);

  // O voo, quadro a quadro (posição e giro escritos direto no estilo, sem
  // renderizar o React a cada quadro).
  useEffect(() => {
    const chip = chipRef.current;
    const bank = bankRef.current;
    const coin = coinRef.current;
    const fx = fxRef.current;
    if (!chip || !bank || !coin || !fx) return;
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    const onResize = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const size = chip.offsetWidth || 84;
    const half = size / 2;
    const dir = flight.fromLeft ? 1 : -1;
    let raf = 0;
    let last = performance.now();
    let nextTrail = 0;
    let spin = 0;
    startAt.current = last;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, now - last);
      last = now;

      if (stage.current === 'grabbing') {
        // Segurando (esperando o banco): gira no lugar, rápido.
        if (!reduceMotion) {
          spin += dt * 0.9 * dir;
          coin.style.transform = `perspective(420px) rotateX(12deg) rotateY(${spin}deg)`;
        }
        return;
      }
      if (stage.current !== 'flying') return;

      const elapsed = now - startAt.current;
      const t = elapsed / flight.duration;
      if (t >= 1) {
        stage.current = 'leaving';
        cancelAnimationFrame(raf);
        callbacks.current.onEvent({ kind: 'missed' });
        callbacks.current.onGone();
        return;
      }

      // Velocidade que respira: desacelera duas vezes na travessia, como
      // quem paira (p continua sempre crescendo).
      const p = reduceMotion ? t : t + Math.sin(4 * Math.PI * t) / (8 * Math.PI);
      const x0 = -size;
      const x1 = vw + size;
      const x = flight.fromLeft ? x0 + (x1 - x0) * p : x1 - (x1 - x0) * p;

      // Altura: da entrada à saída, com o balanço (duas ondas somadas, para
      // não parecer régua), longe da barra do topo e da barra do celular.
      const top = 96;
      const bottom = Math.max(top, vh - (vw < 1024 ? 150 : 96));
      const w = 2 * Math.PI * flight.waves * p + flight.phase;
      const wobble = reduceMotion ? 0 : flight.amp * (Math.sin(w) + 0.3 * Math.sin(w * 2.3 + 1.1));
      const y = clamp((flight.y0 + (flight.y1 - flight.y0) * p) * vh + wobble, top, bottom);
      pos.current = { x, y };
      chip.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;

      if (reduceMotion) return;

      // Inclina na direção da curva.
      const dy = (flight.y1 - flight.y0) * vh + flight.amp * 2 * Math.PI * flight.waves * (Math.cos(w) + 0.69 * Math.cos(w * 2.3 + 1.1));
      const lean = clamp(((Math.atan2(dy, x1 - x0) * 180) / Math.PI) * dir * 0.55, -14, 14);
      bank.style.transform = `rotate(${lean}deg)`;

      // A cambalhota: a face fica à mostra a maior parte do tempo (com um
      // leve balanço) e de tempos em tempos a ficha vira uma volta inteira.
      const cycle = Math.floor(elapsed / flight.flipEvery);
      const local = (elapsed % flight.flipEvery) / flight.flipEvery;
      const hold = 0.6;
      const flip = local < hold ? 0 : easeInOut((local - hold) / (1 - hold));
      spin = (cycle + flip) * 360 * dir + (local < hold ? 16 * Math.sin((local / hold) * Math.PI * 2) : 0);
      const tilt = 16 + 7 * Math.sin(now / 650);
      coin.style.transform = `perspective(420px) rotateX(${tilt}deg) rotateY(${spin}deg)`;

      // O rastro de faíscas, saindo de trás da ficha.
      if (now >= nextTrail) {
        nextTrail = now + rand(45, 70);
        emitTrail(fx, x - dir * size * 0.34, y, dir);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [flight, reduceMotion]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  // Pegou: a ficha estoura em faíscas e sobe sumindo, com o "+1" dourado.
  const pop = () => {
    const chip = chipRef.current;
    const fx = fxRef.current;
    if (!chip || !fx) return;
    const { x, y } = pos.current;
    const half = chip.offsetWidth / 2;
    const at = (dy: number, scale: number) => `translate3d(${x - half}px, ${y - half + dy}px, 0) scale(${scale})`;
    if (reduceMotion) {
      chip.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' });
      spawn(fx, 'fc-plus fc-plus--still', x, y, {}, '+1');
      return;
    }
    chip.animate(
      [
        { transform: at(0, 1), opacity: 1 },
        { transform: at(-6, 1.3), opacity: 1, offset: 0.2 },
        { transform: at(-120, 0.3), opacity: 0 },
      ],
      { duration: 900, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' },
    );
    burst(fx, x, y);
    spawn(fx, 'fc-plus', x, y - 18, {}, '+1');
  };

  // Recusada pelo banco (a janela fechou): a ficha só se desfaz.
  const fade = () => {
    const chip = chipRef.current;
    if (!chip) return;
    const { x, y } = pos.current;
    const half = chip.offsetWidth / 2;
    chip.animate(
      [
        { transform: `translate3d(${x - half}px, ${y - half}px, 0) scale(1)`, opacity: 1 },
        { transform: `translate3d(${x - half}px, ${y - half - (reduceMotion ? 0 : 36)}px, 0) scale(0.8)`, opacity: 0 },
      ],
      { duration: 600, easing: 'ease-in', fill: 'forwards' },
    );
  };

  const handleCatch = async () => {
    if (stage.current !== 'flying') return;
    stage.current = 'grabbing';
    const pausedAt = performance.now();
    const chip = chipRef.current;
    chip?.classList.add('is-grabbing');
    primeJackpotAudio();

    let result: UfoCatch;
    try {
      result = import.meta.env.DEV && flight.demo ? await new Promise<UfoCatch>((resolve) => window.setTimeout(() => resolve({ ok: true, tickets: 0 }), 350)) : await catchUfo();
    } catch {
      // Falha de rede: na primeira vez a ficha volta a voar (dá para tentar
      // de novo dentro da janela); na segunda, desiste.
      if (!retried.current) {
        retried.current = true;
        startAt.current += performance.now() - pausedAt;
        chip?.classList.remove('is-grabbing');
        stage.current = 'flying';
        callbacks.current.onEvent({ kind: 'retry' });
        return;
      }
      result = { ok: false, reason: 'error' };
    }

    stage.current = 'leaving';
    if (result.ok) {
      pop();
      callbacks.current.onEvent({ kind: 'caught', tickets: result.tickets });
      later(() => callbacks.current.onGone(), 1500);
    } else {
      fade();
      callbacks.current.onEvent({ kind: 'escaped', reason: result.reason });
      later(() => callbacks.current.onGone(), 700);
    }
  };

  return createPortal(
    <div className={`fc-layer ${reduceMotion ? 'fc-still' : ''}`}>
      <div ref={fxRef} className="fc-fx" aria-hidden />
      <button
        ref={chipRef}
        type="button"
        className={`fc-chip ${FOCUS_RING}`}
        aria-label={t('jackpot.ufo.aria')}
        onClick={handleCatch}
        style={{ transform: 'translate3d(-500px, -500px, 0)' }}
      >
        <span className="fc-halo" aria-hidden />
        {!reduceMotion && <span className="fc-rays" aria-hidden />}
        <span ref={bankRef} className="fc-bank" aria-hidden>
          <span className="fc-grab">
            <span ref={coinRef} className="fc-coin">
              {EDGES.map((z) => (
                <span key={z} className="fc-edge" style={{ ['--z' as string]: `${z}px` }} />
              ))}
              <span className="fc-face fc-face--back">
                <ChipFace />
              </span>
              <span className="fc-face fc-face--front">
                <ChipFace />
                <span className="fc-glint" />
              </span>
            </span>
          </span>
        </span>
        {!reduceMotion && (
          <>
            <span className="fc-twinkle fc-twinkle--a" aria-hidden />
            <span className="fc-twinkle fc-twinkle--b" aria-hidden />
          </>
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>,
    document.body,
  );
};

// ---------------------------------------------------------------------------
// O agendador (montado uma vez no App)
// ---------------------------------------------------------------------------

const TOAST_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1a2164, #0b0f36)',
  color: '#FFF4D6',
  border: '1px solid rgba(244, 196, 84, 0.65)',
  borderRadius: 16,
  boxShadow: '0 14px 34px -14px rgba(0, 0, 0, 0.9), 0 0 24px -8px rgba(244, 196, 84, 0.55)',
  padding: '10px 14px',
  maxWidth: 360,
};

const FlyingChip: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { pathname } = useLocation();
  const reduceMotion = !!useReducedMotion();
  const [flight, setFlight] = useState<Flight | null>(null);

  const userRef = useRef(userId);
  userRef.current = userId;
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const timer = useRef<number | undefined>(undefined);
  const flying = useRef(false);
  const pending = useRef(false);
  const lastCheck = useRef(0);
  const lastActivity = useRef(Date.now());
  // tryLaunch e check se chamam um ao outro: o check entra por aqui.
  const checkRef = useRef<(minGapMs: number) => Promise<void>>(async () => undefined);

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const startFlight = useCallback(
    (durationMs: number, demo = false) => {
      clearTimer();
      pending.current = false;
      flying.current = true;
      setFlight(makeFlight(durationMs, demo));
    },
    [clearTimer],
  );

  // Hora de voar: só com a aba visível, fora do login e com a pessoa mexendo
  // no site. Senão fica "pendente" e acorda no próximo sinal de vida.
  const tryLaunch = useCallback(async () => {
    const uid = userRef.current;
    if (!uid || flying.current) return;
    if (document.visibilityState !== 'visible' || blockedPath(pathRef.current) || Date.now() - lastActivity.current > IDLE_MS) {
      pending.current = true;
      return;
    }
    pending.current = false;
    try {
      const result = await launchUfo();
      if (userRef.current !== uid || flying.current) return;
      if (result.ok) {
        startFlight(Math.min(UFO_FLIGHT_MS, (result.expiresIn - CATCH_SLACK_S) * 1000));
      } else if (result.reason === 'not_due') {
        // Relógio adiantado: pergunta de novo daqui a pouco.
        lastCheck.current = 0;
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          void checkRef.current(0);
        }, 30_000);
      } else if (result.reason === 'already_launched') {
        // Outra aba decolou: o status diz se ainda dá para pegar.
        void checkRef.current(0);
      } else {
        markUfoDayDone(uid);
      }
    } catch {
      // Sem rede: tenta de novo no próximo sinal de vida.
      pending.current = true;
    }
  }, [startFlight]);

  const wake = useCallback(() => {
    if (!pending.current || flying.current || timer.current !== undefined) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      void tryLaunch();
    }, rand(...WAKE_MS));
  }, [tryLaunch]);

  const check = useCallback(
    async (minGapMs: number) => {
      const uid = userRef.current;
      if (import.meta.env.DEV && devDemoRequested()) return;
      if (!uid || flying.current || isUfoDayDone(uid)) return;
      if (Date.now() - lastCheck.current < minGapMs) return;
      lastCheck.current = Date.now();
      let status;
      try {
        status = await fetchUfoStatus();
      } catch {
        return;
      }
      if (userRef.current !== uid || flying.current) return;
      clearTimer();
      pending.current = false;
      if (status.state === 'scheduled') {
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          void tryLaunch();
        }, Math.max(0, (status.flyIn ?? 60) * 1000) + rand(0, 4_000));
      } else if (status.state === 'due') {
        timer.current = window.setTimeout(() => {
          timer.current = undefined;
          void tryLaunch();
        }, rand(...DUE_SETTLE_MS));
      } else if (status.state === 'flying') {
        const left = (status.expiresIn ?? 0) - CATCH_SLACK_S;
        if (left >= MIN_RESUME_S && document.visibilityState === 'visible') startFlight(Math.min(UFO_FLIGHT_MS, left * 1000));
      } else {
        // none / caught / missed: até amanhã.
        markUfoDayDone(uid);
      }
    },
    [clearTimer, startFlight, tryLaunch],
  );
  checkRef.current = check;

  // Entrou (ou trocou de conta): pergunta ao banco e passa a ouvir a aba e
  // os sinais de vida da pessoa.
  useEffect(() => {
    if (!userId) return;
    if (import.meta.env.DEV && devDemoRequested()) return;
    lastActivity.current = Date.now();
    void check(0);
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      lastActivity.current = Date.now();
      void check(VISIBLE_RECHECK_MS);
      wake();
    };
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (pending.current) wake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      clearTimer();
      pending.current = false;
      flying.current = false;
      lastCheck.current = 0;
      setFlight(null);
    };
  }, [userId, check, wake, clearTimer]);

  // Trocou de página: acorda a ficha pendente (saiu do login, por exemplo) e,
  // de vez em quando, confere o dia (a virada da meia-noite com o site aberto).
  useEffect(() => {
    if (!userId) return;
    wake();
    void check(ROUTE_RECHECK_MS);
  }, [pathname, userId, wake, check]);

  // Desenvolvimento: ?ufo=1 voa uma ficha de demonstração (ver acima).
  useEffect(() => {
    if (!import.meta.env.DEV || !userId || !devDemoRequested()) return;
    const id = window.setTimeout(() => startFlight(UFO_FLIGHT_MS, true), 1200);
    return () => window.clearTimeout(id);
  }, [userId, startFlight]);

  const handleEvent = useCallback(
    (event: FlightEvent) => {
      const uid = userRef.current;
      const demo = import.meta.env.DEV && !!flight?.demo;
      if (event.kind === 'retry') {
        toast(t('jackpot.ufo.slipped'), { id: 'jackpot-ufo', icon: <ChipFace className="fc-toast-chip" />, style: TOAST_STYLE, duration: 2500 });
        return;
      }
      if (uid && !demo) markUfoDayDone(uid);
      if (event.kind === 'caught') {
        playReveal('rare', false);
        navigator.vibrate?.([24, 40, 36]);
        toast(
          <span className="fc-toast">
            <span className="fc-toast-title">
              {t('jackpot.ufo.caughtTitle')}
              {demo && ` ${t('jackpot.ufo.demo')}`}
            </span>
            <span className="fc-toast-body">{t('jackpot.ufo.caughtBody')}</span>
          </span>,
          { id: 'jackpot-ufo', icon: <ChipFace className="fc-toast-chip" />, style: TOAST_STYLE, duration: 4500 },
        );
        notifyJackpotChipsChanged(demo ? {} : { tickets: event.tickets });
      } else if (event.kind === 'escaped') {
        toast(t('jackpot.ufo.escaped'), { id: 'jackpot-ufo', icon: <ChipFace className="fc-toast-chip" />, style: TOAST_STYLE, duration: 3200 });
      }
      // missed: ela só foi embora (sem aviso).
    },
    [flight, t],
  );

  const handleGone = useCallback(() => {
    flying.current = false;
    setFlight(null);
  }, []);

  if (!userId || !flight) return null;
  return <ChipFlight key={flight.id} flight={flight} reduceMotion={reduceMotion} onEvent={handleEvent} onGone={handleGone} />;
};

export default FlyingChip;
