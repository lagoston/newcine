// Captura quadro a quadro da página do comercial (relógio controlado).
// node capture.mjs <url> <outdir> [--fps 25] [--from 0] [--to <dur>] [--stills 1,3.5,...] [--scale 3]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir, ...rest] = process.argv.slice(2);
const opt = { fps: 25, from: 0, to: null, stills: null, scale: 3 };
for (let i = 0; i < rest.length; i += 2) {
  const k = rest[i].replace(/^--/, '');
  opt[k] = k === 'stills' ? rest[i + 1].split(',').map(Number) : Number(rest[i + 1]);
}
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ['--disable-web-security', '--font-render-hinting=none'] });
const context = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: opt.scale, reducedMotion: 'no-preference' });
const page = await context.newPage();
page.on('pageerror', (e) => console.error('pageerror', e.message));
// O framer usa a Web Animations API para opacidade/transform; sem ela, tudo
// anda no requestAnimationFrame, que o relógio falso controla.
await page.addInitScript(() => {
  try {
    delete Element.prototype.animate;
  } catch {}
});
await page.clock.install({ time: new Date('2026-10-15T20:00:00Z') });
await page.goto(url, { waitUntil: 'load' });

const t0 = Date.now();
while (!(await page.evaluate(() => window.__promo && window.__promo.ready))) {
  if (Date.now() - t0 > 90000) throw new Error('page not ready');
  await page.clock.runFor(50);
  await sleep(100);
}
const duration = await page.evaluate(() => window.__promo.duration);
const to = opt.to ?? duration;
const dt = 1000 / opt.fps;

// Aquece: deixa o React montar tudo antes do quadro 0.
await page.evaluate(() => window.__promo.seek(0));
for (let i = 0; i < 10; i++) {
  await page.clock.runFor(16);
  await sleep(30);
}

const shoot = async (file) => page.screenshot({ path: file, type: 'jpeg', quality: 93 });

if (opt.stills) {
  // Stills: anda o relógio até cada tempo pedido (ordem crescente).
  let now = 0;
  for (const t of opt.stills.sort((a, b) => a - b)) {
    while (now + dt / 1000 <= t) {
      now += dt / 1000;
      await page.evaluate((x) => window.__promo.seek(x), now);
      await page.clock.runFor(dt);
    }
    await sleep(60);
    await shoot(path.join(outDir, `still_${t.toFixed(2)}.jpg`));
  }
} else {
  const first = Math.round(opt.from * opt.fps);
  const last = Math.round(to * opt.fps);
  for (let f = 0; f < last; f++) {
    const t = f / opt.fps;
    await page.evaluate((x) => window.__promo.seek(x), t);
    await page.clock.runFor(dt);
    if (f >= first) await shoot(path.join(outDir, `f_${String(f).padStart(5, '0')}.jpg`));
    if (f % 50 === 0) console.log(`frame ${f}/${last}`);
  }
}
const failed = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
if (failed.length) console.log('broken images:', failed.slice(0, 10));
await browser.close();
console.log('done');
