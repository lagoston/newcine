import React from 'react';
import { Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PIXEL } from '../lib/oracleTheme';

// Selo da nota prevista no canto do pôster (prateleiras dos oráculos e
// Watchlist).
const PredictedBadge: React.FC<{ rating: number }> = ({ rating }) => {
  const { t } = useTranslation();
  return (
    <span
      className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
      title={t('home.desk.predictedForYou')}
    >
      <Wand2 className="w-3 h-3" aria-hidden />
      <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
      <span style={PIXEL} className="text-sm leading-none">
        {rating}
      </span>
    </span>
  );
};

export default PredictedBadge;
