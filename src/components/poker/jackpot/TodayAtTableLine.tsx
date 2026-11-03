import React from 'react';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING, PAPER } from '../../../lib/oracleTheme';
import type { PokerTeaser } from '../../../lib/posterJackpot';
import { ChipFace } from '../../posterJackpot/Chips';
import CarrierFace from './CarrierFace';
import { useBountyLaunch } from './useBountyLaunch';
import { isPokerOracle, prizeNameOf } from './pokerMeta';
import '../../../styles/pokerEntry.css';

// "Hoje na mesa: Baralho Noir, com a Cobra." (veredito Q5; SPEC §7.1 item 2)
// Na aba Missões, logo depois da ficha do dia: a ficha que acabou de cair já
// tem para onde ir. O rosto é o de quem carrega o prêmio. [Usar a ficha] vai
// direto à mesa valendo. Some se a pessoa já levou o prêmio, se as
// tentativas de hoje acabaram ou se não há prêmio.
export const shouldShowTodayLine = (teaser: PokerTeaser | null | undefined): teaser is PokerTeaser =>
  !!teaser && !!teaser.prize && !teaser.wonToday && (teaser.active || teaser.attemptsUsed < teaser.maxAttempts);

const TodayAtTableLine: React.FC<{ teaser: PokerTeaser; className?: string }> = ({ teaser, className = '' }) => {
  const { t, i18n } = useTranslation();
  const { launch, gateElement } = useBountyLaunch(teaser);
  if (!shouldShowTodayLine(teaser)) return null;
  const isPt = i18n.language.startsWith('pt');
  const carrierKey = isPokerOracle(teaser.carrier) ? teaser.carrier : 'other';
  const line = t('pokerEntry.today', { prize: prizeNameOf(teaser.prize, isPt), carrier: t(`pokerEntry.oracles.${carrierKey}.with`) });

  return (
    <div className={`pe-velvet relative flex items-center gap-3 rounded-2xl pl-3 pr-2.5 py-2.5 ${className}`}>
      <CarrierFace id={teaser.carrier} size={40} wanted />
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: PAPER }}>
        {line}
      </p>
      <button
        type="button"
        onClick={launch}
        className={`pj-spin shrink-0 inline-flex items-center gap-1.5 h-10 pl-2.5 pr-3.5 rounded-full text-[13px] font-bold ${FOCUS_RING}`}
      >
        <ChipFace className="relative w-[18px] h-[18px]" />
        <span className="relative">{teaser.active ? t('pokerEntry.panel.continue') : t('pokerEntry.useChip')}</span>
      </button>
      {gateElement}
    </div>
  );
};

export default TodayAtTableLine;
