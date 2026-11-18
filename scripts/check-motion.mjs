#!/usr/bin/env node
// check:motion — o vigia das animações que gastam bateria (18/11/2026,
// Protocolo Reborn, onda 2a; auditoria: claude/otimizacao/bateria.md, 4.4).
//
// Uma animação `infinite` roda o dia inteiro com a tela parada. Se ela anima
// só `transform` e `opacity`, o celular resolve na placa de vídeo. Se anima
// qualquer outra coisa (background-position, box-shadow, filter, left, width…),
// o navegador REPINTA aquela área a cada quadro: foi o que fazia a home gastar
// meio núcleo parada. Este script lê o CSS do site e avisa:
//
//   1. animações infinitas em propriedades caras — as NOVAS (fora da lista
//      conhecida em scripts/check-motion.baseline.json) aparecem com arquivo e
//      linha; as conhecidas, só na contagem;
//   2. animações infinitas sem regra de "reduzir movimento" que as pare (é essa
//      regra que o modo economia e as molduras paradas reaproveitam; ver
//      scripts/postcss-still-motion.mjs). É uma conferência aproximada, por
//      nome de classe: confira antes de confiar.
//
// Uso:
//   npm run check:motion              resumo + o que é novo (nunca falha)
//   npm run check:motion -- --all     lista tudo
//   npm run check:motion -- --update  aceita o estado atual como conhecido
//   npm run check:motion -- --strict  sai com erro se houver algo novo (para CI)
// Roda sozinho antes de `npm run build` (script "prebuild"): só avisa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(ROOT, 'scripts', 'check-motion.baseline.json');
const args = new Set(process.argv.slice(2));

// o que o celular anima sem repintar
const CHEAP = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate', 'offset-distance']);
const IGNORED = new Set(['animation-timing-function', 'offset', 'easing']);
const REDUCE = /prefers-reduced-motion\s*:\s*reduce/i;

const kebab = (prop) => prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

function cssFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('__preview')) continue; // prévias de desenvolvimento, fora do git
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) cssFiles(full, out);
    else if (name.endsWith('.css')) out.push(full);
  }
  return out;
}

// O último pedaço do seletor: as classes e o pseudo-elemento de quem é animado.
// Quando o último pedaço é "*" ou "[atributo]" (".kit-frame *"), `universal`
// é verdadeiro e as classes são as do pedaço de antes (o "pai").
function subject(selector) {
  const parts = selector.trim().split(/\s*[\s>+~]\s*(?![^()[\]]*[)\]])/).filter(Boolean);
  let last = parts.pop() ?? '';
  const universal = /^(\*|\[)/.test(last);
  const pseudo = (last.match(/::?(before|after)\b/) ?? [''])[0].replace(/^:(?!:)/, '::');
  if (universal) last = parts.pop() ?? '';
  const classes = [...last.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1]);
  return { classes, pseudo, universal, text: selector };
}

