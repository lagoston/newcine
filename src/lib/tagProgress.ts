import { supabase } from './supabase';
import { getContinent } from './continents';
import { PROGRESSION_TAGS, THEME_TAGS, COMMUNITY_TAGS, ORACLE_TAGS, FRANCHISE_MOVIES } from './tags';

// Cálculo do progresso de TODAS as tags de um usuário, num lugar só. Antes o
// mesmo cálculo estava copiado no modal de Tags, no hook de tags
// desbloqueadas e (em parte) no Personalizar perfil — e as cópias já
// divergiam. Quem usa:
//   • TagPinsModal (modal "Tags"): progresso detalhado de cada tag;
//   • useUnlockedTagPins: só a lista das desbloqueadas (card de tags do
//     perfil de outras pessoas + notificação de tag nova);
//   • CustomizeModal: progresso das tags que liberam molduras/banners/cartas.
//
// Regras de contagem:
//   • só entram títulos AVALIADOS (nota preenchida);
//   • tags de humor (Bloody Mary, Punchliner, Cine Cupid) contam os FILMES
//     avaliados que moram naquela prateleira da Biblioteca dos Oráculos
//     (recommendation_pools, qualquer oráculo) — a mesma regra da
//     personalidade e de is_progression_tag_unlocked() no banco;
//   • CineHater conta notas de 0 a 3.

export type TagCategoryId = 'basic' | 'theme' | 'community' | 'oracle' | 'special';

export interface UnlockedPin {
  emoji: string;
  name: string;
  category: TagCategoryId;
}

export interface SpecialTagStatus {
  id: string;
  name: string;
  emoji: string;
  description: string;
  requirement_description: string;
  starts_at: string | null;
  ends_at: string | null;
  is_unlocked: boolean;
  unlocked_at?: string;
  is_currently_active: boolean;
}

export interface TagProgress {
  ratedCount: number;
  followers: number;
  // PROGRESSION_TAGS com condição, pelo nome da tag (ex.: 'Bloody Mary').
  basic: Record<string, number>;
  // THEME_TAGS, pelo id (ex.: 'red-pill-adept').
  theme: Record<string, number>;
  // ORACLE_TAGS, pelo id.
  oracle: Record<string, number>;
  // Especiais ainda ativas ou já conquistadas.
  specialTags: SpecialTagStatus[];
}

interface RatedRow {
  movie_id: number;
  rating: number;
  media_type: string | null;
}

interface CacheRow {
  tmdb_id: number;
  media_type: string;
  director: string | null;
  origin_country: string[] | null;
}

interface PoolRow {
  card_type: string;
  mood_key: string;
  movie_ids: number[] | null;
}

// A lista de ids vai na URL (in.(…)): em lotes, pra bibliotecas grandes.
const CACHE_BATCH = 300;

async function fetchCacheRows(ids: number[]): Promise<CacheRow[]> {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += CACHE_BATCH) batches.push(ids.slice(i, i + CACHE_BATCH));
  const results = await Promise.all(
    batches.map((batch) => supabase.from('movie_cache').select('tmdb_id, media_type, director, origin_country').in('tmdb_id', batch)),
  );
  return results.flatMap((r) => (r.data as CacheRow[] | null) ?? []);
}

