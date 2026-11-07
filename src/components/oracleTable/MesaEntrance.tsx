import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MARK_LAYERS, MARK_VIEWBOX } from '../brand/brandArt';
import { NIGHT, PAPER, PIXEL, ORACLES } from '../../lib/oracleTheme';
import { useMesaLayerEntry } from './MesaLayer';

// A entrada ritual (SPEC §2.1), 05/11/2026: o Olho Lunar se abre. Uma vez por
// aba; um toque, Esc ou Enter pulam; com "reduzir movimento" ela nem é montada.
//   1. Desenho (até o mesa_get responder): tela NIGHT; o arco da lua acende em
//      quatro segmentos, um a cada 225 ms.
//   2. Abrir (dados prontos e arco completo): as pálpebras (dois div NIGHT com
//      scaleY) se abrem em 250 ms e três feixes descem da íris em 200 ms.
//   3. Entrar: a câmera atravessa a íris (×8 e fade, 380 ms) e a Mesa aparece
//      com as cartas já dadas.
// Teto: 1,9 s depois de os dados chegarem; sem dados em 4 s, termina mesmo
// assim (a Mesa mostra o esqueleto do tamanho final). Feita em HTML/CSS sobre
// div: o olho é SVG PARADO (cada segmento do arco é um SVG próprio, e quem
// acende é o div em volta). Nada de animar SVG.

type Phase = 'draw' | 'open' | 'enter' | 'done';

const ARC = MARK_LAYERS.slice(0, 4);
const BODY = MARK_LAYERS.slice(4);

const Layer: React.FC<{ d: string; fill: string }> = ({ d, fill }) => (
  <svg viewBox={MARK_VIEWBOX} className="absolute inset-0 w-full h-full" style={{ shapeRendering: 'crispEdges' }} aria-hidden>
    <path d={d} fill={fill} />
  </svg>
);

interface EntranceProps {
  dataReady: boolean;
  desktop: boolean;
  onDone: () => void;
}

const MesaEntrance: React.FC<EntranceProps> = ({ dataReady, desktop, onDone }) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('draw');
  const [lit, setLit] = useState(0);
  const doneRef = useRef(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('done');
    onDone();
  }, [onDone]);

  useMesaLayerEntry(phase !== 'done', finish, { history: false });

  // O arco acende, um segmento a cada 225 ms.
  useEffect(() => {
    const ids = [1, 2, 3, 4].map((n) => window.setTimeout(() => setLit(n), n * 225));
    // Sem dados em 4 s, a entrada termina mesmo assim.
    const cap = window.setTimeout(finish, 4000);
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(cap);
    };
  }, [finish]);

  // Dados prontos e arco completo: abre, desce os feixes, atravessa a íris.
  useEffect(() => {
    if (!dataReady || lit < 4 || phase !== 'draw') return;
    setPhase('open');
    later(() => setPhase('enter'), 250 + 200);
    later(finish, 250 + 200 + 380);
    // Teto de segurança: 1,9 s depois de os dados chegarem.
    later(finish, 1900);
  }, [dataReady, lit, phase, finish]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  // Enter também pula (o Esc é da pilha de camadas).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  if (phase === 'done') return null;
  const size = desktop ? 160 : 136;
  const open = phase === 'open' || phase === 'enter';
  const entering = phase === 'enter';

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center select-none"
      style={{ background: NIGHT, opacity: entering ? 0 : 1, transition: entering ? 'opacity 380ms ease-in 60ms' : undefined }}
      onPointerDown={finish}
      role="presentation"
    >
      <p className="sr-only" aria-live="polite">
        {t('mesa.entrance.dealing')}
      </p>
      <div className="flex flex-col items-center" style={{ transform: entering ? 'scale(8)' : 'scale(1)', transition: entering ? 'transform 380ms cubic-bezier(0.6, 0, 0.9, 0.4)' : undefined, transformOrigin: `50% ${(size * 14.5) / 24}px` }}>
        <div className="relative" style={{ width: size, height: (size * 21) / 24 }}>
          {/* O corpo do olho (contorno, íris, pupila, brilho), parado. */}
          {BODY.map((l, i) => (
            <Layer key={`b${i}`} d={l.d} fill={l.fill} />
          ))}
          {/* As pálpebras: dois div NIGHT sobre a íris, com a linha do olho
              fechado; abrem com scaleY. */}
          <span
            aria-hidden
            className="absolute"
            style={{ left: `${(5.5 / 24) * 100}%`, width: `${(13 / 24) * 100}%`, top: `${(8.6 / 21) * 100}%`, height: `${(5.9 / 21) * 100}%`, background: NIGHT, transformOrigin: 'top', transform: `scaleY(${open ? 0 : 1})`, transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)', borderBottom: open ? undefined : `${size / 24}px solid ${PAPER}` }}
          />
          <span
            aria-hidden
            className="absolute"
            style={{ left: `${(5.5 / 24) * 100}%`, width: `${(13 / 24) * 100}%`, top: `${(14.5 / 21) * 100}%`, height: `${(5.6 / 21) * 100}%`, background: NIGHT, transformOrigin: 'bottom', transform: `scaleY(${open ? 0 : 1})`, transition: 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
          {/* O arco da lua: cada segmento acende sozinho. */}
          {ARC.map((l, i) => (
            <span key={`a${i}`} className="absolute inset-0" style={{ opacity: lit > i ? 1 : 0.08, transition: 'opacity 200ms ease-out', filter: lit > i ? `drop-shadow(0 0 ${size / 16}px ${l.fill})` : undefined }}>
              <Layer d={l.d} fill={l.fill} />
            </span>
          ))}
          {/* Os três feixes que descem da íris. */}
          {ORACLES.map((o, i) => (
            <span
              key={o.id}
              aria-hidden
              className="absolute"
              style={{
                left: '50%',
                top: `${(15 / 21) * 100}%`,
                width: size / 22,
                height: size * 1.25,
                marginLeft: -size / 44,
                background: `linear-gradient(180deg, ${o.color}, transparent)`,
                transformOrigin: 'top center',
                transform: `rotate(${(i - 1) * 16}deg) scaleY(${open ? 1 : 0})`,
                transition: 'transform 200ms ease-out 250ms',
                opacity: 0.85,
                filter: 'blur(1px)',
              }}
            />
          ))}
        </div>
        <p className="mt-9 text-center px-6" style={{ ...PIXEL, color: PAPER, opacity: open ? 0 : 0.7, fontSize: desktop ? 22 : 18, lineHeight: 1.3, transition: 'opacity 160ms' }}>
          {t('mesa.entrance.dealing')}
        </p>
        <div className="mt-4 flex gap-4" aria-hidden style={{ opacity: open ? 0 : 1, transition: 'opacity 160ms' }}>
          {ORACLES.map((o, i) => (
            <span key={o.id} className="ms-dot w-2 h-2 rounded-full" style={{ background: o.color, animationDelay: `${i * 180}ms` }} />
          ))}
        </div>
      </div>
      <p className="absolute bottom-[max(28px,env(safe-area-inset-bottom))] inset-x-0 text-center text-[12px]" style={{ color: PAPER, opacity: open ? 0 : 0.45 }}>
        {t('mesa.entrance.skip')}
      </p>
    </div>
  );
};

export default MesaEntrance;
