// Os pôsteres equipados de uma pessoa (22/11/2026).
//
// Pedido do Bruno: "Os pôsteres equipados pelo usuário devem se perpetuar para
// ele em todos os locais do site onde o título possa aparecer além da sua
// biblioteca, e o mais importante - nos stories". Até aqui só a Biblioteca, o
// "Ver todos" e o menu do título trocavam a capa.
//
// Este arquivo é a parte PEQUENA do Poster Jackpot: só a leitura dos equipados
// (uma ida ao banco por pessoa, guardada na memória da página) e o gancho que
// responde "qual é o pôster equipado DESTE título?". Mora fora de
// lib/posterJackpot.ts de propósito: a busca do topo e os ladrilhos da Home
// fazem parte da casca do app, e a casca não pode carregar a roleta inteira
// para trocar uma capa. lib/posterJackpot.ts reexporta tudo daqui (quem já
// importava de lá continua igual).
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { PosterEffect, PosterRarity } from './posterJackpot';

export type EquippedPoster = { item_id: number; effect: PosterEffect; rarity: PosterRarity; serial: number | null; file_path: string };
export type EquippedMap = Map<string, EquippedPoster>;

export const posterKey = (mediaType: string | null | undefined, id: number) => `${mediaType === 'tv' ? 'tv' : 'movie'}:${id}`;

export const POSTERS_CHANGED_EVENT = 'cineoracle:posters-changed';

type Row = Record<string, unknown>;
const num = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);

// a ida ao banco de cada pessoa (em voo ou pronta)
const equippedCache = new Map<string, Promise<EquippedMap>>();
// a última resposta PRONTA de cada pessoa: é o que os ladrilhos leem. Fica até
// a resposta nova chegar (um giro ou uma troca não fazem a capa piscar).
const settled = new Map<string, EquippedMap>();
// quantos ladrilhos estão olhando os pôsteres de cada pessoa agora
const watchers = new Map<string, number>();
const listeners = new Set<() => void>();

export function loadEquipped(ownerId: string): Promise<EquippedMap> {
  let cached = equippedCache.get(ownerId);
  if (!cached) {
    cached = (async () => {
      const { data, error } = await supabase.rpc('get_equipped_posters', { p_user_id: ownerId });
      if (error) throw error;
      const map: EquippedMap = new Map();
      (Array.isArray(data) ? (data as Row[]) : []).forEach((row) => {
        map.set(posterKey(row.media_type as string, num(row.tmdb_id)), {
          item_id: num(row.item_id),
          effect: row.effect as PosterEffect,
          rarity: row.rarity as PosterRarity,
          serial: row.serial == null ? null : num(row.serial),
          file_path: row.file_path as string,
        });
      });
      return map;
    })().catch((error) => {
      equippedCache.delete(ownerId);
      throw error;
    });
    equippedCache.set(ownerId, cached);
  }
  return cached;
}

// A mesma leitura para quem não é componente (o story compartilhado monta a
// imagem dentro de um clique). Falhou = mapa vazio: o pôster equipado é
// enfeite, nunca derruba quem pediu.
export const loadEquippedPosters = (ownerId: string | null | undefined): Promise<EquippedMap> =>
  ownerId ? loadEquipped(ownerId).catch(() => new Map() as EquippedMap) : Promise.resolve(new Map() as EquippedMap);

function settle(ownerId: string): void {
  const asked = loadEquipped(ownerId);
  asked
    .then((map) => {
      // uma resposta velha (a memória foi limpa no meio) não passa por cima da nova
      if (equippedCache.get(ownerId) !== asked || settled.get(ownerId) === map) return;
      settled.set(ownerId, map);
      listeners.forEach((notify) => notify());
    })
    .catch(() => undefined);
}

// Um giro, uma troca, equipar ou tirar: a memória deixa de valer e quem está
// na tela relê (lib/posterJackpot.ts chama isto em notifyPostersChanged).
export function clearEquippedCache(): void {
  equippedCache.clear();
  watchers.forEach((_count, ownerId) => settle(ownerId));
}

// Os pôsteres equipados de uma pessoa (a dona da biblioteca na tela).
export function useEquippedPosters(ownerId: string | null | undefined): EquippedMap {
  const [map, setMap] = useState<EquippedMap>(() => new Map());
  useEffect(() => {
    if (!ownerId) {
      setMap(new Map());
      return;
    }
    let alive = true;
    const load = () =>
      loadEquipped(ownerId)
        .then((result) => alive && setMap(result))
        .catch(() => undefined);
    load();
    window.addEventListener(POSTERS_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(POSTERS_CHANGED_EVENT, load);
    };
  }, [ownerId]);
  return map;
}

// O pôster equipado de UM título (ou undefined). Feito para estar em centenas
// de ladrilhos ao mesmo tempo: todos dividem a mesma ida ao banco, e um
// ladrilho só é redesenhado quando o pôster do SEU título muda.
export function useEquippedPoster(
  ownerId: string | null | undefined,
  mediaType: string | null | undefined,
  id: number | string | null | undefined
): EquippedPoster | undefined {
  const titleId = id == null || id === '' ? NaN : Number(id);
  const key = Number.isFinite(titleId) ? posterKey(mediaType, titleId) : null;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!ownerId) return () => undefined;
      watchers.set(ownerId, (watchers.get(ownerId) ?? 0) + 1);
      listeners.add(notify);
      if (!settled.has(ownerId)) settle(ownerId);
      return () => {
        listeners.delete(notify);
        const left = (watchers.get(ownerId) ?? 1) - 1;
        if (left <= 0) watchers.delete(ownerId);
        else watchers.set(ownerId, left);
      };
    },
    [ownerId]
  );
  return useSyncExternalStore(
    subscribe,
    () => (ownerId && key ? settled.get(ownerId)?.get(key) : undefined),
    () => undefined
  );
}
