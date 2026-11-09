/**
 * APOSENTADO EM 09/11/2026: a Mesa de três cartas saiu (pedido do Bruno; o Acervo
 * virou a página única da Mesa) e nenhuma tela importa mais este Diretor. Ele fica
 * no repositório, intacto, com o banco de 478 falas escritas à mão
 * (scripts/mesa/falas-src/, gen-lines.ts, check-lines.ts e test-director.ts
 * continuam rodando), para o dia em que os oráculos voltarem a falar. Não entra
 * no pacote do site: o Vite só empacota o que é importado.
 *
 * O Diretor de falas da Mesa dos Oráculos (SPEC §3). Contrato com o WP-UI-MESA no
 * §3.8: `createMesaDirector()` devolve um objeto com mirror/opening/seal/sealOpen/
 * allFlipped/mirrorClose/reaction/verdictLineFor/system.
 *
 * Porte do Diretor do pôquer na FORMA (baralho por falante e tempo, slots, LRU), sem
 * a lógica de mão (05/11/2026). O servidor manda só fatos; aqui eles viram condições
 * (`cond`) e slots, e o banco escrito à mão (`lines.pt.ts`/`lines.en.ts`, gerados de
 * `scripts/mesa/falas-src/`) dá o texto. Nada é gerado na hora: nenhuma IA.
 *
 * Estabilidade: toda escolha usa um RNG semeado por (semente da tiragem, tempo,
 * assento, contador), e cada resposta fica guardada por tiragem dentro da instância.
 * Chamar duas vezes (o StrictMode do React chama os efeitos duas vezes em DEV) devolve
 * o mesmo balão; recarregar a página no mesmo dia também.
 */
import { EN } from './lines.en.ts';
import { EXCHANGES, LINES } from './lines.pt.ts';
import { balloonMs } from './render.ts';
import type { Candidate, ChooseEnv, DrawOpts } from './select.ts';
import { drawExchange, drawLine, eligible, eligibleExchanges, hash32, seededRng, specificity } from './select.ts';
import {
  DE_PAIS, MOOD_NAME, OCCASION_NAME, WEEKDAY_KEY, WEEKDAY_NAME, dayDiff, estreante, formatDecade, formatDecimal,
  formatInt, formatRuntime, truncateTitle, weekdayOfIso,
} from './slots.ts';
import { browserStorage, memoryStorage, remember } from './storage.ts';
import type {
  DialogueBank, DialogueCard, DialoguePayload, DialogueSeat, DialogueStorage, DirectorCtx, Lang, MesaDirector,
  MesaExchange, MesaLine, OracleId, PassReason, ReactionKind, Speaker, Spoken, SystemKind, VerdictCategory,
} from './types.ts';

export type {
  DialogueBank, DialogueCard, DialoguePayload, DialogueSeat, DialogueStorage, DirectorCtx, Lang, MesaDirector,
  OracleId, PassReason, ReactionKind, Speaker, Spoken, SystemKind, VerdictCategory,
} from './types.ts';

export const DEFAULT_BANK: DialogueBank = { lines: LINES, exchanges: EXCHANGES, en: EN };

/** Teto de balões por tiragem, sem contar as reações a gestos (§3.2). */
export const DRAW_BALLOON_CAP = 8;
/** Em 40% das tiragens não há troca depois das três viradas (pela semente). */
export const BANTER_SILENT_PCT = 40;

const ORACLES: OracleId[] = ['bogart', 'fincher', 'cypher'];

// ---------------------------------------------------------------------------
// Fatos: o que vale agora, em forma de condição
// ---------------------------------------------------------------------------

export function hourKey(h: number): 'late' | 'morning' | 'afternoon' | 'night' {
  if (h < 5) return 'late';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'night';
}

/** A carta que está no assento agora (a ativa; se houver mais de uma, a não descartada mais nova). */
export function cardAt(p: DialoguePayload, seat: DialogueSeat): DialogueCard | null {
  const at = (p.cards ?? []).filter((c) => c.seat === seat);
  if (!at.length) return null;
  const live = at.filter((c) => c.state !== 'seen' && c.state !== 'refused' && c.state !== 'not_seen');
  return (live.length ? live : at)[(live.length ? live : at).length - 1];
}

function isPassed(p: DialoguePayload, seat: OracleId): boolean {
  return (p.passed ?? []).some((x) => x.seat === seat);
}

