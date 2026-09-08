import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWhispers } from '../contexts/WhispersContext';

// Pop-up que aparece quando o usuário tem sussurros não lidos, sem
// precisar ir até o perfil e abrir o modal manualmente pra descobrir.
// Mostra no máximo uma vez por sessão de navegador (sessionStorage) —
// se aparecesse toda vez que a contagem mudasse, ou em toda navegação
// de página, viraria irritante rápido. Não aparece na própria página de
// perfil (onde o botão de sussurros já está visível) nem enquanto o
// modal de sussurros estiver aberto.
const SESSION_KEY = 'whispers-popup-shown';

const WhispersNotificationPopup: React.FC = () => {
  const { unreadCount } = useWhispers();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (unreadCount === 0) return;
    if (hasShownRef.current) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    if (location.pathname.startsWith('/profile')) return;

    // Pequeno atraso pra não competir com outras coisas carregando na
    // tela logo após o login/navegação inicial.
    const timer = setTimeout(() => {
      setVisible(true);
      hasShownRef.current = true;
      sessionStorage.setItem(SESSION_KEY, '1');
    }, 1500);

    return () => clearTimeout(timer);
  }, [unreadCount, location.pathname]);

  const handleClick = () => {
    setVisible(false);
    navigate('/profile');
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed top-[calc(env(safe-area-inset-top)+4rem)] left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm"
        >
          <button
            onClick={handleClick}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-orange-300/40 dark:border-orange-500/30 shadow-2xl text-left hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <div className="flex-shrink-0 p-2.5 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-400/30">
              <MessageCircle className="w-5 h-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                {t('indications.popupTitle', { defaultValue: 'Você tem novos sussurros' })}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('indications.popupHint', { count: unreadCount, defaultValue: `${unreadCount} não lido(s) — toque para ver` })}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setVisible(false);
              }}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WhispersNotificationPopup;