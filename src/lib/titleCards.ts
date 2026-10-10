import { supabase } from './supabase';
import { Movie, getCurrentLanguage, getMovieDetails, getMovieDetailsFromDB } from './tmdb';

// Cartões de título — o mínimo que uma prateleira precisa pra desenhar um
// pôster (título, pôster, ano, nota do público, gêneros, streamings e o
// estado de uma série), lidos do movie_cache só quando a prateleira chega
// perto da tela.
//
// Por que existe (10/10/2026): a Biblioteca buscava os detalhes COMPLETOS de
// cada título, um por um (duas consultas por título — 700 numa biblioteca
// de 350), antes de mostrar qualquer pôster. Os detalhes completos de uma
// série trazem todas as temporadas e episódios (dezenas de KB). Agora:
//   • as prateleiras leem só estas colunas, em lote (uma consulta por tipo
//     para todos os títulos pedidos no mesmo instante, por qualquer
//     prateleira da página);
//   • os detalhes completos só são buscados ao abrir o título
//     (getFullTitle), e já começam a vir quando o dedo/mouse encosta no
//     pôster (prefetchFullTitle).
// Tudo fica guardado na memória da aba (por idioma), então voltar a uma
// página ou abrir "Ver todos" não busca de novo.

export type TitleMediaType = 'movie' | 'tv';

export interface TitleRef {
  id: number;
  media_type: TitleMediaType;
}

// Um título numa prateleira: a referência e o que é da pessoa (a nota dela,
// a nota prevista). O cartão em si vem do carregador.
export interface ShelfItem extends TitleRef {
  userRating?: number | null;
  predictedRating?: number | null;
}

// Item de prateleira que já pode trazer o título inteiro (quem já tinha os
// detalhes, como o perfil de outra pessoa). Sem `movie`, o cartão vem do
// carregador.
export interface ShelfEntry extends ShelfItem {
  movie?: Movie;
}

export const toShelfEntry = (movie: Movie & { predictedRating?: number | null }): ShelfEntry => ({
  id: movie.id,
  media_type: asMediaType(movie.media_type),
  userRating: movie.userRating,
  predictedRating: movie.predictedRating,
  movie,
});

export const asMediaType = (value: unknown): TitleMediaType => (value === 'tv' ? 'tv' : 'movie');

export const titleKey = (ref: { id: number; media_type?: string | null }) => `${asMediaType(ref.media_type)}:${ref.id}`;

const CARD_COLUMNS =
  'tmdb_id, media_type, title_pt, title_en, poster_path, poster_path_pt, release_date, vote_average, vote_count, status, in_production, genres_pt, genres_en, watch_providers, origin_country';

// Lotes de até 150 ids por consulta (a lista vai na URL).
const CHUNK = 150;

const isPortuguese = () => getCurrentLanguage().startsWith('pt');
const langPrefix = () => (isPortuguese() ? 'pt' : 'en');

const cards = new Map<string, Movie>();
const pending = new Map<string, Promise<Movie | null>>();
let queue = new Map<string, { ref: TitleRef; resolve: (movie: Movie | null) => void }>();
let flushScheduled = false;

// Gêneros do cache vêm como objetos {id, name} ou, em linhas antigas, como
// nomes soltos — o mesmo tratamento do getCachedMovie.
const parseGenres = (raw: unknown): Movie['genres'] => {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'object' && raw[0] && 'name' in raw[0]) return raw as Movie['genres'];
  if (typeof raw[0] === 'string') return (raw as string[]).map((name, index) => ({ id: index, name }));
  return [];
};

interface CardRow {
  tmdb_id: number;
  media_type: string;
  title_pt: string | null;
  title_en: string | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  release_date: string | null;
  vote_average: number | string | null;
  vote_count: number | null;
  status: string | null;
  in_production: boolean | null;
  genres_pt: unknown;
  genres_en: unknown;
  watch_providers: Movie['watchProviders'] | null;
  origin_country: string[] | null;
}

const rowToCard = (row: CardRow, pt: boolean): Movie => ({
  id: row.tmdb_id,
  title: (pt && row.title_pt) || row.title_en || row.title_pt || '',
  poster_path: ((pt && row.poster_path_pt) || row.poster_path || '') as string,
  overview: '',
  release_date: row.release_date || '',
  vote_average: Number(row.vote_average) || 0,
  vote_count: row.vote_count ?? undefined,
  runtime: 0,
  status: row.status ?? undefined,
  in_production: row.in_production ?? undefined,
  genres: parseGenres(pt && row.genres_pt ? row.genres_pt : row.genres_en),
  media_type: asMediaType(row.media_type),
  watchProviders: row.watch_providers ?? undefined,
  origin_country: row.origin_country ?? undefined,
});

const cacheKeyFor = (ref: TitleRef, lang = langPrefix()) => `${lang}|${titleKey(ref)}`;

