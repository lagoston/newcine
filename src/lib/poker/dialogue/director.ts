/**
 * Diretor de falas (SPEC §6 e §8, pacote B).
 *
 * Recebe os `PublicEvent` na ordem em que a interface os mostra, decide se alguém fala,
 * quem e o quê, e entrega um balão por vez em `next(now)`. Nunca muda o jogo e nunca vê
 * nada privado: na partida valendo ele roda no celular com os eventos do servidor.
 *
 * Regras (§6.3): orçamento por fichas, ≤ 1 momento não-P1 por mão, ≥ 40% das mãos em
 * silêncio, gaps global e por personagem, fila de 2 com espera de 4 s, P1 substitui a
 * fila, trocas só entre mãos ou depois que a pessoa desistiu, na vez da pessoa só falas
 * curtas, silêncio do Sapo depois de `calado`, nada durante as cartas de um all-in.
 *
 * O banco vem junto (lines.pt/lines.en/quips): este módulo já é carregado sob demanda pela
 * interface (import dinâmico), então o banco não pesa na abertura do app.
 */
import type { PlayerId, PublicEvent, RivalId } from '../types.ts';
import { Budget, BUDGET } from './budget.ts';
import { EXCHANGES, LINES } from './lines.pt.ts';
import { EN } from './lines.en.ts';
import { QUIP_LINES, QUIP_PACKS } from './quips.ts';
import { balloonMs, renderText, SHORT_CHARS } from './render.ts';
import type { Picked, PickedExchange, SelectEnv } from './select.ts';
import { drawFromDeck, eligibleLines, exchangeIsNew, pickExchange, pickLine, textOf, varsFor } from './select.ts';
import type { Signal } from './signals.ts';
import { RIVALS, SignalTracker } from './signals.ts';
import { browserStorage, freshSession, memoryStorage, remember } from './storage.ts';
import type {
  DialogueBank, DialogueMemory, DialogueStorage, Director, DirectorMoment, DirectorOptions, Emote, Exchange, Line,
  RecapInfo, SpeechItem, TableContext, Trigger,
} from './types.ts';

export const DEFAULT_BANK: DialogueBank = {
  lines: [...LINES, ...QUIP_LINES],
  exchanges: EXCHANGES,
  en: EN,
  quipPacks: QUIP_PACKS,
};

/** Quando há troca e fala solta para o mesmo sinal, a chance de ser a troca. */
const EXCHANGE_CHANCE: Partial<Record<Trigger, number>> = {
  banter: 0.75, readPlayer: 0.5, playerStreak: 0.5, badBeatAgainstMe: 0.5, potWon: 0.6, potLostToPlayer: 0.6,
  playerBluffShown: 0.5, tiltStart: 0.6, eliminated: 0.5, bountySteal: 0.6, rankUp: 1, secretTell: 1,
  eliminatesPlayer: 1, firstVisit: 1, matchStart: 0.35, sapoLoan: 0.35, bountyIntro: 0.35,
};

/** Quanto um balão de troca espera a vez da pessoa fechar antes de a troca cair. */
const HOLD_MAX_MS = 20000;

interface Part { speaker: RivalId | 'human'; text: string; lineId: string; emote?: Emote }

interface QItem {
  kind: 'line' | 'exchange';
  priority: 1 | 2 | 3;
  parts: Part[];
  exchangeId?: string;
  between?: Exchange['between'];
  enqueuedAt: number | null;
  hand: number;
  /** inHand: cai quando a mão acaba; post: cai quando a próxima mão tem a primeira ação; keep: não cai. */
  scope: 'inHand' | 'post' | 'keep';
  reserved: { cost: number; balloons: number; free: boolean } | null;
  scene: NonNullable<SpeechItem['scene']>;
  /** O que marcar quando tocar. */
  ids: string[];
  story?: string;
  capKey?: string;
  trigger: Trigger;
  signal?: Signal;
  role: NonNullable<SpeechItem['debug']>['role'];
  farewell?: boolean;
}

interface Active { item: QItem; index: number; nextAt: number; heldSince: number | null }

function emptyCtx(o: DirectorOptions): TableContext {
  return {
    mode: o.mode, lang: o.lang, title: 'figurante', lifetimeMatches: o.lifetimeMatches, matchInSession: o.matchInSession,
    returning: false, localHour: 12, story: { ...o.story }, speed: o.speed, talk: o.talk,
    view: { mode: o.mode, handNumber: 0, level: { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: null }, status: 'running',
      seats: [], board: [], pots: [], potTotal: 0, toActId: null, legal: null, prize: null, loan: 0, places: {} },
    reducedMotion: o.reducedMotion,
  };
}

class DialogueDirector implements Director {
  private opts: DirectorOptions;
  private bank: DialogueBank;
  private rng: () => number;
  private storage: DialogueStorage;
  private mem: DialogueMemory;
  private ctx: TableContext;
  private tracker: SignalTracker;
  private budget: Budget;
  private env: SelectEnv;
  private queue: QItem[] = [];
  private active: Active | null = null;
  private now = 0;
  private busyUntil = 0;
  private lastStartAt = -Infinity;
  private lastStartBy = new Map<string, number>();
  private humanTurnOpen = false;
  private drawerOpen = false;
  private idleFired = 0;
  private quipHand = -1;
  private spokeInHand = new Set<number>();
  private lastBanterHand = 0;
  private banterDue: number;
  private tipHand = -10;
  private tipPartA = new Map<string, number>();
  private pendingTableWinner = false;
  private creditsDone = false;
  private opened = false;

