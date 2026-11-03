/**
 * Teste do protocolo da Edge poker-bounty (SPEC §4.7) sem rede: o handler.ts de
 * verdade, com a camada de partida de verdade (cópia em _engine/), contra um
 * banco FALSO em memória que imita as RPCs poker_bounty_prepare/open/load/step.
 * (As RPCs reais foram testadas no Postgres com blocos revertidos.)
 *
 * Rodar (depois de node scripts/sync-poker-engine.mjs):
 *   node scripts/poker/test-protocol.ts [--matches 20]
 *
 * Confere (proto 2, Pôster Poker): proto 1 → 426 sem débito · sem ficha → 402 · prêmio
 * trocado → 409 · semana velha → 409 · aposta inválida → 400 · start com fichas e com
 * pôster · segundo start → active_exists · o mesmo idem do start → a partida já aberta ·
 * seq velho → 409 · mesmo idem → mesma resposta byte a byte · jogada ilegal → 422 ·
 * resume (com `tournament`) · forfeit (perde o pôster apostado) · partida vencida (24 h) →
 * 410 'abandoned' · 3 entradas por dia · partidas até o fim com cada um dos 9 efeitos
 * (1º lugar → o pôster uma vez só; semente revelada bate com o seedHash) · nada privado
 * nas respostas · tempo por chamada.
 *
 * 03/11/2026 (pacote C). Proto 2 (pacote E, 03/11/2026, tarde): o banco falso imita as
 * RPCs do torneio do pacote F. Sai com 1 se algo falhar.
 */
import { createHash } from 'node:crypto';
import { handle } from '../../supabase/functions/poker-bounty/handler.ts';
import type { Deps, Reply } from '../../supabase/functions/poker-bounty/handler.ts';

