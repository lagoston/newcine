/**
 * Teste do Diretor de falas e do banco (SPEC §6.6, pacote B).
 *
 *   node scripts/poker/test-dialogue.ts                 estático + cenários + fixtures + fuzz (5.000 partidas)
 *   node scripts/poker/test-dialogue.ts --n 500         fuzz menor
 *   node scripts/poker/test-dialogue.ts --quick         sem o fuzz (o de torneio roda com 45 partidas)
 *   node scripts/poker/test-dialogue.ts --tn 450        tamanho do fuzz de torneio
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
 *
 * Pôster Poker (pacote H, 03/11/2026):
 * 1c. Estático: cada efeito tem explicação (P1, `fx.<efeito>`) e reações dos três; variáveis
 *     certas por efeito; tique e carta aberta curtos; fala de ator do tique com cue.
 * 2b. Cenários: abertura por raridade (cerimônia do lendário), pôster apostado, caixinha da
 *     Cobra, explicação na 1ª vez e só nela, Cassino na abertura, Onze Homens no meio da mão
 *     com o Sapo calado e o Raposo no anel, o tique (antes e depois da aposta), bônus, carta
 *     aberta, créditos (vitória, derrota, desistência), recapitulação.
 * 4b. Fuzz de torneio: partidas com os 9 efeitos (motor do E se já lança efeitos; senão,
 *     efeitos injetados nas partidas do simulador), com as regras de sempre e as do pôster.
 *
 * Mesa com amigos e casual de devolução (pacote H3, 03/11/2026):
 * 1d. Estático: falas para cada oráculo em cada situação (qualquer um pode ser o único
 *     sentado), sem gênero/nome para a outra pessoa, citação de oráculo só nas falas sobre a
 *     ausência dele, curtas onde cabem na vez, provocação da devolução sem explicar nada.
 * 6.  Cenários: 2, 3 e 4 pessoas (oráculo sem lugar nunca fala, nem na Réplica), cada aparelho
 *     só se vê como a visita, amigo tirando amigo, a visita caindo para um amigo, créditos e
 *     aposta (volta, amigo, oráculo), relógio/ausência/saída, muitos pôsteres de efeito.
 * 6b. Fuzz (--fn N): partidas do simulador com 1 a 3 oráculos trocados por pessoas, vistas de
 *     um aparelho sorteado, com efeitos, estouros e ausência injetados: as regras de sempre,
 *     oráculo ausente nunca fala nem é citado, nada de outra pessoa sai como da visita, teto
 *     das reações a amigos, orçamento por número de oráculos.
 * 6d. Mesa com amigos no motor do E3 (--rn N), quando ele já monta: pessoas ao acaso (estouros e
 *     saída), até 8 pôsteres de efeito, aparelhos com eventos crus e com o povEvents.
 * 6c. Casual de devolução: nada de "valendo", no máximo uma provocação (do portador, antes de
 *     recuperar), reação de quem carregava exatamente quando a pessoa recupera.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ENGINE from '../../src/lib/poker/index.ts';
import {
  applyHumanAction, createMatch, createRng, humanLegal, tableView, toPublicEvents,
} from '../../src/lib/poker/index.ts';
import type {
  Cue, MatchConfig, MatchEvent, MatchState, PlayerId, PublicEvent, Rarity, RivalId, TableView, TitleId,
} from '../../src/lib/poker/index.ts';
import type { Card } from '../../src/lib/poker/cards.ts';
import type { EffectCastData, PosterEffectId, TournamentConfig } from '../../src/lib/poker/types.ts';
import { BUDGET } from '../../src/lib/poker/dialogue/budget.ts';
import { createDirector, DEFAULT_BANK } from '../../src/lib/poker/dialogue/director.ts';
import { mentionsOf, remapIds } from '../../src/lib/poker/dialogue/friends.ts';
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
  mode?: 'free' | 'bounty' | 'tutorial' | 'friends'; lang?: 'pt' | 'en'; title?: TitleId; lifetimeMatches?: number; matchInSession?: number;
  returning?: boolean; localHour?: number; story?: Record<string, string>; talk?: 'all' | 'important' | 'none';
  speed?: 'normal' | 'fast' | 'turbo'; prize?: TableContext['prize']; nemesis?: RivalId; customer?: RivalId;
  tournament?: TableContext['tournament'];
  // mesa com amigos e casual de devolução (pacote H3)
  friends?: TableContext['friends']; reclaim?: TableContext['reclaim'];
}

function makeCtx(o: CtxOpts = {}, view: TableView = EMPTY_VIEW): TableContext {
  return {
    mode: o.mode ?? 'free', lang: o.lang ?? 'pt', title: o.title ?? 'figurante', lifetimeMatches: o.lifetimeMatches ?? 10,
    matchInSession: o.matchInSession ?? 1, returning: o.returning ?? false, localHour: o.localHour ?? 21,
    story: o.story ?? VETERAN, speed: o.speed ?? 'normal', talk: o.talk ?? 'all', view,
    reducedMotion: false, prize: o.prize, nemesis: o.nemesis, customer: o.customer, tournament: o.tournament,
    friends: o.friends, reclaim: o.reclaim,
  };
}

// ---------------------------------------------------------------------------
// Pôster Poker: dados comuns
// ---------------------------------------------------------------------------

const FX_ALL: PosterEffectId[] = ['early_flop', 'double_pot', 'blackjack', 'hand_bounty', 'eight_aces', 'reveal_one', 'sixth_card', 'opal', 'tell'];
const FX_RARITY: Record<PosterEffectId, Rarity> = {
  blackjack: 'common', double_pot: 'common', early_flop: 'common', hand_bounty: 'rare', eight_aces: 'rare', reveal_one: 'rare',
  sixth_card: 'epic', opal: 'epic', tell: 'legendary',
};
const EIGHT_ACES: Card[] = ['As', 'As', 'Ah', 'Ah', 'Ad', 'Ad', 'Ac', 'Ac'];
const FX_DATA: Record<PosterEffectId, EffectCastData> = {
  early_flop: { effect: 'early_flop' }, double_pot: { effect: 'double_pot' }, blackjack: { effect: 'blackjack', amount: 500 },
  hand_bounty: { effect: 'hand_bounty', target: 'trips', amount: 800 }, eight_aces: { effect: 'eight_aces', added: EIGHT_ACES },
  reveal_one: { effect: 'reveal_one' }, sixth_card: { effect: 'sixth_card' }, opal: { effect: 'opal', card: 'Js', amount: 1000 },
  tell: { effect: 'tell', hands: 3 },
};
/** Veterano que já ouviu a explicação de todos os efeitos. */
const VETERAN_FX: Record<string, string> = { ...VETERAN, ...Object.fromEntries(FX_ALL.map((f) => [`fx.${f}`, 'x'])) };
/** Gatilhos do Pôster Poker que podem sair no meio da mão. */
const POSTER_IN_HAND = new Set(['effectCast', 'tellMark', 'effectReveal']);

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
    case 'effectCast': return 1800;    // o "CATCHAW"
    case 'effectReveal': return 900;
    case 'effectBonus': return 1200;
    case 'tellMark': return 300;
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
// 1c. Estático do Pôster Poker
// ---------------------------------------------------------------------------

