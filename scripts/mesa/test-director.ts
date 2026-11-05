/**
 * Testes do Diretor de falas da Mesa (SPEC §8.4, WP-FALAS item 3). 05/11/2026.
 *
 *   node scripts/mesa/test-director.ts
 *
 * Confere: determinismo (mesma semente + mesmo payload = mesmas falas, também depois de
 * "recarregar"); teto de balões (abertura ≤ 2, troca ≤ 3, tiragem ≤ 8); o Espelho nunca
 * fica mudo (todos os dias × horas × estados); nenhuma fala com slot faltando; gênero, "@"
 * e nomes de amigos com zero ocorrências; a Cobra sem promessa; `verdictLineFor` estável e
 * igual à reação ao vivo; 40% de tiragens sem troca; LRU e once=week entre dias; e que
 * nenhum arquivo do pôquer mudou.
 */
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BANTER_SILENT_PCT, DEFAULT_BANK, DRAW_BALLOON_CAP, createMesaDirector, globalFacts, situationsOf,
} from '../../src/lib/mesa/dialogue/director.ts';
import type { DialogueCard, DialoguePayload, DirectorCtx, Spoken } from '../../src/lib/mesa/dialogue/director.ts';
import { BALLOON_MAX, MIRROR_MAX, REACTION_MAX, renderText } from '../../src/lib/mesa/dialogue/render.ts';
import { CYPHER_PROMISE_EN, CYPHER_PROMISE_PT, FORBIDDEN_NAMES, GENDER_PT } from '../../src/lib/mesa/dialogue/rules.ts';
import { memoryStorage } from '../../src/lib/mesa/dialogue/storage.ts';
import type { DialogueStorage } from '../../src/lib/mesa/dialogue/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

let pass = 0;
const fails: string[] = [];
function check(ok: boolean, msg: string): void {
  if (ok) pass++;
  else if (fails.length < 60) fails.push(msg);
  else if (fails.length === 60) fails.push('… (mais falhas omitidas)');
}

// ---------------------------------------------------------------------------
// Fábrica de payloads
// ---------------------------------------------------------------------------

const FRIEND = 'tonico_amigo';
type Seat = 'bogart' | 'fincher' | 'cypher' | 'espelho';
const LF = {
  bw: false, long: false, series: false, hidden: false, bomb: false, public: 7.4, p10hi: false, anime: false, br: false,
  sequel: false, huge: false, newmood: false, newcountry: false, decade: '2010s', ressalva: false, watchlist: false,
};
function card(seat: Seat, over: Partial<DialogueCard> & { lf?: Partial<typeof LF>; t?: Partial<DialogueCard['title']> } = {}): DialogueCard {
  const { lf, t, ...rest } = over;
  return {
    id: `${seat}-card`, seat, kind: 'main', state: 'down', sealed: seat === 'cypher', second_opinion: false,
    title: {
      tmdb_id: 100, media_type: 'movie', title_pt: 'Um Título Bem Comprido Para Cortar No Meio', title_en: 'A Rather Long Title To Be Cut',
      year: 2012, runtime: 118, ep_runtime: null, seasons: null, oracle: seat === 'espelho' ? 'bogart' : seat, mood: 'catharsis',
      countries: ['KR'], director: 'Bong Joon Ho', vote_count: 5400, ...t,
    },
    pred: { value: 8, label: 'number' },
    line_facts: { ...LF, ...lf },
    ...rest,
  };
}

