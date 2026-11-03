/**
 * Testes dos bots (pacote A): buckets, features, travas, faixas, modelo do Raposo, tells,
 * push/fold e legalidade das decisões em partidas inteiras.
 *
 *   node scripts/poker/test-bots.ts
 */
import { DEFAULT_DIFFICULTY, DEFAULT_PROFILES, createRng, mergeProfile } from '../../src/lib/poker/index.ts';
import type { BotView, Card, LegalActions } from '../../src/lib/poker/index.ts';
import { bucketOf, handClass, isAirShown, isMonster, preflopPct } from '../../src/lib/poker/bots/buckets.ts';
import { features, isScareCard, isWet } from '../../src/lib/poker/bots/features.ts';
import { guardrails, toLegalAmount } from '../../src/lib/poker/bots/guardrails.ts';
import { emptyCounters, labelsOf, ratesOf } from '../../src/lib/poker/bots/model.ts';
import { applyMods } from '../../src/lib/poker/bots/policy.ts';
import type { BotCtx } from '../../src/lib/poker/bots/policy.ts';
import { decide } from '../../src/lib/poker/bots/decide.ts';
import { rangeFor } from '../../src/lib/poker/bots/ranges.ts';
import { tellsFor } from '../../src/lib/poker/bots/tells.ts';
import { setStrictBots } from '../../src/lib/poker/match/runner.ts';
import { check, eq, finish, makeConfig, playRandomMatch, section } from './lib/harness.ts';

const c = (s: string): Card[] => s.split(' ') as Card[];

section('classe e top % antes do flop');
eq(handClass(c('Ah Kh')), 'AKs', 'AKs');
eq(handClass(c('Kd As')), 'AKo', 'AKo');
eq(handClass(c('7c 7d')), '77', 'par');
check(preflopPct(c('Ah As')) < 1, 'AA no top 1%');
check(preflopPct(c('7c 2d')) > 95, '72o no fim da lista');

section('buckets (§3.5)');
eq(bucketOf(c('As Ks'), c('Ah Kh 2c')), 'nuts', 'dois pares do topo no A-K-2 = nuts');
eq(bucketOf(c('9s 9d'), c('9c Kd 4h')), 'nuts', 'trinca de noves = nuts');
eq(bucketOf(c('7c 2d'), c('Ah Kh Qs')), 'air', '7-2 no A-K-Q = ar');
eq(bucketOf(c('Jh Th'), c('Ah Kh 2c')), 'draw', 'projeto de flush (sem par) = draw');
eq(bucketOf(c('4c 4d'), c('Ah Kd Qs Jc 8h')), 'weak', 'par baixo no board alto = weak');
eq(bucketOf(c('Jh Th'), c('Ah Kh 2c 3d 4s')), 'air', 'sem par no river = ar (projeto não vale no river)');
check(isMonster(c('9s 9d'), c('9c Kd 4h'), 'nuts'), 'trinca é monstro');
check(isMonster(c('Ah Ad'), [], 'nuts'), 'AA antes do flop é monstro');
check(isAirShown(c('7c 2d'), c('Ah Kh Qs Qd 3c')), 'par só do board = ar ao mostrar');
check(!isAirShown(c('Qc 2d'), c('Ah Kh Qs Jd 3c')), 'par com carta da mão não é ar');

section('textura e carta de susto');
check(isWet(c('Ah Kh 2c')), 'dois do mesmo naipe = molhado');
check(isWet(c('9c 8d 7s')), '9-8-7 = molhado');
check(!isWet(c('Ah 8d 2c')), 'A-8-2 arco-íris = seco');
check(isScareCard(c('2h 5h 9h Kd Ah')), 'quarta copa no river = susto');
check(isScareCard(c('2c 7d 9s Th Ah')), 'ás acima do flop = susto');
check(!isScareCard(c('Ac Kd 9s 4h 2c')), 'river baixo = sem susto');

