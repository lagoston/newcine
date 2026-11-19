#!/usr/bin/env node
// CONFERE O SERVICE WORKER E A TROCA DE VERSÃO (18/11/2026, Protocolo Reborn,
// pacote). Precisa de DOIS builds de teste (scripts/perf/vite.smoke.config.ts):
// o "de antes" e o "de depois" de um deploy (qualquer mudança numa tela e/ou no
// código comum). Abre o primeiro num Chromium com service worker de verdade,
// troca o servidor para o segundo no meio do caminho e confere:
//
//   1. Registro no ocioso: o sw.js só é pedido DEPOIS da primeira tela útil.
//   2. Pré-cache enxuto: o service worker baixa só a casca; e o que a página já
//      tinha baixado (a Home) entra no cache sem ir à rede de novo.
//   3. Sem rede: recarregar com o servidor desligado abre a Home do aparelho.
//   4. Deploy com o site aberto: a pessoa, ainda na versão antiga, toca numa
//      tela que nunca abriu (o arquivo antigo já não existe). O site troca
//      para a versão nova sozinho e abre a tela — sem tela branca, sem aviso
//      de erro.
//   5. Aviso de versão nova: quem recarrega depois do deploy vê o aviso do
//      site com "Atualizar"; o botão troca para a versão nova.
//
// Uso: node scripts/perf/deploy-check.mjs <build antes> <build depois> [--port 5204] [--shots pasta]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [before, after] = args.filter((arg, index) => !arg.startsWith('--') && !['--port', '--shots'].includes(args[index - 1]));
if (!before || !after) {
  console.error('Uso: node scripts/perf/deploy-check.mjs <build antes> <build depois> [--port 5204] [--shots pasta]');
  process.exit(1);
}
const port = Number(flag('--port', 5204));
const shots = flag('--shots', null);
if (shots) fs.mkdirSync(shots, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const entryOf = (dir) => (fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/<script type="module"[^>]*src="([^"]+)"/) || [])[1];
const ENTRY = { before: entryOf(before), after: entryOf(after) };
if (ENTRY.before === ENTRY.after) console.log('ATENÇÃO: os dois builds têm a mesma entrada (são iguais?)');

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
let hits = [];
let server = await startServer(before, port, { onRequest: (pathname, status) => hits.push({ pathname, status, at: Date.now() }) });
const serve = async (dir) => {
  await server.close();
  server = await startServer(dir, port, { onRequest: (pathname, status) => hits.push({ pathname, status, at: Date.now() }) });
};
let bad = 0;
const check = (ok, text) => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok   ' : '  FALHA'} ${text}`);
};
const newContext = async () => {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, serviceWorkers: 'allow' });
  await context.addInitScript(() => {
    localStorage.setItem('measure_guest', '0');
    localStorage.setItem('i18nextLng', 'pt');
  });
  // Só o próprio servidor responde (as rotas do Playwright não pegam os pedidos do service worker, e tudo bem).
  await context.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  return context;
};
const waitFirstScreen = (page) => page.waitForFunction(() => performance.getEntriesByName('co:first-screen').length > 0, null, { timeout: 30000 });
const entryInPage = (page) => page.evaluate(() => document.querySelector('script[type="module"][src]')?.getAttribute('src'));
const swState = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    const count = async (match) => {
      let total = 0;
      for (const name of names.filter((n) => n.includes(match))) total += (await (await caches.open(name)).keys()).length;
      return total;
    };
    return { active: !!registration?.active, waiting: !!registration?.waiting, controlled: !!navigator.serviceWorker.controller, precache: await count('precache'), appStatic: await count('app-static'), fonts: await count('app-fonts') };
  });