function payload(over: Partial<DialoguePayload> & { me?: Partial<DialoguePayload['me']>; facts?: Partial<DialoguePayload['facts']> } = {}): DialoguePayload {
  const { me, facts, ...rest } = over;
  return {
    day: '2026-11-05', draw_id: 'draw-1', seed: 1928374650, ask: null, mode: 'normal', host: 'bogart',
    me: {
      rated: 259, pred_label: 'number',
      persona: { code: 'MAC', character_pt: 'Ellie Arroway', character_en: 'Ellie Arroway' },
      persona_progress: { counted: 236, threshold: 10, moods_used: 9 }, top_moods: ['mind-blowing'], ...me,
    },
    cards: [card('bogart'), card('fincher'), card('cypher')],
    passed: [],
    facts: {
      weekday: 4, first_visit: false, returning_days: 1, yesterday: { flipped: 3, unflipped: 0, cypher_closed: false },
      mood_rising: 'catharsis', weak_mood: 'drug-trip', code_changed: false, verdicts_pending: 1, espelho4: false,
      reveal: false, live_event: null, ...facts,
    },
    verdicts: [{ card_id: 'v-1', oracle: 'cypher', title_pt: 'Oldboy', title_en: 'Oldboy', rating: 9, category: 'over',
      shown_day: '2026-11-02', ask: null }],
    ...rest,
  };
}
const ctxOf = (p: DialoguePayload, lang: 'pt' | 'en' = 'pt', hour = 21, weekday = 4): DirectorCtx => ({ lang, payload: p, hour, weekday });
const flipAll = (p: DialoguePayload): DialoguePayload => ({ ...p, cards: p.cards.map((c) => ({ ...c, state: 'up', sealed: false })) });

const ALL: Spoken[] = [];
function collect(xs: (Spoken | null)[] | Spoken | null): void {
  for (const x of Array.isArray(xs) ? xs : [xs]) if (x) ALL.push(x);
}

/** Uma sessão inteira na Mesa: abrir, tocar no selo, virar, reagir. Devolve o roteiro. */
function session(p: DialoguePayload, lang: 'pt' | 'en', storage: DialogueStorage | null = null): string[] {
  const d = createMesaDirector({ storage });
  const ctx = ctxOf(p, lang);
  const out: (Spoken | null)[] = [];
  out.push(d.mirror(ctx));
  const op = d.opening(ctx);
  check(op.length <= 2, `opening devolveu ${op.length} balões`);
  out.push(...op);
  out.push(d.seal(ctx));
  check(d.seal(ctx) === null, 'seal falou duas vezes na mesma tiragem');
  const up = flipAll(p);
  const ctx2 = ctxOf(up, lang);
  out.push(d.sealOpen(ctx2));
  const af = d.allFlipped(ctx2);
  check(af.length <= 3, `allFlipped devolveu ${af.length} balões`);
  out.push(...af);
  out.push(d.mirrorClose(ctx2));
  const drawBalloons = op.length + af.length + out.filter((x) => x && (x.id.startsWith('C17') || x.id.startsWith('C18'))).length;
  check(drawBalloons <= DRAW_BALLOON_CAP, `tiragem com ${drawBalloons} balões`);
  out.push(d.reaction(ctx2, 'bogart', 'want'));
  out.push(d.reaction(ctx2, 'fincher', 'verdict', { category: 'ten', rating: 10, cardId: 'fincher-card' }));
  out.push(d.reaction(ctx2, 'fincher', 'replace'));
  out.push(d.reaction(ctx2, 'cypher', 'refuse'));
  out.push(d.reaction(ctx2, 'cypher', 'pass', { passReason: 'refused' }));
  collect(out);
  return out.map((x) => (x ? `${x.who}:${x.id}:${x.text}` : '·'));
}

