/**
 * O lobby inteiro numa chamada (`get_poker_home`, SPEC §5.3), com a cópia local
 * (`poker.home.v1`) para abrir o salão sem rede: a mesa livre continua offline.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PokerHome } from './apiTypes.ts';
import { pokerApi } from './api.ts';
import { loadHomeCache, saveHomeCache } from './freeStore.ts';

export interface HomeState {
  home: PokerHome | null;
  loading: boolean;
  /** Veio da cópia local (sem rede ou erro): o cartão do prêmio some. */
  offline: boolean;
  refresh: () => void;
}

let memo: PokerHome | null = null;

export function usePokerHome(): HomeState {
  const [home, setHome] = useState<PokerHome | null>(memo);
  const [loading, setLoading] = useState(!memo);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    pokerApi.getHome().then(
      (h) => {
        if (!alive) return;
        memo = h;
        setHome(h);
        setOffline(false);
        setLoading(false);
        if (h.enabled) saveHomeCache(h);
      },
      () => {
        if (!alive) return;
        const cached = loadHomeCache();
        // Sem rede: só a mesa livre, com os números guardados (o prêmio some).
        setHome(cached ? { ...cached, bounty: null } : null);
        setOffline(true);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((x) => x + 1), []);
  return { home, loading, offline, refresh };
}

export function invalidatePokerHome() {
  memo = null;
}
