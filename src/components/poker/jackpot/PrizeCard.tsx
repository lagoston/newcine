import React from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { RarityTag } from '../../posterJackpot/PosterArt';
import { PAPER } from '../../../lib/oracleTheme';
import type { PokerTeaserPrize } from '../../../lib/posterJackpot';
import CarrierFace from './CarrierFace';
import PrizeArt from './PrizeArt';
import { isPokerOracle, prizeNameOf } from './pokerMeta';
import '../../../styles/pokerEntry.css';

// O cartão do Prêmio de Hoje, em veludo vinho (a cor da mesa valendo). Usado
// na aba Pôquer da gaveta e pronto para o lobby (pacote D1):
//   <PrizeCard prize={…} carrier="cypher" stars={3} status="Tentativa 1 de 3">
//     <button>…</button>
//   </PrizeCard>
// `compact` encolhe a arte (76 px) para caber na gaveta em 360 px.

export const DifficultyStars: React.FC<{ stars: number; className?: string }> = ({ stars, className = '' }) => {
  const { t } = useTranslation();
  const filled = Math.max(0, Math.min(4, Math.round(stars)));
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} role="img" aria-label={t('pokerEntry.panel.difficultyAria', { count: filled })}>
      <span className="text-[12px]" style={{ color: '#F6DCE2' }} aria-hidden>
        {t('pokerEntry.panel.difficulty')}
      </span>
      <span className="inline-flex gap-[2px]" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Star
            key={i}
            className="w-3.5 h-3.5"
            strokeWidth={1.8}
            style={i < filled ? { color: '#F4C454', fill: '#F4C454' } : { color: 'rgba(246,220,226,0.45)' }}
          />
        ))}
      </span>
    </span>
  );
};

export const CarrierLine: React.FC<{ carrier: string | null | undefined; className?: string }> = ({ carrier, className = '' }) => {
  const { t } = useTranslation();
  if (!carrier) return null;
  const key = isPokerOracle(carrier) ? carrier : 'other';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12.5px] ${className}`} style={{ color: '#F6DCE2' }}>
      <CarrierFace id={carrier} size={20} wanted />
      {t(`pokerEntry.oracles.${key}.with`)}
    </span>
  );
};

const PrizeCard: React.FC<{
  prize: PokerTeaserPrize;
  carrier: string | null;
  stars: number;
  status?: React.ReactNode;
  compact?: boolean;
  children?: React.ReactNode;
  className?: string;
  headingId?: string;
}> = ({ prize, carrier, stars, status, compact = false, children, className = '', headingId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const name = prizeNameOf(prize, isPt);
  return (
    <section className={`pe-velvet relative overflow-hidden rounded-[20px] ${compact ? 'p-3.5' : 'p-4 sm:p-5'} ${className}`} aria-labelledby={headingId}>
      <div className="relative flex items-start gap-3.5">
        <PrizeArt prize={prize} className={compact ? 'w-[76px] shrink-0' : 'w-[96px] sm:w-[112px] shrink-0'} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[12px] font-semibold" style={{ color: '#FFE8A3' }}>
            {t('pokerEntry.panel.prizeTitle')}
          </p>
          <h3 id={headingId} className={`mt-1 font-semibold leading-snug ${compact ? 'text-[16px]' : 'text-[18px]'}`} style={{ color: PAPER }}>
            {name}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <RarityTag rarity={prize.rarity} />
            <CarrierLine carrier={carrier} />
          </div>
          <DifficultyStars stars={stars} className="mt-2" />
          {status ? (
            <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: '#F6DCE2' }}>
              {status}
            </p>
          ) : null}
        </div>
      </div>
      {children ? <div className="relative mt-3.5">{children}</div> : null}
    </section>
  );
};

export default PrizeCard;
