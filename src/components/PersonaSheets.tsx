import React from 'react';
import { useTranslation } from 'react-i18next';
import { Scroll } from 'lucide-react';
import OracleSheet from './OracleSheet';
import MoodBars from './MoodBars';
import { PersonaCode, PersonaCard, MoodChip } from './PersonaBits';
import PersonaWorks from './PersonaWorks';
import { MOODS, MOOD_BY_KEY, withMoodAlpha } from '../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD, type UserPersona } from '../lib/persona';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// As duas gavetas da personalidade cinematográfica — "Revelação" (a leitura
// completa) e "Como funciona" (a Arquitetura da Alma). Abertas pelo bloco de
// personalidade do Perfil (EssenceRing) e pela Central dos Oráculos.

// Revelação — quem você é no cinema.
export const PersonaRevelationSheet: React.FC<{ open: boolean; onClose: () => void; persona: UserPersona; isOwn?: boolean }> = ({ open, onClose, persona, isOwn = false }) => {
  const { t, i18n } = useTranslation();
  if (!persona.persona || !persona.code) return null;
  const text = personaText(persona.persona, i18n.language);

  return (
    <OracleSheet
      open={open}
      onClose={onClose}
      title={t('oracle.revelation')}
      subtitle={text.title}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
          <Scroll className="w-5 h-5 text-pink-300" aria-hidden />
        </span>
      }
      size="lg"
      bodyClassName="px-5 sm:px-7 py-6 space-y-6"
    >
      <div className="flex gap-4 sm:gap-5">
        <PersonaCard persona={persona.persona} code={persona.code} alt={text.character} foot={false} large eager className="w-[104px] sm:w-[132px] shrink-0 self-start" />
        <div className="min-w-0">
          <PersonaCode code={persona.code} className="text-4xl sm:text-5xl leading-none" />
          <p className="mt-2 text-lg sm:text-xl font-semibold leading-snug" style={{ color: PAPER }}>
            {text.title}
          </p>
          <p className="mt-1 text-sm" style={{ color: MIST }}>
            {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {text.blurb}
          </p>
        </div>
      </div>

      <PersonaWorks persona={persona.persona} seen={persona.worksSeen} />

      <section>
        <h3 className="font-semibold" style={{ color: PAPER }}>
          {isOwn ? t('oracle.persona.yourShelves') : t('oracle.persona.theirShelves')}
        </h3>
        <ol className="mt-3 space-y-3">
          {topMoodKeys(persona).map((key, i) => {
            const mood = MOOD_BY_KEY[key];
            if (!mood) return null;
            return (
              <li key={key} className="rounded-xl p-4 ring-1 ring-white/10" style={{ background: `linear-gradient(90deg, ${withMoodAlpha(mood, 0.1)}, transparent 70%), ${VELVET}` }}>
                <MoodChip moodKey={key} rank={i + 1} />
                <p className="mt-2.5 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                  {t(mood.readingKey)}
                </p>
              </li>
            );
          })}
        </ol>
      </section>
    </OracleSheet>
  );
};

// Como funciona — a Arquitetura da Alma.
export const PersonaHowItWorksSheet: React.FC<{ open: boolean; onClose: () => void; persona: UserPersona | null; isOwn?: boolean }> = ({ open, onClose, persona, isOwn = true }) => {
  const { t } = useTranslation();
  const threshold = persona?.threshold || PERSONA_THRESHOLD;

  const step = (n: number, color: string, title: string, children: React.ReactNode) => (
    <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
      <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
        <span style={{ ...PIXEL, color }} className="text-lg">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <OracleSheet open={open} onClose={onClose} title={t('oracle.architectureTitle')} subtitle={t('oracle.howItWorks.intro')} size="lg" bodyClassName="px-5 sm:px-7 py-6 space-y-4">
      {step(
        1,
        '#C4B5FD',
        t('oracle.howItWorks.shelvesTitle'),
        <>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('oracle.howItWorks.shelvesText')}
          </p>
          <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MOODS.map((mood) => (
              <li key={mood.key} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 bg-black/25 min-w-0">
                <span style={{ ...PIXEL, color: mood.color }} className="w-4 shrink-0 text-lg leading-none text-center" aria-hidden>
                  {mood.letter}
                </span>
                <span className="text-sm truncate" style={{ color: PAPER }}>
                  {t(mood.labelKey)}
                </span>
              </li>
            ))}
          </ul>
        </>,
      )}

      {step(
        2,
        '#FCD34D',
        isOwn ? t('oracle.howItWorks.pointsTitle') : t('oracle.howItWorks.pointsTitleOther'),
        <>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('oracle.howItWorks.pointsText')}
          </p>
          <div className="mt-4">
            <MoodBars scores={persona?.scores ?? []} highlight={persona?.code ? 3 : 0} />
          </div>
        </>,
      )}

      {step(
        3,
        '#7DD3FC',
        isOwn ? t('oracle.howItWorks.personaTitle') : t('oracle.howItWorks.personaTitleOther'),
        <>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('oracle.howItWorks.personaText')}
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('oracle.howItWorks.thresholdText', { count: threshold })}
          </p>
        </>,
      )}
    </OracleSheet>
  );
};
