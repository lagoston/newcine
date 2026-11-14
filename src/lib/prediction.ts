// Nota prevista (modelo v4, ver supabase/migrations/20261003200000_prediction_v4.sql
// e 20261003210000_prediction_v4_cut.sql).
//
// O banco devolve a nota já pronta pra exibir: a expectativa arredondada,
// que sobe pra 9 quando a chance de o título virar um 9 ou 10 da pessoa
// chega a 40%, e pra 10 quando chega a 70%. Quando a nota prevista é 9 ou
// menos, o menu do título mostra a chance de nota 10 ("X% de chance de nota
// 10") — ver 20261003220000_prediction_ten_chance.sql.

// 0.287 → "29%"; abaixo de 0,5% → "<1%"
export const formatChance = (chance: number): string => (chance < 0.005 ? '<1%' : `${Math.round(chance * 100)}%`);

// A previsão sem número (14/11/2026, pedido do Bruno): "Números absolutos
// são cartesianos demais para o CineOracle; eles não têm alma." A nota
// prevista deixou de ser um algarismo e virou cor e posição:
//   • no menu do título, o Espectrômetro (PredictionGauge): onze lâmpadas, uma
//     por nota, e o Patrono da pessoa pousando onde a nota deve cair;
//   • nas capas, o Fio do Destino (FateThread): uma linha fina na base do
//     pôster, com uma centelha parada na posição da nota.
// As cores são as que o site já usa para nota (ratingTone e ratingBarColor,
// em oracleTheme.ts — as mesmas das prateleiras da biblioteca): cinza no 0,
// vermelho de 1 a 3, amarelo de 4 a 6, verde de 7 a 9 e rosa no 10. A
// primeira versão, do mesmo dia, usava uma paleta própria (azul, púrpura,
// dourado); o Bruno pediu para voltar ao padrão do site.

// A largura da previsão. O modelo (predict_ratings, no banco) trata a nota
// que a pessoa daria como uma curva em torno da expectativa (mu), com a
// largura do ruído pessoal (sigma) — o quanto as notas dela costumam fugir do
// que o modelo esperava. A chance de a nota passar de x é
//   1 / (1 + exp(-1,702 · (mu − x) / sigma)),
// a mesma conta que o banco usa para a chance de 9 ou 10.

// Largura usada quando o banco não manda a da pessoa (a mediana das contas
// reais em 14/11/2026; elas vão de 1,0 a 2,0).
export const DEFAULT_SIGMA = 1.5;

const chanceAbove = (x: number, mu: number, sigma: number) => 1 / (1 + Math.exp((-1.702 * (mu - x)) / sigma));

// A chance de cada nota inteira, de 0 a 10 (soma 1). A do 10 é a que o banco
// calculou (ele dá um desconto próprio ao 10); as outras saem da curva e são
// acertadas para o total fechar.
export function ratingSpectrum(mu: number, sigma: number | null, tenChance: number | null): number[] {
  const width = sigma !== null && sigma > 0 ? sigma : DEFAULT_SIGMA;
  const lower: number[] = [];
  for (let rating = 0; rating <= 9; rating += 1) {
    const from = rating === 0 ? 1 : chanceAbove(rating - 0.5, mu, width);
    lower.push(Math.max(0, from - chanceAbove(rating + 0.5, mu, width)));
  }
  const ten = tenChance !== null && tenChance >= 0 && tenChance <= 1 ? tenChance : chanceAbove(9.5, mu, width);
  const rest = lower.reduce((sum, chance) => sum + chance, 0) || 1;
  return [...lower.map((chance) => (chance / rest) * (1 - ten)), ten];
}

// As lâmpadas do Espectrômetro: 2 = acesa (a nota tem 15% de chance ou mais
// de cair ali), 1 = meia-luz (5% ou mais), 0 = apagada. A lâmpada da nota
// prevista fica sempre acesa. Com as larguras reais das contas (1,0 a 2,0)
// isso dá de duas a três lâmpadas acesas e duas a quatro a meia-luz: quem dá
// notas previsíveis vê um trecho curto; quem varia mais, um trecho largo.
export function lampLevels(predicted: number, mu: number | null, sigma: number | null, tenChance: number | null): number[] {
  const chances = ratingSpectrum(mu ?? predicted, sigma, tenChance);
  return chances.map((chance, rating) => (rating === predicted || chance >= 0.15 ? 2 : chance >= 0.05 ? 1 : 0));
}

// Onde o Patrono pousa: dentro da lâmpada da nota prevista, mais para um lado
// ou para o outro conforme a expectativa. (A nota prevista pode ser maior que
// a expectativa arredondada: ela sobe para 9 ou 10 quando a chance é alta.
// Nesse caso o pouso fica na beirada de baixo da lâmpada.)
export function landingSpot(predicted: number, mu: number | null): number {
  if (mu === null || !Number.isFinite(mu)) return predicted;
  return Math.min(predicted + 0.3, Math.max(predicted - 0.3, mu));
}
