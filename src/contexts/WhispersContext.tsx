import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

// Uma única fonte de verdade para os não lidos: um estado e uma subscription
// (na tabela friend_indications), consumidos por qualquer componente via
// useWhispers().
export const WhispersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [whispersOpen, setWhispersOpen] = useState(false);
  const [friendsVersion, setFriendsVersion] = useState(0);

  const openWhispers = useCallback(() => setWhispersOpen(true), []);
  const closeWhispers = useCallback(() => setWhispersOpen(false), []);
  const notifyFriendAccepted = useCallback(() => setFriendsVersion((v) => v + 1), []);

  const refetchUnreadCount = useCallback(async () => {
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

    const channel = supabase
      .channel('whispers-global-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_indications',
          filter: `to_user_id=eq.${session.user.id}`,
        },
        () => {
          refetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, refetchUnreadCount]);

  return (
    <WhispersContext.Provider
      value={{ unreadCount, refetchUnreadCount, whispersOpen, openWhispers, closeWhispers, friendsVersion, notifyFriendAccepted }}
    >
      {children}
    </WhispersContext.Provider>
  );
};
