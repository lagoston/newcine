import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import PosterArt from '../../posterJackpot/PosterArt';
import { loadPosterPokerFont } from './font';
import '../../../styles/posterJackpot.css';
import '../../../styles/posterPoker.css';

// A abertura do Pôster Poker (03/11/2026, pedido do Bruno: "aquela abertura que
// preenche a tela, assim como o modal do clube do terror"). No escuro, o canhão de
// luz acende; uma carta cai girando no foco e vira o pôster da semana, dourado; as
// cartas se abrem em leque atrás dele e o letreiro carimba. Depois a câmera entra
// no pôster e aparece a tela título. Como a entrada do Clube do Terror: uma vez por
// visita (por aba), um toque pula e, com "reduzir movimento", não acontece.

const SEEN = 'cineoracle:posterPokerIntro';

const alreadySeen = () => {
  try {
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    sessionStorage.setItem(SEEN, '1');
  } catch {
    /* sem armazenamento: a abertura pode repetir nesta visita */
  }
};

// O leque: ás, rei, dama, valete e 10, girando atrás do pôster.
const FAN = [
  { r: 'A', red: false, rot: -38 },
  { r: 'K', red: true, rot: -19 },
  { r: 'Q', red: false, rot: 19 },
  { r: 'J', red: true, rot: 38 },
];

type Phase = 'dark' | 'light' | 'card' | 'logo' | 'enter';

const PosterPokerIntro: React.FC<{ filePath: string; ready: boolean }> = ({ filePath, ready }) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => !alreadySeen());
  const [phase, setPhase] = useState<Phase>('dark');

  useEffect(() => {
    loadPosterPokerFont();
  }, []);

  useEffect(() => {
    if (reduce && show) {
      markSeen();
      setShow(false);
    }
  }, [reduce, show]);

  // A sequência: escuro → luz → carta → letreiro; a câmera só entra com a tela pronta.
  useEffect(() => {
    if (!show || reduce) return;
    const next: Partial<Record<Phase, [Phase, number]>> = { dark: ['light', 320], light: ['card', 380], card: ['logo', 900] };
    if (phase === 'logo') {
      if (!ready) return;
      const id = window.setTimeout(() => setPhase('enter'), 950);
      return () => window.clearTimeout(id);
    }
    if (phase === 'enter') {
      const id = window.setTimeout(() => {
        markSeen();
        setShow(false);
      }, 420);
      return () => window.clearTimeout(id);
    }
    const step = next[phase];
    if (!step) return;
    const id = window.setTimeout(() => setPhase(step[0]), step[1]);
    return () => window.clearTimeout(id);
  }, [phase, show, ready, reduce]);

  const skip = () => {
    markSeen();
    setShow(false);
  };
  const lit = phase !== 'dark';
  const cardIn = phase === 'card' || phase === 'logo' || phase === 'enter';
  const logoIn = phase === 'logo' || phase === 'enter';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {show && !reduce && (
        <motion.div
          key="pp-intro"
          className="pp-intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4, ease: 'easeOut' } }}
          onClick={skip}
          role="presentation"
        >
          <span className="sr-only" aria-live="polite">
            {t('poker.name')}
          </span>
          {/* O canhão: pisca duas vezes (lâmpada esquentando) e fica. */}
          <motion.div
            className="pp-intro-cone"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={lit ? { opacity: [0, 0.7, 0.2, 1] } : { opacity: 0 }}
            transition={{ duration: 0.5, times: [0, 0.3, 0.5, 1] }}
          />
          <motion.div className="pp-intro-floor" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: lit ? 1 : 0 }} transition={{ duration: 0.6 }} />
          <motion.div
            className="pp-intro-center"
            aria-hidden
            animate={phase === 'enter' ? { scale: 6, opacity: 0 } : { scale: 1, opacity: 1 }}
            transition={phase === 'enter' ? { duration: 0.42, ease: [0.55, 0, 0.9, 0.4] } : { duration: 0.2 }}
          >
            <div className="relative">
              {/* O leque de cartas atrás do pôster. */}
              <div className="pp-intro-fan">
                {FAN.map((c, i) => (
                  <motion.i
                    key={c.r}
                    data-r={c.r}
                    className={c.red ? 'is-red' : ''}
                    initial={{ opacity: 0, rotate: 0, scale: 0.6 }}
                    animate={logoIn ? { opacity: 1, rotate: c.rot, scale: 1 } : { opacity: 0, rotate: 0, scale: 0.6 }}
                    transition={{ type: 'spring', stiffness: 220, damping: 18, delay: i * 0.05 }}
                  />
                ))}
              </div>
              {/* A carta cai girando e vira o pôster dourado. */}
              <motion.div
                className="pp-intro-card"
                initial={{ y: '-120vh', rotateY: 180, rotateZ: -24 }}
                animate={cardIn ? { y: 0, rotateY: 0, rotateZ: [-24, 6, 0] } : { y: '-120vh', rotateY: 180, rotateZ: -24 }}
                transition={{ duration: 0.85, ease: [0.2, 0.9, 0.25, 1] }}
              >
                <div className="pp-intro-front">
                  <PosterArt filePath={filePath} effect="gold" size="w342" loading="eager" />
                </div>
                <div className="pp-intro-back" />
              </motion.div>
            </div>
            {/* O letreiro carimba (escala grande → 1, com um clarão). */}
            <motion.div
              className="pp-logo"
              initial={{ opacity: 0, scale: 1.9 }}
              animate={logoIn ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.9 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            >
              <span className="is-top pp-font pp-gold-letters">{t('poker.tourney.logoTop')}</span>
              <span className="is-bottom pp-font pp-gold-letters">{t('poker.tourney.logoBottom')}</span>
            </motion.div>
          </motion.div>
          <span className="pp-intro-skip">{t('poker.table.tapToSkip')}</span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default PosterPokerIntro;
