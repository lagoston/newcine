/**
 * Teste do roteiro do treino 'tutorial-v1' (SPEC §2.8 e §8, pacote B).
 *
 *   node scripts/poker/test-tutorial.ts
 *
 * 1. Forma: 3 mãos, 2.000 de cacife, 25/50 sem ante, cartas sem repetição com as 4 chaves de
 *    PlayerId, ≤ 6 toques por mão (ações + "Continuar"), dicas do Raposo e curtas, beats com
 *    ≤ 3 falas que existem no banco, "tomadas dois" válidas.
 * 2. Motor puro: as 3 mãos tocam até o fim só com as ações sugeridas, nenhuma ação de bot do
 *    roteiro é ilegal, as filas acabam juntas com a mão, e o resultado é o do roteiro.
 * 3. Camada de partida (startTutorialHand + applyHumanAction, pacote A): idem, sem nenhum
 *    `console.warn` do roteiro, e os beats passam pelo Diretor em pt e en.
 */
import {
  applyAction, applyHumanAction, createTable, currentPlayerId, getLegalActions, humanLegal, startHand, startTutorialHand, toPublicEvents,
} from '../../src/lib/poker/index.ts';
import type { Card, GameState, LegalActions, PlayerAction, PokerEvent, PublicEvent, ScriptedAction, TutorialHand } from '../../src/lib/poker/index.ts';
import { createDirector, DEFAULT_BANK } from '../../src/lib/poker/dialogue/director.ts';
import { measure, SHORT_CHARS } from '../../src/lib/poker/dialogue/render.ts';
import { memoryStorage } from '../../src/lib/poker/dialogue/storage.ts';
import type { SpeechItem, TableContext } from '../../src/lib/poker/dialogue/types.ts';
import { TUTORIAL_CORRECTIONS, TUTORIAL_SCRIPT } from '../../src/lib/poker/tutorial/script.ts';

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
    failures.push(`[${sectionName}] ${msg}`);
    console.log(`  FALHOU: ${msg}`);
  }
}

const S = TUTORIAL_SCRIPT;
const SEATS: Record<string, number> = { human: 0, bogart: 1, fincher: 2, cypher: 3 };
const lineById = new Map(DEFAULT_BANK.lines.map((l) => [l.id, l]));
const exIds = new Set(DEFAULT_BANK.exchanges.map((x) => x.id));
/** Resultado esperado do roteiro: quem leva e quanto a pessoa termina ganhando. */
const EXPECT = [
  { winner: 'human', humanNet: 750 - 250 },        // mão 1: 750 de pote, a pessoa pôs 250
  { winner: 'cypher', humanNet: 0 },               // mão 2: a pessoa largou de graça (estava fora dos blinds)
  { winner: 'human', humanNet: 500 - 250 },        // mão 3: leva 500, pôs 250 (150 no pré-flop + 100 da aposta; os outros 250 voltam)
];

// ---------------------------------------------------------------------------
// 1. Forma
// ---------------------------------------------------------------------------

