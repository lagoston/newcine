#!/usr/bin/env node
// As fontes do CineOracle, no próprio site (18/11/2026, Protocolo Reborn, pacote).
//
// Antes as letras dos títulos (Pixelify Sans), do Jackpot (Cinzel Decorative),
// da curadoria (Cinzel) e do Pôster Poker (Limelight) vinham do Google Fonts:
// uma folha de estilo de outro domínio que travava a primeira pintura, e, no
// app (APK), títulos em outra letra quando não havia internet. Agora os
// arquivos .woff2 moram em public/fonts/ e as regras @font-face em
// src/styles/fonts.css. Este script é quem gera os dois, a partir dos pacotes
// @fontsource do npm (os mesmos arquivos que o Google serve, já divididos por
// alfabeto):
//
//   node scripts/fonts/sync-fonts.mjs                 instala os pacotes numa pasta temporária e copia
//   node scripts/fonts/sync-fonts.mjs --from <pasta>  usa uma pasta que já tem node_modules/@fontsource*
//   node scripts/fonts/sync-fonts.mjs --check         só confere se public/fonts e fonts.css estão em dia
//
// Para acrescentar uma fonte: uma linha em FONTS e rodar o script. Só os
// alfabetos latin e latin-ext são copiados (português e inglês cabem no
// latin; o latin-ext cobre nomes com ő, ł, ş… e só é baixado se aparecerem).
//
// REGRA DO CACHE: public/_headers manda o navegador guardar /fonts/* por 1 ano
// sem perguntar de novo. Por isso um arquivo de fonte NUNCA muda de conteúdo
// com o mesmo nome: se uma versão nova do pacote trouxer bytes diferentes, o
// script para e pede para subir o "rev" da fonte (o nome ganha -v2, -v3…).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = path.join(ROOT, 'public/fonts');
const CSS_FILE = path.join(ROOT, 'src/styles/fonts.css');
const SUBSETS = ['latin-ext', 'latin']; // nesta ordem no CSS (a última regra que serve ganha)

// family: o nome usado no CSS do app. weights: 'wght' = arquivo variável (um
// arquivo para todos os pesos da faixa "range"); números = um arquivo por peso.
// Os pesos são os mesmos que eram pedidos ao Google (o desenho não muda).
const FONTS = [
  { id: 'pixelify-sans', pkg: '@fontsource-variable/pixelify-sans@5.3.0', family: 'Pixelify Sans', weights: ['wght'], range: '400 700', note: 'títulos do site (PIXEL em src/lib/oracleTheme.ts). É a única com preload no index.html.' },
  { id: 'cinzel-decorative', pkg: '@fontsource/cinzel-decorative@5.3.0', family: 'Cinzel Decorative', weights: [700, 900], note: 'letreiros do Poster Jackpot e do pôquer.' },
  { id: 'cinzel', pkg: '@fontsource-variable/cinzel@5.3.0', family: 'Cinzel', weights: ['wght'], range: '500 700', note: 'rótulos da curadoria de pôsteres (página interna).' },
  { id: 'limelight', pkg: '@fontsource/limelight@5.3.0', family: 'Limelight', weights: [400], note: 'títulos do Pôster Poker.' },
  { id: 'courier-prime', pkg: '@fontsource/courier-prime@5.3.0', family: 'Courier Prime', weights: [400, 700], note: 'efeito de texto Premium "Typewriter" (src/lib/textEffects.tsx).' },
];

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const FORCE = args.includes('--force');
const fromIndex = args.indexOf('--from');
let source = fromIndex >= 0 ? path.resolve(args[fromIndex + 1]) : null;

const pkgDir = (font) => path.join(source, 'node_modules', font.pkg.replace(/@[\d.]+$/, ''));
if (!source || !FONTS.every((font) => fs.existsSync(pkgDir(font)))) {
  if (CHECK && !source) {
    source = null; // --check sem pacotes: confere só o que já está no repositório
  } else {
    source = source || fs.mkdtempSync(path.join(os.tmpdir(), 'cineoracle-fonts-'));
    fs.mkdirSync(source, { recursive: true });
    if (!fs.existsSync(path.join(source, 'package.json'))) fs.writeFileSync(path.join(source, 'package.json'), '{"private":true}');
    console.log(`Instalando os pacotes de fonte em ${source} …`);
    execFileSync('npm', ['install', '--no-audit', '--no-fund', '--ignore-scripts', '--no-save', ...FONTS.map((font) => font.pkg)], { cwd: source, stdio: 'inherit' });
  }
}

const fileName = (font, subset, weight) => `${font.id}-${subset}-${weight}-normal${font.rev ? `-v${font.rev}` : ''}.woff2`;
const problems = [];
const faces = [];