  constructor(opts: DirectorOptions) {
    this.opts = opts;
    this.bank = opts.bank ?? DEFAULT_BANK;
    this.rng = opts.rng ?? Math.random;
    this.storage = opts.storage === null ? memoryStorage() : opts.storage ?? browserStorage();
    let mem: DialogueMemory;
    try {
      mem = this.storage.load();
    } catch {
      mem = { v: 1, lru: [], session: { at: 0, ids: [] } };
    }
    this.mem = freshSession(mem, this.clock(), opts.matchInSession <= 1);
    this.ctx = emptyCtx(opts);
    this.tracker = new SignalTracker(this.rng);
    this.budget = new Budget(opts.matchInSession >= BUDGET.halfFromConsecutiveMatch);
    this.banterDue = 5 + Math.floor(this.rng() * 3);
    this.env = {
      bank: this.bank, ctx: this.ctx, tracker: this.tracker, rng: this.rng, now: this.clock(),
      playedMatch: new Set(), sessionIds: new Set(this.mem.session.ids), lru: new Map(this.mem.lru),
      touched: new Set(), caps: new Map(), decks: new Map(), lastDrawn: new Map(),
    };
  }

  private clock(): number {
    try {
      return this.storage.now();
    } catch {
      return this.now;
    }
  }

  private get tutorial(): boolean {
    return this.ctx.mode === 'tutorial' || this.opts.mode === 'tutorial';
  }

  // =========================================================================
  // Entradas
  // =========================================================================

  onEvent(e: PublicEvent, ctx: TableContext): void {
    this.ctx = ctx;
    this.env.ctx = ctx;
    this.env.now = this.clock();
    if (this.tutorial) {
      // No treino as falas vêm só dos beats; o rastreador segue para o silêncio do all-in.
      this.tracker.process(e, ctx);
      return;
    }
    const before = this.tracker.phase;
    const signals = this.tracker.process(e, ctx);
    switch (e.t) {
      case 'matchStarted':
        this.openMatch(e, ctx);
        return;
      case 'levelUp':
      case 'headsUp':
        this.budget.onHand(e.handNumber);
        for (const s of signals) s.hand = e.handNumber;
        break;
      case 'handStarted':
        this.budget.onHand(e.handNumber);
        this.quipHand = -1;
        break;
      case 'action':
        if (before !== 'inHand') this.dropScope('post');
        if (e.playerId === 'bogart' && e.cue === 'calado') this.dropSpeaker('bogart');
        break;
      case 'handComplete':
        this.dropScope('inHand');
        break;
      case 'prizeMoved':
        // quem eliminou e herdou o prêmio fala da herança, não só da eliminação
        this.dropQueued((q) => q.trigger === 'eliminatesOracle' && q.parts[0]?.speaker === e.toId);
        break;
      case 'prizeCaptured':
        this.dropQueued((q) => q.trigger === 'eliminated' && q.parts[0]?.speaker === this.tracker.lastHolderBeforeCapture);
        break;
      case 'matchEnded':
        this.handleSignals(signals);
        this.credits(e, ctx);
        return;
      default:
        break;
    }
    this.handleSignals(signals);
    if (e.t === 'handComplete') this.maybeBanter(e.handNumber);
  }

  onHumanTurn(open: boolean): void {
    this.humanTurnOpen = open;
    if (open) this.idleFired = 0;
  }

  onIdleTick(msParada: number): void {
    if (!this.humanTurnOpen || this.drawerOpen || this.tutorial || this.ctx.lifetimeMatches < 3) return;
    const at = this.idleFired === 0 ? 25000 : this.idleFired === 1 ? 60000 : Infinity;
    if (msParada < at) return;
    this.idleFired++;
    const sig: Signal = {
      trigger: 'idle', priority: 3, chance: 1, variant: [this.idleFired === 1 ? 't25' : 't60'], hand: this.tracker.handNumber,
      eventI: this.tracker.eventI, phase: 'inHand', short: true, noExchange: true,
    };
    this.tryEnqueue(sig);
  }

  onDrawer(open: boolean): void {
    this.drawerOpen = open;
  }

