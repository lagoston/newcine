import React from 'react';
import { useTranslation } from 'react-i18next';
import OracleSheet from '../OracleSheet';
import { MIST, PAPER, PIXEL, FOCUS_RING, VELVET, withAlpha } from '../../lib/oracleTheme';
import { MOODS } from '../../lib/moods';
import type { AskMenu } from '../../lib/mesa/types';
import { OCCASION_ICON } from './occasionIcons';
import { useDialogFocus, useMesaLayerEntry } from './MesaLayer';

// "Todas" (SPEC §2.8, M8), 05/11/2026: a gaveta com as 12 ocasiões em três
// grupos, "Um humor" (as 9 letras com a cor da Persona) e "Da época" (só com o
// evento no ar). Uma pergunta por vez; a mesma pergunta no mesmo dia traz as
// mesmas cartas. É uma camada da pilha: Esc e o voltar do aparelho fecham.

interface AskDrawerProps {
  open: boolean;
  asks: AskMenu | null;
  current: string | null;
  currentMedia: 'movie' | 'tv' | null;
  onClose: () => void;
  onAsk: (key: string) => void;
  onClear: () => void;
}

const GROUPS: ('who' | 'time' | 'feel')[] = ['who', 'time', 'feel'];

const AskDrawer: React.FC<AskDrawerProps> = ({ open, asks, current, currentMedia, onClose, onAsk, onClear }) => {
  const { t } = useTranslation();
  useMesaLayerEntry(open, onClose, { ownEscape: true, modal: true });
  useDialogFocus(open);
  const occasions = (asks?.occasions ?? []).filter((o) => o.available).sort((a, b) => a.sort - b.sort);
  const chip = (key: string, id: string) => {
    const Icon = OCCASION_ICON[id];
    const on = current === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => onAsk(key)}
        aria-pressed={on}
        className={`inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-[10px] text-left ${FOCUS_RING}`}
        style={{
          background: on ? '#2A2050' : VELVET,
          color: PAPER,
          boxShadow: on ? 'inset 0 0 0 1.5px #B9A6FF' : 'inset 0 0 0 1px rgba(243,234,211,0.12)',
        }}
      >
        {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: on ? '#B9A6FF' : MIST }} aria-hidden />}
        <span className="text-[14px] leading-tight">{t(`mesa.occasions.${id}.name`)}</span>
        {on && (
          <span className="text-[11px] ml-1" style={{ color: '#B9A6FF' }}>
            {t('mesa.ask.current')}
          </span>
        )}
      </button>
    );
  };
  const groupTitle = (label: string) => (
    <h3 className="mt-6 mb-2.5 text-[13px]" style={{ ...PIXEL, color: MIST }}>
      {label}
    </h3>
  );
  return (
    <OracleSheet open={open} onClose={onClose} title={
        // Abaixo de 380 px o título longo era cortado com "…" (QA m3).
        <span style={{ fontSize: 21 }}>
          <span className="ms-title-long">{t('mesa.ask.drawerTitle')}</span>
          <span className="ms-title-short">{t('mesa.ask.drawerTitleShort')}</span>
        </span>
      } subtitle={t('mesa.ask.drawerLead')} size="md">
      {currentMedia && (
        <p className="-mt-1 mb-2 text-[12.5px] px-3 py-2 rounded-lg" style={{ color: MIST, background: 'rgba(243,234,211,0.05)' }}>
          {currentMedia === 'movie' ? t('mesa.ask.onlyMovies') : t('mesa.ask.onlyTv')}
        </p>
      )}
      {GROUPS.map((g) => {
        const list = occasions.filter((o) => o.grp === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            {groupTitle(t(`mesa.ask.group.${g}`))}
            <div className="flex flex-wrap gap-2">{list.map((o) => chip(`occ:${o.id}`, o.id))}</div>
          </div>
        );
      })}
      {groupTitle(t('mesa.ask.group.mood'))}
      {/* Os 9 humores em 5 + 4 no celular (como no Acervo); numa linha a partir de 640 px. */}
      <div className="grid grid-cols-5 sm:grid-cols-9 gap-2 sm:gap-1.5 max-w-[248px] sm:max-w-[400px]">
        {MOODS.filter((m) => !asks || asks.moods.includes(m.key)).map((m) => {
          const key = `mood:${m.key}`;
          const on = current === key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onAsk(key)}
              aria-pressed={on}
              aria-label={t('mesa.ask.moodAria', { mood: t(m.labelKey) })}
              title={t(m.labelKey)}
              className={`aspect-square min-h-[36px] rounded-[8px] grid place-items-center ${FOCUS_RING}`}
              style={{
                ...PIXEL,
                fontSize: 18,
                color: on ? '#120D22' : m.color,
                background: on ? m.color : withAlpha(m.color, 0.12),
                boxShadow: `inset 0 0 0 1px ${withAlpha(m.color, on ? 1 : 0.45)}`,
              }}
            >
              {m.letter}
            </button>
          );
        })}
      </div>
      {asks?.season && (
        <>
          {groupTitle(t('mesa.ask.group.season'))}
          <div className="flex flex-wrap gap-2">{chip(`season:${asks.season.id}`, asks.season.id)}</div>
        </>
      )}
      {current && (
        <button
          type="button"
          onClick={onClear}
          className={`mt-7 w-full h-11 rounded-[10px] text-[14px] font-semibold ${FOCUS_RING}`}
          style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.28)' }}
        >
          {t('mesa.top.clearAsk')}
        </button>
      )}
    </OracleSheet>
  );
};

export default AskDrawer;
