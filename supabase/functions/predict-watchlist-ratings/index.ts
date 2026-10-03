import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Nota prevista de VÁRIOS títulos de uma vez (Filtro do Oráculo na
// Watchlist), buscando os sinais do usuário uma vez só. Só títulos que
// estão em alguma prateleira dos oráculos recebem previsão: filmes
// (movieIds) em recommendation_pools.movie_ids, séries (seriesIds) em
// recommendation_pools.tv_ids. Resposta: { ratings: {id: nota} } pros
// filmes e { seriesRatings: {id: nota} } pras séries.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RatedMovieRow {
  movie_id: number;
  director: string | null;
  vote_average: number;
  rating: number;
}

interface PositiveSignals {
  top_directors: string[];
  top_countries: string[];
  top_keywords: number[];
}

interface NegativeSignals {
  bottom_directors: Record<string, number>;
  bottom_countries: Record<string, number>;
  bottom_keywords: number[];
}

// --- Modelo de previsão v3 (03/10/2026) — réplica exata de
// predict-oracle-shelf (lá está a explicação completa e o teste que
// justificou a mudança):
//   nota = arredonda( nota TMDB + viés pessoal + 0,3 × (ajuste positivo + ajuste negativo) )
// travada entre 0 e 10, arredondada pro inteiro mais próximo; o viés vale
// sempre.
const SIGNAL_WEIGHT = 0.3;

function calculateUserBias(history: RatedMovieRow[]): number {
  const withAnchor = history.filter((m) => typeof m.vote_average === 'number');
  if (withAnchor.length === 0) return 0;
  const sum = withAnchor.reduce((acc, m) => acc + (m.rating - m.vote_average), 0);
  return sum / withAnchor.length;
}

