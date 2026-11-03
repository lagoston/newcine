import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { PlayerAction } from '../../../lib/poker/engine';
import type { MatchMode } from '../../../lib/poker/types';
import type { TableShow } from '../../../lib/poker/client/display';
import { humanToCall, seatOf } from '../../../lib/poker/client/display';
import type { TablePhase } from '../../../lib/poker/client/useTable';
import { actionFor, potFractionKey, presetsFor, raiseRange, shortAllIn, stepAmount } from '../../../lib/poker/client/betting';
import { fmt, type Lang } from '../../../lib/poker/client/format';

// O rodapé (SPEC §7.4): na sua vez, atalhos de valor, slider e os três botões
// (Desistir · Passar/Pagar · Aumentar); fora da vez, na mesma altura, o que está
// acontecendo e as pré-ações. Contra o toque acidental: trava de 350 ms quando a
// vez chega, confirmação para desistir quando passar é de graça, all-in sempre
// em dois gestos e, no prêmio, segurar 600 ms (com diálogo no teclado).

export type PreAction = { kind: 'checkFold' } | { kind: 'call'; amount: number } | { kind: 'callAny' };

export interface ActionBarHandle {
  fold: () => void;
  checkCall: () => void;
  raise: () => void;
  step: (dir: 1 | -1) => void;
  preset: (i: number) => void;
  confirm: () => void;
}

export interface TutorialGate {
  allowed: PlayerAction['type'][];
  suggested: PlayerAction | null;
}

interface ActionBarProps {
  table: TableShow;
  phase: TablePhase;
  mode: MatchMode;
  lang: Lang;
  leftHanded: boolean;
  onAct: (a: PlayerAction) => void;
  pre: PreAction | null;
  setPre: (p: PreAction | null) => void;
  statusText: React.ReactNode;
  /** A jogada anterior, mais apagada, acima do status (fora da vez). */
  prevText?: React.ReactNode;
  tutorial?: TutorialGate | null;
  /** Treino: um "Continuar" no lugar dos botões (conta como toque). */
  onContinue?: (() => void) | null;
  onConfirmDialog: (text: string, run: () => void) => void;
  /** Treino: toque num botão apagado. */
  onBlocked?: (type: PlayerAction['type']) => void;
}

const HOLD_MS = 600;

// Segurar para confirmar (prêmio). Clique sem ponteiro (teclado/leitor de tela)
// abre o diálogo de confirmação no lugar.
const HoldButton: React.FC<{
  className: string;
  disabled?: boolean;
  onConfirm: () => void;
  onKeyboard: () => void;
  children: React.ReactNode;
  label: string;
}> = ({ className, disabled, onConfirm, onKeyboard, children, label }) => {
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const fired = useRef(false);
  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    fired.current = false;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={className}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (disabled) return;
        if (e.detail === 0) onKeyboard();
      }}
    >
      <span className="pk-hold-fill" style={holding ? { transform: 'scaleX(1)', transition: `transform ${HOLD_MS}ms linear` } : undefined} />
      {children}
    </button>
  );
};

