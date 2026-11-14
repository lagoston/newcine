import { useEffect, useState } from 'react';
import { mothSpec, type MothSpec } from '../personaWorld/draw';
import { fetchPersonaWorld, worldState, type PersonaWorld } from '../../lib/personaWorld';

// O Patrono de cada pessoa (14/11/2026): a receita da mariposa dela, para
// desenhar fora da cabine (hoje, no medidor da nota prevista do menu do
// título).
//
// A receita sai da mesma cena do modal Sua Persona (get_persona_world): o
// formato da asa, as faixas, os olhos. Quem ainda não tem Persona não tem
// mariposa: o Patrono dela é a fagulha (null).
//
// Para o Patrono não demorar a aparecer cada vez que um título é aberto:
//   • na memória, vale por 10 minutos;
//   • no aparelho (localStorage), fica a última receita: ela aparece na hora
//     e é conferida com o banco por trás, sem ninguém esperar.
// O modal Sua Persona também avisa aqui quando carrega a cena da própria
// pessoa (rememberPatronus), então quem acabou de mudar de forma já vê a nova.

const FRESH_MS = 10 * 60 * 1000;
const storageKey = (userId: string) => `co.patronus.${userId}`;

interface Entry {
  at: number;
  spec: MothSpec | null;
}
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<MothSpec | null>>();
const listeners = new Map<string, Set<(spec: MothSpec | null) => void>>();

const looksLikeSpec = (value: unknown): value is MothSpec => {
  const spec = value as MothSpec | null;
  return Boolean(spec) && typeof spec?.shape === 'string' && typeof spec.third === 'string' && typeof spec.stage === 'number' && Array.isArray(spec.bands) && Array.isArray(spec.eyes);
};

const readStored = (userId: string): Entry | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: unknown; spec?: unknown };
    if (typeof parsed.at !== 'number') return null;
    if (parsed.spec === null) return { at: parsed.at, spec: null };
    return looksLikeSpec(parsed.spec) ? { at: parsed.at, spec: parsed.spec } : null;
  } catch {
    return null;
  }
};

const keep = (userId: string, spec: MothSpec | null) => {
  const entry = { at: Date.now(), spec };
  memory.set(userId, entry);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(entry));
  } catch {
    // sem espaço ou navegação privada: fica só na memória
  }
  listeners.get(userId)?.forEach((listener) => listener(spec));
};

const specOf = (world: PersonaWorld): MothSpec | null => mothSpec(worldState(world), world);

// A cena que alguém acabou de carregar (o modal Sua Persona) atualiza o Patrono.
export function rememberPatronus(userId: string, world: PersonaWorld) {
  keep(userId, specOf(world));
}

const refresh = (userId: string): Promise<MothSpec | null> => {
  const running = inflight.get(userId);
  if (running) return running;
  const request = fetchPersonaWorld(userId)
    .then((world) => {
      const spec = world ? specOf(world) : null;
      keep(userId, spec);
      return spec;
    })
    .finally(() => inflight.delete(userId));
  inflight.set(userId, request);
  return request;
};

export interface Patronus {
  // a mariposa da pessoa, ou null (a fagulha)
  spec: MothSpec | null;
  // já se sabe qual é (da memória, do aparelho ou do banco)
  settled: boolean;
}

export function usePatronus(userId: string | null | undefined): Patronus {
  const [state, setState] = useState<Patronus>(() => {
    if (!userId) return { spec: null, settled: true };
    const known = memory.get(userId) ?? readStored(userId);
    return known ? { spec: known.spec, settled: true } : { spec: null, settled: false };
  });

  useEffect(() => {
    if (!userId) {
      setState({ spec: null, settled: true });
      return;
    }
    let alive = true;
    const listener = (spec: MothSpec | null) => {
      if (alive) setState({ spec, settled: true });
    };
    const set = listeners.get(userId) ?? new Set();
    set.add(listener);
    listeners.set(userId, set);

    const known = memory.get(userId) ?? readStored(userId);
    if (known) {
      if (!memory.has(userId)) memory.set(userId, known);
      setState({ spec: known.spec, settled: true });
    } else {
      setState({ spec: null, settled: false });
    }
    if (!known || Date.now() - known.at > FRESH_MS) {
      refresh(userId).catch((error) => {
        console.error('Patronus:', error);
        // sem a cena: segue com o que havia (ou com a fagulha)
        if (alive) setState((current) => ({ ...current, settled: true }));
      });
    }
    return () => {
      alive = false;
      set.delete(listener);
    };
  }, [userId]);

  return state;
}
