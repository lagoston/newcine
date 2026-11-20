// Como um componente entra na pilha de camadas (18/11/2026, Protocolo Reborn,
// onda 2a). Ver stack.ts (a pilha) e history.ts (o voltar). O <LayerScope>
// (LayerScope.tsx) vai em volta do conteúdo de cada camada.
//
//   useLayerEntry(open, close)  o componente antigo (OracleSheet, a
//                               confirmação, a gaveta da nota, o story, o guia
//                               do estúdio) entra na pilha enquanto `open` for
//                               true, sem mudar quem o usa;
//   useLayer()                  dentro de uma camada: se é a de cima, o z, se
//                               está aberta e como fechar;
//   useCovered()                há uma camada por cima de onde este componente
//                               está? (para pausar animação e vídeo)
//   useOverlays()               open / close / prefetch das camadas do host.
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import * as stack from './stack';
import { claimLayer, overlays, releaseLayer, type Mount, type OverlayApi } from './host';

// A camada do host (aberta com overlays.open) cuja entrada ainda não foi
// assumida por um componente de dentro.
export const SlotContext = createContext<Mount | null>(null);
// O nome da camada mais próxima em volta deste componente (null = a página).
export const ScopeContext = createContext<string | null>(null);

export interface LayerEntryOptions {
  // Piso do z-index: o que a camada pedia antes do host (o padrão das gavetas
  // é 9990). `null` = a camada não vai em portal e fica com o z do próprio CSS.
  z?: number | null;
  // false = agora o Esc e o voltar não fecham esta camada.
  escape?: boolean;
  // true = com a camada aberta o <body> fica com touch-action: none (só o
  // menu do título pede; ver stack.ts).
  touchNone?: boolean;
}

export interface LayerHandle {
  // nome da camada na pilha (null = fechada)
  mark: string | null;
  // para espalhar na raiz do diálogo (o elemento com aria-modal)
  rootProps: { 'data-layer'?: string };
  // o z-index pela pilha, para o style da raiz (undefined = o do CSS)
  style: { zIndex: number } | undefined;
  // o nome para o <LayerScope> (continua valendo na animação de saída)
  scope: string | null;
}

const NO_PROPS = {};
let seq = 0;
const newMark = () => `l${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// "z-[10010]" → 10010 (as gavetas ainda recebem o z-index como classe).
export const zFromClass = (zIndexClass: string | undefined): number => {
  const match = zIndexClass ? /z-\[(\d+)\]/.exec(zIndexClass) ?? /(?:^|\s)z-(\d+)/.exec(zIndexClass) : null;
  return match ? Number(match[1]) : stack.DEFAULT_Z;
};

// O componente entra na pilha enquanto `open` for true. `close` é chamado no
// Esc e no voltar (pode mudar a cada render). Dentro de uma camada aberta com
// overlays.open(), o primeiro componente que chamar isto assume a entrada
// dela em vez de criar outra.
export function useLayerEntry(open: boolean, close: () => void, options: LayerEntryOptions = {}): LayerHandle {
  const slot = useContext(SlotContext);
  const closeRef = useRef(close);
  closeRef.current = close;
  const escapeRef = useRef(true);
  escapeRef.current = options.escape !== false;
  const touchNone = options.touchNone === true;
  const floor = options.z === undefined ? stack.DEFAULT_Z : options.z;
  const floorRef = useRef(floor);
  floorRef.current = floor;
  const own = useRef('');
  if (!own.current) own.current = newMark();
  const [entry, setEntry] = useState<{ mark: string; z: number } | null>(null);
  const slotMark = slot?.open ? slot.mark : null;
  const slotZ = slot?.z ?? 0;

  // Layout effect: a camada já nasce na tela com o z e o nome certos, e a
  // entrada do histórico é gravada dentro do toque de quem abriu.
  useLayoutEffect(() => {
    if (!open) return;
    const by = own.current;
    const handlers = {
      // flushSync: quando o pedido volta, a pilha já sabe se a camada fechou
      // (dois voltar seguidos e rápidos fecham duas camadas, não a mesma duas vezes)
      dismiss: () => flushSync(() => closeRef.current()),
      canEscape: () => escapeRef.current,
      touchNone: () => touchNone,
    };
    if (slotMark && claimLayer(slotMark, { by, ...handlers })) {
      setEntry({ mark: slotMark, z: slotZ });
      return () => {
        releaseLayer(slotMark, by);
        setEntry(null);
      };
    }
    const z = stack.enter({ mark: by, ...handlers }, floorRef.current);
    setEntry({ mark: by, z });
    return () => {
      stack.leave(by);
      setEntry(null);
    };
  }, [open, slotMark, slotZ, touchNone]);

  // Na animação de saída a raiz continua com o z e o nome que tinha.
  const last = useRef<{ mark: string; z: number } | null>(null);
  if (entry) last.current = entry;
  const z = floor === null ? undefined : (entry ?? last.current)?.z;
  const scope = (entry ?? last.current)?.mark ?? null;
  return useMemo<LayerHandle>(
    () => ({
      mark: entry?.mark ?? null,
      rootProps: entry ? { 'data-layer': entry.mark } : NO_PROPS,
      style: z === undefined ? undefined : { zIndex: z },
      scope,
    }),
    [entry, z, scope],
  );
}

export interface LayerInfo {
  mark: string;
  // é a camada de cima da pilha
  isTop: boolean;
  // false = fechando (a animação de saída)
  open: boolean;
  z: number | undefined;
  close: () => void;
}

// Dentro de uma camada (o conteúdo de uma gaveta, o componente aberto com
// overlays.open): o estado dela e como fechar.
export function useLayer(): LayerInfo {
  const slot = useContext(SlotContext);
  const scope = useContext(ScopeContext);
  const mark = slot?.mark ?? scope ?? '';
  const isTop = useSyncExternalStore(stack.subscribe, () => stack.isTop(mark));
  const inStack = useSyncExternalStore(stack.subscribe, () => stack.has(mark));
  const hosted = slot?.mark ?? null;
  const close = useCallback(() => (hosted ? overlays.close(hosted) : stack.dismiss(mark)), [hosted, mark]);
  if (!mark) throw new Error('useLayer fora de uma camada');
  return { mark, isTop, open: slot ? slot.open : inStack, z: slot?.z ?? stack.zOf(mark), close };
}

// Há uma camada por cima de onde este componente está? Na página: qualquer
// camada aberta. Dentro de uma camada: outra por cima dela. É o sinal para
// pausar o que anima por JavaScript (o estúdio, os trailers) — auditoria F5.
export function useCovered(): boolean {
  const scope = useContext(ScopeContext);
  return useSyncExternalStore(stack.subscribe, () => (scope ? stack.has(scope) && !stack.isTop(scope) : stack.depth() > 0));
}

// Abrir e fechar as camadas do host (lista em registry.ts).
export function useOverlays(): OverlayApi {
  return overlays;
}

// Para uma PÁGINA em tela cheia (o Acervo): trava a rolagem do site por trás
// enquanto está montada, sem virar camada (o Esc e o voltar dela são sair da
// página). `root`: trava também o <html>. 20/11/2026: é a única outra porta
// para a trava além de useLayerEntry — ninguém escreve body.style.overflow.
export function useScrollLock(active = true, options: { root?: boolean } = {}): void {
  const id = useRef('');
  if (!id.current) id.current = newMark();
  const root = options.root === true;
  useLayoutEffect(() => {
    if (!active) return;
    const holder = id.current;
    stack.hold(holder, root);
    return () => stack.unhold(holder);
  }, [active, root]);
}
