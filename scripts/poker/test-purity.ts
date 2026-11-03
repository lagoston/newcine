/**
 * Pureza do núcleo (SPEC §3.7 e §8, pacote A, item 5). Em src/lib/poker, fora de
 * dialogue/ e client/, sem comentários: nenhum uso de Math.random(), Date, performance,
 * window ou document (combinado com o coordenador em 03/11/2026: procura o USO, não a
 * palavra — o motor tem uma variável local chamada `window`). Nos bots, nada de
 * Math.exp/log/pow (§3.7). Nada de import de pacote npm no que vai para a Edge.
 *
 *   node scripts/poker/test-purity.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { check, finish, section } from './lib/harness.ts';

const ROOT = new URL('../../src/lib/poker/', import.meta.url).pathname;
const SKIP = new Set(['dialogue', 'client']);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP.has(name)) out.push(...files(p));
    } else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Tira comentários de linha e de bloco sem mexer em strings. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\.random\s*\(/, 'Math.random()'],
  [/\bDate\b/, 'Date'],
  [/\bperformance\s*\./, 'performance'],
  [/\bwindow\s*\./, 'window.'],
  [/(^|[^.\w])window\s*\[/, 'window['],
  [/\bdocument\s*\./, 'document.'],
  [/\bglobalThis\b/, 'globalThis'],
];

section('nada de relógio, aleatoriedade global ou DOM');
const all = files(ROOT);
let scanned = 0;
for (const f of all) {
  const rel = relative(ROOT, f);
  const code = stripComments(readFileSync(f, 'utf8'));
  scanned++;
  for (const [re, label] of FORBIDDEN) {
    const lines = code.split('\n');
    lines.forEach((ln, k) => check(!re.test(ln), `${rel}:${k + 1} usa ${label}`));
  }
  if (rel.startsWith('bots/')) {
    check(!/\bMath\.(exp|log|pow|log2|log10|expm1|log1p)\s*\(/.test(code), `${rel}: Math.exp/log/pow nas decisões`);
  }
  if (!rel.startsWith('tutorial/')) {
    for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      check(m[1].startsWith('./') || m[1].startsWith('../'), `${rel}: import não relativo (${m[1]})`);
      check(m[1].endsWith('.ts'), `${rel}: import sem extensão .ts (${m[1]})`);
    }
  }
}
console.log(`  ${scanned} arquivos em src/lib/poker (fora de dialogue/ e client/)`);

section('o detector pega o que deve');
{
  const bad = stripComments('const x = Math.random(); // Date\nconst y = window.innerWidth; /* document.body */\nconst ok = "Date";');
  check(FORBIDDEN[0][0].test(bad), 'acha Math.random()');
  check(FORBIDDEN[3][0].test(bad), 'acha window.');
  check(!FORBIDDEN[5][0].test(bad), 'ignora document em comentário');
  check(!/\bDate\b/.test(bad.split('\n')[0]), 'ignora Date em comentário');
}
finish();