// ---------------------------------------------------------------------------
// 0. Todas as falas, com cada slot no valor real mais longo (pt e en)
// ---------------------------------------------------------------------------
{
  const MAXV: Record<'pt' | 'en', Record<string, string>> = {
    pt: { estreante: 'estreante', humor_subindo: 'Sombrio e Assustador', humor_fraco: 'Sombrio e Assustador',
      humor: 'Sombrio e Assustador', ocasiao: 'Maratona de fim de semana', dias: '120', contagem: '9', falta: '10',
      personagem: 'Hannibal Lecter da Silva Jr.', nota: '10', titulo: 'O Senhor dos Anéis: A Sociedade…',
      dia_semana: 'segunda', duracao: '58 min', decada: 'anos 2000', ano: '1974', votos: '1.999', votos_mais_um: '2.000',
      nota_publico: '5,1', de_pais: 'da República Tcheca', diretor: 'Apichatpong Weerasethakul X' },
    en: { estreante: 'partner', humor_subindo: 'Laugh Out Loud', humor_fraco: 'Laugh Out Loud', humor: 'Laugh Out Loud',
      ocasiao: 'Make me laugh out loud', dias: '120', contagem: '9', falta: '10', personagem: 'Hannibal Lecter da Silva Jr.',
      nota: '10', titulo: 'The Lord of the Rings: The Fell…', dia_semana: 'Wednesday', duracao: '58 min', decada: 'the 2000s',
      ano: '1974', votos: '1,999', votos_mais_um: '2,000', nota_publico: '5.1', de_pais: 'from the Czech Republic',
      diretor: 'Apichatpong Weerasethakul X' },
  };
  const REACT = new Set(['want', 'refuse', 'pass', 'replace', 'notSeen']);
  let n = 0;
  const all: { id: string; who: string; beat: string; pt: string; en: string }[] = [
    ...DEFAULT_BANK.lines.map((l) => ({ id: l.id, who: l.who, beat: l.beat, pt: l.pt, en: DEFAULT_BANK.en[l.id] as string })),
    ...DEFAULT_BANK.exchanges.flatMap((x) => x.parts.map((p, i) => ({ id: `${x.id}.${i + 1}`, who: p.who, beat: 'banter', pt: p.pt,
      en: (DEFAULT_BANK.en[x.id] as string[])[i] }))),
  ];
  for (const l of all) {
    const cap = l.who === 'espelho' ? MIRROR_MAX : REACT.has(l.beat) ? REACTION_MAX : BALLOON_MAX;
    for (const lang of ['pt', 'en'] as const) {
      const t = renderText(lang === 'pt' ? l.pt : l.en, MAXV[lang], lang);
      check(t !== null, `${l.id} [${lang}] não renderiza com todos os slots`);
      if (t === null) continue;
      n++;
      check(t.length <= cap, `${l.id} [${lang}] ${t.length} > ${cap} com os slots no máximo: ${t}`);
      check(!/[{}]/.test(t) && !t.includes('@') && !FORBIDDEN_NAMES.test(t), `${l.id} [${lang}] slot, @ ou nome: ${t}`);
      if (lang === 'pt') check(!GENDER_PT.test(t), `${l.id}: gênero para a pessoa: ${t}`);
      if (l.who === 'cypher') for (const re of [...CYPHER_PROMISE_PT, ...CYPHER_PROMISE_EN]) check(!re.test(t), `${l.id}: a Cobra prometeu: ${t}`);
      // falta de slot = inelegível (nunca um buraco no texto)
      if (/\{[a-z_]+\}/.test(l.pt)) check(renderText(lang === 'pt' ? l.pt : l.en, {}, lang) === null, `${l.id}: renderizou sem slots`);
    }
  }
  check(renderText('You gave my {dia_semana} pick a {nota}.', { dia_semana: 'Monday', nota: '8' }, 'en') === 'You gave my Monday pick an 8.', 'en: "a 8" devia virar "an 8"');
  check(renderText('Você deu {nota}.', { nota: '8' }, 'pt') === 'Você deu 8.', 'pt: o artigo do inglês vazou para o pt');
  console.log(`Todas as falas renderizadas no pior caso: ${n} (pt + en).`);
}

// ---------------------------------------------------------------------------
// 1. Determinismo
// ---------------------------------------------------------------------------
{
  const p = payload();
  for (const lang of ['pt', 'en'] as const) {
    const a = session(p, lang);
    const b = session(p, lang);
    check(JSON.stringify(a) === JSON.stringify(b), `[${lang}] a mesma semente deu falas diferentes`);
    // "recarregar a página" no mesmo dia, com a memória do aparelho guardada
    const st = memoryStorage();
    const c = session(p, lang, st);
    const d = session(p, lang, st);
    check(JSON.stringify(c) === JSON.stringify(d), `[${lang}] recarregar no mesmo dia mudou as falas`);
    check(JSON.stringify(a) === JSON.stringify(c), `[${lang}] memória vazia e memória do mesmo dia divergiram`);
  }
  // Chamar duas vezes (StrictMode) devolve o mesmo
  const d = createMesaDirector({ storage: null });
  const ctx = ctxOf(p);
  check(d.mirror(ctx).id === d.mirror(ctx).id, 'mirror() mudou na segunda chamada');
  check(JSON.stringify(d.opening(ctx)) === JSON.stringify(d.opening(ctx)), 'opening() mudou na segunda chamada');
  const r1 = d.reaction(ctx, 'bogart', 'want');
  const r2 = d.reaction(ctx, 'bogart', 'want');
  check(!!r1 && r1.id === r2?.id, 'reaction(want) mudou na segunda chamada');
  // Sementes diferentes variam (o Espelho não é sempre a mesma frase)
  const seen = new Set<string>();
  for (let s = 0; s < 60; s++) seen.add(createMesaDirector({ storage: null }).mirror(ctxOf(payload({ seed: s * 7919, draw_id: `d${s}` }))).id);
  check(seen.size >= 8, `o Espelho variou pouco entre sementes (${seen.size} ids em 60)`);
}

