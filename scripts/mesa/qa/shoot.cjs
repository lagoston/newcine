// WP-QA · 05/11/2026 · capturas e conferências da prévia (porta 5373) com o
// JSON real do banco. Uso: node scripts/mesa/qa/shoot.cjs <plano.json> <outDir> [scale]
// plano: [{name, url, w, h, ritual?, reduced?, init?, steps:[{click}|{tap}|{key}|{wait}|{shot}|{eval}|{type}]}]
// Por que um script próprio: o QA não usa os scripts dos construtores (podem
// mascarar o que eles já sabem); mesma técnica de fontes locais (o Google
// Fonts e o TMDB não abrem neste ambiente).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const SCALE = Number(process.argv[4] || 1);
const FDIR = '/tmp/pjprev/node_modules/@fontsource/pixelify-sans/files/';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const report = {};
  for (const run of plan) {
    const mobile = run.w < 700;
    const ctx = await browser.newContext({ viewport: { width: run.w, height: run.h }, deviceScaleFactor: SCALE, isMobile: mobile, hasTouch: mobile, reducedMotion: run.reduced ? 'reduce' : 'no-preference', locale: run.locale || 'pt-BR' });
    if (!run.ritual) await ctx.addInitScript(() => { try { sessionStorage.setItem('cineoracle:mesaEntered', '1'); } catch (e) {} });
    if (run.init) await ctx.addInitScript(run.init);
    const page = await ctx.newPage();
    const errors = [];
    const evals = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
    await page.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: ['400', '500', '600', '700'].map((w) => `@font-face{font-family:'Pixelify Sans';font-weight:${w};src:url(https://fonts.gstatic.com/local/${w}.woff2) format('woff2');}`).join('') }));
    await page.route(/fonts\.gstatic\.com\/local\//, (r) => { const w = r.request().url().match(/(\d+)\.woff2/)[1]; return r.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(`${FDIR}pixelify-sans-latin-${w}-normal.woff2`) }); });
    await page.goto(`http://127.0.0.1:5373${run.url}`, { waitUntil: 'domcontentloaded' });
    for (const s of run.steps || [{ wait: 2500 }, { shot: '' }]) {
      try {
        if (s.waitFor) await page.waitForSelector(s.waitFor, { timeout: 20000 });
        if (s.wait) await page.waitForTimeout(s.wait);
        if (s.mouse) { const b = await page.locator(s.mouse).first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
        if (s.click) await page.click(s.click, { timeout: 4000, force: !!s.force });
        if (s.tap) await page.tap(s.tap, { timeout: 4000 });
        if (s.key) await page.keyboard.press(s.key);
        if (s.type) await page.keyboard.type(s.type);
        if (s.eval) { const v = await page.evaluate(s.eval); evals.push({ step: s.label || s.eval.slice(0, 40), v }); }
        if (s.scroll !== undefined) await page.evaluate((y) => document.querySelector('.ms-scroll')?.scrollTo(0, y), s.scroll);
        if (s.shot !== undefined) await page.screenshot({ path: `${OUT}/${run.name}${s.shot ? '-' + s.shot : ''}.png`, fullPage: false });
      } catch (e) { errors.push('step ' + JSON.stringify(s).slice(0, 80) + ': ' + e.message.split('\n')[0]); }
    }
    const overflow = await page.evaluate(() => { const sc = document.querySelector('.ms-scroll'); return { docW: document.documentElement.scrollWidth, vw: innerWidth, scrollW: sc ? sc.scrollWidth : 0, clientW: sc ? sc.clientWidth : 0 }; });
    if (overflow.docW > overflow.vw || overflow.scrollW > overflow.clientW) errors.push('HORIZONTAL OVERFLOW ' + JSON.stringify(overflow));
    const calls = await page.evaluate(() => (window.__qa ? window.__qa.calls : []));
    report[run.name] = { errors, evals, calls };
    console.log(run.name, errors.length ? 'ERR ' + errors.slice(0, 5).join(' | ') : 'ok');
    for (const e of evals) console.log('  eval', e.step, String(JSON.stringify(e.v)).slice(0, 900));
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await browser.close();
})();
