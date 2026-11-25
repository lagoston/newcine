import { supabase } from './supabase';
import { Q, isMissingFunction, useCached, useOwner } from './data';
import { MOODS, MOOD_BY_KEY } from './moods';
import { ORACLE_BY_ID } from './oracleTheme';
import type { OracleSlot } from './mesa/types';

// A afinidade da pessoa com cada oráculo (25/11/2026).
//
// Pedido do Bruno para o Acervo: "os mini oráculos (...) os verá adaptados com
// suas cores as prateleiras que os usuários mais buscam aquele oráculo. Podemos
// ter um sapo adrenalina, uma raposa catártica mas uma cobra sensorial. As
// ordens das prateleiras devem se adaptar."
//
// O banco (get_oracle_affinity) devolve, para cada oráculo, as 9 prateleiras em
// ordem. A primeira é a que o mentor VESTE no salão (a cor do corpo dele, o
// nome "Raposa Catártica") e a que abre sozinha; a ordem inteira é a das runas
// dele. A regra mora lá: a prateleira que a pessoa mais avalia naquele
// oráculo; com menos de 5 notas nele, o gosto geral; e os três nunca repetem a
// mesma cor.

export interface MentorAffinity {
  // true: a ordem é da própria pessoa; false: é o gosto geral (ela ainda tem
  // poucas notas com este oráculo)
  own: boolean;
  // as 9 chaves de prateleira; a primeira é a que o mentor veste
  order: string[];
}
export type OracleAffinity = Record<OracleSlot, MentorAffinity>;

const SLOTS: OracleSlot[] = ['bogart', 'fincher', 'cypher'];
const VALID = new Set<string>(MOODS.map((m) => m.key));

const isOrder = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length === MOODS.length && value.every((k) => typeof k === 'string' && VALID.has(k)) && new Set(value).size === value.length;

// Só aceita a resposta inteira e certa (as 9 prateleiras nos 3 oráculos): com
// qualquer coisa fora do lugar a tela fica com a ordem antiga, a da Persona.
export function parseOracleAffinity(raw: unknown): OracleAffinity | null {
  const oracles = (raw as { oracles?: Record<string, { own?: unknown; order?: unknown }> } | null)?.oracles;
  if (!oracles) return null;
  const out = {} as OracleAffinity;
  for (const slot of SLOTS) {
    const entry = oracles[slot];
    if (!entry || !isOrder(entry.order)) return null;
    out[slot] = { own: entry.own === true, order: entry.order };
  }
  return out;
}

async function loadOracleAffinity(): Promise<OracleAffinity | null> {
  const { data, error } = await supabase.rpc('get_oracle_affinity');
  if (error) {
    // o site novo antes da migração: o Acervo segue com a ordem da Persona
    if (isMissingFunction(error)) return null;
    throw error;
  }
  return parseOracleAffinity(data);
}

// undefined = ainda chegando; null = não há (visitante, erro, função ausente).
export function useOracleAffinity(): OracleAffinity | null | undefined {
  const owner = useOwner();
  const { data, error } = useCached(Q.oracleAffinity(owner), loadOracleAffinity);
  if (owner === null) return null;
  if (data !== undefined) return data;
  return error ? null : undefined;
}

// A cor que o mentor veste: a da prateleira dele para esta pessoa. Sem a
// resposta do banco, a cor de sempre do bicho (sapo verde, raposa laranja,
// cobra amarela).
export const mentorTint = (affinity: OracleAffinity | null | undefined, slot: OracleSlot): string =>
  (affinity && MOOD_BY_KEY[affinity[slot].order[0]]?.color) || ORACLE_BY_ID[slot].color;
