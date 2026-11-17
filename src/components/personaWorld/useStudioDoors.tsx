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
import { hasTerrorBox, type SpotKind, type StudioExtras } from './studio';
import { MOOD_ITEMS, type MoodItemId } from './moodItems';
import { pokeItem } from './pixel';
import MoodObjectCard from './MoodObjectCardLazy';

// O que cada coisa do estúdio abre (14/11/2026).
//
// Pedido do Bruno: a máquina e a mesa "devem ser clicáveis para acessar os
// jogos"; "uma prateleira com um livro clicável"; o portal do Halloween vira
// um objeto "liberado pela tag". E, depois de ver no ar (20h32): "ao invés de
// qualquer lugar clicado abrir o 'sua persona', vamos deixar brilhando tudo
// que é possível ser clicado, como a máquina do jackpot, pôsteres, a tela e a
// borboleta para acessarem o 'sua persona', mesa de poker, a caixa do clube
// do terror pra quem tiver. As prateleiras não precisam brilhar, mas ao clicar
// nelas o usuário vai para a biblioteca."
//
//   • a máquina       → o Poster Jackpot (a gaveta, na home);
//   • a mesa          → o Pôster Poker (só aparece para quem tem o pôquer liberado);
//   • o livro         → o guia do estúdio;
//   • a caixa         → o Clube do Terror (para quem tem a Deadly Sleeping);
//   • os quadros      → a coleção de pôsteres do Jackpot;
//   • a tela e a mariposa → "Sua Persona" (quem monta a cena diz o que isso é:
//     abrir a gaveta, ou, dentro dela, descer até a Persona e a mariposa);
//   • a estante das latas → a Biblioteca (sem brilho);
//   • os móveis dos humores (17/11/2026: a escultura, a luminária, a redoma,
//     o kart, a namoradeira, a cabana e o frigobar) → reagem ao toque e abrem
//     o cartão do móvel (MoodObjectCard), no estúdio de qualquer pessoa.
//
// No estúdio de outra pessoa os jogos, os quadros e a estante são só desenho
// (os jogos e a coleção são de quem está olhando); o livro é o guia com os
// dados dela; a caixa leva ao Clube do Terror como convidado dela; a tela e a
// mariposa abrem a gaveta dela.

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
  // abre a gaveta do Jackpot (na roleta, ou direto na coleção)
  onOpen: (tab?: 'machine' | 'collection') => void;
  // o balão da ficha do dia, preso em cima da máquina
  above?: React.ReactNode;
}

export interface StudioDoors {
  extras: StudioExtras;
  hotspots: Partial<Record<SpotKind, Hotspot>>;
  // 17/11/2026: o que abre por cima da cena (o cartão de um móvel de humor);
  // quem monta a cena põe isto em algum lugar da página
  overlay: React.ReactNode;
  // o cartão está aberto (quem está por baixo desliga o Esc)
  covering: boolean;
}

export function useStudioDoors(options: {
  world: PersonaWorld | null;
  isOwn: boolean;
  // o nome de usuário do dono, sem "@" (para entrar no Clube do Terror como convidado)
  ownerUsername?: string | null;
  onOpenBook: () => void;
  // a tela e a mariposa: abrir "Sua Persona" (sem isto, não são tocáveis)
  onOpenPersona?: () => void;
  // na home: a máquina com tudo o que a porta do Jackpot fazia
  jackpot?: StudioJackpot;
  // chamado antes de sair da tela (fechar a gaveta)
  onLeave?: () => void;
}): StudioDoors {
  const { world, isOwn, ownerUsername, onOpenBook, onOpenPersona, jackpot, onLeave } = options;
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
  const posterCount = world?.posters.length ?? 0;
  const hasTerror = Boolean(world && hasTerrorBox(world));
  const personaLabel = isOwn ? t('home.persona.title') : t('personaWorld.titleOf', { name: ownerUsername ? `@${ownerUsername}` : '' });
  // o móvel de humor tocado (o cartão aberto)
  const [moodCard, setMoodCard] = useState<MoodItemId | null>(null);

  const doors = useMemo(() => {
    const extras: StudioExtras = { jackpot: !machine ? 'off' : alert ? 'alert' : 'on', poker: poker.open };
    const hotspots: Partial<Record<SpotKind, Hotspot>> = {
      book: { label: t('studio.spots.book'), onClick: onOpenBook },
    };
    // a gaveta do Jackpot: na home ela está ali mesmo; fora dela, a home abre com a gaveta
    const toJackpot = (tab: 'machine' | 'collection') => () => {
      if (openJackpot) {
        openJackpot(tab);
        return;
      }
      onLeave?.();
      navigate('/', { state: { openJackpot: tab } });
    };
    if (onOpenPersona) {
      hotspots.screen = { label: personaLabel, onClick: onOpenPersona };
      hotspots.moth = { label: personaLabel, onClick: onOpenPersona };
    }
    if (isOwn) {
      if (machine) {
        hotspots.jackpot = {
          label: waiting > 0 ? t('studio.spots.jackpotWaiting', { count: waiting }) : t('studio.spots.jackpot'),
          badge: waiting || undefined,
          above,
          onClick: toJackpot('machine'),
        };
        if (posterCount > 0) hotspots.posters = { label: t('studio.spots.posters'), onClick: toJackpot('collection') };
      }
      if (poker.open) hotspots.poker = { label: t('studio.spots.poker'), to: BLEFE_ROUTES.title, onClick: onLeave };
      hotspots.shelves = { label: t('studio.spots.shelves'), to: '/library', onClick: onLeave, glow: false };
    }
    if (hasTerror && viewerId) {
      hotspots.terror = isOwn
        ? { label: t('studio.spots.terror'), to: roomPath(TERROR_CLUB), onClick: onLeave }
        : { label: t('studio.spots.terrorVia', { name: ownerUsername ?? '' }), to: roomPath(TERROR_CLUB, ownerUsername ?? null), onClick: onLeave };
    }
    // os móveis dos humores: só os que estão na sala viram botão (studioSpots)
    MOOD_ITEMS.forEach((item) => {
      hotspots[item.id] = {
        label: t('studio.spots.mood', { item: t(`studio.inventory.names.${item.id}`) }),
        onClick: () => {
          pokeItem(item.id);
          setMoodCard(item.id);
        },
      };
    });
    return { extras, hotspots };
  }, [machine, alert, poker.open, t, onOpenBook, onOpenPersona, personaLabel, isOwn, waiting, above, openJackpot, onLeave, navigate, posterCount, hasTerror, viewerId, ownerUsername]);

  const overlay =
    moodCard && world ? (
      <MoodObjectCard id={moodCard} world={world} isOwn={isOwn} ownerUsername={ownerUsername ?? null} extras={doors.extras} onClose={() => setMoodCard(null)} onLeave={onLeave} />
    ) : null;
  return { ...doors, overlay, covering: moodCard !== null };
}
