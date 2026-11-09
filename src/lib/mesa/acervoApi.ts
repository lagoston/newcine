import { supabase } from '../supabase';
import type { AcervoItem, AcervoMedia, AcervoOccasion, AcervoPage, OracleSlot, Reason } from './types';

export type { AcervoItem, AcervoMedia, AcervoOccasion, AcervoPage } from './types';

// O Acervo dos oráculos, 09/11/2026: uma página (30 títulos) de uma prateleira
// (oráculo × humor × filmes/séries) ou de uma ocasião (oráculo × ocasião, em
// todos os humores), pela RPC `mesa_acervo2`. Sem Premium, sem IA, igual para
// todos; só os títulos que a pessoa já avaliou saem.
//
// Lição do erro das ocasiões da Mesa (diagnóstico de 09/11, ver
// oracle/build/ACERVO-V2.md): a pergunta passava dos 8 s do banco, o servidor
// devolvia 500 e a tela só mostrava "Tentar de novo". Aqui: (1) o servidor
// responde em 30–170 ms medidos; (2) cada pedido tem prazo de 12 s e pode ser
// cancelado quando a pessoa já trocou de filtro (AbortController), e a
// resposta atrasada nunca ocupa a tela; (3) uma falha de rede tenta de novo
// sozinha uma vez antes de mostrar o erro.

export const ACERVO_PAGE_SIZE = 30;
const REQUEST_TIMEOUT_MS = 12_000;

export const ACERVO_ORACLES: readonly OracleSlot[] = ['bogart', 'fincher', 'cypher'];

export const isAcervoOracle = (value: string | null | undefined): value is OracleSlot =>
  value === 'bogart' || value === 'fincher' || value === 'cypher';

export const isAcervoMedia = (value: string | null | undefined): value is AcervoMedia => value === 'movie' || value === 'tv';

// O id de uma ocasião no endereço (?ocasiao=galera): só letras minúsculas.
// Se não existir no banco, o servidor ignora e devolve occasion: null.
export const isOccasionId = (value: string | null | undefined): value is string => !!value && /^[a-z]{2,16}$/.test(value);

export class AcervoError extends Error {
  // 'aborted': a pessoa trocou de filtro (não é erro de verdade);
  // 'timeout': passou do prazo; 'rpc': o banco recusou; 'shape': resposta estranha.
  code: 'aborted' | 'timeout' | 'rpc' | 'shape' | string;
  constructor(code: AcervoError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
    this.name = 'AcervoError';
  }
}

export interface AcervoQuery {
  oracle: OracleSlot;
  // null: o servidor escolhe o humor mais forte da pessoa.
  mood: string | null;
  media: AcervoMedia;
  occasion: string | null;
  offset?: number;
}

const isReason = (value: unknown): value is Reason =>
  !!value && typeof value === 'object' && typeof (value as Reason).type === 'string';

// Confere o formato antes de a tela confiar na resposta: um JSON estranho
// vira erro com "Tentar de novo", e não uma grade quebrada.
function normalize(data: unknown): AcervoPage {
  if (!data || typeof data !== 'object') throw new AcervoError('shape');
  const raw = data as Record<string, unknown>;
  if (typeof raw.error === 'string') throw new AcervoError('rpc', raw.error);
  if (!Array.isArray(raw.items) || typeof raw.total !== 'number' || typeof raw.unrated_total !== 'number') {
    throw new AcervoError('shape');
  }
  const media: AcervoMedia = raw.media === 'tv' ? 'tv' : 'movie';
  const items = (raw.items as unknown[])
    .filter((item): item is AcervoItem => !!item && typeof (item as AcervoItem).tmdb_id === 'number')
    .map((item) => ({
      ...item,
      media_type: item.media_type === 'tv' ? 'tv' : media,
      in_watchlist: Boolean(item.in_watchlist),
      pred: typeof item.pred === 'number' ? item.pred : null,
      reasons: Array.isArray(item.reasons) ? item.reasons.filter(isReason) : [],
    })) as AcervoItem[];
  const occasions = Array.isArray(raw.occasions)
    ? (raw.occasions as AcervoOccasion[]).filter((o) => !!o && typeof o.id === 'string').map((o) => ({ ...o, pass: Array.isArray(o.pass) ? o.pass : [] }))
    : null;
  return {
    v: 2,
    oracle: isAcervoOracle(raw.oracle as string) ? (raw.oracle as OracleSlot) : 'bogart',
    mood: typeof raw.mood === 'string' ? raw.mood : null,
    occasion: typeof raw.occasion === 'string' ? raw.occasion : null,
    media,
    total: raw.total as number,
    unrated_total: raw.unrated_total as number,
    offset: typeof raw.offset === 'number' ? raw.offset : 0,
    next_offset: typeof raw.next_offset === 'number' ? raw.next_offset : null,
    pred_label: raw.pred_label === 'guess' || raw.pred_label === 'hidden' ? raw.pred_label : 'number',
    order: raw.order === 'public' ? 'public' : 'pred',
    passed: raw.passed === true,
    live_event: raw.live_event === 'halloween' || raw.live_event === 'christmas' ? raw.live_event : null,
    occasions,
    items,
  };
}

async function callOnce(query: AcervoQuery, signal: AbortSignal | undefined): Promise<AcervoPage> {
  const timeout = new AbortController();
  const timer = window.setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const { data, error } = await supabase
      .rpc('mesa_acervo2', {
        p_oracle: query.oracle,
        p_mood: query.mood,
        p_media: query.media,
        p_occasion: query.occasion,
        p_offset: query.offset ?? 0,
        p_limit: ACERVO_PAGE_SIZE,
      })
      .abortSignal(timeout.signal);
    if (signal?.aborted) throw new AcervoError('aborted');
    if (timeout.signal.aborted) throw new AcervoError('timeout');
    if (error) throw new AcervoError('rpc', error.message || 'mesa_acervo2 failed');
    return normalize(data);
  } catch (err) {
    if (signal?.aborted) throw new AcervoError('aborted');
    if (timeout.signal.aborted) throw new AcervoError('timeout');
    throw err instanceof AcervoError ? err : new AcervoError('rpc', err instanceof Error ? err.message : String(err));
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// Uma página. Falha de rede ou prazo estourado tenta de novo uma vez, depois
// de 600 ms; erro de regra do banco ('bot', 'bad_args') não tenta.
export async function mesaAcervo(query: AcervoQuery, signal?: AbortSignal): Promise<AcervoPage> {
  try {
    return await callOnce(query, signal);
  } catch (err) {
    const code = err instanceof AcervoError ? err.code : 'rpc';
    const ruleError = err instanceof AcervoError && (err.message === 'bot' || err.message === 'bad_args');
    if (code === 'aborted' || code === 'shape' || ruleError) throw err;
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    if (signal?.aborted) throw new AcervoError('aborted');
    return callOnce(query, signal);
  }
}