// ---------------------------------------------------------------------------
// Vista sintética para os testes de decisão
// ---------------------------------------------------------------------------
function view(over: Partial<BotView> & { legal?: Partial<LegalActions> }): BotView {
  const legal: LegalActions = {
    playerId: 'bogart', street: 'preflop', toCall: 50, pot: 75, stack: 2000, streetBet: 0, canFold: true, canCheck: false,
    call: { amount: 50, allIn: false }, bet: null, raise: { min: 100, max: 2000 }, allIn: { amount: 2000, to: 2000, kind: 'raise' },
    ...over.legal,
  };
  return {
    selfId: 'bogart', seat: 1, hole: ['Ah', 'Ad'], street: 'preflop', board: [], pot: legal.pot, toCall: legal.toCall,
    stack: legal.stack, streetBet: legal.streetBet,
    players: [
      { id: 'human', seat: 0, stack: 2000, status: 'folded', streetBet: 0, totalBet: 0, hasCards: false },
      { id: 'bogart', seat: 1, stack: 2000, status: 'active', streetBet: 0, totalBet: 0, hasCards: true },
      { id: 'fincher', seat: 2, stack: 1975, status: 'active', streetBet: 25, totalBet: 25, hasCards: true },
      { id: 'cypher', seat: 3, stack: 1950, status: 'active', streetBet: 50, totalBet: 50, hasCards: true },
    ],
    buttonId: 'bogart', sbId: 'fincher', bbId: 'cypher', blinds: { smallBlind: 25, bigBlind: 50, ante: 0 }, handNumber: 1,
    actions: [{ street: 'preflop', playerId: 'human', type: 'fold', amount: 0, to: 0, toCall: 50, allIn: false, shortAllIn: false, potAfter: 75 }],
    shownThisHand: {}, match: { holderId: null, captured: false, alive: 4, levelIndex: 0, handsToNextLevel: 5 },
    ...over,
    legal,
  };
}
function ctxFor(id: 'bogart' | 'cypher' | 'fincher', seed: string, prof = DEFAULT_PROFILES[id]): BotCtx {
  return {
    profile: applyMods(prof, null, false, DEFAULT_DIFFICULTY.free),
    mem: { committed: false, facedFirstBet: false, tilt: null, labelsAnnounced: [] },
    difficulty: DEFAULT_DIFFICULTY.free, rng: createRng(seed), isCarrier: false, huntingId: null,
  };
}

section('features');
{
  const f = features(view({}));
  eq(f.pos, 'BTN', 'botão');
  eq(f.facing, 'unopened', 'ninguém entrou (a pessoa largou)');
  eq(f.opponents.sort(), ['cypher', 'fincher'], 'oponentes com cartas');
  check(Math.abs(f.effBB - 40) < 0.01, `effBB = min(próprio, maior oponente)/BB (${f.effBB})`);
}

section('travas (§3.5)');
{
  const v = view({ legal: { toCall: 0, canCheck: true, call: null } });
  const f = features(v);
  eq(guardrails({ type: 'fold' }, v, f, 0.1, 'air'), { type: 'check' }, 'nunca larga de graça');
  const v2 = view({});
  eq(guardrails({ type: 'fold' }, v2, features(v2), 0.97, 'nuts'), { type: 'call' }, 'nunca larga nuts com eq ≥ 0,95');
  eq(toLegalAmount({ type: 'raise', amount: 1850 }, v2), { type: 'allIn' }, 'aposta ≥ 90% do cacife vira all-in');
  eq(toLegalAmount({ type: 'raise', amount: 33 }, v2), { type: 'raise', amount: 100 }, 'valor preso no mínimo');
  eq(toLegalAmount({ type: 'raise', amount: 333 }, v2), { type: 'raise', amount: 335 }, 'múltiplo de 5');
  const v3 = view({ legal: { toCall: 1950, call: { amount: 1950, allIn: false }, pot: 2025 } });
  eq(guardrails({ type: 'call' }, v3, { ...features(v3), facingAllIn: true }, 0.1, 'air'), { type: 'fold' }, 'não paga all-in com eq < 0,15');
}

section('push/fold e pré-flop');
{
  const short = (hole: Card[]): BotView => view({
    hole, stack: 200,
    legal: { stack: 200, raise: { min: 100, max: 200 }, allIn: { amount: 200, to: 200, kind: 'raise' } },
    players: [
      { id: 'human', seat: 0, stack: 2000, status: 'folded', streetBet: 0, totalBet: 0, hasCards: false },
      { id: 'bogart', seat: 1, stack: 200, status: 'active', streetBet: 0, totalBet: 0, hasCards: true },
      { id: 'fincher', seat: 2, stack: 1975, status: 'active', streetBet: 25, totalBet: 25, hasCards: true },
      { id: 'cypher', seat: 3, stack: 1950, status: 'active', streetBet: 50, totalBet: 50, hasCards: true },
    ],
  });
  eq(decide(short(c('Ah Ad')), ctxFor('bogart', 'pf1', { ...DEFAULT_PROFILES.bogart, epsilon: 0, epsilonFloor: 0 })).action.type, 'allIn', 'Sapo curto empurra AA');
  eq(decide(short(c('7c 2d')), ctxFor('bogart', 'pf2', { ...DEFAULT_PROFILES.bogart, epsilon: 0, epsilonFloor: 0 })).action.type, 'fold', 'Sapo curto larga 72o');
  let raises = 0;
  for (let i = 0; i < 300; i++) {
    const a = decide(view({ hole: c('8h 6h') }), ctxFor('cypher', `cb${i}`)).action;
    if (a.type === 'raise' || a.type === 'allIn') raises++;
  }
  check(raises > 200, `Cobra abre 8-6s no botão quase sempre (${raises}/300)`);
}

