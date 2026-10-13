import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import type { Affinity } from '../../lib/tasteStats';
import { formatOne } from './observatoryKit';

// Temas (palavras-chave do TMDB) mais bem avaliados, como etiquetas de vidro
// (13/10/2026). O TAMANHO da etiqueta é a nota média que a pessoa dá aos
// filmes com aquele tema (três tamanhos, da menor à maior nota da lista), e
// a média vem escrita dentro. Para não virar um emaranhado, aparecem no
// máximo `perGroup` de cada vez; os grupos se alternam sozinhos a cada
// poucos segundos (e pelas bolinhas), e cada grupo mistura etiquetas
// grandes e pequenas.

interface KeywordCloudProps {
  words: Affinity[];
  perGroup: number;
  accent: string;
  emptyText: string;
  compact?: boolean;
}

const CYCLE_MS = 4200;

// Etiqueta de cada tamanho (nota mais alta = etiqueta maior).
const TIER_CLASS = {
  wide: ['h-8 px-3 gap-1.5 text-[13px]', 'h-9 px-3.5 gap-2 text-[15px]', 'h-10 px-4 gap-2 text-[17px]'],
  compact: ['h-7 px-2.5 gap-1.5 text-[12px]', 'h-8 px-3 gap-1.5 text-[13.5px]', 'h-9 px-3.5 gap-2 text-[15px]'],
} as const;

// "#RRGGBB" + opacidade
const withHexAlpha = (hex: string, alpha: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

const KeywordCloud: React.FC<KeywordCloudProps> = ({ words, perGroup, accent, emptyText, compact = false }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-40px' });
  const [group, setGroup] = useState(0);

  const groups = useMemo(() => {
    const count = Math.max(1, Math.ceil(words.length / perGroup));
    return Array.from({ length: count }, (_, g) => words.filter((_, i) => i % count === g));
  }, [words, perGroup]);
  const wordsKey = words.map((w) => w.key).join('|');
  useEffect(() => setGroup(0), [wordsKey, perGroup]);
  useEffect(() => {
    if (reduceMotion || groups.length < 2 || !inView) return;
    const timer = window.setInterval(() => setGroup((g) => (g + 1) % groups.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [groups.length, reduceMotion, inView, group]);

  // Três tamanhos, pela nota média (terços entre a menor e a maior nota da
  // lista toda, para os grupos falarem a mesma escala).
  const avgs = words.map((w) => w.avg);
  const lo = avgs.length ? Math.min(...avgs) : 0;
  const hi = avgs.length ? Math.max(Math.max(...avgs), lo + 1) : 1;
  const tierOf = (avg: number): 0 | 1 | 2 => {
    const pos = (avg - lo) / (hi - lo);
    return pos >= 0.67 ? 2 : pos >= 0.34 ? 1 : 0;
  };
  const current = groups[Math.min(group, groups.length - 1)] || [];

  if (words.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: MIST }}>
        {emptyText}
      </p>
    );
  }

  return (
    <div ref={ref}>
      <div className={`relative ${compact ? 'min-h-[36px]' : 'min-h-[40px]'}`} aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.ul
            key={`${wordsKey}-${group}`}
            className="flex flex-wrap items-center gap-2"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {current.map((item, i) => {
              const tier = tierOf(item.avg);
              return (
                <motion.li
                  key={item.key}
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 + i * 0.06, duration: 0.3, ease: 'easeOut' }}
                  title={t('profile.observatory.keywordTitle', { name: item.name, count: item.count, avg: formatOne(item.avg, i18n.language) })}
                >
                  <span
                    className={`inline-flex items-center rounded-full leading-none ${TIER_CLASS[compact ? 'compact' : 'wide'][tier]}`}
                    style={{
                      background: tier === 2 ? withHexAlpha(accent, 0.16) : 'rgba(255,255,255,0.045)',
                      boxShadow: `inset 0 0 0 1px ${withHexAlpha(accent, [0.22, 0.38, 0.6][tier])}`,
                      color: PAPER,
                    }}
                  >
                    <span className="capitalize font-medium">{item.name}</span>
                    <span className="tabular-nums" style={{ ...PIXEL, color: MIST, fontSize: '0.78em' }}>
                      {formatOne(item.avg, i18n.language)}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      </div>
      {groups.length > 1 && (
        <div className="mt-1 -ml-2 flex items-center" role="tablist" aria-label={t('profile.observatory.keywordGroups')}>
          {groups.map((_, g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={g === group}
              aria-label={t('profile.observatory.keywordGroup', { n: g + 1, total: groups.length })}
              onClick={() => setGroup(g)}
              className={`grid place-items-center w-7 h-7 min-h-0 min-w-0 rounded-full ${FOCUS_RING}`}
            >
              <span
                className="block h-1.5 rounded-full transition-all duration-500"
                style={{ width: g === group ? 16 : 6, background: g === group ? accent : 'rgba(243,234,211,0.25)' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default KeywordCloud;
