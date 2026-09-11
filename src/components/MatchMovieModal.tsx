import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOP_N = 10;
const MAX_EVIDENCE = 5;
const MAX_PARTICIPANTS = 4;
const MIN_RESULTS_BEFORE_FALLBACK = 5;

interface RequestBody {
  friendIds: string[];
  mode: 'unseen' | 'one' | 'both';
  moods?: string[];
  language?: string;
}

interface RatedMovieRow {
  movie_id: number;
  title: string;
  director: string | null;
  genre_ids: number[] | null;
  keyword_ids: number[] | null;
  vote_average: number;
  rating: number;
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
  genre_ids: number[] | null;
  keyword_ids: number[] | null;
  ratings: Record<string, number> | null;
}

const GENRE_ID_TO_NAME: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

const GENRE_ARCHETYPE_POINTS: Record<string, { e: number; i: number; c: number; s: number; r: number }> = {
  'Drama': { e: 4, i: 0, c: 0, s: 0, r: 0 },
  'Comedy': { e: 0, i: 0, c: 0, s: 0, r: 5 },
  'Action': { e: 0, i: 0, c: 0, s: 4, r: 1 },
  'Adventure': { e: 0, i: 0, c: 3, s: 0, r: 2 },
  'Science Fiction': { e: 0, i: 4, c: 0, s: 1, r: 0 },
  'Thriller': { e: 0, i: 5, c: 0, s: 0, r: 0 },
  'Horror': { e: 0, i: 0, c: 0, s: 5, r: 0 },
  'Fantasy': { e: 0, i: 0, c: 0, s: 4, r: 1 },
  'Romance': { e: 5, i: 0, c: 0, s: 0, r: 0 },
  'Mystery': { e: 0, i: 5, c: 0, s: 0, r: 0 },
  'Documentary': { e: 0, i: 0, c: 5, s: 0, r: 0 },
  'History': { e: 0, i: 1, c: 4, s: 0, r: 0 },
  'War': { e: 0, i: 0, c: 5, s: 0, r: 0 },
  'Animation': { e: 0, i: 0, c: 0, s: 0, r: 5 },
  'Family': { e: 0, i: 0, c: 0, s: 0, r: 5 },
  'Music': { e: 0, i: 0, c: 0, s: 5, r: 0 },
  'Crime': { e: 1, i: 1, c: 1, s: 2, r: 0 },
  'Western': { e: 0, i: 0, c: 5, s: 0, r: 0 },
  'TV Movie': { e: 0, i: 0, c: 0, s: 0, r: 5 },
};

type Spectrum = { e: number; i: number; c: number; s: number; r: number };

function movieSpectrumVector(genreIds: number[] | null): Spectrum {
  const vec: Spectrum = { e: 0, i: 0, c: 0, s: 0, r: 0 };
  (genreIds || []).forEach((id) => {
    const name = GENRE_ID_TO_NAME[id];
    const pts = name ? GENRE_ARCHETYPE_POINTS[name] : undefined;
    if (!pts) return;
    (['e', 'i', 'c', 's', 'r'] as const).forEach((k) => { vec[k] += pts[k]; });
  });
  const total = vec.e + vec.i + vec.c + vec.s + vec.r;
  if (total === 0) return vec;
  (['e', 'i', 'c', 's', 'r'] as const).forEach((k) => { vec[k] = vec[k] / total; });
  return vec;
}

function normalizeUserSpectrum(points: Spectrum): Spectrum {
  const total = points.e + points.i + points.c + points.s + points.r;
  if (total <= 0) return { e: 0.2, i: 0.2, c: 0.2, s: 0.2, r: 0.2 };
  return {
    e: points.e / total, i: points.i / total, c: points.c / total,
    s: points.s / total, r: points.r / total,
  };
}

function archetypeFit(movieVec: Spectrum, userVecNormalized: Spectrum): number {
  return (['e', 'i', 'c', 's', 'r'] as const).reduce((sum, k) => sum + movieVec[k] * userVecNormalized[k], 0);
}

const ARCHETYPE_BASELINE_FIT = 0.2;
const ARCHETYPE_BOOST_SCALE = 3;

