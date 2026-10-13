import { supabase } from './supabase';
import { tmdbFetch } from './tmdb';

// Fotos (e o id do TMDB, quando faltar) das pessoas que o perfil destaca
// (atores e diretores mais bem avaliados). Sem gastar o TMDB à toa:
//   1) as tabelas do site — people (elenco dos títulos já abertos) e
//      person_pages (páginas de pessoa já visitadas);
//   2) só o que faltar: a busca de pessoas do TMDB, pelo nome, que o
//      tmdb-proxy guarda por 30 dias (a mesma pessoa não custa de novo).

export interface PersonRef {
  key: string;
  id: number | null;
  name: string;
  role: 'cast' | 'director';
}

export interface PersonPhoto {
  id: number | null;
  photo: string | null;
}

const sessionCache = new Map<string, PersonPhoto>();

export async function getPeoplePhotos(people: PersonRef[]): Promise<Map<string, PersonPhoto>> {
  const result = new Map<string, PersonPhoto>();
  const pending = people.filter((p) => {
    const known = sessionCache.get(p.key);
    if (known) result.set(p.key, known);
    return !known;
  });
  if (pending.length === 0) return result;

  // 1) banco
  const ids = Array.from(new Set(pending.map((p) => p.id).filter((id): id is number => typeof id === 'number' && id > 0)));
  const photoById = new Map<number, string | null>();
  if (ids.length > 0) {
    const [peopleRes, pagesRes] = await Promise.all([
      supabase.from('people').select('tmdb_id, profile_path').in('tmdb_id', ids),
      supabase.from('person_pages').select('tmdb_id, profile_path').in('tmdb_id', ids),
    ]);
    [...(peopleRes.data || []), ...(pagesRes.data || [])].forEach((row: { tmdb_id: number; profile_path: string | null }) => {
      if (row.profile_path || !photoById.has(row.tmdb_id)) photoById.set(row.tmdb_id, row.profile_path);
    });
  }

  // 2) o que faltou: busca pelo nome
  await Promise.all(
    pending.map(async (person) => {
      let entry: PersonPhoto = { id: person.id, photo: person.id ? photoById.get(person.id) ?? null : null };
      if (!entry.photo) {
        try {
          const data = await tmdbFetch(`/search/person?query=${encodeURIComponent(person.name)}&language=en-US`);
          const results: { id: number; name: string; known_for_department?: string; profile_path?: string | null }[] = data?.results || [];
          const wanted = person.role === 'director' ? 'Directing' : 'Acting';
          const match =
            (person.id && results.find((r) => r.id === person.id)) ||
            results.find((r) => r.name.toLowerCase() === person.name.toLowerCase() && r.known_for_department === wanted) ||
            results.find((r) => r.name.toLowerCase() === person.name.toLowerCase()) ||
            null;
          if (match) entry = { id: entry.id ?? match.id, photo: match.profile_path || null };
        } catch {
          // sem foto: fica a inicial
        }
      }
      sessionCache.set(person.key, entry);
      result.set(person.key, entry);
    })
  );
  return result;
}

// Só a foto guardada no banco (sem ir ao TMDB) de uma pessoa com id
// conhecido — usada no diretor do menu do filme.
const storedCache = new Map<number, string | null>();
export async function getStoredPersonPhoto(id: number): Promise<string | null> {
  if (storedCache.has(id)) return storedCache.get(id) ?? null;
  const [peopleRes, pagesRes] = await Promise.all([
    supabase.from('people').select('profile_path').eq('tmdb_id', id).maybeSingle(),
    supabase.from('person_pages').select('profile_path').eq('tmdb_id', id).maybeSingle(),
  ]);
  const photo = (peopleRes.data as { profile_path: string | null } | null)?.profile_path || (pagesRes.data as { profile_path: string | null } | null)?.profile_path || null;
  storedCache.set(id, photo);
  return photo;
}
