// Nota prevista (modelo v4, ver supabase/migrations/20261003200000_prediction_v4.sql
// e 20261003210000_prediction_v4_cut.sql).
//
// O banco devolve a nota já pronta pra exibir: a expectativa arredondada,
// que sobe pra 9 quando a chance de o título virar um 9 ou 10 da pessoa
// chega a 40%, e pra 10 quando chega a 70%. Abaixo disso, o menu do título
// mostra a chance ("X% de chance de ser um 9 ou 10 seu").

// 0.287 → "29%"
export const formatChance = (chance: number): string => `${Math.round(chance * 100)}%`;
