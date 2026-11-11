// Artes dos kits da Cobra (11/11/2026): gera src/styles/cosmeticKits.art.css.
//
// Cada banner dos kits tem uma cena desenhada em SVG (com a animação dentro
// da própria imagem, em SMIL, como as joias dos Vingadores e o 1 e 0 do
// Matrix), presa à direita do banner. Cada cena também tem uma versão
// parada, para quem pede menos movimento. As molduras usam texturas de aro
// (aço dobrado, corrente de ouro, arame farpado).
//
// Rodar: node scripts/cosmetics/kits-art.mjs
// Semente fixa: a saída é sempre a mesma. Nunca editar o .art.css à mão.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'src/styles/cosmeticKits.art.css');

// ---------------------------------------------------------------------------
// utilidades
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// uma casa decimal basta (viewBox de 100 a 400) e deixa o CSS bem menor
const f = (n) => Number(n.toFixed(1)).toString();

// SVG → url("data:…") curto e válido em CSS (aspas simples dentro).
function uri(svg) {
  const s = svg
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/"/g, "'")
    .trim()
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${s}")`;
}

// Tira as animações (SMIL) de uma cena: a versão parada.
const still = (svg) => svg.replace(/<animate[^>]*\/>/g, '').replace(/<animateTransform[^>]*\/>/g, '').replace(/<animateMotion[^>]*\/>/g, '');

const svgOpen = (w, h, extra = '') => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}' ${extra}>`;

// As cenas somem aos poucos na borda da esquerda (a imagem acaba ali; sem
// isso, montanhas e prédios terminam num corte reto no meio do banner).
const FADE_DEFS = `<linearGradient id='fadeg' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.32' stop-color='#fff' stop-opacity='1'/></linearGradient><mask id='fade' maskUnits='userSpaceOnUse' x='0' y='0' width='400' height='200'><rect width='400' height='200' fill='url(#fadeg)'/></mask>`;
const scene = (inner, defs = '') => `${svgOpen(400, 200)}<defs>${FADE_DEFS}${defs}</defs><g mask='url(#fade)'>${inner}</g></svg>`;

// ---------------------------------------------------------------------------
// GAME OF THRONES — a lua, as montanhas do Norte, um castelo e um dragão
// cruzando a lua (as brasas sobem do castelo; a neve cai no CSS).
// ---------------------------------------------------------------------------

// Dragão visto de lado, voando para a esquerda; asas em cima e embaixo
// (mesma estrutura de comandos, para o SMIL interpolar o "d").
// Corpo inteiro (focinho, chifre, pescoço em curva, dorso, cauda com a ponta
// em lança, barriga) e as patas recolhidas.
const DRAGON_BODY =
  'M-50,-8 C-48,-11 -44,-13 -40,-13 L-34,-20 L-35,-12 C-29,-11 -22,-6 -14,-5 C-6,-4 4,-4 12,-2 C24,0 38,2 52,0 L58,-5 L60,1 L67,3 L59,6 L54,4 C40,6 24,6 14,5 C6,6 -4,6 -12,4 C-20,2 -28,-3 -36,-5 C-42,-5 -47,-6 -50,-8 Z M-6,5 L-9,11 L-4,9 Z M7,5 L6,11 L10,9 Z';
// Asa: borda de ataque até o "pulso", a ponta, e a borda de fuga em
// recortes entre os dedos. Em cima e embaixo com os mesmos comandos, para o
// SMIL interpolar o "d".
const WING_UP = 'M-8,-4 L-16,-28 L-4,-46 Q-2,-34 6,-37 Q8,-28 15,-30 Q14,-19 20,-15 Q12,-10 8,-4 Z';
const WING_DOWN = 'M-8,-3 L-15,11 L-6,25 Q-3,16 4,19 Q6,12 12,13 Q11,6 16,4 Q11,0 8,-3 Z';
// A asa de trás, menor e um pouco atrasada no bater.
const WING_BACK_UP = 'M-2,-4 L-6,-24 L4,-38 Q5,-28 11,-30 Q12,-22 17,-23 Q16,-14 21,-11 Q14,-8 10,-4 Z';
const WING_BACK_DOWN = 'M-2,-3 L-5,9 L3,20 Q5,13 10,15 Q12,9 16,10 Q15,4 19,3 Q14,0 10,-3 Z';

