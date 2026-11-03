/**
 * Treino (SPEC §2.8 e §7.8): as 3 mãos roteirizadas do pacote B, no Worker. Só as
 * ações permitidas ficam ativas, a sugerida ganha destaque, as falas dos `beats`
 * saem pelo Diretor (modo `tutorial`) e os `waitTap` seguram a mesa até
 * "Continuar". Ao fim, `claimTutorialChip()` (+1 ficha, uma vez por pessoa).
 *
 * 03/11/2026: o roteiro (`tutorial/script.ts`) é do pacote B e entra sozinho pelo
 * `import.meta.glob` quando existir; sem ele, a tela avisa que o treino vem depois.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerAction } from '../engine.ts';
import type { HumanStep, PublicEvent, TutorialBeat, TutorialScript } from '../types.ts';
import { pokerApi } from './api.ts';
import type { TableShow } from './display.ts';
import type { Rig } from './useRig.ts';
import { invalidatePokerHome } from './usePokerHome.ts';
import { getPokerSettings, setPokerSettings } from './settings.ts';

const scriptModules = import.meta.glob('../tutorial/script.ts');

function pickScript(mod: Record<string, unknown>): TutorialScript | null {
  for (const v of Object.values(mod)) {
    const s = v as TutorialScript;
    if (s && typeof s === 'object' && Array.isArray(s.hands) && s.hands.length === 3) return s;
  }
  return null;
}

/** Permite à prévia (ou a um teste) injetar um roteiro. */
let scriptOverride: TutorialScript | null = null;
export function setTutorialScriptOverride(s: TutorialScript | null) {
  scriptOverride = s;
}

export interface TrainingCtl {
  status: 'loading' | 'playing' | 'done' | 'unavailable';
  hand: number;
  gate: { allowed: PlayerAction['type'][]; suggested: PlayerAction | null } | null;
  highlight: TutorialBeat['highlight'] | null;
  waitingTap: boolean;
  onContinue: () => void;
  act: (a: PlayerAction) => void;
  /** Toque num botão apagado: "Corta. Tomada dois." (a ação não acontece). */
  blocked: (type: PlayerAction['type']) => void;
  granted: boolean | null;
  hintId: string | null;
}

type At = TutorialBeat['at'];

