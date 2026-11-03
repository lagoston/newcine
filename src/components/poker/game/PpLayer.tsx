import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

// A camada das folhas do Pôster Poker fora da mesa (03/11/2026, fase 3, pedido do
// Bruno): a folha passa por cima da barra de vidro do celular (MobileDock, z-45),
// como os outros pop-ups do site. O palco (`.pp-stage-inner`, z-index 1) é um
// contexto de empilhamento: uma camada fixa dentro dele nunca passava da barra,
// por maior que fosse o z-index. Por isso vai para o body, na camada do
// OracleSheet (9990), com a rolagem da página presa enquanto está aberta.
// `.pp-layer` leva o vinho do palco para a folha (posterPoker.css).
const PpLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return createPortal(<div className="pp-layer fixed inset-0 z-[9990]">{children}</div>, document.body);
};

export default PpLayer;
