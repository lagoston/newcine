import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Nota prevista de UM título (menu do filme/série), sob demanda. Só sai
// previsão pra títulos que estão em alguma prateleira dos oráculos: filmes
// em recommendation_pools.movie_ids, séries em recommendation_pools.tv_ids.

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

    const { movieId, mediaType } = await req.json();
    if (!movieId || !mediaType) return json({ error: 'movieId and mediaType are required' }, 400);
    if (mediaType !== 'movie' && mediaType !== 'tv') return json({ inPool: false, predictedRating: null });

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('personalidade_completa')
      .eq('id', userId)
      .maybeSingle();

    if (!profileRow?.personalidade_completa) {
      return json({ inPool: false, predictedRating: null, reason: 'questionnaire_incomplete' });
    }

    const { data: existingRating } = await supabase
      .from('user_movies')
      .select('rating')
      .eq('user_id', userId)
      .eq('movie_id', movieId)
      .eq('media_type', mediaType)
      .maybeSingle();

    if (existingRating?.rating !== undefined && existingRating?.rating !== null) {
      return json({ inPool: false, predictedRating: null, reason: 'already_rated' });
    }

    const { data: poolMatches, error: poolError } = await supabase
      .rpc('get_pools_containing_title', { p_id: movieId, p_media_type: mediaType });

    if (poolError) throw new Error(`Pool lookup: ${poolError.message}`);
    if (!poolMatches || poolMatches.length === 0) return json({ inPool: false, predictedRating: null });

    const { data: titleRow, error: titleError } = await supabase
      .from('movie_cache')
      .select('vote_average, director, origin_country, keywords')
      .eq('tmdb_id', movieId)
      .eq('media_type', mediaType)
      .maybeSingle();

    if (titleError || !titleRow) return json({ inPool: true, predictedRating: null, reason: 'movie_not_cached' });

    const keywordIds = (titleRow.keywords || []).map((k: any) => k.id);
    const primaryCountry = titleRow.origin_country?.[0] || null;
    const voteAverage = titleRow.vote_average || 0;

    const { data: historyRaw, error: historyError } = await supabase
      .rpc('get_user_rated_movies_for_fishing', { p_user_id: userId });

    if (historyError) throw new Error(`History: ${historyError.message}`);

    // O histórico é só de filmes; pra um filme, ele mesmo nunca entra.
    const history: RatedMovieRow[] = (historyRaw || []).filter(
      (m: RatedMovieRow) => mediaType !== 'movie' || m.movie_id !== movieId
    );

    const [positiveRes, negativeRes, moodRankRes] = await Promise.all([
      supabase.rpc('get_user_top10_signals', { p_user_id: userId }),
      supabase.rpc('get_user_bottom_signals', { p_user_id: userId }),
      supabase.rpc('get_user_favorite_moods_order', { p_user_id: userId }),
    ]);

    if (positiveRes.error) throw new Error(`Positive signals: ${positiveRes.error.message}`);
    if (negativeRes.error) throw new Error(`Negative signals: ${negativeRes.error.message}`);
    if (moodRankRes.error) throw new Error(`Mood rank: ${moodRankRes.error.message}`);

    const bias = calculateUserBias(history);
    const positive = positiveRes.data as PositiveSignals;
    const negative = negativeRes.data as NegativeSignals;

    const moodRankRows = (moodRankRes.data || []) as { mood_key: string; score: number }[];
    const top3Moods = new Set(moodRankRows.slice(0, 3).map((r) => r.mood_key));

    // "random-surprise" é a pool coringa, nunca conta pro bônus de humor.
    const realMoodKeys = (poolMatches || [])
      .map((p: { mood_key: string }) => p.mood_key)
      .filter((mk: string) => mk !== 'random-surprise');
    const matchingMoodKey = realMoodKeys.find((mk: string) => top3Moods.has(mk));

    const predictedRating = computeFinalRating(
      voteAverage, bias, titleRow.director, primaryCountry, keywordIds,
      matchingMoodKey, positive, negative, top3Moods
    );

    return json({ inPool: true, predictedRating });
  } catch (error) {
    console.error('Error in predict-single-movie:', error);
    return json({ error: error.message || 'Something went wrong predicting the rating.' }, 500);
  }
});
