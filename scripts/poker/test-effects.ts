/**
 * Efeitos do Pôster Poker (BRIEF2, pacote E, 03/11/2026). Para cada um dos 9 efeitos joga
 * torneios determinísticos (semente fixa, pessoa com ações legais ao acaso) e confere as
 * regras contra a informação PRIVADA (cartas de todos, resultado do motor):
 *  - cronograma (1ª lançada entre firstHand, as outras ≥ gapHands depois), castNo crescente;
 *  - o que cada efeito faz (tabela do BRIEF2) e a ordem dos eventos;
 *  - bônus só para quem continua vivo, `net` do resumo com o bônus, fichas = 8.000 + bônus;
 *  - resumo (`tournament`), TableView (`tournament.active/revealed`), matchEnded sem captura;
 *  - retomada pelo JSON salvo no meio de um efeito ativo dá o mesmo log;
 *  - efeito que lança na mesma mão em que alguém é eliminado.
 *
 *   node scripts/poker/test-effects.ts [--n 60]
 */
import {
  DEFAULT_EFFECTS, HAND_KINDS, applyHumanAction, blackjackValue, createMatch, createRng, evaluateHand, getLegalActions,
  humanLegal, logHash, summarizeMatch, tableView, toPublicEvents, totalChips,
} from '../../src/lib/poker/index.ts';
import type {
  Card, HandResult, MatchEvent, MatchState, PlayerAction, PosterEffectId, PublicEvent, TableView,
} from '../../src/lib/poker/index.ts';
import { setStrictBots, applyAndProcess, startNextHand } from '../../src/lib/poker/match/runner.ts';
import { HUMAN, newCtx } from '../../src/lib/poker/match/internal.ts';
import type { MatchStateX } from '../../src/lib/poker/match/internal.ts';
import { buildBotView } from '../../src/lib/poker/bots/view.ts';
import { defaultBotChoice } from '../../src/lib/poker/bots/driver.ts';
import { ALL_EFFECTS, check, eq, finish, makeConfig, randomHumanAction, section } from './lib/harness.ts';

setStrictBots(true);
const argN = process.argv.indexOf('--n');
const N = argN > 0 ? Number(process.argv[argN + 1]) : 60;
const t0 = Date.now();

type Ev<T extends string> = Extract<MatchEvent, { type: T }>;

interface Played {
  priv: MatchEvent[];
  pub: PublicEvent[];
  views: TableView[];
  states: MatchState[];
  actions: { a: PlayerAction; show: boolean }[];
  final: MatchState;
}

function play(effect: PosterEffectId, seed: string, opts: { roundTrip?: boolean; actions?: { a: PlayerAction; show: boolean }[] } = {}): Played {
  const cfg = makeConfig({ seed, effect });
  const rng = createRng(`${seed}:h`);
  let step = createMatch(cfg);
  const priv: MatchEvent[] = [...step.events];
  const pub: PublicEvent[] = toPublicEvents(step.events, 'human');
  const views: TableView[] = [tableView(step.state, 'human')];
  const states: MatchState[] = [step.state];
  const actions: { a: PlayerAction; show: boolean }[] = [];
  let s = step.state;
  for (let k = 0; s.status === 'running' && k < 3000; k++) {
    const act = opts.actions?.[k] ?? { a: randomHumanAction(humanLegal(s)!, rng), show: rng.nextFloat() < 0.4 };
    actions.push(act);
    // Retomada: o servidor guarda o JSON e volta dele na próxima chamada.
    const from = opts.roundTrip ? (JSON.parse(JSON.stringify(s)) as MatchState) : s;
    step = applyHumanAction(from, act.a, { show: act.show });
    priv.push(...step.events);
    pub.push(...toPublicEvents(step.events, 'human'));
    views.push(tableView(step.state, 'human'));
    states.push(step.state);
    s = step.state;
  }
  return { priv, pub, views, states, actions, final: s };
}

/** Mãos do log privado, com tudo o que o teste precisa. */
interface HandLog {
  n: number;
  events: MatchEvent[];
  holes: Record<string, Card[]>;
  result: HandResult | null;
  summary: Ev<'handSummary'> | null;
  casts: Ev<'effectCast'>[];
  reveals: Ev<'effectReveal'>[];
  bonuses: Ev<'effectBonus'>[];
  tells: Ev<'tellMark'>[];
  eliminated: Ev<'eliminated'>[];
}

