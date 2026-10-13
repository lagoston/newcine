import React from 'react';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, glassPanel } from '../../lib/oracleTheme';
import { formatWatchTime } from '../../lib/profileStats';
import { useCountUp } from './observatoryKit';

// O painel de leitura no topo do observatório: quantos títulos a pessoa
// avaliou e quanto tempo de tela isso soma. Os números sobem contando quando
// entram na tela.

interface TasteHudProps {
  ratedCount: number;
  watchMinutes: number;
}

const Readout: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 px-4 sm:px-7 py-4 sm:py-5 flex flex-col justify-center">
    <dd className="order-1">{children}</dd>
    <dt className="order-2 mt-1.5 text-[13px] leading-tight" style={{ color: MIST }}>
      {label}
    </dt>
  </div>
);

const TasteHud: React.FC<TasteHudProps> = ({ ratedCount, watchMinutes }) => {
  const { t, i18n } = useTranslation();
  const rated = useCountUp(ratedCount);
  const minutes = useCountUp(watchMinutes);

  return (
    <dl
      className="grid grid-cols-2 rounded-2xl overflow-hidden [&>div:first-child]:border-r [&>div]:border-white/[0.07]"
      style={glassPanel('#8B5CF6')}
      aria-label={t('profile.observatory.numbersLabel')}
    >
      <Readout label={t('profile.observatory.rated')}>
        <span ref={rated.ref as React.Ref<HTMLSpanElement>} style={{ ...PIXEL, color: PAPER }} className="block text-3xl sm:text-4xl leading-none tabular-nums">
          {Math.round(rated.value).toLocaleString(i18n.language)}
        </span>
      </Readout>
      <Readout label={t('profile.observatory.watching')}>
        <span ref={minutes.ref as React.Ref<HTMLSpanElement>} style={{ ...PIXEL, color: PAPER }} className="block text-3xl sm:text-4xl leading-none tabular-nums whitespace-nowrap">
          {formatWatchTime(Math.round(minutes.value))}
        </span>
      </Readout>
    </dl>
  );
};

export default TasteHud;
