import React from 'react';

// Cores do Clube do Terror: a cripta (um preto puxado para o vinho, não o
// violeta-noite do resto do site), a luz de vela e o sangue seco. O texto
// continua no papel creme do CineOracle; títulos em Pixelify, como no site.
// Contrastes conferidos contra CRYPT: BONE 16:1, ASH 8:1, BLOOD_TEXT 5,8:1,
// CANDLE 11:1.
export const CRYPT = '#0F0811';
export const CRYPT_RAISED = '#1B0F1A';
export const OXBLOOD = '#8E1B2B';
export const BLOOD_TEXT = '#EE7272';
export const CANDLE = '#FFB547';
export const BONE = '#F3EAD3';
export const ASH = '#B9A9B4';

export const CRYPT_BACKGROUND = [
  'radial-gradient(60% 38% at 12% 0%, rgba(255,181,71,0.13), transparent 70%)',
  'radial-gradient(70% 45% at 100% 100%, rgba(142,27,43,0.22), transparent 70%)',
  CRYPT,
].join(', ');

// O caixão da Deadly Sleeping: a marca da sala (porta no Oráculo, portal no
// perfil, entrada da página).
export const COFFIN_PATH = 'M13 2 H27 L36 17 L27 62 H13 L4 17 Z';

export const CoffinMark: React.FC<{ className?: string; color?: string; fill?: string; strokeWidth?: number }> = ({
  className = 'w-6 h-9',
  color = CANDLE,
  fill = 'none',
  strokeWidth = 3,
}) => (
  <svg viewBox="0 0 40 64" className={className} aria-hidden>
    <path d={COFFIN_PATH} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <path d="M15.5 8 H24.5 L30 17.5 L24 55 H16 L10 17.5 Z" fill="none" stroke={color} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" opacity={0.45} />
  </svg>
);
