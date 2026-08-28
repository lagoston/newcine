import React from 'react';
import RatingSliderSheet from './RatingSliderSheet';

interface QuickAddMenuProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rating?: number) => Promise<void>;
}

// Wrapper fino sobre RatingSliderSheet — toda a lógica visual (slider,
// cores, animações) mora num lugar só. Esse componente só adapta o
// contrato específico de "adicionar um filme novo": watchlist aqui
// significa "adicionar sem nota" (onAdd(undefined)).
const QuickAddMenu: React.FC<QuickAddMenuProps> = ({ movieTitle, isOpen, onClose, onAdd }) => {
  return (
    <RatingSliderSheet
      movieTitle={movieTitle}
      isOpen={isOpen}
      onClose={onClose}
      onConfirmRating={(rating) => onAdd(rating)}
      onAddToWatchlist={() => onAdd(undefined)}
      watchlistLabel={{ pt: 'Só quero assistir depois - Watchlist', en: "I'll just watch it later - Watchlist" }}
    />
  );
};

export default QuickAddMenu;