function hands(priv: MatchEvent[]): HandLog[] {
  const out: HandLog[] = [];
  let cur: HandLog | null = null;
  for (const e of priv) {
    if (e.type === 'handStarted') {
      cur = { n: e.handNumber, events: [], holes: {}, result: null, summary: null, casts: [], reveals: [], bonuses: [], tells: [], eliminated: [] };
      out.push(cur);
    }
    if (!cur) continue;
    cur.events.push(e);
    if (e.type === 'holeCardsDealt') for (const h of e.hands) cur.holes[h.playerId] = h.cards.slice();
    else if (e.type === 'handComplete') cur.result = e.result;
    else if (e.type === 'handSummary') cur.summary = e;
    else if (e.type === 'effectCast') cur.casts.push(e);
    else if (e.type === 'effectReveal') cur.reveals.push(e);
    else if (e.type === 'effectBonus') cur.bonuses.push(e);
    else if (e.type === 'tellMark') cur.tells.push(e);
    else if (e.type === 'eliminated') cur.eliminated.push(e);
  }
  return out;
}

/** Sobreviventes da mão (stack > 0 depois do motor). */
function survivors(r: HandResult): Set<string> {
  const out = new Set<string>();
  for (const id of Object.keys(r.startStacks)) if (!r.eliminated.some((e) => e.playerId === id)) out.add(id);
  return out;
}

function bonusOf(h: HandLog): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of h.bonuses) out[b.playerId] = (out[b.playerId] ?? 0) + b.amount;
  return out;
}

const stats: Record<string, { matches: number; casts: number; paid: number; bonus: number; hands: number; extra: Record<string, number> }> = {};
let elimInEffectHand = 0;
let humanOutInEffectHand = 0;

