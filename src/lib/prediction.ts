// Nota prevista (modelo v4, ver supabase/migrations/20261003200000_prediction_v4.sql).
//
// Cada previsão vem com duas coisas:
//   • a nota esperada (inteiro de 0 a 10);
//   • a chance de o título virar um 9 ou 10 da pessoa (0 a 1).
//
// A nota esperada é honesta: só passa de 8 quando as evidências sustentam.
// A chance é o que aponta as obras-primas em potencial — um 8 com 60% de
// chance de 9+ é uma aposta forte pra quem dá 9 ou 10 a poucos filmes.
// No teste com as notas reais, quando a chance passou de 40%, mais da
// metade dos títulos (53%) virou mesmo um 9 ou 10.

export const MASTERPIECE_CHANCE = 0.4;

export const isMasterpieceCandidate = (chance: number | null | undefined): chance is number =>
  typeof chance === 'number' && chance >= MASTERPIECE_CHANCE;

// 0.687 → "69%"
export const formatChance = (chance: number): string => `${Math.round(chance * 100)}%`;
