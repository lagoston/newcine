import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MIST, PAPER, PIXEL, FOCUS_RING, VELVET } from '../../lib/oracleTheme';
import { getAskCounts } from '../../lib/mesa/prefs';
import type { AskMenu } from '../../lib/mesa/types';
import { OCCASION_ICON } from './occasionIcons';
import { askI18nId } from './mesaText';

// A mão de perguntas (SPEC §2.2 e §2.9), 05/11/2026: fichas no pé da Mesa. O
// cálculo das sugestões é feito no aparelho, com o relógio local: a sazonal (se
// o evento estiver no ar), as da hora e do dia, as 2 que a pessoa mais pergunta
// e um complemento fixo. A última ficha é sempre "Todas". O arco de quatro
// cores no alto de cada ficha é o símbolo da Mesa (as fichas são cartas
// pequenas, não filtros).

const occ = (id: string) => `occ:${id}`;

export function handSuggestions(asks: AskMenu | null, count: number, now: Date = new Date()): string[] {
  const available = new Set((asks?.occasions ?? []).filter((o) => o.available).map((o) => o.id));
  const ok = (key: string) => {
    if (key.startsWith('season:')) return !!asks?.season && key === `season:${asks.season.id}`;
    // Sem o menu ainda (carregando), todas as ocasiões fixas valem.
    return !asks || available.has(askI18nId(key));
  };
  const out: string[] = [];
  const push = (k: string) => {
    if (out.length < count && ok(k) && !out.includes(k)) out.push(k);
  };
  if (asks?.season) push(`season:${asks.season.id}`);
  const h = now.getHours();
  const d = now.getDay();
  const late = h >= 23 || h < 4;
  if (late) ['no', 'susto', 'episodio'].forEach((k) => push(occ(k)));
  else if ((d === 5 || d === 6) && h >= 18) ['galera', 'amor', 'rir'].forEach((k) => push(occ(k)));
  else if (d === 0 && h >= 9 && h < 18) ['familia', 'colo'].forEach((k) => push(occ(k)));
  else if (d === 6 && h >= 9 && h < 18) push(occ('maratona'));
  else if (d >= 1 && d <= 5 && h >= 19) ['noventa', 'episodio'].forEach((k) => push(occ(k)));
  else ['chuva', 'chorar'].forEach((k) => push(occ(k)));
  Object.entries(getAskCounts())
    .filter(([k]) => k.startsWith('occ:') || k.startsWith('season:'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .forEach(([k]) => push(k));
  ['chorar', 'rir', 'amor', 'noventa', 'chuva', 'no'].forEach((k) => push(occ(k)));
  return out;
}

export const ArcStripe: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden className={`absolute inset-x-0 top-0 h-[2px] ${className}`} style={{ background: 'linear-gradient(90deg, #B9A6FF, #E2A9F3 35%, #A6CFF5 65%, #86E3CC)' }} />
);

interface HandProps {
  asks: AskMenu | null;
  current: string | null;
  desktop: boolean;
  highlight?: boolean;
  onAsk: (key: string) => void;
  onAll: () => void;
}

const AskHand: React.FC<HandProps> = ({ asks, current, desktop, highlight = false, onAsk, onAll }) => {
  const { t } = useTranslation();
  const count = desktop ? 6 : 3;
  const keys = useMemo(() => handSuggestions(asks, count), [asks, count]);
  return (
    <nav aria-label={t('mesa.ask.handAria')}>
      <p className="mb-1.5 text-[12px]" style={{ ...PIXEL, color: MIST }}>
        {t('mesa.ask.title')}
      </p>
      <ul className={`grid gap-2 ${desktop ? 'grid-cols-5 xl:grid-cols-7' : 'grid-cols-4'}`}>
        {keys.map((key, i) => {
          const id = askI18nId(key);
          const Icon = OCCASION_ICON[id];
          const on = current === key;
          return (
            <li key={key} className={desktop && i >= 4 ? 'hidden xl:block' : undefined}>
              <button
                type="button"
                onClick={() => onAsk(key)}
                aria-pressed={on}
                title={t(`mesa.occasions.${id}.phrase`)}
                aria-label={`${t(`mesa.occasions.${id}.name`)}. ${t(`mesa.occasions.${id}.phrase`)}`}
                className={`ms-chip relative w-full h-14 overflow-hidden rounded-[8px] px-1.5 flex flex-col items-center justify-center gap-[3px] ${FOCUS_RING}`}
                style={{
                  background: on ? '#2A2050' : VELVET,
                  boxShadow: on
                    ? 'inset 0 0 0 1.5px #B9A6FF, 0 6px 16px -8px rgba(185,166,255,0.6)'
                    : highlight
                      ? 'inset 0 0 0 1px rgba(134,227,204,0.7), 0 0 14px -4px rgba(134,227,204,0.55)'
                      : 'inset 0 0 0 1px rgba(243,234,211,0.12)',
                }}
              >
                <ArcStripe className={on ? '' : 'opacity-60'} />
                {Icon && <Icon className="w-[15px] h-[15px] shrink-0" style={{ color: on ? '#B9A6FF' : MIST }} aria-hidden />}
                <span className="text-[11.5px] leading-[13px] text-center line-clamp-2 font-medium" style={{ color: PAPER }}>
                  {t(`mesa.occasions.${id}.short`)}
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onAll}
            aria-label={t('mesa.ask.allAria')}
            aria-haspopup="dialog"
            className={`relative w-full h-14 rounded-[8px] flex items-center justify-center gap-0.5 ${FOCUS_RING}`}
            style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.28)', background: 'rgba(243,234,211,0.04)' }}
          >
            <span style={{ ...PIXEL, fontSize: 14 }}>{t('mesa.ask.all')}</span>
            <ChevronRight className="w-4 h-4" aria-hidden />
          </button>
        </li>
      </ul>
    </nav>
  );
};

export default AskHand;
