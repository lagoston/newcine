import React from 'react';
import { useTranslation } from 'react-i18next';
import { MOODS, MOOD_BY_KEY, withMoodAlpha } from '../lib/moods';
import type { MoodScore } from '../lib/persona';
import { PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// As nove prateleiras de alguém, da mais usada pra menos usada: a barra é
// a soma das notas dos filmes avaliados naquela prateleira. As três que
// formam a personalidade ficam acesas; as outras, apagadas.
const MoodBars: React.FC<{
  scores: MoodScore[];
  // Quantas ficam acesas (as que formam o código). 0 = nenhuma.
  highlight?: number;
  compact?: boolean;
}> = ({ scores, highlight = 3, compact = false }) => {
  const { t, i18n } = useTranslation();

  // Sem nada calculado ainda: as nove prateleiras zeradas, na ordem fixa.
  const rows: MoodScore[] = scores.length > 0 ? scores : MOODS.map((m) => ({ moodKey: m.key, score: 0, films: 0 }));
  const max = Math.max(1, ...rows.map((r) => r.score));

  return (
    <ol className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {rows.map((row, i) => {
        const mood = MOOD_BY_KEY[row.moodKey];
        if (!mood) return null;
        const lit = i < highlight && row.films > 0;
        const width = row.score > 0 ? Math.max(3, (row.score / max) * 100) : 0;
        return (
          <li key={row.moodKey} className="flex items-center gap-3">
            <span
              className="grid place-items-center w-7 h-7 shrink-0 rounded-lg text-base leading-none"
              style={{ ...PIXEL, color: mood.color, background: withMoodAlpha(mood, lit ? 0.2 : 0.08), boxShadow: lit ? `inset 0 0 0 1px ${withMoodAlpha(mood, 0.5)}` : undefined }}
              aria-hidden
            >
              {mood.letter}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate" style={{ color: lit ? PAPER : MIST, fontWeight: lit ? 600 : 400 }}>
                  {t(mood.labelKey)}
                </span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: MIST }}>
                  {t('oracle.persona.points', { count: row.score, formatted: row.score.toLocaleString(i18n.language) })}
                  {!compact && ` · ${t('oracle.persona.films', { count: row.films })}`}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${width}%`, background: lit ? mood.color : withMoodAlpha(mood, 0.4) }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default MoodBars;
