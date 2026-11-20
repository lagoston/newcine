import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getMovieDetailsFromDB, Movie } from '../lib/tmdb';
import { Q, fetchManyCached, invalidate, isMissingFunction, ownerNow, useCached, useOwner, type ThinMark } from '../lib/data';
import { fetchUserPersona, type UserPersona } from '../lib/persona';
import { fetchAllPages } from '../lib/fetchAllPages';

// --- Tipos ---

// `thin: true` (20/11/2026): o título veio da lista magra do próprio Perfil,
// sem sinopse nem "onde assistir" (ver CACHE_COLUMNS_THIN, abaixo).
export interface MovieWithRating extends Movie, ThinMark {
  userRating: number | null;
}

export interface Genre {
  id: number | string;
  name: string;
  count: number;
}

export interface Keyword {
  id: number | string;
  name: string;
  count: number;
}

interface DecadeCount {
  [decade: string]: number;
}

export interface FavoriteDecade {
  decade: string;
  count: number;
  label: string;
  percentage: number;
  allDecades: DecadeCount;
}

export interface ActorCount {
  id: number;
  name: string;
  count: number;
  character?: string;
}

export interface DirectorCount {
  id?: number;
  name: string;
  count: number;
}

export interface LeastKnownGem {
  id: number;
  title: string;
  vote_count: number;
  release_date: string;
  vote_average: number;
  userRating?: number;
  poster_path?: string | null;
}

export interface ProfileData {
  loading: boolean;
  error: string | null;

  // Filmes (com nota do usuário) — usado pelo UserProfile.tsx pra renderizar a grade;
  // Profile.tsx pode simplesmente ignorar esse campo.
  movies: MovieWithRating[];

  // Estatísticas
  ratedMoviesCount: number;
  ratingDistribution: Record<number, number>;
  totalWatchTime: number;
  favoriteGenres: Genre[];
  favoriteKeywords: Keyword[];
  favoriteDecade: FavoriteDecade | null;
  topActors: ActorCount[];
  topDirectors: DirectorCount[];
  leastKnownGem: LeastKnownGem | null;

  // Social
  friendsCount: number;
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;

  // Personalidade cinematográfica (as 3 prateleiras mais usadas)
  persona: UserPersona | null;
  personaLoading: boolean;

  refetch: () => void;
}

// --- Helpers internos ---

function decadeLabel(decadeNum: number): string {
  if (decadeNum < 1980) return 'Grandpa Cinema';
  if (decadeNum < 2010) return 'Nostalgic';
  return 'Modern Lover';
}

/**
 * A lista de um perfil busca os detalhes dos títulos no movie_cache em lote,
 * já respeitando media_type (evita a colisão filme/série que getMoviesFromCache tem):
 * batchFetchFromCache, mais abaixo, devolve um Map chaveado por `${tmdb_id}_${media_type}`.
 * Filmes ausentes do cache precisam ser buscados individualmente por quem chama.
 */
// 20/11/2026 (peça final do Reborn): a lista MAGRA, a do próprio Perfil
// (`list: 'rated'`). Nenhum bloco dele lê a sinopse nem "onde assistir"
// (conferido por busca em Profile.tsx, ProfileTaste.tsx, components/profile/*,
// useTasteObservatory.ts e lib/tasteStats.ts): sem as três colunas saem 390 kB
// dos 952 kB medidos em produção na maior biblioteca (sinopses 161, onde
// assistir 229). Os objetos saem marcados com `thin: true`; se um deles chegar
// ao menu do título, a camada busca o resto (overlays/layers/TitleLayer.tsx).
const CACHE_COLUMNS_THIN =
  'tmdb_id, media_type, title_en, title_pt, poster_path, poster_path_pt, release_date, vote_average, vote_count, runtime, episode_run_time, number_of_seasons, number_of_episodes, status, in_production, genres_en, genres_pt, director, director_id, cast_members, origin_country, keywords';
// A lista CHEIA (o perfil de outra pessoa: a grade da Coleção entrega estes
// objetos a outras telas): as colunas de sempre.
const CACHE_COLUMNS = `${CACHE_COLUMNS_THIN}, overview_en, overview_pt, watch_providers`;

