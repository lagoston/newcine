import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { NIGHT, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

// Casca única dos modais no padrão novo ("a mesa do oráculo"): fundo noite,
// título em Pixelify, fechar no X / no fundo / no Esc, trava a rolagem da
// página por trás. No celular abre como gaveta de baixo pra cima; no
// desktop, centralizado. Usado por Ver Todos, Sussurros, Insights do mês e
// pelos modais da home — qualquer modal novo deve partir daqui.
//
// Altura suave: quando o conteúdo cresce ou encolhe (abas das Tags e do
// Personalizar, filtros dos Sussurros, lista carregando, resenha aberta…),
// a gaveta não "pula" de tamanho — a altura acompanha o conteúdo com uma
// transição. O conteúdo é medido por um ResizeObserver e a altura vira um
// valor em px (limitado pelo max-h de sempre; acima dele o corpo rola).
//
// Para a transição ficar lisa:
//   • no desktop a gaveta abre centralizada, mas depois o TOPO fica parado:
//     ao crescer ela desce a borda de baixo (e só sobe o topo o quanto
//     precisar para caber na tela); ao encolher, só a borda de baixo sobe.
//     Antes, centralizada, as duas bordas andavam e as abas "fugiam" do
//     cursor a cada troca;
//   • durante a transição o corpo não rola (sem a barra de rolagem
//     aparecendo e sumindo no meio, o que mudava a largura do conteúdo e
//     reiniciava a medida); o conteúdo fica numa camada própria e o brilho
//     do fundo tem altura fixa, para o navegador só recortar em vez de
//     repintar tudo a cada quadro;
//   • trocar de aba (contentKey) volta o corpo para o topo, e o conteúdo da
//     aba nova entra com um fade curto (SheetFade).

type SheetSize = 'md' | 'lg' | 'xl' | 'full';

const SIZE_CLASS: Record<SheetSize, string> = {
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-6xl',
};

interface OracleSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  // Elemento à esquerda do título (ex.: a nota de uma prateleira).
  leading?: React.ReactNode;
  footer?: React.ReactNode;
  size?: SheetSize;
  // Desliga o Esc enquanto um modal filho (ex.: detalhes do filme) está aberto.
  escapeEnabled?: boolean;
  bodyClassName?: string;
  // Camada da gaveta. O padrão (9990) fica abaixo dos detalhes do filme
  // (9999); quem abre POR CIMA dos detalhes (resenhas, indicar) passa um
  // valor maior, ex.: 'z-[10000]'.
  zIndexClass?: string;
  // Muda quando o conteúdo troca de "página" (aba, filtro, item aberto):
  // o corpo volta para o topo.
  contentKey?: string | number | null;
  children: React.ReactNode;
}

// Margem da gaveta no desktop (a mesma do max-h: 100dvh - 6rem).
const DESKTOP_MARGIN = 48;
// Duração da transição de altura (ms) — a mesma das classes abaixo.
const HEIGHT_MS = 380;

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;

// Conteúdo de uma aba: entra com um fade curto quando `id` muda.
export const SheetFade: React.FC<{ id: string | number; className?: string; children: React.ReactNode }> = ({ id, className, children }) => (
  <motion.div key={id} className={className} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
    {children}
  </motion.div>
);

