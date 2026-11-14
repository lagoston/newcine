import { useEffect, useState } from 'react';
import { useAuth } from '../../../lib/auth';
import type { PokerHome } from '../../../lib/poker/client/apiTypes';
import { peekPokerHome, sharedHome } from '../../../lib/poker/client/usePokerHome';

// A entrada do Pôster Poker na home, sem o ingresso (14/11/2026).
//
// Pedido do Bruno: o ingresso do pôquer saiu da home e virou um objeto do
// estúdio da pessoa, a mesa de pôquer. Aqui fica só a pergunta que o ingresso
// fazia (veio de PosterPokerButton, que foi apagado): o pôquer está liberado
// para quem está olhando? (get_poker_home: enabled e open; no máximo uma
// consulta por minuto, e a cópia guardada no aparelho responde na hora.)

const isOpen = (home: PokerHome | null) => !!home && home.enabled && home.open !== false;

export function usePokerDoor(): { open: boolean; home: PokerHome | null } {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const [home, setHome] = useState<PokerHome | null>(() => peekPokerHome());

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    sharedHome().then(
      (value) => alive && setHome(value),
      () => {}, // sem rede: fica a cópia local
    );
    return () => {
      alive = false;
    };
  }, [uid]);

  return { open: isOpen(home), home };
}
