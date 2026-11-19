// A partida do app (19/11/2026, Protocolo Reborn, onda 2b).
//
// Medido na prévia de rede: abrir a Home logado fazia 40 pedidos até assentar.
// Sete eram a "casca" (premium, vitalício, diretor, sussurros não lidos, evento
// sazonal, OVNI do Jackpot e o próprio perfil) e cinco eram as pesadas da
// primeira tela (Jackpot, estúdio da Persona, stories dos amigos, pôquer e os
// candidatos do trailer). Agora são DUAS idas a get_app_bootstrap, que saem
// juntas assim que o login é reconhecido — as pesadas da Home viajam enquanto
// o código da Home ainda está baixando.
//
// Aqui só se decide O QUE pedir. Quem usa cada parte é o consumidor de sempre
// (ver lib/data/boot.ts): se a ida falhar, cada um faz a sua chamada antiga.
//
// Este arquivo entra na abertura (lib/auth.tsx o chama): só importa coisa
// pequena. O que precisa de código da Home fica em lib/homeBoot.ts.
import { SHELL_PARTS, startBoot, type BootPart } from './data/boot';
import { doorTrailerWanted } from './doorTrailerGate';
import { isUfoDayDone } from './flyingChip';
import { EXTRA_STORY_KINDS, FEED_LIMIT } from './friendsFeedArgs';

// As pesadas que a primeira tela mostra. `skip`: o que a tela já tem guardado
// e dentro do prazo (lib/homeBoot.ts).
//   • poker: a Home pergunta "o pôquer está liberado?" para TODA conta logada
//     (usePokerDoor), então a parte vai sempre: para quem não tem, o banco
//     responde {enabled:false} sem calcular nada, e é um pedido a menos;
//   • poker_friends: só a tela do pôquer usa — não entra aqui;
//   • trailer: só nos dias em que o trailer da porta vai mesmo tentar rodar.
export function startHomeBoot(uid: string, skip: BootPart[] = []): void {
  const parts: BootPart[] = ['jackpot', 'persona_world', 'feed', 'poker'];
  if (doorTrailerWanted()) parts.push('trailer');
  startBoot(
    uid,
    'home',
    parts.filter((part) => !skip.includes(part)),
    { feed_limit: FEED_LIMIT, feed_kinds: EXTRA_STORY_KINDS },
  );
}

// O login foi reconhecido (app abrindo, ou a pessoa acabou de entrar).
export function startOpeningBoot(uid: string): void {
  // o OVNI do dia já acabou neste aparelho? então nem se pergunta (como antes)
  startBoot(
    uid,
    'shell',
    SHELL_PARTS.filter((part) => part !== 'ufo' || !isUfoDayDone(uid)),
  );
  if (typeof window !== 'undefined' && window.location.pathname === '/') startHomeBoot(uid);
}
