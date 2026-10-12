import React from 'react';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, glassPanel } from '../../lib/oracleTheme';
import { formatWatchTime } from '../../lib/profileStats';
import { Ring, affinityColor, formatOne, useCountUp, RATING_LEGEND_STOPS } from './observatoryKit';

// O painel de leitura no topo do observatório: quantos títulos, quanto
// tempo, a média (num anel da cor da nota) e por onde a pessoa já viajou
// (países e décadas). Logo abaixo, a legenda que vale para todos os blocos.

interface TasteHudProps {
  ratedCount: number;
  watchMinutes: number;
  average: number | null;
  countries: number;
  decades: number;
  // "Sua nota" / "a nota de @fulano" na legenda
  ownerName?: string;
}

const Readout: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 px-4 sm:px-6 py-4 sm:py-5 flex flex-col justify-center">
    <dd className="order-1">{children}</dd>
    <dt className="order-2 mt-1.5 text-[13px] leading-tight" style={{ color: MIST }}>
      {label}
    </dt>
  </div>
);

const TasteHud: React.FC<TasteHudProps> = ({ ratedCount, watchMinutes, average, countries, decades, ownerName }) => {
  const { t, i18n } = useTranslation();
  const rated = useCountUp(ratedCount);
  const minutes = useCountUp(watchMinutes);
  const avg = useCountUp(average ?? 0, 1300);
  const places = useCountUp(countries);
  const avgColor = affinityColor(average);

  return (
    <div>
      <dl
        className="grid grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden divide-white/[0.07] [&>div]:border-white/[0.07] [&>div:nth-child(odd)]:border-r lg:[&>div]:border-r lg:[&>div:last-child]:border-r-0 [&>div:nth-child(-n+2)]:border-b lg:[&>div]:border-b-0"
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
        <Readout label={ownerName ? t('profile.observatory.averageOf', { name: ownerName }) : t('profile.observatory.average')}>
          <span ref={avg.ref as React.Ref<HTMLSpanElement>} className="flex items-center gap-3">
            <Ring size={46} stroke={4} fraction={(average ?? 0) / 10} color={avgColor}>
              <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: avgColor, boxShadow: `0 0 10px ${avgColor}` }} />
            </Ring>
            <span style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl leading-none tabular-nums">
              {average === null ? '–' : formatOne(avg.value, i18n.language)}
            </span>
          </span>
        </Readout>
        <Readout label={t('profile.observatory.world', { count: decades })}>
          <span ref={places.ref as React.Ref<HTMLSpanElement>} style={{ ...PIXEL, color: PAPER }} className="flex items-baseline gap-2 leading-none whitespace-nowrap">
            <span className="text-3xl sm:text-4xl tabular-nums">{Math.round(places.value)}</span>
            <span className="text-lg sm:text-2xl">{t('profile.observatory.countriesUnit', { count: countries })}</span>
          </span>
        </Readout>
      </dl>

      {/* A legenda que vale para todos os blocos abaixo. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-[13px]" style={{ color: MIST }}>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="inline-flex items-end gap-[3px] h-3.5">
            {[5, 9, 14].map((h) => (
              <span key={h} className="w-[3px] rounded-full bg-[#C4B5FD]" style={{ height: h }} />
            ))}
          </span>
          {ownerName ? t('profile.observatory.legendSizeOf', { name: ownerName }) : t('profile.observatory.legendSize')}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="w-10 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${RATING_LEGEND_STOPS.join(', ')})` }} />
          {ownerName ? t('profile.observatory.legendColorOf', { name: ownerName }) : t('profile.observatory.legendColor')}
        </span>
      </div>
    </div>
  );
};

export default TasteHud;
