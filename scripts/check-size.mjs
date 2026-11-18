#!/usr/bin/env node
// ORÇAMENTO DE TAMANHO E CONFERÊNCIA DO BUILD (18/11/2026, Protocolo Reborn,
// pacote) — `npm run check:size` (depois de `vite build`).
//
// Para que serve: pegar no próprio build as regressões que a auditoria de
// desempenho achou à mão — uma biblioteca de 300 KB entrando na abertura, um
// pedaço inchando, um deploy pequeno que troca o nome de 80 arquivos, o service
// worker voltando a baixar o site inteiro, uma fonte voltando a vir do Google.
//
// O que ele confere:
//   ERROS (estrutura; saem com código 1):
//     • o "import map" dos pedaços-eixo existe, é o primeiro script do <head> e
//       aponta para arquivos que existem (ver stableHubs no vite.config.ts);
//     • nenhum pedaço cita um eixo pelo nome com hash (a cascata voltaria);
//     • o pré-cache do service worker tem a casca inteira (senão o site não
//       abre sem rede) e só a casca (senão volta a baixar o site todo);
//     • nada pede fonte ao Google; toda fonte citada no CSS existe em /fonts.
//   AVISOS (orçamento; só falham com --strict):
//     • tamanho comprimido (brotli) da casca, da abertura logada (casca + Home)
//       e da Biblioteca, contra os limites de BUDGET, abaixo;
//     • pedaço grande demais; arquivos minúsculos demais; pedaço de ícones
//       inchado (sinal de `import * as … from 'lucide-react'`: importe os
//       ícones pelo nome, `import { Star } from 'lucide-react'`);
//     • "raio da cascata": quantos arquivos trocam de nome se um pedaço mudar.
//
// Os limites de BUDGET são os números de 18/11/2026 com ~10% de folga. Quando
// um mundo novo entrar de propósito, ajuste o limite NO MESMO commit e diga o
// porquê na mensagem.
//
// Uso:
//   npm run check:size                    confere ./dist
//   npm run check:size -- <pasta>         confere outro build
//   npm run check:size -- --strict        avisos também falham (para o CI)
//   npm run check:size -- --json          resultado em JSON (para comparar builds)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const JSON_OUT = args.includes('--json');
const build = path.resolve(args.find((arg) => !arg.startsWith('--')) || path.join(ROOT, 'dist'));

// Limites em KB comprimidos (brotli 11, o que o Netlify entrega).
const BUDGET = {
  shellKB: 215, // casca: entrada + eixos + CSS global + 1 idioma (18/11/2026: 193)
  homeKB: 330, // abertura logada: casca + Home (18/11/2026: 298)
  libraryKB: 360, // casca + Biblioteca (18/11/2026: 324)
  chunkKB: 95, // qualquer pedaço sozinho (os maiores hoje: xlsx 89, MovieDetailsModal 55)
  iconsKB: 12, // o pedaço dos ícones (18/11/2026: 8,6)
  tinyFiles: 25, // arquivos JS com menos de 1 KB (18/11/2026: 15)
  precacheKB: 300, // o que o service worker baixa de antemão (18/11/2026: 259)
  precacheFiles: 40,
  cascade: 45, // um pedaço com hash cujo nome é citado, direta ou indiretamente, por mais que isto
};

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);
const kb = (bytes) => (bytes / 1024).toFixed(1);

if (!fs.existsSync(path.join(build, 'index.html'))) {
  console.error(`check:size: não achei ${path.join(build, 'index.html')} — rode "vite build" antes (ou passe a pasta do build).`);
  process.exit(2);
}

// ---------- arquivos do build ----------
const files = new Map(); // 'static/x.js' → { raw, br, text }
for (const folder of ['static', 'core']) {
  const full = path.join(build, folder);
  if (!fs.existsSync(full)) continue;
  for (const name of fs.readdirSync(full)) {
    if (!/\.(js|css)$/.test(name)) continue;
    const buffer = fs.readFileSync(path.join(full, name));
    files.set(`${folder}/${name}`, { raw: buffer.length, br: zlib.brotliCompressSync(buffer).length, text: buffer.toString('utf8') });
  }
}
const html = fs.readFileSync(path.join(build, 'index.html'), 'utf8');
const sw = fs.existsSync(path.join(build, 'sw.js')) ? fs.readFileSync(path.join(build, 'sw.js'), 'utf8') : '';
const size = (list, key) => [...list].reduce((sum, file) => sum + (files.get(file)?.[key] ?? 0), 0);

