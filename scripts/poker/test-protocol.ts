/**
 * Teste do protocolo da Edge poker-bounty (SPEC §4.7) sem rede: o handler.ts de
 * verdade, com a camada de partida de verdade (cópia em _engine/), contra um
 * banco FALSO em memória que imita as RPCs poker_bounty_prepare/open/load/step.
 * (As RPCs reais foram testadas no Postgres com blocos revertidos.)
 *
 * Rodar (depois de node scripts/sync-poker-engine.mjs):
 *   node scripts/poker/test-protocol.ts [--matches 20]
 *
 * Confere: proto 0 → 426 sem débito · sem ficha → 402 · start · segundo start →
 * active_exists · seq velho → 409 · mesmo idem → mesma resposta byte a byte ·
 * jogada ilegal → 422 · partidas até o fim com jogadas legais aleatórias
 * (captura uma vez só, semente revelada bate com o seedHash) · resume ·
 * forfeit · partida vencida (24 h) → 410 com 'abandoned' · nada privado nas
 * respostas · tempo por chamada.
 *
 * 03/11/2026 (pacote C). Sai com 1 se algo falhar.
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
// Banco falso
// ---------------------------------------------------------------------------

interface FakeMatch {
  id: string; user_id: string; day: string; attempt: number; prize_id: string; carrier: string; rarity: string;
  loan: boolean; status: string; place: number | null; captured_hand: number | null; seed: string; seed_hash: string;
  state: Row; public_view: Row; events_tail: unknown[]; human_actions: unknown[]; seq: number;
  last_idem: string | null; last_response: Row | null; hands: number; alive_count: number; result: Row | null;
  created_at: string; summary: Row | null;
}

const TODAY = '2026-11-03';
const PRIZE = { id: 'poster-8-none', kind: 'poster', rarity: 'common', name_pt: 'Pôster', name_en: 'Poster', payload: {} };

class FakeDb {
  tickets = 0;
  ageOk = true;
  matches: FakeMatch[] = [];
  grants: { ref: string; day: string }[] = [];
  minProto = 1;
  private n = 0;

  private active(uid: string) {
    return this.matches.find((m) => m.user_id === uid && m.status === 'active');
  }

  private check(uid: string, day: string, prizeId: string): Row {
    if (!this.ageOk) return { ok: false, status: 403, code: 'age_required' };
    if (day !== TODAY) return { ok: false, status: 409, code: 'stale_day', day: TODAY };
    const a = this.active(uid);
    if (a) return { ok: false, status: 409, code: 'active_exists', matchId: a.id, expired: Date.parse(a.created_at) < Date.now() - 86400000 };
    if (this.matches.some((m) => m.user_id === uid && m.day === day && m.captured_hand !== null)) return { ok: false, status: 403, code: 'won_today' };
    const used = this.matches.filter((m) => m.user_id === uid && m.day === day && m.status !== 'void').length;
    if (used >= 3) return { ok: false, status: 403, code: 'limit' };
    if (prizeId !== PRIZE.id) return { ok: false, status: 409, code: 'prize_changed', prize: PRIZE };
    return { ok: true, attempt: used + 1, prize_id: PRIZE.id, rarity: 'common', carrier: 'bogart', stars: 1, loan: 0 };
  }

  rpc = async (fn: string, a: Row): Promise<unknown> => {
    const uid = String(a.p_uid);
    switch (fn) {
      case 'poker_bounty_prepare': {
        if (Number(a.p_proto ?? 0) < this.minProto) return { ok: false, status: 426, code: 'update_required' };
        const c = this.check(uid, String(a.p_day), String(a.p_prize_id));
        if (c.ok !== true) return c;
        if (this.tickets < 1) return { ok: false, status: 402, code: 'no_chips' };
        return { ...c, prize: PRIZE, settings: null, bot_params: { bogart: { version: 1, params: {} } }, memory: null,
                 difficulty: { stars: 1, epsilonMul: 1.3, adaptDelay: 16 }, min_proto: 1, tickets: this.tickets };
      }
      case 'poker_bounty_open': {
        const c = this.check(uid, String(a.p_day), String(a.p_prize_id));
        if (c.ok !== true) return c;
        if (c.attempt !== a.p_attempt) return { ok: false, status: 409, code: 'state_changed' };
        const hash = createHash('sha256').update(String(a.p_seed)).digest('hex');
        if (hash !== a.p_seed_hash) return { ok: false, status: 400, code: 'bad_request' };
        if (this.tickets < 1) return { ok: false, status: 402, code: 'no_chips' };
        this.tickets -= 1;
        this.n += 1;
        const id = `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`;
        this.matches.push({
          id, user_id: uid, day: String(a.p_day), attempt: Number(a.p_attempt), prize_id: String(a.p_prize_id),
          carrier: String(a.p_carrier), rarity: String(a.p_rarity), loan: Number(a.p_loan) > 0, status: 'active', place: null,
          captured_hand: null, seed: String(a.p_seed), seed_hash: String(a.p_seed_hash), state: a.p_state as Row,
          public_view: a.p_public_view as Row, events_tail: (a.p_events_tail as unknown[]).slice(-60), human_actions: [],
          seq: 1, last_idem: null, last_response: null, hands: 0, alive_count: 4, result: null,
          created_at: new Date().toISOString(), summary: null,
        });
        return { ok: true, match_id: id, seq: 1, attempt: a.p_attempt, tickets: this.tickets };
      }
      case 'poker_bounty_load': {
        const m = this.matches.find((x) => x.user_id === uid && (a.p_match_id ? x.id === a.p_match_id : x.status === 'active'));
        if (!m) return null;
        // Ida e volta pelo "banco": JSON, como no Postgres (jsonb).
        return JSON.parse(JSON.stringify({ ...m, prize: PRIZE, stars: 1, expired: m.status === 'active' && Date.parse(m.created_at) < Date.now() - 86400000 }));
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
        const cap = a.p_captured as Row | null;
        if (cap && m.captured_hand === null) {
          if (!this.grants.some((g) => g.ref === m.id)) this.grants.push({ ref: m.id, day: m.day });
          m.captured_hand = Number(cap.hand);
        }
        const fin = a.p_finished as Row | null;
        if (fin) {
          if (fin.status === 'won' && m.captured_hand === null) {
            if (!this.grants.some((g) => g.ref === m.id)) this.grants.push({ ref: m.id, day: m.day });
            m.captured_hand = m.hands;
          }
          m.status = String(fin.status);
          m.place = Number(fin.place);
          m.summary = fin.summary as Row;
          const result = { ...((response.result as Row) ?? {}), status: m.status, place: m.place, prizeCaptured: m.captured_hand !== null,
                           seed: m.seed, seedHash: m.seed_hash, marks: [], title: { wins: 0, id: 'figurante', rankUp: false } };
          response = { ...response, result };
          m.result = result;
        }
        m.last_response = JSON.parse(JSON.stringify(response));
        return { ok: true, seq: m.seq, response, result: m.result, captured: m.captured_hand !== null };
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

const FORBIDDEN_KEYS = /^(eq|equity|strength|bucket|range|percentile|handClass|score|deck|rng|model|memory|tally|bots|state)$/i;

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
  const MATCHES = argN > 0 ? Number(process.argv[argN + 1]) : 10;
  const db = new FakeDb();
  const deps: Deps = { rpc: db.rpc, nowIso: () => new Date().toISOString() };
  const call = (body: Row) => handle(body, UID, deps);
  const times: number[] = [];

  // sem ficha → 402, nada aberto
  db.tickets = 0;
  const r402 = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  check(r402.status === 402 && r402.body.code === 'no_chips' && db.matches.length === 0, 'sem ficha → 402 no_chips');
  const rPrize = await call({ proto: 1, op: 'start', day: TODAY, prizeId: 'fichas-2' });
  check(rPrize.status === 409 && rPrize.body.code === 'prize_changed' && !!rPrize.body.prize, 'prêmio trocado → 409 prize_changed {prize}');

  // 426 antes de qualquer cobrança
  db.tickets = 5;
  let r = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  db.minProto = 2;
  const before = db.tickets;
  const r426 = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  db.minProto = 1;
  check(r426.status === 426 && r426.body.code === 'update_required', 'proto abaixo do mínimo → 426');
  check(db.tickets === before, '426 não debita');
  // (o start acima abriu a partida 1; o segundo start bate em active_exists)
  check(r.status === 200, `start → 200 (veio ${r.status} ${JSON.stringify(r.body).slice(0, 200)})`);
  noLeak(r, 'start');
  const r2 = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  check(r2.status === 409 && r2.body.code === 'active_exists', 'segundo start → 409 active_exists');
  check(db.tickets === 4, 'um débito só');

  const bad = await call({ proto: 0, op: 'start', day: TODAY, prizeId: PRIZE.id });
  check(bad.status === 400, 'proto 0 → 400 bad_request');

  let matchId = String(r.body.matchId);
  let seq = Number(r.body.seq);
  let view = r.body.view as Row;
  const seedHash = String(r.body.seedHash);
  check((r.body.events as Row[]).some((e) => e.t === 'matchStarted' && e.seedHash === seedHash), 'matchStarted leva o seedHash');

  // jogada ilegal
  const ill = await call({ proto: 1, op: 'act', matchId, seq, idem: newIdem(), action: { type: 'raise', amount: 1 } });
  check(ill.status === 422 && ill.body.code === 'illegal', `jogada ilegal → 422 (veio ${ill.status} ${ill.body.code})`);

  // jogada válida + repetição de rede (mesmo idem) + seq velho
  const idem = newIdem();
  const act = legalRandomAction(view);
  const a1 = await call({ proto: 1, op: 'act', matchId, seq, idem, action: act });
  check(a1.status === 200, `act → 200 (veio ${a1.status} ${JSON.stringify(a1.body).slice(0, 200)})`);
  const a1again = await call({ proto: 1, op: 'act', matchId, seq, idem, action: act });
  check(JSON.stringify(a1again.body) === JSON.stringify(a1.body), 'mesmo idem → mesma resposta byte a byte');
  const stale = await call({ proto: 1, op: 'act', matchId, seq, idem: newIdem(), action: act });
  check(stale.status === 409 && stale.body.code === 'stale' && stale.body.seq === seq + 1, 'seq velho → 409 stale com o seq atual');
  seq = Number(a1.body.seq);
  view = a1.body.view as Row;

  // resume
  const res = await call({ proto: 1, op: 'resume' });
  check(res.status === 200 && res.body.matchId === matchId && res.body.seq === seq, 'resume devolve a partida ativa');
  noLeak(res, 'resume');

  // forfeit desta partida
  const ff = await call({ proto: 1, op: 'forfeit', matchId, seq });
  const ffr = ff.body.result as Row | undefined;
  check(ff.status === 200 && ffr?.status === 'forfeit', `forfeit → result forfeit (veio ${ff.status} ${JSON.stringify(ff.body).slice(0, 200)})`);
  check(typeof ffr?.seed === 'string' && createHash('sha256').update(String(ffr?.seed)).digest('hex') === seedHash, 'semente revelada bate com o seedHash');
  const ff2 = await call({ proto: 1, op: 'forfeit', matchId, seq: seq + 1 });
  check(ff2.status === 410 && ff2.body.code === 'finished', 'forfeit de novo → 410 finished');

  // partida vencida (mais de 24 h) → act devolve 410 com o resultado abandoned
  r = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  check(r.status === 200, 'start 2 → 200');
  matchId = String(r.body.matchId);
  db.matches.find((m) => m.id === matchId)!.created_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  const exp = await call({ proto: 1, op: 'act', matchId, seq: 1, idem: newIdem(), action: legalRandomAction(r.body.view as Row) });
  check(exp.status === 410 && (exp.body.result as Row | null)?.status === 'abandoned', `partida vencida → 410 abandoned (veio ${exp.status} ${JSON.stringify(exp.body).slice(0, 160)})`);

  // limite de 3 tentativas
  const lim = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  check(lim.status === 200, 'terceira tentativa abre');
  await call({ proto: 1, op: 'forfeit', matchId: String(lim.body.matchId), seq: 1 });
  const lim4 = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
  check(lim4.status === 403 && lim4.body.code === 'limit', '4ª tentativa → 403 limit');
  const stale_day = await call({ proto: 1, op: 'start', day: '2026-11-02', prizeId: PRIZE.id });
  check(stale_day.status === 409 && stale_day.body.code === 'stale_day', 'outro dia → 409 stale_day');

  // partidas inteiras com jogadas legais aleatórias (cada uma num "usuário" novo do banco falso)
  let finishedN = 0;
  let captures = 0;
  let maxCalls = 0;
  let hands = 0;
  for (let k = 0; k < MATCHES; k += 1) {
    db.matches = [];
    db.grants = [];
    db.tickets = 1;
    const s = await call({ proto: 1, op: 'start', day: TODAY, prizeId: PRIZE.id });
    if (s.status !== 200) {
      check(false, `start da partida ${k} → ${s.status} ${JSON.stringify(s.body).slice(0, 200)}`);
      continue;
    }
    check(db.tickets === 0, 'start debita 1 ficha');
    const id = String(s.body.matchId);
    let sq = 1;
    let v = s.body.view as Row;
    let result: Row | undefined;
    let calls = 0;
    while (!result && calls < 2000) {
      calls += 1;
      const t0 = performance.now();
      const step = await call({ proto: 1, op: 'act', matchId: id, seq: sq, idem: newIdem(), action: legalRandomAction(v) });
      times.push(performance.now() - t0);
      if (step.status !== 200) {
        check(false, `act na partida ${k} → ${step.status} ${JSON.stringify(step.body).slice(0, 300)}`);
        break;
      }
      noLeak(step, `act ${k}`);
      sq = Number(step.body.seq);
      v = step.body.view as Row;
      result = step.body.result as Row | undefined;
    }
    maxCalls = Math.max(maxCalls, calls);
    if (result) {
      finishedN += 1;
      hands += db.matches[0].hands;
      if (result.prizeCaptured) captures += 1;
      check(db.grants.length === (result.prizeCaptured ? 1 : 0), `partida ${k}: prêmio concedido ${db.grants.length}× (capturou: ${result.prizeCaptured})`);
      check(createHash('sha256').update(String(result.seed)).digest('hex') === db.matches[0].seed_hash, `partida ${k}: semente bate`);
      check(['won', 'lost'].includes(String(result.status)), `partida ${k}: status ${result.status}`);
      check((result.status === 'won') === (result.place === 1), `partida ${k}: won ⇔ 1º lugar`);
    }
  }

  times.sort((p, q) => p - q);
  const p50 = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
  console.log(`partidas: ${finishedN}/${MATCHES} até o fim · capturas ${captures} · mãos/partida ${finishedN ? (hands / finishedN).toFixed(1) : '-'} · chamadas máx ${maxCalls}`);
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
