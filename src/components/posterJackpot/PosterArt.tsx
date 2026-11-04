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

type ArtSize = 'w185' | 'w342' | 'w500' | 'w780';

// 04/11/2026 (piscadas na gaveta do Jackpot): os pôsteres que já carregaram
// nesta visita ficam guardados. Trocar de aba na gaveta desmonta a aba
// inteira; quando ela volta, cada <img> é nova. O navegador só entrega uma
// imagem na hora (no mesmo quadro, sem esperar) se ela ainda está viva no
// cache em memória da página — e, sem nenhum <img> apontando para ela, ela
// sai de lá logo. Aí a imagem volta do cache do disco/rede, de forma
// assíncrona (e, com loading="lazy", só depois do observador de "perto da
// tela"): a grade aparecia com os pôsteres vazios (só o efeito por cima, o
// dourado sem a capa) e eles pipocavam 100–600 ms depois, a cada troca.
// Agora: guardamos um Image() de cada pôster carregado (no máximo KEEP, os
// mais recentes; um w342 tem ~30–50 KB), o que mantém a imagem viva na
// memória; o pôster que volta entra com loading="eager" e decoding="sync":
// sai pronto no primeiro quadro. Pôster nunca visto segue como antes (lazy,
// decodificação assíncrona).
const KEEP = 160;
const keptArt = new Map<string, HTMLImageElement>();
const remember = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const src = e.currentTarget.getAttribute('src') || '';
  if (!src) return;
  const kept = keptArt.get(src);
  if (kept) {
    // O mais recente vai para o fim (o primeiro do Map é o que sai).
    keptArt.delete(src);
    keptArt.set(src, kept);
    return;
  }
  const img = new Image();
  img.src = src;
  keptArt.set(src, img);
  if (keptArt.size > KEEP) {
    const oldest = keptArt.keys().next().value;
    if (oldest !== undefined) keptArt.delete(oldest);
  }
};

const PosterArt: React.FC<{
  filePath: string;
  effect?: PosterEffect;
  alt?: string;
  size?: ArtSize;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
  mark?: PosterMark | null;
  // 04/11/2026: um tamanho menor do mesmo pôster, por baixo, enquanto o
  // grande carrega (ex.: o detalhe da coleção abre em w500 com o w342 da
  // grade, que já está no cache, em vez de um quadro vazio que depois pisca).
  placeholderSize?: ArtSize | null;
}> = ({ filePath, effect = 'none', alt = '', size = 'w342', animated = true, className = '', style, loading = 'lazy', mark, placeholderSize = null }) => {
  const effectClass =
    effect === 'negative' ? 'pj-negative' : effect === 'ultra_red' ? 'pj-ultra' : effect === 'holo' ? 'pj-holo' : effect === 'gold' ? 'pj-gold' : '';
  // Quem passa `absolute` posiciona; senão, o pôster é o próprio quadro.
  const position = /\babsolute\b/.test(className) ? '' : 'relative';
  const src = posterUrl(filePath, size);
  const known = keptArt.has(src);
  const low = placeholderSize && placeholderSize !== size ? posterUrl(filePath, placeholderSize) : null;
  return (
    <span className={`pj-art block ${position} ${effectClass} ${animated ? 'pj-animated' : ''} ${className}`} style={style}>
      {low && <img src={low} alt="" aria-hidden loading="eager" decoding={keptArt.has(low) ? 'sync' : 'async'} draggable={false} onLoad={remember} />}
      <img src={src} alt={alt} loading={known ? 'eager' : loading} decoding={known ? 'sync' : 'async'} draggable={false} onLoad={remember} />
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
      {/* Brilho dourado (03/11/2026, Pôster Poker): tom de ouro, a lâmina metálica
          que atravessa o pôster e o friso. Só dos pôsteres do torneio do pôquer. */}
      {effect === 'gold' && (
        <>
          <span aria-hidden className="pj-gold-wash" />
          <span aria-hidden className="pj-gold-grain" />
          <span aria-hidden className="pj-gold-sheen" />
          <span aria-hidden className="pj-gold-rim" />
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
      <span className={effect === 'holo' ? 'pj-holo-text' : effect === 'gold' ? 'pj-gold-text' : undefined}>{t(`jackpot.effect.${effect}`)}</span>
    </span>
  );
};

export default PosterArt;
