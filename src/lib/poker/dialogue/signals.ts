/**
 * PublicEvent + TableContext → Signal (SPEC §6.2).
 *
 * O rastreador guarda só o que é público (ações, cartas abertas, cues) e responde a duas
 * perguntas do Diretor: "que sinais este evento gera?" e "em que estado está cada oráculo
 * agora?" (na mão com tal cue, fora da mão, eliminado). Nenhuma informação privada entra
 * aqui: o Diretor roda no navegador também na partida valendo.
 */
import type { Card } from '../cards.ts';
import { rankOf } from '../cards.ts';
import type { Street } from '../engine.ts';
import type { HandKind } from '../evaluator.ts';
import { evaluateHand } from '../evaluator.ts';
import type { Cue, MatchMode, PlayerId, PosterEffectId, PublicEvent, Rarity, RivalId, StyleLabel, TournamentConfig } from '../types.ts';
import type { TableContext, Trigger } from './types.ts';

export const RIVALS: RivalId[] = ['bogart', 'cypher', 'fincher'];
const HUMAN = 'human';

/**
 * Pôster Poker (03/11/2026): o "dono" de cada efeito fala mais na lançada (entra como ator,
 * peso 0,6). Raposo: os golpes e a leitura; Cobra: contar cartas, a opala e o tique; Sapo:
 * o Raymond, os ases e o bando.
 */
export const EFFECT_HOST: Record<PosterEffectId, RivalId> = {
  early_flop: 'fincher', double_pot: 'fincher', reveal_one: 'fincher',
  blackjack: 'cypher', opal: 'cypher', tell: 'cypher',
  eight_aces: 'bogart', hand_bounty: 'bogart', sixth_card: 'bogart',
};
/** Quem apresenta o pôster da semana (o antigo portador por raridade, veredito Q2). */
export const RARITY_HOST: Record<Rarity, RivalId> = { common: 'bogart', rare: 'bogart', epic: 'cypher', legendary: 'fincher' };

/** Valores das variáveis do Pôster Poker que vêm do evento. */
export interface SignalVars { fichas?: number; alvo?: HandKind; carta?: Card; maos?: number }

export interface ShownHand { cards: Card[]; kind: HandKind; best5: Card[]; royal: boolean }

export interface Signal {
  trigger: Trigger;
  priority: 1 | 2 | 3;
  chance: number;                 // 0..1 (a sorte de o momento acontecer)
  actorId?: PlayerId;             // quem agiu / sujeito (vencedor do pote, quem eliminou…)
  victimIds?: PlayerId[];         // quem sofreu / alvo
  holderId?: PlayerId;            // portador do prêmio
  /** Só estes podem falar (ex.: a fala de ação é sempre de quem agiu). */
  speakers?: RivalId[];
  variant: string[];              // condições do sinal (as relativas ao falante são do select.ts)
  cue?: Cue;                      // cue público da ação que disparou (ação de bot)
  caller?: RivalId;               // quem pagou o all-in da pessoa
  hand: number;
  eventI: number;
  /** 'inHand' = durante a mão (cai fora quando a mão acaba); 'post' = entre mãos. */
  phase: 'opening' | 'inHand' | 'post' | 'credits';
  /** Mão de quem interessa, para {mao}. */
  mao?: ShownHand;
  /** Parte (a)/(b) de uma dica de contexto. */
  tip?: { kind: string; part?: 'a' | 'b' };
  /** Só com a vez da pessoa aberta: precisa ser curta. */
  short?: boolean;
  /** Não abre troca (só fala solta). */
  noExchange?: boolean;
  /** Sinal de abertura/créditos montado pelo Diretor. */
  scene?: 'opening' | 'credits' | 'farewell';
  // --- Pôster Poker (03/11/2026) ---
  /** Variáveis vindas do evento ({fichas}, {alvo}, {carta}, {maos}). */
  vars?: SignalVars;
  /** Só falas com esta variante (a explicação de um efeito usa 'explica'). */
  needVariant?: string;
  /** Lançada: o Diretor decide a prioridade (P1 na 1ª vez da vida, senão P2/P3). */
  effect?: { id: PosterEffectId; castNo: number };
  /** Passa na frente de falas não-P1 desta mão que ainda não começaram (o bônus vence o pote). */
  preempt?: boolean;
}

interface HandTrack {
  n: number;
  bb: number;
  ante: number;
  buttonId: PlayerId;
  sbId: PlayerId;
  bbId: PlayerId;
  startStacks: Partial<Record<PlayerId, number>>;
  dealt: Set<PlayerId>;
  folded: Set<PlayerId>;
  lastCue: Map<PlayerId, Cue>;
  calledStreets: Map<PlayerId, Set<Street>>;
  checkedThisStreet: Set<PlayerId>;
  street: Street;
  board: Card[];
  preflopRaises: number;
  limpers: PlayerId[];
  streetAggressor: PlayerId | null;
  lastAggressor: PlayerId | null;
  humanBigBet: boolean;
  humanAllIn: boolean;
  humanAllInCallers: RivalId[];
  humanCalledRaisePreflop: boolean;
  humanWorstCallPrice: number;    // maior toCall/potAfter de um call da pessoa no turn/river
  humanFoldedPreflopUnraised: boolean;
  sapoCalado: boolean;
  ringAllIn: boolean;             // all-in do Raposo com anel de fumaça (cue confiante)
  humanCalledRing: boolean;
  allIn: boolean;
  shown: Map<PlayerId, ShownHand>;
  shownAfter: Map<PlayerId, { cards: Card[]; afterFold: boolean }>;
  sidePotWithHuman: boolean;
  tipsThisHand: Set<string>;
  bigBetFaced: boolean;           // a pessoa enfrentou aposta grande de bot
  allInFaced: boolean;            // a pessoa enfrentou all-in de bot
  humanFoldedTo: PlayerId | null;
}

