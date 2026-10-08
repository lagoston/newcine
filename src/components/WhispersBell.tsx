import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { useWhispers } from '../contexts/WhispersContext';
import { FOCUS_RING, NIGHT, PAPER } from '../lib/oracleTheme';

// O sino dos Sussurros, no canto direito do topo (celular e computador).
// Substitui os botões de Sussurros que ficavam na Home e no Perfil: de
// qualquer página, um toque abre o mesmo modal, ali mesmo.
//
// • A bolinha fúcsia mostra quantos sussurros estão sem ler (9+ acima de 9).
// • Quando chega um sussurro novo, o sino balança uma vez (a não ser que a
//   pessoa tenha pedido menos movimento no sistema).
// • O modal só é baixado na primeira vez que alguém toca no sino (ou passa
//   o dedo/mouse por cima dele) — não pesa no carregamento das páginas.

const loadWhispersModal = () => import('./WhispersModal');
const WhispersModal = lazy(loadWhispersModal);

export const WhispersBell: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useTranslation();
  const { unreadCount, whispersOpen, openWhispers } = useWhispers();
  const reduceMotion = useReducedMotion();
  const controls = useAnimationControls();
  const previous = useRef(unreadCount);

  useEffect(() => {
    if (unreadCount > previous.current && !reduceMotion) {
      controls.start({ rotate: [0, -18, 15, -10, 6, 0], transition: { duration: 0.75, ease: 'easeInOut' } });
    }
    previous.current = unreadCount;
  }, [unreadCount, reduceMotion, controls]);

  const label = unreadCount > 0
    ? `${t('profile.whispers')} — ${t('nav.unreadWhispers', { count: unreadCount })}`
    : t('profile.whispers');

  return (
    <button
      type="button"
      onClick={openWhispers}
      onPointerEnter={loadWhispersModal}
      onTouchStart={loadWhispersModal}
      aria-label={label}
      title={t('profile.whispers')}
      aria-haspopup="dialog"
      aria-expanded={whispersOpen}
      className={`relative grid place-items-center w-11 h-11 min-h-0 min-w-0 rounded-full hover:bg-white/10 active:bg-white/15 transition-colors ${FOCUS_RING} ${className}`}
      style={{ color: PAPER }}
    >
      <motion.span animate={controls} className="grid place-items-center" style={{ transformOrigin: '50% 12%' }}>
        <Bell className="w-[22px] h-[22px]" strokeWidth={1.9} aria-hidden />
      </motion.span>
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            key="badge"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 28 }}
            className="absolute top-[5px] right-[3px] min-w-[18px] h-[18px] px-[5px] grid place-items-center rounded-full bg-fuchsia-500 text-white text-[10.5px] font-bold leading-none tabular-nums"
            style={{ boxShadow: `0 0 0 2px ${NIGHT}` }}
            aria-hidden
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
};

// O modal dos Sussurros, montado uma vez só (na Navbar). Fica montado
// depois da primeira abertura, para a animação de fechar acontecer.
export const WhispersHost: React.FC = () => {
  const { session } = useAuth();
  const { whispersOpen, closeWhispers, notifyFriendAccepted } = useWhispers();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (whispersOpen) setMounted(true);
  }, [whispersOpen]);

  if (!mounted || !session?.user?.id) return null;

  return (
    <Suspense fallback={null}>
      <WhispersModal
        isOpen={whispersOpen}
        onClose={closeWhispers}
        userId={session.user.id}
        onFriendAccepted={notifyFriendAccepted}
      />
    </Suspense>
  );
};
