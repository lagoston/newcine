/**
 * O Diretor de falas na mesa (SPEC §6 e §8, pacote B).
 *
 * 03/11/2026: o `createDirector` do pacote B vem por import dinâmico (o banco de
 * falas não pesa na abertura do app). O Diretor do B é um por partida (abertura,
 * orçamento e créditos valem uma vez), então cada controlador chama `reset()`
 * antes de dar as cartas: ele espera o módulo carregar e monta um Diretor novo.
 * Se o módulo falhar, fica um Diretor nulo com a mesma interface (só o balão
 * "Você: …" das Réplicas).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatchMode, PrizeKind, PublicEvent, Rarity, RivalId, TableView, TitleId } from '../types.ts';
import type { Speed, TalkMode } from './settings.ts';
import { playVoice } from './sound.ts';

export type Emote = 'excl' | 'quest' | 'dots' | 'sweat' | 'vein' | 'heart' | 'star' | 'hat' | 'note' | 'zzz' | 'broken';

export interface SpeechItem {
  lineId: string;
  speaker: RivalId | 'human';
  text: string;
  priority: 1 | 2 | 3;
  emote?: Emote;
  durationMs: number;
  exchange?: { id: string; part: number; of: number };
  curta: boolean;
}

export interface TableContext {
  mode: MatchMode;
  lang: 'pt' | 'en';
  title: TitleId;
  lifetimeMatches: number;
  matchInSession: number;
  returning: boolean;
  localHour: number;
  nemesis?: RivalId;
  customer?: RivalId;
  memory?: { riverBluffHigh?: boolean; foldsMuch?: boolean };
  prize?: { name: string; kind: PrizeKind; rarity: Rarity };
  story: Record<string, string>;
  speed: Speed;
  talk: TalkMode;
  view: TableView;
  reducedMotion: boolean;
}

export type DirectorMoment =
  | { t: 'rankUp'; title: TitleId }
  | { t: 'tableWinner'; winnerId: string }
  | { t: 'rematch' }
  | { t: 'playerLeaves' }
  | { t: 'intervalReturn' };

export interface RecapInfo {
  handNumber: number;
  bb: number;
  stacks: Partial<Record<string, number>>;
  holderId?: string | null;
  someoneOut?: boolean;
}

export interface Director {
  onEvent(e: PublicEvent, ctx: TableContext): void;
  onHumanTurn(open: boolean): void;
  onIdleTick(msParada: number): void;
  onDrawer(open: boolean): void;
  onQuip(quipId: string, target: RivalId): void;
  onTutorialBeat(lineIds: string[]): void;
  next(nowMs: number): SpeechItem | null;
  skip(): void;
  storyTouched(): string[];
  /** Acréscimos do pacote B (opcionais): momentos fora dos eventos e falas de cartão. */
  onMoment?(m: DirectorMoment): void;
  cardLine?(kind: 'recap' | 'intervalInvite', ctx: TableContext, info?: RecapInfo): SpeechItem | null;
}

export interface DirectorOptions {
  mode: MatchMode;
  lang: 'pt' | 'en';
  talk: TalkMode;
  speed: Speed;
  story: Record<string, string>;
  lifetimeMatches: number;
  matchInSession: number;
  reducedMotion: boolean;
  quipPack?: string;
  afterInterval?: boolean;
}

/** As Réplicas padrão (pacote `quips-padrao`, ids do banco do B), se o `quips.ts` não carregar. */
export const FALLBACK_QUIPS: { id: string; pt: string; en: string }[] = [
  { id: 'R1', pt: 'Pede pra sair?', en: 'Feeling lucky?' },
  { id: 'R2', pt: 'Já vi esse filme.', en: "I've seen this movie." },
  { id: 'R3', pt: 'Spoiler: eu ganho.', en: 'Spoiler: I win.' },
  { id: 'R4', pt: 'Bela atuação.', en: 'Nice acting.' },
];

