import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import OracleSheet from './OracleSheet';
import { PersonaCode, PersonaPoster, MoodChip } from './PersonaBits';
import { MOOD_BY_LETTER, withMoodAlpha } from '../lib/moods';
import { personaText, topMoodKeys, type UserPersona } from '../lib/persona';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

interface PersonalityCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  persona: UserPersona;
  // true quando a pessoa já tinha outra personalidade e ela mudou.
  changed?: boolean;
}

// A revelação: aparece na Central dos Oráculos na primeira vez que a
// personalidade surge (10 filmes das prateleiras avaliados) e toda vez que
// ela muda. Única animação: o cartão da persona entrando depois das falas.
export default function PersonalityCompletionModal({ isOpen, onClose, persona, changed = false }: PersonalityCompletionModalProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  if (!persona.code || !persona.persona) return null;

  const text = personaText(persona.persona, i18n.language);
  const glow = MOOD_BY_LETTER[persona.code.charAt(0)];

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={changed ? t('oracle.reveal.changedTitle') : t('oracle.reveal.title')}
      subtitle={changed ? t('oracle.reveal.changedSubtitle') : t('oracle.cinematicEssence')}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-fuchsia-500/15 ring-1 ring-fuchsia-400/30">
          <Sparkles className="w-5 h-5 text-fuchsia-300" aria-hidden />
        </span>
      }
      size="lg"
      bodyClassName="px-5 sm:px-8 py-7 text-center"
      footer={
        <button
          onClick={onClose}
          className={`w-full gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
        >
          {t('oracle.reveal.cta')}
        </button>
      }
    >
      <p className="text-[17px] leading-relaxed italic" style={{ color: MIST }}>
        {changed ? t('oracle.reveal.changedLine') : t('oracle.reveal.line1')}
      </p>
      {!changed && (
        <p className="mt-3 text-[17px] leading-relaxed italic" style={{ color: MIST }}>
          {t('oracle.reveal.line2')}
        </p>
      )}

      <motion.div
        className="mt-7 mx-auto max-w-md rounded-2xl p-5 sm:p-6"
        style={{
          background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${glow ? withMoodAlpha(glow, 0.16) : 'rgba(139,92,246,0.16)'}, transparent 70%), ${VELVET}`,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)',
        }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 18, delay: reduceMotion ? 0 : 0.45 }}
      >
        <PersonaPoster path={persona.persona.posterPath} alt={text.film} className="mx-auto w-[120px] rounded-xl shadow-2xl" eager />
        <PersonaCode code={persona.code} className="mt-5 block text-6xl leading-none" />
        <p className="mt-3 text-xl font-semibold leading-snug" style={{ color: PAPER }}>
          {text.title}
        </p>
        <p className="mt-1 text-sm" style={{ color: MIST }}>
          {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
        </p>
        <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
          {topMoodKeys(persona).map((key, i) => (
            <li key={key}>
              <MoodChip moodKey={key} rank={i + 1} size="sm" />
            </li>
          ))}
        </ul>
      </motion.div>

      <p className="mt-7 text-sm leading-relaxed" style={{ color: MIST }}>
        {t('oracle.reveal.dynamicNote')}
      </p>
      <p style={{ ...PIXEL, color: '#F0ABFC' }} className="mt-5 text-2xl leading-tight">
        {t('oracle.reveal.closing')}
      </p>
    </OracleSheet>
  );
}
