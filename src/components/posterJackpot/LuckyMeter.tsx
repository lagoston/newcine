import React from 'react';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING } from '../../lib/oracleTheme';
import { LUCKY_GOAL } from '../../lib/posterJackpot';
import { RarityGem } from './CollectorMark';
import '../../styles/posterJackpot.css';

// A barra da sorte (01/11/2026), presa na base da máquina: 10 lâmpadas, uma
// por giro com ficha. Na 10ª, a barra guarda um Giro da Sorte. O medalhão da
// ponta mostra o prêmio: os cristais. Pronta, a barra inteira vira o botão do
// giro.
//
// Desde 18/11/2026 (pedido do Bruno) o Giro da Sorte não é mais grátis: é o
// bônus do próximo giro com ficha (comum ou especial), que sai com as chances
// dele e gasta a ficha. Tocar na barra pronta gira com a ficha escolhida no
// porta-fichas, igual ao botão GIRAR; sem ficha, a barra diz que falta uma.

const LuckyMeter: React.FC<{
  progress: number;
  spins: number;
  goal?: number;
  // A casa que acabou de acender (anima uma vez).
  fresh?: number | null;
  // Um Giro da Sorte está rodando agora.
  active?: boolean;
  // Há ficha da escolhida no porta-fichas para usar o bônus.
  hasChip?: boolean;
  disabled?: boolean;
  onUse: () => void;
}> = ({ progress, spins, goal = LUCKY_GOAL, fresh = null, active = false, hasChip = true, disabled = false, onUse }) => {
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
          <span className={`pj-meter-cta ${hasChip ? '' : 'is-waiting'}`}>{hasChip ? t('jackpot.lucky.use') : t('jackpot.lucky.needChip')}</span>
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
