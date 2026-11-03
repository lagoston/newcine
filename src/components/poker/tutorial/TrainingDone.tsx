import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { ChipFace } from '../../posterJackpot/Chips';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { displayFont } from '../../../lib/poker/client/format';

// Fim do treino (§7.8): "Pronto. +1 ficha." e o caminho direto para o prêmio de
// hoje. A ficha é dada uma vez por pessoa (o servidor decide; refazer não dá outra).
const TrainingDone: React.FC<{ granted: boolean | null }> = ({ granted }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  return (
    <div className="pk-overlay" role="dialog" aria-modal="true" aria-label={t('poker.tutorial.done')}>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[340px] rounded-[18px] p-6 grid gap-4 justify-items-center text-center"
        style={{ background: 'linear-gradient(180deg, #121a52, #0a0e2c)', boxShadow: '0 0 0 1.5px #F4C454, 0 30px 60px -30px #000' }}
      >
        {granted === null ? (
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FFE8A3' }} aria-label={t('common.loading')} />
        ) : (
          <motion.span initial={reduce ? false : { rotateY: 180, y: -20 }} animate={{ rotateY: 0, y: 0 }} transition={{ duration: 0.8 }}>
            <ChipFace className="w-16 h-16" />
          </motion.span>
        )}
        {/* "+1 ficha" tem número: nada de Cinzel (§7.12). */}
        <p className={`${displayFont(granted === false ? t('poker.tutorial.doneNoChip') : t('poker.tutorial.done'))} text-[22px] font-bold`} style={{ color: '#FFE8A3' }}>
          {granted === false ? t('poker.tutorial.doneNoChip') : t('poker.tutorial.done')}
        </p>
        <button type="button" className="pk-cta-gold" onClick={() => navigate(BLEFE_ROUTES.lobby)} autoFocus>
          {t('poker.tutorial.seePrize')}
        </button>
      </motion.div>
    </div>
  );
};

export default TrainingDone;
