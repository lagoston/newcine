import React from 'react';
import { Film } from 'lucide-react';
import { MOOD_BY_LETTER, showLetter } from '../../lib/moods';
import type { WorldTitle } from '../../lib/personaWorld';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET, ratingTone } from '../../lib/oracleTheme';
import { GOLD, fmtRating } from './draw';

import EquippedCover from '../EquippedCover';
// As peças pequenas do modal "Sua Persona", usadas por todas as seções dele
// (15/11/2026: o corpo do modal foi dividido em seções, uma por arquivo).

export const Heading: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 style={{ ...PIXEL, color: PAPER }} className={`text-lg leading-tight ${className}`}>
    {children}
  </h3>
);

export const Note: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <p className={`text-[13px] leading-relaxed ${className}`} style={{ color: MIST }}>
    {children}
  </p>
);

// a letra do humor num quadradinho (o "+" creme é o Arquivo, os títulos de fora)
export const Tile: React.FC<{ letter: string | null; small?: boolean }> = ({ letter, small = false }) => {
  const color = letter ? (MOOD_BY_LETTER[letter]?.color ?? MIST) : PAPER;
  return (
    <span
      aria-hidden
      className={`grid place-items-center shrink-0 leading-none ${small ? 'w-[22px] h-[22px] rounded-[5px] text-[13px]' : 'w-7 h-7 rounded-[7px] text-[17px]'}`}
      style={{ ...PIXEL, color, background: '#130D24', boxShadow: `inset 0 0 0 1.5px ${color}` }}
    >
      {letter ? showLetter(letter) : '+'}
    </span>
  );
};

export const Bar: React.FC<{ value: number; color?: string; tall?: boolean; label?: string }> = ({ value, color = GOLD, tall = false, label }) => (
  <span
    className={`block flex-1 overflow-hidden rounded-[3px] ${tall ? 'h-3' : 'h-2'}`}
    style={{ background: 'rgba(243,234,211,0.1)' }}
    role={label ? 'progressbar' : undefined}
    aria-valuemin={label ? 0 : undefined}
    aria-valuemax={label ? 100 : undefined}
    aria-valuenow={label ? Math.floor(value * 100) : undefined}
    aria-label={label}
  >
    <span className="block h-full" style={{ width: `${Math.floor(value * 100)}%`, background: color }} />
  </span>
);

// um pôster pequeno que abre o título, com a nota no canto
export const TitleThumb: React.FC<{ title: WorldTitle; name: string; onOpen: (title: WorldTitle) => void; opening?: boolean }> = ({ title, name, onOpen, opening = false }) => {
  const tone = ratingTone(Math.round(title.rating));
  return (
    <button
      type="button"
      onClick={() => onOpen(title)}
      className={`group relative block w-full aspect-[2/3] min-w-0 min-h-0 rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/30 transition ${FOCUS_RING}`}
      style={{ background: VELVET }}
      aria-label={`${name}, ${fmtRating(title.rating)}`}
      title={name}
    >
      {title.poster ? (
        <EquippedCover id={title.id} type={title.type} size="w185">
          <img src={`https://image.tmdb.org/t/p/w185${title.poster}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        </EquippedCover>
      ) : (
        <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
          <Film className="w-5 h-5" aria-hidden />
        </span>
      )}
      <span
        className="absolute bottom-1 right-1 h-5 min-w-[20px] px-1 grid place-items-center rounded-md text-[12px] leading-none"
        style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      >
        {fmtRating(title.rating)}
      </span>
      {opening && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
    </button>
  );
};
