import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PIXEL as PIXEL_STYLE } from '../../lib/oracleTheme';
import { CANDLE, COFFIN_PATH, CRYPT } from './terrorTheme';

// A entrada da sala: no escuro, o contorno de um caixão se acende à luz de
// vela, a tampa se abre e a sala aparece por trás. Uma vez por visita (por
// aba); um toque pula; com "reduzir movimento", não acontece.

const seenKey = (room: string) => `cineoracle:secretRoomEntered:${room}`;

const alreadySeen = (room: string) => {
  try {
    return sessionStorage.getItem(seenKey(room)) === '1';
  } catch {
    return false;
  }
};

const markSeen = (room: string) => {
  try {
    sessionStorage.setItem(seenKey(room), '1');
  } catch {
    /* sem armazenamento: a entrada pode repetir nesta visita */
  }
};

const SecretRoomEntrance: React.FC<{ room: string; ready: boolean; label: string }> = ({ room, ready, label }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [show, setShow] = useState(() => !alreadySeen(room));
  const [phase, setPhase] = useState<'draw' | 'open' | 'enter'>('draw');

  useEffect(() => {
    if (reduceMotion && show) {
      markSeen(room);
      setShow(false);
    }
  }, [reduceMotion, show, room]);

  // O contorno se desenha enquanto a sala carrega; a tampa só abre com a
  // sala pronta (e nunca antes de o contorno terminar).
  useEffect(() => {
    if (!show || !ready || phase !== 'draw') return;
    const timer = window.setTimeout(() => setPhase('open'), 900);
    return () => window.clearTimeout(timer);
  }, [show, ready, phase]);

  // A tampa sai, a luz de dentro acende e a câmera "entra" no caixão.
  useEffect(() => {
    if (phase === 'open') {
      const timer = window.setTimeout(() => setPhase('enter'), 650);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'enter') {
      const timer = window.setTimeout(() => {
        markSeen(room);
        setShow(false);
      }, 380);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [phase, room]);
  const opened = phase !== 'draw';

  const skip = () => {
    markSeen(room);
    setShow(false);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {show && !reduceMotion && (
        <motion.div
          key="entrance"
          className="fixed inset-0 z-[9995] flex flex-col items-center justify-center cursor-pointer select-none"
          style={{ background: CRYPT }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeOut' } }}
          onClick={skip}
          role="presentation"
        >
          <span className="sr-only" aria-live="polite">
            {label}
          </span>
          <motion.span
            aria-hidden
            className="absolute w-[60vmin] h-[60vmin] rounded-full"
            style={{ background: `radial-gradient(circle, rgba(255,181,71,0.22), transparent 62%)` }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={opened ? { opacity: 1, scale: 2.6 } : { opacity: [0.35, 0.7, 0.45, 0.8], scale: 1 }}
            transition={opened ? { duration: 0.85, ease: 'easeIn' } : { duration: 1.4, repeat: Infinity, repeatType: 'mirror' }}
          />
          <motion.svg
            viewBox="0 0 40 64"
            className="relative w-[22vmin] max-w-[150px] h-auto overflow-visible"
            aria-hidden
            initial={{ scale: 1 }}
            animate={phase === 'enter' ? { scale: 9, opacity: 0 } : { scale: 1, opacity: 1 }}
            transition={phase === 'enter' ? { duration: 0.42, ease: [0.55, 0, 0.9, 0.4] } : { duration: 0.2 }}
          >
            <motion.path
              d={COFFIN_PATH}
              fill="none"
              stroke={CANDLE}
              strokeWidth={1.6}
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />
            {/* A luz de dentro, que aparece quando a tampa sai. */}
            <motion.path
              d={COFFIN_PATH}
              fill={CANDLE}
              initial={{ opacity: 0 }}
              animate={opened ? { opacity: [0, 0.95, 1] } : { opacity: 0 }}
              transition={{ duration: 0.45, delay: 0.12 }}
            />
            {/* A tampa: gira para o lado e cai, abrindo o caixão. */}
            {opened && (
              <motion.path
                d={COFFIN_PATH}
                fill={CRYPT}
                stroke={CANDLE}
                strokeWidth={1.6}
                strokeLinejoin="round"
                style={{ transformOrigin: '36px 17px' }}
                initial={{ opacity: 1, rotate: 0, x: 0, y: 0 }}
                animate={{ opacity: [1, 1, 0], rotate: 38, x: 30, y: 14 }}
                transition={{ duration: 0.55, ease: [0.4, 0, 0.6, 1] }}
              />
            )}
          </motion.svg>
          <motion.p
            aria-hidden
            className="relative mt-8 text-xl sm:text-2xl leading-none"
            style={{ ...PIXEL_STYLE, color: CANDLE }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: opened ? 0 : 1, y: 0 }}
            transition={{ delay: opened ? 0 : 0.5, duration: 0.3 }}
          >
            {label}
          </motion.p>
          <span className="absolute bottom-[calc(env(safe-area-inset-bottom)+2rem)] text-xs" style={{ color: 'rgba(243,234,211,0.45)' }}>
            {t('secretRoom.entranceSkip')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SecretRoomEntrance;
