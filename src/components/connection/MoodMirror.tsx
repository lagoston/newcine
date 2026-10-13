import React, { useRef } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import UserAvatar, { type AvatarUser } from '../UserAvatar';
import { MOODS } from '../../lib/moods';
import type { MoodScore } from '../../lib/persona';
import { MIST, PIXEL } from '../../lib/oracleTheme';

// "Humores lado a lado" (13/10/2026): os 9 humores na ordem de sempre, em
// barras espelhadas. A sua cresce para a esquerda, a da outra pessoa para a
// direita, com a porcentagem na ponta. A parte de cada humor = filmes
// daquele humor / todos os filmes nas prateleiras. Barras em HTML com
// transição de largura (nada de SVG animado).

interface MoodMirrorProps {
  me: AvatarUser;
  other: AvatarUser;
  meName: string;
  otherName: string;
  meScores: MoodScore[];
  otherScores: MoodScore[];
}

// Parte de cada humor (0 a 1), por mood key.
const shares = (scores: MoodScore[]) => {
  const total = scores.reduce((sum, s) => sum + Math.max(0, s.films), 0);
  const map = new Map<string, number>();
  if (total <= 0) return map;
  scores.forEach((s) => map.set(s.moodKey, Math.max(0, s.films) / total));
  return map;
};

// Espaço da porcentagem na ponta de cada barra.
const LABEL = 34;

const MoodMirror: React.FC<MoodMirrorProps> = ({ me, other, meName, otherName, meScores, otherScores }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const shown = inView || Boolean(reduceMotion);
  const mine = shares(meScores);
  const theirs = shares(otherScores);
  // A maior parte dos dois vira a barra cheia (as duas na mesma escala).
  const max = Math.max(0.01, ...Array.from(mine.values()), ...Array.from(theirs.values()));

  const bar = (share: number, color: string, side: 'left' | 'right') => (
    <span
      className={`block h-2.5 shrink-0 transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${side === 'left' ? 'rounded-l-full' : 'rounded-r-full'}`}
      style={{ width: shown ? `calc((100% - ${LABEL + 6}px) * ${(share / max).toFixed(4)})` : 0, background: color, minWidth: share > 0 ? 3 : 0 }}
      aria-hidden
    />
  );
  const pct = (share: number, side: 'left' | 'right') => (
    <span className={`block text-[12px] tabular-nums leading-none shrink-0 ${side === 'left' ? 'text-right' : 'text-left'}`} style={{ width: LABEL, color: MIST }} aria-hidden>
      {Math.round(share * 100)}%
    </span>
  );

  return (
    <div ref={ref}>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <UserAvatar user={me} size={22} plain />
          <span className="text-[12.5px] truncate" style={{ color: MIST }}>
            {meName}
          </span>
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12.5px] truncate" style={{ color: MIST }}>
            {otherName}
          </span>
          <UserAvatar user={other} size={22} plain />
        </span>
      </div>
      <ul className="space-y-1.5">
        {MOODS.map((mood) => {
          const a = mine.get(mood.key) ?? 0;
          const b = theirs.get(mood.key) ?? 0;
          const label = `${t(mood.labelKey)}: ${meName} ${Math.round(a * 100)}%, ${otherName} ${Math.round(b * 100)}%`;
          return (
            <li key={mood.key} className="grid grid-cols-[1fr_96px_1fr] sm:grid-cols-[1fr_168px_1fr] items-center gap-1.5 min-h-[30px]" aria-label={label}>
              <span className="flex items-center justify-end gap-1.5 min-w-0">
                {pct(a, 'left')}
                {bar(a, mood.color, 'left')}
              </span>
              <span className="flex items-center justify-center gap-1 min-w-0 text-center" aria-hidden>
                <span style={{ ...PIXEL, color: mood.color }} className="text-[14px] leading-none">
                  {mood.letter}
                </span>
                <span className="text-[11.5px] sm:text-[12.5px] leading-tight line-clamp-2" style={{ color: mood.color }}>
                  {t(mood.labelKey)}
                </span>
              </span>
              <span className="flex items-center justify-start gap-1.5 min-w-0">
                {bar(b, mood.color, 'right')}
                {pct(b, 'right')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default MoodMirror;
