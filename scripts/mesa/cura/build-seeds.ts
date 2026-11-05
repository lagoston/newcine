// build-seeds.ts · WP-CURA (05/11/2026)
//
// Lê as planilhas da curadoria (scripts/mesa/cura/*.csv), confere tudo e gera as
// quatro migrações de seed da Mesa dos Oráculos (SPEC §6.5). Por que um gerador e
// não SQL escrito à mão: as planilhas são o lugar onde o time edita (rótulo errado,
// veto novo, comentário reconfirmado), e o SQL precisa sair igual toda vez, com as
// mesmas conferências do §6.1 (rótulo exibível nunca é spoiler/sensível, nunca passa
// de 28 caracteres, nunca tem raiz proibida).
//
// Uso: node scripts/mesa/cura/build-seeds.ts            (gera os .sql)
//      node scripts/mesa/cura/build-seeds.ts --check    (só confere; sai 1 se houver erro)
//      node scripts/mesa/cura/build-seeds.ts --counts   (gera também counts.sql, consulta só de leitura)
//
// Os seeds são idempotentes (insert … on conflict … do update) e não apagam nada:
// tirar uma linha da planilha NÃO tira a linha do banco. Para desfazer um veto,
// troque o sinal ou a marca na planilha e rode de novo.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const MIG = join(ROOT, 'supabase', 'migrations');
const args = new Set(process.argv.slice(2));
const errors: string[] = [];
const err = (m: string) => errors.push(m);

// ---------- CSV (com aspas, vírgula dentro de aspas e "" escapado) ----------
function parseCsv(file: string): Record<string, string>[] {
  const text = readFileSync(join(HERE, file), 'utf8').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r, n) => {
    if (r.length !== head.length) err(`${file}:${n + 2}: ${r.length} colunas, esperado ${head.length}`);
    const o: Record<string, string> = {};
    head.forEach((h, i) => { o[h.trim()] = (r[i] ?? '').trim(); });
    return o;
  });
}

// ---------- SQL ----------
const s = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? 'null' : `'${v.replace(/'/g, "''")}'`);
const n = (v: string) => (v === '' ? 'null' : String(Number(v)));
const b = (v: string | boolean) => (v === true || v === '1' || v === 'true' ? 'true' : 'false');
const arr = (xs: string[]) => (xs.length ? `array[${xs.map((x) => s(x)).join(',')}]::text[]` : `'{}'::text[]`);
const list = (v: string) => (v ? v.split(';').map((x) => x.trim()).filter(Boolean) : []);
const json = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

const HEADER = (what: string) =>
  `-- ${what}\n-- Gerado por scripts/mesa/cura/build-seeds.ts (WP-CURA, 05/11/2026) a partir das planilhas\n` +
  `-- scripts/mesa/cura/*.csv. Não edite à mão: edite a planilha e gere de novo.\n` +
  `-- Idempotente (insert … on conflict … do update) e só toca tabelas mesa_*; não apaga nada.\n\n`;

// =====================================================================
// 1) Glossário (mesa_kw)
// =====================================================================
const KINDS = new Set(['tema', 'tom', 'lugar', 'data', 'formato', 'origem', 'outro']);
// Os ~40 grupos do §6.1. "tema" serve na v1 só para nunca mostrar duas palavras do
// mesmo grupo na mesma razão ("amor" e "romance" juntos, não).
const TEMAS = new Set(['amor', 'amizade', 'família', 'luto', 'memória', 'tempo', 'sonho-e-realidade', 'solidão', 'crescer',
  'escola', 'trabalho', 'dinheiro', 'crime', 'assalto', 'vingança', 'justiça', 'guerra', 'política', 'distopia', 'tecnologia',
  'espaço', 'viagem', 'natureza', 'animais', 'monstros', 'sobrenatural', 'morte', 'religião', 'música', 'esporte', 'comida',
  'arte-e-cinema', 'humor', 'medo', 'mistério', 'sobrevivência', 'identidade', 'poder', 'cidade', 'época']);
// §6.1 conferência 3: nenhum rótulo exibível com estas raízes (barra "porque você ama suicídio").
const BAD_ROOTS = /morte de|suic|estupr|abuso|assassin/i;

