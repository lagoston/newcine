import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { librariesTarget } from '../components/oracleAcervo/librariesTarget';

// /oracle/libraries (05/11/2026): a Biblioteca dos Oráculos deixou de existir
// (virou a Mesa dos Oráculos e o Acervo), mas os links antigos continuam por
// aí — no APK empacotado, em favoritos, em sussurros e stories já enviados.
// Este redirecionador traduz a INTENÇÃO de cada link (SPEC §7.1):
//   ?mood=<chave> (com ou sem oracle/type) → a Mesa com esse humor como
//       pergunta (/oracle/mesa?ask=mood:<chave>), + &media=<type> se veio;
//   ?oracle=X&type=Y, sem humor (o "Ver todos" da home) → o Acervo
//       (/oracle/acervo?oracle=X&type=Y);
//   ?oracle=X ou nada → a Mesa (/oracle/mesa).
// O oracle aceita bogart, fincher ou cypher; qualquer outro vira bogart.
// <Navigate replace>: o endereço antigo não fica no histórico.

const OracleLibrariesRedirect: React.FC = () => {
  const location = useLocation();
  return <Navigate to={librariesTarget(location.search)} replace state={location.state} />;
};

export default OracleLibrariesRedirect;
