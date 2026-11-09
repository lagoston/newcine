import { MOODS } from '../../lib/moods';
import type { AcervoMedia, OracleSlot } from '../../lib/mesa/types';

// Os endereços do Acervo (09/11/2026). Desde que o Acervo virou a página
// única da Mesa dos Oráculos, três rotas levam a ele:
//   /oracle/acervo     a página;
//   /oracle/mesa       a Mesa de três cartas (05–09/11), que saiu: os links
//                      dela (?ask=occ:galera, ?ask=mood:catharsis, &media=tv)
//                      abrem o Acervo com o mesmo filtro;
//   /oracle/libraries  a Biblioteca antiga (até 05/11): ?oracle, ?mood e
//                      ?type viram os mesmos filtros do Acervo.
// Usado por pages/OracleAcervo.tsx (ler a URL) e por
// pages/OracleAcervoRedirect.tsx (as duas rotas antigas).

const MOOD_KEYS = new Set(MOODS.map((m) => m.key as string));
const OCCASION_RE = /^[a-z]{2,16}$/;

export interface AcervoParams {
  oracle: OracleSlot;
  media: AcervoMedia;
  // null: o servidor escolhe o humor mais forte da pessoa.
  mood: string | null;
  // O id da ficha ('galera', 'christmas'); o servidor ignora um que não exista.
  occasion: string | null;
}

// Lê o filtro de uma URL (nova ou antiga). Valores inválidos viram o padrão.
export function readAcervoParams(params: URLSearchParams): AcervoParams {
  const oracleParam = params.get('oracle');
  const oracle: OracleSlot = oracleParam === 'fincher' || oracleParam === 'cypher' ? oracleParam : 'bogart';
  const typeParam = params.get('type') ?? params.get('media');
  const media: AcervoMedia = typeParam === 'tv' ? 'tv' : 'movie';

  let mood = params.get('mood');
  let occasion = params.get('ocasiao');
  // O formato da Mesa: ?ask=occ:<id> | mood:<chave> | season:<id>.
  const ask = params.get('ask');
  if (ask) {
    const [kind, id] = ask.split(':');
    if ((kind === 'occ' || kind === 'season') && id) occasion = occasion ?? id;
    else if (kind === 'mood' && id) mood = mood ?? id;
  }
  return {
    oracle,
    media,
    occasion: occasion && OCCASION_RE.test(occasion) ? occasion : null,
    mood: mood && MOOD_KEYS.has(mood) ? mood : null,
  };
}

// O endereço do Acervo para um filtro (só o que veio; o resto, a página
// completa e grava na URL).
export function acervoPath(p: Partial<AcervoParams>): string {
  const out = new URLSearchParams();
  if (p.oracle) out.set('oracle', p.oracle);
  if (p.occasion) out.set('ocasiao', p.occasion);
  else if (p.mood) out.set('mood', p.mood);
  if (p.media) out.set('type', p.media);
  const qs = out.toString();
  return qs ? `/oracle/acervo?${qs}` : '/oracle/acervo';
}

// Um link antigo (Mesa ou Biblioteca) → o Acervo, com a intenção dele.
export function acervoTarget(search: string): string {
  const params = new URLSearchParams(search);
  const read = readAcervoParams(params);
  const typeParam = params.get('type') ?? params.get('media');
  return acervoPath({
    oracle: params.has('oracle') ? read.oracle : undefined,
    occasion: read.occasion ?? undefined,
    mood: read.mood ?? undefined,
    media: typeParam === 'movie' || typeParam === 'tv' ? read.media : undefined,
  });
}
