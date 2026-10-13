import type { MoodScore } from '../../lib/persona';

// Formatos pequenos da gaveta Conexão (13/10/2026), fora dos componentes
// para o recarregamento rápido do Vite continuar funcionando.

// Nota no formato do idioma: inteira ("9") ou com uma casa ("8,9").
export const formatRating = (value: number, language: string, decimals = false) =>
  decimals
    ? value.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : String(Math.round(value));

// A pessoa tem filmes nas prateleiras (dá para mostrar "Humores lado a lado").
export const hasMoodShares = (scores: MoodScore[] | null | undefined) => Boolean(scores?.some((s) => s.films > 0));
