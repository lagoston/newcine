import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';

// A pilha de camadas do Acervo (09/11/2026; separada de AcervoLayer.tsx para o
// arquivo do componente só exportar componente). O perfil do oráculo e a ficha
// do título se registram aqui com useLayerEntry; o Esc e o voltar do aparelho
// fecham a de cima, uma por vez. A AcervoLayer é quem fornece a pilha.

export interface LayerEntry {
  id: string;
  // Fecha a camada. Chamado pelo Esc (se a camada não cuida do próprio Esc) e
  // pelo voltar do aparelho.
  close: () => void;
  // A camada já escuta o Esc sozinha (OracleSheet, MovieDetailsModal): a pilha
  // não fecha nada no Esc enquanto ela é a de cima, só impede que o Acervo
  // saia junto.
  ownEscape?: boolean;
  // Grava uma entrada no histórico (history.pushState) para o voltar do
  // Android fechar esta camada em vez de sair do Acervo. Padrão: true.
  history?: boolean;
  // A camada é um diálogo por cima do Acervo: enquanto ela está aberta, o
  // Acervo inteiro fica `inert`, para o Tab e o leitor de tela não andarem
  // pela grade por trás.
  modal?: boolean;
}

export interface LayerStackApi {
  push: (entry: LayerEntry) => () => void;
  depth: () => number;
  // O contêiner que rola (o corpo da camada): a grade vigia o fim dele.
  scrollRef: RefObject<HTMLDivElement>;
}

export const LayerStackContext = createContext<LayerStackApi | null>(null);

// Fora de uma AcervoLayer devolve uma pilha vazia que não faz nada
// (componentes reaproveitados não quebram).
const NOOP_STACK: LayerStackApi = {
  push: () => () => undefined,
  depth: () => 0,
  scrollRef: { current: null },
};
export function useLayerStack(): LayerStackApi {
  return useContext(LayerStackContext) ?? NOOP_STACK;
}

// Registra uma camada enquanto `open` for true. `close` pode mudar a cada
// render sem reabrir a entrada (fica num ref).
export function useLayerEntry(open: boolean, close: () => void, opts: { ownEscape?: boolean; history?: boolean; modal?: boolean } = {}): void {
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
