/**
 * Gera scripts/poker/fixtures/: 20 partidas com o log PÚBLICO (PublicEvent + TableView a
 * cada passo) para os pacotes B e D, e 5 logs PRIVADOS (MatchEvent, com bucket e monstro
 * dos bots) só para os testes do B (§6.6). Escolhe partidas que cobrem os casos que a
 * interface e o Diretor precisam: vitória, eliminação, captura, passagem do prêmio,
 * empréstimo, desistência, heads-up, all-in com runout, potes paralelos, tilt, mostrar…
 *
 *   node scripts/poker/gen-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  applyHumanAction, createMatch, createRng, forfeitMatch, humanLegal, simulateRest, summarizeMatch, tableView, toPublicEvents,
} from '../../src/lib/poker/index.ts';
import type { MatchConfig, MatchEvent, MatchState, PlayerAction, PublicEvent, Rarity, TableView } from '../../src/lib/poker/index.ts';
import { makeConfig, randomHumanAction } from './lib/harness.ts';

const DIR = new URL('./fixtures/', import.meta.url);
mkdirSync(DIR, { recursive: true });

interface Step { action: PlayerAction | null; show: boolean; events: PublicEvent[]; view: TableView }
interface Played {
  cfg: MatchConfig; steps: Step[]; priv: MatchEvent[]; actions: { action: PlayerAction; show: boolean }[];
  final: MatchState; forfeitAt: number | null; feats: Set<string>;
}

function play(cfg: MatchConfig, humanSeed: string, forfeitAfter: number | null): Played {
  const rng = createRng(humanSeed);
  let step = createMatch(cfg);
  const steps: Step[] = [{ action: null, show: false, events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human') }];
  const priv: MatchEvent[] = [...step.events];
  const actions: { action: PlayerAction; show: boolean }[] = [];
  let s = step.state;
  let forfeitAt: number | null = null;
  while (s.status === 'running') {
    if (forfeitAfter !== null && s.game.handNumber >= forfeitAfter) {
      step = forfeitMatch(s);
      forfeitAt = s.game.handNumber;
      steps.push({ action: null, show: false, events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human') });
      priv.push(...step.events);
      s = step.state;
      break;
    }
    const L = humanLegal(s)!;
    const action = randomHumanAction(L, rng);
    const show = rng.nextFloat() < 0.5;
    step = applyHumanAction(s, action, { show });
    actions.push({ action, show });
    steps.push({ action, show, events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human') });
    priv.push(...step.events);
    s = step.state;
  }
  const feats = new Set<string>();
  for (const st of steps) {
    for (const e of st.events) {
      feats.add(e.t);
      if (e.t === 'potAwarded' && e.potIndex > 0) feats.add('sidePot');
      if (e.t === 'handComplete') for (const k of Object.keys(e.flags)) feats.add(`flag:${k}`);
      if (e.t === 'cardsShown') feats.add(e.playerId === 'human' ? 'humanShow' : 'botShow');
      if (e.t === 'matchEnded') feats.add(`end:${e.reason}`);
      if (e.t === 'tilt' && e.on) feats.add(`tilt:${e.kind}`);
      if (e.t === 'levelUp' && e.level.index >= 4) feats.add('level5+');
    }
  }
  if (cfg.loan > 0) feats.add('loan');
  feats.add(`mode:${cfg.mode}`);
  return { cfg, steps, priv, actions, final: s, forfeitAt, feats };
}

/** Uma linha por passo/evento: legível e sem inflar o arquivo. */
function lines(header: Record<string, unknown>, key: string, items: unknown[]): string {
  const head = JSON.stringify(header).slice(0, -1);
  return `${head},"${key}":[\n${items.map((x) => JSON.stringify(x)).join(',\n')}\n]}\n`;
}

