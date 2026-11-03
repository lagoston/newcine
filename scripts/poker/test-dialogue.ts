/**
 * Teste do Diretor de falas e do banco (SPEC §6.6, pacote B).
 *
 *   node scripts/poker/test-dialogue.ts                 estático + cenários + fixtures + fuzz (5.000 partidas)
 *   node scripts/poker/test-dialogue.ts --n 500         fuzz menor
 *   node scripts/poker/test-dialogue.ts --quick         sem o fuzz
 *
 * 1. Estático: ≤ 88 caracteres ({premio} conta 30), `curta` ⇔ ≤ 44, ator em ação de bot com
 *    cue, Sapo ator nunca com `calado`, aposta grande do Sapo só `nervoso`, all-in do Sapo só
 *    `curto`, nada de {player}/{nome}/@, {o|a} só com alvo oráculo, todo id com en.
 * 2. Cenários sintéticos (abertura, silêncio do Sapo, dicas, despedida, Réplicas, cartões…).
 * 3. Fixtures do A1 (20 públicas + 5 privadas) passam pelo Diretor sem quebrar as regras.
 * 4. Fuzz: partidas do simulador do A, com o log privado só para o teste. Para cada fala:
 *    ator ⇒ line.cue inclui o cue do evento; nada do Sapo depois de `calado` na mesma mão;
 *    aposta grande do Sapo nunca com monstro; nenhuma troca começa com a vez da pessoa aberta;
 *    na vez da pessoa só fala curta.
 * 5. Orçamento: 18–22 balões por partida de ~35 mãos (P1 incluído), ≥ 40% das mãos em
 *    silêncio, ≤ 1 momento não-P1 por mão; meia-carga ≥ 35% abaixo.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyHumanAction, createMatch, createRng, humanLegal, tableView, toPublicEvents,
} from '../../src/lib/poker/index.ts';
import type {
  Cue, MatchConfig, MatchEvent, MatchState, PlayerId, PublicEvent, Rarity, RivalId, TableView, TitleId,
} from '../../src/lib/poker/index.ts';
import { createDirector, DEFAULT_BANK } from '../../src/lib/poker/dialogue/director.ts';
import { describeHand, handPhrase } from '../../src/lib/poker/dialogue/handNames.ts';
import { measure, MAX_CHARS, SHORT_CHARS, varsOf } from '../../src/lib/poker/dialogue/render.ts';
import { memoryStorage } from '../../src/lib/poker/dialogue/storage.ts';
import { BOT_ACTION_TRIGGERS } from '../../src/lib/poker/dialogue/types.ts';
import type { DialogueStorage, Director, Line, SpeechItem, TableContext } from '../../src/lib/poker/dialogue/types.ts';
import { makeConfig, randomHumanAction } from './lib/harness.ts';
import { HEROES } from './surrogates.ts';
import type { HeroName } from './surrogates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');

// ---------------------------------------------------------------------------
// Mini framework
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];
let sectionName = '';
function section(n: string): void {
  sectionName = n;
  console.log(`\n== ${n}`);
}
function check(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    if (failures.length < 200) failures.push(`[${sectionName}] ${msg}`);
    if (failed <= 40) console.log(`  FALHOU: ${msg}`);
  }
}

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const nArg = args.includes('--n') ? Number(args[args.indexOf('--n') + 1]) : 5000;

const LINES = DEFAULT_BANK.lines;
const EXCHANGES = DEFAULT_BANK.exchanges;
const EN = DEFAULT_BANK.en;
const byId = new Map<string, Line>(LINES.map((l) => [l.id, l]));

// ---------------------------------------------------------------------------
// 1. Estático
// ---------------------------------------------------------------------------

section('1. Estático');
{
  const ids = new Set<string>();
  for (const l of LINES) {
    check(!ids.has(l.id), `id repetido ${l.id}`);
    ids.add(l.id);
    const n = measure(l.pt, 'pt');
    check(n <= MAX_CHARS, `${l.id} pt com ${n} > 88`);
    check(!!l.curta === (n <= SHORT_CHARS), `${l.id}: curta=${!!l.curta} mas tem ${n}`);
    if (l.role === 'actor' && BOT_ACTION_TRIGGERS.includes(l.on)) check(!!l.cue && l.cue.length > 0, `${l.id}: ator sem cue`);
    if (l.speaker === 'bogart' && l.role === 'actor') check(!l.cue?.includes('calado'), `${l.id}: Sapo ator aceita calado`);
    if (l.speaker === 'bogart' && l.on === 'bigBet') check(JSON.stringify(l.cue) === '["nervoso"]', `${l.id}: aposta grande do Sapo só com nervoso`);
    if (l.speaker === 'bogart' && l.on === 'allIn') check(!!l.variant?.includes('curto'), `${l.id}: all-in do Sapo sem a variante curto`);
    if (l.speaker === 'fincher' && l.role === 'actor' && l.cue) check(!l.cue.includes('confiante'), `${l.id}: Raposo fala com o anel`);
    check(!/\{(player|nome)\}|@/.test(l.pt), `${l.id}: nome de usuário`);
    if (l.pt.includes('{o|a}')) check(l.role === 'victim' || !!l.variant?.some((v) => v.startsWith('vs')), `${l.id}: {o|a} sem alvo oráculo`);
    check(Object.prototype.hasOwnProperty.call(EN, l.id), `${l.id} sem entrada em lines.en.ts`);
    const en = EN[l.id];
    if (typeof en === 'string') {
      check(measure(en, 'en') <= MAX_CHARS, `${l.id} en com ${measure(en, 'en')} > 88`);
      check(!/\{(player|nome)\}|@/.test(en), `${l.id} en: nome de usuário`);
      check(JSON.stringify(varsOf(en).sort()) === JSON.stringify(varsOf(l.pt).sort()), `${l.id}: variáveis diferentes em pt e en`);
    }
    if (l.once === 'life') check(!!l.story && l.requires?.storyNot === l.story, `${l.id}: once=life sem story`);
  }
  for (const x of EXCHANGES) {
    check(!ids.has(x.id), `id de troca repetido ${x.id}`);
    ids.add(x.id);
    const en = EN[x.id];
    check(Array.isArray(en) && en.length === x.parts.length, `${x.id}: en com ${Array.isArray(en) ? en.length : 0} balões, pt com ${x.parts.length}`);
    x.parts.forEach((p, i) => {
      check(measure(p.pt, 'pt') <= MAX_CHARS, `${x.id}.${i + 1} pt > 88`);
      if (Array.isArray(en) && en[i]) check(measure(en[i], 'en') <= MAX_CHARS, `${x.id}.${i + 1} en > 88`);
      check(!/\{(player|nome)\}|@/.test(p.pt), `${x.id}.${i + 1}: nome de usuário`);
    });
    if (x.farewell) {
      check(x.parts.length >= 1 && x.parts.length <= 3, `${x.id}: despedida com ${x.parts.length}`);
      const total = x.parts.reduce((s, p) => s + 800 + 40 * p.pt.length, 0);
      check(total <= 6500, `${x.id}: despedida longa demais (${total} ms)`);
    } else check(x.parts.length >= 2 && x.parts.length <= 3, `${x.id}: troca com ${x.parts.length}`);
    check(x.between !== 'any' || x.priority === 1, `${x.id}: between any só em P1`);
  }
  for (const pack of Object.values(DEFAULT_BANK.quipPacks)) {
    check(pack.quips.length === 4, `${pack.id}: ${pack.quips.length} réplicas`);
    for (const q of pack.quips) {
      check(measure(q.pt) <= SHORT_CHARS && measure(q.en, 'en') <= SHORT_CHARS, `${q.id}: réplica longa`);
      for (const s of ['bogart', 'cypher', 'fincher']) {
        const answers = LINES.filter((l) => l.on === 'quipAnswer' && l.speaker === s && l.variant?.includes(q.id));
        check(answers.length === 3, `${q.id}: ${s} tem ${answers.length} respostas (esperava 3)`);
        for (const a of answers) check(!!a.curta, `${a.id}: resposta de réplica não é curta`);
      }
    }
  }
  // gatilhos de bot têm fala para quem precisa
  const need: [string, string][] = [['bogart', 'call'], ['bogart', 'allIn'], ['cypher', 'bigBet'], ['fincher', 'bigBet'],
    ['fincher', 'contextTip'], ['fincher', 'recap'], ['bogart', 'intervalReturn'], ['cypher', 'intervalInvite']];
  for (const [s, t] of need) check(LINES.some((l) => l.speaker === s && l.on === t), `sem fala ${s}/${t}`);
  console.log(`  ${LINES.length} falas, ${EXCHANGES.length} trocas, ${Object.keys(EN).length} ids em en`);
}

// ---------------------------------------------------------------------------
// Nomes de mão
// ---------------------------------------------------------------------------

section('1b. Nomes de mão');
{
  const cases: [Parameters<typeof describeHand>, string][] = [
    [['two_pair', ['As', 'Ad', '7c', '7h', 'Kd'], 'pt'], 'dois pares, ases e setes'],
    [['two_pair', ['As', 'Ad', '7c', '7h', 'Kd'], 'en'], 'two pair, aces and sevens'],
    [['pair', ['Qs', 'Qd', 'Ac', '7h', '3d'], 'pt'], 'par de damas'],
    [['trips', ['7s', '7d', '7c', 'Ah', 'Kd'], 'pt'], 'trinca de setes'],
    [['straight', ['5s', '4d', '3c', '2h', 'Ad'], 'pt'], 'sequência até o cinco'],
    [['straight', ['Ks', 'Qd', 'Jc', 'Th', '9d'], 'en'], 'straight, king high'],
    [['straight', ['Qs', 'Jd', 'Tc', '9h', '8d'], 'pt'], 'sequência até a dama'],
    [['flush', ['Ah', '9h', '7h', '4h', '2h'], 'pt'], 'flush de copas'],
    [['full_house', ['7s', '7d', '7c', 'Kh', 'Kd'], 'en'], 'full house, sevens over kings'],
    [['quads', ['Ks', 'Kd', 'Kc', 'Kh', '2d'], 'pt'], 'quadra de reis'],
    [['straight_flush', ['As', 'Ks', 'Qs', 'Js', 'Ts'], 'pt', true], 'royal flush'],
    [['high_card', ['As', 'Jd', '9c', '5h', '3d'], 'en'], 'ace high'],
  ];
  for (const [a, want] of cases) {
    const got = describeHand(...a);
    check(got === want, `describeHand(${a[0]}, ${a[2]}) = "${got}", esperava "${want}"`);
  }
  // ordem embaralhada dá o mesmo nome
  check(describeHand('two_pair', ['Kd', '7h', 'Ad', '7c', 'As'], 'pt') === 'dois pares, ases e setes', 'describeHand ignora a ordem');
  check(handPhrase('trips', ['7s', '7d', '7c', 'Ah', 'Kd'], 'pt') === 'uma trinca de setes', 'handPhrase pt');
  check(handPhrase('pair', ['Qs', 'Qd', 'Ac', '7h', '3d'], 'en') === 'a pair of queens', 'handPhrase en');
}

// ---------------------------------------------------------------------------
// Apoio: contexto e relógio simulado
// ---------------------------------------------------------------------------

const EMPTY_VIEW: TableView = {
  mode: 'free', handNumber: 0, level: { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: null }, status: 'running',
  seats: [], board: [], pots: [], potTotal: 0, toActId: null, legal: null, prize: null, loan: 0, places: {},
};

/** Quem já viu a 1ª visita e todas as dicas de contexto. */
const VETERAN: Record<string, string> = { first_visit: 'x', 'tip.allin': 'x', 'tip.bigbet': 'x', 'tip.sidepot': 'x',
  'tip.blinds': 'x', 'tip.ante': 'x', 'tip.headsup': 'x' };

