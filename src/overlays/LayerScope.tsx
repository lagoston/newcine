import React, { useContext } from 'react';
import { ScopeContext, SlotContext, type LayerHandle } from './hooks';

// Em volta do conteúdo de uma camada: quem está dentro sabe de qual camada é
// (useLayer, useCovered) e as gavetas de dentro entram na pilha por conta própria.
export const LayerScope: React.FC<{ layer: LayerHandle; children: React.ReactNode }> = ({ layer, children }) => {
  const outer = useContext(ScopeContext);
  return (
    <SlotContext.Provider value={null}>
      <ScopeContext.Provider value={layer.scope ?? outer}>{children}</ScopeContext.Provider>
    </SlotContext.Provider>
  );
};
