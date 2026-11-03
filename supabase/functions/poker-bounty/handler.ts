/**
 * poker-bounty — a lógica da partida com prêmio (SPEC §4.7), sem Deno nem rede.
 *
 * 03/11/2026 (tarde, pacote F — Pôster Poker, proto 2): o prêmio do dia virou o
 * TORNEIO DA SEMANA. O start leva `week`, `prizeId` e `stake` (fichas ou um
 * pôster da coleção apostado) e chama poker_tournament_prepare/open; a partida
 * nasce com `prize: null` e `tournament` (o efeito do pôster, a raridade e se a
 * Cobra trouxe item — o item em si nunca sai do servidor antes do fim). O fim
 * (1º lugar → pôster gold + item da Cobra; senão perde o pôster apostado) é
 * decidido no banco (poker_bounty_step → poker_tournament_settle), que devolve
 * `rewards` na resposta final.
 *
 * 03/11/2026 (pacote C): o index.ts cuida de HTTP, CORS e do uid (auth.getUser);
 * aqui só entra o corpo já lido, o uid e as dependências (rpc com a service
 * role e o relógio). Assim o mesmo código roda no Deno (Edge) e no Node
 * (scripts/poker/test-protocol.ts, com um banco falso).
 *
 * Segurança: o uid nunca vem do corpo; cartas, bots, semente, débito da ficha
 * e prêmio ficam todos no servidor; o aparelho recebe só eventos públicos e a
 * TableView. A semente aparece só no fim (commit-reveal: seedHash desde o start).
 */
import { PokerRuleError } from './_engine/engine.ts';
import type { PlayerAction } from './_engine/engine.ts';
import { DEFAULT_DIFFICULTY, DEFAULT_SETTINGS } from './_engine/config.ts';
import { DEFAULT_PROFILES, mergeProfile } from './_engine/bots/profile.ts';
import {
  abandonMatch,
  applyHumanAction,
  createMatch,
  forfeitMatch,
  outcomeOf,
  summarizeMatch,
  tableView,
  toPublicEvents,
} from './_engine/match/match.ts';
import type {
  BotProfile,
  DifficultyRow,
  MatchConfig,
  MatchOutcome,
  MatchState,
  MatchStep,
  OppCounters,
  PlayerId,
  PokerSettings,
  PosterEffectId,
  PublicEvent,
  Rarity,
  RivalId,
  TableView,
  TournamentConfig,
} from './_engine/types.ts';
import { ENGINE_HASH } from './_engine/ENGINE_HASH.ts';

export interface Deps {
  /** Chama uma RPC poker_bounty_* com a service role. Erro do banco → lança. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Agora, em ISO (o resumo usa para a duração). */
  nowIso(): string;
}

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

type Row = Record<string, unknown>;

const SEATS: Record<PlayerId, number> = { human: 0, bogart: 1, fincher: 2, cypher: 3 };
const STATE_VERSION = 1;
// Protocolo deste handler. Um start de proto 1 (o prêmio do dia, sem week/stake) não
// tem como ser lido: responde 426 antes de qualquer cobrança. O mínimo de verdade
// mora em poker_settings.min_proto (o prepare/open também conferem).
const PROTO = 2;
const RECENT_STALE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PRIZE_RE = /^[a-z0-9-]{2,48}$/;
const POSTER_EFFECTS: readonly PosterEffectId[] = [
  'early_flop', 'double_pot', 'blackjack', 'hand_bounty', 'eight_aces', 'reveal_one', 'sixth_card', 'opal', 'tell',
];
// Efeitos de pôster da coleção que podem ir de aposta (o banco recusa gold e exclusivos).
const STAKE_EFFECTS = ['none', 'holo', 'negative', 'ultra_red', 'gold'];
// Campos numéricos de EffectParams que o banco pode sobrepor (poker_settings.effects).
const EFFECT_INT_KEYS = ['casts', 'gapHands', 'amount', 'hands', 'spread'];

const asRow = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);
const ok = (body: Row): Reply => ({ status: 200, body: { ok: true, ...body } });
const fail = (status: number, code: string, extra: Row = {}): Reply => ({ status, body: { ok: false, code, ...extra } });
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function hex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/** Semente de 128 bits do servidor (nunca do aparelho). */
function newSeed(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return hex(b);
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hex(new Uint8Array(d));
}

