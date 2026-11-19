import React from 'react';
import { NIGHT } from '../../lib/oracleTheme';

// O fundo (backdrop) do filme se dissolvendo na noite, no topo do menu.
const TitleBackdrop: React.FC<{ backdropPath: string | null }> = ({ backdropPath }) => (
  <div className="absolute inset-x-0 top-0 h-64 sm:h-80 overflow-hidden pointer-events-none" aria-hidden>
    {backdropPath ? (
      <img
        src={`https://image.tmdb.org/t/p/w1280${backdropPath}`}
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
