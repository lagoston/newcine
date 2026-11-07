import { MOODS } from '../../lib/moods';

// Para onde vai um link antigo da Biblioteca dos Oráculos (05/11/2026; SPEC
// §7.1) — usado por pages/OracleLibrariesRedirect.tsx. Recebe o `search` do
// endereço antigo ("?oracle=fincher&type=tv") e devolve o caminho novo.

const ORACLE_IDS = new Set(['bogart', 'fincher', 'cypher']);
const MOOD_KEYS = new Set(MOODS.map((m) => m.key as string));

export function librariesTarget(search: string): string {
  const params = new URLSearchParams(search);
  const moodParam = params.get('mood');
  const typeParam = params.get('type');
  const oracleParam = params.get('oracle');
  const type = typeParam === 'movie' || typeParam === 'tv' ? typeParam : null;
  const oracle = oracleParam && ORACLE_IDS.has(oracleParam) ? oracleParam : 'bogart';

  // Um humor que não existe não vira pergunta (a Mesa recusaria com bad_ask):
  // segue as outras regras como se não tivesse vindo.
  if (moodParam && MOOD_KEYS.has(moodParam)) {
    return `/oracle/mesa?ask=mood:${moodParam}${type ? `&media=${type}` : ''}`;
  }
  if (type) return `/oracle/acervo?oracle=${oracle}&type=${type}`;
  return '/oracle/mesa';
}