  onQuip(quipId: string, target: RivalId): void {
    if (this.tutorial) return;
    const h = this.tracker.handNumber;
    if (this.quipHand === h && h > 0) return;   // uma por mão
    const pack = this.bank.quipPacks[this.opts.quipPack ?? 'quips-padrao'] ?? this.bank.quipPacks['quips-padrao'];
    const q = pack?.quips.find((x) => x.id === quipId);
    if (!q) return;
    this.quipHand = h;
    const lang = this.ctx.lang;
    const items: QItem[] = [this.makeItem({
      kind: 'line', priority: 1, parts: [{ speaker: 'human', text: lang === 'pt' ? q.pt : q.en, lineId: q.id }],
      scene: 'quip', scope: 'keep', trigger: 'quipAnswer', role: 'quip', ids: [], hand: h,
    })];
    const state = this.tracker.speakerState(target);
    const inHand = this.tracker.phase === 'inHand';
    if (target === 'bogart' && this.tracker.sapoSilent) {
      // com `calado` o Sapo responde só com o selo "…"
      items.push(this.makeItem({
        kind: 'line', priority: 1, parts: [{ speaker: 'bogart', text: '…', lineId: 'quip.silent', emote: 'dots' }],
        scene: 'quip', scope: 'keep', trigger: 'quipAnswer', role: 'quip', ids: [], hand: h,
      }));
    } else if (!(target === 'fincher' && inHand && state === 'confiante')) {
      const sig: Signal = { trigger: 'quipAnswer', priority: 1, chance: 1, variant: [quipId], speakers: [target], hand: h,
        eventI: this.tracker.eventI, phase: inHand ? 'inHand' : 'post' };
      const cands = eligibleLines(this.env, sig, target, true, this.bank.lines);
      const pick = drawFromDeck(this.env, cands, 'quipAnswer');
      if (pick) {
        items.push(this.makeItem({
          kind: 'line', priority: 1, parts: [{ speaker: target, text: pick.text, lineId: pick.line.id, emote: pick.line.emote }],
          scene: 'quip', scope: 'keep', trigger: 'quipAnswer', role: 'quip', ids: [pick.line.id], hand: h,
        }));
      }
    }
    // A Réplica é um gesto da pessoa: passa na frente (depois de uma troca já começada).
    this.queue.unshift(...items);
  }

  onTutorialBeat(lineIds: string[]): void {
    for (const id of lineIds.slice(0, 3)) {
      const ex = this.bank.exchanges.find((x) => x.id === id);
      if (ex) {
        const texts = ex.parts.map((p, i) => textOf(this.bank, ex.id, p.pt, this.ctx.lang, i));
        if (texts.some((t) => t === null)) continue;
        this.queue.push(this.makeItem({
          kind: 'exchange', priority: 1, exchangeId: ex.id, between: 'any', scene: 'tutorial', scope: 'keep', trigger: 'tutorial',
          role: 'tutorial', ids: [ex.id], hand: this.tracker.handNumber,
          parts: ex.parts.map((p, i) => ({ speaker: p.speaker, text: this.render(texts[i]!, p.speaker) ?? texts[i]!, lineId: `${ex.id}.${i + 1}` })),
        }));
        continue;
      }
      const line = this.bank.lines.find((l) => l.id === id);
      if (!line) continue;
      if (line.requires?.storyNot && this.hasStory(line.requires.storyNot)) continue;
      const raw = textOf(this.bank, line.id, line.pt, this.ctx.lang);
      const text = raw === null ? null : this.render(raw, line.speaker);
      if (text === null) continue;
      this.queue.push(this.makeItem({
        kind: 'line', priority: 1, parts: [{ speaker: line.speaker, text, lineId: line.id, emote: line.emote }],
        scene: 'tutorial', scope: 'keep', trigger: 'tutorial', role: 'tutorial', ids: [line.id], story: line.story,
        hand: this.tracker.handNumber,
      }));
    }
  }

  onMoment(m: DirectorMoment): void {
    if (this.tutorial) return;
    const base = { hand: this.tracker.handNumber, eventI: this.tracker.eventI, phase: 'credits' as const, chance: 1 };
    switch (m.t) {
      case 'rankUp':
        this.enqueueP1({ ...base, trigger: 'rankUp', priority: 1, variant: [m.title] }, 'credits');
        break;
      case 'tableWinner':
        if (!this.pendingTableWinner || !RIVALS.includes(m.winnerId)) return;
        this.pendingTableWinner = false;
        this.enqueueP1({ ...base, trigger: 'tableWinner', priority: 1, variant: [], actorId: m.winnerId, speakers: [m.winnerId] }, 'credits');
        break;
      case 'rematch':
        this.enqueueP1({ ...base, trigger: 'rematch', priority: 1, variant: [], noExchange: true }, 'credits');
        break;
      case 'playerLeaves':
        this.enqueueP1({ ...base, trigger: 'playerLeaves', priority: 1, variant: [], noExchange: true }, 'credits');
        break;
      case 'intervalReturn':
        this.enqueueP1({ ...base, trigger: 'intervalReturn', priority: 1, variant: [], noExchange: true, phase: 'opening' }, 'opening');
        break;
    }
  }

