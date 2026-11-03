#!/usr/bin/env node
/**
 * Empacota o handler da Edge poker-friends (handler.ts + o motor de ../poker-bounty/_engine/)
 * num arquivo só, para publicar pelo MCP do Supabase (03/11/2026, pacote F3). Mesmo jeito do
 * scripts/poker/bundle-edge.mjs da poker-bounty (que é do pacote do motor e só conhece ela).
 *
 *   node scripts/sync-poker-engine.mjs                 (antes: motor em dia)
 *   node supabase/functions/poker-friends/bundle.mjs   → supabase/functions/poker-friends/dist/handler.ts
 *
 * Publica-se então 2 arquivos: o index.ts desta pasta, sem mudança, e este pacote com o nome
 * handler.ts (JS puro é TS válido para o Deno). A pasta dist/ fica fora do git.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const FN = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(FN, 'dist');
const OUT = join(OUT_DIR, 'handler.ts');

const hashFile = readFileSync(join(FN, '../poker-bounty/_engine/ENGINE_HASH.ts'), 'utf8');
const engineHash = /ENGINE_HASH = '([0-9a-f]+)'/.exec(hashFile)?.[1] ?? '?';

const res = await build({
  entryPoints: [join(FN, 'handler.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: false,
  legalComments: 'none',
  minifyIdentifiers: true,
  minifySyntax: true,
  // 03/11/2026 (noite): espaço também minificado, mas em linhas de até 160 colunas (lineLimit),
  // para o pacote caber com folga numa chamada do MCP (~135 KB) e continuar legível linha a linha.
  minifyWhitespace: true,
  lineLimit: 160,
  logLevel: 'error',
});
const code = res.outputFiles[0].text;
const header =
  `// GERADO por supabase/functions/poker-friends/bundle.mjs — não edite. handler.ts + _engine/ empacotados.\n` +
  `// ENGINE_HASH ${engineHash} · sha256 do corpo ${createHash('sha256').update(code).digest('hex').slice(0, 16)}\n`;
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, header + code);
console.log(`pacote: ${OUT} · ${(Buffer.byteLength(header + code) / 1024).toFixed(1)} KB · ENGINE_HASH ${engineHash}`);
