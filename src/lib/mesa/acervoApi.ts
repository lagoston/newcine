import { supabase } from '../supabase';
import type { AcervoItem, AcervoPage, OracleSlot } from './types';

export type { AcervoItem, AcervoPage } from './types';

// O Acervo dos oráculos (SPEC §2.13 e §5.10), 05/11/2026: uma prateleira
// inteira (oráculo × humor × filmes ou séries), igual para todos, paginada de
// 30 em 30 pela RPC `mesa_acervo`. Substitui as nove chamadas de borda da
// antiga Biblioteca dos Oráculos (predict-oracle-shelf), que cortava em 20
// títulos para quem não assinava — aqui não há corte, convite nem checagem
// de plano: a prateleira é igual para todos.

// Tamanho da página (o servidor aceita até 60; 30 enche 5 linhas de 6 no
// computador e 10 de 3 no celular).
export const ACERVO_PAGE_SIZE = 30;

export type AcervoMedia = 'movie' | 'tv';

export const ACERVO_ORACLES: readonly OracleSlot[] = ['bogart', 'fincher', 'cypher'];

export const isAcervoOracle = (value: string | null | undefined): value is OracleSlot =>
  value === 'bogart' || value === 'fincher' || value === 'cypher';

export const isAcervoMedia = (value: string | null | undefined): value is AcervoMedia => value === 'movie' || value === 'tv';

// Erro que a RPC devolve no corpo (lista de valores inválida etc.) ou falha de
// rede: a tela mostra "Tentar de novo" nos dois casos.
export class AcervoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcervoError';
  }
}

// O mock (SPEC §8.7) só existe em DEV e com ?mesaMock na URL; vem por import()
// dinâmico, então nunca entra no pacote de produção (o Vite troca
// import.meta.env.DEV por false e descarta o ramo).
const mockRequested = (): boolean =>
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mesaMock');

// Confere o formato mínimo antes de a tela confiar na resposta: um JSON
// estranho vira erro com "Tentar de novo", e não uma grade quebrada.
const isAcervoPage = (value: unknown): value is AcervoPage => {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<AcervoPage>;
  return Array.isArray(page.items) && typeof page.total === 'number' && typeof page.unrated_total === 'number';
};

export async function mesaAcervo(
  oracle: OracleSlot,
  mood: string,
  media: AcervoMedia = 'movie',
  offset = 0,
  limit = ACERVO_PAGE_SIZE
): Promise<AcervoPage> {
  if (mockRequested()) {
    const { mockMesaAcervo } = await import('../../components/oracleAcervo/acervoMock');
    return mockMesaAcervo(oracle, mood, media, offset, limit);
  }
  const { data, error } = await supabase.rpc('mesa_acervo', {
    p_oracle: oracle,
    p_mood: mood,
    p_media: media,
    p_offset: offset,
    p_limit: limit,
  });
  if (error) throw new AcervoError(error.message || 'mesa_acervo failed');
  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    throw new AcervoError(String((data as Record<string, unknown>).error));
  }
  if (!isAcervoPage(data)) throw new AcervoError('mesa_acervo: unexpected payload');
  return {
    ...data,
    // Defesa barata: next_offset ausente vira null (fim da prateleira).
    next_offset: typeof data.next_offset === 'number' ? data.next_offset : null,
    items: data.items.filter((item): item is AcervoItem => Boolean(item) && typeof item.tmdb_id === 'number'),
  };
}
