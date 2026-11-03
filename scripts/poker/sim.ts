/**
 * Simulador e calibração (SPEC §3.8).
 *
 *   node scripts/poker/sim.ts --suite --sng 2000 [--params scripts/poker/params/v1.json] [--workers 2] [--strict]
 *   node scripts/poker/sim.ts --sng 1000 --hero medio [--bounty legendary] [--loan] [--no-model]
 *
 * --suite roda todas as metas do §3.8 e grava scripts/poker/params/sim-report.json e
 * sim-params.sql (o `update` de poker_bot_params). --strict sai com código 1 se alguma
 * meta ficar fora da faixa (pela estimativa pontual; o IC de 95% vai no relatório).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import {
  DEFAULT_DIFFICULTY, DEFAULT_PROFILES, DEFAULT_SETTINGS, applyHumanAction, createMatch, createRng, createTable,
  humanLegal, mergeProfile, simulateRest,
} from '../../src/lib/poker/index.ts';
import type { BotMemory, BotProfile, MatchConfig, MatchEvent, MatchState, Rarity } from '../../src/lib/poker/index.ts';
import { emptyTally } from '../../src/lib/poker/match/summary.ts';
import { emptyCounters } from '../../src/lib/poker/bots/model.ts';
import { HEROES } from './surrogates.ts';
import type { HeroName } from './surrogates.ts';

type Rival = 'bogart' | 'cypher' | 'fincher';
const RIVALS: Rival[] = ['bogart', 'cypher', 'fincher'];
type Params = Partial<Record<Rival, unknown>>;

interface Scenario {
  key: string;
  kind: 'match' | 'hu';
  hero?: HeroName;
  mode?: 'free' | 'bounty';
  rarity?: Rarity;
  loan?: number;
  noModel?: boolean;
  pair?: [Rival, Rival];
  n: number;
  /** Estatísticas dos bots e tells (caro: só no cenário de referência). */
  botStats?: boolean;
}

interface Tally {
  n: number;
  first: number; top2: number; captures: number;
  heroHands: number[]; tableHands: number[];
  tableWinner: Record<string, number>; lastOut: Record<string, number>;
  bot: Record<string, { hands: number; vpip: number; pfr: number; bets: number; calls: number }>;
  tells: { smokeNuts: number; smoke: number; sapoQuietMonster: number; sapoQuietBig: number; cobraNervousBluff: number; cobraNervousBet: number };
  huWins: Record<string, number>;
}

function emptyTallyStats(): Tally {
  return {
    n: 0, first: 0, top2: 0, captures: 0, heroHands: [], tableHands: [], tableWinner: {}, lastOut: {},
    bot: {}, tells: { smokeNuts: 0, smoke: 0, sapoQuietMonster: 0, sapoQuietBig: 0, cobraNervousBluff: 0, cobraNervousBet: 0 }, huWins: {},
  };
}

function profilesFrom(params: Params, noModel: boolean): Record<Rival, BotProfile> {
  const out = {} as Record<Rival, BotProfile>;
  for (const r of RIVALS) {
    const p = mergeProfile(DEFAULT_PROFILES[r], params[r] ?? {});
    if (noModel) p.model.enabled = false;
    out[r] = p;
  }
  return out;
}

function config(sc: Scenario, seed: string, profiles: Record<Rival, BotProfile>): MatchConfig {
  const mode = sc.mode ?? 'free';
  const rarity = sc.rarity ?? 'common';
  return {
    mode, seed, settings: DEFAULT_SETTINGS, seats: { human: 0, bogart: 1, fincher: 2, cypher: 3 }, profiles,
    paramsVersion: { bogart: 1, cypher: 1, fincher: 1 },
    difficulty: mode === 'bounty' ? DEFAULT_DIFFICULTY[rarity] : DEFAULT_DIFFICULTY.free, loan: sc.loan ?? 0,
    prize: mode === 'bounty' ? { prizeId: 'sim', carrierId: DEFAULT_SETTINGS.carrierByRarity[rarity], rarity } : null,
    memory: null,
  };
}

