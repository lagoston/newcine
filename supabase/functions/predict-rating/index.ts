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

    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    console.log('Starting prediction request for user:', userId);
    console.log('Movie name:', movieName);
    console.log('Has DeepSeek API key:', !!deepseekApiKey);

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

    const systemPrompt = `You are CineOracle, an AI movie critic with deep pattern recognition. Analyze the user's 100-film rating history to predict their score for a new film.

# User Profile
@${profile.username}
Top genres: ${favoriteGenres.join(', ')}

# Rating History (100 films)
${JSON.stringify(userHistory, null, 2)}

# Analysis Framework

📊 **Predicted Rating: X/10 (±Y)**
- Provide your most accurate prediction (X) with uncertainty margin (Y, max 1.5)
- Base prediction on: genre preferences, director patterns, rating distribution, thematic consistency

🧠 **Core Analysis (2-3 sentences)**
Identify the user's taste profile using concrete examples from their history:
- Genre/director preferences with specific titles they rated high/low
- Patterns in themes, tone, or style (e.g., "favors cerebral sci-fi over action blockbusters")
- Any notable rating tendencies (harsh critic, generous scorer, specific deal-breakers)

⚖️ **Rating Modifiers**
List 2-3 specific factors that could shift the score:
+ Positive: What elements would boost their rating
- Negative: What aspects would lower their score

🎬 **Comparative Anchor (if applicable)**
Reference 1-2 similar films from their history with ratings to calibrate prediction.
Example: "Similar to *Blade Runner 2049* (8/10) but more action-heavy like *Mad Max* (6/10)"

🍿 **Better Alternative**
Suggest ONE film matching the same mood/genre they'd likely rate higher, with brief reasoning.

🎭 **Oracle's Verdict**
Close with a sharp, memorable one-liner. No summary—just dramatic flair.`;

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
            { role: 'user', content: `Based on the user's rating history, predict their rating for "${movieName}".` }
          ],
          temperature: 0.7,
          max_tokens: 600
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

    const prediction = data.choices?.[0]?.message?.content;

    if (!prediction) {
      console.error('No prediction in response:', JSON.stringify(data));
      throw new Error('Unable to generate prediction from DeepSeek');
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