import { useState } from 'react';

// 18/11/2026 (otimização): monta um modal só depois da primeira vez que ele
// abre, e o mantém montado dali em diante (para a animação de saída continuar
// funcionando ao fechar). Um modal fechado montado renderiza junto com o pai a
// cada toque: na Biblioteca eram 5 modais fechados por prateleira, 88
// componentes re-renderizados para abrir "Ajustes".
//
// Uso: const menuMounted = useOpenedOnce(!!menuMovie);
//      {menuMounted && <OracleSheet open={!!menuMovie} … />}
export function useOpenedOnce(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  // atualizar o próprio estado durante o render é permitido pelo React (ele
  // refaz este componente antes de pintar), sem um quadro com o modal ausente
  if (open && !opened) setOpened(true);
  return opened || open;
}