function emptyHand(): HandTrack {
  return {
    n: 0, bb: 50, ante: 0, buttonId: HUMAN, sbId: HUMAN, bbId: HUMAN, startStacks: {}, dealt: new Set(), folded: new Set(),
    lastCue: new Map(), calledStreets: new Map(), checkedThisStreet: new Set(), street: 'preflop', board: [],
    preflopRaises: 0, limpers: [], streetAggressor: null, lastAggressor: null, humanBigBet: false, humanAllIn: false,
    humanAllInCallers: [], humanCalledRaisePreflop: false, humanWorstCallPrice: 0, humanFoldedPreflopUnraised: false,
    sapoCalado: false, ringAllIn: false, humanCalledRing: false, allIn: false, shown: new Map(), shownAfter: new Map(),
    sidePotWithHuman: false, tipsThisHand: new Set(), bigBetFaced: false, allInFaced: false, humanFoldedTo: null,
  };
}

/**
 * "Ar": nada além de carta alta (ou só o par do board). Antes do flop: sem par e sem dama ou maior.
 * `repeats`: no Cassino (8 ases a mais) a mesma carta pode aparecer duas vezes (03/11/2026).
 */
export function isAir(cards: Card[], board: Card[]): boolean {
  if (cards.length !== 2) return false;
  if (board.length < 3) {
    const [a, b] = cards.map(rankOf);
    return a !== b && Math.max(a, b) < 12;
  }
  try {
    const v = evaluateHand([...cards, ...board], { repeats: true });
    if (v.category === 0) return true;
    if (v.category === 1) {
      const pairRank = rankOf(v.best5[0]);
      return !cards.some((c) => rankOf(c) === pairRank);
    }
    return false;
  } catch {
    return false;
  }
}

function strongShown(cards: Card[], board: Card[]): ShownHand | null {
  try {
    const v = evaluateHand([...cards, ...board], { repeats: true });
    return { cards, kind: v.kind, best5: v.best5, royal: v.royal };
  } catch {
    return null;
  }
}

const NAME_TAG: Record<string, string> = { bogart: 'Sapo', cypher: 'Cobra', fincher: 'Raposo' };
const LABEL_TAG: Record<StyleLabel, string> = { pedra: 'pedra', solto: 'solto', pagaTudo: 'pagaTudo', blefador: 'blefador' };

/** Tags de partes do sinal para as trocas: a.<ator>, v.<vítima>, h.<portador>. */
function partyTags(s: Pick<Signal, 'actorId' | 'victimIds' | 'holderId'>): string[] {
  const t: string[] = [];
  if (s.actorId) t.push(`a.${s.actorId}`);
  for (const v of s.victimIds ?? []) t.push(`v.${v}`);
  if (s.holderId) t.push(`h.${s.holderId}`);
  return t;
}

export class SignalTracker {
  private rng: () => number;
  mode: MatchMode = 'free';
  loan = 0;
  seats: PlayerId[] = [];
  out = new Set<PlayerId>();             // eliminados da partida
  holderId: PlayerId | null = null;
  prizeCaptured = false;
  phase: 'opening' | 'dealing' | 'inHand' | 'between' | 'ended' = 'opening';
  hand: HandTrack = emptyHand();
  /** A última mão terminada (o "Mostrar" da pessoa chega depois dela). */
  lastHand: HandTrack | null = null;
  humanStreak = 0;
  label: StyleLabel | null = null;
  anteSeen = false;
  levelUps = 0;
  runoutSilence = false;
  lessonDone = false;
  atRiskDone = false;
  eventI = 0;
  /** Quem já levou o prêmio de quem (para o bountyWon na captura). */
  lastHolderBeforeCapture: PlayerId | null = null;
  // --- Pôster Poker (03/11/2026) ---
  /** O torneio da semana (do `matchStarted.tournament`); null na mesa casual. */
  tournament: TournamentConfig | null = null;
  /** Dados de cada efeito lançado (alvo do Raymond, a opala), para as falas do bônus. */
  effectData: { target?: HandKind; opal?: Card; amount?: number } = {};
  private bonusHands = new Set<string>();
  private blackjackPaid = false;
  private tellMarks = 0;
  /** Tique que chegou antes da aposta: espera a ação do mesmo oráculo nesta mão. */
  private pendingTell: { playerId: RivalId; mark: 'blefe' | 'valor'; hand: number } | null = null;
  private prevEvent: PublicEvent | null = null;
  private cobraTauntHand = -1;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  isOut(id: PlayerId): boolean {
    return this.out.has(id);
  }

  /**
   * Estado do oráculo agora: fora da mão (desistiu, eliminado, sem cartas, ou entre mãos)
   * ou o último cue dele na mão (quem ainda não agiu está em repouso: `neutro`).
   */
  speakerState(id: PlayerId): Cue | 'out' {
    if (this.out.has(id)) return 'out';
    if (this.phase === 'inHand' || this.phase === 'dealing') {
      if (this.hand.dealt.size && !this.hand.dealt.has(id)) return 'out';
      if (this.hand.folded.has(id)) return 'out';
      return this.hand.lastCue.get(id) ?? 'neutro';
    }
    return 'out';
  }

  /** O Sapo deu `calado` nesta mão: silêncio dele até a mão acabar (§6.3). */
  get sapoSilent(): boolean {
    return (this.phase === 'inHand' || this.phase === 'dealing') && this.hand.sapoCalado;
  }

  get humanFolded(): boolean {
    return this.phase === 'inHand' && (this.hand.folded.has(HUMAN) || this.out.has(HUMAN));
  }

