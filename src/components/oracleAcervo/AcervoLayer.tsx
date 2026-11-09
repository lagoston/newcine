import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PAPER } from '../../lib/oracleTheme';
import '../../styles/acervo.css';
import { LayerStackContext, type LayerEntry, type LayerStackApi } from './layerStack';

// A camada de tela cheia do Acervo (a Mesa dos Oráculos), 09/11/2026. Veio de
// oracleTable/MesaLayer.tsx (05/11), que servia a Mesa e o Acervo; a Mesa de
// três cartas saiu e a camada ficou só com o Acervo.
//
// Por que uma camada e não uma página comum: o Acervo tem mundo próprio (o
// feltro, a luz de cima), como o Clube do Terror, e a navegação do site fica
// POR BAIXO de propósito (z 9980 contra 45 da barra). Vai num portal no <body>
// para nenhum ancestral com transform/isolate prender o z-index.
//
// Também é aqui que a pilha de camadas (layerStack.ts) é montada: o perfil do
// oráculo e a ficha do título → Acervo; o Esc e o voltar do aparelho fecham
// UMA camada por vez. Sem nenhuma aberta, o Esc chama onExit (sair do
// Acervo) e o voltar do aparelho sai da rota normalmente.

// O feltro: elipse violeta de baixo para cima e um cone de luz de cima em
// PAPER a 8% (gradientes parados; nada de backdrop-filter, que custa caro no
// WebView do APK).
const ACERVO_FELT = 'radial-gradient(ellipse 120% 60% at 50% 100%, #241A44, #1C1433 40%, #120D22 78%)';

interface AcervoLayerProps {
  children: React.ReactNode;
  // Esc sem nenhuma camada aberta. Sem onExit, o Esc não faz nada na base.
  onExit?: () => void;
  // Nome da região para leitor de tela ("O Acervo").
  label: string;
}

const AcervoLayer: React.FC<AcervoLayerProps> = ({ children, onExit, label }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const layers = useRef<LayerEntry[]>([]);
  // Com um diálogo aberto por cima, o Acervo fica inert (e volta quando o último fecha).
  const syncInert = useCallback(() => {
    const el = layerRef.current;
    if (!el) return;
    if (layers.current.some((l) => l.modal)) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, []);
  // Quantos popstate vamos ignorar: quando uma camada fecha pela interface
  // (X, Esc, toque fora), chamamos history.back() para tirar a entrada dela
  // do histórico, e o popstate que vem disso não pode fechar outra camada.
  const skipPops = useRef(0);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const push = useCallback(
    (entry: LayerEntry) => {
      layers.current = [...layers.current, entry];
      if (entry.modal) syncInert();
      let pushedHistory = false;
      if (entry.history !== false && typeof window !== 'undefined') {
        // Copia o state do roteador (idx/key/usr) para o React Router não achar
        // que a rota mudou; só acrescenta a marca da camada.
        const prev = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.pushState({ ...prev, acervoLayer: entry.id }, '');
        pushedHistory = true;
      }
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        const wasTop = layers.current[layers.current.length - 1]?.id === entry.id;
        layers.current = layers.current.filter((l) => l.id !== entry.id);
        if (entry.modal) syncInert();
        // Fechou pela interface e a entrada dela ainda está no topo do
        // histórico: volta uma posição, sem deixar o popstate fechar mais nada.
        if (pushedHistory && wasTop && (window.history.state as { acervoLayer?: string } | null)?.acervoLayer === entry.id) {
          skipPops.current += 1;
          window.history.back();
        }
      };
    },
    [syncInert]
  );

  const api = useMemo<LayerStackApi>(
    () => ({
      push,
      depth: () => layers.current.length,
      scrollRef,
    }),
    [push]
  );

  // Trava a rolagem da página por trás (salva e restaura, como o OracleSheet).
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  // O site por baixo fica `inert`: sem isso o Tab e o Shift+Tab ainda chegavam
  // à barra de navegação escondida atrás da camada, e o leitor de tela lia a
  // página de baixo. A camada, as gavetas e o modal do título vão em portal no
  // <body>, fora do #root, então continuam vivos. Os avisos (react-hot-toast e
  // sonner) ficam de fora do inert, para continuarem sendo anunciados.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    const isToaster = (el: Element) =>
      el.matches('.co-hot-toaster, [data-sonner-toaster], section[aria-label^="Notifications"]') ||
      !!el.querySelector('.co-hot-toaster, [data-sonner-toaster]');
    const touched: { el: HTMLElement; had: boolean }[] = [];
    Array.from(root.children).forEach((el) => {
      if (!(el instanceof HTMLElement) || isToaster(el)) return;
      touched.push({ el, had: el.hasAttribute('inert') });
      el.setAttribute('inert', '');
    });
    return () => touched.forEach(({ el, had }) => !had && el.removeAttribute('inert'));
  }, []);

  // Esc: fecha a camada de cima; sem camada, sai. Fase de captura, para
  // decidir antes dos ouvintes das gavetas (que estão na fase de bolha).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const top = layers.current[layers.current.length - 1];
      if (top) {
        if (top.ownEscape) return; // a própria camada fecha no Esc dela
        e.preventDefault();
        top.close();
        return;
      }
      if (onExitRef.current) {
        e.preventDefault();
        onExitRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // O voltar do aparelho (popstate): fecha a camada de cima. A entrada dela
  // já saiu do histórico (foi o próprio voltar que tirou).
  useEffect(() => {
    const onPop = () => {
      if (skipPops.current > 0) {
        skipPops.current -= 1;
        return;
      }
      const top = layers.current[layers.current.length - 1];
      if (!top || top.history === false) return;
      // Tira da pilha antes de fechar, para o removedor não dar outro back().
      layers.current = layers.current.slice(0, -1);
      syncInert();
      top.close();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [syncInert]);

  return createPortal(
    <LayerStackContext.Provider value={api}>
      <div
        ref={layerRef}
        className="ac-layer fixed inset-0 z-[9980] h-[100dvh] w-full overflow-hidden"
        style={{ background: ACERVO_FELT, color: PAPER }}
        role="region"
        aria-label={label}
      >
        {/* Cone de luz de cima (PAPER a 8%), parado: não rola com o conteúdo. */}
        <div aria-hidden className="ac-light pointer-events-none absolute inset-x-0 top-0 h-[70%]" />
        <div aria-hidden className="ac-grain pointer-events-none absolute inset-0" />
        <div ref={scrollRef} className="ac-scroll relative h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </div>
      </div>
    </LayerStackContext.Provider>,
    document.body
  );
};

export default AcervoLayer;