// ---------- o import map dos eixos ----------
const mapMatch = html.match(/<script type="importmap"[^>]*>([\s\S]*?)<\/script>/);
const hubs = new Map(); // 'core/app-core.js' → 'static/app-core-HASH.js'
if (!mapMatch) {
  fail('index.html sem <script type="importmap"> (os pedaços-eixo ficariam sem a cópia imutável)');
} else {
  const firstScript = html.search(/<script\b/);
  const firstPreload = html.search(/<link[^>]+rel="modulepreload"/);
  if (firstScript !== mapMatch.index) fail('o import map não é o primeiro <script> do index.html (o navegador o ignoraria)');
  if (firstPreload !== -1 && firstPreload < mapMatch.index) fail('há um <link rel="modulepreload"> antes do import map (o navegador ignoraria o mapa)');
  for (const [from, to] of Object.entries(JSON.parse(mapMatch[1]).imports ?? {})) {
    const plain = from.replace(/^\//, '');
    const hashed = to.replace(/^\//, '');
    if (!files.has(plain)) fail(`import map: ${from} não existe no build`);
    else if (!files.has(hashed)) fail(`import map: ${to} não existe no build`);
    else {
      hubs.set(plain, hashed);
      const expected = files.get(hashed).text.replaceAll('"../core/', '"./');
      if (expected !== files.get(plain).text) fail(`import map: ${to} não é cópia de ${from}`);
    }
  }
}
const hashedHubs = new Set(hubs.values());
const hubBase = new Set([...hashedHubs].map((file) => path.basename(file)));

// ---------- quem importa quem (import estático) ----------
const STATIC_IMPORT = /(?:\bfrom|\bimport)\s*["']([^"']+\.js)["']/g;
const deps = new Map();
for (const [file, info] of files) {
  if (!file.endsWith('.js')) continue;
  const list = new Set();
  for (const match of info.text.matchAll(STATIC_IMPORT)) {
    if (!match[1].startsWith('.')) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    list.add(hubs.get(target) ?? target); // navegador atual: o eixo vem da cópia com hash
  }
  deps.set(file, list);
}
const closure = (roots) => {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !files.has(file)) continue;
    seen.add(file);
    for (const dep of deps.get(file) ?? []) stack.push(dep);
  }
  return seen;
};
// O CSS de um pedaço leva o nome do pedaço (Home-xxxx.css é do Home-yyyy.js).
const nameOf = (file) => path.basename(file).replace(/-[\w-]{8}\.(js|css)$/, '').replace(/\.(js|css)$/, '');
const cssOf = (jsFiles) => [...files.keys()].filter((file) => file.endsWith('.css') && [...jsFiles].some((js) => nameOf(js) === nameOf(file)));
const findChunk = (name) => [...files.keys()].find((file) => file.startsWith('static/') && file.endsWith('.js') && nameOf(file) === name && !hashedHubs.has(file));

// ---------- a casca e as telas principais ----------
const entry = (html.match(/<script type="module"[^>]*src="\/([^"]+)"/) || [])[1];
if (!entry || !files.has(entry)) fail('não achei o script de entrada no index.html');
const globalCss = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map((match) => match[1]);
const locales = [...new Set([...html.matchAll(/\/(static\/(?:pt|en)-[\w-]+\.js)/g)].map((match) => match[1]))];
const shellJs = entry ? closure([entry]) : new Set();
for (const [plain, hashed] of hubs) if (!shellJs.has(hashed)) warn(`o eixo ${plain} não é carregado na abertura: tire-o de HUBS no vite.config.ts (eixo fora da abertura fica sem pré-carga)`);
const ptLocale = locales.find((file) => /\/pt-/.test(file));
const shellOne = new Set([...shellJs, ...globalCss, ...(ptLocale ? [ptLocale] : [])]);
const screen = (name) => {
  const chunk = findChunk(name);
  if (!chunk) return null;
  const js = closure([chunk]);
  return new Set([...shellOne, ...js, ...cssOf(js)]);
};
const home = screen('Home');
const library = screen('Library');

