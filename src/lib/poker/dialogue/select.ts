/**
 * Quem fala e o quê (SPEC §6.3 e §6.4): filtros de cada fala (gatilho, papel, variantes,
 * cue, requisitos, "uma vez"), escolha do falante pelos pesos de quem agiu/sofreu/assistiu
 * × tagarelice, e o baralho por personagem e gatilho, comprado sem reposição, com a LRU
 * de 48 h por cima.
 */
import type { Cue, PlayerId, RivalId } from '../types.ts';
import { handPhrase } from './handNames.ts';
import type { RenderVars } from './render.ts';
import { renderText, measure, SHORT_CHARS, TITLE_ORDER } from './render.ts';
import type { ShownHand, Signal, SignalTracker } from './signals.ts';
import { RIVALS } from './signals.ts';
import { LRU_WINDOW_MS } from './storage.ts';
import type { DialogueBank, Exchange, Line, LineRequires, Role, TableContext, Trigger } from './types.ts';

/** Tagarelice (§6.4). */
export const TALK: Record<string, number> = { cypher: 1.0, bogart: 0.9, fincher: 0.6 };

/** Gatilhos em que a fala mais específica ganha (abertura, prêmio, recapitulação…). */
const TIERED = new Set<Trigger>(['matchStart', 'bountyIntro', 'recap', 'blindsUp', 'rankUp', 'intervalReturn', 'sapoLoan',
  'tournamentWon', 'tournamentLost']);
/**
 * Pôster Poker (03/11/2026): nos créditos do torneio a fala mais específica (a do lendário)
 * ganha também entre falantes, não só dentro do baralho de cada um.
 */
const CROSS_TIERED = new Set<Trigger>(['tournamentWon', 'tournamentLost']);
/** Variantes que não contam como "específicas" (valem quase sempre). */
const LOW_TAGS = new Set(['livre', 'valendo', 'pequeno']);
/**
 * Limites por partida (§7.5: Nota do Sapo até 2, Coração da Cobra e Chapéu do Raposo até 1).
 * Pôster Poker (03/11/2026): o tique de Le Chiffre até 2 e o comentário da carta aberta até 1.
 */
export const CAPS: Record<string, number> = { rateMove: 2, beautifulError: 1, hat: 1, lesson: 1, tellMark: 2, effectReveal: 1 };

const NAME_TAG: Record<string, string> = { bogart: 'Sapo', cypher: 'Cobra', fincher: 'Raposo' };

export interface SelectEnv {
  bank: DialogueBank;
  ctx: TableContext;
  tracker: SignalTracker;
  rng: () => number;
  now: number;
  playedMatch: Set<string>;
  sessionIds: Set<string>;
  lru: Map<string, number>;
  touched: Set<string>;
  caps: Map<string, number>;
  decks: Map<string, Set<string>>;
  lastDrawn: Map<string, string>;
}

export interface Picked {
  line: Line;
  speaker: RivalId;
  text: string;
  capKey?: string;
}

