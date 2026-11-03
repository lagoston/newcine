/**
 * Teste de vazamento (SPEC §4.5). Joga partidas com a pessoa fazendo ações legais ao
 * acaso (livre e prêmio), passa todos os eventos por toPublicEvents e tableView e afirma:
 *  - nenhuma chave proibida em qualquer profundidade (exceção: `seed` no matchEnded do prêmio);
 *  - toda carta está no board, é da pessoa, ou já foi aberta naquela mão (runout, showdown,
 *    cardsShown) — e essas aberturas só trazem quem podia mostrar;
 *  - thinkMs e cue só em `action` de bot, thinkMs inteiro entre 300 e 7.000;
 *  - cada evento serializado < 4 KB e a TableView < 8 KB.
 *
 * Pôster Poker (pacote E, 03/11/2026): 1 em cada 3 partidas é um torneio, girando pelos 9
 * efeitos. Cada evento só pode ter os campos da sua lista (nada a mais, em lugar nenhum);
 * cartas viradas por efeito (`effectReveal`) contam como abertas e têm de ser as de
 * verdade; as cartas do anúncio (`effectCast.data`: os 8 ases, a opala) não são de
 * ninguém e só valem dentro do anúncio. A única força de mão de bot que sai de propósito é
 * o `tellMark` do 007: só no torneio do tique, só nas mãos dele e logo depois de uma aposta
 * ou aumento daquele oráculo — em qualquer outro lugar reprova.
 *
 *   node scripts/poker/test-leak.ts [--n 2000]
 */
import { tableView, toPublicEvents } from '../../src/lib/poker/index.ts';
import type { Card, MatchEvent, PosterEffectId, PublicEvent } from '../../src/lib/poker/index.ts';
import { setStrictBots } from '../../src/lib/poker/match/runner.ts';
import { ALL_EFFECTS, check, finish, makeConfig, playRandomMatch, section } from './lib/harness.ts';

setStrictBots(true);
const argN = process.argv.indexOf('--n');
const N = argN > 0 ? Number(process.argv[argN + 1]) : 2000;
const FORBIDDEN = /^(eq|equity|strength|bucket|range|percentile|handClass|score|deck|rng|seed|model|memory|tally|bots|schedule|fx|monster)$/i;
/** Campos permitidos de cada evento público (lista fechada: campo novo = reprova até entrar aqui). */
const KEYS: Record<string, readonly string[]> = {
  matchStarted: ['mode', 'seats', 'loan', 'prize', 'level', 'seedHash', 'tournament'],
  levelUp: ['level', 'handNumber'],
  handStarted: ['handNumber', 'buttonId', 'sbId', 'bbId', 'level', 'stacks'],
  blindsPosted: ['antes', 'sb', 'bb', 'potAfter', 'allInIds'],
  holeCards: ['cards'],
  action: ['playerId', 'street', 'action', 'amount', 'to', 'toCall', 'potAfter', 'allIn', 'shortAllIn', 'stackBefore', 'sizeClass', 'thinkMs', 'cue'],
  uncalledReturned: ['playerId', 'amount'],
  runout: ['hands'],
  street: ['street', 'cards', 'board', 'early'],
  showdown: ['hands'],
  cardsShown: ['playerId', 'cards', 'afterFold'],
  potAwarded: ['potIndex', 'amount', 'eligibleIds', 'winners', 'uncontested', 'kind'],
  handComplete: ['handNumber', 'net', 'winnerIds', 'wentToShowdown', 'potBB', 'flags'],
  eliminated: ['playerId', 'place', 'byId', 'handNumber'],
  prizeMoved: ['fromId', 'toId', 'handNumber'],
  prizeCaptured: ['handNumber', 'prizeId'],
  tilt: ['playerId', 'kind', 'on', 'targetId'],
  styleRead: ['by', 'targetId', 'label'],
  headsUp: ['ids', 'handNumber'],
  effectCast: ['effect', 'handNumber', 'castNo', 'data'],
  effectReveal: ['effect', 'handNumber', 'cards'],
  effectBonus: ['effect', 'handNumber', 'playerId', 'amount'],
  tellMark: ['handNumber', 'playerId', 'mark'],
  matchEnded: ['places', 'winnerId', 'humanPlace', 'reason', 'prizeCaptured', 'seed'],
};
const CAST_KEYS = new Set(['effect', 'amount', 'target', 'added', 'card', 'hands']);
const VIEW_KEYS = ['mode', 'handNumber', 'level', 'status', 'seats', 'board', 'pots', 'potTotal', 'toActId', 'legal', 'prize', 'loan', 'places', 'tournament'];
const TOURNAMENT_VIEW_KEYS = ['prizeId', 'rarity', 'effect', 'cobraItem', 'casts', 'active', 'revealed'];