type QuipDef = { id: string; pt: string; en: string };
const quipModules = import.meta.glob('../dialogue/quips.ts');
/** O pacote de Réplicas equipado (`dialogue/quips.ts` do B), com o padrão como plano B. */
export async function loadQuips(packId = 'quips-padrao'): Promise<QuipDef[]> {
  const loader = Object.values(quipModules)[0];
  if (!loader) return FALLBACK_QUIPS;
  try {
    const mod = (await loader()) as { QUIP_PACKS?: Record<string, { quips: QuipDef[] }> };
    return mod.QUIP_PACKS?.[packId]?.quips ?? mod.QUIP_PACKS?.['quips-padrao']?.quips ?? FALLBACK_QUIPS;
  } catch {
    return FALLBACK_QUIPS;
  }
}

/** Diretor nulo: não fala nada sozinho; só mostra a Réplica da pessoa. */
export function createNullDirector(opts: DirectorOptions): Director {
  const queue: SpeechItem[] = [];
  return {
    onEvent() {},
    onHumanTurn() {},
    onIdleTick() {},
    onDrawer() {},
    onQuip(quipId) {
      const q = FALLBACK_QUIPS.find((x) => x.id === quipId);
      if (!q) return;
      const text = opts.lang === 'pt' ? q.pt : q.en;
      queue.push({ lineId: quipId, speaker: 'human', text, priority: 2, durationMs: Math.min(6000, Math.max(2200, 1200 + text.length * 55)), curta: true });
    },
    onTutorialBeat() {},
    next() {
      return queue.shift() ?? null;
    },
    skip() {},
    storyTouched() {
      return [];
    },
  };
}

type CreateDirector = (opts: DirectorOptions) => Director;
const directorModules = import.meta.glob('../dialogue/director.ts');
let realFactory: CreateDirector | null = null;
let loading: Promise<CreateDirector | null> | null = null;

function loadRealDirector(): Promise<CreateDirector | null> {
  if (realFactory) return Promise.resolve(realFactory);
  if (loading) return loading;
  const loader = Object.values(directorModules)[0];
  if (!loader) return Promise.resolve(null);
  loading = loader().then(
    (mod) => {
      const fn = (mod as { createDirector?: unknown }).createDirector;
      realFactory = typeof fn === 'function' ? (fn as CreateDirector) : null;
      return realFactory;
    },
    () => null,
  );
  return loading;
}

export interface UseDirector {
  director: Director;
  speech: SpeechItem | null;
  /** Toque na faixa de fala: passa para a próxima. */
  skip: () => void;
  /** Mensagens P1/P2 para o leitor de tela (limitadas). */
  spoken: string | null;
  /** Resolve quando a faixa de fala esvazia (os balões de um beat do treino acabaram). */
  waitQuiet: (maxMs?: number) => Promise<void>;
  /** Resolve quando um balão entra na faixa (ou no tempo máximo). */
  waitSpeech: (maxMs?: number) => Promise<boolean>;
  /** Diretor novo para a próxima partida, com as opções atualizadas (espera o módulo do B). */
  reset: (patch?: Partial<DirectorOptions>) => Promise<void>;
  /** Treino: o último balão fica na faixa depois do tempo dele (até o "Continuar"). */
  hold: (on: boolean) => void;
  /** Segura a fila enquanto um cartão cobre a faixa (a fala não se perde por baixo dele). */
  pause: (on: boolean) => void;
}

/**
 * Liga um Diretor à mesa e cuida da faixa de fala: um balão por vez, com a duração
 * que o Diretor manda. `paused` segura a fila (ex.: cartas de all-in virando).
 */
