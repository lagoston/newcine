import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { syncUnlockedTagsAndNotify } from '../lib/tagNotifications';
import { fetchTagProgress, unlockedPinsFrom, type UnlockedPin } from '../lib/tagProgress';

export type { UnlockedPin };

// Só a LISTA de tags desbloqueadas de um usuário (sem o progresso
// detalhado, que é coisa do modal de Tags) — usada no card de tags do
// perfil de outras pessoas. O cálculo em si mora em lib/tagProgress.ts.
export function useUnlockedTagPins(userId: string | undefined) {
  const { session } = useAuth();
  const [pins, setPins] = useState<UnlockedPin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setPins([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchTagProgress(userId)
      .then((progress) => {
        if (cancelled) return;
        const unlocked = unlockedPinsFrom(progress);
        setPins(unlocked);
        // Notifica tag nova só quando é o PRÓPRIO usuário vendo as próprias
        // tags — nunca ao visitar o perfil de outra pessoa.
        if (userId === session?.user?.id) syncUnlockedTagsAndNotify(userId, unlocked);
      })
      .catch((error) => console.error('Error fetching unlocked tag pins:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { pins, loading };
}
