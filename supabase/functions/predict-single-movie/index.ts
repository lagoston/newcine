import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Nota prevista de UM título (menu do filme/série), sob demanda, e a chance
// de ele virar nota 10 do usuário (o menu mostra essa chance quando a nota
// prevista é 9 ou menos). Só sai previsão pra títulos que estão em alguma
// prateleira dos oráculos: filmes em recommendation_pools.movie_ids, séries
// em recommendation_pools.tv_ids.
//
// A fórmula (v4) mora no banco, na função predict_ratings — ver as migrações
// 20261003200000_prediction_v4.sql, 20261003210000_prediction_v4_cut.sql e
// 20261003220000_prediction_ten_chance.sql.
//
// 14/11/2026 (pedido do Bruno): o menu do título trocou os dois números por
// um medidor — a barra com o espectro das notas e a agulha oscilando. Para
// desenhar isso o menu precisa da expectativa (mu) e da largura da previsão
// (sigma, o ruído pessoal). O mu o banco já devolve; o sigma ele usa mas não
// devolve, então sai aqui da própria chance que ele calculou:
//   chance de 9 ou 10 = 1 / (1 + exp(-1,702 · (mu − 8,5) / sigma))
//   chance de 10      = 1 / (1 + exp(-(1,702 · (mu − 9,5) / sigma − 0,4)))
// Vale a que estiver mais longe do próprio limiar (perto dele a conta vira
// 0/0). Só campos novos na resposta: os apps antigos seguem como estavam.

const logit = (p: number) => Math.log(p / (1 - p));
const between = (p: number | null): p is number => p !== null && p > 0 && p < 1;

function predictionWidth(mu: number | null, chance9plus: number | null, chance10: number | null): number | null {
  if (mu === null || !Number.isFinite(mu)) return null;
  const from9 = between(chance9plus) ? (1.702 * (mu - 8.5)) / logit(chance9plus) : NaN;
  const from10 = between(chance10) ? (1.702 * (mu - 9.5)) / (logit(chance10) + 0.4) : NaN;
  const ordered = Math.abs(mu - 8.5) >= Math.abs(mu - 9.5) ? [from9, from10] : [from10, from9];
  const sigma = ordered.find((value) => Number.isFinite(value) && value > 0.2 && value < 6);
  return sigma === undefined ? null : sigma;
}

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

    const { data: rows, error: predictionError } = await supabase
      .rpc('predict_ratings', { p_user_id: userId, p_media_type: mediaType, p_ids: [Number(movieId)] });

    if (predictionError) throw new Error(`Prediction: ${predictionError.message}`);

    const row = (rows || [])[0] as
      | { mu: number | null; predicted_rating: number | null; chance_9plus: number | null; chance_10: number | null }
      | undefined;
    if (!row) return json({ inPool: true, predictedRating: null, reason: 'movie_not_cached' });

    const round3 = (value: number | null) => (value === null ? null : Math.round(value * 1000) / 1000);
    return json({
      inPool: true,
      predictedRating: row.predicted_rating,
      // a expectativa do modelo e a largura da previsão (para o medidor)
      mu: round3(row.mu),
      sigma: round3(predictionWidth(row.mu, row.chance_9plus, row.chance_10)),
      // chance de nota 10 (0 a 1)
      tenChance: round3(row.chance_10),
      // chance de 9 ou 10 — mantida pra versões antigas do app
      masterpieceChance: row.chance_9plus === null ? null : Math.round(row.chance_9plus * 100) / 100,
    });
  } catch (error) {
    console.error('Error in predict-single-movie:', error);
    return json({ error: error.message || 'Something went wrong predicting the rating.' }, 500);
  }
});
