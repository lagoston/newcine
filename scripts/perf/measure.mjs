#!/usr/bin/env node
// MEDE A ABERTURA de um build num "celular médio" simulado (18/11/2026,
// Protocolo Reborn, pacote; a mesma receita da auditoria de desempenho).
//
// Como mede: Chromium (Playwright), tela de celular, processador 4× mais lento
// (CDP Emulation.setCPUThrottlingRate) e rede "4G lenta" (150 ms de latência,
// 1,6 Mbps de descida). Sem cache (contexto novo a cada rodada) e, por padrão,
// sem service worker. Só o próprio servidor responde: TMDB e Supabase ficam
// cortados (o build é o de teste, com o Supabase de mentira; as prateleiras
// ficam vazias). Para builds antigos, que ainda pediam a folha de estilo ao
// Google Fonts, esse pedido é respondido depois de --font-delay ms (600 = uma
// conexão nova a outro domínio; -1 = cortado).
//
// O que sai (mediana das rodadas e cada rodada):
//   useful   ms até a TELA ÚTIL: primeiro quadro com um <h1> visível dentro do
//            <main>, sem carregador (role=status) e com texto;
//   fcp      ms até a primeira pintura com conteúdo;
//   reqs/kb  pedidos ao servidor e KB transferidos até a tela útil;
//   scriptMs / taskMs  tempo de script e de tarefas do processador;
//   heapMB   memória JS em uso.
//
// Uso: node scripts/perf/measure.mjs <build de teste> <user|guest> [rodadas=5]
//        [--port 5204] [--font-delay 600] [--sw] [--label nome]
// O build de teste: npx vite build --config scripts/perf/vite.smoke.config.ts --outDir <pasta>
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const positional = args.filter((arg, index) => !arg.startsWith('--') && !(index > 0 && ['--port', '--font-delay', '--label'].includes(args[index - 1])));
const [dir, mode = 'user', runsArg] = positional;
if (!dir) {
  console.error('Uso: node scripts/perf/measure.mjs <build de teste> <user|guest> [rodadas=5] [--port 5204] [--font-delay 600] [--sw] [--label nome]');
  process.exit(1);
}
const RUNS = Number(runsArg) || 5;
const port = Number(flag('--port', 5204));
const FONT_DELAY = Number(flag('--font-delay', 600));
const SW = args.includes('--sw') ? 'allow' : 'block';
const label = flag('--label', dir);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await startServer(dir, port);
const browser = await chromium.launch();
const rows = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      serviceWorkers: SW,
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    });
    await context.addInitScript((guest) => {
      try {
        localStorage.setItem('measure_guest', guest ? '1' : '0');
        localStorage.setItem('i18nextLng', 'pt');
      } catch {
        /* sem armazenamento */
      }
      window.__m = { useful: null };
      const tick = () => {
        const main = document.querySelector('main');
        const title = main && main.querySelector('h1');
        if (title && title.offsetParent !== null && !main.querySelector('[role=status]') && main.innerText.trim().length > 20) {
          window.__m.useful = performance.now();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, mode === 'guest');
    let google = 0;
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
      if (url.hostname === 'fonts.googleapis.com') {
        google++;
        if (FONT_DELAY >= 0) return setTimeout(() => route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonte simulada */' }).catch(() => {}), FONT_DELAY);
      }
      return route.abort();
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Performance.enable');
    const requests = new Map();
    cdp.on('Network.requestWillBeSent', (event) => {
      if (/127\.0\.0\.1/.test(event.request.url)) requests.set(event.requestId, { url: event.request.url, bytes: 0, done: false });
    });
    cdp.on('Network.loadingFinished', (event) => {
      const request = requests.get(event.requestId);
      if (request) Object.assign(request, { bytes: event.encodedDataLength, done: true });
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__m && window.__m.useful, null, { timeout: 60000, polling: 50 });
    const marks = await page.evaluate(() => ({
      useful: window.__m.useful,
      fcp: (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0,
      firstScreen: (performance.getEntriesByName('co:first-screen')[0] || {}).startTime || 0,
    }));
    const perf = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((metric) => [metric.name, metric.value]));
    const list = [...requests.values()];
    rows.push({
      useful: Math.round(marks.useful),
      fcp: Math.round(marks.fcp),
      firstScreen: Math.round(marks.firstScreen),
      reqs: list.length,
      kb: Math.round(list.reduce((sum, request) => sum + request.bytes, 0) / 1024),
      fontReqs: list.filter((request) => /\.woff2/.test(request.url)).length,
      googleReqs: google,
      scriptMs: Math.round(perf.ScriptDuration * 1000),
      taskMs: Math.round(perf.TaskDuration * 1000),
      heapMB: +(perf.JSHeapUsedSize / 1048576).toFixed(1),
    });
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const med = Object.fromEntries(Object.keys(rows[0]).map((key) => [key, median(rows.map((row) => row[key]))]));
console.log(JSON.stringify({ label, mode, fontDelay: FONT_DELAY, sw: SW, runs: RUNS, median: med, rows }));