const glossary = parseCsv('glossary.csv');
const seenKw = new Set<string>();
let nExib = 0;
for (const r of glossary) {
  const id = r.kw_id;
  if (!/^\d+$/.test(id)) err(`glossary: kw_id inválido "${id}"`);
  if (seenKw.has(id)) err(`glossary: kw_id repetido ${id}`);
  seenKw.add(id);
  if (!r.name_en) err(`glossary ${id}: sem name_en`);
  if (!KINDS.has(r.kind)) err(`glossary ${id}: kind "${r.kind}"`);
  if (r.tema && !TEMAS.has(r.tema)) err(`glossary ${id}: tema fora da lista "${r.tema}"`);
  for (const f of ['exibivel', 'spoiler', 'sensivel']) if (!['0', '1'].includes(r[f])) err(`glossary ${id}: ${f}="${r[f]}"`);
  if (!r.label_pt || !r.label_en) err(`glossary ${id}: rótulo vazio`);
  if (r.exibivel === '1') {
    nExib++;
    if (r.spoiler === '1' || r.sensivel === '1') err(`glossary ${id}: exibível e spoiler/sensível`);
    if (!['tema', 'tom', 'formato', 'lugar'].includes(r.kind)) err(`glossary ${id}: exibível com kind ${r.kind}`);
    if ([...r.label_pt].length > 28 || [...r.label_en].length > 28) err(`glossary ${id}: rótulo com mais de 28 caracteres`);
    if (BAD_ROOTS.test(r.label_pt)) err(`glossary ${id}: rótulo exibível com raiz proibida "${r.label_pt}"`);
  }
}

const sqlGlossary = HEADER('Seed do glossário de palavras-chave (mesa_kw), SPEC §6.1') +
  `-- ${glossary.length} palavras revisadas à mão (${nExib} exibíveis). df/idf ficam com a construção\n` +
  `-- (mesa_build_titles), que nunca sobrescreve rótulos, kind, tema nem as marcas.\n` +
  `-- Por que name_en não é atualizado no conflito: quem manda no nome é a construção.\n\n` +
  `insert into public.mesa_kw (kw_id, name_en, label_pt, label_en, kind, tema, exibivel, spoiler, sensivel, reviewed) values\n` +
  glossary.map((r) => `  (${r.kw_id}, ${s(r.name_en)}, ${s(r.label_pt)}, ${s(r.label_en)}, ${s(r.kind)}, ${s(r.tema)}, ` +
    `${b(r.exibivel)}, ${b(r.spoiler)}, ${b(r.sensivel)}, true)`).join(',\n') +
  `\non conflict (kw_id) do update set\n  label_pt = excluded.label_pt, label_en = excluded.label_en, kind = excluded.kind, tema = excluded.tema,\n` +
  `  exibivel = excluded.exibivel, spoiler = excluded.spoiler, sensivel = excluded.sensivel, reviewed = true;\n`;

// =====================================================================
// 2) Ocasiões (mesa_occasions) + overrides (mesa_occasion_overrides)
// =====================================================================
const SIGNALS = new Set(['chuva', 'amor', 'familia', 'galera', 'maratona', 'choro', 'riso', 'susto']);
const occasions = parseCsv('occasions.csv');
const occByKey = new Map(occasions.map((o) => [o.key, o]));
const EXPECTED = ['chuva', 'amor', 'familia', 'galera', 'noventa', 'episodio', 'maratona', 'chorar', 'rir', 'susto', 'no', 'colo',
  'season:halloween', 'season:christmas'];
for (const k of EXPECTED) if (!occByKey.has(k)) err(`occasions: falta "${k}"`);
if (occasions.length !== EXPECTED.length) err(`occasions: ${occasions.length} linhas, esperado ${EXPECTED.length}`);

function moodW(v: string): Record<string, number> {
  const o: Record<string, number> = {};
  for (const p of list(v)) {
    const [k, w] = p.split(':');
    if (!k || w === undefined || Number.isNaN(Number(w))) err(`occasions: mood_w inválido "${p}"`);
    o[k] = Number(w);
  }
  return o;
}
function reqMood(v: string): unknown {
  if (!v) return null;
  const o: Record<string, unknown> = {};
  for (const p of list(v)) {
    const [k, val] = p.split('=');
    if (k === 'moods') o.moods = val.split('|');
    else if (k === 'genres') o.genres = val.split('|').map(Number);
    else if (k === 'genre_weight') o.genre_weight = Number(val);
    else err(`occasions: require_mood_or_genre inválido "${p}"`);
  }
  return o;
}