// ---------------------------------------------------------------------------
section('regras gerais (todas as partidas de torneio)');
const sample: Record<string, { p: Played; seed: string; at: number }> = {};
/** Primeiro passo (jogada da pessoa) com o efeito em vigor, ou -1. */
function activeDecision(p: Played): number {
  return p.views.findIndex((v, k) => k > 0 && !!v.tournament?.active && p.states[k].status === 'running');
}
for (const effect of ALL_EFFECTS) {
  const st = (stats[effect] = { matches: 0, casts: 0, paid: 0, bonus: 0, hands: 0, extra: {} });
  const P = DEFAULT_EFFECTS[effect];
  const bump = (k: string, v = 1): void => { st.extra[k] = (st.extra[k] ?? 0) + v; };
  for (let m = 0; m < N; m++) {
    const p = play(effect, `fx-${effect}-${m}`);
    if (!sample[effect] && activeDecision(p) > 0) sample[effect] = { p, seed: `fx-${effect}-${m}`, at: activeDecision(p) };
    st.matches++;
    st.hands += p.final.game.handNumber;
    const H = hands(p.priv);
    const allBonus = p.priv.filter((e): e is Ev<'effectBonus'> => e.type === 'effectBonus');
    const sumBonus = allBonus.reduce((a, b) => a + b.amount, 0);
    st.bonus += sumBonus;
    st.paid += allBonus.length;
    eq(totalChips(p.final.game), 8000 + sumBonus, `${effect}: fichas = 8.000 + bônus da casa`);
    // Passo a passo: fichas acompanham os bônus já pagos.
    let paidSoFar = 0;
    let idx = 0;
    for (let k = 0; k < p.states.length; k++) {
      // Os bônus pagos até este passo são os do log até o fim do passo k.
      while (idx < p.priv.length && p.priv[idx].i <= p.states[k].eventNo) {
        const e = p.priv[idx];
        if (e.type === 'effectBonus') paidSoFar += e.amount;
        idx++;
      }
      check(totalChips(p.states[k].game) === 8000 + paidSoFar, `${effect}: fichas no passo ${k}`);
    }
    // matchStarted com o torneio, prize null; TableView com o torneio.
    const ms = p.pub.find((e) => e.t === 'matchStarted');
    check(ms?.t === 'matchStarted' && ms.tournament?.effect === effect && ms.prize === null, `${effect}: matchStarted.tournament e prize null`);
    check(p.views.every((v) => v.tournament?.effect === effect && v.prize === null), `${effect}: TableView.tournament em todo passo`);
    const me = p.pub.find((e) => e.t === 'matchEnded');
    check(me?.t === 'matchEnded' && me.prizeCaptured === false, `${effect}: matchEnded sem captura`);
    // Lançadas.
    const casts = p.priv.filter((e): e is Ev<'effectCast'> => e.type === 'effectCast');
    st.casts += casts.length;
    check(casts.length <= P.casts, `${effect}: no máximo ${P.casts} lançadas (${casts.length})`);
    casts.forEach((c, k) => {
      eq(c.castNo, k + 1, `${effect}: castNo crescente`);
      eq(c.effect, effect, `${effect}: effectCast do efeito do torneio`);
      eq(c.data.effect, effect, `${effect}: data do efeito`);
      if (effect === 'eight_aces') return;
      if (k === 0) check(c.handNumber >= P.firstHand[0] && (effect === 'sixth_card' || c.handNumber <= P.firstHand[1]), `${effect}: 1ª lançada entre ${P.firstHand.join('–')} (mão ${c.handNumber})`);
      else check(c.handNumber - casts[k - 1].handNumber >= P.gapHands, `${effect}: ${P.gapHands}+ mãos entre lançadas (${casts[k - 1].handNumber} → ${c.handNumber})`);
    });
    // Views: casts acompanha os eventos.
    let seen = 0;
    let vi = 0;
    for (let k = 0; k < p.states.length; k++) {
      while (vi < p.priv.length && p.priv[vi].i <= p.states[k].eventNo) {
        if (p.priv[vi].type === 'effectCast') seen++;
        vi++;
      }
      eq(p.views[k].tournament?.casts, seen, `${effect}: TableView.casts = lançadas até o passo`);
    }
    // Resumo.
    if (p.final.status !== 'running') {
      const sum = summarizeMatch(p.final, { clientId: 'fx', startedAt: '2026-11-03T00:00:00Z', endedAt: '2026-11-03T00:10:00Z' });
      eq(sum.mode, 'bounty', `${effect}: resumo no modo bounty`);
      eq(sum.prize, null, `${effect}: resumo sem prize`);
      eq(sum.tournament?.casts, casts.length, `${effect}: resumo.casts`);
      eq(sum.tournament?.bonusWon, allBonus.filter((b) => b.playerId === HUMAN).reduce((a, b) => a + b.amount, 0), `${effect}: resumo.bonusWon`);
      eq(sum.tournament?.won, sum.place === 1, `${effect}: resumo.won ⇔ 1º lugar`);
    }
    for (const h of H) {
      if (!h.result || !h.summary) continue;
      const bonus = bonusOf(h);
      const alive = survivors(h.result);
      // net do resumo = net do motor + bônus; bônus só para vivos.
      for (const [id, v] of Object.entries(h.summary.net)) eq(v, (h.result.net[id] ?? 0) + (bonus[id] ?? 0), `${effect}: net de ${id} na mão ${h.n} com o bônus`);
      for (const id of Object.keys(bonus)) check(alive.has(id), `${effect}: bônus só para quem continua vivo (mão ${h.n}, ${id})`);
      if (h.bonuses.length > 0 || h.reveals.length > 0) {
        // Ordem: viradas/bônus antes do resumo e das eliminações.
        const iSum = h.summary.i;
        check([...h.bonuses, ...h.reveals].every((e) => e.i < iSum || e.type === 'effectReveal' && (e.effect === 'reveal_one')), `${effect}: bônus e viradas antes do handComplete (mão ${h.n})`);
        check(h.eliminated.every((e) => e.i > iSum), `${effect}: eliminações depois do resumo`);
      }
      const effHand = h.casts.length > 0 || h.bonuses.length > 0;
      if (effHand && h.eliminated.length > 0) {
        elimInEffectHand++;
        if (h.eliminated.some((e) => e.playerId === HUMAN)) humanOutInEffectHand++;
      }
      // Efeitos de mão: o effectCast vem logo depois do handStarted.
      for (const c of h.casts) {
        if (effect === 'sixth_card') continue;
        const k = h.events.indexOf(c);
        eq(h.events[k - 1]?.type, 'handStarted', `${effect}: effectCast logo depois do handStarted (mão ${h.n})`);
      }
    }

    // ---------------------------------------------------------------- por efeito
    switch (effect) {
      case 'early_flop': {
        for (const h of H) {
          const streets = h.events.filter((e): e is Ev<'streetDealt'> => e.type === 'streetDealt');
          const early = streets.filter((e) => e.early);
          if (h.casts.length > 0) {
            bump('earlyHands');
            eq(early.length, 1, `early_flop: um flop antecipado na mão lançada (${h.n})`);
            const k = h.events.findIndex((e) => e.type === 'holeCardsDealt');
            eq(h.events[k + 1]?.type, 'streetDealt', 'early_flop: flop logo depois das cartas fechadas');
            eq(streets.map((e) => e.street).slice(0, 2), streets.length >= 2 ? ['flop', 'turn'] : ['flop'], 'early_flop: flop → turn');
            check(!h.result || h.result.actions.every((a) => a.street !== 'flop'), 'early_flop: nenhuma ação de flop');
            // Ações do pré-flop já com o board de 3.
            const firstAct = h.events.findIndex((e) => e.type === 'actionTaken');
            check(firstAct < 0 || firstAct > h.events.indexOf(early[0]), 'early_flop: o flop vira antes da primeira aposta');
          } else {
            eq(early.length, 0, `early_flop: sem flop antecipado fora da mão lançada (${h.n})`);
          }
        }
        break;
      }
      case 'double_pot': {
        for (const h of H) {
          if (!h.result) continue;
          const bonus = bonusOf(h);
          if (h.casts.length === 0) {
            eq(h.bonuses.length, 0, 'double_pot: sem bônus fora da mão lançada');
            continue;
          }
          const won: Record<string, number> = {};
          for (const pot of h.result.pots) for (const w of pot.winners) if (w.amount > 0) won[w.playerId] = (won[w.playerId] ?? 0) + w.amount;
          const alive = survivors(h.result);
          for (const [id, v] of Object.entries(won)) if (alive.has(id)) eq(bonus[id], v, `double_pot: ${id} recebe de novo o que levou (mão ${h.n})`);
          bump('doubled', Object.values(bonus).reduce((a, b) => a + b, 0));
        }
        break;
      }
      case 'blackjack': {
        for (const h of H) {
          if (!h.result) continue;
          if (h.casts.length === 0) {
            eq(h.reveals.length + h.bonuses.length, 0, 'blackjack: nada fora da mão lançada');
            continue;
          }
          const rv = h.reveals.find((r) => r.effect === 'blackjack');
          check(!!rv, `blackjack: viradas no fim da mão (${h.n})`);
          const dealt = Object.keys(h.result.startStacks);
          eq(rv?.cards.map((c) => c.playerId).sort(), dealt.slice().sort(), 'blackjack: vira as cartas de todos que receberam cartas');
          for (const c of rv?.cards ?? []) eq(c.cards, h.holes[c.playerId], `blackjack: as 2 cartas de verdade de ${c.playerId}`);
          const alive = dealt.filter((id) => survivors(h.result!).has(id));
          const best = Math.max(...alive.map((id) => blackjackValue(h.holes[id])));
          const winners = alive.filter((id) => blackjackValue(h.holes[id]) === best).sort();
          eq(h.bonuses.map((b) => b.playerId).sort(), winners, `blackjack: quem está mais perto de 21 (${best})`);
          eq(h.bonuses.reduce((a, b) => a + b.amount, 0), DEFAULT_EFFECTS.blackjack.amount, 'blackjack: 500 no total');
          if (winners.length > 1) bump('splits');
          const k = h.events.indexOf(rv!);
          check(h.bonuses.every((b) => h.events.indexOf(b) > k), 'blackjack: bônus depois das viradas');
        }
        break;
      }
      case 'hand_bounty': {
        const cast = H.flatMap((h) => h.casts)[0];
        if (!cast || cast.data.effect !== 'hand_bounty') break;
        bump(`alvo:${cast.data.target}`);
        eq(cast.data.amount, 800, 'hand_bounty: 800 fichas');
        const target = HAND_KINDS.indexOf(cast.data.target);
        let claimed = false;
        for (const h of H) {
          if (h.n < cast.handNumber || !h.result) continue;
          const r = h.result;
          const alive = survivors(r);
          const finalists = r.wentToShowdown ? r.shown.map((x) => x.playerId) : r.winnerIds.slice();
          const scores = finalists.filter((id) => alive.has(id)).map((id) => ({ id, v: evaluateHand([...h.holes[id], ...r.board]) }))
            .filter((x) => x.v.category >= target);
          if (claimed) {
            eq(h.bonuses.length, 0, 'hand_bounty: uma vez só');
            continue;
          }
          if (scores.length === 0) {
            eq(h.bonuses.length, 0, `hand_bounty: ninguém com a jogada-alvo na mão ${h.n}`);
            continue;
          }
          const best = Math.max(...scores.map((x) => x.v.score));
          eq(h.bonuses.map((b) => b.playerId).sort(), scores.filter((x) => x.v.score === best).map((x) => x.id).sort(), `hand_bounty: o de melhor mão leva (mão ${h.n})`);
          eq(h.bonuses.reduce((a, b) => a + b.amount, 0), 800, 'hand_bounty: 800 no total');
          if (!r.wentToShowdown) {
            const rv = h.reveals.find((x) => x.effect === 'hand_bounty');
            check(!!rv && rv.cards.every((c) => JSON.stringify(c.cards) === JSON.stringify(h.holes[c.playerId])), 'hand_bounty: sem showdown, as cartas do vencedor viram');
            bump('provasSemShowdown');
          }
          claimed = true;
        }
        if (claimed) {
          const v = p.views[p.views.length - 1];
          check(v.tournament?.active === null || p.final.status !== 'running', 'hand_bounty: levado, sai de vigor');
        }
        break;
      }
      case 'eight_aces': {
        const k = p.priv.findIndex((e) => e.type === 'matchStarted');
        const c = p.priv[k + 1];
        check(c?.type === 'effectCast' && c.handNumber === 0 && c.data.effect === 'eight_aces' && c.data.added.length === 8,
          'eight_aces: lança logo depois do matchStarted com 8 ases');
        for (const s of p.states) {
          const hd = s.game.hand;
          if (!hd || s.game.phase !== 'betting') continue;
          const all = [...hd.deck, ...hd.board, ...s.game.players.flatMap((q) => q.holeCards)];
          check(all.length === 60 && all.filter((x) => x[0] === 'A').length === 12, 'eight_aces: baralho de 60 com 12 ases');
          break;
        }
        for (const h of H) {
          const sd = h.events.find((e): e is Ev<'showdown'> => e.type === 'showdown');
          for (const sh of sd?.hands ?? []) {
            const cards = [...sh.cards, ...(h.result?.board ?? [])];
            eq(sh.kind, evaluateHand(cards, { repeats: true }).kind, 'eight_aces: showdown com o avaliador de repetidas');
            if (new Set(cards).size < cards.length) bump('maosComRepetida');
            if (sh.kind === 'five_kind') bump('cincoIguais');
          }
        }
        break;
      }
      case 'reveal_one': {
        for (const h of H) {
          const rv = h.reveals.filter((r) => r.effect === 'reveal_one');
          if (h.casts.length === 0) {
            eq(rv.length, 0, 'reveal_one: nada fora da mão lançada');
            continue;
          }
          bump('maos');
          eq(rv.length, 1, 'reveal_one: uma virada por mão lançada');
          const k = h.events.findIndex((e) => e.type === 'holeCardsDealt');
          eq(h.events[k + 1]?.type, 'effectReveal', 'reveal_one: logo depois das cartas fechadas');
          eq(rv[0].cards.map((c) => c.playerId).sort(), Object.keys(h.holes).sort(), 'reveal_one: uma carta de cada um (inclusive a pessoa)');
          for (const c of rv[0].cards) check(c.cards.length === 1 && h.holes[c.playerId].includes(c.cards[0]), `reveal_one: carta de verdade de ${c.playerId}`);
        }
        break;
      }
      case 'sixth_card': {
        for (const h of H) {
          const river = h.events.find((e): e is Ev<'streetDealt'> => e.type === 'streetDealt' && e.street === 'river');
          if (h.casts.length > 0) {
            check(!!river && river.cards.length === 2 && river.board.length === 6, `sixth_card: river com 2 cartas na mão lançada (${h.n})`);
            const k = h.events.indexOf(h.casts[0]);
            eq(h.events[k + 1], river, 'sixth_card: effectCast logo antes do river');
            bump('board6');
            const sd = h.events.find((e): e is Ev<'showdown'> => e.type === 'showdown');
            for (const sh of sd?.hands ?? []) eq(sh.kind, evaluateHand([...sh.cards, ...river!.board]).kind, 'sixth_card: showdown com 8 cartas');
          } else if (river) {
            eq(river.cards.length, 1, 'sixth_card: river normal fora da lançada');
          }
        }
        break;
      }
      case 'opal': {
        const cast = H.flatMap((h) => h.casts)[0];
        if (!cast || cast.data.effect !== 'opal') break;
        eq(cast.data.amount, 1000, 'opal: 1.000 fichas');
        const opal = cast.data.card;
        let claimed = false;
        for (const h of H) {
          if (h.n < cast.handNumber || !h.result) continue;
          const holder = Object.keys(h.holes).find((id) => h.holes[id].includes(opal));
          const wins = !!holder && h.result.winnerIds.includes(holder) && survivors(h.result).has(holder);
          if (claimed || !wins) {
            eq(h.bonuses.length, 0, `opal: sem bônus na mão ${h.n}`);
            continue;
          }
          eq(h.bonuses.map((b) => [b.playerId, b.amount]), [[holder, 1000]], `opal: quem leva o pote com a opala ganha 1.000 (mão ${h.n})`);
          if (!h.result.wentToShowdown) {
            const rv = h.reveals.find((x) => x.effect === 'opal');
            eq(rv?.cards, [{ playerId: holder!, cards: [opal] }], 'opal: sem showdown, só a opala vira');
            bump('provasSemShowdown');
          }
          claimed = true;
        }
        if (claimed) bump('levadas');
        break;
      }
      case 'tell': {
        const castHands = H.filter((h) => h.casts.length > 0).map((h) => h.n);
        const inTell = (n: number): boolean => castHands.some((c) => n >= c && n < c + 3);
        for (const h of H) {
          let meta: Ev<'actionMeta'> | null = null;
          const expected: { id: string; mark: string; after: number }[] = [];
          h.events.forEach((e, k) => {
            if (e.type === 'actionMeta') meta = e;
            else if (e.type === 'actionTaken') {
              const m = meta as Ev<'actionMeta'> | null;
              if (m?.bot && (e.action === 'bet' || e.action === 'raise') && inTell(h.n)) {
                const weak = m.bot.bucket === 'weak' || m.bot.bucket === 'draw' || m.bot.bucket === 'air';
                expected.push({ id: e.playerId, mark: weak && !m.bot.monster ? 'blefe' : 'valor', after: k });
              }
              meta = null;
            }
          });
          eq(h.tells.map((t) => [t.playerId, t.mark]), expected.map((x) => [x.id, x.mark]), `tell: tique em cada aposta/aumento de oráculo (mão ${h.n})`);
          for (const x of expected) eq(h.events[x.after + 1]?.type, 'tellMark', 'tell: o tique sai logo depois da ação');
          if (inTell(h.n)) bump('maosComTique');
          for (const t of h.tells) bump(t.mark);
        }
        break;
      }
      default:
        break;
    }
  }
  console.log(`  ${effect.padEnd(12)} ${st.matches} partidas · ${(st.hands / st.matches).toFixed(1)} mãos · ${st.casts} lançadas · ${st.paid} bônus pagos (${st.bonus} fichas) · ${JSON.stringify(st.extra)}`);
}
console.log(`  efeito na mão de uma eliminação: ${elimInEffectHand} mãos (${humanOutInEffectHand} com a pessoa)`);
check(elimInEffectHand > 0, 'houve efeito na mesma mão de uma eliminação');
check(humanOutInEffectHand > 0, 'houve efeito na mão em que a pessoa caiu');
check(stats.hand_bounty.paid > 0 && stats.opal.paid > 0 && stats.blackjack.paid > 0 && stats.double_pot.paid > 0, 'os 4 efeitos com bônus pagaram');
check((stats.eight_aces.extra.maosComRepetida ?? 0) > 0, 'Cassino: houve mão com carta repetida no showdown');
check((stats.tell.extra.blefe ?? 0) > 0 && (stats.tell.extra.valor ?? 0) > 0, 'tell: houve tique de blefe e de valor');