// ---------------------------------------------------------------------------
// 2. O Espelho nunca fica mudo (todos os dias × horas × estados)
// ---------------------------------------------------------------------------
{
  const states: DialoguePayload[] = [
    payload(),
    payload({ mode: 'recon', me: { rated: 0, pred_label: 'hidden', persona: null, persona_progress: { counted: 0, threshold: 10, moods_used: 0 } }, facts: { first_visit: true, mood_rising: null, weak_mood: null, verdicts_pending: 0 }, verdicts: [] }),
    payload({ mode: 'recon', me: { rated: 5, pred_label: 'guess', persona: null, persona_progress: { counted: 4, threshold: 10, moods_used: 2 } }, facts: { mood_rising: null, weak_mood: null, verdicts_pending: 0 }, verdicts: [] }),
    payload({ me: { rated: 12, persona: null, persona_progress: { counted: 9, threshold: 10, moods_used: 3 } }, facts: { reveal: true } }),
    payload({ facts: { returning_days: 9, code_changed: true } }),
    payload({ facts: { espelho4: true, mood_rising: null, weak_mood: null, verdicts_pending: 0, yesterday: null, returning_days: null }, verdicts: [] }),
    payload({ me: { persona: null, rated: 11, persona_progress: { counted: 3, threshold: 10, moods_used: 1 } }, facts: { mood_rising: null, weak_mood: null, verdicts_pending: 0, yesterday: null, returning_days: null }, verdicts: [] }),
    payload({ ask: { key: 'occ:chuva', kind: 'occasion', id: 'chuva', media: 'movie' } }),
    payload({ ask: { key: 'mood:romantic', kind: 'mood', id: 'romantic', media: null } }),
    payload({ ask: { key: 'season:halloween', kind: 'season', id: 'halloween', media: null }, facts: { live_event: 'halloween' } }),
  ];
  let n = 0;
  for (const p of states) {
    for (let wd = 0; wd < 7; wd++) {
      for (let h = 0; h < 24; h++) {
        for (const lang of ['pt', 'en'] as const) {
          const d = createMesaDirector({ storage: null });
          const m = d.mirror({ lang, payload: { ...p, draw_id: `m${n++}` }, hour: h, weekday: wd });
          check(!!m.text && m.id !== 'E000', `Espelho mudo (estado ${states.indexOf(p)}, dia ${wd}, ${h}h, ${lang})`);
          check(m.text.length <= MIRROR_MAX, `Espelho com ${m.text.length} caracteres: ${m.text}`);
          collect(m);
          if (p.mode === 'recon') check(!/E0[6-7]\d|E08\d|E04\d/.test(m.id), `Espelho de modo normal no reconhecimento: ${m.id}`);
          if (p.ask) check(/^E1[6-9]\d$/.test(m.id), `pergunta na mesa e o Espelho não falou dela: ${m.id}`);
          if (p.ask?.key === 'occ:chuva') check(m.id === 'E170' || m.id === 'E171', `a fala específica da chuva não ganhou da genérica: ${m.id}`);
        }
      }
    }
  }
  // Revelação que acabou de acontecer vence tudo
  const d = createMesaDirector({ storage: null });
  const m = d.mirror({ ...ctxOf(payload()), reveal: 'new' });
  check(['E030', 'E031', 'E032'].includes(m.id) && m.text.includes('Ellie Arroway'), `persona_new não saiu: ${m.id}`);
  const m0 = createMesaDirector({ storage: null }).mirror(ctxOf(states[1]));
  check(['E001', 'E002', 'E003'].includes(m0.id), `0 notas e o Espelho não disse n0: ${m0.id}`);
}

