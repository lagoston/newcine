import React from 'react';
import { Loader2, Instagram, Send, Play, Dna } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PAPER } from '../../lib/oracleTheme';
import { QUICK_ACTION } from './shared';
import { useShareStory } from './useShareStory';

// Ações rápidas (trailer, sussurrar, story, DNA): ícone em cima, nome
// embaixo, sem contorno.
// 24/11/2026: o Oracle DNA mora aqui, como um símbolo de DNA do tamanho dos
// outros três. Antes era um cartão da largura do menu, igual ao de "Temporadas
// e episódios" e ao da saga, e competia com eles.

interface TitleQuickActionsProps {
  movieId: number;
  title: string;
  posterPath: string | null | undefined;
  // 22/11/2026: o story novo diz "Filme de 2019" / "Série de 2011" e busca a
  // nota, a resenha e o pôster equipado pelo tipo certo (filme ou série).
  mediaType: 'movie' | 'tv';
  releaseDate?: string | null;
  userId: string | null;
  loggedIn: boolean;
  onOpenTrailer: () => void;
  onRecommend: () => void;
  // Abre a gaveta do Oracle DNA (só para quem está logado: o banco exige).
  onOpenDna?: () => void;
}

const TitleQuickActions: React.FC<TitleQuickActionsProps> = ({ movieId, title, posterPath, mediaType, releaseDate, userId, loggedIn, onOpenTrailer, onRecommend, onOpenDna }) => {
  const { t } = useTranslation();
  const { isSharing, share } = useShareStory({ id: movieId, title, posterPath, mediaType, releaseDate }, userId);

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
          {onOpenDna && (
            <button
              onClick={onOpenDna}
              aria-haspopup="dialog"
              aria-label={t('oracleDna.open')}
              title={t('oracleDna.open')}
              className={QUICK_ACTION}
              style={{ color: PAPER }}
            >
              <Dna className="w-[22px] h-[22px] text-teal-300" aria-hidden />
              {t('oracleDna.short')}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default React.memo(TitleQuickActions);
