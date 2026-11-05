/**
 * Lint do banco de falas da Mesa (SPEC §3.3 e §3.8). Porte do `scripts/poker/check-lines.ts`
 * mais o teste de gênero do pôquer, ampliado (05/11/2026).
 *
 *   node scripts/mesa/check-lines.ts           resumo + problemas (sai com 1 se houver)
 *   node scripts/mesa/check-lines.ts --list    também lista os ids por tempo
 *
 * Confere: tamanhos (balão 88, reação 60, Espelho 90, com os slots no máximo) em pt e en;
 * en para todo id; slots só da lista e iguais em pt e en; regex de gênero; "@", nomes,
 * travessão e emoji; artigo antes de {diretor}; lastro (expressão → condição); a Cobra sem
 * promessa; bordões com once; condições conhecidas; e a profundidade mínima do §8.4.
 */
import { DEFAULT_BANK } from '../../src/lib/mesa/dialogue/director.ts';
import { BALLOON_MAX, MIRROR_MAX, REACTION_MAX, SLOT_NAMES, measure, varsOf } from '../../src/lib/mesa/dialogue/render.ts';
import {
  ARTICLE_BEFORE_DIRECTOR, CATCHPHRASE_EN, CATCHPHRASE_PT, CLAIMS, CYPHER_PROMISE_EN, CYPHER_PROMISE_PT, EMOJI, EM_DASH,
  FORBIDDEN_NAMES, GENDER_PT, MINHA_CARA, REACTION_BEATS, SITUATIONS, knownCond,
} from '../../src/lib/mesa/dialogue/rules.ts';
import { OCCASION_IDS } from '../../src/lib/mesa/dialogue/slots.ts';
import type { Beat, Lang, Speaker } from '../../src/lib/mesa/dialogue/types.ts';

const { lines, exchanges, en } = DEFAULT_BANK;
const problems: string[] = [];
const bad = (id: string, msg: string): void => { problems.push(`${id}: ${msg}`); };

function capFor(beat: Beat | 'banter', who: Speaker): number {
  if (who === 'espelho') return MIRROR_MAX;
  if ((REACTION_BEATS as readonly string[]).includes(beat)) return REACTION_MAX;
  return BALLOON_MAX;
}

/** Regras de texto que valem para qualquer fala (solta ou balão de troca). */
function checkText(id: string, who: Speaker, beat: Beat | 'banter', conds: string[], pt: string, enText: string | undefined,
  inExchange: boolean, once: string | undefined): void {
  const cap = capFor(beat, who);
  const texts: [Lang, string][] = [['pt', pt]];
  if (enText === undefined || enText === '') bad(id, 'sem en');
  else texts.push(['en', enText]);
  for (const [lang, t] of texts) {
    const n = measure(t, lang);
    if (n > cap) bad(id, `[${lang}] ${n} > ${cap} caracteres: ${t}`);
    if (t.includes('@')) bad(id, `[${lang}] tem "@"`);
    if (FORBIDDEN_NAMES.test(t)) bad(id, `[${lang}] cita nome de pessoa`);
    if (EM_DASH.test(t)) bad(id, `[${lang}] travessão longo`);
    if (EMOJI.test(t)) bad(id, `[${lang}] emoji`);
    for (const v of varsOf(t)) if (!SLOT_NAMES.includes(v)) bad(id, `[${lang}] slot desconhecido {${v}}`);
    if (/\{[^}]*$|^[^{]*\}/.test(t)) bad(id, `[${lang}] chave de slot quebrada`);
  }
  // slots iguais em pt e en
  if (enText) {
    const a = [...new Set(varsOf(pt))].sort().join(',');
    const b = [...new Set(varsOf(enText))].sort().join(',');
    if (a !== b) bad(id, `slots diferentes em pt (${a}) e en (${b})`);
  }
  // gênero para a pessoa
  const g = GENDER_PT.exec(pt);
  if (g) bad(id, `gênero para a pessoa: "${g[0]}"`);
  if (MINHA_CARA.test(pt) && !(inExchange && who === 'fincher')) bad(id, '"minha cara" só na boca do Fincher, numa troca');
  if (ARTICLE_BEFORE_DIRECTOR.test(pt)) bad(id, 'artigo antes de {diretor}');
  // {titulo} só no veredito do dia seguinte; no veredito na hora, só {nota} (o Livro repete a fala)
  const vs = varsOf(pt);
  if (vs.includes('titulo') && beat !== 'verdictLater') bad(id, '{titulo} fora do verdictLater (spoiler)');
  if (beat === 'verdict' && vs.some((v) => v !== 'nota')) bad(id, 'veredito na hora só pode usar {nota}');
  // lastro
  const facts = new Set(conds.filter((c) => !c.startsWith('!')));
  for (const c of conds) for (const f of SITUATIONS[c] ?? []) facts.add(f);
  for (const cl of CLAIMS) {
    const hit = cl.pt.test(pt) || (!!enText && cl.en.test(enText));
    if (!hit) continue;
    if (cl.onlyWho && who !== cl.onlyWho) bad(id, `"${cl.name}" só na boca do ${cl.onlyWho}`);
    if (cl.needNot && !conds.includes(`!${cl.needNot}`)) bad(id, `"${cl.name}" exige a condição !${cl.needNot}`);
    if (cl.cond && !facts.has(cl.cond)) bad(id, `"${cl.name}" sem lastro: exige a condição ${cl.cond}`);
  }
  // a Cobra não promete
  if (who === 'cypher') {
    for (const re of CYPHER_PROMISE_PT) if (re.test(pt)) bad(id, `Cypher promete nota/força (pt): ${pt}`);
    if (enText) for (const re of CYPHER_PROMISE_EN) if (re.test(enText)) bad(id, `Cypher promete nota/força (en): ${enText}`);
    if (/\beu mesmo\b|\bobrigado\b/i.test(pt)) bad(id, 'Cypher fala de si no masculino');
  }
  if ((who === 'bogart' || who === 'fincher') && /\beu mesma\b/i.test(pt)) bad(id, 'Sapo/Raposo fala de si no feminino');
  // bordões
  if ((CATCHPHRASE_PT.test(pt) || (!!enText && CATCHPHRASE_EN.test(enText))) && !once) bad(id, 'bordão da casa sem once=week');
}

