import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface MovieGenre {
  id: number;
  name: string;
}

interface TMDBMovieDetails {
  id: number;
  genres: MovieGenre[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all unique movie IDs that don't have genres cached
    const { data: uncachedMovies, error: fetchError } = await supabase.rpc(
      'get_uncached_movie_ids'
    );

    if (fetchError) {
      console.error('Error fetching uncached movies:', fetchError);
      throw new Error('Failed to fetch uncached movies');
    }

    if (!uncachedMovies || uncachedMovies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'All movies already have genres cached',
          cached: 0,
          skipped: 0,
          total: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${uncachedMovies.length} movies without cached genres`);

    let cached = 0;
    let skipped = 0;
    const batchSize = 10;

    // Process in batches to avoid rate limits
    for (let i = 0; i < uncachedMovies.length; i += batchSize) {
      const batch = uncachedMovies.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (movieId: number) => {
          try {
            // Fetch movie details from TMDB
            const response = await fetch(
              `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}`
            );

            if (!response.ok) {
              console.warn(`Failed to fetch movie ${movieId}: ${response.status}`);
              skipped++;
              return;
            }

            const movieData: TMDBMovieDetails = await response.json();
            const genreNames = movieData.genres.map((g) => g.name);

            // Cache the genres
            const { error: cacheError } = await supabase.rpc('cache_movie_genres', {
              p_movie_id: movieId,
              p_genres: JSON.stringify(genreNames),
            });

            if (cacheError) {
              console.error(`Error caching genres for movie ${movieId}:`, cacheError);
              skipped++;
            } else {
              cached++;
            }
          } catch (error) {
            console.error(`Error processing movie ${movieId}:`, error);
            skipped++;
          }
        })
      );

      // Small delay between batches to respect rate limits
      if (i + batchSize < uncachedMovies.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Genre caching completed',
        cached,
        skipped,
        total: uncachedMovies.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in populate-genres-cache:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});