/** Os fatos de uma carta (de `line_facts`, mais alguns derivados do título). */
export function cardFacts(card: DialogueCard | null): string[] {
  if (!card) return [];
  const lf = card.line_facts ?? ({} as DialogueCard['line_facts']);
  const out: string[] = [];
  for (const k of ['bw', 'long', 'series', 'hidden', 'bomb', 'p10hi', 'anime', 'br', 'sequel', 'huge',
    'newmood', 'newcountry', 'ressalva', 'watchlist'] as const) {
    if (lf[k]) out.push(k);
  }
  if (card.title?.media_type === 'tv' && !out.includes('series')) out.push('series');
  if (card.title?.year != null && card.title.year < 1970) out.push('old');
  if (card.second_opinion) out.push('second');
  if (card.pred?.label === 'hidden') out.push('nopred');
  return out;
}

/** Os fatos da tiragem inteira (Espelho, anfitrião, selo). */
export function globalFacts(ctx: DirectorCtx): Set<string> {
  const p = ctx.payload;
  const f = new Set<string>();
  const rated = p.me?.rated ?? 0;
  const counted = p.me?.persona_progress?.counted ?? 0;
  if (p.mode === 'recon') {
    f.add('recon');
    if (rated > 0) f.add('n1_9');
  }
  if (rated === 0) f.add('n0');
  if (rated >= 30) f.add('colega');
  if (p.me?.persona) f.add('persona');
  // "Falta um" só é verdade com 3 humores já usados (a Persona pede 10 títulos em 3 prateleiras).
  else if (counted === 9 && (p.me?.persona_progress?.moods_used ?? 0) >= 3) f.add('almost');
  if (ctx.reveal === 'new' && p.me?.persona) f.add('persona_new');
  if (ctx.reveal === 'changed' || p.facts?.code_changed) f.add('code_changed');
  if (p.facts?.first_visit) f.add('first_visit');
  if ((p.facts?.returning_days ?? 0) >= 4) f.add('returning');
  if (p.facts?.mood_rising && MOOD_NAME.pt[p.facts.mood_rising]) f.add('mood_rising');
  // "você quase nunca entra em…" exige ≥ 20 notas (§3.3): o servidor já manda assim; conferimos de novo.
  if (p.facts?.weak_mood && MOOD_NAME.pt[p.facts.weak_mood] && rated >= 20) f.add('weak_mood');
  if ((p.facts?.verdicts_pending ?? 0) > 0 || (p.verdicts ?? []).length > 0) f.add('verdict_pending');
  const cards = p.cards ?? [];
  if (p.facts?.espelho4 || cards.some((c) => c.kind === 'espelho4')) f.add('espelho4');
  if (p.facts?.reveal || cards.some((c) => c.kind === 'reveal')) f.add('reveal');
  if (p.facts?.live_event) f.add(`event:${p.facts.live_event}`);
  const y = p.facts?.yesterday;
  if (y && y.unflipped > 0) f.add('yesterday_unflipped');
  if (y && y.cypher_closed) f.add('yesterday_cypher_closed');
  if (y && y.flipped >= 3) f.add('yesterday_all');
  const wd = ((ctx.weekday % 7) + 7) % 7;
  f.add(`day:${WEEKDAY_KEY[wd]}`);
  if (wd === 0 || wd === 6) f.add('weekend');
  f.add(`hour:${hourKey(ctx.hour)}`);
  if (p.ask) {
    f.add('ask');
    if (p.ask.kind === 'mood') {
      f.add('mood_ask');
      f.add(`mood:${p.ask.id}`);
    } else {
      f.add(`ask:${p.ask.id}`);
    }
  } else {
    f.add('daily');
  }
  if ((p.passed ?? []).length) f.add('passed_any');
  // Viradas: as três (ou as não passadas) fora de 'down'; a da Cobra ainda fechada.
  const mains = ORACLES.filter((s) => !isPassed(p, s)).map((s) => cardAt(p, s)).filter((c): c is DialogueCard => !!c);
  if (mains.length && mains.every((c) => c.state !== 'down')) f.add('all_flipped');
  const cy = cardAt(p, 'cypher');
  if (cy && !isPassed(p, 'cypher') && cy.state === 'down') f.add('cypher_closed');
  return f;
}