section('1. Forma do roteiro');
check(S.id === 'tutorial-v1', 'id tutorial-v1');
check(S.stack === 2000, 'cacife 2.000');
check(S.blinds.smallBlind === 25 && S.blinds.bigBlind === 50 && S.blinds.ante === 0, 'blinds 25/50 sem ante');
check(S.hands.length === 3, '3 mãos');
S.hands.forEach((h: TutorialHand, i) => {
  const tag = `mão ${i + 1}`;
  const keys = Object.keys(h.preset.holeCards).sort().join(',');
  check(keys === 'bogart,cypher,fincher,human', `${tag}: cartas para as 4 chaves de PlayerId (${keys})`);
  const cards: Card[] = [...Object.values(h.preset.holeCards).flat(), ...h.preset.board];
  check(cards.length === 13 && new Set(cards).size === 13, `${tag}: 13 cartas sem repetição`);
  const taps = h.human.length + h.beats.filter((b) => b.waitTap).length;
  check(taps <= 6, `${tag}: ${taps} toques (máximo 6)`);
  h.human.forEach((st, k) => {
    check(st.allowed.includes(st.suggested.type), `${tag} passo ${k}: a sugerida está entre as permitidas`);
    const l = lineById.get(st.hintLineId);
    check(!!l && l.speaker === 'fincher', `${tag} passo ${k}: dica ${st.hintLineId} é do Raposo`);
    check(!!l && measure(l.pt) <= SHORT_CHARS, `${tag} passo ${k}: dica curta em pt`);
    const en = DEFAULT_BANK.en[st.hintLineId];
    check(typeof en === 'string' && measure(en, 'en') <= SHORT_CHARS, `${tag} passo ${k}: dica curta em en`);
  });
  for (const b of h.beats) {
    check(b.lineIds.length >= 1 && b.lineIds.length <= 3, `${tag}: beat com ${b.lineIds.length} falas`);
    for (const id of b.lineIds) check(lineById.has(id) || exIds.has(id), `${tag}: ${id} não existe no banco`);
    if (typeof b.at === 'object') check(b.at.afterHumanStep >= 0 && b.at.afterHumanStep < h.human.length, `${tag}: afterHumanStep ${b.at.afterHumanStep} fora dos passos`);
  }
});
// todas as falas TU* do banco estão no roteiro (ou são "tomadas dois")
{
  const used = new Set<string>();
  for (const h of S.hands) {
    for (const st of h.human) used.add(st.hintLineId);
    for (const b of h.beats) for (const id of b.lineIds) used.add(id);
  }
  for (const id of Object.values(TUTORIAL_CORRECTIONS)) used.add(id);
  for (const l of DEFAULT_BANK.lines) if (l.on === 'tutorial') check(used.has(l.id), `fala ${l.id} do treino não está no roteiro`);
  for (const [k, id] of Object.entries(TUTORIAL_CORRECTIONS)) {
    const l = lineById.get(id);
    check(!!l && l.speaker === 'fincher' && measure(l.pt) <= SHORT_CHARS, `tomada dois ${k} → ${id}: do Raposo e curta`);
    const [hand, step, type] = k.split(':');
    const st = S.hands[Number(hand)]?.human[Number(step)];
    check(!!st && !st.allowed.includes(type as PlayerAction['type']), `tomada dois ${k}: o botão está apagado nesse passo`);
  }
}

// ---------------------------------------------------------------------------
// 2. Motor puro
// ---------------------------------------------------------------------------

function legalFor(a: ScriptedAction, L: LegalActions): boolean {
  switch (a.type) {
    case 'checkOrFold': return true;
    case 'fold': return true;
    case 'check': return L.canCheck;
    case 'call': return L.call !== null;
    case 'allIn': return L.allIn !== null;
    case 'bet': return !!L.bet && a.amount >= L.bet.min && a.amount <= L.bet.max;
    case 'raise': return !!L.raise && a.amount >= L.raise.min && a.amount <= L.raise.max;
    default: return false;
  }
}