section('1c. Estático do Pôster Poker');
{
  const SPEAKERS = ['bogart', 'cypher', 'fincher'];
  const FX_VARS: Record<PosterEffectId, string[]> = {
    early_flop: [], double_pot: [], blackjack: ['fichas'], hand_bounty: ['fichas', 'alvo'], eight_aces: [], reveal_one: [],
    sixth_card: [], opal: ['fichas', 'carta'], tell: ['maos'],
  };
  const posterVars = ['fichas', 'alvo', 'carta', 'maos'];
  let nCast = 0;
  for (const fx of FX_ALL) {
    const casts = LINES.filter((l) => l.on === 'effectCast' && l.variant?.[0] === fx);
    nCast += casts.length;
    for (const s of SPEAKERS) {
      const ex = casts.filter((l) => l.speaker === s && l.variant!.includes('explica'));
      const re = casts.filter((l) => l.speaker === s && !l.variant!.includes('explica'));
      check(ex.length >= 1, `${fx}: ${s} sem explicação`);
      check(re.length >= 1, `${fx}: ${s} sem reação à lançada`);
      for (const l of ex) {
        check(l.priority === 1 && l.once === 'life' && l.story === `fx.${fx}` && l.requires?.storyNot === `fx.${fx}`,
          `${l.id}: explicação sem P1/once=life/fx.${fx}`);
      }
      for (const l of re) check(l.priority !== 1 && !l.story, `${l.id}: reação à lançada com P1 ou story`);
    }
    for (const l of casts) {
      for (const v of varsOf(l.pt)) {
        if (posterVars.includes(v)) check(FX_VARS[fx].includes(v), `${l.id}: {${v}} não existe na lançada de ${fx}`);
      }
      // a explicação na 1ª vez também pode cair no meio da mão (Onze Homens): nada sobre a própria mão
      if (fx === 'sixth_card' && !l.variant!.includes('explica')) check(!!l.curta, `${l.id}: reação do Onze Homens precisa ser curta`);
    }
    const intro = LINES.filter((l) => l.on === 'tournamentIntro' && l.variant?.includes(fx));
    check(intro.length >= 1, `${fx}: sem apresentação pelo filme`);
  }
  for (const r of ['common', 'rare', 'epic', 'legendary']) {
    check(LINES.filter((l) => l.on === 'tournamentIntro' && l.variant?.includes(r)).length >= 3, `apresentação ${r}: menos de 3 falas`);
  }
  check(EXCHANGES.filter((x) => x.on === 'tournamentIntro' && x.variant?.includes('legendary')).length >= 2, 'lendário: menos de 2 cerimônias');
  // o tique: tudo curto; ator com cue; Sapo ator sem calado e com o cue certo; Raposo ator sem o anel; Sapo testemunha só fora
  const tells = LINES.filter((l) => l.on === 'tellMark');
  check(tells.length >= 10, `tique: só ${tells.length} falas`);
  for (const l of tells) {
    check(!!l.curta && measure(String(EN[l.id] ?? ''), 'en') <= SHORT_CHARS, `${l.id}: tique longo`);
    check(l.role === 'actor' || l.role === 'bystander', `${l.id}: tique com papel ${l.role}`);
    check(!l.variant?.length || l.variant.length === 1 && ['blefe', 'valor'].includes(l.variant[0]), `${l.id}: marca ${l.variant}`);
    if (l.role === 'actor') {
      check(!!l.cue?.length, `${l.id}: ator do tique sem cue`);
      if (l.speaker === 'bogart') {
        check(!l.cue!.includes('calado'), `${l.id}: Sapo ator do tique com calado`);
        if (l.variant?.includes('blefe')) check(JSON.stringify(l.cue) === '["nervoso"]', `${l.id}: blefe do Sapo só nervoso`);
        if (l.variant?.includes('valor')) check(JSON.stringify(l.cue) === '["confiante"]', `${l.id}: valor do Sapo só confiante`);
      }
      if (l.speaker === 'fincher') check(!l.cue!.includes('confiante'), `${l.id}: Raposo fala com o anel`);
    }
    if (l.role === 'bystander' && l.speaker === 'bogart') check(l.out === 'only', `${l.id}: Sapo testemunha do tique fora da mão só`);
  }
  for (const l of LINES.filter((x) => x.on === 'effectReveal')) check(!!l.curta, `${l.id}: comentário da carta aberta longo`);
  // bônus: ganhou (os três) e a pessoa ganhou (os três), por efeito com bônus
  for (const fx of ['blackjack', 'double_pot', 'hand_bounty', 'opal']) {
    for (const s of SPEAKERS) {
      check(LINES.some((l) => l.on === 'effectBonus' && l.speaker === s && l.role === 'winner' && l.variant?.includes(fx)), `bônus ${fx}: ${s} sem fala de quem ganhou`);
      check(LINES.some((l) => l.on === 'effectBonus' && l.speaker === s && l.variant?.includes('humano') && l.variant?.includes(fx)), `bônus ${fx}: ${s} sem fala da pessoa`);
    }
  }
  for (const l of LINES.filter((x) => x.on === 'effectBonus')) {
    check(l.variant!.includes('humano') !== l.variant!.includes('oraculo'), `${l.id}: bônus sem humano/oraculo`);
    if (l.role === 'winner') check(l.variant!.includes('oraculo'), `${l.id}: quem ganhou é oráculo`);
  }
  const need: [string, string][] = [['stakePoster', ''], ['stakeLost', ''], ['stakeBack', ''], ['cobraItem', 'abertura'],
    ['cobraItem', 'meio'], ['cobraItem', 'ganhou'], ['cobraItem', 'perdeu'], ['tournamentWon', ''], ['tournamentLost', '']];
  for (const [t, v] of need) check(LINES.some((l) => l.on === t && (!v || l.variant?.includes(v))), `sem fala ${t} ${v}`);
  check(LINES.filter((l) => l.on === 'cobraItem' && ['meio', 'ganhou', 'perdeu'].some((v) => l.variant?.includes(v))).every((l) => l.speaker === 'cypher'),
    'caixinha no meio e nos créditos: só a Cobra fala');
  check(LINES.some((l) => l.on === 'recap' && l.variant?.includes('torneio')), 'recapitulação de torneio');
  // nenhuma fala do pôster cita o nome da visita nem flexiona gênero para ela ("ela ganhou", "obrigado, ela"…)
  const poster = LINES.filter((l) => l.id.startsWith('PP'));
  for (const l of poster) check(!/\b(ela|ele) (ganhou|venceu|apostou|achou|perdeu)\b/i.test(l.pt), `${l.id}: gênero da visita`);
  for (const x of EXCHANGES.filter((e) => e.id.startsWith('PPT'))) {
    for (const p of x.parts) check(!/\b(ela|ele) (ganhou|venceu|apostou|achou|perdeu)\b/i.test(p.pt), `${x.id}: gênero da visita`);
  }
  console.log(`  ${poster.length} falas do Pôster Poker (${nCast} de lançada, ${tells.length} do tique), ${EXCHANGES.filter((e) => e.id.startsWith('PPT')).length} trocas`);
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
    // 03/11/2026: a abertura termina antes da mão (15 s depois do matchStarted), e a vez da
    // pessoa abre logo depois do all-in da Cobra (como na mesa). Antes eram 500 ms fixos
    // depois de cada evento: o resultado dependia de a abertura sorteada (troca ou fala
    // única, conforme a semente) ainda estar no ar, e a dica saía antes ou depois da vez
    // abrir por acaso. O que se testa aqui é a dica na vez, não a disputa com a abertura.
    for (const e of evs) {
      dir.onEvent(e, ctx);
      if (e.t !== 'action') stage.pump(e.t === 'matchStarted' ? 15000 : eventMs(e));
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
// 2b. Cenários do Pôster Poker
// ---------------------------------------------------------------------------

section('2b. Cenários do Pôster Poker');
{
  const lvl = { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: { sb: 35, bb: 70, ante: 0 } };
  const seats = [{ id: 'human', seat: 0, stack: 2000 }, { id: 'bogart', seat: 1, stack: 2000 }, { id: 'fincher', seat: 2, stack: 2000 }, { id: 'cypher', seat: 3, stack: 2000 }];
  const STACKS = { human: 2000, bogart: 2000, fincher: 2000, cypher: 2000 };
  const tstart = (i: number, t: Partial<TournamentConfig> = {}, loan = 0): PublicEvent => {
    const effect = t.effect ?? 'early_flop';
    return { i, t: 'matchStarted', mode: 'bounty', seats, loan, prize: null, level: lvl,
      tournament: { prizeId: `pp-${effect}`, rarity: FX_RARITY[effect], effect, cobraItem: false, ...t } } as PublicEvent;
  };
  const hand = (i: number, n: number): PublicEvent => ({ i, t: 'handStarted', handNumber: n, buttonId: 'human', sbId: 'bogart', bbId: 'fincher',
    level: lvl, stacks: { ...STACKS } });
  const act = (i: number, p: PlayerId, action: 'fold' | 'check' | 'call' | 'bet' | 'raise', o: Partial<Extract<PublicEvent, { t: 'action' }>> = {}): PublicEvent =>
    ({ i, t: 'action', playerId: p, street: 'preflop', action, amount: 100, to: 100, toCall: 50, potAfter: 300, allIn: false, shortAllIn: false,
      stackBefore: 2000, sizeClass: null, ...(p !== 'human' ? { thinkMs: 900, cue: 'neutro' as Cue } : {}), ...o }) as PublicEvent;
  const cast = (i: number, n: number, fx: PosterEffectId, castNo = 1): PublicEvent =>
    ({ i, t: 'effectCast', effect: fx, handNumber: n, castNo, data: FX_DATA[fx] }) as PublicEvent;
  const tell = (i: number, n: number, p: RivalId, mark: 'blefe' | 'valor'): PublicEvent => ({ i, t: 'tellMark', handNumber: n, playerId: p, mark });
  const bonus = (i: number, n: number, fx: PosterEffectId, p: PlayerId, amount: number): PublicEvent =>
    ({ i, t: 'effectBonus', effect: fx, handNumber: n, playerId: p, amount });
  const done = (i: number, n: number, winner: PlayerId, potBB = 4): PublicEvent => ({ i, t: 'handComplete', handNumber: n,
    net: { human: winner === 'human' ? 100 : -50, bogart: winner === 'bogart' ? 100 : -25, fincher: winner === 'fincher' ? 100 : -25, cypher: winner === 'cypher' ? 100 : 0 },
    winnerIds: [winner], wentToShowdown: false, potBB, flags: {} });
  const ended = (i: number, place: number, reason: 'won' | 'eliminated' | 'forfeit' = place === 1 ? 'won' : 'eliminated'): PublicEvent =>
    ({ i, t: 'matchEnded', places: { human: place } as Record<PlayerId, number>, winnerId: place === 1 ? 'human' : null, humanPlace: place,
      reason, prizeCaptured: false });
  const lineOf = (o: Emitted): Line | undefined => byId.get(o.item.lineId);
  const isExplain = (o: Emitted): boolean => !!lineOf(o)?.variant?.includes('explica');
  const play = (dir: Director, stage: Stage, evs: PublicEvent[], ctx: TableContext, ms?: number): void => {
    for (const e of evs) {
      stage.evIndex++;
      if (e.t === 'handStarted') stage.hand = e.handNumber;
      dir.onEvent(e, ctx);
      stage.pump(ms ?? eventMs(e));
    }
  };

  // abertura por raridade: até 2 balões (3 na cerimônia), a apresentação sempre; o lendário com cerimônia
  {
    let ceremonies = 0;
    let legendary = 0;
    for (const fx of FX_ALL) {
      for (let k = 0; k < 12; k++) {
        const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX, lang: k % 4 === 3 ? 'en' : 'pt' };
        const { dir, stage } = newDirector({ ...ctxO, seed: `op-${fx}-${k}` });
        play(dir, stage, [tstart(1, { effect: fx })], makeCtx(ctxO), 25000);
        const out = stage.out;
        const ex = out.some((o) => !!o.item.exchange);
        check(out.length >= 1 && out.length <= (ex ? 3 : 2), `abertura ${fx}#${k} com ${out.length} balões`);
        check(out.some((o) => o.item.debug?.trigger === 'tournamentIntro'), `abertura ${fx}#${k} sem a apresentação do pôster`);
        check(out.every((o) => o.item.scene === 'opening' && !/\{/.test(o.item.text)), `abertura ${fx}#${k}: cena ou variável`);
        if (FX_RARITY[fx] === 'legendary') {
          legendary++;
          if (ex && out[0].item.debug?.trigger === 'tournamentIntro') ceremonies++;
        }
      }
    }
    check(ceremonies === legendary, `lendário com cerimônia inédita: ${ceremonies}/${legendary}`);
    // a cerimônia já ouvida em 48 h: a apresentação vira fala solta na maioria das vezes
    const pl = newPlayer(VETERAN_FX);
    let lines = 0;
    for (let k = 0; k < 8; k++) {
      const { dir, stage } = newDirector({ mode: 'bounty', seed: `leg-${k}` }, pl);
      play(dir, stage, [tstart(1, { effect: 'tell' })], makeCtx({ mode: 'bounty', story: VETERAN_FX }), 25000);
      if (k >= 4 && stage.out.every((o) => !o.item.exchange)) lines++;
      pl.clock.t += 60_000;
    }
    check(lines >= 2, `cerimônias repetidas em 48 h cedem lugar à fala solta (${lines}/4)`);
  }
  // pôster apostado, caixinha da Cobra e empréstimo entram como 2º balão
  {
    const cases: [string, CtxOpts['tournament'], Partial<TournamentConfig>, number, string][] = [
      ['aposta', { stake: 'poster' }, { effect: 'blackjack' }, 0, 'stakePoster'],
      ['caixinha', { stake: 'chips' }, { effect: 'reveal_one', cobraItem: true }, 0, 'cobraItem'],
      ['empréstimo', undefined, { effect: 'double_pot' }, 500, 'sapoLoan'],
    ];
    for (const [name, tctx, t, loan, want] of cases) {
      let hit = 0;
      for (let k = 0; k < 20; k++) {
        const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX, tournament: tctx };
        const { dir, stage } = newDirector({ ...ctxO, seed: `slot-${name}-${k}` });
        play(dir, stage, [tstart(1, t, loan)], makeCtx(ctxO), 25000);
        check(stage.out.length === 2, `abertura com ${name}: ${stage.out.length} balões`);
        if (stage.out.some((o) => o.item.debug?.trigger === want)) hit++;
        if (want === 'cobraItem') check(stage.out.every((o) => o.item.debug?.trigger !== 'cobraItem' || !/\b(baralho|mesa|verso|feltro)\b/i.test(o.item.text)), 'a Cobra não diz o que tem na caixa');
      }
      check(hit === 20, `${name} na abertura: ${hit}/20`);
    }
  }
  // a explicação: P1 na 1ª vez da vida de cada efeito, com as variáveis preenchidas; nunca de novo
  for (const fx of FX_ALL) {
    for (const lang of ['pt', 'en'] as const) {
      const story = { ...VETERAN };   // sem nenhum fx.*
      const ctxO: CtxOpts = { mode: 'bounty', story, lang };
      const ctx = makeCtx(ctxO);
      const { dir, stage } = newDirector({ ...ctxO, seed: `ex-${fx}-${lang}` });
      if (fx === 'eight_aces') {
        play(dir, stage, [tstart(1, { effect: fx }), cast(2, 0, fx)], ctx, 1);
        stage.pump(30000);
      } else {
        play(dir, stage, [tstart(1, { effect: fx })], ctx, 25000);
        const evs = fx === 'sixth_card'
          ? [hand(2, 3), act(3, 'bogart', 'call', { street: 'turn' }), act(4, 'human', 'check', { street: 'turn' }), cast(5, 3, fx)]
          : [hand(2, 3), cast(3, 3, fx)];
        play(dir, stage, evs, ctx);
        stage.pump(8000);
      }
      const ex = stage.out.filter(isExplain);
      check(ex.length === 1, `${fx} [${lang}]: ${ex.length} explicações na 1ª lançada`);
      const e0 = ex[0];
      if (e0) {
        check(e0.item.priority === 1 && lineOf(e0)!.variant![0] === fx, `${fx} [${lang}]: explicação P1 do efeito certo`);
        check(!/\{/.test(e0.item.text), `${fx} [${lang}]: variável sobrou: ${e0.item.text}`);
        const want: Partial<Record<PosterEffectId, RegExp>> = lang === 'pt'
          ? { opal: /valete de espadas/, hand_bounty: /trinca.*800|800.*trinca/, blackjack: /500/, tell: /\b3\b/ }
          : { opal: /jack of spades/, hand_bounty: /three of a kind.*800/, blackjack: /500/, tell: /\b3\b/ };
        if (want[fx] && /\{(fichas|alvo|carta|maos)\}/.test(lineOf(e0)!.pt)) check(want[fx]!.test(e0.item.text), `${fx} [${lang}]: "${e0.item.text}"`);
        if (fx === 'eight_aces') check(e0.item.scene === 'opening' && stage.out.length === 2, `Cassino na 1ª vez: apresentação + explicação na abertura (${stage.out.length})`);
      }
      check(dir.storyTouched().includes(`fx.${fx}`), `${fx} [${lang}]: marca fx.${fx}`);
      // 2ª lançada na mesma partida: nada de explicação
      const n0 = stage.out.length;
      play(dir, stage, [done(20, 3, 'cypher'), hand(21, 12), cast(22, 12, fx, 2)], ctx);
      stage.pump(8000);
      check(!stage.out.slice(n0).some(isExplain), `${fx} [${lang}]: explicou de novo na 2ª lançada`);
    }
  }
  // veterano: a lançada vira P2 (metade) ou P3 (menos); nunca explica
  {
    let first = 0;
    let second = 0;
    let explains = 0;
    for (let k = 0; k < 300; k++) {
      const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
      const ctx = makeCtx(ctxO);
      const fx = FX_ALL.filter((f) => !['eight_aces', 'sixth_card', 'blackjack', 'double_pot'].includes(f))[k % 5];
      const { dir, stage } = newDirector({ ...ctxO, seed: `vet-${k}` });
      play(dir, stage, [tstart(1, { effect: fx })], ctx, 25000);
      play(dir, stage, [hand(2, 4), cast(3, 4, fx, 1)], ctx);
      stage.pump(5000);
      first += stage.out.filter((o) => o.item.debug?.trigger === 'effectCast').length;
      const n0 = stage.out.length;
      play(dir, stage, [done(4, 4, 'cypher'), hand(5, 12), cast(6, 12, fx, 2)], ctx);
      stage.pump(5000);
      second += stage.out.slice(n0).filter((o) => o.item.debug?.trigger === 'effectCast').length;
      explains += stage.out.filter(isExplain).length;
    }
    check(explains === 0, `veterano ouviu explicação (${explains})`);
    check(first > 60 && first < 200, `1ª lançada do veterano com fala em ~50% (${first}/300)`);
    check(second < first && second > 15, `2ª lançada com menos fala (${second}/300)`);
  }
  // Onze Homens no meio da mão: Sapo calado e Raposo no anel não falam; na vez da pessoa, só curta
  {
    let cobraExplains = 0;
    for (let k = 0; k < 200; k++) {
      const veteran = k % 2 === 1;
      const ctxO: CtxOpts = { mode: 'bounty', story: veteran ? VETERAN_FX : VETERAN };
      const ctx = makeCtx(ctxO);
      const { dir, stage } = newDirector({ ...ctxO, seed: `six-${k}` });
      play(dir, stage, [tstart(1, { effect: 'sixth_card' })], ctx, 25000);
      play(dir, stage, [hand(2, 5)], ctx);
      const n0 = stage.out.length;   // a fala de "dar as cartas" (antes do calado) não conta
      play(dir, stage, [
        act(3, 'bogart', 'raise', { street: 'turn', sizeClass: 'big', cue: 'calado', to: 400, amount: 400 }),
        act(4, 'fincher', 'call', { street: 'turn', cue: 'confiante' }),
        act(5, 'cypher', 'call', { street: 'turn', cue: 'neutro' }),
        act(6, 'human', 'call', { street: 'turn' }),
        cast(7, 5, 'sixth_card')], ctx);
      if (k % 4 === 0) {
        stage.turnOpen = true;
        dir.onHumanTurn(true);
      }
      stage.pump(6000);
      stage.turnOpen = false;
      dir.onHumanTurn(false);
      const inHand = stage.out.slice(n0);
      check(!inHand.some((o) => o.item.speaker === 'bogart'), `Onze Homens #${k}: Sapo calado falou (${inHand.map((o) => o.item.lineId)})`);
      check(!inHand.some((o) => o.item.speaker === 'fincher'), `Onze Homens #${k}: Raposo falou com o anel`);
      check(inHand.filter((o) => o.turnOpen).every((o) => o.item.text.length <= SHORT_CHARS), `Onze Homens #${k}: longa na vez`);
      if (!veteran && inHand.some((o) => isExplain(o) && o.item.speaker === 'cypher')) cobraExplains++;
    }
    check(cobraExplains >= 45, `Onze Homens na 1ª vez: a Cobra explica quando os outros não podem (${cobraExplains}/50)`);
  }
  // o tique: fala de quem apostou segue o cue; a marca nunca é contrariada; Sapo calado e Raposo no anel calados
  {
    type Case = { p: RivalId; cue: Cue; mark: 'blefe' | 'valor'; before: boolean };
    const cases: Case[] = [
      { p: 'bogart', cue: 'nervoso', mark: 'blefe', before: false }, { p: 'bogart', cue: 'confiante', mark: 'valor', before: false },
      { p: 'bogart', cue: 'calado', mark: 'valor', before: false }, { p: 'bogart', cue: 'nervoso', mark: 'blefe', before: true },
      { p: 'cypher', cue: 'nervoso', mark: 'valor', before: false }, { p: 'fincher', cue: 'confiante', mark: 'valor', before: false },
      { p: 'fincher', cue: 'nervoso', mark: 'blefe', before: true },
    ];
    let spoke = 0;
    for (const c of cases) {
      for (let k = 0; k < 60; k++) {
        const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
        const ctx = makeCtx(ctxO);
        const { dir, stage } = newDirector({ ...ctxO, seed: `tell-${c.p}-${c.cue}-${c.before}-${k}` });
        play(dir, stage, [tstart(1, { effect: 'tell' })], ctx, 25000);
        play(dir, stage, [hand(2, 4), act(3, 'human', 'check', { street: 'flop' })], ctx);
        const n0 = stage.out.length;
        const bet = act(5, c.p, 'bet', { street: 'flop', sizeClass: 'medium', cue: c.cue });
        const mark = tell(4, 4, c.p, c.mark);
        play(dir, stage, c.before ? [mark, bet] : [{ ...bet, i: 4 } as PublicEvent, { ...mark, i: 5 } as PublicEvent], ctx, 300);
        stage.turnOpen = true;
        dir.onHumanTurn(true);
        stage.pump(5000);
        stage.turnOpen = false;
        dir.onHumanTurn(false);
        for (const o of stage.out.slice(n0).filter((x) => x.item.debug?.trigger === 'tellMark')) {
          spoke++;
          const l = lineOf(o)!;
          check(o.item.text.length <= SHORT_CHARS, `${l.id}: tique longo na vez`);
          if (l.role === 'actor') {
            check(l.speaker === c.p && !!l.cue?.includes(c.cue), `${l.id} (ator ${l.speaker}, cue ${l.cue}) com ${c.p}/${c.cue}`);
          }
          if (l.variant?.length) check(l.variant[0] === c.mark, `${l.id}: marca ${l.variant[0]} com o tique ${c.mark}`);
          if (c.p === 'bogart' && c.cue === 'calado') check(l.speaker !== 'bogart', `${l.id}: Sapo calado falou do tique`);
          if (c.p === 'fincher' && c.cue === 'confiante') check(l.speaker !== 'fincher', `${l.id}: Raposo falou com o anel`);
          check(l.speaker !== 'bogart' || l.role === 'actor' || l.out === 'only', `${l.id}: Sapo na mão comentou o tique alheio`);
        }
      }
    }
    check(spoke > 60, `o tique tem fala às vezes (${spoke}/${cases.length * 60})`);
    // no máximo 2 falas de tique por partida
    const { dir, stage } = newDirector({ mode: 'bounty', story: VETERAN_FX, seed: 'tell-cap' });
    const ctx = makeCtx({ mode: 'bounty', story: VETERAN_FX });
    play(dir, stage, [tstart(1, { effect: 'tell' })], ctx, 25000);
    let i = 2;
    for (let h = 4; h <= 9; h++) {
      play(dir, stage, [hand(i++, h), act(i++, 'cypher', 'bet', { street: 'flop', cue: 'nervoso', sizeClass: 'medium' }), tell(i++, h, 'cypher', 'blefe'),
        act(i++, 'fincher', 'raise', { street: 'flop', cue: 'neutro', sizeClass: 'big' }), tell(i++, h, 'fincher', 'valor'), done(i++, h, 'fincher')], ctx);
      stage.pump(6000);
    }
    check(stage.out.filter((o) => o.item.debug?.trigger === 'tellMark').length <= 2, 'no máximo 2 falas de tique por partida');
  }
  // bônus: a opala da pessoa quase sempre tem fala, sempre de "humano"; o bônus vence a fala do pote
  {
    let humanLines = 0;
    for (let k = 0; k < 100; k++) {
      const human = k % 2 === 0;
      const winner: PlayerId = human ? 'human' : (['bogart', 'cypher', 'fincher'] as RivalId[])[k % 3];
      const fx: PosterEffectId = k % 4 < 2 ? 'opal' : 'hand_bounty';
      const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
      const ctx = makeCtx(ctxO);
      const { dir, stage } = newDirector({ ...ctxO, seed: `bonus-${k}` });
      play(dir, stage, [tstart(1, { effect: fx }), hand(2, 3), cast(3, 3, fx), done(4, 3, 'cypher')], ctx);
      stage.pump(4000);
      const n0 = stage.out.length;
      play(dir, stage, [hand(10, 6), { i: 11, t: 'potAwarded', potIndex: 0, amount: 1500, eligibleIds: [winner, 'cypher'],
        winners: [{ playerId: winner, amount: 1500 }], uncontested: false, kind: 'trips' } as PublicEvent,
      bonus(12, 6, fx, winner, fx === 'opal' ? 1000 : 800), done(13, 6, winner, 30)], ctx);
      stage.pump(12000);
      const after = stage.out.slice(n0);
      const b = after.filter((o) => o.item.debug?.trigger === 'effectBonus');
      if (human && b.length) humanLines++;
      for (const o of b) {
        const l = lineOf(o);
        if (l) {
          check(l.variant!.includes(human ? 'humano' : 'oraculo'), `${l.id}: bônus de ${winner} com fala ${l.variant}`);
          if (l.role === 'winner') check(l.speaker === winner, `${l.id}: fala de quem ganhou na boca de ${l.speaker}`);
        } else check(!!o.item.exchange && human, `troca de bônus (${o.item.lineId}) sem ser da pessoa`);
        check(!/\{/.test(o.item.text) && (!/valete|jack/.test(o.item.text) || fx === 'opal'), `bônus: texto ${o.item.text}`);
      }
      const nonP1 = after.filter((o) => o.item.priority !== 1 && (!o.item.exchange || o.item.exchange.part === 1) && o.item.debug?.hand === 6);
      check(nonP1.length <= 1, `bônus: ${nonP1.length} momentos não-P1 na mão`);
      // a opala e o Raymond são P1 e ficam com o momento da mão: nada não-P1 nasce do fim dela
      if (b.length) check(!nonP1.some((o) => (o.item.debug?.eventI ?? 0) >= 12), `o bônus fica com o momento da mão (${nonP1.map((o) => o.item.lineId)})`);
    }
    check(humanLines >= 30, `opala/Raymond da pessoa com fala (${humanLines}/50)`);
    // bônus depois do handComplete (ordem trocada): passa na frente da fala do pote que ainda não começou
    let preempted = 0;
    for (let k = 0; k < 80; k++) {
      const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
      const ctx = makeCtx(ctxO);
      const { dir, stage } = newDirector({ ...ctxO, seed: `pre-${k}` });
      play(dir, stage, [tstart(1, { effect: 'opal' }), hand(2, 3), cast(3, 3, 'opal'), done(4, 3, 'cypher')], ctx);
      stage.pump(4000);
      const n0 = stage.out.length;
      dir.onEvent(hand(10, 6), ctx);
      dir.onEvent(done(11, 6, 'human', 35), ctx);
      dir.onEvent(bonus(12, 6, 'opal', 'human', 1000), ctx);
      stage.pump(12000);
      const after = stage.out.slice(n0).filter((o) => o.item.debug?.hand === 6);
      if (after.some((o) => o.item.debug?.trigger === 'effectBonus')) preempted++;
      check(after.filter((o) => o.item.priority !== 1).length === 0, 'bônus trocado: a fala do pote não sai junto da opala');
    }
    check(preempted >= 76, `o bônus depois do fim da mão ainda sai (${preempted}/80)`);
    // o 1º pagamento do 21 é P1; o 2º (P2) passa na frente da fala do pote que ainda não começou
    let bj = 0;
    let bj1 = 0;
    for (let k = 0; k < 80; k++) {
      const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
      const ctx = makeCtx(ctxO);
      const { dir, stage } = newDirector({ ...ctxO, seed: `bj-${k}` });
      play(dir, stage, [tstart(1, { effect: 'blackjack' }), hand(2, 3), cast(3, 3, 'blackjack'), bonus(4, 3, 'blackjack', 'cypher', 500), done(5, 3, 'cypher')], ctx);
      stage.pump(6000);
      if (stage.out.some((o) => o.item.debug?.trigger === 'effectBonus' && o.item.priority === 1)) bj1++;
      check(!stage.out.some((o) => o.item.debug?.trigger === 'effectCast'), '21 já conhecido: a 1ª lançada passa em silêncio');
      const n0 = stage.out.length;
      dir.onEvent(hand(10, 6), ctx);
      dir.onEvent(done(11, 6, 'human', 35), ctx);
      dir.onEvent(bonus(12, 6, 'blackjack', 'human', 500), ctx);
      stage.pump(12000);
      const after = stage.out.slice(n0).filter((o) => o.item.debug?.hand === 6 && o.item.priority !== 1);
      if (after.some((o) => o.item.debug?.trigger === 'effectBonus')) bj++;
      check(after.filter((o) => !o.item.exchange || o.item.exchange.part === 1).length <= 1, `bônus do 21: um momento só (${after.map((o) => `${o.item.debug?.trigger}:${o.item.lineId}`)})`);
    }
    check(bj1 === 80, `1º pagamento do 21 sempre com fala (${bj1}/80)`);
    check(bj >= 25, `o 2º pagamento do 21 depois do fim da mão passa na frente do pote (${bj}/80)`);
  }
  // carta aberta da leitura: só a da pessoa, só se a lançada passou em silêncio, curta
  {
    let lines = 0;
    for (let k = 0; k < 300; k++) {
      const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
      const ctx = makeCtx(ctxO);
      const { dir, stage } = newDirector({ ...ctxO, seed: `rv-${k}` });
      play(dir, stage, [tstart(1, { effect: 'reveal_one' })], ctx, 25000);
      const mine: Card = (['Ah', 'Kd', '4c', '9s'] as Card[])[k % 4];
      play(dir, stage, [hand(2, 4), cast(3, 4, 'reveal_one', 2), { i: 4, t: 'holeCards', cards: [mine, '2c'] } as PublicEvent,
        { i: 5, t: 'effectReveal', effect: 'reveal_one', handNumber: 4, cards: [{ playerId: 'human', cards: [mine] }, { playerId: 'bogart', cards: ['7c'] },
          { playerId: 'fincher', cards: ['Qs'] }, { playerId: 'cypher', cards: ['3d'] }] } as PublicEvent], ctx);
      stage.pump(5000);
      const hand4 = stage.out.filter((o) => o.item.debug?.hand === 4);
      const rv = hand4.filter((o) => o.item.debug?.trigger === 'effectReveal');
      lines += rv.length;
      check(!(rv.length && hand4.some((o) => o.item.debug?.trigger === 'effectCast')), 'carta aberta comentada junto com a lançada');
      for (const o of rv) {
        const v = lineOf(o)!.variant ?? [];
        const want = ['as', 'figura', 'baixa', ''][k % 4];
        check(v.length === 1 || v[1] === want, `${o.item.lineId}: comentário ${v[1]} para ${mine}`);
        check(o.item.text.length <= SHORT_CHARS, `${o.item.lineId}: longo`);
      }
    }
    check(lines > 20 && lines < 150, `carta aberta comentada às vezes (${lines}/300)`);
  }
  // créditos do torneio
  {
    type CreditCase = { name: string; tctx?: CtxOpts['tournament']; t: Partial<TournamentConfig>; loan?: number; place: number;
      reason?: 'won' | 'eliminated' | 'forfeit'; want: string[]; who?: RivalId[] };
    const cases: CreditCase[] = [
      { name: 'vitória + pôster apostado', tctx: { stake: 'poster' }, t: { effect: 'blackjack' }, place: 1, want: ['tournamentWon', 'stakeBack'] },
      { name: 'derrota + pôster apostado', tctx: { stake: 'poster' }, t: { effect: 'blackjack' }, place: 3, want: ['stakeLost'] },
      { name: 'desistência + pôster apostado', tctx: { stake: 'poster' }, t: { effect: 'early_flop' }, place: 4, reason: 'forfeit', want: ['stakeLost'] },
      { name: 'desistência com fichas', tctx: { stake: 'chips' }, t: { effect: 'early_flop' }, place: 4, reason: 'forfeit', want: ['playerLeaves'] },
      { name: 'vitória + caixinha', t: { effect: 'opal', cobraItem: true }, place: 1, want: ['tournamentWon', 'cobraItem'], who: ['cypher'] },
      { name: 'derrota + caixinha', t: { effect: 'opal', cobraItem: true }, place: 2, want: ['cobraItem'], who: ['cypher'] },
      { name: 'vitória + empréstimo', t: { effect: 'double_pot' }, loan: 500, place: 1, want: ['tournamentWon', 'loanCredits'] },
      { name: 'derrota simples', t: { effect: 'tell' }, place: 2, want: ['tournamentLost'] },
      { name: 'vitória simples', t: { effect: 'tell' }, place: 1, want: ['tournamentWon'] },
    ];
    for (const c of cases) {
      for (let k = 0; k < 6; k++) {
        const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX, tournament: c.tctx, lang: k % 3 === 2 ? 'en' : 'pt' };
        const ctx = makeCtx(ctxO);
        const { dir, stage } = newDirector({ ...ctxO, seed: `cr-${c.name}-${k}` });
        play(dir, stage, [tstart(1, c.t, c.loan ?? 0)], ctx, 25000);
        const evs: PublicEvent[] = [hand(2, 9), done(3, 9, 'fincher')];
        if (c.reason !== 'forfeit' && c.place !== 1) evs.push({ i: 4, t: 'eliminated', playerId: 'human', place: c.place, byId: 'fincher', handNumber: 9 });
        evs.push(ended(5, c.place, c.reason));
        play(dir, stage, evs, ctx);
        stage.pump(20000);
        const cr = stage.out.filter((o) => o.item.scene === 'credits');
        check(cr.map((o) => o.item.debug?.trigger).join(',') === c.want.join(','), `créditos "${c.name}": ${cr.map((o) => `${o.item.debug?.trigger}:${o.item.lineId}`).join(',')}`);
        if (c.who) check(cr.filter((o) => o.item.debug?.trigger === 'cobraItem').every((o) => c.who!.includes(o.item.speaker as RivalId)), `créditos "${c.name}": quem fala da caixinha`);
        if (c.name === 'vitória simples' && ctxO.lang === 'pt' && k === 0) check(['PPC71', 'PPF62'].includes(cr[0]?.item.lineId ?? ''), `vitória no lendário com fala própria (${cr[0]?.item.lineId})`);
        if (c.reason !== 'forfeit' && c.place !== 1) check(stage.out.some((o) => o.item.scene === 'farewell'), `créditos "${c.name}": despedida antes`);
      }
    }
  }
  // recapitulação de torneio e caixinha no meio da partida
  {
    const { dir } = newDirector({ mode: 'bounty', seed: 'rc' });
    const r = dir.cardLine('recap', makeCtx({ mode: 'bounty', tournament: { stake: 'chips' } }), { handNumber: 8, bb: 50, stacks: { human: 1800, bogart: 2600, cypher: 2000, fincher: 1600 } });
    check(r?.lineId === 'AN7', `recapitulação de torneio (${r?.lineId})`);
    let taunts = 0;
    for (let k = 0; k < 150; k++) {
      const ctxO: CtxOpts = { mode: 'bounty', story: VETERAN_FX };
      const ctx = makeCtx(ctxO);
      const { dir: d, stage } = newDirector({ ...ctxO, seed: `cx-${k}` });
      play(d, stage, [tstart(1, { effect: 'early_flop', cobraItem: true })], ctx, 25000);
      let i = 2;
      for (let h = 1; h <= 8; h++) play(d, stage, [hand(i++, h), act(i++, 'human', 'fold'), done(i++, h, 'cypher')], ctx, 3000);
      const mid = stage.out.filter((o) => o.item.debug?.trigger === 'cobraItem' && o.item.scene === 'table');
      if (mid.length) taunts++;
      check(mid.every((o) => o.item.speaker === 'cypher' || !!o.item.exchange), 'caixinha no meio: só a Cobra (ou a troca)');
    }
    check(taunts > 10 && taunts < 90, `a Cobra volta à caixinha no meio da partida às vezes (${taunts}/150)`);
  }
}

// ---------------------------------------------------------------------------
// Regras do Pôster Poker numa partida (usadas pelas fixtures e pelo fuzz de torneio)
// ---------------------------------------------------------------------------

interface PosterStats { castLines: number; casts: number; explains: number; bonusLines: number; bonuses: number; tellLines: number; revealLines: number }

/** As regras do Pôster Poker numa partida já tocada. */
function verifyPoster(tag: string, events: PublicEvent[], emitted: Emitted[], stake: 'chips' | 'poster'): PosterStats {
  const st: PosterStats = { castLines: 0, casts: 0, explains: 0, bonusLines: 0, bonuses: 0, tellLines: 0, revealLines: 0 };
  const evByI = new Map<number, PublicEvent>(events.map((e) => [e.i, e]));
  const posOf = new Map<number, number>(events.map((e, j) => [e.i, j]));
  st.casts = events.filter((e) => e.t === 'effectCast').length;
  st.bonuses = events.filter((e) => e.t === 'effectBonus').length;
  const marks = new Map<string, Set<string>>();
  for (const e of events) if (e.t === 'tellMark') {
    const key = `${e.handNumber}|${e.playerId}`;
    marks.set(key, (marks.get(key) ?? new Set()).add(e.mark));
  }
  const castHands = new Set(emitted.filter((o) => o.item.debug?.trigger === 'effectCast').map((o) => o.item.debug!.hand));
  /** Último cue de `p` na mão, até o evento de índice `upto`. */
  const lastCue = (p: PlayerId, upto: number): Cue | null => {
    for (let j = Math.min(upto, events.length - 1); j >= 0; j--) {
      const e = events[j];
      if (e.t === 'handStarted' || e.t === 'handComplete') return null;
      if (e.t === 'action' && e.playerId === p) return e.action === 'fold' ? null : e.cue ?? null;
    }
    return null;
  };
  for (const em of emitted) {
    const d = em.item.debug;
    if (!d) continue;
    const line = byId.get(em.item.lineId);
    if (POSTER_IN_HAND.has(d.trigger) && em.item.speaker === 'fincher') {
      check(lastCue('fincher', em.evIndex) !== 'confiante', `${tag}: Raposo falou (${em.item.lineId}) com o anel`);
    }
    if (d.trigger === 'effectCast' && (!em.item.exchange || em.item.exchange.part === 1)) {
      st.castLines++;
      if (line?.variant?.includes('explica')) st.explains++;
    }
    if (d.trigger === 'tellMark' && line) {
      st.tellLines++;
      const key = `${d.hand}|${d.actorId}`;
      if (line.variant?.length) check(!!marks.get(key)?.has(line.variant[0]), `${tag}: ${line.id} (${line.variant[0]}) sem esse tique`);
      if (line.role === 'actor') {
        check(line.speaker === d.actorId && !!d.cue && !!line.cue?.includes(d.cue), `${tag}: ${line.id} ator do tique com cue ${d.cue}`);
        // o cue do sinal é o da aposta que levou o tique
        const j = posOf.get(d.eventI) ?? -1;
        const at = events[j];
        const act = at?.t === 'action' ? at : events[j - 1];
        check(act?.t === 'action' && act.playerId === d.actorId && act.cue === d.cue, `${tag}: ${line.id} cue ${d.cue} não é o da aposta`);
      }
    }
    if (d.trigger === 'effectBonus') {
      if (!em.item.exchange || em.item.exchange.part === 1) st.bonusLines++;
      const b = evByI.get(d.eventI);
      check(b?.t === 'effectBonus', `${tag}: fala de bônus sem bônus`);
      if (b?.t === 'effectBonus' && line) {
        check(line.variant!.includes(b.playerId === 'human' ? 'humano' : 'oraculo'), `${tag}: ${line.id} para bônus de ${b.playerId}`);
        if (line.role === 'winner') check(line.speaker === b.playerId, `${tag}: ${line.id} de ${line.speaker}, bônus de ${b.playerId}`);
      }
    }
    if (d.trigger === 'effectReveal') {
      st.revealLines++;
      check(!castHands.has(d.hand), `${tag}: carta aberta comentada na mão da lançada`);
    }
  }
  const end = events.find((e) => e.t === 'matchEnded') as Extract<PublicEvent, { t: 'matchEnded' }> | undefined;
  const credits = emitted.filter((o) => o.item.scene === 'credits').map((o) => o.item.debug?.trigger);
  if (end && stake === 'poster' && end.humanPlace !== 1) check(credits.includes('stakeLost'), `${tag}: perdeu o pôster apostado sem fala (${credits})`);
  if (end && end.humanPlace === 1) check(credits[0] === 'tournamentWon', `${tag}: venceu o torneio sem fala (${credits})`);
  return st;
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
      // fixtures de torneio do E (Pôster Poker): também as regras do pôster
      if (all.some((e) => e.t === 'matchStarted' && e.tournament)) verifyPoster(`${f}[${lang}]`, all, stage.out, 'chips');
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
      if (all.some((e) => e.t === 'matchStarted' && e.tournament)) verifyPoster(`${f}#${k}`, all, stage.out, 'chips');
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

// ---------------------------------------------------------------------------
// 4b. Fuzz de torneio (Pôster Poker)
// ---------------------------------------------------------------------------

/** Mão fraca para o tique (bucket abaixo de médio, sem monstro), como no BRIEF2. */
function tellMarkOf(m: PrivateMeta | undefined, rng: () => number): 'blefe' | 'valor' {
  if (!m) return rng() < 0.5 ? 'blefe' : 'valor';
  if (m.monster) return 'valor';
  if (m.bucket === null) return m.cue === 'confiante' || m.cue === 'calado' ? 'valor' : 'blefe';
  return m.bucket === 'weak' || m.bucket === 'draw' || m.bucket === 'air' ? 'blefe' : 'valor';
}

/**
 * Injeta os eventos do efeito numa partida do simulador, na ordem do E_NOTES (motor do E
 * ainda sem efeitos): matchStarted com o torneio; eight_aces logo depois; efeitos de mão
 * depois do handStarted; reveal_one depois das cartas; sixth_card antes do river; tique
 * depois de cada aposta de oráculo nas 3 mãos; bônus antes do handComplete. Os `i` novos
 * são fracionários (únicos e na ordem).
 */
function injectEffects(steps: StepIn[], meta: Map<number, PrivateMeta>, effect: PosterEffectId, cobraItem: boolean, rng: () => number): StepIn[] {
  const pick = (a: number, b: number): number => a + Math.floor(rng() * (b - a + 1));
  const casts: number[] = [];
  if (['early_flop', 'double_pot', 'blackjack', 'reveal_one', 'sixth_card', 'tell'].includes(effect)) {
    const c1 = pick(3, 9);
    casts.push(c1, c1 + (effect === 'tell' ? 8 : 6) + pick(0, 3));
  } else if (effect === 'hand_bounty' || effect === 'opal') casts.push(pick(3, 8));
  const bonusHand = casts.length ? casts[0] + pick(0, 6) : -1;
  let k = 0;
  let castNo = 0;
  let cur = 0;
  let dealt: PlayerId[] = [];
  let sixthArmed = false;
  let castHere = false;
  let tellUntil = -1;
  const ev = (base: number, pre: boolean, body: Record<string, unknown>): PublicEvent => {
    k++;
    return { ...body, i: base + (pre ? -0.5 : 0) + k * 0.0001 } as PublicEvent;
  };
  const castEv = (base: number, pre: boolean, h: number): PublicEvent => {
    castNo++;
    return ev(base, pre, { t: 'effectCast', effect, handNumber: h, castNo, data: FX_DATA[effect] });
  };
  const RANDOM: Card[] = ['2c', '7d', 'Th', 'Ks', '5h', '9c', 'Jd', '3s'];
  return steps.map((st) => {
    const out: PublicEvent[] = [];
    for (const e of st.events) {
      const pre: PublicEvent[] = [];
      const post: PublicEvent[] = [];
      let main: PublicEvent = e;
      switch (e.t) {
        case 'matchStarted':
          main = { ...e, mode: 'bounty', prize: null, tournament: { prizeId: `pp-${effect}`, rarity: FX_RARITY[effect], effect, cobraItem } } as PublicEvent;
          if (effect === 'eight_aces') post.push(castEv(e.i, false, 0));
          break;
        case 'handStarted':
          cur = e.handNumber;
          dealt = Object.entries(e.stacks).filter(([, v]) => (v ?? 0) > 0).map(([p]) => p);
          castHere = false;
          if (casts.includes(cur)) {
            if (effect === 'sixth_card') sixthArmed = true;
            else {
              castHere = true;
              post.push(castEv(e.i, false, cur));
              if (effect === 'tell') tellUntil = cur + 2;
            }
          }
          break;
        case 'holeCards':
          if (castHere && effect === 'reveal_one') {
            post.push(ev(e.i, false, { t: 'effectReveal', effect: 'reveal_one', handNumber: cur,
              cards: dealt.map((p, j) => ({ playerId: p, cards: [p === 'human' ? e.cards[0] : RANDOM[j]] })) }));
          }
          break;
        case 'street':
          if (e.street === 'river' && sixthArmed) {
            sixthArmed = false;
            castHere = true;
            pre.push(castEv(e.i, true, cur));
          }
          break;
        case 'action':
          if (effect === 'tell' && cur <= tellUntil && tellUntil > 0 && e.playerId !== 'human' && (e.action === 'bet' || e.action === 'raise')) {
            post.push(ev(e.i, false, { t: 'tellMark', handNumber: cur, playerId: e.playerId, mark: tellMarkOf(meta.get(e.i), rng) }));
          }
          break;
        case 'potAwarded':
          if (castHere && effect === 'double_pot' && e.winners[0]) {
            post.push(ev(e.i, false, { t: 'effectBonus', effect, handNumber: cur, playerId: e.winners[0].playerId, amount: e.amount }));
          }
          break;
        case 'handComplete':
          if (castHere && effect === 'blackjack' && dealt.length) {
            pre.push(ev(e.i, true, { t: 'effectReveal', effect: 'blackjack', handNumber: cur,
              cards: dealt.map((p, j) => ({ playerId: p, cards: [RANDOM[j], RANDOM[j + 1]] })) }));
            pre.push(ev(e.i, true, { t: 'effectBonus', effect, handNumber: cur, playerId: dealt[Math.floor(rng() * dealt.length)], amount: 500 }));
          }
          if ((effect === 'hand_bounty' || effect === 'opal') && cur === bonusHand && e.winnerIds[0]) {
            pre.push(ev(e.i, true, { t: 'effectBonus', effect, handNumber: cur, playerId: e.winnerIds[0], amount: effect === 'opal' ? 1000 : 800 }));
          }
          break;
        default:
          break;
      }
      out.push(...pre, main, ...post);
    }
    return { ...st, events: out };
  });
}

const T_STATS = new Map<string, number>();

function fuzzTournament(n: number, label: string): void {
  const tot = { matches: 0, hands: 0, balloons: 0, p1: 0, silent: 0, real: 0, b35: [] as number[], b35vet: [] as number[] };
  const ps: PosterStats = { castLines: 0, casts: 0, explains: 0, bonusLines: 0, bonuses: 0, tellLines: 0, revealLines: 0 };
  const explainedBy = new Map<string, number>();
  const byEffect = new Map<PosterEffectId, { matches: number; casts: number; castLines: number; bonuses: number; bonusLines: number; tellLines: number }>();
  const forceSynthetic = args.includes('--synthetic');
  let player: Player = newPlayer();
  let personId = 0;
  for (let k = 0; k < n; k++) {
    // cada pessoa joga as 9 semanas em sequência; metade começa sem conhecer nenhum efeito
    if (k % 9 === 0) {
      personId++;
      const g = k / 9;
      player = newPlayer(g % 8 === 7 ? {} : g % 2 === 0 ? VETERAN : VETERAN_FX, g % 8 === 7 ? 0 : 5 + (g % 40));
    }
    const effect = FX_ALL[k % 9];
    const cobraItem = k % 5 === 0;
    const stake: 'chips' | 'poster' = k % 3 === 0 ? 'poster' : 'chips';
    const loan = k % 11 === 0 ? 500 : 0;
    const lang = k % 4 === 3 ? 'en' : 'pt';
    const seed = `tz-${label}-${k}`;
    const rng = createRng(`th-${label}-${k}`);
    const ctxBase: CtxOpts = { mode: 'bounty', lang, lifetimeMatches: player.lifetime, story: { ...player.story }, tournament: { stake },
      title: (['figurante', 'coadjuvante', 'estrela'] as TitleId[])[k % 3] };
    const runMatch = (cfg: MatchConfig): { steps: StepIn[]; priv: MatchEvent[] } => {
      const priv: MatchEvent[] = [];
      const steps: StepIn[] = [];
      let step = createMatch(cfg);
      let s: MatchState = step.state;
      const flush = (): void => {
        priv.push(...step.events);
        steps.push({ events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human'), humanTurnAfter: step.state.status === 'running' });
      };
      flush();
      const heroName: HeroName = (['medio', 'medio', 'iniciante', 'bom'] as HeroName[])[k % 4];
      for (let guard = 0; s.status === 'running' && guard < 3000; guard++) {
        const L = humanLegal(s);
        if (!L) break;
        step = applyHumanAction(s, HEROES[heroName](L, rng, s), { show: rng.nextFloat() < 0.3 });
        s = step.state;
        flush();
      }
      return { steps, priv };
    };
    let run: { steps: StepIn[]; priv: MatchEvent[] } | null = null;
    let real = false;
    if (!forceSynthetic) {
      try {
        run = runMatch(makeConfig({ seed, effect, cobraItem, loan }));
        real = run.steps.some((x) => x.events.some((e) => e.t === 'effectCast'));
      } catch {
        run = null;
      }
    }
    if (!real) {
      const free = runMatch(makeConfig({ mode: 'free', seed, loan }));
      run = { steps: injectEffects(free.steps, privateMeta(free.priv), effect, cobraItem, () => rng.nextFloat()), priv: free.priv };
    }
    if (real) tot.real++;
    const { dir, stage } = newDirector({ ...ctxBase, seed: `td-${label}-${k}` }, player);
    const all: PublicEvent[] = [];
    playSteps(stage, run!.steps, ctxBase, () => rng.nextFloat(), all, { quips: true });
    for (const key of dir.storyTouched()) player.story[key] = 'x';
    player.lifetime++;
    player.clock.t += 60_000;
    const tag = `torneio-${label}-${k}(${effect}${real ? '' : ', injetado'})`;
    for (const o of stage.out) {
      if (o.item.scene === 'quip' || o.item.scene === 'card') continue;
      const key = `P${o.item.priority} ${o.item.debug?.trigger ?? '?'}`;
      T_STATS.set(key, (T_STATS.get(key) ?? 0) + 1);
    }
    if (args.includes('--dump') && Number(args[args.indexOf('--dump') + 1]) === k) {
      const ends = all.filter((e) => e.t === 'matchEnded' || e.t === 'eliminated');
      console.log(`  [dump ${tag}] fim: ${JSON.stringify(ends)}`);
      for (const o of stage.out.slice(-8)) console.log(`    ${o.t} ${o.item.scene} P${o.item.priority} ${o.item.debug?.trigger} ${o.item.lineId}: ${o.item.text}`);
    }
    const st = verify(tag, all, stage.out, privateMeta(run!.priv));
    const p = verifyPoster(tag, all, stage.out, stake);
    for (const o of stage.out) {
      const l = byId.get(o.item.lineId);
      if (l?.on === 'effectCast' && l.variant?.includes('explica')) {
        const key = `${personId}|${l.variant[0]}`;
        explainedBy.set(key, (explainedBy.get(key) ?? 0) + 1);
      }
    }
    for (const key of Object.keys(ps) as (keyof PosterStats)[]) ps[key] += p[key];
    const fxRow = byEffect.get(effect) ?? { matches: 0, casts: 0, castLines: 0, bonuses: 0, bonusLines: 0, tellLines: 0 };
    fxRow.matches++;
    fxRow.casts += p.casts;
    fxRow.castLines += p.castLines;
    fxRow.bonuses += p.bonuses;
    fxRow.bonusLines += p.bonusLines;
    fxRow.tellLines += p.tellLines;
    byEffect.set(effect, fxRow);
    tot.matches++;
    tot.hands += st.hands;
    tot.balloons += st.balloons;
    tot.p1 += st.byPriority[1];
    tot.silent += st.silentHands;
    if (st.hands >= 28 && st.hands <= 42) {
      tot.b35.push(st.balloons);
      if (p.explains === 0) tot.b35vet.push(st.balloons);
    }
  }
  for (const [key, c] of explainedBy) check(c === 1, `fuzz de torneio: explicação ${key} tocou ${c} vezes para a mesma pessoa`);
  const per35 = tot.b35.length ? tot.b35.reduce((a, b) => a + b, 0) / tot.b35.length : NaN;
  const silentShare = tot.silent / Math.max(1, tot.hands);
  console.log(`  ${tot.matches} partidas (${tot.real} com o motor do E, ${tot.matches - tot.real} com efeitos injetados), ` +
    `${(tot.hands / tot.matches).toFixed(1)} mãos, ${(tot.balloons / tot.matches).toFixed(1)} balões por partida (${(tot.p1 / tot.matches).toFixed(1)} P1)`);
  const per35vet = tot.b35vet.length ? tot.b35vet.reduce((a, b) => a + b, 0) / tot.b35vet.length : NaN;
  console.log(`  partidas de 28–42 mãos: ${tot.b35.length}, ${per35.toFixed(1)} balões em média (${per35vet.toFixed(1)} nas ${tot.b35vet.length} sem explicação); ` +
    `${(silentShare * 100).toFixed(1)}% das mãos em silêncio`);
  console.log(`  lançadas: ${ps.casts}, com fala ${ps.castLines} (${ps.explains} explicações); bônus: ${ps.bonuses}, com fala ${ps.bonusLines}; ` +
    `tique com fala: ${ps.tellLines}; carta aberta comentada: ${ps.revealLines}`);
  if (args.includes('--stats')) {
    const rows = [...T_STATS].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([key, v]) => `${key}: ${(v / tot.matches).toFixed(2)}`);
    console.log('  balões por partida de torneio, por gatilho:\n    ' + rows.join('\n    '));
    for (const [fx, r] of byEffect) {
      console.log(`    ${fx}: ${r.matches} partidas, lançadas ${r.casts} (fala ${r.castLines}), bônus ${r.bonuses} (fala ${r.bonusLines}), tique ${r.tellLines}`);
    }
  }
  check(silentShare >= 0.4, `torneio: ${(silentShare * 100).toFixed(1)}% das mãos em silêncio (meta ≥ 40%)`);
  if (tot.b35.length >= 20) check(per35 <= 24, `torneio: ${per35.toFixed(1)} balões por partida de ~35 mãos (teto 24 com as explicações)`);
  if (tot.b35vet.length >= 20) check(per35vet >= 18 && per35vet <= 22, `torneio sem explicações: ${per35vet.toFixed(1)} balões por partida de ~35 mãos (meta 18–22)`);
  check(ps.castLines < ps.casts, 'nem toda lançada tem fala');
  check(ps.explains > 0, 'o fuzz de torneio ouviu explicações');
}

// --tn N: tamanho do fuzz de torneio (padrão 45 no --quick, 900 no completo)
const tN = args.includes('--tn') ? Number(args[args.indexOf('--tn') + 1]) : quick ? 45 : 900;
section(`4b. Fuzz de torneio (${tN} partidas)`);
{
  const t0 = Date.now();
  fuzzTournament(tN, quick ? 'q' : 'full');
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------------------
// 6. Mesa com amigos e casual de devolução (pacote H3, 03/11/2026)
// ---------------------------------------------------------------------------

const FRIEND_TRIGGERS = new Set<string>(['friendsStart', 'friendsStake', 'effectPile', 'guestOut', 'outByGuest', 'guestPot', 'guestAllIn',
  'guestBonus', 'clockOut', 'away', 'personLeft', 'friendsEnd']);
const RECLAIM_TRIGGERS = new Set<string>(['reclaimTaunt', 'reclaimWon']);
const GUEST_CAPPED_T = new Set<string>(['guestPot', 'guestAllIn', 'guestBonus', 'away']);
const BOUNTY_TRIGGERS = new Set<string>(['bountyIntro', 'bountyTaunt', 'bountyAtRisk', 'bountySteal', 'bountyWon', 'bountyLost']);
const ORACLES: RivalId[] = ['bogart', 'cypher', 'fincher'];
const exById = new Map(EXCHANGES.map((x) => [x.id, x]));

section('1d. Estático da mesa com amigos e da devolução');
{
  const fl = LINES.filter((l) => FRIEND_TRIGGERS.has(l.on) || RECLAIM_TRIGGERS.has(l.on));
  const enOf = (id: string): string => (typeof EN[id] === 'string' ? EN[id] as string : '');
  // a outra pessoa nunca pelo nome nem com gênero ("a outra visita", "a sua turma")
  const GENDER = /\b(amig[oa]|convidad[oa]|eliminad[oa]|derrubad[oa]|tirad[oa])\b/i;
  for (const l of fl) {
    check(!GENDER.test(l.pt), `${l.id}: gênero para a pessoa: ${l.pt}`);
    // fala da mesa com amigos só cita outro oráculo quando é sobre a ausência dele
    const cites = mentionsOf(l.pt, l.speaker);
    check(cites.every((r) => l.requires?.absent?.includes(r)), `${l.id}: cita ${cites} sem exigir a ausência`);
    if (l.requires?.absent) check(!l.requires.absent.includes(l.speaker), `${l.id}: exige a própria ausência`);
  }
  for (const x of EXCHANGES.filter((e) => FRIEND_TRIGGERS.has(e.on))) {
    check(!!x.requires?.absent?.length, `${x.id}: troca da mesa com amigos sem oráculo ausente definido`);
    for (const p of x.parts) {
      check(!x.requires?.absent?.includes(p.speaker), `${x.id}: balão de ${p.speaker}, que está ausente`);
      // cita só quem está na troca ou quem saiu
      check(mentionsOf(p.pt, p.speaker).every((r) => x.requires?.absent?.includes(r) || x.parts.some((q) => q.speaker === r)),
        `${x.id}: cita oráculo que pode não estar na mesa`);
    }
  }
  // cada oráculo pode ser o único sentado: todos têm fala para cada situação
  const need: [string, string | null][] = [['friendsStart', 'o1'], ['friendsStart', 'o2'], ['friendsStake', 'abertura'], ['friendsStake', 'voltou'],
    ['friendsStake', 'amigo'], ['friendsStake', 'oraculo'], ['effectPile', 'abertura'], ['effectPile', 'mesma'], ['guestOut', 'porVoce'],
    ['guestOut', 'porAmigo'], ['guestOut', 'porOraculo'], ['outByGuest', null], ['guestPot', null], ['guestAllIn', null], ['guestBonus', null],
    ['clockOut', 'voce'], ['clockOut', 'amigo'], ['away', 'amigo'], ['away', 'voltou'], ['personLeft', null], ['friendsEnd', 'voce'],
    ['friendsEnd', 'amigo'], ['friendsEnd', 'oraculo'], ['reclaimTaunt', null], ['reclaimWon', null]];
  for (const s of ORACLES) {
    for (const [t, v] of need) {
      check(LINES.some((l) => l.speaker === s && l.on === t && (v ? !!l.variant?.includes(v) : !l.variant?.length)), `sem fala ${s}/${t}/${v ?? '-'}`);
    }
    check(LINES.some((l) => l.speaker === s && l.on === 'guestOut' && l.role === 'actor'), `${s}: sem fala de quem tirou o amigo`);
  }
  // falas que podem cair na vez da pessoa: curtas nos dois idiomas
  for (const l of fl.filter((x) => ['guestAllIn', 'clockOut', 'reclaimTaunt', 'reclaimWon'].includes(x.on)
    || (x.on === 'effectPile' && x.variant?.includes('mesma')))) {
    check(!!l.curta && measure(enOf(l.id), 'en') <= SHORT_CHARS, `${l.id}: precisa ser curta (pt e en)`);
  }
  // o all-in de outra pessoa sai no meio da mão: regras de tell
  for (const l of fl.filter((x) => x.on === 'guestAllIn')) {
    if (l.speaker === 'bogart') check(JSON.stringify(l.cue) === '["nervoso"]' && l.out === 'also', `${l.id}: Sapo só nervoso ou fora`);
    if (l.speaker === 'fincher') check(!!l.cue && !l.cue.includes('confiante'), `${l.id}: Raposo com o anel`);
  }
  // devolução: a provocação é do portador, curta e ambígua; nunca explica o mecanismo
  const FORBID_PT = /recuper|devolv|de volta|resgat|a cada|partidas|elimin|me venc|vença|ganhe/i;
  const FORBID_EN = /recover|get it back|back to you|win it back|rescue|reclaim|every \w+ match|eliminat|beat me/i;
  for (const l of fl.filter((x) => x.on === 'reclaimTaunt')) {
    check(l.role === 'carrier', `${l.id}: provocação de quem não carrega`);
    check(!FORBID_PT.test(l.pt) && !FORBID_EN.test(enOf(l.id)), `${l.id}: a provocação explica o mecanismo: ${l.pt}`);
  }
  for (const l of fl.filter((x) => x.on === 'reclaimWon')) check(l.role === 'carrier' && l.priority === 1, `${l.id}: reação de quem carregava (P1)`);
  console.log(`  ${fl.length} falas novas (${fl.filter((l) => FRIEND_TRIGGERS.has(l.on)).length} da mesa com amigos, ` +
    `${fl.filter((l) => RECLAIM_TRIGGERS.has(l.on)).length} da devolução), ${EXCHANGES.filter((e) => FRIEND_TRIGGERS.has(e.on)).length} trocas`);
}

// --- apoio: eventos sintéticos da mesa com amigos ---------------------------

const LV0 = { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: null };
type PE = PublicEvent;
function fStart(i: number, seats: PlayerId[], extra: Record<string, unknown> = {}): PE {
  return { i, t: 'matchStarted', mode: 'friends', seats: seats.map((id, k) => ({ id, seat: k, stack: 1500 })), loan: 0, prize: null,
    level: LV0, people: seats.filter((x) => /^p\d$/.test(x)), ...extra } as PE;
}
function fHand(i: number, n: number, ids: PlayerId[]): PE {
  return { i, t: 'handStarted', handNumber: n, buttonId: ids[0], sbId: ids[1 % ids.length], bbId: ids[2 % ids.length], level: LV0,
    stacks: Object.fromEntries(ids.map((id) => [id, 1500])) } as PE;
}
function fAct(i: number, pid: PlayerId, action: 'fold' | 'check' | 'call' | 'bet' | 'raise', extra: Record<string, unknown> = {}): PE {
  return { i, t: 'action', playerId: pid, street: 'preflop', action, amount: 100, to: 100, toCall: 0, potAfter: 300, allIn: false,
    shortAllIn: false, stackBefore: 1500, sizeClass: action === 'bet' || action === 'raise' ? 'big' : null,
    ...(ORACLES.includes(pid) ? { cue: 'neutro', thinkMs: 800 } : {}), ...extra } as PE;
}
function fDone(i: number, n: number, winners: PlayerId[], net: Record<string, number>, potBB = 4): PE {
  return { i, t: 'handComplete', handNumber: n, net, winnerIds: winners, wentToShowdown: false, potBB, flags: {} } as PE;
}
function fElim(i: number, pid: PlayerId, by: PlayerId | null, place: number, n: number): PE {
  return { i, t: 'eliminated', playerId: pid, place, byId: by, handNumber: n } as PE;
}
function fEnd(i: number, places: Record<string, number>, winnerId: PlayerId | null, humanPlace: number, reason = 'won'): PE {
  return { i, t: 'matchEnded', places, winnerId, humanPlace, reason, prizeCaptured: false } as PE;
}
function fCast(i: number, effect: PosterEffectId, n: number, castNo = 1): PE {
  return { i, t: 'effectCast', effect, handNumber: n, castNo, data: FX_DATA[effect] } as PE;
}

/** Toca eventos crus no Diretor do aparelho de `selfId`; a vez da pessoa abre antes de cada ação dela. */
function playFriends(stage: Stage, events: PE[], ctxBase: CtxOpts, selfId: PlayerId, rng: () => number, all: PE[],
  opts: { quips?: boolean; people?: PlayerId[] } = {}): void {
  const ctx = makeCtx(ctxBase);
  for (const e of events) {
    if (e.t === 'action' && !ORACLES.includes(e.playerId)) {
      if (e.playerId === selfId && !e.auto) {
        stage.turnOpen = true;
        stage.dir.onHumanTurn(true);
        if (opts.quips && rng() < 0.08) stage.dir.onQuip(['R1', 'R2', 'R3', 'R4'][Math.floor(rng() * 4)], ORACLES[Math.floor(rng() * 3)]);
        const think = 1500 + Math.floor(rng() * 4000);
        for (let ms = 0; ms < think; ms += 1000) {
          stage.dir.onIdleTick(ms + 26000);   // na mesa com amigos o Diretor não apressa ninguém
          stage.pump(1000);
        }
        stage.turnOpen = false;
        stage.dir.onHumanTurn(false);
      } else if (!e.auto) {
        stage.pump(2000 + Math.floor(rng() * 6000));   // a outra pessoa pensa (até 30 s no relógio)
      }
    }
    all.push(e);
    stage.evIndex = all.length - 1;
    if (e.t === 'handStarted') stage.hand = e.handNumber;
    stage.dir.onEvent(e, ctx);
    stage.pump(eventMs(e));
  }
  stage.pump(20000);
}

interface FriendStats { balloons: number; guestCapped: number; byTrigger: Map<string, number> }

/** As regras da mesa com amigos numa partida já tocada (eventos crus, como a Edge manda). */
function verifyFriends(tag: string, events: PE[], emitted: Emitted[], selfId: PlayerId, people: PlayerId[], absent: RivalId[]): FriendStats {
  const st: FriendStats = { balloons: 0, guestCapped: 0, byTrigger: new Map() };
  const guests = people.filter((p) => p !== selfId);
  const evByI = new Map<number, PE>(events.map((e) => [e.i, e]));
  const handOf = new Map<number, number>();
  let h = 0;
  for (const e of events) {
    if (e.t === 'handStarted') h = e.handNumber;
    handOf.set(e.i, h);
  }
  const myOut = events.findIndex((e) => e.t === 'eliminated' && e.playerId === selfId);
  for (const em of emitted) {
    const it = em.item;
    const d = it.debug;
    if (it.speaker !== 'human') {
      check(!absent.includes(it.speaker), `${tag}: ${it.speaker} (sem lugar) falou ${it.lineId}: ${it.text}`);
      const line = byId.get(it.lineId);
      const ex = it.exchange ? exById.get(it.exchange.id) : undefined;
      const allowed = line?.requires?.absent ?? ex?.requires?.absent ?? [];
      for (const r of mentionsOf(it.text, it.speaker)) {
        check(!absent.includes(r) || allowed.includes(r), `${tag}: ${it.lineId} cita ${r}, que não está na mesa: ${it.text}`);
      }
    }
    if (it.scene !== 'quip' && it.scene !== 'card') st.balloons++;
    // depois que a pessoa caiu (ela pode seguir assistindo): só despedida e créditos; uma troca
    // atômica que já tinha começado vai até o fim
    if (myOut >= 0 && em.evIndex > myOut && !(it.exchange && it.exchange.part > 1)) {
      check(it.scene !== 'table', `${tag}: fala de mesa (${it.lineId}) depois que a pessoa caiu`);
    }
    if (!d) continue;
    st.byTrigger.set(d.trigger, (st.byTrigger.get(d.trigger) ?? 0) + 1);
    const line = byId.get(it.lineId);
    const src = evByI.get(d.eventI);
    const first = !it.exchange || it.exchange.part === 1;
    switch (d.trigger) {
      case 'playerFold': case 'playerAllIn': case 'playerBigBet':
        check(src?.t === 'action' && src.playerId === selfId, `${tag}: ${it.lineId} (${d.trigger}) por ação de ${src?.t === 'action' ? src.playerId : src?.t}`);
        break;
      case 'potLostToPlayer': case 'playerStreak':
        check(src?.t === 'handComplete' && src.winnerIds.includes(selfId), `${tag}: ${it.lineId} (${d.trigger}) sem a pessoa vencer a mão`);
        break;
      case 'playerBluffShown': {
        const ok = (src?.t === 'cardsShown' && src.playerId === selfId) || (src?.t === 'handComplete'
          && (src.flags.bluffShown?.playerId === selfId || events.some((x) => x.t === 'cardsShown' && x.playerId === selfId && handOf.get(x.i) === d.hand)));
        check(ok, `${tag}: ${it.lineId} (blefe mostrado) sem blefe da pessoa`);
        break;
      }
      case 'eliminatesPlayer':
        check(src?.t === 'eliminated' && src.playerId === selfId && ORACLES.includes(src.byId ?? ''), `${tag}: despedida sem a pessoa cair para um oráculo`);
        break;
      case 'outByGuest':
        check(src?.t === 'eliminated' && src.playerId === selfId && guests.includes(src.byId ?? ''), `${tag}: ${it.lineId} sem a pessoa cair para um amigo`);
        break;
      case 'guestOut':
        check(src?.t === 'eliminated' && guests.includes(src.playerId), `${tag}: ${it.lineId} sem amigo caindo`);
        if (src?.t === 'eliminated' && line?.variant?.includes('porVoce')) check(src.byId === selfId, `${tag}: ${it.lineId} (porVoce) por ${src.byId}`);
        if (src?.t === 'eliminated' && line?.role === 'actor') check(src.byId === it.speaker, `${tag}: ${it.lineId} ator sem ter eliminado`);
        break;
      case 'guestAllIn':
        check(src?.t === 'action' && guests.includes(src.playerId) && src.allIn, `${tag}: ${it.lineId} sem all-in de amigo`);
        break;
      case 'guestPot':
        check(src?.t === 'handComplete' && src.winnerIds.length === 1 && guests.includes(src.winnerIds[0]), `${tag}: ${it.lineId} sem pote de amigo`);
        break;
      case 'guestBonus':
        check(src?.t === 'effectBonus' && guests.includes(src.playerId), `${tag}: ${it.lineId} sem bônus de amigo`);
        break;
      case 'effectBonus':
        if (src?.t === 'effectBonus' && line) {
          check(line.variant!.includes(src.playerId === selfId ? 'humano' : 'oraculo'), `${tag}: ${it.lineId} para bônus de ${src.playerId}`);
          check(!guests.includes(src.playerId), `${tag}: ${it.lineId} (bônus) por bônus de amigo`);
        }
        break;
      case 'clockOut':
        if (src?.t === 'clockOut' && line) check(src.playerId === selfId ? !!line.variant?.includes('voce') : guests.includes(src.playerId)
          && !!line.variant?.includes('amigo'), `${tag}: ${it.lineId} para o relógio de ${src.playerId}`);
        break;
      case 'readPlayer':
        check(src?.t === 'styleRead' && src.targetId === selfId, `${tag}: leitura de outra pessoa saiu como da visita`);
        break;
      case 'idle': case 'tableWinner': case 'playerWinsMatch': case 'playerLosesMatch': case 'bountyIntro':
        check(false, `${tag}: ${d.trigger} na mesa com amigos (${it.lineId})`);
        break;
      default:
        break;
    }
    if (first && (GUEST_CAPPED_T.has(d.trigger) || (d.trigger === 'clockOut' && !!line?.variant?.includes('amigo')))) st.guestCapped++;
  }
  check(st.guestCapped <= BUDGET.guestMax, `${tag}: ${st.guestCapped} reações a amigos (teto ${BUDGET.guestMax})`);
  return st;
}

/** Sorteio com semente (cenários reproduzíveis). */
function seeded(seed: string): () => number {
  const r = createRng(seed);
  return () => r.nextFloat();
}

/** Diretor de um aparelho da mesa com amigos. */
function friendsDirector(selfId: PlayerId, people: PlayerId[], o: CtxOpts & { seed: string; stake?: Rarity | null; effects?: PosterEffectId[] },
  player?: Player): { dir: Director; stage: Stage; ctx: CtxOpts } {
  const ctx: CtxOpts = { mode: 'friends', ...o, friends: { selfId, people, stake: o.stake ?? null, effects: o.effects } };
  const { dir, stage } = newDirector(ctx, player);
  return { dir, stage, ctx };
}

section('6. Cenários da mesa com amigos');
{
  // 6a. 2 pessoas, o Raposo cedeu o lugar: só Sapo e Cobra falam; a troca "Cadê o Vovô?" só sem o Raposo
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'cypher'];
    const ev: PE[] = [fStart(1, seats)];
    let starts = 0;
    let exch = 0;
    for (let k = 0; k < 60; k++) {
      const { stage, ctx } = friendsDirector('p1', ['p1', 'p2'], { seed: `f6a-${k}`, lang: k % 3 === 0 ? 'en' : 'pt' });
      const all: PE[] = [];
      playFriends(stage, ev, ctx, 'p1', seeded(`s6-${k}-1`), all);
      verifyFriends(`6a#${k}`, all, stage.out, 'p1', ['p1', 'p2'], ['fincher']);
      if (stage.out.some((x) => x.item.debug?.trigger === 'friendsStart')) starts++;
      for (const x of stage.out) if (x.item.exchange) {
        exch++;
        check(x.item.exchange.id === 'PMT01', `6a: troca ${x.item.exchange.id} sem o oráculo certo ausente`);
      }
      check(stage.out.every((x) => x.item.scene === 'opening'), '6a: só abertura');
    }
    check(starts === 60, `6a: abertura da mesa com amigos em todas (${starts}/60)`);
    check(exch > 0, '6a: a troca de quem saiu aparece às vezes');
  }
  // 6b. 3 pessoas (aparelho da p2), só a Cobra sentada: o all-in de um amigo, amigo tirando amigo, a visita tirando amigo, créditos
  {
    const seats: PlayerId[] = ['p1', 'p3', 'p2', 'cypher'];
    const people: PlayerId[] = ['p1', 'p2', 'p3'];
    const ev: PE[] = [
      fStart(1, seats), fHand(2, 1, seats),
      fAct(3, 'p1', 'raise', { allIn: true, sizeClass: 'overbet' }), fAct(4, 'p3', 'call'), fAct(5, 'p2', 'fold'), fAct(6, 'cypher', 'fold'),
      fDone(7, 1, ['p1'], { p1: 1500, p3: -1500 }, 60), fElim(8, 'p3', 'p1', 4, 1),
      fHand(9, 2, ['p1', 'p2', 'cypher']), fAct(10, 'p2', 'raise', { allIn: true }), fAct(11, 'p1', 'call'), fAct(12, 'cypher', 'fold'),
      fDone(13, 2, ['p2'], { p2: 3000, p1: -3000 }, 60), fElim(14, 'p1', 'p2', 3, 2),
      fHand(15, 3, ['p2', 'cypher']), fAct(16, 'p2', 'raise', { allIn: true }), fAct(17, 'cypher', 'call'),
      fDone(18, 3, ['p2'], { p2: 1500, cypher: -1500 }, 60), fElim(19, 'cypher', 'p2', 2, 3),
      fEnd(20, { p2: 1, cypher: 2, p1: 3, p3: 4 }, 'p2', 1),
    ];
    let porVoce = 0;
    let stakeBack = 0;
    for (let k = 0; k < 40; k++) {
      const { stage, ctx } = friendsDirector('p2', people, { seed: `f6b-${k}`, stake: 'rare', lang: k % 4 === 0 ? 'en' : 'pt' });
      const all: PE[] = [];
      playFriends(stage, ev, ctx, 'p2', seeded(`s6-${k}-2`), all);
      verifyFriends(`6b#${k}`, all, stage.out, 'p2', people, ['bogart', 'fincher']);
      check(stage.out.every((x) => x.item.speaker === 'cypher' || x.item.speaker === 'human'), '6b: só a Cobra fala');
      const ids = stage.out.map((x) => x.item.debug?.trigger);
      check(ids[0] === 'friendsStart', `6b: abre com a saudação (${ids[0]})`);
      check(ids.includes('friendsStake') && stage.out.some((x) => x.item.scene === 'opening' && x.item.debug?.trigger === 'friendsStake'),
        '6b: a aposta de pôster na abertura');
      const pv = stage.out.filter((x) => x.item.debug?.trigger === 'guestOut' && byId.get(x.item.lineId)?.variant?.includes('porVoce'));
      porVoce += pv.length;
      const cr = stage.out.filter((x) => x.item.scene === 'credits').map((x) => `${x.item.debug?.trigger}:${byId.get(x.item.lineId)?.variant?.[0]}`);
      check(cr[0] === 'friendsEnd:voce', `6b: créditos de quem venceu (${cr})`);
      if (cr.includes('friendsStake:voltou')) stakeBack++;
    }
    check(porVoce >= 38, `6b: a visita tirando um amigo sempre ganha fala (${porVoce}/40)`);
    check(stakeBack === 40, `6b: os pôsteres voltam com a visita nos créditos (${stakeBack}/40)`);
  }
  // 6c. 4 pessoas: nenhum oráculo na mesa, nenhum balão de oráculo (nem resposta de Réplica)
  {
    const seats: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
    const ev: PE[] = [fStart(1, seats, { effects: [{ effect: 'opal', level: 3 }] }), fHand(2, 1, seats), fCast(3, 'opal', 1),
      fAct(4, 'p1', 'raise', { allIn: true }), fAct(5, 'p2', 'call'), fAct(6, 'p3', 'fold'), fAct(7, 'p4', 'fold'),
      fDone(8, 1, ['p1'], { p1: 1500, p2: -1500 }, 60), fElim(9, 'p2', 'p1', 4, 1),
      { i: 10, t: 'clockOut', playerId: 'p3', handNumber: 2, streak: 1 } as PE, { i: 11, t: 'personLeft', playerId: 'p4', reason: 'forfeit', handNumber: 2 } as PE,
      fEnd(12, { p1: 1, p3: 2, p4: 3, p2: 4 }, 'p1', 1)];
    for (const self of seats) {
      const { stage, ctx } = friendsDirector(self, seats, { seed: `f6c-${self}`, stake: 'common', effects: ['opal', 'opal', 'opal'] });
      const all: PE[] = [];
      playFriends(stage, ev, ctx, self, seeded(`s6c-${self}`), all, { quips: true });
      stage.dir.onQuip('R1', 'bogart');
      stage.pump(8000);
      check(stage.out.every((x) => x.item.speaker === 'human'), `6c (${self}): oráculo falou numa mesa sem oráculos`);
    }
  }
  // 6d. a visita cai para um amigo: despedida de um oráculo que ficou; depois silêncio até os créditos
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'fincher'];
    const people: PlayerId[] = ['p1', 'p2'];
    const ev: PE[] = [fStart(1, seats), fHand(2, 1, seats), fAct(3, 'p2', 'raise', { allIn: true }), fAct(4, 'p1', 'call'),
      fAct(5, 'bogart', 'fold'), fAct(6, 'fincher', 'fold'), fDone(7, 1, ['p2'], { p2: 1500, p1: -1500 }, 60), fElim(8, 'p1', 'p2', 4, 1),
      fHand(9, 2, ['p2', 'bogart', 'fincher']), fAct(10, 'bogart', 'raise', { allIn: true, cue: 'nervoso' }), fAct(11, 'p2', 'call'),
      fAct(12, 'fincher', 'fold'), fDone(13, 2, ['p2'], { p2: 1500, bogart: -1500 }, 60), fElim(14, 'bogart', 'p2', 3, 2),
      fEnd(15, { p2: 1, fincher: 2, bogart: 3, p1: 4 }, 'p2', 4, 'eliminated')];
    let fw = 0;
    for (let k = 0; k < 30; k++) {
      const { stage, ctx } = friendsDirector('p1', people, { seed: `f6d-${k}`, stake: 'epic' });
      const all: PE[] = [];
      playFriends(stage, ev, ctx, 'p1', seeded(`s6-${k}-4`), all);
      verifyFriends(`6d#${k}`, all, stage.out, 'p1', people, ['cypher']);
      const f = stage.out.filter((x) => x.item.scene === 'farewell');
      if (f.length === 1 && f[0].item.debug?.trigger === 'outByGuest') fw++;
      const cr = stage.out.filter((x) => x.item.scene === 'credits').map((x) => `${x.item.debug?.trigger}:${byId.get(x.item.lineId)?.variant?.[0]}`);
      check(cr.join(',') === 'friendsEnd:amigo,friendsStake:amigo', `6d: créditos de amigo vencedor com aposta (${cr})`);
    }
    check(fw === 30, `6d: despedida de quem caiu para um amigo (${fw}/30)`);
  }
  // 6e. um oráculo vence: ele mesmo fala nos créditos, e os pôsteres ficam com ele
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'cypher'];
    const people: PlayerId[] = ['p1', 'p2'];
    const ev: PE[] = [fStart(1, seats), fHand(2, 1, seats), fElim(3, 'p2', 'cypher', 4, 1), fElim(4, 'bogart', 'cypher', 3, 1),
      fElim(5, 'p1', 'cypher', 2, 1), fEnd(6, { cypher: 1, p1: 2, bogart: 3, p2: 4 }, 'cypher', 2, 'eliminated')];
    for (let k = 0; k < 20; k++) {
      const { stage, ctx } = friendsDirector('p1', people, { seed: `f6e-${k}`, stake: 'legendary' });
      const all: PE[] = [];
      playFriends(stage, ev, ctx, 'p1', seeded(`s6-${k}-5`), all);
      verifyFriends(`6e#${k}`, all, stage.out, 'p1', people, ['fincher']);
      const cr = stage.out.filter((x) => x.item.scene === 'credits');
      check(cr.length === 2 && cr.every((x) => x.item.speaker === 'cypher'), `6e: a Cobra fala nos créditos (${cr.map((x) => x.item.speaker)})`);
      check(cr[1]?.item.debug?.trigger === 'friendsStake' && !!byId.get(cr[1].item.lineId)?.variant?.includes('oraculo'), '6e: os pôsteres ficam com ela');
      check(stage.out.some((x) => x.item.debug?.trigger === 'eliminatesPlayer'), '6e: despedida de quem caiu para a Cobra');
    }
  }
  // 6f. relógio, ausência e saída; o momento repetido pela interface não dobra
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'p3'];
    const people: PlayerId[] = ['p1', 'p2', 'p3'];
    let mine = 0;
    let away = 0;
    let left = 0;
    for (let k = 0; k < 60; k++) {
      const ev: PE[] = [fStart(1, seats), fHand(2, 1, seats),
        { i: 3, t: 'clockOut', playerId: 'p1', handNumber: 1, streak: 1 } as PE, fAct(4, 'p1', 'fold', { auto: 'timeout' }),
        { i: 5, t: 'clockOut', playerId: 'p2', handNumber: 1, streak: 1 } as PE, fAct(6, 'p2', 'check', { auto: 'timeout' }),
        fDone(7, 1, ['bogart'], { bogart: 75, p2: -75 }), fHand(8, 2, seats), { i: 9, t: 'away', playerId: 'p3', on: true, handNumber: 2 } as PE,
        fAct(10, 'p3', 'fold', { auto: 'away' }), fDone(11, 2, ['p1'], { p1: 75 }), fHand(12, 3, seats),
        { i: 13, t: 'personLeft', playerId: 'p2', reason: 'forfeit', handNumber: 3 } as PE, fElim(14, 'p2', null, 4, 3),
        fDone(15, 3, ['p1'], { p1: 75 })];
      const { dir, stage, ctx } = friendsDirector('p1', people, { seed: `f6f-${k}` });
      const all: PE[] = [];
      playFriends(stage, ev.slice(0, 1), ctx, 'p1', seeded(`s6f-${k}-a`), all);   // a abertura termina antes
      playFriends(stage, ev.slice(1, 4), ctx, 'p1', seeded(`s6f-${k}-b`), all);
      dir.onMoment({ t: 'clockOut', playerId: 'p1' });   // a interface também avisou: não dobra
      playFriends(stage, ev.slice(4), ctx, 'p1', seeded(`s6f-${k}-c`), all);
      dir.onMoment({ t: 'away', playerId: 'p3', on: true });
      dir.onMoment({ t: 'personLeft', playerId: 'p2' });
      stage.pump(10000);
      verifyFriends(`6f#${k}`, all, stage.out, 'p1', people, ['cypher', 'fincher']);
      const t = (x: string): Emitted[] => stage.out.filter((o) => o.item.debug?.trigger === x);
      check(t('clockOut').length <= 2, '6f: no máximo um balão por estouro');
      if (t('clockOut').some((o) => byId.get(o.item.lineId)?.variant?.includes('voce'))) mine++;
      check(t('away').length <= 1 && t('personLeft').length <= 1, '6f: ausência e saída sem repetir');
      if (t('away').length) away++;
      if (t('personLeft').length) left++;
      check(!stage.out.some((o) => o.item.debug?.trigger === 'guestOut'), '6f: quem saiu não vira "amigo eliminado"');
    }
    check(mine > 10, `6f: o estouro da visita às vezes ganha fala (${mine}/60)`);
    check(away > 10 && left > 10, `6f: ausência (${away}/60) e saída (${left}/60) com fala`);
  }
  // 6g. muitos pôsteres de efeito: a abertura diz que vai dar errado; dois na mesma mão: P1 uma vez
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'cypher'];
    const people: PlayerId[] = ['p1', 'p2'];
    let openPile = 0;
    let same = 0;
    for (let k = 0; k < 40; k++) {
      const ev: PE[] = [fStart(1, seats, { effects: [{ effect: 'early_flop', level: 2 }, { effect: 'double_pot', level: 1 }] }),
        fHand(2, 1, seats), fDone(3, 1, ['bogart'], { bogart: 75 }), fHand(4, 2, seats), fCast(5, 'early_flop', 2), fCast(6, 'double_pot', 2),
        fAct(7, 'p1', 'check'), fDone(8, 2, ['p1'], { p1: 75 }), fHand(9, 3, seats), fDone(10, 3, ['bogart'], { bogart: 75 }),
        fHand(11, 4, seats), fCast(12, 'early_flop', 4, 2), fCast(13, 'double_pot', 4, 2), fDone(14, 4, ['p2'], { p2: 75 })];
      const { stage, ctx } = friendsDirector('p1', people, { seed: `f6g-${k}`, story: VETERAN_FX, effects: ['early_flop', 'early_flop', 'double_pot'] });
      const all: PE[] = [];
      playFriends(stage, ev, ctx, 'p1', seeded(`s6-${k}-7`), all);
      verifyFriends(`6g#${k}`, all, stage.out, 'p1', people, ['fincher']);
      const op = stage.out.filter((o) => o.item.scene === 'opening').map((o) => o.item.debug?.trigger);
      if (op.includes('effectPile')) openPile++;
      const piles = stage.out.filter((o) => o.item.debug?.trigger === 'effectPile' && o.item.scene !== 'opening');
      check(piles.filter((o) => o.item.priority === 1).length <= 1, '6g: "vai dar errado" P1 no máximo uma vez');
      if (op.includes('effectPile')) check(piles.every((o) => o.item.priority !== 1), '6g: dito na abertura, a mesma mão não é P1');
      if (piles.length) same++;
    }
    check(openPile >= 30, `6g: a abertura comenta os pôsteres (${openPile}/40)`);
    check(same > 0, `6g: dois pôsteres na mesma mão ganham fala (${same}/40)`);
  }
  // 6h. o mesmo evento visto de dois aparelhos: cada um só se vê como a visita
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'cypher'];
    const people: PlayerId[] = ['p1', 'p2'];
    const ev: PE[] = [fStart(1, seats), fHand(2, 1, seats), fAct(3, 'p1', 'raise', { allIn: true, potAfter: 3000 }), fAct(4, 'bogart', 'fold'),
      fAct(5, 'p2', 'fold'), fAct(6, 'cypher', 'fold'), fDone(7, 1, ['p1'], { p1: 150, bogart: -50, p2: -100 }, 3),
      { i: 8, t: 'styleRead', by: 'fincher', targetId: 'p2', label: 'pedra' } as PE, fHand(9, 2, seats), fDone(10, 2, ['bogart'], { bogart: 75 })];
    const got: Record<string, Set<string>> = { p1: new Set(), p2: new Set() };
    for (let k = 0; k < 80; k++) {
      for (const self of people) {
        const { stage, ctx } = friendsDirector(self, people, { seed: `f6h-${k}-${self}` });
        const all: PE[] = [];
        playFriends(stage, ev, ctx, self, seeded(`s6h-${k}-${self}`), all);
        verifyFriends(`6h#${k}(${self})`, all, stage.out, self, people, ['fincher']);
        for (const o of stage.out) if (o.item.debug) got[self].add(o.item.debug.trigger);
      }
    }
    // o all-in é da p1; a leitura do Raposo é da p2
    check(!got.p2.has('playerAllIn'), `6h: no aparelho da p2, o all-in da p1 saiu como da visita (${[...got.p2]})`);
    check(!got.p1.has('readPlayer'), `6h: no aparelho da p1, a leitura da p2 saiu como da visita (${[...got.p1]})`);
    check(got.p1.has('playerAllIn'), '6h: no aparelho da p1 o all-in é dela');
    check(!got.p1.has('guestAllIn'), '6h: o próprio all-in nunca é "da outra visita"');
  }
  // 6i. a troca de ids vale a partida inteira, mesmo que a interface mande um contexto sem `friends`
  {
    const seats: PlayerId[] = ['p1', 'bogart', 'p2', 'cypher'];
    const people: PlayerId[] = ['p1', 'p2'];
    const ev: PE[] = [fStart(1, seats), fHand(2, 1, seats), fAct(3, 'p1', 'raise', { allIn: true, potAfter: 3000 }),
      fAct(4, 'p2', 'raise', { allIn: true, potAfter: 6000 }), fAct(5, 'bogart', 'fold'), fAct(6, 'cypher', 'fold'),
      fDone(7, 1, ['p2'], { p2: 3000, p1: -3000 }, 60), fElim(8, 'p1', 'p2', 4, 1)];
    let mine = 0;
    for (let k = 0; k < 40; k++) {
      const { stage, ctx } = friendsDirector('p2', people, { seed: `f6i-${k}` });
      const all: PE[] = [];
      playFriends(stage, ev.slice(0, 1), ctx, 'p2', seeded(`s6i-${k}-a`), all);
      playFriends(stage, ev.slice(1), { ...ctx, friends: undefined, mode: 'friends' }, 'p2', seeded(`s6i-${k}-b`), all);
      verifyFriends(`6i#${k}`, all, stage.out, 'p2', people, ['fincher']);
      if (stage.out.some((o) => o.item.debug?.trigger === 'playerAllIn')) mine++;
      check(stage.out.some((o) => o.item.debug?.trigger === 'guestOut'), '6i: a visita tirou a outra: fala P1');
    }
    check(mine > 0, `6i: o all-in da p2 é o da visita (${mine}/40)`);
  }
}