  cardLine(kind: 'recap' | 'intervalInvite', ctx: TableContext, info?: RecapInfo): SpeechItem | null {
    this.ctx = ctx;
    this.env.ctx = ctx;
    const variant: string[] = [];
    const extra: { lider?: PlayerId; portador?: PlayerId; cacife?: number; maoN?: number } = {};
    if (kind === 'recap' && info) {
      const bb = info.bb || 50;
      const stacks = Object.entries(info.stacks).filter(([, v]) => (v ?? 0) > 0) as [PlayerId, number][];
      stacks.sort((a, b) => b[1] - a[1]);
      const mine = info.stacks.human ?? 0;
      extra.maoN = info.handNumber;
      extra.cacife = mine;
      if (ctx.mode === 'bounty' && info.holderId && RIVALS.includes(info.holderId)) {
        variant.push('valendo');
        extra.portador = info.holderId;
      }
      if (info.someoneOut) variant.push('caiu');
      if (stacks[0]?.[0] === 'human') variant.push('lider');
      else if (stacks[0]) {
        variant.push('oraculoLider');
        extra.lider = stacks[0][0];
      }
      if (mine > 0 && mine <= 10 * bb) variant.push('curto');
    }
    // a variante mais específica que tiver fala vence; senão a geral
    const order = kind === 'recap' ? ['valendo', 'caiu', 'lider', 'curto', 'oraculoLider'] : [];
    let best: { line: Line; speaker: RivalId; text: string } | null = null;
    for (const v of [...order.filter((o) => variant.includes(o)), null]) {
      const options: { line: Line; speaker: RivalId; text: string }[] = [];
      for (const line of this.bank.lines) {
        if (line.on !== kind) continue;
        if (v === null ? (line.variant?.length ?? 0) > 0 : !line.variant?.includes(v)) continue;
        if (line.requires?.storyNot && this.hasStory(line.requires.storyNot)) continue;
        const raw = textOf(this.bank, line.id, line.pt, ctx.lang);
        const text = raw === null ? null : this.render(raw, line.speaker, extra);
        if (text) options.push({ line, speaker: line.speaker, text });
      }
      const freshOnes = options.filter((o) => !this.env.lru.has(o.line.id) || this.now - (this.env.lru.get(o.line.id) ?? 0) > 48 * 3600 * 1000);
      const pool = freshOnes.length ? freshOnes : options;
      if (pool.length) {
        best = pool[Math.floor(this.rng() * pool.length)];
        break;
      }
    }
    if (!best) return null;
    this.recordPlayed(best.line.id, best.line.story);
    return {
      lineId: best.line.id, speaker: best.speaker, text: best.text, priority: 1, emote: best.line.emote,
      durationMs: balloonMs(best.text, { speed: ctx.speed }), curta: best.text.length <= SHORT_CHARS, scene: 'card',
    };
  }

  next(nowMs: number): SpeechItem | null {
    this.now = nowMs;
    this.env.now = nowMs;
    for (const q of this.queue) if (q.enqueuedAt === null) q.enqueuedAt = nowMs;
    if (this.tracker.runoutSilence) return null;   // cartas do all-in virando: silêncio
    if (nowMs < this.busyUntil) return null;
    if (this.active) {
      const a = this.active;
      if (nowMs < a.nextAt) return null;
      // Troca começada entre mãos que alcança a vez da pessoa: balão longo espera a vez
      // fechar (continua atômica: nada entra no meio); parada demais, o resto cai.
      const part = a.item.parts[a.index];
      const free = a.item.scene === 'tutorial' || a.item.scene === 'farewell' || a.item.scene === 'quip';
      // O mesmo vale para o Sapo que deu `calado` na mão que começou no meio da troca.
      const sapoHeld = part.speaker === 'bogart' && this.tracker.sapoSilent && a.item.scene !== 'tutorial';
      if ((this.humanTurnOpen && !free && part.text.length > SHORT_CHARS) || sapoHeld) {
        if (a.heldSince === null) a.heldSince = nowMs;
        if (nowMs - a.heldSince > HOLD_MAX_MS) this.active = null;
        return null;
      }
      return this.emitPart(a.item, a.index);
    }
    this.expire(nowMs);
    const start = this.pickStartable(nowMs);
    if (!start) return null;
    this.queue.splice(this.queue.indexOf(start), 1);
    return this.emitPart(start, 0);
  }

  skip(): void {
    this.busyUntil = 0;
    if (this.active?.item.farewell) this.active = null;   // a despedida pula inteira
    else if (this.active) this.active.nextAt = 0;
  }

  storyTouched(): string[] {
    return [...this.env.touched];
  }

  // =========================================================================
  // Fila
  // =========================================================================

  private makeItem(p: Omit<QItem, 'enqueuedAt' | 'reserved'> & { reserved?: QItem['reserved'] }): QItem {
    return { reserved: null, ...p, enqueuedAt: null };
  }

  private refund(q: QItem): void {
    if (q.reserved) this.budget.refund(q.hand, q.reserved.cost, q.reserved.balloons, q.reserved.free);
    q.reserved = null;
  }

  private dropQueued(pred: (q: QItem) => boolean): void {
    const keep: QItem[] = [];
    for (const q of this.queue) {
      if (pred(q)) this.refund(q);
      else keep.push(q);
    }
    this.queue = keep;
  }

  /** 'inHand': a mão acabou (cai tudo que era dela); 'post': a próxima mão começou (P1 continua). */
  private dropScope(scope: QItem['scope']): void {
    this.dropQueued((q) => q.scope === scope && (scope === 'inHand' || q.priority !== 1));
  }

  private dropSpeaker(s: RivalId): void {
    this.dropQueued((q) => q.scope === 'inHand' && q.parts.some((p) => p.speaker === s));
  }

  private expire(now: number): void {
    this.dropQueued((q) => {
      if (q.scope === 'keep' || q.enqueuedAt === null) return false;
      const wait = q.priority === 1 ? BUDGET.waitP1Ms : BUDGET.waitMs;
      return now - q.enqueuedAt > wait;
    });
  }