export function useTraining(rig: Rig): TrainingCtl {
  const { table, client, dir } = rig;
  const [status, setStatus] = useState<TrainingCtl['status']>('loading');
  const [hand, setHand] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [highlight, setHighlight] = useState<TutorialBeat['highlight'] | null>(null);
  const [waitingTap, setWaitingTap] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null);
  const script = useRef<TutorialScript | null>(null);
  const correctionFn = useRef<((h: 0 | 1 | 2, step: number, a: PlayerAction['type']) => string | null) | null>(null);
  const tapResolve = useRef<(() => void) | null>(null);
  const humanActs = useRef(0);
  const handRef = useRef(0);
  const busy = useRef(false);
  const tableRef = useRef(table);
  tableRef.current = table;

  // Um beat: as falas pelo Diretor, o destaque e, com waitTap, o "Continuar".
  // Sem waitTap, a mesa espera os balões acabarem (contrato do roteiro).
  const beats = useCallback(async (at: At) => {
    const s = script.current;
    if (!s) return;
    const list = s.hands[handRef.current].beats.filter((b) =>
      typeof b.at === 'string' ? b.at === at : typeof at === 'object' && b.at.afterHumanStep === at.afterHumanStep,
    );
    for (const b of list) {
      dir.director.onTutorialBeat(b.lineIds);
      setHighlight(b.highlight ?? null);
      if (b.waitTap) {
        // O "Continuar" só aparece depois dos balões do beat (um toque no balão
        // adianta); o último fica na faixa até o toque. Assim cada beat custa um
        // toque só, como o roteiro conta (≤ 6 por mão).
        dir.hold(true);
        await dir.waitQuiet();
        setWaitingTap(true);
        await new Promise<void>((res) => (tapResolve.current = res));
        setWaitingTap(false);
        dir.hold(false);
        setHighlight(null);
      } else {
        await dir.waitQuiet();
      }
    }
  }, [dir]);

  const startHand = useCallback(
    async (i: 0 | 1 | 2) => {
      const s = script.current;
      if (!s) return;
      handRef.current = i;
      humanActs.current = 0;
      setHand(i);
      setStepIdx(0);
      setHighlight(null);
      const r = await client.call({ op: 'tutorial', script: s, hand: i });
      if (r.kind !== 'step') {
        setStatus('unavailable');
        return;
      }
      tableRef.current.enqueue({ events: r.events, view: r.view });
    },
    [client],
  );

  // Os beats tocam presos aos eventos projetados (contrato no topo de tutorial/script.ts):
  // handStart com as cartas dadas; a rua logo antes da vez da pessoa; afterHumanStep logo
  // depois da ação dela; showdown com o pote entregue; handEnd por último.
  useEffect(() => {
    const pending = { street: null as At | null, showdownDone: false };
    rig.afterEvent.current = async (e: PublicEvent, t: TableShow) => {
      const me = t.seats.find((x) => x.id === 'human');
      const inHand = !!me && me.hasCards && (me.status === 'active' || me.status === 'allIn');
      if (e.t === 'handStarted') {
        pending.street = null;
        pending.showdownDone = false;
      } else if (e.t === 'holeCards') await beats('handStart');
      else if (e.t === 'street') {
        if (pending.street) await beats(pending.street);
        pending.street = null;
        if (inHand && me?.status === 'active') pending.street = e.street;
        else await beats(e.street);
      } else if (e.t === 'action' && e.playerId === 'human') {
        const k = humanActs.current;
        humanActs.current += 1;
        await beats({ afterHumanStep: k });
      } else if (e.t === 'potAwarded' && !pending.showdownDone) {
        if (pending.street) await beats(pending.street);
        pending.street = null;
        pending.showdownDone = true;
        if (t.showdown) await beats('showdown');
      } else if (e.t === 'handComplete') {
        if (pending.street) await beats(pending.street);
        pending.street = null;
        await beats('handEnd');
      }
    };
    rig.beforeTurn.current = async () => {
      if (pending.street) {
        const at = pending.street;
        pending.street = null;
        await beats(at);
      }
    };
    return () => {
      rig.afterEvent.current = null;
      rig.beforeTurn.current = null;
    };
  }, [beats, rig.afterEvent, rig.beforeTurn]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let s = scriptOverride;
      if (!s) {
        const loader = Object.values(scriptModules)[0];
        if (loader) {
          try {
            const mod = (await loader()) as Record<string, unknown>;
            s = pickScript(mod);
            if (typeof mod.tutorialCorrection === 'function') correctionFn.current = mod.tutorialCorrection as typeof correctionFn.current;
          } catch {
            s = null;
          }
        }
      }
      if (!alive) return;
      if (!s) {
        setStatus('unavailable');
        return;
      }
      script.current = s;
      // O Diretor real (modo treino) antes do primeiro beat.
      await rig.newMatch();
      if (!alive) return;
      setStatus('playing');
      await startHand(0);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A mão acabou (o treino fecha cada mão com status 'finished'): próxima, ou fim.
  useEffect(() => {
    if (status !== 'playing' || table.phase !== 'ended') return;
    const next = handRef.current + 1;
    if (next <= 2) {
      void startHand(next as 1 | 2);
      return;
    }
    setStatus('done');
    rig.flushStory();
    // Quem fez o treino ganha o termômetro ligado (§7.3).
    if (getPokerSettings().thermo === null) setPokerSettings({ thermo: true });
    void pokerApi.claimTutorialChip().then(
      (r) => {
        setGranted(r.granted);
        invalidatePokerHome();
      },
      () => setGranted(false),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, table.phase, startHand]);

  const step: HumanStep | null = script.current && table.phase === 'human' ? script.current.hands[hand]?.human[stepIdx] ?? null : null;

  // A dica do Raposo antes da vez da pessoa.
  useEffect(() => {
    if (step) dir.director.onTutorialBeat([step.hintLineId]);
  }, [step, dir.director]);

  const blocked = useCallback(
    (type: PlayerAction['type']) => {
      const id = correctionFn.current?.(handRef.current as 0 | 1 | 2, stepIdx, type) ?? null;
      if (!id) return;
      // A "tomada dois" entra na hora, no lugar da dica que estiver na faixa.
      dir.skip();
      dir.director.onTutorialBeat([id]);
    },
    [dir, stepIdx],
  );

  const act = useCallback(
    (a: PlayerAction) => {
      if (busy.current) return;
      busy.current = true;
      tableRef.current.optimistic(a);
      setStepIdx((x) => x + 1);
      void client.call({ op: 'act', action: a }).then((r) => {
        busy.current = false;
        if (r.kind === 'step') tableRef.current.enqueue({ events: r.events, view: r.view });
        else tableRef.current.reopen();
      });
    },
    [client],
  );

  return {
    status,
    hand,
    gate: step ? { allowed: step.allowed, suggested: step.suggested } : status === 'playing' ? { allowed: [], suggested: null } : null,
    highlight,
    waitingTap,
    onContinue: () => {
      tapResolve.current?.();
      tapResolve.current = null;
    },
    act,
    blocked,
    granted,
    hintId: step?.hintLineId ?? null,
  };
}
