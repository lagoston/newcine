/**
 * Sessão de mesa (`poker.session.v1`, SPEC §6.3 e §7.8): partidas separadas por
 * menos de 30 min contam como a mesma sessão. Alimenta o Diretor (meia-carga a
 * partir da 3ª partida seguida) e o cartão de Intervalo (5 partidas ou 45 min).
 */

const KEY = 'poker.session.v1';
const GAP_MS = 30 * 60 * 1000;
export const INTERVAL_AFTER_MATCHES = 5;
export const INTERVAL_AFTER_MINUTES = 45;

interface SessionData {
  v: 1;
  /** Partidas terminadas nesta sessão. */
  matches: number;
  /** Minutos de mesa somados nesta sessão. */
  minutes: number;
  /** Última atividade (fim de partida ou ação). */
  lastAt: number;
  /** Partidas e minutos desde o último Intervalo (o cartão zera a conta). */
  sinceInterval: { matches: number; minutes: number };
  /** Último dia de partida (YYYY-MM-DD local), para a variante `volta`. */
  lastDay?: string;
}

const EMPTY: SessionData = { v: 1, matches: 0, minutes: 0, lastAt: 0, sinceInterval: { matches: 0, minutes: 0 } };

function load(now = Date.now()): SessionData {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const s = JSON.parse(raw) as SessionData;
    if (s?.v !== 1) return { ...EMPTY };
    // Passou da meia hora sem mesa: sessão nova (o Intervalo também zera).
    if (now - s.lastAt > GAP_MS) return { ...EMPTY, lastDay: s.lastDay };
    return s;
  } catch {
    return { ...EMPTY };
  }
}

function save(s: SessionData) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sem armazenamento
  }
}

/** Qual partida desta sessão vai começar agora (1 = a primeira). */
export function matchInSession(): number {
  return load().matches + 1;
}

/** Fim de uma partida (livre ou prêmio): soma a partida e os minutos jogados. */
export function recordMatchEnd(minutes: number) {
  const now = Date.now();
  const s = load(now);
  const m = Math.max(0, Math.min(120, minutes));
  s.matches += 1;
  s.minutes += m;
  s.sinceInterval = { matches: s.sinceInterval.matches + 1, minutes: s.sinceInterval.minutes + m };
  s.lastAt = now;
  s.lastDay = new Date(now).toISOString().slice(0, 10);
  save(s);
}

/** Toca a sessão sem terminar partida (ex.: ação na mesa), para ela não expirar no meio. */
export function touchSession() {
  const s = load();
  s.lastAt = Date.now();
  save(s);
}

/** Hora do Intervalo? (só na livre; §7.8) */
export function intervalDue(): boolean {
  const s = load();
  return s.sinceInterval.matches >= INTERVAL_AFTER_MATCHES || s.sinceInterval.minutes >= INTERVAL_AFTER_MINUTES;
}

export function markIntervalShown() {
  const s = load();
  s.sinceInterval = { matches: 0, minutes: 0 };
  s.lastAt = Date.now();
  save(s);
}

/** Dias desde a última partida neste aparelho (variante `volta` do Diretor). */
export function daysSinceLastMatch(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessionData;
    if (!s.lastAt) return null;
    return Math.floor((Date.now() - s.lastAt) / 86_400_000);
  } catch {
    return null;
  }
}