// ---------------------------------------------------------------------------
section('retomada pelo JSON no meio de um efeito ativo');
for (const effect of ALL_EFFECTS) {
  const smp = sample[effect];
  check(!!smp, `${effect}: houve jogada da pessoa com o efeito em vigor`);
  if (!smp) continue;
  const a = smp.p;
  const b = play(effect, smp.seed, { roundTrip: true, actions: a.actions });
  eq(logHash(b.priv), logHash(a.priv), `${effect}: mesmo log com ida e volta pelo JSON a cada jogada (${smp.seed})`);
  eq(JSON.stringify(b.final), JSON.stringify(a.final), `${effect}: mesmo estado final`);
  const restored = JSON.parse(JSON.stringify(a.states[smp.at])) as MatchState;
  eq(tableView(restored, 'human'), a.views[smp.at], `${effect}: TableView igual depois de retomar (active/revealed)`);
  console.log(`  ${effect}: retomada no passo ${smp.at} (${JSON.stringify(a.views[smp.at].tournament?.active)})`);
}

// ---------------------------------------------------------------------------
section('cartas na mesa: os bots enxergam a carta virada');
{
  let checked = 0;
  for (let m = 0; m < 30 && checked < 40; m++) {
    const cfg = makeConfig({ seed: `fx-view-${m}`, effect: 'reveal_one' });
    const ctx = newCtx(createMatch(cfg).state);
    const rng = createRng(`fx-view-h-${m}`);
    for (let guard = 0; guard < 4000 && ctx.st.status === 'running' && ctx.st.game.phase !== 'gameOver'; guard++) {
      const g = ctx.st.game;
      if (g.phase !== 'betting') {
        startNextHand(ctx);
        continue;
      }
      const to = g.hand!.toActId!;
      if (to === HUMAN) {
        applyAndProcess(ctx, HUMAN, randomHumanAction(getLegalActions(g, HUMAN)!, rng), null);
        continue;
      }
      const st = ctx.st as MatchStateX;
      if (st.fx?.revealed?.hand === g.handNumber) {
        const v = buildBotView(st, to);
        for (const r of st.fx.revealed.cards) {
          if (r.playerId === to) continue;
          const p = g.players.find((q) => q.id === r.playerId)!;
          if (p.status !== 'active' && p.status !== 'allIn') continue;
          check(JSON.stringify(v.shownThisHand[r.playerId]) === JSON.stringify(r.cards), `BotView de ${to} tem a carta virada de ${r.playerId}`);
          check(v.shownThisHand[r.playerId].length >= 1, 'carta parcial no shownThisHand');
        }
        checked++;
      }
      const choice = defaultBotChoice(st, to);
      applyAndProcess(ctx, to, choice.action, choice);
    }
  }
  check(checked > 0, `decisões de bot conferidas com carta virada (${checked})`);
}

// ---------------------------------------------------------------------------
section('fora do torneio não há efeito');
{
  for (let m = 0; m < 20; m++) {
    for (const mode of ['free', 'bounty'] as const) {
      const cfg = makeConfig({ mode, seed: `fx-none-${mode}-${m}` });
      let step = createMatch(cfg);
      const rng = createRng(`fx-none-h-${m}`);
      const evs: MatchEvent[] = [...step.events];
      while (step.state.status === 'running') {
        step = applyHumanAction(step.state, randomHumanAction(humanLegal(step.state)!, rng));
        evs.push(...step.events);
      }
      check(!evs.some((e) => e.type.startsWith('effect') || e.type === 'tellMark'), `${mode}: nenhum evento de efeito`);
      check(!(step.state as MatchStateX).fx, `${mode}: sem estado de efeito`);
      eq(tableView(step.state, 'human').tournament, null, `${mode}: TableView.tournament = null`);
    }
  }
}

console.log(`\n  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
finish();
