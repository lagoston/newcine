#!/usr/bin/env node
/**
 * Copia o motor do pôquer para dentro da Edge Function poker-bounty (SPEC §4.8).
 *
 *   node scripts/sync-poker-engine.mjs           copia e gera os hashes
 *   node scripts/sync-poker-engine.mjs --check   só confere (sai com 1 se a cópia estiver velha)
 *
 * 03/11/2026 (pacote C):
 *   - Copia, com os mesmos caminhos relativos, src/lib/poker/{cards,rng,evaluator,
 *     engine,equity,types,config}.ts, bots/** e match/** para
 *     supabase/functions/poker-bounty/_engine/. dialogue/, client/, tutorial/ e
 *     index.ts ficam de fora (a Edge nunca roda treino nem falas).
 *   - Cada cópia ganha o cabeçalho "GERADO … não edite". Os imports internos já
 *     usam a extensão .ts, então o Deno resolve sem mudança.
 *   - ENGINE_HASH = sha256 (16 hex) dos fontes em ordem de caminho. Vai para
 *     _engine/ENGINE_HASH.ts e para src/lib/poker/engineHash.ts (este fica fora
 *     da conta). Cada partida com prêmio guarda o hash do motor que a jogou.
 *   - Arquivo gerado que não tem mais fonte é removido da cópia (só os que
 *     levam o cabeçalho; nada fora de _engine/ é tocado).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/lib/poker');
const OUT = join(ROOT, 'supabase/functions/poker-bounty/_engine');
const HASH_SRC = join(SRC, 'engineHash.ts');
const HASH_OUT = join(OUT, 'ENGINE_HASH.ts');

const TOP_FILES = ['cards', 'rng', 'evaluator', 'engine', 'equity', 'types', 'config'].map((n) => `${n}.ts`);
const DIRS = ['bots', 'match'];

const HEADER = (rel) => `// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/${rel}\n`;
const HASH_FILE = (hash, where) =>
  `// GERADO por scripts/sync-poker-engine.mjs — não edite (${where}).\n` +
  '// sha256 (16 hex) dos fontes do motor copiados para a Edge poker-bounty.\n' +
  `export const ENGINE_HASH = '${hash}';\n`;

const toPosix = (p) => p.split(sep).join('/');

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Os fontes que vão para a Edge, em ordem de caminho (relativo a src/lib/poker). */
function sources() {
  const files = [];
  for (const f of TOP_FILES) {
    const full = join(SRC, f);
    if (!existsSync(full)) throw new Error(`Falta src/lib/poker/${f}`);
    files.push(full);
  }
  for (const d of DIRS) files.push(...walk(join(SRC, d)));
  return files.map((full) => toPosix(relative(SRC, full))).sort();
}

export function computeEngineHash(rels = sources()) {
  const h = createHash('sha256');
  for (const rel of rels) {
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(join(SRC, rel)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 16);
}

/** O que deveria existir em _engine/ (caminho → conteúdo). */
export function expectedOutput() {
  const rels = sources();
  const hash = computeEngineHash(rels);
  const files = new Map();
  for (const rel of rels) files.set(rel, HEADER(rel) + readFileSync(join(SRC, rel), 'utf8'));
  files.set('ENGINE_HASH.ts', HASH_FILE(hash, 'cópia da Edge'));
  return { hash, files };
}

function generatedInOut() {
  return walk(OUT)
    .filter((full) => readFileSync(full, 'utf8').startsWith('// GERADO por scripts/sync-poker-engine.mjs'))
    .map((full) => toPosix(relative(OUT, full)));
}

/** Diferenças entre a cópia atual e a esperada (lista vazia = em dia). */
export function checkSync() {
  const { hash, files } = expectedOutput();
  const problems = [];
  for (const [rel, content] of files) {
    const full = join(OUT, rel);
    if (!existsSync(full)) problems.push(`falta _engine/${rel}`);
    else if (readFileSync(full, 'utf8') !== content) problems.push(`desatualizado: _engine/${rel}`);
  }
  for (const rel of generatedInOut()) if (!files.has(rel)) problems.push(`sobrando: _engine/${rel}`);
  const appHash = existsSync(HASH_SRC) ? readFileSync(HASH_SRC, 'utf8') : '';
  if (appHash !== HASH_FILE(hash, 'cópia do app')) problems.push('src/lib/poker/engineHash.ts não bate com o motor');
  return { hash, problems };
}

export function sync() {
  const { hash, files } = expectedOutput();
  let written = 0;
  for (const [rel, content] of files) {
    const full = join(OUT, rel);
    if (existsSync(full) && readFileSync(full, 'utf8') === content) continue;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    written += 1;
  }
  let removed = 0;
  for (const rel of generatedInOut()) {
    if (files.has(rel)) continue;
    rmSync(join(OUT, rel));
    removed += 1;
  }
  const appHash = HASH_FILE(hash, 'cópia do app');
  if (!existsSync(HASH_SRC) || readFileSync(HASH_SRC, 'utf8') !== appHash) writeFileSync(HASH_SRC, appHash);
  return { hash, total: files.size, written, removed };
}

const isMain = process.argv[1] && toPosix(process.argv[1]).endsWith('scripts/sync-poker-engine.mjs');
if (isMain) {
  if (process.argv.includes('--check')) {
    const { hash, problems } = checkSync();
    if (problems.length > 0) {
      console.error(`Cópia do motor desatualizada (ENGINE_HASH esperado ${hash}):`);
      for (const p of problems) console.error(`  - ${p}`);
      console.error('Rode: node scripts/sync-poker-engine.mjs');
      process.exit(1);
    }
    console.log(`Cópia do motor em dia. ENGINE_HASH ${hash}`);
  } else {
    const r = sync();
    console.log(`ENGINE_HASH ${r.hash} · ${r.total} arquivos em _engine/ (${r.written} gravados, ${r.removed} removidos)`);
  }
}
