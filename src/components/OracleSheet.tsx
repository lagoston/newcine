import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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
//
// 04/11/2026 (piscadas no desktop, gaveta do Poster Jackpot): no desktop a
// barra de rolagem OCUPA largura (o index.css dá 10 px a toda barra a partir
// de 768 px; no celular ela é display:none). O "corpo sem rolagem durante a
// transição" trocava overflow-y-auto por overflow-hidden: quando o conteúdo
// rolava, a barra sumia no começo da transição e voltava no fim, e o conteúdo
// inteiro mudava 10 px de largura duas vezes (grade de pôsteres, roleta,
// textos: tudo pulava). Agora, só onde a barra ocupa largura:
//   • durante a transição o corpo fica no estado de barra do FIM dela:
//     overflow-y-scroll se o conteúdo vai rolar na altura nova, hidden se vai
//     caber. A barra muda (no máximo) uma vez, junto com a troca de conteúdo,
//     e não pisca no fim;
//   • a troca de aba (contentKey) mede, marca a transição e volta o corpo ao
//     topo ANTES de pintar (layout effects): o primeiro quadro da aba nova já
//     sai com a altura-alvo, a barra certa e no topo (antes ele saía com a
//     altura e a rolagem da aba velha e corrigia no quadro seguinte).
// Parado, o corpo segue com overflow-y-auto em todos os modais (a gaveta do
// Jackpot liga steadyScrollbar: sem barra parada quando o conteúdo cabe).
// Onde a barra não ocupa largura (celular, barras sobrepostas), o
// comportamento é o mesmo de antes: hidden durante a transição.

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
  // 04/11/2026 (opcional, só a gaveta do Poster Jackpot usa): no desktop,
  // com o conteúdo cabendo, o corpo fica sem barra também parado
  // (overflow-hidden em vez de auto). Assim um conteúdo que cresce sozinho
  // (uma linha que aparece, a mesa do contrato que chega) não mostra a barra
  // por um quadro antes da medida nova. Os outros modais seguem com auto
  // parado (algum pode ter um menu que sai do conteúdo e precisa rolar).
  steadyScrollbar?: boolean;
  children: React.ReactNode;
}

// Margem da gaveta no desktop (a mesma do max-h: 100dvh - 6rem).
const DESKTOP_MARGIN = 48;
// Duração da transição de altura (ms) — a mesma das classes abaixo.
const HEIGHT_MS = 380;

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches;

// Largura que uma barra de rolagem ocupa aqui (0 = barra sobreposta ou
// escondida, como no celular). Medida com uma caixa de teste, que pega os
// mesmos estilos de barra do site; guardada por largura de janela (a regra
// do index.css muda em 768 px).
let barCache: { width: number; bar: number } | null = null;
const scrollbarWidth = () => {
  if (typeof document === 'undefined') return 0;
  if (barCache && barCache.width === window.innerWidth) return barCache.bar;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden';
  document.body.appendChild(probe);
  const bar = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  barCache = { width: window.innerWidth, bar };
  return bar;
};

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
  steadyScrollbar = false,
  children,
}) => {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  // Altura e topo (só no desktop) da gaveta, em px. 04/11/2026: e o estado
  // da barra de rolagem na altura nova — `overflows`: o conteúdo passa do
  // limite e o corpo rola; `bar`: a barra ocupa largura aqui (desktop).
  const [box, setBox] = useState<{ height: number; top: number | null; overflows: boolean; bar: boolean } | null>(null);
  // Transições ligadas só depois da primeira medida (senão a gaveta
  // "desliza" do topo da tela até o centro ao abrir).
  const [settled, setSettled] = useState(false);
  // A altura está mudando agora (corpo sem rolagem, conteúdo em camada).
  const [resizing, setResizing] = useState(false);
  const resizeTimer = useRef<number | null>(null);
  const hasFooter = !!footer;

  // A medida (só lê refs): usada pelo ResizeObserver e, desde 04/11/2026,
  // também na troca de aba, antes de pintar (ver o efeito do contentKey).
  const measure = useCallback(() => {
    const header = headerRef.current;
    const content = contentRef.current;
    const panel = panelRef.current;
    if (!header || !content || !panel) return;
    const natural = header.offsetHeight + content.offsetHeight + (footerRef.current?.offsetHeight ?? 0);
    // O alvo já vem limitado ao max-h da gaveta: sem isso, crescer além
    // do limite "anda" num trecho invisível e parece um pulo.
    const maxPx = parseFloat(getComputedStyle(panel).maxHeight);
    const height = Math.ceil(Number.isFinite(maxPx) ? Math.min(natural, maxPx) : natural);
    const overflows = Number.isFinite(maxPx) && natural > maxPx;
    const bar = scrollbarWidth() > 0;
    setBox((prev) => {
      let top: number | null = null;
      if (isDesktop()) {
        const room = window.innerHeight - DESKTOP_MARGIN - height;
        // Abre centralizada; depois o topo só sobe quando precisa.
        const wanted = prev?.top ?? Math.round((window.innerHeight - height) / 2);
        top = Math.max(DESKTOP_MARGIN, Math.min(wanted, room));
      }
      if (prev && prev.height === height && prev.top === top && prev.overflows === overflows && prev.bar === bar) return prev;
      return { height, top, overflows, bar };
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setBox(null);
      setSettled(false);
      setResizing(false);
      return;
    }
    measure();
    window.addEventListener('resize', measure);
    if (typeof ResizeObserver === 'undefined') return () => window.removeEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    [headerRef.current, contentRef.current, footerRef.current].forEach((el) => el && observer.observe(el));
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, hasFooter, measure]);

  // Liga as transições no quadro seguinte à primeira medida.
  useEffect(() => {
    if (!open || !box || settled) return;
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, [open, box, settled]);

  // Cada mudança de tamanho depois de aberta: marca "mudando" até a
  // transição acabar (transitionend, com um teto de segurança).
  // 04/11/2026: layout effect (era useEffect): o "mudando" entra no mesmo
  // quadro em que a altura começa a andar, e não um quadro depois.
  const lastBox = useRef(box);
  useLayoutEffect(() => {
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
  // 04/11/2026: antes de pintar (layout effect), e medindo a aba nova na
  // hora: o primeiro quadro dela já sai no topo, com a altura-alvo e a barra
  // de rolagem certa. Antes ele saía com a rolagem e a altura da aba velha e
  // corrigia no quadro seguinte (um pulo a cada troca de aba).
  useLayoutEffect(() => {
    if (open) measure();
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [contentKey, open, measure]);

  // A rolagem do corpo. Onde a barra não ocupa largura (celular): como
  // sempre foi, sem rolagem durante a transição. Onde ocupa (desktop,
  // 04/11/2026): durante a transição o corpo já fica no estado de barra da
  // altura nova — com barra se o conteúdo vai rolar (scroll), sem barra se
  // vai caber (hidden) —, para a largura do conteúdo não mudar no meio nem
  // no fim. Parado: auto, como sempre (hidden quando cabe só com
  // steadyScrollbar).
  const bodyOverflow =
    box && box.bar
      ? box.overflows
        ? resizing
          ? 'overflow-y-scroll'
          : 'overflow-y-auto'
        : resizing || steadyScrollbar
          ? 'overflow-hidden'
          : 'overflow-y-auto'
      : resizing
        ? 'overflow-hidden'
        : 'overflow-y-auto';

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
            className="absolute inset-0 bg-black/75"
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
              <div ref={bodyRef} className={`flex-1 min-h-0 overscroll-contain ${bodyOverflow}`}>
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