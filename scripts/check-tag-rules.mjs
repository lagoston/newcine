#!/usr/bin/env node
// check:tags — o vigia das regras de tags que moram em dois lugares
// (19/11/2026, Protocolo Reborn, onda 3).
//
// Desde 19/11/2026 o banco calcula o progresso das tags da própria pessoa
// (get_tag_progress / sync_my_tags, no lugar de 10 a 14 pedidos do aparelho).
// Para isso as definições de src/lib/tags.ts e src/lib/continents.ts ganharam
// uma cópia no banco: as tabelas tag_rules e country_continents. A tela
// desenha com tags.ts; o banco conta com tag_rules. Se alguém muda uma meta,
// um nome, uma franquia ou cria uma tag só em tags.ts, os dois passam a
// discordar (a tag nova fica "bloqueada" para sempre; a meta antiga continua
// valendo no banco).
//
// Este script refaz, a partir dos dois arquivos, as linhas que deveriam estar
// no banco e compara com a fotografia guardada em
// supabase/tag_rules.snapshot.json (o que foi aplicado por migração).
//
// Uso:
//   npm run check:tags              compara e avisa (nunca falha o build)
//   npm run check:tags -- --sql     imprime o SQL da migração que iguala o banco
//   npm run check:tags -- --update  grava a fotografia nova (DEPOIS de aplicar a migração)
//   npm run check:tags -- --strict  sai com erro se houver diferença (para CI)
// Roda sozinho antes de `npm run build` (script "prebuild"): só avisa.
//
// O caminho quando o aviso aparece:
//   1. npm run check:tags -- --sql  → vira um arquivo em supabase/migrations/
//   2. aplicar a migração no banco (e conferir com supabase/tests/fumaca.sql)
//   3. npm run check:tags -- --update  → commit da fotografia junto
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'supabase', 'tag_rules.snapshot.json');
const args = new Set(process.argv.slice(2));

// O emoji vai como códigos hexadecimais (1f9da-200d-2642-fe0f): texto puro,
// que nenhuma ferramenta altera no caminho até o banco.
const hex = (emoji) =>
  emoji == null ? null : Array.from(emoji, (ch) => ch.codePointAt(0).toString(16)).join('-');