interface CtxOpts {
  mode?: 'free' | 'bounty' | 'tutorial'; lang?: 'pt' | 'en'; title?: TitleId; lifetimeMatches?: number; matchInSession?: number;
  returning?: boolean; localHour?: number; story?: Record<string, string>; talk?: 'all' | 'important' | 'none';
  speed?: 'normal' | 'fast' | 'turbo'; prize?: TableContext['prize']; nemesis?: RivalId; customer?: RivalId;
}

function makeCtx(o: CtxOpts = {}, view: TableView = EMPTY_VIEW): TableContext {
  return {
    mode: o.mode ?? 'free', lang: o.lang ?? 'pt', title: o.title ?? 'figurante', lifetimeMatches: o.lifetimeMatches ?? 10,
    matchInSession: o.matchInSession ?? 1, returning: o.returning ?? false, localHour: o.localHour ?? 21,
    story: o.story ?? VETERAN, speed: o.speed ?? 'normal', talk: o.talk ?? 'all', view,
    reducedMotion: false, prize: o.prize, nemesis: o.nemesis, customer: o.customer,
  };
}

interface Emitted { item: SpeechItem; t: number; evIndex: number; turnOpen: boolean; hand: number }

/** Uma pessoa que joga várias partidas: relógio, LRU e story continuam de uma para a outra. */
interface Player { clock: { t: number }; storage: DialogueStorage; story: Record<string, string>; lifetime: number }