// --- fuzz da mesa com amigos -------------------------------------------------

/**
 * Mesa com amigos a partir de uma partida do motor (enquanto o E3 não monta a mesa de várias
 * pessoas no simulador): os oráculos de `takeover` viram pessoas (p2…), a pessoa vira p1. Os
 * eventos ficam crus (como a Edge manda); ações das pessoas perdem cue/thinkMs e os eventos
 * que pessoas não têm (tilt, leitura feita por elas, tique) somem.
 */
function friendsFromRun(steps: StepIn[], takeover: RivalId[], rng: () => number): { events: PE[]; people: PlayerId[] } {
  const map: Record<string, string> = { human: 'p1' };
  takeover.forEach((r, j) => { map[r] = `p${j + 2}`; });
  const fn = (id: string): string => map[id] ?? id;
  const people = ['p1', ...takeover.map((_, j) => `p${j + 2}`)];
  const out: PE[] = [];
  const outIds = new Set<string>();
  for (const st of steps) {
    for (const raw of st.events) {
      if ((raw.t === 'tilt' || raw.t === 'tellMark') && map[raw.playerId]) continue;
      if (raw.t === 'styleRead' && map[raw.by]) continue;
      let e = remapIds(raw, fn);
      if (e.t === 'matchStarted') e = { ...e, mode: 'friends', prize: null, people };
      if (e.t === 'action' && people.includes(e.playerId)) {
        const { cue: _c, thinkMs: _t, ...rest } = e;
        void _c; void _t;
        e = rest as PE;
      }
      if (e.t === 'eliminated') outIds.add(e.playerId);
      if (e.t === 'matchEnded' && !e.winnerId) {
        // a partida do motor acabou quando a p1 caiu: alguém que sobrou "vence" (créditos)
        const alive = Object.keys(e.places).filter((p) => !outIds.has(p));
        e = { ...e, winnerId: alive.length ? alive[Math.floor(rng() * alive.length)] : null };
      }
      out.push(e);
    }
  }
  return { events: out, people };
}

