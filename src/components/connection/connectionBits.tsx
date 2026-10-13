import React from 'react';
import { Film } from 'lucide-react';
import UserAvatar, { type AvatarUser } from '../UserAvatar';
import { formatRating } from './connectionFormat';
import { posterUrl } from '../../lib/persona';
import { VELVET, MIST, PIXEL, ratingTone, withAlpha } from '../../lib/oracleTheme';

// Peças pequenas da gaveta Conexão (13/10/2026).

// Bolha "avatar + nota": o avatar é a legenda (de quem é a nota), como nas
// bolhas de amigos dos pôsteres. A nota vem escrita, na cor da faixa.
export const ScoreBubble: React.FC<{
  user: AvatarUser;
  value: number;
  language: string;
  decimals?: boolean;
  size?: 'sm' | 'md';
  // "previsto" (a nota é uma previsão, a pessoa ainda não viu).
  note?: string;
  label: string;
}> = ({ user, value, language, decimals = false, size = 'md', note, label }) => {
  const tone = ratingTone(Math.max(0, Math.min(10, Math.round(value))));
  const sm = size === 'sm';
  return (
    <span
      className={`inline-flex items-center shrink-0 rounded-full leading-none ${sm ? 'h-6 gap-[3px] pl-[3px] pr-[5px]' : 'h-8 gap-1.5 pl-1 pr-2.5'}`}
      style={{ background: withAlpha(tone.color, 0.1), boxShadow: `inset 0 0 0 1px ${withAlpha(tone.color, 0.32)}` }}
      aria-label={label}
      title={label}
    >
      <UserAvatar user={user} size={sm ? 16 : 24} plain />
      <span style={{ ...PIXEL, color: tone.color }} className={`tabular-nums ${sm ? 'text-[13px]' : 'text-[15px]'}`} aria-hidden>
        {formatRating(value, language, decimals)}
      </span>
      {note && (
        <span className="text-[11px]" style={{ color: MIST }} aria-hidden>
          {note}
        </span>
      )}
    </span>
  );
};

// Pôster de um título (sem o botão em volta: quem usa decide).
export const PosterArt: React.FC<{ path: string | null; size?: 'w185' | 'w342'; className?: string; rounded?: string }> = ({
  path,
  size = 'w185',
  className = '',
  rounded = 'rounded-lg',
}) => {
  const src = posterUrl(path, size);
  return (
    <span
      className={`relative block overflow-hidden aspect-[2/3] ${rounded} ${className}`}
      style={{ background: VELVET, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
          <Film className="w-1/3 h-1/3" aria-hidden />
        </span>
      )}
    </span>
  );
};