// ---------------------------------------------------------------------------
// 3. Muitas tiragens: slots, tamanhos, gênero, nomes, a Cobra, tetos
// ---------------------------------------------------------------------------
{
  const variants: Partial<DialogueCard>[] = [];
  const flags = ['bw', 'long', 'series', 'hidden', 'bomb', 'p10hi', 'anime', 'br', 'sequel', 'huge', 'newmood', 'newcountry', 'ressalva', 'watchlist'] as const;
  for (let i = 0; i < flags.length; i++) variants.push({ lf: { [flags[i]]: true, [flags[(i + 3) % flags.length]]: true } } as never);
  const asks = [null, 'occ:chuva', 'occ:amor', 'occ:familia', 'occ:galera', 'occ:noventa', 'occ:episodio', 'occ:maratona',
    'occ:chorar', 'occ:rir', 'occ:susto', 'occ:no', 'occ:colo', 'mood:drug-trip', 'season:christmas'];
  let k = 0;
  let silent = 0;
  let withSit = 0;
  for (let s = 0; s < 400; s++) {
    const v = variants[s % variants.length] as { lf?: Partial<typeof LF> };
    const askKey = asks[s % asks.length];
    const ask = askKey ? { key: askKey, kind: (askKey.startsWith('mood') ? 'mood' : askKey.startsWith('season') ? 'season' : 'occasion') as 'mood' | 'season' | 'occasion', id: askKey.split(':')[1], media: null } : null;
    const host = (['bogart', 'fincher', 'cypher'] as const)[s % 3];
    const p = payload({
      seed: 1000 + s * 104729, draw_id: `d-${s}`, ask, host,
      cards: [
        card('bogart', { lf: { ...v.lf, huge: s % 5 === 0, sequel: s % 7 === 0 }, t: { year: 2015, runtime: s % 2 ? 165 : 95 } }),
        card('fincher', { lf: { ...v.lf, bw: s % 4 === 0 }, t: { year: s % 3 ? 1962 : 1994, runtime: s % 2 ? 98 : 172, director: 'Michelangelo Antonioni Filho' } }),
        card('cypher', { lf: { ...v.lf, hidden: s % 2 === 0, bomb: s % 6 === 0, public: 4.9 }, t: { year: 1958, vote_count: 312, countries: ['JP'], media_type: s % 9 ? 'movie' : 'tv' } }),
        ...(s % 11 === 0 ? [card('espelho', { kind: 'espelho4', t: { oracle: 'fincher' } })] : []),
      ],
      passed: s % 13 === 0 ? [{ seat: 'cypher', reason: 'colo' }] : [],
      verdicts: s % 4 === 0 ? [] : [{ card_id: `v-${s}`, oracle: host, title_pt: 'O Poderoso Chefão: Parte II e Mais Um Pouco', title_en: 'The Godfather Part II', rating: [10, 9, 4, 7][s % 4], category: (['ten', 'exact', 'under', 'near', 'over'] as const)[s % 5], shown_day: '2026-11-04', ask: s % 3 ? null : 'occ:chuva' }],
    });
    for (const lang of ['pt', 'en'] as const) {
      const d = createMesaDirector({ storage: null });
      const ctx = ctxOf(p, lang, s % 24, s % 7);
      collect(d.mirror(ctx));
      const op = d.opening(ctx);
      check(op.length <= 2, 'opening > 2');
      if (p.verdicts.length && p.host) check(op.length >= 1, `sem reação de ontem nem anfitrião (s=${s})`);
      collect(op);
      collect(d.seal(ctx));
      const up = flipAll(p);
      const c2 = ctxOf(up, lang, s % 24, s % 7);
      collect(d.sealOpen(c2));
      const af = d.allFlipped(c2);
      check(af.length <= 3, 'allFlipped > 3');
      if (af.length) {
        check(af.every((x, i) => x.exchange?.part === i + 1 && x.exchange.of === af.length), 'troca com partes fora de ordem');
        check(af.every((x) => !p.passed.some((ps) => ps.seat === x.who)), 'quem passou a vez falou na troca');
      }
      if (lang === 'pt' && situationsOf(up).size) {
        withSit++;
        if (!af.length) silent++;
      }
      collect(af);
      collect(d.mirrorClose(c2));
      for (const seat of ['bogart', 'fincher', 'cypher'] as const) {
        for (const kind of ['want', 'refuse', 'replace', 'notSeen'] as const) collect(d.reaction(c2, seat, kind));
        for (const r of ['refused', 'empty', 'colo'] as const) {
          const x = d.reaction(c2, seat, 'pass', { passReason: r });
          check(!!x, `${seat} sem fala de pass (${r})`);
          if (seat === 'cypher' && r === 'colo') check(!!x && ['C502', 'C505'].includes(x.id), `Cypher em colo não usou a fala de colo: ${x?.id}`);
          collect(x);
        }
        for (const cat of ['exact', 'near', 'over', 'under', 'ten'] as const) {
          const rating = cat === 'ten' ? 10 : cat === 'under' ? (s % 2 ? 3 : 6) : cat === 'over' ? (s % 2 ? 10 : 9) : 8;
          const x = d.reaction(c2, seat, 'verdict', { category: cat, rating, cardId: `${seat}-${s}` });
          check(!!x, `${seat} sem veredito ${cat}`);
          // a fala do Livro é a mesma que tocou ao vivo
          check(!!x && d.verdictLineFor(`${seat}-${s}`, seat, cat, lang, { rating }) === x.text, `${seat} ${cat}: Livro ≠ ao vivo`);
          collect(x);
        }
      }
      k++;
    }
  }
  const pct = (100 * silent) / Math.max(1, withSit);
  check(Math.abs(pct - BANTER_SILENT_PCT) <= 8, `tiragens sem troca: ${pct.toFixed(1)}% (meta ${BANTER_SILENT_PCT}%)`);
  console.log(`Tiragens simuladas: ${k} (pt+en); com situação de troca: ${withSit}; sem troca: ${pct.toFixed(1)}%.`);
}

