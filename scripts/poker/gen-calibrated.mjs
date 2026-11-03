#!/usr/bin/env node
/**
 * Gera src/lib/poker/bots/calibrated.ts a partir de scripts/poker/params/v1.json.
 *
 *   node scripts/poker/gen-calibrated.mjs
 *
 * 03/11/2026: os números calibrados pelo simulador (A3) viviam só no v1.json, que vai
 * para poker_bot_params no banco. Um aparelho sem esses parâmetros em cache (primeira
 * abertura offline, falha de rede) jogava com os padrões do SPEC, que nunca foram
 * calibrados. Agora o padrão embutido = SPEC + v1.json, e o banco só sobrepõe ajustes
 * feitos depois. Rode de novo sempre que o v1.json mudar (e o sync da Edge depois).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const params = JSON.parse(readFileSync(join(ROOT, 'scripts/poker/params/v1.json'), 'utf8'));
const pick = (id) => {
  if (!params[id] || typeof params[id] !== 'object') throw new Error(`v1.json sem ${id}`);
  return params[id];
};
const body = {
  bogart: pick('bogart'),
  cypher: pick('cypher'),
  fincher: pick('fincher'),
};
const out =
  '// GERADO por scripts/poker/gen-calibrated.mjs a partir de scripts/poker/params/v1.json — não edite.\n' +
  '// Ajustes da calibração (simulador) aplicados por cima dos perfis do SPEC em DEFAULT_PROFILES.\n' +
  `export const CALIBRATED_PARAMS = ${JSON.stringify(body, null, 2)} as const;\n`;
writeFileSync(join(ROOT, 'src/lib/poker/bots/calibrated.ts'), out);
console.log('calibrated.ts gerado');
