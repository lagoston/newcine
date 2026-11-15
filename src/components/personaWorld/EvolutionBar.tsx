import React from 'react';
import { useTranslation } from 'react-i18next';
import { MOOD_BY_LETTER } from '../../lib/moods';
import type { HistoryRow } from '../../lib/personaHistory';
import { FOCUS_RING, MIST, PAPER, PIXEL } from '../../lib/oracleTheme';
import { PersonaCode } from '../PersonaBits';

// A barra da evolução, desde o início (14/11/2026, noite).
//
// Correção do Bruno à primeira versão (que tinha um botão "Reviver desde o
// início" e a história passando sozinha): "depois de 'sempre' e 'agora' com
// suas respectivas barras adicione a barra de evolução desde o início, mas sem
// um botão como você colocou, com uma animação da barra se mexendo; deixe
// apenas uma barra completa, com capacidade de ser movimentada pelo usuário."
//
// Então é a terceira linha do bloco das barras, do mesmo tamanho das outras
// duas. Ela nasce cheia (a ponta direita é hoje). Arrastar para a esquerda
// volta no tempo, nota a nota: o estúdio lá em cima, a Persona, a mariposa e
// as duas barras de cima mostram como tudo estava naquele ponto. Os risquinhos
// marcam as notas em que a Persona nasceu ou mudou de forma. Embaixo, uma
// linha diz em que ponto a barra está. Nada se mexe sozinho.
//
// Por baixo é um controle de arrastar de verdade (um <input type="range">
// invisível por cima do desenho): funciona com o dedo, o mouse e as setas do
// teclado, e o leitor de tela lê a posição.

export interface EvolutionBarProps {
  label: string;
  // quantas notas a história tem e em qual a barra está (total = hoje)
  total: number;
  position: number;
  // a história ainda está sendo buscada, ou não veio
  loading: boolean;
  failed: boolean;
  // as mudas: em que nota a Persona nasceu ou mudou
  marks: number[];
  // a nota em que a barra está parada e, se foi nela, a muda
  row: HistoryRow | null;
  molt: { from: string | null; to: string } | null;
  onSeek: (position: number) => void;
}

const dayLabel = (day: string, language: string): string => {
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(language, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const EvolutionBar: React.FC<EvolutionBarProps> = ({ label, total, position, loading, failed, marks, row, molt, onSeek }) => {
  const { t, i18n } = useTranslation();
  const ready = !loading && !failed && total > 0;
  const atEnd = position >= total;
  const share = total > 0 ? Math.max(0, Math.min(1, position / total)) : 1;
  const title = row ? (i18n.language.startsWith('pt') ? row.titlePt || row.titleEn : row.titleEn || row.titlePt) || t('personaWorld.untitled') : '';
  const mood = row?.letter ? MOOD_BY_LETTER[row.letter] : null;

  return (
    <>
      <div className="grid grid-cols-[68px_minmax(0,1fr)] items-center gap-2.5">
        <span style={{ ...PIXEL, color: MIST }} className="text-[13px] leading-none">
          {label}
        </span>
        <span className="relative block h-[22px]">
          {/* o trilho, a parte cheia e os risquinhos das mudas */}
          <span className="absolute inset-0 overflow-hidden rounded" style={{ background: 'rgba(243,234,211,0.1)' }} aria-hidden>
            <span className="absolute inset-y-0 left-0" style={{ width: `${share * 100}%`, background: ready ? 'linear-gradient(90deg, #7C5CD6, #F4C454)' : 'rgba(243,234,211,0.22)' }} />
            {ready &&
              marks.map((index) => (
                <span key={index} className="absolute inset-y-0 w-[2px]" style={{ left: `calc(${(index / total) * 100}% - 1px)`, background: 'rgba(13,9,25,0.6)' }} />
              ))}
          </span>
          {/* o cursor */}
          {ready && (
            <span
              className="pointer-events-none absolute top-1/2 h-[30px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-[3px]"
              style={{ left: `clamp(5px, ${share * 100}%, calc(100% - 5px))`, background: PAPER, boxShadow: '0 0 0 2px #150E26, 0 2px 6px rgba(0,0,0,0.6)' }}
              aria-hidden
            />
          )}
          <input
            type="range"
            min={0}
            max={Math.max(1, total)}
            step={1}
            value={ready ? position : Math.max(1, total)}
            disabled={!ready}
            onChange={(event) => onSeek(Number(event.target.value))}
            aria-label={t('personaWorld.replay.sliderAria')}
            aria-valuetext={atEnd ? t('personaWorld.replay.today', { count: total }) : position === 0 ? t('personaWorld.replay.before') : t('personaWorld.replay.position', { no: position, total })}
            className={`absolute -inset-y-[11px] inset-x-0 m-0 h-11 w-full cursor-pointer opacity-0 disabled:cursor-default ${FOCUS_RING} peer`}
          />
          {/* o foco do teclado, desenhado no trilho (o controle em si é invisível) */}
          <span className="pointer-events-none absolute -inset-[3px] hidden rounded-md ring-2 ring-fuchsia-300 peer-focus-visible:block" aria-hidden />
        </span>
      </div>

      {/* onde a barra está (altura fixa: nada pula enquanto ela anda) */}
      <div className="min-h-[2.6rem] text-[13px] leading-snug" aria-live="off">
        {loading ? (
          <p style={{ color: MIST }}>{t('personaWorld.replay.loading')}</p>
        ) : failed ? (
          <p style={{ color: MIST }} role="alert">
            {t('personaWorld.replay.error')}
          </p>
        ) : atEnd ? (
          <>
            <p style={PIXEL} className="text-[15px] leading-snug text-amber-300">
              {t('personaWorld.replay.today', { count: total })}
            </p>
            <p style={{ color: MIST }}>{t('personaWorld.replay.dragHint')}</p>
          </>
        ) : (
          <>
            <p style={{ color: PAPER }}>
              <span style={PIXEL} className="mr-2 text-[15px] leading-none text-amber-300">
                {position === 0 ? t('personaWorld.replay.before') : t('personaWorld.replay.position', { no: position, total })}
              </span>
              {row && <span style={{ color: MIST }}>{dayLabel(row.day, i18n.language)}</span>}
            </p>
            {row && (
              <p className="truncate" style={{ color: MIST }}>
                <span style={{ color: PAPER }}>{title}</span>
                {', '}
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
          </>
        )}
      </div>
    </>
  );
};

export default EvolutionBar;