  get handNumber(): number {
    return this.hand.n;
  }

  /** Tags do sinal que não dependem do falante. */
  private sig(base: Omit<Signal, 'hand' | 'eventI' | 'variant'> & { variant?: string[] }): Signal {
    const variant = [...(base.variant ?? []), ...partyTags(base)];
    return { ...base, variant, hand: this.hand.n, eventI: this.eventI };
  }

  process(e: PublicEvent, ctx: TableContext): Signal[] {
    const out = this.processEvent(e, ctx);
    this.prevEvent = e;
    return out;
  }

  private processEvent(e: PublicEvent, ctx: TableContext): Signal[] {
    this.eventI = e.i;
    switch (e.t) {
      case 'matchStarted': return this.onMatchStarted(e, ctx);
      case 'levelUp': return this.onLevelUp(e, ctx);
      case 'handStarted': return this.onHandStarted(e, ctx);
      case 'blindsPosted':
        for (const p of e.allInIds) this.hand.lastCue.set(p, this.hand.lastCue.get(p) ?? 'neutro');
        return [];
      case 'action': return this.onAction(e, ctx);
      case 'runout':
        this.runoutSilence = true;
        this.hand.allIn = true;
        return [];
      case 'street': return this.onStreet(e);
      case 'showdown':
        for (const h of e.hands) this.hand.shown.set(h.playerId, { cards: h.cards, kind: h.kind, best5: h.best5, royal: h.royal });
        if (e.hands[0]?.playerId === HUMAN && e.hands.some((h) => h.playerId === 'fincher')) {
          return [this.sig({ trigger: 'showdown', priority: 3, chance: 0.3, variant: ['humanFirst'], speakers: ['fincher'], phase: 'inHand' })];
        }
        return [];
      case 'cardsShown': return this.onCardsShown(e, ctx);
      case 'potAwarded':
        this.runoutSilence = false;
        if (e.potIndex >= 1 && e.eligibleIds.includes(HUMAN)) this.hand.sidePotWithHuman = true;
        return [];
      case 'handComplete': return this.onHandComplete(e, ctx);
      case 'eliminated': return this.onEliminated(e);
      case 'prizeMoved':
        this.holderId = e.toId;
        return [this.sig({ trigger: 'bountySteal', priority: 1, chance: 1, actorId: e.toId, victimIds: [e.fromId],
          speakers: RIVALS.includes(e.toId) ? [e.toId] : undefined, phase: 'post' })];
      case 'prizeCaptured': {
        const from = this.holderId;
        this.lastHolderBeforeCapture = from;
        this.holderId = HUMAN;
        this.prizeCaptured = true;
        if (!from || from === HUMAN) return [];
        return [this.sig({ trigger: 'bountyWon', priority: 1, chance: 1, holderId: from, actorId: HUMAN, victimIds: [from],
          speakers: [from], phase: 'post' })];
      }
      case 'tilt': return this.onTilt(e);
      case 'styleRead':
        this.label = e.label;
        return [this.sig({ trigger: 'readPlayer', priority: 2, chance: 0.6, actorId: e.by, variant: [LABEL_TAG[e.label]], phase: 'post' })];
      case 'headsUp': {
        const bot = e.ids.find((id) => id !== HUMAN);
        const out: Signal[] = [];
        if (bot && e.ids.includes(HUMAN)) {
          out.push(this.sig({ trigger: 'headsUp', priority: 2, chance: 0.6, actorId: bot, speakers: [bot], phase: 'post' }));
          if (ctx.mode !== 'tutorial' && !ctx.story['tip.headsup']) {
            out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['headsup'], speakers: ['fincher'],
              tip: { kind: 'headsup' }, phase: 'post' }));
          }
        }
        return out;
      }
      case 'matchEnded':
        this.phase = 'ended';
        return [];
      case 'effectCast': return this.onEffectCast(e);
      case 'effectReveal': return this.onEffectReveal(e);
      case 'effectBonus': return this.onEffectBonus(e);
      case 'tellMark': return this.onTellMark(e);
      default:
        return [];   // evento desconhecido: ignora (APK antigo continua vivo)
    }
  }

  // -------------------------------------------------------------------------
  // Pôster Poker (03/11/2026)
  // -------------------------------------------------------------------------

  /** Oráculos vivos (os eliminados só falam em P1, como plateia). */
  private alive(): RivalId[] {
    return RIVALS.filter((r) => !this.out.has(r));
  }

  /**
   * O "CATCHAW". A prioridade fica a cargo do Diretor (que sabe se a pessoa já ouviu a
   * explicação deste efeito). Lançada no começo da mão: 'post' (cai quando a mão anda);
   * o Onze Homens lança no meio da mão (logo antes do river): 'inHand', curta.
   */
  private onEffectCast(e: Extract<PublicEvent, { t: 'effectCast' }>): Signal[] {
    const d = e.data;
    const vars: SignalVars = {};
    if (d.effect === 'blackjack') vars.fichas = d.amount;
    if (d.effect === 'hand_bounty') {
      vars.fichas = d.amount;
      vars.alvo = d.target;
      this.effectData.target = d.target;
      this.effectData.amount = d.amount;
    }
    if (d.effect === 'opal') {
      vars.fichas = d.amount;
      vars.carta = d.card;
      this.effectData.opal = d.card;
      this.effectData.amount = d.amount;
    }
    if (d.effect === 'tell') vars.maos = d.hands;
    const host = EFFECT_HOST[e.effect];
    const midHand = e.effect === 'sixth_card' && this.phase === 'inHand';
    const s = this.sig({
      trigger: 'effectCast', priority: 2, chance: 1, actorId: host && !this.out.has(host) ? host : undefined,
      variant: [e.effect], speakers: RIVALS, phase: midHand ? 'inHand' : 'post', short: midHand || undefined,
      noExchange: true, vars, effect: { id: e.effect, castNo: e.castNo },
    });
    s.hand = e.handNumber;
    return [s];
  }

  /** A leitura (Cartas na Mesa): um oráculo pode comentar a carta aberta da PESSOA. */
  private onEffectReveal(e: Extract<PublicEvent, { t: 'effectReveal' }>): Signal[] {
    if (e.effect !== 'reveal_one') return [];   // 21: quem fala é o bônus que vem logo depois
    const mine = e.cards.find((c) => c.playerId === HUMAN)?.cards[0];
    if (!mine) return [];
    const r = rankOf(mine);
    const tag = r === 14 ? ['as'] : r >= 11 ? ['figura'] : r <= 6 ? ['baixa'] : [];
    const s = this.sig({ trigger: 'effectReveal', priority: 3, chance: 0.35, variant: ['reveal_one', ...tag],
      speakers: this.alive(), phase: 'inHand', short: true, noExchange: true });
    s.hand = e.handNumber;
    return [s];
  }

  /**
   * Fichas da casa. A opala achada, o alvo do Raymond batido e o 1º pagamento do 21 (o
   * desfecho do efeito, uma vez por partida) são P1, como a captura do antigo prêmio do dia;
   * o 2º pagamento do 21 é P2 (50%); o pote dobrado, P3 (35%). Só o primeiro bônus da mão
   * fala (empates e potes paralelos).
   */
  private onEffectBonus(e: Extract<PublicEvent, { t: 'effectBonus' }>): Signal[] {
    const key = `${e.handNumber}|${e.effect}`;
    if (this.bonusHands.has(key)) return [];
    this.bonusHands.add(key);
    const human = e.playerId === HUMAN;
    const once = e.effect === 'opal' || e.effect === 'hand_bounty' || (e.effect === 'blackjack' && !this.blackjackPaid);
    if (e.effect === 'blackjack') this.blackjackPaid = true;
    const priority: 1 | 2 | 3 = once ? 1 : e.effect === 'double_pot' ? 3 : 2;
    const chance = once ? 1 : e.effect === 'blackjack' ? 0.5 : 0.35;
    const vars: SignalVars = { fichas: e.amount };
    if (e.effect === 'hand_bounty' && this.effectData.target) vars.alvo = this.effectData.target;
    if (e.effect === 'opal' && this.effectData.opal) vars.carta = this.effectData.opal;
    const s = this.sig({
      trigger: 'effectBonus', priority, chance, actorId: e.playerId, variant: [e.effect, human ? 'humano' : 'oraculo'],
      speakers: this.alive(), phase: 'post', vars, preempt: e.effect !== 'double_pot',
    });
    s.hand = e.handNumber;
    return [s];
  }

  /**
   * O tique de Le Chiffre. A fala de quem apostou segue o cue daquela aposta (como as falas
   * de ação), então o tique precisa da ação: se ele chegou antes dela, espera.
   */
  private onTellMark(e: Extract<PublicEvent, { t: 'tellMark' }>): Signal[] {
    const p = this.prevEvent;
    if (p && p.t === 'action' && p.playerId === e.playerId && this.hand.n === e.handNumber) {
      return [this.tellSignal(e.playerId, e.mark, p.cue ?? 'neutro', e.handNumber)];
    }
    this.pendingTell = { playerId: e.playerId, mark: e.mark, hand: e.handNumber };
    return [];
  }

  private tellSignal(pid: RivalId, mark: 'blefe' | 'valor', cue: Cue, hand: number): Signal {
    this.tellMarks++;
    const first = this.tellMarks === 1;
    const s = this.sig({ trigger: 'tellMark', priority: first ? 2 : 3, chance: first ? 0.6 : 0.3, actorId: pid, cue,
      variant: [mark], speakers: this.alive(), phase: 'inHand', short: true, noExchange: true, preempt: true });
    s.hand = hand;
    return s;
  }

  // -------------------------------------------------------------------------

  private onMatchStarted(e: Extract<PublicEvent, { t: 'matchStarted' }>, ctx: TableContext): Signal[] {
    this.mode = e.mode;
    this.loan = e.loan;
    this.seats = e.seats.map((s) => s.id);
    this.holderId = e.prize?.holderId ?? null;
    this.phase = 'opening';
    this.anteSeen = e.level.ante > 0;
    this.tournament = e.tournament ?? null;
    // a Cobra volta a provocar com a caixinha no fim de uma mão sorteada entre a 4ª e a 7ª
    if (this.tournament?.cobraItem) this.cobraTauntHand = 4 + Math.floor(this.rng() * 4);
    void ctx;
    return [];   // a abertura é montada pelo Diretor (precisa de vários balões coordenados)
  }

  private onLevelUp(e: Extract<PublicEvent, { t: 'levelUp' }>, ctx: TableContext): Signal[] {
    this.levelUps++;
    const out: Signal[] = [];
    const firstAnte = e.level.ante > 0 && !this.anteSeen;
    if (firstAnte) this.anteSeen = true;
    out.push(this.sig({ trigger: 'blindsUp', priority: firstAnte ? 2 : 3, chance: firstAnte ? 0.6 : 0.3,
      variant: firstAnte ? ['ante'] : [], phase: 'post' }));
    if (ctx.mode !== 'tutorial' && !this.out.has(HUMAN)) {
      if (firstAnte && !ctx.story['tip.ante']) {
        out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['ante'], speakers: ['fincher'], tip: { kind: 'ante' }, phase: 'post' }));
      } else if (this.levelUps === 1 && !ctx.story['tip.blinds']) {
        out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['blinds'], speakers: ['fincher'], tip: { kind: 'blinds' }, phase: 'post' }));
      }
    }
    return out;
  }

  private onHandStarted(e: Extract<PublicEvent, { t: 'handStarted' }>, ctx: TableContext): Signal[] {
    const h = emptyHand();
    h.n = e.handNumber;
    h.bb = e.level.bb;
    h.ante = e.level.ante;
    h.buttonId = e.buttonId;
    h.sbId = e.sbId;
    h.bbId = e.bbId;
    h.startStacks = { ...e.stacks };
    for (const [id, st] of Object.entries(e.stacks)) if ((st ?? 0) > 0 && !this.out.has(id)) h.dealt.add(id);
    this.hand = h;
    this.phase = 'dealing';
    this.runoutSilence = false;
    this.pendingTell = null;
    const out: Signal[] = [];
    if (this.mode === 'bounty' && !this.prizeCaptured && this.holderId && RIVALS.includes(this.holderId) && !this.out.has(this.holderId)) {
      const holder = this.holderId;
      const st = e.stacks[holder] ?? 0;
      if (!this.atRiskDone && st > 0 && st <= 10 * h.bb) {
        this.atRiskDone = true;
        out.push(this.sig({ trigger: 'bountyAtRisk', priority: 3, chance: 0.3, holderId: holder, speakers: [holder], phase: 'post' }));
      }
      if (e.handNumber === 2) {
        out.push(this.sig({ trigger: 'bountyTaunt', priority: 3, chance: 0.3, holderId: holder,
          speakers: RIVALS.filter((r) => r !== holder && !this.out.has(r)), phase: 'post' }));
      }
    }
    // dica do primeiro ante, se a pessoa entrou direto num nível com ante
    if (ctx.mode !== 'tutorial' && h.ante > 0 && !ctx.story['tip.ante'] && !this.out.has(HUMAN)) {
      out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['ante'], speakers: ['fincher'], tip: { kind: 'ante' }, phase: 'post' }));
    }
    out.push(this.sig({ trigger: 'deal', priority: 3, chance: 0.1, phase: 'post' }));
    return out;
  }

  private onStreet(e: Extract<PublicEvent, { t: 'street' }>): Signal[] {
    const h = this.hand;
    h.street = e.street;
    h.board = e.board.slice();
    h.streetAggressor = null;
    h.checkedThisStreet = new Set();
    // o flop adiantado do Golpe de Mestre já teve o seu momento (a lançada)
    if (e.street !== 'flop' || this.runoutSilence || e.early) return [];
    const suits = new Set(e.cards.map((c) => c[1]));
    return [this.sig({ trigger: 'flop', priority: 3, chance: 0.1, variant: suits.size === 1 ? ['monotone'] : [], phase: 'inHand' })];
  }

  private onAction(e: Extract<PublicEvent, { t: 'action' }>, ctx: TableContext): Signal[] {
    const h = this.hand;
    this.phase = 'inHand';
    const pid = e.playerId;
    const isBot = pid !== HUMAN;
    const bb = h.bb || 50;
    const out: Signal[] = [];
    const facingHuman = h.streetAggressor === HUMAN;
    const lastAggr = h.streetAggressor;
    const humanLive = h.dealt.has(HUMAN) && !h.folded.has(HUMAN) && !this.out.has(HUMAN);

    if (isBot) {
      const cue: Cue = e.cue ?? 'neutro';
      h.lastCue.set(pid, cue);
      if (pid === 'bogart' && cue === 'calado') h.sapoCalado = true;
      const base = { actorId: pid, speakers: [pid] as RivalId[], cue, phase: 'inHand' as const };
      let trig: Trigger | null = null;
      let variant: string[] = [];
      let priority: 1 | 2 | 3 = 3;
      let chance = 0.3;
      if (e.action === 'fold') {
        trig = facingHuman ? 'foldToPlayer' : 'fold';
        chance = 0.1;
        if (!facingHuman) {
          if (e.street === 'preflop' && (pid === h.sbId || pid === h.bbId)) variant.push('blind');
          if (lastAggr && NAME_TAG[lastAggr]) variant.push(`vs${NAME_TAG[lastAggr]}`);
        }
      } else if (e.allIn) {
        trig = 'allIn';
        priority = 2;
        chance = 0.6;
        if (e.stackBefore <= 10 * bb) variant.push('curto');
      } else if (e.action === 'call') {
        if (e.street === 'preflop' && h.preflopRaises === 0) {
          trig = 'limp';
          chance = 0.1;
        } else {
          trig = 'call';
          if ([...(h.calledStreets.get(pid) ?? [])].some((s) => s !== e.street)) variant.push('comprometido');
        }
      } else if (e.action === 'bet' || e.action === 'raise') {
        if (e.street === 'preflop') {
          if (h.preflopRaises >= 1) trig = '3bet';
          else if (h.limpers.length > 0) {
            trig = 'isolate';
            for (const l of h.limpers) if (NAME_TAG[l]) variant.push(`vs${NAME_TAG[l]}`);
          }
        } else if (e.action === 'raise' && h.checkedThisStreet.has(pid)) {
          trig = 'checkRaise';
        } else if (e.sizeClass === 'overbet') {
          trig = 'overbet';
        } else if (e.sizeClass === 'big') {
          trig = 'bigBet';
        } else if (e.action === 'bet' && e.sizeClass === 'small') {
          trig = 'bet';
          variant = ['pequeno'];
        }
      }
      if (trig) out.push(this.sig({ ...base, trigger: trig, priority, chance, variant }));

      // dicas de contexto: primeira vez que a pessoa enfrenta all-in / aposta grande de um bot
      if (ctx.mode !== 'tutorial' && humanLive && (e.action === 'bet' || e.action === 'raise')) {
        if (e.allIn) {
          h.allInFaced = true;
          if (!ctx.story['tip.allin'] && !h.tipsThisHand.has('allin')) {
            h.tipsThisHand.add('allin');
            out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['allin', 'a'], speakers: ['fincher'],
              tip: { kind: 'allin', part: 'a' }, short: true, phase: 'inHand' }));
          }
        } else if (e.sizeClass === 'big' || e.sizeClass === 'overbet') {
          h.bigBetFaced = true;
          if (!ctx.story['tip.bigbet'] && !h.tipsThisHand.has('bigbet')) {
            h.tipsThisHand.add('bigbet');
            out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['bigbet', 'a'], speakers: ['fincher'],
              tip: { kind: 'bigbet', part: 'a' }, short: true, phase: 'inHand' }));
          }
        }
      }
      if (pid === 'fincher' && e.allIn && cue === 'confiante') h.ringAllIn = true;
      if (h.humanAllIn && e.action === 'call' && RIVALS.includes(pid)) h.humanAllInCallers.push(pid);
      // Pôster Poker: o tique que chegou antes desta aposta
      const pt = this.pendingTell;
      if (pt && pt.playerId === pid && pt.hand === h.n && (e.action === 'bet' || e.action === 'raise')) {
        this.pendingTell = null;
        out.push(this.tellSignal(pid, pt.mark, cue, h.n));
      }
    } else {
      // ação da pessoa
      if (e.action === 'fold') {
        h.humanFoldedTo = lastAggr;
        if (e.street === 'preflop' && h.preflopRaises === 0) h.humanFoldedPreflopUnraised = true;
        if (lastAggr && RIVALS.includes(lastAggr)) {
          out.push(this.sig({ trigger: 'playerFold', priority: 3, chance: 0.1, actorId: HUMAN, victimIds: [lastAggr],
            speakers: [lastAggr], phase: 'inHand' }));
        }
      } else if (e.allIn && (e.action === 'bet' || e.action === 'raise' || e.action === 'call')) {
        if (e.action !== 'call') h.humanAllIn = true;
        if (e.action === 'call' && h.ringAllIn) h.humanCalledRing = true;
        if (e.action !== 'call') {
          const pot = e.potAfter / bb;
          out.push(this.sig({ trigger: 'playerAllIn', priority: 2, chance: 0.6, actorId: HUMAN,
            victimIds: [...h.dealt].filter((p) => p !== HUMAN && !h.folded.has(p)),
            variant: pot >= 30 ? ['enorme'] : [], phase: 'inHand' }));
        }
      } else if ((e.action === 'bet' || e.action === 'raise') && (e.sizeClass === 'big' || e.sizeClass === 'overbet')) {
        h.humanBigBet = true;
        out.push(this.sig({ trigger: 'playerBigBet', priority: 3, chance: 0.3, actorId: HUMAN,
          victimIds: [...h.dealt].filter((p) => p !== HUMAN && !h.folded.has(p)),
          variant: this.label ? [LABEL_TAG[this.label]] : [], phase: 'inHand' }));
      }
      if (e.action === 'call') {
        if (e.street === 'preflop' && h.preflopRaises >= 1) h.humanCalledRaisePreflop = true;
        if ((e.street === 'turn' || e.street === 'river') && e.potAfter > 0) {
          h.humanWorstCallPrice = Math.max(h.humanWorstCallPrice, e.amount / e.potAfter);
        }
        if (h.ringAllIn && h.streetAggressor === 'fincher') h.humanCalledRing = true;
      }
    }

    // trilha comum
    if (e.action === 'fold') h.folded.add(pid);
    if (e.action === 'check') h.checkedThisStreet.add(pid);
    if (e.action === 'call') {
      const set = h.calledStreets.get(pid) ?? new Set<Street>();
      set.add(e.street);
      h.calledStreets.set(pid, set);
      if (e.street === 'preflop' && h.preflopRaises === 0) h.limpers.push(pid);
    }
    if (e.action === 'bet' || e.action === 'raise') {
      if (e.street === 'preflop') h.preflopRaises++;
      h.streetAggressor = pid;
      h.lastAggressor = pid;
    }
    if (e.allIn) h.allIn = true;
    return out;
  }

  private onCardsShown(e: Extract<PublicEvent, { t: 'cardsShown' }>, ctx: TableContext): Signal[] {
    const h = this.hand;
    // A pessoa tocou em "Mostrar": vale para a última mão ganha sem showdown, que pode já ter
    // acabado (no prêmio o cardsShown vem junto da ação seguinte). Usa o board e os
    // oponentes daquela mão.
    if (e.playerId === HUMAN) {
      const last = this.lastHand ?? h;
      if (!e.afterFold && isAir(e.cards, last.board) && ctx.mode !== 'tutorial') {
        const victims = last.lastAggressor === HUMAN ? [...last.folded].filter((p) => RIVALS.includes(p)) : [];
        const s = this.sig({ trigger: 'playerBluffShown', priority: 2, chance: 0.6, actorId: HUMAN, victimIds: victims, phase: 'post' });
        s.hand = last.n;
        return [s];
      }
      return [];
    }
    h.shownAfter.set(e.playerId, { cards: e.cards, afterFold: e.afterFold });
    return [];
  }

  /** Bots que largaram diante de uma aposta de `aggr` nesta mão (aproximação pública). */
  private foldersTo(aggr: PlayerId): PlayerId[] {
    const h = this.hand;
    if (h.humanFoldedTo === aggr) return [];
    return [...h.folded].filter((p) => p !== aggr && RIVALS.includes(p) && h.lastAggressor === aggr);
  }

  private onHandComplete(e: Extract<PublicEvent, { t: 'handComplete' }>, ctx: TableContext): Signal[] {
    const h = this.hand;
    this.lastHand = h;
    this.phase = 'between';
    this.runoutSilence = false;
    if (ctx.mode === 'tutorial') return [];
    const out: Signal[] = [];
    const bb = h.bb || 50;
    const net = e.net;
    const f = e.flags;
    const humanWon = (net[HUMAN] ?? 0) > 0;
    const post = 'post' as const;
    const bigPotTags = (potBB: number): string[] => (potBB >= 30 ? ['grande', 'enorme'] : potBB >= 20 ? ['grande'] : ['pequeno']);

    // Pôster Poker: a Cobra volta a provocar com a caixinha (entre mãos, para a troca caber)
    if (e.handNumber === this.cobraTauntHand && !this.out.has('cypher')) {
      out.push(this.sig({ trigger: 'cobraItem', priority: 3, chance: 0.3, variant: ['meio'], phase: post }));
    }

    // sequência da pessoa
    if (e.winnerIds.includes(HUMAN)) this.humanStreak++;
    else if (e.winnerIds.length) this.humanStreak = 0;
    if (this.humanStreak >= 3) {
      this.humanStreak = 0;
      out.push(this.sig({ trigger: 'playerStreak', priority: 2, chance: 0.6, actorId: HUMAN, phase: post }));
    }

    // bad beat
    if (f.badBeat) {
      const { victimId, winnerId } = f.badBeat;
      if (victimId === HUMAN) {
        out.push(this.sig({ trigger: 'playerBadBeat', priority: 2, chance: 0.6, actorId: winnerId, victimIds: [HUMAN], phase: post }));
      } else {
        out.push(this.sig({ trigger: 'badBeatAgainstMe', priority: 2, chance: 0.6, actorId: winnerId, victimIds: [victimId], phase: post }));
        if (RIVALS.includes(winnerId)) {
          out.push(this.sig({ trigger: 'badBeatForMe', priority: 2, chance: 0.6, actorId: winnerId, victimIds: [victimId],
            speakers: [winnerId], phase: post }));
        }
      }
    }

    // blefes
    if (f.bluffCaught) {
      const { blufferId, catcherId } = f.bluffCaught;
      if (blufferId === HUMAN) {
        out.push(this.sig({ trigger: 'playerBluffCaught', priority: 3, chance: 0.3, actorId: catcherId, victimIds: [HUMAN], phase: post }));
      }
      if (RIVALS.includes(catcherId)) {
        out.push(this.sig({ trigger: 'catchBluff', priority: 3, chance: 0.3, actorId: catcherId, victimIds: [blufferId],
          speakers: [catcherId], phase: post }));
      }
    }
    const bluffBy = new Set<PlayerId>();
    if (f.bluffShown) bluffBy.add(f.bluffShown.playerId);
    for (const [pid, s] of h.shownAfter) if (!s.afterFold && isAir(s.cards, h.board)) bluffBy.add(pid);
    for (const pid of bluffBy) {
      if (pid === HUMAN) {
        out.push(this.sig({ trigger: 'playerBluffShown', priority: 2, chance: 0.6, actorId: HUMAN, victimIds: this.foldersTo(HUMAN), phase: post }));
      } else if (RIVALS.includes(pid)) {
        out.push(this.sig({ trigger: 'bluffShown', priority: 2, chance: 0.6, actorId: pid, speakers: [pid], phase: post }));
      }
    }
    if (f.valueShown && RIVALS.includes(f.valueShown.playerId)) {
      const pid = f.valueShown.playerId;
      out.push(this.sig({ trigger: 'valueShown', priority: 2, chance: 0.6, actorId: pid, speakers: [pid],
        variant: pid === 'bogart' && h.sapoCalado ? ['calado'] : [], mao: h.shown.get(pid), phase: post }));
    }
    const heroFolder = f.heroFold?.playerId ?? [...h.shownAfter].find(([, s]) => s.afterFold)?.[0];
    if (heroFolder && RIVALS.includes(heroFolder)) {
      const s = h.shownAfter.get(heroFolder);
      const mao = s ? strongShown(s.cards, h.board) ?? undefined : undefined;
      out.push(this.sig({ trigger: 'heroFoldShown', priority: 2, chance: 0.6, actorId: heroFolder, speakers: [heroFolder], mao, phase: post }));
    }

    // potes
    const humanAllInCaller = h.humanAllIn && h.humanAllInCallers.length ? h.humanAllInCallers[0] : undefined;
    if (e.potBB >= 10) {
      const botWinners = e.winnerIds.filter((w) => RIVALS.includes(w));
      if (botWinners.length === 1 && !humanWon) {
        const w = botWinners[0];
        const variant = bigPotTags(e.potBB);
        if (f.badBeat?.winnerId === w) variant.push('sorte');
        if (w !== 'fincher' && (net.fincher ?? 0) < 0) variant.push('vsRaposo');
        if (h.humanAllIn && (net[HUMAN] ?? 0) < 0) variant.push('allinHumano');
        out.push(this.sig({ trigger: 'potWon', priority: 3, chance: 0.3, actorId: w,
          victimIds: Object.keys(net).filter((p) => (net[p] ?? 0) < 0), variant, caller: humanAllInCaller, phase: post }));
      }
      if (humanWon) {
        const losers = RIVALS.filter((r) => (net[r] ?? 0) < 0);
        const variant = bigPotTags(e.potBB);
        if (h.humanBigBet) variant.push('agressor');
        if (h.humanAllIn) variant.push('allinHumano');
        if (losers.length) {
          out.push(this.sig({ trigger: 'potLostToPlayer', priority: 3, chance: 0.3, actorId: HUMAN, victimIds: losers,
            variant, caller: humanAllInCaller, phase: post }));
        }
      }
      // Nota do Sapo (errática) e Coração da Cobra
      out.push(this.sig({ trigger: 'rateMove', priority: 3, chance: 0.1, variant: [this.rng() < 0.5 ? 'alta' : 'baixa'],
        speakers: ['bogart'], phase: post }));
      const humanShown = h.shown.get(HUMAN);
      if (e.wentToShowdown && humanShown && (humanShown.kind === 'high_card' || humanShown.kind === 'pair')) {
        out.push(this.sig({ trigger: 'beautifulError', priority: 3, chance: 0.1, speakers: ['cypher'], phase: post }));
      }
    }

    // lição do Raposo (uma por partida)
    if (!this.lessonDone && !this.out.has('fincher')) {
      const humanNet = net[HUMAN] ?? 0;
      let lesson: string | null = null;
      if (f.bluffCaught?.blufferId === HUMAN) lesson = 'blefe';
      else if (e.wentToShowdown && humanNet < 0 && h.humanWorstCallPrice >= 0.4) lesson = 'odds';
      else if (humanNet <= -10 * bb && h.humanCalledRaisePreflop && h.sbId === HUMAN) lesson = 'posicao';
      else if (h.humanFoldedPreflopUnraised && (h.startStacks[HUMAN] ?? Infinity) <= 8 * bb) lesson = 'curto';
      if (lesson) {
        out.push(this.sig({ trigger: 'lesson', priority: 2, chance: 0.6, variant: [lesson], speakers: ['fincher'], phase: post }));
      }
    }

    // segredo do Raposo (arco T28/F90)
    if (h.ringAllIn && h.humanCalledRing && (net[HUMAN] ?? 0) < 0 && (net.fincher ?? 0) > 0 && ctx.lifetimeMatches >= 50) {
      out.push(this.sig({ trigger: 'secretTell', priority: 1, chance: 1, actorId: 'fincher', phase: post }));
    }

    // dicas: parte (b) do all-in / aposta grande; pote paralelo
    // (o Diretor só deixa sair a (b) da dica cuja (a) entrou nesta mão)
    for (const kind of ['allin', 'bigbet']) {
      if (h.tipsThisHand.has(kind)) {
        out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: [kind, 'b'], speakers: ['fincher'], tip: { kind, part: 'b' }, phase: post }));
      }
    }
    if (h.sidePotWithHuman && !ctx.story['tip.sidepot'] && !this.out.has(HUMAN)) {
      out.push(this.sig({ trigger: 'contextTip', priority: 1, chance: 1, variant: ['sidepot'], speakers: ['fincher'], tip: { kind: 'sidepot' }, phase: post }));
    }
    return out;
  }

  private onEliminated(e: Extract<PublicEvent, { t: 'eliminated' }>): Signal[] {
    this.out.add(e.playerId);
    const out: Signal[] = [];
    const victim = e.playerId;
    const by = e.byId;
    if (victim === HUMAN) {
      if (by && RIVALS.includes(by)) {
        out.push(this.sig({ trigger: 'eliminatesPlayer', priority: 1, chance: 1, actorId: by, victimIds: [HUMAN], phase: 'credits', scene: 'farewell' }));
      }
      return out;
    }
    // Caiu o portador do prêmio: logo depois vem prizeCaptured (fala o portador) ou prizeMoved
    // (fala quem herdou). Para não dobrar os balões, a fala do prêmio substitui a da eliminação.
    const carrierOut = this.mode === 'bounty' && !this.prizeCaptured && this.holderId === victim;
    if (!(carrierOut && by === HUMAN)) {
      out.push(this.sig({ trigger: 'eliminated', priority: 1, chance: 1, actorId: by ?? undefined, victimIds: [victim],
        speakers: [victim], phase: 'post' }));
    }
    if (by && RIVALS.includes(by) && !carrierOut) {
      out.push(this.sig({ trigger: 'eliminatesOracle', priority: 1, chance: 1, actorId: by, victimIds: [victim], speakers: [by], phase: 'post' }));
    }
    out.push(this.sig({ trigger: 'oracleOut', priority: 3, chance: 0.3, actorId: by ?? undefined, victimIds: [victim],
      speakers: RIVALS.filter((r) => r !== victim && r !== by && !this.out.has(r)), phase: 'post' }));
    return out;
  }

  private onTilt(e: Extract<PublicEvent, { t: 'tilt' }>): Signal[] {
    const pid = e.playerId;
    if (!e.on) {
      return [this.sig({ trigger: 'tiltEnd', priority: 2, chance: 0.6, actorId: pid, speakers: [pid], phase: 'post' })];
    }
    if (e.kind === 'orgulho') {
      return [this.sig({ trigger: 'prideStart', priority: 2, chance: 0.6, actorId: pid, speakers: [pid], phase: 'post' })];
    }
    const variant: string[] = [];
    let mao: ShownHand | undefined;
    if (e.kind === 'veneno') {
      if (e.targetId && NAME_TAG[e.targetId]) {
        variant.push(`vs${NAME_TAG[e.targetId]}`);
        mao = this.hand.shown.get(e.targetId);
      } else if (this.hand.shown.has(pid) && isAir(this.hand.shown.get(pid)!.cards, this.hand.board)) {
        variant.push('blefe');
      } else {
        variant.push('cacife');
      }
    }
    return [this.sig({ trigger: 'tiltStart', priority: 1, chance: 1, actorId: pid, victimIds: e.targetId ? [e.targetId] : undefined,
      speakers: [pid], variant, mao, phase: 'post' })];
  }
}
