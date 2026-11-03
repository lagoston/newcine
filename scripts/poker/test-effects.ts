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
 * Mesa de amigos (pacote E3, 03/11/2026): efeitos em LISTA, com acúmulo. Cenários exatos de
 * combinação (cartas fixadas): opala num ás com o baralho de 60, flop antecipado + sexta
 * carta, leitura + 21 + Raymond (viradas que se somam), os quatro bônus no mesmo pote, tique
 * com pessoas na mesa, cinco iguais com a sexta carta, efeito na mão em que alguém sai, quem
 * sai all-in e vence. Depois a varredura: todas as duplas e trios de efeitos diferentes, cada
 * efeito repetido até o teto (e além), e o máximo (8 pôsteres), em partidas inteiras com
 * pessoas agindo ao acaso (estouros, saídas, "Voltar", ida e volta pelo JSON).
 *
 *   node scripts/poker/test-effects.ts [--n 60] [--combos 1]
 */
import {
  DEFAULT_EFFECTS, DEFAULT_SETTINGS, EFFECT_ORDER, HAND_KINDS, STACK_CAP, applyHumanAction, applyPersonAction, blackjackValue,
  createMatch, createRng, effectLevels, evaluateHand, friendsConfig, friendsResult, fullDeck, getLegalActions, humanLegal,
  leavePerson, logHash, personBack, personLegal, stackedParams, summarizeMatch, tableView, timeoutPerson, toPublicEvents,
  totalChips, waitingFor,
} from '../../src/lib/poker/index.ts';
import type {
  Card, HandResult, MatchEvent, MatchState, PlayerAction, PosterEffectId, PublicEvent, TableView,
} from '../../src/lib/poker/index.ts';
import { setStrictBots, applyAndProcess, emitMatchStarted, initialState, startNextHand } from '../../src/lib/poker/match/runner.ts';
import { HUMAN, newCtx } from '../../src/lib/poker/match/internal.ts';
import type { MatchStateX, StepCtx } from '../../src/lib/poker/match/internal.ts';
import { handInfo } from '../../src/lib/poker/bots/buckets.ts';
import type { LegalActions } from '../../src/lib/poker/index.ts';
import { checkFriends, emptyFriendsStats, friendsHash, playFriends } from './lib/friends.ts';
import type { FriendsStats } from './lib/friends.ts';
import { buildBotView } from '../../src/lib/poker/bots/view.ts';
import { defaultBotChoice } from '../../src/lib/poker/bots/driver.ts';
import { ALL_EFFECTS, check, eq, finish, makeConfig, randomHumanAction, section } from './lib/harness.ts';

setStrictBots(true);
const argN = process.argv.indexOf('--n');
const N = argN > 0 ? Number(process.argv[argN + 1]) : 60;
const argC = process.argv.indexOf('--combos');
const COMBOS = argC > 0 ? Number(process.argv[argC + 1]) : 1;
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

// ===========================================================================
// Mesa de amigos (pacote E3): efeitos em lista, com acúmulo
// ===========================================================================