export interface PickedExchange {
  ex: Exchange;
  texts: string[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function weightedPick<T>(items: T[], weight: (x: T) => number, rng: () => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items.length ? items[Math.floor(rng() * items.length)] : null;
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function specificity(variant: string[] | undefined): number {
  return (variant ?? []).filter((v) => !LOW_TAGS.has(v)).length;
}

export function hasStory(env: Pick<SelectEnv, 'ctx' | 'touched'>, key: string): boolean {
  return env.touched.has(key) || !!env.ctx.story[key];
}

/** A fala (ou troca) não tocou nas últimas 48 h neste aparelho. */
export function isFresh(env: Pick<SelectEnv, 'lru' | 'now'>, id: string): boolean {
  const at = env.lru.get(id);
  return at === undefined || env.now - at > LRU_WINDOW_MS;
}

export function requiresOk(env: SelectEnv, r: LineRequires | undefined, sig: Signal | null): boolean {
  if (!r) return true;
  if (r.alive && r.alive.some((id) => env.tracker.isOut(id))) return false;
  if (r.caller && (!sig || sig.caller !== r.caller)) return false;
  if (r.titleAtLeast && TITLE_ORDER.indexOf(env.ctx.title) < TITLE_ORDER.indexOf(r.titleAtLeast)) return false;
  if (r.storyHas && !hasStory(env, r.storyHas)) return false;
  if (r.storyNot && hasStory(env, r.storyNot)) return false;
  if (r.minMatches !== undefined && env.ctx.lifetimeMatches < r.minMatches) return false;
  return true;
}

export function onceOk(env: SelectEnv, id: string, once: Line['once'], story?: string): boolean {
  if (!once) return true;
  if (once === 'match') return !env.playedMatch.has(id);
  if (once === 'session') return !env.playedMatch.has(id) && !env.sessionIds.has(id);
  return !env.playedMatch.has(id) && !(story && hasStory(env, story));
}

/** Texto no idioma da mesa (null = não existe nesse idioma). */
export function textOf(bank: DialogueBank, id: string, pt: string, lang: 'pt' | 'en', part?: number): string | null {
  if (lang === 'pt') return pt;
  const en = bank.en[id];
  if (en === null || en === undefined) return null;
  if (Array.isArray(en)) return part === undefined ? null : en[part] ?? null;
  return part === undefined ? en : null;
}

export function varsFor(env: SelectEnv, speaker: RivalId | 'human', mao?: ShownHand, extra: Partial<RenderVars> = {}): RenderVars {
  const lang = env.ctx.lang;
  return {
    lang,
    speaker,
    title: env.ctx.title,
    premio: env.ctx.prize?.name,
    mao: mao ? handPhrase(mao.kind, mao.best5, lang, mao.royal) : undefined,
    portador: env.tracker.holderId ?? undefined,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Papéis e tags relativos ao falante
// ---------------------------------------------------------------------------

function rolesOf(s: RivalId, sig: Signal, tracker: SignalTracker): Set<Role> {
  const r = new Set<Role>(['any']);
  const victim = (sig.victimIds ?? []).includes(s);
  if (s === sig.actorId) { r.add('actor'); r.add('winner'); }
  if (victim) { r.add('victim'); r.add('loser'); }
  if (s === sig.holderId) r.add('carrier');
  if (s !== sig.actorId && !victim && s !== sig.holderId) r.add('bystander');
  if (tracker.isOut(s)) r.add('eliminated');
  return r;
}

function speakerTags(s: RivalId, sig: Signal, ctx: TableContext): Set<string> {
  const t = new Set(sig.variant);
  if (ctx.nemesis === s) t.add('nemesis');
  if (ctx.customer === s) t.add('fregues');
  const parties = [sig.actorId, ...(sig.victimIds ?? []), sig.holderId].filter((p): p is PlayerId => !!p && p !== s);
  for (const p of parties) if (NAME_TAG[p]) t.add(`vs${NAME_TAG[p]}`);
  return t;
}

/** O cue vale para o falante agora? (§6.6: fala de ator só com o cue do evento) */
function cueOk(line: Line, state: Cue | 'out', isActorOfAction: boolean, sigCue: Cue | undefined): boolean {
  if (line.out === 'only') return state === 'out';
  if (!line.cue) return true;
  if (isActorOfAction) return sigCue !== undefined && line.cue.includes(sigCue);
  if (state === 'out') return line.out === 'also';
  return line.cue.includes(state);
}

function capKeyOf(line: Line): string | undefined {
  if (line.on === 'rateMove' || line.on === 'beautifulError' || line.on === 'lesson' || line.on === 'tellMark'
    || line.on === 'effectReveal') return line.on;
  if (line.emote === 'hat') return 'hat';
  return undefined;
}

/** Peso do falante (§6.4): quem agiu 60%, quem sofreu 25%, testemunha 15%, × tagarelice. */
export function speakerWeight(s: RivalId, sig: Signal, tracker: SignalTracker): number {
  const subject = s === sig.actorId || (sig.victimIds ?? []).includes(s) || s === sig.holderId;
  let w = s === sig.actorId ? 0.6 : subject ? 0.25 : 0.15;
  w *= TALK[s] ?? 0.8;
  if (tracker.isOut(s) && !subject) {
    if (sig.priority !== 1) return 0;       // eliminado só fala em P1 e trocas, como plateia
    w *= 0.3;
  }
  return w;
}

// ---------------------------------------------------------------------------
// Falas soltas
// ---------------------------------------------------------------------------

export function eligibleLines(env: SelectEnv, sig: Signal, s: RivalId, needShort: boolean, pool: Line[]): Picked[] {
  const { ctx, tracker } = env;
  const roles = rolesOf(s, sig, tracker);
  const tags = speakerTags(s, sig, ctx);
  const state = tracker.speakerState(s);
  const isActorOfAction = sig.cue !== undefined && s === sig.actorId;
  // Silêncio do Sapo depois de `calado`, e o Raposo não fala com o anel na mesa.
  if (s === 'bogart' && tracker.sapoSilent && sig.phase === 'inHand') return [];
  if (s === 'fincher' && state === 'confiante' && sig.phase === 'inHand') return [];
  const out: Picked[] = [];
  for (const line of pool) {
    if (line.speaker !== s || line.on !== sig.trigger) continue;
    if (!roles.has(line.role)) continue;
    if (line.variant && !line.variant.every((v) => tags.has(v))) continue;
    if (sig.needVariant && !line.variant?.includes(sig.needVariant)) continue;
    if (!cueOk(line, state, isActorOfAction, sig.cue)) continue;
    if (!requiresOk(env, line.requires, sig)) continue;
    if (!onceOk(env, line.id, line.once, line.story)) continue;
    const capKey = capKeyOf(line);
    if (capKey && (env.caps.get(capKey) ?? 0) >= (CAPS[capKey] ?? Infinity)) continue;
    const raw = textOf(env.bank, line.id, line.pt, ctx.lang);
    if (raw === null) continue;
    if (needShort && measure(raw, ctx.lang) > SHORT_CHARS) continue;
    const text = renderText(raw, varsFor(env, s, sig.mao, { target: sig.victimIds?.[0], ...sig.vars }));
    if (text === null) continue;
    out.push({ line, speaker: s, text, capKey });
  }
  return out;
}

/** Escolhe uma fala do baralho do falante (sem reposição; LRU de 48 h; a específica primeiro onde vale). */
export function drawFromDeck(env: SelectEnv, cands: Picked[], trigger: Trigger): Picked | null {
  if (!cands.length) return null;
  const s = cands[0].speaker;
  const key = `${s}|${trigger}`;
  let pool = cands;
  const freshOnes = pool.filter((c) => isFresh(env, c.line.id));
  if (freshOnes.length) pool = freshOnes;
  if (TIERED.has(trigger)) {
    const top = Math.max(...pool.map((c) => specificity(c.line.variant)));
    pool = pool.filter((c) => specificity(c.line.variant) === top);
  }
  let used = env.decks.get(key);
  if (!used) {
    used = new Set();
    env.decks.set(key, used);
  }
  let unused = pool.filter((c) => !used!.has(c.line.id));
  if (!unused.length) {
    // baralho acabou: embaralha de novo, mas a última fala nunca abre o seguinte
    for (const c of pool) used.delete(c.line.id);
    const last = env.lastDrawn.get(key);
    unused = pool.length > 1 ? pool.filter((c) => c.line.id !== last) : pool;
  }
  const pick = weightedPick(unused, (c) => (c.line.weight ?? 1) * (TIERED.has(trigger) ? 1 : 1 + 0.5 * specificity(c.line.variant)), env.rng);
  if (!pick) return null;
  used.add(pick.line.id);
  env.lastDrawn.set(key, pick.line.id);
  return pick;
}

/** Fala solta para um sinal: escolhe o falante pelos pesos e a fala no baralho dele. */
export function pickLine(env: SelectEnv, sig: Signal, opts: { needShort?: boolean; pool?: Line[] } = {}): Picked | null {
  const pool = opts.pool ?? env.bank.lines;
  const speakers = (sig.speakers ?? RIVALS).filter((s) => RIVALS.includes(s));
  const options: { s: RivalId; w: number; cands: Picked[] }[] = [];
  for (const s of speakers) {
    const w = speakerWeight(s, sig, env.tracker);
    if (w <= 0) continue;
    const cands = eligibleLines(env, sig, s, !!opts.needShort, pool);
    if (cands.length) options.push({ s, w, cands });
  }
  let pickFrom = options;
  if (CROSS_TIERED.has(sig.trigger) && options.length > 1) {
    const spec = (o: { cands: Picked[] }): number => {
      const fresh = o.cands.filter((c) => isFresh(env, c.line.id));
      return fresh.length ? Math.max(...fresh.map((c) => specificity(c.line.variant))) : -1;
    };
    const top = Math.max(...options.map(spec));
    if (top >= 0) pickFrom = options.filter((o) => spec(o) === top);
  }
  const chosen = weightedPick(pickFrom, (o) => o.w, env.rng);
  if (!chosen) return null;
  return drawFromDeck(env, chosen.cands, sig.trigger);
}

// ---------------------------------------------------------------------------
// Trocas
// ---------------------------------------------------------------------------

export function eligibleExchanges(env: SelectEnv, sig: Signal, filter?: (x: Exchange) => boolean): PickedExchange[] {
  const { ctx, tracker } = env;
  const tags = new Set(sig.variant);
  const out: PickedExchange[] = [];
  for (const ex of env.bank.exchanges) {
    if (ex.on !== sig.trigger) continue;
    if (filter && !filter(ex)) continue;
    if (ex.variant && !ex.variant.every((v) => tags.has(v))) continue;
    if (!requiresOk(env, ex.requires, sig)) continue;
    if (!onceOk(env, ex.id, ex.once, ex.story)) continue;
    // durante a mão: Sapo calado não entra; Raposo com o anel também não
    if (tracker.phase === 'inHand') {
      if (tracker.sapoSilent && ex.parts.some((p) => p.speaker === 'bogart')) continue;
      if (ex.parts.some((p) => p.speaker === 'fincher') && tracker.speakerState('fincher') === 'confiante') continue;
    }
    const texts: string[] = [];
    let ok = true;
    ex.parts.forEach((p, i) => {
      const raw = textOf(env.bank, ex.id, p.pt, ctx.lang, i);
      const t = raw === null ? null : renderText(raw, varsFor(env, p.speaker, sig.mao, { target: sig.victimIds?.[0], ...sig.vars }));
      if (t === null) ok = false;
      else texts.push(t);
    });
    if (ok) out.push({ ex, texts });
  }
  return out;
}

export function pickExchange(env: SelectEnv, sig: Signal, filter?: (x: Exchange) => boolean): PickedExchange | null {
  const all = eligibleExchanges(env, sig, filter);
  if (!all.length) return null;
  const freshOnes = all.filter((x) => isFresh(env, x.ex.id));
  return weightedPick(freshOnes.length ? freshOnes : all, () => 1, env.rng);
}

/** Uma troca é inédita para esta pessoa (nunca tocou neste aparelho nem marcou story)? */
export function exchangeIsNew(env: SelectEnv, ex: Exchange): boolean {
  return !env.lru.has(ex.id) && !env.sessionIds.has(ex.id) && !(ex.story && hasStory(env, ex.story));
}
