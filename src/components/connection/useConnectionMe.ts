import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { cache } from '../../lib/cache';
import { fetchUserPersona, type UserPersona } from '../../lib/persona';
import type { ConnectionSide } from '../../lib/connection';

// O seu lado da Conexão (13/10/2026): nome, foto e moldura (para os avatares
// em dupla e o story) e a sua personalidade (Personalidades, Humores lado a
// lado, Assistam juntos). Guardado por alguns minutos: a faixa e a gaveta
// pedem a mesma coisa.

const ME_TTL = 5 * 60 * 1000;
const meKey = (id: string) => `connection:me:${id}`;
const mePersonaKey = (id: string) => `connection:me-persona:${id}`;

interface MeRow {
  username: string | null;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string | null;
  lifetime_premium: boolean | null;
  personalidade_completa: string | null;
}

export function useConnectionMe(): ConnectionSide | null {
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const [me, setMe] = useState<ConnectionSide | null>(() => (myId ? cache.get<ConnectionSide>(meKey(myId)) : null));

  useEffect(() => {
    if (!myId) {
      setMe(null);
      return;
    }
    const hit = cache.get<ConnectionSide>(meKey(myId));
    if (hit) {
      setMe(hit);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('username, avatar_url, avatar_frame, plan_type, lifetime_premium, personalidade_completa')
      .eq('id', myId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const row = data as MeRow;
        const side: ConnectionSide = {
          id: myId,
          username: row.username || '',
          avatar_url: row.avatar_url,
          avatar_frame: row.avatar_frame,
          is_premium: row.plan_type === 'premium' || Boolean(row.lifetime_premium),
          persona_code: row.personalidade_completa && row.personalidade_completa.length === 3 ? row.personalidade_completa : null,
        };
        cache.set(meKey(myId), side, ME_TTL);
        setMe(side);
      });
    return () => {
      cancelled = true;
    };
  }, [myId]);

  return me;
}

// A sua personalidade (código e a parte de cada humor). Só pede quando
// `enabled` (a gaveta aberta).
export function useMyPersona(enabled: boolean): { persona: UserPersona | null; loading: boolean } {
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const [persona, setPersona] = useState<UserPersona | null>(() => (myId ? cache.get<UserPersona>(mePersonaKey(myId)) : null));
  const [loading, setLoading] = useState(Boolean(enabled && myId && !persona));

  useEffect(() => {
    if (!enabled || !myId) return;
    const hit = cache.get<UserPersona>(mePersonaKey(myId));
    if (hit) {
      setPersona(hit);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchUserPersona(myId)
      .then((data) => {
        if (cancelled) return;
        if (data) cache.set(mePersonaKey(myId), data, ME_TTL);
        setPersona(data);
      })
      .catch(() => {
        if (!cancelled) setPersona(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, myId]);

  return { persona, loading };
}
