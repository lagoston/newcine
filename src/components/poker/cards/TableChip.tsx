import React from 'react';

// Ficha da mesa (o "cacife", SPEC §7.12): cerâmica com miolo de rolo de filme de
// 6 furos. Cores por valor, nunca o azul-royal nem a orquídea das fichas do
// Jackpot, para ninguém confundir cacife com ficha de verdade.
const TONES: { min: number; body: string; edge: string; core: string }[] = [
  { min: 1000, body: '#D9A12C', edge: '#FFF1C2', core: '#7A5310' },
  { min: 500, body: '#8E1F3A', edge: '#F4D6DD', core: '#4A0D1E' },
  { min: 100, body: '#1B1B22', edge: '#E7E2D4', core: '#3A3A46' },
  { min: 25, body: '#1F9E8A', edge: '#E6FFF9', core: '#0C5146' },
  { min: 0, body: '#EDE6D6', edge: '#8E7F63', core: '#B9AD92' },
];

export const toneFor = (amount: number) => TONES.find((t) => amount >= t.min) ?? TONES[TONES.length - 1];

const TableChip: React.FC<{ amount?: number; size?: number; className?: string }> = ({ amount = 100, size = 18, className = '' }) => {
  const c = toneFor(amount);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`pk-tchip ${className}`} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="11.3" fill={c.body} />
      <circle cx="12" cy="12" r="11.3" fill="none" stroke={c.edge} strokeWidth="1.6" strokeDasharray="3.2 3.1" />
      <circle cx="12" cy="12" r="7.2" fill={c.core} stroke={c.edge} strokeWidth="0.8" />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return <circle key={i} cx={12 + Math.cos(a) * 4.3} cy={12 + Math.sin(a) * 4.3} r="1.25" fill={c.body} />;
      })}
      <circle cx="12" cy="12" r="1.3" fill={c.edge} />
      <ellipse cx="9" cy="7.5" rx="5" ry="2.4" fill="#fff" opacity="0.14" />
    </svg>
  );
};

export default TableChip;
