import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOP_N = 10;
const MAX_PARTICIPANTS = 4;
const MIN_RESULTS_BEFORE_FALLBACK = 5;

interface RequestBody {
  friendIds: string[];
  mode: 'unseen' | 'one' | 'both';
  moods?: string[];
  language?: string;
}

interface CandidateRow {
  tmdb_id: number;
  title_en: string;
  title_pt: string | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  overview_en: string | null;
  overview_pt: string | null;
  vote_average: number;
  director: string | null;
  origin_country: string[] | null;
  keyword_ids: number[] | null;
  ratings: Record<string, number> | null;
}

function harmonicMeanN(values: number[]): number {
  if (values.some((v) => v <= 0)) return 0;
  const n = values.length;
  const sumReciprocals = values.reduce((sum, v) => sum + 1 / v, 0);
  return n / sumReciprocals;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const ORACLES = ['bogart', 'fincher', 'cypher'] as const;

function pickSamplingProfile(): Record<string, number> {
  const roll = Math.random();
  const shuffledOracles = [...ORACLES].sort(() => Math.random() - 0.5);
  if (roll < 0.4) {
    return { [ORACLES[0]]: 0.34, [ORACLES[1]]: 0.33, [ORACLES[2]]: 0.33 };
  } else if (roll < 0.75) {
    return { [shuffledOracles[0]]: 0.5, [shuffledOracles[1]]: 0.5, [shuffledOracles[2]]: 0 };
  } else {
    return { [shuffledOracles[0]]: 0.9, [shuffledOracles[1]]: 0.1, [shuffledOracles[2]]: 0 };
  }
}

// --- Nota individual de cada participante: modelo de previsão v4, que
// mora no banco (função predict_ratings_v4 — ver a migração
// 20261003200000_prediction_v4.sql). A combinação entre participantes (a
// média harmônica que gera o matchScore) continua igual. Quem já avaliou o
// filme entra com a nota real.

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

    const { friendIds, mode = 'unseen', moods, language = 'en' } = await req.json() as RequestBody;
    const isPt = language.startsWith('pt');

    const uniqueFriendIds = Array.from(new Set((friendIds || []).filter((id) => id && id !== userId)));

    if (uniqueFriendIds.length === 0) {
      return new Response(
        JSON.stringify({ error: isPt ? 'Selecione ao menos um amigo válido.' : 'Select at least one valid friend.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    if (uniqueFriendIds.length > MAX_PARTICIPANTS - 1) {
      return new Response(
        JSON.stringify({ error: isPt ? `Máximo de ${MAX_PARTICIPANTS} participantes.` : `Maximum of ${MAX_PARTICIPANTS} participants.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!moods || moods.length === 0) {
      return new Response(
        JSON.stringify({ error: isPt ? 'Selecione ao menos um humor.' : 'Select at least one mood.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { data: followRows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .in('following_id', uniqueFriendIds);

    const followedIds = new Set((followRows || []).map((r: any) => r.following_id));
    const notFollowed = uniqueFriendIds.filter((id) => !followedIds.has(id));
    if (notFollowed.length > 0) {
      return new Response(
        JSON.stringify({ error: isPt ? 'Você precisa seguir todos os participantes escolhidos.' : 'You must follow all chosen participants.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const participantIds = [userId, ...uniqueFriendIds];

    let allCandidates: CandidateRow[] = [];

    if (mode === 'unseen') {
      const TARGET_POOL_SIZE = 150;

      const runSampledSearch = async (poolSize: number) => {
        const oraclePoolResults = await Promise.all(
          ORACLES.map((oracle) => supabase.rpc('get_oracle_pool_movie_ids', { p_card_type: oracle, p_mood_keys: moods }))
        );
        for (const r of oraclePoolResults) {
          if (r.error) throw new Error(`Oracle pool: ${r.error.message}`);
        }

        const samplingProfile = pickSamplingProfile();
        const sampledMovieIds = new Set<number>();
        ORACLES.forEach((oracle, idx) => {
          const pool: number[] = oraclePoolResults[idx].data || [];
          const share = samplingProfile[oracle] || 0;
          const takeCount = poolSize === Infinity ? pool.length : Math.round(poolSize * share);
          shuffleArray(pool).slice(0, takeCount).forEach((id) => sampledMovieIds.add(id));
        });

        const res = await supabase.rpc('get_match_movie_candidates', {
          p_movie_ids: Array.from(sampledMovieIds), p_user_ids: participantIds, p_mode: mode
        });
        if (res.error) throw new Error(`Candidates: ${res.error.message}`);
        return (res.data || []) as CandidateRow[];
      };

      allCandidates = await runSampledSearch(TARGET_POOL_SIZE);

      if (allCandidates.length < MIN_RESULTS_BEFORE_FALLBACK) {
        allCandidates = await runSampledSearch(Infinity);
      }
    } else {
      const res = await supabase.rpc('get_rated_movies_matching_mood', {
        p_user_ids: participantIds, p_moods: moods, p_mode: mode
      });
      if (res.error) throw new Error(`Candidates: ${res.error.message}`);
      allCandidates = (res.data || []) as CandidateRow[];
    }

    const { data: profileRows } = await supabase.from('profiles').select('id, username').in('id', participantIds);
    const usernamesById: Record<string, string> = {};
    (profileRows || []).forEach((r: any) => { usernamesById[r.id] = r.username; });

    if (allCandidates.length === 0) {
      return new Response(
        JSON.stringify({ movies: [], mode, participants: participantIds.map((id) => ({ id, username: usernamesById[id] })) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Previsão de cada participante pra todos os candidatos, uma chamada por pessoa.
    const candidateIds = allCandidates.map((c) => c.tmdb_id);
    const predictionResults = await Promise.all(
      participantIds.map((id) => supabase.rpc('predict_ratings_v4', { p_user_id: id, p_media_type: 'movie', p_ids: candidateIds }))
    );
    const predictedById: Record<string, Map<number, number>> = {};
    participantIds.forEach((id, idx) => {
      const r = predictionResults[idx];
      if (r.error) throw new Error(`Predictions: ${r.error.message}`);
      predictedById[id] = new Map(
        ((r.data || []) as { id: number; predicted_rating: number | null }[])
          .filter((row) => row.predicted_rating !== null)
          .map((row) => [row.id, row.predicted_rating as number])
      );
    });

    const scored = allCandidates.map((c) => {
      const perUserScores = participantIds.map((id) => {
        const realRating = c.ratings?.[id];
        if (realRating !== undefined && realRating !== null) {
          return { id, score: realRating, wasRated: true };
        }
        return { id, score: predictedById[id].get(c.tmdb_id) ?? 0, wasRated: false };
      });

      const matchScore = harmonicMeanN(perUserScores.map((s) => s.score));

      return {
        id: c.tmdb_id,
        title: (isPt && c.title_pt) ? c.title_pt : c.title_en,
        poster_path: (isPt && c.poster_path_pt) ? c.poster_path_pt : c.poster_path,
        overview: (isPt && c.overview_pt) ? c.overview_pt : (c.overview_en || ''),
        scores: perUserScores.map((s) => ({
          userId: s.id,
          username: usernamesById[s.id],
          score: s.score,
          wasRated: s.wasRated,
        })),
        matchScore: Math.round(matchScore * 10) / 10
      };
    });

    const sortedScored = scored.sort((a, b) => b.matchScore - a.matchScore);
    const top = sortedScored.slice(0, TOP_N);

    return new Response(
      JSON.stringify({
        movies: top,
        mode,
        participants: participantIds.map((id) => ({ id, username: usernamesById[id] }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in match-movie:', error);
    return new Response(
      JSON.stringify({ error: 'Something went wrong finding your match. Please try again.' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