section('faixas e modelo');
{
  const v = view({
    street: 'flop', board: c('Kd 7c 2s'), hole: c('Qs Qh'),
    actions: [
      { street: 'preflop', playerId: 'human', type: 'raise', amount: 125, to: 125, toCall: 50, allIn: false, shortAllIn: false, potAfter: 200 },
    ],
  });
  const r = rangeFor('human', v, 'static')!;
  const mass = r.weights!.reduce((a, b) => a + b, 0);
  // 1.081 combinações vivas (sem a mão de quem decide e o board).
  check(mass / 1081 > 0.30 && mass / 1081 < 0.40, `faixa estática de quem abriu ≈ top 35% (${(100 * mass / 1081).toFixed(1)}%)`);
  check(rangeFor('human', v, 'random') === null, 'random = mão aleatória');
  const cnt = emptyCounters();
  cnt.raw.hands = 20; cnt.hands = 20; cnt.vpip = 15;
  check(labelsOf(cnt, 12).includes('solto'), 'VPIP alto com amostra = solto');
  cnt.raw.hands = 10;
  check(!labelsOf(cnt, 12).includes('solto'), 'sem amostra mínima, sem rótulo');
  const fresh = ratesOf(emptyCounters(), 12);
  check(Math.abs(fresh.vpip - 0.30) < 1e-9 && Math.abs(fresh.foldToCbet - 0.45) < 1e-9, 'sem dados, valem os priors');
}

section('tells (§3.6)');
{
  let quiet = 0;
  let nerv = 0;
  for (let i = 0; i < 2000; i++) {
    const t = tellsFor(DEFAULT_PROFILES.bogart, { type: 'bet', street: 'river', sizeClass: 'big', allIn: false, shortAllIn: false, facingBet: false, bucket: 'nuts', monster: true, pairPlus: true }, createRng(`t${i}`));
    if (t.cue === 'calado') quiet++;
    check(t.thinkMs >= 300 && t.thinkMs <= 7000 && Number.isInteger(t.thinkMs), 'thinkMs inteiro 300..7000');
    const u = tellsFor(DEFAULT_PROFILES.bogart, { type: 'bet', street: 'river', sizeClass: 'big', allIn: false, shortAllIn: false, facingBet: false, bucket: 'air', monster: false, pairPlus: false }, createRng(`u${i}`));
    if (u.cue === 'nervoso') nerv++;
  }
  check(quiet / 2000 > 0.92, `Sapo calado na aposta grande com monstro (${quiet / 20}%)`);
  check(nerv / 2000 > 0.86, `Sapo nervoso na aposta grande sem monstro (${nerv / 20}%)`);
  let tank = 0;
  for (let i = 0; i < 4000; i++) {
    const t = tellsFor(DEFAULT_PROFILES.fincher, { type: 'call', street: 'flop', sizeClass: null, allIn: false, shortAllIn: false, facingBet: true, bucket: 'medium', monster: false, pairPlus: true }, createRng(`f${i}`));
    if (t.thinkMs >= 4000) tank++;
  }
  check(tank / 4000 > 0.06 && tank / 4000 < 0.10, `tank do Raposo em ~8% (${(tank / 40).toFixed(1)}%)`);
}

section('parâmetros do banco mudam o comportamento');
{
  const noCbet = mergeProfile(DEFAULT_PROFILES.cypher, { post: { cbetHU: 0, semibluffFreq: 0 }, epsilon: 0, epsilonFloor: 0 });
  const v = view({
    selfId: 'cypher', seat: 3, street: 'flop', board: c('Kd 7c 2s'), hole: c('9h 8h'),
    legal: { playerId: 'cypher', street: 'flop', toCall: 0, canCheck: true, call: null, pot: 300, bet: { min: 50, max: 1850 }, raise: null, allIn: { amount: 1850, to: 1850, kind: 'bet' } },
    actions: [
      { street: 'preflop', playerId: 'cypher', type: 'raise', amount: 125, to: 125, toCall: 0, allIn: false, shortAllIn: false, potAfter: 200 },
      { street: 'preflop', playerId: 'human', type: 'call', amount: 125, to: 125, toCall: 125, allIn: false, shortAllIn: false, potAfter: 300 },
    ],
  });
  let bets = 0;
  for (let i = 0; i < 100; i++) if (decide(v, ctxFor('cypher', `nc${i}`, noCbet)).action.type !== 'check') bets++;
  eq(bets, 0, 'cbetHU = 0 → a Cobra não faz c-bet com ar');
}

section('decisões sempre legais em partidas inteiras');
{
  setStrictBots(true);
  let n = 0;
  for (let m = 0; m < 60; m++) {
    const r = playRandomMatch(makeConfig({ mode: m % 2 ? 'bounty' : 'free', seed: `tb-${m}`, rarity: (['common', 'rare', 'epic', 'legendary'] as const)[m % 4] }), `tb-h-${m}`);
    n += r.allEvents.filter((e) => e.type === 'actionMeta' && e.bot).length;
  }
  check(n > 1000, `${n} decisões de bot sem ação ilegal`);
}
finish();
