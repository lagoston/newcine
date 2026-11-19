// A partida da Home quando ela monta (19/11/2026, Protocolo Reborn, onda 2b).
//
// Ao ABRIR o app na Home, as pesadas da primeira tela já saíram junto com o
// login (lib/appBoot.ts) e este gancho não pede nada. Ele serve para as outras
// vezes — voltar à Home vindo de outra página: em vez de cada porta pedir o seu
// (stories, estúdio, pôquer, Jackpot), sai um pedido só, e só com o que não
// está guardado dentro do prazo.
import { useRef } from 'react';
import { startHomeBoot } from './appBoot';
import { Q } from './data/keys';
import { isFreshCached } from './data/client';
import type { BootPart } from './data/boot';
import { isPokerHomeFresh } from './poker/client/usePokerHome';

export function useHomeBoot(uid: string | null | undefined): void {
  const started = useRef<string | null>(null);
  // Durante o desenho, de propósito: precisa sair ANTES dos efeitos dos
  // componentes da Home (são eles que pedem cada parte, e efeito de filho roda
  // antes de efeito de pai). Uma vez por montagem e por pessoa; não mexe em
  // estado de tela.
  if (uid && started.current !== uid) {
    started.current = uid;
    const skip: BootPart[] = [];
    if (isFreshCached(Q.jackpotState(uid))) skip.push('jackpot');
    if (isPokerHomeFresh()) skip.push('poker');
    startHomeBoot(uid, skip);
  }
}
