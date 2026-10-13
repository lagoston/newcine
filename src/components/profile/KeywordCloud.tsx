import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, FOCUS_RING } from '../../lib/oracleTheme';
import type { Affinity } from '../../lib/tasteStats';
import { formatOne } from './observatoryKit';

// Temas (palavras-chave do TMDB) mais bem avaliados, como palavras soltas
// (13/10/2026). O TAMANHO de cada palavra é a nota média que a pessoa dá aos
// filmes com aquele tema (na escala da menor à maior nota da lista). Para
// não virar um emaranhado, aparecem no máximo `perGroup` de cada vez; os
// grupos se alternam sozinhos a cada poucos segundos (e pelas bolinhas), e
// cada grupo mistura palavras grandes e pequenas.

interface KeywordCloudProps {
  words: Affinity[];
  perGroup: number;
  accent: string;
  emptyText: string;
  compact?: boolean;
}

const CYCLE_MS = 4200;

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

  const [minSize, maxSize] = compact ? [12.5, 22] : [13, 27];
  const avgs = words.map((w) => w.avg);
  const lo = avgs.length ? Math.min(...avgs) : 0;
  const hi = avgs.length ? Math.max(Math.max(...avgs), lo + 1) : 1;
  const sizeOf = (avg: number) => Math.round((minSize + ((avg - lo) / (hi - lo)) * (maxSize - minSize)) * 2) / 2;
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
      <div className={`relative ${compact ? 'min-h-[50px]' : 'min-h-[56px]'}`} aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.ul
            key={`${wordsKey}-${group}`}
            className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {current.map((item, i) => {
              const size = sizeOf(item.avg);
              const strength = (size - minSize) / (maxSize - minSize || 1);
              return (
                <motion.li
                  key={item.key}
                  initial={reduceMotion ? false : { opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ delay: 0.05 + i * 0.08, duration: 0.45, ease: 'easeOut' }}
                  title={t('profile.observatory.keywordTitle', { name: item.name, count: item.count, avg: formatOne(item.avg, i18n.language) })}
                  className="leading-tight"
                >
                  <span
                    className="capitalize"
                    style={{
                      fontSize: size,
                      fontWeight: size > 18 ? 600 : 500,
                      color: PAPER,
                      opacity: 0.6 + strength * 0.4,
                      textShadow: `0 0 ${10 + strength * 14}px ${withHexAlpha(accent, 0.35 + strength * 0.35)}`,
                    }}
                  >
                    {item.name}
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