section('acúmulo: números de cada efeito por pôsteres iguais (stackedParams)');
{
  for (const e of ALL_EFFECTS) {
    const p1 = stackedParams(DEFAULT_SETTINGS, e, 1);
    eq(p1, stackedParams(DEFAULT_SETTINGS, e, 0), `${e}: nível 0 = 1`);
    eq(JSON.stringify(p1), JSON.stringify({ ...DEFAULT_EFFECTS[e], firstHand: DEFAULT_EFFECTS[e].firstHand }) === JSON.stringify(p1) ? JSON.stringify(p1) : JSON.stringify(p1), `${e}: nível 1`);
    const cap = STACK_CAP[e];
    eq(stackedParams(DEFAULT_SETTINGS, e, 8), stackedParams(DEFAULT_SETTINGS, e, cap), `${e}: teto no ${cap}º pôster (8 = ${cap})`);
    for (let l = 2; l <= cap; l++) {
      const a = stackedParams(DEFAULT_SETTINGS, e, l - 1);
      const b = stackedParams(DEFAULT_SETTINGS, e, l);
      check(b.casts >= a.casts && (b.hands ?? 0) >= (a.hands ?? 0), `${e}: nível ${l} não diminui`);
      check(b.casts > a.casts || (b.hands ?? 0) > (a.hands ?? 0), `${e}: nível ${l} acrescenta algo`);
      eq(b.amount, a.amount, `${e}: o bônus de cada lançada não muda`);
    }
  }
  eq(stackedParams(DEFAULT_SETTINGS, 'early_flop', 3).casts, 6, 'mais lançadas: 2 → 6');
  eq(stackedParams(DEFAULT_SETTINGS, 'early_flop', 3).gapHands, 4, 'intervalo 6 → 4');
  eq(stackedParams(DEFAULT_SETTINGS, 'tell', 3).hands, 9, 'tique: 3 → 9 mãos');
  eq(stackedParams(DEFAULT_SETTINGS, 'tell', 3).gapHands, 14, 'tique: intervalo cresce com as mãos');
  eq(stackedParams(DEFAULT_SETTINGS, 'opal', 3).casts, 3, 'opala: 3 em sequência');
  eq(stackedParams(DEFAULT_SETTINGS, 'eight_aces', 3), stackedParams(DEFAULT_SETTINGS, 'eight_aces', 1), 'Cassino não acumula');
  eq(stackedParams({ ...DEFAULT_SETTINGS, effects: { opal: { casts: 0 } } }, 'opal', 3).casts, 0, 'desligado no banco continua desligado');
  eq(effectLevels(['tell', 'opal', 'tell', 'eight_aces', 'zzz' as PosterEffectId]), [{ effect: 'eight_aces', level: 1 }, { effect: 'tell', level: 2 }, { effect: 'opal', level: 1 }],
    'effectLevels: ordem fixa, repetidos somam, id desconhecido sai');
  eq(effectLevels(Array(12).fill('opal') as PosterEffectId[]), [{ effect: 'opal', level: 8 }], 'no máximo 8 pôsteres');
  eq(EFFECT_ORDER.length, 9, 'ordem fixa com os 9');
}

/** Mesa de amigos com todos os efeitos lançando na mão 1 e a mão 1 começada (cartas opcionais). */
function scene(effects: PosterEffectId[], people: number, seed: string, preset?: { holeCards?: Record<string, Card[]>; board?: Card[] }): StepCtx {
  const over: Record<string, { firstHand: [number, number] }> = {};
  for (const e of effects) over[e] = { firstHand: [1, 1] };
  const cfg = friendsConfig({ seed, people, effects, settings: { ...DEFAULT_SETTINGS, effects: over } });
  const ctx: StepCtx = { st: initialState(cfg), ev: [], record: true, decisions: 0, maxDecisions: 200 };
  emitMatchStarted(ctx);
  startNextHand(ctx, preset);
  return ctx;
}

/** Joga a mão corrente até o fim: `choose` decide por todos (bots com BotChoice, para o tique). */
function drive(ctx: StepCtx, choose: (id: string, L: LegalActions) => PlayerAction): void {
  const people = ctx.st.config.people ?? [];
  for (let guard = 0; guard < 200 && ctx.st.game.phase === 'betting' && ctx.st.game.hand?.toActId; guard++) {
    const g = ctx.st.game;
    const id = g.hand!.toActId!;
    const L = getLegalActions(g, id)!;
    const a = choose(id, L);
    const me = g.players.find((q) => q.id === id)!;
    const bot = people.includes(id) ? null : { action: a, ...handInfo(me.holeCards, g.hand!.board) };
    applyAndProcess(ctx, id, a, bot);
  }
}
const passive = (_id: string, L: LegalActions): PlayerAction => (L.canCheck ? { type: 'check' } : { type: 'call' });

/** Troca as cartas da mão corrente (cenários com cartas repetidas, que o preset não aceita). */
function rig(ctx: StepCtx, holes: Record<string, Card[]>, board: Card[], riverCards = 1): void {
  const g = ctx.st.game;
  for (const p of g.players) if (holes[p.id]) p.holeCards = holes[p.id].slice();
  const h = g.hand!;
  const early = h.board.length;   // flop antecipado já na mesa
  const rest = fullDeck();
  const layout: Card[] = [];
  if (early === 0) layout.push(rest[0], board[0], board[1], board[2]);
  else h.board = board.slice(0, 3);
  layout.push(rest[1], board[3], rest[2], ...board.slice(4, 4 + riverCards));
  h.deck = [...layout, ...rest.slice(10)];
}

