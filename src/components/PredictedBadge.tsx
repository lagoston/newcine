import React from 'react';
import { Bookmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FateThread from './FateThread';

// As marcas de um pôster de prateleira.
//
// 14/11/2026 (pedido do Bruno): o selo violeta com o número da nota prevista
// saiu das capas. No lugar, o Fio do Destino (FateThread): uma linha fina na
// base do pôster, na cor da previsão, com uma centelha na posição da nota. O
// alto do pôster ficou só com a marca da Watchlist.

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

// O fio da nota prevista na base e a marca da Watchlist no canto direito do
// alto, quando o título está lá — um não tira o outro (30/10/2026).
export const PosterMarks: React.FC<{ predicted: number | null; inWatchlist?: boolean }> = ({ predicted, inWatchlist }) => (
  <>
    {predicted !== null && <FateThread rating={predicted} />}
    {inWatchlist && (
      <span className="absolute top-1.5 right-1.5 pointer-events-none">
        <WatchlistMark />
      </span>
    )}
  </>
);
