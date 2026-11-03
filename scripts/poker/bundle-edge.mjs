#!/usr/bin/env node
/**
 * Empacota o handler da Edge poker-bounty (handler.ts + o motor em _engine/) num arquivo só,
 * para publicar pelo MCP do Supabase.
 *
 *   node scripts/sync-poker-engine.mjs        (antes: motor em dia)
 *   node scripts/poker/bundle-edge.mjs        → supabase/functions/poker-bounty/dist/handler.ts
 *
 * 03/11/2026: o MCP (deploy_edge_function) recebe o conteúdo de cada arquivo inline. As 43
 * fontes somam ~290 KB, quase tudo comentário; o pacote do esbuild (sem comentários, só o que
 * o handler usa, nomes internos encurtados) tem ~160 KB. Publica-se então 2 arquivos: o index.ts do
 * repositório, sem mudança, e este pacote com o nome handler.ts (o index importa
 * './handler.ts'; JS puro é TS válido para o Deno, que não confere tipos ao publicar).
 * O pacote sai do mesmo código da cópia em _engine/ (mesmo ENGINE_HASH); a pasta dist/
 * fica fora do git.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FN = join(ROOT, 'supabase/functions/poker-bounty');
const OUT_DIR = join(FN, 'dist');
const OUT = join(OUT_DIR, 'handler.ts');

const hashFile = readFileSync(join(FN, '_engine/ENGINE_HASH.ts'), 'utf8');
const engineHash = /ENGINE_HASH = '([0-9a-f]+)'/.exec(hashFile)?.[1] ?? '?';

const res = await build({
  entryPoints: [join(FN, 'handler.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: false,
  legalComments: 'none',
  // 03/11/2026: nomes internos encurtados e sintaxe compacta, mas com as quebras de
  // linha (sem minificar o espaço): o pacote passou de ~200 KB para ~160 KB, o tamanho
  // que o MCP já publicou bem. O código-fonte de verdade continua no repositório.
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
  `// GERADO por scripts/poker/bundle-edge.mjs — não edite. handler.ts + _engine/ empacotados.\n` +
  `// ENGINE_HASH ${engineHash} · sha256 do corpo ${createHash('sha256').update(code).digest('hex').slice(0, 16)}\n`;
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, header + code);
console.log(`pacote: ${OUT} · ${(Buffer.byteLength(header + code) / 1024).toFixed(1)} KB · ENGINE_HASH ${engineHash}`);
