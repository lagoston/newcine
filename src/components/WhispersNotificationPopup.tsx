import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWhispers } from '../contexts/WhispersContext';
import { FOCUS_RING, MIST, PAPER } from '../lib/oracleTheme';

// Aviso que aparece logo abaixo do sino quando há sussurros não lidos.
// Mostra no máximo uma vez por sessão de navegador (sessionStorage) — se
// aparecesse toda vez que a contagem mudasse, ou em toda navegação de
// página, viraria irritante rápido. Não aparece com o modal já aberto.
// Tocar no aviso abre os Sussurros ali mesmo (o mesmo modal do sino).
const SESSION_KEY = 'whispers-popup-shown';

const WhispersNotificationPopup: React.FC = () => {
  const { unreadCount, whispersOpen, openWhispers } = useWhispers();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (unreadCount === 0) return;
    if (hasShownRef.current) return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      // segue sem lembrar
    }
    if (whispersOpen) return;

    // Pequeno atraso pra não competir com outras coisas carregando na
    // tela logo após o login/navegação inicial.
    const timer = setTimeout(() => {
      setVisible(true);
      hasShownRef.current = true;
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // segue sem lembrar
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [unreadCount, whispersOpen]);

  // Abriu o modal por outro caminho (o próprio sino): o aviso some.
  useEffect(() => {
    if (whispersOpen) setVisible(false);
  }, [whispersOpen]);

  // Some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
          className="fixed top-[calc(env(safe-area-inset-top)+3.75rem)] right-3 sm:right-6 z-[80] w-[min(22rem,calc(100%-1.5rem))]"
          role="status"
        >
          <div className="co-glass relative flex items-center rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setVisible(false);
                openWhispers();
              }}
              className={`flex-1 min-w-0 flex items-center gap-3 p-3.5 pr-12 rounded-2xl text-left ${FOCUS_RING}`}
            >
              <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-fuchsia-500/20 ring-1 ring-fuchsia-400/35 text-fuchsia-200">
                <Bell className="w-5 h-5" aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold" style={{ color: PAPER }}>
                  {t('indications.popupTitle', { defaultValue: 'Você tem novos sussurros' })}
                </span>
                <span className="block mt-0.5 text-xs" style={{ color: MIST }}>
                  {t('indications.popupHint', { count: unreadCount, defaultValue: `${unreadCount} não lido(s) — toque para ver` })}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setVisible(false)}
              aria-label={t('common.close')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-9 h-9 min-h-0 min-w-0 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
              style={{ color: MIST }}
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WhispersNotificationPopup;
