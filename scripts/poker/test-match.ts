/**
 * Testes da camada de partida (pacote A, SPEC §8): níveis, ante, eliminação e
 * eliminatorOf, passagem e captura do prêmio, empréstimo, desistência, mostrar, treino,
 * simulateRest, resumo, determinismo e pureza.
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

console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
finish();