/** Efeitos, relógio e ausência injetados na mesa com amigos (os `i` novos são fracionários). */
function injectFriends(events: PE[], people: PlayerId[], rng: () => number, o: { effects: PosterEffectId[]; clock: boolean; away: boolean }): PE[] {
  const pick = (a: number, b: number): number => a + Math.floor(rng() * (b - a + 1));
  const levels = new Map<PosterEffectId, number>();
  for (const f of o.effects) levels.set(f, (levels.get(f) ?? 0) + 1);
  const castsAt = new Map<number, PosterEffectId[]>();
  let base = -1;
  for (const f of levels.keys()) {
    const c1 = base > 0 && rng() < 0.6 ? base : pick(2, 8);   // muitas vezes na mesma mão de outro efeito
    if (base < 0) base = c1;
    const hands = f === 'opal' || f === 'hand_bounty' ? [c1] : [c1, c1 + 6 + pick(0, 3)];
    for (const hh of hands) castsAt.set(hh, [...(castsAt.get(hh) ?? []), f]);
  }
  const castNo = new Map<PosterEffectId, number>();
  const bonusAt = new Map<number, PosterEffectId>();
  const awayWho = o.away ? people[1 + Math.floor(rng() * (people.length - 1))] : null;
  const awayHand = pick(3, 12);
  let k = 0;
  let cur = 0;
  let castHere: PosterEffectId[] = [];
  const out: PE[] = [];
  const add = (baseI: number, pre: boolean, body: Record<string, unknown>): PE => {
    k++;
    return { ...body, i: baseI + (pre ? -0.5 : 0) + k * 0.0001 } as PE;
  };
  for (const e of events) {
    const pre: PE[] = [];
    const post: PE[] = [];
    let main: PE = e;
    switch (e.t) {
      case 'matchStarted':
        main = { ...e, effects: [...levels].map(([effect, level]) => ({ effect, level })) } as PE;
        break;
      case 'handStarted':
        cur = e.handNumber;
        castHere = castsAt.get(cur) ?? [];
        for (const f of castHere) {
          const n = (castNo.get(f) ?? 0) + 1;
          castNo.set(f, n);
          post.push(add(e.i, false, { t: 'effectCast', effect: f, handNumber: cur, castNo: n, data: FX_DATA[f] }));
          if (f === 'opal' || f === 'hand_bounty') bonusAt.set(cur + pick(0, 4), f);
        }
        if (awayWho && cur === awayHand) post.push(add(e.i, false, { t: 'away', playerId: awayWho, on: true, handNumber: cur }));
        if (awayWho && cur === awayHand + 2) post.push(add(e.i, false, { t: 'away', playerId: awayWho, on: false, handNumber: cur }));
        break;
      case 'action':
        if (o.clock && people.includes(e.playerId) && (e.action === 'fold' || e.action === 'check') && rng() < 0.06) {
          pre.push(add(e.i, true, { t: 'clockOut', playerId: e.playerId, handNumber: cur, streak: 1 }));
          main = { ...e, auto: 'timeout' } as PE;
        }
        break;
      case 'potAwarded':
        if (castHere.includes('double_pot') && e.winners[0]) {
          post.push(add(e.i, false, { t: 'effectBonus', effect: 'double_pot', handNumber: cur, playerId: e.winners[0].playerId, amount: e.amount }));
        }
        break;
      case 'handComplete': {
        const f = bonusAt.get(cur);
        if (f && e.winnerIds[0]) {
          pre.push(add(e.i, true, { t: 'effectBonus', effect: f, handNumber: cur, playerId: e.winnerIds[0], amount: f === 'opal' ? 1000 : 800 }));
          bonusAt.delete(cur);
        }
        break;
      }
      default:
        break;
    }
    out.push(...pre, main, ...post);
  }
  return out;
}

