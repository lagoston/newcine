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
// Altura suave: quando o conteúdo cresce ou encolhe (abas das Tags, lista
// de Sussurros carregando, resenha aberta…), a gaveta não "pula" de
// tamanho — a altura dela acompanha o conteúdo com uma transição curta.
// O conteúdo é medido por um ResizeObserver e a altura vira um valor em px
// (limitado pelo max-h de sempre; acima dele o corpo rola).

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
  children: React.ReactNode;
}

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
  children,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const hasFooter = !!footer;

  useLayoutEffect(() => {
    if (!open) {
      setPanelHeight(null);
      return;
    }
    const measure = () => {
      const header = headerRef.current;
      const content = contentRef.current;
      if (!header || !content) return;
      const natural = header.offsetHeight + content.offsetHeight + (footerRef.current?.offsetHeight ?? 0);
      // O alvo já vem limitado ao max-h da gaveta: sem isso, crescer além
      // do limite "anda" 300ms num trecho invisível e parece um pulo.
      const maxPx = panelRef.current ? parseFloat(getComputedStyle(panelRef.current).maxHeight) : NaN;
      setPanelHeight(Math.ceil(Number.isFinite(maxPx) ? Math.min(natural, maxPx) : natural));
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
          <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className={`pointer-events-auto relative w-full ${SIZE_CLASS[size]} max-h-[92dvh] sm:max-h-[calc(100dvh-6rem)] flex flex-col rounded-t-2xl sm:rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden transition-[height] duration-[350ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none`}
              style={{
                background: `radial-gradient(ellipse 70% 40% at 85% 0%, rgba(139,92,246,0.14), transparent 70%), ${NIGHT}`,
                height: panelHeight ?? undefined,
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
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div ref={contentRef} className={bodyClassName}>
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