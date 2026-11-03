/**
 * Persistência local da partida livre (SPEC §4.6). Tudo com try/catch: nenhuma
 * destas chaves é fonte de verdade, e o jogo continua sem elas.
 *
 *  - `poker.free.v1`    a partida em andamento (estado completo + cauda de eventos);
 *  - `poker.pending.v1` relatos de partidas livres ainda não enviados (até 20);
 *  - `poker.memory.v1`  a memória do Raposo na livre;
 *  - `poker.home.v1`    cópia do get_poker_home para abrir o salão sem rede.
 */
import type { MatchState, MatchSummary, OppCounters, PlayerId, PublicEvent } from '../types.ts';
import type { PokerHome } from './apiTypes.ts';

const FREE_KEY = 'poker.free.v1';
const PENDING_KEY = 'poker.pending.v1';
const MEMORY_KEY = 'poker.memory.v1';
const HOME_KEY = 'poker.home.v1';
const TAIL_MAX = 60;
const PENDING_MAX = 20;
export const FREE_TTL_MS = 24 * 60 * 60 * 1000;

export interface SavedFreeMatch {
  v: 1;
  savedAt: number;
  startedAt: string;
  clientId: string;
  state: MatchState;
  tail: PublicEvent[];
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // nada a fazer
  }
}

export function loadFreeMatch(): SavedFreeMatch | null {
  const s = readJson<SavedFreeMatch>(FREE_KEY);
  // Outro formato (versão nova do estado): descarta em silêncio.
  if (!s || s.v !== 1 || !s.state || s.state.v !== 1 || !s.clientId) return null;
  return s;
}

export function saveFreeMatch(m: Omit<SavedFreeMatch, 'v' | 'savedAt' | 'tail'>, newEvents: PublicEvent[], prevTail: PublicEvent[] = []) {
  const tail = [...prevTail, ...newEvents].slice(-TAIL_MAX);
  writeJson(FREE_KEY, { v: 1, savedAt: Date.now(), ...m, tail } satisfies SavedFreeMatch);
  return tail;
}

export function clearFreeMatch() {
  remove(FREE_KEY);
}

/** Mão em andamento da partida livre salva (o lobby mostra "Continuar · mão N"). */
export function savedFreeHand(): number | null {
  const s = loadFreeMatch();
  if (!s || s.state.status !== 'running') return null;
  if (Date.now() - s.savedAt > FREE_TTL_MS) return null;
  return s.state.game.handNumber || 1;
}

// ---------------------------------------------------------------------------
// Relatos pendentes (idempotentes pelo clientId)
// ---------------------------------------------------------------------------

export function pendingReports(): MatchSummary[] {
  const list = readJson<MatchSummary[]>(PENDING_KEY);
  return Array.isArray(list) ? list : [];
}

/**
 * Fecha a partida: entra na fila de relatos e sai do "em andamento" no mesmo passo,
 * para um recarregar no meio nunca relatar duas vezes nem perder o relato.
 */
export function finishFreeMatch(summary: MatchSummary) {
  const list = pendingReports().filter((s) => s.clientId !== summary.clientId);
  list.push(summary);
  writeJson(PENDING_KEY, list.slice(-PENDING_MAX));
  clearFreeMatch();
}

export function dropPendingReport(clientId: string) {
  writeJson(
    PENDING_KEY,
    pendingReports().filter((s) => s.clientId !== clientId),
  );
}

// ---------------------------------------------------------------------------
// Memória do Raposo na livre e cópia do lobby
// ---------------------------------------------------------------------------

export function loadFoxMemory(): Record<PlayerId, OppCounters> | null {
  const m = readJson<{ v: 1; model: Record<PlayerId, OppCounters> }>(MEMORY_KEY);
  return m && m.v === 1 && m.model ? m.model : null;
}

export function saveFoxMemory(model: Record<PlayerId, OppCounters> | undefined) {
  if (!model) return;
  writeJson(MEMORY_KEY, { v: 1, model });
}

export function loadHomeCache(): PokerHome | null {
  return readJson<PokerHome>(HOME_KEY);
}

export function saveHomeCache(home: PokerHome) {
  writeJson(HOME_KEY, home);
}

/** Salão fechado para a conta: a cópia local não pode reabrir a mesa sem rede. */
export function clearHomeCache() {
  remove(HOME_KEY);
}

/** Id curto e único para relatos (idempotência) e para o `idem` do prêmio. */
export function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // segue para o plano B
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Semente da partida livre: 128 bits do gerador do sistema (§4.2). */
export function randomSeed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