const OracleSheet: React.FC<OracleSheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  leading,
  footer,
  size = 'lg',
  escapeEnabled = true,
  bodyClassName = 'px-5 sm:px-7 py-6',
  zIndexClass = 'z-[9990]',
  contentKey = null,
  children,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  // Altura e topo (só no desktop) da gaveta, em px.
  const [box, setBox] = useState<{ height: number; top: number | null } | null>(null);
  // Transições ligadas só depois da primeira medida (senão a gaveta
  // "desliza" do topo da tela até o centro ao abrir).
  const [settled, setSettled] = useState(false);
  // A altura está mudando agora (corpo sem rolagem, conteúdo em camada).
  const [resizing, setResizing] = useState(false);
  const resizeTimer = useRef<number | null>(null);
  const hasFooter = !!footer;

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      setSettled(false);
      setResizing(false);
      return;
    }
    const measure = () => {
      const header = headerRef.current;
      const content = contentRef.current;
      const panel = panelRef.current;
      if (!header || !content || !panel) return;
      const natural = header.offsetHeight + content.offsetHeight + (footerRef.current?.offsetHeight ?? 0);
      // O alvo já vem limitado ao max-h da gaveta: sem isso, crescer além
      // do limite "anda" num trecho invisível e parece um pulo.
      const maxPx = parseFloat(getComputedStyle(panel).maxHeight);
      const height = Math.ceil(Number.isFinite(maxPx) ? Math.min(natural, maxPx) : natural);
      setBox((prev) => {
        let top: number | null = null;
        if (isDesktop()) {
          const room = window.innerHeight - DESKTOP_MARGIN - height;
          // Abre centralizada; depois o topo só sobe quando precisa.
          const wanted = prev?.top ?? Math.round((window.innerHeight - height) / 2);
          top = Math.max(DESKTOP_MARGIN, Math.min(wanted, room));
        }
        if (prev && prev.height === height && prev.top === top) return prev;
        return { height, top };
      });
    };
    measure();
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    [headerRef.current, contentRef.current, footerRef.current].forEach((el) => el && observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, hasFooter]);

  // Liga as transições no quadro seguinte à primeira medida.
  useEffect(() => {
    if (!open || !box || settled) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [open, box, settled]);

  // Cada mudança de tamanho depois de aberta: marca "mudando" até a
  // transição acabar (transitionend, com um teto de segurança).
  const lastBox = useRef(box);
  useEffect(() => {
    const prev = lastBox.current;
    lastBox.current = box;
    if (!settled || !box || !prev || (prev.height === box.height && prev.top === box.top)) return;
    setResizing(true);
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    resizeTimer.current = window.setTimeout(() => setResizing(false), HEIGHT_MS + 120);
  }, [box, settled]);
  useEffect(
    () => () => {
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    },
    []
  );
  const onPanelTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || (e.propertyName !== 'height' && e.propertyName !== 'margin-top')) return;
    if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
    setResizing(false);
  };

  // Troca de aba/filtro: o corpo volta para o topo.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [contentKey]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !escapeEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, escapeEnabled, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 ${zIndexClass}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="absolute inset-0 flex items-end sm:items-start justify-center sm:px-6 pointer-events-none">
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onTransitionEnd={onPanelTransitionEnd}
              className={`pointer-events-auto relative w-full ${SIZE_CLASS[size]} sm:my-auto max-h-[92dvh] sm:max-h-[calc(100dvh-6rem)] flex flex-col rounded-t-2xl sm:rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden ${
                settled ? 'transition-[height,margin-top] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]' : ''
              } motion-reduce:transition-none`}
              style={{
                // Brilho com altura fixa: não estica enquanto a altura muda.
                background: `radial-gradient(ellipse 70% 320px at 85% 0%, rgba(139,92,246,0.14), transparent 70%), ${NIGHT}`,
                height: box?.height,
                // Sem medida ainda, o sm:my-auto centraliza; medida a gaveta,
                // o topo vira px (e a margem de baixo auto só sobra).
                marginTop: box?.top ?? undefined,
              }}
            >
              <div ref={headerRef} className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-7 pt-5 pb-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-3 min-w-0">
                  {leading}
                  <div className="min-w-0">
                    <h2 id={titleId} style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-[1.7rem] leading-tight truncate">
                      {title}
                    </h2>
                    {subtitle && <p className="mt-1 text-sm" style={{ color: MIST }}>{subtitle}</p>}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  aria-label={t('common.close')}
                  className="shrink-0 -mr-2 rounded-full hover:bg-white/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-300"
                  style={{ color: MIST }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* O corpo rola; o conteúdo (com o padding de quem usa) fica
                  num div próprio, que é o que o ResizeObserver mede. */}
              <div ref={bodyRef} className={`flex-1 min-h-0 overscroll-contain ${resizing ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                {/* will-change: o conteúdo fica numa camada própria; ao mudar a
                    altura, o navegador só recorta a camada em vez de repintar
                    o conteúdo inteiro a cada quadro. */}
                <div ref={contentRef} className={bodyClassName} style={{ willChange: 'opacity' }}>
                  {children}
                </div>
              </div>

              {footer && (
                <div ref={footerRef} className="shrink-0 px-5 sm:px-7 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-white/[0.07]">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default OracleSheet;