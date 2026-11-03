import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TableShow } from '../../../lib/poker/client/display';
import type { Lang } from '../../../lib/poker/client/format';
import { posterTitle, type TournamentPrize } from '../../../lib/poker/client/tournament';
import PosterArt, { RarityTag } from '../../posterJackpot/PosterArt';
import { SerialLine } from '../../posterJackpot/CollectorMark';
import { Sheet } from '../table/Overlays';
import { effectRibbon } from './TableTourney';

// Tocar no pôster mágico (03/11/2026): o pôster, o efeito e o que está valendo agora.
const PosterInfoSheet: React.FC<{ prize: TournamentPrize; table: TableShow; lang: Lang; reduced: boolean; onClose: () => void }> = ({
  prize,
  table,
  lang,
  reduced,
  onClose,
}) => {
  const { t } = useTranslation();
  const title = posterTitle(prize, lang);
  const casts = table.tournament?.casts ?? 0;
  const now = effectRibbon(t, table, lang);
  return (
    <Sheet title={t(`poker.effects.${prize.effect_id}.name`)} onClose={onClose} reduced={reduced}>
      <div className="grid grid-cols-[88px_1fr] gap-4 items-start">
        <PosterArt filePath={prize.file_path} effect="gold" size="w185" animated={!reduced} className="w-[88px] aspect-[2/3] rounded-[7px]" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold" style={{ color: '#F5EBD3' }}>
            {title} <span className="font-normal" style={{ color: '#c9b3ae' }}>({prize.year})</span>
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <RarityTag rarity={prize.rarity} />
            <SerialLine rarity={prize.rarity} serial={prize.serial} />
          </div>
          <p className="mt-2.5 text-[14px] leading-snug" style={{ color: '#ECDCCF' }}>{t(`poker.effects.${prize.effect_id}.rule`)}</p>
          <p className="mt-2 text-[12.5px]" style={{ color: '#c9b3ae' }}>
            {casts > 0 ? t('poker.tourney.castsSoFar', { count: casts }) : t('poker.tourney.notCastYet')}
          </p>
        </div>
      </div>
      {now && <div className="mt-4 pp-sheet-now">{now}</div>}
    </Sheet>
  );
};

export default PosterInfoSheet;