/**
 * O tique pode sair aqui? Só no torneio do 007, numa mão do efeito, logo depois de uma
 * aposta/aumento DAQUELE oráculo. (Função à parte para o autoteste provar que reprova.)
 */
function tellAllowed(effect: PosterEffectId | null, tellHands: Set<number>, prev: PublicEvent | null, e: Extract<PublicEvent, { t: 'tellMark' }>): boolean {
  if (effect !== 'tell' || !tellHands.has(e.handNumber)) return false;
  if (!prev || prev.t !== 'action' || prev.playerId !== e.playerId || prev.playerId === 'human') return false;
  return (prev.action === 'bet' || prev.action === 'raise') && (e.mark === 'blefe' || e.mark === 'valor');
}
const CARD = /^[2-9TJQKA][shdc]$/;
const CUES = new Set(['confiante', 'nervoso', 'calado', 'neutro']);

function walk(v: unknown, path: string, onKey: (k: string, path: string) => void, onStr: (s: string, path: string) => void): void {
  if (typeof v === 'string') onStr(v, path);
  else if (Array.isArray(v)) v.forEach((x, k) => walk(x, `${path}[${k}]`, onKey, onStr));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      onKey(k, `${path}.${k}`);
      walk(x, `${path}.${k}`, onKey, onStr);
    }
  }
}

section('autoteste: os eventos PRIVADOS seriam pegos');
{
  const { allEvents } = playRandomMatch(makeConfig({ seed: 'self-1' }), 'self-h');
  let hits = 0;
  for (const e of allEvents) walk(e, e.type, (k) => { if (FORBIDDEN.test(k)) hits++; }, () => {});
  check(hits > 0, `o detector acha chaves proibidas no log privado (${hits})`);
  const act = { i: 1, t: 'action', playerId: 'cypher', street: 'flop', action: 'bet', amount: 100, to: 100, toCall: 0, potAfter: 300,
    allIn: false, shortAllIn: false, stackBefore: 1000, sizeClass: 'medium' } as PublicEvent;
  const tm = { i: 2, t: 'tellMark', handNumber: 5, playerId: 'cypher', mark: 'blefe' } as Extract<PublicEvent, { t: 'tellMark' }>;
  check(tellAllowed('tell', new Set([5]), act, tm), 'autoteste: tique certo é aceito');
  check(!tellAllowed('opal', new Set([5]), act, tm), 'autoteste: tique fora do torneio do 007 reprova');
  check(!tellAllowed(null, new Set([5]), act, tm), 'autoteste: tique na mesa livre reprova');
  check(!tellAllowed('tell', new Set([4]), act, tm), 'autoteste: tique fora das mãos do efeito reprova');
  check(!tellAllowed('tell', new Set([5]), { ...act, action: 'call' } as PublicEvent, tm), 'autoteste: tique depois de pagar reprova');
  check(!tellAllowed('tell', new Set([5]), { ...act, playerId: 'fincher' } as PublicEvent, tm), 'autoteste: tique de outro oráculo reprova');
  check(!tellAllowed('tell', new Set([5]), { ...act, playerId: 'human' } as PublicEvent, { ...tm, playerId: 'human' }), 'autoteste: tique da pessoa reprova');
}

