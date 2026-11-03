/**
 * Determinismo (SPEC §8, pacote A, item 4): a mesma semente e as mesmas ações dão o mesmo
 * hash do log. Joga partidas com uma pessoa determinística, grava as ações e confere:
 *  1. repetir as ações numa partida nova dá o mesmo log (mesmo hash);
 *  2. o hash bate com o "golden" em scripts/poker/fixtures/determinism.json — o pacote C
 *     roda o mesmo arquivo no Deno (importando o motor copiado) e precisa achar os mesmos hashes.
 *
 * Pacote E3 (03/11/2026): v3 acrescenta mesas de amigos (operações de cada pessoa: ação,
 * estouro, Voltar, saída — `ops`) e casuais de devolução (`kind: 'rescue'`). Os casos de
 * antes não mudam (os 14 hashes são os mesmos do motor da fase 2).
 *
 *   node scripts/poker/test-determinism.ts [--update]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { applyHumanAction, createMatch, createRng, friendsConfig, humanLegal, logHash, rescueConfig, toPublicEvents } from '../../src/lib/poker/index.ts';
import type { MatchEvent, PlayerAction, PosterEffectId, RivalId } from '../../src/lib/poker/index.ts';
import { check, eq, finish, makeConfig, section } from './lib/harness.ts';
import { HEROES, heroFor } from './surrogates.ts';
import { playFriends } from './lib/friends.ts';
import type { FriendsOp } from './lib/friends.ts';

const FILE = new URL('./fixtures/determinism.json', import.meta.url);
const UPDATE = process.argv.includes('--update');

interface Case {
  name: string; mode: 'free' | 'bounty'; seed: string; loan: number; rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** Pôster Poker (03/11/2026): torneio da semana com este efeito. */
  effect?: PosterEffectId;
  actions: { a: PlayerAction; show: boolean }[]; hash: string; publicHash: string; events: number;
}

function replay(c: Omit<Case, 'hash' | 'publicHash' | 'events'>): { log: MatchEvent[]; actions: { a: PlayerAction; show: boolean }[] } {
  const cfg = c.effect ? makeConfig({ seed: c.seed, effect: c.effect, loan: c.loan }) : makeConfig({ mode: c.mode, seed: c.seed, loan: c.loan, rarity: c.rarity });
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
  // Pôster Poker: um torneio por efeito (a raridade é a do pôster).
  { name: 'torneio-early_flop', mode: 'bounty', seed: 'det-t-early_flop', loan: 0, rarity: 'common', effect: 'early_flop' },
  { name: 'torneio-double_pot', mode: 'bounty', seed: 'det-t-double_pot', loan: 0, rarity: 'common', effect: 'double_pot' },
  { name: 'torneio-blackjack', mode: 'bounty', seed: 'det-t-blackjack', loan: 500, rarity: 'common', effect: 'blackjack' },
  { name: 'torneio-hand_bounty', mode: 'bounty', seed: 'det-t-hand_bounty', loan: 0, rarity: 'rare', effect: 'hand_bounty' },
  { name: 'torneio-eight_aces', mode: 'bounty', seed: 'det-t-eight_aces', loan: 0, rarity: 'rare', effect: 'eight_aces' },
  { name: 'torneio-reveal_one', mode: 'bounty', seed: 'det-t-reveal_one', loan: 0, rarity: 'rare', effect: 'reveal_one' },
  { name: 'torneio-sixth_card', mode: 'bounty', seed: 'det-t-sixth_card', loan: 0, rarity: 'epic', effect: 'sixth_card' },
  { name: 'torneio-opal', mode: 'bounty', seed: 'det-t-opal', loan: 0, rarity: 'epic', effect: 'opal' },
  { name: 'torneio-tell', mode: 'bounty', seed: 'det-t-tell', loan: 500, rarity: 'legendary', effect: 'tell' },
];
const raw = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { cases: [] };
const golden: Case[] = raw.cases;
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

