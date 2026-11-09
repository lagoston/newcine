import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { acervoTarget } from '../components/oracleAcervo/acervoTarget';

// /oracle/mesa e /oracle/libraries (09/11/2026): o Acervo é a página única da
// Mesa dos Oráculos. As duas rotas antigas continuam vivas porque há links
// para elas por aí — no APK empacotado, em favoritos, em sussurros e stories
// já enviados — e cada uma abre o Acervo com a mesma intenção:
//   /oracle/mesa?ask=occ:galera        → /oracle/acervo?ocasiao=galera
//   /oracle/mesa?ask=mood:catharsis    → /oracle/acervo?mood=catharsis
//   /oracle/mesa?...&media=tv          → ...&type=tv
//   /oracle/libraries?oracle=X&type=Y  → /oracle/acervo?oracle=X&type=Y
//   /oracle/libraries?mood=Z           → /oracle/acervo?mood=Z
//   nada                               → /oracle/acervo
// <Navigate replace>: o endereço antigo não fica no histórico.

const OracleAcervoRedirect: React.FC = () => {
  const location = useLocation();
  return <Navigate to={acervoTarget(location.search)} replace state={location.state} />;
};

export default OracleAcervoRedirect;
