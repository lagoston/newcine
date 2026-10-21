import { MOODS, type MoodKey } from './moods';
import { groupByDecade, type DecadeOrders } from './libraryLayouts';
import type { UserPersona } from './persona';
import { titleKey } from './titleCards';
import type { MovieWithRating } from '../hooks/useProfileData';

// Contas do "observatório" do perfil (12/10/2026). Todas respondem às mesmas
// duas perguntas, que viram a mesma linguagem visual em todos os blocos:
//   • quanto a pessoa vê (tamanho, comprimento);
//   • quanto ela gosta (cor da nota, a média que ela dá).
//
// Para a média de um tema, de uma pessoa ou de um humor não ser decidida por
// um filme só, a ordem usa a média "puxada" para a média geral da pessoa
// (como se cada item já tivesse 2 filmes com a nota de sempre). O número
// mostrado continua sendo a média de verdade.

export interface Affinity {
  key: string;
  name: string;
  count: number;
  avg: number;
  // a média puxada para a média geral — só para ordenar
  score: number;
}

export interface PersonAffinity extends Affinity {
  id: number | null;
}

export interface MoodSlice {
  key: MoodKey;
  films: number;
  // fração dos filmes das prateleiras (0 a 1)
  share: number;
  avg: number | null;
  keywords: Affinity[];
  // os títulos mais bem avaliados da pessoa nesse humor (para os pôsteres)
  top: MovieWithRating[];
}

export interface DecadeBand {
  decade: number;
  count: number;
  avg: number | null;
  items: MovieWithRating[];
  customized: boolean;
}

const PRIOR_WEIGHT = 2;

export const ratedOnly = (movies: MovieWithRating[]) => movies.filter((m) => typeof m.userRating === 'number');

export function averageRating(movies: MovieWithRating[]): number | null {
  const rated = ratedOnly(movies);
  if (rated.length === 0) return null;
  return rated.reduce((sum, m) => sum + (m.userRating as number), 0) / rated.length;
}

const shrink = (sum: number, count: number, prior: number) => (sum + PRIOR_WEIGHT * prior) / (count + PRIOR_WEIGHT);

type Tally = { name: string; sum: number; count: number; id?: number | null };

function rank(tallies: Map<string, Tally>, prior: number, minCount: number, limit: number): Affinity[] {
  const build = (min: number) =>
    Array.from(tallies.entries())
      .filter(([, t]) => t.count >= min)
      .map(([key, t]) => ({ key, name: t.name, count: t.count, avg: t.sum / t.count, score: shrink(t.sum, t.count, prior), id: t.id ?? null }))
      .sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name));
  let list = build(minCount);
  // Biblioteca pequena: se quase nada passa no corte, ele cai para 2.
  if (list.length < Math.min(3, limit) && minCount > 2) list = build(2);
  return list.slice(0, limit);
}

// Palavras-chave do TMDB que são dado técnico, não tema.
// "romantic" sai porque repete um humor (Romântico), não diz um tema (13/10).
const NOISY_KEYWORDS = new Set(['based on novel or book', 'based on comic', 'duringcreditsstinger', 'aftercreditsstinger', 'woman director', 'remake', 'sequel', 'romantic']);

export function keywordAffinity(movies: MovieWithRating[], prior: number, options: { minCount?: number; limit?: number } = {}): Affinity[] {
  const { minCount = 3, limit = 10 } = options;
  const tallies = new Map<string, Tally>();
  ratedOnly(movies).forEach((movie) => {
    const keywords = ((movie as unknown as { keywords?: { id?: number; name?: string }[] }).keywords || []).filter(Boolean);
    const seen = new Set<string>();
    keywords.forEach((kw) => {
      const name = (kw.name || '').trim();
      if (!name || NOISY_KEYWORDS.has(name.toLowerCase())) return;
      const key = String(kw.id ?? name.toLowerCase());
      if (seen.has(key)) return;
      seen.add(key);
      const t = tallies.get(key) || { name, sum: 0, count: 0 };
      t.sum += movie.userRating as number;
      t.count += 1;
      tallies.set(key, t);
    });
  });
  return rank(tallies, prior, minCount, limit);
}