const report = { build, files: files.size, shell: { files: shellOne.size, rawKB: +kb(size(shellOne, 'raw')), brKB: +kb(size(shellOne, 'br')) } };
const check = (label, value, limit, unit = 'KB') => {
  if (value > limit) warn(`${label}: ${value} ${unit} passou do limite de ${limit} ${unit}`);
};
check('casca (entrada + eixos + CSS global + 1 idioma)', report.shell.brKB, BUDGET.shellKB);
for (const [key, label, set, limit] of [['home', 'abertura logada (casca + Home)', home, BUDGET.homeKB], ['library', 'Biblioteca (casca + rota)', library, BUDGET.libraryKB]]) {
  if (!set) {
    warn(`não achei o pedaço da tela "${key}"`);
    continue;
  }
  report[key] = { files: set.size, rawKB: +kb(size(set, 'raw')), brKB: +kb(size(set, 'br')) };
  check(label, report[key].brKB, limit);
}

// ---------- pedaços grandes, minúsculos, ícones ----------
const plainHubs = new Set(hubs.keys());
const chunks = [...files].filter(([file]) => file.endsWith('.js') && !plainHubs.has(file)).sort((a, b) => b[1].br - a[1].br);
report.biggest = chunks.slice(0, 8).map(([file, info]) => ({ file, rawKB: +kb(info.raw), brKB: +kb(info.br) }));
for (const [file, info] of chunks) if (info.br / 1024 > BUDGET.chunkKB) warn(`${file}: ${kb(info.br)} KB comprimidos (limite por pedaço: ${BUDGET.chunkKB} KB) — dá para carregar sob demanda ou dividir?`);
const tiny = chunks.filter(([, info]) => info.raw < 1024).length;
report.tinyFiles = tiny;
check('arquivos JS com menos de 1 KB', tiny, BUDGET.tinyFiles, 'arquivos');
const icons = [...hashedHubs].find((file) => nameOf(file) === 'icons');
if (icons) {
  report.iconsBrKB = +kb(files.get(icons).br);
  if (report.iconsBrKB > BUDGET.iconsKB) warn(`pedaço de ícones com ${report.iconsBrKB} KB (limite ${BUDGET.iconsKB}): há algum "import * as X from 'lucide-react'" ou um mapa de ícones? Importe cada ícone pelo nome.`);
}

// ---------- a cascata de nomes ----------
// Se o conteúdo de um pedaço com hash muda, muda o nome dele e o de todos os
// que citam esse nome (e os que citam esses…). Os eixos não entram: têm nome fixo.
const cites = new Map();
const jsAndCss = [...files.keys()].filter((file) => file.startsWith('static/'));
for (const file of jsAndCss) cites.set(file, []);
for (const [file, info] of files) {
  if (plainHubs.has(file)) continue; // a cópia com hash do eixo responde por ele
  for (const other of jsAndCss) {
    if (other === file) continue;
    const base = path.basename(other);
    if (!info.text.includes(base)) continue;
    if (hubBase.has(base)) fail(`${file} cita o eixo pelo nome com hash (${base}): a cascata de nomes voltaria`);
    else cites.get(other).push(file);
  }
}
const radius = (start) => {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) for (const next of cites.get(stack.pop()) ?? []) if (!seen.has(next) && !hashedHubs.has(next)) (seen.add(next), stack.push(next));
  return seen.size;
};
const cascade = jsAndCss.filter((file) => !hashedHubs.has(file)).map((file) => ({ file, renames: radius(file) })).sort((a, b) => b.renames - a.renames);
report.cascade = cascade.slice(0, 6);
for (const row of cascade) if (row.renames > BUDGET.cascade) warn(`mudar ${row.file} trocaria o nome de ${row.renames} arquivos (limite ${BUDGET.cascade}): candidato a pedaço-eixo, ou a ser importado por menos lugares`);

