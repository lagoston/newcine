import React from 'react';
import RatingSliderSheet from './RatingSliderSheet';

interface RateMenuSheetProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onRate: (rating: number | null) => Promise<void>;
  showMoveToWatchlist?: boolean;
  /** Nota atual do filme, se já avaliado — o slider abre nesse valor em
      vez de sempre começar em 5, já que aqui o filme normalmente já tem
      uma nota que está sendo ajustada, não zerada do início. */
  currentRating?: number;
}

// Wrapper fino sobre RatingSliderSheet — mesma base visual do
// QuickAddMenu, adaptada pro contrato específico de "reavaliar um filme
// que já está na biblioteca": watchlist aqui significa "mover pra
// watchlist removendo a nota" (onRate(null)), e o botão de watchlist só
// aparece quando showMoveToWatchlist=true — telas que já SÃO a própria
// watchlist passam false, já que "mover pra watchlist" um filme que já
// está lá não faz sentido.
const RateMenuSheet: React.FC<RateMenuSheetProps> = ({
  movieTitle,
  isOpen,
  onClose,
  onRate,
  showMoveToWatchlist = true,
  currentRating
}) => {
  return (
    <RatingSliderSheet
      movieTitle={movieTitle}
      isOpen={isOpen}
      onClose={onClose}
      onConfirmRating={(rating) => onRate(rating)}
      onAddToWatchlist={showMoveToWatchlist ? () => onRate(null) : undefined}
      initialRating={currentRating ?? 5}
      watchlistLabel={{ pt: 'Mover para Watchlist', en: 'Move to Watchlist' }}
    />
  );
};

export default RateMenuSheet;