try {
  // ---------- 1 e 2: primeira visita ----------
  console.log('1–2. Primeira visita (versão de antes)');
  let context = await newContext();
  let page = await context.newPage();
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await waitFirstScreen(page);
  const firstScreenAt = Date.now();
  const swBefore = hits.some((hit) => hit.pathname === '/sw.js');
  check(!swBefore, `o sw.js não foi pedido antes da primeira tela útil (tela útil em ${firstScreenAt - t0} ms)`);
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.active), null, { timeout: 30000 });
  const swHit = hits.find((hit) => hit.pathname === '/sw.js');
  check(!!swHit && swHit.at >= firstScreenAt, `o sw.js foi pedido ${swHit ? swHit.at - firstScreenAt : '?'} ms depois da primeira tela útil`);
  await page.waitForTimeout(2500); // tempo para a entrega da lista do que a página já baixou
  let state = await swState(page);
  const pageStatic = new Set(hits.filter((hit) => hit.at <= firstScreenAt + 200 && hit.pathname.startsWith('/static/')).map((hit) => hit.pathname));
  const refetched = [...new Set(hits.filter((hit) => hit.pathname.startsWith('/static/') && hit.status === 200).map((hit) => hit.pathname))].filter((pathname) => hits.filter((hit) => hit.pathname === pathname && hit.status === 200).length > 1);
  check(state.precache > 0 && state.precache <= 40, `pré-cache só da casca: ${state.precache} entradas`);
  check(state.appStatic > 0, `as telas que a página já tinha baixado entraram no cache: ${state.appStatic} arquivos em app-static, ${state.fonts} fonte(s) em app-fonts`);
  const totalStatic = fs.readdirSync(path.join(before, 'static')).filter((name) => /\.(js|css)$/.test(name)).length;
  const servedStatic = new Set(hits.filter((hit) => hit.pathname.startsWith('/static/')).map((hit) => hit.pathname)).size;
  check(servedStatic < totalStatic / 2, `o servidor entregou ${servedStatic} dos ${totalStatic} arquivos de /static (antes o service worker baixava todos)`);
  console.log(`         (a página pediu ${pageStatic.size} arquivos de /static até a tela útil; pedidos repetidos ao servidor: ${refetched.length})`);

  // ---------- 3: sem rede ----------
  console.log('3. Sem rede (servidor desligado), segunda visita');
  await server.close();
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  let offlineOk = true;
  try {
    await waitFirstScreen(page);
  } catch {
    offlineOk = false;
  }
  const offlineText = await page.evaluate(() => (document.querySelector('main')?.innerText || '').trim().length).catch(() => 0);
  check(offlineOk && offlineText > 20, `a Home abriu do aparelho, sem servidor (texto: ${offlineText})`);
  if (shots) await page.screenshot({ path: path.join(shots, 'sw-3-sem-rede.png') });
  server = await startServer(before, port, { onRequest: (pathname, status) => hits.push({ pathname, status, at: Date.now() }) });

  // ---------- 4: deploy com o site aberto ----------
  console.log('4. Deploy com o site aberto: tela nunca aberta, com o nome antigo');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFirstScreen(page);
  check((await entryInPage(page)) === ENTRY.before, 'a página está na versão de antes');
  await serve(after); // o deploy
  hits = [];
  let loads = 0;
  page.on('load', () => loads++);
  await page.locator('a[href="/library"]:visible').first().click();
  await page.waitForFunction((entry) => document.querySelector('script[type="module"][src]')?.getAttribute('src') === entry && (document.querySelector('main')?.innerText || '').trim().length > 20 && !document.querySelector('main [role=status]'), ENTRY.after, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => ({ path: location.pathname, alert: !!document.querySelector('main [role=alert]'), text: (document.querySelector('main')?.innerText || '').trim().length, entry: document.querySelector('script[type="module"][src]')?.getAttribute('src') }));
  const missing = hits.filter((hit) => hit.status === 404).map((hit) => hit.pathname);
  check(missing.length > 0, `a tela antiga já não existia no servidor (404: ${missing.slice(0, 2).join(', ') || 'nenhum'})`);
  check(result.entry === ENTRY.after, `o site trocou sozinho para a versão nova (${result.entry})`);
  check(result.path === '/library' && result.text > 20 && !result.alert, `a Biblioteca abriu, sem aviso de erro (texto: ${result.text}; recargas: ${loads})`);
  if (shots) await page.screenshot({ path: path.join(shots, 'sw-4-deploy-com-site-aberto.png') });
  await context.close();

  // ---------- 5: aviso de versão nova ----------
  console.log('5. Aviso de versão nova');
  await serve(before);
  context = await newContext();
  page = await context.newPage();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await waitFirstScreen(page);
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => !!r?.active), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' }); // agora controlada pelo service worker de antes
  await waitFirstScreen(page);
  state = await swState(page);
  check(state.controlled, 'segunda visita: a página é servida pelo service worker');
  await serve(after); // o deploy
  await page.reload({ waitUntil: 'domcontentloaded' }); // o navegador confere o sw.js a cada navegação
  await waitFirstScreen(page);
  check((await entryInPage(page)) === ENTRY.before, 'logo depois do deploy a página ainda é a de antes (o service worker novo espera)');
  const notice = page.getByText('Tem versão nova do CineOracle.');
  let shown = true;
  await notice.waitFor({ timeout: 40000 }).catch(() => (shown = false));
  check(shown, 'apareceu o aviso do site "Tem versão nova do CineOracle." (não um confirm() do navegador)');
  if (shots && shown) await page.screenshot({ path: path.join(shots, 'sw-5-aviso-de-versao.png') });
  if (shown) {
    await page.getByRole('button', { name: 'Atualizar' }).click();
    await page.waitForFunction((entry) => document.querySelector('script[type="module"][src]')?.getAttribute('src') === entry, ENTRY.after, { timeout: 30000 }).catch(() => {});
    check((await entryInPage(page)) === ENTRY.after, '"Atualizar" trocou para a versão nova');
  }
  await context.close();
} finally {
  await browser.close();
  await server.close().catch(() => {});
}
console.log(bad ? `SERVICE WORKER: ${bad} conferência(s) falharam` : 'SERVICE WORKER: tudo certo');
process.exit(bad ? 1 : 0);
