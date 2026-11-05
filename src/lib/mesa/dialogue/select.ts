/**
 * Escolha das falas (SPEC §3.8). Porte do `select.ts` do pôquer (05/11/2026), sem
 * papéis nem cues: o filtro é `beat` + `who` + todas as `cond` valendo nos fatos.
 *
 * O RNG é SEMEADO por `hash(seed, beat, slot, n)`: a mesma tiragem, no mesmo dia,
 * dá as mesmas falas mesmo depois de recarregar a página. O baralho por falante e
 * tempo é comprado sem reposição dentro da sessão; a LRU de 14 dias (só de dias
 * anteriores) fica por cima.
 */
import { renderText } from './render.ts';
import { isFresh, onceOk } from './storage.ts';
import type { DialogueBank, DialogueMemory, Lang, MesaExchange, MesaLine } from './types.ts';

/** FNV-1a de 32 bits sobre as partes, separadas por um caractere que não aparece nelas. */
export function hash32(...parts: (string | number | null | undefined)[]): number {
  let h = 0x811c9dc5;
  const s = parts.map((p) => String(p ?? '')).join('\u001f');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: pequeno, rápido e determinístico. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Todas as condições valem ("!x" = x não vale). */
export function condOk(cond: string[] | undefined, facts: ReadonlySet<string>): boolean {
  if (!cond) return true;
  for (const c of cond) {
    if (c.startsWith('!')) {
      if (facts.has(c.slice(1))) return false;
    } else if (!facts.has(c)) return false;
  }
  return true;
}

/**
 * Condições que não contam como "específicas": `daily` vale quase sempre, e `ask` é a
 * genérica de pergunta (com {ocasiao}); assim `ask:chuva` ganha dela (05/11/2026).
 */
const LOW = new Set(['daily', 'ask']);

/** Quantas condições positivas (e não triviais) a fala exige. */
export function specificity(cond: string[] | undefined): number {
  return (cond ?? []).filter((c) => !c.startsWith('!') && !LOW.has(c)).length;
}

export function weightedPick<T>(items: T[], weight: (x: T) => number, rng: () => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (!items.length) return null;
  if (total <= 0) return items[Math.floor(rng() * items.length)];
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function textOf(bank: DialogueBank, id: string, pt: string, lang: Lang, part?: number): string | null {
  if (lang === 'pt') return pt;
  const en = bank.en[id];
  if (en === undefined) return null;
  if (Array.isArray(en)) return part === undefined ? null : en[part] ?? null;
  return part === undefined ? en : null;
}

export interface Candidate {
  line: MesaLine;
  text: string;
}

export interface ChooseEnv {
  bank: DialogueBank;
  lang: Lang;
  facts: ReadonlySet<string>;
  slots: Record<string, string | undefined>;
  memory: DialogueMemory;
  today: string;
  /** A tiragem (draw_id + pergunta), para o `once`. */
  draw: string;
  /** Baralhos da sessão: chave → ids já comprados. */
  decks: Map<string, Set<string>>;
  lastDrawn: Map<string, string>;
}

/** As falas que podem sair agora (condições, `once`, texto na língua e slots completos). */
export function eligible(env: ChooseEnv, beat: string, who: string, extra?: (l: MesaLine) => boolean): Candidate[] {
  const out: Candidate[] = [];
  for (const line of env.bank.lines) {
    if (line.beat !== beat || line.who !== who) continue;
    if (!condOk(line.cond, env.facts)) continue;
    if (extra && !extra(line)) continue;
    if (!onceOk(env.memory, line.id, line.once, env.today, env.draw)) continue;
    const raw = textOf(env.bank, line.id, line.pt, env.lang);
    if (raw === null) continue;
    const text = renderText(raw, env.slots, env.lang);
    if (text === null) continue;
    out.push({ line, text });
  }
  return out;
}

export interface DrawOpts {
  /** Só as falas de maior especificidade (a mais específica ganha). */
  tiered?: boolean;
  /** Só a prioridade mais alta presente (P1 antes de P2 antes de P3). */
  strictPriority?: boolean;
  /** Peso por prioridade quando não é estrita (padrão: P1 4, P2 2, P3 1). */
  priorityWeight?: (p: 1 | 2 | 3) => number;
  /** Sem baralho nem LRU: escolha pura pela semente (o Livro). */
  pure?: boolean;
}

/**
 * Compra uma fala: frescas primeiro (LRU de dias anteriores), depois a prioridade e a
 * especificidade, depois o baralho sem reposição, e por fim o sorteio semeado.
 */
export function drawLine(env: ChooseEnv, cands: Candidate[], deckKey: string, rng: () => number, opts: DrawOpts = {}): Candidate | null {
  if (!cands.length) return null;
  let pool = cands;
  if (!opts.pure) {
    const fresh = pool.filter((c) => isFresh(env.memory, c.line.id, env.today));
    if (fresh.length) pool = fresh;
  }
  if (opts.strictPriority) {
    const top = Math.min(...pool.map((c) => c.line.priority));
    pool = pool.filter((c) => c.line.priority === top);
  }
  if (opts.tiered) {
    const top = Math.max(...pool.map((c) => specificity(c.line.cond)));
    pool = pool.filter((c) => specificity(c.line.cond) === top);
  }
  let unused = pool;
  let used: Set<string> | undefined;
  if (!opts.pure) {
    used = env.decks.get(deckKey);
    if (!used) {
      used = new Set();
      env.decks.set(deckKey, used);
    }
    unused = pool.filter((c) => !used!.has(c.line.id));
    if (!unused.length) {
      // baralho acabou: embaralha de novo, mas a última fala nunca abre o seguinte
      for (const c of pool) used.delete(c.line.id);
      const last = env.lastDrawn.get(deckKey);
      unused = pool.length > 1 ? pool.filter((c) => c.line.id !== last) : pool;
    }
  }
  const pw = opts.priorityWeight ?? ((p: 1 | 2 | 3) => (p === 1 ? 4 : p === 2 ? 2 : 1));
  const pick = weightedPick(
    unused,
    (c) => (c.line.weight ?? 1) * pw(c.line.priority) * (opts.tiered ? 1 : 1 + 0.5 * specificity(c.line.cond)),
    rng,
  );
  if (!pick) return null;
  if (used) {
    used.add(pick.line.id);
    env.lastDrawn.set(deckKey, pick.line.id);
  }
  return pick;
}

/** Uma troca com todos os balões renderizáveis. */
export interface ExchangeCandidate {
  ex: MesaExchange;
  texts: string[];
}

export function eligibleExchanges(env: ChooseEnv, slotsFor: (ex: MesaExchange) => Record<string, string | undefined>): ExchangeCandidate[] {
  const out: ExchangeCandidate[] = [];
  for (const ex of env.bank.exchanges) {
    if (!condOk(ex.cond, env.facts)) continue;
    if (!onceOk(env.memory, ex.id, ex.once, env.today, env.draw)) continue;
    const slots = slotsFor(ex);
    const texts: string[] = [];
    let ok = true;
    ex.parts.forEach((p, i) => {
      const raw = textOf(env.bank, ex.id, p.pt, env.lang, i);
      const t = raw === null ? null : renderText(raw, slots, env.lang);
      if (t === null) ok = false;
      else texts.push(t);
    });
    if (ok) out.push({ ex, texts });
  }
  return out;
}

export function drawExchange(env: ChooseEnv, cands: ExchangeCandidate[], rng: () => number): ExchangeCandidate | null {
  if (!cands.length) return null;
  const fresh = cands.filter((c) => isFresh(env.memory, c.ex.id, env.today));
  const pool = fresh.length ? fresh : cands;
  return weightedPick(pool, (c) => (c.ex.weight ?? 1) * (c.ex.priority === 1 ? 3 : c.ex.priority === 2 ? 2 : 1), rng);
}
