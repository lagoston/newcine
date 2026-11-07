import React from 'react';
import { useTranslation } from 'react-i18next';
import { NIGHT, PAPER, MIST, PIXEL, oracleCardImage } from '../../lib/oracleTheme';
import type { OracleSlot } from '../../lib/mesa/types';
import { EyeMark, MoonArc } from './MesaArt';

// O verso das cartas (SPEC §2.2, §2.5, §2.7 e §7.5), 05/11/2026.
//   OracleBack: a própria carta do oráculo, no estilo que a pessoa escolheu no
//     Personalizar (padrão, Yu-Gi-Oh!, Horror). O oráculo É a carta até mostrar
//     o que viu.
//   Selo de cera da Cypher: um disco #8E1B2B com o Olho em PAPER a 80%. Ao
//     abrir, as duas metades (clip-path) se afastam 10 px e somem em 200 ms.
//   Passou a vez: o verso a 45% de saturação, com a faixa NIGHT.
//   EspelhoBack: o Olho Lunar sobre NIGHT, com o arco de quatro cores no alto
//     (sem arte de oráculo: a quarta carta é do Espelho).

export type SealState = 'locked' | 'ready' | 'breaking' | null;

export const WaxSeal: React.FC<{ state: Exclude<SealState, null>; size?: number }> = ({ state, size = 44 }) => (
  <span className={`ms-wax ${state === 'ready' ? 'is-ready' : ''} ${state === 'breaking' ? 'is-breaking' : ''}`} style={{ width: size, height: size }} aria-hidden>
    {(['l', 'r'] as const).map((side) => (
      <span key={side} className={`ms-wax-half is-${side}`}>
        <EyeMark size={Math.round(size * 0.55)} mono={PAPER} style={{ opacity: 0.8 }} />
      </span>
    ))}
  </span>
);

export const OracleBack: React.FC<{
  oracle: OracleSlot;
  cardStyle: string;
  seal?: SealState;
  passed?: boolean;
  dim?: boolean;
  eager?: boolean;
}> = ({ oracle, cardStyle, seal = null, passed = false, dim = false, eager = false }) => {
  const { t } = useTranslation();
  return (
    <span className="ms-card-back" style={{ background: NIGHT }}>
      <img
        src={oracleCardImage(oracle, cardStyle)}
        alt=""
        draggable={false}
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        className="absolute inset-0 w-full h-full object-cover select-none"
        style={{ filter: passed ? 'saturate(0.45) brightness(0.62)' : dim ? 'brightness(0.6) saturate(0.8)' : undefined }}
      />
      {seal && (
        <>
          {/* Um véu escuro só no meio, para o selo e o rótulo lerem sobre a arte. */}
          <span aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 42% at 50% 52%, rgba(18,13,34,0.55), transparent 75%)' }} />
          <WaxSeal state={seal} />
          <span
            className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-[3px] rounded-full"
            style={{
              ...PIXEL,
              top: 'calc(50% + 28px)',
              fontSize: 11,
              lineHeight: 1,
              color: seal === 'locked' ? MIST : PAPER,
              background: 'rgba(18,13,34,0.86)',
              boxShadow: seal === 'locked' ? 'inset 0 0 0 1px rgba(189,180,214,0.28)' : 'inset 0 0 0 1px rgba(226,200,74,0.6)',
              opacity: seal === 'breaking' ? 0 : 1,
              transition: 'opacity 160ms ease',
            }}
          >
            {seal === 'locked' ? t('mesa.card.sealed') : t('mesa.card.sealTap')}
          </span>
        </>
      )}
      {passed && (
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 py-2 text-center" style={{ ...PIXEL, fontSize: 12, color: PAPER, background: 'rgba(18,13,34,0.9)' }}>
          {t('mesa.card.passed')}
        </span>
      )}
    </span>
  );
};

export const EspelhoBack: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <span className="ms-card-back grid place-items-center" style={{ background: `radial-gradient(ellipse 80% 60% at 50% 55%, #2A1F4F, ${NIGHT} 72%)`, boxShadow: 'inset 0 0 0 1.5px rgba(185,166,255,0.45)' }}>
    <MoonArc width={compact ? 34 : 88} className="absolute left-1/2 -translate-x-1/2" style={{ top: compact ? 6 : 14 }} />
    <EyeMark size={compact ? 26 : 64} />
    <span aria-hidden className="absolute inset-[5px] rounded-[6px]" style={{ boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.12)' }} />
  </span>
);