const occRows = occasions.map((o) => {
  if (!['who', 'time', 'feel', 'season'].includes(o.grp)) err(`occasions ${o.key}: grp ${o.grp}`);
  if (o.comment_signal && !SIGNALS.has(o.comment_signal)) err(`occasions ${o.key}: comment_signal ${o.comment_signal}`);
  for (const f of list(o.exclude_flags)) if (!['heavy', 'heavy_family', 'sad'].includes(f)) err(`occasions ${o.key}: flag ${f}`);
  const rm = reqMood(o.require_mood_or_genre);
  return `  (${s(o.key)}, ${s(o.grp)}, ${n(o.sort)}, ${s(o.media)}, ${n(o.rt_min)}, ${n(o.rt_max)}, ${n(o.ep_max)}, ${n(o.total_min)}, ${n(o.total_max)}, ` +
    `${b(o.ended_only)}, ${n(o.vc_min)}, ${n(o.vc_min_cypher)}, ${n(o.va_min)}, ${n(o.age_max)}, ${arr(list(o.exclude_moods))}, ` +
    `${rm ? json(rm) : 'null'}, ${arr(list(o.exclude_flags))}, ${json(moodW(o.mood_w))}, ${arr(list(o.tones_plus))}, ` +
    `${arr(list(o.tones_minus))}, ${s(o.comment_signal)}, ${arr(list(o.pass_oracles))}, ${s(o.season_event)}, true)`;
});

// Sinal do comentário → ocasião que ele confirma (§6.2.3). "sozinho" confirma a chuva.
const SIG_OCC: Record<string, string> = { choro: 'chorar', chuva: 'chuva', sozinho: 'chuva', amor: 'amor', familia: 'familia',
  galera: 'galera', maratona: 'maratona', riso: 'rir', susto: 'susto' };
const SIG_FLAG: Record<string, string> = { choro: 'choro', chuva: 'chuva', sozinho: 'chuva', amor: 'amor', familia: 'familia',
  galera: 'galera', maratona: 'maratona', riso: 'riso', susto: 'susto' };

type Ov = { occasion_key: string; media_type: string; tmdb_id: string; sign: number; source: 'comentario' | 'curadoria'; note: string };
const ovs = new Map<string, Ov>();
const flags = new Map<string, { media_type: string; tmdb_id: string; ressalva: boolean; signals: Set<string> }>();
const flagOf = (mt: string, id: string) => {
  const k = `${mt}:${id}`;
  if (!flags.has(k)) flags.set(k, { media_type: mt, tmdb_id: id, ressalva: false, signals: new Set() });
  return flags.get(k)!;
};
function addOv(o: Ov, where: string) {
  const occ = occByKey.get(o.occasion_key);
  if (!occ) { err(`${where}: ocasião desconhecida ${o.occasion_key}`); return; }
  if (!['movie', 'tv'].includes(o.media_type)) err(`${where}: media_type ${o.media_type}`);
  // A mídia própria da ocasião nunca é cruzada (filme em "maratona", série em "chuva").
  if (occ.media && occ.media !== o.media_type) err(`${where}: ${o.media_type} em ${o.occasion_key}, que é só ${occ.media}`);
  const k = `${o.occasion_key}|${o.media_type}|${o.tmdb_id}`;
  const prev = ovs.get(k);
  if (prev) {
    if (prev.sign !== o.sign) err(`${where}: sinais opostos para ${k}`);
    // Mesmo sinal pelas duas fontes: fica "comentario" (a voz do oráculo) e a nota junta as duas.
    if (o.source === 'comentario') ovs.set(k, { ...o, note: [o.note, prev.note].filter(Boolean).join(' · ') });
    else prev.note = [prev.note, o.note].filter(Boolean).join(' · ');
  } else ovs.set(k, o);
}

const signals = parseCsv('comment_signals.csv');
const decided = { plus: 0, minus: 0, zero: 0 };
const seenSig = new Set<string>();
for (const [i, r] of signals.entries()) {
  const where = `comment_signals.csv:${i + 2}`;
  if (!(r.signal in SIG_OCC)) { err(`${where}: sinal ${r.signal}`); continue; }
  const key = `${r.signal}|${r.media_type}|${r.tmdb_id}`;
  if (seenSig.has(key)) err(`${where}: candidato repetido ${key}`);
  seenSig.add(key);
  if (!['1', '0', '-1'].includes(r.decision)) err(`${where}: decision "${r.decision}"`);
  // §8.4 WP-CURA 3: nenhum +1 (nem −1) de comentário sem confirmação registrada.
  if (r.decision !== '0' && !r.confirmed_by) err(`${where}: decisão sem confirmed_by`);
  if (r.decision === '0') { decided.zero++; continue; }
  const sign = Number(r.decision);
  if (sign === 1) decided.plus++; else decided.minus++;
  addOv({ occasion_key: SIG_OCC[r.signal], media_type: r.media_type, tmdb_id: r.tmdb_id, sign, source: 'comentario',
    note: `comentário confirmado (${r.confirmed_by})${r.note ? ': ' + r.note : ''}` }, where);
  if (sign === 1) flagOf(r.media_type, r.tmdb_id).signals.add(SIG_FLAG[r.signal]);
}