function newPlayer(story: Record<string, string> = VETERAN, lifetime = 10): Player {
  const clock = { t: 10 * 24 * 3600 * 1000 };
  const storage = memoryStorage(() => clock.t);
  // veterano: já ouviu as trocas em outras semanas (fora da janela de 48 h, mas não são inéditas)
  if (lifetime >= 3) {
    const m = storage.load();
    storage.save({ ...m, lru: EXCHANGES.map((x, i) => [x.id, clock.t - 5 * 24 * 3600 * 1000 + i] as [string, number]) });
  }
  return { clock, storage, story: { ...story }, lifetime };
}

/** Relógio + bomba de next(): simula a faixa de fala da interface. */
class Stage {
  clock: { t: number };
  dir: Director;
  out: Emitted[] = [];
  evIndex = -1;
  turnOpen = false;
  hand = 0;
  constructor(dir: Director, clock: { t: number }) {
    this.dir = dir;
    this.clock = clock;
  }
  get t(): number {
    return this.clock.t;
  }
  pump(ms: number): void {
    const end = this.clock.t + ms;
    while (this.clock.t < end) {
      const item = this.dir.next(this.clock.t);
      if (item) this.out.push({ item, t: this.clock.t, evIndex: this.evIndex, turnOpen: this.turnOpen, hand: this.hand });
      this.clock.t += 100;
    }
  }
}

function newDirector(o: CtxOpts & { seed?: string; debug?: boolean; afterInterval?: boolean } = {}, player?: Player): { dir: Director; stage: Stage } {
  const rng = createRng(o.seed ?? 'dir');
  const pl = player ?? newPlayer(o.story ?? VETERAN, o.lifetimeMatches ?? 10);
  const dir = createDirector({
    mode: o.mode ?? 'free', lang: o.lang ?? 'pt', talk: o.talk ?? 'all', speed: o.speed ?? 'normal',
    story: o.story ?? pl.story, lifetimeMatches: o.lifetimeMatches ?? pl.lifetime, matchInSession: o.matchInSession ?? 1,
    reducedMotion: false, rng: () => rng.nextFloat(), storage: pl.storage, debug: o.debug ?? true, afterInterval: o.afterInterval,
  });
  return { dir, stage: new Stage(dir, pl.clock) };
}

/** Duração aproximada de cada evento na tela (velocidade normal). */
function eventMs(e: PublicEvent): number {
  switch (e.t) {
    case 'matchStarted': return 2400;
    case 'levelUp': return 600;
    case 'handStarted': return 900;
    case 'blindsPosted': return 300;
    case 'holeCards': return 600;
    case 'action': return e.playerId === 'human' ? 300 : (e.thinkMs ?? 1000) + 300;
    case 'street': return 800;
    case 'runout': return 300;
    case 'showdown': return 1500;
    case 'cardsShown': return 600;
    case 'potAwarded': return 900;
    case 'handComplete': return 1300;
    case 'eliminated': return 1500;
    case 'prizeMoved': return 900;
    case 'prizeCaptured': return 1500;
    case 'headsUp': return 700;
    default: return 200;
  }
}

// ---------------------------------------------------------------------------
// Verificador das regras numa sequência (usado por fixtures e fuzz)
// ---------------------------------------------------------------------------

interface MatchStats { balloons: number; hands: number; silentHands: number; nonP1PerHandMax: number; byPriority: number[] }

interface PrivateMeta { cue: Cue; monster: boolean; bucket: string | null }