// Uma linha do movie_cache com as colunas acima (e, quando pedida, seasons_data).
interface CacheRow {
  tmdb_id: number;
  media_type: string;
  title_en: string;
  title_pt: string | null;
  // (a sinopse e "onde assistir" não vêm na lista magra)
  overview_en?: string | null;
  overview_pt?: string | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  runtime: number | null;
  episode_run_time: unknown;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  status: string | null;
  in_production: boolean | null;
  genres_en: unknown;
  genres_pt: unknown;
  director: string | null;
  director_id: number | null;
  cast_members: unknown;
  seasons_data?: unknown;
  origin_country: string[] | null;
  watch_providers?: unknown;
  keywords: unknown;
}

interface CacheEntry {
  movie_id: number;
  media_type: string;
}

// Quais colunas a lista pede.
interface CacheShape {
  // sem sinopse nem "onde assistir" (o próprio Perfil)
  thin: boolean;
  // 19/11/2026 (Reborn, onda 3): as temporadas com todos os episódios de toda
  // a biblioteca só serviam para somar o tempo assistido das séries. Quando o
  // tempo vem pronto do banco (get_profile_stats_v2), a coluna não é pedida —
  // era a maior parte do peso desta leitura (rede.md A4). O menu de uma série
  // aberta daqui busca as temporadas dela ao abrir a gaveta, como em qualquer
  // outra tela.
  withSeasons: boolean;
}

const entryKey = (entry: CacheEntry) => `${entry.movie_id}_${entry.media_type}`;

// Vai ao movie_cache buscar as linhas pedidas (um pedido para até 450 títulos)
// e devolve os títulos na ordem de `entries` (undefined = não está no cache).
async function loadCacheRows(entries: CacheEntry[], isPortuguese: boolean, shape: CacheShape): Promise<(Movie | undefined)[]> {
  const ids = [...new Set(entries.map((e) => e.movie_id))];

  // 18/11/2026 (correção): em lotes de 450 ids. Cada id pode trazer até 2 linhas
  // (filme e série com o mesmo número), e o PostgREST corta em 1.000 linhas por
  // pedido; numa biblioteca grande a lista inteira numa URL só também passava
  // de qualquer tamanho razoável. Até 450 títulos continua sendo um pedido só.
  const CHUNK = 450;
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  const columns = shape.thin ? CACHE_COLUMNS_THIN : CACHE_COLUMNS;
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from('movie_cache')
        .select(
          // (a lista de colunas como texto comum: com o pedaço opcional, o
          // verificador de tipos do supabase-js não consegue ler um texto montado)
          (shape.withSeasons ? `${columns}, seasons_data` : columns) as string
        )
        .in('tmdb_id', chunk)
    )
  );
  const failed = results.find((result) => result.error);
  const data = results.flatMap((result) => result.data ?? []) as unknown as CacheRow[];

  if (failed || data.length === 0) {
    if (failed) console.error('Error batch-fetching movie_cache:', failed.error);
    return entries.map(() => undefined);
  }

  const byKey = new Map<string, Movie>();
  for (const row of data) {
    const genres = isPortuguese && row.genres_pt ? row.genres_pt : row.genres_en;
    const movie = {
      id: row.tmdb_id,
      title: isPortuguese && row.title_pt ? row.title_pt : row.title_en,
      poster_path: isPortuguese && row.poster_path_pt ? row.poster_path_pt : row.poster_path,
      overview: shape.thin ? '' : isPortuguese && row.overview_pt ? row.overview_pt : row.overview_en,
      release_date: row.release_date,
      vote_average: row.vote_average,
      vote_count: row.vote_count,
      runtime: row.runtime,
      episode_run_time: row.episode_run_time,
      number_of_seasons: row.number_of_seasons,
      number_of_episodes: row.number_of_episodes,
      status: row.status,
      in_production: row.in_production,
      media_type: row.media_type as 'movie' | 'tv',
      genres: genres || [],
      credits: {
        cast: row.cast_members || [],
        crew: row.director ? [{ id: row.director_id || 0, name: row.director, job: 'Director' }] : []
      },
      seasons: row.seasons_data,
      origin_country: row.origin_country || [],
      watchProviders: shape.thin ? undefined : row.watch_providers,
      keywords: row.keywords || [],
      ...(shape.thin ? { thin: true } : {})
    } as unknown as Movie;
    byKey.set(`${row.tmdb_id}_${row.media_type}`, movie);
  }

  return entries.map((entry) => byKey.get(entryKey(entry)));
}

