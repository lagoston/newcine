import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  userId: string;
  mood: string;
  libraryMovieIds: number[];
  moviePool: number[];
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

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    const { userId, mood, libraryMovieIds, moviePool } = await req.json() as RequestBody;

    if (!userId || !mood) {
      throw new Error('Missing required fields: userId and mood');
    }

    // Check and reset tickets if needed
    await supabase.rpc('check_and_reset_tickets', { user_id_input: userId });

    // Get ticket data
    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('tickets_remaining')
      .eq('user_id', userId)
      .single();

    if (ticketError) {
      throw new Error(`Error fetching ticket data: ${ticketError.message}`);
    }

    if (!ticketData || ticketData.tickets_remaining < 50) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient tickets',
          ticketsRemaining: ticketData?.tickets_remaining || 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        }
      );
    }

    // Check if user has at least 15 rated movies
    const { count: ratedMoviesCount, error: countError } = await supabase
      .from('user_movies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('rating', 'is', null);

    if (countError) {
      throw new Error(`Error checking rated movies: ${countError.message}`);
    }

    if (!ratedMoviesCount || ratedMoviesCount < 15) {
      return new Response(
        JSON.stringify({
          recommendation: "⚠️ Not enough data: Please rate at least 15 movies so I can better understand your taste. You currently have " + (ratedMoviesCount || 0) + " rated movies.",
          mood: mood,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Consume tickets
    const { error: updateError } = await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 50 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    const systemPrompt = `You are the CineOracle recommendation engine.

Important: You can ONLY suggest movies from the following pool of IDs: ${JSON.stringify(moviePool)}.
Do NOT suggest any movies from this list: ${JSON.stringify(libraryMovieIds)}.

The user has chosen the mood: "${mood}".

Task:
1. Pick **one** movie from the allowed pool that best fits this mood.
2. Respond **briefly**:  
   - **Title** (and year)  
   - **One-sentence rationale** why it matches "${mood}".  
   - **No extra commentary** or lists.

Example output:
"Inception (2010): Its mind-bending concept and suspenseful set-pieces deliver a perfect 'Mind-Blowing' experience."

Provide direct answers to questions. Be helpful and concise.

NEVER start your response with a heading!

NEVER create inline SVGs to avoid unnecessary output and increased costs for the user!`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nBased on the mood "${mood}", recommend a movie from the allowed pool.`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150
          }
        })
      }
    );

    const data = await response.json();
    const recommendation = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate recommendation';

    return new Response(
      JSON.stringify({
        recommendation,
        mood,
        ticketsRemaining: ticketData.tickets_remaining - 50
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