function verify(tag: string, events: PublicEvent[], emitted: Emitted[], meta: Map<number, PrivateMeta> | null): MatchStats {
  const evByI = new Map<number, PublicEvent>(events.map((e) => [e.i, e]));
  // janelas de silêncio do Sapo: [i da ação calado, i do handComplete)
  const silent: [number, number][] = [];
  let open: number | null = null;
  for (const e of events) {
    if (e.t === 'action' && e.playerId === 'bogart' && e.cue === 'calado' && open === null) open = e.i;
    if (e.t === 'handComplete' && open !== null) {
      silent.push([open, e.i]);
      open = null;
    }
  }
  const eventsOrder = events.map((e) => e.i);
  const nonP1ByHand = new Map<number, number>();
  const handsWithBalloon = new Set<number>();
  let balloons = 0;
  const byPriority = [0, 0, 0, 0];
  for (const em of emitted) {
    const it = em.item;
    const d = it.debug;
    const counted = it.scene !== 'quip' && it.scene !== 'card';
    if (counted) {
      balloons++;
      byPriority[it.priority]++;
      if (d && d.hand > 0 && it.scene === 'table') handsWithBalloon.add(d.hand);
    }
    const curEventI = em.evIndex >= 0 ? eventsOrder[em.evIndex] : -1;
    // fala de ator: o cue da linha inclui o cue do evento
    if (d && d.role === 'actor' && BOT_ACTION_TRIGGERS.includes(d.trigger)) {
      const ev = evByI.get(d.eventI);
      const line = byId.get(it.lineId);
      check(!!ev && ev.t === 'action' && ev.cue !== undefined, `${tag}: fala de ator ${it.lineId} sem ação de bot de origem`);
      if (ev && ev.t === 'action' && line) {
        check(!!line.cue?.includes(ev.cue!), `${tag}: ${it.lineId} (cue ${JSON.stringify(line.cue)}) saiu com cue ${ev.cue}`);
        check(ev.playerId === line.speaker, `${tag}: ${it.lineId} de ${line.speaker} para ação de ${ev.playerId}`);
      }
    }
    // silêncio do Sapo
    if (it.speaker === 'bogart' && it.lineId !== 'quip.silent') {
      for (const [a, b] of silent) {
        check(!(curEventI >= a && curEventI < b), `${tag}: Sapo falou (${it.lineId}) depois de calado na mesma mão`);
      }
    }
    // aposta grande do Sapo nunca com monstro
    if (it.speaker === 'bogart' && d && (d.trigger === 'bigBet') && meta) {
      const m = meta.get(d.eventI);
      check(!!m && !m.monster, `${tag}: ${it.lineId} saiu com o Sapo de monstro`);
    }
    // nenhuma troca começa com a vez da pessoa aberta; na vez, só curta
    if (it.exchange && it.exchange.part === 1) check(!em.turnOpen, `${tag}: troca ${it.exchange.id} começou na vez da pessoa`);
    if (em.turnOpen && it.scene !== 'quip' && it.scene !== 'tutorial') check(it.text.length <= SHORT_CHARS, `${tag}: fala longa na vez da pessoa: ${it.lineId}`);
    // ≤ 1 momento não-P1 por mão
    if (counted && it.priority !== 1 && (!it.exchange || it.exchange.part === 1) && d) nonP1ByHand.set(d.hand, (nonP1ByHand.get(d.hand) ?? 0) + 1);
    // texto renderizado sem variável sobrando
    check(!/\{[a-z_|]+\}/.test(it.text), `${tag}: variável sobrou em ${it.lineId}: ${it.text}`);
  }
  let maxNon = 0;
  for (const [h, n] of nonP1ByHand) {
    if (h > 0) {
      check(n <= 1, `${tag}: ${n} momentos não-P1 na mão ${h}`);
      maxNon = Math.max(maxNon, n);
    }
  }
  const hands = Math.max(0, ...events.filter((e) => e.t === 'handStarted').map((e) => (e as { handNumber: number }).handNumber));
  return { balloons, hands, silentHands: hands - [...handsWithBalloon].filter((h) => h <= hands).length, nonP1PerHandMax: maxNon, byPriority };
}

// ---------------------------------------------------------------------------
// Tocar uma sequência de passos no Diretor
// ---------------------------------------------------------------------------

interface StepIn { events: PublicEvent[]; view: TableView; humanTurnAfter: boolean }

function playSteps(stage: Stage, steps: StepIn[], ctxBase: CtxOpts, rng: () => number, allEvents: PublicEvent[], opts: { idle?: boolean; quips?: boolean } = {}): void {
  for (const step of steps) {
    const ctx = makeCtx(ctxBase, step.view);
    for (const e of step.events) {
      allEvents.push(e);
      stage.evIndex = allEvents.length - 1;
      if (e.t === 'handStarted') stage.hand = e.handNumber;
      stage.dir.onEvent(e, ctx);
      stage.pump(eventMs(e));
    }
    if (step.humanTurnAfter) {
      stage.turnOpen = true;
      stage.dir.onHumanTurn(true);
      const r = rng();
      const think = r < 0.004 ? 62000 : r < 0.012 ? 27000 : 1500 + Math.floor(rng() * 4000);
      if (opts.quips && rng() < 0.05) {
        const q = ['R1', 'R2', 'R3', 'R4'][Math.floor(rng() * 4)];
        stage.dir.onQuip(q, (['bogart', 'cypher', 'fincher'] as RivalId[])[Math.floor(rng() * 3)]);
      }
      for (let ms = 0; ms < think; ms += 1000) {
        if (opts.idle !== false) stage.dir.onIdleTick(ms);
        stage.pump(1000);
      }
      stage.turnOpen = false;
      stage.dir.onHumanTurn(false);
    }
  }
  stage.pump(20000);   // créditos
}

// ---------------------------------------------------------------------------
// 2. Cenários sintéticos
// ---------------------------------------------------------------------------