/** A jogada da pessoa, com a forma exata do motor (nada a mais passa). */
function parseAction(v: unknown): PlayerAction | null {
  const a = asRow(v);
  if (!a || typeof a.type !== 'string') return null;
  switch (a.type) {
    case 'fold':
    case 'check':
    case 'call':
    case 'allIn':
      return { type: a.type };
    case 'bet':
    case 'raise':
      return isInt(a.amount) && a.amount > 0 && a.amount <= 1_000_000 ? { type: a.type, amount: a.amount } : null;
    default:
      return null;
  }
}

/**
 * poker_settings.effects → PokerSettings.effects (só ids e campos conhecidos, inteiros
 * dentro de limites). Vazio/torto = undefined: valem os DEFAULT_EFFECTS do motor.
 */
function effectsFrom(raw: unknown): PokerSettings['effects'] | undefined {
  const fx = asRow(raw);
  if (!fx) return undefined;
  const out: Record<string, Record<string, unknown>> = {};
  for (const id of POSTER_EFFECTS) {
    const row = asRow(fx[id]);
    if (!row) continue;
    const p: Record<string, unknown> = {};
    for (const k of EFFECT_INT_KEYS) {
      const v = row[k];
      if (isInt(v) && v >= 0 && v <= 100_000) p[k] = v;
    }
    const fh = row.firstHand;
    if (Array.isArray(fh) && fh.length === 2 && fh.every((n) => isInt(n) && n >= 0 && n <= 500) && fh[0] <= fh[1]) {
      p.firstHand = [fh[0], fh[1]];
    }
    if (Object.keys(p).length > 0) out[id] = p;
  }
  return Object.keys(out).length > 0 ? (out as PokerSettings['effects']) : undefined;
}

function settingsFrom(raw: unknown): PokerSettings {
  const s = asRow(raw);
  if (!s) return DEFAULT_SETTINGS;
  const levels = Array.isArray(s.levels) && s.levels.length > 0 ? (s.levels as [number, number, number][]) : DEFAULT_SETTINGS.levels;
  const effects = effectsFrom(s.effects);
  return {
    startStack: isInt(s.start_stack) ? s.start_stack : DEFAULT_SETTINGS.startStack,
    handsPerLevel: isInt(s.hands_per_level) ? s.hands_per_level : DEFAULT_SETTINGS.handsPerLevel,
    levels,
    loanAmount: isInt(s.loan_amount) ? s.loan_amount : DEFAULT_SETTINGS.loanAmount,
    maxAttempts: isInt(s.max_attempts) ? s.max_attempts : DEFAULT_SETTINGS.maxAttempts,
    carrierByRarity: (asRow(s.carrier_by_rarity) as PokerSettings['carrierByRarity'] | null) ?? DEFAULT_SETTINGS.carrierByRarity,
    difficulty: (asRow(s.difficulty) as PokerSettings['difficulty'] | null) ?? DEFAULT_SETTINGS.difficulty,
    ...(effects ? { effects } : {}),
  };
}

/** A aposta do start: {kind:'chips'} | {kind:'poster', itemId, effect} → o formato do banco. */
function parseStake(v: unknown): Row | null {
  const st = asRow(v);
  if (!st) return null;
  if (st.kind === 'chips') return { kind: 'chips' };
  if (st.kind === 'poster' && isInt(st.itemId) && st.itemId > 0 && st.itemId < 1_000_000
      && typeof st.effect === 'string' && STAKE_EFFECTS.includes(st.effect)) {
    return { kind: 'poster', item_id: st.itemId, effect: st.effect };
  }
  return null;
}

/** A aposta do banco ({kind, amount} | {kind, item_id, effect}) no formato do protocolo. */
function apiStake(v: unknown): Row | null {
  const st = asRow(v);
  if (!st) return null;
  if (st.kind === 'chips') return { kind: 'chips', amount: isInt(st.amount) ? st.amount : 0 };
  if (st.kind === 'poster') return { kind: 'poster', itemId: st.item_id, effect: st.effect };
  return null;
}

/** Perfis = padrão do código + poker_bot_params (filtrado por LIMITS). Congelados na partida. */
function profilesFrom(raw: unknown): { profiles: Record<RivalId, BotProfile>; versions: Record<RivalId, number> } {
  const params = asRow(raw) ?? {};
  const profiles: Record<RivalId, BotProfile> = {} as Record<RivalId, BotProfile>;
  const versions: Record<RivalId, number> = {} as Record<RivalId, number>;
  for (const id of Object.keys(DEFAULT_PROFILES) as (keyof typeof DEFAULT_PROFILES)[]) {
    const row = asRow(params[id]);
    profiles[id] = row ? mergeProfile(DEFAULT_PROFILES[id], row.params) : DEFAULT_PROFILES[id];
    versions[id] = row && isInt(row.version) ? row.version : 1;
  }
  return { profiles, versions };
}

