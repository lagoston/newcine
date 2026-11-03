/**
 * O Diretor de falas na mesa (SPEC §6 e §8, pacote B).
 *
 * 03/11/2026: o `createDirector` do pacote B ainda não existe. Até ele chegar, a
 * mesa usa um Diretor nulo com a mesma interface (só devolve o balão "Você: …"
 * das Réplicas). O real entra sozinho: `import.meta.glob` procura
 * `dialogue/director.ts` e, achando `createDirector`, troca o nulo por ele.
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
}

/**
 * Liga um Diretor à mesa e cuida da faixa de fala: um balão por vez, com a duração
 * que o Diretor manda. `paused` segura a fila (ex.: cartas de all-in virando).
 */
export function useDirector(opts: DirectorOptions & { paused?: boolean; onSpeech?: (s: SpeechItem) => void }): UseDirector {
  const make = (): Director => {
    try {
      return realFactory ? realFactory(opts) : createNullDirector(opts);
    } catch {
      return createNullDirector(opts);
    }
  };
  const ref = useRef<Director | null>(null);
  if (!ref.current) ref.current = make();
  const [speech, setSpeech] = useState<SpeechItem | null>(null);
  const [spoken, setSpoken] = useState<string | null>(null);
  const untilRef = useRef(0);
  const lastSpokenRef = useRef(0);
  // Último tique em que a fila estava vazia e nada na faixa.
  const quietRef = useRef(true);
  const pausedRef = useRef(!!opts.paused);
  pausedRef.current = !!opts.paused;
  const onSpeechRef = useRef(opts.onSpeech);
  onSpeechRef.current = opts.onSpeech;

  // Troca o nulo pelo real assim que o módulo do pacote B carregar.
  useEffect(() => {
    let alive = true;
    loadRealDirector().then((f) => {
      if (!alive || !f) return;
      try {
        ref.current = f(opts);
      } catch {
        // fica o nulo
      }
    });
    return () => {
      alive = false;
    };
    // Um Diretor por partida: as opções iniciais bastam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      if (untilRef.current && now < untilRef.current) return;
      if (untilRef.current) {
        untilRef.current = 0;
        setSpeech(null);
      }
      if (pausedRef.current) return;
      const item = ref.current?.next(Date.now()) ?? null;
      if (!item) {
        quietRef.current = true;
        return;
      }
      quietRef.current = false;
      untilRef.current = now + Math.max(1200, item.durationMs);
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

  return { director, speech, skip, spoken, waitQuiet };
}
