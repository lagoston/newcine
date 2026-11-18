// O anfitrião único de camadas (18/11/2026, Protocolo Reborn, onda 2a).
// Quem usa importa daqui: `import { useLayerEntry } from '../overlays'`.
//   stack.ts            a pilha: z-index, Esc, trava de rolagem, tela coberta
//   history.ts          cada camada é uma entrada do histórico; o voltar fecha a de cima
//   hooks.ts            useLayerEntry, useLayer, useCovered, useOverlays
//   LayerScope.tsx      em volta do conteúdo de cada camada
//   host.ts             overlays.open / close / prefetch
//   registry.ts         a lista das camadas do host (vazia até a onda 2b)
//   OverlayProvider.tsx montado no App.tsx
export { OverlayProvider } from './OverlayProvider';
export { LayerScope } from './LayerScope';
export { useCovered, useLayer, useLayerEntry, useOverlays, zFromClass } from './hooks';
export type { LayerEntryOptions, LayerHandle, LayerInfo } from './hooks';
export { overlays, registerOverlay } from './host';
export type { OverlayApi } from './host';
export type { OverlayKind, OverlaySpec } from './registry';
