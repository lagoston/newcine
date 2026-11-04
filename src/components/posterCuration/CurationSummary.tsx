import React from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Tv } from 'lucide-react';
import { RarityGem } from '../posterJackpot/CollectorMark';
import { ChipFace } from '../posterJackpot/Chips';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { RARITY_META, type PosterRarity } from '../../lib/posterJackpot';
import { CURATION_RARITIES, goalStatus, sectionTone, type CurationCatalog, type CurationSectionKey, type CurationTotals } from '../../lib/posterCuration';
import { GoalMeter } from './CurationSection';

// Curadoria do catálogo (04/11/2026): o resumo do topo. A roleta inteira
// contra a meta de 200 numa barra só (cada raridade é um trecho na cor
// dela), as quatro raridades (cada uma leva até a sua seção), quantos são
// filmes e séries, quantos estão fora da roleta e os exclusivos do pôquer.

const CurationSummary: React.FC<{
  catalog: CurationCatalog;
  totals: CurationTotals;
  onJump: (key: CurationSectionKey) => void;
}> = ({ catalog, totals, onJump }) => {
  const { t } = useTranslation();
  // Acima da meta, a barra cresce até o total e o marco mostra onde a meta acaba.
  const scale = Math.max(totals.goal, totals.roulette) || 1;
  const goalAt = (totals.goal / scale) * 100;

  return (
    <section className="pc-panel px-4 py-4 sm:px-6 sm:py-5" aria-label={t('curation.posters.summary.label')}>
      <span className="pc-panel-stars" aria-hidden />
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
        {/* O total da roleta */}
        <div className="shrink-0">
          <p className="flex items-baseline gap-2" style={{ color: 'var(--pc-paper)' }}>
            <strong className="text-[40px] sm:text-[46px] leading-none font-bold tabular-nums">{totals.roulette}</strong>
            <span className="text-[17px] tabular-nums" style={{ color: 'var(--pc-mist)' }}>
              {t('curation.posters.summary.ofGoal', { goal: totals.goal })}
            </span>
          </p>
          <p className="pc-label mt-1.5">{t('curation.posters.summary.roulette')}</p>
        </div>

        <div className="flex-1 min-w-0">
          {/* A barra empilhada: lendário → comum, na ordem das seções. */}
          <div
            className="pc-stack"
            role="img"
            aria-label={t('curation.posters.summary.stackLabel', {
              count: totals.roulette,
              goal: totals.goal,
              status: goalStatus(t, totals.roulette, totals.goal),
            })}
          >
            {CURATION_RARITIES.map((rarity) =>
              totals.byRarity[rarity] ? (
                <span key={rarity} style={{ width: `${(totals.byRarity[rarity] / scale) * 100}%`, background: RARITY_META[rarity].color }} />
              ) : null
            )}
            {totals.roulette > totals.goal && <span className="pc-stack-goal" style={{ left: `calc(${goalAt}% - 1px)` }} />}
          </div>

          {/* As raridades: cada uma leva até a sua seção. */}
          <ul className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {CURATION_RARITIES.map((rarity: PosterRarity) => {
              const count = totals.byRarity[rarity];
              const goal = catalog.goal[rarity];
              return (
                <li key={rarity} className="min-w-0" style={sectionTone(rarity)}>
                  <button
                    type="button"
                    onClick={() => onJump(rarity)}
                    className={`pc-jump w-full ${FOCUS_RING}`}
                    aria-label={t('curation.posters.summary.jump', {
                      name: t(`curation.posters.sections.${rarity}`),
                      count,
                      goal,
                      status: goalStatus(t, count, goal),
                    })}
                  >
                    {/* Nome na fileira de cima (inteiro mesmo em 360 px); a
                        barrinha e a conta embaixo. */}
                    <RarityGem rarity={rarity} glint={rarity === 'legendary'} />
                    <span className="pc-cinzel col-span-2 truncate text-[13px] font-bold" style={{ color: 'var(--pc-tone)' }}>
                      {t(`curation.posters.sections.${rarity}`)}
                    </span>
                    <GoalMeter count={count} goal={goal} className="col-span-2" />
                    <span className="text-[13px] leading-none tabular-nums whitespace-nowrap" style={{ color: 'var(--pc-paper)' }}>
                      <strong>{count}</strong>
                      <span style={{ color: 'var(--pc-mist)' }}>/{goal}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Filmes, séries, fora da roleta e os exclusivos. */}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]" style={{ color: 'var(--pc-mist)' }}>
            <span className="inline-flex items-center gap-1.5">
              <Film className="w-4 h-4" aria-hidden />
              {t('curation.posters.summary.movies', { count: totals.movies })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Tv className="w-4 h-4" aria-hidden />
              {t('curation.posters.summary.series', { count: totals.series })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="pc-dot !mr-0" style={{ background: totals.inactive ? '#9CA3AF' : 'rgba(255,255,255,0.25)' }} aria-hidden />
              {totals.inactive ? t('curation.posters.summary.inactive', { count: totals.inactive }) : t('curation.posters.summary.inactiveNone')}
            </span>
            {totals.exclusives > 0 && (
              <button
                type="button"
                onClick={() => onJump('poker')}
                className={`inline-flex items-center gap-1.5 min-h-[44px] rounded-lg px-2 -mx-2 underline decoration-dotted underline-offset-4 decoration-white/30 hover:text-[color:var(--pc-paper)] transition-colors ${FOCUS_RING}`}
              >
                <ChipFace kind="special" className="w-4 h-4" />
                {t('curation.posters.summary.exclusives', { count: totals.exclusives })}
              </button>
            )}
          </p>
        </div>
      </div>
    </section>
  );
};

export default CurationSummary;
