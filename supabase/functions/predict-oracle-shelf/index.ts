import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Prateleira da Biblioteca dos Oráculos (oráculo + humor): a nota PREVISTA
// pra este usuário de cada título da prateleira que ele ainda não avaliou,
// em ordem. Filmes vêm de recommendation_pools.movie_ids; com
// includeSeries, as séries de recommendation_pools.tv_ids entram na mesma
// lista (cada item diz o media_type).

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

// --- Modelo de previsão v3 (03/10/2026) — o mesmo em predict-oracle-shelf,
// predict-single-movie, predict-watchlist-ratings e match-movie.
//
//   nota = arredonda( nota TMDB + viés pessoal + 0,3 × (ajuste positivo + ajuste negativo) )
//   travada entre 0 e 10, arredondada pro inteiro MAIS PRÓXIMO.
//
// Viés pessoal: média de (nota do usuário − nota TMDB) nos filmes que ele
// avaliou. Vale sempre (no v2 era zerado quando algum sinal positivo batia).
//
// Sinais (iguais ao v2):
//   positivo (avaliações 8 a 10): diretor presente +1; humor da prateleira
//   entre os 3 favoritos +1; país principal entre os 3 mais frequentes
//   (fora EUA) +0,5; cada uma das 10 palavras-chave mais frequentes +0,5.
//   negativo (avaliações 0 a 4): −1 por filme ruim do mesmo diretor; país
//   principal em 1º/2º/3º do ranking −1,5/−1/−0,5; −0,5 por palavra-chave.
//
// Por que v3: no teste "deixa um de fora" com 953 notas reais de filmes
// das prateleiras (22 usuários, 03/10/2026), o v2 (piso, sinais cheios,
// viés zerado) errou em média 1,31 ponto e acertou a nota exata em 25% —
// pior que a própria nota do TMDB arredondada (1,21 e 27,6%). O v3 erra
// 1,11 e acerta em cheio 30,8% (±1 ponto: 73,7%). Inteiro continua sendo o
// certo: com uma casa decimal a mesma fórmula acerta a nota exata só 2,5%
// das vezes, e até o erro médio piora (1,15), porque as notas são inteiras.
const SIGNAL_WEIGHT = 0.3;

function calculateUserBias(history: RatedMovieRow[]): number {
  const withAnchor = history.filter((m) => typeof m.vote_average === 'number');
  if (withAnchor.length === 0) return 0;
  const sum = withAnchor.reduce((acc, m) => acc + (m.rating - m.vote_average), 0);
  return sum / withAnchor.length;
}

// Valor antes do arredondamento (serve também pra desempatar a ordem).
function computeRawScore(
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

  return voteAverage + bias + SIGNAL_WEIGHT * (positiveAdjustment + negativeAdjustment);
}

const toRating = (raw: number) => Math.max(0, Math.min(10, Math.round(raw)));

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

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    const userId = user.id;

    const { cardType, moodKey, includeSeries = false } = await req.json() as RequestBody;

    if (!cardType || !moodKey) {
      return new Response(
        JSON.stringify({ error: 'cardType and moodKey are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const [poolRes, historyRes, positiveRes, negativeRes, moodRankRes, ratedRes] = await Promise.all([
      supabase.from('recommendation_pools').select('movie_ids, tv_ids').eq('card_type', cardType).eq('mood_key', moodKey).maybeSingle(),
      supabase.rpc('get_user_rated_movies_for_fishing', { p_user_id: userId }),
      supabase.rpc('get_user_top10_signals', { p_user_id: userId }),
      supabase.rpc('get_user_bottom_signals', { p_user_id: userId }),
      supabase.rpc('get_user_favorite_moods_order', { p_user_id: userId }),
      supabase.from('user_movies').select('movie_id, media_type').eq('user_id', userId),
    ]);

    if (poolRes.error) throw new Error(`Pool: ${poolRes.error.message}`);
    if (historyRes.error) throw new Error(`History: ${historyRes.error.message}`);
    if (positiveRes.error) throw new Error(`Positive signals: ${positiveRes.error.message}`);
    if (negativeRes.error) throw new Error(`Negative signals: ${negativeRes.error.message}`);
    if (moodRankRes.error) throw new Error(`Mood rank: ${moodRankRes.error.message}`);

    // Já avaliados (ou na biblioteca) saem — filme e série separados, pra
    // um número repetido nas duas listas do TMDB não esconder o outro.
    const ratedMovies = new Set<number>();
    const ratedSeries = new Set<number>();
    (ratedRes.data || []).forEach((r: { movie_id: number; media_type: string | null }) => {
      if (r.media_type === 'tv') ratedSeries.add(r.movie_id);
      else ratedMovies.add(r.movie_id);
    });

    const poolMovieIds: number[] = poolRes.data?.movie_ids || [];
    const poolSeriesIds: number[] = includeSeries ? poolRes.data?.tv_ids || [] : [];
    const freshMovieIds = poolMovieIds.filter((id) => !ratedMovies.has(id));
    const freshSeriesIds = poolSeriesIds.filter((id) => !ratedSeries.has(id));

    if (freshMovieIds.length === 0 && freshSeriesIds.length === 0) {
      return new Response(
        JSON.stringify({ movies: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const history = (historyRes.data || []) as RatedMovieRow[];
    const bias = calculateUserBias(history);
    const positive = positiveRes.data as PositiveSignals;
    const negative = negativeRes.data as NegativeSignals;

    const moodRankRows = (moodRankRes.data || []) as { mood_key: string; score: number }[];
    const top3Moods = new Set(moodRankRows.slice(0, 3).map((r) => r.mood_key));

    const fields = 'tmdb_id, vote_average, director, origin_country, keywords';
    const [moviesRes, seriesRes] = await Promise.all([
      freshMovieIds.length > 0
        ? supabase.from('movie_cache').select(fields).eq('media_type', 'movie').in('tmdb_id', freshMovieIds)
        : Promise.resolve({ data: [], error: null }),
      freshSeriesIds.length > 0
        ? supabase.from('movie_cache').select(fields).eq('media_type', 'tv').in('tmdb_id', freshSeriesIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (moviesRes.error) throw new Error(`Pool movies: ${moviesRes.error.message}`);
    if (seriesRes.error) throw new Error(`Pool series: ${seriesRes.error.message}`);

    const score = (row: any, mediaType: 'movie' | 'tv') => {
      const raw = computeRawScore(
        row.vote_average || 0,
        bias,
        row.director,
        row.origin_country?.[0] || null,
        (row.keywords || []).map((k: any) => k.id),
        moodKey,
        positive,
        negative,
        top3Moods
      );
      return { movie_id: row.tmdb_id as number, media_type: mediaType, predicted_rating: toRating(raw), raw };
    };

    const scored = [
      ...(moviesRes.data || []).map((row: any) => score(row, 'movie')),
      ...(seriesRes.data || []).map((row: any) => score(row, 'tv')),
    ];

    // Maior nota primeiro; empate decidido pelo valor antes do arredondamento.
    scored.sort((a, b) => b.raw - a.raw || a.movie_id - b.movie_id);

    return new Response(
      JSON.stringify({ movies: scored.map(({ raw: _raw, ...item }) => item) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in predict-oracle-shelf:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Something went wrong predicting shelf ratings.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
