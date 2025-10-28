import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const apiKey = Deno.env.get('TMDB_API_KEY');
    if (!apiKey) {
      throw new Error('TMDB API key is not configured');
    }

    const response = await fetch(
      `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}`
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('TMDB API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      
      throw new Error(
        `TMDB API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Trending movies error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});