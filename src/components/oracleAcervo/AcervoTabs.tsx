import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UserCircle2 } from 'lucide-react';
import { FOCUS_RING, MIST, NIGHT, PAPER, PIXEL, ORACLES, withAlpha } from '../../lib/oracleTheme';
import type { OracleSlot } from '../../lib/mesa/types';

// As três abas de oráculo do Acervo (SPEC §2.13), 05/11/2026: retrato, nome e
// um traço na cor do bicho. Tocar de novo na aba ativa abre o perfil do
// oráculo (OracleProfileSheet) — o que antes a carta grande da Biblioteca
// fazia. A marca de "perfil" na aba ativa avisa que ela abre algo.
//
// role="tablist" com roving tabindex: Tab entra na aba ativa, as setas andam.

interface AcervoTabsProps {
  active: OracleSlot;
  panelId: string;
  onSelect: (oracle: OracleSlot) => void;
  onOpenProfile: (oracle: OracleSlot) => void;
}

const AcervoTabs: React.FC<AcervoTabsProps> = ({ active, panelId, onSelect, onOpenProfile }) => {
  const { t } = useTranslation();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = ORACLES.length - 1;
    let next = -1;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onSelect(ORACLES[next].id);
  };

  return (
    <div role="tablist" aria-label={t('acervo.title')} className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:flex lg:justify-start lg:gap-2">
      {ORACLES.map((oracle, index) => {
        const isActive = oracle.id === active;
        return (
          <button
            key={oracle.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`acervo-tab-${oracle.id}`}
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            // Na ativa, o nome acessível diz o que o toque faz agora (abrir o perfil).
            aria-label={isActive ? `${t('acervo.oracleTab', { oracle: oracle.name })}. ${t('acervo.profileHint')}` : t('acervo.oracleTab', { oracle: oracle.name })}
            title={isActive ? t('acervo.profileHint') : undefined}
            onClick={() => (isActive ? onOpenProfile(oracle.id) : onSelect(oracle.id))}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`group relative flex items-center justify-center lg:justify-start gap-1.5 min-[400px]:gap-2 min-w-0 h-12 px-1.5 min-[400px]:px-2 lg:pl-2 lg:pr-4 rounded-xl transition-colors ${FOCUS_RING} ${
              isActive ? '' : 'hover:bg-white/[0.05]'
            }`}
            style={{
              background: isActive ? withAlpha(oracle.color, 0.12) : undefined,
              boxShadow: isActive ? `inset 0 0 0 1px ${withAlpha(oracle.color, 0.45)}` : 'inset 0 0 0 1px rgba(243,234,211,0.08)',
            }}
          >
            <span className="relative shrink-0">
              <img
                src={oracle.avatar}
                alt=""
                width={28}
                height={28}
                decoding="async"
                className="block w-6 h-6 min-[400px]:w-7 min-[400px]:h-7 rounded-full object-cover"
                style={{ boxShadow: `0 0 0 1.5px ${isActive ? oracle.color : 'rgba(243,234,211,0.18)'}`, opacity: isActive ? 1 : 0.8 }}
              />
              {/* Na ativa, a marca de perfil fica no canto do retrato: cabe nas
                  abas de 360 px sem cortar o nome (retrato de 24 px e nome em
                  15 px abaixo de 400 px de largura). */}
              {isActive && (
                <span aria-hidden className="absolute -right-1 -bottom-1 grid place-items-center w-3.5 h-3.5 rounded-full" style={{ background: PAPER, boxShadow: `0 0 0 1.5px ${NIGHT}` }}>
                  <UserCircle2 className="w-3 h-3" style={{ color: NIGHT }} strokeWidth={2.4} />
                </span>
              )}
            </span>
            <span style={{ ...PIXEL, color: isActive ? oracle.color : MIST }} className="truncate text-[15px] min-[400px]:text-[16px] sm:text-[17px] leading-none">
              {oracle.name}
            </span>
            {/* O traço na cor do bicho, embaixo da aba. */}
            <span
              aria-hidden
              className="absolute left-3 right-3 -bottom-[5px] h-[3px] rounded-full transition-opacity"
              style={{ background: oracle.color, opacity: isActive ? 1 : 0 }}
            />
          </button>
        );
      })}
    </div>
  );
};

export default AcervoTabs;
