#!/usr/bin/env node
// check:rpc — o vigia das funções do banco que a tela chama
// (20/11/2026, Protocolo Reborn, fecho).
//
// O plano pedia "tipos TypeScript gerados" do banco. Gerar o esquema inteiro
// não serve aqui: o repositório é público e o esquema tem tabelas que não podem
// aparecer nele. O que os tipos pegariam de mais útil é o erro que já derrubou
// tela: `supabase.rpc('nome_errado')` ou uma tela publicada antes da migração
// que cria a função. Este script pega exatamente isso, sem expor nada: ele só
// conhece os nomes que a própria tela já escreve.
//
// Ele lê todo `.rpc('nome'` de src/ e compara com a lista de nomes que já foram
// CONFERIDOS no banco (existem e a pessoa logada, ou o visitante, pode
// chamar): supabase/rpc.snapshot.json.
//
// Uso:
//   npm run check:rpc              compara e avisa (nunca falha o build)
//   npm run check:rpc -- --list    imprime os nomes que a tela chama (um por linha)
//   npm run check:rpc -- --sql     imprime a consulta que confere os nomes no banco
//   npm run check:rpc -- --strict  sai com erro se houver nome não conferido
// Roda sozinho antes de `npm run build` (script "prebuild"): só avisa.
//
// O caminho quando o aviso aparece ("a tela chama uma função não conferida"):
//   1. a migração que cria a função já foi aplicada? Se não, aplique antes de
//      publicar a tela (a tela nova tem plano B, mas sem a função ela roda o
//      caminho antigo para sempre e ninguém percebe);
//   2. `npm run check:rpc -- --sql` e rode a consulta no banco (painel SQL ou
//      o conector): ela devolve os nomes que existem e quem pode chamar;
//   3. acrescente os nomes confirmados em supabase/rpc.snapshot.json, em ordem
//      alfabética, no mesmo commit da tela.
// Não entram aqui as chamadas com o nome numa variável (src/lib/pokerApi.ts e
// src/lib/directorTools.ts montam o nome): essas o script não enxerga.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const SNAPSHOT = path.join(ROOT, 'supabase', 'rpc.snapshot.json');
const args = new Set(process.argv.slice(2));

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // as prévias de laboratório ficam fora do git e não vão para o site
    if (entry.name.startsWith('__preview_')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full;
  }
}

function usedNames() {
  const where = new Map();
  // .rpc('nome'  |  .rpc<Tipo>('nome'  |  .rpc(\n  'nome'
  const call = /\.rpc(?:<[^>()]*>)?\(\s*['"`]([a-z0-9_]+)['"`]/g;
  for (const file of files(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(call)) {
      const list = where.get(match[1]) ?? [];
      list.push(path.relative(ROOT, file));
      where.set(match[1], list);
    }
  }
  return where;
}

function main() {
  const used = usedNames();
  const names = [...used.keys()].sort();

  if (args.has('--list')) {
    process.stdout.write(names.join('\n') + '\n');
    return 0;
  }
  if (args.has('--sql')) {
    process.stdout.write(
      [
        '-- Quais destes nomes existem no banco e quem pode chamar (só leitura).',
        'select p.proname as nome,',
        "       bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as logado,",
        "       bool_or(has_function_privilege('anon', p.oid, 'execute')) as visitante",
        '  from pg_proc p join pg_namespace n on n.oid = p.pronamespace',
        " where n.nspname = 'public' and p.proname = any(array[",
        names.map((name) => `  '${name}'`).join(',\n'),
        ' ]) group by 1 order by 1;',
        '',
      ].join('\n')
    );
    return 0;
  }

  const saved = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) : { confirmed: [] };
  const confirmed = new Set(saved.confirmed ?? []);
  const unknown = names.filter((name) => !confirmed.has(name));
  if (unknown.length === 0) {
    console.log(`check:rpc — ${names.length} funções do banco chamadas pela tela, todas conferidas.`);
    return 0;
  }
  console.log('check:rpc — AVISO: a tela chama função do banco que ainda não foi conferida:');
  for (const name of unknown) console.log(`  ${name}  (${[...new Set(used.get(name))].slice(0, 2).join(', ')})`);
  console.log('  Nome novo? Aplique a migração antes de publicar a tela, confira com `npm run check:rpc -- --sql`');
  console.log('  e acrescente o nome em supabase/rpc.snapshot.json. Nome digitado errado? É este o aviso.');
  return args.has('--strict') ? 1 : 0;
}

try {
  process.exit(main());
} catch (error) {
  // o vigia nunca derruba o build
  console.log(`check:rpc — não consegui conferir (${error && error.message ? error.message : error}).`);
  process.exit(args.has('--strict') ? 1 : 0);
}
