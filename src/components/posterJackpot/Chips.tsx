import React, { useEffect, useId } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { loadJackpotFont } from '../../lib/posterJackpot';
import '../../styles/posterJackpot.css';

// As fichas do Poster Jackpot (01/11/2026). O que era "ticket" virou ficha
// de cassino: a comum é azul-royal com encaixes marfim; a especial é
// orquídea com encaixes dourados. O saldo aparece em fichas de verdade,
// empilhadas num porta-fichas de dois compartimentos.

export type ChipKind = 'normal' | 'special';

// Cores das fichas: corpo, encaixes da borda e o miolo.
export const CHIP_COLORS: Record<ChipKind, { body: string; insert: string; inlay: string; ring: string }> = {
  normal: { body: '#2D4FD8', insert: '#F3EAD3', inlay: '#142066', ring: '#F4C454' },
  special: { body: '#B23AAE', insert: '#FFC83D', inlay: '#4B1F7A', ring: '#FFE8A3' },
};

// A ficha vista de cima: ícone para botões, porta do Hub, missões e
// sussurros.
export const ChipFace: React.FC<{ kind?: ChipKind; className?: string; title?: string }> = ({ kind = 'normal', className = '', title }) => {
  const c = CHIP_COLORS[kind];
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`pj-chip-face ${className}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} focusable="false">
      {title && <title>{title}</title>}
      <defs>
        <radialGradient id={`g${id}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="11.2" fill={c.body} />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x="10.4" y="0.8" width="3.2" height="4.2" rx="0.6" fill={c.insert} transform={`rotate(${i * 60 + 30} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="7.4" fill={c.inlay} stroke={c.ring} strokeWidth="1" />
      {kind === 'special' ? (
        <path d="M12 7.6 C12.4 10.6 13.4 11.6 16.4 12 C13.4 12.4 12.4 13.4 12 16.4 C11.6 13.4 10.6 12.4 7.6 12 C10.6 11.6 11.6 10.6 12 7.6Z" fill={c.ring} />
      ) : (
        <circle cx="12" cy="12" r="3" fill="none" stroke={c.ring} strokeWidth="1.1" strokeDasharray="1.6 1.2" />
      )}
      <circle cx="12" cy="12" r="11.2" fill={`url(#g${id})`} />
    </svg>
  );
};

// Pequeno desvio horizontal de cada ficha na pilha (fica com cara de pilha
// feita à mão, não de régua).
const JITTER = [0, 0.6, -0.5, 0.9, -0.8, 0.4, -0.2, 0.7, -0.6, 0.2];
export const CHIPS_PER_STACK = 10;

// Uma pilha de fichas vista de lado (até 10).
const ChipStack: React.FC<{ kind: ChipKind; count: number; stack: number }> = ({ kind, count, stack }) => {
  const reduceMotion = useReducedMotion();
  return (
    <span className="pj-stack" aria-hidden>
      <AnimatePresence initial={false}>
        {Array.from({ length: count }, (_, i) => (
          <motion.span
            key={`${stack}:${i}`}
            className={`pj-chip pj-chip--${kind} ${(i + stack) % 2 ? 'pj-chip--alt' : ''}`}
            style={{ ['--i' as string]: i, ['--jx' as string]: `${JITTER[(i + stack * 3) % JITTER.length]}px`, zIndex: i + 1 }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -34, scale: 0.92, transition: { duration: 0.42, ease: [0.3, 0, 0.2, 1] } }}
            transition={{ type: 'spring', stiffness: 520, damping: 28 }}
          />
        ))}
      </AnimatePresence>
    </span>
  );
};

// Distribui o saldo em pilhas de 10 (no máximo `stacks` pilhas; o número
// exato fica na plaquinha).
const splitStacks = (count: number, stacks: number) => {
  const shown = Math.min(Math.max(0, count), stacks * CHIPS_PER_STACK);
  const out: number[] = [];
  for (let left = shown; left > 0; left -= CHIPS_PER_STACK) out.push(Math.min(CHIPS_PER_STACK, left));
  return out;
};

const Compartment: React.FC<{
  kind: ChipKind;
  count: number;
  stacks: number;
  selected: boolean;
  available: boolean;
  disabled: boolean;
  onSelect: () => void;
  label: string;
  plate: string;
  className?: string;
}> = ({ kind, count, stacks, selected, available, disabled, onSelect, label, plate, className = '' }) => {
  const piles = splitStacks(count, stacks);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={`pj-rack-slot pj-rack-slot--${kind} ${selected ? 'is-on' : ''} ${available ? '' : 'is-empty'} ${className} ${FOCUS_RING}`}
    >
      <span className="pj-rack-well">
        {piles.length ? (
          piles.map((n, i) => <ChipStack key={i} kind={kind} count={n} stack={i} />)
        ) : (
          <span className={`pj-chip-ghost pj-chip-ghost--${kind}`} aria-hidden />
        )}
      </span>
      <span className="pj-rack-plate" aria-hidden>
        <span className="pj-rack-num">{count}</span>
        <span className="pj-rack-label">{plate}</span>
      </span>
    </button>
  );
};

// O porta-fichas: as fichas comuns à esquerda e as especiais à direita. Tocar
// num compartimento escolhe com qual ficha girar.
const ChipRack: React.FC<{
  normal: number;
  special: number;
  specialAvailable: boolean;
  kind: ChipKind;
  onKind: (kind: ChipKind) => void;
  disabled?: boolean;
  className?: string;
}> = ({ normal, special, specialAvailable, kind, onKind, disabled = false, className = '' }) => {
  const { t } = useTranslation();
  useEffect(() => {
    loadJackpotFont();
  }, []);
  return (
    <div className={`pj-rack ${className}`} role="radiogroup" aria-label={t('jackpot.chips.kind')}>
      <Compartment
        kind="normal"
        count={normal}
        stacks={5}
        selected={kind === 'normal'}
        available={normal > 0}
        disabled={disabled}
        onSelect={() => onKind('normal')}
        label={t('jackpot.chips.normalAria', { count: normal })}
        plate={t('jackpot.chips.normal', { count: normal })}
        className="flex-[1.65]"
      />
      <span className="pj-rack-divider" aria-hidden />
      <Compartment
        kind="special"
        count={special}
        stacks={3}
        selected={kind === 'special'}
        available={specialAvailable}
        disabled={disabled}
        onSelect={() => onKind('special')}
        label={t('jackpot.chips.specialAria', { count: special })}
        plate={t('jackpot.chips.special', { count: special })}
        className="flex-1"
      />
    </div>
  );
};

export default ChipRack;