function gotScene() {
  const r = rng(11);
  const embers = Array.from({ length: 9 }, (_, i) => {
    const x = 318 + r() * 46;
    const y = 150 + r() * 20;
    const dur = 3.2 + r() * 2.4;
    const begin = (r() * dur).toFixed(2);
    const rad = 0.7 + r() * 0.8;
    const drift = (r() - 0.5) * 18;
    return `<circle cx='${f(x)}' cy='${f(y)}' r='${f(rad)}' fill='${i % 3 ? '#FDBA74' : '#FDE68A'}' opacity='0'>
      <animate attributeName='cy' values='${f(y)};${f(y - 70)}' dur='${f(dur)}s' begin='-${begin}s' repeatCount='indefinite'/>
      <animate attributeName='cx' values='${f(x)};${f(x + drift)}' dur='${f(dur)}s' begin='-${begin}s' repeatCount='indefinite'/>
      <animate attributeName='opacity' values='0;.95;.6;0' keyTimes='0;.15;.7;1' dur='${f(dur)}s' begin='-${begin}s' repeatCount='indefinite'/>
    </circle>`;
  }).join('');

  // montanhas: picos com neve
  const far = 'M0,200 L0,178 L40,158 L78,128 L104,140 L142,104 L176,132 L206,112 L240,138 L270,118 L300,134 L336,100 L372,128 L400,118 L400,200 Z';
  const near = 'M0,200 L0,194 L60,186 L120,172 L160,150 L188,162 L224,136 L256,160 L284,146 L310,156 L326,134 L344,146 L372,138 L400,152 L400,200 Z';
  // capas de neve nos picos de longe: triângulo com a borda de baixo serrilhada
  const cap = (px, py, w, h) => `M${px - w},${py + h} L${px},${py} L${px + w},${py + h} L${px + w * 0.5},${py + h - 2} L${px + w * 0.15},${py + h + 1.5} L${px - w * 0.3},${py + h - 1.5} Z`;
  const snow = [cap(142, 104, 10, 9), cap(206, 112, 8, 7), cap(270, 118, 8, 6), cap(336, 100, 11, 10), cap(78, 128, 7, 6), cap(400, 118, 7, 6)].join(' ');
  // castelo no pico de perto (torres com ameias)
  const castle =
    'M318,134 L318,112 L315,112 L315,106 L318,106 L318,109 L321,109 L321,106 L324,106 L324,109 L327,109 L327,106 L330,106 L330,112 L327,112 L327,122 L338,122 L338,104 L335,104 L335,98 L338,98 L338,101 L341,101 L341,98 L344,98 L344,101 L347,101 L347,98 L350,98 L350,104 L347,104 L347,122 L356,122 L356,116 L353,116 L353,111 L356,111 L356,113 L359,113 L359,111 L362,111 L362,116 L359,116 L359,138 L318,138 Z';
  const windows = "<rect x='341' y='108' width='2' height='4' fill='#FDBA74' opacity='.85'/><rect x='321' y='116' width='1.6' height='3' fill='#FDBA74' opacity='.7'/>";

  return scene(`
  <circle cx='292' cy='58' r='70' fill='url(#h)'/>
  <circle cx='292' cy='58' r='25' fill='url(#m)'/>
  <g fill='#94A3B8' opacity='.18'><circle cx='284' cy='52' r='4'/><circle cx='299' cy='66' r='3'/><circle cx='301' cy='49' r='2'/></g>
  <g fill='#0B111B' opacity='.75'>
    <path d='M220,70 C240,64 262,66 282,62 C300,59 318,63 334,60 L334,64 C316,68 296,66 280,69 C260,72 238,72 220,74 Z'>
      <animateTransform attributeName='transform' type='translate' values='-30 0;40 0' dur='26s' repeatCount='indefinite'/>
      <animate attributeName='opacity' values='0;1;1;0' keyTimes='0;.2;.8;1' dur='26s' repeatCount='indefinite'/>
    </path>
  </g>
  <g transform='translate(-120 0)'>
    <animateTransform attributeName='transform' type='translate' values='470 78;400 68;300 58;200 54;110 50;-90 44;-90 44' keyTimes='0;.06;.15;.24;.32;.47;1' dur='22s' repeatCount='indefinite'/>
    <g transform='scale(.82)'>
      <path d='${WING_BACK_UP}' fill='#0B0F17'><animate attributeName='d' values='${WING_BACK_UP};${WING_BACK_DOWN};${WING_BACK_UP}' dur='1.2s' begin='-.12s' repeatCount='indefinite'/></path>
      <g fill='#04060A'>
        <path d='${DRAGON_BODY}'/>
        <path d='${WING_UP}'><animate attributeName='d' values='${WING_UP};${WING_DOWN};${WING_UP}' dur='1.2s' repeatCount='indefinite'/></path>
      </g>
    </g>
  </g>
  <path d='${far}' fill='#1A2232'/>
  <path d='${snow}' fill='#CBD5E1' fill-opacity='.5'/>
  <ellipse cx='338' cy='134' rx='46' ry='22' fill='url(#fire)' opacity='.8'>
    <animate attributeName='opacity' values='.55;.95;.7;.85;.55' dur='3.4s' repeatCount='indefinite'/>
  </ellipse>
  <path d='${near}' fill='#080B12'/>
  <path d='${castle}' fill='#080B12'/>
  ${windows}
  ${embers}
`, `
    <radialGradient id='h' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#E2E8F0' stop-opacity='.32'/><stop offset='.45' stop-color='#CBD5E1' stop-opacity='.1'/><stop offset='1' stop-color='#CBD5E1' stop-opacity='0'/></radialGradient>
    <radialGradient id='m' cx='.42' cy='.4' r='.62'><stop offset='0' stop-color='#F8FAFC'/><stop offset='.7' stop-color='#E2E8F0'/><stop offset='1' stop-color='#AEB9C8'/></radialGradient>
    <radialGradient id='fire' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#F97316' stop-opacity='.55'/><stop offset='1' stop-color='#F97316' stop-opacity='0'/></radialGradient>
  `);
}