section('2. Motor puro');
S.hands.forEach((h, i) => {
  const tag = `mão ${i + 1}`;
  let g: GameState = createTable(
    { smallBlind: S.blinds.smallBlind, bigBlind: S.blinds.bigBlind, ante: S.blinds.ante, buttonSeat: SEATS[h.buttonId] },
    Object.entries(SEATS).map(([id, seat]) => ({ id, seat, stack: S.stack })),
    'tutorial-v1',
  );
  const r0 = startHand(g, { preset: { holeCards: h.preset.holeCards, board: h.preset.board } });
  g = r0.state;
  const events: PokerEvent[] = [...r0.events];
  const queues = new Map(Object.entries(h.bots).map(([k, v]) => [k, [...(v ?? [])]]));
  let step = 0;
  let guard = 0;
  while (g.phase === 'betting' && guard++ < 100) {
    const id = currentPlayerId(g);
    if (!id) break;
    const L = getLegalActions(g, id)!;
    let a: PlayerAction;
    if (id === 'human') {
      const st = h.human[step];
      check(!!st, `${tag}: a pessoa agiu mais vezes que o roteiro (${step + 1})`);
      if (!st) break;
      check(st.street === L.street, `${tag} passo ${step}: rua ${L.street}, roteiro diz ${st.street}`);
      check(legalFor(st.suggested, L), `${tag} passo ${step}: sugerida ${JSON.stringify(st.suggested)} é ilegal`);
      a = st.suggested;
      step++;
    } else {
      const q = queues.get(id) ?? [];
      const want = q.shift();
      check(!!want, `${tag}: fila de ${id} acabou antes da hora`);
      check(!!want && legalFor(want, L), `${tag}: ação de ${id} ${JSON.stringify(want)} é ilegal (${L.street})`);
      a = !want || want.type === 'checkOrFold' ? (L.canCheck ? { type: 'check' } : { type: 'fold' }) : want;
    }
    const r = applyAction(g, id, a);
    g = r.state;
    events.push(...r.events);
  }
  check(g.phase !== 'betting', `${tag}: a mão terminou`);
  check(step === h.human.length, `${tag}: a pessoa usou ${step} de ${h.human.length} passos`);
  for (const [id, q] of queues) check(q.length === 0, `${tag}: sobrou fila para ${id} (${JSON.stringify(q)})`);
  const done = events.find((e) => e.type === 'handComplete') as Extract<PokerEvent, { type: 'handComplete' }> | undefined;
  check(!!done, `${tag}: handComplete`);
  if (done) {
    const exp = EXPECT[i];
    check(done.result.winnerIds.length === 1 && done.result.winnerIds[0] === exp.winner, `${tag}: quem leva é ${exp.winner} (veio ${done.result.winnerIds})`);
    check((done.result.net.human ?? 0) === exp.humanNet, `${tag}: a pessoa termina com ${exp.humanNet} (veio ${done.result.net.human})`);
    const show = events.find((e) => e.type === 'showdown') as Extract<PokerEvent, { type: 'showdown' }> | undefined;
    if (i === 0) check(!!show && show.hands.find((x) => x.playerId === 'human')?.kind === 'trips', 'mão 1: trinca de noves no showdown');
  }
});

// ---------------------------------------------------------------------------
// 3. Camada de partida + Diretor (beats)
// ---------------------------------------------------------------------------

