import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Rarity } from '../../../lib/poker/types';
import { RARITY_META } from '../../../lib/posterJackpot';

// O cartaz de "Procurado" (02 + 05): o prêmio do dia como objeto na mesa, preso
// ao canto do retrato de quem o carrega, com o brilho da raridade.
const WantedPoster: React.FC<{ rarity: Rarity; size?: number }> = ({ rarity, size = 26 }) => {
  const { t } = useTranslation();
  const meta = RARITY_META[rarity];
  return (
    <svg
      viewBox="0 0 26 32"
      width={size}
      height={(size * 32) / 26}
      role="img"
      aria-label={t('poker.table.prizeHere')}
      style={{ filter: `drop-shadow(0 0 5px ${meta.glow}) drop-shadow(0 2px 2px rgba(0,0,0,0.7))`, overflow: 'visible' }}
    >
      <path d="M1.5 1.5h23l-.6 28.6-11-1.2-11.2 1.6z" fill="#E9D7AE" stroke="#7A5A2A" strokeWidth="1" />
      <rect x="4" y="4" width="18" height="3" rx="0.6" fill="#5A3E1A" />
      <rect x="5" y="9" width="16" height="13" rx="1" fill={meta.color} stroke="#5A3E1A" strokeWidth="1" />
      <path d="M13 11.2l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#FFF7DA" />
      <rect x="6" y="24" width="14" height="1.6" rx="0.6" fill="#5A3E1A" opacity="0.8" />
      <circle cx="13" cy="2.4" r="1.2" fill="#B23A2A" />
    </svg>
  );
};

export default WantedPoster;
