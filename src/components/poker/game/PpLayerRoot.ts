import { createContext } from 'react';

// O nome da camada da pilha do app (src/overlays) em que a folha do pôquer
// está, entregue pela PpLayer à folha de dentro (Sheet, em table/Overlays.tsx):
// a pilha reconhece o diálogo pelo atributo data-layer. Fora de uma PpLayer (as
// folhas da mesa) fica vazio e nada muda. 20/11/2026 (Protocolo Reborn, fecho).
export const PpLayerRoot = createContext<{ 'data-layer'?: string }>({});
