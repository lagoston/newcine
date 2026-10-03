import type { OracleId } from './oracleTheme';

// Selo de orçamento do menu do filme: em que nível (1 a 5) o orçamento do
// filme está e o que o oráculo diz disso.
//
// Como o nível é calculado (o critério mais fiel que testamos):
//   1. o orçamento do TMDB (dólares da época) é corrigido pela inflação
//      americana (CPI-U médio anual) até dólares de 2025 — US$ 6 milhões
//      em 1972 viram ~US$ 45 milhões hoje;
//   2. o valor corrigido cai numa das faixas que a indústria usa:
//        1 Muito baixo  < US$ 2 mi    (micro-orçamento, "de garagem")
//        2 Baixo        < US$ 15 mi   (independente)
//        3 Razoável     < US$ 60 mi   (estúdio, médio orçamento)
//        4 Alto         < US$ 150 mi  (superprodução)
//        5 Muito alto  >= US$ 150 mi  (blockbuster/tentpole)
// A média dos filmes do próprio banco foi descartada como régua: o
// catálogo é puxado pra filmes populares (média corrigida ~US$ 65 mi), o
// que jogaria quase todo filme independente em "muito baixo". Com as
// faixas acima, os 2.465 filmes com orçamento do banco (30/09/2026) ficam
// 6% / 21% / 38% / 24% / 12%.

export type BudgetLevel = 1 | 2 | 3 | 4 | 5;

const BASE_YEAR = 2025;
// CPI-U médio anual (EUA), pontos de referência; entre eles, interpolação.
const CPI: [number, number][] = [
  [1910, 9.1], [1915, 10.1], [1920, 20.0], [1925, 17.5], [1930, 16.7], [1935, 13.7], [1940, 14.0], [1945, 18.0],
  [1950, 24.1], [1955, 26.8], [1960, 29.6], [1965, 31.5], [1970, 38.8], [1975, 53.8], [1980, 82.4], [1985, 107.6],
  [1990, 130.7], [1995, 152.4], [2000, 172.2], [2005, 195.3], [2010, 218.1], [2015, 237.0], [2016, 240.0],
  [2017, 245.1], [2018, 251.1], [2019, 255.7], [2020, 258.8], [2021, 271.0], [2022, 292.7], [2023, 304.7],
  [2024, 313.7], [2025, 321.5],
];

