import { supabase } from '../supabase';
import type { BookPage, MediaFilter, MesaPayload, ReactResult } from './types';

// As chamadas da Mesa dos Oráculos (SPEC §5.10), 05/11/2026. Uma RPC
// principal (mesa_get) por visita, mais os gestos (mesa_react), o "ouvi"
// dos vereditos (mesa_ack), o Livro (mesa_book) e o refresco do vetor em
// segundo plano (mesa_refresh).
//
// Modo mock (SPEC §8.7): só em DEV e só com ?mesaMock=<cenário> na URL. O
// mock entra por import() dinâmico DENTRO de um `if (import.meta.env.DEV)`:
// no build de produção a condição vira `false`, o Rollup corta o ramo e o
// arquivo mockData.ts nem vira pedaço do pacote.

export type MesaAction = 'flip' | 'want' | 'seen' | 'refuse' | 'not_seen';

export class MesaError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'MesaError';
  }
}

// O cenário do mock pedido na URL (ou null fora do modo mock). Exportado para
// o Acervo (WP-ACERVO) usar o mesmo interruptor.
export function mesaMockScenario(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  if (!p.has('mesaMock')) return null;
  const v = p.get('mesaMock');
  return !v || v === '1' ? 'day' : v;
}
export const isMesaMock = (): boolean => mesaMockScenario() !== null;

type MockModule = typeof import('./mockData');
let mockPromise: Promise<MockModule> | null = null;
// Carrega o mock (só em DEV). Fora de DEV devolve null, e o import some do build.
export function loadMesaMock(): Promise<MockModule> | null {
  if (import.meta.env.DEV) {
    if (!isMesaMock()) return null;
    mockPromise ??= import('./mockData');
    return mockPromise;
  }
  return null;
}

// O banco devolve {"error":"..."} dentro do JSON em erros de regra (bad_ask);
// erros de transporte vêm em `error` do supabase-js.
function unwrap<T>(data: unknown, error: { message: string; code?: string } | null): T {
  if (error) throw new MesaError(error.code === '28000' ? 'not_authenticated' : 'rpc', error.message);
  if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in (data as Record<string, unknown>) && !('ok' in (data as Record<string, unknown>))) {
    throw new MesaError(String((data as Record<string, unknown>).error));
  }
  return data as T;
}

// A pergunta no formato do banco: null (tiragem do dia), 'occ:<id>',
// 'mood:<key>' ou 'season:<id>'.
export async function mesaGet(ask: string | null, media: MediaFilter): Promise<MesaPayload> {
  const mock = loadMesaMock();
  if (mock) return (await mock).mockMesaGet(ask, media);
  const { data, error } = await supabase.rpc('mesa_get', { p_ask: ask, p_media: media });
  return unwrap<MesaPayload>(data, error);
}

export async function mesaReact(cardId: string, action: MesaAction): Promise<ReactResult> {
  const mock = loadMesaMock();
  if (mock) return (await mock).mockMesaReact(cardId, action);
  // p_rating não vai: o servidor lê a nota de user_movies (SPEC §5.10).
  const { data, error } = await supabase.rpc('mesa_react', { p_card: cardId, p_action: action });
  return unwrap<ReactResult>(data, error);
}

export async function mesaAck(cardIds: string[]): Promise<number> {
  if (!cardIds.length) return 0;
  const mock = loadMesaMock();
  if (mock) return (await mock).mockMesaAck(cardIds);
  const { data, error } = await supabase.rpc('mesa_ack', { p_card_ids: cardIds });
  return unwrap<number>(data, error) ?? 0;
}

export async function mesaBook(before: string | null = null, days = 10): Promise<BookPage> {
  const mock = loadMesaMock();
  if (mock) return (await mock).mockMesaBook(before);
  const { data, error } = await supabase.rpc('mesa_book', { p_before: before, p_days: days });
  return unwrap<BookPage>(data, error);
}

// Refresco do vetor em segundo plano: ninguém espera, erro é engolido. Com
// 20 s de intervalo mínimo (SPEC §7.3), para uma série de "Já vi" seguidos
// não disparar um recálculo por nota.
let lastRefresh = 0;
export function mesaRefresh(): void {
  const now = Date.now();
  if (now - lastRefresh < 20_000) return;
  lastRefresh = now;
  if (isMesaMock()) return;
  supabase.rpc('mesa_refresh').then(
    () => undefined,
    () => undefined
  );
}

// Cache entre rotas (SPEC §7.3): o último payload por pergunta|mídia|dia, para
// Mesa → Acervo → Mesa reabrir na hora (e revalidar em segundo plano).
const payloadCache = new Map<string, MesaPayload>();
export const payloadCacheKey = (ask: string | null, media: MediaFilter, day: string) => `${ask ?? 'daily'}|${media}|${day}`;
export function getCachedPayload(ask: string | null, media: MediaFilter, day: string): MesaPayload | null {
  return payloadCache.get(payloadCacheKey(ask, media, day)) ?? null;
}
export function setCachedPayload(ask: string | null, media: MediaFilter, payload: MesaPayload): void {
  payloadCache.set(payloadCacheKey(ask, media, payload.day), payload);
  // Guarda no máximo 8 (perguntas do dia); a mais antiga sai.
  if (payloadCache.size > 8) payloadCache.delete(payloadCache.keys().next().value as string);
}
