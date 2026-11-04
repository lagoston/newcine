import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Download, Star, Wand2 } from 'lucide-react';
import { MIST, PAPER, PIXEL, VELVET, ratingTone, withAlpha } from '../../lib/oracleTheme';
import { MOOD_BY_LETTER } from '../../lib/moods';
import { formatChance } from '../../lib/prediction';
import { PersonaCode } from '../PersonaBits';
import { ExampleTag, SectionHeading } from './LandingBits';
import { demoPanel, formatScore, PERSONA_EXAMPLE, PREDICTION_EXAMPLE, titleName, titlePoster } from './landingData';

// "Como funciona" (04/11/2026): os três passos de verdade, cada um com uma
// miniatura feita das peças do próprio site:
//   1. a régua de notas de 0 a 10 nas cores das rating boxes (ratingTone) e a
//      Watchlist em azul-céu — e a importação do IMDb (AddMovies);
//   2. a nota prevista (o selo violeta) e a chance de virar 10, como no menu
//      do título (lib/prediction) — marcada como "Exemplo";
//   3. o código de três letras da Persona, nas cores das prateleiras.

const RATINGS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const RatingRail: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div>
      <ol className="grid grid-cols-11 gap-1" aria-label={t('guestHome.step1Rail')}>
        {RATINGS.map((n) => {
          const tone = ratingTone(n);
          return (
            <li
              key={n}
              style={{ ...PIXEL, color: tone.color, background: withAlpha(tone.color, 0.13), boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
              className="grid place-items-center aspect-square rounded-md text-[13px] sm:text-sm leading-none"
            >
              {n}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full pl-1.5 pr-3 py-1 text-xs font-semibold" style={{ color: '#7DD3FC', background: 'rgba(125,211,252,0.12)', boxShadow: 'inset 0 0 0 1px rgba(125,211,252,0.4)' }}>
          <span className="grid place-items-center w-5 h-5 rounded-full bg-sky-500/95 text-white" aria-hidden>
            <Bookmark className="w-3 h-3 fill-current" />
          </span>
          {t('guestHome.step1Watchlist')}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ color: PAPER, background: 'rgba(245,197,24,0.1)', boxShadow: 'inset 0 0 0 1px rgba(245,197,24,0.38)' }}>
          <Download className="w-3.5 h-3.5 text-amber-300" aria-hidden />
          {t('guestHome.step1Imdb')}
        </span>
      </div>
    </div>
  );
};

const PredictionDemo: React.FC = () => {
  const { t, i18n } = useTranslation();
  const ex = PREDICTION_EXAMPLE;
  return (
    <div className="flex gap-3.5 items-start">
      <span className="relative block w-[64px] shrink-0 aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
        <img src={`https://image.tmdb.org/t/p/w185${titlePoster(ex, i18n.language)}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: PAPER }}>{titleName(ex, i18n.language)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 pl-2 pr-2.5 py-1 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20">
            <Wand2 className="w-3.5 h-3.5" aria-hidden />
            <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
            <span style={PIXEL} className="text-base leading-none">{ex.predicted}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-xs" style={{ color: MIST }}>
            <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
            {t('guestHome.ticketAudience', { score: formatScore(ex.publicScore, i18n.language) })}
          </span>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold" style={{ color: ratingTone(10).color }}>
          {t('guestHome.step2Chance', { chance: formatChance(ex.chance10) })}
          <ExampleTag />
        </p>
      </div>
    </div>
  );
};

const PersonaDemo: React.FC = () => {
  const { t, i18n } = useTranslation();
  const p = PERSONA_EXAMPLE;
  const pt = i18n.language.startsWith('pt');
  return (
    <div className="relative">
      <div className="flex items-end gap-3">
        <PersonaCode code={p.code} className="text-[44px] leading-none tracking-[0.1em]" />
        <ExampleTag className="mb-1.5" />
      </div>
      <div className="mt-2.5 flex h-1.5 rounded-full overflow-hidden max-w-[150px]" aria-hidden>
        {p.code.split('').map((letter) => (
          <span key={letter} className="flex-1" style={{ background: MOOD_BY_LETTER[letter]?.color }} />
        ))}
      </div>
      <p className="mt-2.5 text-sm font-semibold" style={{ color: PAPER }}>
        {pt ? p.titlePt : p.titleEn}
      </p>
      {/* O nome curto do filme: o completo não cabe na miniatura. */}
      <p className="mt-0.5 text-xs" style={{ color: MIST }}>
        {t('guestHome.personaCharacter', { character: pt ? p.characterPt : p.characterEn, film: pt ? 'Brilho Eterno' : 'Eternal Sunshine', year: p.filmYear })}
      </p>
    </div>
  );
};

const STEPS = [
  { key: 'step1', accent: '#86EFAC', Demo: RatingRail },
  { key: 'step2', accent: '#A78BFA', Demo: PredictionDemo },
  { key: 'step3', accent: '#F472B6', Demo: PersonaDemo },
] as const;

const LandingSteps: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className="border-t border-white/[0.07]" aria-labelledby="lp-how">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-24">
        <SectionHeading id="lp-how" eyebrow={t('guestHome.howEyebrow')} title={t('guestHome.howTitle')} accent="#C4B5FD" />
        {/* Celular: um passo embaixo do outro. Tablet (sm–lg): cada passo numa
            faixa, o texto à esquerda e a miniatura à direita. Computador (lg):
            os três lado a lado. */}
        <ol className="mt-10 sm:mt-12 grid gap-4 lg:grid-cols-3 lg:gap-5">
          {STEPS.map(({ key, accent, Demo }, i) => (
            <li
              key={key}
              className="flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-8 sm:content-start lg:flex rounded-2xl p-5 sm:p-6"
              style={demoPanel(accent)}
            >
              <div className="flex items-center gap-3 sm:col-start-1">
                <span
                  aria-hidden
                  style={{ ...PIXEL, color: accent, background: withAlpha(accent, 0.12), boxShadow: `inset 0 0 0 1px ${withAlpha(accent, 0.4)}` }}
                  className="grid place-items-center w-9 h-9 shrink-0 rounded-full text-lg leading-none"
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>{t(`guestHome.${key}Title`)}</h3>
              </div>
              <p className="mt-2.5 text-sm sm:text-[15px] leading-relaxed sm:col-start-1" style={{ color: MIST }}>{t(`guestHome.${key}Desc`)}</p>
              <div className="mt-auto pt-5 sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:self-center sm:pt-0 lg:pt-5">
                <Demo />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default LandingSteps;
