import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const TMDB_API_KEY = '15da7a1d15ba5e2490acbad2f7394947';
const BASE_URL = 'https://api.themoviedb.org/3';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build TMDB URL
    const tmdbUrl = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`;

    console.log('🎬 TMDB Proxy request:', endpoint);

    // Fetch from TMDB
    const tmdbResponse = await fetch(tmdbUrl);

    if (!tmdbResponse.ok) {
      console.error('❌ TMDB API error:', tmdbResponse.status, tmdbResponse.statusText);
      return new Response(
        JSON.stringify({ error: 'TMDB API error', status: tmdbResponse.status }),
        {
          status: tmdbResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await tmdbResponse.json();

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Proxy error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});