  private canStart(q: QItem, now: number): boolean {
    const t = this.tracker;
    const first = q.parts[0];
    if (this.humanTurnOpen && q.scene !== 'tutorial') {
      // na vez da pessoa: só fala curta, de um oráculo só, nunca troca. (No treino não há
      // relógio: a interface só abre a vez depois dos beats, e a dica já é curta.)
      if (q.kind === 'exchange') return false;
      if (first.text.length > SHORT_CHARS && q.scene !== 'quip') return false;
    }
    if (q.kind === 'exchange') {
      const b = q.between ?? 'hands';
      if (b === 'hands' && t.phase === 'inHand') return false;
      if (b === 'afterHumanFold' && t.phase === 'inHand' && !t.humanFolded) return false;
    }
    // Sapo de `calado`: nenhum balão dele até a mão acabar (só o selo "…" da Réplica)
    if (t.sapoSilent && q.scene !== 'tutorial' && q.parts.some((p) => p.speaker === 'bogart' && p.lineId !== 'quip.silent')) return false;
    if (q.priority !== 1) {
      if (now - this.lastStartAt < BUDGET.globalGapMs) return false;
      if (q.kind === 'line' && now - (this.lastStartBy.get(String(first.speaker)) ?? -Infinity) < BUDGET.speakerGapMs) return false;
    }
    return true;
  }

  private pickStartable(now: number): QItem | null {
    // P1 sai primeiro e em ordem (o segundo balão da abertura espera o primeiro); enquanto
    // houver P1 esperando, nada de prioridade menor passa na frente.
    const p1 = this.queue.find((q) => q.priority === 1);
    if (p1) return this.canStart(p1, now) ? p1 : null;
    for (const prio of [2, 3]) {
      for (const q of this.queue) if (q.priority === prio && this.canStart(q, now)) return q;
    }
    return null;
  }

  private emitPart(q: QItem, index: number): SpeechItem {
    const part = q.parts[index];
    const now = this.now;
    if (index === 0) {
      for (const id of q.ids) this.recordPlayed(id, undefined);
      if (q.story) this.env.touched.add(q.story);
      if (q.capKey) this.env.caps.set(q.capKey, (this.env.caps.get(q.capKey) ?? 0) + 1);
      if (q.priority === 1 && q.hand > 0 && q.scene === 'table') this.budget.markP1(q.hand);
      if (q.hand > 0) this.spokeInHand.add(q.hand);
      this.lastStartAt = now;
    }
    if (q.kind === 'line') this.lastStartBy.set(String(part.speaker), now);
    const durationMs = balloonMs(part.text, { farewell: q.farewell, speed: this.ctx.speed });
    this.busyUntil = now + durationMs;
    if (index + 1 < q.parts.length) this.active = { item: q, index: index + 1, nextAt: now + durationMs, heldSince: null };
    else this.active = null;
    const item: SpeechItem = {
      lineId: part.lineId, speaker: part.speaker, text: part.text, priority: q.priority, durationMs,
      curta: part.text.length <= SHORT_CHARS, scene: q.scene,
    };
    if (part.emote) item.emote = part.emote;
    if (q.kind === 'exchange') item.exchange = { id: q.exchangeId ?? part.lineId, part: index + 1, of: q.parts.length };
    if (this.opts.debug) {
      item.debug = { trigger: q.trigger, role: q.role, cue: q.signal?.cue, hand: q.hand, eventI: q.signal?.eventI ?? -1,
        actorId: q.signal?.actorId };
    }
    return item;
  }

  private recordPlayed(id: string, story: string | undefined): void {
    this.env.playedMatch.add(id);
    this.env.sessionIds.add(id);
    const at = this.clock();
    this.env.lru.set(id, at);
    if (story) this.env.touched.add(story);
    this.mem = remember(this.mem, id, at);
    try {
      this.storage.save(this.mem);
    } catch {
      // sem armazenamento
    }
  }

  private hasStory(key: string): boolean {
    return this.env.touched.has(key) || !!this.ctx.story[key];
  }

  private render(raw: string, speaker: RivalId | 'human', extra: Parameters<typeof varsFor>[3] = {}): string | null {
    return renderText(raw, varsFor(this.env, speaker, undefined, extra));
  }

  // =========================================================================
  // Sinais → momentos
  // =========================================================================

  private modeAllows(priority: 1 | 2 | 3): boolean {
    const { talk, speed } = this.ctx;
    if (talk === 'none') return false;
    if (speed === 'turbo' && priority !== 1) return false;
    if (talk === 'important' && priority === 3) return false;
    return true;
  }

  private handleSignals(signals: Signal[]): void {
    const p1 = signals.filter((s) => s.priority === 1);
    for (const s of p1) {
      if (s.tip) this.enqueueTip(s);
      else this.enqueueP1(s, s.scene === 'farewell' ? 'farewell' : 'table');
    }
    const rest = signals.filter((s) => s.priority !== 1 && this.rng() < s.chance && this.modeAllows(s.priority));
    // P2 antes de P3; dentro da mesma prioridade, sorteio
    const order = rest.map((s) => ({ s, k: s.priority * 10 + this.rng() })).sort((a, b) => a.k - b.k).map((x) => x.s);
    for (const s of order) if (this.tryEnqueue(s)) break;
  }

