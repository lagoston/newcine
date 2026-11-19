// Ler pela camada de dados DENTRO de um componente (18/11/2026, Protocolo Reborn, onda 2a).
//
//   useCached(linha, busca) devolve o que está guardado na hora, pede o que
//   falta ou venceu e redesenha quando chega. (Fora de componente: fetchCached,
//   em fetch.ts.)
//
// "linha" é uma entrada de keys.ts (Q.myProfile(uid), Q.tmdbList(...)): ela
// diz a chave, o prazo e de quem é o dado. A consulta pessoal só roda quando a
// pessoa da linha é quem está logado e o que havia no aparelho já voltou.
import { useEffect, useSyncExternalStore } from 'react';
import { replaceEqualDeep, useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth';
import { optionsOf, queryClient } from './client';
import type { Owner, QuerySpec } from './keys';
import { getScope, subscribeScope } from './scope';
import { claimScope } from './session';
// liga a partida da camada (ler o aparelho, escutar o barramento)
import './fetch';

// Quem está logado, para montar a linha de uma consulta pessoal:
// undefined enquanto o login carrega, null para visitante, o id para quem entrou.
export function useOwner(): string | null | undefined {
  const { user, loading } = useAuth() as { user: { id: string } | null; loading?: boolean };
  return loading ? undefined : (user?.id ?? null);
}

// A consulta desta linha já pode rodar? (o que estava no aparelho já voltou
// para a memória e, se for pessoal, a pessoa é mesmo a que está logada)
function useScopeReady(owner: Owner): boolean {
  // 19/11/2026 (onda 3): o componente acompanha só a RESPOSTA ("já pode?"), não
  // o estado inteiro — antes ele redesenhava a cada mudança do estado (o balde
  // público chegou, a pessoa foi reconhecida, o balde dela chegou), mesmo quando
  // a resposta para ele era a mesma. Medido no teste do menu do título: 3
  // desenhos a menos na casca ao abrir o primeiro título.
  const ready = useSyncExternalStore(subscribeScope, () => {
    const scope = getScope();
    return owner === 'pub' ? scope.pubReady : typeof owner === 'string' && scope.uid === owner && scope.userReady;
  });
  useEffect(() => {
    // é aqui que a camada fica sabendo quem entrou ou saiu
    if (owner !== 'pub' && owner !== undefined) claimScope(owner);
  }, [owner]);
  return ready;
}

// O que um componente recebe (o mesmo formato, seja qual for a biblioteca por trás).
export interface Cached<T> {
  // a resposta guardada (pode ser a da última visita, enquanto a nova chega)
  data: T | undefined;
  // ainda não há resposta nenhuma
  isPending: boolean;
  // há um pedido em andamento (o primeiro ou uma atualização)
  isFetching: boolean;
  error: Error | null;
}

export interface UseCachedOptions<T> {
  // false desliga a consulta (ex.: falta um parâmetro)
  enabled?: boolean;
  // resposta nova "igual" à guardada: devolva a guardada para ninguém redesenhar
  keep?: (previous: T, next: T) => boolean;
}

export function useCached<T>(spec: QuerySpec, fetcher: () => Promise<T>, options: UseCachedOptions<T> = {}): Cached<T> {
  const ready = useScopeReady(spec.owner);
  const { keep } = options;
  return useQuery<T, Error>(
    {
      ...optionsOf(spec, fetcher),
      enabled: ready && options.enabled !== false,
      ...(keep ? { structuralSharing: (previous: unknown, next: unknown) => (previous !== undefined && keep(previous as T, next as T) ? previous : replaceEqualDeep(previous, next)) } : {}),
    },
    // o cliente vai direto: os hooks funcionam mesmo sem o DataProvider em volta
    // (prévias que montam um componente solto)
    queryClient,
  );
}