async function loadDefinitions() {
  const { buildSync } = await import('esbuild');
  const entry = [
    `export * from ${JSON.stringify(path.join(ROOT, 'src/lib/tags.ts'))};`,
    `export * from ${JSON.stringify(path.join(ROOT, 'src/lib/continents.ts'))};`,
  ].join('\n');
  const out = buildSync({
    stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const tmp = path.join(os.tmpdir(), `check-tag-rules-${process.pid}.mjs`);
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.unlinkSync(tmp);
  }
}

// As linhas de tag_rules: [category, tag_key, name, emoji, kind, goal, param, ids, sort].
// A mesma forma da migração 20261119130000_get_tag_progress.sql.
function rulesFrom(defs) {
  const rows = [];
  defs.PROGRESSION_TAGS.forEach((tag, i) => {
    const kind = tag.condition?.type ?? 'rated';
    const param = kind === 'mood' && typeof tag.condition.value === 'string' ? tag.condition.value : null;
    rows.push(['basic', tag.name, null, hex(tag.emoji), kind, tag.minMovies, param, null, i]);
  });
  defs.THEME_TAGS.forEach((tag, i) => {
    const value = tag.condition.value;
    const ids = Array.isArray(value) ? value : typeof value === 'string' ? defs.FRANCHISE_MOVIES[value] ?? null : null;
    rows.push(['theme', tag.id, tag.name, hex(tag.emoji), tag.condition.type, tag.condition.count, typeof value === 'string' ? value : null, ids, i]);
  });
  defs.COMMUNITY_TAGS.forEach((tag, i) => {
    rows.push(['community', tag.name, null, hex(tag.emoji), 'friends', tag.minFollowers, null, null, i]);
  });
  defs.ORACLE_TAGS.forEach((tag, i) => {
    rows.push(['oracle', tag.id, tag.name, hex(tag.emoji), tag.condition.type, tag.condition.count, tag.condition.value ?? null, null, i]);
  });
  // das tags de Jogos o banco só precisa da ordem e do jogo (o resto mora em special_tags)
  defs.GAME_TAGS.forEach((tag, i) => {
    rows.push(['games', tag.id, null, null, 'game', null, tag.game, null, i]);
  });
  return rows;
}

function continentsFrom(defs) {
  const out = {};
  for (const continent of defs.ALL_CONTINENTS) {
    out[continent] = Object.keys(defs.CONTINENT_BY_COUNTRY)
      .filter((code) => defs.CONTINENT_BY_COUNTRY[code] === continent)
      .sort()
      .join(' ');
  }
  return out;
}

const keyOf = (row) => `${row[0]} / ${row[1]}`;

function diff(current, saved) {
  const lines = [];
  const before = new Map((saved.rules ?? []).map((row) => [keyOf(row), JSON.stringify(row)]));
  const after = new Map(current.rules.map((row) => [keyOf(row), JSON.stringify(row)]));
  for (const [key, row] of after) {
    if (!before.has(key)) lines.push(`  + tag nova: ${key}`);
    else if (before.get(key) !== row) lines.push(`  ~ mudou: ${key}\n      banco: ${before.get(key)}\n      tela:  ${row}`);
  }
  for (const key of before.keys()) if (!after.has(key)) lines.push(`  - saiu de tags.ts: ${key}`);
  for (const continent of new Set([...Object.keys(current.continents), ...Object.keys(saved.continents ?? {})])) {
    if (current.continents[continent] !== (saved.continents ?? {})[continent]) lines.push(`  ~ países do continente mudaram: ${continent}`);
  }
  return lines;
}

function sqlFor(current, saved) {
  const removed = (saved.rules ?? []).filter((row) => !current.rules.some((now) => keyOf(now) === keyOf(row)));
  const today = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
  const out = [];
  out.push(`-- ${today}: tag_rules e country_continents iguais a src/lib/tags.ts e src/lib/continents.ts.`);
  out.push('-- Gerado por `npm run check:tags -- --sql` (não digitar à mão). Depois de aplicar:');
  out.push('-- `npm run check:tags -- --update` e commit da fotografia junto.');
  out.push('');
  out.push('insert into public.tag_rules (category, tag_key, name, emoji, kind, goal, param, ids, sort)');
  out.push('select r ->> 0, r ->> 1, r ->> 2,');
  out.push("       (select string_agg(chr(('x' || lpad(h.cp, 8, '0'))::bit(32)::int), '' order by h.ord)");
  out.push("          from regexp_split_to_table(r ->> 3, '-') with ordinality h(cp, ord)),");
  out.push('       r ->> 4, (r ->> 5)::integer, r ->> 6,');
  out.push("       case when jsonb_typeof(r -> 7) = 'array' then array(select (jsonb_array_elements_text(r -> 7))::integer) end,");
  out.push('       (r ->> 8)::integer');
  out.push('  from jsonb_array_elements($json$[');
  out.push(current.rules.map((row) => JSON.stringify(row)).join(',\n'));
  out.push(']$json$::jsonb) r');
  out.push('on conflict (category, tag_key) do update');
  out.push('   set name = excluded.name, emoji = excluded.emoji, kind = excluded.kind, goal = excluded.goal,');
  out.push('       param = excluded.param, ids = excluded.ids, sort = excluded.sort;');
  out.push('');
  out.push('insert into public.country_continents (code, continent)');
  out.push('select c.code, e.key');
  out.push(`  from jsonb_each_text($json$${JSON.stringify(current.continents)}$json$::jsonb) e`);
  out.push("  cross join lateral regexp_split_to_table(e.value, ' ') c(code)");
  out.push('on conflict (code) do update set continent = excluded.continent;');
  if (removed.length > 0) {
    out.push('');
    out.push('-- ATENÇÃO: estas regras saíram de tags.ts e continuam no banco. Apagar linha');
    out.push('-- pede o OK do Bruno; sem apagar, o banco segue contando uma tag que a tela');
    out.push('-- não desenha mais (não aparece para ninguém, mas pode virar aviso).');
    for (const row of removed) out.push(`--   ${keyOf(row)}`);
  }
  return out.join('\n') + '\n';
}

async function main() {
  const defs = await loadDefinitions();
  const current = { rules: rulesFrom(defs), continents: continentsFrom(defs) };

  if (args.has('--update')) {
    const body = `{\n"rules": [\n${current.rules.map((row) => JSON.stringify(row)).join(',\n')}\n],\n"continents": ${JSON.stringify(current.continents, null, 1)}\n}\n`;
    fs.writeFileSync(SNAPSHOT, body);
    console.log(`check:tags — fotografia gravada (${current.rules.length} regras, ${Object.values(current.continents).join(' ').split(' ').length} países).`);
    return 0;
  }

  const saved = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) : { rules: [], continents: {} };

  if (args.has('--sql')) {
    process.stdout.write(sqlFor(current, saved));
    return 0;
  }

  const lines = diff(current, saved);
  if (lines.length === 0) {
    console.log(`check:tags — ${current.rules.length} regras de tags: a tela (tags.ts) e o banco (tag_rules) estão iguais.`);
    return 0;
  }
  console.log('check:tags — AVISO: src/lib/tags.ts ou continents.ts mudou e o banco ainda não sabe.');
  console.log('  O banco calcula as tags da própria pessoa por tag_rules; com esta diferença a tela e o banco discordam.');
  console.log(lines.join('\n'));
  console.log('  Para igualar: `npm run check:tags -- --sql` vira uma migração; depois de aplicá-la, `npm run check:tags -- --update`.');
  return args.has('--strict') ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    // o vigia nunca derruba o build
    console.log(`check:tags — não consegui conferir (${error && error.message ? error.message : error}).`);
    process.exit(args.has('--strict') ? 1 : 0);
  });
