import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from 'framer-motion';
import MesaLayer from '../components/oracleTable/MesaLayer';
import MesaScreen from '../components/oracleTable/MesaScreen';
import { getMediaPref, markRitualSeen, ritualSeen } from '../lib/mesa/prefs';
import type { MediaFilter } from '../lib/mesa/types';

// Rota /oracle/mesa (SPEC §7.1), 05/11/2026: A Mesa dos Oráculos. Lê
//   ?ask=occ:<id> | mood:<key> | season:<id>   a pergunta já posta na mesa
//   ?media=movie | tv                           passa por cima da preferência
//                                               do aparelho só nesta visita
// e monta a camada de tela cheia (MesaLayer) com a Mesa por dentro. A entrada
// ritual acontece uma vez por aba e nunca com "reduzir movimento" (a chave é
// gravada do mesmo jeito).

const ASK_RE = /^(occ:[a-z]+|mood:[a-z-]+|season:(halloween|christmas))$/;
const DESKTOP_MQ = '(min-width: 1024px)';

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_MQ).matches);
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

const OracleTable: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const reduced = !!useReducedMotion();
  const desktop = useDesktop();
  const [initial] = useState(() => {
    const a = params.get('ask');
    const m = params.get('media');
    return {
      ask: a && ASK_RE.test(a) ? a : null,
      media: (m === 'movie' || m === 'tv' ? m : getMediaPref()) as MediaFilter,
      ritual: !ritualSeen() && !reduced,
    };
  });
  useEffect(() => {
    // Com "reduzir movimento" a entrada não acontece, e a chave vale igual.
    if (reduced) markRitualSeen();
  }, [reduced]);

  return (
    <MesaLayer label={t('mesa.title')} onExit={() => navigate('/')}>
      <MesaScreen
        // A troca celular ↔ computador remonta a tela (layouts diferentes).
        key={desktop ? 'd' : 'm'}
        initialAsk={initial.ask}
        initialMedia={initial.media}
        desktop={desktop}
        reduced={reduced}
        ritual={initial.ritual}
        onRitualStart={markRitualSeen}
      />
    </MesaLayer>
  );
};

export default OracleTable;
