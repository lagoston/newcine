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