// ---------------------------------------------------------------------------
// RICK AND MORTY — um portal verde girando, faíscas saindo, portais
// distantes e um planeta anelado no fundo.
// ---------------------------------------------------------------------------

function blob(cx, cy, rad, seed, wob) {
  const r = rng(seed);
  const n = 14;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = rad + (r() - 0.5) * wob * 2;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  // curva suave fechada (Catmull-Rom → Bézier)
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return `${d} Z`;
}

function spiralArm(cx, cy, r0, r1, turns, phase) {
  const steps = 26;
  let d = '';
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = phase + t * turns * Math.PI * 2;
    const rr = r0 + (r1 - r0) * t;
    d += `${i ? ' L' : 'M'}${f(cx + Math.cos(a) * rr)},${f(cy + Math.sin(a) * rr)}`;
  }
  return d;
}

function rickScene() {
  const cx = 296;
  const cy = 100;
  const rimA = blob(cx, cy, 64, 3, 5);
  const rimB = blob(cx, cy, 64, 7, 5);
  const rimC = blob(cx, cy, 64, 13, 5);
  const arms = Array.from({ length: 7 }, (_, i) => {
    const colors = ['#ECFCCB', '#BEF264', '#84CC16', '#D9F99D', '#65A30D', '#A3E635', '#F7FEE7'];
    return `<path d='${spiralArm(cx, cy, 6, 60, 0.85, (i / 7) * Math.PI * 2)}' fill='none' stroke='${colors[i]}' stroke-width='${f(2.6 + (i % 3) * 1.4)}' stroke-linecap='round' opacity='${f(0.55 + (i % 2) * 0.25)}'/>`;
  }).join('');
  const r = rng(29);
  const sparks = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2 + r() * 0.4;
    const x0 = cx + Math.cos(a) * 62;
    const y0 = cy + Math.sin(a) * 62;
    const x1 = cx + Math.cos(a) * (88 + r() * 22);
    const y1 = cy + Math.sin(a) * (88 + r() * 22);
    const dur = 1.4 + r() * 1.2;
    const begin = (r() * dur).toFixed(2);
    return `<circle cx='${f(x0)}' cy='${f(y0)}' r='${f(0.8 + r() * 0.9)}' fill='${i % 2 ? '#D9F99D' : '#F7FEE7'}' opacity='0'>
      <animate attributeName='cx' values='${f(x0)};${f(x1)}' dur='${f(dur)}s' begin='-${begin}s' repeatCount='indefinite'/>
      <animate attributeName='cy' values='${f(y0)};${f(y1)}' dur='${f(dur)}s' begin='-${begin}s' repeatCount='indefinite'/>
      <animate attributeName='opacity' values='0;1;0' dur='${f(dur)}s' begin='-${begin}s' repeatCount='indefinite'/>
    </circle>`;
  }).join('');

  return scene(`
  <g opacity='.55'>
    <circle cx='98' cy='150' r='17' fill='url(#pl)'/>
    <ellipse cx='98' cy='150' rx='30' ry='6.5' fill='none' stroke='#A78BFA' stroke-opacity='.55' stroke-width='1.6' transform='rotate(-14 98 150)'/>
  </g>
  <circle cx='150' cy='42' r='9' fill='url(#far)'><animate attributeName='r' values='7;10;7' dur='3s' repeatCount='indefinite'/></circle>
  <circle cx='384' cy='176' r='6' fill='url(#far)'><animate attributeName='r' values='5;7.5;5' dur='2.4s' repeatCount='indefinite'/></circle>
  <circle cx='${cx}' cy='${cy}' r='98' fill='url(#g)'/>
  <path d='${rimA}' fill='url(#rim)'>
    <animate attributeName='d' values='${rimA};${rimB};${rimC};${rimA}' dur='3.6s' repeatCount='indefinite'/>
  </path>
  <g>
    <animateTransform attributeName='transform' type='rotate' values='0 ${cx} ${cy};-360 ${cx} ${cy}' dur='5s' repeatCount='indefinite'/>
    ${arms}
  </g>
  <circle cx='${cx}' cy='${cy}' r='30' fill='url(#core)'/>
  ${sparks}
`, `
    <radialGradient id='g' cx='.5' cy='.5' r='.5'><stop offset='.55' stop-color='#84CC16' stop-opacity='.42'/><stop offset='1' stop-color='#84CC16' stop-opacity='0'/></radialGradient>
    <radialGradient id='rim' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#F7FEE7'/><stop offset='.55' stop-color='#A3E635'/><stop offset='.86' stop-color='#4D7C0F'/><stop offset='1' stop-color='#BEF264'/></radialGradient>
    <radialGradient id='core' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#FFFFFF'/><stop offset='.3' stop-color='#ECFCCB'/><stop offset='1' stop-color='#65A30D' stop-opacity='0'/></radialGradient>
    <radialGradient id='far' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#ECFCCB'/><stop offset='.5' stop-color='#84CC16' stop-opacity='.8'/><stop offset='1' stop-color='#84CC16' stop-opacity='0'/></radialGradient>
    <linearGradient id='pl' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#7C3AED'/><stop offset='1' stop-color='#134E4A'/></linearGradient>
  `);
}