// ---------------------------------------------------------------------------
section('mesa de amigos e casual de devolução (pacote E3)');
interface FriendsCase {
  name: string; kind: 'friends'; seed: string; people: number; effects: PosterEffectId[];
  ops: FriendsOp[]; hash: string; publicHash: string; events: number;
}
interface RescueCase {
  name: string; kind: 'rescue'; seed: string; carrierId: RivalId; prizeId: string; rarity: 'common' | 'rare' | 'epic' | 'legendary';
  actions: { a: PlayerAction; show: boolean }[]; hash: string; publicHash: string; events: number;
}
const goldenF: (FriendsCase | RescueCase)[] = raw.friends ?? [];
const outF: (FriendsCase | RescueCase)[] = [];
const friendsBase: Omit<FriendsCase, 'ops' | 'hash' | 'publicHash' | 'events'>[] = [
  { name: 'amigos-2-misto', kind: 'friends', seed: 'det-f-2', people: 2, effects: ['opal', 'sixth_card', 'eight_aces', 'tell'] },
  { name: 'amigos-3-oito', kind: 'friends', seed: 'det-f-3', people: 3, effects: ['eight_aces', 'early_flop', 'reveal_one', 'sixth_card', 'tell', 'double_pot', 'blackjack', 'hand_bounty'] },
  { name: 'amigos-4-sem-efeito', kind: 'friends', seed: 'det-f-4', people: 4, effects: [] },
  { name: 'amigos-2-repetidos', kind: 'friends', seed: 'det-f-r', people: 2, effects: ['double_pot', 'double_pot', 'double_pot', 'blackjack', 'blackjack', 'hand_bounty', 'hand_bounty', 'reveal_one'] },
];
const pubHashFriends = (log: MatchEvent[], people: string[]): string => logHash(people.map((id) => logHash(toPublicEvents(log, id))));
for (const b of friendsBase) {
  const g = goldenF.find((x) => x.name === b.name) as FriendsCase | undefined;
  const cfg = friendsConfig({ seed: b.seed, people: b.people, effects: b.effects });
  const policy = (id: string, L: Parameters<typeof HEROES.medio>[0], rng: Parameters<typeof HEROES.medio>[1], st: Parameters<typeof HEROES.medio>[2]): PlayerAction => heroFor('medio', id)(L, rng, st);
  const first = playFriends(cfg, `${b.seed}:pessoas`, g && !UPDATE ? { replay: g.ops } : { policy, pTimeout: 0.04, pLeave: 0.002, pLeaveOther: 0.002, pBack: 0.3 });
  const again = playFriends(cfg, 'replay', { replay: first.ops, roundTrip: true });
  const h1 = logHash(first.priv);
  eq(logHash(again.priv), h1, `${b.name}: repetir as operações (com ida e volta pelo JSON) dá o mesmo hash`);
  const pub = pubHashFriends(first.priv, cfg.people as string[]);
  if (g && !UPDATE) {
    eq(h1, g.hash, `${b.name}: hash igual ao golden`);
    eq(pub, g.publicHash, `${b.name}: hash público (por pessoa) igual ao golden`);
  }
  outF.push({ ...b, ops: first.ops, hash: h1, publicHash: pub, events: first.priv.length });
  console.log(`  ${b.name}: ${first.priv.length} eventos, ${first.ops.length} operações, hash ${h1}`);
}
const rescueBase: Omit<RescueCase, 'actions' | 'hash' | 'publicHash' | 'events'>[] = [
  { name: 'devolucao-bogart', kind: 'rescue', seed: 'det-r-1', carrierId: 'bogart', prizeId: 'lost:1', rarity: 'common' },
  { name: 'devolucao-cypher', kind: 'rescue', seed: 'det-r-2', carrierId: 'cypher', prizeId: 'lost:2', rarity: 'epic' },
];
for (const b of rescueBase) {
  const g = goldenF.find((x) => x.name === b.name) as RescueCase | undefined;
  const cfg = rescueConfig({ seed: b.seed, carrierId: b.carrierId, prizeId: b.prizeId, rarity: b.rarity });
  const play = (acts: { a: PlayerAction; show: boolean }[]): { log: MatchEvent[]; actions: { a: PlayerAction; show: boolean }[] } => {
    let step = createMatch(cfg);
    const log: MatchEvent[] = [...step.events];
    const actions = acts.slice();
    const rng = createRng(`${b.seed}:pessoa`);
    for (let k = 0; step.state.status === 'running'; k++) {
      let act = actions[k];
      if (!act) {
        act = { a: HEROES.medio(humanLegal(step.state)!, rng, step.state), show: rng.nextFloat() < 0.5 };
        actions.push(act);
      }
      step = applyHumanAction(step.state, act.a, { show: act.show });
      log.push(...step.events);
    }
    return { log, actions };
  };
  const first = play(g && !UPDATE ? g.actions : []);
  const again = play(first.actions);
  const h1 = logHash(first.log);
  eq(logHash(again.log), h1, `${b.name}: repetir as ações dá o mesmo hash`);
  const pub = logHash(toPublicEvents(first.log, 'human'));
  if (g && !UPDATE) {
    eq(h1, g.hash, `${b.name}: hash igual ao golden`);
    eq(pub, g.publicHash, `${b.name}: hash público igual ao golden`);
  }
  outF.push({ ...b, actions: first.actions, hash: h1, publicHash: pub, events: first.log.length });
  console.log(`  ${b.name}: ${first.log.length} eventos, ${first.actions.length} ações, hash ${h1}`);
}
check(new Set(outF.map((c) => c.hash)).size === outF.length, 'mesas diferentes, hashes diferentes');

if (UPDATE || golden.length === 0 || goldenF.length === 0) {
  writeFileSync(FILE, `${JSON.stringify({
    v: 3,
    note: 'GERADO por scripts/poker/test-determinism.ts --update. O Deno confere os mesmos hashes. v2 (03/11/2026): torneios do Pôster Poker. v3 (03/11/2026, E3): mesas de amigos (ops) e casuais de devolução em `friends`; os `cases` de antes não mudaram.',
    cases: out, friends: outF,
  })}\n`);
  console.log('  golden gravado');
}
finish();
