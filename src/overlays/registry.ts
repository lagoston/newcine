// As camadas que o host abre sozinho, de qualquer lugar do app, com
// `overlays.open(tipo, params)` (18/11/2026, Protocolo Reborn, onda 2a).
//
// Nesta onda a lista está vazia de propósito: a peça existe e está testada, e
// a onda 2b acrescenta aqui o menu do título, a pessoa e o Poster Jackpot
// (claude/otimizacao/modais.md, seção A). Para acrescentar um tipo:
//   1. o formato dos parâmetros em OverlaySpec;
//   2. o carregador em OVERLAYS (import() do componente, que recebe `params`
//      e lê `useLayer()` para saber se está aberto e como fechar).
// Exemplo:
//   export type OverlaySpec = { title: { id: number; mediaType: 'movie' | 'tv' } };
//   export const OVERLAYS = { title: { load: () => import('./layers/TitleLayer') } };
import type { ComponentType } from 'react';

export type OverlaySpec = Record<never, never>;
export type OverlayKind = keyof OverlaySpec;

export interface OverlayDef<P> {
  load: () => Promise<{ default: ComponentType<{ params: P }> }>;
  // piso do z-index (o padrão é o das gavetas, 9990)
  z?: number;
}

export const OVERLAYS: { [K in OverlayKind]: OverlayDef<OverlaySpec[K]> } = {};
