import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// Sussurros: a contagem de não lidos e o modal, num lugar só.
//
// O modal agora é um só para o site inteiro, aberto pelo sino do topo
// (WhispersBell, na Navbar). Antes cada tela tinha o seu — a Home abria
// um, o Perfil abria outro — e uma notificação clicada precisava navegar
// até o Perfil para abrir lá. Agora qualquer lugar chama openWhispers()
// e o modal abre ali mesmo, na página em que a pessoa está.

interface WhispersContextValue {
  unreadCount: number;
  refetchUnreadCount: () => void;
  whispersOpen: boolean;
  openWhispers: () => void;
  closeWhispers: () => void;
  // Sobe 1 sempre que um pedido de amizade é aceito pelo modal — o Perfil
  // observa e recarrega o número de amigos.
  friendsVersion: number;
  notifyFriendAccepted: () => void;
}

const WhispersContext = createContext<WhispersContextValue>({
  unreadCount: 0,
  refetchUnreadCount: () => {},
  whispersOpen: false,
  openWhispers: () => {},
  closeWhispers: () => {},
  friendsVersion: 0,
  notifyFriendAccepted: () => {},
});

export const useWhispers = () => useContext(WhispersContext);

// Uma única fonte de verdade para os não lidos: um estado, consumido por
// qualquer componente via useWhispers().
//
// 18/11/2026 (otimização, banco.md A5a): saiu a assinatura Realtime
// `postgres_changes` em friend_indications. A publicação `supabase_realtime`
// não tem nenhuma tabela, então ela nunca recebeu um evento sequer: só mantinha
// um websocket aberto em cada aparelho (com batimento a cada ~25 s) e custou
// 22,9% do tempo histórico do banco (realtime.list_changes). Nada no site
// dependia desses eventos. No lugar, o contador é relido quando o app volta ao
// primeiro plano (no máximo uma vez por minuto), além de quando a sessão muda
// e de quem já chama refetchUnreadCount (o modal, ao marcar como lidos). O
// aviso em tempo real volta na Onda 2 por Broadcast (tópico privado
// user:<id>, como o pôquer).
const FOREGROUND_REFETCH_MS = 60_000;
export const WhispersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [whispersOpen, setWhispersOpen] = useState(false);
  const [friendsVersion, setFriendsVersion] = useState(0);

  const openWhispers = useCallback(() => setWhispersOpen(true), []);
  const closeWhispers = useCallback(() => setWhispersOpen(false), []);
  const notifyFriendAccepted = useCallback(() => setFriendsVersion((v) => v + 1), []);

  const lastFetch = useRef(0);

  const refetchUnreadCount = useCallback(async () => {
    lastFetch.current = Date.now();
    if (!session?.user?.id) {
      setUnreadCount(0);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('count_unread_indications', {
        user_id_input: session.user.id,
      });
      if (error) throw error;
      setUnreadCount(data || 0);
    } catch (error) {
      console.error('Error fetching unread whispers count:', error);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) {
      setUnreadCount(0);
      setWhispersOpen(false);
      return;
    }

    refetchUnreadCount();

    const onForeground = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFetch.current > FOREGROUND_REFETCH_MS) {
        refetchUnreadCount();
      }
    };
    document.addEventListener('visibilitychange', onForeground);
    return () => document.removeEventListener('visibilitychange', onForeground);
  }, [session?.user?.id, refetchUnreadCount]);

  // 18/11/2026 (otimização): valor memorizado (era um objeto novo a cada render
  // do provedor, re-renderizando o sino e quem mais usa useWhispers).
  const value = useMemo(
    () => ({ unreadCount, refetchUnreadCount, whispersOpen, openWhispers, closeWhispers, friendsVersion, notifyFriendAccepted }),
    [unreadCount, refetchUnreadCount, whispersOpen, openWhispers, closeWhispers, friendsVersion, notifyFriendAccepted]
  );

  return (
    <WhispersContext.Provider value={value}>
      {children}
    </WhispersContext.Provider>
  );
};