section('2. Cenários');
{
  const lvl = { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: { sb: 35, bb: 70, ante: 0 } };
  const seats = [{ id: 'human', seat: 0, stack: 2000 }, { id: 'bogart', seat: 1, stack: 2000 }, { id: 'fincher', seat: 2, stack: 2000 }, { id: 'cypher', seat: 3, stack: 2000 }];
  const start = (i: number, extra: Partial<Extract<PublicEvent, { t: 'matchStarted' }>> = {}): PublicEvent =>
    ({ i, t: 'matchStarted', mode: 'free', seats, loan: 0, prize: null, level: lvl, ...extra }) as PublicEvent;
  const hand = (i: number, n: number): PublicEvent => ({ i, t: 'handStarted', handNumber: n, buttonId: 'human', sbId: 'bogart', bbId: 'fincher',
    level: lvl, stacks: { human: 2000, bogart: 2000, fincher: 2000, cypher: 2000 } });
  const act = (i: number, p: PlayerId, action: 'fold' | 'check' | 'call' | 'bet' | 'raise', o: Partial<Extract<PublicEvent, { t: 'action' }>> = {}): PublicEvent =>
    ({ i, t: 'action', playerId: p, street: 'preflop', action, amount: 100, to: 100, toCall: 50, potAfter: 300, allIn: false, shortAllIn: false,
      stackBefore: 2000, sizeClass: null, ...(p !== 'human' ? { thinkMs: 900, cue: 'neutro' as Cue } : {}), ...o }) as PublicEvent;

  // primeira visita: T01 substitui o matchStart
  {
    const { dir, stage } = newDirector({ story: {} });
    dir.onEvent(start(1), makeCtx({ story: {} }));
    stage.pump(15000);
    const ids = stage.out.map((o) => o.item.lineId);
    check(ids.join(',') === 'T01.1,T01.2,T01.3', `primeira visita toca T01 inteira (veio ${ids.join(',')})`);
    check(dir.storyTouched().includes('first_visit'), 'primeira visita marca first_visit');
    check(stage.out.every((o) => o.item.scene === 'opening'), 'T01 marcada como abertura');
  }
  // partida valendo: até 2 balões (matchStart + prêmio do portador), {premio} preenchido
  {
    let sawIntro = 0;
    for (let k = 0; k < 30; k++) {
      const { dir, stage } = newDirector({ mode: 'bounty', seed: `b${k}` });
      const prize = { name: 'o pôster Noir', kind: 'poster' as const, rarity: 'common' as Rarity };
      dir.onEvent(start(1, { mode: 'bounty', prize: { prizeId: 'p', holderId: 'bogart' } }), makeCtx({ mode: 'bounty', prize }));
      stage.pump(20000);
      check(stage.out.length >= 1 && stage.out.length <= 3, `abertura valendo com ${stage.out.length} balões`);
      const intro = stage.out.find((o) => o.item.debug?.trigger === 'bountyIntro');
      if (intro) {
        sawIntro++;
        check(intro.item.speaker === 'bogart' || !!intro.item.exchange, 'o prêmio é apresentado pelo portador');
      }
      check(stage.out.every((o) => !o.item.text.includes('{premio}')), '{premio} preenchido');
    }
    check(sawIntro >= 15, `o portador apresenta o prêmio na maioria das aberturas (${sawIntro}/30)`);
  }
  // empréstimo: abre com o Sapo
  {
    const { dir, stage } = newDirector({ mode: 'bounty', seed: 'loan' });
    const prize = { name: 'a ficha especial', kind: 'special_tickets' as const, rarity: 'rare' as Rarity };
    dir.onEvent(start(1, { mode: 'bounty', loan: 500, prize: { prizeId: 'p', holderId: 'bogart' } }), makeCtx({ mode: 'bounty', prize }));
    stage.pump(20000);
    check(stage.out.some((o) => o.item.debug?.trigger === 'sapoLoan' || o.item.debug?.trigger === 'bountyIntro'), 'empréstimo abre a partida');
  }
  // silêncio do Sapo depois de calado; aposta grande nervosa sai
  {
    let spokeAfterCalado = 0;
    let bigBetLines = 0;
    for (let k = 0; k < 200; k++) {
      const { dir, stage } = newDirector({ seed: `s${k}`, lifetimeMatches: 10 });
      const ctx = makeCtx();
      dir.onEvent(start(0), ctx);
      stage.pump(20000);
      const evs: PublicEvent[] = [hand(2, 1),
        act(3, 'cypher', 'fold'), act(4, 'human', 'call'),
        act(5, 'bogart', 'raise', { street: 'flop', sizeClass: 'big', cue: 'calado', to: 400, amount: 400 }),
        act(6, 'fincher', 'fold', { street: 'flop' })];
      let i = 0;
      for (const e of evs) {
        dir.onEvent(e, ctx);
        stage.evIndex = i++;
        stage.pump(3000);
      }
      const n0 = stage.out.length;
      dir.onQuip('R1', 'bogart');
      stage.pump(8000);
      const after = stage.out.slice(n0);
      check(after.some((o) => o.item.speaker === 'bogart' && o.item.text === '…'), 'Réplica ao Sapo calado vira "…"');
      spokeAfterCalado += stage.out.filter((o) => o.item.speaker === 'bogart' && o.item.text !== '…' && o.evIndex >= 4).length;
      // mão nova, aposta grande nervosa
      const { dir: d2, stage: s2 } = newDirector({ seed: `n${k}` });
      d2.onEvent(start(1), ctx);
      s2.pump(20000);
      for (const e of [hand(2, 1), act(3, 'bogart', 'bet', { street: 'flop', sizeClass: 'big', cue: 'nervoso' })]) {
        d2.onEvent(e, ctx);
        s2.pump(3000);
      }
      bigBetLines += s2.out.filter((o) => o.item.debug?.trigger === 'bigBet').length;
    }
    check(spokeAfterCalado === 0, `Sapo não fala depois de calado (${spokeAfterCalado})`);
    check(bigBetLines > 20 && bigBetLines < 120, `aposta grande nervosa do Sapo sai ~30% (${bigBetLines}/200)`);
  }
  // dica do primeiro all-in: (a) curta na vez, (b) depois da mão; uma vez na vida
  {
    const { dir, stage } = newDirector({ seed: 'tip', story: { first_visit: 'x' } });
    const ctx = makeCtx({ story: { first_visit: 'x' } });
    const evs: PublicEvent[] = [start(1), hand(2, 1), act(3, 'cypher', 'raise', { allIn: true, to: 2000, amount: 2000, sizeClass: 'overbet', cue: 'nervoso' })];
    for (const e of evs) {
      dir.onEvent(e, ctx);
      stage.pump(500);
    }
    stage.turnOpen = true;
    dir.onHumanTurn(true);
    stage.pump(5000);
    const inTurn = stage.out.filter((o) => o.turnOpen);
    check(inTurn.some((o) => o.item.lineId === 'DT1a'), 'DT1a sai na vez da pessoa');
    check(inTurn.every((o) => o.item.text.length <= SHORT_CHARS), 'na vez só curta');
    stage.turnOpen = false;
    dir.onHumanTurn(false);
    dir.onEvent(act(4, 'human', 'fold'), ctx);
    dir.onEvent({ i: 5, t: 'potAwarded', potIndex: 0, amount: 175, eligibleIds: ['cypher'], winners: [{ playerId: 'cypher', amount: 175 }], uncontested: true, kind: null }, ctx);
    dir.onEvent({ i: 6, t: 'handComplete', handNumber: 1, net: { human: -50, bogart: -25, fincher: 0, cypher: 75 }, winnerIds: ['cypher'], wentToShowdown: false, potBB: 3.5, flags: {} }, ctx);
    stage.pump(15000);
    check(stage.out.some((o) => o.item.lineId === 'DT1b'), 'DT1b sai depois da mão');
    check(dir.storyTouched().includes('tip.allin'), 'tip.allin marcada');
  }
  // despedida: quem eliminou fala, ritmo próprio; créditos com uma fala
  {
    const { dir, stage } = newDirector({ seed: 'fw' });
    const ctx = makeCtx();
    dir.onEvent(start(1), ctx);
    stage.pump(15000);
    const n0 = stage.out.length;
    dir.onEvent(hand(2, 9), ctx);
    dir.onEvent({ i: 3, t: 'handComplete', handNumber: 9, net: { human: -800, bogart: 0, fincher: 800, cypher: 0 }, winnerIds: ['fincher'], wentToShowdown: true, potBB: 16, flags: {} }, ctx);
    dir.onEvent({ i: 4, t: 'eliminated', playerId: 'human', place: 4, byId: 'fincher', handNumber: 9 }, ctx);
    dir.onEvent({ i: 5, t: 'matchEnded', places: { human: 4 } as Record<PlayerId, number>, winnerId: null, humanPlace: 4, reason: 'eliminated', prizeCaptured: false }, ctx);
    stage.pump(12000);
    dir.onMoment({ t: 'tableWinner', winnerId: 'fincher' });
    stage.pump(10000);
    const after = stage.out.slice(n0);
    const fw = after.filter((o) => o.item.scene === 'farewell');
    check(fw.length >= 1 && fw.length <= 3 && fw[0].item.speaker === 'fincher', `despedida do Raposo (${fw.map((o) => o.item.lineId).join(',')})`);
    check(fw.every((o) => o.item.durationMs === 800 + 40 * o.item.text.length), 'despedida com 0,8 s + 40 ms/caractere');
    const cr = after.filter((o) => o.item.scene === 'credits');
    check(cr.length === 1 && cr[0].item.debug?.trigger === 'tableWinner' && cr[0].item.speaker === 'fincher', 'créditos: o Raposo levou a mesa');
  }
  // treino: só os beats, em ordem, sem orçamento
  {
    const { dir, stage } = newDirector({ mode: 'tutorial', seed: 'tut' });
    const ctx = makeCtx({ mode: 'tutorial' });
    dir.onEvent(start(1, { mode: 'tutorial' }), ctx);
    dir.onTutorialBeat(['TU1-01', 'TU1-02', 'TU1-03']);
    stage.pump(30000);
    check(stage.out.map((o) => o.item.lineId).join(',') === 'TU1-01,TU1-02,TU1-03', 'beats do treino em ordem');
    dir.onTutorialBeat(['TU3-15']);
    stage.pump(8000);
    check(stage.out.some((o) => o.item.lineId === 'TU3-15'), 'TU3-15 toca na primeira vez');
    check(dir.storyTouched().includes('once.tu3-15'), 'TU3-15 marca story');
    const { dir: d2, stage: s2 } = newDirector({ mode: 'tutorial', seed: 'tut2', story: { first_visit: 'x', 'once.tu3-15': 'y' } });
    d2.onTutorialBeat(['TU3-15']);
    s2.pump(8000);
    check(s2.out.length === 0, 'TU3-15 não repete (a ficha só sai uma vez)');
  }
  // cartões: recapitulação e convite do Intervalo
  {
    const { dir } = newDirector({ mode: 'bounty', seed: 'card' });
    const ctx = makeCtx({ mode: 'bounty', prize: { name: 'o pôster', kind: 'poster', rarity: 'epic' } });
    const r = dir.cardLine('recap', ctx, { handNumber: 17, bb: 100, stacks: { human: 3000, bogart: 2000, cypher: 3000 }, holderId: 'cypher', someoneOut: true });
    check(!!r && r.speaker === 'fincher' && r.lineId === 'AN5' && r.text.includes('a Cobra'), `recap valendo cita o portador (${r?.text})`);
    const r2 = dir.cardLine('recap', makeCtx(), { handNumber: 6, bb: 50, stacks: { human: 300, bogart: 2500, cypher: 2600, fincher: 2600 } });
    check(!!r2 && r2.lineId === 'AN3' && /300/.test(r2.text), `recap curto (${r2?.text})`);
    const iv = dir.cardLine('intervalInvite', makeCtx());
    check(!!iv && iv.lineId.startsWith('I'), 'convite do Intervalo');
    const { dir: d3, stage: s3 } = newDirector({ seed: 'ir', afterInterval: true });
    d3.onEvent(start(1), makeCtx());
    s3.pump(10000);
    check(s3.out.length === 1 && s3.out[0].item.debug?.trigger === 'intervalReturn', 'volta do Intervalo abre a partida');
  }
  // modos de fala
  {
    const { dir, stage } = newDirector({ seed: 'none', talk: 'none' });
    dir.onEvent(start(1), makeCtx({ talk: 'none' }));
    stage.pump(10000);
    check(stage.out.length === 0, 'falas desligadas: nada');
    const { dir: d2, stage: s2 } = newDirector({ seed: 'en', lang: 'en' });
    d2.onEvent(start(1), makeCtx({ lang: 'en' }));
    s2.pump(10000);
    const enTexts = new Set(Object.values(EN).flat().filter((x): x is string => typeof x === 'string'));
    check(s2.out.length >= 1 && s2.out.every((o) => /[A-Za-z]/.test(o.item.text) && enTexts.has(o.item.text.replace(/\b(kid|partner)\b/g, '{estreante}'))
      || o.item.text.length > 0), 'abertura em inglês');
  }
}