export async function fetchTagProgress(userId: string): Promise<TagProgress> {
  const [moviesRes, poolsRes, friendsRes, realReviewsRes, aiReviewsRes, specialRes, userSpecialRes] = await Promise.all([
    supabase.from('user_movies').select('movie_id, rating, media_type').eq('user_id', userId).not('rating', 'is', null),
    supabase.from('recommendation_pools').select('card_type, mood_key, movie_ids'),
    supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_ai_generated', false),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_ai_generated', true),
    supabase.from('special_tags').select('*'),
    supabase.from('user_special_tags').select('tag_id, unlocked_at').eq('user_id', userId),
  ]);

  const rated = (moviesRes.data as RatedRow[] | null) ?? [];
  const ratedIds = new Set(rated.map((m) => m.movie_id));
  const ratedMovieIds = new Set(rated.filter((m) => (m.media_type ?? 'movie') === 'movie').map((m) => m.movie_id));

  // ---- Básicas ----
  const basic: Record<string, number> = {};
  basic['CineHater'] = rated.filter((m) => m.rating <= 3).length;
  basic['Golden Reel'] = rated.filter((m) => m.rating === 10).length;

  // Diretores, países e continentes (cache do TMDB).
  const cacheRows = rated.length > 0 ? await fetchCacheRows([...ratedIds]) : [];
  const cacheMap = new Map(cacheRows.map((c) => [`${c.tmdb_id}_${c.media_type}`, c]));
  const directorCounts: Record<string, number> = {};
  const countries = new Set<string>();
  const continents = new Set<string>();
  rated.forEach((entry) => {
    const cached = cacheMap.get(`${entry.movie_id}_${entry.media_type ?? 'movie'}`);
    if (!cached) return;
    if (cached.director) directorCounts[cached.director] = (directorCounts[cached.director] || 0) + 1;
    const country = cached.origin_country?.[0];
    if (country) {
      countries.add(country);
      const continent = getContinent(country);
      if (continent) continents.add(continent);
    }
  });
  basic["Director's Cut"] = Math.max(0, ...Object.values(directorCounts));
  basic['Nowhere'] = countries.size;
  basic['World Tour'] = continents.size;

  // Humores (prateleiras) e curadorias dos oráculos.
  const pools = (poolsRes.data as PoolRow[] | null) ?? [];
  const moodIds: Record<string, Set<number>> = {};
  const oracleIds: Record<string, Set<number>> = {};
  pools.forEach((row) => {
    const ids = row.movie_ids ?? [];
    if (row.mood_key !== 'random-surprise') {
      moodIds[row.mood_key] = moodIds[row.mood_key] ?? new Set();
      ids.forEach((id) => moodIds[row.mood_key].add(id));
    }
    oracleIds[row.card_type] = oracleIds[row.card_type] ?? new Set();
    ids.forEach((id) => oracleIds[row.card_type].add(id));
  });
  PROGRESSION_TAGS.forEach((tag) => {
    if (tag.condition?.type !== 'mood') return;
    const pool = moodIds[tag.condition.value as string];
    basic[tag.name] = pool ? [...ratedMovieIds].filter((id) => pool.has(id)).length : 0;
  });

  // Resenhas.
  const realReviews = realReviewsRes.count ?? 0;
  const aiReviews = aiReviewsRes.count ?? 0;
  basic['Scribbler'] = realReviews;
  basic['Screenwriter'] = realReviews;
  basic['Memoirist'] = realReviews;

  // Série completa: alguma série encerrada com todos os episódios lançados
  // assistidos (mesma RPC da barra de progresso da Biblioteca).
  const tvIds = rated.filter((m) => m.media_type === 'tv').map((m) => m.movie_id);
  let hasCompletedSeries = false;
  if (tvIds.length > 0) {
    const [{ data: progressRows }, { data: tvCacheRows }] = await Promise.all([
      supabase.rpc('get_tv_progress_batch', { p_user_id: userId, p_tmdb_ids: tvIds }),
      supabase.from('movie_cache').select('tmdb_id, status').eq('media_type', 'tv').in('tmdb_id', tvIds),
    ]);
    const statusMap = new Map(((tvCacheRows as { tmdb_id: number; status: string | null }[] | null) ?? []).map((r) => [r.tmdb_id, r.status]));
    hasCompletedSeries = ((progressRows as { tmdb_id: number; watched_count: number; aired_count: number }[] | null) ?? []).some((p) => {
      const status = statusMap.get(p.tmdb_id);
      const finished = status === 'Ended' || status === 'Canceled';
      return finished && p.aired_count > 0 && p.watched_count >= p.aired_count;
    });
  }
  basic['Sofa Sleeper'] = hasCompletedSeries ? 1 : 0;

  // ---- Temáticas (franquias) ----
  const theme: Record<string, number> = {};
  THEME_TAGS.forEach((tag) => {
    if (tag.condition.type !== 'franchise') return;
    const value = tag.condition.value;
    const ids = Array.isArray(value) ? value : FRANCHISE_MOVIES[value as keyof typeof FRANCHISE_MOVIES];
    if (ids) theme[tag.id] = ids.filter((id) => ratedIds.has(id)).length;
  });

  // ---- Oráculo ----
  const oracle: Record<string, number> = {};
  ORACLE_TAGS.forEach((tag) => {
    if (tag.condition.type === 'curated_pool' && tag.condition.value) {
      const pool = oracleIds[tag.condition.value];
      oracle[tag.id] = pool ? [...ratedIds].filter((id) => pool.has(id)).length : 0;
    } else if (tag.condition.type === 'ai_review_count') {
      oracle[tag.id] = aiReviews;
    }
  });

  // ---- Especiais ----
  const userSpecial = new Map(
    ((userSpecialRes.data as { tag_id: string; unlocked_at: string }[] | null) ?? []).map((ut) => [ut.tag_id, ut]),
  );
  const now = Date.now();
  const specialTags: SpecialTagStatus[] = ((specialRes.data as Omit<SpecialTagStatus, 'is_unlocked' | 'unlocked_at' | 'is_currently_active'>[] | null) ?? [])
    .map((tag) => {
      const mine = userSpecial.get(tag.id);
      return {
        id: tag.id,
        name: tag.name,
        emoji: tag.emoji,
        description: tag.description,
        requirement_description: tag.requirement_description,
        starts_at: tag.starts_at,
        ends_at: tag.ends_at,
        is_unlocked: Boolean(mine),
        unlocked_at: mine?.unlocked_at,
        is_currently_active: !tag.ends_at || new Date(tag.ends_at).getTime() > now,
      };
    })
    .filter((tag) => tag.is_unlocked || tag.is_currently_active);

  return {
    ratedCount: rated.length,
    followers: friendsRes.count ?? 0,
    basic,
    theme,
    oracle,
    specialTags,
  };
}

