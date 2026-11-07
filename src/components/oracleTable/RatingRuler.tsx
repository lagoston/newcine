import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INK, MIST, PAPER, PIXEL, FOCUS_RING, ratingTone } from '../../lib/oracleTheme';
import { useMesaLayerEntry } from './MesaLayer';

// A régua de notas do "Já vi" (SPEC §2.6), 05/11/2026: abre dentro da leitura,
// é um radiogroup de 11 botões (48 × 44), anda nas setas e grava no Enter ou no
// toque. Esc (e o voltar do aparelho) cancela: é a camada de cima da pilha.

interface RulerProps {
  title: string;
  saving: boolean;
  suggest: number | null;
  onPick: (n: number) => void;
  onCancel: () => void;
}

const RatingRuler: React.FC<RulerProps> = ({ title, saving, suggest, onPick, onCancel }) => {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<number>(suggest ?? 7);
  const [picked, setPicked] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  useMesaLayerEntry(true, () => !saving && onCancel());

  useEffect(() => {
    refs.current[focus]?.focus({ preventScroll: true });
    // No celular a régua abre embaixo da leitura: rola até ela ficar inteira
    // acima da mão de perguntas (scroll-margin-bottom cobre a mão).
    boxRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (to: number) => {
    const n = Math.max(0, Math.min(10, to));
    setFocus(n);
    refs.current[n]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(focus + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      move(focus - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      move(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      move(10);
    }
  };
  const pick = (n: number) => {
    if (saving) return;
    setPicked(n);
    onPick(n);
  };

  return (
    <div ref={boxRef} className="mt-1 scroll-mb-[130px] scroll-mt-[70px]">
      <p className="text-[14px] mb-2.5" style={{ color: PAPER }}>
        <span style={PIXEL}>{title}</span>
        <span style={{ color: MIST }}> · {saving ? t('mesa.ruler.saving') : t('mesa.ruler.title')}</span>
      </p>
      <div role="radiogroup" aria-label={t('mesa.ruler.aria')} onKeyDown={onKey} className="grid grid-cols-6 gap-1.5 max-w-[340px]">
        {Array.from({ length: 11 }, (_, n) => {
          const tone = ratingTone(n);
          const on = picked === n;
          return (
            <button
              key={n}
              ref={(el) => (refs.current[n] = el)}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={n === focus ? 0 : -1}
              disabled={saving && !on}
              onClick={() => pick(n)}
              onFocus={() => setFocus(n)}
              className={`h-11 rounded-lg transition-colors ${FOCUS_RING} disabled:opacity-40`}
              style={{
                ...PIXEL,
                fontSize: 17,
                color: on ? INK : tone.color,
                background: on ? tone.color : 'rgba(18,13,34,0.7)',
                boxShadow: `inset 0 0 0 1px ${on ? tone.color : tone.ring}`,
              }}
            >
              {n}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`h-11 rounded-lg text-[13px] underline-offset-4 hover:underline ${FOCUS_RING} disabled:opacity-40`}
          style={{ color: MIST }}
        >
          {t('mesa.ruler.cancel')}
        </button>
      </div>
    </div>
  );
};

export default RatingRuler;