// ---------------------------------------------------------------------------

const ids = new Set<string>();
for (const l of lines) {
  if (ids.has(l.id)) bad(l.id, 'id repetido');
  ids.add(l.id);
  const e = en[l.id];
  if (Array.isArray(e)) bad(l.id, 'en é lista, mas a fala é solta');
  for (const c of l.cond ?? []) if (!knownCond(c)) bad(l.id, `condição desconhecida "${c}"`);
  // quem fala de quê
  if (l.who === 'espelho' && !['mirror', 'mirrorClose', 'system'].includes(l.beat)) bad(l.id, `o Espelho não fala em ${l.beat}`);
  if (l.who !== 'espelho' && ['mirror', 'mirrorClose', 'system'].includes(l.beat)) bad(l.id, `${l.who} não fala em ${l.beat}`);
  if ((l.beat === 'seal' || l.beat === 'sealOpen') && l.who !== 'cypher') bad(l.id, 'o selo é só da Cypher');
  if (l.beat === 'verdict' || l.beat === 'verdictLater') {
    const cats = (l.cond ?? []).filter((c) => ['exact', 'near', 'over', 'under', 'ten', 'nopred'].includes(c));
    if (cats.length !== 1) bad(l.id, 'veredito precisa de exatamente uma categoria (exact/near/over/under/ten/nopred)');
  }
  if (l.beat === 'pass' && !(l.cond ?? []).some((c) => ['refused', 'empty', 'colo'].includes(c))) bad(l.id, 'pass sem motivo');
  if (l.beat === 'pass' && (l.cond ?? []).includes('colo') && l.who !== 'cypher') bad(l.id, 'pass+colo é só da Cypher');
  checkText(l.id, l.who, l.beat, l.cond ?? [], l.pt, typeof e === 'string' ? e : undefined, false, l.once);
}
for (const x of exchanges) {
  if (ids.has(x.id)) bad(x.id, 'id repetido');
  ids.add(x.id);
  const e = en[x.id];
  if (!Array.isArray(e) || e.length !== x.parts.length) bad(x.id, `${x.parts.length} balões em pt e ${Array.isArray(e) ? e.length : 0} em en`);
  if (!x.cond.length || !SITUATIONS[x.cond[0]]) bad(x.id, `a 1ª condição precisa ser uma situação de troca (${x.cond[0] ?? '—'})`);
  for (const c of x.cond) if (!knownCond(c)) bad(x.id, `condição desconhecida "${c}"`);
  if (x.parts.length < 2 || x.parts.length > 3) bad(x.id, `troca com ${x.parts.length} balões`);
  x.parts.forEach((p, i) => {
    checkText(`${x.id}.${i + 1}`, p.who, 'banter', x.cond, p.pt, Array.isArray(e) ? e[i] : undefined, true, x.once);
  });
}

