import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Prateleira da Biblioteca dos Oráculos (oráculo + humor): a nota PREVISTA
// pra este usuário de cada título da prateleira que ele ainda não tem, e a
// chance de virar um 9 ou 10 dele, em ordem. Filmes vêm de
// recommendation_pools.movie_ids; com includeSeries, as séries de
// recommendation_pools.tv_ids entram na mesma lista (cada item diz o
// media_type).
//
// A fórmula (v4) mora no banco, na função predict_ratings_v4 — ver a
// migração 20261003200000_prediction_v4.sql. Todas as previsões do site
// usam a mesma função.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  cardType: 'bogart' | 'fincher' | 'cypher';
  moodKey: string;
  includeSeries?: boolean;
}

interface PredictionRow {
  id: number;
  mu: number | null;
  predicted_rating: number | null;
  chance_9plus: number | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

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

    const { cardType, moodKey, includeSeries = false } = await req.json() as RequestBody;
    if (!cardType || !moodKey) return json({ error: 'cardType and moodKey are required' }, 400);

    const [poolRes, ratedRes] = await Promise.all([
      supabase.from('recommendation_pools').select('movie_ids, tv_ids').eq('card_type', cardType).eq('mood_key', moodKey).maybeSingle(),
      supabase.from('user_movies').select('movie_id, media_type').eq('user_id', userId),
    ]);

    if (poolRes.error) throw new Error(`Pool: ${poolRes.error.message}`);
    if (ratedRes.error) throw new Error(`Library: ${ratedRes.error.message}`);

    // Já avaliados (ou na biblioteca) saem — filme e série separados, pra
    // um número repetido nas duas listas do TMDB não esconder o outro.
    const ratedMovies = new Set<number>();
    const ratedSeries = new Set<number>();
    (ratedRes.data || []).forEach((r: { movie_id: number; media_type: string | null }) => {
      if (r.media_type === 'tv') ratedSeries.add(r.movie_id);
      else ratedMovies.add(r.movie_id);
    });

    const freshMovieIds = ((poolRes.data?.movie_ids as number[]) || []).filter((id) => !ratedMovies.has(id));
    const freshSeriesIds = includeSeries ? ((poolRes.data?.tv_ids as number[]) || []).filter((id) => !ratedSeries.has(id)) : [];

    if (freshMovieIds.length === 0 && freshSeriesIds.length === 0) return json({ movies: [] });

    const predict = (mediaType: 'movie' | 'tv', ids: number[]) =>
      ids.length > 0
        ? supabase.rpc('predict_ratings_v4', { p_user_id: userId, p_media_type: mediaType, p_ids: ids })
        : Promise.resolve({ data: [] as PredictionRow[], error: null });

    const [moviesRes, seriesRes] = await Promise.all([predict('movie', freshMovieIds), predict('tv', freshSeriesIds)]);
    if (moviesRes.error) throw new Error(`Movie predictions: ${moviesRes.error.message}`);
    if (seriesRes.error) throw new Error(`Series predictions: ${seriesRes.error.message}`);

    const toItem = (row: PredictionRow, mediaType: 'movie' | 'tv') => ({
      movie_id: row.id,
      media_type: mediaType,
      predicted_rating: row.predicted_rating,
      masterpiece_chance: row.chance_9plus === null ? null : Math.round(row.chance_9plus * 100) / 100,
      mu: row.mu,
    });

    const scored = [
      ...((moviesRes.data || []) as PredictionRow[]).map((row) => toItem(row, 'movie')),
      ...((seriesRes.data || []) as PredictionRow[]).map((row) => toItem(row, 'tv')),
    ];

    // Maior expectativa primeiro (é a mesma ordem da chance de 9+); sem
    // previsão vai pro fim.
    scored.sort((a, b) => (b.mu ?? -1) - (a.mu ?? -1) || a.movie_id - b.movie_id);

    return json({ movies: scored.map(({ mu: _mu, ...item }) => item) });
  } catch (error) {
    console.error('Error in predict-oracle-shelf:', error);
    return json({ error: error.message || 'Something went wrong predicting shelf ratings.' }, 500);
  }
});
