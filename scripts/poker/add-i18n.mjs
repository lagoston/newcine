// Mescla um fragmento de textos nos arquivos de idioma, num passo só.
// 03/11/2026: dois pacotes da interface do poker mexem em pt.json/en.json ao
// mesmo tempo; ler-mesclar-gravar em milissegundos evita que um apague o outro.
// Uso: node scripts/poker/add-i18n.mjs <namespace> <fragmento.json>
//   fragmento = { "pt": { ...chaves... }, "en": { ...chaves... } }
//   As chaves entram em <namespace> (ex.: "poker" ou "pokerEntry"), mescladas
//   em profundidade; chaves existentes com o mesmo caminho são substituídas.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [ns, fragPath] = process.argv.slice(2);
if (!ns || !fragPath) {
  console.error('Uso: node scripts/poker/add-i18n.mjs <namespace> <fragmento.json>');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frag = JSON.parse(readFileSync(resolve(fragPath), 'utf8'));

const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v);
    else a[k] = v;
  }
  return a;
};

for (const lang of ['pt', 'en']) {
  if (!frag[lang]) continue;
  const file = resolve(root, `src/locales/${lang}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  data[ns] = merge(data[ns] && typeof data[ns] === 'object' ? data[ns] : {}, frag[lang]);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`${lang}.json: ${ns} atualizado`);
}