// 20/11/2026 (peça final do Reborn): as linhas ficam na memória da camada de
// dados, UMA CHAVE POR TÍTULO (Q.catalogRow: título + idioma + modo, do dono,
// apagadas na troca de conta). Antes cada visita ao Perfil baixava a lista
// inteira de novo: 952 kB na maior biblioteca (270 títulos). Agora:
//   • voltar ao Perfil dentro do prazo (30 min) não baixa nenhuma linha;
//   • dar nota a um título novo baixa só a linha dele;
//   • a nota em si não vence nada aqui: o catálogo não muda quando alguém avalia
//     (a nota vem de user_movies, que continua sendo lida a cada visita).
async function batchFetchFromCache(entries: CacheEntry[], isPortuguese: boolean, shape: CacheShape): Promise<Map<string, Movie>> {
  const map = new Map<string, Movie>();
  if (entries.length === 0) return map;

  const unique = [...new Map(entries.map((entry) => [entryKey(entry), entry])).values()];
  const uid = ownerNow();
  const mode = `${shape.thin ? 'magra' : 'cheia'}${shape.withSeasons ? '+temporadas' : ''}`;
  const lang = isPortuguese ? 'pt' : 'en';
  const found = await fetchManyCached<CacheEntry, Movie>(
    unique,
    (entry) => Q.catalogRow(uid, mode, lang, entry.media_type, entry.movie_id),
    (missing) => loadCacheRows(missing, isPortuguese, shape)
  );
  unique.forEach((entry, index) => {
    const movie = found[index];
    if (movie) map.set(entryKey(entry), movie);
  });
  return map;
}

// --- Os números do topo, prontos do banco (onda 3) ---

// O que get_profile_stats_v2 devolve (contrato: banco_sql/CONTRATO_RPCS.md).
interface ProfileStats {
  ratedMoviesCount: number;
  ratingDistribution: Record<string, number>;
  // minutos
  totalWatchTime: number;
  friendsCount: number;
  countries: Record<string, { count: number; avg: number }>;
}

// A função não existe neste banco: não se pergunta de novo nesta visita.
let statsMissing = false;

// null = plano B (a função não existe ou falhou): o hook calcula tudo como antes.
async function loadProfileStats(userId: string): Promise<ProfileStats | null> {
  if (statsMissing) return null;
  const { data, error } = await supabase.rpc('get_profile_stats_v2', { p_user_id: userId });
  if (isMissingFunction(error)) {
    statsMissing = true;
    return null;
  }
  if (error) {
    console.error('get_profile_stats_v2:', error);
    return null;
  }
  const stats = data as Partial<ProfileStats> | null;
  if (!stats || typeof stats !== 'object' || typeof stats.ratedMoviesCount !== 'number' || !stats.ratingDistribution || !stats.countries) return null;
  return stats as ProfileStats;
}

export interface ProfileDataOptions {
  // A lista pesada (`movies`: a biblioteca inteira com elenco, palavras-chave,
  // onde assistir…) é pedida:
  //   true (padrão) → sempre (a grade do perfil de outra pessoa);
  //   'rated'       → só se a pessoa tem algum título avaliado (o próprio
  //                   Perfil: o retrato de gosto e o mapa só existem com notas).
  //                   É a lista MAGRA (20/11/2026): sem sinopse nem "onde
  //                   assistir", com `thin: true` em cada título.
  list?: boolean | 'rated';
}

// --- Hook principal ---