const COUNTER_KEYS = ['hands', 'vpip', 'pfr', 'nCbetFaced', 'foldToCbet', 'postBets', 'postCalls',
  'riverBetsShown', 'riverBluffsShown', 'pfShoves'] as const;
const RAW_KEYS = ['hands', 'cbetFaced', 'riverBetsShown'] as const;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

function countersFrom(v: unknown, scale: number): OppCounters | null {
  const c = asRow(v);
  if (!c) return null;
  const raw = asRow(c.raw) ?? {};
  const out = { raw: {} } as OppCounters;
  for (const k of COUNTER_KEYS) out[k] = Math.round(num(c[k]) * scale * 1000) / 1000;
  for (const k of RAW_KEYS) out.raw[k] = Math.floor(num(raw[k]) * scale);
  return out;
}

/** Memória do Raposo vinda do banco (já reduzida a 30% no fim da partida anterior). */
function memoryFrom(raw: unknown): Record<PlayerId, OppCounters> | null {
  const m = asRow(raw);
  if (!m) return null;
  const out: Record<string, OppCounters> = {};
  for (const id of Object.keys(SEATS)) {
    const c = countersFrom(m[id], 1);
    if (c) out[id] = c;
  }
  return Object.keys(out).length > 0 ? (out as Record<PlayerId, OppCounters>) : null;
}

/**
 * O que fica para a próxima partida: os contadores do Raposo × 0,3 (§3.5).
 * 03/11/2026: feito aqui porque a camada de partida ainda não expõe um ajudante;
 * se o pacote A criar um, este passa a chamá-lo.
 */
function foxMemory(s: MatchState): Record<string, OppCounters> | null {
  const model = s.bots?.fincher?.model;
  if (!model) return null;
  const out: Record<string, OppCounters> = {};
  for (const [id, c] of Object.entries(model)) {
    const scaled = countersFrom(c, 0.3);
    if (scaled) out[id] = scaled;
  }
  return out;
}

function aliveCount(s: MatchState): number {
  return s.game.players.filter((p) => p.status !== 'eliminated').length;
}

/** O seedHash vai no matchStarted (commit). */
function withSeedHash(events: PublicEvent[], seedHash: string): PublicEvent[] {
  return events.map((e) => (e.t === 'matchStarted' ? { ...e, seedHash } : e));
}

function tail(v: unknown, n: number): unknown[] {
  return Array.isArray(v) ? v.slice(-n) : [];
}

// ---------------------------------------------------------------------------
// Um passo salvo no banco (act, forfeit, abandono)
// ---------------------------------------------------------------------------

interface Loaded {
  id: string;
  status: string;
  seq: number;
  last_idem: string | null;
  last_response: Row | null;
  state: MatchState;
  public_view: TableView;
  events_tail: PublicEvent[];
  seed: string;
  seed_hash: string;
  created_at: string;
  result: Row | null;
  expired: boolean;
  prize: Row | null;
  carrier: string;
  stars: number;
  loan: boolean;
  rarity: string;
  // Pôster Poker (null nas partidas da fase 1).
  week: string | null;
  effect_id: string | null;
  tournament_prize: Row | null;
  stake: Row | null;
  stake_status: string | null;
  cobra_item: boolean;
  rewards: Row | null;
  attempts_used: number | null;
  max_attempts: number | null;
}

async function load(deps: Deps, uid: string, matchId: string | null): Promise<Loaded | null> {
  const m = asRow(await deps.rpc('poker_bounty_load', { p_uid: uid, p_match_id: matchId }));
  return m ? (m as unknown as Loaded) : null;
}

