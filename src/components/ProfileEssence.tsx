import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scroll, Info, RefreshCw } from 'lucide-react';
import ArchetypeSymbol from './ArchetypeSymbol';
import PentagonGraph from './PentagonGraph';
import OracleSheet from './OracleSheet';
import ConfirmationModal from './ConfirmationModal';
import { getEssenceLabel, getSubcategoryName } from '../lib/mood-genres';
import type { EssencePersonality, EssenceArchetype } from '../hooks/useProfileData';
import { PROFILE_GHOST_BUTTON } from './ProfileIdentityCard';
import { PROFILE_CARD } from './ProfileTaste';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// Essência cinematográfica de um perfil: o cartão com o código (ex.: EID),
// o nome do arquétipo e a descrição, mais as duas gavetas — "Revelação"
// (a leitura completa) e "A Arquitetura da Alma" (como é calculada).
// Usado no seu Perfil (com "Refazer questionário") e no perfil de outra
// pessoa (só leitura).

// Cor do código pelo terceiro eixo (Radiante, Sombrio, Clássico,
// Experimental, Denso, Leve).
const SUBCATEGORY_TEXT_COLOR: Record<string, string> = { A: '#fbbf24', B: '#a78bfa', K: '#f87171', X: '#60a5fa', D: '#F3EAD3', L: '#34d399' };

interface ProfileEssenceProps {
  loading: boolean;
  personality: EssencePersonality | null;
  archetype: EssenceArchetype | null;
  spectrumPoints: { e: number; i: number; c: number; s: number; r: number };
  // Seu próprio perfil ("Sua essência") ou o de outra pessoa ("Essência").
  isOwn?: boolean;
  // O que mostrar quando ainda não há essência.
  emptyState: React.ReactNode;
  // Só no seu perfil: confirma e zera o questionário de calibragem.
  onRetakeConfirmed?: () => void | Promise<void>;
}

