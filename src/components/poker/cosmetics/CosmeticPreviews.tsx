import React from 'react';
import { deckLook, tableLook, type PokerMode } from './looks';

// Prévias dos cosméticos do pôquer (Personalizar perfil, cartaz do prêmio,
// placar). A mesa de verdade usa pokerCosmetics() direto em looks.ts.

// Uma carta virada no verso escolhido.
export const CardBack: React.FC<{ deckId?: string | null; className?: string; style?: React.CSSProperties }> = ({ deckId, className = '', style }) => {
  const deck = deckLook(deckId);
  return (
    <span
      aria-hidden
      className={`block aspect-[5/7] rounded-[7%/5%] ${className}`}
      style={{ ...deck.back, boxShadow: `0 0 0 1px ${deck.edge}55, 0 10px 18px -10px rgba(0,0,0,0.9)`, ...style }}
    />
  );
};

// Duas cartas em leque (a mão de quem está na mesa).
export const DeckFan: React.FC<{ deckId?: string | null; className?: string }> = ({ deckId, className = '' }) => (
  <span aria-hidden className={`relative block ${className}`}>
    <CardBack deckId={deckId} className="absolute left-[14%] top-[6%] w-[58%] -rotate-[9deg] origin-bottom" />
    <CardBack deckId={deckId} className="absolute right-[14%] top-[6%] w-[58%] rotate-[7deg] origin-bottom" />
  </span>
);

// Um pedaço do pano, com a borda de couro e o friso de ouro. `children`
// fica por cima (ex.: duas cartas).
export const FeltSwatch: React.FC<{
  tableId?: string | null;
  mode?: PokerMode;
  className?: string;
  children?: React.ReactNode;
}> = ({ tableId, mode = 'free', className = '', children }) => {
  const table = tableLook(tableId, mode);
  return (
    <span aria-hidden className={`relative block overflow-hidden ${className}`} style={{ ...table.felt, ...table.rim }}>
      {children}
    </span>
  );
};