// ---------------------------------------------------------------------------
// 4. verdictLineFor: estável por carta e variado entre cartas
// ---------------------------------------------------------------------------
{
  const a = createMesaDirector({ storage: null });
  const b = createMesaDirector({ storage: null });
  const texts = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const id = `card-${i}`;
    for (const o of ['bogart', 'fincher', 'cypher'] as const) {
      const x = a.verdictLineFor(id, o, 'exact', 'pt', { rating: 8 });
      const y = b.verdictLineFor(id, o, 'exact', 'pt', { rating: 8 });
      check(!!x && x === y, `verdictLineFor instável (${id}, ${o})`);
      check(a.verdictLineFor(id, o, 'exact', 'pt', { rating: 8 }) === x, 'verdictLineFor mudou na segunda chamada');
      texts.add(x);
    }
  }
  check(texts.size >= 8, `verdictLineFor pouco variado (${texts.size})`);
  check(a.verdictLineFor('x', 'espelho', 'exact', 'pt', { rating: 8 }) === '', 'verdictLineFor do Espelho devia ser vazio');
  const np = a.verdictLineFor('np', 'bogart', 'near', 'pt', { rating: 7, nopred: true });
  check(['B251', 'B252'].some((id) => DEFAULT_BANK.lines.find((l) => l.id === id)!.pt.replace('{nota}', '7') === np), `nopred não usou a fala sem previsão: ${np}`);
  const r10 = a.verdictLineFor('r10', 'fincher', 'over', 'pt', { rating: 10 });
  check(['F224', 'F225'].some((id) => DEFAULT_BANK.lines.find((l) => l.id === id)!.pt === r10), `over com 10 não usou a fala de 10: ${r10}`);
}

