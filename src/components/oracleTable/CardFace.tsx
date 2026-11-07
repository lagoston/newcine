import React from 'react';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { INK, PAPER, PIXEL, ORACLE_BY_ID, ratingTone } from '../../lib/oracleTheme';
import { WatchlistMark } from '../PredictedBadge';
import type { MesaCard } from '../../lib/mesa/types';
import PredMark from './PredMark';
import { MoonArc } from './MesaArt';
import { cardTitle, posterSrc } from './mesaText';

// A face da carta (SPEC §2.3), 05/11/2026: igual para todos na v1 (decisão 15).
// Papel PAPER com borda INK em degraus de pixel, o arco da lua no alto, o
// pôster 2:3 no centro e a faixa de 4 px na cor do bicho no pé. No celular
// (110 × 164) a face leva só o pôster e o selo pequeno da nota; título, ano,
// porquê e comentário moram na leitura logo abaixo. No computador a face traz
// também título e ano, e o nome do oráculo na vertical dos dois lados, como na
// carta de verdade. Sobre o creme, todo texto é INK (as cores dos bichos
// reprovam no contraste sobre o creme); a cor do bicho entra só como faixa.

// O olho com a SUA nota (o SeenChip do Clube do Terror), no lugar do selo.
export const SeenChip: React.FC<{ rating: number }> = ({ rating }) => {
  const { t } = useTranslation();
  const tone = ratingTone(rating);
  return (
    <span
      className="inline-flex items-center gap-1 h-[18px] pl-1 pr-1.5 rounded-full"
      style={{ background: 'rgba(18,13,34,0.9)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      role="img"
      aria-label={t('mesa.reading.yourRating', { n: rating })}
    >
      <Eye className="w-[11px] h-[11px]" aria-hidden />
      <span style={{ ...PIXEL, fontSize: 12, lineHeight: 1 }} aria-hidden>
        {rating}
      </span>
    </span>
  );
};

interface CardFaceProps {
  card: MesaCard;
  desktop: boolean;
  // A nota que a pessoa acabou de dar (o olho aparece por 600 ms antes da troca).
  seenRating?: number | null;
  eager?: boolean;
  onPosterReady?: () => void;
  // A quarta carta no celular (46 px): só o pôster, sem selo.
  compact?: boolean;
}

const CardFace: React.FC<CardFaceProps> = ({ card, desktop, seenRating = null, eager = false, onPosterReady, compact = false }) => {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const oracle = ORACLE_BY_ID[card.title.oracle];
  const src = posterSrc(card.title, lang, desktop ? 'w500' : 'w342');
  const mine = seenRating ?? card.my.rating;
  const name = card.seat === 'espelho' ? '' : oracle.name.toUpperCase();
  return (
    <span className="ms-card-face ms-pixel-edge" style={{ background: INK }}>
      <span
        className="absolute inset-[2px] ms-pixel-edge"
        style={{ background: `radial-gradient(ellipse 90% 70% at 50% 35%, #FBF4E0, ${PAPER} 70%)` }}
      >
        <MoonArc width={desktop ? 38 : compact ? 14 : 24} className="absolute left-1/2 -translate-x-1/2" style={{ top: desktop ? '2.4%' : '2.8%' }} />
        {desktop && name && (
          <>
            <span aria-hidden className="ms-vname is-l" style={{ ...PIXEL, color: INK }}>
              {name}
            </span>
            <span aria-hidden className="ms-vname is-r" style={{ ...PIXEL, color: INK }}>
              {name}
            </span>
          </>
        )}
        <span
          className="absolute left-1/2 -translate-x-1/2 overflow-hidden"
          style={{
            top: desktop ? '9.5%' : '11%',
            height: desktop ? '65%' : '82.5%',
            aspectRatio: '2 / 3',
            background: '#1C1433',
            boxShadow: `0 0 0 1.5px ${INK}`,
          }}
        >
          {src && (
            <img
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              loading={eager ? 'eager' : 'lazy'}
              className="absolute inset-0 w-full h-full object-cover select-none"
              onLoad={onPosterReady}
              onError={onPosterReady}
            />
          )}
          {!compact && <span className="absolute left-1 bottom-1 flex">{mine !== null ? <SeenChip rating={mine} /> : <PredMark pred={card.pred} />}</span>}
          {!compact && card.my.in_watchlist && mine === null && (
            <span className="absolute right-1 top-1 scale-[0.8] origin-top-right">
              <WatchlistMark />
            </span>
          )}
        </span>
        {desktop && (
          <span className="absolute inset-x-[12%] text-center" style={{ top: '77.5%', color: INK }}>
            <span className="block line-clamp-2 leading-[1.12]" style={{ ...PIXEL, fontSize: 14 }}>
              {cardTitle(card.title, lang)}
            </span>
            {card.title.year && (
              <span className="block mt-0.5 text-[11px] font-medium" style={{ color: 'rgba(34,27,54,0.72)' }}>
                {card.title.year}
              </span>
            )}
          </span>
        )}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[4px]" style={{ background: oracle.color }} />
      </span>
    </span>
  );
};

export default CardFace;
