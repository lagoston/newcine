import { supabase } from './supabase';
// (de './data/boot' e './data/scope', não do index: este arquivo entra na
// abertura por lib/appBoot.ts, que o lib/auth.tsx chama)
import { takeBootPart } from './data/boot';
import { ownerNow } from './data/scope';

// Fichas voadoras (02/11/2026): como os itens que atravessam a tela no
// Howrse, de vez em quando uma ficha do Poster Jackpot passa voando pelo site
// e quem tocar nela ganha +1 ficha comum. Quem decide tudo é o banco
// (migração 20261102000000): o dado do dia (~45% dos dias), a hora do voo,
// a janela para pegar (25 s depois da decolagem) e o crédito, uma vez só.
// Aqui ficam as três chamadas, o aviso "as fichas mudaram" para as telas do
// Jackpot e a memória (neste aparelho) de que o dia já acabou, para não
// perguntar ao banco a cada página aberta.

export type UfoState = 'none' | 'scheduled' | 'due' | 'flying' | 'caught' | 'missed';

export interface UfoStatus {
  state: UfoState;
  // scheduled: segundos até a ficha poder voar (contados pelo relógio do
  // banco, para não depender da hora do aparelho).
  flyIn: number | null;
  // flying: segundos que ainda restam para pegar.
  expiresIn: number | null;
}

// Por que o banco recusou a decolagem ou a pega.
export type UfoRefusal = 'no_chip' | 'not_due' | 'already_launched' | 'not_flying' | 'already_caught' | 'gone' | 'error';

export type UfoLaunch = { ok: true; expiresIn: number } | { ok: false; reason: UfoRefusal };
export type UfoCatch = { ok: true; tickets: number } | { ok: false; reason: UfoRefusal };

// Quanto dura a travessia na tela. A janela do banco é de 25 s: sobra folga
// para a ida e a volta da rede na decolagem e na pega.
export const UFO_FLIGHT_MS = 11500;

type Row = Record<string, unknown>;
const STATES: UfoState[] = ['none', 'scheduled', 'due', 'flying', 'caught', 'missed'];
const REFUSALS: UfoRefusal[] = ['no_chip', 'not_due', 'already_launched', 'not_flying', 'already_caught', 'gone'];
const numOrNull = (value: unknown) => (value == null || Number.isNaN(Number(value)) ? null : Number(value));
const refusal = (value: unknown): UfoRefusal => (REFUSALS.includes(value as UfoRefusal) ? (value as UfoRefusal) : 'error');

export async function fetchUfoStatus(): Promise<UfoStatus> {
  // 19/11/2026 (Reborn, onda 2b): ao abrir o app a resposta vem na ida única
  // da casca (get_app_bootstrap, parte "ufo"). Os segundos são contados pelo
  // relógio do banco NA HORA da resposta: o tempo que ela ficou esperando até
  // esta leitura é descontado. Perguntas seguintes (voltar para a aba, depois
  // de uma decolagem) vão sempre à RPC.
  const boot = await takeBootPart<unknown>(ownerNow(), 'ufo');
  let data: unknown = boot?.value;
  const waited = boot ? Math.max(0, (Date.now() - boot.at) / 1000) : 0;
  if (!boot) {
    const reply = await supabase.rpc('jackpot_ufo_status');
    if (reply.error) throw reply.error;
    data = reply.data;
  }
  const raw = (data || {}) as Row;
  const state = STATES.includes(raw.state as UfoState) ? (raw.state as UfoState) : 'none';
  const left = (value: unknown) => {
    const seconds = numOrNull(value);
    return seconds === null ? null : seconds - waited;
  };
  return { state, flyIn: left(raw.fly_in), expiresIn: left(raw.expires_in) };
}

export async function launchUfo(): Promise<UfoLaunch> {
  const { data, error } = await supabase.rpc('jackpot_ufo_launch');
  if (error) throw error;
  const raw = (data || {}) as Row;
  if (raw.ok === true) return { ok: true, expiresIn: numOrNull(raw.expires_in) ?? 25 };
  return { ok: false, reason: refusal(raw.reason) };
}

export async function catchUfo(): Promise<UfoCatch> {
  const { data, error } = await supabase.rpc('jackpot_ufo_catch');
  if (error) throw error;
  const raw = (data || {}) as Row;
  if (raw.ok === true) return { ok: true, tickets: Number(raw.tickets) || 0 };
  return { ok: false, reason: refusal(raw.reason) };
}

// ---------------------------------------------------------------------------
// "As fichas mudaram": quem mostra o saldo do Jackpot (a porta do Hub, a
// roleta) escuta este evento e recarrega. detail.tickets traz o saldo novo de
// fichas comuns quando ele é conhecido.
// ---------------------------------------------------------------------------

export const JACKPOT_CHIPS_EVENT = 'cineoracle:jackpot-chips';
export type JackpotChipsDetail = { tickets?: number };

export function notifyJackpotChipsChanged(detail: JackpotChipsDetail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<JackpotChipsDetail>(JACKPOT_CHIPS_EVENT, { detail }));
}

// ---------------------------------------------------------------------------
// O dia já acabou? (sem ficha hoje, já pega ou já foi embora). Guardado neste
// aparelho por pessoa: até a virada do dia em São Paulo o site não pergunta
// de novo. Se o armazenamento falhar, só pergunta mais vezes.
// ---------------------------------------------------------------------------

const DONE_KEY = 'cineoracle:ufo-done:';

// O dia de hoje em São Paulo (AAAA-MM-DD), o mesmo do banco.
export function saoPauloDay(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    // Sem fuso no aparelho: UTC-3 fixo (São Paulo não tem horário de verão).
    return new Date(date.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

export function isUfoDayDone(userId: string): boolean {
  try {
    return window.localStorage.getItem(DONE_KEY + userId) === saoPauloDay();
  } catch {
    return false;
  }
}

export function markUfoDayDone(userId: string) {
  try {
    window.localStorage.setItem(DONE_KEY + userId, saoPauloDay());
  } catch {
    // sem armazenamento: o banco responde de novo na próxima visita
  }
}
