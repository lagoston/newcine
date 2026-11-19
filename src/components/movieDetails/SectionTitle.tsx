import React from 'react';
import { PAPER, PIXEL } from '../../lib/oracleTheme';

// O título de uma seção do menu do título (Sinopse, Assistir em, Elenco).
const STYLE: React.CSSProperties = { ...PIXEL, color: PAPER };

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 style={STYLE} className="text-xl leading-none">{children}</h3>
);

export default SectionTitle;