interface FriendsFuzzRow { matches: number; hands: number; balloons: number; p1: number; silent: number; guest: number; b35: number[] }

function fuzzFriends(n: number, label: string): Map<number, FriendsFuzzRow> {
  const rows = new Map<number, FriendsFuzzRow>();
  const trig = new Map<string, number>();
  let player: Player = newPlayer();
  for (let k = 0; k < n; k++) {
    if (k % 10 === 0) player = newPlayer(k % 40 === 0 ? { first_visit: 'x' } : VETERAN_FX, k % 40 === 0 ? 3 : 20);
    const rng = createRng(`ff-${label}-${k}`);
    const nPeople = 2 + (k % 3);   // 2, 3, 4
    const order = [...ORACLES].sort(() => rng.nextFloat() - 0.5);
    const takeover = order.slice(0, nPeople - 1);
    const absent = takeover;   // o oráculo cujo lugar foi tomado não fala
    const cfg = makeConfig({ mode: 'free', seed: `ffm-${label}-${k}` });
    const steps: StepIn[] = [];
    const priv: MatchEvent[] = [];
    let step = createMatch(cfg);
    let s: MatchState = step.state;
    const flush = (): void => {
      priv.push(...step.events);
      steps.push({ events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human'), humanTurnAfter: false });
    };
    flush();
    const heroName: HeroName = (['medio', 'iniciante', 'bom'] as HeroName[])[k % 3];
    for (let guard = 0; s.status === 'running' && guard < 3000; guard++) {
      const L = humanLegal(s);
      if (!L) break;
      step = applyHumanAction(s, HEROES[heroName](L, rng, s), { show: rng.nextFloat() < 0.3 });
      s = step.state;
      flush();
    }
    const base = friendsFromRun(steps, takeover, () => rng.nextFloat());
    const effects: PosterEffectId[] = k % 2 === 0 ? [] : ([['early_flop', 'double_pot'], ['opal', 'opal', 'hand_bounty'],
      ['double_pot', 'double_pot', 'early_flop', 'opal']] as PosterEffectId[][])[k % 3];
    const events = injectFriends(base.events, base.people, () => rng.nextFloat(), { effects, clock: true, away: k % 4 === 1 });
    const selfId = base.people[k % base.people.length];
    const stake: Rarity | null = k % 3 === 0 ? null : (['common', 'rare', 'epic', 'legendary'] as Rarity[])[k % 4];
    const lang = k % 5 === 0 ? 'en' : 'pt';
    const { dir, stage, ctx } = friendsDirector(selfId, base.people, {
      seed: `ffd-${label}-${k}`, stake, effects, lang, lifetimeMatches: player.lifetime, story: { ...player.story },
    }, player);
    const all: PE[] = [];
    playFriends(stage, events, ctx, selfId, () => rng.nextFloat(), all, { quips: true });
    for (const key of dir.storyTouched()) player.story[key] = 'x';
    player.lifetime++;
    player.clock.t += 60_000;
    const tag = `amigos-${label}-${k}(${nPeople}p, eu=${selfId})`;
    const st = verify(tag, all, stage.out, privateMeta(priv));
    const fs = verifyFriends(tag, all, stage.out, selfId, base.people, absent);
    if (nPeople === 4) check(stage.out.every((o) => o.item.speaker === 'human'), `${tag}: oráculo falou sem oráculo na mesa`);
    for (const [t, c] of fs.byTrigger) trig.set(t, (trig.get(t) ?? 0) + c);
    const row = rows.get(nPeople) ?? { matches: 0, hands: 0, balloons: 0, p1: 0, silent: 0, guest: 0, b35: [] };
    row.matches++;
    row.hands += st.hands;
    row.balloons += st.balloons;
    row.p1 += st.byPriority[1];
    row.silent += st.silentHands;
    row.guest += fs.guestCapped;
    if (st.hands >= 28 && st.hands <= 42) row.b35.push(st.balloons);
    rows.set(nPeople, row);
  }
  for (const [np, r] of [...rows].sort((a, b) => a[0] - b[0])) {
    const per35 = r.b35.length ? r.b35.reduce((a, b) => a + b, 0) / r.b35.length : NaN;
    console.log(`  ${np} pessoas (${4 - np} oráculo${4 - np === 1 ? '' : 's'}): ${r.matches} partidas, ${(r.hands / r.matches).toFixed(1)} mãos, ` +
      `${(r.balloons / r.matches).toFixed(1)} balões (${(r.p1 / r.matches).toFixed(1)} P1), ~35 mãos: ${per35.toFixed(1)} (${r.b35.length}), ` +
      `${(100 * r.silent / Math.max(1, r.hands)).toFixed(1)}% das mãos em silêncio, ${(r.guest / r.matches).toFixed(2)} reações a amigos`);
  }
  if (args.includes('--stats')) {
    console.log('  balões por gatilho (mesa com amigos):\n    ' + [...trig].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, c]) => `${t}: ${c}`).join('\n    '));
  }
  return rows;
}

