// O provedor da camada de dados (18/11/2026, Protocolo Reborn, onda 2a).
//
// Fica no App.tsx, logo dentro do AuthProvider. Faz duas coisas:
//   • entrega o guarda-respostas para a árvore (QueryClientProvider);
//   • avisa a camada de quem está logado, inclusive quando a pessoa SAI e
//     nenhuma tela com dado pessoal está montada (é o que apaga do aparelho e
//     da memória o que era dela — ver session.ts).
import React, { useLayoutEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './client';
import { claimScope } from './session';
import { useOwner } from './use';

export function DataProvider({ children }: { children: React.ReactNode }) {
  const owner = useOwner();
  // antes de pintar: a tela de quem entrou nunca é desenhada com a memória de quem saiu
  useLayoutEffect(() => {
    if (owner !== undefined) claimScope(owner);
  }, [owner]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