// Atores (os 5 primeiros do elenco de cada título) e diretores (série: quem
// criou) com a média que a pessoa dá aos títulos deles.
export function peopleAffinity(movies: MovieWithRating[], prior: number, role: 'cast' | 'director', limit = 6): PersonAffinity[] {
  const tallies = new Map<string, Tally>();
  ratedOnly(movies).forEach((movie) => {
    const rating = movie.userRating as number;
    if (role === 'cast') {
      (movie.credits?.cast || []).slice(0, 5).forEach((actor) => {
        if (!actor?.id || !actor.name) return;
        const key = `id:${actor.id}`;
        const t = tallies.get(key) || { name: actor.name, sum: 0, count: 0, id: actor.id };
        t.sum += rating;
        t.count += 1;
        tallies.set(key, t);
      });
    } else {
      const director = movie.credits?.crew?.find((p) => p.job === 'Director' || p.job === 'Creator');
      if (!director?.name) return;
      const key = director.id > 0 ? `id:${director.id}` : `name:${director.name.toLowerCase()}`;
      const t = tallies.get(key) || { name: director.name, sum: 0, count: 0, id: director.id > 0 ? director.id : null };
      t.sum += rating;
      t.count += 1;
      tallies.set(key, t);
    }
  });
  // O mesmo diretor pode ter chegado com id (título atualizado) e só com o
  // nome (título antigo): junta pelo nome.
  if (role === 'director') {
    const byName = new Map<string, string>();
    Array.from(tallies.entries()).forEach(([key, t]) => {
      const name = t.name.toLowerCase();
      const other = byName.get(name);
      if (!other) {
        byName.set(name, key);
        return;
      }
      const keep = tallies.get(other)!;
      keep.sum += t.sum;
      keep.count += t.count;
      keep.id = keep.id ?? t.id ?? null;
      tallies.delete(key);
    });
  }
  return rank(tallies, prior, role === 'cast' ? 3 : 2, limit) as PersonAffinity[];
}

// A roda dos 9 humores. moodByMovie vem de get_profile_mood_titles_v2 (em que
// prateleira está cada título avaliado, por "movie:123" / "tv:456"): filmes e
// séries contam, como na personalidade (desde 21/10/2026). Sem ele (perfil
// fechado, erro), vale o que a personalidade guarda (títulos e pontos por
// humor), sem os temas.
export function moodSlices(movies: MovieWithRating[], moodByMovie: Map<string, string> | null, persona: UserPersona | null, prior: number): MoodSlice[] {
  const rated = ratedOnly(movies);
  const byMood = new Map<string, MovieWithRating[]>();
  if (moodByMovie && moodByMovie.size > 0) {
    rated.forEach((movie) => {
      const key = moodByMovie.get(titleKey({ id: movie.id, media_type: movie.media_type }));
      if (!key) return;
      const list = byMood.get(key) || [];
      list.push(movie);
      byMood.set(key, list);
    });
  }
  const usePersona = byMood.size === 0 && !!persona?.scores?.length;
  const total = usePersona
    ? persona!.scores.reduce((sum, s) => sum + s.films, 0)
    : Array.from(byMood.values()).reduce((sum, list) => sum + list.length, 0);

  return MOODS.map((mood) => {
    if (usePersona) {
      const s = persona!.scores.find((score) => score.moodKey === mood.key);
      const films = s?.films ?? 0;
      return { key: mood.key, films, share: total > 0 ? films / total : 0, avg: films > 0 ? (s!.score as number) / films : null, keywords: [], top: [] };
    }
    const list = byMood.get(mood.key) || [];
    const avg = list.length > 0 ? list.reduce((sum, m) => sum + (m.userRating as number), 0) / list.length : null;
    return {
      key: mood.key,
      films: list.length,
      share: total > 0 ? list.length / total : 0,
      avg,
      keywords: keywordAffinity(list, avg ?? prior, { minCount: 2, limit: 6 }),
      top: [...list]
        .sort((a, b) => (b.userRating as number) - (a.userRating as number) || (b.vote_average || 0) - (a.vote_average || 0))
        .slice(0, 4),
    };
  });
}

// Linha do tempo das décadas, da mais antiga para a mais nova, com os
// títulos de cada uma já na ordem da Biblioteca (Melhores da Década: pela
// nota ou na ordem que a pessoa escolheu).
export function decadeBands(movies: MovieWithRating[], orders: DecadeOrders = {}): DecadeBand[] {
  const titles = ratedOnly(movies).map((movie) => ({
    ...movie,
    year: Number((movie.release_date || '').slice(0, 4)) || null,
  }));
  return groupByDecade(titles, orders)
    .filter((shelf) => shelf.decade !== null)
    .map((shelf) => ({
      decade: shelf.decade as number,
      count: shelf.items.length,
      avg: shelf.average,
      items: shelf.items as MovieWithRating[],
      customized: shelf.customized,
    }))
    .sort((a, b) => a.decade - b.decade);
}

// A década favorita: a mais vista (no empate, a de média maior).
export const favoriteBand = (bands: DecadeBand[]): DecadeBand | null =>
  bands.reduce<DecadeBand | null>((best, band) => {
    if (!best) return band;
    if (band.count > best.count) return band;
    if (band.count === best.count && (band.avg ?? 0) > (best.avg ?? 0)) return band;
    return best;
  }, null);

// Joias: os títulos menos votados no TMDB entre os que a pessoa deu 7 ou mais.
export const GEM_MIN_RATING = 7;
export function hiddenGems(movies: MovieWithRating[], limit = 3): MovieWithRating[] {
  return ratedOnly(movies)
    .filter((m) => (m.userRating as number) >= GEM_MIN_RATING && typeof m.vote_count === 'number' && m.vote_count > 0)
    .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0) || (b.userRating as number) - (a.userRating as number))
    .slice(0, limit);
}
