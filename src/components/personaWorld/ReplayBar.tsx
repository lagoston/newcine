import React from 'react';
import { useTranslation } from 'react-i18next';
import { History, Pause, Play, RotateCcw, X } from 'lucide-react';
import { MOOD_BY_LETTER } from '../../lib/moods';
import type { HistoryRow } from '../../lib/personaHistory';
import { FOCUS_RING, MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import { PersonaCode } from '../PersonaBits';

// A barra "Reviver desde o início" (14/11/2026), embaixo da cena do estúdio.
//
// Pedido do Bruno: o modal "deve herdar aquela barra 'reviver desde o início'
// dentro do protótipo, devidamente adaptada para nosso modelo do estúdio".
//
//   • Fechada: um botão só, "Reviver desde o início".
//   • Aberta: o estúdio volta ao dia da primeira nota e a história passa
//     sozinha, nota a nota (as latas enchendo, a lagarta, o casulo, a
//     mariposa, os móveis chegando). Dá para pausar, arrastar a barra para
//     qualquer ponto e voltar para hoje. Em cada muda a história para um
//     instante.
//   • A linha de baixo diz onde se está: o número da nota, o dia, o título e
//     a nota que ele levou; e, quando é o caso, "Nasceu MAC" ou "Virou MXC".
// Só existe no estúdio da própria pessoa. Com "reduzir movimento" a história
// não passa sozinha: a barra abre parada e a pessoa arrasta.

const GHOST = `inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`;
const ROUND = `grid place-items-center w-11 h-11 shrink-0 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 transition ${FOCUS_RING}`;

const dayLabel = (day: string): string => {
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}/${m}/${y}` : day;
};

export interface ReplayBarProps {
  // null = fechada
  position: number | null;
  total: number;
  playing: boolean;
  loading: boolean;
  failed: boolean;
  // a nota em que a história está (a de número `position`)
  row: HistoryRow | null;
  // a muda que aconteceu nessa nota, se houve
  molt: { from: string | null; to: string } | null;
  onStart: () => void;
  onSeek: (position: number) => void;
  onToggle: () => void;
  onClose: () => void;
}

const ReplayBar: React.FC<ReplayBarProps> = ({ position, total, playing, loading, failed, row, molt, onStart, onSeek, onToggle, onClose }) => {
  const { t, i18n } = useTranslation();

  if (position === null) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={onStart} disabled={loading} className={`${GHOST} disabled:opacity-60`} style={{ color: PAPER }}>
          <History className="w-[18px] h-[18px] text-amber-300" aria-hidden />
          {loading ? t('personaWorld.replay.loading') : t('personaWorld.replay.start')}
        </button>
        <span className="text-[13px] leading-snug" style={{ color: MIST }} role={failed ? 'alert' : undefined}>
          {failed ? t('personaWorld.replay.error') : t('personaWorld.replay.startHint')}
        </span>
      </div>
    );
  }

  const atEnd = position >= total;
  const title = row ? (i18n.language.startsWith('pt') ? row.titlePt || row.titleEn : row.titleEn || row.titlePt) || t('personaWorld.untitled') : '';
  const mood = row?.letter ? MOOD_BY_LETTER[row.letter] : null;

  return (
    <div className="rounded-2xl p-3 ring-1 ring-white/10" style={{ background: 'rgba(28,20,51,0.6)' }}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={atEnd ? () => onSeek(0) : onToggle}
          className={ROUND}
          style={{ color: PAPER }}
          aria-label={atEnd ? t('personaWorld.replay.again') : playing ? t('personaWorld.replay.pause') : t('personaWorld.replay.play')}
          title={atEnd ? t('personaWorld.replay.again') : playing ? t('personaWorld.replay.pause') : t('personaWorld.replay.play')}
        >
          {atEnd ? <RotateCcw className="w-[18px] h-[18px]" aria-hidden /> : playing ? <Pause className="w-[18px] h-[18px]" aria-hidden /> : <Play className="w-[18px] h-[18px] fill-current" aria-hidden />}
        </button>
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={position}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label={t('personaWorld.replay.sliderAria')}
          aria-valuetext={atEnd ? t('personaWorld.replay.today', { total }) : t('personaWorld.replay.position', { no: position, total })}
          className="min-w-0 flex-1 h-11 accent-amber-300 cursor-pointer"
        />
        <button type="button" onClick={onClose} className={ROUND} style={{ color: PAPER }} aria-label={t('personaWorld.replay.close')} title={t('personaWorld.replay.close')}>
          <X className="w-[18px] h-[18px]" aria-hidden />
        </button>
      </div>

      {/* onde a história está (altura fixa: nada pula enquanto ela passa) */}
      <div className="mt-2 min-h-[2.6rem] text-[13px] leading-snug" aria-live="off">
        <p style={{ color: PAPER }}>
          <span style={PIXEL} className="mr-2 text-[15px] leading-none text-amber-300">
            {atEnd ? t('personaWorld.replay.today', { total }) : position === 0 ? t('personaWorld.replay.before') : t('personaWorld.replay.position', { no: position, total })}
          </span>
          {!atEnd && row && <span style={{ color: MIST }}>{dayLabel(row.day)}</span>}
        </p>
        {!atEnd && row && (
          <p className="truncate" style={{ color: MIST }}>
            <span style={{ color: PAPER }}>{title}</span>
            {' · '}
            {mood ? (
              <>
                {t('personaWorld.replay.rated', { rating: row.rating })} <span style={{ color: mood.color }}>{t(mood.labelKey)}</span>
              </>
            ) : (
              t('personaWorld.replay.ratedOut', { rating: row.rating })
            )}
            {molt && (
              <span className="ml-2 inline-flex items-baseline gap-1.5" style={{ color: PAPER }}>
                {molt.from ? t('personaWorld.replay.changed') : t('personaWorld.replay.born')}
                <PersonaCode code={molt.to} className="text-[15px] leading-none tracking-[0.06em]" />
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
};

export default ReplayBar;
