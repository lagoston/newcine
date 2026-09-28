import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, FOCUS_RING, ratingBarColor } from '../lib/oracleTheme';

// ---------------------------------------------------------------------------
// Gráfico "Suas notas" — quantos títulos em cada nota, de 0 a 10. A cor da
// barra é a faixa da nota (a mesma do resto do site) e o número da nota fica
// sempre embaixo, então a cor nunca é a única pista.
// ---------------------------------------------------------------------------

interface RatingSpectrumProps {
  counts: number[];
  average: number | null;
  onJump?: (rating: number) => void;
  // Título do gráfico (padrão: "Suas notas").
  title?: string;
}

const RatingSpectrum: React.FC<RatingSpectrumProps> = ({ counts, average, onJump, title }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const max = Math.max(1, ...counts);
  const peak = counts.indexOf(Math.max(...counts));
  const BAR_AREA = 72;

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{title || t('library.spectrumTitle')}</span>
        {average !== null && (
          <span className="text-sm" style={{ color: MIST }}>
            {t('library.spectrumAverage', {
              value: average.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
            })}
          </span>
        )}
      </figcaption>
      <ol className="mt-4 grid grid-cols-11 gap-1.5 sm:gap-2" aria-label={title || t('library.spectrumTitle')}>
        {counts.map((count, rating) => {
          const height = count === 0 ? 0 : Math.max(6, Math.round((count / max) * BAR_AREA));
          const label = t('library.spectrumBar', { rating, count });
          const interactive = !!onJump && count > 0;
          const body = (
            <>
              <span className="relative flex items-end justify-center w-full border-b border-white/10" style={{ height: BAR_AREA + 18 }}>
                {count > 0 && (
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 text-[11px] leading-none tabular-nums transition-opacity ${
                      rating === peak ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                    }`}
                    style={{ bottom: height + 5, color: PAPER }}
                    aria-hidden
                  >
                    {count}
                  </span>
                )}
                {count > 0 ? (
                  <motion.span
                    className="block w-full rounded-t-[4px]"
                    style={{ height, background: ratingBarColor(rating), transformOrigin: 'bottom' }}
                    initial={reduceMotion ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 0.15 + rating * 0.04, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
              </span>
              <span
                style={{ ...PIXEL, color: count > 0 ? PAPER : MIST, opacity: count > 0 ? 1 : 0.55 }}
                className="mt-1.5 text-sm leading-none"
                aria-hidden
              >
                {rating}
              </span>
            </>
          );
          return (
            <li key={rating} className="min-w-0">
              {interactive ? (
                <button
                  onClick={() => onJump!(rating)}
                  aria-label={label}
                  title={label}
                  className={`group w-full flex flex-col items-center rounded-md hover:bg-white/[0.04] transition ${FOCUS_RING}`}
                  style={{ minWidth: 0, minHeight: 0, padding: 0 }}
                >
                  {body}
                </button>
              ) : (
                <div className="group w-full flex flex-col items-center" role="img" aria-label={label} title={label}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
};

export default RatingSpectrum;
