import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

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

    // Get all cached movies that need updating (missing origin_country, popularity, or director for TV shows)
    const { data: cachedMovies, error: fetchError } = await supabase
      .from('movie_cache')
      .select('tmdb_id, media_type, origin_country, popularity, director')
      .or('origin_country.is.null,popularity.is.null,and(media_type.eq.tv,director.is.null)');

    if (fetchError) {
      console.error('Error fetching cached movies:', fetchError);
      throw new Error('Failed to fetch cached movies');
    }

    if (!cachedMovies || cachedMovies.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'All movies have complete data',
          updated: 0,
          total: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${cachedMovies.length} movies to update`);

    let updated = 0;
    let skipped = 0;
    const batchSize = 10;

    // Process in batches to avoid rate limits
    for (let i = 0; i < cachedMovies.length; i += batchSize) {
      const batch = cachedMovies.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (movie: any) => {
          try {
            const endpoint = movie.media_type === 'tv' ? 'tv' : 'movie';

            // Fetch both EN and PT data with credits
            const [enResponse, ptResponse] = await Promise.all([
              fetch(`${TMDB_BASE_URL}/${endpoint}/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits`),
              fetch(`${TMDB_BASE_URL}/${endpoint}/${movie.tmdb_id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=credits`)
            ]);

            if (!enResponse.ok || !ptResponse.ok) {
              console.warn(`Failed to fetch ${movie.media_type} ${movie.tmdb_id}`);
              skipped++;
              return;
            }

            const [enData, ptData] = await Promise.all([
              enResponse.json(),
              ptResponse.json()
            ]);

            // Calculate runtime for TV shows
            let totalRuntime = enData.runtime;
            let episodeRuntime = null;
            let totalEpisodes = null;

            if (movie.media_type === 'tv') {
              totalEpisodes = enData.number_of_episodes || 0;
              if (enData.episode_run_time && enData.episode_run_time.length > 0) {
                episodeRuntime = Math.round(
                  enData.episode_run_time.reduce((a: number, b: number) => a + b, 0) / enData.episode_run_time.length
                );
                totalRuntime = totalEpisodes * episodeRuntime;
              }
            }

            // Get director/creator
            let director;
            if (movie.media_type === 'tv') {
              director = enData.created_by && enData.created_by.length > 0
                ? enData.created_by[0].name
                : null;
            } else {
              director = enData.credits?.crew?.find((person: any) => person.job === 'Director')?.name;
            }

            // Prepare update data
            const updateData: any = {
              popularity: enData.popularity,
              origin_country: enData.origin_country || enData.production_countries?.map((c: any) => c.iso_3166_1) || [],
              runtime: totalRuntime,
              director: director,
              updated_at: new Date().toISOString()
            };

            // Add TV-specific fields
            if (movie.media_type === 'tv') {
              updateData.number_of_episodes = totalEpisodes;
              updateData.episode_run_time = episodeRuntime;
            }

            // Update cache
            const { error: updateError } = await supabase
              .from('movie_cache')
              .update(updateData)
              .eq('tmdb_id', movie.tmdb_id)
              .eq('media_type', movie.media_type);

            if (updateError) {
              console.error(`Error updating ${movie.media_type} ${movie.tmdb_id}:`, updateError);
              skipped++;
            } else {
              console.log(`✅ Updated ${movie.media_type} ${movie.tmdb_id}`);
              updated++;
            }
          } catch (error) {
            console.error(`Error processing ${movie.media_type} ${movie.tmdb_id}:`, error);
            skipped++;
          }
        })
      );

      // Small delay between batches to respect rate limits
      if (i + batchSize < cachedMovies.length) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cache repopulation completed',
        updated,
        skipped,
        total: cachedMovies.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in repopulate-movie-cache:', error);
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
