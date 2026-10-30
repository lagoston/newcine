import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Crown, Ticket } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { RARITY_META, fetchJackpotState, type JackpotState, type PosterRarity } from '../../lib/posterJackpot';
import PosterJackpotSheet from './PosterJackpotSheet';
import '../../styles/posterJackpot.css';

// A porta do Poster Jackpot no Oracle Hub: um letreiro de fliperama com as
// cápsulas, os tickets e o aviso de missão pronta. Só aparece para quem a
// máquina está liberada (poster_jackpot_settings).
const DOOR_CAPSULES: PosterRarity[] = ['common', 'rare', 'legendary', 'epic', 'common'];

const PosterJackpotDoor: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [state, setState] = useState<JackpotState | null>(null);
  const [open, setOpen] = useState(false);

  const reload = useCallback(() => {
    if (!userId) return;
    fetchJackpotState()
      .then(setState)
      .catch((error) => console.error('Poster Jackpot state:', error));
  }, [userId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const patch = useCallback((value: Partial<JackpotState>) => setState((prev) => (prev ? { ...prev, ...value } : prev)), []);

  if (!state?.enabled) return null;
  const claimable = state.missions.filter((m) => !m.claimed && m.progress >= m.target).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group relative w-full flex items-center gap-3.5 sm:gap-5 text-left rounded-2xl p-3.5 sm:p-5 overflow-hidden transition hover:brightness-110 ${FOCUS_RING}`}
        style={{
          background: 'radial-gradient(90% 140% at 0% 0%, rgba(249,115,22,0.22), transparent 60%), rgba(28,20,51,0.6)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(251,146,60,0.35)',
        }}
      >
        {/* Mini máquina: a cúpula com cinco cápsulas */}
        <span className="pj-cabinet relative shrink-0 w-[68px] h-[84px] sm:w-[78px] sm:h-[96px] rounded-2xl p-1.5" aria-hidden>
          <span className="pj-glass relative block w-full h-[60%] rounded-t-xl rounded-b-md overflow-hidden">
            {DOOR_CAPSULES.map((rarity, i) => (
              <span
                key={i}
                className="pj-capsule"
                style={{
                  width: 18,
                  height: 18,
                  left: `${[6, 38, 66, 22, 52][i]}%`,
                  top: `${[56, 58, 52, 20, 22][i]}%`,
                  background: `linear-gradient(180deg, rgba(255,255,255,0.85) 0 46%, ${RARITY_META[rarity].color} 54% 100%)`,
                }}
              />
            ))}
          </span>
          <span className="absolute left-1/2 bottom-1.5 -translate-x-1/2 w-6 h-6 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #7dd3fc, #2563eb 65%)' }} />
        </span>
        <span className="min-w-0 flex-1">
          <span style={{ ...PIXEL, color: '#FDE68A', textShadow: '0 0 12px rgba(251,191,36,0.4)' }} className="block text-lg sm:text-2xl leading-tight">
            Poster Jackpot
          </span>
          <span className="hidden sm:block mt-1 text-sm leading-snug" style={{ color: MIST }}>
            {t('jackpot.door.hint')}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: 'rgba(37,99,235,0.25)', color: '#BFDBFE' }}>
              <Ticket className="w-3.5 h-3.5" aria-hidden />
              {t('jackpot.machine.tickets', { count: state.tickets })}
            </span>
            {state.specialAvailable && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: 'rgba(245,158,11,0.2)', color: '#FDE68A' }}>
                <Crown className="w-3.5 h-3.5" aria-hidden />
                {t('jackpot.machine.special')}
              </span>
            )}
            {claimable > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: '#FDE68A', color: '#221B36' }}>
                {t('jackpot.door.claimable', { count: claimable })}
              </span>
            )}
          </span>
        </span>
        <span className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold" style={{ color: PAPER }}>
          {t('oracle.hub.play')}
          <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </button>
      <PosterJackpotSheet open={open} onClose={() => setOpen(false)} state={state} onState={patch} onReload={reload} />
    </>
  );
};

export default PosterJackpotDoor;
