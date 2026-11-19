// O anfitrião único de camadas (18/11/2026, Protocolo Reborn, onda 2a).
// Quem usa importa daqui: `import { useLayerEntry } from '../overlays'`.
//   stack.ts            a pilha: z-index, Esc, trava de rolagem, tela coberta
//   history.ts          cada camada é uma entrada do histórico; o voltar fecha a de cima
//   hooks.ts            useLayerEntry, useLayer, useCovered, useOverlays
//   LayerScope.tsx      em volta do conteúdo de cada camada
//   host.ts             overlays.open / close / prefetch
//   registry.ts         a lista das camadas do host (só o App.tsx importa o valor)
//   title.ts            openTitle(): o menu do título como camada
//   OverlayProvider.tsx montado no App.tsx
export { OverlayProvider } from './OverlayProvider';
export { LayerScope } from './LayerScope';
export { useCovered, useLayer, useLayerEntry, useOverlays, zFromClass } from './hooks';
export type { LayerEntryOptions, LayerHandle, LayerInfo } from './hooks';
export { overlays, registerOverlay } from './host';
export type { OverlayApi } from './host';
export { openTitle, updateTitle, useOpenTitle } from './title';
export type { TitleOptions } from './title';
export type { JackpotParams, OverlayKind, OverlaySpec, TitleParams } from './registry';