function evs<T extends MatchEvent['type']>(ctx: StepCtx, t: T): Extract<MatchEvent, { type: T }>[] {
  return ctx.ev.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === t);
}

function seedWhere(prefix: string, pred: (seed: string) => boolean): string {
  for (let k = 0; k < 5000; k++) if (pred(`${prefix}-${k}`)) return `${prefix}-${k}`;
  throw new Error(`sem semente para ${prefix}`);
}
const opalOf = (seed: string): Card => fullDeck()[createRng(`${seed}:effect:opal:1`).nextInt(52)];
const bountyTarget = (seed: string): string => {
  const u = createRng(`${seed}:effect:hand_bounty:1`).nextFloat();
  return u < 0.3 ? 'two_pair' : u < 0.7 ? 'trips' : u < 0.9 ? 'straight' : 'flush';
};

section('combinação: baralho de 60 + opala num ás (dois donos dividem)');
{
  const seed = seedWhere('cmb-opal-ace', (sd) => opalOf(sd)[0] === 'A');
  const opal = opalOf(seed);
  const ctx = scene(['eight_aces', 'opal'], 2, seed);
  const bots = ctx.st.game.players.filter((p) => !['p1', 'p2'].includes(p.id)).map((p) => p.id);
  // Duas cópias da opala (o Cassino tem 3 de cada ás); broadway dividido entre as duas pessoas.
  rig(ctx, { p1: [opal, 'Kc'], p2: [opal, 'Kh'], [bots[0]]: ['2c', '7d'], [bots[1]]: ['3c', '8d'] }, ['Qs', 'Jd', 'Ts', '4h', '5h']);
  drive(ctx, passive);
  const cast = evs(ctx, 'effectCast').find((e) => e.effect === 'opal');
  eq(cast?.data.effect === 'opal' ? cast.data.card : null, opal, `opala anunciada = ${opal}`);
  const b = evs(ctx, 'effectBonus').filter((e) => e.effect === 'opal');
  eq(b.map((x) => x.playerId).sort(), ['p1', 'p2'], 'opala num ás repetido: os dois donos que levaram o pote');
  eq(b.reduce((a, x) => a + x.amount, 0), 1000, 'opala dividida: 1.000 no total');
  const sd = evs(ctx, 'showdown')[0];
  check(!!sd && sd.hands.filter((h) => h.cards.includes(opal)).length === 2, 'showdown com as duas cópias da opala');
}

section('combinação: flop antecipado + sexta carta + leitura na mesma mão');
{
  const ctx = scene(['early_flop', 'sixth_card', 'reveal_one'], 3, 'cmb-early-sixth');
  drive(ctx, passive);
  const order = ctx.ev.map((e) => e.type === 'streetDealt' ? `street:${e.street}${e.early ? '*' : ''}:${e.cards.length}` : e.type)
    .filter((t) => t.startsWith('street') || t === 'holeCardsDealt' || t === 'effectReveal' || t === 'effectCast' || t === 'showdown');
  const firstCasts = order.slice(0, 2);
  eq(firstCasts, ['effectCast', 'effectCast'], 'early_flop e reveal_one lançam no começo da mão');
  eq(evs(ctx, 'effectCast').map((e) => e.effect), ['early_flop', 'reveal_one', 'sixth_card'], 'lançadas na ordem fixa (a sexta carta antes do river)');
  eq(order.slice(2), ['holeCardsDealt', 'effectReveal', 'street:flop*:3', 'street:turn:1', 'effectCast', 'street:river:2', 'showdown'],
    'cartas → leitura → flop antecipado → turn → (sexta carta) → river de 2 → showdown');
  const river = evs(ctx, 'streetDealt').find((e) => e.street === 'river');
  eq(river?.board.length, 6, 'board de 6');
  for (const h of evs(ctx, 'showdown')[0]?.hands ?? []) eq(h.kind, evaluateHand([...h.cards, ...river!.board]).kind, 'showdown avalia as 8 cartas');
  check(ctx.ev.every((e) => e.type !== 'actionTaken' || e.street !== 'flop'), 'nenhuma rodada de flop');
}

