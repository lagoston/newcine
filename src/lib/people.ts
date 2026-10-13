import { supabase } from './supabase';

// Página da pessoa (ator ou diretor) — 12/10/2026.
//
// Os dados (foto, nascimento, biografia e os filmes da pessoa já resumidos)
// ficam na tabela person_pages. Quem grava é a edge function person-page,
// que busca no TMDB uma vez e refaz a busca quando a linha passa de 30 dias.
// Daí em diante a página sai do banco — para qualquer pessoa do site.
//
// Fluxo: 1) lê a linha do banco; 2) só se ela não existir ou estiver velha
// chama a function (que devolve a linha nova, ou a velha se o TMDB falhar).

export const PERSON_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
export const PERSON_PHOTO_BASE = 'https://image.tmdb.org/t/p/w342';

export interface PersonCredit {
  id: number;
  title_pt: string | null;
  title_en: string | null;
  poster_pt: string | null;
  poster_en: string | null;
  release_date: string | null;
  vote_average: number;
  vote_count: number;
  character?: string | null;
  order?: number | null;
  genre_ids: number[];
}

export interface PersonPage {
  tmdb_id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  biography_pt: string | null;
  biography_en: string | null;
  movie_cast: PersonCredit[];
  movie_directed: PersonCredit[];
  fetched_at: string;
}

// Cache da sessão: reabrir a mesma pessoa (de outro filme, por exemplo) não
// vai ao banco de novo.
const sessionPeople = new Map<number, PersonPage>();

const isFresh = (row: Pick<PersonPage, 'fetched_at'>) => Date.now() - new Date(row.fetched_at).getTime() < PERSON_REFRESH_MS;

export async function getPersonPage(personId: number): Promise<PersonPage | null> {
  if (!Number.isInteger(personId) || personId <= 0) return null;
  const known = sessionPeople.get(personId);
  if (known) return known;

  const { data: row } = await supabase.from('person_pages').select('*').eq('tmdb_id', personId).maybeSingle();
  if (row && isFresh(row as PersonPage)) {
    sessionPeople.set(personId, row as PersonPage);
    return row as PersonPage;
  }

  const { data, error } = await supabase.functions.invoke('person-page', { body: { personId } });
  const fetched = !error && data?.person ? (data.person as PersonPage) : null;
  // Function fora do ar: vale a linha velha, se houver.
  const result = fetched || (row as PersonPage | null) || null;
  if (result) sessionPeople.set(personId, result);
  return result;
}

// "Você e [pessoa]": quantos títulos da biblioteca de quem está vendo têm
// a pessoa no elenco (os 10 primeiros nomes de cada título) OU na direção, a
// média deles e a média geral, para comparar. As contagens de elenco e de
// direção vêm separadas (get_person_library_overlap). Se a função nova
// falhar, cai para a antiga, que só olha o elenco.
export interface PersonLibraryStats {
  rated: number;
  watchlist: number;
  avgRating: number | null;
  overallAvg: number | null;
  castRated: number;
  directedRated: number;
}

export async function getPersonLibraryStats(personId: number): Promise<PersonLibraryStats | null> {
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  const overlap = await supabase.rpc('get_person_library_overlap', { p_person_id: personId });
  const row = Array.isArray(overlap.data) ? overlap.data[0] : overlap.data;
  if (!overlap.error && row) {
    return {
      rated: Number(row.rated) || 0,
      watchlist: Number(row.watchlist) || 0,
      avgRating: num(row.avg_rating),
      overallAvg: num(row.overall_avg),
      castRated: Number(row.cast_rated) || 0,
      directedRated: Number(row.directed_rated) || 0,
    };
  }
  const legacy = await supabase.rpc('get_person_library_stats', { p_person_id: personId });
  const old = Array.isArray(legacy.data) ? legacy.data[0] : legacy.data;
  if (legacy.error || !old) return null;
  const rated = Number(old.rated) || 0;
  return {
    rated,
    watchlist: Number(old.watchlist) || 0,
    avgRating: num(old.avg_rating),
    overallAvg: num(old.overall_avg),
    castRated: rated,
    directedRated: 0,
  };
}

// ---------- Top 10 ----------