section(`vazamento em ${N} partidas`);
const t0 = Date.now();
let nEvents = 0;
let nViews = 0;
let maxEv = 0;
let maxView = 0;
let botActions = 0;
let nTournament = 0;
let nTells = 0;
let nReveals = 0;
for (let m = 0; m < N; m++) {
  // 0 = livre, 1 = prêmio antigo, 2 = torneio do Pôster Poker (girando pelos 9 efeitos).
  const kind = m % 3;
  const bounty = kind !== 0;
  const effect: PosterEffectId | null = kind === 2 ? ALL_EFFECTS[Math.floor(m / 3) % ALL_EFFECTS.length] : null;
  if (effect) nTournament++;
  const cfg = effect
    ? makeConfig({ seed: `leak-${m}`, effect, loan: m % 7 === 0 ? 500 : 0 })
    : makeConfig({ mode: bounty ? 'bounty' : 'free', seed: `leak-${m}`, loan: m % 7 === 0 ? 500 : 0, rarity: (['common', 'rare', 'epic', 'legendary'] as const)[m % 4] });
  const tellHands = new Set<number>();
  let prevPub: PublicEvent | null = null;
  // Cartas de verdade de cada um no momento de cada evento (para conferir as viradas por efeito).
  const holesAt = new Map<number, Record<string, Card[]>>();
  let curHoles: Record<string, Card[]> = {};
  // Estado do "espectador" (a pessoa), atualizado só com eventos públicos.
  let board: Card[] = [];
  let opened = new Set<Card>();
  let mine: Card[] = [];
  const myOld = new Set<Card>();
  let inHand = new Set<string>();
  const privHuman = new Map<number, Card[]>();
  let lastI = 0;
  const allowed = (c: Card): boolean => board.includes(c) || mine.includes(c) || opened.has(c) || myOld.has(c);

  const checkEvent = (e: PublicEvent): void => {
    nEvents++;
    const json = JSON.stringify(e);
    maxEv = Math.max(maxEv, json.length);
    check(json.length < 4096, `evento < 4 KB (${e.t}: ${json.length})`);
    check(e.i > lastI, 'i crescente');
    lastI = e.i;
    // lista fechada de campos
    const allowedKeys = KEYS[e.t];
    check(!!allowedKeys, `evento público desconhecido: ${e.t}`);
    for (const k of Object.keys(e)) if (k !== 'i' && k !== 't') check(!!allowedKeys?.includes(k), `campo fora da lista em ${e.t}: ${k}`);
    // chaves
    walk(e, e.t, (k, path) => {
      if (k === 'seed' && e.t === 'matchEnded' && bounty) return;
      check(!FORBIDDEN.test(k), `chave proibida ${path}`);
      if ((k === 'thinkMs' || k === 'cue') && e.t !== 'action') check(false, `${k} fora de action (${path})`);
    }, () => {});
    // Pôster Poker
    if (e.t === 'effectCast' || e.t === 'effectReveal' || e.t === 'effectBonus' || e.t === 'tellMark') check(effect !== null, `${e.t} fora do torneio`);
    if (e.t === 'effectCast') {
      check(e.effect === effect && e.data.effect === effect, 'effectCast do efeito do torneio');
      for (const k of Object.keys(e.data)) check(CAST_KEYS.has(k), `campo fora da lista em effectCast.data: ${k}`);
      if (e.data.effect === 'tell') for (let h = e.handNumber; h < e.handNumber + e.data.hands; h++) tellHands.add(h);
    }
    if (e.t === 'tellMark') {
      nTells++;
      check(tellAllowed(effect, tellHands, prevPub, e), `tellMark fora do lugar (${JSON.stringify(e)} depois de ${JSON.stringify(prevPub)})`);
    }
    if (e.t === 'effectReveal') {
      nReveals++;
      for (const r of e.cards) {
        const real = holesAt.get(e.i)?.[r.playerId] ?? [];
        check(r.cards.length >= 1 && r.cards.length <= 2 && r.cards.every((c) => real.includes(c)), `effectReveal com as cartas de verdade de ${r.playerId}`);
        if (e.effect === 'reveal_one') check(r.cards.length === 1, 'reveal_one vira 1 carta');
      }
    }
    prevPub = e;
    // estado do espectador e aberturas legítimas
    switch (e.t) {
      case 'handStarted':
        for (const c of mine) myOld.add(c);
        board = [];
        opened = new Set();
        mine = [];
        inHand = new Set(Object.entries(e.stacks).filter(([, st]) => st > 0).map(([id]) => id));
        break;
      case 'holeCards':
        mine = e.cards.slice();
        check(JSON.stringify(mine) === JSON.stringify(privHuman.get(e.i)), 'holeCards = cartas da pessoa');
        break;
      case 'street':
        board = e.board.slice();
        break;
      case 'action':
        if (e.action === 'fold') inHand.delete(e.playerId);
        if (e.playerId === 'human') check(e.thinkMs === undefined && e.cue === undefined, 'ação da pessoa sem thinkMs/cue');
        else {
          botActions++;
          check(Number.isInteger(e.thinkMs) && e.thinkMs! >= 300 && e.thinkMs! <= 7000, `thinkMs inteiro 300..7000 (${e.thinkMs})`);
          check(CUES.has(e.cue as string), `cue válido (${e.cue})`);
        }
        break;
      case 'runout':
      case 'showdown':
        for (const h of e.hands) {
          check(inHand.has(h.playerId), `${e.t} só com quem está na mão (${h.playerId})`);
          for (const c of h.cards) opened.add(c);
        }
        break;
      case 'cardsShown':
        if (e.playerId === 'human') check(e.cards.every((c) => myOld.has(c) || mine.includes(c)), 'pessoa mostra só as próprias cartas');
        for (const c of e.cards) opened.add(c);
        break;
      case 'effectReveal':
        for (const r of e.cards) for (const c of r.cards) opened.add(c);
        break;
      default:
        break;
    }
    walk(e, e.t, () => {}, (s, path) => {
      // As cartas do anúncio (os 8 ases, a opala) não são de ninguém.
      if (e.t === 'effectCast' && path.startsWith('effectCast.data')) return;
      if (CARD.test(s)) check(allowed(s as Card), `carta ${s} visível sem ter sido aberta (${path})`);
    });
  };

  const onStep = (step: { events: MatchEvent[]; state: Parameters<typeof tableView>[0] }): void => {
    for (const e of step.events) {
      if (e.type === 'holeCardsDealt') privHuman.set(e.i, e.hands.find((h) => h.playerId === 'human')?.cards.slice() ?? []);
    }
    for (const e of step.events) {
      if (e.type === 'holeCardsDealt') {
        curHoles = {};
        for (const h of e.hands) curHoles[h.playerId] = h.cards.slice();
      }
      holesAt.set(e.i, curHoles);
    }
    // Eventos um a um (para o estado do espectador acompanhar a ordem).
    const pub = toPublicEvents(step.events, 'human');
    for (const e of pub) checkEvent(e);
    const v = tableView(step.state, 'human');
    nViews++;
    const json = JSON.stringify(v);
    maxView = Math.max(maxView, json.length);
    check(json.length < 8192, `TableView < 8 KB (${json.length})`);
    for (const k of Object.keys(v)) check(VIEW_KEYS.includes(k), `campo fora da lista na view: ${k}`);
    if (v.tournament) for (const k of Object.keys(v.tournament)) check(TOURNAMENT_VIEW_KEYS.includes(k), `campo fora da lista em view.tournament: ${k}`);
    check((v.tournament !== null) === (effect !== null), 'view.tournament só no torneio');
    walk(v, 'view', (k, path) => check(!FORBIDDEN.test(k), `chave proibida na view ${path}`), (s, path) => {
      if (path.startsWith('view.tournament.active')) return;   // anúncio do efeito
      if (CARD.test(s)) check(allowed(s as Card), `carta ${s} na view sem ter sido aberta (${path})`);
    });
    for (const seat of v.seats) {
      if (seat.id !== 'human' && seat.holeCards.length > 0) check(seat.holeCards.every((c) => opened.has(c)), `view mostra cartas de ${seat.id} só se abertas`);
    }
    if (v.legal) check(v.toActId === 'human', 'legal só na vez da pessoa');
  };
  playRandomMatch(cfg, `leak-h-${m}`, (step) => onStep(step), undefined, 0.5);
  if ((m + 1) % 500 === 0) console.log(`  ${m + 1} partidas (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
console.log(`  ${nEvents} eventos e ${nViews} views; ${botActions} ações de bot; maior evento ${maxEv} B; maior view ${maxView} B`);
console.log(`  ${nTournament} torneios; ${nTells} tiques e ${nReveals} viradas de efeito conferidos`);
check(nTells > 0 && nReveals > 0, 'houve tique e virada de efeito para conferir');
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
finish();