function calculateUserBias(history: RatedMovieRow[]): number {
  const withAnchor = history.filter((m) => typeof m.vote_average === 'number');
  if (withAnchor.length === 0) return 0;
  const sum = withAnchor.reduce((acc, m) => acc + (m.rating - m.vote_average), 0);
  return sum / withAnchor.length;
}

function harmonicMeanN(values: number[]): number {
  if (values.some((v) => v <= 0)) return 0;
  const n = values.length;
  const sumReciprocals = values.reduce((sum, v) => sum + 1 / v, 0);
  return n / sumReciprocals;
}

function shuffle<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function balancedPick(matches: RatedMovieRow[], maxCount: number): RatedMovieRow[] {
  const high = shuffle(matches.filter((m) => m.rating >= 7));
  const low = shuffle(matches.filter((m) => m.rating <= 6));
  const picked: RatedMovieRow[] = [];
  let hi = 0;
  let li = 0;
  while (picked.length < maxCount && (hi < high.length || li < low.length)) {
    if (hi < high.length) {
      picked.push(high[hi++]);
      if (picked.length >= maxCount) break;
    }
    if (li < low.length) {
      picked.push(low[li++]);
    }
  }
  return picked;
}

function fishEvidence(
  candidateDirector: string | null,
  candidateGenreIds: number[] | null,
  candidateKeywordIds: number[] | null,
  history: RatedMovieRow[]
): { director: number[]; genre: number[]; keyword: number[] } {
  const used = new Set<number>();
  const director: number[] = [];
  const genre: number[] = [];
  const keyword: number[] = [];

  const collect = (movies: RatedMovieRow[], bucket: number[]) => {
    movies.forEach((movie) => {
      if (used.has(movie.movie_id)) return;
      used.add(movie.movie_id);
      bucket.push(movie.rating);
    });
  };

  let filled = 0;

  if (candidateDirector) {
    const directorMatches = history.filter((m) => m.director === candidateDirector);
    collect(balancedPick(directorMatches, MAX_EVIDENCE), director);
    filled += director.length;
  }

  if (filled < MAX_EVIDENCE && candidateGenreIds && candidateGenreIds.length > 0) {
    const genreSet = new Set(candidateGenreIds);
    const genreMatches = history.filter(
      (m) => !used.has(m.movie_id) && m.genre_ids?.some((g) => genreSet.has(g))
    );
    collect(balancedPick(genreMatches, MAX_EVIDENCE - filled), genre);
    filled += genre.length;
  }

  if (filled < MAX_EVIDENCE && candidateKeywordIds && candidateKeywordIds.length > 0) {
    const keywordSet = new Set(candidateKeywordIds);
    const keywordMatches = history.filter(
      (m) => !used.has(m.movie_id) && m.keyword_ids?.some((k) => keywordSet.has(k))
    );
    collect(balancedPick(keywordMatches, MAX_EVIDENCE - filled), keyword);
  }

  return { director, genre, keyword };
}

const NOISE_RANGE = 0.6;
const PRIOR_VARIANCE = 4;
const LAYER_WEIGHTS = { director: 0.05, keyword: 0.015, genre: 0.0075 };

function layerPrecision(ratings: number[], weight: number): { mean: number; precision: number } {
  const n = ratings.length;
  if (n === 0) return { mean: 0, precision: 0 };
  const mean = ratings.reduce((sum, r) => sum + r, 0) / n;
  const variance = n === 1
    ? PRIOR_VARIANCE
    : Math.max(ratings.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1), 0.25);
  return { mean, precision: (n / variance) * weight };
}