function cpiFor(year: number): number {
  const y = Math.min(Math.max(year, CPI[0][0]), BASE_YEAR);
  for (let i = 0; i < CPI.length - 1; i += 1) {
    const [y0, v0] = CPI[i];
    const [y1, v1] = CPI[i + 1];
    if (y >= y0 && y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
  }
  return CPI[CPI.length - 1][1];
}

// Orçamento em dólares de 2025.
export function adjustedBudget(budget: number, releaseDate?: string | null): number {
  const year = parseInt((releaseDate || '').slice(0, 4), 10);
  if (Number.isNaN(year)) return budget;
  return (budget * cpiFor(BASE_YEAR)) / cpiFor(year);
}

const LIMITS = [2e6, 15e6, 60e6, 150e6];

// Abaixo de US$ 1.000 é erro de cadastro no TMDB (ex.: "1" querendo dizer
// "1 milhão") — sem selo.
export function budgetLevel(budget: number, releaseDate?: string | null): BudgetLevel | null {
  if (!budget || budget < 1000) return null;
  const value = adjustedBudget(budget, releaseDate);
  const index = LIMITS.findIndex((limit) => value < limit);
  return (index === -1 ? 5 : index + 1) as BudgetLevel;
}

export const BUDGET_LEVEL_EMOJI: Record<BudgetLevel, string> = {
  1: '💸',
  2: '💰',
  3: '💰💰',
  4: '💰💰💰',
  5: '💰💰💰💰',
};

export const BUDGET_LEVEL_LABEL: Record<BudgetLevel, { pt: string; en: string }> = {
  1: { pt: 'Muito baixo', en: 'Very low' },
  2: { pt: 'Baixo', en: 'Low' },
  3: { pt: 'Razoável', en: 'Moderate' },
  4: { pt: 'Alto', en: 'High' },
  5: { pt: 'Muito alto', en: 'Very high' },
};

type Line = { title: { pt: string; en: string }; text: { pt: string; en: string } };

// O que cada oráculo diz de cada nível (textos do Bruno; inglês adaptado).
export const BUDGET_SAYINGS: Record<OracleId, Record<BudgetLevel, Line>> = {
  bogart: {
    1: { title: { pt: 'Filme de Garagem', en: 'Garage Film' }, text: { pt: 'Feito na raça, com criatividade acima do dinheiro.', en: 'Made on sheer grit, with creativity over money.' } },
    2: { title: { pt: 'Produção Independente', en: 'Independent Production' }, text: { pt: 'Pouco dinheiro, mas já com estrutura profissional.', en: 'Little money, but already a professional setup.' } },
    3: { title: { pt: 'Produção de Estúdio', en: 'Studio Production' }, text: { pt: 'Orçamento confortável para entregar uma produção sólida.', en: 'A comfortable budget to deliver a solid production.' } },
    4: { title: { pt: 'Superprodução', en: 'Big-Budget Production' }, text: { pt: 'Muito dinheiro envolvido, grandes equipes e recursos.', en: 'Lots of money involved, big crews and resources.' } },
    5: { title: { pt: 'Mega Blockbuster', en: 'Mega Blockbuster' }, text: { pt: 'Orçamento gigantesco, pensado para espetáculo global.', en: 'A gigantic budget, built for global spectacle.' } },
  },
  fincher: {
    1: { title: { pt: 'No Amor e na Gambiarra', en: 'Love and Duct Tape' }, text: { pt: 'Pouco dinheiro, muita improvisação e criatividade para fazer acontecer.', en: 'Little money, lots of improvisation and creativity to make it happen.' } },
    2: { title: { pt: 'Pé no Chão', en: 'Feet on the Ground' }, text: { pt: 'Produção enxuta, que precisa escolher muito bem onde gastar.', en: 'A lean production that has to choose very carefully where to spend.' } },
    3: { title: { pt: 'Temos um Orçamento', en: 'We Have a Budget' }, text: { pt: 'Já existe dinheiro suficiente para fazer as coisas direito — sem esbanjar.', en: 'There is enough money to do things right — without splurging.' } },
    4: { title: { pt: 'Manda Fazer', en: 'Just Build It' }, text: { pt: 'O dinheiro deixa de ser uma grande limitação: cenários, elenco, efeitos e escala entram no jogo.', en: 'Money stops being a big limitation: sets, cast, effects and scale come into play.' } },
    5: { title: { pt: 'Queima o Dinheiro', en: 'Burn the Money' }, text: { pt: 'Orçamento colossal, onde praticamente qualquer extravagância de produção é possível.', en: 'A colossal budget where practically any production extravagance is possible.' } },
  },
  cypher: {
    1: { title: { pt: 'Troco do Café', en: 'Coffee Change' }, text: { pt: 'O orçamento mal paga o café da equipe, mas alguém teve uma ideia.', en: "The budget barely covers the crew's coffee, but someone had an idea." } },
    2: { title: { pt: 'Vaquinha Cinematográfica', en: 'Film Whip-Round' }, text: { pt: 'Todo mundo junta um pouco e torce para dar certo.', en: 'Everyone chips in a little and hopes it works out.' } },
    3: { title: { pt: 'Temos Verba', en: 'We Have Funds' }, text: { pt: 'Já dá para fazer cinema de verdade sem vender a alma.', en: 'You can make real cinema without selling your soul.' } },
    4: { title: { pt: 'Chefe, Libera', en: 'Boss, Sign It Off' }, text: { pt: 'O orçamento permite começar a dizer “por que não?”', en: 'The budget lets you start saying “why not?”' } },
    5: { title: { pt: 'Rasga o Cheque', en: 'Tear Up the Check' }, text: { pt: 'Dinheiro deixou de ser obstáculo e virou efeito especial.', en: 'Money stopped being an obstacle and became a special effect.' } },
  },
};

// Qual oráculo comenta o orçamento: o mesmo critério das prateleiras de
// cada um — Bogart (2000 em diante, popular), Fincher (até 1999, popular
// ou cult), Cypher (pouco votado, qualquer época). Se o filme já está nas
// prateleiras de algum oráculo (os selos da capa), vale um deles —
// preferindo o que o critério escolheria.
export function budgetOracle(releaseDate: string | null | undefined, voteCount: number | null | undefined, poolOracles: string[] = []): OracleId {
  const year = parseInt((releaseDate || '').slice(0, 4), 10);
  const votes = voteCount ?? 0;
  let byRule: OracleId;
  if (!Number.isNaN(year) && year >= 2000 && votes >= 500) byRule = 'bogart';
  else if (!Number.isNaN(year) && year <= 1999 && votes >= 200) byRule = 'fincher';
  else byRule = 'cypher';
  const valid = poolOracles.filter((o): o is OracleId => o === 'bogart' || o === 'fincher' || o === 'cypher');
  if (valid.length === 0 || valid.includes(byRule)) return byRule;
  return valid[0];
}
