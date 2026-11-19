#!/usr/bin/env node
// TESTE DE FUMAÇA DO BUILD (18/11/2026, Protocolo Reborn, pacote) — `npm run smoke`.
//
// Para que serve: o site sai do build dividido em ~120 pedaços que se importam
// uns aos outros. Um erro na divisão (um ciclo entre pedaços, um pedaço-eixo
// fora do lugar, um import de fonte ou de CSS quebrado) não aparece no
// `vite build`: aparece como TELA BRANCA para quem abre o site. Este teste abre
// o build de verdade num navegador (Chromium, pelo Playwright), com o Supabase e
// o login de mentira (scripts/perf/stub/), e passa por 10 rotas como pessoa
// logada e como visitante: 20 aberturas. Falha (código de saída 1) se alguma:
//   • der erro de JavaScript na página;
//   • ficar sem texto (tela branca);
//   • mostrar o aviso de erro das telas (RouteErrorBoundary);
//   • pedir qualquer coisa ao Google Fonts (as fontes moram em /fonts).
// Depois repete 3 rotas fingindo ser um navegador antigo, sem "import map" (o
// caminho de reserva dos pedaços-eixo; ver stableHubs no vite.config.ts).
//
// QUANDO RODAR: depois de mexer em vite.config.ts, package.json, index.html,
// src/main.tsx, src/App.tsx ou em qualquer import da abertura.
//
// Uso:
//   npm run smoke                       compila (≈1–4 min) e testa
//   npm run smoke -- --dir <build>      testa um build já feito com scripts/perf/vite.smoke.config.ts
//   npm run smoke -- --port 5204        outra porta (padrão 5204)
//   npm run smoke -- --shots <pasta>    guarda uma captura de cada tela
//   npm run smoke -- --keep             não apaga o build temporário
// Precisa do Playwright com o Chromium (não é dependência do projeto, para não
// pesar no Bolt): `npm i -g playwright && npx playwright install chromium`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from './perf/serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const port = Number(option('--port')) || 5204;
const shots = option('--shots');
let dir = option('--dir');

const ROUTES = ['/', '/library', '/profile', '/community', '/oracle/acervo', '/poster-poker', '/add-movies', '/lists', '/premium', '/auth'];
const LEGACY_ROUTES = ['/', '/library', '/poster-poker'];

let chromium;
try {
  // require() (e não import) para achar o Playwright instalado globalmente (NODE_PATH)
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  console.error('O teste de fumaça precisa do Playwright: npm i -g playwright && npx playwright install chromium');
  process.exit(2);
}

let temporary = null;
if (!dir) {
  temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cineoracle-smoke-'));
  dir = temporary;
  console.log(`Compilando o build de teste em ${dir} …`);
  try {
    execFileSync('npx', ['vite', 'build', '--config', 'scripts/perf/vite.smoke.config.ts', '--outDir', dir, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('FUMAÇA: o build de teste falhou');
    process.exit(1);
  }
}

const server = await startServer(dir, port);
const browser = await chromium.launch();
const base = `http://127.0.0.1:${port}`;
let bad = 0;

async function visit(context, route, label, shotName) {
  const page = await context.newPage();
  const errors = [];
  const google = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));
  page.on('request', (request) => /fonts\.(googleapis|gstatic)\.com/.test(request.url()) && google.push(request.url()));
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => ({
    text: (document.body.innerText || '').trim().length,
    main: (document.querySelector('main')?.innerText || '').trim().length,
    alert: !!document.querySelector('main [role=alert] button'),
  }));
  const ok = errors.length === 0 && state.text >= 20 && !state.alert && google.length === 0;
  if (!ok) bad++;
  const why = [state.alert ? '[aviso de erro]' : '', state.text < 20 ? '[tela sem texto]' : '', google.length ? '[pediu fonte ao Google]' : '', ...new Set(errors)].filter(Boolean).join(' ');
  console.log(label.padEnd(10), route.padEnd(16), 'página:', String(state.text).padStart(5), 'main:', String(state.main).padStart(5), ok ? 'ok' : `FALHOU ${why}`);
  if (shots) await page.screenshot({ path: path.join(shots, `${shotName}${route.replace(/\//g, '_') || '_'}.png`) });
  await page.close();
}

async function newContext(guest, legacy = false) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, serviceWorkers: 'block' });
  await context.addInitScript(
    ([isGuest, isLegacy]) => {
      localStorage.setItem('measure_guest', isGuest ? '1' : '0');
      localStorage.setItem('i18nextLng', 'pt');
      // navegador antigo: diz que não conhece import map (e o do HTML é desligado, abaixo)
      if (isLegacy && window.HTMLScriptElement) HTMLScriptElement.supports = () => false;
    },
    [guest, legacy],
  );
  // Só o próprio servidor responde; o resto da internet (TMDB, Supabase) é cortado.
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith(base)) return route.abort();
    if (legacy && route.request().resourceType() === 'document') {
      const response = await route.fetch();
      // o navegador antigo não conhece type="importmap": o bloco vira só um texto parado
      const html = (await response.text()).replace('<script type="importmap"', '<script type="application/json"');
      return route.fulfill({ response, body: html });
    }
    return route.continue();
  });
  return context;
}

try {
  if (shots) fs.mkdirSync(shots, { recursive: true });
  for (const guest of [false, true]) {
    const context = await newContext(guest);
    for (const route of ROUTES) await visit(context, route, guest ? 'visitante' : 'logado', guest ? 'visitante' : 'logado');
    await context.close();
  }
  const total = ROUTES.length * 2;
  const mainBad = bad;
  console.log(mainBad ? `FUMAÇA: ${mainBad} rota(s) com problema` : `FUMAÇA: ${total} de ${total} ok`);

  const legacy = await newContext(false, true);
  for (const route of LEGACY_ROUTES) await visit(legacy, route, 'sem mapa', 'antigo');
  await legacy.close();
  const legacyBad = bad - mainBad;
  console.log(legacyBad ? `NAVEGADOR ANTIGO (sem import map): ${legacyBad} rota(s) com problema` : `NAVEGADOR ANTIGO (sem import map): ${LEGACY_ROUTES.length} de ${LEGACY_ROUTES.length} ok`);
} finally {
  await browser.close();
  await server.close();
  if (temporary && !args.includes('--keep')) fs.rmSync(temporary, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
