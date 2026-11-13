import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { FOCUS_RING, INK, MIST, PAPER, VELVET } from '../../lib/oracleTheme';
import type { AcervoOccasion } from '../../lib/mesa/types';
import { OCCASION_ICON } from './occasions';

// As ocasiões do Acervo (09/11/2026), pedido do Bruno: das ocasiões da Mesa
// ("Com a galera", "Só eu e a chuva", "Com quem eu amo"…) ele gostou; elas
// filtram a grade. Tocar numa ficha mostra os títulos do oráculo da vez que
// combinam com a ocasião, em todos os humores; tocar de novo tira o filtro. A
// lista vem do banco (mesa_occasions, com a da época quando o evento está no
// ar); enquanto ela não chega, as 12 fixas aparecem na hora.
//
// 13/11/2026: as fichas saíram da fileira que rolava de lado e moram num
// painel que abre pelo botão da décima casa das letras (MoodPicker), pedido do
// Bruno: "No espaço vazio que teria a décima categoria, adicione um botão que
// deve conter todos os 'só eu e a chuva', 'Em família' etc." No painel, as
// fichas quebram em linhas e vêm em grupos (com quem, quanto tempo, pra
// sentir, da época), na ordem do banco.

const GROUPS = ['who', 'time', 'feel', 'season'] as const;

interface OccasionPanelProps {
  id: string;
  occasions: AcervoOccasion[];
  active: string | null;
  onSelect: (id: string | null) => void;
}

const OccasionPanel: React.FC<OccasionPanelProps> = ({ id, occasions, active, onSelect }) => {
  const { t } = useTranslation();
  // Grupo que o site não conhece (novo no banco) vai para o fim, sem título.
  const known = new Set<string>(GROUPS);
  const groups: { key: string; items: AcervoOccasion[] }[] = [
    ...GROUPS.map((g) => ({ key: g as string, items: occasions.filter((o) => o.grp === g) })),
    { key: 'other', items: occasions.filter((o) => !known.has(o.grp)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div
      id={id}
      role="group"
      aria-label={t('acervo.occasionsLabel')}
      className="rounded-2xl px-3 pt-3 pb-3.5 sm:px-4 sm:pt-3.5 sm:pb-4 flex flex-col gap-3"
      style={{ background: 'rgba(243,234,211,0.035)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.1)' }}
    >
      {groups.map((group) => (
        <div key={group.key}>
          {group.key !== 'other' && (
            <p className="mb-1.5 text-[12px] leading-none" style={{ color: MIST }}>
              {t(`acervo.occasionGroups.${group.key}`)}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {group.items.map((occasion) => {
              const on = occasion.id === active;
              const Icon = OCCASION_ICON[occasion.id];
              return (
                <button
                  key={occasion.id}
                  type="button"
                  data-occasion={occasion.id}
                  onClick={() => onSelect(on ? null : occasion.id)}
                  aria-pressed={on}
                  title={on ? t('acervo.occasionClear') : t(`mesa.occasions.${occasion.id}.name`)}
                  className={`inline-flex items-center gap-1.5 h-10 pl-3 ${on ? 'pr-2' : 'pr-3.5'} rounded-full text-[13px] sm:text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 ${FOCUS_RING} ${
                    on ? '' : 'hover:bg-white/[0.07]'
                  }`}
                  style={
                    on
                      ? { background: PAPER, color: INK, boxShadow: '0 6px 18px -10px rgba(243,234,211,0.7)' }
                      : { background: VELVET, color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14)' }
                  }
                >
                  {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: on ? INK : MIST }} aria-hidden />}
                  {t(`mesa.occasions.${occasion.id}.short`)}
                  {on && <X className="w-4 h-4 shrink-0 opacity-70" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default OccasionPanel;