function botStats(t: Tally, events: MatchEvent[]): void {
  let meta: Extract<MatchEvent, { type: 'actionMeta' }> | null = null;
  for (const e of events) {
    if (e.type === 'actionMeta') meta = e;
    else if (e.type === 'actionTaken' && meta && meta.bot && meta.playerId === e.playerId) {
      const b = meta.bot;
      const aggr = e.action === 'bet' || e.action === 'raise';
      if (e.playerId === 'fincher' && b.cue === 'confiante') {
        t.tells.smoke++;
        if (b.bucket === 'nuts') t.tells.smokeNuts++;
      }
      if (e.playerId === 'bogart' && aggr && b.cue === 'calado' && (meta.sizeClass === 'big' || meta.sizeClass === 'overbet' || (e.allIn && !e.shortAllIn))) {
        t.tells.sapoQuietBig++;
        if (b.monster) t.tells.sapoQuietMonster++;
      }
      if (e.playerId === 'cypher' && aggr && b.cue === 'nervoso' && e.street !== 'preflop') {
        t.tells.cobraNervousBet++;
        if (b.bucket === 'air' || b.bucket === 'draw' || b.bucket === 'weak') t.tells.cobraNervousBluff++;
      }
      meta = null;
    } else if (e.type === 'handComplete') {
      const r = e.result;
      for (const id of Object.keys(r.startStacks)) {
        if (id === 'human') continue;
        const s = (t.bot[id] ??= { hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0 });
        s.hands++;
        const mine = r.actions.filter((a) => a.playerId === id);
        const pre = mine.filter((a) => a.street === 'preflop');
        if (pre.some((a) => a.type === 'call' || a.type === 'bet' || a.type === 'raise')) s.vpip++;
        if (pre.some((a) => a.type === 'bet' || a.type === 'raise')) s.pfr++;
        for (const a of mine) {
          if (a.street === 'preflop') continue;
          if (a.type === 'bet' || a.type === 'raise') s.bets++;
          else if (a.type === 'call') s.calls++;
        }
      }
    }
  }
}

function runMatch(sc: Scenario, i: number, profiles: Record<Rival, BotProfile>, t: Tally): void {
  const seed = `sim:${sc.key}:${i}`;
  const hero = HEROES[sc.hero ?? 'medio'];
  const rng = createRng(`${seed}:hero`);
  let step = createMatch(config(sc, seed, profiles));
  const events: MatchEvent[] = sc.botStats ? [...step.events] : [];
  let s: MatchState = step.state;
  while (s.status === 'running') {
    const L = humanLegal(s)!;
    step = applyHumanAction(s, hero(L, rng, s));
    if (sc.botStats) events.push(...step.events);
    s = step.state;
  }
  if (sc.botStats) botStats(t, events);
  t.n++;
  const place = s.places.human ?? 1;
  if (place === 1) t.first++;
  if (place <= 2) t.top2++;
  if (s.capturedHand !== null) t.captures++;
  t.heroHands.push(s.game.handNumber);
  let places: Record<string, number> = s.places as Record<string, number>;
  let tableHands = s.game.handNumber;
  if (s.status === 'humanOut') {
    const r = simulateRest(s, 400);
    places = r.places;
    tableHands = s.game.handNumber;   // o simulateRest não devolve o estado; abaixo, o número estimado
  }
  t.tableHands.push(tableHands);
  const winner = Object.keys(places).find((k) => places[k] === 1) ?? 'human';
  t.tableWinner[winner] = (t.tableWinner[winner] ?? 0) + 1;
  const worst = Math.max(...Object.values(places));
  for (const [k, v] of Object.entries(places)) if (v === worst) t.lastOut[k] = (t.lastOut[k] ?? 0) + 1 / Object.values(places).filter((x) => x === worst).length;
}

function runHU(sc: Scenario, i: number, profiles: Record<Rival, BotProfile>, t: Tally): void {
  const [a, b] = sc.pair!;
  const seed = `simhu:${sc.key}:${i}`;
  const cfg = config({ ...sc, mode: 'free' }, seed, profiles);
  const game = createTable({ smallBlind: 25, bigBlind: 50, ante: 0, historyLimit: 3 }, [{ id: a, seat: 1, stack: 2000 }, { id: b, seat: 2, stack: 2000 }], seed);
  const mem = (id: Rival): BotMemory => {
    const m: BotMemory = { committed: false, facedFirstBet: false, tilt: null, labelsAnnounced: [] };
    if (profiles[id].model.enabled) m.model = { [id === a ? b : a]: emptyCounters() } as BotMemory['model'];
    return m;
  };
  const st: MatchState = {
    v: 1, config: { ...cfg, seats: { [a]: 1, [b]: 2 } as MatchConfig['seats'] }, game, levelIndex: 0, eventNo: 0, actionNo: 0,
    holderId: null, capturedHand: null, places: {}, eliminatedBy: {}, bots: { [a]: mem(a), [b]: mem(b) } as MatchState['bots'],
    tally: emptyTally(40), lastUncontested: null, status: 'humanOut',
  };
  const r = simulateRest(st, 500);
  t.n++;
  t.huWins[r.winnerId] = (t.huWins[r.winnerId] ?? 0) + 1;
}

