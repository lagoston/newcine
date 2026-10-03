import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Nota prevista de VÁRIOS títulos de uma vez (Filtro do Oráculo na
// Watchlist). Só títulos que estão em alguma prateleira dos oráculos
// recebem previsão: filmes (movieIds) em recommendation_pools.movie_ids,
// séries (seriesIds) em recommendation_pools.tv_ids.
//
// Resposta: { ratings, chances } pros filmes e { seriesRatings,
// seriesChances } pras séries, todos no formato { id: valor }. "chances" é
// a chance de o título virar um 9 ou 10 do usuário (0 a 1).
//
// A fórmula (v4) mora no banco, na função predict_ratings_v4 — ver a
// migração 20261003200000_prediction_v4.sql.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PredictionRow {
  id: number;
  predicted_rating: number | null;
  chance_9plus: number | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

const EMPTY = { ratings: {}, chances: {}, seriesRatings: {}, seriesChances: {} };

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
    if (movieIds.length === 0 && seriesIds.length === 0) return json(EMPTY);

    // Sem questionário completo, nenhum título tem previsão — mesma regra
    // de predict-single-movie.
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('personalidade_completa')
      .eq('id', userId)
      .maybeSingle();

    if (!profileRow?.personalidade_completa) return json(EMPTY);

    // Quais estão em alguma prateleira (a coringa "random-surprise" não conta).
    const { data: pools, error: poolError } = await supabase
      .from('recommendation_pools')
      .select('movie_ids, tv_ids')
      .neq('mood_key', 'random-surprise');

    if (poolError) throw new Error(`Pool lookup: ${poolError.message}`);

    const pooledMovies = new Set<number>();
    const pooledSeries = new Set<number>();
    (pools || []).forEach((row: { movie_ids: number[] | null; tv_ids: number[] | null }) => {
      (row.movie_ids || []).forEach((id) => pooledMovies.add(id));
      (row.tv_ids || []).forEach((id) => pooledSeries.add(id));
    });

    const moviesInPool = movieIds.filter((id) => pooledMovies.has(id));
    const seriesInPool = seriesIds.filter((id) => pooledSeries.has(id));

    const predict = (mediaType: 'movie' | 'tv', ids: number[]) =>
      ids.length > 0
        ? supabase.rpc('predict_ratings_v4', { p_user_id: userId, p_media_type: mediaType, p_ids: ids })
        : Promise.resolve({ data: [] as PredictionRow[], error: null });

    const [moviesRes, seriesRes] = await Promise.all([predict('movie', moviesInPool), predict('tv', seriesInPool)]);
    if (moviesRes.error) throw new Error(`Movie predictions: ${moviesRes.error.message}`);
    if (seriesRes.error) throw new Error(`Series predictions: ${seriesRes.error.message}`);

    const collect = (rows: PredictionRow[]) => {
      const ratings: Record<number, number> = {};
      const chances: Record<number, number> = {};
      rows.forEach((row) => {
        if (row.predicted_rating === null) return;
        ratings[row.id] = row.predicted_rating;
        if (row.chance_9plus !== null) chances[row.id] = Math.round(row.chance_9plus * 100) / 100;
      });
      return { ratings, chances };
    };

    const movies = collect((moviesRes.data || []) as PredictionRow[]);
    const series = collect((seriesRes.data || []) as PredictionRow[]);

    return json({ ratings: movies.ratings, chances: movies.chances, seriesRatings: series.ratings, seriesChances: series.chances });
  } catch (error) {
    console.error('Error in predict-watchlist-ratings:', error);
    return json({ error: error.message || 'Something went wrong predicting watchlist ratings.' }, 500);
  }
});
