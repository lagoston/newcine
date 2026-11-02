import type React from 'react';

// O aviso (react-hot-toast) no mundo do Poster Jackpot: o azul da noite da
// roleta com o fio de ouro. Usado pela ficha voadora e pelo presente da
// sexta-feira 13 (02/11/2026). O texto usa as classes fc-toast de
// styles/flyingChip.css.
export const JACKPOT_TOAST_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1a2164, #0b0f36)',
  color: '#FFF4D6',
  border: '1px solid rgba(244, 196, 84, 0.65)',
  borderRadius: 16,
  boxShadow: '0 14px 34px -14px rgba(0, 0, 0, 0.9), 0 0 24px -8px rgba(244, 196, 84, 0.55)',
  padding: '10px 14px',
  maxWidth: 360,
};
