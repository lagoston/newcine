import React, { useEffect, useRef, useState } from 'react';
import { Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import GlassLoader from '../components/GlassLoader';
import { usePokerHome } from '../lib/poker/client/usePokerHome';
import { POKER_PREVIEW } from '../lib/poker/client/flags';
import { fetchProfileBits } from '../components/poker/jackpot/entryApi';
import Lobby from '../components/poker/lobby/Lobby';
import ComingSoon from '../components/poker/lobby/ComingSoon';
import { BountyTable, FreeTable, TrainingTable } from '../components/poker/table/TableScreen';
import Scoreboard from '../components/poker/scoreboard/Scoreboard';

// O Grande Blefe (03/11/2026): o salão e as mesas, em /blefe/*.
//   /blefe          lobby
//   /blefe/mesa     mesa livre (retoma a do aparelho)
//   /blefe/premio   mesa do prêmio (?start=1&day=…&prize=… começa; sem nada, retoma)
//   /blefe/treino   as 3 mãos de treino
//   /blefe/placar   placar (pacote D2)
// Só abre quando o servidor diz que o poker está liberado para a conta
// (get_poker_home(): enabled e open); senão, "Em breve". 03/11/2026: fechado
// para todos menos os testers.

function useCardStyle(): string {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const [style, setStyle] = useState('default');
  const uid = session?.user?.id ?? null;
  const forced = POKER_PREVIEW ? params.get('style') : null;
  useEffect(() => {
    if (forced || !uid) return;
    let alive = true;
    fetchProfileBits(uid).then(
      (b) => alive && setStyle(b.cardStyle || 'default'),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [uid, forced]);
  return forced ?? style;
}

const BountyRoute: React.FC<{ home: ReturnType<typeof usePokerHome>['home']; cardStyle: string }> = ({ home, cardStyle }) => {
  const [params] = useSearchParams();
  const location = useLocation();
  return (
    <BountyTable
      // Uma mesa nova a cada entrada (ex.: "Tentar de novo" a partir dos créditos).
      key={location.key}
      home={home}
      cardStyle={cardStyle}
      start={params.get('start') === '1'}
      day={params.get('day')}
      prizeId={params.get('prize')}
    />
  );
};

const Blefe: React.FC = () => {
  const { t } = useTranslation();
  const { home, loading, offline, refresh } = usePokerHome();
  const cardStyle = useCardStyle();
  const location = useLocation();
  // Cada tela do salão relê o lobby (tentativas, fichas e o prêmio mudam na mesa).
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    refresh();
  }, [location.pathname, refresh]);

  if (loading && !home) return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  if (!home || !home.enabled || home.open === false) return <ComingSoon />;

  return (
    <Routes>
      <Route index element={<Lobby key={location.key} home={home} cardStyle={cardStyle} offline={offline} />} />
      <Route path="mesa" element={<FreeTable key={location.key} home={home} cardStyle={cardStyle} />} />
      <Route path="premio" element={offline ? <ComingSoon /> : <BountyRoute home={home} cardStyle={cardStyle} />} />
      <Route path="treino" element={<TrainingTable key={location.key} home={home} cardStyle={cardStyle} />} />
      <Route path="placar" element={<Scoreboard />} />
      <Route path="*" element={<Lobby home={home} cardStyle={cardStyle} offline={offline} />} />
    </Routes>
  );
};

export default Blefe;