async function saveStep(
  deps: Deps,
  uid: string,
  m: Loaded,
  prev: MatchState,
  step: MatchStep,
  humanAction: Row | null,
  idem: string | null,
): Promise<Reply> {
  const out: MatchOutcome = outcomeOf(prev, step.state);
  const pub = toPublicEvents(step.events, 'human');
  const view = tableView(step.state, 'human');
  // A parte do resultado que só o motor sabe; o banco completa com marcos, título e prêmio.
  const result = out.finished
    ? {
        status: out.finished.status,
        place: out.finished.place,
        prizeCaptured: step.state.capturedHand !== null,
        seed: m.seed,
        seedHash: m.seed_hash,
      }
    : undefined;
  const response: Row = { ok: true, seq: m.seq + 1, events: pub, view, ...(result ? { result } : {}) };
  let finished: Row | null = null;
  if (out.finished) {
    const summary = summarizeMatch(step.state, { clientId: m.id, startedAt: m.created_at, endedAt: deps.nowIso() });
    summary.engineHash = ENGINE_HASH;
    finished = { ...out.finished, summary, model: foxMemory(step.state) };
  }
  const saved = asRow(
    await deps.rpc('poker_bounty_step', {
      p_uid: uid,
      p_match_id: m.id,
      p_expected_seq: m.seq,
      p_state: step.state,
      p_public_view: view,
      p_events_append: pub,
      p_human_action: humanAction,
      p_idem: idem,
      p_response: response,
      p_hands: step.state.game.handNumber,
      p_alive_count: aliveCount(step.state),
      p_captured: out.captured ?? null,
      p_finished: finished,
    }),
  );
  if (!saved || saved.ok !== true) {
    const code = typeof saved?.code === 'string' ? saved.code : 'stale';
    if (code === 'not_found') return fail(404, 'not_found');
    if (code === 'finished') return fail(410, 'finished', { result: saved?.result ?? null });
    if (code === 'bad_request') return fail(500, 'server_error');
    return fail(409, 'stale', { seq: saved?.seq, view: saved?.view, recent: tail(saved?.recent, RECENT_STALE) });
  }
  return { status: 200, body: (asRow(saved.response) ?? response) as Row };
}

/** Partida parada há mais de 24 h: vira 'abandoned' com o motor (resumo completo). */
async function abandonExpired(deps: Deps, uid: string, m: Loaded): Promise<Row | null> {
  const step = abandonMatch(m.state);
  const r = await saveStep(deps, uid, m, m.state, step, { seq: m.seq, abandon: true }, null);
  // 200: o resultado acabou de ser gravado; 410: outra chamada (ou o cron) chegou antes.
  return asRow(r.body.result) ?? null;
}

/** O que o banco mandou junto do código de erro (prize, matchId, day…), sem os campos internos. */
function extraOf(r: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) if (k !== 'ok' && k !== 'status' && k !== 'code' && k !== 'expired') out[k] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Operações
// ---------------------------------------------------------------------------

/** O bloco `tournament` das respostas de start e resume (sem o item da Cobra: só se há um). */
function tournamentInfo(m: {
  week: unknown; prize: unknown; effect: unknown; rarity: unknown; cobraItem: boolean; stake: unknown;
  stakeStatus?: unknown; attemptsUsed: unknown; maxAttempts: unknown;
}): Row {
  return {
    week: m.week,
    prize: m.prize ?? null,
    effect: m.effect,
    rarity: m.rarity,
    cobraItem: m.cobraItem,
    stake: apiStake(m.stake),
    ...(m.stakeStatus !== undefined ? { stakeStatus: m.stakeStatus } : {}),
    attemptsUsed: m.attemptsUsed ?? null,
    maxAttempts: m.maxAttempts ?? null,
  };
}

async function opResume(body: Row, uid: string, deps: Deps, duplicate = false): Promise<Reply> {
  const matchId = body.matchId;
  if (matchId !== undefined && (typeof matchId !== 'string' || !UUID_RE.test(matchId))) return fail(400, 'bad_request');
  let m = await load(deps, uid, typeof matchId === 'string' ? matchId : null);
  if (!m) return fail(404, 'none');
  if (m.status === 'active' && m.expired) {
    await abandonExpired(deps, uid, m);
    m = (await load(deps, uid, m.id)) ?? m;
  }
  const loan = isInt(m.state?.config?.loan) ? m.state.config.loan : m.loan ? DEFAULT_SETTINGS.loanAmount : 0;
  const isTournament = typeof m.week === 'string';
  return ok({
    ...(duplicate ? { duplicate: true } : {}),
    matchId: m.id,
    seq: m.seq,
    seedHash: m.seed_hash,
    prize: m.prize,
    carrier: isTournament ? null : m.carrier,
    stars: m.stars,
    loan,
    view: m.public_view,
    recent: tail(m.events_tail, 60),
    ...(isTournament
      ? {
          tournament: tournamentInfo({
            week: m.week,
            prize: m.tournament_prize,
            effect: m.effect_id,
            rarity: m.rarity,
            cobraItem: m.cobra_item === true,
            stake: m.stake,
            stakeStatus: m.stake_status,
            attemptsUsed: m.attempts_used,
            maxAttempts: m.max_attempts,
          }),
        }
      : {}),
    ...(m.status !== 'active' && m.result ? { result: m.result } : {}),
    ...(m.status !== 'active' && isTournament && m.rewards ? { rewards: m.rewards } : {}),
  });
}