const cur = parseCsv('overrides_curadoria.csv');
for (const [i, r] of cur.entries()) {
  if (!['1', '-1'].includes(r.sign)) err(`overrides_curadoria.csv:${i + 2}: sign ${r.sign}`);
  if (!r.note) err(`overrides_curadoria.csv:${i + 2}: veto sem nota`);
  addOv({ occasion_key: r.occasion_key, media_type: r.media_type, tmdb_id: r.tmdb_id, sign: Number(r.sign), source: 'curadoria',
    note: `${r.note} (${r.reviewed_by})` }, `overrides_curadoria.csv:${i + 2}`);
}

const ovList = [...ovs.values()].sort((a, c) => a.occasion_key.localeCompare(c.occasion_key) || a.media_type.localeCompare(c.media_type) || Number(a.tmdb_id) - Number(c.tmdb_id));
const sqlOccasions = HEADER('Seed das ocasiões (mesa_occasions) e da curadoria por título (mesa_occasion_overrides), SPEC §4 e §6.2') +
  `-- 14 ocasiões (12 + Halloween + Natal), com os números do §4.2. Os textos (nome e frase)\n` +
  `-- moram no i18n mesa.occasions.<key>. Nas épocas, mood_w/tons ficam vazios porque a\n` +
  `-- construção junta a palavra do evento, as listas de seasonal_events e (no Halloween)\n` +
  `-- os títulos de Sombrio com encaixe em "susto".\n\n` +
  `insert into public.mesa_occasions (key, grp, sort, media, rt_min, rt_max, ep_max, total_min, total_max, ended_only,\n` +
  `  vc_min, vc_min_cypher, va_min, age_max, exclude_moods, require_mood_or_genre, exclude_flags, mood_w, tones_plus,\n` +
  `  tones_minus, comment_signal, pass_oracles, season_event, is_active) values\n` +
  occRows.join(',\n') +
  `\non conflict (key) do update set grp = excluded.grp, sort = excluded.sort, media = excluded.media,\n` +
  `  rt_min = excluded.rt_min, rt_max = excluded.rt_max, ep_max = excluded.ep_max, total_min = excluded.total_min,\n` +
  `  total_max = excluded.total_max, ended_only = excluded.ended_only, vc_min = excluded.vc_min,\n` +
  `  vc_min_cypher = excluded.vc_min_cypher, va_min = excluded.va_min, age_max = excluded.age_max,\n` +
  `  exclude_moods = excluded.exclude_moods, require_mood_or_genre = excluded.require_mood_or_genre,\n` +
  `  exclude_flags = excluded.exclude_flags, mood_w = excluded.mood_w, tones_plus = excluded.tones_plus,\n` +
  `  tones_minus = excluded.tones_minus, comment_signal = excluded.comment_signal, pass_oracles = excluded.pass_oracles,\n` +
  `  season_event = excluded.season_event, is_active = excluded.is_active;\n\n` +
  `-- ${ovList.length} overrides: ${ovList.filter((o) => o.source === 'comentario').length} vindos de comentários selados confirmados à mão\n` +
  `-- (comment_signals.csv, coluna confirmed_by) e ${ovList.filter((o) => o.source === 'curadoria').length} vetos/reforços da revisão das ocasiões\n` +
  `-- (overrides_curadoria.csv). +1 = encaixe 1 (respeitando a mídia da ocasião); −1 = fora.\n` +
  `insert into public.mesa_occasion_overrides (occasion_key, media_type, tmdb_id, sign, source, note) values\n` +
  ovList.map((o) => `  (${s(o.occasion_key)}, ${s(o.media_type)}, ${o.tmdb_id}, ${o.sign}, ${s(o.source)}, ${s(o.note)})`).join(',\n') +
  `\non conflict (occasion_key, media_type, tmdb_id) do update set sign = excluded.sign, source = excluded.source, note = excluded.note;\n`;

