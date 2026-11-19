import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { takeBootPart } from '../lib/data';
import { useBus } from '../lib/bus';

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
//
// 19/11/2026 (Reborn, onda 3): voltou, e agora funciona. O banco manda um
// aviso a cada sussurro novo e o canal ao vivo (src/lib/userChannel.ts) o
// repassa pelo barramento como 'whispers:new'; aqui o número é relido na hora.
// O canal só fica ligado com o app na frente e fora do modo economia; sem
// ele, vale a releitura ao voltar para o app, como antes.
const FOREGROUND_REFETCH_MS = 60_000;
// O canal ao vivo liga 5 s depois de a pessoa entrar: a abertura do app não
// disputa a rede com o websocket.
const LIVE_CHANNEL_DELAY_MS = 5_000;
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
      // 19/11/2026 (Reborn, onda 2b): ao abrir o app o número vem na ida única
      // da casca (get_app_bootstrap, parte "unread"); reler depois (voltar para
      // o app, marcar como lidos) chama a RPC de sempre.
      const boot = await takeBootPart<number | null>(session.user.id, 'unread');
      if (boot) {
        setUnreadCount(boot.value || 0);
        return;
      }
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

  // 19/11/2026 (onda 3): sussurro novo avisado pelo banco → relê o número.
  useBus('whispers:new', () => {
    refetchUnreadCount();
  });

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      import('../lib/userChannel')
        .then((live) => {
          if (cancelled) return;
          live.startUserChannel(uid);
          stop = live.stopUserChannel;
        })
        // sem o pedaço (rede ruim, deploy no meio): fica a releitura ao voltar
        .catch(() => undefined);
    }, LIVE_CHANNEL_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop?.();
    };
  }, [session?.user?.id]);

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