// 19/11/2026 (Reborn, onda 3; rede.md A4): os números do topo (títulos
// avaliados, distribuição das notas, tempo assistido, amigos, países) vêm de
// get_profile_stats_v2 numa ida de ~KB, guardada 5 min (e no aparelho, para o
// próprio perfil): aparecem na hora, sem esperar a biblioteca inteira. A lista
// pesada continua sendo buscada para quem precisa dela (a grade, o retrato de
// gosto, os filmes de um país), mas sem as temporadas de todas as séries, sem
// reler os episódios vistos e sem contar os amigos de novo. PLANO B: sem a
// função no banco, o hook roda inteiro como antes.
export function useProfileData(userId: string | undefined, language: string, options: ProfileDataOptions = {}): ProfileData {
  const listMode = options.list ?? true;
  // a lista do próprio Perfil é a magra (sem sinopse nem "onde assistir")
  const thin = listMode === 'rated';
  const [loading, setLoading] = useState(true);
  const [personaLoading, setPersonaLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadFlag, setReloadFlag] = useState(0);

  const owner = useOwner();
  const statsQuery = useCached<ProfileStats | null>(Q.profileStats(owner, userId ?? ''), () => loadProfileStats(userId as string), { enabled: !!userId });
  // undefined = ainda não chegou; null = plano B; objeto = os números do banco
  const stats = statsQuery.error ? null : statsQuery.data;
  const statsMode = stats === undefined ? 'wait' : stats === null ? 'old' : 'rpc';
  // a lista pesada é necessária? (no plano B sempre: os números saem dela)
  const wantList = statsMode === 'old' || listMode === true || (listMode === 'rated' && statsMode === 'rpc' && (stats?.ratedMoviesCount ?? 0) > 0);

  const [movies, setMovies] = useState<MovieWithRating[]>([]);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<Record<number, number>>({});
  const [totalWatchTime, setTotalWatchTime] = useState(0);
  const [favoriteGenres, setFavoriteGenres] = useState<Genre[]>([]);
  const [favoriteKeywords, setFavoriteKeywords] = useState<Keyword[]>([]);
  const [favoriteDecade, setFavoriteDecade] = useState<FavoriteDecade | null>(null);
  const [topActors, setTopActors] = useState<ActorCount[]>([]);
  const [topDirectors, setTopDirectors] = useState<DirectorCount[]>([]);
  const [leastKnownGem, setLeastKnownGem] = useState<LeastKnownGem | null>(null);
  const [friendsCount, setFriendsCount] = useState(0);
  const [countryCounts, setCountryCounts] = useState<Record<string, number>>({});
  const [countryAvgRatings, setCountryAvgRatings] = useState<Record<string, number>>({});

  const [persona, setPersona] = useState<UserPersona | null>(null);

  const refetch = useCallback(() => {
    // os números do banco também são lidos de novo (amizade aceita, episódio marcado)
    if (userId) void invalidate(['profile', 'stats', userId]);
    setReloadFlag((f) => f + 1);
  }, [userId]);

  // A personalidade tem a sua própria leitura (não espera os números nem a lista).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const runPersona = async () => {
      try {
        setPersonaLoading(true);
        const data = await fetchUserPersona(userId);
        if (!cancelled) setPersona(data);
      } catch (err) {
        console.error('useProfileData persona error:', err);
        if (!cancelled) setPersona(null);
      } finally {
        if (!cancelled) setPersonaLoading(false);
      }
    };
    runPersona();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadFlag]);

  useEffect(() => {
    if (!userId) return;
    // a lista pesada espera saber se é necessária (os números chegam antes)
    if (statsMode === 'wait') return;
    if (!wantList) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    // os números vêm do banco? então a lista não precisa das temporadas, dos
    // episódios vistos nem da contagem de amigos
    const fromRpc = statsMode === 'rpc';

    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        // --- Contador social (1 query, já que amizade é simétrica —
        // antes eram 2 queries separadas em follows, uma pra seguidores
        // e outra pra seguindo). Com os números do banco, não é pedido. ---
        const [friendshipsRes, userMoviesRes] = await Promise.all([
          fromRpc
            ? Promise.resolve({ count: 0 })
            : supabase
                .from('friendships')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'accepted')
                .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
          // 18/11/2026 (correção): paginado — sem isso o PostgREST cortava em 1.000
          // títulos, sem erro. 'id' desempata quem entrou no mesmo instante.
          fetchAllPages((from, to) =>
            supabase
              .from('user_movies')
              .select('movie_id, rating, movies!inner(media_type)')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .order('id')
              .range(from, to)
          )
        ]);

        if (userMoviesRes.error) throw userMoviesRes.error;

        const friends = friendshipsRes.count || 0;

        const rawUserMovies = (userMoviesRes.data || []).map((m: any) => ({
          movie_id: m.movie_id,
          rating: m.rating,
          media_type: m.movies?.media_type || 'movie'
        }));

        const ratedEntries = rawUserMovies.filter((m) => m.rating !== null);
        setRatedMoviesCount(ratedEntries.length);

        const distribution: Record<number, number> = {};
        for (let i = 0; i <= 10; i++) distribution[i] = 0;
        ratedEntries.forEach((m) => {
          if (m.rating !== null) distribution[m.rating]++;
        });
        setRatingDistribution(distribution);

        // --- Busca em lote no movie_cache (1 query pra todos) ---
        const isPortuguese = language.startsWith('pt');
        const cacheMap = await batchFetchFromCache(rawUserMovies, isPortuguese, { thin, withSeasons: !fromRpc });

        const missing = rawUserMovies.filter((m) => !cacheMap.has(`${m.movie_id}_${m.media_type}`));

        // --- Reserva: só busca individualmente o que faltou no cache ---
        const fallbackDetails = await Promise.all(
          missing.map(async (m) => {
            try {
              // (20/11/2026) o tipo vai explícito: sem ele a busca perguntava à
              // tabela movies (um pedido a mais por título) e errava quando um
              // filme e uma série têm o mesmo número
              const details = await getMovieDetailsFromDB(m.movie_id, m.media_type === 'tv' ? 'tv' : 'movie');
              return { key: `${m.movie_id}_${m.media_type}`, movie: details };
            } catch {
              return null;
            }
          })
        );
        fallbackDetails.forEach((r) => {
          if (r) cacheMap.set(r.key, r.movie);
        });

        // --- Monta a lista final de filmes com nota ---
        const fullMovies: MovieWithRating[] = rawUserMovies
          .map((m) => {
            const movie = cacheMap.get(`${m.movie_id}_${m.media_type}`);
            if (!movie) return null;
            return { ...movie, userRating: m.rating };
          })
          .filter((m): m is MovieWithRating => m !== null);

        if (cancelled) return;
        setMovies(fullMovies);

        const ratedMovies = fullMovies.filter((m) => m.userRating !== null);

        // --- Tempo assistido (séries: episódios assistidos, em lote) ---
        const tvIds = ratedMovies.filter((m) => m.media_type === 'tv').map((m) => m.id);
        let watchedEpisodesByShow = new Map<number, { season_number: number; episode_number: number }[]>();

        if (tvIds.length > 0 && !fromRpc) {
          // 18/11/2026 (correção): paginado (cada episódio é uma linha; quem viu
          // muitas séries passava de 1.000 e o tempo assistido saía menor).
          const { data: watchedData } = await fetchAllPages((from, to) =>
            supabase
              .from('watched_episodes')
              .select('tmdb_id, season_number, episode_number')
              .eq('user_id', userId)
              .in('tmdb_id', tvIds)
              .order('tmdb_id')
              .order('season_number')
              .order('episode_number')
              .range(from, to)
          );

          (watchedData || []).forEach((ep: any) => {
            const list = watchedEpisodesByShow.get(ep.tmdb_id) || [];
            list.push({ season_number: ep.season_number, episode_number: ep.episode_number });
            watchedEpisodesByShow.set(ep.tmdb_id, list);
          });
        }

        let totalMinutes = 0;
        ratedMovies.forEach((movie) => {
          if (movie.media_type === 'tv') {
            const watched = watchedEpisodesByShow.get(movie.id) || [];
            watched.forEach((ep) => {
              const season = (movie as any).seasons?.find((s: any) => s.season_number === ep.season_number);
              const episode = season?.episodes?.find((e: any) => e.episode_number === ep.episode_number);
              if (episode?.runtime) totalMinutes += episode.runtime;
            });
          } else {
            totalMinutes += movie.runtime || 0;
          }
        });
        setTotalWatchTime(totalMinutes);

        // --- Gêneros favoritos ---
        const genreCounts: Record<string, Genre> = {};
        ratedMovies.forEach((movie) => {
          movie.genres?.forEach((genre: any) => {
            const key = String(genre.id ?? genre.name);
            genreCounts[key] = genreCounts[key] || { id: genre.id ?? genre.name, name: genre.name, count: 0 };
            genreCounts[key].count++;
          });
        });
        const topGenres = Object.values(genreCounts).sort((a, b) => b.count - a.count).slice(0, 3);
        setFavoriteGenres(topGenres);

        // --- Palavras-chave favoritas (subgêneros/temas, via TMDB keywords) ---
        // Mesmo padrão de contagem dos gêneros acima, só que lendo de
        // movie_cache.keywords — populado desde a sessão de otimização de
        // cache, mas nunca consumido em lugar nenhum até agora.
        //
        // Algumas keywords do TMDB são metadado técnico de produção, não um
        // tema de verdade — "duringcreditsstinger" (tem cena pós-créditos)
        // não diz nada sobre o gosto do usuário, é só um flag de catálogo.
        // Filtradas aqui na leitura, sem precisar mexer no dado já salvo.
        const NOISY_KEYWORDS = new Set([
          'based on novel or book',
          'based on comic',
          'duringcreditsstinger',
          'aftercreditsstinger'
        ]);
        const keywordCounts: Record<string, Keyword> = {};
        ratedMovies.forEach((movie) => {
          (movie as any).keywords?.forEach((kw: any) => {
            if (!kw?.name || NOISY_KEYWORDS.has(kw.name.toLowerCase())) return;
            const key = String(kw.id ?? kw.name);
            keywordCounts[key] = keywordCounts[key] || { id: kw.id ?? kw.name, name: kw.name, count: 0 };
            keywordCounts[key].count++;
          });
        });
        const topKeywords = Object.values(keywordCounts).sort((a, b) => b.count - a.count).slice(0, 3);
        setFavoriteKeywords(topKeywords);

        // --- Década favorita ---
        const decadeCounts: DecadeCount = {};
        let totalWithDate = 0;
        ratedMovies.forEach((movie) => {
          if (movie.release_date) {
            const year = new Date(movie.release_date).getFullYear();
            const decade = Math.floor(year / 10) * 10;
            const decadeStr = `${decade}s`;
            decadeCounts[decadeStr] = (decadeCounts[decadeStr] || 0) + 1;
            totalWithDate++;
          }
        });

        if (totalWithDate > 0) {
          let topDecade = '';
          let topCount = 0;
          for (const [decade, count] of Object.entries(decadeCounts)) {
            if (count > topCount) {
              topDecade = decade;
              topCount = count;
            }
          }
          setFavoriteDecade({
            decade: topDecade,
            count: topCount,
            label: decadeLabel(parseInt(topDecade)),
            percentage: (topCount / totalWithDate) * 100,
            allDecades: decadeCounts
          });
        } else {
          setFavoriteDecade(null);
        }

        // --- Atores e diretores mais frequentes ---
        const actorCounts: Record<number, ActorCount> = {};
        const directorCounts: Record<string, DirectorCount> = {};

        ratedMovies.forEach((movie) => {
          movie.credits?.cast?.slice(0, 5).forEach((actor: any) => {
            if (!actor?.id || !actor?.name) return;
            actorCounts[actor.id] = actorCounts[actor.id] || {
              id: actor.id,
              name: actor.name,
              character: actor.character,
              count: 0
            };
            actorCounts[actor.id].count++;
          });

          const director = movie.credits?.crew?.find(
            (p: any) => p.job === 'Director' || p.job === 'Creator' || p.job === 'Executive Producer'
          );
          if (director?.name) {
            directorCounts[director.name] = directorCounts[director.name] || {
              id: director.id,
              name: director.name,
              count: 0
            };
            directorCounts[director.name].count++;
          }
        });

        setTopActors(Object.values(actorCounts).sort((a, b) => b.count - a.count).slice(0, 3));
        setTopDirectors(Object.values(directorCounts).sort((a, b) => b.count - a.count).slice(0, 3));

        // --- Jóia escondida: o menos votado no TMDB entre os que a pessoa
        // deu 7 ou mais (desde 12/10/2026 — antes valia qualquer nota, e a
        // "joia" podia ser um filme que ela detestou) ---
        const withVoteCounts = ratedMovies
          .filter((m) => typeof m.userRating === 'number' && m.userRating >= 7 && typeof m.vote_count === 'number' && m.vote_count > 0)
          .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

        const gem =
          withVoteCounts.length > 0
            ? {
                id: withVoteCounts[0].id,
                title: withVoteCounts[0].title,
                vote_count: withVoteCounts[0].vote_count || 0,
                release_date: withVoteCounts[0].release_date,
                vote_average: withVoteCounts[0].vote_average,
                userRating: withVoteCounts[0].userRating ?? undefined,
                poster_path: withVoteCounts[0].poster_path || null
              }
            : null;
        setLeastKnownGem(gem);

        const countryTally: Record<string, number> = {};
        const countryRatingSum: Record<string, number> = {};
        ratedMovies.forEach((movie: any) => {
          const code = movie.origin_country?.[0];
          if (code && movie.userRating !== null) {
            countryTally[code] = (countryTally[code] || 0) + 1;
            countryRatingSum[code] = (countryRatingSum[code] || 0) + movie.userRating;
          }
        });
        setCountryCounts(countryTally);

        const countryAvg: Record<string, number> = {};
        Object.keys(countryTally).forEach((code) => {
          countryAvg[code] = countryRatingSum[code] / countryTally[code];
        });
        setCountryAvgRatings(countryAvg);

        setFriendsCount(friends);

        // (19/11/2026) Saiu o `cache.set` que guardava tudo isto, com a lista
        // inteira, no cache antigo (lib/cache.ts): ninguém lia essa entrada
        // desde que o atalho foi tirado, e ela segurava a biblioteca toda na
        // memória. Os números agora ficam na camada de dados (Q.profileStats).
      } catch (err: any) {
        console.error('useProfileData error:', err);
        if (!cancelled) setError(err?.message || 'Failed to load profile data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [userId, language, reloadFlag, statsMode, wantList, thin]);

  // Os números do banco, no formato que as telas já usam.
  const fromBank = useMemo(() => {
    if (!stats) return null;
    return {
      ratingDistribution: Object.fromEntries(Object.entries(stats.ratingDistribution).map(([rating, count]) => [Number(rating), count])) as Record<number, number>,
      countryCounts: Object.fromEntries(Object.entries(stats.countries).map(([code, value]) => [code, value.count])) as Record<string, number>,
      countryAvgRatings: Object.fromEntries(Object.entries(stats.countries).map(([code, value]) => [code, value.avg])) as Record<string, number>,
    };
  }, [stats]);

  if (stats && fromBank) {
    return {
      loading: loading && wantList,
      error,
      movies,
      ratedMoviesCount: stats.ratedMoviesCount,
      ratingDistribution: fromBank.ratingDistribution,
      totalWatchTime: stats.totalWatchTime,
      favoriteGenres,
      favoriteKeywords,
      favoriteDecade,
      topActors,
      topDirectors,
      leastKnownGem,
      friendsCount: stats.friendsCount,
      countryCounts: fromBank.countryCounts,
      countryAvgRatings: fromBank.countryAvgRatings,
      persona,
      personaLoading,
      refetch,
    };
  }

  return {
    loading,
    error,
    movies,
    ratedMoviesCount,
    ratingDistribution,
    totalWatchTime,
    favoriteGenres,
    favoriteKeywords,
    favoriteDecade,
    topActors,
    topDirectors,
    leastKnownGem,
    friendsCount,
    countryCounts,
    countryAvgRatings,
    persona,
    personaLoading,
    refetch
  };
}