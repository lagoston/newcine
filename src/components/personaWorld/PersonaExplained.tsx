import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Share2 } from 'lucide-react';
import { MOOD_BY_LETTER, withMoodAlpha } from '../../lib/moods';
import { personaText } from '../../lib/persona';
import type { PersonaWorld, WorldState } from '../../lib/personaWorld';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET } from '../../lib/oracleTheme';
import { MoodChip, PersonaCard, PersonaCode } from '../PersonaBits';
import { Bar, Heading, Note } from './bits';

// A Persona, no fim do modal, com as explicações (15/11/2026).
//
// Pedido do Bruno, ao dar a ordem do modal completo: "Por último vamos
// adicionar a persona com as devidas explicações."
//
// Na véspera ela era a segunda seção (logo depois do estúdio) e trazia só a
// carta, o código e o texto. As explicações moravam em duas gavetas à parte, a
// Revelação e o "Como funciona", que o Bruno mandou tirar do modal em 14/11 e
// que só restavam no bloco do perfil. Com o bloco do perfil igual ao cartão da
// home, as duas gavetas saíram (components/PersonaSheets.tsx, apagado) e o que
// elas diziam veio para cá, numa seção só:
//   • quem é: a carta do personagem, o código, o título, o personagem e o
//     texto da Persona; no canto, compartilhar (só no seu);
//   • por que essas três letras: as três prateleiras do código, da mais forte
//     para a mais fraca, cada uma com o que ela revela;
//   • como o código se forma: a soma das notas, as três mais fortes, a regra
//     dos 10 pontos e o mínimo para a Persona nascer; e o atalho para o guia
//     do estúdio, que tem as 84.
// Quem ainda não tem Persona vê o "???" com o que falta e a mesma explicação.
//
// Quando a barra da Evolução está no passado, `world` é o estúdio daquele
// ponto: a seção mostra a Persona que a pessoa era ali.

interface PersonaExplainedProps {
  world: PersonaWorld;
  st: WorldState;
  isOwn: boolean;
  // compartilhar a Persona (só no seu, com Persona)
  onShare?: () => void;
  onOpenGuide?: () => void;
}

const PersonaExplained = React.forwardRef<HTMLElement, PersonaExplainedProps>(({ world, st, isOwn, onShare, onOpenGuide }, ref) => {
  const { t, i18n } = useTranslation();
  const entry = st.hasTrio ? (world.persona?.persona ?? null) : null;
  const text = entry ? personaText(entry, i18n.language) : null;
  const threshold = world.persona?.threshold || 10;

  return (
    <section ref={ref} className="scroll-mt-3 space-y-4">
      <Heading>{t('personaWorld.persona.title')}</Heading>

      {/* quem é */}
      <div className="flex items-start gap-4 min-w-0">
        {entry && st.code && text ? (
          <>
            <PersonaCard persona={entry} code={st.code} foot={false} eager alt={text.character} className="w-[92px] sm:w-[112px] shrink-0" />
            <div className="min-w-0 flex-1">
              <PersonaCode code={st.code} className="block text-[2.75rem] leading-[0.95] tracking-[0.04em]" />
              <p className="mt-1 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                {text.title}
              </p>
              <p className="text-[13px] leading-snug" style={{ color: MIST }}>
                {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
              </p>
            </div>
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className={`grid place-items-center w-11 h-11 shrink-0 rounded-full border border-white/15 transition hover:border-white/35 hover:bg-white/5 ${FOCUS_RING}`}
                style={{ color: PAPER }}
                aria-label={t('oracle.hub.share')}
                title={t('oracle.hub.share')}
              >
                <Share2 className="w-[18px] h-[18px]" aria-hidden />
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ ...PIXEL, color: 'rgba(243,234,211,0.25)' }} className="shrink-0 text-[2.75rem] leading-[0.95] tracking-[0.04em]" aria-hidden>
              ???
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                {world.rated === 0 ? t('personaWorld.plate.egg') : t('personaWorld.plate.larva')}
              </p>
              <p className="text-[13px] leading-snug" style={{ color: MIST }}>
                {st.counted >= threshold ? t('personaWorld.plate.needShelves') : t('personaWorld.plate.progress', { counted: st.counted, threshold })}
              </p>
            </div>
          </>
        )}
      </div>
      {text?.blurb && (
        <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
          {text.blurb}
        </p>
      )}
      {!st.hasTrio && <Bar value={Math.min(1, st.counted / threshold)} tall label={t('oracle.intro.progressLabel')} />}

      {/* por que essas três letras */}
      {st.hasTrio && (
        <div>
          <p className="text-[15px] font-semibold" style={{ color: PAPER }}>
            {isOwn ? t('oracle.persona.yourShelves') : t('oracle.persona.theirShelves')}
          </p>
          <ol className="mt-2 space-y-2">
            {st.trio.map((letter, index) => {
              const mood = MOOD_BY_LETTER[letter];
              if (!mood) return null;
              return (
                <li key={letter} className="rounded-xl p-3.5 ring-1 ring-white/10" style={{ background: `linear-gradient(90deg, ${withMoodAlpha(mood, 0.1)}, transparent 70%), ${VELVET}` }}>
                  <MoodChip moodKey={mood.key} rank={index + 1} />
                  <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                    {t(mood.readingKey)}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* como o código se forma */}
      <div className="rounded-xl p-3.5 ring-1 ring-white/10" style={{ background: VELVET }}>
        <p className="text-[15px] font-semibold" style={{ color: PAPER }}>
          {t('personaWorld.persona.howTitle')}
        </p>
        <div className="mt-1.5 space-y-2">
          <Note>{t('oracle.howItWorks.pointsText')}</Note>
          <Note>{t('oracle.howItWorks.personaText')}</Note>
          <Note>{t('oracle.howItWorks.thresholdText', { count: threshold })}</Note>
        </div>
        {onOpenGuide && (
          <button type="button" onClick={onOpenGuide} className={`mt-2.5 inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`} style={{ color: '#7DD3FC' }}>
            <BookOpen className="w-4 h-4" aria-hidden />
            {t('personaWorld.persona.guide')}
          </button>
        )}
      </div>
    </section>
  );
});
PersonaExplained.displayName = 'PersonaExplained';

export default PersonaExplained;
