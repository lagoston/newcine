// Ler pela camada de dados FORA de componente (18/11/2026, Protocolo Reborn, onda 2a).
//
//   fetchCached(linha, busca) devolve uma Promise, como os serviços de src/lib
//   já faziam, só que passando pelo guarda-respostas: pedidos iguais ao mesmo
//   tempo viram um, e dentro do prazo da linha a resposta guardada serve.
//
// Dado pessoal só é guardado se o dono da linha for quem está logado AGORA;
// senão a busca roda direto, sem guardar nada (nunca se guarda uma resposta
// sob a pessoa errada).
//
// Este arquivo NÃO importa lib/auth.tsx de propósito: na 2b o próprio auth.tsx
// vai ler o premium por aqui (import de './data/fetch', não do index).
import { optionsOf, queryClient } from './client';
import type { QuerySpec } from './keys';
import { getScope, whenPubReady, whenUserReady } from './scope';
import { startDataSession } from './session';
import { startDataEvents } from './events';

// A partida, uma vez: ler o balde público do aparelho e escutar o barramento.
startDataSession();
startDataEvents();

export async function fetchCached<T>(spec: QuerySpec<T>, fetcher: () => Promise<T>): Promise<T> {
  if (spec.owner === 'pub') {
    await whenPubReady();
  } else {
    // visitante, login ainda carregando, ou linha de outra pessoa: direto, sem guardar
    if (typeof spec.owner !== 'string' || getScope().uid !== spec.owner) return fetcher();
    await whenUserReady(spec.owner);
    if (getScope().uid !== spec.owner) return fetcher();
  }
  return queryClient.fetchQuery<T>(optionsOf(spec, fetcher));
}