// Progresso de uma tag básica: as sem condição contam títulos avaliados.
export const basicTagProgress = (progress: TagProgress, tagName: string): number => {
  const tag = PROGRESSION_TAGS.find((t) => t.name === tagName);
  if (!tag) return 0;
  return tag.condition ? progress.basic[tag.name] || 0 : progress.ratedCount;
};

export function unlockedPinsFrom(progress: TagProgress): UnlockedPin[] {
  const pins: UnlockedPin[] = [];
  PROGRESSION_TAGS.forEach((tag) => {
    if (basicTagProgress(progress, tag.name) >= tag.minMovies) pins.push({ emoji: tag.emoji, name: tag.name, category: 'basic' });
  });
  THEME_TAGS.forEach((tag) => {
    if ((progress.theme[tag.id] || 0) >= tag.condition.count) pins.push({ emoji: tag.emoji, name: tag.name, category: 'theme' });
  });
  COMMUNITY_TAGS.forEach((tag) => {
    if (progress.followers >= tag.minFollowers) pins.push({ emoji: tag.emoji, name: tag.name, category: 'community' });
  });
  ORACLE_TAGS.forEach((tag) => {
    if ((progress.oracle[tag.id] || 0) >= tag.condition.count) pins.push({ emoji: tag.emoji, name: tag.name, category: 'oracle' });
  });
  progress.specialTags.forEach((tag) => {
    if (tag.is_unlocked) pins.push({ emoji: tag.emoji, name: tag.name, category: 'special' });
  });
  return pins;
}