// ---------------------------------------------------------------------------
// 5. Entre dias: LRU de 14 dias e once=week
// ---------------------------------------------------------------------------
{
  const st = memoryStorage();
  const day1 = payload({ day: '2026-11-05', draw_id: 'a' });
  const d1 = createMesaDirector({ storage: st });
  const m1 = d1.mirror(ctxOf(day1));
  const day2 = payload({ day: '2026-11-06', draw_id: 'b' });
  const m2 = createMesaDirector({ storage: st }).mirror(ctxOf(day2));
  check(m1.id !== m2.id, `o Espelho repetiu a frase do dia anterior (${m1.id})`);
  // once=week: a troca dos clássicos vaiados não volta em 7 dias
  const bombTable = (day: string, draw: string): DialoguePayload => flipAll(payload({
    day, draw_id: draw, seed: 0,
    cards: [card('bogart'), card('fincher'), card('cypher', { lf: { bomb: true, public: 4.1 } })],
  }));
  const st2 = memoryStorage();
  let hits = 0;
  const bomb = DEFAULT_BANK.exchanges.find((x) => x.cond[0] === 'cypher_bomb' && x.once === 'week')!;
  for (let dd = 1; dd <= 14; dd++) {
    const day = `2026-11-${String(dd).padStart(2, '0')}`;
    for (let s = 0; s < 6; s++) {
      const p = { ...bombTable(day, `${day}-${s}`), seed: dd * 1000 + s };
      const af = createMesaDirector({ storage: st2 }).allFlipped(ctxOf(p));
      if (af[0]?.id === bomb.id) hits++;
    }
  }
  check(hits >= 1 && hits <= 2, `o bordão ${bomb.id} tocou ${hits} vezes em 14 dias (once=week)`);
}

// ---------------------------------------------------------------------------
// 6. Regras sobre TUDO o que o Diretor falou
// ---------------------------------------------------------------------------
{
  for (const s of ALL) {
    check(!/[{}]/.test(s.text), `${s.id}: slot sem valor: ${s.text}`);
    check(!s.text.includes('@'), `${s.id}: "@" na fala`);
    check(!FORBIDDEN_NAMES.test(s.text) && !s.text.includes(FRIEND), `${s.id}: nome de pessoa na fala`);
    check(!GENDER_PT.test(s.text), `${s.id}: gênero para a pessoa: ${s.text}`);
    const cap = s.who === 'espelho' ? MIRROR_MAX : /^[BFC](4|5|6)\d\d$/.test(s.id) ? REACTION_MAX : BALLOON_MAX;
    check(s.text.length <= cap, `${s.id}: ${s.text.length} > ${cap}: ${s.text}`);
    check(s.ms >= 2200 && s.ms <= 6000, `${s.id}: duração ${s.ms} fora de 2,2 a 6 s`);
    if (s.who === 'cypher') {
      for (const re of [...CYPHER_PROMISE_PT, ...CYPHER_PROMISE_EN]) check(!re.test(s.text), `${s.id}: a Cobra prometeu: ${s.text}`);
    }
  }
  // {titulo} cortado com "…" quando passa de 32
  const later = ALL.filter((x) => /Poderoso Chefão|Godfather/.test(x.text));
  check(later.length > 0 && later.every((x) => !x.text.includes('Parte II e Mais')), 'título longo não foi cortado');
  // o fato "almost" exige 3 humores
  const f = globalFacts(ctxOf(payload({ me: { persona: null, persona_progress: { counted: 9, threshold: 10, moods_used: 2 } } })));
  check(!f.has('almost'), '"almost" com só 2 humores');
  console.log(`Falas renderizadas e conferidas: ${ALL.length} (ids distintos: ${new Set(ALL.map((x) => x.id)).size} de ${DEFAULT_BANK.lines.length + DEFAULT_BANK.exchanges.length}).`);
}

// ---------------------------------------------------------------------------
// 7. Nenhum arquivo do pôquer mudou
// ---------------------------------------------------------------------------
try {
  const diff = execSync('git diff --stat src/lib/poker scripts/poker', { cwd: ROOT, encoding: 'utf8' }).trim();
  const untracked = execSync('git status --porcelain src/lib/poker scripts/poker', { cwd: ROOT, encoding: 'utf8' }).trim();
  check(diff === '' && untracked === '', `arquivos do pôquer mudaram:\n${diff}\n${untracked}`);
} catch (e) {
  check(false, `git falhou: ${(e as Error).message}`);
}

console.log(`\n${pass} verificações passaram, ${fails.length} falharam.`);
for (const f of fails) console.log(`  FALHA: ${f}`);
if (fails.length) process.exitCode = 1;