// ---------------------------------------------------------------------------
// FAMÍLIA SOPRANO — Nova Jersey à noite: os prédios do outro lado do rio, o
// reflexo na água, a fumaça do charuto subindo e, de vez em quando, os dois
// patos indo embora.
// ---------------------------------------------------------------------------

const DUCK_BODY = 'M-14,0 C-10,-4 -2,-5 6,-3 C10,-2 13,0 16,0 C13,2 8,4 2,4 C-4,5 -10,4 -14,0 Z M-14,0 C-17,-1 -20,-3 -21,-6 C-19,-8 -16,-7 -15,-5 C-14,-3 -14,-2 -13,-1 Z M-21,-6 L-25,-5 L-21,-4.5 Z';
const DUCK_WING_UP = 'M-4,-3 C-3,-9 2,-15 9,-18 C8,-12 9,-7 12,-3 C6,-3 1,-3 -4,-3 Z';
const DUCK_WING_DOWN = 'M-4,-1 C-3,4 1,9 7,12 C7,7 8,4 12,1 C6,0 1,-1 -4,-1 Z';

function duck(x, y, scale, flapDur) {
  return `<g transform='translate(${x} ${y}) scale(${scale})'>
    <path d='${DUCK_BODY}'/>
    <path d='${DUCK_WING_UP}'><animate attributeName='d' values='${DUCK_WING_UP};${DUCK_WING_DOWN};${DUCK_WING_UP}' dur='${flapDur}s' repeatCount='indefinite'/></path>
  </g>`;
}

