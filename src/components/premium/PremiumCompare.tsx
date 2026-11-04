import React from 'react';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, glassPanel } from '../../lib/oracleTheme';
import { ChapterHeader, PREMIUM_GOLD } from './parts';
import './premium.css';

// "Lado a lado" (04/11/2026): só o que tem número de verdade para comparar
// (ver o inventário em pages/Premium.tsx). As peças do perfil ficam de fora
// da tabela de propósito: molduras e banners também saem como prêmio do
// Pôster Poker para quem não é Premium, então "0 × 11" não seria verdade.
type Row = { key: string; free: string | null; premium: string };

const PremiumCompare: React.FC = () => {
  const { t } = useTranslation();
  const rows: Row[] = [
    { key: 'shelves', free: '20', premium: t('premium.page.compare.shelvesPremium') },
    { key: 'review', free: null, premium: t('premium.page.compare.reviewPremium') },
    { key: 'duel', free: null, premium: t('premium.page.compare.duelPremium') },
    { key: 'chip', free: null, premium: t('premium.page.compare.chipPremium') },
    { key: 'whispers', free: '5', premium: '20' },
  ];

  return (
    <section aria-labelledby="prm-compare" className="py-12 sm:py-16">
      <ChapterHeader
        id="prm-compare"
        reel={t('premium.page.reel', { n: 4, label: t('premium.page.compare.kicker') })}
        title={t('premium.page.compare.title')}
      />

      <div className="mt-8 rounded-2xl overflow-hidden" style={glassPanel('#F4C454')}>
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{t('premium.page.compare.caption')}</caption>
          <colgroup>
            <col />
            <col className="w-[76px] sm:w-[160px]" />
            <col className="w-[108px] sm:w-[200px]" />
          </colgroup>
          <thead>
            <tr className="text-[13px] sm:text-sm" style={{ color: MIST }}>
              <th scope="col" className="px-4 sm:px-6 py-4 font-medium">
                <span className="sr-only">{t('premium.page.compare.colFeature')}</span>
              </th>
              <th scope="col" className="px-2 sm:px-4 py-4 font-medium text-center">
                {t('premium.page.compare.colFree')}
              </th>
              <th scope="col" className="px-2 sm:px-4 py-4 text-center font-semibold" style={{ color: PREMIUM_GOLD, background: 'var(--prm-gold-soft)' }}>
                {t('premium.page.compare.colPremium')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-white/10">
                <th scope="row" className="px-4 sm:px-6 py-4 text-[14px] sm:text-[15px] font-medium leading-snug" style={{ color: PAPER }}>
                  {t(`premium.page.compare.${row.key}`)}
                </th>
                <td className="px-2 sm:px-4 py-4 text-center" style={{ color: MIST }}>
                  {row.free === null ? (
                    <>
                      <span aria-hidden className="text-lg">—</span>
                      <span className="sr-only">{t('premium.page.compare.none')}</span>
                    </>
                  ) : (
                    <span style={PIXEL} className="text-[22px] leading-none">
                      {row.free}
                    </span>
                  )}
                </td>
                <td className="px-2 sm:px-4 py-4 text-center" style={{ background: 'var(--prm-gold-soft)', color: PAPER }}>
                  {/^\d+$/.test(row.premium) ? (
                    <span style={{ ...PIXEL, color: PREMIUM_GOLD }} className="text-[22px] leading-none">
                      {row.premium}
                    </span>
                  ) : (
                    <span className="text-[13px] sm:text-[15px] font-semibold leading-snug">{row.premium}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: MIST }}>
        {t('premium.page.compare.note')}
      </p>
    </section>
  );
};

export default PremiumCompare;
