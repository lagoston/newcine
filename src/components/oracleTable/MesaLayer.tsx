import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PAPER } from '../../lib/oracleTheme';
import '../../styles/mesa.css';

// A camada de tela cheia da Mesa dos Oráculos e do Acervo (SPEC §2.0 e §7.4),
// 05/11/2026. Por que uma camada e não uma página comum: a Mesa tem mundo
// próprio (o feltro, a luz de cima), como o Clube do Terror, e a navegação do
// site fica POR BAIXO de propósito (z 9980 contra 45 da barra). Vai num portal
// no <body> para nenhum ancestral com transform/isolate prender o z-index.
//
// Também é aqui que mora a pilha de camadas (régua → gaveta → Mesa): o Esc e o
// voltar do aparelho fecham UMA camada por vez. Cada camada aberta (gaveta,
// régua, modal de detalhes) se registra com useMesaLayerEntry; a de cima é a
// que fecha. Sem nenhuma aberta, o Esc chama onExit (sair da Mesa) e o voltar
// do aparelho sai da rota normalmente.

export interface LayerEntry {
  id: string;
  // Fecha a camada. Chamado pelo Esc (se a camada não cuida do próprio Esc) e
  // pelo voltar do aparelho.
  close: () => void;
  // A camada já escuta o Esc sozinha (OracleSheet com escapeEnabled, o
  // MovieDetailsModal): a pilha não fecha nada no Esc enquanto ela é a de
  // cima, só impede que a Mesa saia junto.
  ownEscape?: boolean;
  // Grava uma entrada no histórico (history.pushState) para o voltar do
  // Android fechar esta camada em vez de sair da Mesa. Padrão: true.
  history?: boolean;
  // A camada é um diálogo por cima da Mesa (gaveta, ficha do título, revelação):
  // enquanto ela está aberta, a Mesa inteira fica `inert` (QA M7, 05/11/2026),
  // para o Tab e o leitor de tela não andarem pela mesa por trás.
  modal?: boolean;
}

interface LayerStackApi {
  push: (entry: LayerEntry) => () => void;
  depth: () => number;
  top: () => LayerEntry | null;
  // O contêiner que rola (o corpo da camada), para rolar a leitura até a vista.
  scrollRef: React.RefObject<HTMLDivElement>;
}

const LayerStackContext = createContext<LayerStackApi | null>(null);

// A pilha de camadas da Mesa. Fora de uma MesaLayer devolve uma pilha vazia
// que não faz nada (componentes reaproveitados não quebram).
const NOOP_STACK: LayerStackApi = {
  push: () => () => undefined,
  depth: () => 0,
  top: () => null,
  scrollRef: { current: null },
};
export function useLayerStack(): LayerStackApi {
  return useContext(LayerStackContext) ?? NOOP_STACK;
}

// Registra uma camada enquanto `open` for true. `close` pode mudar a cada
// render sem reabrir a entrada (fica num ref).
export function useMesaLayerEntry(open: boolean, close: () => void, opts: { ownEscape?: boolean; history?: boolean; modal?: boolean } = {}): void {
  const stack = useLayerStack();
  const closeRef = useRef(close);
  closeRef.current = close;
  const { ownEscape = false, history = true, modal = false } = opts;
  useEffect(() => {
    if (!open) return;
    const id = `layer-${Math.random().toString(36).slice(2, 9)}`;
    return stack.push({ id, close: () => closeRef.current(), ownEscape, history, modal });
  }, [open, ownEscape, history, modal, stack]);
}