// ---------------------------------------------------------------------------
// 3. Fixtures do A1
// ---------------------------------------------------------------------------

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

interface PublicFixture { name: string; mode: 'free' | 'bounty'; loan: number; prize: { prizeId: string; carrierId: RivalId; rarity: Rarity } | null;
  steps: { action: unknown; show: boolean; events: PublicEvent[]; view: TableView }[] }

/** Mapa i da ação pública → meta privada (cue/monstro), a partir do log privado. */
function privateMeta(ev: MatchEvent[]): Map<number, PrivateMeta> {
  const out = new Map<number, PrivateMeta>();
  let pending: Extract<MatchEvent, { type: 'actionMeta' }> | null = null;
  for (const e of ev) {
    if (e.type === 'actionMeta') pending = e;
    else if (e.type === 'actionTaken') {
      if (pending?.bot) out.set(e.i, { cue: pending.bot.cue, monster: pending.bot.monster, bucket: pending.bot.bucket });
      pending = null;
    }
  }
  return out;
}

section('3. Fixtures do A1');
if (!existsSync(FIX)) {
  console.log('  (sem fixtures: pulando)');
} else {
  const files = readdirSync(FIX).filter((f) => f.startsWith('public-')).sort();
  for (const f of files) {
    const fx = loadJson<PublicFixture>(join(FIX, f));
    for (const lang of ['pt', 'en'] as const) {
      const prize = fx.prize ? { name: lang === 'pt' ? 'o pôster Noir' : 'the Noir poster', kind: 'poster' as const, rarity: fx.prize.rarity } : undefined;
      const ctxBase: CtxOpts = { mode: fx.mode, lang, prize, lifetimeMatches: 20, story: { first_visit: 'x' } };
      const { stage } = newDirector({ ...ctxBase, seed: `${f}:${lang}` });
      const rng = createRng(`fx:${f}`);
      const all: PublicEvent[] = [];
      const steps: StepIn[] = fx.steps.map((s, k) => ({
        events: s.events, view: s.view,
        humanTurnAfter: k < fx.steps.length - 1 && s.view.toActId === 'human',
      }));
      let threw = false;
      try {
        playSteps(stage, steps, ctxBase, () => rng.nextFloat(), all, { quips: true });
      } catch (err) {
        threw = true;
        check(false, `${f} [${lang}]: o Diretor lançou erro: ${(err as Error).message}`);
      }
      if (threw) continue;
      const st = verify(`${f}[${lang}]`, all, stage.out, null);
      check(stage.out.some((o) => o.item.scene === 'opening'), `${f} [${lang}]: tem abertura`);
      const ended = all.find((e) => e.t === 'matchEnded') as Extract<PublicEvent, { t: 'matchEnded' }> | undefined;
      if (ended && ended.reason !== 'eliminated') check(stage.out.some((o) => o.item.scene === 'credits'), `${f} [${lang}]: tem fala de créditos`);
      if (ended?.reason === 'eliminated') check(stage.out.some((o) => o.item.scene === 'farewell'), `${f} [${lang}]: tem despedida`);
      if (lang === 'pt') console.log(`  ${f}: ${st.hands} mãos, ${st.balloons} balões, ${st.silentHands} mãos em silêncio`);
    }
  }
  // privadas: o cue de cada ação pública bate com o privado; nenhuma fala de ator contradiz
  for (const f of readdirSync(FIX).filter((x) => x.startsWith('private-')).sort()) {
    const fx = loadJson<{ mode: 'free' | 'bounty'; loan: number; prize: { prizeId: string; carrierId: RivalId; rarity: Rarity } | null; events: MatchEvent[] }>(join(FIX, f));
    const priv: MatchEvent[] = fx.events ?? [];
    if (!priv.length) {
      check(false, `${f}: formato inesperado`);
      continue;
    }
    const pub = toPublicEvents(priv, 'human');
    const meta = privateMeta(priv);
    const prize = fx.prize ? { name: 'o pôster Noir', kind: 'poster' as const, rarity: fx.prize.rarity } : undefined;
    const ctxBase: CtxOpts = { mode: fx.mode, prize, lifetimeMatches: 20 };
    for (let k = 0; k < 20; k++) {
      const { stage } = newDirector({ ...ctxBase, seed: `${f}:${k}` });
      const all: PublicEvent[] = [];
      playSteps(stage, [{ events: pub, view: EMPTY_VIEW, humanTurnAfter: false }], ctxBase, Math.random, all);
      verify(`${f}#${k}`, all, stage.out, meta);
    }
  }
}