function runChunk(sc: Scenario, from: number, to: number, params: Params): Tally {
  const profiles = profilesFrom(params, !!sc.noModel);
  const t = emptyTallyStats();
  for (let i = from; i < to; i++) {
    if (sc.kind === 'hu') runHU(sc, i, profiles, t);
    else runMatch(sc, i, profiles, t);
  }
  return t;
}

function merge(a: Tally, b: Tally): Tally {
  const add = (x: Record<string, number>, y: Record<string, number>): void => { for (const [k, v] of Object.entries(y)) x[k] = (x[k] ?? 0) + v; };
  a.n += b.n; a.first += b.first; a.top2 += b.top2; a.captures += b.captures;
  a.heroHands.push(...b.heroHands); a.tableHands.push(...b.tableHands);
  add(a.tableWinner, b.tableWinner); add(a.lastOut, b.lastOut); add(a.huWins, b.huWins);
  for (const [k, v] of Object.entries(b.bot)) {
    const s = (a.bot[k] ??= { hands: 0, vpip: 0, pfr: 0, bets: 0, calls: 0 });
    s.hands += v.hands; s.vpip += v.vpip; s.pfr += v.pfr; s.bets += v.bets; s.calls += v.calls;
  }
  for (const k of Object.keys(a.tells) as (keyof Tally['tells'])[]) a.tells[k] += b.tells[k];
  return a;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------


function runScenario(sc: Scenario, params: Params, workers: number): Promise<Tally> {
  const per = Math.ceil(sc.n / workers);
  const jobs: Promise<Tally>[] = [];
  for (let w = 0; w < workers; w++) {
    const from = w * per;
    const to = Math.min(sc.n, from + per);
    if (from >= to) continue;
    jobs.push(new Promise((res, rej) => {
      const wk = new Worker(new URL(import.meta.url), { workerData: { sc, from, to, params } });
      wk.once('message', res);
      wk.once('error', rej);
    }));
  }
  return Promise.all(jobs).then((ts) => ts.reduce(merge, emptyTallyStats()));
}

interface Metric { name: string; value: number; lo: number; hi: number; target: [number, number] | null; ok: boolean; n: number }

function prop(name: string, k: number, n: number, target: [number, number] | null): Metric {
  const p = n > 0 ? k / n : 0;
  const se = n > 0 ? Math.sqrt((p * (1 - p)) / n) : 0;
  const v = Math.round(p * 1000) / 10;
  const m: Metric = { name, value: v, lo: Math.round((p - 1.96 * se) * 1000) / 10, hi: Math.round((p + 1.96 * se) * 1000) / 10, target, ok: true, n };
  if (target) m.ok = v >= target[0] && v <= target[1];
  return m;
}

function quantile(xs: number[], q: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
}

async function main(): Promise<void> {
  const arg = (k: string): string | undefined => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : undefined;
  };
  const has = (k: string): boolean => process.argv.includes(k);
  const N = Number(arg('--sng') ?? 1000);
  const workers = Number(arg('--workers') ?? Math.max(1, os.cpus().length));
  const paramsPath = arg('--params');
  const params: Params = paramsPath ? JSON.parse(readFileSync(paramsPath, 'utf8')) : {};
  const t0 = Date.now();
  const log = (msg: string): void => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg}`);

  if (!has('--suite')) {
    const sc: Scenario = { key: 'one', kind: 'match', hero: (arg('--hero') ?? 'medio') as HeroName, mode: arg('--bounty') ? 'bounty' : 'free',
      rarity: arg('--bounty') as Rarity | undefined, loan: has('--loan') ? 500 : 0, noModel: has('--no-model'), n: N, botStats: true };
    const t = await runScenario(sc, params, workers);
    console.log(JSON.stringify({ n: t.n, first: t.first / t.n, top2: t.top2 / t.n, capture: t.captures / t.n,
      handsMedian: quantile(t.heroHands, 0.5), handsP90: quantile(t.heroHands, 0.9), tableWinner: t.tableWinner, lastOut: t.lastOut,
      bots: Object.fromEntries(Object.entries(t.bot).map(([k, v]) => [k, { vpip: +(100 * v.vpip / v.hands).toFixed(1), pfr: +(100 * v.pfr / v.hands).toFixed(1), af: +(v.bets / Math.max(1, v.calls)).toFixed(2) }])),
      tells: t.tells, secs: (Date.now() - t0) / 1000 }, null, 1));
    return;
  }

  const metrics: Metric[] = [];
  const quick = Math.max(200, Math.round(N / 2));
  // --only free,bounty,hu,explore,model,loan: roda só esses grupos (iteração rápida; não grava relatório).
  const only = arg('--only')?.split(',');
  const want = (g: string): boolean => !only || only.includes(g);
  const scen: Scenario[] = [
    { key: 'free-iniciante', kind: 'match', hero: 'iniciante', n: N },
    { key: 'free-medio', kind: 'match', hero: 'medio', n: N, botStats: true },
    { key: 'free-bom', kind: 'match', hero: 'bom', n: N },
  ];
  const res: Record<string, Tally> = {};
  if (want('free') || want('loan')) {
  for (const sc of scen) {
    if (!want('free') && sc.key !== 'free-medio') continue;
    res[sc.key] = await runScenario(sc, params, workers);
    log(`${sc.key} pronto`);
  }
  }
  const med = res['free-medio'];
  if (want('free')) {
  for (const h of ['iniciante', 'medio', 'bom'] as const) {
    const t = res[`free-${h}`];
    const tgt1 = { iniciante: [18, 24], medio: [28, 35], bom: [40, 50] }[h] as [number, number];
    const tgt2 = { iniciante: [40, 50], medio: [50, 60], bom: [65, 75] }[h] as [number, number];
    metrics.push(prop(`1º lugar · ${h}`, t.first, t.n, tgt1), prop(`top 2 · ${h}`, t.top2, t.n, tgt2));
  }
  metrics.push(prop('com o médio: Sapo cai primeiro (~45%)', med.lastOut.bogart ?? 0, med.n, [38, 52]));
  metrics.push(prop('com o médio: Raposo vence a mesa (~35%)', med.tableWinner.fincher ?? 0, med.n, [28, 42]));
  const hm = quantile(med.heroHands, 0.5);
  const h90 = quantile(med.heroHands, 0.9);
  metrics.push({ name: 'mãos por partida (médio): mediana', value: hm, lo: hm, hi: hm, target: [30, 40], ok: hm >= 30 && hm <= 40, n: med.n });
  metrics.push({ name: 'mãos por partida (médio): p90', value: h90, lo: h90, hi: h90, target: [0, 55], ok: h90 <= 55, n: med.n });
  for (const r of RIVALS) {
    const s = med.bot[r];
    const prof = profilesFrom(params, false)[r];
    if (!s) continue;
    metrics.push(prop(`VPIP ${r}`, s.vpip, s.hands, prof.targets.vpip));
    metrics.push(prop(`PFR ${r}`, s.pfr, s.hands, prof.targets.pfr));
    const af = Math.round((s.bets / Math.max(1, s.calls)) * 100) / 100;
    metrics.push({ name: `AF ${r}`, value: af, lo: af, hi: af, target: prof.targets.af, ok: af >= prof.targets.af[0] && af <= prof.targets.af[1], n: s.hands });
  }
  const tl = med.tells;
  metrics.push(prop('tell: anel de fumaça → nuts', tl.smokeNuts, tl.smoke, [85, 92]));
  metrics.push(prop('tell: Sapo calado em aposta grande → monstro', tl.sapoQuietMonster, tl.sapoQuietBig, [95, 100]));
  metrics.push(prop('tell: Cobra nervosa em aposta → blefe', tl.cobraNervousBluff, tl.cobraNervousBet, [60, 75]));
  }

  const capT: Record<Rarity, [number, number]> = { common: [45, 50], rare: [40, 45], epic: [35, 40], legendary: [25, 30] };
  if (want('bounty')) {
  for (const r of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
    const t = await runScenario({ key: `bounty-medio-${r}`, kind: 'match', hero: 'medio', mode: 'bounty', rarity: r, n: N }, params, workers);
    metrics.push(prop(`captura · médio · ${r}`, t.captures, t.n, capT[r]));
    log(`bounty-medio-${r} pronto`);
  }
  for (const h of ['iniciante', 'bom'] as const) {
    let k = 0;
    let n = 0;
    for (const r of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
      const t = await runScenario({ key: `bounty-${h}-${r}`, kind: 'match', hero: h, mode: 'bounty', rarity: r, n: Math.ceil(quick / 2) }, params, workers);
      k += t.captures;
      n += t.n;
    }
    metrics.push(prop(`captura · ${h} · média das raridades`, k, n, h === 'iniciante' ? [25, 30] : [50, 60]));
    log(`bounty-${h} pronto`);
  }
  }
  const huT: Record<string, [Rival, Rival, [number, number]]> = {
    'Raposo × Cobra': ['fincher', 'cypher', [58, 65]], 'Cobra × Sapo': ['cypher', 'bogart', [65, 72]], 'Raposo × Sapo': ['fincher', 'bogart', [75, 85]],
  };
  if (want('hu')) for (const [name, [a, b, tg]] of Object.entries(huT)) {
    const t = await runScenario({ key: `hu-${a}-${b}`, kind: 'hu', pair: [a, b], n: N }, params, workers);
    metrics.push(prop(`heads-up ${name}`, t.huWins[a] ?? 0, t.n, tg));
    log(`hu ${name} pronto`);
  }
  if (want('explore')) for (const h of ['allin', 'station', 'maniac'] as const) {
    const t = await runScenario({ key: `free-${h}`, kind: 'match', hero: h, n: quick }, params, workers);
    metrics.push(prop(`exploração · ${h} · 1º lugar`, t.first, t.n, [0, 15]));
    log(`free-${h} pronto`);
  }
  if (want('model')) {
    const on = await runScenario({ key: 'model-on', kind: 'match', hero: 'maniac', n: N }, params, workers);
    const off = await runScenario({ key: 'model-on', kind: 'match', hero: 'maniac', n: N, noModel: true }, params, workers);
    const d = Math.round((((on.tableWinner.fincher ?? 0) / on.n) - ((off.tableWinner.fincher ?? 0) / off.n)) * 1000) / 10;
    metrics.push({ name: 'modelo do Raposo ligado − desligado contra o maniac (pp de 1º lugar)', value: d, lo: d, hi: d, target: [8, 100], ok: d >= 8, n: on.n });
    log('modelo pronto');
  }
  if (want('loan')) {
    const loan = await runScenario({ key: 'free-medio', kind: 'match', hero: 'medio', n: N, loan: 500 }, params, workers);
    const d = Math.round(((loan.first / loan.n) - (med.first / med.n)) * 1000) / 10;
    metrics.push({ name: 'empréstimo de +500 (pp de 1º lugar, médio)', value: d, lo: d, hi: d, target: [4, 8], ok: d >= 4 && d <= 8, n: loan.n });
    log('empréstimo pronto');
  }

  const failed = metrics.filter((m) => !m.ok);
  for (const m of metrics) {
    console.log(`${m.ok ? 'ok   ' : 'FORA '} ${m.name}: ${m.value} [${m.lo}–${m.hi}] alvo ${m.target ? m.target.join('–') : '-'} (n=${m.n})`);
  }
  if (only) {
    console.log(`\n${metrics.length - failed.length}/${metrics.length} metas dentro da faixa (só ${only.join(', ')})`);
    return;
  }
  const report = { v: 1, sng: N, params: paramsPath ?? null, secs: Math.round((Date.now() - t0) / 1000), metrics, failed: failed.map((m) => m.name) };
  const dir = new URL('./params/', import.meta.url);
  writeFileSync(new URL('sim-report.json', dir), `${JSON.stringify(report, null, 1)}\n`);
  const sql = RIVALS.map((r) => `update public.poker_bot_params set params = '${JSON.stringify(params[r] ?? {})}'::jsonb, version = version + 1, updated_at = now() where rival_id = '${r}';`).join('\n');
  writeFileSync(new URL('sim-params.sql', dir), `-- GERADO por scripts/poker/sim.ts --suite (${paramsPath ?? 'padrões'})\n${sql}\n`);
  console.log(`\n${metrics.length - failed.length}/${metrics.length} metas dentro da faixa (${report.secs} s)`);
  if (has('--strict') && failed.length > 0) process.exitCode = 1;
}

// Worker: roda um pedaço do cenário; thread principal: a suíte.
if (!isMainThread) {
  const { sc, from, to, params } = workerData as { sc: Scenario; from: number; to: number; params: Params };
  parentPort!.postMessage(runChunk(sc, from, to, params));
} else {
  await main();
}
