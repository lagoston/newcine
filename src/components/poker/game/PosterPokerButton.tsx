import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { FOCUS_RING } from '../../../lib/oracleTheme';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { peekPokerHome, sharedHome } from '../../../lib/poker/client/usePokerHome';
import { langOf } from '../../../lib/poker/client/format';
import { posterTitle, weekPrizeOf } from '../../../lib/poker/client/tournament';
import PosterArt from '../../posterJackpot/PosterArt';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';
import { loadPosterPokerFont } from './font';
import '../../../styles/posterJackpot.css';
import '../../../styles/posterPoker.css';

// O botão "Pôster Poker" da home (03/11/2026, tarde; no lugar da faixa de feltro): o
// palco em miniatura — a prega da cortina, o pôster da semana dourado entre duas
// cartas, o nome em letreiro e a seta de ouro. Só para quem tem o pôquer liberado
// (get_poker_home: enabled e open). Enquanto não sabe, não desenha nada (a seção da
// home some com empty:hidden, sem empurrar nada).

const isOpen = (h: PokerHome | null) => !!h && h.enabled && h.open !== false;

const PosterPokerButton: React.FC = () => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const reduce = useReducedMotion();
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [home, setHome] = useState<PokerHome | null>(() => peekPokerHome());

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    sharedHome().then(
      (h) => alive && setHome(h),
      () => {}, // sem rede: fica a cópia local (o Casual abre offline)
    );
    return () => {
      alive = false;
    };
  }, [uid]);

  const open = isOpen(home);
  useEffect(() => {
    if (open) loadPosterPokerFont();
  }, [open]);
  if (!open) return null;

  const prize = weekPrizeOf(home);
  const title = posterTitle(prize, lang);

  return (
    <motion.div initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}>
      <Link to={BLEFE_ROUTES.title} className={`pp-door group ${FOCUS_RING}`} aria-label={t('pokerEntry.doorAria', { title })}>
        <span className="pp-door-art" aria-hidden>
          <i data-r="A" />
          <i data-r="K" className="is-red" />
          <span className="pp-door-poster">
            <PosterArt filePath={prize.file_path} effect="gold" size="w185" animated={!reduce} />
          </span>
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="pp-door-title pp-font pp-gold-letters">{t('pokerEntry.name')}</span>
          <span className="pp-door-hint">
            {t('pokerEntry.doorHint')} <b>{title}</b>
          </span>
        </span>
        <span className="pp-door-arrow" aria-hidden>
          <ArrowRight className="w-5 h-5" />
        </span>
      </Link>
    </motion.div>
  );
};

export default PosterPokerButton;