// --fn N: tamanho do fuzz da mesa com amigos (padrão 60 no --quick, 1.500 no completo)
const fN = args.includes('--fn') ? Number(args[args.indexOf('--fn') + 1]) : quick ? 60 : 1500;
section(`6b. Fuzz da mesa com amigos (${fN} partidas)`);
{
  const t0 = Date.now();
  const rows = fuzzFriends(fN, quick ? 'q' : 'full');
  const r2 = rows.get(2);
  const r3 = rows.get(3);
  for (const [np, r] of rows) {
    if (np < 4) check(r.silent / Math.max(1, r.hands) >= 0.4, `${np} pessoas: ${(100 * r.silent / Math.max(1, r.hands)).toFixed(1)}% das mãos em silêncio (meta ≥ 40%)`);
  }
  const avg35 = (r?: FriendsFuzzRow): number => (r && r.b35.length ? r.b35.reduce((a, b) => a + b, 0) / r.b35.length : NaN);
  // com menos oráculos, menos conversa: o orçamento encolhe com a mesa
  // (e sem emudecer: a mesa com amigos ainda tem a conversa dos oráculos que ficaram)
  if (r2 && r2.b35.length >= 10) check(avg35(r2) >= 8 && avg35(r2) <= 20, `2 pessoas: ${avg35(r2).toFixed(1)} balões por ~35 mãos (meta 8–20)`);
  if (r3 && r3.b35.length >= 10) check(avg35(r3) >= 5 && avg35(r3) <= 15, `3 pessoas: ${avg35(r3).toFixed(1)} balões por ~35 mãos (meta 5–15)`);
  if (r2 && r3 && r2.matches >= 10 && r3.matches >= 10) check(r3.balloons / r3.matches < r2.balloons / r2.matches, 'um oráculo fala menos que dois');
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// --- mesa com amigos no motor do E3 (quando ele já monta a mesa de várias pessoas) ------

interface FriendsEngine {
  friendsConfig: (o: { seed: string; people: number; effects?: PosterEffectId[] }) => MatchConfig;
  waitingFor: (s: MatchState) => PlayerId | null;
  personLegal: (s: MatchState, id: PlayerId) => ReturnType<typeof humanLegal>;
  applyPersonAction: (s: MatchState, id: PlayerId, a: Parameters<typeof applyHumanAction>[1], o?: { show?: boolean }) => ReturnType<typeof createMatch>;
  timeoutPerson: (s: MatchState, id: PlayerId) => ReturnType<typeof createMatch>;
  leavePerson?: (s: MatchState, id: PlayerId, reason?: 'forfeit' | 'abandoned') => ReturnType<typeof createMatch>;
  povEvents?: (ev: readonly PublicEvent[], viewer: PlayerId, seat: number) => PublicEvent[];
}

function friendsEngine(): FriendsEngine | null {
  const m = ENGINE as unknown as Partial<FriendsEngine>;
  return m.friendsConfig && m.waitingFor && m.personLegal && m.applyPersonAction && m.timeoutPerson ? m as FriendsEngine : null;
}

const rN = args.includes('--rn') ? Number(args[args.indexOf('--rn') + 1]) : quick ? 30 : 600;
section(`6d. Mesa com amigos no motor do E3 (${rN} partidas)`);
{
  const E = friendsEngine();
  if (!E) {
    console.log('  (o motor ainda não monta a mesa de amigos: pulando)');
  } else {
    const t0 = Date.now();
    let done = 0;
    let threw = 0;
    let balloons = 0;
    let pov = 0;
    const FX_SETS: PosterEffectId[][] = [[], ['early_flop', 'double_pot'], ['opal', 'opal', 'hand_bounty'], ['tell', 'reveal_one', 'blackjack'],
      ['double_pot', 'double_pot', 'double_pot', 'sixth_card', 'early_flop', 'opal', 'tell', 'eight_aces']];
    let player: Player = newPlayer();
    for (let k = 0; k < rN; k++) {
      if (k % 10 === 0) player = newPlayer(k % 30 === 0 ? { first_visit: 'x' } : VETERAN_FX, 20);
      const rng = createRng(`fr-${k}`);
      const nPeople = 2 + (k % 3);
      const effects = FX_SETS[k % FX_SETS.length];
      let cfg: MatchConfig;
      let priv: MatchEvent[] = [];
      try {
        cfg = E.friendsConfig({ seed: `frm-${k}`, people: nPeople, effects });
        let step = createMatch(cfg);
        let s: MatchState = step.state;
        priv = [...step.events];
        const leaver = nPeople >= 3 && k % 7 === 0 ? (cfg.people ?? [])[nPeople - 1] : null;
        for (let guard = 0; s.status === 'running' && guard < 6000; guard++) {
          const who = E.waitingFor(s);
          if (!who) break;
          if (leaver && who === leaver && E.leavePerson && rng.nextFloat() < 0.05) step = E.leavePerson(s, who, 'forfeit');
          else if (rng.nextFloat() < 0.04) step = E.timeoutPerson(s, who);
          else {
            const L = E.personLegal(s, who);
            if (!L) break;
            step = E.applyPersonAction(s, who, randomHumanAction(L, rng), { show: rng.nextFloat() < 0.2 });
          }
          s = step.state;
          priv.push(...step.events);
        }
      } catch (err) {
        threw++;
        if (threw <= 3) console.log(`  (motor lançou erro em frm-${k}: ${(err as Error).message})`);
        continue;
      }
      const people = (cfg.people ?? []) as PlayerId[];
      const absent = ORACLES.filter((r) => cfg.seats[r] === undefined);
      const selfRaw = people[k % people.length];
      let events = toPublicEvents(priv, selfRaw);
      let selfId: PlayerId = selfRaw;
      // metade dos aparelhos passa pelo povEvents do E3 ("eu" = 'human'), metade recebe crus
      if (E.povEvents && k % 2 === 1) {
        events = E.povEvents(events, selfRaw, cfg.seats[selfRaw]);
        selfId = 'human';
        pov++;
      }
      const peopleSeen = selfId === 'human' ? people.map((p) => (p === selfRaw ? 'human' : p)) : people;
      const stake: Rarity | null = k % 2 === 0 ? (['common', 'rare', 'epic', 'legendary'] as Rarity[])[k % 4] : null;
      const { dir, stage, ctx } = friendsDirector(selfId, peopleSeen, { seed: `frd-${k}`, stake, lang: k % 5 === 0 ? 'en' : 'pt',
        lifetimeMatches: player.lifetime, story: { ...player.story } }, player);
      const all: PE[] = [];
      playFriends(stage, events, ctx, selfId, () => rng.nextFloat(), all, { quips: true });
      for (const key of dir.storyTouched()) player.story[key] = 'x';
      player.lifetime++;
      player.clock.t += 60_000;
      const tag = `motor-amigos-${k}(${nPeople}p, ${effects.length} pôsteres, eu=${selfRaw}${selfId === 'human' ? ' pov' : ''})`;
      verify(tag, all, stage.out, privateMeta(priv));
      verifyFriends(tag, all, stage.out, selfId, peopleSeen, absent);
      if (nPeople === 4) check(stage.out.every((o) => o.item.speaker === 'human'), `${tag}: oráculo falou sem oráculo na mesa`);
      check(all.some((e) => e.t === 'matchEnded'), `${tag}: a partida não terminou`);
      balloons += stage.out.filter((o) => o.item.scene !== 'quip' && o.item.scene !== 'card').length;
      done++;
    }
    check(threw === 0, `motor do E3: ${threw} partidas lançaram erro`);
    console.log(`  ${done} partidas (${pov} pelo povEvents), ${(balloons / Math.max(1, done)).toFixed(1)} balões por partida, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

// --- casual de devolução -----------------------------------------------------

section('6c. Casual de devolução');
{
  // cartão "Anteriormente em…" nunca vira "partida valendo"
  {
    const ctxBase: CtxOpts = { mode: 'free', reclaim: { holderId: 'cypher' } };
    for (let k = 0; k < 20; k++) {
      const { dir } = newDirector({ ...ctxBase, seed: `rc-${k}` });
      const r = dir.cardLine('recap', makeCtx(ctxBase), { handNumber: 12, bb: 100, stacks: { human: 3000, cypher: 2000, bogart: 1000 }, holderId: 'cypher' });
      check(!!r && !byId.get(r.lineId)?.variant?.includes('valendo'), `devolução: recapitulação "valendo" (${r?.lineId})`);
    }
  }
  const rn = quick ? 60 : 900;
  let realReclaim = 0;
  let taunted = 0;
  let captured = 0;
  let wonLines = 0;
  for (let k = 0; k < rn; k++) {
    const rarity = (['common', 'rare', 'epic', 'legendary'] as Rarity[])[k % 4];
    const carrier = ORACLES[k % 3];
    // metade com a casual de devolução do motor do E3 (rescueConfig), metade com o portador da fase 1
    const rescue = (ENGINE as unknown as { rescueConfig?: (o: { seed: string; carrierId: RivalId; prizeId: string; rarity: Rarity }) => MatchConfig }).rescueConfig;
    const real = !!rescue && k % 2 === 1;
    const cfg = real ? rescue!({ seed: `rcm-${k}`, carrierId: carrier, prizeId: 'pp-lost-1', rarity })
      : makeConfig({ mode: 'bounty', seed: `rcm-${k}`, rarity, carrierId: carrier as 'bogart' });
    if (real) realReclaim++;
    const rng = createRng(`rch-${k}`);
    const steps: StepIn[] = [];
    const priv: MatchEvent[] = [];
    let step = createMatch(cfg);
    let s: MatchState = step.state;
    const flush = (): void => {
      priv.push(...step.events);
      steps.push({ events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human'), humanTurnAfter: step.state.status === 'running' });
    };
    flush();
    for (let guard = 0; s.status === 'running' && guard < 3000; guard++) {
      const L = humanLegal(s);
      if (!L) break;
      step = applyHumanAction(s, HEROES[(['medio', 'bom'] as HeroName[])[k % 2]](L, rng, s), { show: rng.nextFloat() < 0.3 });
      s = step.state;
      flush();
    }
    // a casual de devolução do E3: modo casual, o portador da fase 1 e a marca `reclaim`
    if (!real) {
      for (const st of steps) {
        st.events = st.events.map((e) => (e.t === 'matchStarted' ? { ...e, mode: 'free', reclaim: true } as PE : e));
      }
    }
    check(steps[0].events.some((e) => e.t === 'matchStarted' && e.reclaim === true && !!e.prize), `devolução-${k}: matchStarted sem reclaim/prize`);
    const ctxBase: CtxOpts = { mode: 'free', lang: k % 5 === 0 ? 'en' : 'pt', reclaim: k % 2 === 0 ? { holderId: carrier } : undefined };
    const { stage } = newDirector({ ...ctxBase, seed: `rcd-${k}` });
    const all: PE[] = [];
    playSteps(stage, steps, ctxBase, () => rng.nextFloat(), all, { quips: true });
    const tag = `devolução-${k}`;
    verify(tag, all, stage.out, privateMeta(priv));
    // quem carrega, evento a evento
    const holderAt: (string | null)[] = [];
    let holder: string | null = carrier;
    let capI = -1;
    let holderBeforeCap: string | null = null;
    all.forEach((e, j) => {
      if (e.t === 'prizeMoved') holder = e.toId;
      if (e.t === 'prizeCaptured') {
        capI = j;
        holderBeforeCap = holder;
        holder = 'human';
      }
      holderAt.push(holder);
    });
    const tr = (t: string): Emitted[] => stage.out.filter((o) => o.item.debug?.trigger === t);
    for (const o of stage.out) {
      const t = o.item.debug?.trigger ?? '';
      check(!BOUNTY_TRIGGERS.has(t), `${tag}: ${t} (${o.item.lineId}) anuncia o pôster`);
      check(!byId.get(o.item.lineId)?.variant?.includes('valendo'), `${tag}: fala de "valendo" (${o.item.lineId})`);
    }
    const ta = tr('reclaimTaunt');
    check(ta.length <= 1, `${tag}: ${ta.length} provocações`);
    for (const o of ta) {
      check(o.item.speaker === holderAt[o.evIndex], `${tag}: provocação de ${o.item.speaker}, quem carrega é ${holderAt[o.evIndex]}`);
      check(capI < 0 || o.evIndex < capI, `${tag}: provocação depois de recuperado`);
      check(o.item.curta, `${tag}: provocação longa`);
    }
    if (ta.length) taunted++;
    const won = tr('reclaimWon');
    if (capI >= 0) {
      captured++;
      wonLines += won.length;
      check(won.length === 1 && won[0].item.speaker === holderBeforeCap, `${tag}: recuperou sem a reação de quem carregava (${won.map((o) => o.item.speaker)})`);
    } else {
      check(won.length === 0, `${tag}: reação de recuperado sem recuperar`);
    }
  }
  console.log(`  ${rn} partidas (${realReclaim} com o rescueConfig do E3): provocação em ${(100 * taunted / rn).toFixed(0)}%, ` +
    `recuperado em ${captured} (${wonLines} reações)`);
  check(taunted > 0 && taunted / rn < 0.45, `devolução: provocação "de vez em quando" (${(100 * taunted / rn).toFixed(0)}% das partidas)`);
  check(captured > 0, 'devolução: o fuzz recuperou pôsteres');
}


console.log(`\n${passed} asserções ok, ${failed} falharam.`);
if (failed) {
  console.log('\nFalhas:');
  for (const f of failures.slice(0, 60)) console.log(`  - ${f}`);
  process.exitCode = 1;
}