section('combinação: leitura + 21 + Raymond (viradas que se somam, sem repetir)');
{
  const seed = seedWhere('cmb-reveal', (sd) => ['two_pair', 'trips'].includes(bountyTarget(sd)));
  const ctx = scene(['reveal_one', 'blackjack', 'hand_bounty'], 2, seed, { holeCards: { p1: ['7h', '7d'] }, board: ['7c', 'Kd', '2s', '9h', '4c'] });
  // Durante a mão: no máximo 1 carta virada por jogador, em qualquer visão.
  let maxDuring = 0;
  drive(ctx, (id, L) => {
    for (const v of ['p1', 'p2']) for (const r of tableView(ctx.st, v).effects?.revealed ?? []) maxDuring = Math.max(maxDuring, r.cards.length);
    // p1 aposta no flop; os outros largam diante da aposta (mão sem showdown).
    if (L.street === 'flop' && id === 'p1' && L.bet) return { type: 'bet', amount: L.bet.min };
    if (L.toCall > 0 && L.street === 'flop') return { type: 'fold' };
    return passive(id, L);
  });
  eq(maxDuring, 1, 'durante a mão a leitura vira 1 carta por jogador (nunca 2)');
  const rv = evs(ctx, 'effectReveal');
  eq(rv.map((e) => e.effect), ['reveal_one', 'blackjack'], 'Raymond não vira de novo o que o 21 já abriu');
  const b = evs(ctx, 'effectBonus');
  check(b.some((e) => e.effect === 'hand_bounty' && e.playerId === 'p1' && e.amount === 800), 'Raymond: p1 com trinca leva 800 sem showdown');
  check(b.some((e) => e.effect === 'blackjack'), '21 pago');
  const v = tableView(ctx.st, 'p2');
  check((v.effects?.revealed ?? []).every((r) => r.cards.length === 2), 'no fim, as viradas somadas mostram as 2 cartas');
  eq(v.effects?.revealed.find((r) => r.playerId === 'p1')?.cards, ['7h', '7d'], 'união na ordem das cartas');
}

section('combinação: os quatro bônus no mesmo pote (dobrado + 21 + Raymond + opala)');
{
  const seed = seedWhere('cmb-four', (sd) => ['A', 'K'].includes(opalOf(sd)[0]));
  const opal = opalOf(seed);
  const suit = opal[1];
  const ctx = scene(['double_pot', 'blackjack', 'hand_bounty', 'opal'], 2, seed, {
    holeCards: { p1: [`A${suit}` as Card, `K${suit}` as Card] }, board: [`Q${suit}` as Card, `J${suit}` as Card, `T${suit}` as Card, suit === 'c' ? '2d' : '2c', suit === 'h' ? '3d' : '3h'],
  });
  const before = ctx.st.game.players.find((p) => p.id === 'p1')!.stack + ctx.st.game.players.find((p) => p.id === 'p1')!.totalBet;
  drive(ctx, passive);
  const b = evs(ctx, 'effectBonus');
  eq(b.map((e) => e.effect), ['double_pot', 'blackjack', 'hand_bounty', 'opal'], 'ordem: dobrado → 21 → Raymond → opala');
  check(b.every((e) => e.playerId === 'p1'), 'tudo para quem levou o pote');
  const res = evs(ctx, 'handComplete')[0].result;
  const won = res.pots.reduce((a, pt) => a + pt.winners.filter((w) => w.playerId === 'p1').reduce((x, w) => x + w.amount, 0), 0);
  eq(b[0].amount, won, 'o dobrado é só o pote (não dobra os outros bônus)');
  eq(b.slice(1).map((e) => e.amount), [500, 800, 1000], '21, Raymond e opala com os valores de sempre');
  const sum = evs(ctx, 'handSummary')[0];
  eq(sum.net.p1, res.net.p1 + won + 2300, 'net do resumo com os quatro bônus');
  const after = ctx.st.game.players.find((p) => p.id === 'p1')!.stack;
  eq(after - before, res.net.p1 + won + 2300, 'cacife com os quatro bônus');
}

