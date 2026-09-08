import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface WhispersContextValue {
  unreadCount: number;
  refetchUnreadCount: () => void;
}

const WhispersContext = createContext<WhispersContextValue>({
  unreadCount: 0,
  refetchUnreadCount: () => {},
});

export const useWhispers = () => useContext(WhispersContext);

// Antes existiam DOIS estados de "não lidos" completamente separados —
// um no Navbar (atualizado via subscription realtime) e outro no
// Profile (atualizado manualmente via callback), cada um com sua
// própria cópia da contagem. Achamos também que a subscription do
// Profile escutava a tabela ERRADA ("recommendations", renomeada há
// tempos para "friend_indications") — ela nunca disparava de verdade.
// Resultado: os dois contadores podiam ficar dessincronizados, dando a
// impressão de "notificação que não some" mesmo depois de aberta.
//
// Esse Provider é a ÚNICA fonte de verdade agora — um estado, uma
// subscription (na tabela certa), consumido por qualquer componente via
// useWhispers(). Envolve o app inteiro (ou pelo menos tudo que precisa
// mostrar o badge) uma vez só, em vez de cada tela reimplementar a
// mesma lógica com o risco de divergir de novo no futuro.
export const WhispersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

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
      return;
    }

    refetchUnreadCount();

    // Nome de tabela corrigido — "friend_indications", não
    // "recommendations" (a subscription antiga do Profile nunca
    // disparava por causa desse nome desatualizado).
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
    <WhispersContext.Provider value={{ unreadCount, refetchUnreadCount }}>
      {children}
    </WhispersContext.Provider>
  );
};