function sopranosScene() {
  const r = rng(53);
  const buildings = [];
  const windows = [];
  let x = 150;
  while (x < 400) {
    const w = 10 + Math.floor(r() * 16);
    const h = 40 + Math.floor(r() * 80);
    const top = 160 - h;
    buildings.push(`<rect x='${x}' y='${top}' width='${w}' height='${h + 40}'/>`);
    if (r() < 0.3) buildings.push(`<rect x='${x + w / 2 - 0.6}' y='${top - 10}' width='1.2' height='10'/>`);
    for (let wy = top + 4; wy < 154; wy += 6) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (r() < 0.2) {
          const tw = r() < 0.08;
          windows.push(
            `<rect x='${wx}' y='${wy}' width='1.8' height='2.4' fill='${r() < 0.85 ? '#F5B841' : '#FDE7B0'}' opacity='${f(0.35 + r() * 0.55)}'>${
              tw ? `<animate attributeName='opacity' values='.8;.1;.8' dur='${f(4 + r() * 6)}s' begin='-${f(r() * 6)}s' repeatCount='indefinite'/>` : ''
            }</rect>`
          );
        }
      }
    }
    x += w + 1 + Math.floor(r() * 3);
  }
  const reflections = Array.from({ length: 14 }, (_, i) => {
    const y = 166 + i * 2.4;
    const x0 = 60 + r() * 310;
    const w = 6 + r() * 26;
    return `<rect x='${f(x0)}' y='${f(y)}' width='${f(w)}' height='.9' fill='#F5B841' opacity='${f(0.12 + r() * 0.25)}'>
      <animate attributeName='x' values='${f(x0)};${f(x0 + 6)};${f(x0)}' dur='${f(3 + r() * 3)}s' repeatCount='indefinite'/>
    </rect>`;
  }).join('');
  const smoke = [0, 1, 2]
    .map((i) => {
      const sx = 352 + i * 14;
      const dur = 9 + i * 1.5;
      return `<path d='M${sx},200 C${sx - 10},180 ${sx + 12},166 ${sx},150 C${sx - 10},136 ${sx + 8},124 ${sx - 2},110' fill='none' stroke='#E7E1D8' stroke-width='${7 - i}' stroke-linecap='round' filter='url(#blur)' opacity='0'>
        <animateTransform attributeName='transform' type='translate' values='0 30;-8 -20' dur='${dur}s' begin='-${i * 3}s' repeatCount='indefinite'/>
        <animate attributeName='opacity' values='0;.22;.14;0' keyTimes='0;.3;.7;1' dur='${dur}s' begin='-${i * 3}s' repeatCount='indefinite'/>
      </path>`;
    })
    .join('');

  return scene(`
  <g fill='#0C0807'>${buildings.join('')}</g>
  ${windows.join('')}
  <rect x='0' y='162' width='400' height='38' fill='url(#w)'/>
  ${reflections}
  <g fill='#0A0606'>
    <g>
      <animateTransform attributeName='transform' type='translate' values='120 0;120 0;30 -8;-60 -16;-160 -24;-160 -24' keyTimes='0;.55;.64;.72;.82;1' dur='24s' repeatCount='indefinite'/>
      ${duck(320, 60, 0.9, 0.42)}
      ${duck(346, 70, 0.78, 0.38)}
    </g>
  </g>
  ${smoke}
`, `
    <filter id='blur' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='3'/></filter>
    <linearGradient id='w' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#150D0A'/><stop offset='1' stop-color='#080505'/></linearGradient>
  `);
}

// ---------------------------------------------------------------------------
// THE WALKING DEAD — o sol vermelho baixo, a cidade em ruínas com a caixa
// d'água, a cerca de arame com o rasgo e os corvos voando.
// ---------------------------------------------------------------------------

const CROW_BODY = 'M-10,0 C-6,-3 0,-3 6,-1 C9,0 12,1 14,3 C10,3 6,3 3,3 C-2,4 -7,3 -10,0 Z M-10,0 C-12,-1 -14,-1 -16,0 C-14,1 -12,1 -10,1 Z';
const CROW_WING_UP = 'M-3,-2 C-4,-8 -1,-14 4,-17 C4,-11 6,-6 9,-2 C4,-2 1,-2 -3,-2 Z';
const CROW_WING_DOWN = 'M-3,0 C-4,5 -2,10 2,13 C3,8 5,5 9,1 C4,1 1,0 -3,0 Z';