section('3. startTutorialHand + Diretor');
const warnings: string[] = [];
const origWarn = console.warn;
console.warn = (...a: unknown[]) => {
  warnings.push(a.map(String).join(' '));
};
try {
  for (const lang of ['pt', 'en'] as const) {
    let t = 1_000_000;
    const dir = createDirector({
      mode: 'tutorial', lang, talk: 'all', speed: 'normal', story: { first_visit: 'x' }, lifetimeMatches: 0, matchInSession: 1,
      reducedMotion: false, storage: memoryStorage(() => t), debug: true,
    });
    const said: { item: SpeechItem; turn: boolean }[] = [];
    let turnOpen = false;
    const pump = (ms: number): void => {
      const end = t + ms;
      while (t < end) {
        const it = dir.next(t);
        if (it) said.push({ item: it, turn: turnOpen });
        t += 100;
      }
    };
    for (let i = 0 as 0 | 1 | 2; i < 3; i = (i + 1) as 0 | 1 | 2) {
      const h = S.hands[i];
      const tag = `[${lang}] mão ${i + 1}`;
      let step;
      try {
        step = startTutorialHand(S, i);
      } catch (err) {
        check(false, `${tag}: startTutorialHand lançou ${(err as Error).message}`);
        break;
      }
      const ctx = (): TableContext => ({
        mode: 'tutorial', lang, title: 'figurante', lifetimeMatches: 0, matchInSession: 1, returning: false, localHour: 20,
        story: { first_visit: 'x' }, speed: 'normal', talk: 'all', view: undefined as unknown as TableContext['view'], reducedMotion: false,
      });
      const beatsAt = (at: string | number): string[][] => h.beats
        .filter((b) => (typeof b.at === 'object' ? b.at.afterHumanStep === at : b.at === at)).map((b) => b.lineIds);
      // a interface: anima eventos, toca beats nos momentos do contrato, abre a vez, mostra a dica
      const play = (events: PublicEvent[], humanStep: number | null): void => {
        let pendingStreet: string | null = null;
        if (humanStep !== null) for (const ids of beatsAt(humanStep)) { dir.onTutorialBeat(ids); pump(9000); }
        for (const e of events) {
          dir.onEvent(e, ctx());
          if (e.t === 'holeCards') for (const ids of beatsAt('handStart')) { dir.onTutorialBeat(ids); pump(12000); }
          if (e.t === 'street') pendingStreet = e.street;
          if (e.t === 'showdown') for (const ids of beatsAt('showdown')) { dir.onTutorialBeat(ids); pump(9000); }
          pump(900);
        }
        if (pendingStreet) for (const ids of beatsAt(pendingStreet)) { dir.onTutorialBeat(ids); pump(12000); }
      };
      play(toPublicEvents(step.events, 'human'), null);
      let k = 0;
      while (step.state.status === 'running' && k < 10) {
        const L = humanLegal(step.state);
        check(!!L, `${tag}: vez da pessoa sem ações`);
        if (!L) break;
        const st = h.human[k];
        check(!!st, `${tag}: passo ${k} não existe no roteiro`);
        if (!st) break;
        dir.onTutorialBeat([st.hintLineId]);
        turnOpen = true;
        dir.onHumanTurn(true);
        pump(4000);
        turnOpen = false;
        dir.onHumanTurn(false);
        try {
          step = applyHumanAction(step.state, st.suggested);
        } catch (err) {
          check(false, `${tag} passo ${k}: applyHumanAction lançou ${(err as Error).message}`);
          break;
        }
        play(toPublicEvents(step.events, 'human'), k);
        k++;
      }
      check(k === h.human.length, `${tag}: ${k} de ${h.human.length} passos`);
      check(step.state.status === 'finished', `${tag}: termina com status finished (${step.state.status})`);
      for (const ids of beatsAt('handEnd')) { dir.onTutorialBeat(ids); pump(15000); }
      const pub = toPublicEvents(step.events, 'human');
      check(pub.some((e) => e.t === 'cardsShown'), `${tag}: no fim do treino as cartas viram`);
    }
    // toda fala de beat tocou, na ordem, sem fala longa com a vez aberta
    const expected = S.hands.flatMap((h) => [...h.beats.map((b) => b.lineIds), ...h.human.map((s) => [s.hintLineId])].flat());
    const ids = said.map((s) => s.item.lineId.replace(/\.\d+$/, ''));
    for (const id of new Set(expected)) check(ids.includes(id), `[${lang}] ${id} não tocou`);
    for (const s of said) {
      check(s.item.scene === 'tutorial', `[${lang}] ${s.item.lineId} fora da cena do treino`);
      check(!/\{[a-z_|]+\}/.test(s.item.text), `[${lang}] ${s.item.lineId} com variável sobrando`);
      if (s.turn) check(s.item.text.length <= SHORT_CHARS, `[${lang}] ${s.item.lineId} longa na vez da pessoa`);
    }
    check(dir.storyTouched().includes('once.tu3-15'), `[${lang}] a ficha do treino marca story`);
    console.log(`  [${lang}] ${said.length} balões no treino`);
  }
} finally {
  console.warn = origWarn;
}
const scriptWarnings = warnings.filter((w) => w.includes('[treino]'));
check(scriptWarnings.length === 0, `nenhum aviso de roteiro ilegal (${scriptWarnings.join(' | ')})`);

console.log(`\n${passed} asserções ok, ${failed} falharam.`);
if (failed) {
  console.log('\nFalhas:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
