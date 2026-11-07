import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Check, HelpCircle, Library, MoreHorizontal, Shuffle, Volume2, VolumeX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MIST, NIGHT, PAPER, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import type { MediaFilter } from '../../lib/mesa/types';
import { useMesaLayerEntry } from './MesaLayer';
import { MoonArc } from './MesaArt';

// A barra do topo (SPEC §2.2), 05/11/2026: "←" (sair), a pílula da pergunta da
// vez no centro, o Livro (ícone discreto) e o menu ⋯ (mídia, som, virar as
// três, Acervo, como funciona). Só o essencial no topo: Livro e Acervo são
// secundários. A barra é fixa no alto da rolagem e cobre o que passa por baixo
// com a própria noite (sem backdrop-filter).

interface TopBarProps {
  desktop: boolean;
  askLabel: string | null;
  onBack: () => void;
  onClearAsk: () => void;
  onBook: () => void;
  media: MediaFilter;
  onMedia: (m: MediaFilter) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
  showFlipAll: boolean;
  onFlipAll: () => void;
  onAcervo: () => void;
  onHow: () => void;
  // Por baixo da barra, presa a ela (a faixa do dia novo).
  children?: React.ReactNode;
}

const MenuItem: React.FC<{ onClick: () => void; icon?: React.ReactNode; checked?: boolean; children: React.ReactNode; role?: string }> = ({ onClick, icon, checked, children, role = 'menuitem' }) => (
  <button
    type="button"
    role={role}
    aria-checked={role === 'menuitemradio' ? !!checked : undefined}
    onClick={onClick}
    className={`w-full min-h-[44px] px-3 flex items-center gap-3 text-left text-[14px] rounded-lg hover:bg-white/[0.06] ${FOCUS_RING}`}
    style={{ color: PAPER }}
  >
    <span className="w-4 shrink-0 grid place-items-center" style={{ color: MIST }} aria-hidden>
      {icon ?? (checked ? <Check className="w-4 h-4" style={{ color: '#B9A6FF' }} /> : null)}
    </span>
    <span className="flex-1">{children}</span>
  </button>
);

const MesaTopBar: React.FC<TopBarProps> = (p) => {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = () => {
    setMenu(false);
    menuBtn.current?.focus();
  };
  useMesaLayerEntry(menu, close, { history: false });

  // Fecha no toque fora.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node) || menuBtn.current?.contains(e.target as Node)) return;
      setMenu(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [menu]);
  // Foco no primeiro item ao abrir.
  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [menu]);

  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  const iconBtn = `grid place-items-center w-11 h-11 rounded-full hover:bg-white/[0.07] ${FOCUS_RING}`;

  return (
    <header
      className="sticky top-0 z-30 pt-[env(safe-area-inset-top)]"
      // Sólido (QA M6): nada do que rola aparece atrás da barra; um degradê de
      // 12 px logo abaixo dela faz a transição para o feltro.
      style={{ background: NIGHT }}
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-full h-3" style={{ background: `linear-gradient(180deg, ${NIGHT}, rgba(18,13,34,0))` }} />
      <div className={`relative mx-auto max-w-[1200px] flex items-center gap-2 ${p.desktop ? 'h-14 px-6' : 'h-[52px] px-2'}`}>
        <button type="button" onClick={p.onBack} aria-label={t('mesa.top.backAria')} className={`${p.desktop ? 'h-11 px-3 rounded-full flex items-center gap-2 hover:bg-white/[0.07]' : iconBtn} ${FOCUS_RING}`} style={{ color: PAPER }}>
          <ArrowLeft className="w-5 h-5" aria-hidden />
          {p.desktop && <span className="text-[14px]">{t('mesa.top.back')}</span>}
        </button>

        <div className="flex-1 min-w-0 flex justify-center">
          {p.askLabel ? (
            <button
              type="button"
              onClick={p.onClearAsk}
              aria-label={t('mesa.top.onTableAria', { name: p.askLabel })}
              className={`max-w-full h-9 pl-3 pr-2 rounded-full flex items-center gap-2 ${FOCUS_RING}`}
              style={{ background: '#2A2050', boxShadow: 'inset 0 0 0 1px rgba(185,166,255,0.55)', color: PAPER }}
            >
              <span className="truncate text-[13px]">{t('mesa.top.onTable', { name: p.askLabel })}</span>
              <X className="w-4 h-4 shrink-0" style={{ color: '#B9A6FF' }} aria-hidden />
            </button>
          ) : (
            <span className="h-9 px-3.5 rounded-full flex items-center gap-2 min-w-0" style={{ background: NIGHT, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.14)', color: PAPER }}>
              <MoonArc width={20} />
              <span className="truncate text-[13px]" style={PIXEL}>
                {t('mesa.top.today')}
              </span>
            </span>
          )}
        </div>

        <button type="button" onClick={p.onBook} aria-label={t('mesa.top.book')} className={`${p.desktop ? 'h-11 px-3 rounded-full flex items-center gap-2 hover:bg-white/[0.07]' : iconBtn} ${FOCUS_RING}`} style={{ color: MIST }}>
          <BookOpen className="w-5 h-5" aria-hidden />
          {p.desktop && <span className="text-[14px]">{t('mesa.top.book')}</span>}
        </button>
        <div className="relative">
          <button
            ref={menuBtn}
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-label={t('mesa.top.more')}
            aria-haspopup="menu"
            aria-expanded={menu}
            className={iconBtn}
            style={{ color: MIST }}
          >
            <MoreHorizontal className="w-5 h-5" aria-hidden />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                ref={menuRef}
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-[calc(100%+6px)] w-[248px] p-1.5 rounded-xl z-40"
                style={{ background: '#1A1330', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.12), 0 24px 48px -16px rgba(0,0,0,0.95)' }}
              >
                <p className="px-3 pt-1.5 pb-1 text-[12px]" style={{ ...PIXEL, color: MIST }}>
                  {t('mesa.menu.media')}
                </p>
                {(['all', 'movie', 'tv'] as MediaFilter[]).map((m) => (
                  <MenuItem key={m} role="menuitemradio" checked={p.media === m} onClick={act(() => p.onMedia(m))}>
                    {t(m === 'all' ? 'mesa.menu.mediaAll' : m === 'movie' ? 'mesa.menu.mediaMovie' : 'mesa.menu.mediaTv')}
                  </MenuItem>
                ))}
                <div className="my-1 h-px" style={{ background: 'rgba(243,234,211,0.08)' }} />
                <MenuItem icon={p.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} onClick={act(() => p.onSound(!p.sound))}>
                  {p.sound ? t('mesa.menu.soundOn') : t('mesa.menu.soundOff')}
                </MenuItem>
                {p.showFlipAll && (
                  <MenuItem icon={<Shuffle className="w-4 h-4" />} onClick={act(p.onFlipAll)}>
                    {t('mesa.menu.flipAll')}
                  </MenuItem>
                )}
                <MenuItem icon={<Library className="w-4 h-4" />} onClick={act(p.onAcervo)}>
                  {t('mesa.menu.acervo')}
                </MenuItem>
                <MenuItem icon={<HelpCircle className="w-4 h-4" />} onClick={act(p.onHow)}>
                  {t('mesa.menu.how')}
                </MenuItem>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="absolute inset-x-0 top-full">{p.children}</div>
    </header>
  );
};

export default MesaTopBar;
