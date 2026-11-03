/**
 * Conferência rápida do banco de falas (SPEC §8, pacote B).
 *
 *   node scripts/poker/check-lines.ts            resumo + problemas (sai com 1 se houver)
 *   node scripts/poker/check-lines.ts --list     também lista as falas por gatilho
 *
 * Problemas: fala acima de 88 caracteres ({premio} conta 30) em pt ou en, id sem en,
 * `curta` errada, réplica longa, troca com número de balões diferente entre pt e en.
 */
import { DEFAULT_BANK } from '../../src/lib/poker/dialogue/director.ts';
import { measure, MAX_CHARS, SHORT_CHARS } from '../../src/lib/poker/dialogue/render.ts';

const { lines, exchanges, en, quipPacks } = DEFAULT_BANK;
const problems: string[] = [];
const over: string[] = [];
const noEn: string[] = [];

for (const l of lines) {
  const n = measure(l.pt, 'pt');
  if (n > MAX_CHARS) over.push(`${l.id} [pt] ${n}: ${l.pt}`);
  if (!!l.curta !== (n <= SHORT_CHARS)) problems.push(`${l.id}: curta=${!!l.curta} com ${n} caracteres`);
  if (!Object.prototype.hasOwnProperty.call(en, l.id)) noEn.push(l.id);
  const e = en[l.id];
  if (typeof e === 'string' && measure(e, 'en') > MAX_CHARS) over.push(`${l.id} [en] ${measure(e, 'en')}: ${e}`);
  if (Array.isArray(e)) problems.push(`${l.id}: en é lista, mas a fala é solta`);
}
for (const x of exchanges) {
  const e = en[x.id];
  if (!Object.prototype.hasOwnProperty.call(en, x.id)) noEn.push(x.id);
  else if (!Array.isArray(e) || e.length !== x.parts.length) problems.push(`${x.id}: ${x.parts.length} balões em pt e ${Array.isArray(e) ? e.length : 0} em en`);
  x.parts.forEach((p, i) => {
    const n = measure(p.pt, 'pt');
    if (n > MAX_CHARS) over.push(`${x.id}.${i + 1} [pt] ${n}: ${p.pt}`);
    const t = Array.isArray(e) ? e[i] : null;
    if (t && measure(t, 'en') > MAX_CHARS) over.push(`${x.id}.${i + 1} [en] ${measure(t, 'en')}: ${t}`);
  });
}
for (const pack of Object.values(quipPacks)) {
  for (const q of pack.quips) {
    if (measure(q.pt) > SHORT_CHARS || measure(q.en, 'en') > SHORT_CHARS) problems.push(`réplica ${q.id} longa`);
  }
}

// Resumo por oráculo
const who = ['bogart', 'cypher', 'fincher'];
const name: Record<string, string> = { bogart: 'Sapo', cypher: 'Cobra', fincher: 'Raposo' };
console.log('| Oráculo | Falas soltas | Curtas | Respostas de réplica | Balões em trocas |');
console.log('|---|---|---|---|---|');
for (const w of who) {
  const solo = lines.filter((l) => l.speaker === w && l.on !== 'quipAnswer');
  const quips = lines.filter((l) => l.speaker === w && l.on === 'quipAnswer');
  const inX = exchanges.flatMap((x) => x.parts).filter((p) => p.speaker === w).length;
  console.log(`| ${name[w]} | ${solo.length} | ${solo.filter((l) => l.curta).length} | ${quips.length} | ${inX} |`);
}
const farewells = exchanges.filter((x) => x.farewell).length;
console.log(`\n${lines.length} falas (com ${lines.filter((l) => l.on === 'quipAnswer').length} respostas de réplica), ` +
  `${exchanges.length - farewells} trocas + ${farewells} despedidas, ${Object.values(quipPacks).reduce((s, p) => s + p.quips.length, 0)} réplicas.`);

if (process.argv.includes('--list')) {
  const byTrigger = new Map<string, string[]>();
  for (const l of lines) byTrigger.set(l.on, [...(byTrigger.get(l.on) ?? []), l.id]);
  for (const x of exchanges) byTrigger.set(x.on, [...(byTrigger.get(x.on) ?? []), `${x.id}*`]);
  console.log('\nPor gatilho (* = troca):');
  for (const [t, ids] of [...byTrigger].sort()) console.log(`  ${t} (${ids.length}): ${ids.join(' ')}`);
}

console.log(`\nAcima de ${MAX_CHARS} caracteres: ${over.length}`);
for (const o of over) console.log(`  ${o}`);
console.log(`Ids sem en: ${noEn.length}${noEn.length ? ` (${noEn.join(', ')})` : ''}`);
console.log(`Outros problemas: ${problems.length}`);
for (const p of problems) console.log(`  ${p}`);
if (over.length || noEn.length || problems.length) process.exitCode = 1;
