import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { NIGHT, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  // Opcional — sem isso o botão continua dizendo "Excluir" (o padrão
  // original, correto pros usos de exclusão de verdade em
  // RatingBox.tsx/MovieDetailsModal.tsx). Passe um texto diferente pra
  // ações de confirmação que não são exclusão, como desfazer amizade.
  confirmLabel?: string;
}

// A prop `title` continua existindo pra não quebrar quem já chama esse
// componente, mas não é renderizada — ela sempre chegava com o mesmo texto
// do botão de confirmar (ex: "Excluir"), duplicando a palavra na tela. Só a
// pergunta e os dois botões (Cancelar/Confirmar) aparecem.
//
// Renderizado via Portal no <body> e numa camada acima de tudo (10050): uma
// confirmação é sempre a coisa mais recente na tela. Antes ela nascia dentro
// de quem a abriu e, aberta de dentro das Resenhas (que ficam em 10000),
// aparecia ESCONDIDA atrás delas.
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  message,
  confirmLabel,
}) => {
  const { t } = useTranslation();
  const messageId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Só a confirmação fecha — o modal de baixo continua aberto.
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-describedby={messageId}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
            className="relative w-full max-w-sm max-h-[calc(100dvh-4rem)] flex flex-col rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden"
            style={{ background: NIGHT }}
          >
            <div className="px-6 pt-6 pb-5 overflow-y-auto">
              <p id={messageId} className="text-[15px] leading-relaxed" style={{ color: PAPER }}>{message}</p>
            </div>
            <div className="shrink-0 flex gap-2.5 px-6 pb-6">
              <button
                onClick={onClose}
                autoFocus
                className={`flex-1 h-11 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
                style={{ color: MIST }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 h-11 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
              >
                {confirmLabel ?? t('common.delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConfirmationModal;