  /** "Só depois de uma mão em silêncio" (deal, flop). */
  private prevHandSilent(h: number): boolean {
    return h > 1 && !this.spokeInHand.has(h - 1) && !this.budget.hadMoment(h - 1);
  }

  /** Tenta virar um momento não-P1 (orçamento, fila, papel e baralho). */
  private tryEnqueue(sig: Signal): boolean {
    if (!this.modeAllows(sig.priority)) return false;
    if ((sig.trigger === 'deal' || sig.trigger === 'flop') && !this.prevHandSilent(sig.hand)) return false;
    const needShort = this.humanTurnOpen || !!sig.short;
    // troca?
    if (!sig.noExchange && !needShort && sig.phase !== 'inHand') {
      const ex = pickExchange(this.env, sig, (x) => x.priority !== 1);
      const lineAlt = pickLine(this.env, { ...sig }, { needShort });
      const chance = EXCHANGE_CHANCE[sig.trigger] ?? 0.5;
      if (ex && (!lineAlt || this.rng() < chance)) {
        if (this.enqueueExchange(ex, sig, false)) {
          if (lineAlt) this.unDraw(lineAlt);
          return true;
        }
      }
      if (lineAlt) return this.enqueueLine(lineAlt, sig, needShort);
      return false;
    }
    const pick = pickLine(this.env, sig, { needShort });
    if (!pick) return false;
    return this.enqueueLine(pick, sig, needShort);
  }

  /** Devolve ao baralho uma fala sorteada e não usada. */
  private unDraw(p: Picked): void {
    this.env.decks.get(`${p.speaker}|${p.line.on}`)?.delete(p.line.id);
  }

  private enqueueLine(pick: Picked, sig: Signal, needShort: boolean): boolean {
    if (needShort && pick.text.length > SHORT_CHARS) return false;
    const h = sig.hand;
    if (!this.budget.canReserve(h, 1, 1)) {
      this.unDraw(pick);
      return false;
    }
    // a fila guarda no máximo 2 (não-P1): sai a mais velha
    const waiting = this.queue.filter((q) => q.priority !== 1);
    if (waiting.length >= BUDGET.queueMax) this.dropQueued((q) => q === waiting[0]);
    this.budget.reserve(h, 1, 1);
    this.queue.push(this.makeItem({
      kind: 'line', priority: Math.min(sig.priority, pick.line.priority) as 1 | 2 | 3,
      parts: [{ speaker: pick.speaker, text: pick.text, lineId: pick.line.id, emote: pick.line.emote }],
      scene: 'table', scope: sig.phase === 'inHand' ? 'inHand' : 'post', trigger: sig.trigger, signal: sig,
      role: pick.line.role, ids: [pick.line.id], story: pick.line.story, capKey: pick.capKey, hand: h,
      reserved: { cost: 1, balloons: 1, free: false },
    }));
    if (pick.line.once === 'match' || pick.line.once === 'session') this.env.playedMatch.add(pick.line.id);
    return true;
  }

  private enqueueExchange(x: PickedExchange, sig: Signal, p1: boolean): boolean {
    const h = sig.hand;
    const ex = x.ex;
    // eliminado participa como plateia, com 30% de chance (fora de P1)
    if (!p1 && ex.parts.some((p) => this.tracker.isOut(p.speaker)) && this.rng() >= 0.3) return false;
    if (!p1) {
      const free = this.budget.halfMode && exchangeIsNew(this.env, ex);
      if (!this.budget.canReserve(h, 2, ex.parts.length, free)) return false;
      const waiting = this.queue.filter((q) => q.priority !== 1);
      if (waiting.length >= BUDGET.queueMax) this.dropQueued((q) => q === waiting[0]);
      this.budget.reserve(h, 2, ex.parts.length, free);
      this.queue.push(this.makeItem({
        kind: 'exchange', priority: sig.priority, exchangeId: ex.id, between: ex.between, scene: 'table',
        scope: sig.phase === 'inHand' ? 'inHand' : 'post', trigger: sig.trigger, signal: sig, role: 'exchange',
        ids: [ex.id], story: ex.story, hand: h, reserved: { cost: 2, balloons: ex.parts.length, free },
        parts: ex.parts.map((p, i) => ({ speaker: p.speaker, text: x.texts[i], lineId: `${ex.id}.${i + 1}` })),
      }));
    } else {
      this.queue.push(this.makeItem({
        kind: 'exchange', priority: 1, exchangeId: ex.id, between: ex.between, scene: sig.scene ?? 'table',
        scope: 'post', trigger: sig.trigger, signal: sig, role: 'exchange', ids: [ex.id], story: ex.story, hand: h,
        farewell: ex.farewell,
        parts: ex.parts.map((p, i) => ({ speaker: p.speaker, text: x.texts[i], lineId: `${ex.id}.${i + 1}` })),
      }));
    }
    if (ex.once) this.env.playedMatch.add(ex.id);
    return true;
  }

