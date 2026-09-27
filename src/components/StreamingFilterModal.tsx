import React from 'react';
import { Check, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { POPULAR_STREAMING_PROVIDERS } from '../lib/providers';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

interface StreamingFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProviderIds: number[];
  onToggleProvider: (providerId: number) => void;
  onClearFilter: () => void;
  // Oracle Filter — categoria separada dentro do mesmo modal, não um
  // provedor: liga/desliga a ordenação da Watchlist pela Nota Prevista.
  // Opcional porque esse modal também é usado na Biblioteca dos Oráculos,
  // onde as prateleiras já ordenam pela previsão — lá a seção não aparece.
  oracleFilterActive?: boolean;
  onToggleOracleFilter?: () => void;
}

// Seleção MÚLTIPLA — a maioria das pessoas assina mais de um serviço
// ("mostra o que eu posso assistir com o que já tenho").
const StreamingFilterModal: React.FC<StreamingFilterModalProps> = ({
  isOpen,
  onClose,
  selectedProviderIds,
  onToggleProvider,
  onClearFilter,
  oracleFilterActive,
  onToggleOracleFilter,
}) => {
  const { t } = useTranslation();
  const selectedCount = selectedProviderIds.length;

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('library.filters', { defaultValue: 'Filtros' })}
      subtitle={t('library.filtersSubtitle')}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={onClearFilter}
            disabled={selectedCount === 0}
            className={`px-3 -ml-3 rounded-xl text-sm font-medium hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition ${FOCUS_RING}`}
            style={{ color: MIST }}
          >
            {t('library.clearFilter', { defaultValue: 'Limpar filtro' })}
          </button>
          <button
            onClick={onClose}
            className={`h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
          >
            {t('common.apply', { defaultValue: 'Aplicar' })}
          </button>
        </div>
      }
    >
      {onToggleOracleFilter && (
        <button
          onClick={onToggleOracleFilter}
          role="switch"
          aria-checked={!!oracleFilterActive}
          className={`w-full justify-start gap-3.5 p-3.5 mb-7 rounded-xl text-left ring-1 transition ${FOCUS_RING} ${
            oracleFilterActive ? 'ring-2 ring-violet-400/70 bg-violet-500/15' : 'ring-white/10 hover:ring-white/25'
          }`}
          style={{ background: oracleFilterActive ? undefined : VELVET }}
        >
          <span className={`grid place-items-center w-10 h-10 shrink-0 rounded-lg ${oracleFilterActive ? 'bg-violet-600 text-white' : 'bg-white/10 text-violet-300'}`}>
            <Wand2 className="w-5 h-5" aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold" style={{ color: PAPER }}>
              {t('library.oracleFilter', { defaultValue: 'Oracle Filter' })}
            </span>
            <span className="block mt-0.5 text-xs" style={{ color: MIST }}>
              {t('library.oracleFilterDescription', { defaultValue: 'Ordena pela Nota Prevista para você' })}
            </span>
          </span>
          <span aria-hidden className={`relative block shrink-0 w-11 h-6 rounded-full transition-colors ${oracleFilterActive ? 'bg-violet-500' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${oracleFilterActive ? 'translate-x-5' : ''}`} />
          </span>
        </button>
      )}

      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
          {t('library.filterByStreaming', { defaultValue: 'Filtrar por streaming' })}
        </h3>
        {selectedCount > 0 && (
          <span className="text-sm" style={{ color: MIST }}>{t('library.selectedCount', { count: selectedCount })}</span>
        )}
      </div>

      <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {POPULAR_STREAMING_PROVIDERS.map((provider) => {
          const isSelected = selectedProviderIds.includes(provider.provider_id);
          return (
            <li key={provider.provider_id}>
              <button
                onClick={() => onToggleProvider(provider.provider_id)}
                aria-pressed={isSelected}
                className={`relative w-full flex-col gap-2 p-2.5 rounded-xl ring-1 transition ${FOCUS_RING} ${
                  isSelected ? 'ring-2 ring-violet-400/80 bg-violet-500/15' : 'ring-white/10 hover:ring-white/25'
                }`}
                style={{ background: isSelected ? undefined : VELVET }}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-violet-500 shadow" aria-hidden>
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </span>
                )}
                <img
                  src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10"
                />
                <span className="text-[11px] text-center leading-tight line-clamp-2" style={{ color: isSelected ? PAPER : MIST }}>
                  {provider.provider_name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </OracleSheet>
  );
};

export default StreamingFilterModal;
