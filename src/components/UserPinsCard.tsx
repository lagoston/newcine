import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUnlockedTagPins } from '../hooks/useUnlockedTagPins';
import { VELVET, PAPER, MIST, PIXEL, tagCategoryStyle } from '../lib/oracleTheme';

interface UserPinsCardProps {
  userId: string;
  // Título do cartão (ex.: "Pins de @fulano"). Sem ele, "Pins de tags".
  title?: string;
  className?: string;
}

// Pins de tags desbloqueados por outra pessoa, no perfil dela — emojis
// pequenos lado a lado, cada um na cor da sua categoria (a mesma do Tag
// Pins). O nome aparece ao passar o mouse e é lido por leitores de tela.
// Sem pins, o cartão não aparece.
const UserPinsCard: React.FC<UserPinsCardProps> = ({ userId, title, className = '' }) => {
  const { t } = useTranslation();
  const { pins, loading } = useUnlockedTagPins(userId);

  if (!loading && pins.length === 0) return null;

  return (
    <div className={`rounded-2xl ring-1 ring-white/10 p-5 sm:p-6 ${className}`} style={{ background: VELVET }}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
          {title ?? t('profile.tagPins')}
        </h3>
        {!loading && (
          <span className="text-sm tabular-nums" style={{ color: MIST }}>
            {pins.length}
          </span>
        )}
      </div>

      {loading ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-busy="true">
          {[...Array(8)].map((_, i) => (
            <li key={i} className="w-10 h-10 rounded-xl bg-white/10 animate-pulse" />
          ))}
        </ul>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {pins.map((pin, idx) => (
            <li
              key={`${pin.name}-${idx}`}
              title={pin.name}
              className={`grid place-items-center w-10 h-10 rounded-xl text-xl leading-none ${tagCategoryStyle(pin.category).pill}`}
            >
              <span aria-hidden>{pin.emoji}</span>
              <span className="sr-only">{pin.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default UserPinsCard;