function crow(x, y, scale, flapDur) {
  return `<g transform='translate(${x} ${y}) scale(${scale})'>
    <path d='${CROW_BODY}'/>
    <path d='${CROW_WING_UP}'><animate attributeName='d' values='${CROW_WING_UP};${CROW_WING_DOWN};${CROW_WING_UP}' dur='${flapDur}s' repeatCount='indefinite'/></path>
  </g>`;
}

function walkingScene() {
  const r = rng(71);
  // prédios em ruína: topo quebrado
  const ruins = [];
  let x = 130;
  while (x < 400) {
    const w = 12 + Math.floor(r() * 20);
    const h = 36 + Math.floor(r() * 70);
    const top = 150 - h;
    const bite = r() < 0.55;
    const d = bite
      ? `M${x},200 L${x},${top + 6} L${x + w * 0.3},${top} L${x + w * 0.5},${top + 9} L${x + w * 0.7},${top + 3} L${x + w},${top + 14} L${x + w},200 Z`
      : `M${x},200 L${x},${top} L${x + w},${top} L${x + w},200 Z`;
    ruins.push(`<path d='${d}'/>`);
    // colados um no outro: o sol vermelho atrás não vaza em frestas
    x += w;
  }
  // o entulho embaixo, que desce até a borda da esquerda
  ruins.push(`<path d='M0,200 L0,190 L40,184 L80,176 L110,166 L130,150 L400,150 L400,200 Z'/>`);
  // caixa d'água
  const tower = `<g>
    <path d='M246,92 L246,148 M270,92 L270,148 M246,110 L270,128 M270,110 L246,128' stroke='#090A07' stroke-width='2.2' fill='none'/>
    <path d='M240,92 C240,78 276,78 276,92 L276,96 L240,96 Z M238,78 L258,66 L278,78 Z'/>
  </g>`;
  // cerca: postes, malha em losango (recortada, com o rasgo) e arame farpado
  const fenceTop = 112;
  // a espiral de arame em cima da cerca: um fio só, em laçadas que se
  // sobrepõem (em perspectiva), não argolas soltas
  let coil = '';
  for (let i = 0; i <= 270; i += 1) {
    const t = i / 270;
    const ang = t * Math.PI * 2 * 30;
    const cxx = 204 + t * 196 + Math.cos(ang) * 2.2;
    const cyy = fenceTop - 6 + Math.sin(ang) * 5.6;
    coil += `${i ? ' L' : 'M'}${f(cxx)},${f(cyy)}`;
  }
  const barbs = [];
  for (let lx = 210; lx < 400; lx += 14) {
    barbs.push(`<path d='M${lx - 2},${fenceTop - 12} L${lx + 2},${fenceTop - 8} M${lx + 2},${fenceTop - 12} L${lx - 2},${fenceTop - 8}'/>`);
  }
  const fenceClip = `M204,${fenceTop} L400,${fenceTop} L400,200 L330,200 C326,184 318,170 306,166 C300,176 300,188 296,200 L204,200 Z`;

  const flock = `<g fill='#080806'>
    <g>
      <animateTransform attributeName='transform' type='translate' values='90 0;-260 -14' dur='26s' repeatCount='indefinite'/>
      ${crow(320, 46, 0.8, 0.52)}
      ${crow(344, 58, 0.62, 0.46)}
      ${crow(300, 64, 0.55, 0.5)}
    </g>
  </g>`;
  const perched = `<g fill='#080806' transform='translate(354 ${fenceTop - 12}) scale(.62)'>
    <path d='M-6,4 C-6,-2 -2,-6 4,-6 C8,-6 10,-3 10,0 C10,4 6,8 0,8 C-3,8 -5,7 -6,4 Z M-6,4 L-12,9 L-5,7 Z'/>
    <g><animateTransform attributeName='transform' type='rotate' values='0 4 -6;0 4 -6;-14 4 -6;0 4 -6' keyTimes='0;.7;.8;1' dur='6s' repeatCount='indefinite'/>
      <path d='M2,-6 C3,-11 9,-12 11,-8 C12,-6 11,-4 9,-4 C7,-4 4,-4 2,-6 Z M11,-8 L16,-7 L11,-6 Z'/></g>
  </g>`;

  return scene(`
  <circle cx='318' cy='118' r='86' fill='url(#sunh)'/>
  <circle cx='318' cy='118' r='27' fill='url(#sun)' opacity='.82'/>
  ${flock}
  <g fill='#0A0B08'>${ruins.join('')}${tower}</g>
  <rect x='204' y='${fenceTop}' width='196' height='${200 - fenceTop}' fill='url(#mesh)' clip-path='url(#fc)'/>
  <path d='M296,200 C300,188 300,176 306,166 C318,170 326,184 330,200' fill='none' stroke='#585749' stroke-opacity='.7' stroke-width='.9'/>
  <g stroke='#151511' stroke-width='3'>
    <path d='M206,${fenceTop - 8} L206,200'/><path d='M268,${fenceTop - 8} L268,200'/><path d='M350,${fenceTop - 8} L350,200'/>
  </g>
  <path d='M204,${fenceTop} L400,${fenceTop}' stroke='#151511' stroke-width='2'/>
  <path d='${coil}' fill='none' stroke='#2A2823' stroke-width='1.5'/>
  <path d='${coil}' fill='none' stroke='#8A8676' stroke-opacity='.8' stroke-width='.6'/>
  <g stroke='#807D6C' stroke-width='.8'>${barbs.join('')}</g>
  ${perched}
`, `
    <radialGradient id='sun' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#FECACA'/><stop offset='.45' stop-color='#EF4444'/><stop offset='1' stop-color='#7F1D1D' stop-opacity='.2'/></radialGradient>
    <radialGradient id='sunh' cx='.5' cy='.5' r='.5'><stop offset='0' stop-color='#DC2626' stop-opacity='.38'/><stop offset='1' stop-color='#DC2626' stop-opacity='0'/></radialGradient>
    <clipPath id='fc'><path d='${fenceClip}'/></clipPath>
    <pattern id='mesh' width='7' height='7' patternUnits='userSpaceOnUse' patternTransform='rotate(45)'><path d='M0,0 L0,7 M0,0 L7,0' stroke='#6A685A' stroke-opacity='.55' stroke-width='.7' fill='none'/></pattern>
  `);
}