export type PersonRole = 'cast' | 'director';

export interface PersonTopMovie {
  id: number;
  title: string;
  posterPath: string | null;
  year: string;
  voteAverage: number;
  voteCount: number;
  character: string | null;
}

// Só no Top 10 de ator: documentários e filmes feitos para a TV ficam de
// fora (no de diretor continuam, como sempre foi — documentário é obra dele).
const DOCUMENTARY = 99;
const TV_MOVIE = 10770;
// Participações que não são papel: "Self", "Himself", "Herself" (programas,
// making-of) e as não creditadas.
const NOT_A_ROLE = /^(self|himself|herself|themselves|themself)\b|\bself\s*-|\(uncredited\)|\bnão creditad|\bsem crédito/i;
// Muito abaixo no elenco costuma ser figuração ou ponta.
const MAX_CAST_ORDER = 40;
// Votos mínimos do TMDB: o Top 10 de ator usa 200 (filmes de nicho com
// poucos votos e nota alta não passam na frente dos clássicos); se a pessoa
// não tem 10 filmes assim, cai para 50, o mesmo corte do Top 10 de diretor.
const VOTES_STRICT = 200;
const VOTES_LOOSE = 50;

export function topMovies(person: PersonPage, role: PersonRole, lang: string, options: { excludeId?: number; limit?: number } = {}): PersonTopMovie[] {
  const { excludeId, limit = 10 } = options;
  const isPt = lang.startsWith('pt');
  const today = new Date().toISOString().slice(0, 10);
  const credits = (role === 'cast' ? person.movie_cast : person.movie_directed) || [];

  const eligible = credits.filter((c) => {
    if (!c || c.id === excludeId) return false;
    if (!c.release_date || c.release_date > today) return false;
    if (role === 'cast') {
      if (c.genre_ids?.includes(DOCUMENTARY) || c.genre_ids?.includes(TV_MOVIE)) return false;
      if (c.character && NOT_A_ROLE.test(c.character)) return false;
      if (typeof c.order === 'number' && c.order > MAX_CAST_ORDER) return false;
    }
    return true;
  });

  const byScore = (a: PersonCredit, b: PersonCredit) => b.vote_average - a.vote_average || b.vote_count - a.vote_count;
  const strict = eligible.filter((c) => c.vote_count >= VOTES_STRICT);
  const pool = role === 'cast' && strict.length >= limit ? strict : eligible.filter((c) => c.vote_count >= VOTES_LOOSE);

  return pool
    .sort(byScore)
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      title: (isPt ? c.title_pt || c.title_en : c.title_en || c.title_pt) || '',
      posterPath: (isPt ? c.poster_pt || c.poster_en : c.poster_en || c.poster_pt) || null,
      year: (c.release_date || '').slice(0, 4),
      voteAverage: c.vote_average,
      voteCount: c.vote_count,
      character: role === 'cast' ? cleanCharacter(c.character, isPt) : null,
    }));
}

// "Woody (voice)" → "Woody (voz)" em português; tira espaços sobrando.
function cleanCharacter(character: string | null | undefined, isPt: boolean): string | null {
  const text = (character || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return isPt ? text.replace(/\((voice|voz)\)/i, '(voz)') : text;
}

// Quantos filmes a pessoa dirigiu que entrariam num Top 10 (a página mostra
// a aba "Direção" a partir de 3).
export const directedCount = (person: PersonPage) => topMovies(person, 'director', 'en', { limit: 50 }).length;

export const personBiography = (person: PersonPage, lang: string) =>
  (lang.startsWith('pt') ? person.biography_pt || person.biography_en : person.biography_en || person.biography_pt) || null;

// Idade hoje (ou com que idade morreu).
export function personAge(person: PersonPage): number | null {
  if (!person.birthday) return null;
  const birth = new Date(`${person.birthday}T12:00:00`);
  const end = person.deathday ? new Date(`${person.deathday}T12:00:00`) : new Date();
  let age = end.getFullYear() - birth.getFullYear();
  const beforeBirthday = end.getMonth() < birth.getMonth() || (end.getMonth() === birth.getMonth() && end.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Number.isFinite(age) && age >= 0 ? age : null;
}
