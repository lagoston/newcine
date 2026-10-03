import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Placar de acertos do oráculo. Chamada pelo gatilho
// trigger_log_prediction_accuracy (não pelo app) sempre que alguém avalia um
// título que está numa prateleira dos oráculos: recalcula a previsão que o
// site teria mostrado ANTES dessa avaliação e guarda ao lado da nota real.
// É o histórico de previsões feitas de verdade — o teste que importa.
//
// A fórmula (v4) mora no banco, na função predict_ratings_v4 — ver a
// migração 20261003200000_prediction_v4.sql. O filme avaliado fica fora do
// histórico (p_exclude_movie), senão a própria resposta vazaria pro cálculo.

const MODEL_VERSION = 'v4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  let logId: string | undefined;

  try {
    const body = await req.json();
    logId = body.logId;
    if (!logId) throw new Error('logId is required');

    const { data: logRow, error: logError } = await supabase
      .from('prediction_accuracy_log')
      .select('user_id, movie_id, media_type, actual_rating')
      .eq('id', logId)
      .single();

    if (logError) throw new Error(`Log row: ${logError.message}`);

    const { user_id: userId, movie_id: movieId, media_type: mediaType, actual_rating: actualRating } = logRow;

    const { data: rows, error: predictionError } = await supabase.rpc('predict_ratings_v4', {
      p_user_id: userId,
      p_media_type: mediaType === 'tv' ? 'tv' : 'movie',
      p_ids: [movieId],
      p_exclude_movie: mediaType === 'tv' ? null : movieId,
    });

    if (predictionError) throw new Error(`Prediction: ${predictionError.message}`);

    const row = (rows || [])[0] as { mu: number | null; predicted_rating: number | null; chance_9plus: number | null } | undefined;

    if (!row || row.predicted_rating === null || row.mu === null) {
      await supabase.from('prediction_accuracy_log').update({
        prediction_status: 'error',
        error_message: 'Title not found in movie_cache or without TMDB score',
        model_version: MODEL_VERSION,
      }).eq('id', logId);
      return json({ success: false, reason: 'movie_not_cached' });
    }

    const { data: cached } = await supabase
      .from('movie_cache')
      .select('vote_average')
      .eq('tmdb_id', movieId)
      .eq('media_type', mediaType)
      .maybeSingle();

    const voteAverage = Number(cached?.vote_average) || 0;
    const predictedRating = row.predicted_rating;
    const predictedError = Math.abs(predictedRating - actualRating);
    const naiveError = Math.abs(voteAverage - actualRating);

    await supabase.from('prediction_accuracy_log').update({
      vote_average: voteAverage,
      predicted_rating: predictedRating,
      predicted_mu: Math.round(row.mu * 100) / 100,
      predicted_chance_9plus: row.chance_9plus === null ? null : Math.round(row.chance_9plus * 1000) / 1000,
      predicted_error: Math.round(predictedError * 100) / 100,
      naive_error: Math.round(naiveError * 100) / 100,
      beats_naive: predictedError < naiveError,
      prediction_status: 'computed',
      model_version: MODEL_VERSION,
    }).eq('id', logId);

    return json({ success: true, predictedRating, chance9plus: row.chance_9plus, voteAverage, actualRating });
  } catch (error) {
    console.error('Error in log-prediction-accuracy:', error);
    if (logId) {
      try {
        await supabase.from('prediction_accuracy_log').update({
          prediction_status: 'error',
          error_message: String(error.message || error),
          model_version: MODEL_VERSION,
        }).eq('id', logId);
      } catch {
        // se nem isso funcionar, só loga e segue — nunca deixa isso afetar o resto do sistema
      }
    }
    return json({ success: false, error: error.message || 'Internal server error' }, 500);
  }
});
