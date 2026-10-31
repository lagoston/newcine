import React from 'react';
import { useTranslation } from 'react-i18next';
import { RARITY_META, EFFECT_META, posterUrl, type PosterEffect, type PosterRarity } from '../../lib/posterJackpot';
import CollectorMark, { RarityGem, type MarkSize } from './CollectorMark';
import '../../styles/posterJackpot.css';

// Um pôster do Poster Jackpot com o efeito especial por cima (holográfico,
// negativo ou ultra vermelho). O brilho holográfico corre sozinho em todo
// lugar (coleção, biblioteca, menu do título); `animated={false}` deixa
// parado (a fita da roleta, com dezenas de capas passando). `mark` põe a
// marca de colecionador (cristal + número) no canto de baixo à direita.
export type PosterMark = { rarity: PosterRarity; serial: number | null | undefined; size?: MarkSize; bottom?: string };

const PosterArt: React.FC<{
  filePath: string;
  effect?: PosterEffect;
  alt?: string;
  size?: 'w185' | 'w342' | 'w500' | 'w780';
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
  mark?: PosterMark | null;
}> = ({ filePath, effect = 'none', alt = '', size = 'w342', animated = true, className = '', style, loading = 'lazy', mark }) => {
  const effectClass = effect === 'negative' ? 'pj-negative' : effect === 'ultra_red' ? 'pj-ultra' : effect === 'holo' ? 'pj-holo' : '';
  // Quem passa `absolute` posiciona; senão, o pôster é o próprio quadro.
  const position = /\babsolute\b/.test(className) ? '' : 'relative';
  return (
    <span className={`pj-art block ${position} ${effectClass} ${animated ? 'pj-animated' : ''} ${className}`} style={style}>
      <img src={posterUrl(filePath, size)} alt={alt} loading={loading} decoding="async" draggable={false} />
      {effect === 'ultra_red' && (
        <>
          <span aria-hidden className="pj-ultra-tint" />
          <span aria-hidden className="pj-ultra-lift" />
        </>
      )}
      {effect === 'holo' && (
        <>
          <span aria-hidden className="pj-holo-foil" />
          <span aria-hidden className="pj-holo-layer" />
          <span aria-hidden className="pj-holo-sheen" />
        </>
      )}
      {mark && <CollectorMark rarity={mark.rarity} serial={mark.serial} size={mark.size} bottom={mark.bottom} />}
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
      style={{ color: meta.color, background: 'rgba(10,14,44,0.85)', boxShadow: `inset 0 0 0 1px ${meta.color}`, ['--pj-gem-glow' as string]: meta.glow }}
    >
      <RarityGem rarity={rarity} className="w-3 h-3 -ml-0.5" />
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
      style={{ background: effect === 'negative' ? '#F3EAD3' : 'rgba(10,14,44,0.85)', boxShadow: `inset 0 0 0 1px ${meta.color}`, color: effect === 'negative' ? '#120D22' : meta.color }}
    >
      <span className={effect === 'holo' ? 'pj-holo-text' : undefined}>{t(`jackpot.effect.${effect}`)}</span>
    </span>
  );
};

export default PosterArt;