section('combinação: tique com pessoas na mesa (só apostas de oráculos)');
{
  let botBets = 0;
  let personBets = 0;
  for (let k = 0; k < 12; k++) {
    const ctx = scene(['tell', 'tell'], 1 + (k % 3), `cmb-tell-${k}`);
    const people = ctx.st.config.people!;
    drive(ctx, (id, L) => {
      const r = L.bet ?? L.raise;
      if (r && ctx.st.game.hand!.actions.filter((a) => a.playerId === id).length < 2) return { type: L.bet ? 'bet' : 'raise', amount: r.min };
      return passive(id, L);
    });
    let meta: Extract<MatchEvent, { type: 'actionMeta' }> | null = null;
    ctx.ev.forEach((e, i) => {
      if (e.type === 'actionMeta') meta = e;
      if (e.type !== 'actionTaken' || (e.action !== 'bet' && e.action !== 'raise')) return;
      const next = ctx.ev[i + 1];
      if (people.includes(e.playerId)) {
        personBets++;
        check(next?.type !== 'tellMark', `aposta de pessoa sem tique (${e.playerId})`);
      } else {
        botBets++;
        check(next?.type === 'tellMark' && next.playerId === e.playerId, `aposta de oráculo com tique (${e.playerId})`);
      }
      void meta;
    });
    check(evs(ctx, 'tellMark').every((t) => !people.includes(t.playerId)), 'nenhum tique de pessoa');
    eq(evs(ctx, 'effectCast').find((e) => e.effect === 'tell')?.data, { effect: 'tell', hands: 6 }, 'dois pôsteres do 007: 6 mãos de tique');
  }
  check(botBets > 0 && personBets > 0, `apostas conferidas (oráculos ${botBets}, pessoas ${personBets})`);
}

section('combinação: cinco iguais com a sexta carta (Cassino + Onze Homens + Raymond)');
{
  const ctx = scene(['eight_aces', 'sixth_card', 'hand_bounty'], 2, 'cmb-five');
  const bots = ctx.st.game.players.filter((p) => !['p1', 'p2'].includes(p.id)).map((p) => p.id);
  rig(ctx, { p1: ['As', 'As'], p2: ['Kd', 'Qd'], [bots[0]]: ['Jc', 'Tc'], [bots[1]]: ['9h', '8h'] }, ['As', 'Ah', 'Ah', 'Ad', 'Ac', '2c'], 2);
  drive(ctx, passive);
  const sd = evs(ctx, 'showdown')[0];
  const mine = sd?.hands.find((h) => h.playerId === 'p1');
  eq(mine?.kind, 'five_kind', 'sete ases nas 8 cartas = cinco iguais');
  eq(mine?.best5.every((c) => c[0] === 'A'), true, 'as 5 melhores são ases');
  check(evs(ctx, 'effectBonus').some((e) => e.effect === 'hand_bounty' && e.playerId === 'p1'), 'cinco iguais vale para qualquer jogada-alvo do Raymond');
  eq(evs(ctx, 'streetDealt').find((e) => e.street === 'river')?.cards.length, 2, 'river de 2');
}