async function flush() {
  flushScheduled = false;
  const batch = queue;
  queue = new Map();
  if (batch.size === 0) return;

  const lang = langPrefix();
  const pt = lang === 'pt';
  const byType: Record<TitleMediaType, number[]> = { movie: [], tv: [] };
  batch.forEach(({ ref }) => byType[ref.media_type].push(ref.id));

  const requests: Promise<void>[] = [];
  (Object.keys(byType) as TitleMediaType[]).forEach((mediaType) => {
    const ids = byType[mediaType];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      requests.push(
        (async () => {
          try {
            const { data, error } = await supabase
              .from('movie_cache')
              .select(CARD_COLUMNS)
              .eq('media_type', mediaType)
              .in('tmdb_id', chunk);
            if (error) throw error;
            ((data || []) as CardRow[]).forEach((row) => {
              cards.set(cacheKeyFor({ id: row.tmdb_id, media_type: mediaType }, lang), rowToCard(row, pt));
            });
          } catch (error) {
            console.error('titleCards: batch error', error);
          }
        })()
      );
    }
  });
  await Promise.all(requests);

  // O que não estava no movie_cache (raro: título antigo nunca cacheado) vem
  // pelo caminho completo, que busca no TMDB e grava.
  await Promise.all(
    Array.from(batch.values()).map(async ({ ref, resolve }) => {
      const key = cacheKeyFor(ref, lang);
      let card = cards.get(key) || null;
      if (!card) {
        try {
          card = await getMovieDetailsFromDB(ref.id, ref.media_type);
          if (card) cards.set(key, { ...card, media_type: ref.media_type });
          card = cards.get(key) || null;
        } catch {
          card = null;
        }
      }
      pending.delete(key);
      resolve(card);
    })
  );
}

function request(ref: TitleRef): Promise<Movie | null> {
  const key = cacheKeyFor(ref);
  const ready = cards.get(key);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const promise = new Promise<Movie | null>((resolve) => {
    queue.set(key, { ref, resolve });
  });
  pending.set(key, promise);
  if (!flushScheduled) {
    flushScheduled = true;
    // Junta os pedidos de todas as prateleiras feitos no mesmo instante.
    setTimeout(flush, 0);
  }
  return promise;
}

// Cartão já carregado (síncrono), ou undefined.
export function peekTitleCard(ref: TitleRef): Movie | undefined {
  return cards.get(cacheKeyFor(ref));
}

// Carrega (em lote) os cartões que faltam. Resolve com o mapa titleKey → cartão.
export async function loadTitleCards(refs: TitleRef[]): Promise<Map<string, Movie>> {
  const results = await Promise.all(refs.map((ref) => request(ref).then((card) => [titleKey(ref), card] as const)));
  const map = new Map<string, Movie>();
  results.forEach(([key, card]) => {
    if (card) map.set(key, card);
  });
  return map;
}

// Os cartões na mesma ordem das referências (os que não existem ficam de fora).
export async function getTitleCardsInOrder(refs: TitleRef[]): Promise<Movie[]> {
  const map = await loadTitleCards(refs);
  const ordered: Movie[] = [];
  refs.forEach((ref) => {
    const card = map.get(titleKey(ref));
    if (card) ordered.push({ ...card, media_type: ref.media_type });
  });
  return ordered;
}

// Guarda cartões que já chegaram por outro caminho (ex.: TMDB), pra não
// buscar de novo.
export function primeTitleCards(movies: Movie[]) {
  const lang = langPrefix();
  movies.forEach((movie) => {
    if (!movie?.id) return;
    const key = cacheKeyFor({ id: movie.id, media_type: asMediaType(movie.media_type) }, lang);
    if (!cards.has(key)) cards.set(key, movie);
  });
}

// Tipo (filme ou série) de títulos guardados só pelo número (ex.: listas
// pessoais). Vem da tabela movies, que guarda um tipo por número; quem sabe
// o tipo por outro caminho (a biblioteca da pessoa) passa `known` antes.
export async function resolveMediaTypes(ids: number[], known?: Map<number, TitleMediaType>): Promise<Map<number, TitleMediaType>> {
  const result = new Map<number, TitleMediaType>();
  const missing: number[] = [];
  Array.from(new Set(ids)).forEach((id) => {
    const type = known?.get(id);
    if (type) result.set(id, type);
    else missing.push(id);
  });
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('movies').select('id, media_type').in('id', chunk);
    if (error) {
      console.error('titleCards: media types error', error);
      continue;
    }
    (data || []).forEach((row: { id: number; media_type: string | null }) => result.set(row.id, asMediaType(row.media_type)));
  }
  missing.forEach((id) => {
    if (!result.has(id)) result.set(id, 'movie');
  });
  return result;
}

// ---------------------------------------------------------------------------
// Detalhes completos (menu do título)
// ---------------------------------------------------------------------------

const fullPending = new Map<string, Promise<Movie>>();

export function getFullTitle(ref: TitleRef): Promise<Movie> {
  const key = cacheKeyFor(ref);
  const inFlight = fullPending.get(key);
  if (inFlight) return inFlight;
  const promise = getMovieDetails(ref.id, ref.media_type).then((movie) => ({ ...movie, media_type: ref.media_type }));
  fullPending.set(key, promise);
  // Só junta pedidos simultâneos; depois de pronto, quem guarda é o cache
  // do getMovieDetails (com prazo de validade). Erro também não fica guardado.
  promise.then(
    () => fullPending.delete(key),
    () => fullPending.delete(key)
  );
  return promise;
}

// Adianta os detalhes completos (mouse em cima ou dedo encostando no pôster).
export function prefetchFullTitle(ref: TitleRef) {
  getFullTitle(ref).catch(() => undefined);
}
