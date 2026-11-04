import React from 'react';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST } from '../../lib/oracleTheme';
import { ChipFace } from '../posterJackpot/Chips';
import PosterArt, { EffectTag } from '../posterJackpot/PosterArt';
import type { PosterEffect, PosterRarity } from '../../lib/posterJackpot';
import { ChapterHeader, PREMIUM_GOLD } from './parts';
import './premium.css';

// Rolo 2 da página Premium (04/11/2026): a ficha especial do Poster Jackpot.
// Conferido no banco: get_jackpot_state dá a ficha semanal (special_weekly)
// só a quem tem is_premium_active, uma por semana de segunda a domingo
// (jackpot_week_start, horário de Brasília), e ela não acumula; a ficha
// especial sempre tira pôster com efeito (jackpot.machine.specialHint).
//
// As peças são as do próprio Jackpot (ChipFace e PosterArt, só importadas):
// três pôsteres de verdade do catálogo, um com cada efeito, com a marca de
// colecionador (raridade + número de série do catálogo).
const POSTERS: { filePath: string; effect: Exclude<PosterEffect, 'none' | 'gold'>; rarity: PosterRarity; serial: number; titleKey: string }[] = [
  // Blade Runner (catálogo #237, épico, nº 41)
  { filePath: '/4EwTF31tnul7XNgwFCLcmQwGPti.jpg', effect: 'negative', rarity: 'epic', serial: 41, titleKey: 'bladeRunner' },
  // 2001: Uma Odisseia no Espaço (catálogo #61, lendário, nº 13)
  { filePath: '/g1wyGaLmRBFsJXNWh52DCpxvIxk.jpg', effect: 'holo', rarity: 'legendary', serial: 13, titleKey: 'odyssey' },
  // Clube da Luta (catálogo #19, épico, nº 3)
  { filePath: '/vCsHerGMuhxI5VHUhKVdah3NCo3.jpg', effect: 'ultra_red', rarity: 'epic', serial: 3, titleKey: 'fightClub' },
];

// Posição de cada pôster no leque (o do meio na frente).
const FAN = [
  'left-[6%] top-[14%] -rotate-[9deg] z-[1]',
  'left-1/2 -translate-x-1/2 top-0 z-[3]',
  'right-[6%] top-[14%] rotate-[9deg] z-[2]',
];

const PremiumCollection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="prm-collection" className="py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div>
          <ChapterHeader
            id="prm-collection"
            reel={t('premium.page.reel', { n: 2, label: t('premium.page.collection.kicker') })}
            title={t('premium.page.collection.title')}
            lead={t('premium.page.collection.body')}
          />
          <p className="mt-3 text-sm font-semibold" style={{ color: PREMIUM_GOLD }}>
            {t('premium.page.collection.rule')}
          </p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label={t('premium.page.collection.effectsAria')}>
            {POSTERS.map((p) => (
              <li key={p.effect}>
                <EffectTag effect={p.effect} className="!text-[13px] !px-3 !py-1.5" />
              </li>
            ))}
          </ul>
        </div>

        {/* Os três pôsteres com efeito e a ficha especial na frente. */}
        <figure className="relative mx-auto w-full max-w-[440px]">
          <div className="relative h-[280px] sm:h-[340px]" aria-hidden>
            <span
              className="absolute inset-x-[10%] top-[8%] bottom-[8%] rounded-full blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(178,58,174,0.38), rgba(244,196,84,0.12) 60%, transparent 75%)' }}
            />
            {POSTERS.map((p, i) => (
              <PosterArt
                key={p.filePath}
                filePath={p.filePath}
                effect={p.effect}
                size="w342"
                alt=""
                mark={{ rarity: p.rarity, serial: p.serial, size: 'xs' }}
                className={`absolute ${FAN[i]} w-[38%] aspect-[2/3] rounded-lg shadow-2xl ring-1 ring-white/10`}
              />
            ))}
            <span className="absolute left-[2%] bottom-[2%] z-[4] w-[92px] sm:w-[112px]">
              <ChipFace kind="special" className="prm-float block w-full h-auto drop-shadow-[0_14px_18px_rgba(0,0,0,0.6)]" />
            </span>
          </div>
          <figcaption className="mt-4 text-center text-[13px]" style={{ color: MIST }}>
            <span style={{ color: PAPER }}>{t('premium.page.collection.chipName')}</span>
            {' · '}
            {POSTERS.map((p) => t(`premium.page.collection.posters.${p.titleKey}`)).join(', ')}
          </figcaption>
        </figure>
      </div>
    </section>
  );
};

export default PremiumCollection;