// ---------- o pré-cache do service worker ----------
if (!sw) {
  warn('build sem sw.js (o service worker não foi gerado)');
} else {
  const precache = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
  const precacheSet = new Set(precache);
  const needed = new Set(['index.html', ...shellJs, ...globalCss, ...locales]);
  for (const file of needed) if (!precacheSet.has(file)) fail(`pré-cache do service worker sem ${file}: o site não abriria sem rede`);
  const extraJs = precache.filter((file) => /^(static|core)\//.test(file) && !needed.has(file));
  if (extraJs.length) fail(`pré-cache do service worker com ${extraJs.length} arquivo(s) fora da casca (ex.: ${extraJs[0]}): voltaria a baixar telas que a pessoa talvez nunca abra`);
  const bytes = precache.reduce((sum, file) => {
    if (files.has(file)) return sum + files.get(file).br;
    const full = path.join(build, file);
    if (!fs.existsSync(full)) return sum;
    const buffer = fs.readFileSync(full);
    return sum + (/\.(html|svg|webmanifest|js|css)$/.test(file) ? zlib.brotliCompressSync(buffer).length : buffer.length);
  }, 0);
  report.precache = { files: precacheSet.size, brKB: +kb(bytes) };
  check('pré-cache do service worker', report.precache.brKB, BUDGET.precacheKB);
  check('pré-cache do service worker', report.precache.files, BUDGET.precacheFiles, 'arquivos');
}

// ---------- fontes ----------
const googleFonts = /fonts\.(googleapis|gstatic)\.com/;
if (googleFonts.test(html)) fail('index.html pede fonte ao Google Fonts (as fontes moram em /fonts)');
for (const [file, info] of files) {
  if (googleFonts.test(info.text)) fail(`${file} pede fonte ao Google Fonts (as fontes moram em /fonts; ver scripts/fonts/sync-fonts.mjs)`);
  if (!file.endsWith('.css')) continue;
  for (const match of info.text.matchAll(/url\(\/?(fonts\/[^)"']+)\)/g)) if (!fs.existsSync(path.join(build, match[1]))) fail(`${file} cita /${match[1]}, que não existe no build`);
}
for (const match of html.matchAll(/<link rel="preload"[^>]*href="\/([^"]+)"/g)) if (!fs.existsSync(path.join(build, match[1]))) fail(`index.html faz preload de /${match[1]}, que não existe no build`);

// ---------- saída ----------
if (JSON_OUT) {
  console.log(JSON.stringify({ ...report, warnings, errors }, null, 2));
} else {
  const line = (label, item, limit) => item && console.log(`  ${label.padEnd(34)} ${String(item.files).padStart(3)} arquivos  ${String(item.rawKB).padStart(7)} KB  ${String(item.brKB).padStart(6)} KB comprimidos${limit ? `  (limite ${limit})` : ''}`);
  console.log(`check:size — ${path.relative(process.cwd(), build) || '.'} (${files.size} arquivos JS/CSS)`);
  line('casca (abre e desenha a moldura)', report.shell, BUDGET.shellKB);
  line('abertura logada (casca + Home)', report.home, BUDGET.homeKB);
  line('Biblioteca (casca + rota)', report.library, BUDGET.libraryKB);
  if (report.precache) console.log(`  ${'pré-cache do service worker'.padEnd(34)} ${String(report.precache.files).padStart(3)} arquivos  ${''.padStart(10)}  ${String(report.precache.brKB).padStart(6)} KB comprimidos  (limite ${BUDGET.precacheKB})`);
  console.log(`  maiores pedaços: ${report.biggest.slice(0, 5).map((item) => `${path.basename(item.file).replace(/-[\w-]{8}\.js$/, '')} ${item.brKB}`).join(' · ')} (KB comprimidos)`);
  console.log(`  arquivos JS < 1 KB: ${report.tinyFiles} (limite ${BUDGET.tinyFiles})${report.iconsBrKB ? ` · ícones: ${report.iconsBrKB} KB (limite ${BUDGET.iconsKB})` : ''}`);
  console.log(`  cascata (se o pedaço mudar, quantos arquivos trocam de nome): ${report.cascade.slice(0, 5).map((row) => `${nameOf(row.file)} ${row.renames}`).join(' · ')}`);
  if (warnings.length) console.log(`\nAVISOS (${warnings.length}):\n- ${warnings.join('\n- ')}`);
  if (errors.length) console.log(`\nERROS (${errors.length}):\n- ${errors.join('\n- ')}`);
  if (!warnings.length && !errors.length) console.log('\nTudo dentro do orçamento.');
}
process.exit(errors.length || (STRICT && warnings.length) ? 1 : 0);