async function main() {
  const { default: postcss } = await import('postcss');
  const keyframes = new Map(); // nome -> Set de propriedades
  const uses = []; // { file, line, selector, value, names }
  const calmSelectors = []; // seletores dentro de @media (prefers-reduced-motion: reduce)

  for (const file of cssFiles(SRC)) {
    const ast = postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    ast.walkAtRules(/keyframes$/i, (at) => {
      const props = keyframes.get(at.params) ?? new Set();
      at.walkDecls((decl) => {
        if (!IGNORED.has(decl.prop) && !decl.prop.startsWith('--')) props.add(decl.prop);
      });
      keyframes.set(at.params, props);
    });
    ast.walkRules((rule) => {
      let inReduce = false;
      let inKeyframes = false;
      for (let p = rule.parent; p; p = p.parent) {
        if (p.type !== 'atrule') continue;
        if (/keyframes$/i.test(p.name)) inKeyframes = true;
        if (p.name === 'media' && REDUCE.test(p.params)) inReduce = true;
      }
      if (inKeyframes) return;
      if (inReduce) {
        calmSelectors.push(...rule.selectors);
        return;
      }
      let shorthand = null;
      let name = null;
      let count = null;
      rule.each((node) => {
        if (node.type !== 'decl') return;
        if (node.prop === 'animation') shorthand = node;
        else if (node.prop === 'animation-name') name = node;
        else if (node.prop === 'animation-iteration-count') count = node;
      });
      const infinite = (shorthand && /\binfinite\b/.test(shorthand.value)) || (count && /\binfinite\b/.test(count.value));
      if (!infinite) return;
      const decl = shorthand && /\binfinite\b/.test(shorthand.value) ? shorthand : count;
      uses.push({ file: rel(file), line: decl.source.start.line, selector: rule.selector.replace(/\s+/g, ' '), value: `${shorthand?.value ?? ''} ${name?.value ?? ''}`.trim() });
    });
  }

  // as animações do tailwind.config.js (animate-…)
  try {
    const { default: tw } = await import(pathToFileURL(path.join(ROOT, 'tailwind.config.js')).href);
    const extend = tw?.theme?.extend ?? {};
    for (const [name, frames] of Object.entries(extend.keyframes ?? {})) {
      const props = keyframes.get(name) ?? new Set();
      for (const step of Object.values(frames)) for (const prop of Object.keys(step)) props.add(kebab(prop));
      keyframes.set(name, props);
    }
    for (const [name, value] of Object.entries(extend.animation ?? {})) {
      if (/\binfinite\b/.test(value)) uses.push({ file: 'tailwind.config.js', line: 0, selector: `.animate-${name}`, value });
    }
  } catch {
    // sem tailwind.config.js legível: segue só com o CSS
  }
  // as do próprio Tailwind
  for (const [name, props] of Object.entries({ spin: ['transform'], ping: ['transform', 'opacity'], pulse: ['opacity'], bounce: ['transform'] })) {
    if (!keyframes.has(name)) keyframes.set(name, new Set(props));
  }

  // Conferência aproximada (só pelos nomes): a regra de "reduzir movimento"
  // cobre a animação quando é o mesmo seletor, a mesma classe ou uma variação
  // dela (.co-frame cobre .co-frame--gold), ou quando vale para "tudo dentro
  // de" um pai da mesma família de nomes (.kit-frame * cobre .kit-eye-pupil).
  const calm = calmSelectors.map(subject);
  const family = (cls) => cls.split('-')[0];
  const coveredByCalm = (selector) =>
    selector.split(/,(?![^()]*\))/).every((one) => {
      const s = subject(one);
      const all = [...one.matchAll(/\.((?:\\.|[\w-])+)/g)].map((m) => m[1]); // as classes de todos os pedaços
      return calm.some((c) => {
        if (c.text.trim() === one.trim()) return true;
        if (c.universal) return c.classes.some((cc) => one.includes(`.${cc} `) || all.some((sc) => sc.startsWith(`${cc}-`) || family(sc) === family(cc)));
        if (c.pseudo !== s.pseudo) return false;
        return c.classes.some((cc) => s.classes.some((sc) => sc === cc || sc.startsWith(`${cc}--`)));
      });
    });

  const rows = uses.map((use) => {
    const names = use.value
      .split(/,(?![^()]*\))/)
      .map((part) => part.trim().split(/\s+/).find((token) => keyframes.has(token)))
      .filter(Boolean);
    const props = [...new Set(names.flatMap((n) => [...keyframes.get(n)]))];
    const expensive = props.filter((p) => !CHEAP.has(p));
    return { ...use, names, props, expensive, calm: coveredByCalm(use.selector), key: `${use.file}|${use.selector}|${names.join(',')}|${expensive.join(',')}` };
  });
  const costly = rows.filter((r) => r.expensive.length);
  const noCalm = rows.filter((r) => !r.calm);

  let known = { expensive: [], noCalm: [] };
  try {
    known = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  } catch {
    // primeira vez: tudo é novo
  }
  if (args.has('--update')) {
    const next = {
      about: 'Animações infinitas já conhecidas (npm run check:motion). Gerado por `npm run check:motion -- --update`; o ideal é esta lista só diminuir.',
      expensive: costly.map((r) => r.key).sort(),
      noCalm: noCalm.map((r) => `${r.file}|${r.selector}`).sort(),
    };
    fs.writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`check:motion — lista conhecida atualizada: ${next.expensive.length} em propriedades caras, ${next.noCalm.length} sem regra de "reduzir movimento".`);
    return 0;
  }
  const knownCostly = new Set(known.expensive ?? []);
  const knownNoCalm = new Set(known.noCalm ?? []);
  const newCostly = costly.filter((r) => !knownCostly.has(r.key));
  const newNoCalm = noCalm.filter((r) => !knownNoCalm.has(`${r.file}|${r.selector}`));
  const line = (r) => `    ${r.file}:${r.line}  ${r.selector.slice(0, 70)}  [${r.names.join(', ')}]${r.expensive.length ? `  anima ${r.expensive.join(', ')}` : ''}`;

  console.log(`check:motion — ${rows.length} animações infinitas no CSS; ${costly.length} em propriedades caras (${newCostly.length} novas); ${noCalm.length} sem regra de "reduzir movimento" (${newNoCalm.length} novas).`);
  if (newCostly.length) {
    console.log('\n  ATENÇÃO: animação infinita NOVA em propriedade cara (repinta a tela a cada quadro, mesmo com o app parado):');
    newCostly.forEach((r) => console.log(line(r)));
    console.log('  Como resolver: anime só transform/opacity (o brilho vai num pseudo-elemento que desliza), ou troque `infinite` por um número de voltas.');
  }
  if (newNoCalm.length) {
    console.log('\n  ATENÇÃO: animação infinita NOVA sem regra em @media (prefers-reduced-motion: reduce) (ela não para no modo economia):');
    newNoCalm.forEach((r) => console.log(line(r)));
    console.log('  Como resolver: no mesmo arquivo, `@media (prefers-reduced-motion: reduce) { <seletor> { animation: none; } }`.');
  }
  if (args.has('--all')) {
    console.log('\n  Todas as infinitas ($ = propriedade cara, ! = sem regra de "reduzir movimento"):');
    rows.forEach((r) => console.log(`  ${r.expensive.length ? '$' : ' '}${r.calm ? ' ' : '!'}${line(r).slice(3)}`));
    const byProp = {};
    costly.forEach((r) => r.expensive.forEach((p) => (byProp[p] = (byProp[p] ?? 0) + 1)));
    console.log('\n  Propriedades caras:', JSON.stringify(byProp));
  }
  if (newCostly.length || newNoCalm.length) console.log('\n  (é só um aviso; para aceitar como conhecido: npm run check:motion -- --update)');
  return args.has('--strict') && (newCostly.length || newNoCalm.length) ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // o vigia nunca derruba o build
    console.warn('check:motion não conseguiu rodar:', error?.message ?? error);
    process.exit(args.has('--strict') ? 1 : 0);
  }
);