// ---------------------------------------------------------------------------
// Texturas de aro das molduras (100×100, recortadas no anel pelo CSS)
// ---------------------------------------------------------------------------

// Aço valiriano: aço dobrado em ondas claras e escuras.
function damascus() {
  const r = rng(5);
  const lines = Array.from({ length: 34 }, (_, i) => {
    const y0 = i * 3.1 - 2;
    const a1 = 1.4 + r() * 1.2;
    const a2 = 0.6 + r() * 0.8;
    const p1 = r() * 6;
    const p2 = r() * 6;
    let d = '';
    for (let x = 0; x <= 100; x += 4) {
      const y = y0 + a1 * Math.sin(x / 8.5 + p1) + a2 * Math.sin(x / 3.4 + p2);
      d += `${x ? ' L' : 'M'}${f(x)},${f(y)}`;
    }
    return `<path d='${d}' stroke='${i % 2 ? '#F8FAFC' : '#0F172A'}' stroke-opacity='${i % 2 ? '.72' : '.7'}' stroke-width='1.6' fill='none'/>`;
  }).join('');
  return `${svgOpen(100, 100, "preserveAspectRatio='none'")}<rect width='100' height='100' fill='#545C69'/>${lines}</svg>`;
}

// Corrente de ouro (cordão torcido): elos inclinados em volta do anel.
function ropeChain() {
  const links = Array.from({ length: 44 }, (_, i) => {
    const a = (i / 44) * 360;
    return `<ellipse cx='50' cy='3.4' rx='2.1' ry='3.6' transform='rotate(${f(a)} 50 50) rotate(38 50 3.4)' fill='url(#gl)' stroke='#573B07' stroke-width='.35'/>`;
  }).join('');
  return `${svgOpen(100, 100)}<defs><linearGradient id='gl' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#FFF1C1'/><stop offset='.45' stop-color='#E0B24A'/><stop offset='1' stop-color='#7A5410'/></linearGradient></defs>${links}</svg>`;
}

