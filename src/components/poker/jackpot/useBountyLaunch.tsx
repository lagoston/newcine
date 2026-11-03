import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PokerTeaser } from '../../../lib/posterJackpot';
import AgeGate from '../age/AgeGate';
import { BLEFE_ROUTES } from './pokerMeta';

// Ir da gaveta (ou da linha "Hoje na mesa") direto para a partida valendo:
// /blefe/premio?start=1&day=…&prize=… (2 toques da home até a mesa). Se a
// partida de hoje já está aberta, retoma. Se o servidor disser que falta a
// confirmação de idade (age_confirmed = false), a folha 18+ vem antes; sem
// o campo, a própria tela /blefe/premio (D1) pergunta.
export function useBountyLaunch(teaser: PokerTeaser | null) {
  const navigate = useNavigate();
  const [gate, setGate] = useState(false);
  const target = teaser?.active
    ? BLEFE_ROUTES.resume
    : teaser?.prize && teaser.day
      ? BLEFE_ROUTES.bounty(teaser.day, teaser.prize.id)
      : BLEFE_ROUTES.lobby;

  const launch = () => {
    if (teaser && !teaser.active && teaser.ageConfirmed === false) setGate(true);
    else navigate(target);
  };

  const gateElement = (
    <AgeGate
      open={gate}
      onClose={() => setGate(false)}
      onConfirmed={() => {
        setGate(false);
        navigate(target);
      }}
    />
  );

  return { launch, gateElement };
}