type Row = Record<string, unknown>;

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`FALHOU: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Banco falso (imita as RPCs do torneio do pacote F)
// ---------------------------------------------------------------------------

interface FakeMatch {
  id: string; user_id: string; day: string; week: string; attempt: number; prize_id: string; rarity: string; effect_id: string;
  loan: boolean; status: string; place: number | null; seed: string; seed_hash: string;
  state: Row; public_view: Row; events_tail: unknown[]; human_actions: unknown[]; seq: number;
  last_idem: string | null; last_response: Row | null; hands: number; alive_count: number; result: Row | null;
  created_at: string; summary: Row | null; stake: Row; stake_status: string; cobra_item_id: string | null; rewards: Row | null;
  start_idem: string | null;
}

const TODAY = '2026-11-03';
const WEEK = '2026-10-29';
const EFFECTS = ['early_flop', 'double_pot', 'blackjack', 'hand_bounty', 'eight_aces', 'reveal_one', 'sixth_card', 'opal', 'tell'] as const;

function prizeFor(effect: string): { json: Row; tournament: Row } {
  const id = `pp-${effect.replace(/_/g, '-')}`;
  return {
    json: { id, kind: 'poster', rarity: 'common', name_pt: 'Pôster', name_en: 'Poster', payload: {} },
    tournament: { id, item_id: 147, rarity: 'common', serial: 80, title: 'Golpe de Mestre', title_en: 'The Sting', year: 1973,
      file_path: '/ho0bLp3w1ZBphrhaZDdRJZqvbF4.jpg', effect_id: effect, effect: 'gold' },
  };
}

class FakeDb {
  tickets = 0;
  ageOk = true;
  matches: FakeMatch[] = [];
  /** Pôsteres gold concedidos (ref = partida). */
  grants: { ref: string; week: string }[] = [];
  minProto = 2;
  effect: string = 'early_flop';
  cobra: string | null = null;
  /** Coleção da pessoa (para apostar). */
  posters: { item_id: number; effect: string; rarity: string }[] = [{ item_id: 12, effect: 'none', rarity: 'common' }, { item_id: 13, effect: 'holo', rarity: 'rare' }];
  private n = 0;

  private active(uid: string) {
    return this.matches.find((m) => m.user_id === uid && m.status === 'active');
  }

  private check(uid: string, week: string, prizeId: string, stake: Row): Row {
    const P = prizeFor(this.effect);
    if (!this.ageOk) return { ok: false, status: 403, code: 'age_required' };
    if (week !== WEEK) return { ok: false, status: 409, code: 'stale_week', tournament: { week: WEEK, prize: P.tournament } };
    const a = this.active(uid);
    if (a) return { ok: false, status: 409, code: 'active_exists', matchId: a.id, expired: Date.parse(a.created_at) < Date.now() - 86400000 };
    if (this.grants.some((g) => g.week === week)) return { ok: false, status: 403, code: 'won_this_week' };
    const used = this.matches.filter((m) => m.user_id === uid && m.day === TODAY).length;
    if (used >= 3) return { ok: false, status: 403, code: 'attempts', attempts_used: used, max_attempts: 3 };
    if (prizeId !== P.json.id) return { ok: false, status: 409, code: 'prize_changed', prize: P.tournament };
    if (stake.kind === 'poster') {
      const own = this.posters.find((x) => x.item_id === stake.item_id && x.effect === stake.effect);
      if (!own) return { ok: false, status: 400, code: 'stake_invalid', reason: 'not_owned' };
      if (own.rarity !== 'common') return { ok: false, status: 400, code: 'stake_invalid', reason: 'rarity' };
    } else if (this.tickets < 1) {
      return { ok: false, status: 402, code: 'no_chips', need: 1, have: this.tickets };
    }
    return { ok: true, attempt: used + 1 };
  }

  rpc = async (fn: string, a: Row): Promise<unknown> => {
    const uid = String(a.p_uid);
    const P = prizeFor(this.effect);
    switch (fn) {
      case 'poker_tournament_prepare': {
        if (Number(a.p_proto ?? 0) < this.minProto) return { ok: false, status: 426, code: 'update_required', min_proto: this.minProto };
        const dup = a.p_idem ? this.matches.find((m) => m.user_id === uid && m.start_idem === a.p_idem) : undefined;
        if (dup) return { ok: false, status: 409, code: 'duplicate', matchId: dup.id };
        const stake = a.p_stake as Row;
        const c = this.check(uid, String(a.p_week), String(a.p_prize_id), stake);
        if (c.ok !== true) return c;
        return {
          ok: true, week: WEEK, day: TODAY, attempt: c.attempt, prize_id: P.json.id, rarity: 'common', effect_id: this.effect, loan: 0,
          stake: stake.kind === 'chips' ? { kind: 'chips', amount: 1 } : stake, cobra_item_id: this.cobra,
          prize: P.json, tournament_prize: P.tournament, settings: null, bot_params: { bogart: { version: 1, params: {} } }, memory: null,
          difficulty: { stars: 1, epsilonMul: 2.4, adaptDelay: 18 }, stars: 1,
        };
      }
      case 'poker_tournament_open': {
        const stake = a.p_stake as Row;
        const c = this.check(uid, String(a.p_week), String(a.p_prize_id), stake.kind === 'chips' ? { kind: 'chips' } : stake);
        if (c.ok !== true) return c;
        if (c.attempt !== a.p_attempt) return { ok: false, status: 409, code: 'state_changed' };
        const hash = createHash('sha256').update(String(a.p_seed)).digest('hex');
        if (hash !== a.p_seed_hash) return { ok: false, status: 400, code: 'bad_request' };
        if (stake.kind === 'chips') this.tickets -= 1;
        this.n += 1;
        const id = `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`;
        this.matches.push({
          id, user_id: uid, day: TODAY, week: String(a.p_week), attempt: Number(a.p_attempt), prize_id: String(a.p_prize_id),
          rarity: String(a.p_rarity), effect_id: String(a.p_effect_id), loan: Number(a.p_loan) > 0, status: 'active', place: null,
          seed: String(a.p_seed), seed_hash: String(a.p_seed_hash), state: a.p_state as Row,
          public_view: a.p_public_view as Row, events_tail: (a.p_events_tail as unknown[]).slice(-60), human_actions: [],
          seq: 1, last_idem: null, last_response: null, hands: 0, alive_count: 4, result: null,
          created_at: new Date().toISOString(), summary: null, stake, stake_status: 'locked', cobra_item_id: (a.p_cobra_item_id as string | null) ?? null,
          rewards: null, start_idem: (a.p_idem as string | null) ?? null,
        });
        const used = this.matches.filter((m) => m.user_id === uid && m.day === TODAY).length;
        return { ok: true, match_id: id, seq: 1, attempt: a.p_attempt, tickets: this.tickets, stake, attempts_used: used, max_attempts: 3 };
      }
      case 'poker_bounty_load': {
        const m = this.matches.find((x) => x.user_id === uid && (a.p_match_id ? x.id === a.p_match_id : x.status === 'active'));
        if (!m) return null;
        const { cobra_item_id: cobraId, start_idem: _i, ...pub } = m;
        void _i;
        // Ida e volta pelo "banco": JSON, como no Postgres (jsonb).
        return JSON.parse(JSON.stringify({
          ...pub, prize: P.json, tournament_prize: P.tournament, carrier: 'none', stars: 1, cobra_item: cobraId !== null,
          attempts_used: this.matches.filter((x) => x.user_id === uid && x.day === TODAY).length, max_attempts: 3,
          expired: m.status === 'active' && Date.parse(m.created_at) < Date.now() - 86400000,
        }));
      }
      case 'poker_bounty_step': {
        const m = this.matches.find((x) => x.id === a.p_match_id && x.user_id === uid);
        if (!m) return { ok: false, code: 'not_found' };
        if (m.status !== 'active' || m.seq !== a.p_expected_seq) {
          return { ok: false, code: m.status === 'active' ? 'stale' : 'finished', seq: m.seq, view: m.public_view, recent: m.events_tail.slice(-20), result: m.result };
        }
        m.seq += 1;
        m.state = JSON.parse(JSON.stringify(a.p_state));
        m.public_view = a.p_public_view as Row;
        m.events_tail = [...m.events_tail, ...(a.p_events_append as unknown[])].slice(-60);
        if (a.p_human_action) m.human_actions.push(a.p_human_action);
        m.last_idem = (a.p_idem as string | null) ?? null;
        m.hands = Number(a.p_hands);
        m.alive_count = Number(a.p_alive_count);
        let response = a.p_response as Row;
        check(a.p_captured === null, 'torneio: o handler nunca manda captura');
        const fin = a.p_finished as Row | null;
        if (fin) {
          const won = fin.status === 'won';
          if (won && !this.grants.some((g) => g.ref === m.id)) this.grants.push({ ref: m.id, week: m.week });
          m.status = String(fin.status);
          m.place = Number(fin.place);
          m.summary = fin.summary as Row;
          const sum = m.summary as { tournament?: { won: boolean; effect: string } };
          check(sum.tournament?.won === won && sum.tournament?.effect === m.effect_id, 'resumo do motor traz o torneio (won, effect)');
          const lost = !won && m.stake.kind === 'poster';
          if (lost) this.posters = this.posters.filter((x) => !(x.item_id === m.stake.item_id && x.effect === m.stake.effect));
          m.stake_status = won ? 'returned' : lost ? 'lost' : 'spent';
          m.rewards = {
            poster: won ? { prizeId: m.prize_id, itemId: 147, title: 'Golpe de Mestre', titleEn: 'The Sting', filePath: '/x.jpg', serial: 80, rarity: 'common', effect: 'gold' } : null,
            cobraItem: won && m.cobra_item_id ? { id: m.cobra_item_id, name: 'Item', nameEn: 'Item', kind: 'deck' } : null,
            cobraRevealed: !won && m.cobra_item_id ? { id: m.cobra_item_id, name: 'Item', nameEn: 'Item', kind: 'deck' } : null,
            stake: m.stake.kind === 'chips' ? { kind: 'chips', amount: 1 } : { kind: 'poster', itemId: m.stake.item_id, effect: m.stake.effect, lost },
          };
          const result = { ...((response.result as Row) ?? {}), status: m.status, place: m.place, prizeCaptured: won,
                           seed: m.seed, seedHash: m.seed_hash, marks: [], title: { wins: 0, id: 'figurante', rankUp: false }, rewards: m.rewards };
          response = { ...response, result, rewards: m.rewards };
          m.result = result;
        }
        m.last_response = JSON.parse(JSON.stringify(response));
        return { ok: true, seq: m.seq, response, result: m.result };
      }
      default:
        throw new Error(`rpc desconhecida ${fn}`);
    }
  };
}

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

const UID = '11111111-1111-4111-8111-111111111111';
let idemN = 0;
const newIdem = () => `aaaaaaaa-0000-4000-8000-${String(++idemN).padStart(12, '0')}`;

let seedRng = 12345;
function rand(): number {
  seedRng = (seedRng * 1103515245 + 12345) & 0x7fffffff;
  return seedRng / 0x7fffffff;
}

function legalRandomAction(view: Row): Row {
  const legal = view.legal as Row | null;
  if (!legal) return { type: 'fold' };
  const opts: Row[] = [];
  if (legal.canCheck) opts.push({ type: 'check' });
  else opts.push({ type: 'fold' });
  if (legal.call) opts.push({ type: 'call' }, { type: 'call' });
  const bet = legal.bet as { min: number; max: number } | null;
  const raise = legal.raise as { min: number; max: number } | null;
  if (bet) opts.push({ type: 'bet', amount: bet.min });
  if (raise) opts.push({ type: 'raise', amount: raise.min });
  if (legal.allIn && rand() < 0.15) opts.push({ type: 'allIn' });
  return opts[Math.floor(rand() * opts.length)];
}

const FORBIDDEN_KEYS = /^(eq|equity|strength|bucket|range|percentile|handClass|score|deck|rng|model|memory|tally|bots|state|schedule|fx|cobra_item_id|cobraItemId)$/i;

function leakKeys(v: unknown, path: string, out: string[]): void {
  if (Array.isArray(v)) v.forEach((x, i) => leakKeys(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.test(k)) out.push(`${path}.${k}`);
      if (k === 'seed' && !path.includes('result') && !path.includes('matchEnded')) out.push(`${path}.seed`);
      leakKeys(x, `${path}.${k}`, out);
    }
  }
}

function noLeak(r: Reply, label: string): void {
  const out: string[] = [];
  leakKeys(r.body, '', out);
  // matchEnded pode trazer a semente (só no fim, §4.5).
  const bad = out.filter((p) => !/events\[\d+\]\.seed$/.test(p));
  check(bad.length === 0, `${label}: chaves privadas na resposta: ${bad.slice(0, 5).join(', ')}`);
}

// ---------------------------------------------------------------------------
// Roteiro
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argN = process.argv.indexOf('--matches');
  const MATCHES = argN > 0 ? Number(process.argv[argN + 1]) : 18;
  const db = new FakeDb();
  const deps: Deps = { rpc: db.rpc, nowIso: () => new Date().toISOString() };
  const call = (body: Row) => handle(body, UID, deps);
  const times: number[] = [];
  const P = () => prizeFor(db.effect).json.id as string;
  const start = (extra: Row = {}) => call({ proto: 2, op: 'start', week: WEEK, prizeId: P(), stake: { kind: 'chips' }, ...extra });

  // 426 antes de qualquer cobrança (o proto 1 não sabe dizer a semana nem a aposta)
  db.tickets = 5;
  const r426 = await call({ proto: 1, op: 'start', day: TODAY, prizeId: P() });
  check(r426.status === 426 && r426.body.code === 'update_required', `proto 1 → 426 (veio ${r426.status} ${r426.body.code})`);
  check(db.tickets === 5 && db.matches.length === 0, '426 não debita nem abre');
  const bad = await call({ proto: 0, op: 'start', week: WEEK, prizeId: P(), stake: { kind: 'chips' } });
  check(bad.status === 400, 'proto 0 → 400 bad_request');

  // sem ficha → 402; prêmio trocado → 409; semana velha → 409; aposta torta → 400
  db.tickets = 0;
  const r402 = await start();
  check(r402.status === 402 && r402.body.code === 'no_chips' && db.matches.length === 0, `sem ficha → 402 no_chips (veio ${r402.status} ${r402.body.code})`);
  db.tickets = 5;
  const rPrize = await call({ proto: 2, op: 'start', week: WEEK, prizeId: 'pp-outro', stake: { kind: 'chips' } });
  check(rPrize.status === 409 && rPrize.body.code === 'prize_changed' && !!rPrize.body.prize, 'prêmio trocado → 409 prize_changed {prize}');
  const rWeek = await call({ proto: 2, op: 'start', week: '2026-10-22', prizeId: P(), stake: { kind: 'chips' } });
  check(rWeek.status === 409 && rWeek.body.code === 'stale_week' && !!rWeek.body.tournament, 'semana velha → 409 stale_week {tournament}');
  const rStake = await start({ stake: { kind: 'ficha' } });
  check(rStake.status === 400 && rStake.body.code === 'stake_invalid', 'aposta torta → 400 stake_invalid');
  const rNot = await start({ stake: { kind: 'poster', itemId: 999, effect: 'none' } });
  check(rNot.status === 400 && rNot.body.code === 'stake_invalid' && rNot.body.reason === 'not_owned', 'pôster que não é dela → 400 not_owned');
  const rRar = await start({ stake: { kind: 'poster', itemId: 13, effect: 'holo' } });
  check(rRar.status === 400 && rRar.body.reason === 'rarity', 'pôster de outra raridade → 400 rarity');
  check(db.tickets === 5 && db.matches.length === 0, 'nenhum erro acima cobrou ou abriu');

  // start com fichas
  const startIdem = newIdem();
  let r = await start({ idem: startIdem });
  check(r.status === 200, `start → 200 (veio ${r.status} ${JSON.stringify(r.body).slice(0, 200)})`);
  noLeak(r, 'start');
  const t = r.body.tournament as Row | undefined;
  check(t?.effect === db.effect && t?.cobraItem === false && (t?.stake as Row)?.kind === 'chips', 'start: bloco tournament (efeito, Cobra, aposta)');
  check(r.body.carrier === null && (r.body.view as Row).prize === null, 'start: sem portador');
  check(((r.body.view as Row).tournament as Row)?.effect === db.effect, 'start: view.tournament');
  const ms = (r.body.events as Row[]).find((e) => e.t === 'matchStarted');
  check(!!ms && (ms.tournament as Row)?.effect === db.effect && ms.prize === null, 'matchStarted.tournament no start');
  const dup = await start({ idem: startIdem });
  check(dup.status === 200 && dup.body.duplicate === true && dup.body.matchId === r.body.matchId, 'o mesmo idem do start → a partida já aberta (duplicate)');
  const r2 = await start();
  check(r2.status === 409 && r2.body.code === 'active_exists', 'segundo start → 409 active_exists');
  check(db.tickets === 4, `um débito só (${db.tickets})`);

  let matchId = String(r.body.matchId);
  let seq = Number(r.body.seq);
  let view = r.body.view as Row;
  const seedHash = String(r.body.seedHash);
  check((r.body.events as Row[]).some((e) => e.t === 'matchStarted' && e.seedHash === seedHash), 'matchStarted leva o seedHash');

  // jogada ilegal
  const ill = await call({ proto: 2, op: 'act', matchId, seq, idem: newIdem(), action: { type: 'raise', amount: 1 } });
  check(ill.status === 422 && ill.body.code === 'illegal', `jogada ilegal → 422 (veio ${ill.status} ${ill.body.code})`);

  // jogada válida + repetição de rede (mesmo idem) + seq velho
  const idem = newIdem();
  const act = legalRandomAction(view);
  const a1 = await call({ proto: 2, op: 'act', matchId, seq, idem, action: act });
  check(a1.status === 200, `act → 200 (veio ${a1.status} ${JSON.stringify(a1.body).slice(0, 200)})`);
  const a1again = await call({ proto: 2, op: 'act', matchId, seq, idem, action: act });
  check(JSON.stringify(a1again.body) === JSON.stringify(a1.body), 'mesmo idem → mesma resposta byte a byte');
  const stale = await call({ proto: 2, op: 'act', matchId, seq, idem: newIdem(), action: act });
  check(stale.status === 409 && stale.body.code === 'stale' && stale.body.seq === seq + 1, 'seq velho → 409 stale com o seq atual');
  seq = Number(a1.body.seq);
  view = a1.body.view as Row;

  // resume
  const res = await call({ proto: 2, op: 'resume' });
  check(res.status === 200 && res.body.matchId === matchId && res.body.seq === seq, 'resume devolve a partida ativa');
  check((res.body.tournament as Row)?.effect === db.effect, 'resume traz o tournament');
  noLeak(res, 'resume');

  // forfeit desta partida
  const ff = await call({ proto: 2, op: 'forfeit', matchId, seq });
  const ffr = ff.body.result as Row | undefined;
  check(ff.status === 200 && ffr?.status === 'forfeit', `forfeit → result forfeit (veio ${ff.status} ${JSON.stringify(ff.body).slice(0, 200)})`);
  check(typeof ffr?.seed === 'string' && createHash('sha256').update(String(ffr?.seed)).digest('hex') === seedHash, 'semente revelada bate com o seedHash');
  check(((ffr?.rewards as Row)?.stake as Row)?.kind === 'chips' && (ffr?.rewards as Row)?.poster === null, 'forfeit: rewards sem pôster, aposta em fichas');
  const ff2 = await call({ proto: 2, op: 'forfeit', matchId, seq: seq + 1 });
  check(ff2.status === 410 && ff2.body.code === 'finished', 'forfeit de novo → 410 finished');

  // partida vencida (mais de 24 h) → act devolve 410 com o resultado abandoned
  r = await start();
  check(r.status === 200, 'start 2 → 200');
  matchId = String(r.body.matchId);
  db.matches.find((m) => m.id === matchId)!.created_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const exp = await call({ proto: 2, op: 'act', matchId, seq: 1, idem: newIdem(), action: legalRandomAction(r.body.view as Row) });
  check(exp.status === 410 && (exp.body.result as Row | null)?.status === 'abandoned', `partida vencida → 410 abandoned (veio ${exp.status} ${JSON.stringify(exp.body).slice(0, 160)})`);

  // 3 entradas por dia; a terceira aposta um pôster e perde
  const lim = await start({ stake: { kind: 'poster', itemId: 12, effect: 'none' } });
  check(lim.status === 200 && ((lim.body.tournament as Row)?.stake as Row)?.kind === 'poster', 'terceira entrada abre (pôster apostado)');
  const lf = await call({ proto: 2, op: 'forfeit', matchId: String(lim.body.matchId), seq: 1 });
  check((((lf.body.result as Row)?.rewards as Row)?.stake as Row)?.lost === true && !db.posters.some((x) => x.item_id === 12), 'desistiu: o pôster apostado vai embora');
  const lim4 = await start();
  check(lim4.status === 403 && lim4.body.code === 'attempts', `4ª entrada → 403 attempts (veio ${lim4.status} ${lim4.body.code})`);

  // partidas inteiras com jogadas legais aleatórias, girando pelos 9 efeitos (cada uma num "usuário" novo)
  let finishedN = 0;
  let wins = 0;
  let maxCalls = 0;
  let hands = 0;
  const seenEffects = new Set<string>();
  let casts = 0;
  for (let k = 0; k < MATCHES; k += 1) {
    db.matches = [];
    db.grants = [];
    db.tickets = 1;
    db.effect = EFFECTS[k % EFFECTS.length];
    db.cobra = k % 4 === 0 ? 'cobra-deck-1' : null;
    const s = await start();
    if (s.status !== 200) {
      check(false, `start da partida ${k} → ${s.status} ${JSON.stringify(s.body).slice(0, 200)}`);
      continue;
    }
    check(db.tickets === 0, 'start debita 1 ficha');
    check((s.body.tournament as Row)?.cobraItem === (db.cobra !== null), 'start: cobraItem = a Cobra trouxe item (sem dizer qual)');
    const id = String(s.body.matchId);
    let sq = 1;
    let v = s.body.view as Row;
    let result: Row | undefined;
    let calls = 0;
    const allEvents: Row[] = [...(s.body.events as Row[])];
    while (!result && calls < 2000) {
      calls += 1;
      const t0 = performance.now();
      const step = await call({ proto: 2, op: 'act', matchId: id, seq: sq, idem: newIdem(), action: legalRandomAction(v) });
      times.push(performance.now() - t0);
      if (step.status !== 200) {
        check(false, `act na partida ${k} → ${step.status} ${JSON.stringify(step.body).slice(0, 300)}`);
        break;
      }
      noLeak(step, `act ${k}`);
      allEvents.push(...(step.body.events as Row[]));
      sq = Number(step.body.seq);
      v = step.body.view as Row;
      result = step.body.result as Row | undefined;
    }
    maxCalls = Math.max(maxCalls, calls);
    for (const e of allEvents) if (e.t === 'effectCast') { casts++; seenEffects.add(String(e.effect)); }
    if (result) {
      finishedN += 1;
      hands += db.matches[0].hands;
      const won = result.status === 'won';
      if (won) wins += 1;
      check(db.grants.length === (won ? 1 : 0), `partida ${k}: pôster concedido ${db.grants.length}× (venceu: ${won})`);
      check(createHash('sha256').update(String(result.seed)).digest('hex') === db.matches[0].seed_hash, `partida ${k}: semente bate`);
      check(['won', 'lost'].includes(String(result.status)), `partida ${k}: status ${result.status}`);
      check(won === (result.place === 1), `partida ${k}: won ⇔ 1º lugar`);
      check(!!result.rewards, `partida ${k}: result.rewards`);
    }
  }

  times.sort((p, q) => p - q);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
  check(seenEffects.size >= 6, `efeitos lançados nas partidas: ${[...seenEffects].join(', ')}`);
  console.log(`partidas: ${finishedN}/${MATCHES} até o fim · vitórias ${wins} · mãos/partida ${finishedN ? (hands / finishedN).toFixed(1) : '-'} · chamadas máx ${maxCalls} · ${casts} lançadas (${seenEffects.size} efeitos)`);
  console.log(`tempo por act (handler + motor + banco falso): p50 ${p50.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · máx ${(times[times.length - 1] ?? 0).toFixed(1)} ms`);
  if (failures > 0) {
    console.error(`${failures} falha(s).`);
    process.exit(1);
  }
  console.log('test-protocol: tudo certo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
