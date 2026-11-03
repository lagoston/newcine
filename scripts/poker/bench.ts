/**
 * Tempo por decisão de bot (SPEC §8, pacote A, item 7): Raposo ≤ 12 ms no p95 no Node,
 * como aproximação dos 25 ms num Android médio.
 *
 *   node scripts/poker/bench.ts [--matches 60]
 */
import { createMatch, createRng, getLegalActions } from '../../src/lib/poker/index.ts';
import type { MatchState } from '../../src/lib/poker/index.ts';
import { defaultBotChoice } from '../../src/lib/poker/bots/driver.ts';
import { HUMAN, newCtx } from '../../src/lib/poker/match/internal.ts';
import type { MatchStateX } from '../../src/lib/poker/match/internal.ts';
import { applyAndProcess, startNextHand } from '../../src/lib/poker/match/runner.ts';
import { check, finish, makeConfig, section } from './lib/harness.ts';
import { HEROES } from './surrogates.ts';

const argM = process.argv.indexOf('--matches');
const M = argM > 0 ? Number(process.argv[argM + 1]) : 60;
const times: Record<string, number[]> = { bogart: [], cypher: [], fincher: [] };

section(`tempo de decisão (${M} partidas, herói médio)`);
for (let m = 0; m < M; m++) {
  const cfg = makeConfig({ mode: m % 2 ? 'bounty' : 'free', seed: `bench-${m}`, rarity: 'legendary' });
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
const q = (xs: number[], p: number): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
for (const [id, xs] of Object.entries(times)) {
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  console.log(`  ${id}: ${xs.length} decisões · média ${mean.toFixed(2)} ms · p50 ${q(xs, 0.5).toFixed(2)} · p95 ${q(xs, 0.95).toFixed(2)} · máx ${q(xs, 1).toFixed(2)}`);
}
check(q(times.fincher, 0.95) <= 12, `Raposo ≤ 12 ms no p95 (${q(times.fincher, 0.95).toFixed(2)} ms)`);
finish();