async function opStart(body: Row, uid: string, deps: Deps, retry: number): Promise<Reply> {
  if ((body.proto as number) < PROTO) return fail(426, 'update_required', { min_proto: PROTO });
  const week = body.week;
  const prizeId = body.prizeId;
  if (typeof week !== 'string' || !DAY_RE.test(week) || typeof prizeId !== 'string' || !PRIZE_RE.test(prizeId)) {
    return fail(400, 'bad_request');
  }
  const idem = body.idem;
  if (idem !== undefined && (typeof idem !== 'string' || !UUID_RE.test(idem))) return fail(400, 'bad_request');
  const stake = parseStake(body.stake);
  if (!stake) return fail(400, 'stake_invalid', { reason: 'bad' });

  const prep = asRow(
    await deps.rpc('poker_tournament_prepare', {
      p_uid: uid, p_week: week, p_prize_id: prizeId, p_stake: stake, p_proto: body.proto, p_idem: idem ?? null,
    }),
  );
  if (!prep) return fail(500, 'server_error');
  if (prep.ok !== true) {
    const code = String(prep.code ?? 'server_error');
    // O mesmo start de novo (rede): a partida já aberta, sem cobrar outra vez.
    if (code === 'duplicate' && typeof prep.matchId === 'string') return opResume({ matchId: prep.matchId }, uid, deps, true);
    // Partida esquecida há mais de 24 h (o cron ainda não passou): encerra e tenta de novo.
    if (code === 'active_exists' && prep.expired === true && retry === 0) {
      const m = await load(deps, uid, typeof prep.matchId === 'string' ? prep.matchId : null);
      if (m && m.status === 'active') await abandonExpired(deps, uid, m);
      return opStart(body, uid, deps, retry + 1);
    }
    return fail(isInt(prep.status) ? prep.status : 500, code, extraOf(prep));
  }

  const rarity = String(prep.rarity) as Rarity;
  const effect = String(prep.effect_id) as PosterEffectId;
  if (!POSTER_EFFECTS.includes(effect)) return fail(500, 'server_error');
  // Interno: vai para o open e nunca para o aparelho (o segredo da Cobra).
  const cobraItemId = typeof prep.cobra_item_id === 'string' ? prep.cobra_item_id : null;
  const seed = newSeed();
  const seedHash = await sha256Hex(seed);
  const settings = settingsFrom(prep.settings);
  const { profiles, versions } = profilesFrom(prep.bot_params);
  const difficulty = (asRow(prep.difficulty) as DifficultyRow | null) ?? settings.difficulty[rarity] ?? DEFAULT_DIFFICULTY[rarity];
  const loan = isInt(prep.loan) ? prep.loan : 0;
  const tournament: TournamentConfig = { prizeId: String(prep.prize_id), rarity, effect, cobraItem: cobraItemId !== null };
  const cfg: MatchConfig = {
    mode: 'bounty',
    seed,
    settings,
    seats: { ...SEATS },
    profiles,
    paramsVersion: versions,
    difficulty,
    loan,
    // Torneio: sem portador nem captura; quem vence a mesa leva o pôster (o banco concede).
    prize: null,
    memory: memoryFrom(prep.memory),
    tournament,
  };
  const step = createMatch(cfg);
  const events = withSeedHash(toPublicEvents(step.events, 'human'), seedHash);
  const view = tableView(step.state, 'human');

  const opened = asRow(
    await deps.rpc('poker_tournament_open', {
      p_uid: uid,
      p_week: prep.week,
      p_day: prep.day,
      p_attempt: prep.attempt,
      p_prize_id: prep.prize_id,
      p_rarity: prep.rarity,
      p_effect_id: prep.effect_id,
      p_loan: loan,
      p_stake: prep.stake,
      p_cobra_item_id: cobraItemId,
      p_idem: idem ?? null,
      p_seed: seed,
      p_seed_hash: seedHash,
      p_engine_hash: ENGINE_HASH,
      p_state_version: STATE_VERSION,
      p_proto: body.proto,
      p_params_version: versions,
      p_state: step.state,
      p_public_view: view,
      p_events_tail: events,
    }),
  );
  if (!opened) return fail(500, 'server_error');
  if (opened.ok !== true) {
    const code = String(opened.code ?? 'server_error');
    if (code === 'duplicate' && typeof opened.matchId === 'string') return opResume({ matchId: opened.matchId }, uid, deps, true);
    // Algo mudou entre o prepare e o open (tentativa, empréstimo, preço, aposta): refaz uma vez.
    if (code === 'state_changed' && retry === 0) return opStart(body, uid, deps, retry + 1);
    return fail(isInt(opened.status) ? opened.status : 500, code, extraOf(opened));
  }
  return ok({
    matchId: opened.match_id,
    seq: 1,
    seedHash,
    attempt: prep.attempt,
    loan,
    prize: prep.prize,
    carrier: null,
    stars: prep.stars,
    events,
    view,
    tickets: opened.tickets,
    tournament: tournamentInfo({
      week: prep.week,
      prize: prep.tournament_prize,
      effect,
      rarity,
      cobraItem: cobraItemId !== null,
      stake: opened.stake,
      attemptsUsed: opened.attempts_used,
      maxAttempts: opened.max_attempts,
    }),
  });
}

