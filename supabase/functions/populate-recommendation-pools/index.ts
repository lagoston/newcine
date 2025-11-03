import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Mapping dos humores para gêneros (em inglês para TMDB)
const MOOD_GENRE_MAPPING: Record<string, number[]> = {
  'feel-good': [12, 16, 10749],
  'need-to-cry': [18],
  'adrenaline': [28, 10752, 37],
  'mind-blowing': [878, 53, 9648, 36, 99],
  'laugh-out-loud': [35],
  'slow-and-calm': [10751, 14],
  'romantic': [10749],
  'dark-and-scary': [27, 53, 80],
  'family-time': [10751, 16, 12, 10770],
};

interface PoolConfig {
  cardType: 'bogart' | 'fincher' | 'cypher';
  moodKey: string;
  genres: number[];
  yearMin?: number;
  yearMax?: number;
  sortBy: string;
  minVotes?: number;
  maxPages: number;
}

async function fetchMoviesForPool(config: PoolConfig): Promise<number[]> {
  const { genres, yearMin, yearMax, sortBy, minVotes = 100, maxPages } = config;
  const genresQuery = genres.join(',');
  const allMovies: number[] = [];

  console.log(`Fetching movies for ${config.cardType} - ${config.moodKey}`);
  console.log(`Genres: ${genresQuery}, Years: ${yearMin || 'any'}-${yearMax || 'any'}`);

  try {
    for (let page = 1; page <= maxPages; page++) {
      let url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&sort_by=${sortBy}&vote_count.gte=${minVotes}&page=${page}`;

      if (yearMin) url += `&primary_release_date.gte=${yearMin}-01-01`;
      if (yearMax) url += `&primary_release_date.lte=${yearMax}-12-31`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error(`Error fetching page ${page}:`, response.status);
        continue;
      }

      const data = await response.json();
      const movies = data.results?.map((m: any) => m.id) || [];
      console.log(`Page ${page}: Got ${movies.length} movies`);
      allMovies.push(...movies);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    console.log(`Total movies for ${config.cardType} - ${config.moodKey}: ${allMovies.length}`);
    return allMovies;

  } catch (error) {
    console.error(`Error fetching movies:`, error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🎬 Starting pool population...');

    const moodKeys = Object.keys(MOOD_GENRE_MAPPING);
    const cardTypes = ['bogart', 'fincher', 'cypher'] as const;
    const currentYear = new Date().getFullYear();

    let totalPools = 0;
    let successPools = 0;

    for (const cardType of cardTypes) {
      for (const moodKey of moodKeys) {
        totalPools++;
        const genres = MOOD_GENRE_MAPPING[moodKey];

        let config: PoolConfig;

        if (cardType === 'bogart') {
          // BOGART: Modern & Popular (2000+)
          config = {
            cardType: 'bogart',
            moodKey,
            genres,
            yearMin: 2000,
            yearMax: currentYear,
            sortBy: 'popularity.desc',
            minVotes: 500,
            maxPages: 10
          };
        } else if (cardType === 'fincher') {
          // FINCHER: Classic & Cult (até 1999)
          config = {
            cardType: 'fincher',
            moodKey,
            genres,
            yearMax: 1999,
            sortBy: 'vote_average.desc',
            minVotes: 200,
            maxPages: 10
          };
        } else {
          // CYPHER: Underground Gems (todas as épocas, baixo vote_count)
          config = {
            cardType: 'cypher',
            moodKey,
            genres,
            sortBy: 'vote_average.desc',
            minVotes: 50,
            maxPages: 15
          };
        }

        const movieIds = await fetchMoviesForPool(config);

        if (movieIds.length > 0) {
          const { error } = await supabase
            .from('recommendation_pools')
            .upsert({
              card_type: cardType,
              mood_key: moodKey,
              movie_ids: movieIds,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'card_type,mood_key'
            });

          if (error) {
            console.error(`Error saving pool ${cardType}-${moodKey}:`, error);
          } else {
            successPools++;
            console.log(`✅ Saved pool ${cardType}-${moodKey} with ${movieIds.length} movies`);
          }
        } else {
          console.warn(`⚠️ No movies found for ${cardType}-${moodKey}`);
        }
      }
    }

    console.log(`🎉 Pool population complete: ${successPools}/${totalPools} pools created`);

    return new Response(
      JSON.stringify({
        success: true,
        totalPools,
        successPools,
        message: `Successfully populated ${successPools} pools out of ${totalPools}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});