// O guarda-respostas do app (18/11/2026, Protocolo Reborn, onda 2a).
//
// Um cliente só da TanStack Query para o app inteiro. NINGUÉM fora de
// src/lib/data/ importa a biblioteca: as telas e os serviços usam a fachada
// (index.ts). Assim dá para trocar a biblioteca por outra coisa sem tocar em
// tela nenhuma (relatório de rede, 4.1).
//
// O que ele resolve sozinho, e que antes cada tela fazia à mão:
//   • dois pedidos iguais ao mesmo tempo viram um (o perfil era lido 14×, o
//     evento sazonal 2× e o estado do Jackpot 3× numa sessão de 6 telas);
//   • a resposta vale por um prazo (keys.ts); dentro dele, voltar à tela não
//     vai à rede;
//   • ao voltar para o app (aba visível de novo), só o que venceu é refeito.
import { QueryClient, type Query } from '@tanstack/react-query';
import { metaOf, type QueryKey, type QuerySpec } from './keys';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // uma segunda tentativa em erro de rede (antes não havia nenhuma)
      retry: 1,
      // tenta sempre a primeira vez, mesmo se o aparelho disser "sem rede"
      // (alguns WebViews erram); sem rede de verdade, a nova tentativa espera
      // a conexão voltar em vez de falhar
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export type AnyQuery = Query<unknown, Error, unknown, QueryKey>;
export const isPublic = (query: { meta?: Record<string, unknown> }) => query.meta?.owner === 'pub';

// As opções de uma consulta a partir da linha dela em keys.ts.
export function optionsOf<T>(spec: QuerySpec<T>, queryFn: () => Promise<T>) {
  const { staleTime } = spec;
  return {
    queryKey: spec.key,
    queryFn,
    staleTime: typeof staleTime === 'function' ? (query: { state: { data: unknown } }) => staleTime(query.state.data as T | undefined) : staleTime,
    gcTime: spec.gcTime,
    meta: metaOf(spec),
  };
}

// "Isto pode ter mudado". 'now': quem está na tela pede de novo já; 'later':
// só marca como vencido (refaz na próxima vez que alguém usar, ou ao voltar
// para o app) — para o que não está à vista, sem gastar um pedido na hora.
// O prefixo pega tudo que começa com ele: ['jackpot'] cobre estado e catálogo.
export function invalidate(prefix: QueryKey, when: 'now' | 'later' = 'now'): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: prefix, refetchType: when === 'now' ? 'active' : 'none' });
}

// Pede de novo só o que estiver vencido (ou marcado com invalidate 'later') e
// em uso na tela.
export function refetchIfStale(prefix: QueryKey): Promise<void> {
  return queryClient.refetchQueries({ queryKey: prefix, type: 'active', stale: true });
}

// O que está guardado agora, sem ir à rede (undefined se não há).
export function peekCached<T>(spec: QuerySpec<T>): T | undefined {
  return queryClient.getQueryData<T>(spec.key);
}

// Corrige o que está guardado com um valor que a tela já conhece (ex.: o saldo
// de fichas devolvido por um giro). Só mexe se já houver resposta guardada.
export function patchCached<T>(spec: QuerySpec<T>, patch: (current: T) => T): void {
  if (queryClient.getQueryData(spec.key) === undefined) return;
  queryClient.setQueryData<T>(spec.key, (current) => (current === undefined ? current : patch(current)));
}