// O foco de um diálogo aberto por cima da Mesa (QA M7, 05/11/2026): ao abrir, o
// foco entra no diálogo (no título, com tabIndex -1, para o leitor de tela ler
// o nome dele; o Tab segue para o X e o conteúdo); ao fechar, volta para quem
// abriu. Funciona com o OracleSheet como ele é (o arquivo é compartilhado com
// o site inteiro e não muda): acha o diálogo mais novo no <body>.
export function useDialogFocus(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
        const dlg = dialogs[dialogs.length - 1];
        if (!dlg || dlg.contains(document.activeElement)) return;
        const title = dlg.querySelector<HTMLElement>('h2');
        if (title) {
          title.tabIndex = -1;
          title.style.outline = 'none';
          title.focus({ preventScroll: true });
        } else dlg.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      const back = opener.current;
      opener.current = null;
      // Depois de a Mesa sair do inert (o removedor da camada roda no mesmo commit).
      if (back) window.setTimeout(() => back.isConnected && back.focus({ preventScroll: true }), 0);
    };
  }, [open]);
}

// O feltro da mesa (SPEC §2.0): elipse violeta de baixo para cima e um cone
// de luz de cima em PAPER a 8% (um div com gradiente; nada de backdrop-filter,
// que custa caro no WebView do APK).
export const MESA_FELT = 'radial-gradient(ellipse 120% 60% at 50% 100%, #241A44, #1C1433 40%, #120D22 78%)';

interface MesaLayerProps {
  children: React.ReactNode;
  // Esc sem nenhuma camada aberta. Sem onExit, o Esc não faz nada na base.
  onExit?: () => void;
  // Nome da região para leitor de tela ("A Mesa dos Oráculos", "O Acervo").
  label: string;
  // Classe extra no contêiner que rola (padding, etc.).
  bodyClassName?: string;
  // Conteúdo fixo por cima da rolagem (entrada, faixa do dia novo): fica fora
  // do contêiner que rola, mas dentro da camada.
  overlay?: React.ReactNode;
}

const MesaLayer: React.FC<MesaLayerProps> = ({ children, onExit, label, bodyClassName = '', overlay }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const layers = useRef<LayerEntry[]>([]);
  // Com um diálogo aberto por cima, a Mesa fica inert (e volta quando o último fecha).
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

  const push = useCallback((entry: LayerEntry) => {
    layers.current = [...layers.current, entry];
    if (entry.modal) syncInert();
    let pushedHistory = false;
    if (entry.history !== false && typeof window !== 'undefined') {
      // Copia o state do roteador (idx/key/usr) para o React Router não achar
      // que a rota mudou; só acrescenta a marca da camada.
      const prev = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.pushState({ ...prev, mesaLayer: entry.id }, '');
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
      if (pushedHistory && wasTop && (window.history.state as { mesaLayer?: string } | null)?.mesaLayer === entry.id) {
        skipPops.current += 1;
        window.history.back();
      }
    };
  }, [syncInert]);

  const api = useMemo<LayerStackApi>(
    () => ({
      push,
      depth: () => layers.current.length,
      top: () => layers.current[layers.current.length - 1] ?? null,
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

  // O site por baixo fica `inert` (pedido do WP-ACERVO, 05/11/2026): sem isso o
  // Tab e o Shift+Tab ainda chegavam à barra de navegação escondida atrás da
  // camada, e o leitor de tela lia a página de baixo. A Mesa, as gavetas e o
  // modal do título vão em portal no <body>, fora do #root, então continuam
  // vivos. Os avisos (react-hot-toast e sonner) ficam de fora do inert, para
  // continuarem sendo anunciados.
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
        className="ms-layer fixed inset-0 z-[9980] h-[100dvh] w-full overflow-hidden"
        style={{ background: MESA_FELT, color: PAPER }}
        role="region"
        aria-label={label}
      >
        {/* Cone de luz de cima (PAPER a 8%), parado: não rola com o conteúdo. */}
        <div aria-hidden className="ms-light pointer-events-none absolute inset-x-0 top-0 h-[70%]" />
        <div aria-hidden className="ms-grain pointer-events-none absolute inset-0" />
        <div ref={scrollRef} className={`ms-scroll relative h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain ${bodyClassName}`}>
          {children}
        </div>
        {overlay}
      </div>
    </LayerStackContext.Provider>,
    document.body
  );
};

export default MesaLayer;
