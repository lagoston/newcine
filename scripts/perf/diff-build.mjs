#!/usr/bin/env node
// Compara dois builds (o de antes e o de depois de uma mudança) e diz o que um
// navegador que já tinha o primeiro guardado teria de baixar de novo
// (18/11/2026, Protocolo Reborn, pacote). É a medida da "cascata de nomes":
// uma mudança pequena deve trocar poucos arquivos.
//
// Conta, em /static (nomes com hash) e /core (eixos de nome fixo):
//   • arquivos de /static com nome novo (é o que os navegadores atuais baixam);
//   • arquivos de /core com conteúdo novo (só navegadores antigos, sem import map);
//   • entradas novas ou alteradas no pré-cache do service worker.
//
// Uso: node scripts/perf/diff-build.mjs <build antes> <build depois> [-v]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [before, after] = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const verbose = process.argv.includes('-v');
if (!before || !after) {
  console.error('Uso: node scripts/perf/diff-build.mjs <build antes> <build depois> [-v]');
  process.exit(1);
}
const list = (build, folder) => {
  const full = path.join(build, folder);
  // builds antigos (antes de 18/11/2026) usavam /assets no lugar de /static
  const dir = fs.existsSync(full) ? full : folder === 'static' && fs.existsSync(path.join(build, 'assets')) ? path.join(build, 'assets') : null;
  const out = new Map();
  if (dir) for (const name of fs.readdirSync(dir)) if (/\.(js|css)$/.test(name)) out.set(name, fs.readFileSync(path.join(dir, name)));
  return out;
};
const br = (buffer) => zlib.brotliCompressSync(buffer).length;
const kb = (bytes) => (bytes / 1024).toFixed(0);

const staticBefore = list(before, 'static');
const staticAfter = list(after, 'static');
const renamed = [...staticAfter].filter(([name]) => !staticBefore.has(name));
const raw = renamed.reduce((sum, [, buffer]) => sum + buffer.length, 0);
const compressed = renamed.reduce((sum, [, buffer]) => sum + br(buffer), 0);
const total = [...staticAfter.values()].reduce((sum, buffer) => sum + buffer.length, 0);
console.log(`/static: ${staticAfter.size} arquivos js/css | com nome novo: ${renamed.length} | a baixar de novo: ${kb(raw)} KB (comprimido ${kb(compressed)} KB) de ${kb(total)} KB`);
if (verbose) console.log(renamed.map(([name]) => `  ${name}`).join('\n'));

const coreBefore = list(before, 'core');
const coreAfter = list(after, 'core');
if (coreAfter.size) {
  const changed = [...coreAfter].filter(([name, buffer]) => !coreBefore.has(name) || !coreBefore.get(name).equals(buffer));
  console.log(`/core (só navegador sem import map): ${coreAfter.size} arquivos | com conteúdo novo: ${changed.length}${changed.length ? ` (${changed.map(([name]) => name).join(', ')}; comprimido ${kb(changed.reduce((sum, [, buffer]) => sum + br(buffer), 0))} KB)` : ''}`);
}

const precache = (build) => {
  const sw = fs.readFileSync(path.join(build, 'sw.js'), 'utf8');
  return [...sw.matchAll(/url:"([^"]+)",revision:(?:"([^"]+)"|null)/g)].map((match) => `${match[1]}|${match[2] || ''}`);
};
try {
  const old = new Set(precache(before));
  const now = precache(after);
  const fresh = now.filter((entry) => !old.has(entry));
  console.log(`pré-cache do service worker: ${now.length} entradas | novas ou alteradas: ${fresh.length}${verbose && fresh.length ? ` (${fresh.map((entry) => entry.split('|')[0]).join(', ')})` : ''}`);
} catch (error) {
  console.log('sw.js:', error.message);
}
