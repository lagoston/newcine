import React from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PIXEL } from '../lib/oracleTheme';
import { formatChance, isMasterpieceCandidate } from '../lib/prediction';

// Selo da nota prevista no canto do pôster (prateleiras dos oráculos e
// Watchlist). Violeta normalmente; dourado, com brilho, quando a chance de o
// título virar um 9 ou 10 da pessoa passa de 40% (ver lib/prediction).
const PredictedBadge: React.FC<{ rating: number; chance?: number | null }> = ({ rating, chance }) => {
  const { t } = useTranslation();
  const goldChance = isMasterpieceCandidate(chance) ? chance : null;
  const gold = goldChance !== null;
  const label =
    goldChance !== null
      ? t('oracle.masterpiece.badgeWithChance', { rating, chance: formatChance(goldChance) })
      : `${t('home.desk.predictedForYou')}: ${rating}`;

  return (
    <span
      className={`absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full shadow-lg ring-1 ${
        gold ? 'bg-amber-300 text-amber-950 ring-amber-100/70' : 'bg-violet-600/95 text-white ring-white/20'
      }`}
      title={label}
    >
      {gold ? <Sparkles className="w-3 h-3" aria-hidden /> : <Wand2 className="w-3 h-3" aria-hidden />}
      <span className="sr-only">{label}</span>
      <span style={PIXEL} className="text-sm leading-none" aria-hidden>
        {rating}
      </span>
    </span>
  );
};

export default PredictedBadge;
