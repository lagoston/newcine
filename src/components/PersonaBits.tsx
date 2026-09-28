import React from 'react';
import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';
import { MOOD_BY_KEY, MOOD_BY_LETTER, withMoodAlpha } from '../lib/moods';
import { posterUrl } from '../lib/persona';
import { VELVET, MIST, PIXEL } from '../lib/oracleTheme';

// Peças pequenas da personalidade cinematográfica, usadas no Hub, no
// Perfil, nos perfis da comunidade e nas gavetas.

// O código de 3 letras, cada letra na cor do seu humor.
export const PersonaCode: React.FC<{ code: string; className?: string; style?: React.CSSProperties }> = ({ code, className = '', style }) => (
  <span className={className} style={{ ...PIXEL, ...style }} aria-label={code}>
    {code.split('').map((letter, i) => (
      <span key={`${letter}-${i}`} style={{ color: MOOD_BY_LETTER[letter]?.color ?? MIST }} aria-hidden>
        {letter}
      </span>
    ))}
  </span>
);

// O pôster do filme do personagem da persona.
export const PersonaPoster: React.FC<{
  path: string | null;
  alt?: string;
  className?: string;
  size?: 'w185' | 'w342' | 'w500';
  ring?: string;
  eager?: boolean;
}> = ({ path, alt = '', className = '', size = 'w342', ring, eager = false }) => {
  const src = posterUrl(path, size);
  return (
    <span
      className={`relative block overflow-hidden aspect-[2/3] ${className}`}
      style={{ background: VELVET, boxShadow: ring ? `0 0 0 2px ${ring}` : 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}
    >
      {src ? (
        <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
          <Film className="w-1/3 h-1/3" aria-hidden />
        </span>
      )}
    </span>
  );
};

// Um humor como etiqueta: letra + ícone + nome (e, opcional, a posição).
export const MoodChip: React.FC<{ moodKey: string; rank?: number; size?: 'sm' | 'md' }> = ({ moodKey, rank, size = 'md' }) => {
  const { t } = useTranslation();
  const mood = MOOD_BY_KEY[moodKey];
  if (!mood) return null;
  const Icon = mood.icon;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full ${size === 'sm' ? 'h-7 pl-1 pr-2.5 text-xs' : 'h-9 pl-1.5 pr-3.5 text-sm'} font-medium`}
      style={{ background: withMoodAlpha(mood, 0.12), boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.35)}`, color: '#F3EAD3' }}
    >
      <span
        className={`grid place-items-center rounded-full ${size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'}`}
        style={{ background: withMoodAlpha(mood, 0.22) }}
        aria-hidden
      >
        {rank ? (
          <span style={{ ...PIXEL, color: mood.color }} className={size === 'sm' ? 'text-xs leading-none' : 'text-sm leading-none'}>
            {rank}
          </span>
        ) : (
          <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} style={{ color: mood.color }} />
        )}
      </span>
      <span style={{ ...PIXEL, color: mood.color }} className="leading-none" aria-hidden>
        {mood.letter}
      </span>
      {t(mood.labelKey)}
    </span>
  );
};