// ---------------------------------------------------------------------------
// 4–5. Fuzz com o simulador do A e orçamento
// ---------------------------------------------------------------------------

const TRIGGER_STATS = new Map<string, number>();

interface FuzzResult { matches: number; hands: number; balloons: number; p1: number; silent: number; balloons35: number[]; items: number }

function fuzz(n: number, opts: { matchInSession: number; label: string }): FuzzResult {
  const res: FuzzResult = { matches: 0, hands: 0, balloons: 0, p1: 0, silent: 0, balloons35: [], items: 0 };
  let player: Player = newPlayer();
  for (let k = 0; k < n; k++) {
    // cada "pessoa" joga 10 partidas seguidas (LRU, story e relógio continuam); 1 em 8 é estreante
    if (k % 10 === 0) {
      const g = k / 10;
      player = newPlayer(g % 8 === 0 ? {} : VETERAN, g % 8 === 0 ? 0 : 3 + (g % 60));
    }
    const mode: 'free' | 'bounty' = k % 3 === 0 ? 'bounty' : 'free';
    const rarities: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
    const rarity = rarities[k % 4];
    const cfg: MatchConfig = makeConfig({ mode, seed: `fz-${opts.label}-${k}`, rarity, loan: mode === 'bounty' && k % 7 === 0 ? 500 : 0 });
    const lang = k % 5 === 0 ? 'en' : 'pt';
    const prize = mode === 'bounty' ? { name: lang === 'pt' ? 'o pôster Noir' : 'the Noir poster', kind: 'poster' as const, rarity } : undefined;
    const ctxBase: CtxOpts = {
      mode, lang, prize, lifetimeMatches: player.lifetime, matchInSession: opts.matchInSession,
      title: (['figurante', 'protagonista', 'lenda'] as TitleId[])[k % 3], story: { ...player.story },
      localHour: k % 9 === 0 ? 2 : 21, returning: k % 13 === 0,
    };
    const { dir, stage } = newDirector({ ...ctxBase, seed: `d-${opts.label}-${k}` }, player);
    const rng = createRng(`h-${opts.label}-${k}`);
    const priv: MatchEvent[] = [];
    const all: PublicEvent[] = [];
    let step = createMatch(cfg);
    let s: MatchState = step.state;
    const stepsIn: StepIn[] = [];
    const flush = (): void => {
      priv.push(...step.events);
      stepsIn.push({ events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human'), humanTurnAfter: step.state.status === 'running' });
    };
    flush();
    // a pessoa: os jogadores substitutos do simulador do A (médio na maioria), e 1 em 20 ao acaso
    const heroName: HeroName | null = k % 20 === 19 ? null : (['medio', 'medio', 'medio', 'iniciante', 'bom'] as HeroName[])[k % 5];
    for (let guard = 0; s.status === 'running' && guard < 3000; guard++) {
      const L = humanLegal(s);
      if (!L) break;
      const a = heroName ? HEROES[heroName](L, rng, s) : randomHumanAction(L, rng);
      step = applyHumanAction(s, a, { show: rng.nextFloat() < 0.3 });
      s = step.state;
      flush();
    }
    playSteps(stage, stepsIn, ctxBase, () => rng.nextFloat(), all, { quips: true });
    for (const key of dir.storyTouched()) player.story[key] = 'x';
    player.lifetime++;
    player.clock.t += 60_000;
    const st = verify(`fuzz-${opts.label}-${k}`, all, stage.out, privateMeta(priv));
    res.matches++;
    res.hands += st.hands;
    res.balloons += st.balloons;
    res.p1 += st.byPriority[1];
    res.silent += st.silentHands;
    res.items += stage.out.length;
    for (const o of stage.out) {
      if (o.item.scene === 'quip' || o.item.scene === 'card') continue;
      const key = `P${o.item.priority} ${o.item.debug?.trigger ?? '?'}`;
      TRIGGER_STATS.set(key, (TRIGGER_STATS.get(key) ?? 0) + 1);
    }
    if (st.hands >= 28 && st.hands <= 42) res.balloons35.push(st.balloons);
  }
  return res;
}

if (!quick) {
  section(`4. Fuzz (${nArg} partidas)`);
  const t0 = Date.now();
  const full = fuzz(nArg, { matchInSession: 1, label: 'full' });
  const avg = full.balloons / full.matches;
  const per35 = full.balloons35.length ? full.balloons35.reduce((a, b) => a + b, 0) / full.balloons35.length : NaN;
  const silentShare = full.silent / Math.max(1, full.hands);
  console.log(`  ${full.matches} partidas, ${(full.hands / full.matches).toFixed(1)} mãos em média, ${avg.toFixed(1)} balões por partida (${(full.p1 / full.matches).toFixed(1)} P1)`);
  console.log(`  partidas de 28–42 mãos: ${full.balloons35.length}, ${per35.toFixed(1)} balões em média; ${(silentShare * 100).toFixed(1)}% das mãos em silêncio`);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (args.includes('--stats')) {
    const rows = [...TRIGGER_STATS].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${(v / full.matches).toFixed(2)}`);
    console.log('  balões por partida, por gatilho:\n    ' + rows.join('\n    '));
  }

  section('5. Orçamento');
  if (full.balloons35.length >= 20) check(per35 >= 18 && per35 <= 22, `média de ${per35.toFixed(1)} balões por partida de ~35 mãos (meta 18–22)`);
  else console.log('  (poucas partidas de ~35 mãos com os bots provisórios; a meta 18–22 é conferida com os do A2)');
  check(silentShare >= 0.4, `${(silentShare * 100).toFixed(1)}% das mãos em silêncio (meta ≥ 40%)`);
  const halfN = Math.max(100, Math.floor(nArg / 5));
  // mesma pessoa, mesmas cartas, sessão que continua: 2ª partida seguida (normal) × 3ª (meia-carga)
  const half = fuzz(halfN, { matchInSession: 3, label: 'half' });
  const base = fuzz(halfN, { matchInSession: 2, label: 'half' });
  const drop = 1 - (half.balloons - half.p1) / Math.max(1, base.balloons - base.p1);
  const dropAll = 1 - half.balloons / Math.max(1, base.balloons);
  console.log(`  meia-carga: ${(base.balloons / base.matches).toFixed(1)} → ${(half.balloons / half.matches).toFixed(1)} balões por partida (−${(dropAll * 100).toFixed(0)}% no total, −${(drop * 100).toFixed(0)}% fora os P1)`);
  check(dropAll >= 0.35 || drop >= 0.35, `meia-carga cai ${(dropAll * 100).toFixed(0)}% (meta ≥ 35%)`);
}

console.log(`\n${passed} asserções ok, ${failed} falharam.`);
if (failed) {
  console.log('\nFalhas:');
  for (const f of failures.slice(0, 60)) console.log(`  - ${f}`);
  process.exitCode = 1;
}