// Arame farpado em volta do anel: dois fios torcidos e as farpas.
function barbedRing() {
  const pts = (sign) => {
    let d = '';
    for (let i = 0; i <= 154; i += 1) {
      const t = (i / 154) * Math.PI * 2;
      const rr = 46.8 + sign * 1.9 * Math.sin(t * 11);
      d += `${i ? ' L' : 'M'}${f(50 + Math.cos(t) * rr)},${f(50 + Math.sin(t) * rr)}`;
    }
    return `${d} Z`;
  };
  const barbs = Array.from({ length: 14 }, (_, i) => {
    const t = (i / 14) * Math.PI * 2 + 0.11;
    const cx = 50 + Math.cos(t) * 46.6;
    const cy = 50 + Math.sin(t) * 46.6;
    const a = (t * 180) / Math.PI;
    return `<g transform='rotate(${f(a)} ${f(cx)} ${f(cy)})'><path d='M${f(cx - 3.2)},${f(cy - 2.8)} L${f(cx + 3.2)},${f(cy + 2.8)} M${f(cx - 3.2)},${f(cy + 2.8)} L${f(cx + 3.2)},${f(cy - 2.8)}'/></g>`;
  }).join('');
  return `${svgOpen(100, 100)}<g fill='none' stroke-linejoin='round'><path d='${pts(1)}' stroke='#1A1815' stroke-width='2.4'/><path d='${pts(-1)}' stroke='#1A1815' stroke-width='2.4'/><path d='${pts(1)}' stroke='#D6D1BD' stroke-width='1.1'/><path d='${pts(-1)}' stroke='#B5B09C' stroke-width='1.1'/></g><g stroke='#1A1815' stroke-width='2' stroke-linecap='round'>${barbs}</g><g stroke='#E2DDC9' stroke-width='1' stroke-linecap='round'>${barbs}</g></svg>`;
}

// Respingos secos (aro do The Walking Dead).
function spatter() {
  const r = rng(91);
  const dots = Array.from({ length: 16 }, () => {
    const t = r() * Math.PI * 2;
    const rr = 44 + r() * 5;
    return `<circle cx='${f(50 + Math.cos(t) * rr)}' cy='${f(50 + Math.sin(t) * rr)}' r='${f(0.4 + r() * 1.1)}'/>`;
  }).join('');
  return `${svgOpen(100, 100)}<g fill='#7F1D1D' opacity='.75'>${dots}</g></svg>`;
}

// ---------------------------------------------------------------------------

const scenes = {
  got: gotScene(),
  'rick-morty': rickScene(),
  sopranos: sopranosScene(),
  'walking-dead': walkingScene(),
};

let css = `/* GERADO por scripts/cosmetics/kits-art.mjs (11/11/2026) — não editar à mão.
   As cenas dos banners dos kits da Cobra (animadas e paradas) e as texturas
   dos aros das molduras, como variáveis CSS usadas em cosmeticKits.css. */

`;

for (const [id, svg] of Object.entries(scenes)) {
  css += `.co-banner--${id} {\n  --kit-art: ${uri(svg)};\n  --kit-art-still: ${uri(still(svg))};\n}\n`;
}
css += `.co-frame--got {\n  --kit-rim-art: ${uri(damascus())};\n}\n`;
css += `.co-frame--sopranos {\n  --kit-rim-art: ${uri(ropeChain())};\n}\n`;
css += `.co-frame--walking-dead {\n  --kit-rim-art: ${uri(barbedRing())};\n  --kit-rim-spatter: ${uri(spatter())};\n}\n`;

fs.writeFileSync(OUT, css);
// As cenas soltas, para conferir no navegador (fora do git).
const dump = process.env.KITS_DUMP;
if (dump) {
  fs.mkdirSync(dump, { recursive: true });
  for (const [id, svg] of Object.entries(scenes)) fs.writeFileSync(path.join(dump, `${id}.svg`), svg);
  fs.writeFileSync(path.join(dump, 'damascus.svg'), damascus());
  fs.writeFileSync(path.join(dump, 'rope.svg'), ropeChain());
  fs.writeFileSync(path.join(dump, 'barbed.svg'), barbedRing());
}
console.log(`ok: ${path.relative(ROOT, OUT)} (${(css.length / 1024).toFixed(1)} KB)`);