const ActionBar = forwardRef<ActionBarHandle, ActionBarProps>(function ActionBar(
  { table, phase, mode, lang, leftHanded, onAct, pre, setPre, statusText, prevText, tutorial, onContinue, onConfirmDialog, onBlocked },
  ref,
) {
  const { t } = useTranslation();
  const legal = phase === 'human' ? table.legal : null;
  const me = seatOf(table, 'human');
  const bb = table.level.bb;
  const range = legal ? raiseRange(legal) : null;
  const presets = useMemo(() => (legal ? presetsFor(legal, legal.street, bb) : []), [legal, bb]);
  const [amount, setAmount] = useState(0);
  const [armed, setArmed] = useState<'raise' | 'call' | null>(null);
  // O all-in foi armado por um toque no próprio botão (o segundo toque confirma).
  const [armedTap, setArmedTap] = useState(false);
  const [foldAsk, setFoldAsk] = useState(false);
  const [locked, setLocked] = useState(false);
  const [presetOn, setPresetOn] = useState<string | null>(null);
  const callRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const bounty = mode === 'bounty';
  const n = (x: number) => fmt(x, lang);

  // A vez chegou: valor no mínimo, trava de 350 ms e o foco em Passar/Pagar.
  useEffect(() => {
    if (!legal) return;
    setAmount(range ? range.min : 0);
    setArmed(null);
    setArmedTap(false);
    setFoldAsk(false);
    setPresetOn(null);
    setLocked(true);
    const id = window.setTimeout(() => {
      setLocked(false);
      callRef.current?.focus({ preventScroll: true });
    }, 350);
    return () => window.clearTimeout(id);
    // Só quando a vez muda (o objeto legal é novo a cada vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legal]);

  const allowed = (type: PlayerAction['type']) => !tutorial || tutorial.allowed.includes(type);
  // No treino, tocar no que está apagado chama a "tomada dois" do Raposo.
  const gate = (type: PlayerAction['type']) => {
    if (allowed(type)) return true;
    onBlocked?.(type);
    return false;
  };
  const sug = tutorial?.suggested ?? null;
  const isSug = (types: PlayerAction['type'][]) => !!sug && types.includes(sug.type);

  // No treino, o valor sugerido já vem no slider.
  useEffect(() => {
    if (legal && sug && (sug.type === 'bet' || sug.type === 'raise') && range) setAmount(Math.max(range.min, Math.min(range.max, sug.amount)));
  }, [legal, sug, range]);

  const atMax = !!range && amount >= range.max;
  const doFold = () => {
    if (!legal || locked || !gate('fold')) return;
    if (legal.canCheck && !foldAsk) {
      setFoldAsk(true);
      return;
    }
    onAct({ type: 'fold' });
  };
  const doCheckCall = () => {
    if (!legal || locked) return;
    if (legal.canCheck) {
      if (gate('check')) onAct({ type: 'check' });
      return;
    }
    if (!legal.call || !gate('call')) return;
    if (legal.call.allIn) {
      // Pagar com todo o cacife: dois gestos (no prêmio, o segundo é segurar).
      if (bounty) return;
      if (armed !== 'call') {
        setArmed('call');
        return;
      }
    }
    onAct({ type: 'call' });
  };
  const doRaise = () => {
    if (!legal || locked) return;
    if (shortAllIn(legal)) {
      if (!gate('allIn')) return;
      if (armed !== 'raise') {
        setArmed('raise');
        setArmedTap(true);
        return;
      }
      if (!bounty) onAct({ type: 'allIn' });
      return;
    }
    if (!range) return;
    const a = actionFor(amount, range);
    if (!allowed(a.type) && !(a.type === 'allIn' && allowed('raise'))) {
      onBlocked?.(a.type === 'allIn' ? 'allIn' : range.kind);
      return;
    }
    if (a.type === 'allIn') {
      if (armed !== 'raise') {
        setArmed('raise');
        setArmedTap(true);
        return;
      }
      if (bounty) return;
    }
    onAct(a);
  };
  const setTo = (v: number, viaGesture = true) => {
    if (!range) return;
    const c = Math.max(range.min, Math.min(range.max, Math.round(v)));
    setAmount(c);
    // Escolher o teto pelo atalho/slider já é o primeiro gesto do all-in.
    setArmed(c >= range.max && viaGesture ? 'raise' : null);
    setArmedTap(false);
  };

  useImperativeHandle(ref, () => ({
    fold: doFold,
    checkCall: doCheckCall,
    raise: () => {
      amountRef.current?.focus();
    },
    step: (dir) => range && setTo(stepAmount(amount, dir, range, bb)),
    preset: (i) => {
      const p = presets[i];
      if (p) {
        setTo(p.to);
        setPresetOn(p.key);
      }
    },
    confirm: () => {
      if (armed === 'raise' || armed === 'call') {
        const run = () => onAct(armed === 'call' ? { type: 'call' } : range ? actionFor(range.max, range) : { type: 'allIn' });
        if (bounty) onConfirmDialog(t('poker.actions.confirmAllIn'), run);
        else run();
        return;
      }
      doRaise();
    },
  }));

  // ---------------------------------------------------------------- treino: Continuar
  if (onContinue) {
    return (
      <div className="pk-actions">
        <div className="pk-status">{statusText}</div>
        <div className="pk-confirm">
          <button type="button" className="pk-act is-gold" onClick={onContinue} autoFocus>
            <span className="pk-act-verb">{t('poker.table.continue')}</span>
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- fora da vez
  if (!legal) {
    const inHand = !!me && me.hasCards && me.status === 'active' && table.handNumber > 0 && phase !== 'ended' && !table.showdown;
    const toCall = humanToCall(table);
    const pres: { p: PreAction; label: React.ReactNode }[] = [
      { p: { kind: 'checkFold' }, label: t('poker.actions.preCheckFold') },
      toCall > 0
        ? { p: { kind: 'call', amount: toCall }, label: t('poker.actions.preCall', { amount: n(toCall) }) }
        : { p: { kind: 'call', amount: 0 }, label: t('poker.actions.check') },
      { p: { kind: 'callAny' }, label: t('poker.actions.preCallAny') },
    ];
    const same = (a: PreAction | null, b: PreAction) => !!a && a.kind === b.kind && (a.kind !== 'call' || (b.kind === 'call' && a.amount === b.amount));
    return (
      <div className="pk-actions" aria-label={t('poker.actions.region')}>
        <div className="pk-status is-muted" aria-hidden>{prevText}</div>
        <div className="pk-status" aria-live="off">
          {pre?.kind === 'call' && pre.amount > 0 && toCall !== pre.amount && inHand ? <span>{t('poker.actions.preDropped')}</span> : statusText}
        </div>
        <div className={`pk-btnrow ${leftHanded ? 'is-lefty' : ''}`}>
          {pres.map(({ p, label }) => (
            <button
              key={p.kind}
              type="button"
              className="pk-pre"
              aria-pressed={same(pre, p)}
              disabled={!inHand || !!tutorial}
              style={!inHand || tutorial ? { opacity: 0.35 } : undefined}
              onClick={() => setPre(same(pre, p) ? null : p)}
            >
              <span className="pk-check" aria-hidden>{same(pre, p) && <Check className="w-3 h-3" strokeWidth={3} />}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- na sua vez
  const callLabel = legal.canCheck ? (
    <span className="pk-act-verb">{t('poker.actions.check')}</span>
  ) : legal.call ? (
    armed === 'call' && !bounty ? (
      <>
        <span className="pk-act-verb">{t('poker.actions.confirm')}</span>
        <span className="pk-act-val">{t('poker.actions.callAllIn', { amount: n(legal.call.amount) })}</span>
      </>
    ) : (
      <>
        <span className="pk-act-verb">{t('poker.actions.callVerb')}</span>
        <span className="pk-act-val">{n(legal.call.amount)}{legal.call.allIn ? ' · all-in' : ''}</span>
      </>
    )
  ) : null;

  const short = shortAllIn(legal);
  const raiseIsAllIn = short || atMax;
  const raiseLabel = raiseIsAllIn ? (
    armedTap ? (
      <>
        <span className="pk-act-verb">{t('poker.actions.confirm')}</span>
        <span className="pk-act-val">ALL-IN {n(short ? legal.allIn!.to : range!.max)}</span>
      </>
    ) : (
      <>
        <span className="pk-act-verb">ALL-IN</span>
        <span className="pk-act-val">{n(short ? legal.allIn!.to : range!.max)}</span>
      </>
    )
  ) : range ? (
    <>
      <span className="pk-act-verb">{range.kind === 'bet' ? t('poker.actions.betVerb') : t('poker.actions.raiseVerb')}</span>
      <span className="pk-act-val">{range.kind === 'bet' ? n(amount) : t('poker.actions.toAmount', { amount: n(amount) })}</span>
    </>
  ) : (
    <span className="pk-act-verb">{t('poker.actions.raiseVerb')}</span>
  );
  const raiseAria = raiseIsAllIn
    ? t('poker.actions.allIn', { amount: n(short ? legal.allIn!.to : range!.max) })
    : range
      ? range.kind === 'bet'
        ? t('poker.actions.bet', { amount: n(amount) })
        : t('poker.actions.raiseTo', { amount: n(amount) })
      : t('poker.actions.raiseVerb');
  // No treino o botão apagado continua tocável (a "tomada dois"); fora dele, desliga.
  const raiseDisabled = locked || (!range && !short) || (!!tutorial && !allowed('raise') && !allowed('bet') && !allowed('allIn'));
  const raiseClickable = !locked && (!!range || short);
  const needHoldRaise = bounty && raiseIsAllIn && armed === 'raise';
  const needHoldCall = bounty && !legal.canCheck && !!legal.call?.allIn;
  const fill = range && range.max > range.min ? ((amount - range.min) / (range.max - range.min)) * 100 : 0;
  const fracKey = range ? potFractionKey(amount, legal) : 'small';

  if (foldAsk) {
    return (
      <div className="pk-actions">
        <div className="pk-confirm">
          <p>{t('poker.actions.foldFree')}</p>
          <div className="pk-btnrow" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="pk-act is-fold" onClick={() => onAct({ type: 'fold' })}>
              <span className="pk-act-verb">{t('poker.actions.foldAnyway')}</span>
            </button>
            <button type="button" className="pk-act is-paper" autoFocus onClick={() => onAct({ type: 'check' })}>
              <span className="pk-act-verb">{t('poker.actions.check')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pk-actions" aria-label={t('poker.actions.region')}>
      <div className="pk-presets">
        {(presets.length ? presets : Array.from({ length: 5 }, (_, i) => ({ key: `x${i}`, to: 0 }))).map((p, i) => (
          <button
            key={p.key}
            type="button"
            className="pk-preset"
            disabled={!presets.length || locked || !!tutorial}
            aria-pressed={presetOn === p.key}
            aria-keyshortcuts={String(i + 1)}
            onClick={() => {
              setTo(p.to);
              setPresetOn(p.key);
            }}
          >
            {presets.length ? t(`poker.actions.presets.${p.key}`) : ''}
          </button>
        ))}
      </div>
      <div className="pk-sliderrow">
        <input
          type="range"
          className="pk-range"
          min={range?.min ?? 0}
          max={range?.max ?? 1}
          step={1}
          value={range ? amount : 0}
          disabled={!range || locked || !!tutorial}
          aria-label={t('poker.actions.sliderLabel')}
          aria-valuetext={range ? t('poker.actions.sliderAria', { amount: n(amount), fraction: t(`poker.actions.fraction.${fracKey}`) }) : undefined}
          style={{ '--fill': `${fill}%` } as React.CSSProperties}
          onChange={(e) => {
            if (!range) return;
            const v = Number(e.target.value);
            // Passo de 1 BB, sem perder o mínimo nem o teto.
            const snapped = v >= range.max ? range.max : v <= range.min ? range.min : Math.round(v / bb) * bb;
            setTo(snapped);
            setPresetOn(null);
          }}
        />
        <input
          ref={amountRef}
          className="pk-amount pk-num"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={t('poker.actions.amountLabel')}
          disabled={!range || locked || !!tutorial}
          value={range ? String(amount) : ''}
          onChange={(e) => {
            const v = Number(e.target.value.replace(/\D/g, ''));
            if (!Number.isNaN(v)) setAmount(v);
          }}
          onBlur={() => range && setTo(amount)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (range) setTo(amount);
            }
          }}
        />
      </div>
      <div className={`pk-btnrow ${leftHanded ? 'is-lefty' : ''}`}>
        <button
          type="button"
          className={`pk-act is-fold ${isSug(['fold']) ? 'is-suggested' : ''}`}
          aria-disabled={locked || !allowed('fold') || undefined}
          aria-keyshortcuts="F"
          onClick={doFold}
        >
          <span className="pk-act-verb">{t('poker.actions.fold')}</span>
        </button>
        {needHoldCall ? (
          <HoldButton
            className={`pk-act is-allin ${isSug(['call']) ? 'is-suggested' : ''}`}
            disabled={locked}
            label={t('poker.actions.holdCall', { amount: n(legal.call!.amount) })}
            onConfirm={() => onAct({ type: 'call' })}
            onKeyboard={() => onConfirmDialog(t('poker.actions.confirmAllIn'), () => onAct({ type: 'call' }))}
          >
            <span className="pk-act-verb">{t('poker.actions.callVerb')} {n(legal.call!.amount)}</span>
            <span className="pk-act-val">{t('poker.actions.hold')}</span>
          </HoldButton>
        ) : (
          <button
            ref={callRef}
            type="button"
            className={`pk-act ${armed === 'call' ? 'is-allin' : 'is-paper'} ${isSug(['check', 'call']) ? 'is-suggested' : ''}`}
            aria-disabled={locked || (legal.canCheck ? !allowed('check') : !allowed('call')) || undefined}
            aria-keyshortcuts="C"
            onClick={doCheckCall}
          >
            {callLabel}
          </button>
        )}
        {needHoldRaise ? (
          <HoldButton
            className={`pk-act is-allin ${isSug(['raise', 'bet', 'allIn']) ? 'is-suggested' : ''}`}
            disabled={raiseDisabled}
            label={raiseAria}
            onConfirm={() => onAct(short ? { type: 'allIn' } : actionFor(range!.max, range!))}
            onKeyboard={() => onConfirmDialog(t('poker.actions.confirmAllIn'), () => onAct(short ? { type: 'allIn' } : actionFor(range!.max, range!)))}
          >
            <span className="pk-act-verb">ALL-IN</span>
            <span className="pk-act-val">{t('poker.actions.hold')}</span>
          </HoldButton>
        ) : (
          <button
            type="button"
            className={`pk-act ${raiseIsAllIn ? 'is-allin' : 'is-gold'} ${isSug(['raise', 'bet', 'allIn']) ? 'is-suggested' : ''}`}
            aria-disabled={raiseDisabled || undefined}
            aria-label={raiseAria}
            aria-keyshortcuts="R"
            onClick={() => raiseClickable && doRaise()}
          >
            {raiseLabel}
          </button>
        )}
      </div>
    </div>
  );
});

export default ActionBar;