  /** P1: fura o orçamento e substitui o que estiver esperando (não-P1). */
  private enqueueP1(sig: Signal, scene: NonNullable<SpeechItem['scene']>): boolean {
    if (this.ctx.talk === 'none') return false;
    this.dropQueued((q) => q.priority !== 1);
    const s: Signal = { ...sig, scene: scene === 'farewell' ? 'farewell' : sig.scene };
    const exChance = EXCHANGE_CHANCE[sig.trigger] ?? 0.5;
    let ex: PickedExchange | null = null;
    if (!sig.noExchange) ex = pickExchange(this.env, s, (x) => x.priority === 1 || scene !== 'table');
    const line = sig.trigger === 'eliminatesPlayer' || sig.trigger === 'firstVisit' ? null : pickLine(this.env, s);
    if (ex && (!line || this.rng() < exChance)) {
      if (line) this.unDraw(line);
      const ok = this.enqueueExchange(ex, s, true);
      if (ok) {
        const last = this.queue[this.queue.length - 1];
        last.scene = scene;
        last.scope = scene === 'table' ? 'post' : 'keep';
        if (scene === 'farewell') last.farewell = true;
      }
      return ok;
    }
    if (!line) return false;
    this.queue.push(this.makeItem({
      kind: 'line', priority: 1, parts: [{ speaker: line.speaker, text: line.text, lineId: line.line.id, emote: line.line.emote }],
      scene, scope: scene === 'table' ? 'post' : 'keep', trigger: sig.trigger, signal: sig, role: line.line.role,
      ids: [line.line.id], story: line.line.story, hand: sig.hand,
    }));
    return true;
  }

  /** Dica de contexto do Raposo (§2.9): uma vez na vida cada, no máximo uma por mão. */
  private enqueueTip(sig: Signal): void {
    const tip = sig.tip!;
    const key = `tip.${tip.kind}`;
    const partB = tip.part === 'b';
    if (!partB) {
      // uma dica por vez, com pelo menos uma mão de folga entre elas
      if (this.hasStory(key) || sig.hand - this.tipHand < 2) return;
    } else if (this.tipPartA.get(tip.kind) !== sig.hand) {
      return;   // a parte (a) não entrou nesta mão: a (b) não faz sentido sozinha
    }
    if (this.ctx.talk === 'none') return;
    const want = tip.part ? [tip.kind, tip.part] : [tip.kind];
    const cands = this.bank.lines.filter((l) => l.on === 'contextTip' && (l.variant ?? []).length === want.length
      && want.every((v) => l.variant!.includes(v)));
    const lines: Line[] = tip.part ? cands : this.bank.lines.filter((l) => l.on === 'contextTip' && l.variant?.[0] === tip.kind);
    const queue: QItem[] = [];
    for (const line of lines.sort((a, b) => a.id.localeCompare(b.id))) {
      const raw = textOf(this.bank, line.id, line.pt, this.ctx.lang);
      const text = raw === null ? null : this.render(raw, line.speaker);
      if (text === null) continue;
      if (sig.short && text.length > SHORT_CHARS) continue;
      queue.push(this.makeItem({
        kind: 'line', priority: 1, parts: [{ speaker: line.speaker, text, lineId: line.id, emote: line.emote }],
        scene: 'table', scope: sig.phase === 'inHand' ? 'inHand' : 'post', trigger: 'contextTip', signal: sig,
        role: line.role, ids: [line.id], story: key, hand: sig.hand,
      }));
    }
    if (!queue.length) return;
    if (!partB) {
      this.tipHand = sig.hand;
      this.env.touched.add(key);   // marca já: vale para a partida inteira
      if (tip.part === 'a') this.tipPartA.set(tip.kind, sig.hand);
    }
    this.queue.push(...queue);
  }

  // =========================================================================
  // Abertura, conversa entre mãos e créditos
  // =========================================================================

  private contextTags(ctx: TableContext): string[] {
    const t: string[] = [];
    if (ctx.returning) t.push('volta');
    if (ctx.localHour >= 0 && ctx.localHour < 5) t.push('madrugada');
    if (ctx.matchInSession >= 3) t.push('serie');
    t.push(ctx.mode === 'bounty' ? 'valendo' : 'livre');
    const m = ctx.memory;
    if (m?.riverBluffHigh) t.push('memoria', 'blefador');
    if (m?.foldsMuch) t.push('memoria', 'pedra');
    if (m?.callsMuch) t.push('memoria', 'pagaTudo');
    return [...new Set(t)];
  }

