import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  fetchConnection,
  fetchConnectionScores,
  invalidateConnections,
  isConnectionSeen,
  markConnectionSeen,
  peekConnectionScore,
  type ConnectionDetail,
  type ConnectionScore,
} from '../lib/connection';

// Ganchos da Conexão (13/10/2026). Ver lib/connection.ts.

export type ConnectionStatus = 'idle' | 'loading' | 'ready' | 'error';

// A conexão completa com uma pessoa. Não pede nada sem login, para a própria
// pessoa ou sem id. `reload()` busca de novo (depois de avaliar um título).
export function useConnection(otherId: string | null | undefined) {
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const enabled = Boolean(myId && otherId && otherId !== myId);
  const [detail, setDetail] = useState<ConnectionDetail | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(enabled ? 'loading' : 'idle');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled || !otherId) {
      setDetail(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus((prev) => (prev === 'ready' && nonce > 0 ? 'ready' : 'loading'));
    fetchConnection(otherId, { fresh: nonce > 0 })
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, otherId, nonce]);

  const reload = useCallback(() => {
    if (otherId) invalidateConnections(otherId);
    setNonce((n) => n + 1);
  }, [otherId]);

  return { detail, status, reload, enabled };
}

// A conexão com várias pessoas (chips). Devolve um mapa id → conexão; quem
// não tem número não aparece. Já começa com o que estiver guardado.
export function useConnectionScores(ids: (string | null | undefined)[]) {
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const key = useMemo(
    () => Array.from(new Set(ids.filter((id): id is string => Boolean(id) && id !== myId))).sort().join(','),
    [ids, myId],
  );
  const initial = useMemo(() => {
    const map = new Map<string, ConnectionScore>();
    if (!key) return map;
    key.split(',').forEach((id) => {
      const hit = peekConnectionScore(id);
      if (hit) map.set(id, hit);
    });
    return map;
  }, [key]);
  const [scores, setScores] = useState<Map<string, ConnectionScore>>(initial);

  useEffect(() => {
    setScores(initial);
    if (!myId || !key) return;
    let cancelled = false;
    fetchConnectionScores(key.split(','))
      .then((map) => {
        if (!cancelled) setScores(map);
      })
      .catch(() => {
        /* sem chips: a lista funciona sem eles */
      });
    return () => {
      cancelled = true;
    };
  }, [key, myId, initial]);

  return scores;
}

// A esfera da faixa: brilha enquanto você não abriu esta conexão, e de novo
// quando o número muda. `markSeen()` apaga (chame ao abrir a gaveta).
export function useConnectionGlow(otherId: string | null | undefined, signature: string | null) {
  const { session } = useAuth();
  const viewerId = session?.user?.id ?? null;
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    if (!viewerId || !otherId || !signature) {
      setGlow(false);
      return;
    }
    setGlow(!isConnectionSeen(viewerId, otherId, signature));
  }, [viewerId, otherId, signature]);

  const markSeen = useCallback(() => {
    if (!viewerId || !otherId || !signature) return;
    markConnectionSeen(viewerId, otherId, signature);
    setGlow(false);
  }, [viewerId, otherId, signature]);

  return { glow, markSeen };
}
