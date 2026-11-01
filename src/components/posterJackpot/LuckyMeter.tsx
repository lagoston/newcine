import React from 'react';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { LUCKY_GOAL } from '../../lib/posterJackpot';
import { RarityGem } from './CollectorMark';
import '../../styles/posterJackpot.css';

// A barra da sorte (01/11/2026), presa na base da máquina: 10 lâmpadas, uma
// por giro com ficha. Na 10ª, a barra libera um Giro da Sorte grátis (50%
// épico, 50% lendário). O medalhão da ponta mostra o prêmio: os dois
// cristais. Pronta, a barra inteira vira o botão do giro.

const LuckyMeter: React.FC<{
  progress: number;
  spins: number;
  goal?: number;
  // A casa que acabou de acender (anima uma vez).
  fresh?: number | null;
  // Um Giro da Sorte está rodando agora.
  active?: boolean;
  disabled?: boolean;
  onUse: () => void;
}> = ({ progress, spins, goal = LUCKY_GOAL, fresh = null, active = false, disabled = false, onUse }) => {
  const { t } = useTranslation();
  const ready = spins > 0;
  const lit = ready || active ? goal : Math.min(progress, goal);
  const left = Math.max(0, goal - progress);

  const cells = (
    <span className="pj-meter-row">
      <span className="pj-meter-cells">
        {Array.from({ length: goal }, (_, i) => (
          <span
            key={i}
            className={`pj-cell ${i < lit ? 'is-on' : ''} ${fresh === i ? 'is-fresh' : ''}`}
            style={{ ['--i' as string]: i }}
          />
        ))}
      </span>
      <span className="pj-meter-prize" aria-hidden>
        <RarityGem rarity="epic" className="pj-meter-gem epic" />
        <RarityGem rarity="legendary" className="pj-meter-gem legendary" glint={ready} />
      </span>
    </span>
  );

  if (ready && !active) {
    return (
      <button
        type="button"
        onClick={onUse}
        disabled={disabled}
        className={`pj-meter is-ready w-full text-left ${FOCUS_RING}`}
        aria-label={t('jackpot.lucky.useAria', { count: spins })}
      >
        <span className="pj-meter-bolt left" aria-hidden />
        <span className="pj-meter-bolt right" aria-hidden />
        <span className="pj-meter-head">
          <span className="pj-meter-title pj-display">{spins > 1 ? t('jackpot.lucky.readyMany', { count: spins }) : t('jackpot.lucky.ready')}</span>
          <span className="pj-meter-cta">{t('jackpot.lucky.use')}</span>
        </span>
        {cells}
        <span className="pj-meter-odds">{t('jackpot.lucky.odds')}</span>
      </button>
    );
  }

  return (
    <div
      className={`pj-meter ${active ? 'is-active' : ''}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={goal}
      aria-valuenow={active ? goal : progress}
      aria-label={t('jackpot.lucky.title')}
      aria-valuetext={active ? t('jackpot.lucky.spinning') : t('jackpot.lucky.left', { count: left })}
    >
      <span className="pj-meter-bolt left" aria-hidden />
      <span className="pj-meter-bolt right" aria-hidden />
      <span className="pj-meter-head">
        <span className="pj-meter-title pj-display">{t('jackpot.lucky.title')}</span>
        <span className="pj-meter-status">{active ? t('jackpot.lucky.spinning') : t('jackpot.lucky.left', { count: left })}</span>
      </span>
      {cells}
    </div>
  );
};

export default LuckyMeter;