async function opAct(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { matchId, seq, idem } = body;
  if (typeof matchId !== 'string' || !UUID_RE.test(matchId) || !isInt(seq) || typeof idem !== 'string' || !UUID_RE.test(idem)) {
    return fail(400, 'bad_request');
  }
  const action = parseAction(body.action);
  if (!action) return fail(400, 'bad_request');
  const m = await load(deps, uid, matchId);
  if (!m) return fail(404, 'not_found');
  if (m.status !== 'active') return fail(410, 'finished', { result: m.result });
  if (m.expired) return fail(410, 'finished', { result: await abandonExpired(deps, uid, m) });
  // Repetição de rede: a mesma resposta, byte a byte.
  if (seq === m.seq - 1 && idem === m.last_idem && m.last_response) return { status: 200, body: m.last_response };
  if (seq !== m.seq) return fail(409, 'stale', { seq: m.seq, view: m.public_view, recent: tail(m.events_tail, RECENT_STALE) });
  let step: MatchStep;
  try {
    step = applyHumanAction(m.state, action, { show: body.show === true });
  } catch (e) {
    if (e instanceof PokerRuleError) return fail(422, 'illegal', { view: m.public_view });
    throw e;
  }
  return saveStep(deps, uid, m, m.state, step, { seq: m.seq, action, show: body.show === true }, idem);
}

async function opForfeit(body: Row, uid: string, deps: Deps): Promise<Reply> {
  const { matchId, seq } = body;
  if (typeof matchId !== 'string' || !UUID_RE.test(matchId) || !isInt(seq)) return fail(400, 'bad_request');
  const m = await load(deps, uid, matchId);
  if (!m) return fail(404, 'not_found');
  if (m.status !== 'active') return fail(410, 'finished', { result: m.result });
  if (seq !== m.seq) return fail(409, 'stale', { seq: m.seq, view: m.public_view, recent: tail(m.events_tail, RECENT_STALE) });
  const step = forfeitMatch(m.state);
  const r = await saveStep(deps, uid, m, m.state, step, { seq: m.seq, forfeit: true }, null);
  if (r.status !== 200) return r;
  return ok({ result: r.body.result ?? null });
}

/** Entrada única: corpo já lido (JSON), uid do token. */
export async function handle(raw: unknown, uid: string, deps: Deps): Promise<Reply> {
  const body = asRow(raw);
  if (!body || !isInt(body.proto) || body.proto < 1) return fail(400, 'bad_request');
  const t0 = performance.now();
  try {
    switch (body.op) {
      case 'start':
        return await opStart(body, uid, deps, 0);
      case 'act':
        return await opAct(body, uid, deps);
      case 'forfeit':
        return await opForfeit(body, uid, deps);
      case 'resume':
        return await opResume(body, uid, deps);
      default:
        return fail(400, 'bad_request');
    }
  } catch (e) {
    // Nada foi gravado (o passo só grava no fim, numa transação). Inclui o corte
    // de 200 decisões de bot por chamada (bot_decision_limit).
    console.error('poker-bounty', body.op, e instanceof Error ? e.message : e);
    return fail(500, 'server_error');
  } finally {
    // Meta do §4.7: ≤ 300 ms por chamada (tempo total, com o banco). Acima disso, fica no log.
    const ms = Math.round(performance.now() - t0);
    if (ms > 300) console.warn('poker-bounty lento', body.op, `${ms} ms`);
  }
}