/** Fatos de nota (veredito): 10, baixa (≤ 4), alta (≥ 8). */
function ratingFacts(rating: number | undefined): string[] {
  if (rating === undefined || rating === null || !Number.isFinite(rating)) return [];
  const out: string[] = [];
  if (rating === 10) out.push('r10');
  if (rating <= 4) out.push('r_low');
  if (rating >= 8) out.push('r_high');
  return out;
}

/**
 * As situações de troca (§3.5, `banter`) que a mesa cria, com a carta-assunto de cada
 * uma (os slots da troca saem dela).
 */
export function situationsOf(p: DialoguePayload): Map<string, DialogueCard> {
  const out = new Map<string, DialogueCard>();
  const live = (s: OracleId): DialogueCard | null => (isPassed(p, s) ? null : cardAt(p, s));
  const b = live('bogart');
  const f = live('fincher');
  const c = live('cypher');
  const lf = (x: DialogueCard | null) => x?.line_facts;
  if (f && lf(f)?.bw) out.set('fincher_bw', f);
  if (f && f.title.year != null && f.title.year < 1970) out.set('fincher_old', f);
  if (f && b && f.title.media_type === 'movie' && b.title.media_type === 'movie'
    && (f.title.runtime ?? 0) >= 150 && (b.title.runtime ?? 999) <= 100) out.set('fincher_long_bogart_short', f);
  if (f && b && lf(b)?.long && b.title.media_type === 'movie') out.set('bogart_long', b);
  if (c && f && c.title.year != null && f.title.year != null && c.title.year < f.title.year) out.set('cypher_older_than_fincher', c);
  if (c && lf(c)?.bomb) out.set('cypher_bomb', c);
  if (c && lf(c)?.hidden) out.set('cypher_hidden', c);
  if (c && lf(c)?.anime) out.set('cypher_anime', c);
  if (c && lf(c)?.br) out.set('cypher_br', c);
  if (c && lf(c)?.newmood) out.set('cypher_newmood', c);
  if (b && lf(b)?.p10hi && !lf(b)?.ressalva) out.set('bogart_p10hi', b);
  if (b && lf(b)?.sequel) out.set('bogart_sequel', b);
  if (b && lf(b)?.huge) out.set('bogart_huge', b);
  const trio = [b, f, c].filter((x): x is DialogueCard => !!x);
  for (let i = 0; i < trio.length; i++) {
    for (let j = i + 1; j < trio.length; j++) {
      const k = trio[i].title.countries?.[0];
      if (k && k !== 'US' && DE_PAIS.pt[k] && k === trio[j].title.countries?.[0]) out.set('same_country_two', trio[i]);
    }
  }
  if (b && f && c && b.title.mood === f.title.mood && f.title.mood === c.title.mood) out.set('three_moods_same', b);
  const series = trio.find((x) => x.title.media_type === 'tv' || lf(x)?.series);
  if (series) out.set('series_on_table', series);
  const e4 = cardAt(p, 'espelho');
  if (e4 && e4.kind === 'espelho4' && e4.title.oracle === 'bogart') out.set('espelho4_from_bogart', e4);
  if (e4 && e4.kind === 'espelho4' && e4.title.oracle === 'fincher') out.set('espelho4_from_fincher', e4);
  const wl = trio.find((x) => lf(x)?.watchlist);
  if (wl) out.set('watchlist_on_table', wl);
  return out;
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

interface SlotExtra {
  card?: DialogueCard | null;
  rating?: number;
  title?: string | null;
  weekday?: number | null;
  ask?: string | null;   // 'occ:chuva' (veredito de uma pergunta)
}

function occasionOf(askKey: string | null | undefined): string | null {
  if (!askKey) return null;
  const m = /^(?:occ|season):([a-z]+)$/.exec(askKey);
  return m ? m[1] : null;
}

export function slotValues(ctx: DirectorCtx, x: SlotExtra = {}): Record<string, string | undefined> {
  const p = ctx.payload;
  const L = ctx.lang;
  const v: Record<string, string | undefined> = {};
  v.estreante = estreante(p.me?.rated ?? 0, L);
  if (p.facts?.mood_rising) v.humor_subindo = MOOD_NAME[L][p.facts.mood_rising];
  if (p.facts?.weak_mood) v.humor_fraco = MOOD_NAME[L][p.facts.weak_mood];
  if (p.facts?.returning_days != null) v.dias = String(p.facts.returning_days);
  const counted = p.me?.persona_progress?.counted;
  if (counted != null && counted >= 0 && counted < 10) {
    v.contagem = String(counted);
    v.falta = String(10 - counted);
  }
  if (p.me?.persona) v.personagem = L === 'pt' ? p.me.persona.character_pt : p.me.persona.character_en;
  // Ocasião: a da pergunta na mesa, ou a da carta avaliada (veredito de ontem).
  const occ = occasionOf(x.ask) ?? (p.ask && p.ask.kind !== 'mood' ? p.ask.id : null);
  if (occ && OCCASION_NAME[L][occ]) v.ocasiao = OCCASION_NAME[L][occ];
  // Humor: o da pergunta de humor; senão, o da carta.
  if (p.ask?.kind === 'mood' && MOOD_NAME[L][p.ask.id]) v.humor = MOOD_NAME[L][p.ask.id];
  const card = x.card ?? null;
  if (card) {
    const t = card.title;
    const lf = card.line_facts;
    if (!v.humor && t?.mood && MOOD_NAME[L][t.mood]) v.humor = MOOD_NAME[L][t.mood];
    if (t?.media_type === 'movie' && t.runtime) v.duracao = formatRuntime(t.runtime);
    const dec = formatDecade(lf?.decade ?? (t?.year ? `${Math.floor(t.year / 10) * 10}s` : null), L);
    if (dec) v.decada = dec;
    if (t?.year) v.ano = String(t.year);
    if (lf?.hidden && t && t.vote_count > 0 && t.vote_count < 2000) {
      v.votos = formatInt(t.vote_count, L);
      v.votos_mais_um = formatInt(t.vote_count + 1, L);
    }
    if (lf?.bomb && lf.public != null) v.nota_publico = formatDecimal(lf.public, L);
    const k = t?.countries?.[0];
    if (k && DE_PAIS[L][k]) v.de_pais = DE_PAIS[L][k];
    if (t?.director) v.diretor = t.director.trim();
  }
  if (x.rating !== undefined && x.rating !== null && Number.isFinite(x.rating)) v.nota = String(x.rating);
  if (x.title) v.titulo = truncateTitle(x.title.trim());
  if (x.weekday != null && x.weekday >= 0 && x.weekday <= 6) v.dia_semana = WEEKDAY_NAME[L][x.weekday];
  return v;
}

// ---------------------------------------------------------------------------
// O Diretor
// ---------------------------------------------------------------------------

/** No modo reconhecimento, o Espelho só fala do que faz sentido com menos de 10 notas. */
const RECON_OK = /^(n0|n1_9|recon|almost|reveal|ask|ask:.+|mood_ask|mood:.+|returning|first_visit|event:.+|day:.+|hour:.+|weekend|daily)$/;

const FALLBACK_MIRROR: Record<Lang, string> = {
  pt: 'A mesa está posta. O espelho está olhando.',
  en: 'The table is set. The mirror is watching.',
};

export interface CreateOpts {
  /** null = só memória (testes); ausente = `localStorage`. */
  storage?: DialogueStorage | null;
  /** Só para testes: outro banco de falas. */
  bank?: DialogueBank;
}

export function createMesaDirector(opts: CreateOpts = {}): MesaDirector {
  const bank = opts.bank ?? DEFAULT_BANK;
  const storage: DialogueStorage = opts.storage === null ? memoryStorage() : opts.storage ?? browserStorage();
  const decks = new Map<string, Set<string>>();
  const lastDrawn = new Map<string, string>();
  const counters = new Map<string, number>();
  const cache = new Map<string, Spoken | Spoken[] | null>();
  const budget = new Map<string, number>();
  const sysCounters = new Map<string, number>();

  const drawKeyOf = (p: DialoguePayload): string => `${p.draw_id}|${p.ask?.key ?? ''}`;

  function env(ctx: DirectorCtx, facts: Set<string>, slots: Record<string, string | undefined>): ChooseEnv {
    return { bank, lang: ctx.lang, facts, slots, memory: storage.load(), today: ctx.payload.day, draw: drawKeyOf(ctx.payload), decks, lastDrawn };
  }

  function rngFor(ctx: DirectorCtx, beat: string, slot: string, salt = ''): () => number {
    const k = `${drawKeyOf(ctx.payload)}|${beat}|${slot}|${salt}`;
    const n = counters.get(k) ?? 0;
    counters.set(k, n + 1);
    return seededRng(hash32(ctx.payload.seed, ctx.payload.ask?.key ?? '', beat, slot, salt, n));
  }

  function commit(ctx: DirectorCtx, id: string, once?: 'week' | 'life'): void {
    storage.save(remember(storage.load(), id, ctx.payload.day, drawKeyOf(ctx.payload), once));
  }

  function spoken(c: Candidate): Spoken {
    return { id: c.line.id, who: c.line.who, text: c.text, ms: balloonMs(c.text) };
  }

  function takeBudget(ctx: DirectorCtx, n: number): boolean {
    const k = drawKeyOf(ctx.payload);
    const used = budget.get(k) ?? 0;
    if (used + n > DRAW_BALLOON_CAP) return false;
    budget.set(k, used + n);
    return true;
  }

  function memo<T extends Spoken | Spoken[] | null>(key: string, make: () => T): T {
    if (cache.has(key)) return cache.get(key) as T;
    const v = make();
    cache.set(key, v);
    return v;
  }

  /** Escolhe e registra uma fala solta. */
  function say(ctx: DirectorCtx, beat: string, who: Speaker, facts: Set<string>, slots: Record<string, string | undefined>,
    slotKey: string, opts: DrawOpts = {}, filter?: (l: MesaLine) => boolean): Spoken | null {
    const e = env(ctx, facts, slots);
    const cands = eligible(e, beat, who, filter);
    const pick = drawLine(e, cands, `${who}|${beat}`, rngFor(ctx, beat, slotKey), opts);
    if (!pick) return null;
    commit(ctx, pick.line.id, pick.line.once);
    return spoken(pick);
  }

  // --- veredito: a mesma fala ao vivo e no Livro (determinística por carta) ---
  function verdictPick(bankLang: Lang, cardId: string, oracle: OracleId, category: VerdictCategory, rating: number,
    nopred: boolean): Candidate | null {
    const facts = new Set<string>(ratingFacts(rating));
    facts.add(nopred ? 'nopred' : category);
    const e: ChooseEnv = { bank, lang: bankLang, facts, slots: { nota: String(rating) },
      memory: { v: 1, lru: [], once: [] }, today: '', draw: '', decks, lastDrawn };
    const cands = eligible(e, 'verdict', oracle, (l) => !(l.cond ?? []).some((c) => c === 'nopred') || nopred);
    return drawLine(e, cands, '', seededRng(hash32(cardId, 'verdict', oracle)), { tiered: true, pure: true });
  }

  const director: MesaDirector = {
    mirror(ctx) {
      const p = ctx.payload;
      const key = `mirror|${drawKeyOf(p)}|${ctx.lang}|${ctx.reveal ?? ''}`;
      const got = memo<Spoken | null>(key, () => {
        const facts = globalFacts(ctx);
        const slots = slotValues(ctx);
        const e = env(ctx, facts, slots);
        let cands = eligible(e, 'mirror', 'espelho');
        if (p.mode === 'recon') cands = cands.filter((c) => (c.line.cond ?? []).every((x) => x.startsWith('!') || RECON_OK.test(x)));
        const has = (c: Candidate, re: RegExp) => (c.line.cond ?? []).some((x) => re.test(x));
        // A cascata: a revelação que acabou de acontecer > a pergunta na mesa > os estados (P1) > o resto.
        const tiers: Candidate[][] = [
          cands.filter((c) => has(c, /^(persona_new|code_changed)$/) && (facts.has('persona_new') || ctx.reveal === 'changed')),
          p.ask ? cands.filter((c) => has(c, /^(ask|ask:.+|mood_ask|mood:.+)$/)) : [],
          cands.filter((c) => c.line.priority === 1),
          cands,
        ];
        const pool = tiers.find((t) => t.length) ?? [];
        const isAskTier = p.ask && pool === tiers[1];
        const pick = drawLine(e, pool, 'espelho|mirror', rngFor(ctx, 'mirror', 'espelho'),
          isAskTier ? { tiered: true } : { priorityWeight: (pr) => (pr === 1 ? 4 : pr === 2 ? 3 : 1) });
        if (!pick) return null;
        commit(ctx, pick.line.id, pick.line.once);
        return spoken(pick);
      });
      if (got) return got;
      const text = FALLBACK_MIRROR[ctx.lang];
      return { id: 'E000', who: 'espelho', text, ms: balloonMs(text) };
    },

    mirrorClose(ctx) {
      const p = ctx.payload;
      return memo(`mirrorClose|${drawKeyOf(p)}|${ctx.lang}`, () => {
        const facts = globalFacts(ctx);
        let filter: ((l: MesaLine) => boolean) | undefined;
        if (p.mode === 'recon') filter = (l) => (l.cond ?? []).every((x) => x.startsWith('!') || RECON_OK.test(x) || x === 'all_flipped' || x === 'cypher_closed');
        return say(ctx, 'mirrorClose', 'espelho', facts, slotValues(ctx), 'espelho', { tiered: true }, filter);
      });
    },

    opening(ctx) {
      const p = ctx.payload;
      return memo(`opening|${drawKeyOf(p)}|${ctx.lang}`, () => {
        const out: Spoken[] = [];
        // 1) A reação de ontem: o dono da carta avaliada mais recente (no máximo 1).
        const v = (p.verdicts ?? [])[0];
        if (v && ORACLES.includes(v.oracle)) {
          const facts = globalFacts(ctx);
          const nopred = v.category === 'near' && p.me?.pred_label === 'hidden';
          facts.add(nopred ? 'nopred' : v.category);
          for (const r of ratingFacts(v.rating)) facts.add(r);
          if (v.ask) facts.add('asked');
          const diff = dayDiff(v.shown_day, p.day);
          if (diff === 1) facts.add('yesterday_card');
          if (diff === 0) facts.add('today_card');
          const title = ctx.lang === 'pt' ? (v.title_pt ?? v.title_en) : (v.title_en ?? v.title_pt);
          const slots = slotValues(ctx, { rating: v.rating, title, weekday: weekdayOfIso(v.shown_day), ask: v.ask });
          const s = say(ctx, 'verdictLater', v.oracle, facts, slots, `${v.oracle}|${v.card_id}`, { tiered: true });
          if (s && takeBudget(ctx, 1)) out.push(s);
        }
        // 2) O anfitrião: o oráculo com a carta de maior p9 (o servidor manda em `host`).
        const host = p.host;
        if (host && ORACLES.includes(host) && !isPassed(p, host)) {
          const card = cardAt(p, host);
          const facts = globalFacts(ctx);
          for (const x of cardFacts(card)) facts.add(x);
          const slots = slotValues(ctx, { card });
          let s: Spoken | null = null;
          if (p.ask) {
            s = say(ctx, 'ask', host, facts, slots, host, { priorityWeight: (pr) => (pr === 1 ? 4 : pr === 2 ? 2 : 1) });
          } else if (p.mode === 'recon') {
            s = say(ctx, 'recon', host, facts, slots, host, { tiered: true });
          } else {
            s = say(ctx, 'open', host, facts, slots, host);
          }
          if (s && takeBudget(ctx, 1)) out.push(s);
        }
        return out;
      });
    },

    seal(ctx) {
      const p = ctx.payload;
      const key = `seal|${drawKeyOf(p)}`;
      // Uma dica de selo por tiragem: os toques seguintes só tremem a carta.
      if (cache.has(key)) return null;
      const facts = globalFacts(ctx);
      const s = say(ctx, 'seal', 'cypher', facts, slotValues(ctx), 'cypher', { tiered: true });
      const ok = s && takeBudget(ctx, 1) ? s : null;
      cache.set(key, ok);
      return ok;
    },

    sealOpen(ctx) {
      const p = ctx.payload;
      return memo(`sealOpen|${drawKeyOf(p)}|${ctx.lang}`, () => {
        const card = cardAt(p, 'cypher');
        const facts = globalFacts(ctx);
        for (const x of cardFacts(card)) facts.add(x);
        const s = say(ctx, 'sealOpen', 'cypher', facts, slotValues(ctx, { card }), 'cypher');
        return s && takeBudget(ctx, 1) ? s : null;
      });
    },

    allFlipped(ctx) {
      const p = ctx.payload;
      return memo(`allFlipped|${drawKeyOf(p)}|${ctx.lang}`, () => {
        if (hash32(p.seed, p.ask?.key ?? '', 'banter-gate') % 100 < BANTER_SILENT_PCT) return [];
        const sits = situationsOf(p);
        if (!sits.size) return [];
        const facts = globalFacts(ctx);
        for (const k of sits.keys()) facts.add(k);
        const e = env(ctx, facts, {});
        const subjectOf = (ex: MesaExchange): DialogueCard | null => {
          for (const c of ex.cond) if (sits.has(c)) return sits.get(c)!;
          return null;
        };
        const cands = eligibleExchanges(e, (ex) => slotValues(ctx, { card: subjectOf(ex) }))
          // quem passou a vez não entra na troca
          .filter((c) => c.ex.parts.every((pt) => !isPassed(p, pt.who)));
        const pick = drawExchange(e, cands, rngFor(ctx, 'banter', 'mesa'));
        if (!pick || !takeBudget(ctx, pick.texts.length)) return [];
        commit(ctx, pick.ex.id, pick.ex.once);
        const of = pick.texts.length;
        return pick.texts.map((text, i) => ({
          id: pick.ex.id, who: pick.ex.parts[i].who, text, ms: balloonMs(text),
          exchange: { id: pick.ex.id, part: i + 1, of },
        }));
      });
    },

    reaction(ctx, slot, kind, extra = {}) {
      const p = ctx.payload;
      // No veredito, a carta é a que recebeu a nota (pelo id, se veio), não a substituta.
      const byId = extra.cardId ? (p.cards ?? []).find((c) => c.id === extra.cardId) ?? null : null;
      const card = byId ?? cardAt(p, slot);
      const owner: OracleId | null = slot === 'espelho' ? (card?.title.oracle ?? null) : slot;
      if (!owner || !ORACLES.includes(owner)) return null;
      const cardId = extra.cardId ?? card?.id ?? `${p.draw_id}|${slot}`;
      const key = `reaction|${drawKeyOf(p)}|${ctx.lang}|${slot}|${kind}|${cardId}|${extra.category ?? ''}|${extra.rating ?? ''}|${extra.passReason ?? ''}`;
      return memo(key, () => {
        if (kind === 'verdict') {
          const category = extra.category ?? 'near';
          const rating = extra.rating ?? (category === 'ten' ? 10 : 0);
          const nopred = card?.pred?.label === 'hidden';
          const pick = verdictPick(ctx.lang, cardId, owner, category, rating, nopred);
          if (!pick) return null;
          commit(ctx, pick.line.id, pick.line.once);
          return spoken(pick);
        }
        const beat: Record<Exclude<ReactionKind, 'verdict'>, string> = {
          want: 'want', refuse: 'refuse', pass: 'pass', replace: 'replace', notSeen: 'notSeen',
        };
        const facts = globalFacts(ctx);
        for (const x of cardFacts(card)) facts.add(x);
        const slots = slotValues(ctx, { card });
        if (kind === 'pass') {
          const reason: PassReason = extra.passReason ?? 'refused';
          facts.add(reason);
          const s = say(ctx, 'pass', owner, facts, slots, owner, { tiered: true });
          if (s || reason === 'refused') return s;
          // sem fala própria para o motivo (ex.: 'colo' fora da Cobra): vale a de recusa
          facts.delete(reason);
          facts.add('refused');
          return say(ctx, 'pass', owner, facts, slots, owner, { tiered: true });
        }
        return say(ctx, beat[kind], owner, facts, slots, owner);
      });
    },

    verdictLineFor(cardId, oracle, category, lang, facts) {
      if (!ORACLES.includes(oracle as OracleId)) return '';
      const pick = verdictPick(lang, cardId, oracle as OracleId, category, facts.rating, !!facts.nopred);
      return pick ? pick.text : '';
    },

    system(kind: SystemKind, lang: Lang) {
      const lines = bank.lines.filter((l) => l.beat === 'system' && (l.cond ?? []).includes(kind));
      const n = sysCounters.get(kind) ?? 0;
      sysCounters.set(kind, n + 1);
      const line = lines.length ? lines[n % lines.length] : null;
      const text = line ? (lang === 'pt' ? line.pt : (bank.en[line.id] as string | undefined) ?? line.pt) : FALLBACK_MIRROR[lang];
      return { id: line?.id ?? 'E000', who: 'espelho', text, ms: balloonMs(text) };
    },
  };
  return director;
}

/** Usado pelos testes e pelo lint: quantas condições específicas a fala tem. */
export { specificity };
