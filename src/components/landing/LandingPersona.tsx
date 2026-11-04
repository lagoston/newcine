import React from 'react';
import { useTranslation } from 'react-i18next';
import { MIST, PAPER, PIXEL, withAlpha } from '../../lib/oracleTheme';
import { MOODS, MOOD_BY_KEY } from '../../lib/moods';
import { PERSONA_THRESHOLD, personaText } from '../../lib/persona';
import { PersonaCard, PersonaCode } from '../PersonaBits';
import { ExampleTag, SectionHeading } from './LandingBits';
import { demoPanel, PERSONA_EXAMPLE, PERSONA_EXAMPLE_STRENGTH } from './landingData';

// A Persona (04/11/2026). O texto antigo falava de "um questionário curto",
// que não existe mais: hoje a personalidade é a soma das nove prateleiras
// (lib/persona, oracle.howItWorks). À esquerda, as nove prateleiras como
// etiquetas de fita — letra, nome e o que mora nelas (lib/moods); as três do
// exemplo acendem. À direita, a carta de uma personalidade real (MCR, de
// cine_personas) com as três barras de força, como na porta da Persona.

const LandingPersona: React.FC = () => {
  const { t, i18n } = useTranslation();
  const persona = PERSONA_EXAMPLE;
  const text = personaText(persona, i18n.language);
  const lit = new Set(persona.moodKeys);

  return (
    <section className="border-t border-white/[0.07]" aria-labelledby="lp-persona">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 sm:py-24 grid gap-10 lg:grid-cols-12 lg:gap-12 items-start">
        <div className="min-w-0 lg:col-span-7">
          <SectionHeading
            id="lp-persona"
            eyebrow={t('guestHome.personaEyebrow')}
            title={t('guestHome.personaTitle')}
            subtitle={t('guestHome.personaText')}
            accent="#F472B6"
          />
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: MIST }}>
            {t('guestHome.shelvesLabel')}
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:gap-2.5">
            {MOODS.map((mood) => {
              const on = lit.has(mood.key);
              const Icon = mood.icon;
              return (
                <li
                  key={mood.key}
                  className="relative flex flex-col min-w-0 rounded-xl pl-3 pr-2 py-2.5 sm:pl-3.5 sm:py-3 overflow-hidden"
                  style={{
                    background: on ? withAlpha(mood.color, 0.14) : 'rgba(28,20,51,0.55)',
                    boxShadow: on ? `inset 0 0 0 1.5px ${withAlpha(mood.color, 0.75)}, 0 0 22px -8px ${mood.color}` : 'inset 0 0 0 1px rgba(243,234,211,0.1)',
                  }}
                >
                  {/* a lombada da fita, na cor da prateleira */}
                  <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1" style={{ background: mood.color, opacity: on ? 1 : 0.7 }} />
                  <span className="flex items-center justify-between gap-1">
                    <span style={{ ...PIXEL, color: mood.color }} className="text-2xl sm:text-[28px] leading-none" aria-hidden>
                      {mood.letter}
                    </span>
                    <Icon className="w-4 h-4 shrink-0" style={{ color: mood.color }} aria-hidden />
                  </span>
                  <span className="mt-1.5 text-[12px] sm:text-sm font-semibold leading-tight break-words" style={{ color: PAPER }}>
                    {t(mood.labelKey)}
                  </span>
                  <span className="hidden sm:block mt-0.5 text-xs leading-snug" style={{ color: MIST }}>
                    {t(mood.tagKey)}
                  </span>
                  {on && <span className="sr-only">{t('guestHome.shelfInExample')}</span>}
                </li>
              );
            })}
          </ul>
          <p className="mt-5 text-sm leading-relaxed max-w-[40rem]" style={{ color: MIST }}>
            {t('guestHome.personaThreshold', { count: PERSONA_THRESHOLD })}
          </p>
        </div>

        <figure className="min-w-0 lg:col-span-5 relative rounded-2xl p-5 sm:p-6" style={demoPanel('#F472B6')}>
          <ExampleTag className="absolute top-4 right-4" />
          <div className="flex gap-4 sm:gap-5 items-start">
            <PersonaCard persona={persona} code={persona.code} className="w-[120px] sm:w-[150px] shrink-0" alt={text.character} />
            <div className="min-w-0 pt-1">
              <PersonaCode code={persona.code} className="text-[30px] sm:text-[34px] leading-none tracking-[0.1em]" />
              <p style={{ ...PIXEL, color: PAPER }} className="mt-2 text-xl sm:text-2xl leading-tight">{text.title}</p>
              <p className="mt-1.5 text-sm leading-snug" style={{ color: MIST }}>
                {t('guestHome.personaCharacter', { character: text.character, film: text.film, year: persona.filmYear })}
              </p>
            </div>
          </div>
          <figcaption className="mt-4 text-sm leading-relaxed" style={{ color: PAPER }}>
            {text.blurb}
          </figcaption>
          {/* As três prateleiras do código e a força de cada uma (a mais forte
              enche a barra), como na porta da Persona. */}
          <ul className="mt-5 flex flex-col gap-2.5">
            {PERSONA_EXAMPLE_STRENGTH.map(({ mood: key, share }) => {
              const mood = MOOD_BY_KEY[key];
              return (
                <li key={key} className="flex items-center gap-2.5">
                  <span
                    className="grid place-items-center w-6 h-6 shrink-0 rounded-md text-sm leading-none"
                    style={{ ...PIXEL, color: mood.color, background: withAlpha(mood.color, 0.18), boxShadow: `inset 0 0 0 1px ${withAlpha(mood.color, 0.45)}` }}
                    aria-hidden
                  >
                    {mood.letter}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold leading-none" style={{ color: mood.color }}>{t(mood.labelKey)}</span>
                    <span className="mt-1.5 block h-1 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${share * 100}%`, background: mood.color, boxShadow: `0 0 6px ${withAlpha(mood.color, 0.6)}` }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </figure>
      </div>
    </section>
  );
};

export default LandingPersona;
