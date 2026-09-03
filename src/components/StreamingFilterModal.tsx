import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Tv, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { POPULAR_STREAMING_PROVIDERS } from '../lib/providers';

interface StreamingFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProviderIds: number[];
  onToggleProvider: (providerId: number) => void;
  onClearFilter: () => void;
}

// Seleção MÚLTIPLA (não única) — faz mais sentido pra streaming, já que a
// maioria das pessoas tem mais de um serviço assinado ao mesmo tempo
// ("mostra o que eu posso assistir com o que já tenho"), não só um.
const StreamingFilterModal: React.FC<StreamingFilterModalProps> = ({
  isOpen,
  onClose,
  selectedProviderIds,
  onToggleProvider,
  onClearFilter,
}) => {
  const { t } = useTranslation();

  React.useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg max-h-[calc(100dvh-env(safe-area-inset-top)-4rem)] flex flex-col bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
          >
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Tv className="w-5 h-5 text-blue-500" />
                {t('library.filterByStreaming', { defaultValue: 'Filtrar por streaming' })}
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-4 gap-3">
                {POPULAR_STREAMING_PROVIDERS.map((provider) => {
                  const isSelected = selectedProviderIds.includes(provider.provider_id);
                  return (
                    <button
                      key={provider.provider_id}
                      onClick={() => onToggleProvider(provider.provider_id)}
                      title={provider.provider_name}
                      className={`relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-md scale-105'
                          : 'border-transparent bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-md">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                      <img
                        src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                        alt={provider.provider_name}
                        className="h-10 w-10 rounded-lg object-contain"
                      />
                      <span className="text-[10px] text-center text-gray-600 dark:text-gray-300 line-clamp-2 leading-tight">
                        {provider.provider_name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center justify-between p-4 border-t border-gray-200/50 dark:border-gray-700/50">
              <button
                onClick={onClearFilter}
                disabled={selectedProviderIds.length === 0}
                className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('library.clearFilter', { defaultValue: 'Limpar filtro' })}
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-xl transition-all shadow-lg"
              >
                {t('common.apply', { defaultValue: 'Aplicar' })}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default StreamingFilterModal;