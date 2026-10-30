import React from 'react';
import { Bookmark, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PIXEL } from '../lib/oracleTheme';

// O selo violeta da nota prevista, sem posição (para entrar numa fileira de
// selos).
export const PredictedPill: React.FC<{ rating: number }> = ({ rating }) => {
  const { t } = useTranslation();
  return (
    <span
      className="inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
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

// A marca da Watchlist no pôster: o círculo azul com o marcador, o mesmo do
// Ritual dos eventos sazonais.
export const WatchlistMark: React.FC = () => {
  const { t } = useTranslation();
  return (
    <span className="grid place-items-center w-6 h-6 shrink-0 rounded-full bg-sky-500/95 text-white shadow-lg ring-1 ring-white/20" title={t('home.desk.inWatchlist')}>
      <Bookmark className="w-3.5 h-3.5 fill-current" aria-hidden />
      <span className="sr-only">{t('home.desk.inWatchlist')}</span>
    </span>
  );
};

// O canto de cima do pôster: a marca da Watchlist (quando o título está lá) e
// o selo da nota prevista, lado a lado — um não tira o outro (30/10/2026).
export const PosterTopBadges: React.FC<{ predicted: number | null; inWatchlist?: boolean }> = ({ predicted, inWatchlist }) => {
  if (predicted === null && !inWatchlist) return null;
  return (
    <span className="absolute top-1.5 left-1.5 right-1.5 flex flex-wrap items-center gap-1 pointer-events-none">
      {inWatchlist && <WatchlistMark />}
      {predicted !== null && <PredictedPill rating={predicted} />}
    </span>
  );
};

// Selo da nota prevista no canto do pôster (prateleiras dos oráculos e
// Watchlist).
const PredictedBadge: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="absolute top-1.5 left-1.5">
    <PredictedPill rating={rating} />
  </span>
);

export default PredictedBadge;
