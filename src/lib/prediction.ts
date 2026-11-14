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

// O espectro da previsão (14/11/2026, pedido do Bruno): no menu do título, a
// nota prevista e a chance de 10 deixaram de ser dois números e viraram uma
// barra com as onze notas e uma agulha. A barra acende cada nota conforme a
// chance dela; a agulha oscila onde a nota deve cair.
//
// De onde saem as chances: o modelo (predict_ratings, no banco) trata a nota
// que a pessoa daria como uma curva em torno da expectativa (mu), com a
// largura do ruído pessoal (sigma) — o quanto as notas dela costumam fugir do
// que o modelo esperava. A chance de a nota passar de x é
//   1 / (1 + exp(-1,702 · (mu − x) / sigma)),
// a mesma conta que o banco usa para a chance de 9 ou 10. A chance de 10 vem
// pronta do banco (ela tem um ajuste próprio) e o que sobra é repartido entre
// as notas de 0 a 9. Se a conta do banco mudar, esta acompanha.

// Largura usada quando o banco não manda a da pessoa (a mediana das contas
// reais em 14/11/2026; elas vão de 1,0 a 2,0).
export const DEFAULT_SIGMA = 1.5;

const chanceAbove = (x: number, mu: number, sigma: number): number => 1 / (1 + Math.exp((-1.702 * (mu - x)) / sigma));

// A chance de cada nota inteira, de 0 a 10 (onze valores que somam 1).
export function ratingSpectrum(mu: number, sigma: number | null, tenChance: number | null): number[] {
  const width = sigma !== null && sigma > 0 ? sigma : DEFAULT_SIGMA;
  const lower: number[] = [];
  for (let rating = 0; rating <= 9; rating += 1) {
    const from = rating === 0 ? 1 : chanceAbove(rating - 0.5, mu, width);
    lower.push(Math.max(0, from - chanceAbove(rating + 0.5, mu, width)));
  }
  const ten = tenChance !== null && tenChance >= 0 && tenChance <= 1 ? tenChance : chanceAbove(9.5, mu, width);
  const rest = lower.reduce((sum, p) => sum + p, 0) || 1;
  return [...lower.map((p) => (p / rest) * (1 - ten)), ten];
}