// =====================================================================
// 3) Ressalvas + sinais (mesa_comment_flags)
// =====================================================================
const ress = parseCsv('ressalvas.csv');
const seenRess = new Set<string>();
let nRess = 0;
for (const [i, r] of ress.entries()) {
  const k = `${r.media_type}:${r.tmdb_id}`;
  if (seenRess.has(k)) err(`ressalvas.csv:${i + 2}: repetido ${k}`);
  seenRess.add(k);
  if (!['0', '1'].includes(r.ressalva)) err(`ressalvas.csv:${i + 2}: ressalva "${r.ressalva}"`);
  if (!r.confirmed_by) err(`ressalvas.csv:${i + 2}: sem confirmed_by`);
  if (r.ressalva === '1') { flagOf(r.media_type, r.tmdb_id).ressalva = true; nRess++; }
}
const flagList = [...flags.values()].sort((a, c) => a.media_type.localeCompare(c.media_type) || Number(a.tmdb_id) - Number(c.tmdb_id));
const sqlFlags = HEADER('Seed das marcas dos comentários selados (mesa_comment_flags), SPEC §3.7, §6.2.3 e §6.3') +
  `-- ${nRess} títulos com ressalva (o oráculo diminui a obra: nunca viram a quarta carta e as falas\n` +
  `-- de força ficam inelegíveis) e os sinais de ocasião confirmados à mão. Uma linha por título.\n\n` +
  `insert into public.mesa_comment_flags (media_type, tmdb_id, ressalva, signals) values\n` +
  flagList.map((f) => `  (${s(f.media_type)}, ${f.tmdb_id}, ${f.ressalva}, ${arr([...f.signals].sort())})`).join(',\n') +
  `\non conflict (media_type, tmdb_id) do update set ressalva = excluded.ressalva, signals = excluded.signals;\n`;

// =====================================================================
// 4) Reforço do reconhecimento (mesa_recognition_boost)
// =====================================================================
const rec = parseCsv('recognition.csv');
if (rec.length > 15) err(`recognition.csv: ${rec.length} títulos (máximo 15, §6.4)`);
const sqlRec = HEADER('Seed do reforço do reconhecimento (mesa_recognition_boost), SPEC §6.4') +
  `-- Até 15 filmes brasileiros ou muito vistos no Brasil, já nas prateleiras, que a regra de votos\n` +
  `-- (os 8 mais votados de cada oráculo × humor) não traria. Ganham recog_rank = 0.\n\n` +
  `insert into public.mesa_recognition_boost (media_type, tmdb_id, note) values\n` +
  rec.map((r) => `  (${s(r.media_type)}, ${r.tmdb_id}, ${s(`${r.title} · ${r.note}`)})`).join(',\n') +
  `\non conflict (media_type, tmdb_id) do update set note = excluded.note;\n`;

// ---------- Saída ----------
const forbidden = /\b(delete|drop|truncate)\b/i;
const outputs: [string, string][] = [
  ['20261105105000_mesa_seed_glossary.sql', sqlGlossary],
  ['20261105106000_mesa_seed_occasions.sql', sqlOccasions],
  ['20261105107000_mesa_seed_comment_flags.sql', sqlFlags],
  ['20261105108000_mesa_seed_recognition.sql', sqlRec],
];
for (const [f, sql] of outputs) {
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--'));
  // Só os comandos contam: as notas dentro das strings podem citar palavras livres, mas
  // não pode existir comando destrutivo fora delas.
  const stripped = code.join('\n').replace(/'(?:[^']|'')*'/g, "''");
  if (forbidden.test(stripped)) err(`${f}: comando proibido (delete/drop/truncate)`);
}

console.log(`glossário: ${glossary.length} palavras (${nExib} exibíveis)`);
console.log(`ocasiões: ${occasions.length}`);
console.log(`comentários: ${signals.length} candidatos lidos → +1: ${decided.plus}, −1: ${decided.minus}, descartados: ${decided.zero}`);
console.log(`overrides: ${ovList.length} (comentário ${ovList.filter((o) => o.source === 'comentario').length}, curadoria ${ovList.filter((o) => o.source === 'curadoria').length})`);
console.log(`comment_flags: ${flagList.length} títulos (${nRess} com ressalva, ${flagList.filter((f) => f.signals.size).length} com sinal)`);
console.log(`reconhecimento: ${rec.length}`);

if (errors.length) {
  console.error(`\n${errors.length} problema(s):\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
if (!args.has('--check')) {
  for (const [f, sql] of outputs) writeFileSync(join(MIG, f), sql);
  console.log('migrações gravadas em supabase/migrations/');
}
if (args.has('--counts')) {
  // Consulta só de leitura para refazer a tabela do §4.4 antes de os seeds existirem no
  // banco: os overrides vão embutidos num VALUES (o resto é o bloco "base" de queries.sql).
  const vals = ovList.map((o) => `(${s(o.occasion_key)},${s(o.media_type)},${o.tmdb_id},${o.sign})`).join(',');
  writeFileSync(join(HERE, 'counts.overrides.sql'), `-- gerado; usado por queries.sql §6\nov(occasion_key, media_type, tmdb_id, sign) as (values ${vals})\n`);
  console.log('counts.overrides.sql gravado');
}
