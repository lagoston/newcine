import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RARITY_META, loadJackpotFont, type PosterRarity } from '../../lib/posterJackpot';
import '../../styles/posterJackpot.css';

// A marca de colecionador dos pôsteres do Poster Jackpot (31/10/2026): o
// cristal da raridade "cravado" numa plaquinha de vidro escuro com filete
// dourado, e o número do pôster dentro da raridade (Lendário nº 007).
//
// Cada raridade tem um cristal de lapidação própria — dá para reconhecer
// pela forma, não só pela cor:
//   • Comum: cabochão (redondo e liso), prata;
//   • Raro: lapidação esmeralda (octógono com mesa), azul;
//   • Épico: hexágono facetado, roxo;
//   • Lendário: brilhante (o diamante clássico), dourado, com um brilho que
//     acende de tempos em tempos.

export type MarkSize = 'xs' | 'sm' | 'md' | 'lg';

export const formatSerial = (serial: number | null | undefined) => (serial ? String(serial).padStart(3, '0') : '—');

// Mistura uma cor "#RRGGBB" com branco (amount > 0) ou preto (amount < 0).
const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
};

export const RarityGem: React.FC<{ rarity: PosterRarity; className?: string; glint?: boolean }> = ({ rarity, className = '', glint = false }) => {
  const base = RARITY_META[rarity].color;
  const light = shade(base, 0.45);
  const lighter = shade(base, 0.7);
  const mid = shade(base, 0.15);
  const dark = shade(base, -0.28);
  const darker = shade(base, -0.45);

  return (
    <svg viewBox="0 0 24 24" className={`pj-gem ${className}`} aria-hidden focusable="false">
      {rarity === 'common' && (
        <>
          <circle cx="12" cy="12" r="9.5" fill={dark} />
          <circle cx="12" cy="11.2" r="8.6" fill={base} />
          <ellipse cx="9.4" cy="8.6" rx="4.4" ry="3" fill={lighter} opacity="0.85" />
          <ellipse cx="14.5" cy="16.2" rx="4.6" ry="2.2" fill={darker} opacity="0.35" />
        </>
      )}
      {rarity === 'rare' && (
        <>
          <polygon points="7,2.5 17,2.5 21.5,7 21.5,17 17,21.5 7,21.5 2.5,17 2.5,7" fill={base} />
          <polygon points="7,2.5 17,2.5 15,7 9,7" fill={lighter} />
          <polygon points="2.5,7 7,9 7,15 2.5,17" fill={light} />
          <polygon points="21.5,7 21.5,17 17,15 17,9" fill={dark} />
          <polygon points="7,21.5 17,21.5 15,17 9,17" fill={darker} />
          <polygon points="9,7 15,7 17,9 17,15 15,17 9,17 7,15 7,9" fill={mid} />
          <polygon points="9,7 15,7 13.5,9.5 10.5,9.5" fill={lighter} opacity="0.7" />
        </>
      )}
      {rarity === 'epic' && (
        <>
          <polygon points="12,1.5 21.5,7 21.5,17 12,22.5 2.5,17 2.5,7" fill={base} />
          <polygon points="12,1.5 2.5,7 7.5,9.5 12,7" fill={light} />
          <polygon points="12,1.5 21.5,7 16.5,9.5 12,7" fill={lighter} />
          <polygon points="21.5,7 21.5,17 16.5,14.5 16.5,9.5" fill={mid} />
          <polygon points="21.5,17 12,22.5 12,17 16.5,14.5" fill={darker} />
          <polygon points="12,22.5 2.5,17 7.5,14.5 12,17" fill={dark} />
          <polygon points="2.5,17 2.5,7 7.5,9.5 7.5,14.5" fill={base} />
          <polygon points="12,7 16.5,9.5 16.5,14.5 12,17 7.5,14.5 7.5,9.5" fill={light} opacity="0.9" />
        </>
      )}
      {rarity === 'legendary' && (
        <>
          <polygon points="6,3 18,3 23,9 12,22 1,9" fill={base} />
          <polygon points="6,3 9,9 1,9" fill={light} />
          <polygon points="6,3 18,3 15,9 9,9" fill={lighter} />
          <polygon points="18,3 23,9 15,9" fill={mid} />
          <polygon points="1,9 9,9 12,22" fill={dark} />
          <polygon points="9,9 15,9 12,22" fill={base} />
          <polygon points="15,9 23,9 12,22" fill={darker} />
          <polygon points="8.2,4.2 11,4.2 9.6,7.2" fill="#FFFFFF" opacity="0.75" />
        </>
      )}
      {glint && (
        <path className="pj-gem-glint" d="M19 0.5 C19.4 3 20 3.6 22.5 4 C20 4.4 19.4 5 19 7.5 C18.6 5 18 4.4 15.5 4 C18 3.6 18.6 3 19 0.5Z" fill="#FFFFFF" />
      )}
    </svg>
  );
};

// A plaquinha no canto do pôster (canto de baixo à direita). `bottom` sobe a
// plaquinha quando há algo embaixo (a barrinha de progresso das séries).
const CollectorMark: React.FC<{
  rarity: PosterRarity;
  serial: number | null | undefined;
  size?: MarkSize;
  bottom?: string;
  className?: string;
}> = ({ rarity, serial, size = 'sm', bottom, className = '' }) => {
  const { t } = useTranslation();
  useEffect(() => {
    loadJackpotFont();
  }, []);
  if (!serial) return null;
  const style: Record<string, string> = { '--pj-gem-glow': RARITY_META[rarity].glow };
  if (bottom) style['--pj-mark-b'] = bottom;
  return (
    <span
      className={`pj-mark pj-mark--${size} ${className}`}
      style={style as React.CSSProperties}
      role="img"
      aria-label={t('jackpot.mark.label', { rarity: t(`jackpot.rarity.${rarity}`), number: serial })}
    >
      <RarityGem rarity={rarity} glint={rarity === 'legendary'} />
      {size === 'lg' && <span className="pj-mark-no" aria-hidden>Nº</span>}
      <span className="pj-mark-num" aria-hidden>{formatSerial(serial)}</span>
    </span>
  );
};

// "Lendário · Nº 007" — a linha sob o pôster revelado e no detalhe da coleção.
// `gem={false}` quando o selo da raridade (com o cristal) já está logo ao lado.
export const SerialLine: React.FC<{ rarity: PosterRarity; serial: number | null | undefined; gem?: boolean; className?: string }> = ({
  rarity,
  serial,
  gem = true,
  className = '',
}) => {
  const { t } = useTranslation();
  useEffect(() => {
    loadJackpotFont();
  }, []);
  if (!serial) return null;
  return (
    <span className={`pj-serial-line ${className}`} style={{ ['--pj-gem-glow' as string]: RARITY_META[rarity].glow }}>
      {gem && <RarityGem rarity={rarity} glint={rarity === 'legendary'} />}
      <span style={{ color: RARITY_META[rarity].color }}>{t('jackpot.mark.number', { number: formatSerial(serial) })}</span>
    </span>
  );
};

export default CollectorMark;
