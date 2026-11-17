import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserPersona } from '../../lib/persona';
import { fetchPersonaWorld, type PersonaWorld } from '../../lib/personaWorld';
import { glassPanel } from '../../lib/oracleTheme';
import StudioCard from '../personaWorld/StudioCard';
import { useStudioDoors } from '../personaWorld/useStudioDoors';
import { ModuleTitle } from './observatoryKit';

// "Sua Persona" no perfil: o cartão do estúdio, o mesmo da home.
//
// 15/11/2026, pedido do Bruno: "Vamos unificar o 'Sua Persona' da home e o
// 'Sua Persona' do profile, que estão um pouco dissonantes entre si para
// ficarem congruentes. […] A versão reduzida no profile deve ser parecida com
// a versão reduzida da home."
//
// O que este bloco já foi: a roda dos humores (12/10/2026), a grade 3×3 de
// frascos (13/10), a cabine em miniatura (13/11) e, em 14/11, um bloco grande
// com o estúdio, as plaquinhas das nove prateleiras, a mariposa, o começo da
// revelação, os atalhos e os temas. Era mais que o cartão da home e diferente
// dele; e abria as gavetas Revelação e "Como funciona", que o modal já não
// tinha.
//
// Agora o bloco é o cartão (personaWorld/StudioCard): o nome, o código e o
// título, o estúdio vivo e, no computador, as três prateleiras do código e o
// nível do estúdio ao lado (até 15/11/2026 era a bitola). Tudo o que o bloco
// antigo tinha a mais foi para dentro do modal completo, que é o mesmo nos
// dois lugares (PersonaWorldSheet):
//   • as plaquinhas das prateleiras com os dados de cada uma → os potinhos;
//   • a mariposa grande → a mariposa de perto;
//   • os temas que a pessoa mais ama → embaixo dos potinhos;
//   • a Revelação e o "Como funciona" → a Persona com as explicações, no fim.
//
// No seu perfil o cartão é o seu, com a máquina, os quadros e a mesa tocáveis
// (levam à home, onde os jogos moram). No perfil de outra pessoa ele se chama
// "A Persona de @fulano" e abre o modal dela, só para olhar.
//
// O nome do arquivo ficou de quando o bloco era um anel de humores.

interface EssenceRingProps {
  // a Persona que a página do perfil já buscou (aparece no modal enquanto a cena chega)
  persona: UserPersona | null;
  isOwn: boolean;
  // "@fulano" no perfil de outra pessoa
  ownerName?: string;
  // de quem é o perfil (para buscar o estúdio dessa pessoa)
  ownerId?: string;
  // seu perfil: o seu nome de usuário (vai na imagem de compartilhar)
  shareName?: string | null;
}

// A gaveta e o guia do estúdio só são baixados na primeira abertura.
const PersonaWorldSheet = lazy(() => import('../personaWorld/PersonaWorldSheet'));
const StudioGuide = lazy(() => import('../personaWorld/StudioGuide'));

const EssenceRing: React.FC<EssenceRingProps> = ({ persona, isOwn, ownerName, ownerId, shareName = null }) => {
  const { t } = useTranslation();
  const [world, setWorld] = useState<PersonaWorld | null>(null);
  const [failed, setFailed] = useState(false);
  const [showWorld, setShowWorld] = useState(false);
  // a gaveta fica montada depois da primeira abertura (para a saída animar)
  const [worldMounted, setWorldMounted] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const username = ownerName?.replace(/^@/, '');

  // O estúdio da pessoa. Quem ainda não tem Persona também tem estúdio: o do
  // ovo ou o da lagarta. Busca de novo quando a Persona da página muda (uma
  // nota dada em outro lugar).
  const personaCode = persona?.code ?? null;
  const personaCounted = persona?.counted ?? 0;
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ownerId) return;
    let alive = true;
    setFailed(false);
    fetchPersonaWorld(ownerId)
      .then((value) => {
        if (!alive) return;
        if (value) setWorld(value);
        else setFailed(true);
      })
      .catch((error) => {
        console.error('Persona world:', error);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [ownerId, personaCode, personaCounted, attempt]);
  // mudou de dono (outro perfil): o estúdio antigo sai
  useEffect(() => setWorld(null), [ownerId]);

  const openWorld = useCallback(() => {
    setWorldMounted(true);
    setShowWorld(true);
  }, []);
  const openBook = useCallback(() => setBookOpen(true), []);
  const doors = useStudioDoors({ world, isOwn, ownerUsername: isOwn ? shareName : username, onOpenBook: openBook, onOpenPersona: openWorld });

  if (!ownerId) return null;

  // O estúdio de outra pessoa não veio (perfil fechado, ou erro): só o aviso, como antes.
  if (!isOwn && failed && !world) {
    return (
      <section className="rounded-3xl p-5 sm:p-7" style={glassPanel('#8B5CF6')}>
        <ModuleTitle title={t('personaWorld.titleOf', { name: ownerName ?? '' })} hint={t('profile.essenceEmptyOther', { username })} />
      </section>
    );
  }

  return (
    <>
      {/* No celular o cartão quase encosta nas bordas da tela, como na home,
          para a cena de 360 px caber inteira num aparelho de 360 px. */}
      <div className="-mx-5 min-[360px]:-mx-3 sm:mx-0">
        <StudioCard world={world} failed={failed} onRetry={() => setAttempt((n) => n + 1)} doors={doors} onOpen={openWorld} isOwn={isOwn} ownerName={ownerName ?? null} roomy />
      </div>
      {/* o cartão de um móvel de humor tocado na cena (17/11/2026) */}
      {doors.overlay}

      {bookOpen && world && (
        <Suspense fallback={null}>
          <StudioGuide world={world} isOwn={isOwn} ownerName={ownerName ?? null} extras={doors.extras} onClose={() => setBookOpen(false)} />
        </Suspense>
      )}
      {worldMounted && (
        <Suspense fallback={null}>
          <PersonaWorldSheet
            open={showWorld}
            onClose={() => setShowWorld(false)}
            ownerId={ownerId}
            isOwn={isOwn}
            ownerName={ownerName}
            persona={persona}
            initialWorld={world}
            username={shareName}
            onLayoutSaved={(saved) => setWorld((current) => (current ? { ...current, layout: saved.at, stored: saved.off, turn: saved.rot } : current))}
          />
        </Suspense>
      )}
    </>
  );
};

export default EssenceRing;
