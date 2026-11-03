/**
 * Falha se a cópia do motor na Edge poker-bounty estiver desatualizada ou se o
 * ENGINE_HASH não bater (SPEC §4.8). 03/11/2026 (pacote C).
 *
 *   node scripts/poker/test-sync.ts
 *
 * Para corrigir: node scripts/sync-poker-engine.mjs
 */
// @ts-expect-error — módulo .mjs sem tipos; as duas funções usadas estão descritas abaixo.
import { checkSync } from '../sync-poker-engine.mjs';

const { hash, problems } = (checkSync as () => { hash: string; problems: string[] })();
if (problems.length > 0) {
  console.error(`test-sync: a cópia do motor está velha (ENGINE_HASH esperado ${hash}).`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Rode: node scripts/sync-poker-engine.mjs');
  process.exit(1);
}
console.log(`test-sync: cópia em dia, ENGINE_HASH ${hash}.`);
