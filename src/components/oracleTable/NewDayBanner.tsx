import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { INK, PAPER, FOCUS_RING } from '../../lib/oracleTheme';
import { MoonArc } from './MesaArt';

// A virada da meia-noite com a Mesa aberta (SPEC §2.16), 05/11/2026: uma faixa
// fina por cima do alto da mesa (sobreposta, para nada pular). Nada é trocado
// no meio de um gesto; "Ver" traz a tiragem nova.
const NewDayBanner: React.FC<{ show: boolean; onShow: () => void; reduced: boolean }> = ({ show, onShow, reduced }) => {
  const { t } = useTranslation();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-1.5 pointer-events-none"
        >
          <div className="pointer-events-auto flex items-center gap-3 pl-3 pr-1 py-1 rounded-full" style={{ background: '#241A44', boxShadow: 'inset 0 0 0 1px rgba(185,166,255,0.45), 0 10px 24px -12px rgba(0,0,0,0.9)' }}>
            <MoonArc width={22} />
            <span className="text-[13px]" style={{ color: PAPER }}>
              {t('mesa.newDay.text')}
            </span>
            <button type="button" onClick={onShow} className={`h-8 px-3.5 rounded-full text-[13px] font-semibold ${FOCUS_RING}`} style={{ background: PAPER, color: INK }}>
              {t('mesa.newDay.cta')}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NewDayBanner;