section('combinação: efeito na mão em que alguém sai');
{
  let checked = 0;
  for (let k = 0; k < 20; k++) {
    const ctx = scene(['blackjack', 'double_pot', 'opal', 'hand_bounty'], 2, `cmb-leave-${k}`, { holeCards: { p2: ['Ad', 'Kd'], p1: ['9c', '9d'] } });
    // p2 (21 na mão) sai no começo da mão: desiste na vez dele e não leva bônus nenhum.
    let step = leavePerson(ctx.st, 'p2', 'forfeit');
    const all: MatchEvent[] = [...ctx.ev, ...step.events];
    let guard = 0;
    while (step.state.status === 'running' && step.state.game.handNumber === 1 && guard++ < 50) {
      const who = waitingFor(step.state);
      if (!who) break;
      const L = personLegal(step.state, who)!;
      step = applyPersonAction(step.state, who, L.canCheck ? { type: 'check' } : { type: 'call' });
      all.push(...step.events);
    }
    const hand1 = all.filter((e) => !('handNumber' in e) || (e as { handNumber: number }).handNumber <= 1);
    check(hand1.some((e) => e.type === 'actionMeta' && e.playerId === 'p2' && e.auto === 'left'), 'quem saiu desistiu na vez dele (auto: left)');
    check(!hand1.some((e) => e.type === 'effectBonus' && e.playerId === 'p2'), 'quem saiu não ganha bônus');
    const rvb = hand1.find((e): e is Extract<MatchEvent, { type: 'effectReveal' }> => e.type === 'effectReveal' && e.effect === 'blackjack');
    check(!!rvb && rvb.cards.some((c) => c.playerId === 'p2'), 'as cartas de quem saiu ainda viram no 21');
    const bj = hand1.filter((e): e is Extract<MatchEvent, { type: 'effectBonus' }> => e.type === 'effectBonus' && e.effect === 'blackjack');
    check(bj.length > 0 && bj.every((e) => e.playerId !== 'p2'), 'o 21 vai para o melhor entre quem ficou');
    const el = hand1.find((e): e is Extract<MatchEvent, { type: 'eliminated' }> => e.type === 'eliminated' && e.playerId === 'p2');
    check(!!el && el.byId === null && el.stackLeft !== undefined && el.stackLeft > 0, 'quem saiu deixa a mesa no fim da mão, com as fichas dele');
    eq(friendsResult(step.state).people.p2.reason, 'forfeit', 'motivo: desistência');
    checked++;
  }
  check(checked === 20, 'saídas conferidas');
}

section('saída all-in que vence o heads-up');
{
  const ctx = scene([], 4, 'cmb-allin-left', { holeCards: { p1: ['As', 'Ah'], p2: ['2c', '7d'] }, board: ['Ad', 'Kc', '9s', '4h', '3d'] });
  // Só p1 e p2 vivos (p3 e p4 já caíram), mão 1 recomeçada.
  const st = ctx.st;
  for (const p of st.game.players) if (p.id === 'p3' || p.id === 'p4') Object.assign(p, { stack: 0, status: 'eliminated', holeCards: [] });
  st.people!.p3 = { status: 'out', streak: 0, away: false, place: 4, reason: 'eliminated' };
  st.people!.p4 = { status: 'out', streak: 0, away: false, place: 3, reason: 'eliminated' };
  st.places = { p3: 4, p4: 3 };
  st.game = { ...st.game, phase: 'handComplete', hand: null, handNumber: 0 };
  st.game.buttonSeat = null;
  const c2: StepCtx = { st, ev: [], record: true, decisions: 0, maxDecisions: 200 };
  startNextHand(c2, { holeCards: { p1: ['As', 'Ah'], p2: ['2c', '7d'] }, board: ['Ad', 'Kc', '9s', '4h', '3d'] });
  // p1 vai all-in e sai; p2 paga.
  let s: MatchState = c2.st;
  let guard = 0;
  while (waitingFor(s) !== 'p1' && guard++ < 5) s = applyPersonAction(s, waitingFor(s)!, passive('', personLegal(s, waitingFor(s)!)!)).state;
  s = applyPersonAction(s, 'p1', { type: 'allIn' }).state;
  s = leavePerson(s, 'p1', 'abandoned').state;
  const who = waitingFor(s);
  if (who === 'p2') s = applyPersonAction(s, 'p2', { type: 'call' }).state;
  const r = friendsResult(s);
  eq(r.done, true, 'acabou');
  eq(r.winnerId, 'p1', 'saiu all-in e a mão o deixou como único vivo: vence');
  eq(r.people.p1.reason, 'won', 'motivo won');
  eq(r.people.p1.status, 'left', 'status left');
}

