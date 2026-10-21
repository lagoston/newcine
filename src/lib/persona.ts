import { supabase } from './supabase';

// Personalidade cinematográfica (sistema novo): as 3 prateleiras que a
// pessoa mais usa — cada filme avaliado soma a própria nota na prateleira
// dele — formam um código de 3 letras (ver lib/moods.ts). São 84
// combinações possíveis, cada uma com um personagem de cinema. O cálculo
// mora no banco (refresh_user_persona) e roda sozinho a cada avaliação.

// Filmes das prateleiras que precisam estar avaliados pra personalidade
// aparecer (o mesmo número usado no banco).
export const PERSONA_THRESHOLD = 10;

export interface PersonaEntry {
  code: string;
  sortOrder: number;
  moodKeys: string[];
  titlePt: string;
  titleEn: string;
  characterPt: string;
  characterEn: string;
  filmTitlePt: string;
  filmTitleEn: string;
  filmYear: number | null;
  tmdbId: number | null;
  posterPath: string | null;
  blurbPt: string;
  blurbEn: string;
  // Foto do personagem (21/10/2026): uma imagem do TMDB (cena ou cartaz sem
  // texto) e o ponto da imagem que fica no centro do recorte ("50% 30%").
  // Sem foto, vale o pôster do filme.
  characterImagePath: string | null;
  characterImageFocus: string | null;
  actorName: string | null;
  // As obras das prateleiras em que o personagem aparece (o filme dele primeiro).
  works: { id: number; type: 'movie' | 'tv' }[];
}

export interface MoodScore {
  moodKey: string;
  score: number;
  films: number;
}

export interface UserPersona {
  // null enquanto a pessoa não tem filmes suficientes nas prateleiras.
  code: string | null;
  // Filmes avaliados que estão em alguma prateleira.
  counted: number;
  threshold: number;
  // Os 9 humores, do mais usado pro menos usado.
  scores: MoodScore[];
  persona: PersonaEntry | null;
  // Das obras do personagem, as que QUEM ESTÁ OLHANDO já tem ("movie:123" →
  // nota, ou null se está só na Watchlist).
  worksSeen: Record<string, number | null>;
}

type Row = Record<string, unknown>;

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0);
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export const mapPersonaEntry = (row: Row): PersonaEntry => ({
  code: str(row.code),
  sortOrder: num(row.sort_order),
  moodKeys: Array.isArray(row.mood_keys) ? (row.mood_keys as string[]) : [],
  titlePt: str(row.title_pt),
  titleEn: str(row.title_en),
  characterPt: str(row.character_pt),
  characterEn: str(row.character_en),
  filmTitlePt: str(row.film_title_pt),
  filmTitleEn: str(row.film_title_en),
  filmYear: row.film_year == null ? null : num(row.film_year),
  tmdbId: row.tmdb_id == null ? null : num(row.tmdb_id),
  posterPath: typeof row.poster_path === 'string' ? row.poster_path : null,
  blurbPt: str(row.blurb_pt),
  blurbEn: str(row.blurb_en),
  characterImagePath: typeof row.character_image_path === 'string' && row.character_image_path ? row.character_image_path : null,
  characterImageFocus: typeof row.character_image_focus === 'string' && row.character_image_focus ? row.character_image_focus : null,
  actorName: typeof row.actor_name === 'string' && row.actor_name ? row.actor_name : null,
  works: Array.isArray(row.works)
    ? (row.works as Row[])
        .map((w) => ({ id: num(w.id), type: (w.type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv' }))
        .filter((w) => w.id > 0)
    : [],
});

// Textos da persona no idioma atual. `sameAsFilm`: o personagem dá nome
// ao filme (Donnie Darko, Lucy...) — aí a linha mostra só o filme.
export const personaText = (p: PersonaEntry, language: string) => {
  const pt = language.startsWith('pt');
  const character = pt ? p.characterPt : p.characterEn;
  const film = pt ? p.filmTitlePt || p.filmTitleEn : p.filmTitleEn || p.filmTitlePt;
  return {
    title: pt ? p.titlePt : p.titleEn,
    character,
    film,
    filmWithYear: p.filmYear ? `${film} (${p.filmYear})` : film,
    sameAsFilm: character.trim().toLowerCase() === film.trim().toLowerCase(),
    blurb: pt ? p.blurbPt : p.blurbEn,
  };
};

export const posterUrl = (path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w342'): string | null =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

// A imagem do retrato: a foto do personagem (recortada no ponto `focus`) ou,
// sem ela, o pôster do filme. `large` pede a versão grande (o recorte de uma
// cena larga precisa de mais pixels na altura).
export const personaPortrait = (p: PersonaEntry, large = false): { src: string | null; focus: string; isCharacter: boolean } => {
  if (p.characterImagePath) {
    return {
      src: `https://image.tmdb.org/t/p/${large ? 'w1280' : 'w780'}${p.characterImagePath}`,
      focus: p.characterImageFocus || '50% 30%',
      isCharacter: true,
    };
  }
  return { src: posterUrl(p.posterPath, large ? 'w500' : 'w342'), focus: '50% 20%', isCharacter: false };
};

// Personalidade de alguém (a sua, ou a de um perfil que você pode ver).
export async function fetchUserPersona(userId: string): Promise<UserPersona | null> {
  const { data, error } = await supabase.rpc('get_user_persona', { p_user_id: userId });
  if (error) throw error;
  if (!data) return null;
  const raw = data as Row;
  const scores = Array.isArray(raw.scores)
    ? (raw.scores as Row[]).map((s) => ({ moodKey: str(s.mood_key), score: num(s.score), films: num(s.films) }))
    : [];
  return {
    code: typeof raw.code === 'string' && raw.code.length === 3 ? raw.code : null,
    counted: num(raw.counted),
    threshold: num(raw.threshold) || PERSONA_THRESHOLD,
    scores,
    persona: raw.persona ? mapPersonaEntry(raw.persona as Row) : null,
    worksSeen: raw.works_seen && typeof raw.works_seen === 'object' ? (raw.works_seen as Record<string, number | null>) : {},
  };
}

// As três prateleiras que formam a personalidade, da mais forte pra menos.
export const topMoodKeys = (persona: UserPersona | null): string[] =>
  persona?.code ? persona.scores.filter((s) => s.films > 0).slice(0, 3).map((s) => s.moodKey) : [];
