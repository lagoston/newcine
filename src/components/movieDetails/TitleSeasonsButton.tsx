import React from 'react';
import { Tv, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VELVET, PAPER, MIST, FOCUS_RING } from '../../lib/oracleTheme';

// O botão "Temporadas e episódios" de uma série (abre a gaveta das
// temporadas), com a contagem do que a pessoa já viu.

interface TitleSeasonsButtonProps {
  seasonCount: number;
  hasRated: boolean;
  // quantos episódios a pessoa já marcou
  watchedCount: number;
  onOpen: () => void;
}

const TitleSeasonsButton: React.FC<TitleSeasonsButtonProps> = ({ seasonCount, hasRated, watchedCount, onOpen }) => {
  const { t } = useTranslation();

  return (
    <button
      onClick={onOpen}
      className={`mt-5 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl ring-1 ring-white/10 hover:ring-white/25 text-left transition ${FOCUS_RING}`}
      style={{ background: VELVET }}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-lg bg-violet-500/15 text-violet-300">
          <Tv className="w-5 h-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold" style={{ color: PAPER }}>{t('movies.seasonsAndEpisodes')}</span>
          <span className="block text-sm truncate" style={{ color: MIST }}>
            {[
              seasonCount > 0 ? t('movieModal.seasonCount', { count: seasonCount }) : null,
              hasRated && watchedCount > 0 ? t('movieModal.episodesWatched', { count: watchedCount }) : null,
            ].filter(Boolean).join(' · ') || t('movieModal.seeSeasons')}
          </span>
        </span>
      </span>
      <ChevronRight className="w-5 h-5 shrink-0" style={{ color: MIST }} aria-hidden />
    </button>
  );
};

export default React.memo(TitleSeasonsButton);