const WANT: { name: string; mode: 'free' | 'bounty'; loan?: number; rarity?: Rarity; forfeit?: number; minHands?: number; need: string[] }[] = [
  { name: 'free-win', mode: 'free', need: ['end:won'] },
  { name: 'free-win-headsup', mode: 'free', need: ['end:won', 'headsUp', 'sidePot'] },
  { name: 'free-eliminated', mode: 'free', need: ['end:eliminated'] },
  { name: 'free-eliminated-late', mode: 'free', need: ['end:eliminated', 'level5+'] },
  { name: 'free-runout-badbeat', mode: 'free', minHands: 4, need: ['runout', 'flag:badBeat'] },
  { name: 'free-sidepot', mode: 'free', minHands: 4, need: ['sidePot', 'runout'] },
  { name: 'free-show', mode: 'free', need: ['humanShow', 'botShow'] },
  { name: 'free-tilt', mode: 'free', need: ['tilt:veneno'] },
  { name: 'free-forfeit', mode: 'free', forfeit: 8, minHands: 8, need: ['end:forfeit'] },
  { name: 'free-bigpot-bluff', mode: 'free', need: ['flag:bigPot', 'flag:bluffCaught'] },
  { name: 'bounty-common-capture', mode: 'bounty', rarity: 'common', need: ['prizeCaptured'] },
  { name: 'bounty-rare-moved-captured', mode: 'bounty', rarity: 'rare', need: ['prizeMoved', 'prizeCaptured'] },
  { name: 'bounty-epic-moved-lost', mode: 'bounty', rarity: 'epic', need: ['prizeMoved', 'end:eliminated'] },
  { name: 'bounty-legendary-win', mode: 'bounty', rarity: 'legendary', need: ['end:won', 'prizeCaptured'] },
  { name: 'bounty-legendary-lost', mode: 'bounty', rarity: 'legendary', need: ['end:eliminated'] },
  { name: 'bounty-loan-capture', mode: 'bounty', loan: 500, rarity: 'rare', need: ['loan', 'prizeCaptured'] },
  { name: 'bounty-loan-lost', mode: 'bounty', loan: 500, rarity: 'epic', need: ['loan', 'end:eliminated'] },
  { name: 'bounty-forfeit', mode: 'bounty', rarity: 'common', forfeit: 12, need: ['end:forfeit'] },
  { name: 'bounty-capture-then-out', mode: 'bounty', rarity: 'common', need: ['prizeCaptured', 'end:eliminated'] },
  { name: 'bounty-tilt-headsup', mode: 'bounty', rarity: 'epic', need: ['tilt:veneno', 'headsUp'] },
];

const index: unknown[] = [];
const privates: Played[] = [];
for (const [k, w] of WANT.entries()) {
  let got: Played | null = null;
  let seed = '';
  for (let tries = 0; tries < 4000 && !got; tries++) {
    seed = `fx-${w.name}-${tries}`;
    const p = play(makeConfig({ mode: w.mode, seed, loan: w.loan ?? 0, rarity: w.rarity }), `${seed}-h`, w.forfeit ?? null);
    if (w.need.every((f) => p.feats.has(f)) && p.final.game.handNumber >= (w.minHands ?? 10)) got = p;
  }
  if (!got) {
    console.log(`  sem partida para ${w.name}`);
    continue;
  }
  const file = `public-${String(k + 1).padStart(2, '0')}-${w.name}.json`;
  const summary = got.cfg.mode === 'tutorial' ? null
    : summarizeMatch(got.final, { clientId: `fixture-${k + 1}`, startedAt: '2026-11-03T22:00:00-03:00', endedAt: '2026-11-03T22:10:00-03:00' });
  const rest = got.final.status === 'humanOut' && got.cfg.mode === 'free' ? simulateRest(got.final) : null;
  writeFileSync(new URL(file, DIR), lines(
    { v: 1, kind: 'public', name: w.name, mode: got.cfg.mode, seed: got.cfg.mode === 'bounty' ? got.cfg.seed : undefined, loan: got.cfg.loan,
      prize: got.cfg.prize, features: [...got.feats].sort(), summary, simulateRest: rest },
    'steps', got.steps,
  ));
  index.push({ file, name: w.name, mode: got.cfg.mode, hands: got.final.game.handNumber, steps: got.steps.length, features: [...got.feats].sort() });
  if (privates.length < 5 && (w.name === 'free-win' || w.name === 'free-eliminated-late' || w.name === 'free-tilt'
      || w.name === 'bounty-rare-moved-captured' || w.name === 'bounty-legendary-lost')) privates.push(got);
  console.log(`  ${file}: ${got.final.game.handNumber} mãos, ${got.steps.length} passos (${seed})`);
}
privates.forEach((p, k) => {
  const file = `private-${String(k + 1).padStart(2, '0')}.json`;
  writeFileSync(new URL(file, DIR), lines(
    { v: 1, kind: 'private', note: 'SÓ PARA TESTES: tem cartas de todos, bucket e monstro dos bots. Nunca usar na interface.',
      mode: p.cfg.mode, seed: p.cfg.seed, loan: p.cfg.loan, prize: p.cfg.prize, humanActions: p.actions },
    'events', p.priv,
  ));
  index.push({ file, kind: 'private', mode: p.cfg.mode, events: p.priv.length });
  console.log(`  ${file}: ${p.priv.length} eventos privados`);
});
writeFileSync(new URL('index.json', DIR), `${JSON.stringify({ v: 1, generatedBy: 'scripts/poker/gen-fixtures.ts', bots: 'A2 (bots reais, perfis padrão do §3.2)', files: index }, null, 1)}\n`);
