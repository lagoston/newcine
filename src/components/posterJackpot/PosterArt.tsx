import React from 'react';
import { useTranslation } from 'react-i18next';
import { RARITY_META, EFFECT_META, posterUrl, type PosterEffect, type PosterRarity } from '../../lib/posterJackpot';
import '../../styles/posterJackpot.css';

// Um pôster do Poster Jackpot com o efeito especial por cima (holográfico,
// negativo ou ultra vermelho). `animated`: o brilho holográfico corre (na
// máquina e na coleção); na biblioteca fica parado, para não pesar com
// muitas capas na tela. `frame`: a borda na cor da raridade.
const PosterArt: React.FC<{
  filePath: string;
  effect?: PosterEffect;
  rarity?: PosterRarity;
  alt?: string;
  size?: 'w185' | 'w342' | 'w500' | 'w780';
  animated?: boolean;
  frame?: boolean;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
}> = ({ filePath, effect = 'none', rarity, alt = '', size = 'w342', animated = false, frame = false, className = '', style, loading = 'lazy' }) => {
  const meta = rarity ? RARITY_META[rarity] : null;
  const effectClass = effect === 'negative' ? 'pj-negative' : effect === 'ultra_red' ? 'pj-ultra' : '';
  // Quem passa `absolute` posiciona; senão, o pôster é o próprio quadro.
  const position = /\babsolute\b/.test(className) ? '' : 'relative';
  return (
    <span
      className={`pj-art block ${position} ${effectClass} ${animated ? 'pj-animated' : ''} ${className}`}
      style={{
        ...(frame && meta
          ? {
              boxShadow: `0 0 0 2px ${meta.color}${rarity === 'epic' || rarity === 'legendary' ? `, 0 0 22px -4px ${meta.glow}` : ''}`,
            }
          : null),
        ...style,
      }}
    >
      <img src={posterUrl(filePath, size)} alt={alt} loading={loading} decoding="async" draggable={false} />
      {effect === 'ultra_red' && (
        <>
          <span aria-hidden className="pj-ultra-tint" />
          <span aria-hidden className="pj-ultra-lift" />
        </>
      )}
      {effect === 'holo' && (
        <>
          <span aria-hidden className="pj-holo-layer" />
          <span aria-hidden className="pj-holo-sheen" />
        </>
      )}
    </span>
  );
};

// Selo da raridade ("Lendário") na cor dela.
export const RarityTag: React.FC<{ rarity: PosterRarity; className?: string }> = ({ rarity, className = '' }) => {
  const { t } = useTranslation();
  const meta = RARITY_META[rarity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${className}`}
      style={{ color: meta.color, background: 'rgba(18,13,34,0.82)', boxShadow: `inset 0 0 0 1px ${meta.color}` }}
    >
      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
      {t(`jackpot.rarity.${rarity}`)}
    </span>
  );
};

// Selo do efeito especial ("Holográfico").
export const EffectTag: React.FC<{ effect: PosterEffect; className?: string }> = ({ effect, className = '' }) => {
  const { t } = useTranslation();
  if (effect === 'none') return null;
  const meta = EFFECT_META[effect];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${className}`}
      style={{ background: effect === 'negative' ? '#F3EAD3' : 'rgba(18,13,34,0.82)', boxShadow: `inset 0 0 0 1px ${meta.color}`, color: effect === 'negative' ? '#120D22' : meta.color }}
    >
      <span className={effect === 'holo' ? 'pj-holo-text' : undefined}>{t(`jackpot.effect.${effect}`)}</span>
    </span>
  );
};

export default PosterArt;
