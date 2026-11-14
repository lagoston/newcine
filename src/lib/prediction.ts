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

// O espectro do Oráculo (14/11/2026, pedido do Bruno): "Números absolutos
// são cartesianos demais para o CineOracle; eles não têm alma." A previsão
// deixou de ser um número e virou cor e posição:
//   • no menu do título, o Astrolábio (PredictionGauge): um arco com o
//     espectro e uma agulha que dança e trava onde a nota deve cair;
//   • nas capas, o Fio do Destino (FateThread): uma linha fina na base do
//     pôster, com uma centelha que para na posição da nota.
// Os dois leem a mesma paleta, pedida por ele para fugir do vermelho/verde:
// azul gélido e nebuloso (nota baixa), púrpura (nota média) e dourado
// incandescente (o 10). Entre o púrpura e o dourado a cor passa por magenta e
// âmbar: a mistura direta dos dois dá um marrom apagado.

// A cor de cada nota inteira, de 0 a 10.
export const ORACLE_SPECTRUM: string[] = [
  '#6F87A6', // 0  azul nebuloso
  '#6996C6', // 1
  '#62A6E8', // 2  azul gélido
  '#5E8FF0', // 3
  '#6E79F5', // 4  anil
  '#8667F6', // 5  púrpura
  '#A05AF5', // 6
  '#C051EA', // 7  púrpura quente
  '#E659B0', // 8  magenta
  '#F99F3F', // 9  âmbar
  '#FFD761', // 10 dourado incandescente
];

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// A cor do espectro numa nota qualquer (7,4 fica entre a do 7 e a do 8).
export function spectrumColor(rating: number): string {
  const at = Math.min(10, Math.max(0, rating));
  const low = Math.floor(at);
  const high = Math.min(10, low + 1);
  const a = channels(ORACLE_SPECTRUM[low]);
  const b = channels(ORACLE_SPECTRUM[high]);
  const mix = at - low;
  return `rgb(${a.map((value, i) => Math.round(value + (b[i] - value) * mix)).join(',')})`;
}

// A largura da previsão. O modelo (predict_ratings, no banco) trata a nota
// que a pessoa daria como uma curva em torno da expectativa (mu), com a
// largura do ruído pessoal (sigma) — o quanto as notas dela costumam fugir do
// que o modelo esperava. A chance de a nota passar de x é
//   1 / (1 + exp(-1,702 · (mu − x) / sigma)),
// a mesma conta que o banco usa para a chance de 9 ou 10. Dessa curva sai a
// região onde a nota impera: a faixa em volta da expectativa que guarda
// metade da chance (mu ± 0,645 · sigma). É o trecho do arco que acende.

// Largura usada quando o banco não manda a da pessoa (a mediana das contas
// reais em 14/11/2026; elas vão de 1,0 a 2,0).
export const DEFAULT_SIGMA = 1.5;

export function reigningRange(mu: number, sigma: number | null): [number, number] {
  const half = 0.645 * (sigma !== null && sigma > 0 ? sigma : DEFAULT_SIGMA);
  return [Math.max(0, mu - half), Math.min(10, mu + half)];
}
