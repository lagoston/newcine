import React from 'react';
import { useTranslation } from 'react-i18next';
import { MIST, PAPER, PIXEL, VELVET, tagCategoryStyle, withAlpha } from '../../lib/oracleTheme';
import { SEASONAL_THEMES } from '../../lib/seasonalEvents';
import PosterArt, { RarityTag } from '../posterJackpot/PosterArt';
import { PersonaCode } from '../PersonaBits';
import { SectionHeading } from './LandingBits';
import { JACKPOT_FAN, PERSONA_EXAMPLE } from './landingData';

// "Entre uma sessão e outra" (04/11/2026): o lado de jogo, de propósito
// depois de tudo o que é cinema e num tamanho menor — tempero, não prato
// principal (a preocupação do Bruno com o site parecer de jogos). Três
// cartões curtos, cada um com as peças reais:
//   • Poster Jackpot — os três pôsteres de Breaking Bad do catálogo, com o
//     efeito holográfico de verdade no lendário (PosterArt), e as trocas e o
//     Mercado Negro da Cobra no texto. O título vai na fonte pixel do
//     CineOracle, não na Cinzel do cassino: a fonte do Jackpot não precisa
//     ser baixada para quem ainda nem tem conta;
//   • Tags e eventos — pílulas de tag nas cores das categorias
//     (tagCategoryStyle) e os dois eventos do ano (lib/seasonalEvents);
//   • Perfil — banner e moldura de verdade (cosmetics.css, o tema Matrix da
//     tag Red-Pill Adept), com o selo Premium: a maior parte da
//     personalização é do Premium (lib/frames, lib/banners).
// O Pôster Poker não aparece: ainda não foi lançado.

const FAN_POSE = [
  { rotate: -12, x: -58, z: 1 },
  { rotate: 12, x: 58, z: 1 },
  { rotate: 0, x: 0, z: 2 },
];

// Tags reais de lib/tags.ts (e a do Halloween, de lib/seasonalEvents).
const TAGS: { category: 'basic' | 'theme' | 'oracle' | 'special'; emoji: string; name: string }[] = [
  { category: 'theme', emoji: '💊', name: 'Red-Pill Adept' },
  { category: 'oracle', emoji: '🐸', name: 'Quick Tongue' },
  { category: 'basic', emoji: '🍿', name: 'Popcorn Pro' },
  { category: 'special', emoji: '🎃', name: 'Headless Horseman' },
];

// Um cartão: a arte (sempre com a mesma altura, para os títulos ficarem
// alinhados) e o texto. Celular: um embaixo do outro. Tablet (sm–lg): a arte
// à esquerda e o texto à direita. Computador (lg): três colunas.
const ExtraCard: React.FC<{ accent: string; art: React.ReactNode; children: React.ReactNode }> = ({ accent, art, children }) => (
  <li
    className="grid gap-5 sm:grid-cols-2 sm:gap-6 sm:items-center lg:flex lg:flex-col lg:items-stretch lg:gap-0 rounded-2xl p-5 overflow-hidden"
    style={{
      background: [
        `radial-gradient(90% 70% at 100% 0%, ${withAlpha(accent, 0.14)}, transparent 65%)`,
        'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01) 60%)',
        'rgba(28,20,51,0.5)',
      ].join(', '),
      boxShadow: `inset 0 0 0 1px ${withAlpha(accent, 0.22)}`,
    }}
  >
    <div className="relative h-[172px] min-w-0">{art}</div>
    <div className="min-w-0 lg:mt-5">{children}</div>
  </li>
);

const JackpotCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ExtraCard
      accent="#F4C454"
      art={
        // O leque: o épico à esquerda, o raro à direita e o lendário (holo) no meio.
        <div className="absolute inset-0" role="img" aria-label={t('guestHome.jackpotArt')}>
          <span
            aria-hidden
            className="absolute inset-x-6 bottom-6 top-2 rounded-full blur-2xl opacity-60"
            style={{ background: 'radial-gradient(circle, rgba(80,96,220,0.45), transparent 70%)' }}
          />
          {JACKPOT_FAN.map((poster, i) => (
            <span
              key={poster.filePath}
              className="absolute left-1/2 top-[44%] w-[84px]"
              style={{ transform: `translate(calc(-50% + ${FAN_POSE[i].x}px), -50%) rotate(${FAN_POSE[i].rotate}deg)`, zIndex: FAN_POSE[i].z }}
            >
              <PosterArt filePath={poster.filePath} effect={poster.effect} size="w185" className="aspect-[2/3] rounded-lg shadow-[0_12px_24px_-10px_rgba(0,0,0,0.9)]" />
            </span>
          ))}
          <span className="absolute inset-x-0 bottom-0 z-[3] flex justify-center gap-1.5" aria-hidden>
            <RarityTag rarity="rare" />
            <RarityTag rarity="epic" />
            <RarityTag rarity="legendary" />
          </span>
        </div>
      }
    >
      <h3 style={{ ...PIXEL, color: '#F4C454' }} className="text-[22px] leading-none">Poster Jackpot</h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>{t('guestHome.jackpotDesc')}</p>
    </ExtraCard>
  );
};

const TagsCard: React.FC = () => {
  const { t } = useTranslation();
  const halloween = SEASONAL_THEMES.halloween;
  const christmas = SEASONAL_THEMES.christmas;
  return (
    <ExtraCard
      accent="#38BDF8"
      art={
        <div className="h-full flex flex-col justify-center gap-3">
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <span key={tag.name} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${tagCategoryStyle(tag.category).pill}`}>
                <span aria-hidden>{tag.emoji}</span>
                {tag.name}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            {[
              { theme: halloween, label: t('guestHome.eventHalloween') },
              { theme: christmas, label: t('guestHome.eventChristmas') },
            ].map(({ theme, label }) => (
              <span
                key={theme.id}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5"
                style={{ color: theme.accentText, background: withAlpha(theme.accent, 0.12), boxShadow: `inset 0 0 0 1px ${withAlpha(theme.accent, 0.4)}` }}
              >
                <span aria-hidden>{theme.emoji}</span>
                {label}
              </span>
            ))}
          </div>
        </div>
      }
    >
      <h3 style={{ ...PIXEL, color: '#7DD3FC' }} className="text-[22px] leading-none">{t('guestHome.tagsTitle')}</h3>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>{t('guestHome.tagsDesc')}</p>
    </ExtraCard>
  );
};

const ProfileCard: React.FC = () => {
  const { t } = useTranslation();
  return (
    <ExtraCard
      accent="#4ADE80"
      art={
        // Um perfil em miniatura: o banner e a moldura do tema Matrix, de verdade.
        <div aria-hidden className="co-banner co-banner--matrix relative w-full h-full rounded-xl overflow-hidden px-4 py-4 flex items-end">
          <div className="relative z-[1] flex items-center gap-3.5 min-w-0">
            <span className="co-frame co-frame--matrix relative block w-[68px] h-[68px] shrink-0 rounded-full overflow-hidden" style={{ background: VELVET }}>
              <span className="absolute inset-0 grid place-items-center text-2xl" style={{ ...PIXEL, color: PAPER }}>
                {t('feed.you').slice(0, 1)}
              </span>
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-2">
                <span className="text-lg font-semibold leading-tight truncate" style={{ color: PAPER }}>{t('feed.you')}</span>
                <PersonaCode code={PERSONA_EXAMPLE.code} className="text-base leading-none tracking-[0.08em]" />
              </span>
              <span className={`mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tagCategoryStyle('theme').pill}`}>
                <span>💊</span>
                Red-Pill Adept
              </span>
            </span>
          </div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h3 style={{ ...PIXEL, color: '#86EFAC' }} className="text-[22px] leading-none">{t('guestHome.profileTitle')}</h3>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none text-amber-200 bg-amber-500/15 ring-1 ring-amber-400/40">
          {t('oracle.hub.premiumChip')}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>{t('guestHome.profileDesc')}</p>
    </ExtraCard>
  );
};

const LandingExtras: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className="border-t border-white/[0.07]" aria-labelledby="lp-extras">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-24">
        <SectionHeading
          id="lp-extras"
          eyebrow={t('guestHome.extrasEyebrow')}
          title={t('guestHome.extrasTitle')}
          subtitle={t('guestHome.extrasSubtitle')}
          accent="#F4C454"
        />
        <ul className="mt-10 sm:mt-12 grid gap-4 lg:grid-cols-3 lg:gap-5">
          <JackpotCard />
          <TagsCard />
          <ProfileCard />
        </ul>
      </div>
    </section>
  );
};

export default LandingExtras;
