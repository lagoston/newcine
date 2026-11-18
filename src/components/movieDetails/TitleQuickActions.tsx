import React from 'react';
import { Loader2, Instagram, Send, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PAPER } from '../../lib/oracleTheme';
import { QUICK_ACTION } from './shared';
import { useShareStory } from './useShareStory';

// Ações rápidas (trailer, sussurrar, story): ícone em cima, nome embaixo,
// sem contorno.

interface TitleQuickActionsProps {
  movieId: number;
  title: string;
  posterPath: string | null | undefined;
  userId: string | null;
  loggedIn: boolean;
  onOpenTrailer: () => void;
  onRecommend: () => void;
}

const TitleQuickActions: React.FC<TitleQuickActionsProps> = ({ movieId, title, posterPath, userId, loggedIn, onOpenTrailer, onRecommend }) => {
  const { t } = useTranslation();
  const { isSharing, share } = useShareStory(movieId, title, posterPath, userId);

  return (
    <div className="mt-5 flex justify-center md:justify-start gap-1 md:-ml-4">
      <button onClick={onOpenTrailer} className={QUICK_ACTION} style={{ color: PAPER }}>
        <Play className="w-[22px] h-[22px] fill-fuchsia-300 text-fuchsia-300" aria-hidden />
        {t('movieModal.trailer')}
      </button>
      {loggedIn && (
        <>
          <button onClick={onRecommend} className={QUICK_ACTION} style={{ color: PAPER }}>
            <Send className="w-[22px] h-[22px] text-orange-300" aria-hidden />
            {t('indications.indicate')}
          </button>
          <button
            onClick={share}
            disabled={isSharing}
            aria-label={t('movieModal.shareStoryHint')}
            title={t('movieModal.shareStoryHint')}
            className={QUICK_ACTION}
            style={{ color: PAPER }}
          >
            {isSharing ? (
              <Loader2 className="w-[22px] h-[22px] animate-spin text-pink-300" aria-hidden />
            ) : (
              <Instagram className="w-[22px] h-[22px] text-pink-300" aria-hidden />
            )}
            {t('movieModal.shareStory')}
          </button>
        </>
      )}
    </div>
  );
};

export default React.memo(TitleQuickActions);