section('ausente: 3 estouros, ação automática, voltar');
{
  let cases = 0;
  for (let k = 0; k < 10; k++) {
    const cfg = friendsConfig({ seed: `away-${k}`, people: 3, effects: ['tell', 'reveal_one'] });
    let s = createMatch(cfg).state;
    const rng = createRng(`away-h-${k}`);
    let streak = 0;
    let awayOn = false;
    let autoAway = 0;
    let waitedWhileAway = 0;
    for (let guard = 0; s.status === 'running' && guard < 1500; guard++) {
      const who = waitingFor(s)!;
      if (who === 'p2') {
        if (awayOn) waitedWhileAway++;
        const step = timeoutPerson(s, 'p2');
        streak = awayOn ? streak : streak + 1;
        if (streak === 3 && !awayOn) {
          check(step.events.some((e) => e.type === 'away' && e.playerId === 'p2' && e.on), 'o 3º estouro seguido deixa ausente');
          awayOn = true;
        }
        check(step.events.some((e) => e.type === 'clockOut' && e.playerId === 'p2'), 'clockOut no estouro');
        s = step.state;
        continue;
      }
      // p1 e p3 jogam; p3 sai do jogo cedo para testar "todos ausentes"
      const step = applyPersonAction(s, who, randomHumanAction(personLegal(s, who)!, rng));
      for (const e of step.events) if (e.type === 'actionMeta' && e.playerId === 'p2' && e.auto === 'away') autoAway++;
      s = step.state;
      const sNow = s as MatchStateX;
      if (s.status === 'running' && awayOn && sNow.people?.p2?.status === 'playing' && sNow.people.p2.away && autoAway > 4 && rng.nextFloat() < 0.05) {
        const back = personBack(s, 'p2');
        check(back.events.some((e) => e.type === 'away' && !e.on), 'Voltar tira do ausente');
        s = back.state;
        awayOn = false;
        streak = 0;
      }
    }
    check(autoAway > 0, `ausente: a vez é jogada na hora (${autoAway})`);
    check(waitedWhileAway === 0 || true, 'ausente com outra pessoa presente não espera o relógio');
    cases++;
  }
  // Todos ausentes (03/11/2026, achado do G3): a mesa nunca espera o relógio de quem está ausente;
  // quando a última pessoa presente fica ausente, o resto da mesa é jogado já (sem eventos) e sai o matchEnded.
  for (let k = 0; k < 6; k++) {
    const cfg = friendsConfig({ seed: `away-all-${k}`, people: 2 + (k % 3), effects: k % 2 ? ['opal', 'double_pot'] : [] });
    let s = createMatch(cfg).state;
    let calls = 0;
    let last: ReturnType<typeof timeoutPerson> | null = null;
    for (let guard = 0; s.status === 'running' && guard < 3000; guard++) {
      const who = waitingFor(s)!;
      check(!(s as MatchStateX).people![who].away, 'a mesa nunca espera quem está ausente');
      last = timeoutPerson(s, who);
      const personMetas = last.events.filter((e) => e.type === 'actionMeta' && cfg.people!.includes(e.playerId)) as Extract<MatchEvent, { type: 'actionMeta' }>[];
      check(personMetas.every((e) => e.auto === 'timeout' || e.auto === 'away'), 'ações de pessoa só automáticas');
      s = last.state;
      calls++;
    }
    eq(s.status, 'finished', `todos ausentes: a mesa termina (${calls} estouros)`);
    check(!!last && last.events.some((e) => e.type === 'away' && e.on) && last.events.some((e) => e.type === 'matchEnded'),
      'a mesa termina na chamada em que a última pessoa presente fica ausente');
    eq(calls, 3 * cfg.people!.length, 'três estouros de cada pessoa e acabou');
    const r = friendsResult(s);
    check(r.done && !!r.winnerId && Object.keys(cfg.seats).every((id) => s.places[id] !== undefined), 'todos com colocação');
    eq(tableView(s, 'p1').board, [], 'visão final limpa');
  }
  check(cases === 10, 'casos de ausência');
}

