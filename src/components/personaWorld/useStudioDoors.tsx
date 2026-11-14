import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import type { PersonaWorld } from '../../lib/personaWorld';
import { fetchJackpotState } from '../../lib/posterJackpot';
import { TERROR_CLUB, roomPath } from '../../lib/secretRooms';
import { usePokerDoor } from '../poker/game/usePokerDoor';
import { BLEFE_ROUTES } from '../poker/jackpot/pokerMeta';
import type { Hotspot } from './PersonaScene';
import type { SpotKind, StudioExtras } from './studio';

// O que cada objeto do estúdio abre (14/11/2026).
//
// Pedido do Bruno: a máquina e a mesa "devem ser clicáveis para acessar os
// jogos"; "uma prateleira com um livro clicável"; o portal do Halloween vira
// um objeto "liberado pela tag".
//
//   • a máquina  → o Poster Jackpot (a gaveta, na home);
//   • a mesa     → o Pôster Poker (só aparece para quem tem o pôquer liberado);
//   • o aquário  → a Watchlist (cada peixe é um título esperando para ser visto);
//   • o livro    → o livro da mariposa (a história da evolução);
//   • a caixa    → o Clube do Terror (para quem tem a Deadly Sleeping).
//
// No estúdio de outra pessoa os jogos são só enfeite (os jogos são de quem
// está olhando) e o aquário também; o livro conta a história dela; a caixa
// leva ao Clube do Terror como convidado dela.

// A roleta está liberada? (fora da home, onde não há a gaveta: uma consulta por visita)
let jackpotEnabledOnce: Promise<boolean> | null = null;
const jackpotEnabled = (): Promise<boolean> => {
  if (!jackpotEnabledOnce) {
    jackpotEnabledOnce = fetchJackpotState()
      .then((state) => !!state?.enabled)
      .catch(() => {
        jackpotEnabledOnce = null;
        return false;
      });
  }
  return jackpotEnabledOnce;
};

export interface StudioJackpot {
  enabled: boolean;
  // o que está esperando a pessoa (missões prontas + Giros da Sorte)
  waiting: number;
  // há algo para pegar agora (a ficha do dia ou algo esperando): a luz da máquina pisca
  alert: boolean;
  onOpen: () => void;
  // o balão da ficha do dia, preso em cima da máquina
  above?: React.ReactNode;
}

export interface StudioDoors {
  extras: StudioExtras;
  hotspots: Partial<Record<SpotKind, Hotspot>>;
}

export function useStudioDoors(options: {
  world: PersonaWorld | null;
  isOwn: boolean;
  // o nome de usuário do dono, sem "@" (para entrar no Clube do Terror como convidado)
  ownerUsername?: string | null;
  onOpenBook: () => void;
  // na home: a máquina com tudo o que a porta do Jackpot fazia
  jackpot?: StudioJackpot;
  // chamado antes de sair da tela (fechar a gaveta)
  onLeave?: () => void;
}): StudioDoors {
  const { world, isOwn, ownerUsername, onOpenBook, jackpot, onLeave } = options;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const viewerId = session?.user?.id ?? null;
  const poker = usePokerDoor();

  // fora da home: só saber se a máquina existe
  const [roulette, setRoulette] = useState(false);
  const fromHome = Boolean(jackpot);
  useEffect(() => {
    if (fromHome || !viewerId) return;
    let alive = true;
    jackpotEnabled().then((enabled) => alive && setRoulette(enabled));
    return () => {
      alive = false;
    };
  }, [fromHome, viewerId]);

  const machine = jackpot ? jackpot.enabled : roulette;
  const waiting = jackpot?.waiting ?? 0;
  const alert = jackpot?.alert ?? false;
  const openJackpot = jackpot?.onOpen;
  const above = jackpot?.above;
  const watchCount = world?.watch.count ?? 0;
  const hasTerror = Boolean(world?.tags.some((tag) => /^deadly-sleeping(-[0-9]+)?$/.test(tag.id)));

  return useMemo(() => {
    const extras: StudioExtras = { jackpot: !machine ? 'off' : alert ? 'alert' : 'on', poker: poker.open };
    const hotspots: Partial<Record<SpotKind, Hotspot>> = {
      book: { label: t('studio.spots.book'), onClick: onOpenBook },
    };
    if (isOwn) {
      if (machine) {
        hotspots.jackpot = {
          label: waiting > 0 ? t('studio.spots.jackpotWaiting', { count: waiting }) : t('studio.spots.jackpot'),
          badge: waiting || undefined,
          above,
          onClick:
            openJackpot ??
            (() => {
              onLeave?.();
              navigate('/', { state: { openJackpot: 'machine' } });
            }),
        };
      }
      if (poker.open) hotspots.poker = { label: t('studio.spots.poker'), to: BLEFE_ROUTES.title, onClick: onLeave };
      hotspots.aquarium = { label: watchCount > 0 ? t('studio.spots.aquarium', { count: watchCount }) : t('studio.spots.aquariumEmpty'), to: '/library', onClick: onLeave };
    }
    if (hasTerror && viewerId) {
      hotspots.terror = isOwn
        ? { label: t('studio.spots.terror'), to: roomPath(TERROR_CLUB), onClick: onLeave }
        : { label: t('studio.spots.terrorVia', { name: ownerUsername ?? '' }), to: roomPath(TERROR_CLUB, ownerUsername ?? null), onClick: onLeave };
    }
    return { extras, hotspots };
  }, [machine, alert, poker.open, t, onOpenBook, isOwn, waiting, above, openJackpot, onLeave, navigate, watchCount, hasTerror, viewerId, ownerUsername]);
}
