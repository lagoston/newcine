// A camada de dados do CineOracle (18/11/2026, Protocolo Reborn, onda 2a).
//
// É a fachada: telas e serviços importam DAQUI ('../lib/data'), nunca da
// biblioteca que está por trás (TanStack Query). Relatório: claude/otimizacao/
// rede.md, seções 4.1 (chaves e prazos), 4.2 (eventos) e 4.4 (aparelho).
//
// Como usar
//   1. A consulta tem uma linha em keys.ts (chave, prazo, se vai ao aparelho).
//   2. Num componente:      const { data } = useCached(Q.x(uid), buscar);
//      Num serviço (lib):   const valor = await fetchCached(Q.x(uid), buscar);
//      Muitas de uma vez:   fetchManyCached(itens, (item) => Q.x(uid, item), buscarOsQueFaltam);
//      `uid` vem de useOwner() (componente) ou ownerNow() (serviço).
//   3. Quem muda um dado avisa no barramento (src/lib/bus.ts → emit); o mapa em
//      events.ts diz o que cada aviso faz vencer. Para corrigir a cópia guardada
//      com um valor já conhecido: patchCached.
//
// Arquivos
//   keys.ts     a tabela de chaves e prazos            events.ts   aviso → o que vence
//   client.ts   o guarda-respostas (memória)           persist.ts  o que vai ao aparelho
//   scope.ts    de quem são os dados agora             session.ts  a troca de pessoa
//   use.ts      useCached / useOwner (componentes)     fetch.ts    fetchCached (serviços)
//   me.ts       o próprio perfil e os amigos           DataProvider.tsx  o provedor (App.tsx)
//   boot.ts     a casca numa ida só (get_app_bootstrap): quem pede é lib/appBoot.ts
//   thin.ts     a marca dos títulos sem sinopse/onde assistir (listas magras)
//
// Atenção: lib/auth.tsx NÃO pode importar deste index (use.ts importa o
// auth.tsx: seria um círculo). Ele importa de './data/boot' (e, se precisar, de
// './data/fetch' e './data/keys'), que não passam pelo auth.tsx.
export { Q, type Owner, type QuerySpec } from './keys';
export { invalidate, refetchIfStale, peekCached, patchCached, seedCached, isFreshCached } from './client';
export { ownerNow } from './scope';
export { fetchCached, fetchManyCached } from './fetch';
export { isThinTitle, type ThinMark } from './thin';
export { isMissingFunction } from './missing';
export { takeBootPart, onBootPart, type BootPart, type BootValue } from './boot';
export { useCached, useOwner, type Cached, type UseCachedOptions } from './use';
export { useMyProfile, fetchMyProfile, patchMyProfile, refreshMyProfile, fetchMyFriendIds, type MyProfile } from './me';
