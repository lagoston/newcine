import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TableShow } from '../../../lib/poker/client/display';
import type { Lang } from '../../../lib/poker/client/format';
import type { TableEffectPoster } from '../../../lib/poker/client/useFriendsMatch';
import PosterArt from '../../posterJackpot/PosterArt';
import { Sheet } from '../table/Overlays';
import { effectRibbon } from './TableTourney';

// Mesa com amigos (03/11/2026, fase 3): tocar na pilha de pôsteres mostra todos os
// efeitos da mesa — o pôster, quantos iguais (e o que isso muda), a regra e quantas
// vezes já lançou. Embaixo, o que vale agora.
const EffectsSheet: React.FC<{ effects: TableEffectPoster[]; table: TableShow; lang: Lang; reduced: boolean; onClose: () => void }> = ({
  effects,
  table,
  lang,
  reduced,
  onClose,
}) => {
  const { t } = useTranslation();
  const now = effectRibbon(t, table, lang);
  const casts = (effect: string) => table.tournament?.list?.find((x) => x.effect === effect)?.casts ?? 0;
  return (
    <Sheet title={t('poker.friends.table.fxTitle')} onClose={onClose} reduced={reduced}>
      <ul className="grid gap-3.5">
        {effects.map((x) => (
          <li key={x.effect} className="grid grid-cols-[56px_1fr] gap-3 items-start">
            <span className="relative block w-[56px] aspect-[2/3]">
              <PosterArt filePath={x.filePath} effect="gold" size="w185" animated={false} className="absolute inset-0 rounded-[6px]" />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <b className="pp-font pp-gold-letters text-[16px] leading-tight">{t(`poker.effects.${x.effect}.name`)}</b>
                {x.level > 1 && <span className="pf-chip-level pk-num">{t('poker.friends.table.level', { count: x.level })}</span>}
              </span>
              <span className="block mt-1 text-[13px] leading-snug" style={{ color: '#ECDCCF' }}>{t(`poker.effects.${x.effect}.rule`)}</span>
              {x.level > 1 && <span className="block mt-1 text-[12.5px] leading-snug" style={{ color: '#FFE7A1' }}>{t(`poker.friends.stack.${x.effect}`, { count: x.level })}</span>}
              <span className="block mt-1 text-[12px]" style={{ color: '#c9b3ae' }}>
                {casts(x.effect) > 0 ? t('poker.tourney.castsSoFar', { count: casts(x.effect) }) : t('poker.tourney.notCastYet')}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {now && <div className="mt-4 pp-sheet-now">{now}</div>}
    </Sheet>
  );
};

export default EffectsSheet;
