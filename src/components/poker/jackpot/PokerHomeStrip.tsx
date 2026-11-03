import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { FOCUS_RING, PAPER } from '../../../lib/oracleTheme';
import { loadJackpotFont } from '../../../lib/posterJackpot';
import { OracleTrio } from './CarrierFace';
import { usePokerTeaser } from './teaser';
import { BLEFE_ROUTES, isPokerOracle, prizeNameOf } from './pokerMeta';
import '../../../styles/pokerEntry.css';

// A faixa de feltro da home (03/11/2026; veredito Q5, SPEC §7.1 item 3):
// 64 px, logo abaixo das três portas, e só quando o servidor manda
// home_strip = true (nos 7 primeiros dias para todos que ainda não tentaram
// o prêmio de hoje; depois, só para quem jogou nos últimos 14 dias e ainda
// não tentou hoje). Sem dado novo: lê o resumo que a porta do Jackpot já
// trouxe. Fica quieta de propósito — sem brilho correndo, sem número —
// para não disputar com as portas (pedido do Bruno: home mais minimalista).
const PokerHomeStrip: React.FC = () => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const teaser = usePokerTeaser();
  const show = !!teaser && teaser.homeStrip && !!teaser.prize && !teaser.wonToday;

  useEffect(() => {
    if (show) loadJackpotFont();
  }, [show]);

  if (!show || !teaser?.prize) return null;
  const isPt = i18n.language.startsWith('pt');
  const prize = prizeNameOf(teaser.prize, isPt);
  const carrierKey = isPokerOracle(teaser.carrier) ? teaser.carrier : 'other';
  const carrier = t(`pokerEntry.oracles.${carrierKey}.with`);

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: 0.2 }}
    >
      <Link to={BLEFE_ROUTES.lobby} className={`pe-strip ${FOCUS_RING}`} aria-label={t('pokerEntry.stripAria', { prize, carrier })}>
        <OracleTrio carrier={teaser.carrier} size={28} />
        <span className="min-w-0 flex-1">
          <span className="pe-cinzel block text-[13px] font-bold leading-none" style={{ color: '#FFE8A3' }}>
            {t('pokerEntry.name')}
          </span>
          <span className="mt-1.5 block truncate text-[13px] leading-tight" style={{ color: PAPER }}>
            {t('pokerEntry.todayStrip', { prize })}
          </span>
        </span>
        <span className="pe-strip-arrow" aria-hidden>
          <ChevronRight className="w-4 h-4" />
        </span>
      </Link>
    </motion.div>
  );
};

export default PokerHomeStrip;
