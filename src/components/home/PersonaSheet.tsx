import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Info, LayoutGrid, LibraryBig, Plus, Scroll, Share2 } from 'lucide-react';
import OracleSheet from '../OracleSheet';
import MoodBars from '../MoodBars';
import PersonaWorks from '../PersonaWorks';
import PersonasModal from '../PersonasModal';
import PersonaShareModal from '../PersonaShareModal';
import { PersonaRevelationSheet, PersonaHowItWorksSheet } from '../PersonaSheets';
import { PersonaCard, PersonaCode } from '../PersonaBits';
import { MOOD_BY_LETTER, withMoodAlpha } from '../../lib/moods';
import { personaText, PERSONA_THRESHOLD, type UserPersona } from '../../lib/persona';
import { FOCUS_RING, MIST, ORACLES, PAPER, PIXEL } from '../../lib/oracleTheme';

// A gaveta da Persona (02/11/2026): tudo o que morava na seção "Sua
// personalidade cinematográfica" da Central dos Oráculos (extinta), agora
// atrás da porta da Persona, na home. Reorganizada para ler de cima para
// baixo como uma ficha:
//   com personalidade — a carta do personagem, o código, o título, o filme e
//   o texto; os quatro atalhos (Revelação, Como funciona, Personalidades,
//   Compartilhar); as obras; as nove prateleiras (antes só no computador,
//   agora em todo lugar);
//   sem personalidade — a fala do Oráculo (cinco linhas), o caminho até a
//   revelação (progresso e atalhos) e as prateleiras até agora.

type Nested = 'revelation' | 'howItWorks' | 'personas' | 'share' | null;

const GHOST_BUTTON = `inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;
const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold text-center leading-snug shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`;

const PersonaSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  persona: UserPersona | null;
  userId: string;
  username: string | null;
  onUserClick: (username: string) => void;
}> = ({ open, onClose, persona, userId, username, onUserClick }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [nested, setNested] = useState<Nested>(null);
  const hasPersona = Boolean(persona?.code && persona.persona);
  const closeNested = () => setNested(null);

  const oracleTrio = (
    <span className="flex items-center -space-x-2.5" aria-hidden>
      {ORACLES.map((oracle) => (
        <img
          key={oracle.id}
          src={oracle.avatar}
          alt=""
          width={56}
          height={56}
          decoding="async"
          className="w-14 h-14 rounded-full object-cover"
          style={{ boxShadow: `0 0 0 2px ${oracle.color}, 0 0 0 5px #120D22` }}
        />
      ))}
    </span>
  );

  // ---------- Com personalidade ----------
  const filled = (() => {
    if (!hasPersona || !persona?.persona || !persona.code) return null;
    const text = personaText(persona.persona, i18n.language);
    const glowMood = MOOD_BY_LETTER[persona.code.charAt(0)];
    const actions = [
      { key: 'revelation' as const, icon: Scroll, tint: 'text-pink-300', label: t('oracle.revelation') },
      { key: 'howItWorks' as const, icon: Info, tint: 'text-sky-300', label: t('profile.howItWorks') },
      { key: 'personas' as const, icon: LayoutGrid, tint: 'text-emerald-300', label: t('oracle.hub.archetypes') },
      { key: 'share' as const, icon: Share2, tint: 'text-amber-300', label: t('oracle.hub.share') },
    ];
    return (
      <div className="space-y-7">
        <section
          className="relative overflow-hidden rounded-2xl ring-1 ring-white/10 p-4 sm:p-6"
          style={{ background: `radial-gradient(ellipse 70% 80% at 0% 0%, ${glowMood ? withMoodAlpha(glowMood, 0.16) : 'rgba(139,92,246,0.14)'}, transparent 70%), rgba(28,20,51,0.55)` }}
        >
          <div className="flex gap-4 sm:gap-6">
            <PersonaCard persona={persona.persona} code={persona.code} alt={text.character} large eager foot={false} className="w-[112px] sm:w-[160px] shrink-0 self-start" />
            <div className="min-w-0">
              <PersonaCode code={persona.code} className="text-[3rem] sm:text-[4.2rem] leading-none" />
              <p className="mt-2 text-lg sm:text-2xl font-semibold leading-snug" style={{ color: PAPER }}>
                {text.title}
              </p>
              <p className="mt-1 text-sm" style={{ color: MIST }}>
                {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
              </p>
              <p className="hidden sm:block mt-3 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                {text.blurb}
              </p>
            </div>
          </div>
          <p className="sm:hidden mt-4 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {text.blurb}
          </p>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {actions.map(({ key, icon: Icon, tint, label }) => (
              <button key={key} type="button" onClick={() => setNested(key)} className={`${GHOST_BUTTON} justify-center px-3 whitespace-nowrap`} style={{ color: PAPER }}>
                <Icon className={`w-[18px] h-[18px] shrink-0 ${tint}`} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </section>

        <PersonaWorks persona={persona.persona} seen={persona.worksSeen} />

        <section className="rounded-2xl ring-1 ring-white/[0.07] bg-black/20 p-4 sm:p-5">
          <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl leading-tight">
            {t('oracle.hub.scales')}
          </h3>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('home.persona.scalesHint')}
          </p>
          <div className="mt-4">
            <MoodBars scores={persona.scores} compact />
          </div>
        </section>
      </div>
    );
  })();

  // ---------- Sem personalidade ainda: o convite ----------
  const empty = (() => {
    if (hasPersona) return null;
    const threshold = persona?.threshold || PERSONA_THRESHOLD;
    const counted = persona?.counted ?? 0;
    const remaining = Math.max(0, threshold - counted);
    const progress = Math.min(100, (counted / threshold) * 100);
    const needsMoreShelves = counted >= threshold;
    const lineDelay = reduceMotion ? 0 : 0.35;
    const lines = [
      { key: 'line1', className: 'text-[17px] leading-relaxed italic', color: MIST },
      { key: 'line2', className: 'text-xl font-semibold', color: PAPER },
      { key: 'line3', className: 'text-[17px] leading-relaxed italic', color: MIST },
      { key: 'line4', className: 'text-[1.6rem] sm:text-3xl leading-tight', color: '#F0ABFC', pixel: true },
      { key: 'line5', className: 'text-[17px] leading-relaxed italic', color: MIST },
    ];
    return (
      <div className="space-y-7">
        <section className="text-center px-1 sm:px-6">
          <div className="flex justify-center">{oracleTrio}</div>
          <div className="mt-7 space-y-4">
            {lines.map((line, i) => (
              <motion.p
                key={line.key}
                className={line.className}
                style={line.pixel ? { ...PIXEL, color: line.color } : { color: line.color }}
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.15 + i * lineDelay }}
              >
                {t(`oracle.intro.${line.key}`)}
              </motion.p>
            ))}
          </div>
        </section>

        <section className="rounded-2xl p-4 sm:p-6 ring-1 ring-white/10" style={{ background: 'rgba(28,20,51,0.55)' }}>
          <h3 style={{ ...PIXEL, color: PAPER }} className="text-2xl leading-tight">
            {t('oracle.intro.progressTitle')}
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed" style={{ color: MIST }}>
            {needsMoreShelves ? t('oracle.intro.needMoreShelves') : t('oracle.intro.requirement', { count: threshold })}
          </p>
          <div className="mt-5 flex items-baseline justify-between gap-3">
            <span style={{ color: PAPER }}>
              <span style={PIXEL} className="text-3xl">
                {counted}
              </span>
              <span className="text-sm" style={{ color: MIST }}>
                {' '}
                / {threshold}
              </span>
            </span>
            {!needsMoreShelves && (
              <span className="text-sm" style={{ color: MIST }}>
                {t('oracle.intro.remaining', { count: remaining })}
              </span>
            )}
          </div>
          <div
            className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={threshold}
            aria-valuenow={Math.min(counted, threshold)}
            aria-label={t('oracle.intro.progressLabel')}
          >
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('oracle.intro.countedHint')}
          </p>
          <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-2">
            {/* 09/11/2026: o convite leva ao Acervo, a página única da Mesa dos
                Oráculos (as prateleiras inteiras; cada nota conta para a Persona). */}
            <Link to="/oracle/acervo" onClick={onClose} className={PRIMARY_BUTTON}>
              <LibraryBig className="w-5 h-5 shrink-0" aria-hidden />
              {t('oracle.intro.exploreLibrary')}
            </Link>
            <Link to="/add-movies" onClick={onClose} className={`${GHOST_BUTTON} h-12 justify-center`} style={{ color: PAPER }}>
              <Plus className="w-[18px] h-[18px] text-violet-300" aria-hidden />
              {t('library.addMovies')}
            </Link>
            <button type="button" onClick={() => setNested('howItWorks')} className={`${GHOST_BUTTON} h-12 justify-center`} style={{ color: PAPER }}>
              <Info className="w-[18px] h-[18px] text-sky-300" aria-hidden />
              {t('profile.howItWorks')}
            </button>
          </div>
        </section>

        <section className="rounded-2xl ring-1 ring-white/[0.07] bg-black/20 p-4 sm:p-5">
          <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl leading-tight">
            {t('oracle.hub.shelvesSoFar')}
          </h3>
          <div className="mt-4">
            <MoodBars scores={persona?.scores ?? []} highlight={0} compact />
          </div>
        </section>
      </div>
    );
  })();

  return (
    <>
      <OracleSheet
        open={open}
        onClose={onClose}
        title={t('home.persona.title')}
        subtitle={hasPersona ? t('oracle.cinematicEssence') : t('home.persona.subtitleEmpty')}
        size="lg"
        escapeEnabled={nested === null}
      >
        {hasPersona ? filled : empty}
      </OracleSheet>

      {/* As gavetas de dentro abrem por cima desta (montam depois dela). */}
      {hasPersona && persona && <PersonaRevelationSheet open={nested === 'revelation'} onClose={closeNested} persona={persona} isOwn />}
      <PersonaHowItWorksSheet open={nested === 'howItWorks'} onClose={closeNested} persona={persona} isOwn />
      <PersonasModal isOpen={nested === 'personas'} onClose={closeNested} viewerId={userId} viewerPersonaCode={persona?.code ?? null} onUserClick={onUserClick} />
      {hasPersona && persona && <PersonaShareModal isOpen={nested === 'share'} onClose={closeNested} persona={persona} username={username} />}
    </>
  );
};

export default PersonaSheet;
