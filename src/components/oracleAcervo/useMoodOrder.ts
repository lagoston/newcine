import { useEffect, useState } from 'react';
import { fetchUserPersona } from '../../lib/persona';
import { MOODS, MOOD_BY_LETTER } from '../../lib/moods';

// A ordem das 9 letras do Acervo (13/11/2026). Pedido do Bruno: "Ajuste também
// a ordem com que aparecem as 9 categorias para que fiquem na ordem da
// personalidade do usuário."
//
// Primeiro as três letras do código da Persona, na ordem em que o código se
// lê (é a mesma ordem que o servidor usa para o humor padrão, mesa_top3: a
// primeira letra aqui é a prateleira que abre sozinha). Depois as outras seis,
// da prateleira mais usada para a menos usada (persona_scores: soma das notas
// dos filmes de cada prateleira). Sem código ainda (menos de 10 filmes nas
// prateleiras), vale só a ordem de uso; sem nada, a ordem de sempre.
//
// A última ordem fica guardada no aparelho (por pessoa): na volta ao Acervo as
// letras já aparecem no lugar, e a resposta do servidor só confirma. Na
// primeira vez, as casas ficam vazias por um instante (sem pular de lugar).

const STORAGE_PREFIX = 'cineoracle:acervo-mood-order:';
const DEFAULT_ORDER: string[] = MOODS.map((m) => m.key);
const VALID = new Set<string>(DEFAULT_ORDER);

const isValidOrder = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length === DEFAULT_ORDER.length && value.every((k) => typeof k === 'string' && VALID.has(k)) && new Set(value).size === value.length;

function readStored(userId: string | undefined): string[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isValidOrder(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function store(userId: string, order: string[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(order));
  } catch {
    // sem armazenamento: na próxima visita as casas esperam a resposta de novo
  }
}

export function personaMoodOrder(code: string | null, scores: { moodKey: string }[]): string[] {
  const out: string[] = [];
  const add = (key: string | undefined) => {
    if (key && VALID.has(key) && !out.includes(key)) out.push(key);
  };
  (code ?? '').split('').forEach((letter) => add(MOOD_BY_LETTER[letter]?.key));
  scores.forEach((s) => add(s.moodKey));
  DEFAULT_ORDER.forEach(add);
  return out;
}

// null enquanto a primeira resposta não chegou (e não há nada guardado).
export function useMoodOrder(userId: string | undefined): string[] | null {
  const [order, setOrder] = useState<string[] | null>(() => readStored(userId));

  useEffect(() => {
    if (!userId) {
      setOrder(DEFAULT_ORDER);
      return;
    }
    let alive = true;
    const stored = readStored(userId);
    if (stored) setOrder(stored);
    fetchUserPersona(userId)
      .then((persona) => {
        if (!alive) return;
        const next = personaMoodOrder(persona?.code ?? null, persona?.scores ?? []);
        store(userId, next);
        setOrder(next);
      })
      .catch((error) => {
        console.error('Acervo (ordem das letras):', error);
        if (alive) setOrder((current) => current ?? DEFAULT_ORDER);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return order;
}
