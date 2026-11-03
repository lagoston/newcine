/**
 * Tempo por decisão de bot (SPEC §8, pacote A, item 7): Raposo ≤ 12 ms no p95 no Node,
 * como aproximação dos 25 ms num Android médio.
 *
 *   node scripts/poker/bench.ts [--matches 60] [--effects 20]
 *
 * Pôster Poker (pacote E, 03/11/2026): depois da mesa normal, `--effects N` partidas de
 * torneio com cada efeito (padrão 20; 0 desliga), com o mesmo teto para o Raposo — o
 * Cassino usa a equidade do baralho de 60, mais lenta, e o Onze Homens o board de 6.
 *
 * Mesa de amigos (pacote E3, 03/11/2026): `--friends N` mesas (padrão 30; 0 desliga) com 8
 * pôsteres, pessoas jogando como o "médio": tempo de cada CHAMADA do servidor (ação de pessoa
 * até a próxima vez de pessoa, com os oráculos no meio) e da chamada que termina a partida
 * quando não sobra pessoa (os oráculos jogam sozinhos). Teto: p95 ≤ 60 ms e máximo ≤ 1,5 s por
 * chamada (a Edge tem 2 s de CPU).
 */
import { applyPersonAction, createMatch, createRng, friendsConfig, getLegalActions, leavePerson, personLegal, waitingFor } from '../../src/lib/poker/index.ts';
import type { MatchState } from '../../src/lib/poker/index.ts';
import { defaultBotChoice } from '../../src/lib/poker/bots/driver.ts';
import { HUMAN, newCtx } from '../../src/lib/poker/match/internal.ts';
import type { MatchStateX } from '../../src/lib/poker/match/internal.ts';
import { applyAndProcess, startNextHand } from '../../src/lib/poker/match/runner.ts';
import { ALL_EFFECTS, check, finish, makeConfig, section } from './lib/harness.ts';
import type { PosterEffectId } from '../../src/lib/poker/index.ts';
import { HEROES, heroFor } from './surrogates.ts';

const argM = process.argv.indexOf('--matches');
const M = argM > 0 ? Number(process.argv[argM + 1]) : 60;
const argE = process.argv.indexOf('--effects');
const ME = argE > 0 ? Number(process.argv[argE + 1]) : 20;
const argF = process.argv.indexOf('--friends');
const MF = argF > 0 ? Number(process.argv[argF + 1]) : 30;
let times: Record<string, number[]> = { bogart: [], cypher: [], fincher: [] };

function run(n: number, effect: PosterEffectId | null): void {
for (let m = 0; m < n; m++) {
  const cfg = effect ? makeConfig({ seed: `bench-${effect}-${m}`, effect }) : makeConfig({ mode: m % 2 ? 'bounty' : 'free', seed: `bench-${m}`, rarity: 'legendary' });
  const ctx = newCtx(createMatch(cfg).state);
  const rng = createRng(`bench-h-${m}`);
  for (let guard = 0; guard < 20000 && ctx.st.status === 'running' && ctx.st.game.phase !== 'gameOver'; guard++) {
    const g = ctx.st.game;
    if (g.phase !== 'betting') {
      startNextHand(ctx);
      continue;
    }
    const to = g.hand!.toActId!;
    if (to === HUMAN) {
      const a = HEROES.medio(getLegalActions(g, HUMAN)!, rng, ctx.st as MatchState);
      applyAndProcess(ctx, HUMAN, a, null);
      continue;
    }
    const t0 = performance.now();
    const choice = defaultBotChoice(ctx.st as MatchStateX, to);
    times[to].push(performance.now() - t0);
    applyAndProcess(ctx, to, choice.action, choice);
  }
}
}

section(`tempo de decisão (${M} partidas, herói médio)`);
run(M, null);
const q = (xs: number[], p: number): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
for (const [id, xs] of Object.entries(times)) {
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  console.log(`  ${id}: ${xs.length} decisões · média ${mean.toFixed(2)} ms · p50 ${q(xs, 0.5).toFixed(2)} · p95 ${q(xs, 0.95).toFixed(2)} · máx ${q(xs, 1).toFixed(2)}`);
}
check(q(times.fincher, 0.95) <= 12, `Raposo ≤ 12 ms no p95 (${q(times.fincher, 0.95).toFixed(2)} ms)`);

if (ME > 0) {
  section(`Pôster Poker: tempo de decisão com cada efeito (${ME} torneios por efeito)`);
  for (const effect of ALL_EFFECTS) {
    times = { bogart: [], cypher: [], fincher: [] };
    run(ME, effect);
    const all = [...times.bogart, ...times.cypher, ...times.fincher];
    console.log(`  ${effect.padEnd(12)} ${all.length} decisões · p95 Sapo ${q(times.bogart, 0.95).toFixed(2)} · Cobra ${q(times.cypher, 0.95).toFixed(2)} · Raposo ${q(times.fincher, 0.95).toFixed(2)} ms · máx ${q(all, 1).toFixed(1)}`);
    check(q(times.fincher, 0.95) <= 12, `${effect}: Raposo ≤ 12 ms no p95 (${q(times.fincher, 0.95).toFixed(2)} ms)`);
  }
}

if (MF > 0) {
  section(`mesa de amigos: tempo por chamada do servidor (${MF} mesas, 8 pôsteres)`);
  const calls: number[] = [];
  const finals: number[] = [];
  const all8 = ALL_EFFECTS.filter((e) => e !== 'eight_aces');
  for (let m = 0; m < MF; m++) {
    const effects = m % 3 === 0 ? ALL_EFFECTS.slice(0, 8) : m % 3 === 1 ? all8 : (['eight_aces', 'sixth_card', 'sixth_card', 'sixth_card', 'opal', 'opal', 'hand_bounty', 'tell'] as PosterEffectId[]);
    const n = 1 + (m % 4);
    const cfg = friendsConfig({ seed: `bench-f-${m}`, people: n, effects });
    let t0 = performance.now();
    let s = createMatch(cfg).state;
    calls.push(performance.now() - t0);
    const rng = createRng(`bench-f-h-${m}`);
    for (let guard = 0; guard < 5000 && s.status === 'running'; guard++) {
      const who = waitingFor(s)!;
      // Metade das mesas: todas as pessoas saem depois de 20 chamadas (a última chamada termina a partida com os oráculos).
      const leave = m % 2 === 1 && guard >= 20;
      t0 = performance.now();
      s = leave ? leavePerson(s, who, 'forfeit').state : applyPersonAction(s, who, heroFor('medio', who)(personLegal(s, who)!, rng, s)).state;
      const dt = performance.now() - t0;
      (s.status === 'finished' ? finals : calls).push(dt);
    }
  }
  console.log(`  ${calls.length} chamadas · média ${(calls.reduce((a, b) => a + b, 0) / calls.length).toFixed(2)} ms · p50 ${q(calls, 0.5).toFixed(2)} · p95 ${q(calls, 0.95).toFixed(2)} · máx ${q(calls, 1).toFixed(1)} ms`);
  console.log(`  ${finals.length} chamadas de fim (oráculos terminam sozinhos quando é o caso) · p50 ${q(finals, 0.5).toFixed(1)} · máx ${q(finals, 1).toFixed(1)} ms`);
  check(q(calls, 0.95) <= 60, `chamada da mesa de amigos ≤ 60 ms no p95 (${q(calls, 0.95).toFixed(2)} ms)`);
  check(q([...calls, ...finals], 1) <= 1500, `nenhuma chamada passa de 1,5 s (${q([...calls, ...finals], 1).toFixed(1)} ms)`);
}
finish();
