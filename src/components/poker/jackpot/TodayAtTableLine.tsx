import React from 'react';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING, PAPER } from '../../../lib/oracleTheme';
import type { PokerTeaser } from '../../../lib/posterJackpot';
import { ChipFace } from '../../posterJackpot/Chips';
import CarrierFace from './CarrierFace';
import { useBountyLaunch } from './useBountyLaunch';
import { isPokerOracle, prizeNameOf, shouldShowTodayLine } from './pokerMeta';
import '../../../styles/pokerEntry.css';

// "Hoje na mesa: Baralho Noir, com a Cobra." (veredito Q5; SPEC §7.1 item 2)
// Na aba Missões, quando a ficha do dia acabou de cair: a ficha já tem para
// onde ir. Fica logo depois das missões (03/11/2026) para não cortar a ponte
// "Quer mais? ⌄" da ficha do dia. O rosto é o de quem carrega o prêmio;
// [Usar a ficha] vai direto à mesa valendo. Some se a pessoa já levou o
// prêmio, se as tentativas de hoje acabaram ou se não há prêmio.

const TodayAtTableLine: React.FC<{ teaser: PokerTeaser; className?: string }> = ({ teaser, className = '' }) => {
  const { t, i18n } = useTranslation();
  const { launch, gateElement } = useBountyLaunch(teaser);
  if (!shouldShowTodayLine(teaser)) return null;
  const isPt = i18n.language.startsWith('pt');
  const carrierKey = isPokerOracle(teaser.carrier) ? teaser.carrier : 'other';
  const prize = prizeNameOf(teaser.prize, isPt);
  const carrier = t(`pokerEntry.oracles.${carrierKey}.with`);

  return (
    <div className={`pe-velvet relative flex items-center gap-3 rounded-2xl pl-3 pr-2.5 py-2.5 ${className}`}>
      <CarrierFace id={teaser.carrier} size={40} wanted />
      {/* Duas linhas curtas em vez de uma frase que quebraria em três. */}
      <p className="min-w-0 flex-1 leading-snug">
        <span className="sr-only">{t('pokerEntry.today', { prize, carrier })}</span>
        <span className="block text-[12px] font-semibold" style={{ color: '#FFE8A3' }} aria-hidden>
          {t('pokerEntry.todayLabel')}
        </span>
        <span className="block text-[13.5px] line-clamp-2" style={{ color: PAPER }} aria-hidden>
          {t('pokerEntry.todayWhat', { prize, carrier })}
        </span>
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
