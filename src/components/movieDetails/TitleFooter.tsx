import React from 'react';
import { MessageSquare, Plus, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PAPER, FOCUS_RING } from '../../lib/oracleTheme';

// Rodapé fixo: adicionar à biblioteca / já na biblioteca, e resenhas.

interface TitleFooterProps {
  isInLibrary: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onReviews: () => void;
}

const TitleFooter: React.FC<TitleFooterProps> = ({ isInLibrary, onAdd, onRemove, onReviews }) => {
  const { t } = useTranslation();

  return (
    <div
      className="shrink-0 flex gap-2.5 px-5 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/[0.07]"
      style={{ background: 'rgba(18,13,34,0.97)' }}
    >
      {!isInLibrary ? (
        <button
          onClick={onAdd}
          className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
        >
          <Plus className="w-5 h-5" aria-hidden />
          {t('library.addToLibrary')}
        </button>
      ) : (
        <button
          onClick={onRemove}
          aria-label={`${t('movies.inLibrary')} — ${t('movieModal.tapToRemove')}`}
          title={t('movieModal.tapToRemove')}
          className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/15 text-emerald-200 font-semibold transition ${FOCUS_RING}`}
        >
          <Check className="w-5 h-5" aria-hidden />
          {t('movies.inLibrary')}
        </button>
      )}
      <button
        onClick={onReviews}
        title={t('reviews.title')}
        className={`inline-flex items-center justify-center gap-2 h-12 w-12 sm:w-auto sm:px-5 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 font-medium transition ${FOCUS_RING}`}
        style={{ color: PAPER }}
      >
        <MessageSquare className="w-5 h-5 text-violet-300" aria-hidden />
        <span className="sr-only sm:not-sr-only">{t('reviews.title')}</span>
      </button>
    </div>
  );
};

export default React.memo(TitleFooter);