// ---------------------------------------------------------------------------
// Profundidade (§3.5 e §8.4)
// ---------------------------------------------------------------------------

const ORACLES = ['bogart', 'fincher', 'cypher'] as const;
const count = (beat: string, who: string, cond?: string): number =>
  lines.filter((l) => l.beat === beat && l.who === who && (!cond || (l.cond ?? []).includes(cond))).length;

for (const o of ORACLES) {
  for (const id of OCCASION_IDS) if (count('ask', o, `ask:${id}`) < 1) bad(o, `sem fala de anfitrião para ask:${id}`);
  if (count('ask', o, 'mood_ask') < 1) bad(o, 'sem fala de anfitrião para mood_ask');
  if (count('ask', o, 'ask') < 1) bad(o, 'sem fala genérica de pergunta ({ocasiao})');
  for (const cat of ['exact', 'near', 'over', 'under', 'ten']) {
    if (count('verdict', o, cat) < 2) bad(o, `veredito na hora "${cat}" com menos de 2 falas`);
    if (count('verdictLater', o, cat) < 2) bad(o, `veredito do dia seguinte "${cat}" com menos de 2 falas`);
  }
  if (count('verdict', o, 'nopred') < 1) bad(o, 'veredito sem previsão (nopred) sem fala');
  for (const b of ['open', 'recon', 'want', 'refuse', 'replace', 'notSeen']) if (count(b, o) < 2) bad(o, `${b} com menos de 2 falas`);
  for (const r of ['refused', 'empty']) if (count('pass', o, r) < 1) bad(o, `pass sem fala de "${r}"`);
}
if (count('pass', 'cypher', 'colo') < 1) bad('cypher', 'sem fala de pass+colo');
if (count('seal', 'cypher') < 2 || count('sealOpen', 'cypher') < 2) bad('cypher', 'selo raso');
if (lines.filter((l) => l.beat === 'mirror' && !l.cond?.length).length < 3) bad('espelho', 'menos de 3 falas de Espelho sem condição (a rede de segurança)');
for (const k of ['error', 'empty_all', 'offline', 'midnight']) if (count('system', 'espelho', k) < 1) bad('espelho', `system sem "${k}"`);
for (const k of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
  if (!lines.some((l) => l.beat === 'mirror' && (l.cond ?? []).includes(`day:${k}`))) bad('espelho', `sem fala de day:${k}`);
}
for (const k of ['late', 'morning', 'afternoon', 'night']) {
  if (!lines.some((l) => l.beat === 'mirror' && (l.cond ?? []).includes(`hour:${k}`))) bad('espelho', `sem fala de hour:${k}`);
}
for (const s of Object.keys(SITUATIONS)) if (!exchanges.some((x) => x.cond[0] === s)) bad('trocas', `nenhuma troca para a situação ${s}`);

const balloons = exchanges.reduce((s, x) => s + x.parts.length, 0);
const totalPt = lines.length + balloons;
if (totalPt < 320) bad('banco', `só ${totalPt} falas pt (mínimo 320)`);

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

const NAME: Record<string, string> = { espelho: 'Espelho', bogart: 'Bogart', fincher: 'Fincher', cypher: 'Cypher' };
const whos = ['espelho', 'bogart', 'fincher', 'cypher'];
const beats = [...new Set(lines.map((l) => l.beat))];
console.log(`| tempo | ${whos.map((w) => NAME[w]).join(' | ')} |`);
console.log(`|---|${whos.map(() => '---').join('|')}|`);
for (const b of beats) console.log(`| ${b} | ${whos.map((w) => count(b, w)).join(' | ')} |`);
console.log(`| banter (balões) | ${whos.map((w) => exchanges.flatMap((x) => x.parts).filter((p) => p.who === w).length).join(' | ')} |`);
console.log(`\n${lines.length} falas soltas + ${balloons} balões em ${exchanges.length} trocas = ${totalPt} falas pt, ${Object.keys(en).length} ids com en.`);

if (process.argv.includes('--list')) {
  const by = new Map<string, string[]>();
  for (const l of lines) by.set(`${l.beat}/${l.who}`, [...(by.get(`${l.beat}/${l.who}`) ?? []), l.id]);
  for (const [k, v] of [...by].sort()) console.log(`  ${k} (${v.length}): ${v.join(' ')}`);
}

console.log(`Problemas: ${problems.length}`);
for (const p of problems) console.log(`  ${p}`);
if (problems.length) process.exitCode = 1;
