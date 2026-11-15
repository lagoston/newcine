import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PersonalityCompletionModal from '../PersonalityCompletionModal';
import { markRevealSeen, revealModeFor, type RevealMode } from '../../lib/personaReveal';
import { fetchPersonaWorld, type PersonaWorld } from '../../lib/personaWorld';
import StudioCard from '../personaWorld/StudioCard';
import { useStudioDoors, type StudioJackpot } from '../personaWorld/useStudioDoors';
import { rememberPatronus } from '../patronus/patronus';
import { useJackpotDoor } from '../posterJackpot/useJackpotDoor';
import { DailyChipBalloon } from '../posterJackpot/DailyChip';

// O estúdio, na home (14/11/2026).
//
// Pedido do Bruno: "O botão da home 'Sua Persona' deve refletir completamente
// o 'estúdio' do usuário, inclusive em tamanho, pois tomará o espaço dos
// botões do jackpot e poker, que agora se tornarão objetos dentro do 'estúdio'
// do usuário: uma máquina caça-níquel e uma mesa. [...] Os itens devem ser
// clicáveis para acessar os jogos."
//
// Antes eram três portas e um ingresso lado a lado (a do Jackpot, a da Persona
// e o ingresso do Pôquer). Agora é uma coisa só: o estúdio da pessoa, vivo, do
// tamanho das três juntas.
//
// 14/11/2026 (noite), correção do Bruno depois de ver no ar: "ficou muita
// informação e dificultou encontrar o que é prioritário, o jackpot, e acessar
// a própria 'sua persona'. […] ao invés de qualquer lugar clicado abrir o 'sua
// persona', vamos deixar brilhando tudo que é possível ser clicado". Então só
// se toca no que brilha (e na estante das latas, que não brilha):
//   • a máquina caça-níquel, a que mais brilha, abre o Poster Jackpot (a luz
//     pisca e um número aparece quando há algo esperando; o balão da ficha do
//     dia sai dela);
//   • os quadros da parede (os últimos quatro pôsteres ganhos) abrem a coleção;
//   • a tela e a mariposa abrem a gaveta "Sua Persona";
//   • a mesa leva ao Pôster Poker (só para quem tem o pôquer liberado);
//   • o livro abre o guia do estúdio e a caixa de papelão (para quem tem a
//     tag) leva ao Clube do Terror;
//   • a estante das latas leva à Biblioteca.
// O nome em cima do cartão (e o botão "Abrir", no computador) continua abrindo
// a gaveta. A porta da Biblioteca dos Oráculos continua ao lado, como estava.
//
// 15/11/2026: o desenho do cartão saiu daqui para personaWorld/StudioCard, que
// o bloco do perfil também usa (pedido do Bruno: "a versão reduzida no profile
// deve ser parecida com a versão reduzida da home"). Este arquivo ficou com o
// que é só da home: buscar o estúdio, a máquina do Jackpot com tudo o que a
// porta antiga fazia (o balão da ficha do dia, o presente da sexta-feira 13,
// as fichas voadoras), a revelação da Persona (uma vez por personalidade) e a
// abertura de fora (navigate('/', { state: { openPersona: true } }) e
// openJackpot).

// A gaveta e o guia do estúdio só são baixados quando alguém abre.
const PersonaWorldSheet = lazy(() => import('../personaWorld/PersonaWorldSheet'));
const StudioGuide = lazy(() => import('../personaWorld/StudioGuide'));

const StudioDoor: React.FC<{ userId: string; username: string | null }> = ({ userId, username }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [world, setWorld] = useState<PersonaWorld | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  // a gaveta fica montada depois da primeira abertura (para a saída animar)
  const [sheetMounted, setSheetMounted] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [reveal, setReveal] = useState<RevealMode | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    fetchPersonaWorld(userId)
      .then((value) => {
        if (!value) {
          setFailed(true);
          return;
        }
        setWorld(value);
        // a mariposa de luz do menu dos títulos (o Patrono) é a desta cena
        rememberPatronus(userId, value);
        const persona = value.persona;
        if (persona?.code && persona.persona) {
          const mode = revealModeFor(userId, persona.code, persona.persona.tmdbId);
          if (mode) setReveal(mode);
        }
      })
      .catch((error) => {
        console.error('Studio door:', error);
        setFailed(true);
      });
  }, [userId]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open) setSheetMounted(true);
  }, [open]);

  // Aberta de fora (perfil, links antigos da Central).
  const requested = (location.state as { openPersona?: boolean } | null)?.openPersona;
  useEffect(() => {
    if (!requested) return;
    setOpen(true);
    navigate(location.pathname + location.search, { replace: true, state: null });
  }, [requested, navigate, location.pathname, location.search]);

  const persona = world?.persona ?? null;
  const closeReveal = () => {
    if (persona?.code) markRevealSeen(userId, persona.code, persona.persona?.tmdbId ?? null);
    setReveal(null);
  };

  // ---- a máquina do Jackpot: tudo o que a porta fazia ----
  const jackpot = useJackpotDoor();
  const { enabled, waiting, dailyChip, claimingDaily, sheetOpen, open: openJackpot, claimDaily } = jackpot;
  const studioJackpot: StudioJackpot = useMemo(
    () => ({
      enabled,
      waiting,
      alert: waiting > 0 || dailyChip,
      onOpen: (tab) => openJackpot(tab ?? 'machine'),
      // o balão da ficha do dia sai de cima da máquina e cresce para a esquerda (o rabicho aponta para ela)
      above: <DailyChipBalloon show={dailyChip && !sheetOpen} claiming={claimingDaily} onClaim={claimDaily} className="pj-daily-left bottom-[10px] -right-[29px]" />,
    }),
    [enabled, waiting, dailyChip, sheetOpen, claimingDaily, claimDaily, openJackpot],
  );
  const openBook = useCallback(() => setBookOpen(true), []);
  const openSheet = useCallback(() => setOpen(true), []);
  const doors = useStudioDoors({ world, isOwn: true, ownerUsername: username, onOpenBook: openBook, onOpenPersona: openSheet, jackpot: studioJackpot });
  // dentro da gaveta a máquina fecha a gaveta antes de abrir o Jackpot, e o balão fica só aqui na home
  const sheetJackpot: StudioJackpot = useMemo(
    () => ({
      enabled,
      waiting,
      alert: waiting > 0 || dailyChip,
      onOpen: (tab) => {
        setOpen(false);
        openJackpot(tab ?? 'machine');
      },
    }),
    [enabled, waiting, dailyChip, openJackpot],
  );

  return (
    <>
      <StudioCard world={world} failed={failed} onRetry={load} doors={doors} onOpen={openSheet} isOwn />

      {jackpot.sheet}

      {sheetMounted && (
        <Suspense fallback={null}>
          <PersonaWorldSheet
            open={open}
            onClose={() => {
              setOpen(false);
              load();
            }}
            ownerId={userId}
            isOwn
            persona={persona}
            initialWorld={world}
            username={username}
            jackpot={sheetJackpot}
          />
        </Suspense>
      )}

      {bookOpen && world && (
        <Suspense fallback={null}>
          <StudioGuide world={world} isOwn ownerName={null} extras={doors.extras} onClose={() => setBookOpen(false)} />
        </Suspense>
      )}

      {reveal && persona && <PersonalityCompletionModal isOpen onClose={closeReveal} persona={persona} changed={reveal === 'changed'} recast={reveal === 'recast'} />}
    </>
  );
};

export default StudioDoor;
