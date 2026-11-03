/**
 * Teste de vazamento (SPEC §4.5). Joga partidas com a pessoa fazendo ações legais ao
 * acaso (livre e prêmio), passa todos os eventos por toPublicEvents e tableView e afirma:
 *  - nenhuma chave proibida em qualquer profundidade (exceção: `seed` no matchEnded do prêmio);
 *  - toda carta está no board, é da pessoa, ou já foi aberta naquela mão (runout, showdown,
 *    cardsShown) — e essas aberturas só trazem quem podia mostrar;
 *  - thinkMs e cue só em `action` de bot, thinkMs inteiro entre 300 e 7.000;
 *  - cada evento serializado < 4 KB e a TableView < 8 KB.
 *
 *   node scripts/poker/test-leak.ts [--n 2000]
 */
import { tableView, toPublicEvents } from '../../src/lib/poker/index.ts';
import type { Card, MatchEvent, PublicEvent } from '../../src/lib/poker/index.ts';
import { setStrictBots } from '../../src/lib/poker/match/runner.ts';
import { check, finish, makeConfig, playRandomMatch, section } from './lib/harness.ts';

setStrictBots(true);
const argN = process.argv.indexOf('--n');
const N = argN > 0 ? Number(process.argv[argN + 1]) : 2000;
const FORBIDDEN = /^(eq|equity|strength|bucket|range|percentile|handClass|score|deck|rng|seed|model|memory|tally|bots)$/i;
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
}

section(`vazamento em ${N} partidas`);
const t0 = Date.now();
let nEvents = 0;
let nViews = 0;
let maxEv = 0;
let maxView = 0;
let botActions = 0;
for (let m = 0; m < N; m++) {
  const bounty = m % 2 === 1;
  const cfg = makeConfig({ mode: bounty ? 'bounty' : 'free', seed: `leak-${m}`, loan: m % 7 === 0 ? 500 : 0, rarity: (['common', 'rare', 'epic', 'legendary'] as const)[m % 4] });
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
    // chaves
    walk(e, e.t, (k, path) => {
      if (k === 'seed' && e.t === 'matchEnded' && bounty) return;
      check(!FORBIDDEN.test(k), `chave proibida ${path}`);
      if ((k === 'thinkMs' || k === 'cue') && e.t !== 'action') check(false, `${k} fora de action (${path})`);
    }, () => {});
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
      default:
        break;
    }
    walk(e, e.t, () => {}, (s, path) => {
      if (CARD.test(s)) check(allowed(s as Card), `carta ${s} visível sem ter sido aberta (${path})`);
    });
  };

  const onStep = (step: { events: MatchEvent[]; state: Parameters<typeof tableView>[0] }): void => {
    for (const e of step.events) {
      if (e.type === 'holeCardsDealt') privHuman.set(e.i, e.hands.find((h) => h.playerId === 'human')?.cards.slice() ?? []);
    }
    // Eventos um a um (para o estado do espectador acompanhar a ordem).
    const pub = toPublicEvents(step.events, 'human');
    for (const e of pub) checkEvent(e);
    const v = tableView(step.state, 'human');
    nViews++;
    const json = JSON.stringify(v);
    maxView = Math.max(maxView, json.length);
    check(json.length < 8192, `TableView < 8 KB (${json.length})`);
    walk(v, 'view', (k, path) => check(!FORBIDDEN.test(k), `chave proibida na view ${path}`), (s, path) => {
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
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
finish();
