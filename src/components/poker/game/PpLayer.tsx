import React from 'react';
import { createPortal } from 'react-dom';
import { LayerScope, useLayerEntry } from '../../../overlays';
import { PpLayerRoot } from './PpLayerRoot';

// A camada das folhas do Pôster Poker fora da mesa (03/11/2026, fase 3, pedido do
// Bruno): a folha passa por cima da barra de vidro do celular (MobileDock, z-45),
// como os outros pop-ups do site. O palco (`.pp-stage-inner`, z-index 1) é um
// contexto de empilhamento: uma camada fixa dentro dele nunca passava da barra,
// por maior que fosse o z-index. Por isso vai para o body, na camada do
// OracleSheet (9990), com a rolagem da página presa enquanto está aberta.
// `.pp-layer` leva o vinho do palco para a folha (posterPoker.css).
//
// 20/11/2026 (Protocolo Reborn, fecho): a folha entra na pilha de camadas do app
// (src/overlays). A trava de rolagem própria saiu (a pilha trava enquanto a
// folha está aberta) e o Esc e o voltar fecham só a camada de cima: por isso
// quem usa passa o mesmo `onClose` da folha. O 9990 virou o piso do z-index.
// A folha de dentro (Sheet, em table/Overlays.tsx) recebe por contexto o nome
// da camada (PpLayerRoot), para a pilha reconhecer o diálogo dela.

const PpLayer: React.FC<{ children: React.ReactNode; onClose?: () => void }> = ({ children, onClose }) => {
  const layer = useLayerEntry(true, () => onClose?.(), { z: 9990, escape: !!onClose });
  return createPortal(
    <LayerScope layer={layer}>
      <PpLayerRoot.Provider value={layer.rootProps}>
        <div className="pp-layer fixed inset-0 z-[9990]" style={layer.style}>
          {children}
        </div>
      </PpLayerRoot.Provider>
    </LayerScope>,
    document.body,
  );
};

export default PpLayer;
