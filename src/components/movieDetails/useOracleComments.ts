import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getRandomFlavorPhrase } from '../../lib/oracleFlavorPhrases';
import { useTitleMe } from './useTitleMe';

// Os oráculos cuja prateleira tem este título e o comentário de cada um.
//
// Filmes e séries têm prateleiras próprias (movie_ids / tv_ids). Desde
// 30/10/2026 cada título tem o comentário do oráculo SELADO no banco
// (title_oracle_comments): escrito para aquela obra, ou sorteado do banco
// de frases quando o título entrou na prateleira. Abrir de novo mostra
// sempre o mesmo comentário, em filmes e em séries.
//
// Fica na casca do menu (os selos sobre o pôster e o selo do orçamento usam
// `sources`). Os balões que aparecem sozinhos e os temporizadores deles são
// da seção dos selos (OracleSeals), que recomeça o ciclo quando este objeto
// muda.
export interface OracleComments {
  sources: string[];
  phrases: Record<string, string>;
}
const NONE: OracleComments = { sources: [], phrases: {} };

export function useOracleComments(movieId: number, mediaType: 'movie' | 'tv'): OracleComments {
  const { i18n } = useTranslation();
  const language = i18n.language;
  // 19/11/2026 (Reborn, onda 3): os comentários vêm da resposta única "eu e
  // este título" (useTitleMe → get_title_me, parte "oracle_comments", que é
  // exatamente o que get_title_oracle_comments devolve); antes era uma chamada
  // só para isto. O objeto só muda quando os comentários (ou o idioma) mudam:
  // a frase sorteada de um filme sem comentário selado não troca a cada desenho.
  const rows = useTitleMe(movieId, mediaType)?.oracle_comments;

  return useMemo(() => {
    if (!rows) return NONE;
    const isSeries = mediaType === 'tv';
    // rows vem como [{ card_type, mood_key, pt, en }, ...]
    const moodsByOracle: Record<string, string[]> = {};
    const sealed: Record<string, string> = {};
    const isPt = language.startsWith('pt');
    rows.forEach((row) => {
      if (!moodsByOracle[row.card_type]) moodsByOracle[row.card_type] = [];
      moodsByOracle[row.card_type].push(row.mood_key);
      const text = isPt ? row.pt || row.en : row.en || row.pt;
      if (text && !sealed[row.card_type]) sealed[row.card_type] = text;
    });

    const sources = Object.keys(moodsByOracle);

    // O comentário selado de cada selo. Sem ele (título que acabou de
    // entrar, por exemplo), um filme cai na frase sorteada do banco do
    // site, como antes; série fica só com o selo.
    const phrases: Record<string, string> = {};
    sources.forEach((source) => {
      if (sealed[source]) {
        phrases[source] = sealed[source];
        return;
      }
      if (isSeries) return;
      const phrase = getRandomFlavorPhrase(source, moodsByOracle[source]);
      if (phrase) phrases[source] = isPt ? phrase.pt : phrase.en;
    });
    return { sources, phrases };
  }, [rows, mediaType, language]);
}