for (const font of FONTS) {
  // O intervalo de caracteres de cada alfabeto vem do CSS do próprio pacote.
  let ranges = null;
  if (source) {
    const dir = pkgDir(font);
    const css = fs.readdirSync(dir).filter((name) => name.endsWith('.css')).map((name) => fs.readFileSync(path.join(dir, name), 'utf8')).join('\n');
    ranges = {};
    for (const subset of SUBSETS) {
      const match = css.match(new RegExp(`/\\* ${font.id}-${subset}-[\\w]+-normal \\*/\\s*@font-face\\s*{[^}]*unicode-range:\\s*([^;]+);`));
      if (!match) throw new Error(`${font.pkg}: não achei o unicode-range do alfabeto ${subset}`);
      ranges[subset] = match[1].trim();
    }
    const license = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8');
    const licenseFile = path.join(OUT_DIR, `OFL-${font.id}.txt`);
    if (!fs.existsSync(licenseFile) || fs.readFileSync(licenseFile, 'utf8') !== license) {
      if (CHECK) problems.push(`licença desatualizada: ${path.relative(ROOT, licenseFile)}`);
      else fs.writeFileSync(licenseFile, license);
    }
  }
  for (const weight of font.weights) {
    for (const subset of SUBSETS) {
      const name = fileName(font, subset, weight);
      const dest = path.join(OUT_DIR, name);
      if (source) {
        const bytes = fs.readFileSync(path.join(pkgDir(font), 'files', `${font.id}-${subset}-${weight}-normal.woff2`));
        if (!fs.existsSync(dest)) {
          if (CHECK) problems.push(`falta ${path.relative(ROOT, dest)}`);
          else fs.writeFileSync(dest, bytes);
        } else if (!fs.readFileSync(dest).equals(bytes)) {
          const message = `${name} mudou no pacote: suba o "rev" de ${font.id} em scripts/fonts/sync-fonts.mjs (o cache de /fonts é de 1 ano)`;
          if (FORCE && !CHECK) fs.writeFileSync(dest, bytes);
          else problems.push(message);
        }
      } else if (!fs.existsSync(dest)) {
        problems.push(`falta ${path.relative(ROOT, dest)}`);
      }
      faces.push({ font, subset, weight, name, range: ranges?.[subset] ?? null });
    }
  }
}

// ---- src/styles/fonts.css ----
const header = `/* Fontes do CineOracle, servidas pelo próprio site (18/11/2026, Protocolo Reborn).
   ARQUIVO GERADO por scripts/fonts/sync-fonts.mjs — não edite à mão; mude a
   lista FONTS do script e rode-o de novo.

   Antes estas letras vinham do Google Fonts (uma folha de estilo de outro
   domínio, que travava a primeira pintura, e títulos em outra letra no app sem
   internet). Agora os .woff2 moram em public/fonts/ (licença OFL ao lado de
   cada família). O navegador só baixa um arquivo quando um texto usa aquela
   fonte, naquele peso e com caracteres daquele alfabeto (unicode-range):
   declarar todas aqui não pesa na abertura. Só a Pixelify Sans (latin), que a
   primeira tela usa, tem <link rel="preload"> no index.html.
   font-display: swap = o texto aparece na letra reserva e troca quando a fonte
   chega (nunca fica invisível). */
`;
let css = header;
if (faces.every((face) => face.range)) {
  let last = null;
  for (const face of faces) {
    if (last !== face.font) css += `\n/* ${face.font.family}: ${face.font.note} */\n`;
    last = face.font;
    css += `@font-face {\n  font-family: '${face.font.family}';\n  font-style: normal;\n  font-weight: ${face.weight === 'wght' ? face.font.range : face.weight};\n  font-display: swap;\n  src: url(/fonts/${face.name}) format('woff2');\n  unicode-range: ${face.range};\n}\n`;
  }
  const current = fs.existsSync(CSS_FILE) ? fs.readFileSync(CSS_FILE, 'utf8') : '';
  if (current !== css) {
    if (CHECK) problems.push(`${path.relative(ROOT, CSS_FILE)} não bate com a lista FONTS`);
    else fs.writeFileSync(CSS_FILE, css);
  }
} else {
  // --check sem os pacotes: cada arquivo citado no CSS existe, e vice-versa
  const current = fs.existsSync(CSS_FILE) ? fs.readFileSync(CSS_FILE, 'utf8') : '';
  for (const face of faces) if (!current.includes(`/fonts/${face.name})`)) problems.push(`${path.relative(ROOT, CSS_FILE)} não cita ${face.name}`);
}

// Arquivos .woff2 em public/fonts que nenhuma regra usa.
const used = new Set(faces.map((face) => face.name));
for (const name of fs.readdirSync(OUT_DIR)) if (name.endsWith('.woff2') && !used.has(name)) problems.push(`sobrando em public/fonts: ${name}`);

const total = faces.reduce((sum, face) => sum + (fs.existsSync(path.join(OUT_DIR, face.name)) ? fs.statSync(path.join(OUT_DIR, face.name)).size : 0), 0);
console.log(`${faces.length} arquivos de fonte (${(total / 1024).toFixed(0)} KB) em public/fonts, ${FONTS.length} famílias em src/styles/fonts.css`);
if (problems.length) {
  console.error('\nProblemas:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(CHECK ? 'Tudo em dia.' : 'Pronto.');
