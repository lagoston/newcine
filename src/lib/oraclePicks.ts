import { supabase } from './supabase';
import type { OracleId } from './oracleTheme';

// Escolhidos a dedo (Oracle Hub): os melhores títulos que cada oráculo tem nas
// três prateleiras favoritas da pessoa, pela nota prevista. O servidor manda
// filmes e séries separados (get_oracle_hub_picks, guardado por 6 horas);
// a tela sorteia, a cada abertura, quantos de cada tipo entram na fileira.

export interface OraclePick {
  id: number;
  type: 'movie' | 'tv';
  // Nota prevista (0–10), ou null quando o oráculo ainda não sabe prever.
  rating: number | null;
  // Expectativa contínua (ordena a fileira).
  mu: number | null;
  // A prateleira (humor) de onde o título saiu.
  mood: string;
}

export interface OracleHubPicks {
  moods: string[];
  // true: as três prateleiras vêm das avaliações da pessoa; false: ainda
  // completadas por uma ordem padrão.
  personal: boolean;
  totalTitles: number;
  shelves: number;
  byOracle: Record<OracleId, { movies: OraclePick[]; series: OraclePick[] }>;
}

type Row = Record<string, unknown>;

const toPicks = (value: unknown, type: 'movie' | 'tv'): OraclePick[] =>
  Array.isArray(value)
    ? (value as Row[])
        .map((row) => ({
          id: Number(row.id),
          type,
          rating: typeof row.r === 'number' ? row.r : null,
          mu: typeof row.mu === 'number' ? row.mu : null,
          mood: typeof row.mood === 'string' ? row.mood : '',
        }))
        .filter((pick) => Number.isFinite(pick.id) && pick.id > 0)
    : [];

const ORACLE_IDS: OracleId[] = ['bogart', 'fincher', 'cypher'];

export async function fetchOracleHubPicks(): Promise<OracleHubPicks> {
  const { data, error } = await supabase.rpc('get_oracle_hub_picks');
  if (error) throw error;
  const raw = (data || {}) as Row;
  const oracles = (raw.oracles || {}) as Record<string, Row>;
  const byOracle = Object.fromEntries(
    ORACLE_IDS.map((id) => [id, { movies: toPicks(oracles[id]?.movies, 'movie'), series: toPicks(oracles[id]?.series, 'tv') }])
  ) as OracleHubPicks['byOracle'];
  return {
    moods: Array.isArray(raw.moods) ? (raw.moods as string[]) : [],
    personal: raw.personal === true,
    totalTitles: Number(raw.total_titles) || 0,
    shelves: Number(raw.shelves) || 0,
    byOracle,
  };
}

export const PICKS_PER_ORACLE = 10;

// A parte de séries da fileira, sorteada a cada abertura do Hub.
const SERIES_SHARES = [0.2, 0.3, 0.4, 0.5, 0.6];
export const drawSeriesShare = (): number => SERIES_SHARES[Math.floor(Math.random() * SERIES_SHARES.length)];

// Os melhores de cada tipo na proporção sorteada (se faltar de um tipo, o
// outro completa), do mais provável de agradar para o menos.
export function mixPicks(movies: OraclePick[], series: OraclePick[], seriesShare: number, total = PICKS_PER_ORACLE): OraclePick[] {
  const wantSeries = Math.min(series.length, Math.round(total * seriesShare));
  const takeMovies = Math.min(movies.length, total - wantSeries);
  const takeSeries = Math.min(series.length, total - takeMovies);
  return [...movies.slice(0, takeMovies), ...series.slice(0, takeSeries)].sort((a, b) => (b.mu ?? -1) - (a.mu ?? -1) || a.id - b.id);
}
