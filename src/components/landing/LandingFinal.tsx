import React from 'react';
import { useTranslation } from 'react-i18next';
import { INK, ORACLES, PAPER, PIXEL } from '../../lib/oracleTheme';
import { SignInButton, SignUpButton } from './LandingBits';

// A faixa final, de papel: as três cartas "na mesa" e o convite. Desde
// 04/11/2026 usa as cartas padrão (as mesmas do herói, já baixadas) no lugar
// das cartas estilo Yu-Gi-Oh (+370 KB só para esta faixa); um contorno de
// tinta e a sombra separam o creme das cartas do creme do papel.

const LandingFinal: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section style={{ background: PAPER }} aria-labelledby="lp-final">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-24 flex flex-col lg:flex-row lg:items-center gap-10 lg:gap-16">
        <div aria-hidden className="flex justify-center lg:justify-start shrink-0 pl-6 pt-2">
          {ORACLES.map((oracle, i) => (
            <img
              key={oracle.id}
              src={oracle.img}
              alt=""
              width={1696}
              height={2528}
              loading="lazy"
              decoding="async"
              className="w-[88px] sm:w-[108px] -ml-6 rounded-[5px]"
              style={{
                transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? '-6px' : '4px'})`,
                zIndex: i === 1 ? 2 : 1,
                boxShadow: `0 0 0 1.5px ${INK}, 0 18px 36px -14px rgba(34,27,54,0.6)`,
              }}
            />
          ))}
        </div>
        <div>
          <h2 id="lp-final" style={{ ...PIXEL, color: INK }} className="text-[1.9rem] sm:text-4xl lg:text-[2.75rem] leading-tight max-w-[20ch]">
            {t('guestHome.finalTitle')}
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed max-w-[36rem]" style={{ color: `${INK}CC` }}>
            {t('guestHome.finalSubtitle')}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <SignUpButton tone="paper" />
            <SignInButton tone="paper" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default LandingFinal;
