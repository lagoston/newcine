import React, { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import GlassLoader from '../components/GlassLoader';
import { usePokerHome } from '../lib/poker/client/usePokerHome';
import { POKER_PREVIEW } from '../lib/poker/client/flags';
import { weekPrizeOf, type TournamentStake } from '../lib/poker/client/tournament';
import { fetchProfileBits } from '../components/poker/jackpot/entryApi';
import { PP_BASE } from '../components/poker/jackpot/pokerMeta';
import ComingSoon from '../components/poker/lobby/ComingSoon';
import { BountyTable, FreeTable, TrainingTable } from '../components/poker/table/TableScreen';
import Scoreboard from '../components/poker/scoreboard/Scoreboard';
import PosterPokerIntro from '../components/poker/game/PosterPokerIntro';
import TitleScreen from '../components/poker/game/TitleScreen';
import TournamentScreen from '../components/poker/game/TournamentScreen';
import CollectionScreen from '../components/poker/game/CollectionScreen';

// Pôster Poker (03/11/2026, tarde; antes "O Grande Blefe"): um jogo à parte, em
// /poster-poker/*. Abre com a abertura que preenche a tela (uma vez por visita) e a
// tela título; daí os dois modos.
//   /poster-poker                  tela título (Jogar → Torneio · Casual, Coleção, Placar…)
//   /poster-poker/torneio          o torneio da semana e a escolha da entrada
//   /poster-poker/torneio/mesa     a mesa do torneio (?start=1&week=…&prize=…&stake=… começa; sem nada, retoma)
//   /poster-poker/casual           a mesa casual (retoma a do aparelho)
//   /poster-poker/colecao          os 9 pôsteres e a vitrine da Cobra
//   /poster-poker/placar           placar
//   /poster-poker/treino           as 3 mãos de treino (Como jogar)
// O /blefe/* antigo redireciona. Só abre quando o servidor diz que o pôquer está
// liberado para a conta (get_poker_home(): enabled e open); senão, "Em breve".

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

// O /blefe antigo: cada tela vai para a nova (com a busca junto, para o resume).
const OLD: Record<string, string> = { '': '', mesa: '/casual', premio: '/torneio/mesa', placar: '/placar', treino: '/treino' };
function oldToNew(pathname: string, search: string): string | null {
  const m = /^\/blefe\/?([^/]*)/.exec(pathname);
  if (!m) return null;
  return `${PP_BASE}${OLD[m[1]] ?? ''}${m[1] === 'premio' ? '' : search}`;
}

function stakeFrom(params: URLSearchParams): TournamentStake | null {
  if (params.get('stake') === 'poster') {
    const itemId = Number(params.get('item'));
    const effect = (params.get('effect') || 'none') as Extract<TournamentStake, { kind: 'poster' }>['effect'];
    return Number.isFinite(itemId) && itemId > 0 ? { kind: 'poster', itemId, effect } : null;
  }
  return { kind: 'chips' };
}

const TourneyRoute: React.FC<{ home: ReturnType<typeof usePokerHome>['home']; cardStyle: string }> = ({ home, cardStyle }) => {
  const [params] = useSearchParams();
  const location = useLocation();
  // 03/11/2026 (revisão de segurança): só começa uma partida paga quem veio do botão da
  // tela do torneio, que põe `ppStart` no state da navegação. Um link de fora com
  // ?start=1 não consegue pôr state: vira uma retomada (não cobra nada). E uma aposta de
  // pôster torta não cai mais em "pagar com fichas": não começa.
  const fromButton = (location.state as { ppStart?: boolean } | null)?.ppStart === true;
  const stake = stakeFrom(params);
  const start = params.get('start') === '1' && fromButton && stake !== null;
  return (
    <BountyTable
      // Uma mesa nova a cada entrada (ex.: "Tentar de novo" a partir dos créditos).
      key={location.key}
      home={home}
      cardStyle={cardStyle}
      start={start}
      week={params.get('week')}
      prizeId={params.get('prize')}
      stake={start ? stake : null}
    />
  );
};

const PosterPoker: React.FC = () => {
  const { t } = useTranslation();
  const { home, loading, offline, refresh } = usePokerHome();
  const cardStyle = useCardStyle();
  const location = useLocation();
  // Cada tela relê o lobby (tentativas, fichas e o torneio mudam na mesa).
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    refresh();
  }, [location.pathname, refresh]);

  const redirect = oldToNew(location.pathname, location.search);
  if (redirect) return <Navigate to={redirect} replace />;

  // A abertura só fora das mesas (na mesa já há o "Estrelando…").
  const atTable = /\/(casual|treino|torneio\/mesa)\/?$/.test(location.pathname);
  const intro = !atTable && <PosterPokerIntro filePath={weekPrizeOf(home).file_path} ready={!loading} />;

  if (loading && !home)
    return (
      <>
        {intro}
        <GlassLoader fullPage size="lg" label={t('common.loading')} />
      </>
    );
  if (!home || !home.enabled || home.open === false) return <ComingSoon />;

  return (
    <>
      {intro}
      <Routes>
        <Route index element={<TitleScreen home={home} offline={offline} />} />
        <Route path="torneio" element={offline ? <ComingSoon /> : <TournamentScreen key={location.key} home={home} />} />
        <Route path="torneio/mesa" element={offline ? <ComingSoon /> : <TourneyRoute home={home} cardStyle={cardStyle} />} />
        <Route path="casual" element={<FreeTable key={location.key} home={home} cardStyle={cardStyle} />} />
        <Route path="colecao" element={<CollectionScreen home={home} />} />
        <Route path="placar" element={<Scoreboard />} />
        <Route path="treino" element={<TrainingTable key={location.key} home={home} cardStyle={cardStyle} />} />
        <Route path="*" element={<Navigate to={PP_BASE} replace />} />
      </Routes>
    </>
  );
};

export default PosterPoker;
