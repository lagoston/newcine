/**
 * Testes da camada de partida (pacote A, SPEC §8): níveis, ante, eliminação e
 * eliminatorOf, passagem e captura do prêmio, empréstimo, desistência, mostrar, treino,
 * simulateRest, resumo, determinismo e pureza.
 *
 * Pacote E3 (03/11/2026): mesa de amigos (lugares, vez de cada pessoa, relógio, ausente,
 * saída, colocações, resumo por pessoa, ponto de vista) e a casual de devolução (portador sem
 * torneio: eliminar o portador ou vencer a mesa devolve o pôster).
 *
 *   node scripts/poker/test-match.ts [--n 300]
 */
import {
  DEFAULT_SETTINGS, abandonMatch, applyHumanAction, createMatch, createRng, describeLevel, eliminatorOf, forfeitMatch,
  humanLegal, levelFor, outcomeOf, runoutOdds, simulateRest, startTutorialHand, summarizeMatch, tableView,
  toPublicEvents, totalChips,
} from '../../src/lib/poker/index.ts';
import type { Card, HandResult, MatchEvent, MatchState, PlayerAction } from '../../src/lib/poker/index.ts';
import { setStrictBots } from '../../src/lib/poker/match/runner.ts';
import { isoToMs } from '../../src/lib/poker/match/summary.ts';
import { ALL_EFFECTS, EFFECT_RARITY, check, eq, finish, makeConfig, playRandomMatch, randomHumanAction, section, throws } from './lib/harness.ts';
import { DEFAULT_DIFFICULTY, DEFAULT_EFFECTS, effectParams } from '../../src/lib/poker/index.ts';
import {
  applyPersonAction, friendsConfig, friendsPayload, friendsResult, friendsSeating, leavePerson, personBack, personLegal, povEvents,
  povView, rescueConfig, timeoutPerson, waitingFor,
} from '../../src/lib/poker/index.ts';
import type { MatchStateX } from '../../src/lib/poker/match/internal.ts';
import { checkFriends, emptyFriendsStats, playFriends } from './lib/friends.ts';
import { SAMPLE_TUTORIAL, suggested } from './lib/tutorialSample.ts';

setStrictBots(true);
const argN = process.argv.indexOf('--n');
const N = argN > 0 ? Number(process.argv[argN + 1]) : 300;
const t0 = Date.now();

type Ev<T extends string> = Extract<MatchEvent, { type: T }>;

// ---------------------------------------------------------------------------
section('eliminatorOf — regra do §2.4');
{
  const base = (pots: HandResult['pots']): HandResult => ({
    handNumber: 1, buttonSeat: 0, blinds: { smallBlind: 25, bigBlind: 50, ante: 0 }, board: [], wentToShowdown: true,
    pots, shown: [], net: {}, winnerIds: [], startStacks: {}, eliminated: [], actions: [],
  });
  const pot = (potIndex: number, eligibleIds: string[], winners: string[]): HandResult['pots'][number] => ({
    potIndex, amount: 100, eligibleIds, winners: winners.map((playerId) => ({ playerId, amount: 100 / winners.length })),
    uncontested: eligibleIds.length === 1, kind: null,
  });
  eq(eliminatorOf(base([pot(0, ['bogart', 'cypher'], ['cypher'])]), 'bogart'), 'cypher', 'vencedor do único pote');
  eq(eliminatorOf(base([pot(0, ['bogart', 'cypher', 'human'], ['human']), pot(1, ['bogart', 'cypher'], ['cypher'])]), 'bogart'),
    'cypher', 'pote de maior índice em que a vítima concorria');
  eq(eliminatorOf(base([pot(0, ['bogart', 'cypher', 'human'], ['cypher', 'human'])]), 'bogart'), 'human', 'pote dividido: a pessoa tem prioridade');
  eq(eliminatorOf(base([pot(0, ['bogart', 'cypher', 'fincher'], ['fincher', 'cypher'])]), 'bogart'), 'fincher', 'dividido entre bots: ordem da ficha ímpar');
  eq(eliminatorOf(base([pot(0, ['cypher', 'human'], ['human'])]), 'bogart'), null, 'vítima fora dos potes → null');
}

