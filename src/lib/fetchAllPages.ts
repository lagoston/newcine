import type { PostgrestError } from '@supabase/supabase-js';

// 18/11/2026 (correção, rede.md A4/A6): o PostgREST do Supabase devolve no
// máximo 1.000 linhas por pedido (o "Max Rows" da API) e corta o resto sem
// erro. Leituras sem limite de tabelas que crescem com a pessoa (a biblioteca
// em user_movies, os episódios vistos) perdiam linhas nas estatísticas do
// perfil e nas tags de quem passa de 1.000 títulos (bots semeados do IMDb,
// importações grandes). Aqui as páginas vêm em sequência até uma vir
// incompleta: com menos de 1.000 linhas continua sendo um pedido só.
//
// `page(from, to)` monta a consulta com .range(from, to) e uma ordem TOTAL
// (ex.: .order('id')), senão linhas com a mesma chave podem pular de página.

export const PAGE_SIZE = 1000;
// Trava de segurança: 200 mil linhas.
const MAX_PAGES = 200;

export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize: number = PAGE_SIZE
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * pageSize;
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: rows, error };
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return { data: rows, error: null };
}