const ProfileEssence: React.FC<ProfileEssenceProps> = ({ loading, personality, archetype, spectrumPoints, isOwn = false, emptyState, onRetakeConfirmed }) => {
  const { t, i18n } = useTranslation();
  const [showRevelation, setShowRevelation] = useState(false);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);
  const lang = i18n.language.startsWith('pt') ? 'pt' : 'en';

  const code = personality?.personalidade_completa || '';
  const hasEssence = !!code && !!archetype;
  const codeColor = SUBCATEGORY_TEXT_COLOR[code.charAt(2)] || '#60a5fa';
  const essenceLabel = personality ? getEssenceLabel(personality.arquetipo_primario, personality.arquetipo_secundario, lang) : '';

  if (loading) {
    return (
      <div className={`${PROFILE_CARD} space-y-3`} style={{ background: VELVET }} aria-busy="true">
        <div className="h-14 w-56 rounded-lg bg-white/10 animate-pulse" />
        <div className="h-4 w-full max-w-lg rounded bg-white/10 animate-pulse" />
      </div>
    );
  }

  if (!hasEssence) return <>{emptyState}</>;

  return (
    <>
      <div className={PROFILE_CARD} style={{ background: VELVET }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className="shrink-0">
              <ArchetypeSymbol archetypeId={code.slice(0, 2)} subcategoryId={code.slice(2, 3) || null} size={72} animated={false} />
            </span>
            <div className="min-w-0">
              <p style={{ ...PIXEL, color: codeColor }} className="text-4xl leading-none">
                {code}
              </p>
              <p className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                {archetype!.archetype_name} {archetype!.subcategory_name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowRevelation(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
              <Scroll className="w-[18px] h-[18px] text-pink-300" aria-hidden />
              {t('oracle.revelation')}
            </button>
            <button onClick={() => setShowArchitecture(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
              <Info className="w-[18px] h-[18px] text-sky-300" aria-hidden />
              {t('profile.howItWorks')}
            </button>
          </div>
        </div>
        {archetype!.archetype_description && (
          <p className="mt-5 max-w-3xl text-[15px] leading-relaxed line-clamp-3" style={{ color: MIST }}>
            {archetype!.archetype_description}
          </p>
        )}
      </div>

      {/* Revelação — a leitura completa da essência */}
      <OracleSheet
        open={showRevelation}
        onClose={() => setShowRevelation(false)}
        title={t('oracle.revelation')}
        subtitle={`${archetype!.archetype_name} ${archetype!.subcategory_name}`}
        leading={
          <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
            <Scroll className="w-5 h-5 text-pink-300" aria-hidden />
          </span>
        }
        size="lg"
        bodyClassName="px-5 sm:px-7 py-6 space-y-4"
      >
        <div className="flex items-center gap-4 rounded-xl p-4 ring-1 ring-white/10" style={{ background: VELVET }}>
          <ArchetypeSymbol archetypeId={code.slice(0, 2)} subcategoryId={code.slice(2, 3) || null} size={56} animated={false} />
          <div className="min-w-0">
            <p style={{ ...PIXEL, color: codeColor }} className="text-3xl leading-none">
              {code}
            </p>
            <p className="mt-1 font-semibold" style={{ color: PAPER }}>
              {archetype!.archetype_name} {archetype!.subcategory_name}
            </p>
          </div>
        </div>
        <div className="rounded-xl p-4 sm:p-5 ring-1 ring-pink-400/25 bg-pink-500/[0.06]">
          <h3 className="font-semibold text-pink-200">
            {isOwn ? t('oracle.yourEssence') : t('oracle.theEssence')} ({essenceLabel})
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {archetype!.archetype_description}
          </p>
        </div>
        <div className="rounded-xl p-4 sm:p-5 ring-1 ring-sky-400/25 bg-sky-500/[0.06]">
          <h3 className="font-semibold text-sky-200">
            {isOwn ? t('oracle.yourAttunement') : t('oracle.theAttunement')} ({getSubcategoryName(archetype!.subcategory_name, lang)})
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
            {archetype!.subcategory_description}
          </p>
        </div>
      </OracleSheet>

      {/* A Arquitetura da Alma — como a essência é calculada */}
      <OracleSheet
        open={showArchitecture}
        onClose={() => setShowArchitecture(false)}
        title={t('oracle.architectureTitle')}
        subtitle={t('oracle.architectureIntro')}
        size="lg"
        escapeEnabled={!showRetakeConfirm}
        bodyClassName="px-5 sm:px-7 py-6 space-y-4"
      >
        <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
          <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
            <span style={PIXEL} className="text-lg text-violet-300">
              1
            </span>
            {t('oracle.theEssence')} ({essenceLabel})
          </h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
            {t('oracle.essenceProfileText', { profile: `${personality!.arquetipo_primario}${personality!.arquetipo_secundario}` })}
          </p>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <div className="rounded-lg p-3 bg-black/25">
              <p className="text-xs font-semibold" style={{ color: PAPER }}>
                {t('oracle.essenceLogicLabel')}
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: MIST }}>
                {t('oracle.essenceLogicText')}
              </p>
            </div>
            <div className="rounded-lg p-3 bg-black/25">
              <p className="text-xs font-semibold" style={{ color: PAPER }}>
                {t('oracle.essenceResultLabel')}
              </p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: MIST }}>
                {t('oracle.essenceResultText')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
          <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
            <span style={PIXEL} className="text-lg text-amber-300">
              2
            </span>
            {t('oracle.theAttunement')} ({getSubcategoryName(archetype!.subcategory_name, lang)})
          </h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
            {/* O id da subcategoria às vezes não vem (perfil antigo); o
                terceiro caractere do código é a mesma informação. */}
            {t('oracle.subarchetypeText', { id: personality!.subcategoria_id || code.charAt(2) })}
          </p>
          <p className="mt-3 text-xs" style={{ color: MIST }}>
            {t('oracle.axesListTitle')}
          </p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {[
              { a: t('oracle.axisRadiant'), b: t('oracle.axisShadowy'), desc: t('oracle.axisOptimismMelancholy'), ca: '#fbbf24', cb: '#a78bfa' },
              { a: t('oracle.axisClassic'), b: t('oracle.axisExperimental'), desc: t('oracle.axisTraditionBoldness'), ca: '#f87171', cb: '#60a5fa' },
              { a: t('oracle.axisDense'), b: t('oracle.axisLight'), desc: t('oracle.axisComplexityAccessibility'), ca: '#F3EAD3', cb: '#34d399' },
            ].map((row) => (
              <li key={row.a} className="flex items-start gap-2" style={{ color: MIST }}>
                <span aria-hidden>•</span>
                <span>
                  <span className="font-semibold" style={{ color: row.ca }}>
                    {row.a}
                  </span>
                  {' vs. '}
                  <span className="font-semibold" style={{ color: row.cb }}>
                    {row.b}
                  </span>
                  {' — '}
                  {row.desc}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
          <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
            <span style={PIXEL} className="text-lg text-sky-300">
              3
            </span>
            {t('oracle.theGraph')}
          </h3>
          <div className="mt-4 flex justify-center">
            <PentagonGraph points={spectrumPoints} subcategoryId={code} />
          </div>
          {onRetakeConfirmed && (
            <div className="mt-4 flex justify-center">
              <button onClick={() => setShowRetakeConfirm(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
                <RefreshCw className="w-[18px] h-[18px] text-sky-300" aria-hidden />
                {t('oracle.retakeQuiz')}
              </button>
            </div>
          )}
        </div>
      </OracleSheet>

      {onRetakeConfirmed && (
        <ConfirmationModal
          isOpen={showRetakeConfirm}
          onClose={() => setShowRetakeConfirm(false)}
          onConfirm={async () => {
            setShowArchitecture(false);
            await onRetakeConfirmed();
          }}
          title={t('oracle.retakeQuizTitle')}
          message={t('oracle.retakeQuizConfirm')}
          confirmLabel={t('oracle.retakeQuiz')}
        />
      )}
    </>
  );
};

export default ProfileEssence;
