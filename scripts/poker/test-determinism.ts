/**
 * Determinismo (SPEC §8, pacote A, item 4): a mesma semente e as mesmas ações dão o mesmo
 * hash do log. Joga partidas com uma pessoa determinística, grava as ações e confere:
 *  1. repetir as ações numa partida nova dá o mesmo log (mesmo hash);
 *  2. o hash bate com o "golden" em scripts/poker/fixtures/determinism.json — o pacote C
 *     roda o mesmo arquivo no Deno (importando o motor copiado) e precisa achar os mesmos hashes.
 *
 *   node scripts/poker/test-determinism.ts [--update]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { applyHumanAction, createMatch, createRng, humanLegal, logHash, toPublicEvents } from '../../src/lib/poker/index.ts';
import type { MatchEvent, PlayerAction } from '../../src/lib/poker/index.ts';
import { check, eq, finish, makeConfig, section } from './lib/harness.ts';
import { HEROES } from './surrogates.ts';

const FILE = new URL('./fixtures/determinism.json', import.meta.url);
const UPDATE = process.argv.includes('--update');

interface Case { name: string; mode: 'free' | 'bounty'; seed: string; loan: number; rarity: 'common' | 'rare' | 'epic' | 'legendary'; actions: { a: PlayerAction; show: boolean }[]; hash: string; publicHash: string; events: number }

function replay(c: Omit<Case, 'hash' | 'publicHash' | 'events'>): { log: MatchEvent[]; actions: { a: PlayerAction; show: boolean }[] } {
  const cfg = makeConfig({ mode: c.mode, seed: c.seed, loan: c.loan, rarity: c.rarity });
  let step = createMatch(cfg);
  const log: MatchEvent[] = [...step.events];
  const actions = c.actions.slice();
  const rng = createRng(`${c.seed}:pessoa`);
  let k = 0;
  while (step.state.status === 'running') {
    let act = actions[k];
    if (!act) {
      act = { a: HEROES.medio(humanLegal(step.state)!, rng, step.state), show: rng.nextFloat() < 0.5 };
      actions.push(act);
    }
    step = applyHumanAction(step.state, act.a, { show: act.show });
    log.push(...step.events);
    k++;
  }
  return { log, actions };
}

section('mesma semente + mesmas ações = mesmo log');
const base: Omit<Case, 'hash' | 'publicHash' | 'events' | 'actions'>[] = [
  { name: 'livre-1', mode: 'free', seed: 'det-livre-1', loan: 0, rarity: 'common' },
  { name: 'livre-2', mode: 'free', seed: 'det-livre-2', loan: 0, rarity: 'common' },
  { name: 'premio-comum', mode: 'bounty', seed: 'det-premio-comum', loan: 0, rarity: 'common' },
  { name: 'premio-lendario-emprestimo', mode: 'bounty', seed: 'det-premio-lendario', loan: 500, rarity: 'legendary' },
  { name: 'premio-epico', mode: 'bounty', seed: 'det-premio-epico', loan: 0, rarity: 'epic' },
];
const golden: Case[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')).cases : [];
const out: Case[] = [];
for (const b of base) {
  const g = golden.find((x) => x.name === b.name);
  const first = replay({ ...b, actions: g && !UPDATE ? g.actions : [] });
  const again = replay({ ...b, actions: first.actions });
  const h1 = logHash(first.log);
  const h2 = logHash(again.log);
  eq(h2, h1, `${b.name}: repetir as ações dá o mesmo hash`);
  const pub = logHash(toPublicEvents(first.log, 'human'));
  if (g && !UPDATE) {
    eq(h1, g.hash, `${b.name}: hash igual ao golden (motor e bots não mudaram)`);
    eq(pub, g.publicHash, `${b.name}: hash público igual ao golden`);
  }
  out.push({ ...b, actions: first.actions, hash: h1, publicHash: pub, events: first.log.length });
  console.log(`  ${b.name}: ${first.log.length} eventos, ${first.actions.length} ações, hash ${h1}`);
}
check(new Set(out.map((c) => c.hash)).size === out.length, 'sementes diferentes, hashes diferentes');
if (UPDATE || golden.length === 0) {
  writeFileSync(FILE, `${JSON.stringify({ v: 1, note: 'GERADO por scripts/poker/test-determinism.ts --update. O pacote C confere os mesmos hashes no Deno.', cases: out })}\n`);
  console.log('  golden gravado');
}
finish();
