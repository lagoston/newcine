import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MOODS, withMoodAlpha } from '../../lib/moods';
import { PAPER, MIST, PIXEL, NIGHT, FOCUS_RING } from '../../lib/oracleTheme';
import type { MoodSlice } from '../../lib/tasteStats';
import { formatOne } from './observatoryKit';

// As 9 prateleiras dos oráculos como uma grade 3×3 de frascos de vidro
// (13/10/2026, terceira versão do bloco dos humores — sem círculo).
//
// Cada frasco é um humor, sempre no mesmo lugar e na sua cor. O líquido
// dentro sobe até o nível da parte dos filmes da pessoa naquele humor (o
// mais cheio é o humor que ela mais vê; o número da % está escrito). Os 3
// humores do código da personalidade levam o número da posição (1, 2, 3) e
// o contorno aceso. Tocar num frasco escolhe o humor (o painel ao lado
// mostra a leitura dele); tocar de novo solta.
//
// Tudo é HTML + CSS (o líquido sobe por transição de altura; a onda é uma
// animação de CSS): nada de animar SVG pelo framer-motion, que não
// desenhava em alguns celulares.

interface MoodGridProps {
  slices: MoodSlice[];
  codeKeys: string[];
  selected: string | null;
  onToggle: (key: string) => void;
  compact?: boolean;
}

// Onda da superfície do líquido: dois períodos lado a lado, para deslizar sem
// emenda (a animação anda metade da largura).
const Wave: React.FC<{ color: string }> = ({ color }) => (
  <span aria-hidden className="mood-wave absolute left-0 -top-[5px] h-[6px] w-[200%] pointer-events-none">
    <svg viewBox="0 0 240 6" preserveAspectRatio="none" className="block w-full h-full">
      <path d="M0 3 Q 15 0 30 3 T 60 3 T 90 3 T 120 3 T 150 3 T 180 3 T 210 3 T 240 3 V 6 H 0 Z" fill={color} />
    </svg>
  </span>
);

const MoodGrid: React.FC<MoodGridProps> = ({ slices, codeKeys, selected, onToggle, compact = false }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [filled, setFilled] = useState(Boolean(reduceMotion));

  // O líquido sobe quando a grade aparece (e, por garantia, depois de um
  // instante mesmo que o aviso de "visível" não chegue).
  useEffect(() => {
    if (inView) setFilled(true);
  }, [inView]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFilled(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  const bySlice = new Map(slices.map((s) => [s.key, s]));
  const maxShare = Math.max(0.0001, ...slices.map((s) => s.share));
  const pct = (share: number) => `${Math.round(share * 100)}%`;

  return (
    <ul ref={ref} className="grid grid-cols-3 gap-2 sm:gap-3" aria-label={t('profile.observatory.gridLabel')}>
      {MOODS.map((mood, i) => {
        const slice = bySlice.get(mood.key);
        const share = slice?.share ?? 0;
        const films = slice?.films ?? 0;
        // nível: o humor mais visto enche até logo abaixo da letra (o topo do
        // frasco fica de vidro, para a letra aparecer); vazio fica com um fio
        const level = share > 0 ? 12 + (share / maxShare) * 50 : 3;
        const rank = codeKeys.indexOf(mood.key);
        const isSel = selected === mood.key;
        const dim = selected !== null && !isSel;
        const label = t('profile.observatory.arcLabel', {
          mood: t(mood.labelKey),
          pct: pct(share),
          count: films,
          avg: typeof slice?.avg === 'number' ? formatOne(slice.avg, i18n.language) : '–',
        });
        return (
          <li key={mood.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onToggle(mood.key)}
              aria-pressed={isSel}
              aria-label={label}
              title={label}
              className={`group relative block w-full overflow-hidden rounded-2xl text-left ${compact ? 'h-[98px]' : 'h-[118px]'} ${FOCUS_RING}`}
              style={{
                background: `linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02) 55%), rgba(18,13,34,0.55)`,
                boxShadow: isSel
                  ? `0 0 0 2px ${mood.color}, 0 14px 34px -14px ${mood.color}`
                  : rank >= 0
                    ? `inset 0 0 0 1.5px ${withMoodAlpha(mood, 0.75)}, 0 10px 26px -18px ${mood.color}`
                    : `inset 0 0 0 1px rgba(255,255,255,0.09)`,
                opacity: dim ? 0.5 : 1,
                transform: isSel ? 'translateY(-2px)' : undefined,
                transition: 'opacity 300ms ease, transform 300ms ease, box-shadow 300ms ease',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
            >
              {/* líquido */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: `${filled ? level : 0}%`,
                  background: `linear-gradient(180deg, ${withMoodAlpha(mood, isSel ? 0.75 : 0.55)}, ${withMoodAlpha(mood, isSel ? 0.35 : 0.2)})`,
                  transition: reduceMotion ? 'none' : `height 1100ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms, background 300ms ease`,
                }}
              >
                {share > 0 && <Wave color={withMoodAlpha(mood, isSel ? 0.75 : 0.55)} />}
              </span>
              {/* reflexo do vidro */}
              <span aria-hidden className="absolute inset-y-0 left-0 w-1/3 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.07), transparent)' }} />

              <span className="relative flex h-full flex-col justify-between p-2.5 sm:p-3">
                <span className="flex items-start justify-between gap-1">
                  <span style={{ ...PIXEL, color: mood.color, textShadow: `0 0 14px ${withMoodAlpha(mood, 0.6)}` }} className={`${compact ? 'text-xl' : 'text-2xl'} leading-none`}>
                    {mood.letter}
                  </span>
                  {rank >= 0 && (
                    <span
                      className="grid place-items-center w-5 h-5 rounded-full text-[11px] leading-none"
                      style={{ ...PIXEL, background: mood.color, color: NIGHT }}
                      aria-hidden
                    >
                      {rank + 1}
                    </span>
                  )}
                </span>
                <span className="block min-w-0">
                  <span style={{ ...PIXEL, color: PAPER, textShadow: '0 1px 8px rgba(18,13,34,0.7)' }} className={`block ${compact ? 'text-lg' : 'text-[22px]'} leading-none tabular-nums`}>
                    {pct(share)}
                  </span>
                  <span className={`mt-1 block truncate ${compact ? 'text-[10.5px]' : 'text-[12px]'} leading-tight`} style={{ color: share > 0 ? PAPER : MIST, opacity: 0.92, textShadow: '0 1px 6px rgba(18,13,34,0.75)' }}>
                    {t(mood.labelKey)}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default MoodGrid;
