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

    const { userId, mood, libraryMovieIds, moviePool } = await req.json() as RequestBody;

    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    console.log('Starting recommendation request for user:', userId);
    console.log('Mood:', mood);
    console.log('Has DeepSeek API key:', !!deepseekApiKey);

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

    const systemPrompt = `You are CineOracle's recommendation engine. Your task is to find the PERFECT film match for the user's current mood.

# Constraints
✓ ONLY pick from these movie IDs: ${JSON.stringify(moviePool)}
✗ NEVER suggest these (user already has them): ${JSON.stringify(libraryMovieIds)}

# Target Mood
"${mood}"

# Instructions
1. Analyze the mood deeply—what emotions, themes, pacing, or tones does it imply?
2. Select ONE film from the allowed pool that best captures this mood
3. Format your response EXACTLY as:
   **[Title] ([Year])**: [One compelling sentence explaining why it perfectly matches "${mood}"]

# Examples
- **Blade Runner 2049 (2017)**: Its slow-burn existential questions and stunning visuals deliver the perfect 'Contemplative' atmosphere.
- **Mad Max: Fury Road (2015)**: Non-stop kinetic action and visceral intensity make it ideal for an 'Adrenaline Rush'.
- **Moonlight (2016)**: Its intimate character study and emotional depth resonate with 'Melancholic' introspection.

Be precise, insightful, and confident in your choice.`;

    const response = await fetch(
      'https://api.deepseek.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekApiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Based on the mood "${mood}", recommend a movie from the allowed pool.` }
          ],
          temperature: 0.8,
          max_tokens: 200
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API error:', errorData);
      throw new Error(`DeepSeek API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('DeepSeek response status:', response.status);
    console.log('DeepSeek response data:', JSON.stringify(data));

    const recommendation = data.choices?.[0]?.message?.content;

    if (!recommendation) {
      console.error('No recommendation in response:', JSON.stringify(data));
      throw new Error('Unable to generate recommendation from DeepSeek');
    }

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