// WP-QA · 05/11/2026 · renderiza TODAS as falas com slot usando os fatos REAIS
// das cartas capturadas do banco (Bruno, Bruno·chuva, Tonico) e procura
// sobra de "{", "undefined", espaço duplo, "a 8" em inglês e tamanho acima do teto.
import { LINES } from '../../../src/lib/mesa/dialogue/lines.pt.ts';
import { EN } from '../../../src/lib/mesa/dialogue/lines.en.ts';
import { slotValues } from '../../../src/lib/mesa/dialogue/director.ts';
import { renderText, measure, BALLOON_MAX, MIRROR_MAX, REACTION_MAX } from '../../../src/lib/mesa/dialogue/render.ts';
import fs from 'node:fs';
const D = 'src/__preview_qa__/data/';
const load = (f: string) => JSON.parse(fs.readFileSync(D + f, 'utf8'));
const bruno = load('bruno_daily.json');
const chuva = { ...load('bruno_chuva.json'), me: bruno.me, asks: bruno.asks };
const tonico = load('tonico_daily.json');
const payloads: [string, any][] = [['bruno', bruno], ['chuva', chuva], ['tonico', tonico]];
let n = 0; const bad: string[] = []; const samples: string[] = [];
for (const [pn, p] of payloads) for (const lang of ['pt', 'en'] as const) for (const card of p.cards) {
  const v = slotValues({ lang, payload: p, hour: 21, weekday: 4 } as any, { card, rating: 9, title: lang === 'pt' ? card.title.title_pt : card.title.title_en, weekday: 3, ask: p.ask?.key ?? null });
  for (const l of LINES as any[]) {
    const text = lang === 'pt' ? l.pt : (EN as any)[l.id];
    if (!text || !/\{/.test(text)) continue;
    const out = renderText(text, v, lang);
    if (out === null) continue; // falta slot: a fala fica inelegível (regra do Diretor)
    n++;
    const max = l.beat === 'mirror' || l.beat === 'mirrorClose' ? MIRROR_MAX : l.beat === 'verdict' ? REACTION_MAX : BALLOON_MAX;
    const problems = [];
    if (/[{}]|undefined|null|NaN/.test(out)) problems.push('slot');
    if (/ {2}| [,.]/.test(out)) problems.push('espaço');
    if (lang === 'en' && /\ba [8]\b|\ba 11\b|\ba 18\b/.test(out)) problems.push('a/an');
    if (measure(out, lang) > max + 10) problems.push(`tam ${measure(out, lang)}>${max}`);
    if (problems.length) bad.push(`${pn}/${lang}/${card.seat} ${l.id}: ${problems.join(',')} → ${out}`);
    if (samples.length < 40 && /\{(ano|duracao|votos|de_pais|humor|decada|titulo|ocasiao|estreante)\}/.test(text) && lang === (samples.length % 2 ? 'en' : 'pt')) samples.push(`${pn}/${lang}/${card.seat} ${l.id}: ${out}`);
  }
}
console.log('renderizadas', n, 'problemas', bad.length);
console.log(bad.slice(0, 30).join('\n'));
console.log('--- amostra'); console.log(samples.join('\n'));
