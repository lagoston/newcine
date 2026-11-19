import React from 'react';
import { NIGHT } from '../../lib/oracleTheme';
import { backdropSize, tmdbImage } from '../../lib/tmdbImage';

// O fundo (backdrop) do filme se dissolvendo na noite, no topo do menu.
const TitleBackdrop: React.FC<{ backdropPath: string | null }> = ({ backdropPath }) => (
  <div className="absolute inset-x-0 top-0 h-64 sm:h-80 overflow-hidden pointer-events-none" aria-hidden>
    {backdropPath ? (
      <img
        // 19/11/2026 (Reborn, onda 2b): no celular o fundo vem em w780 (≈53 kB
        // e 1,4 MB decodificado) em vez de w1280 (≈140 kB e 3,7 MB): ele fica
        // a 45% de opacidade sob o degradê
        src={tmdbImage(backdropPath, backdropSize())}
        alt=""
        decoding="async"
        className="w-full h-full object-cover opacity-45"
      />
    ) : (
      <div className="w-full h-full" style={{ background: 'radial-gradient(ellipse 80% 70% at 70% 0%, rgba(139,92,246,0.28), transparent 70%)' }} />
    )}
    <div
      className="absolute inset-0"
      style={{ background: `linear-gradient(to bottom, rgba(18,13,34,0.25) 0%, rgba(18,13,34,0.7) 55%, ${NIGHT} 100%)` }}
    />
  </div>
);

export default React.memo(TitleBackdrop);
