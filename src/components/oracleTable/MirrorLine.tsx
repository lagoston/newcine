import React, { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import type { Spoken } from '../../lib/mesa/dialogue/types';
import { EyeMark, ARC_COLORS } from './MesaArt';

// A frase do Espelho (SPEC §2.2, §2.10 e §3.1), 05/11/2026. O Espelho fala só
// da pessoa, sem balão e sem bicho: é a frase grande no alto, em PIXEL, com o
// Olho de 16 px antes. Altura fixa (nada pula quando os dados chegam): 3 linhas
// no celular, 2 no computador. No modo reconhecimento, o arco de 10 segmentos
// embaixo acende do lavanda ao menta conforme as notas contadas. No celular, a
// quarta carta mora aqui, à direita (passada como `side`).

// A cor do segmento i de 10, do lavanda ao menta (passando por rosa e céu).
function arcColor(i: number): string {
  const k = (i / 9) * (ARC_COLORS.length - 1);
  return ARC_COLORS[Math.min(ARC_COLORS.length - 1, Math.round(k))];
}

export const ReconArc: React.FC<{ counted: number; desktop: boolean }> = ({ counted, desktop }) => {
  const { t } = useTranslation();
  const n = Math.max(0, Math.min(10, counted));
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={t('mesa.recon.progressAria', { count: n })}>
      <div className="flex items-end gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => {
          // Um arco de verdade: as pontas mais baixas que o meio.
          const lift = Math.round(Math.sin((i / 9) * Math.PI) * (desktop ? 6 : 5));
          return (
            <span
              key={i}
              className="block rounded-[2px] transition-colors duration-500"
              style={{
                width: desktop ? 14 : 11,
                height: 5,
                marginBottom: lift,
                background: i < n ? arcColor(i) : 'rgba(189,180,214,0.16)',
                boxShadow: i < n ? `0 0 8px ${arcColor(i)}66` : undefined,
              }}
            />
          );
        })}
      </div>
      <span className="text-[12px] tabular-nums" style={{ color: MIST }} aria-hidden>
        {t('mesa.recon.progress', { count: n })}
      </span>
    </div>
  );
};

interface MirrorProps {
  line: Spoken | null;
  loading: boolean;
  desktop: boolean;
  reduced: boolean;
  recon: { counted: number } | null;
  side?: React.ReactNode;
}

const MirrorLine: React.FC<MirrorProps> = ({ line, loading, desktop, reduced, recon, side }) => {
  const { t } = useTranslation();
  const size = desktop ? { font: 24, lh: 31, lines: 2 } : { font: 18, lh: 24, lines: 3 };
  // O arco do reconhecimento fica logo abaixo do texto de verdade (que pode
  // ter 1, 2 ou 3 linhas), dentro do bloco de altura fixa: nada em volta pula.
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [textH, setTextH] = useState(size.lh * size.lines);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setTextH(Math.min(size.lh * size.lines, Math.max(size.lh, el.scrollHeight)));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [line?.text, size.lh, size.lines]);
  return (
    <section className={`relative flex items-start ${desktop ? 'gap-4 h-[92px]' : 'gap-3 h-[96px]'}`} aria-label={t('mesa.espelho.aria')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2.5" style={{ minHeight: size.lh * size.lines }}>
          <EyeMark size={desktop ? 22 : 16} className="shrink-0" style={{ marginTop: desktop ? 6 : 4 }} />
          <div className="relative min-w-0 flex-1" style={{ height: size.lh * size.lines }}>
            <AnimatePresence mode="wait" initial={false}>
              {loading && !line ? (
                <motion.div key="skel" className="space-y-2 pt-1" exit={{ opacity: 0 }} aria-hidden>
                  {[0.92, 0.78, 0.5].slice(0, size.lines).map((w, i) => (
                    <span key={i} className="block ms-skel rounded" style={{ height: size.font - 6, width: `${w * 100}%` }} />
                  ))}
                </motion.div>
              ) : line ? (
                <motion.p
                  ref={textRef}
                  key={line.text}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.12 : 0.22 }}
                  className="absolute inset-x-0 top-0 max-h-full overflow-hidden"
                  style={{ ...PIXEL, color: PAPER, fontSize: size.font, lineHeight: `${size.lh}px`, textWrap: 'pretty' } as React.CSSProperties}
                  aria-live="polite"
                >
                  {line.text}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        {recon && (
          <div className={`absolute transition-[top] duration-200 ${desktop ? 'left-[32px]' : 'left-[26px]'}`} style={{ top: textH + (desktop ? 10 : 8) }}>
            <ReconArc counted={recon.counted} desktop={desktop} />
          </div>
        )}
      </div>
      {side}
    </section>
  );
};

export default MirrorLine;
