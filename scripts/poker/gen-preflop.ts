/**
 * Gera src/lib/poker/bots/preflopTable.ts: as 169 mãos iniciais ordenadas pela
 * equidade contra 3 mãos aleatórias (Monte Carlo com semente fixa) e o "top X%"
 * de cada uma, ponderado por combinações (SPEC §3.2).
 *
 *   node scripts/poker/gen-preflop.ts [--iters 40000]
 *
 * Determinístico: a mesma versão do motor e as mesmas iterações dão o mesmo arquivo.
 */
import { writeFileSync } from 'node:fs';
import { createRng, estimateEquity } from '../../src/lib/poker/index.ts';
import type { Card } from '../../src/lib/poker/index.ts';

const RANKS = 'AKQJT98765432';
const argIters = process.argv.indexOf('--iters');
const ITERS = argIters > 0 ? Number(process.argv[argIters + 1]) : 40000;

interface Row { cls: string; combos: number; eq: number }
const rows: Row[] = [];
for (let i = 0; i < 13; i++) {
  for (let j = i; j < 13; j++) {
    const a = RANKS[i];
    const b = RANKS[j];
    const variants: [string, Card, Card, number][] = i === j
      ? [[a + b, `${a}s` as Card, `${b}h` as Card, 6]]
      : [[`${a}${b}s`, `${a}s` as Card, `${b}s` as Card, 4], [`${a}${b}o`, `${a}s` as Card, `${b}h` as Card, 12]];
    for (const [cls, c1, c2, combos] of variants) {
      const r = estimateEquity({ hole: [c1, c2], opponents: 3, iterations: ITERS, rng: createRng(`preflop:${cls}`) });
      rows.push({ cls, combos, eq: r.equity });
    }
  }
}
rows.sort((x, y) => y.eq - x.eq || (x.cls < y.cls ? -1 : 1));
let cum = 0;
const rank: Record<string, number> = {};
const eq: Record<string, number> = {};
for (const r of rows) {
  cum += r.combos;
  rank[r.cls] = Math.round((cum / 1326) * 100 * 100) / 100;
  eq[r.cls] = Math.round(r.eq * 10000) / 10000;
}

const out = `// GERADO por scripts/poker/gen-preflop.ts — não edite à mão.
// ${ITERS} iterações por mão contra 3 mãos aleatórias.
// PREFLOP_RANK[classe] = "top X%" acumulado até esta mão (inclusive), ponderado por combinações:
// menor = melhor (AA ≈ 0,45). PREFLOP_EQ = equidade contra 3 mãos aleatórias.

/** As 169 classes, da melhor para a pior. */
export const PREFLOP_ORDER: readonly string[] = ${JSON.stringify(rows.map((r) => r.cls))};

export const PREFLOP_RANK: Readonly<Record<string, number>> = ${JSON.stringify(rank)};

export const PREFLOP_EQ: Readonly<Record<string, number>> = ${JSON.stringify(eq)};
`;
writeFileSync(new URL('../../src/lib/poker/bots/preflopTable.ts', import.meta.url), out);
console.log(`ok: ${rows.length} classes; top 5: ${rows.slice(0, 5).map((r) => `${r.cls} ${rank[r.cls]}%`).join(', ')}`);