export function useDirector(opts: DirectorOptions & { paused?: boolean; onSpeech?: (s: SpeechItem) => void }): UseDirector {
  const optsRef = useRef<DirectorOptions>(opts);
  const make = (o: DirectorOptions): Director => {
    try {
      return realFactory ? realFactory(o) : createNullDirector(o);
    } catch {
      return createNullDirector(o);
    }
  };
  const ref = useRef<Director | null>(null);
  if (!ref.current) ref.current = make(opts);
  const shownAt = useRef(0);
  const holdRef = useRef(false);
  const [speech, setSpeech] = useState<SpeechItem | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const untilRef = useRef(0);
  const lastSpokenRef = useRef(0);
  // Último tique em que a fila estava vazia e nada na faixa.
  const quietRef = useRef(true);
  const pausedRef = useRef(!!opts.paused);
  // Pausa pedida pela mesa (cartões por cima da faixa: "Estrelando…", Intervalo, recap).
  const manualPause = useRef(false);
  pausedRef.current = !!opts.paused || manualPause.current;
  const onSpeechRef = useRef(opts.onSpeech);
  onSpeechRef.current = opts.onSpeech;

  // Um Diretor por partida (03/11/2026): o do B guarda abertura, orçamento e
  // créditos. A faixa mantém o balão que estiver na tela (ex.: a fala da Revanche).
  const reset = useCallback(async (patch: Partial<DirectorOptions> = {}) => {
    optsRef.current = { ...optsRef.current, ...patch };
    await loadRealDirector();
    ref.current = make(optsRef.current);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      if (untilRef.current && now < untilRef.current) return;
      if (untilRef.current) {
        untilRef.current = 0;
        if (!holdRef.current) setSpeech(null);
      }
      if (pausedRef.current || manualPause.current) return;
      const item = ref.current?.next(Date.now()) ?? null;
      if (!item) {
        quietRef.current = true;
        return;
      }
      quietRef.current = false;
      untilRef.current = now + Math.max(1200, item.durationMs);
      shownAt.current = now;
      setSpeech(item);
      onSpeechRef.current?.(item);
      playVoice(item.speaker, item.text.length);
      if (item.priority <= 2 && Date.now() - lastSpokenRef.current > 4000) {
        lastSpokenRef.current = Date.now();
        setSpoken(item.text);
      }
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  const skip = useCallback(() => {
    ref.current?.skip();
    untilRef.current = 0;
    setSpeech(null);
  }, []);

  const waitQuiet = useCallback((maxMs = 20000) => {
    quietRef.current = false;
    const start = performance.now();
    return new Promise<void>((resolve) => {
      const id = window.setInterval(() => {
        // Dá um tique para o Diretor pôr na fila o que acabou de receber.
        if ((performance.now() - start > 300 && quietRef.current && !untilRef.current) || performance.now() - start > maxMs) {
          window.clearInterval(id);
          resolve();
        }
      }, 120);
    });
  }, []);

  const hold = useCallback((on: boolean) => {
    holdRef.current = on;
    if (!on && !untilRef.current) setSpeech(null);
  }, []);

  const pause = useCallback((on: boolean) => {
    manualPause.current = on;
  }, []);

  const waitSpeech = useCallback((maxMs = 1500) => {
    const start = performance.now();
    return new Promise<boolean>((resolve) => {
      const id = window.setInterval(() => {
        if (shownAt.current >= start) {
          window.clearInterval(id);
          resolve(true);
        } else if (performance.now() - start > maxMs) {
          window.clearInterval(id);
          resolve(false);
        }
      }, 60);
    });
  }, []);

  // Fachada estável: quem guardou o Diretor continua falando com o atual (o real
  // pode chegar depois do primeiro desenho).
  const director = useMemo<Director>(
    () => ({
      onEvent: (e, c) => ref.current?.onEvent(e, c),
      onHumanTurn: (o) => ref.current?.onHumanTurn(o),
      onIdleTick: (ms) => ref.current?.onIdleTick(ms),
      onDrawer: (o) => ref.current?.onDrawer(o),
      onQuip: (q, t) => ref.current?.onQuip(q, t),
      onTutorialBeat: (ids) => ref.current?.onTutorialBeat(ids),
      next: (now) => ref.current?.next(now) ?? null,
      skip: () => ref.current?.skip(),
      storyTouched: () => ref.current?.storyTouched() ?? [],
      onMoment: (m) => ref.current?.onMoment?.(m),
      cardLine: (k, c, info) => ref.current?.cardLine?.(k, c, info) ?? null,
    }),
    [],
  );

  return { director, speech, skip, spoken, waitQuiet, waitSpeech, reset, hold, pause };
}