function computeFinalRating(
  voteAverage: number,
  bias: number,
  director: string | null,
  primaryCountry: string | null,
  keywordIds: number[],
  movieMoodKey: string | undefined,
  positive: PositiveSignals,
  negative: NegativeSignals,
  top3Moods: Set<string>
): number {
  let positiveAdjustment = 0;
  if (director && positive.top_directors.includes(director)) positiveAdjustment += 1;
  if (movieMoodKey && top3Moods.has(movieMoodKey)) positiveAdjustment += 1;
  if (primaryCountry && positive.top_countries.includes(primaryCountry)) positiveAdjustment += 0.5;
  positiveAdjustment += keywordIds.filter((k) => positive.top_keywords.includes(k)).length * 0.5;

  let negativeAdjustment = 0;
  if (director && negative.bottom_directors[director]) negativeAdjustment -= negative.bottom_directors[director];
  if (primaryCountry && negative.bottom_countries[primaryCountry] !== undefined) {
    negativeAdjustment += negative.bottom_countries[primaryCountry]; // já vem negativo
  }
  negativeAdjustment -= keywordIds.filter((k) => negative.bottom_keywords.includes(k)).length * 0.5;

  const raw = voteAverage + bias + SIGNAL_WEIGHT * (positiveAdjustment + negativeAdjustment);
  return Math.max(0, Math.min(10, Math.round(raw)));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

const toIds = (value: unknown): number[] =>
  Array.isArray(value) ? [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : [];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseAuthClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser();

    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const movieIds = toIds(body?.movieIds);
    const seriesIds = toIds(body?.seriesIds);
    if (movieIds.length === 0 && seriesIds.length === 0) return json({ ratings: {}, seriesRatings: {} });

    // Sem questionário completo, nenhum título tem previsão — mesma regra
    // de predict-single-movie.
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('personalidade_completa')
      .eq('id', userId)
      .maybeSingle();

    if (!profileRow?.personalidade_completa) return json({ ratings: {}, seriesRatings: {} });

    // Humores (prateleiras) de cada título — a coringa "random-surprise"
    // nunca conta.
    const [moviePoolsRes, seriesPoolsRes] = await Promise.all([
      movieIds.length > 0
        ? supabase.rpc('get_pools_for_movies', { p_movie_ids: movieIds })
        : Promise.resolve({ data: [], error: null }),
      seriesIds.length > 0
        ? supabase.from('recommendation_pools').select('mood_key, tv_ids').neq('mood_key', 'random-surprise')
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (moviePoolsRes.error) throw new Error(`Pool lookup: ${moviePoolsRes.error.message}`);
    if (seriesPoolsRes.error) throw new Error(`Series pool lookup: ${seriesPoolsRes.error.message}`);

    const movieMoods = new Map<number, string[]>();
    (moviePoolsRes.data || []).forEach((row: { movie_id: number; mood_key: string }) => {
      if (row.mood_key === 'random-surprise') return;
      movieMoods.set(row.movie_id, [...(movieMoods.get(row.movie_id) || []), row.mood_key]);
    });

    const wantedSeries = new Set(seriesIds);
    const seriesMoods = new Map<number, string[]>();
    (seriesPoolsRes.data || []).forEach((row: { mood_key: string; tv_ids: number[] | null }) => {
      (row.tv_ids || []).forEach((id) => {
        if (!wantedSeries.has(id)) return;
        seriesMoods.set(id, [...(seriesMoods.get(id) || []), row.mood_key]);
      });
    });

    const moviesInPool = [...movieMoods.keys()];
    const seriesInPool = [...seriesMoods.keys()];
    if (moviesInPool.length === 0 && seriesInPool.length === 0) return json({ ratings: {}, seriesRatings: {} });

    const fields = 'tmdb_id, vote_average, director, origin_country, keywords';
    const [moviesRes, seriesRes, historyRes, positiveRes, negativeRes, moodRankRes] = await Promise.all([
      moviesInPool.length > 0
        ? supabase.from('movie_cache').select(fields).eq('media_type', 'movie').in('tmdb_id', moviesInPool)
        : Promise.resolve({ data: [], error: null }),
      seriesInPool.length > 0
        ? supabase.from('movie_cache').select(fields).eq('media_type', 'tv').in('tmdb_id', seriesInPool)
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc('get_user_rated_movies_for_fishing', { p_user_id: userId }),
      supabase.rpc('get_user_top10_signals', { p_user_id: userId }),
      supabase.rpc('get_user_bottom_signals', { p_user_id: userId }),
      supabase.rpc('get_user_favorite_moods_order', { p_user_id: userId }),
    ]);

    if (moviesRes.error) throw new Error(`Movies: ${moviesRes.error.message}`);
    if (seriesRes.error) throw new Error(`Series: ${seriesRes.error.message}`);
    if (historyRes.error) throw new Error(`History: ${historyRes.error.message}`);
    if (positiveRes.error) throw new Error(`Positive signals: ${positiveRes.error.message}`);
    if (negativeRes.error) throw new Error(`Negative signals: ${negativeRes.error.message}`);
    if (moodRankRes.error) throw new Error(`Mood rank: ${moodRankRes.error.message}`);

    const bias = calculateUserBias((historyRes.data || []) as RatedMovieRow[]);
    const positive = positiveRes.data as PositiveSignals;
    const negative = negativeRes.data as NegativeSignals;

    const moodRankRows = (moodRankRes.data || []) as { mood_key: string; score: number }[];
    const top3Moods = new Set(moodRankRows.slice(0, 3).map((r) => r.mood_key));

    const predict = (row: any, moods: string[]) =>
      computeFinalRating(
        row.vote_average || 0,
        bias,
        row.director,
        row.origin_country?.[0] || null,
        (row.keywords || []).map((k: any) => k.id),
        moods.find((mk) => top3Moods.has(mk)),
        positive,
        negative,
        top3Moods
      );

    const ratings: Record<number, number> = {};
    (moviesRes.data || []).forEach((row: any) => {
      ratings[row.tmdb_id] = predict(row, movieMoods.get(row.tmdb_id) || []);
    });

    const seriesRatings: Record<number, number> = {};
    (seriesRes.data || []).forEach((row: any) => {
      seriesRatings[row.tmdb_id] = predict(row, seriesMoods.get(row.tmdb_id) || []);
    });

    return json({ ratings, seriesRatings });
  } catch (error) {
    console.error('Error in predict-watchlist-ratings:', error);
    return json({ error: error.message || 'Something went wrong predicting watchlist ratings.' }, 500);
  }
});
