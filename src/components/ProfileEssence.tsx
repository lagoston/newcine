import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scroll, Info } from 'lucide-react';
import OracleSheet from './OracleSheet';
import MoodBars from './MoodBars';
import { PersonaCode, PersonaPoster, MoodChip } from './PersonaBits';
import { PROFILE_GHOST_BUTTON } from './ProfileIdentityCard';
import { PROFILE_CARD } from './ProfileTaste';
import { MOODS, MOOD_BY_KEY, withMoodAlpha } from '../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD, type UserPersona } from '../lib/persona';
import { VELVET, PAPER, MIST, PIXEL, glassPanel, PROFILE_ACCENTS } from '../lib/oracleTheme';

// Personalidade cinematográfica de um perfil: o cartão com o código (ex.:
// MPC), o título, o personagem e as três prateleiras, mais as duas gavetas
// — "Revelação" (a leitura completa) e "Como funciona" (a Arquitetura da
// Alma). Usado no seu Perfil e no perfil de outra pessoa; as gavetas
// também são exportadas sozinhas pra Central dos Oráculos.

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
        <PersonaPoster path={persona.persona.posterPath} alt={text.film} className="w-[92px] sm:w-[112px] shrink-0 rounded-lg self-start" eager />
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

interface ProfileEssenceProps {
  loading: boolean;
  persona: UserPersona | null;
  // Seu próprio perfil ("Suas prateleiras") ou o de outra pessoa.
  isOwn?: boolean;
  // O que mostrar quando ainda não há personalidade.
  emptyState: React.ReactNode;
}

const ProfileEssence: React.FC<ProfileEssenceProps> = ({ loading, persona, isOwn = false, emptyState }) => {
  const { t, i18n } = useTranslation();
  const [showRevelation, setShowRevelation] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  if (loading) {
    return (
      <div className={`${PROFILE_CARD} flex gap-5`} style={glassPanel(PROFILE_ACCENTS.essence)} aria-busy="true">
        <div className="w-[72px] aspect-[2/3] rounded-lg bg-white/10 animate-pulse" />
        <div className="flex-1 space-y-3">
          <div className="h-10 w-32 rounded-lg bg-white/10 animate-pulse" />
          <div className="h-4 w-full max-w-sm rounded bg-white/10 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!persona?.code || !persona.persona) return <>{emptyState}</>;

  const text = personaText(persona.persona, i18n.language);
  // O vidro reflete a cor da prateleira mais forte da pessoa.
  const essenceAccent = MOOD_BY_KEY[topMoodKeys(persona)[0]]?.color ?? PROFILE_ACCENTS.essence;

  return (
    <>
      <div className={PROFILE_CARD} style={glassPanel(essenceAccent)}>
        <div className="flex flex-col md:flex-row md:items-center gap-5">
          <div className="flex gap-4 sm:gap-5 min-w-0 flex-1">
            <PersonaPoster path={persona.persona.posterPath} alt={text.film} className="w-[72px] sm:w-[84px] shrink-0 rounded-lg self-start" />
            <div className="min-w-0">
              <PersonaCode code={persona.code} className="text-4xl leading-none" />
              <p className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                {text.title}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: MIST }}>
                {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {topMoodKeys(persona).map((key, i) => (
                  <li key={key}>
                    <MoodChip moodKey={key} rank={i + 1} size="sm" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowRevelation(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
              <Scroll className="w-[18px] h-[18px] text-pink-300" aria-hidden />
              {t('oracle.revelation')}
            </button>
            <button onClick={() => setShowHowItWorks(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
              <Info className="w-[18px] h-[18px] text-sky-300" aria-hidden />
              {t('profile.howItWorks')}
            </button>
          </div>
        </div>
      </div>

      <PersonaRevelationSheet open={showRevelation} onClose={() => setShowRevelation(false)} persona={persona} isOwn={isOwn} />
      <PersonaHowItWorksSheet open={showHowItWorks} onClose={() => setShowHowItWorks(false)} persona={persona} isOwn={isOwn} />
    </>
  );
};

export default ProfileEssence;