// ---------------------------------------------------------------------------
section('níveis, ante, eliminação, prêmio, empréstimo e conservação (partidas aleatórias)');
let wins = 0;
let captures = 0;
let moves = 0;
let shows = 0;
let humanOuts = 0;
let headsUps = 0;
for (let m = 0; m < N; m++) {
  const bounty = m % 2 === 1;
  const loan = m % 5 === 0 ? 500 : 0;
  const carriers = ['bogart', 'cypher', 'fincher'] as const;
  const cfg = makeConfig({ mode: bounty ? 'bounty' : 'free', seed: `tm-${m}`, loan, carrierId: carriers[m % 3] });
  let holder: string | null = bounty ? carriers[m % 3] : null;
  let captured = false;
  let lastLevel = 0;
  let lastI = 0;
  let pendingHuman: Card[] | null = null;   // cartas da pessoa na mão atual
  const handCards: Record<number, Card[]> = {};
  let lastResult: HandResult | null = null;
  let curHand = 1;
  const rng = createRng(`tm-h-${m}`);
  let step = createMatch(cfg);
  let s: MatchState = step.state;
  const scan = (events: MatchEvent[], st: MatchState): void => {
    for (const e of events) {
      check(e.i > lastI, `i crescente (${e.i} > ${lastI})`);
      lastI = e.i;
      switch (e.type) {
        case 'matchStarted': {
          const h = e.seats.find((x) => x.id === 'human')!;
          eq(h.stack, 2000 + loan, 'cacife inicial da pessoa (com empréstimo)');
          check(e.seats.filter((x) => x.id !== 'human').every((x) => x.stack === 2000), 'bots começam com 2.000');
          eq(e.loan, loan, 'matchStarted.loan');
          eq(e.prize?.holderId ?? null, holder, 'portador inicial');
          break;
        }
        case 'levelUp':
          check(e.level.index === lastLevel + 1, `levelUp sobe um nível (${lastLevel} → ${e.level.index})`);
          eq(e.handNumber, e.level.index * DEFAULT_SETTINGS.handsPerLevel + 1, 'levelUp na primeira mão do nível');
          lastLevel = e.level.index;
          break;
        case 'handStarted': {
          curHand = e.handNumber;
          const lvl = levelFor(e.handNumber);
          eq([e.blinds.smallBlind, e.blinds.bigBlind, e.blinds.ante], [lvl.sb, lvl.bb, lvl.ante], `blinds da mão ${e.handNumber}`);
          eq(lvl.index, lastLevel, `nível corrente na mão ${e.handNumber}`);
          // A3 (03/11/2026): dois níveis iniciais mais fundos entraram antes de 25/50; o ante
          // continua começando em 50/100 (BB ≥ 100), sempre BB/4.
          check(lvl.bb < 100 ? lvl.ante === 0 : lvl.ante === lvl.bb / 4, 'ante = BB/4 a partir de 50/100');
          break;
        }
        case 'blindsPosted': {
          const lvl = levelFor(curHand);
          if (lvl.ante === 0) eq(e.antes.length, 0, 'sem ante antes de 50/100');
          else check(e.antes.every((a) => a.amount <= lvl.ante && a.amount > 0), 'ante cobrado de cada vivo');
          break;
        }
        case 'holeCardsDealt': {
          const mine = e.hands.find((h) => h.playerId === 'human');
          pendingHuman = mine ? mine.cards.slice() : null;
          break;
        }
        case 'handComplete':
          lastResult = e.result;
          if (pendingHuman) handCards[e.result.handNumber] = pendingHuman;
          break;
        case 'eliminated': {
          check(!!lastResult, 'eliminated depois do handComplete do motor');
          if (lastResult) eq(e.byId, eliminatorOf(lastResult, e.playerId), 'byId = eliminatorOf');
          check(e.place >= 2 && e.place <= 4, 'colocação de quem cai entre 2 e 4');
          eq(st.game.players.length, 4, 'mesa de 4');
          if (e.playerId === 'human') humanOuts++;
          break;
        }
        case 'prizeMoved':
          check(bounty && !captured, 'prizeMoved só no prêmio e antes da captura');
          eq(e.fromId, holder, 'prizeMoved sai do portador');
          check(e.toId !== 'human', 'prizeMoved nunca vai para a pessoa (isso é captura)');
          holder = e.toId;
          moves++;
          break;
        case 'prizeCaptured':
          check(bounty && !captured, 'prizeCaptured uma vez só');
          captured = true;
          holder = 'human';
          captures++;
          break;
        case 'cardsShown':
          if (e.playerId === 'human') {
            shows++;
            const lu = (s as MatchState).lastUncontested;
            check(!!lu && lu.playerId === 'human', 'pessoa só mostra depois de levar sem showdown');
            if (lu) eq(e.cards, handCards[lu.hand], 'mostra as cartas da mão anterior');
          }
          break;
        case 'headsUp':
          headsUps++;
          break;
        case 'matchEnded':
          if (e.reason === 'won') {
            wins++;
            if (bounty) check(captured, 'quem vence a mesa leva o prêmio');
          }
          break;
        default:
          break;
      }
    }
  };
  scan(step.events, s);
  for (let guard = 0; s.status === 'running' && guard < 3000; guard++) {
    const L = humanLegal(s)!;
    const a = randomHumanAction(L, rng);
    const show = rng.nextFloat() < 0.6;
    const before = JSON.stringify(s);
    const prev = s;
    step = applyHumanAction(s, a, { show });
    check(JSON.stringify(s) === before, 'applyHumanAction não altera a entrada');
    scan(step.events, prev);
    eq(totalChips(step.state.game), 8000 + loan, 'fichas conservadas');
    const out = outcomeOf(prev, step.state);
    if (step.events.some((e) => e.type === 'prizeCaptured')) check(!!out.captured, 'outcomeOf.captured no passo da captura');
    if (step.state.status !== 'running') check(!!out.finished, 'outcomeOf.finished no último passo');
    s = step.state;
  }
  check(s.status !== 'running', 'partida termina para a pessoa');
  const t = s.tally;
  check(t.pfr <= t.vpip && t.vpip <= t.hands, 'pfr ≤ vpip ≤ mãos');
  check(t.showdownsWon <= t.showdowns && t.showdowns <= t.hands, 'showdownsWon ≤ showdowns ≤ mãos');
  check(t.biggestPot <= 8500, 'maior pote ≤ 8.500');
  if (bounty) eq(s.holderId, holder, 'holderId do estado = portador acompanhado nos eventos');
  const sum = summarizeMatch(s, { clientId: `c${m}`, startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:10:00Z' });
  eq(sum.loan, loan > 0, 'resumo marca o empréstimo');
  eq(sum.durationS, 600, 'durationS');
  check(sum.place >= 1 && sum.place <= 4, 'place 1..4');
  eq(sum.reason === 'won', sum.place === 1, 'won ⇔ 1º lugar');
  if (s.status === 'humanOut' && !bounty) {
    const r = simulateRest(s);
    // Empate de cacife inicial na mesma mão divide a colocação (regra do motor): ranking "1,2,2,4".
    const pl = Object.values(r.places);
    eq(pl.length, 4, 'simulateRest: 4 colocações');
    check(pl.every((p) => p === 1 + pl.filter((q) => q < p).length), `simulateRest: ranking válido (${pl.join(',')})`);
    eq(r.places[r.winnerId], 1, 'simulateRest: vencedor em 1º');
    eq(r.places.human, s.places.human, 'simulateRest mantém a colocação da pessoa');
  }
}
console.log(`  ${N} partidas: ${wins} vitórias da pessoa, ${humanOuts} eliminações dela, ${captures} capturas, ${moves} passagens, ${shows} "Mostrar", ${headsUps} heads-up`);
check(captures > 0 && moves > 0 && shows > 0 && headsUps > 0, 'a amostra cobriu captura, passagem, mostrar e heads-up');

// ---------------------------------------------------------------------------
section('desistência e abandono');
{
  const cfg = makeConfig({ mode: 'bounty', seed: 'ff-1', rarity: 'epic' });
  const { steps } = playRandomMatch(cfg, 'ff-h', undefined, (L) => (L.canCheck ? { type: 'check' } : { type: 'call' }));
  const mid = steps.find((x, k) => k > 3 && x.state.status === 'running')?.state ?? steps[0].state;
  const alive = mid.game.players.filter((p) => p.status !== 'eliminated').length;
  const f = forfeitMatch(mid);
  eq(f.state.status, 'finished', 'forfeit encerra');
  eq(f.state.places.human, alive, 'forfeit: colocação = vivos');
  const me = f.events.find((e) => e.type === 'matchEnded') as Ev<'matchEnded'> | undefined;
  eq(me?.reason, 'forfeit', 'matchEnded.reason forfeit');
  eq(me?.humanPlace, alive, 'matchEnded.humanPlace');
  check(typeof me?.seed === 'string', 'semente revelada no fim do prêmio');
  eq(outcomeOf(mid, f.state).finished?.status, 'forfeit', 'outcomeOf forfeit');
  eq(summarizeMatch(f.state, { clientId: 'x', startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:01:00Z' }).reason, 'forfeit', 'resumo forfeit');
  throws(() => applyHumanAction(f.state, { type: 'fold' }), 'sem ação depois de desistir', 'game_over');
  throws(() => forfeitMatch(f.state), 'desistir duas vezes', 'game_over');
  const a = abandonMatch(mid);
  eq((a.events.find((e) => e.type === 'matchEnded') as Ev<'matchEnded'>).reason, 'abandoned', 'abandon');
  eq(outcomeOf(mid, a.state).finished?.status, 'abandoned', 'outcomeOf abandoned');
  eq(humanLegal(f.state), null, 'humanLegal null depois do fim');
  const free = createMatch(makeConfig({ seed: 'ff-2' }));
  const ff = forfeitMatch(free.state);
  check(!('seed' in (ff.events.find((e) => e.type === 'matchEnded') as object)), 'partida livre não revela semente');
}

// ---------------------------------------------------------------------------
section('mostrar: só a pessoa que levou sem showdown, na ação seguinte');
{
  let tested = 0;
  for (let m = 0; m < 200 && tested < 20; m++) {
    const cfg = makeConfig({ seed: `sh-${m}` });
    let s = createMatch(cfg).state;
    const rng = createRng(`sh-h-${m}`);
    while (s.status === 'running' && tested < 20) {
      const lu = s.lastUncontested;
      const L = humanLegal(s)!;
      const a = randomHumanAction(L, rng);
      const r = applyHumanAction(s, a, { show: true });
      const shown = r.events.filter((e) => e.type === 'cardsShown' && e.playerId === 'human');
      const eligible = !!lu && lu.playerId === 'human' && !lu.shown && lu.hand === s.game.handNumber - 1;
      eq(shown.length, eligible ? 1 : 0, 'cardsShown da pessoa só quando pode');
      if (eligible) {
        tested++;
        check(r.events.indexOf(shown[0]) === 0, 'cardsShown sai antes da nova ação');
        // Com show:false nada sai.
        eq(applyHumanAction(s, a, { show: false }).events.filter((e) => e.type === 'cardsShown' && e.playerId === 'human').length, 0, 'show:false não mostra');
      }
      s = r.state;
    }
  }
  check(tested >= 20, `achou 20 casos de "Mostrar" (${tested})`);
}

// ---------------------------------------------------------------------------
section('treino (roteiro de teste do falas/tutorial.md)');
{
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...args: unknown[]) => { warns.push(args.join(' ')); };
  const expectWinner = ['human', 'cypher', 'human'];
  for (const i of [0, 1, 2] as const) {
    let step = startTutorialHand(SAMPLE_TUTORIAL, i);
    eq(step.state.config.mode, 'tutorial', 'modo treino');
    eq(step.state.config.seed, 'tutorial-v1', 'semente fixa');
    const all: MatchEvent[] = [...step.events];
    let k = 0;
    while (step.state.status === 'running') {
      check(k < SAMPLE_TUTORIAL.hands[i].human.length, `mão ${i + 1}: passo ${k + 1} previsto no roteiro`);
      step = applyHumanAction(step.state, suggested(i, Math.min(k, SAMPLE_TUTORIAL.hands[i].human.length - 1)));
      all.push(...step.events);
      k++;
    }
    eq(k, SAMPLE_TUTORIAL.hands[i].human.length, `mão ${i + 1}: toques da pessoa`);
    eq(step.state.status, 'finished', `mão ${i + 1}: termina`);
    const hc = all.find((e) => e.type === 'handComplete') as Ev<'handComplete'>;
    eq(hc.result.winnerIds, [expectWinner[i]], `mão ${i + 1}: vencedor`);
    const shownBots = new Set(all.filter((e) => e.type === 'cardsShown').map((e) => (e as Ev<'cardsShown'>).playerId));
    const opened = new Set(all.filter((e) => e.type === 'showdown').flatMap((e) => (e as Ev<'showdown'>).hands.map((h) => h.playerId)));
    check(['bogart', 'cypher', 'fincher'].every((b) => shownBots.has(b) || opened.has(b)), `mão ${i + 1}: todas as cartas viram no fim`);
    check(all.every((e) => e.type !== 'actionMeta' || !e.bot || (e.bot.thinkMs === 900 && e.bot.cue === 'neutro')), 'bots do treino em 0,9 s, neutros');
    check(!all.some((e) => e.type === 'matchEnded'), 'treino não emite matchEnded');
    if (i === 0) eq(hc.result.pots.reduce((a, p) => a + p.amount, 0), 750, 'mão 1: pote final 750');
  }
  console.warn = orig;
  eq(warns, [], 'nenhuma ação do roteiro foi ilegal');
  const viaCreate = createMatch({ ...makeConfig({ seed: 'x' }), mode: 'tutorial', tutorial: SAMPLE_TUTORIAL });
  eq(viaCreate.state.tutorialHand, 0, 'createMatch no modo treino começa a mão 1');
}

// ---------------------------------------------------------------------------
section('determinismo e visão');
{
  const cfg = makeConfig({ mode: 'bounty', seed: 'det-1', loan: 500, rarity: 'legendary' });
  const a = playRandomMatch(cfg, 'det-h');
  const b = playRandomMatch(cfg, 'det-h');
  eq(JSON.stringify(a.allEvents).length, JSON.stringify(b.allEvents).length, 'mesmo tamanho de log');
  check(JSON.stringify(a.allEvents) === JSON.stringify(b.allEvents), 'mesma semente + mesmas ações = mesmo log');
  const c = playRandomMatch({ ...cfg, seed: 'det-2' }, 'det-h');
  check(JSON.stringify(a.allEvents) !== JSON.stringify(c.allEvents), 'semente diferente = log diferente');
  const s0 = createMatch(cfg).state;
  const v = tableView(s0, 'human');
  eq(v.loan, 500, 'tableView.loan');
  eq(v.prize?.holderId, 'fincher', 'tableView.prize.holderId (lendário = Raposo)');
  check(v.legal !== null && v.toActId === 'human', 'tableView.legal só na vez da pessoa');
  eq(describeLevel(s0).index, 0, 'describeLevel na mão 1');
  const pub = toPublicEvents(createMatch(cfg).events, 'human');
  eq(pub[0].i, 1, 'primeiro evento público é o matchStarted (i = 1)');
  eq(pub[0].t, 'matchStarted', 'matchStarted primeiro');
}

// ---------------------------------------------------------------------------
section('runoutOdds e datas');
{
  const pf = runoutOdds([{ playerId: 'a', cards: ['As', 'Ah'] }, { playerId: 'b', cards: ['Ks', 'Kh'] }], []);
  check(pf.a > 0.78 && pf.a < 0.85, `AA × KK antes do flop ≈ 0,82 (${pf.a})`);
  eq(runoutOdds([{ playerId: 'a', cards: ['As', 'Ah'] }, { playerId: 'b', cards: ['Ks', 'Kh'] }], []), pf, 'mesma resposta nos dois lados');
  const fl = runoutOdds([{ playerId: 'a', cards: ['As', 'Kd'] }, { playerId: 'b', cards: ['Qh', 'Qc'] }, { playerId: 'c', cards: ['7s', '8s'] }], ['2s', '9s', 'Td']);
  check(Math.abs(fl.a + fl.b + fl.c - 1) < 0.001, 'soma 1 no flop (exato)');
  const rv = runoutOdds([{ playerId: 'a', cards: ['As', 'Kd'] }, { playerId: 'b', cards: ['Ad', 'Kh'] }], ['2s', '9c', 'Td', '3h', '4c']);
  eq(rv, { a: 0.5, b: 0.5 }, 'river com empate divide');
  eq(isoToMs('1970-01-01T00:00:00Z'), 0, 'iso epoch');
  eq(isoToMs('2026-11-03T12:00:00-03:00') - isoToMs('2026-11-03T15:00:00Z'), 0, 'iso com fuso');
  check(Number.isNaN(isoToMs('ontem')), 'iso inválido → NaN');
}

// ---------------------------------------------------------------------------
section('Pôster Poker: torneio da semana (prize null, efeitos, bônus, resumo)');
{
  let tWins = 0;
  let tBonus = 0;
  let tCasts = 0;
  const nT = Math.max(27, Math.round(N / 3));
  for (let m = 0; m < nT; m++) {
    const effect = ALL_EFFECTS[m % ALL_EFFECTS.length];
    const loan = m % 4 === 0 ? 500 : 0;
    const cfg = makeConfig({ seed: `tt-${m}`, effect, loan, cobraItem: m % 5 === 0 });
    eq(cfg.difficulty, DEFAULT_DIFFICULTY[EFFECT_RARITY[effect]], 'dificuldade pela raridade do pôster');
    let step = createMatch(cfg);
    const ms = step.events.find((e) => e.type === 'matchStarted') as Ev<'matchStarted'>;
    eq(ms.prize, null, 'torneio: sem portador');
    eq(ms.tournament, cfg.tournament, 'matchStarted.tournament = config');
    const rng = createRng(`tt-h-${m}`);
    let s: MatchState = step.state;
    let bonus = 0;
    let casts = 0;
    const count = (evs: MatchEvent[]): void => {
      for (const e of evs) {
        if (e.type === 'effectBonus') bonus += e.amount;
        if (e.type === 'effectCast') casts++;
        check(e.type !== 'prizeMoved' && e.type !== 'prizeCaptured', 'torneio: sem passagem nem captura');
      }
    };
    count(step.events);
    while (s.status === 'running') {
      const before = JSON.stringify(s);
      const prev = s;
      step = applyHumanAction(s, randomHumanAction(humanLegal(s)!, rng), { show: rng.nextFloat() < 0.5 });
      check(JSON.stringify(s) === before, 'torneio: applyHumanAction não altera a entrada');
      count(step.events);
      eq(totalChips(step.state.game), 8000 + loan + bonus, 'torneio: fichas = 8.000 + empréstimo + bônus da casa');
      const out = outcomeOf(prev, step.state);
      check(!out.captured, 'torneio: outcomeOf sem captura');
      if (step.state.status !== 'running') check(!!out.finished, 'torneio: outcomeOf.finished no fim');
      s = step.state;
    }
    eq(s.holderId, null, 'torneio: holderId null');
    eq(s.capturedHand, null, 'torneio: capturedHand null');
    const me = toPublicEvents(step.events, 'human').find((e) => e.t === 'matchEnded');
    check(me?.t === 'matchEnded' && me.prizeCaptured === false && typeof me.seed === 'string', 'torneio: matchEnded sem captura e com a semente');
    const sum = summarizeMatch(s, { clientId: `t${m}`, startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:10:00Z' });
    eq(sum.tournament?.prizeId, cfg.tournament!.prizeId, 'resumo.tournament.prizeId');
    eq(sum.tournament?.effect, effect, 'resumo.tournament.effect');
    eq(sum.tournament?.won, sum.place === 1, 'resumo.tournament.won ⇔ 1º lugar');
    eq(sum.tournament?.casts, casts, 'resumo.tournament.casts');
    check((sum.tournament?.bonusWon ?? -1) >= 0 && sum.tournament!.bonusWon <= bonus, 'resumo.tournament.bonusWon ≤ bônus pagos');
    check(sum.human.biggestPot <= 8000 + loan + bonus, 'maior pote ≤ fichas da mesa');
    const v = tableView(s, 'human');
    eq(v.tournament?.cobraItem, cfg.tournament!.cobraItem, 'view.tournament.cobraItem');
    if (s.status === 'humanOut') {
      const r = simulateRest(s);
      const pl = Object.values(r.places);
      eq(pl.length, 4, 'torneio: simulateRest com 4 colocações');
      eq(r.places.human, s.places.human, 'torneio: simulateRest mantém a pessoa');
    }
    if (sum.place === 1) tWins++;
    tBonus += bonus;
    tCasts += casts;
  }
  console.log(`  ${nT} torneios: ${tWins} vitórias da pessoa, ${tCasts} lançadas, ${tBonus} fichas de bônus`);
  // Desistência no torneio.
  const cfg = makeConfig({ seed: 'tt-ff', effect: 'tell' });
  const { steps } = playRandomMatch(cfg, 'tt-ff-h', undefined, (L) => (L.canCheck ? { type: 'check' } : { type: 'call' }));
  const mid = steps.find((x, k) => k > 3 && x.state.status === 'running')?.state ?? steps[0].state;
  const f = forfeitMatch(mid);
  eq(summarizeMatch(f.state, { clientId: 'x', startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:01:00Z' }).tournament?.won, false, 'torneio: desistir não vence');
  // Números dos efeitos: padrão e sobreposição do banco, com limites.
  eq(effectParams(undefined, 'blackjack'), DEFAULT_EFFECTS.blackjack, 'effectParams sem banco = DEFAULT_EFFECTS');
  const over = effectParams({ ...DEFAULT_SETTINGS, effects: { blackjack: { amount: 99999, casts: 50, firstHand: [0, 900], gapHands: -3 } } }, 'blackjack');
  eq([over.amount, over.casts, over.firstHand, over.gapHands], [5000, 6, [1, 60], 1], 'effectParams presos nos limites');
  eq(effectParams({ ...DEFAULT_SETTINGS, effects: { opal: { casts: 3 } } }, 'opal').casts, 1, 'opala vale uma vez só');
  const custom = makeConfig({ seed: 'tt-custom', effect: 'double_pot' });
  const c2 = { ...custom, settings: { ...custom.settings, effects: { double_pot: { firstHand: [1, 1] as [number, number], casts: 1 } } } };
  const st = createMatch(c2);
  check(st.events.some((e) => e.type === 'effectCast' && e.handNumber === 1), 'poker_settings.effects muda o cronograma (lança na mão 1)');
}

// ---------------------------------------------------------------------------
section('limites de ação');
{
  const s = createMatch(makeConfig({ seed: 'lim-1' })).state;
  const L = humanLegal(s)!;
  throws(() => applyHumanAction(s, { type: 'raise', amount: 1 } as PlayerAction), 'aumento abaixo do mínimo', L.raise || L.bet ? 'invalid_amount' : 'illegal_action');
  if (!L.canCheck) throws(() => applyHumanAction(s, { type: 'check' }), 'check sem poder', 'illegal_action');
}

// ---------------------------------------------------------------------------
section('mesa de amigos: lugares e configuração');
{
  for (let n = 1; n <= 4; n++) {
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const sx = friendsSeating(`seat-${n}-${k}`, n);
      eq(sx.people, ['p1', 'p2', 'p3', 'p4'].slice(0, n), `${n} pessoas: p1..p${n}`);
      eq(sx.seats.p1, 0, 'p1 no lugar 0');
      eq(sx.oracles.length, 4 - n, `${n} pessoas: ${4 - n} oráculos`);
      const seatsUsed = Object.values(sx.seats).sort();
      eq(seatsUsed, [0, 1, 2, 3], 'os 4 lugares ocupados, sem repetir');
      const ORACLE: Record<string, number> = { bogart: 1, fincher: 2, cypher: 3 };
      for (const o of sx.oracles) eq(sx.seats[o], ORACLE[o], `${o} no lugar dele`);
      seen.add(sx.oracles.join(','));
      eq(friendsSeating(`seat-${n}-${k}`, n), sx, 'mesma semente, mesmos lugares');
    }
    if (n === 2 || n === 3) check(seen.size === 3, `${n} pessoas: o oráculo que sai é sorteado (${[...seen].join(' | ')})`);
  }
  const cfg = friendsConfig({ seed: 'cfg-1', people: 3, effects: ['opal', 'zzz', 'tell', 'opal', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'tell'] });
  eq(cfg.mode, 'friends', 'modo friends');
  eq(cfg.effects, ['opal', 'tell', 'opal', 'tell'], 'efeitos: só ids válidos, repetidos ficam (até 8)');
  eq(cfg.loan, 0, 'sem empréstimo');
  eq(cfg.prize, null, 'sem prêmio');
  eq(cfg.difficulty, DEFAULT_DIFFICULTY.free, 'oráculos no padrão da casual');
  eq(Object.keys(cfg.profiles).length, 1, 'perfil só dos oráculos sentados');
  const st = createMatch(cfg);
  const ms = st.events.find((e) => e.type === 'matchStarted') as Ev<'matchStarted'>;
  eq(ms.people, ['p1', 'p2', 'p3'], 'matchStarted.people');
  eq(ms.effects, [{ effect: 'tell', level: 2 }, { effect: 'opal', level: 2 }], 'matchStarted.effects (ordem fixa, com o nível)');
  check(ms.seats.length === 4 && !ms.seats.some((x) => x.id === 'human'), 'ninguém se chama human na mesa de amigos');
  const w = waitingFor(st.state);
  check(!!w && cfg.people!.includes(w), `createMatch para na vez de uma pessoa (${w})`);
  throws(() => applyHumanAction(st.state, { type: 'fold' }), 'applyHumanAction não vale na mesa de amigos', 'illegal_action');
  throws(() => forfeitMatch(st.state), 'forfeitMatch não vale na mesa de amigos', 'illegal_action');
  const other = cfg.people!.find((id) => id !== w)!;
  throws(() => applyPersonAction(st.state, other, { type: 'fold' }), 'ação fora da vez', 'not_your_turn');
  throws(() => timeoutPerson(st.state, other), 'estouro fora da vez', 'not_your_turn');
  throws(() => applyPersonAction(st.state, 'bogart', { type: 'fold' }), 'oráculo não é pessoa', 'illegal_action');
  eq(personLegal(st.state, other), null, 'sem ações legais fora da vez');
  check(!!personLegal(st.state, w!), 'ações legais na vez');
  throws(() => timeoutPerson(createMatch(makeConfig({ seed: 'x' })).state, 'human'), 'relógio só na mesa de amigos', 'illegal_action');
}

// ---------------------------------------------------------------------------
section('mesa de amigos: vez, saída, colocações e resumo por pessoa');
{
  const stats = emptyFriendsStats();
  const META = { clientId: 'f', startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:20:00Z' };
  for (let m = 0; m < Math.max(30, Math.floor(N / 6)); m++) {
    const n = 1 + (m % 4);
    const cfg = friendsConfig({ seed: `fm-${m}`, people: n, effects: m % 3 === 0 ? [] : ['blackjack', 'opal'] });
    const p = playFriends(cfg, `fm-h-${m}`, { pTimeout: 0.08, pLeave: 0.005, pLeaveOther: 0.004 });
    checkFriends(p, `fm-${m}`, stats, m % 4 === 0);
    // Resumo de cada pessoa
    const r = friendsResult(p.final);
    for (const id of cfg.people!) {
      const sum = summarizeMatch(p.final, META, id);
      eq(sum.mode, 'friends', 'resumo mode friends');
      eq(sum.place, r.people[id].place, `resumo: colocação de ${id}`);
      eq(sum.reason, r.people[id].reason, `resumo: motivo de ${id}`);
      eq(sum.friends?.playerId, id, 'resumo.friends.playerId');
      eq(sum.friends?.winnerIsPerson, r.winnerIsPerson, 'resumo.friends.winnerIsPerson');
      eq(sum.loan, false, 'sem empréstimo');
      eq(sum.prize, null, 'sem prêmio');
      check(sum.human.hands <= p.final.game.handNumber, 'mãos da pessoa ≤ mãos da partida');
    }
    // Uma pessoa nunca age depois de sair ou cair.
    const out = new Set<string>();
    for (const e of p.priv) {
      if (e.type === 'eliminated') out.add(e.playerId);
      if (e.type === 'actionMeta' && out.has(e.playerId)) check(false, `${e.playerId} agiu depois de sair da mesa`);
    }
    throws(() => applyPersonAction(p.final, cfg.people![0], { type: 'fold' }), 'nada depois do fim', 'game_over');
  }
  console.log(`  ${stats.hands} mãos · saídas ${stats.leaves} · estouros ${stats.timeouts} · vencedor pessoa ${stats.personWins}, oráculo ${stats.oracleWins}`);
  check(stats.personWins > 0 && stats.oracleWins > 0, 'venceram pessoas e oráculos');
}

// ---------------------------------------------------------------------------
section('mesa de amigos: sair no meio não acaba a partida das outras');
{
  let tested = 0;
  for (let m = 0; m < 20; m++) {
    const cfg = friendsConfig({ seed: `lv-${m}`, people: 3, effects: [] });
    let s = createMatch(cfg).state;
    const rng = createRng(`lv-h-${m}`);
    for (let k = 0; k < 4 && s.status === 'running'; k++) s = applyPersonAction(s, waitingFor(s)!, randomHumanAction(personLegal(s, waitingFor(s)!)!, rng)).state;
    if (s.status !== 'running') continue;
    const who = waitingFor(s)!;
    const other = cfg.people!.find((id) => id !== who && (s as MatchStateX).people![id].status === 'playing')!;
    if (!other) continue;
    const st = leavePerson(s, other, 'abandoned');
    check(st.events.some((e) => e.type === 'personLeft' && e.playerId === other && e.reason === 'abandoned'), 'personLeft');
    eq(st.state.status, 'running', 'a partida continua');
    eq(friendsResult(st.state).people[other].status, 'playing', 'continua sentado até o fim da mão');
    eq(tableView(st.state, who).people?.[other].status, 'left', 'a visão já mostra que saiu');
    throws(() => leavePerson(st.state, other), 'sair duas vezes', 'game_over');
    throws(() => applyPersonAction(st.state, other, { type: 'fold' }), 'quem saiu não age', 'game_over');
    // Joga até a próxima mão: ela sai da mesa
    let s2 = st.state;
    const hand = s2.game.handNumber;
    for (let g = 0; g < 60 && s2.status === 'running' && s2.game.handNumber === hand; g++) {
      const w = waitingFor(s2)!;
      s2 = applyPersonAction(s2, w, personLegal(s2, w)!.canCheck ? { type: 'check' } : { type: 'call' }).state;
    }
    const pr = friendsResult(s2).people[other];
    check(pr.status === 'left' && pr.reason === 'abandoned' && pr.place !== null, `saiu da mesa com colocação (${JSON.stringify(pr)})`);
    eq(s2.game.players.find((q) => q.id === other)!.stack, 0, 'as fichas saíram com a pessoa');
    tested++;
  }
  check(tested >= 10, `saídas no meio (${tested})`);
}

// ---------------------------------------------------------------------------
section('mesa de amigos: ponto de vista ("eu" = human)');
{
  const cfg = friendsConfig({ seed: 'pov-1', people: 4, effects: ['reveal_one'] });
  const step = createMatch(cfg);
  for (const id of cfg.people!) {
    const raw = toPublicEvents(step.events, id);
    const pov = povEvents(raw, id, cfg.seats[id]);
    const mine = raw.find((e) => e.t === 'holeCards');
    const minePov = pov.find((e) => e.t === 'holeCards');
    eq(minePov, mine, `${id}: as minhas cartas continuam as minhas`);
    const ms = pov.find((e) => e.t === 'matchStarted') as Extract<typeof pov[number], { t: 'matchStarted' }>;
    eq(ms.seats.find((x) => x.id === 'human')?.seat, 0, `${id}: eu no lugar 0`);
    eq(ms.seats.map((x) => x.seat).sort(), [0, 1, 2, 3], 'lugares girados, sem repetir');
    check(!JSON.stringify(pov).includes(`"${id}"`), `${id}: nenhum "${id}" sobra`);
    const view = povView(tableView(step.state, id), id);
    eq(view.seats.find((x) => x.id === 'human')?.holeCards, step.state.game.players.find((q) => q.id === id)!.holeCards, `${id}: a visão mostra as minhas cartas como human`);
    eq(friendsPayload(step.state, step.events, id), { events: pov, view }, `${id}: friendsPayload = povEvents + povView`);
    // ordem dos lugares preservada (sentido horário)
    const order = (sts: { id: string; seat: number }[]): string[] => sts.slice().sort((a, b) => a.seat - b.seat).map((x) => x.id);
    const rawOrder = order(tableView(step.state, id).seats);
    const k = rawOrder.indexOf(id);
    eq(order(view.seats), [...rawOrder.slice(k), ...rawOrder.slice(0, k)].map((x) => (x === id ? 'human' : x)), `${id}: mesma ordem na mesa`);
  }
  eq(povView(tableView(createMatch(makeConfig({ seed: 'pov-2' })).state, 'human'), 'human'), tableView(createMatch(makeConfig({ seed: 'pov-2' })).state, 'human'), 'human vê como sempre');
}

// ---------------------------------------------------------------------------
section('mesa de amigos: ausente e Voltar');
{
  const cfg = friendsConfig({ seed: 'aw-1', people: 2, effects: [] });
  let s = createMatch(cfg).state;
  const rng = createRng('aw-h');
  let streakSeen = 0;
  let back = false;
  for (let g = 0; g < 400 && s.status === 'running'; g++) {
    const who = waitingFor(s)!;
    if (who === 'p2' && !back) {
      const st = timeoutPerson(s, 'p2');
      const co = st.events.find((e) => e.type === 'clockOut') as Ev<'clockOut'>;
      streakSeen = co.streak;
      const meta = st.events.find((e) => e.type === 'actionMeta' && e.playerId === 'p2') as Ev<'actionMeta'>;
      eq(meta.auto, 'timeout', 'estouro: ação automática timeout');
      const act = st.events.find((e) => e.type === 'actionTaken' && e.playerId === 'p2') as Ev<'actionTaken'>;
      check(act.action === 'check' || act.action === 'fold', 'estouro passa ou desiste');
      if (co.streak === 3) check(st.events.some((e) => e.type === 'away' && e.on), 'ausente no 3º');
      s = st.state;
      if ((s as MatchStateX).people!.p2.away && s.status === 'running') {
        eq(tableView(s, 'p1').people?.p2.away, true, 'a visão mostra ausente');
        // Com p1 presente, a vez de p2 não espera mais o relógio.
        for (let h = 0; h < 30 && s.status === 'running' && (s as MatchStateX).people!.p1.status === 'playing'; h++) {
          const w2 = waitingFor(s)!;
          check(w2 === 'p1', 'ausente com outra pessoa presente: a mesa nunca espera por ele');
          const st2 = applyPersonAction(s, 'p1', randomHumanAction(personLegal(s, 'p1')!, rng));
          for (const e of st2.events) if (e.type === 'actionMeta' && e.playerId === 'p2') eq(e.auto, 'away', 'vez do ausente jogada na hora');
          s = st2.state;
        }
        if (s.status === 'running' && (s as MatchStateX).people!.p2.status === 'playing') {
          const b = personBack(s, 'p2');
          check(b.events.some((e) => e.type === 'away' && e.playerId === 'p2' && !e.on), 'Voltar');
          s = b.state;
          eq((s as MatchStateX).people!.p2.streak, 0, 'Voltar zera os estouros');
        }
        back = true;
      }
      continue;
    }
    s = applyPersonAction(s, who, randomHumanAction(personLegal(s, who)!, rng)).state;
  }
  check(streakSeen >= 3 || back, 'chegou ao 3º estouro');
  // Agir zera a sequência.
  const c2 = friendsConfig({ seed: 'aw-2', people: 2, effects: [] });
  let s2 = createMatch(c2).state;
  for (let g = 0; g < 60 && s2.status === 'running'; g++) {
    const who = waitingFor(s2)!;
    s2 = (g % 3 === 2 ? applyPersonAction(s2, who, personLegal(s2, who)!.canCheck ? { type: 'check' } : { type: 'fold' }) : timeoutPerson(s2, who)).state;
    for (const id of c2.people!) {
      const ps = (s2 as MatchStateX).people![id];
      if (ps.status === 'playing') check(ps.streak < 3 || ps.away, `3 estouros seguidos = ausente (${id}: ${JSON.stringify(ps)})`);
    }
  }
}

// ---------------------------------------------------------------------------
section('casual de devolução: o oráculo portador traz o pôster perdido');
{
  let captured = 0;
  let byWin = 0;
  let byElim = 0;
  let moved = 0;
  let lost = 0;
  const META = { clientId: 'r', startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:20:00Z' };
  const carriers = ['bogart', 'fincher', 'cypher'] as const;
  for (let m = 0; m < Math.max(60, Math.floor(N / 3)); m++) {
    const carrierId = carriers[m % 3];
    const cfg = rescueConfig({ seed: `rs-${m}`, carrierId, prizeId: `lost:${m}`, rarity: 'rare' });
    eq(cfg.mode, 'free', 'casual: modo free');
    eq(cfg.difficulty, DEFAULT_DIFFICULTY.free, 'casual: sem estrelas');
    const { steps, final } = playRandomMatch(cfg, `rs-h-${m}`, undefined, m % 2 ? undefined : (L) => (L.toCall === 0 ? { type: 'check' } : L.allIn && L.toCall > L.stack / 2 ? { type: 'fold' } : { type: 'call' }));
    const all = steps.flatMap((x) => x.events);
    const ms = all.find((e) => e.type === 'matchStarted') as Ev<'matchStarted'>;
    eq(ms.prize, { prizeId: `lost:${m}`, holderId: carrierId }, 'o portador começa com o pôster');
    eq(ms.reclaim, true, 'matchStarted.reclaim');
    eq(ms.tournament, undefined, 'sem torneio');
    const pub = toPublicEvents(all, 'human');
    check((pub.find((e) => e.t === 'matchStarted') as { reclaim?: boolean }).reclaim === true, 'reclaim público');
    check(!all.some((e) => e.type.startsWith('effect') || e.type === 'tellMark'), 'sem efeitos');
    const cap = all.find((e) => e.type === 'prizeCaptured') as Ev<'prizeCaptured'> | undefined;
    const mv = all.filter((e) => e.type === 'prizeMoved') as Ev<'prizeMoved'>[];
    moved += mv.length;
    const out = outcomeOf(steps[0].state, final);
    void out;
    // Captura: no passo em que aconteceu, outcomeOf avisa.
    let capStep = -1;
    for (let k = 1; k < steps.length; k++) if (outcomeOf(steps[k - 1].state, steps[k].state).captured) capStep = k;
    if (cap) {
      captured++;
      check(capStep > 0, 'outcomeOf.captured no passo da captura');
      // Quem eliminou o portador (ou a pessoa venceu a mesa)
      const holderAtCap = mv.length ? mv[mv.length - 1].toId : carrierId;
      const elim = all.find((e) => e.type === 'eliminated' && e.playerId === holderAtCap && e.handNumber === cap.handNumber) as Ev<'eliminated'> | undefined;
      if (elim) {
        eq(elim.byId, 'human', 'captura = a pessoa eliminou o portador');
        byElim++;
      } else {
        eq(final.game.winnerId, 'human', 'captura sem eliminar o portador = venceu a mesa');
        byWin++;
      }
      const sum = summarizeMatch(final, META);
      eq(sum.prize, { prizeId: `lost:${m}`, capturedHand: cap.handNumber }, 'resumo com a captura');
      eq(sum.mode, 'free', 'resumo: casual');
      eq(sum.reclaim, true, 'resumo.reclaim');
      eq((all.find((e) => e.type === 'matchEnded') as Ev<'matchEnded'>).prizeCaptured, true, 'matchEnded.prizeCaptured');
    } else {
      lost++;
      eq(capStep, -1, 'sem captura, sem aviso');
      eq(summarizeMatch(final, META).prize?.capturedHand, null, 'resumo sem captura');
      eq(final.places.human !== undefined && final.places.human > 1 || final.status === 'finished', true, 'não capturou: caiu ou desistiu');
    }
    check(tableView(final, 'human').prize?.prizeId === `lost:${m}`, 'TableView.prize');
  }
  console.log(`  capturas ${captured} (eliminando o portador ${byElim}, vencendo a mesa ${byWin}) · sem captura ${lost} · passagens ${moved}`);
  check(byElim > 0 && byWin >= 0 && lost > 0, 'houve captura eliminando o portador e partidas sem captura');
  check(moved > 0, 'houve passagem do pôster entre oráculos');
  // Desistência depois de capturar: o pôster continua devolvido.
  for (let m = 0; m < 200; m++) {
    const cfg = rescueConfig({ seed: `rs-f-${m}`, carrierId: 'bogart', prizeId: 'lost:f', rarity: 'common' });
    const rng = createRng(`rs-f-h-${m}`);
    let s = createMatch(cfg).state;
    while (s.status === 'running' && s.capturedHand === null) s = applyHumanAction(s, randomHumanAction(humanLegal(s)!, rng)).state;
    if (s.status !== 'running') continue;
    const f = forfeitMatch(s);
    eq(f.state.capturedHand, s.capturedHand, 'desistir depois de capturar mantém a captura');
    eq((f.events.find((e) => e.type === 'matchEnded') as Ev<'matchEnded'>).prizeCaptured, true, 'matchEnded.prizeCaptured depois de desistir');
    break;
  }
  throws(() => rescueConfig({ seed: 'x', carrierId: 'human' as 'bogart', prizeId: 'p', rarity: 'common' }), 'portador tem de ser oráculo');
}

console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
finish();
