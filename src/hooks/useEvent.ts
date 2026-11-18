import { useCallback, useRef } from 'react';

// 18/11/2026 (otimização): uma função que nunca muda de identidade e sempre
// chama a versão mais nova (a do último render). Serve para passar ações a
// componentes memorizados (React.memo) sem anular o memo: um `onClick` criado
// de novo a cada render do pai fazia a seção inteira re-renderizar junto.
// Só para ações (toques, respostas do banco), nunca para algo lido durante o
// render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEvent<F extends (...args: any[]) => unknown>(fn: F): F {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: Parameters<F>) => ref.current(...args), []) as unknown as F;
}
