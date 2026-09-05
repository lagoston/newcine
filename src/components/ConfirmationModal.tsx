import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

// A prop `title` continua existindo pra não quebrar quem já chama esse
// componente (RatingBox.tsx, MovieDetailsModal.tsx), mas não é mais
// renderizada — ela sempre chegava com o mesmo texto do botão de
// confirmar (ex: "Excluir"), duplicando a mesma palavra duas vezes na
// tela: uma vez como título do cabeçalho, outra no botão. Só a
// pergunta/mensagem e os dois botões (Cancelar/Confirmar) ficam agora.
const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  message,
}) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[calc(100dvh-4rem)] flex flex-col overflow-hidden"
          >
            <div className="p-5 pt-6 overflow-y-auto">
              <p className="text-gray-700 dark:text-gray-200">{message}</p>
            </div>
            <div className="flex-shrink-0 flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 rounded-md transition-colors"
              >
                {t('common.delete')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmationModal;