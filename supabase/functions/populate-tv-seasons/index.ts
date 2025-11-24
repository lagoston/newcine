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

    // Get TV shows without seasons_data
    const { data: tvShows, error: fetchError } = await supabase
      .from('movie_cache')
      .select('tmdb_id, title_en, number_of_seasons')
      .eq('media_type', 'tv')
      .is('seasons_data', null)
      .not('number_of_seasons', 'is', null)
      .gt('number_of_seasons', 0)
      .limit(5); // Process only 5 at a time to avoid rate limits

    if (fetchError) {
      console.error('Error fetching TV shows:', fetchError);
      throw new Error('Failed to fetch TV shows');
    }

    if (!tvShows || tvShows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'All TV shows have seasons data',
          updated: 0,
          total: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`Found ${tvShows.length} TV shows to update`);

    let updated = 0;
    let skipped = 0;

    for (const show of tvShows) {
      try {
        console.log(`Processing ${show.title_en} (${show.tmdb_id})...`);

        const seasons = [];

        // First, get TV show details to know actual number of seasons
        const tvDetailsResponse = await fetch(
          `${TMDB_BASE_URL}/tv/${show.tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
        );

        if (!tvDetailsResponse.ok) {
          console.warn(`Failed to fetch TV details for ${show.title_en}`);
          skipped++;
          continue;
        }

        const tvDetails = await tvDetailsResponse.json();
        const actualSeasons = tvDetails.seasons || [];

        // Fetch each season data (excluding specials - season 0)
        for (const seasonInfo of actualSeasons) {
          if (seasonInfo.season_number === 0) continue; // Skip specials

          try {
            const response = await fetch(
              `${TMDB_BASE_URL}/tv/${show.tmdb_id}/season/${seasonInfo.season_number}?api_key=${TMDB_API_KEY}&language=pt-BR`
            );

            if (!response.ok) {
              console.warn(`Failed to fetch season ${seasonInfo.season_number} for ${show.title_en}`);
              continue;
            }

            const seasonData = await response.json();

            seasons.push({
              season_number: seasonData.season_number,
              name: seasonData.name,
              episode_count: seasonData.episodes?.length || 0,
              air_date: seasonData.air_date,
              overview: seasonData.overview,
              poster_path: seasonData.poster_path,
              episodes: seasonData.episodes?.map((ep: any) => ({
                episode_number: ep.episode_number,
                name: ep.name,
                air_date: ep.air_date,
                runtime: ep.runtime,
                overview: ep.overview,
                vote_average: ep.vote_average
              })) || []
            });

            // Small delay between season requests
            await new Promise((resolve) => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Error fetching season ${seasonInfo.season_number}:`, error);
          }
        }

        if (seasons.length > 0) {
          // Update cache with seasons data
          const { error: updateError } = await supabase
            .from('movie_cache')
            .update({
              seasons_data: seasons,
              updated_at: new Date().toISOString()
            })
            .eq('tmdb_id', show.tmdb_id)
            .eq('media_type', 'tv');

          if (updateError) {
            console.error(`Error updating ${show.title_en}:`, updateError);
            skipped++;
          } else {
            console.log(`✅ Updated ${show.title_en} with ${seasons.length} seasons`);
            updated++;
          }
        } else {
          skipped++;
        }

        // Delay between shows to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error processing ${show.title_en}:`, error);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Season population completed',
        updated,
        skipped,
        total: tvShows.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in populate-tv-seasons:', error);
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
