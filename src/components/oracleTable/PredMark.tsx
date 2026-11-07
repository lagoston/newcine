import React from 'react';
import { Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MIST, PIXEL } from '../../lib/oracleTheme';
import type { MesaCard } from '../../lib/mesa/types';

// O selo pequeno da nota prevista (SPEC §2.3, ajuste do Bruno de 05/11 00h41):
// coadjuvante. É o PredictedPill do site reduzido (18 px de altura, número de
// 12 px, varinha de 10 px), sem brilho. A chance de 10 nunca aparece em número.
//   number  com 10 ou mais notas: "◆ 9" (o violeta do site)
//   guess   com 3 a 9 notas: "palpite 7" (MIST, sem violeta forte)
//   hidden  abaixo de 3 notas: "?" ("Ainda estou te conhecendo")
const PredMark: React.FC<{ pred: MesaCard['pred']; className?: string }> = ({ pred, className = '' }) => {
  const { t } = useTranslation();
  if (pred.label === 'hidden' || pred.value === null) {
    return (
      <span
        role="img"
        aria-label={t('mesa.pred.hiddenAria')}
        title={t('mesa.pred.hiddenAria')}
        className={`inline-grid place-items-center h-[18px] w-[18px] rounded-full ${className}`}
        style={{ ...PIXEL, fontSize: 12, lineHeight: 1, color: MIST, background: 'rgba(18,13,34,0.82)', boxShadow: 'inset 0 0 0 1px rgba(189,180,214,0.35)' }}
      >
        ?
      </span>
    );
  }
  if (pred.label === 'guess') {
    return (
      <span
        role="img"
        aria-label={t('mesa.pred.guessAria', { n: pred.value })}
        className={`inline-flex items-center h-[18px] px-1.5 rounded-full whitespace-nowrap ${className}`}
        style={{ ...PIXEL, fontSize: 11, lineHeight: 1, color: MIST, background: 'rgba(18,13,34,0.82)', boxShadow: 'inset 0 0 0 1px rgba(189,180,214,0.3)' }}
      >
        {t('mesa.pred.guess', { n: pred.value })}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={t('mesa.pred.aria', { n: pred.value })}
      className={`inline-flex items-center gap-[3px] h-[18px] pl-1 pr-1.5 rounded-full text-white ${className}`}
      style={{ background: 'rgba(124,58,237,0.92)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
    >
      <Wand2 className="w-[10px] h-[10px]" aria-hidden />
      <span style={{ ...PIXEL, fontSize: 12, lineHeight: 1 }} aria-hidden>
        {pred.value}
      </span>
    </span>
  );
};

export default PredMark;