  private openMatch(e: Extract<PublicEvent, { t: 'matchStarted' }>, ctx: TableContext): void {
    if (this.opened || ctx.talk === 'none') return;
    this.opened = true;
    const tags = this.contextTags(ctx);
    const base = { priority: 1 as const, chance: 1, hand: 0, eventI: e.i, phase: 'opening' as const, scene: 'opening' as const };
    const prizeSig: Signal | null = e.prize && ctx.prize && RIVALS.includes(e.prize.holderId)
      ? { ...base, trigger: 'bountyIntro', holderId: e.prize.holderId, speakers: [e.prize.holderId],
          variant: [ctx.prize.kind, ctx.prize.rarity, `h.${e.prize.holderId}`] }
      : null;
    // 1ª visita da vida: T01, que substitui o matchStart
    if (!this.hasStory('first_visit')) {
      if (this.openExchange({ ...base, trigger: 'firstVisit', variant: tags }) && prizeSig) this.openLine(prizeSig);
      return;
    }
    // troca de abertura (sozinha) ou até 2 balões: o matchStart mais específico + o prêmio do portador
    if (prizeSig && this.rng() < (EXCHANGE_CHANCE.bountyIntro ?? 0) && this.openExchange(prizeSig)) return;
    let slotA: Signal;
    if (this.opts.afterInterval) slotA = { ...base, trigger: 'intervalReturn', variant: tags, noExchange: true };
    else if (e.loan > 0) slotA = { ...base, trigger: 'sapoLoan', variant: tags, actorId: 'bogart' };
    else slotA = { ...base, trigger: 'matchStart', variant: tags };
    if (!slotA.noExchange && this.rng() < (EXCHANGE_CHANCE[slotA.trigger] ?? 0) && this.openExchange(slotA)) return;
    this.openLine({ ...slotA, noExchange: true });
    if (prizeSig) this.openLine(prizeSig);
  }

  private openExchange(sig: Signal): boolean {
    const x = pickExchange(this.env, sig);
    if (!x) return false;
    this.queue.push(this.makeItem({
      kind: 'exchange', priority: 1, exchangeId: x.ex.id, between: 'any', scene: 'opening', scope: 'keep',
      trigger: sig.trigger, signal: sig, role: 'exchange', ids: [x.ex.id], story: x.ex.story, hand: 0,
      parts: x.ex.parts.map((p, i) => ({ speaker: p.speaker, text: x.texts[i], lineId: `${x.ex.id}.${i + 1}` })),
    }));
    if (x.ex.once) this.env.playedMatch.add(x.ex.id);
    return true;
  }

  private openLine(sig: Signal): boolean {
    const pick = pickLine(this.env, sig);
    if (!pick) return false;
    this.queue.push(this.makeItem({
      kind: 'line', priority: 1, parts: [{ speaker: pick.speaker, text: pick.text, lineId: pick.line.id, emote: pick.line.emote }],
      scene: 'opening', scope: 'keep', trigger: sig.trigger, signal: sig, role: pick.line.role, ids: [pick.line.id],
      story: pick.line.story, hand: 0,
    }));
    return true;
  }

  /** Conversa entre mãos calmas: uma a cada 5 a 7 mãos (§6.2). */
  private maybeBanter(h: number): void {
    if (this.budget.hadMoment(h) || this.queue.some((q) => q.hand === h && q.priority !== 1)) return;
    if (h - this.lastBanterHand < this.banterDue) return;
    const sig: Signal = { trigger: 'banter', priority: 3, chance: 1, variant: [], hand: h, eventI: this.tracker.eventI, phase: 'post' };
    if (this.tryEnqueue(sig)) {
      this.lastBanterHand = h;
      this.banterDue = 5 + Math.floor(this.rng() * 3);
    }
  }

  private credits(e: Extract<PublicEvent, { t: 'matchEnded' }>, ctx: TableContext): void {
    if (this.creditsDone) return;
    this.creditsDone = true;
    const base = { priority: 1 as const, chance: 1, hand: this.tracker.handNumber, eventI: e.i, phase: 'credits' as const, variant: [] as string[] };
    const loan = this.tracker.loan > 0;
    if (e.reason === 'forfeit' || e.reason === 'abandoned') {
      this.enqueueP1({ ...base, trigger: 'playerLeaves', noExchange: true }, 'credits');
      return;
    }
    if (e.humanPlace === 1) {
      if (loan) this.enqueueP1({ ...base, trigger: 'loanCredits', variant: ['premio'], noExchange: true }, 'credits');
      else this.enqueueP1({ ...base, trigger: 'playerWinsMatch', noExchange: true }, 'credits');
      return;
    }
    if (ctx.mode === 'bounty') {
      if (loan) {
        this.enqueueP1({ ...base, trigger: 'loanCredits', variant: [e.prizeCaptured ? 'premio' : 'perdeu'], noExchange: true }, 'credits');
      } else if (!e.prizeCaptured && this.tracker.holderId && RIVALS.includes(this.tracker.holderId)) {
        const holder = this.tracker.holderId;
        this.enqueueP1({ ...base, trigger: 'bountyLost', holderId: holder, speakers: [holder], noExchange: true }, 'credits');
      } else {
        this.enqueueP1({ ...base, trigger: 'playerLosesMatch', noExchange: true }, 'credits');
      }
      return;
    }
    // livre: quem levou a mesa chega depois (simulateRest) por onMoment({ t: 'tableWinner' })
    if (e.winnerId && RIVALS.includes(e.winnerId)) {
      this.enqueueP1({ ...base, trigger: 'tableWinner', actorId: e.winnerId, speakers: [e.winnerId], noExchange: true }, 'credits');
    } else {
      this.pendingTableWinner = true;
    }
  }
}

/** Cria o Diretor de uma partida (um por partida). */
export function createDirector(opts: DirectorOptions): Director {
  return new DialogueDirector(opts);
}

// Reexports úteis para a interface (cartões, Réplicas, "Você tem: …").
export { describeHand, handPhrase } from './handNames.ts';
export { QUIP_PACKS } from './quips.ts';