function predictWithAnchor(anchor: number, evidence: { director: number[]; genre: number[]; keyword: number[] }): number {
  let totalPrecisionXMean = (1 / PRIOR_VARIANCE) * anchor;
  let totalPrecision = 1 / PRIOR_VARIANCE;

  (['director', 'genre', 'keyword'] as const).forEach((layer) => {
    const { mean, precision } = layerPrecision(evidence[layer], LAYER_WEIGHTS[layer]);
    totalPrecisionXMean += precision * mean;
    totalPrecision += precision;
  });

  const base = totalPrecisionXMean / totalPrecision;
  const noise = (Math.random() - 0.5) * NOISE_RANGE;
  return Math.max(0, Math.min(10, base + noise));
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

// --- Filtro do 10/9 — mesma regra geral aplicada nas prateleiras da
// Biblioteca dos Oráculos, um filtro À PARTE do modelo bayesiano
// normal. Usa a nota BASAL do TMDB (não a previsão ajustada por viés),
// soma +1 por critério batido contra a caixa de nota 10 do participante
// (diretor, país excluindo EUA, keyword) mais +1 se o mood do filme
// estiver entre os 3 favoritos do participante. Acima de 10.0 vira 10,
// acima de 9.0 vira 9; fora disso, o filtro não se aplica. ---
interface Top10Signals {
  top_directors: string[];
  top_countries: string[];
  top_keywords: number[];
}

function applyTenFilter(
  rawVoteAverage: number,
  director: string | null,
  originCountry: string[] | null,
  keywordIds: number[] | null,
  movieMoodKey: string | undefined,
  signals: Top10Signals | null,
  top3Moods: Set<string>
): { isTrueTen: boolean; isTrueNine: boolean } {
  const topDirectorsSet = new Set(signals?.top_directors || []);
  const topCountriesSet = new Set(signals?.top_countries || []);
  const topKeywordsSet = new Set(signals?.top_keywords || []);

  let bonus = 0;
  if (director && topDirectorsSet.has(director)) bonus += 1;
  if (originCountry?.some((c) => topCountriesSet.has(c))) bonus += 1;
  if (movieMoodKey && top3Moods.has(movieMoodKey)) bonus += 1;
  if (keywordIds?.some((k) => topKeywordsSet.has(k))) bonus += 1;

  const score = rawVoteAverage + bonus;
  const isTrueTen = score > 10;
  const isTrueNine = !isTrueTen && score > 9;
  return { isTrueTen, isTrueNine };
}

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

    const [historyResults, spectrumRes, profilesRes, top10Results, moodRankResults] = await Promise.all([
      Promise.all(participantIds.map((id) => supabase.rpc('get_user_rated_movies_for_fishing', { p_user_id: id }))),
      supabase.from('profiles').select('id, pontos_e, pontos_i, pontos_c, pontos_s, pontos_r').in('id', participantIds),
      supabase.from('profiles').select('id, username').in('id', participantIds),
      // Filtro do 10/9 — sinais e moods favoritos de CADA participante,
      // já que a caixa de nota 10 é pessoal e intransferível: o bônus
      // de um filme pra você não pode vir da caixa de 10 de um amigo.
      Promise.all(participantIds.map((id) => supabase.rpc('get_user_top10_signals', { p_user_id: id }))),
      Promise.all(participantIds.map((id) => supabase.rpc('get_user_favorite_moods_order', { p_user_id: id }))),
    ]);

    for (const r of historyResults) {
      if (r.error) throw new Error(`History: ${r.error.message}`);
    }
    if (spectrumRes.error) throw new Error(`Spectrum: ${spectrumRes.error.message}`);
    for (const r of top10Results) {
      if (r.error) throw new Error(`Top10 signals: ${r.error.message}`);
    }
    for (const r of moodRankResults) {
      if (r.error) throw new Error(`Mood rank: ${r.error.message}`);
    }

    const historiesById: Record<string, RatedMovieRow[]> = {};
    participantIds.forEach((id, idx) => { historiesById[id] = historyResults[idx].data || []; });

    const biasById: Record<string, number> = {};
    participantIds.forEach((id) => { biasById[id] = calculateUserBias(historiesById[id]); });

    const spectrumRows = spectrumRes.data || [];
    const spectrumById: Record<string, Spectrum> = {};
    participantIds.forEach((id) => {
      const row = spectrumRows.find((r: any) => r.id === id);
      spectrumById[id] = normalizeUserSpectrum({
        e: Number(row?.pontos_e) || 0, i: Number(row?.pontos_i) || 0,
        c: Number(row?.pontos_c) || 0, s: Number(row?.pontos_s) || 0, r: Number(row?.pontos_r) || 0,
      });
    });

    const usernamesById: Record<string, string> = {};
    (profilesRes.data || []).forEach((r: any) => { usernamesById[r.id] = r.username; });

    const top10SignalsById: Record<string, Top10Signals | null> = {};
    participantIds.forEach((id, idx) => { top10SignalsById[id] = top10Results[idx].data as Top10Signals | null; });

    const top3MoodsById: Record<string, Set<string>> = {};
    participantIds.forEach((id, idx) => {
      const rows = (moodRankResults[idx].data || []) as { mood_key: string; score: number }[];
      top3MoodsById[id] = new Set(rows.slice(0, 3).map((r) => r.mood_key));
    });

    if (allCandidates.length === 0) {
      return new Response(
        JSON.stringify({ movies: [], mode, participants: participantIds.map((id) => ({ id, username: usernamesById[id] })) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Determina a qual mood cada candidato pertence — um filme por
    // mood, sem sobreposição (confirmado antes de implementar). Só
    // faz sentido em modo 'unseen', já que a busca por mood explícito
    // já vem filtrada por definição.
    const movieMoodById: Record<number, string> = {};
    if (mode === 'unseen') {
      const { data: moodRows, error: moodError } = await supabase.rpc('get_movie_mood_keys', {
        p_movie_ids: allCandidates.map((c) => c.tmdb_id),
      });
      if (moodError) throw new Error(`Movie moods: ${moodError.message}`);
      (moodRows || []).forEach((row: { movie_id: number; mood_key: string }) => {
        movieMoodById[row.movie_id] = row.mood_key;
      });
    }

    const scored = allCandidates.map((c) => {
      const rawAnchor = c.vote_average || 6.5;
      const movieVec = movieSpectrumVector(c.genre_ids);
      const movieMoodKey = movieMoodById[c.tmdb_id];

      const perUserScores = participantIds.map((id) => {
        const realRating = c.ratings?.[id];
        if (realRating !== undefined && realRating !== null) {
          return { id, score: realRating, wasRated: true, isTrueTen: false, isTrueNine: false };
        }

        // Filtro do 10/9 primeiro — se bater, a nota desse participante
        // pra esse filme já está decidida, sem passar pelo modelo
        // bayesiano normal (que segue intacto pro resto dos casos).
        const { isTrueTen, isTrueNine } = applyTenFilter(
          rawAnchor, c.director, c.origin_country, c.keyword_ids,
          movieMoodKey, top10SignalsById[id], top3MoodsById[id]
        );
        if (isTrueTen) return { id, score: 10, wasRated: false, isTrueTen: true, isTrueNine: false };
        if (isTrueNine) return { id, score: 9, wasRated: false, isTrueTen: false, isTrueNine: true };

        const adjustedAnchor = Math.max(0, Math.min(10, rawAnchor + biasById[id]));
        const evidence = fishEvidence(c.director, c.genre_ids, c.keyword_ids, historiesById[id]);
        return { id, score: predictWithAnchor(adjustedAnchor, evidence), wasRated: false, isTrueTen: false, isTrueNine: false };
      });

      const baseMatchScore = harmonicMeanN(perUserScores.map((s) => s.score));

      const fits = participantIds.map((id) => archetypeFit(movieVec, spectrumById[id]));
      const combinedFit = harmonicMeanN(fits.map((f) => f * 10)) / 10;
      const archetypeBoost = (combinedFit - ARCHETYPE_BASELINE_FIT) * ARCHETYPE_BOOST_SCALE;

      const matchScore = Math.max(0, Math.min(10, baseMatchScore + archetypeBoost));

      return {
        id: c.tmdb_id,
        title: (isPt && c.title_pt) ? c.title_pt : c.title_en,
        poster_path: (isPt && c.poster_path_pt) ? c.poster_path_pt : c.poster_path,
        overview: (isPt && c.overview_pt) ? c.overview_pt : (c.overview_en || ''),
        scores: perUserScores.map((s) => ({
          userId: s.id,
          username: usernamesById[s.id],
          score: Math.round(s.score * 10) / 10,
          wasRated: s.wasRated,
          isTrueTen: s.isTrueTen,
          isTrueNine: s.isTrueNine,
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