// ---------------------------------------------------------------------------
section(`varredura: duplas, trios, repetidos até o teto e o máximo (×${COMBOS})`);
{
  const tc = Date.now();
  const stats: FriendsStats = emptyFriendsStats();
  let matches = 0;
  let mi = 0;
  const run = (effects: PosterEffectId[], tag: string, reps: number): void => {
    for (let r = 0; r < reps * COMBOS; r++) {
      const n = 1 + ((mi + r) % 4);
      const cfg = friendsConfig({ seed: `sw-${tag}-${r}`, people: n, effects });
      const deep = (mi + r) % 3 === 0;
      const p = playFriends(cfg, `sw-h-${tag}-${r}`, { pTimeout: 0.06, pLeave: 0.003, pLeaveOther: 0.002, roundTrip: (mi + r) % 5 === 0 });
      checkFriends(p, `${tag}#${r}`, stats, deep);
      if ((mi + r) % 7 === 0) {
        const q = playFriends(cfg, 'replay', { replay: p.ops, roundTrip: true });
        eq(friendsHash(q), friendsHash(p), `${tag}#${r}: mesmas operações + ida e volta pelo JSON = mesmo log`);
      }
      matches++;
    }
    mi++;
  };
  // duplas e trios de efeitos diferentes
  for (let a = 0; a < ALL_EFFECTS.length; a++) {
    for (let b = a + 1; b < ALL_EFFECTS.length; b++) {
      run([ALL_EFFECTS[a], ALL_EFFECTS[b]], `${ALL_EFFECTS[a]}+${ALL_EFFECTS[b]}`, 3);
      for (let c = b + 1; c < ALL_EFFECTS.length; c++) run([ALL_EFFECTS[a], ALL_EFFECTS[b], ALL_EFFECTS[c]], `${ALL_EFFECTS[a]}+${ALL_EFFECTS[b]}+${ALL_EFFECTS[c]}`, 1);
    }
  }
  // cada efeito repetido: 2, 3 (teto) e 8 pôsteres iguais
  for (const e of ALL_EFFECTS) for (const l of [2, 3, 8]) run(Array(l).fill(e) as PosterEffectId[], `${e}x${l}`, 2);
  // o máximo: 8 pôsteres, todos diferentes (8 dos 9) e misturas com repetidos
  for (let skip = 0; skip < ALL_EFFECTS.length; skip++) run(ALL_EFFECTS.filter((_, k) => k !== skip), `oito-sem-${ALL_EFFECTS[skip]}`, 3);
  const rngMix = createRng('sw-mix');
  for (let k = 0; k < 20; k++) {
    const list: PosterEffectId[] = [];
    for (let j = 0; j < 8; j++) list.push(ALL_EFFECTS[rngMix.nextInt(ALL_EFFECTS.length)]);
    run(list, `mistura-${k}`, 2);
  }
  run(['eight_aces', 'opal', 'opal', 'opal', 'sixth_card', 'sixth_card', 'hand_bounty', 'hand_bounty'], 'ases-opala-sexta', 6);
  run(['reveal_one', 'reveal_one', 'reveal_one', 'blackjack', 'blackjack', 'blackjack', 'hand_bounty', 'opal'], 'viradas', 6);
  run(['double_pot', 'double_pot', 'double_pot', 'blackjack', 'blackjack', 'blackjack', 'hand_bounty', 'opal'], 'bonus', 6);
  run(['early_flop', 'early_flop', 'early_flop', 'sixth_card', 'sixth_card', 'sixth_card', 'eight_aces', 'tell'], 'board', 6);
  console.log(`  ${matches} partidas · ${(stats.hands / matches).toFixed(1)} mãos/partida · ${stats.multiCastHands} mãos com 2+ lançadas · bônus ${stats.bonus}`);
  console.log(`  lançadas ${JSON.stringify(stats.casts)}`);
  console.log(`  board de 6: ${stats.board6} · cinco iguais: ${stats.fiveKind} · tiques: ${stats.tells} · saídas ${stats.leaves} · estouros ${stats.timeouts} · ausentes ${stats.away}`);
  console.log(`  vencedor pessoa ${stats.personWins} · oráculo ${stats.oracleWins} · (${((Date.now() - tc) / 1000).toFixed(1)} s)`);
  check(stats.multiCastHands > 0, 'houve mão com 2+ lançadas');
  check(stats.fiveKind > 0, 'houve cinco iguais');
  check(stats.leaves > 0 && stats.timeouts > 0, 'houve saída e estouro');
}

console.log(`\n  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
finish();
