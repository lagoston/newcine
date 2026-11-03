/**
 * Pacote E3 (03/11/2026): fixtures da fase 3 em scripts/poker/fixtures/fase3/ (pasta à parte:
 * os testes de falas leem só fixtures/public-*), para a interface (G3) e as falas (H3)
 * trabalharem sem servidor.
 *
 *  - friends-*.json: mesas de amigos jogadas do começo ao fim, com estouros, ausente, Voltar e
 *    saída. Para CADA pessoa (`viewers[id]`), os passos já no ponto de vista dela (povEvents /
 *    povView: "eu" = 'human', os outros p1..p4 e oráculos; lugares girados com "eu" no 0). Cada
 *    passo diz que operação o servidor fez (`op`, com o id CRU de quem fez).
 *  - rescue-*.json: casuais de devolução (o oráculo portador carrega o pôster perdido), no
 *    formato das public-* (uma pessoa, 'human').
 *
 *   node scripts/poker/gen-fixtures-fase3.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  applyHumanAction, createMatch, createRng, friendsConfig, friendsPayload, friendsResult, humanLegal, rescueConfig, tableView,
  toPublicEvents,
} from '../../src/lib/poker/index.ts';
import type { PlayerAction, PosterEffectId, PublicEvent, RivalId, TableView } from '../../src/lib/poker/index.ts';
import { randomHumanAction } from './lib/harness.ts';
import { heroFor, HEROES } from './surrogates.ts';
import { playFriends } from './lib/friends.ts';
import type { FriendsOp } from './lib/friends.ts';

const DIR = new URL('./fixtures/fase3/', import.meta.url);
mkdirSync(DIR, { recursive: true });
const index: unknown[] = [];

function feats(events: PublicEvent[]): string[] {
  const f = new Set<string>();
  for (const e of events) {
    f.add(e.t);
    if (e.t === 'action' && e.auto) f.add(`auto:${e.auto}`);
    if (e.t === 'street' && e.board.length === 6) f.add('board6');
    if (e.t === 'showdown' && e.hands.some((h) => h.kind === 'five_kind')) f.add('five_kind');
  }
  return [...f].sort();
}

interface FriendsWant { file: string; seed: string; people: number; effects: PosterEffectId[]; need: string[]; pTimeout: number; pLeave: number; only?: string[] }
const FRIENDS: FriendsWant[] = [
  { file: 'friends-01-2p-efeitos.json', seed: 'fx3-a', people: 2, effects: ['opal', 'reveal_one', 'blackjack', 'tell'], need: ['effectCast', 'clockOut'], pTimeout: 0.06, pLeave: 0 },
  { file: 'friends-02-4p-oito.json', seed: 'fx3-b', people: 4, effects: ['eight_aces', 'early_flop', 'reveal_one', 'sixth_card', 'double_pot', 'blackjack', 'hand_bounty', 'opal'], need: ['effectBonus', 'board6'], pTimeout: 0.05, pLeave: 0, only: ['p1', 'p4'] },
  { file: 'friends-03-3p-saida-ausente.json', seed: 'fx3-c', people: 3, effects: ['tell', 'tell', 'double_pot'], need: ['personLeft', 'away', 'auto:away', 'auto:left'], pTimeout: 0.35, pLeave: 0.01 },
  { file: 'friends-04-2p-sem-efeito.json', seed: 'fx3-d', people: 2, effects: [], need: ['matchEnded'], pTimeout: 0.03, pLeave: 0 },
];

for (const w of FRIENDS) {
  let got: ReturnType<typeof playFriends> | null = null;
  let tries = 0;
  for (; tries < 200 && !got; tries++) {
    const cfg = friendsConfig({ seed: `${w.seed}-${tries}`, people: w.people, effects: w.effects });
    const p = playFriends(cfg, `${w.seed}-h-${tries}`, {
      policy: (id, L, rng, s) => heroFor('medio', id)(L, rng, s), pTimeout: w.pTimeout, pLeave: w.pLeave, pLeaveOther: w.pLeave / 2, pBack: 0.08,
    });
    const allPub = (cfg.people as string[]).flatMap((id) => toPublicEvents(p.priv, id));
    const f = feats(allPub);
    if (w.need.every((n) => f.includes(n))) got = p;
  }
  if (!got) throw new Error(`não achei ${w.file}`);
  const cfg = got.cfg;
  const viewers: Record<string, { viewerSeat: number; steps: { op: FriendsOp | null; events: PublicEvent[]; view: TableView }[] }> = {};
  // (mesa de 4: só dois pontos de vista — quem criou e um convidado — para o arquivo não crescer demais)
  for (const id of (w.only ?? cfg.people) as string[]) {
    viewers[id] = {
      viewerSeat: cfg.seats[id],
      steps: got.steps.map((st, k) => ({ op: k === 0 ? null : got!.ops[k - 1], ...friendsPayload(st.state, st.events, id) })),
    };
  }
  const r = friendsResult(got.final);
  const allPub = (cfg.people as string[]).flatMap((id) => toPublicEvents(got!.priv, id));
  writeFileSync(new URL(w.file, DIR), `${JSON.stringify({
    v: 1, kind: 'friends', seed: cfg.seed, people: cfg.people, effects: cfg.effects, seats: cfg.seats,
    result: { winnerId: r.winnerId, winnerIsPerson: r.winnerIsPerson, places: r.places, people: r.people },
    viewers,
  })}\n`);
  index.push({ file: w.file, kind: 'friends', people: w.people, effects: w.effects, hands: got.final.game.handNumber, steps: got.steps.length,
    winner: r.winnerId, features: feats(allPub) });
  console.log(`  ${w.file}: ${got.final.game.handNumber} mãos, ${got.steps.length} passos, vencedor ${r.winnerId} (tentativa ${tries})`);
}

interface RescueWant { file: string; seed: string; carrierId: RivalId; want: 'captured' | 'lost' | 'moved' }
const RESCUE: RescueWant[] = [
  { file: 'rescue-01-capturou.json', seed: 'fx3-r1', carrierId: 'bogart', want: 'captured' },
  { file: 'rescue-02-perdeu.json', seed: 'fx3-r2', carrierId: 'cypher', want: 'lost' },
  { file: 'rescue-03-passou-e-capturou.json', seed: 'fx3-r3', carrierId: 'fincher', want: 'moved' },
];
for (const w of RESCUE) {
  let done = false;
  for (let k = 0; k < 400 && !done; k++) {
    const cfg = rescueConfig({ seed: `${w.seed}-${k}`, carrierId: w.carrierId, prizeId: `lost:${w.seed}`, rarity: 'rare' });
    const rng = createRng(`${w.seed}-h-${k}`);
    let step = createMatch(cfg);
    const steps: { action: PlayerAction | null; show: boolean; events: PublicEvent[]; view: TableView }[] = [
      { action: null, show: false, events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human') },
    ];
    while (step.state.status === 'running') {
      const L = humanLegal(step.state)!;
      const action = k % 2 ? randomHumanAction(L, rng) : HEROES.medio(L, rng, step.state);
      const show = rng.nextFloat() < 0.5;
      step = applyHumanAction(step.state, action, { show });
      steps.push({ action, show, events: toPublicEvents(step.events, 'human'), view: tableView(step.state, 'human') });
    }
    const all = steps.flatMap((x) => x.events);
    const captured = all.some((e) => e.t === 'prizeCaptured');
    const moved = all.some((e) => e.t === 'prizeMoved');
    const ok = w.want === 'captured' ? captured && !moved : w.want === 'lost' ? !captured : captured && moved;
    if (!ok) continue;
    writeFileSync(new URL(w.file, DIR), `${JSON.stringify({
      v: 1, kind: 'rescue', mode: cfg.mode, seed: cfg.seed, prize: cfg.prize, reclaim: true, steps,
    })}\n`);
    index.push({ file: w.file, kind: 'rescue', carrierId: w.carrierId, captured, moved, hands: step.state.game.handNumber, features: feats(all) });
    console.log(`  ${w.file}: ${step.state.game.handNumber} mãos, capturou ${captured}, passou ${moved}`);
    done = true;
  }
  if (!done) throw new Error(`não achei ${w.file}`);
}

writeFileSync(new URL('index.json', DIR), `${JSON.stringify({
  v: 1, generatedBy: 'scripts/poker/gen-fixtures-fase3.ts',
  note: 'Fase 3 (pacote E3, 03/11/2026): mesas de amigos (viewers[id].steps já no ponto de vista de cada pessoa: "eu" = human) e casuais de devolução.',
  files: index,
}, null, 1)}\n`);
