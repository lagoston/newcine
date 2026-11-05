/**
 * Gera o banco de falas da Mesa dos Oráculos a partir das fontes do roteirista
 * (SPEC §3.8). Porte do `scripts/poker/gen-lines.ts`, com o formato novo (05/11/2026).
 *
 *   node scripts/mesa/gen-lines.ts           → src/lib/mesa/dialogue/{lines.pt,lines.en}.ts
 *   node scripts/mesa/gen-lines.ts --check   → só valida e mostra as contagens
 *   node scripts/mesa/gen-lines.ts --md F    → também grava a versão de leitura (Markdown) em F
 *
 * Fontes: scripts/mesa/falas-src/0*.txt. Os .ts gerados nunca são editados à mão.
 *
 * Formato (uma entrada por linha):
 *   # Título pt || Title en                  (cabeçalho; só para a leitura)
 *   % parágrafo pt || paragraph en           (nota do roteirista; só para a leitura)
 *   // comentário
 *   ID | who | beat | cond | P1-3 | flags | pt | en
 *   =ID | banter | cond | P1-3 | flags | título pt || title en      (troca atômica)
 *   > who | pt | en                          (balão da troca; 2 ou 3 por troca)
 *
 * cond: vírgulas; "-" = nenhuma; "!x" = negação. flags: "-" ou once=week|life, w=2.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEATS } from '../../src/lib/mesa/dialogue/types.ts';
import type { Beat, MesaExchange, MesaLine, OracleId, Speaker } from '../../src/lib/mesa/dialogue/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(HERE, 'falas-src');
const OUT = join(ROOT, 'src', 'lib', 'mesa', 'dialogue');

const WHO: Speaker[] = ['bogart', 'fincher', 'cypher', 'espelho'];
const ORACLES: OracleId[] = ['bogart', 'fincher', 'cypher'];

interface Flags { once?: 'week' | 'life'; weight?: number }
type Item =
  | { k: 'h'; lvl: number; pt: string; en: string }
  | { k: 'p'; pt: string; en: string }
  | { k: 'l'; line: MesaLine; en: string; where: string }
  | { k: 'x'; ex: MesaExchange; en: string[]; tpt: string; ten: string; where: string };

const errors: string[] = [];
const items: Item[] = [];
const ids = new Set<string>();

function parseFlags(raw: string, where: string): Flags {
  const f: Flags = {};
  if (raw === '-' || raw === '') return f;
  for (const it of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
    const [k, v] = it.split('=');
    if (k === 'once' && (v === 'week' || v === 'life')) f.once = v;
    else if (k === 'w' && Number(v) > 0) f.weight = Number(v);
    else errors.push(`${where}: marca desconhecida "${it}"`);
  }
  return f;
}

function parseCond(raw: string): string[] | undefined {
  if (raw === '-' || raw === '') return undefined;
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

function parseP(raw: string, where: string): 1 | 2 | 3 {
  const m = /^P([123])$/.exec(raw);
  if (!m) {
    errors.push(`${where}: prioridade inválida "${raw}"`);
    return 2;
  }
  return Number(m[1]) as 1 | 2 | 3;
}

function claimId(id: string, where: string): void {
  if (!/^[A-Z][A-Za-z0-9]{1,8}$/.test(id)) errors.push(`${where}: id inválido "${id}"`);
  if (ids.has(id)) errors.push(`${where}: id duplicado ${id}`);
  ids.add(id);
}

const files = readdirSync(SRC).filter((f) => /^\d\d-.+\.txt$/.test(f)).sort();
if (!files.length) errors.push(`nenhuma fonte em ${SRC}`);

for (const fn of files) {
  const lines = readFileSync(join(SRC, fn), 'utf8').split('\n');
  lines.forEach((raw, idx) => {
    const s = raw.replace(/\r$/, '');
    if (!s.trim() || s.trimStart().startsWith('//')) return;
    const where = `${fn}:${idx + 1}`;
    if (s.startsWith('#')) {
      const lvl = s.length - s.replace(/^#+/, '').length;
      const [pt, en] = s.replace(/^#+/, '').split('||').map((x) => x.trim());
      items.push({ k: 'h', lvl, pt, en: en ?? pt });
      return;
    }
    if (s.startsWith('%')) {
      const [pt, en] = s.slice(1).split('||').map((x) => x.trim());
      items.push({ k: 'p', pt, en: en ?? pt });
      return;
    }
    if (s.startsWith('=')) {
      const f = s.slice(1).split(' | ').map((x) => x.trim());
      if (f.length !== 6) { errors.push(`${where}: troca com ${f.length} campos (esperado 6)`); return; }
      const [id, beat, cond, P, flags, title] = f;
      claimId(id, where);
      if (beat !== 'banter') errors.push(`${where}: troca precisa do tempo "banter"`);
      const c = parseCond(cond);
      if (!c) errors.push(`${where}: troca sem situação (cond)`);
      const fl = parseFlags(flags, where);
      const [tpt, ten] = title.split('||').map((x) => x.trim());
      const ex: MesaExchange = { id, beat: 'banter', cond: c ?? [], priority: parseP(P, where), parts: [] };
      if (fl.once) ex.once = fl.once;
      if (fl.weight) ex.weight = fl.weight;
      items.push({ k: 'x', ex, en: [], tpt, ten: ten ?? tpt, where });
      return;
    }
    if (s.startsWith('>')) {
      const f = s.slice(1).split(' | ').map((x) => x.trim());
      const last = items[items.length - 1];
      if (!last || last.k !== 'x') { errors.push(`${where}: balão fora de troca`); return; }
      if (f.length !== 3) { errors.push(`${where}: balão com ${f.length} campos (esperado 3)`); return; }
      const [who, pt, en] = f;
      if (!ORACLES.includes(who as OracleId)) errors.push(`${where}: balão de "${who}" (só bogart/fincher/cypher)`);
      if (!pt || !en) errors.push(`${where}: balão sem pt ou en`);
      last.ex.parts.push({ who: who as OracleId, pt });
      last.en.push(en);
      return;
    }
    const f = s.split(' | ').map((x) => x.trim());
    if (f.length !== 8) { errors.push(`${where}: entrada com ${f.length} campos (esperado 8): ${s.slice(0, 70)}`); return; }
    const [id, who, beat, cond, P, flags, pt, en] = f;
    claimId(id, where);
    if (!WHO.includes(who as Speaker)) errors.push(`${where}: falante desconhecido "${who}"`);
    if (!BEATS.includes(beat as Beat)) errors.push(`${where}: tempo desconhecido "${beat}"`);
    if (!pt || !en) errors.push(`${where}: ${id} sem pt ou en`);
    const fl = parseFlags(flags, where);
    const line: MesaLine = { id, who: who as Speaker, beat: beat as Beat, priority: parseP(P, where), pt };
    const c = parseCond(cond);
    if (c) line.cond = c;
    if (fl.once) line.once = fl.once;
    if (fl.weight) line.weight = fl.weight;
    items.push({ k: 'l', line, en, where });
  });
}

for (const it of items) {
  if (it.k === 'x' && (it.ex.parts.length < 2 || it.ex.parts.length > 3)) {
    errors.push(`${it.where}: troca ${it.ex.id} com ${it.ex.parts.length} balões (2 ou 3)`);
  }
}

const LINES = items.filter((i): i is Extract<Item, { k: 'l' }> => i.k === 'l');
const EXCH = items.filter((i): i is Extract<Item, { k: 'x' }> => i.k === 'x');

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

const ORDER = ['id', 'who', 'beat', 'cond', 'priority', 'once', 'weight', 'pt'];
function lit(o: Record<string, unknown>, order: string[]): string {
  const keys = [...order.filter((k) => k in o), ...Object.keys(o).filter((k) => !order.includes(k))];
  return `{ ${keys.filter((k) => o[k] !== undefined).map((k) => `${k}: ${JSON.stringify(o[k])}`).join(', ')} }`;
}

function emitPt(): string {
  return [
    '// GERADO por scripts/mesa/gen-lines.ts a partir de scripts/mesa/falas-src/ (texto pt e metadados).',
    '// Não edite à mão: mude as fontes e rode `node scripts/mesa/gen-lines.ts`.',
    '',
    "import type { MesaExchange, MesaLine } from './types.ts';",
    '',
    'export const LINES: MesaLine[] = [',
    ...LINES.map((l) => `  ${lit(l.line as unknown as Record<string, unknown>, ORDER)},`),
    '];',
    '',
    'export const EXCHANGES: MesaExchange[] = [',
    ...EXCH.map((x) => {
      const { parts, ...rest } = x.ex;
      const head = lit(rest as unknown as Record<string, unknown>, ['id', 'beat', 'cond', 'priority', 'once', 'weight']);
      const ps = parts.map((p) => `{ who: ${JSON.stringify(p.who)}, pt: ${JSON.stringify(p.pt)} }`).join(', ');
      return `  ${head.slice(0, -2)}, parts: [${ps}] },`;
    }),
    '];',
    '',
  ].join('\n');
}

function emitEn(): string {
  return [
    '// GERADO por scripts/mesa/gen-lines.ts a partir de scripts/mesa/falas-src/ (texto en por id; trocas = um texto por balão).',
    '// Não edite à mão: mude as fontes e rode `node scripts/mesa/gen-lines.ts`.',
    '',
    "import type { EnglishBank } from './types.ts';",
    '',
    'export const EN: EnglishBank = {',
    ...LINES.map((l) => `  ${JSON.stringify(l.line.id)}: ${JSON.stringify(l.en)},`),
    ...EXCH.map((x) => `  ${JSON.stringify(x.ex.id)}: ${JSON.stringify(x.en)},`),
    '};',
    '',
  ].join('\n');
}

const NAME: Record<string, string> = { bogart: 'Bogart', fincher: 'Fincher', cypher: 'Cypher', espelho: 'Espelho' };

function md(): string {
  const out: string[] = ['# Falas da Mesa dos Oráculos (versão de leitura, gerada)', ''];
  let table = false;
  const close = (): void => { if (table) { out.push(''); table = false; } };
  for (const it of items) {
    if (it.k === 'h') { close(); out.push(`${'#'.repeat(it.lvl + 1)} ${it.pt}`, ''); }
    else if (it.k === 'p') { close(); out.push(`_${it.pt}_`, ''); }
    else if (it.k === 'l') {
      if (!table) { out.push('| id | quem | tempo | cond | P | pt | en |', '|---|---|---|---|---|---|---|'); table = true; }
      const l = it.line;
      out.push(`| ${l.id} | ${NAME[l.who]} | ${l.beat} | ${(l.cond ?? []).join(', ') || '—'}${l.once ? ` · once=${l.once}` : ''} | P${l.priority} | ${l.pt.replace(/\|/g, '\\|')} | ${it.en.replace(/\|/g, '\\|')} |`);
    } else {
      close();
      out.push(`**${it.ex.id} · ${it.tpt}** — ${it.ex.cond.join(', ')}${it.ex.once ? ` · once=${it.ex.once}` : ''}`, '');
      it.ex.parts.forEach((p, i) => out.push(`${i + 1}. **${NAME[p.who]}:** ${p.pt} / _${it.en[i]}_`));
      out.push('');
    }
  }
  close();
  return out.join('\n');
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const mdPath = args.includes('--md') ? args[args.indexOf('--md') + 1] : null;

if (errors.length) {
  console.error('ERROS:\n' + errors.join('\n'));
  process.exit(1);
}

if (!checkOnly) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'lines.pt.ts'), emitPt(), 'utf8');
  writeFileSync(join(OUT, 'lines.en.ts'), emitEn(), 'utf8');
  if (mdPath) writeFileSync(mdPath, md(), 'utf8');
}

// Contagens por tempo × falante
const beats = [...BEATS];
const whos: Speaker[] = ['espelho', 'bogart', 'fincher', 'cypher'];
console.log(`| tempo | ${whos.map((w) => NAME[w]).join(' | ')} | total |`);
console.log(`|---|${whos.map(() => '---').join('|')}|---|`);
for (const b of beats) {
  const row = whos.map((w) => LINES.filter((l) => l.line.beat === b && l.line.who === w).length);
  console.log(`| ${b} | ${row.join(' | ')} | ${row.reduce((a, c) => a + c, 0)} |`);
}
const balloons = EXCH.reduce((s, x) => s + x.ex.parts.length, 0);
console.log(`| banter | ${whos.map((w) => EXCH.flatMap((x) => x.ex.parts).filter((p) => p.who === w).length).join(' | ')} | ${balloons} balões em ${EXCH.length} trocas |`);
console.log(`\n${LINES.length} falas soltas + ${balloons} balões em ${EXCH.length} trocas = ${LINES.length + balloons} falas pt (todas com en).`);
if (checkOnly) console.log('(--check: nada foi gravado)');
