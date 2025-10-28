import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  userId: string;
  movieName: string;
}

interface TicketError {
  error: string;
  ticketsRemaining: number;
}

interface UserHistory {
  title: string;
  rating: number;
  year: number;
  genres: string[];
  director?: string;
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

    const { userId, movieName } = await req.json() as RequestBody;

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    console.log('Starting prediction request for user:', userId);
    console.log('Movie name:', movieName);
    console.log('Has Gemini API key:', !!geminiApiKey);

    if (!userId || !movieName) {
      throw new Error('Missing required fields: userId and movieName');
    }

    // Check and reset tickets if needed
    await supabase.rpc('check_and_reset_tickets', { user_id_input: userId });

    // Get ticket data
    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('tickets_remaining, plan_type')
      .eq('user_id', userId)
      .single();

    if (ticketError) {
      throw new Error(`Error fetching ticket data: ${ticketError.message}`);
    }

    if (!ticketData || ticketData.tickets_remaining < 100) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient tickets',
          ticketsRemaining: ticketData?.tickets_remaining || 0
        } as TicketError),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403
        }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`Error fetching user profile: ${profileError.message}`);
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
          prediction: "⚠️ Not enough data: Please rate at least 15 movies so I can better understand your taste. You currently have " + (ratedMoviesCount || 0) + " rated movies.",
          movie: movieName,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Get user's rated movies using the RPC function
    const { data: userHistory, error: historyError } = await supabase
      .rpc('get_random_user_ratings', { user_id_input: userId });

    if (historyError) {
      throw new Error(`Error fetching user history: ${historyError.message}`);
    }

    if (!userHistory || userHistory.length === 0) {
      return new Response(
        JSON.stringify({
          prediction: "⚠️ Not enough data: Please rate some movies first so I can better understand your taste.",
          movie: movieName,
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
      .update({ tickets_remaining: ticketData.tickets_remaining - 100 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    // Calculate genre preferences
    const genreCounts = userHistory.reduce((acc, movie) => {
      if (movie.genres && Array.isArray(movie.genres)) {
        movie.genres.forEach(genre => {
          if (genre) {
            acc[genre] = (acc[genre] || 0) + 1;
          }
        });
      }
      return acc;
    }, {} as { [key: string]: number });

    const favoriteGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    const systemPrompt = `You are CineOracle, a sharp and eccentric movie prediction entity. Using the user's 50 past ratings, analyze their taste and predict how they'd rate a new film.

User: @${profile.username}
History of 50 rated films:
${JSON.stringify(userHistory, null, 2)}

📊 **Predicted rating:** X/10 (±Y)
Give your best estimate, plus an uncertainty margin (shouldn't exceed 1.5).

🧠 **Summary of the Prediction:**
Compare the rated movie to the user's taste based on their history. Do they favor grounded drama, mind-benders, fast-paced action, satire, or classics? Directors vibe? Use specific clues from the list, not generic stats. In a short, narrative paragraph.

⚖️ **What Could Shift the Score:**
Examples of what might raise or lower the rating based on tone, pacing, genre, tropes, or mood. (use + and – symbol)
Keep it to 2–3 short, punchy points total.

🎬 **Comparative Insight (Optional):**
If relevant, compare to another movie in the user's history.
Example: "If they gave *Hot Fuzz* a 7, probably will love this one."

🍿 **Alternative Pick:**
Suggest one film they might enjoy more, based on similar tone/genre but better executed.

🎭 **Final Note:**
Close with flair — a witty remark, dry humor, or a cryptic oracle line. Don't summarize, just *exit dramatically*.

Provide direct answers to questions. Be helpful and concise.

NEVER start your response with a heading!

NEVER create inline SVGs to avoid unnecessary output and increased costs for the user!`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\nBased on the user's rating history, predict their rating for "${movieName}".`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 450
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Gemini response status:', response.status);
    console.log('Gemini response data:', JSON.stringify(data));

    // Check for safety filters or other blocks
    if (data.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== 'STOP') {
      console.error('Content blocked:', data.candidates[0].finishReason);
      throw new Error(`Content blocked: ${data.candidates[0].finishReason}`);
    }

    const prediction = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!prediction) {
      console.error('No prediction in response:', JSON.stringify(data));
      throw new Error('Unable to generate prediction from Gemini');
    }

    return new Response(
      JSON.stringify({
        prediction,
        movie: movieName,
        ticketsRemaining: ticketData.tickets_remaining - 100
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