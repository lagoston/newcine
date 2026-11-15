import { supabase } from './supabase';
import { MOOD_BY_LETTER } from './moods';
import { LETTERS } from './personaWorld';
import { keywordAffinity, type Affinity } from './tasteStats';
import type { MovieWithRating } from '../hooks/useProfileData';

// Os temas da Persona (15/11/2026): as etiquetas de cada prateleira, com a
// nota média que a pessoa dá aos títulos daquele tema.
//
// Pedido do Bruno, ao unificar o "Sua Persona" da home e o do perfil: o modal
// completo ganha os "potinhos" das nove prateleiras, e cada um mostra, entre
// outras coisas, "as tags com suas notas médias"; e a barra da Evolução "deve
// alterar o conteúdo dos potinhos também quando mexida".
//
// Até aqui as etiquetas só existiam no perfil, feitas com a biblioteca inteira
// que a página do perfil já tinha carregado (useTasteObservatory). A home não
// carrega isso, e a gaveta tem de ser a mesma nos dois lugares. Então o banco
// manda só o que a conta precisa (get_persona_themes: para cada título
// avaliado, a prateleira, a nota e os temas) e a conta é feita aqui, a mesma
// do perfil (keywordAffinity, em lib/tasteStats.ts):
// numa prateleira, os temas com 2 títulos ou mais, os 6 de maior média.
// Como a conta é feita aqui, ela vale para qualquer ponto da barra da
// Evolução: basta dizer quais títulos já tinham sido avaliados até ali.
//
// 15/11/2026 (tarde), correção do Bruno: os temas "só devem aparecer quando a
// caixinha é clicada. Porque elas já estão aparecendo automaticamente." Saiu a
// lista geral (os temas de tudo o que a pessoa avaliou, que aparecia sem
// nenhum potinho escolhido): só existem os temas de cada prateleira.

export interface ThemeTitle {
  type: 'movie' | 'tv';
  id: number;
  // a prateleira, ou null para os títulos de fora (o Arquivo)
  letter: string | null;
  rating: number;
  // os ids dos temas do título
  kw: number[];
}

export interface PersonaThemes {
  // "movie:123" → o título
  byKey: Map<string, ThemeTitle>;
  // id do tema → nome
  names: Map<number, string>;
}

// O que a gaveta mostra: os temas de cada prateleira.
export interface ThemeReading {
  byLetter: Record<string, Affinity[]>;
}

export const themeKey = (title: { type: string; id: number }) => `${title.type === 'tv' ? 'tv' : 'movie'}:${title.id}`;

export async function fetchPersonaThemes(userId: string): Promise<PersonaThemes | null> {
  const { data, error } = await supabase.rpc('get_persona_themes', { p_user_id: userId });
  if (error) throw error;
  const raw = data as { kw?: unknown; rows?: unknown } | null;
  if (!raw || !Array.isArray(raw.rows)) return null;
  const names = new Map<number, string>();
  if (raw.kw && typeof raw.kw === 'object') {
    Object.entries(raw.kw as Record<string, unknown>).forEach(([id, name]) => {
      if (typeof name === 'string' && name && Number(id) > 0) names.set(Number(id), name);
    });
  }
  const byKey = new Map<string, ThemeTitle>();
  raw.rows.forEach((item) => {
    if (!Array.isArray(item)) return;
    const id = Number(item[1]) || 0;
    if (!id) return;
    const letter = typeof item[2] === 'string' && MOOD_BY_LETTER[item[2]] ? item[2] : null;
    const title: ThemeTitle = {
      type: item[0] === 'tv' ? 'tv' : 'movie',
      id,
      letter,
      rating: Number(item[3]) || 0,
      kw: Array.isArray(item[4]) ? item[4].map(Number).filter((kid) => names.has(kid)) : [],
    };
    byKey.set(themeKey(title), title);
  });
  return { byKey, names };
}

// Os temas dos títulos dados. `rated` é a lista do que já tinha sido avaliado
// (a prateleira e a nota vêm dela: é a história, na barra da Evolução); sem
// lista, vale tudo o que a pessoa avaliou até hoje.
export function readThemes(themes: PersonaThemes, rated?: { type: 'movie' | 'tv'; id: number; letter: string | null; rating: number }[] | null): ThemeReading {
  const titles: ThemeTitle[] = rated
    ? rated.map((row) => ({ type: row.type, id: row.id, letter: row.letter, rating: row.rating, kw: themes.byKey.get(themeKey(row))?.kw ?? [] }))
    : Array.from(themes.byKey.values());
  // keywordAffinity lê `userRating` e `keywords` de cada título: é só o que ela usa
  const asMovie = (title: ThemeTitle) => ({ userRating: title.rating, keywords: title.kw.map((id) => ({ id, name: themes.names.get(id) })) }) as unknown as MovieWithRating;
  const average = (list: ThemeTitle[]) => (list.length > 0 ? list.reduce((sum, title) => sum + title.rating, 0) / list.length : null);
  const prior = average(titles) ?? 7;
  const byLetter: Record<string, Affinity[]> = {};
  LETTERS.forEach((letter) => {
    const mine = titles.filter((title) => title.letter === letter);
    byLetter[letter] = keywordAffinity(mine.map(asMovie), average(mine) ?? prior, { minCount: 2, limit: 6 });
  });
  return { byLetter };
}
