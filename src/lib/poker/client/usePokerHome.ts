/**
 * O lobby inteiro numa chamada (`get_poker_home`, SPEC §5.3), com a cópia local
 * (`poker.home.v1`) para abrir o jogo sem rede: o Casual continua offline.
 *
 * 03/11/2026 (tarde): o botão "Pôster Poker" da home também precisa saber se o
 * pôquer está liberado para a conta. Os dois usam o mesmo pedido (`sharedHome`):
 * pedidos ao mesmo tempo viram um só e a resposta vale 60 s.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PokerHome } from './apiTypes.ts';
import { pokerApi } from './api.ts';
import { clearHomeCache, loadHomeCache, saveHomeCache } from './freeStore.ts';

export interface HomeState {
  home: PokerHome | null;
  loading: boolean;
  /** Veio da cópia local (sem rede ou erro): o torneio some. */
  offline: boolean;
  refresh: () => void;
}

let memo: PokerHome | null = null;
let memoAt = 0;
let inflight: Promise<PokerHome> | null = null;
const FRESH_MS = 60_000;

/** O get_poker_home compartilhado (dedupe + 60 s). `force` ignora a cópia em memória. */
export function sharedHome(force = false): Promise<PokerHome> {
  if (!force && memo && Date.now() - memoAt < FRESH_MS) return Promise.resolve(memo);
  if (inflight) return inflight;
  inflight = pokerApi.getHome().then(
    (h) => {
      inflight = null;
      memo = h;
      memoAt = Date.now();
      if (h.enabled && h.open !== false) saveHomeCache(h);
      else clearHomeCache();
      return h;
    },
    (e) => {
      inflight = null;
      throw e;
    },
  );
  return inflight;
}

/** O último lobby conhecido, sem pedir nada (memória, senão a cópia local). */
export function peekPokerHome(): PokerHome | null {
  return memo ?? loadHomeCache();
}

export function usePokerHome(): HomeState {
  const [home, setHome] = useState<PokerHome | null>(memo);
  const [loading, setLoading] = useState(!memo);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // A primeira carga aceita a cópia de 60 s (o botão da home acabou de pedir); o refresh não.
    sharedHome(tick > 0).then(
      (h) => {
        if (!alive) return;
        setHome(h);
        setOffline(false);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        const cached = loadHomeCache();
        // Sem rede: só o Casual, com os números guardados (o torneio some).
        // Sem cópia (nunca abriu aqui, ou fechou), fica o "Em breve".
        setHome(cached ? ({ ...cached, bounty: null, tournament: null } as PokerHome) : null);
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
  memoAt = 0;
}
