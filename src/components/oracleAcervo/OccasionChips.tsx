import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { FOCUS_RING, INK, MIST, PAPER, VELVET } from '../../lib/oracleTheme';
import type { AcervoOccasion } from '../../lib/mesa/types';
import { OCCASION_ICON } from './occasions';

// As fichas das ocasiões no Acervo (09/11/2026), pedido do Bruno: das ocasiões
// da Mesa ("Com a galera", "Só eu e a chuva", "Com quem eu amo"…) ele gostou;
// agora elas filtram a grade. Tocar numa ficha mostra os títulos do oráculo
// da vez que combinam com a ocasião, em todos os humores; tocar de novo tira
// o filtro. A lista vem do banco (mesa_occasions, com a da época quando o
// evento está no ar); enquanto ela não chega, as 12 fixas aparecem na hora.
// No celular a fileira rola de lado dentro dela mesma; no computador quebra
// em linhas.

interface OccasionChipsProps {
  occasions: AcervoOccasion[];
  active: string | null;
  onSelect: (id: string | null) => void;
}

const OccasionChips: React.FC<OccasionChipsProps> = ({ occasions, active, onSelect }) => {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);

  // A ficha ativa (link direto, ?ocasiao=) aparece na fileira do celular.
  useEffect(() => {
    if (!active) return;
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>(`[data-occasion="${active}"]`);
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 16) });
    }
  }, [active]);

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={t('acervo.occasionsLabel')}
      className="ac-chips -mx-4 px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 flex gap-2 overflow-x-auto lg:overflow-visible lg:flex-wrap py-1"
    >
      {occasions.map((occasion) => {
        const on = occasion.id === active;
        const Icon = OCCASION_ICON[occasion.id];
        const label = t(`mesa.occasions.${occasion.id}.short`);
        return (
          <button
            key={occasion.id}
            type="button"
            data-occasion={occasion.id}
            onClick={() => onSelect(on ? null : occasion.id)}
            aria-pressed={on}
            title={on ? t('acervo.occasionClear') : t(`mesa.occasions.${occasion.id}.name`)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-10 pl-3 ${on ? 'pr-2' : 'pr-3.5'} rounded-full text-[13px] sm:text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 ${FOCUS_RING} ${
              on ? '' : 'hover:bg-white/[0.07]'
            }`}
            style={
              on
                ? { background: PAPER, color: INK, boxShadow: '0 6px 18px -10px rgba(243,234,211,0.7)' }
                : { background: VELVET, color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14)' }
            }
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: on ? INK : MIST }} aria-hidden />}
            {label}
            {on && <X className="w-4 h-4 shrink-0 opacity-70" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
};

export default OccasionChips;
