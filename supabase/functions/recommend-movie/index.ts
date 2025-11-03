import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  userId: string;
  mood: string;
  cardType: 'bogart' | 'fincher' | 'cypher';
  moodKey: string;
  language?: string;
}

// Frases dos personagens
const CHARACTER_PHRASES = {
  bogart: [
    "Filmes vêm, filmes vão… mas este aqui grudou na minha mente como mosquito em língua úmida.",
    "Muitos buscam sentido nos filmes. Eu busco mosquitos. Ainda assim… veja este.",
    "Anos vendo reflexos na água… e ainda assim este filme me fez ver o fundo do brejo.",
    "Feche os olhos, respire o cheiro do lodo… se sentir vertigem, é sinal que este é o certo.",
    "As massas aplaudem, os críticos bufam… e eu? Eu coaxo em êxtase."
  ],
  fincher: [
    "Vi esse filme três vezes… na quarta, percebi que era eu quem estava sendo analisado.",
    "Não confio em críticos, mas confio no meu faro — e ele cheira a obra-prima.",
    "Filmes são mágicos, e eu sou especialista em truques. Quer cair nesse também?",
    "Gravado quando o cinema ainda tinha alma — e atores que fumavam até nos créditos.",
    "É o tipo de filme que envelhece como um crime perfeito."
  ],
  cypher: [
    "Ah… esse aqui fede a genialidade mal executada. Meu veneno favorito.",
    "Metade vai odiar, metade vai fingir que entendeu. E eu? Eu sorrio no escuro.",
    "Shhh… não lute contra o impulso. Deixe a curiosidade te apertar um pouco mais.",
    "Sente o frio subindo pela espinha? É o enredo te enrolando, bem devagar.",
    "Proibido, tosco, hipnótico — uma heresia audiovisual que sussurra: 'assista-me, se ousar.'"
  ]
};

function getRandomPhrase(cardType: 'bogart' | 'fincher' | 'cypher'): string {
  const phrases = CHARACTER_PHRASES[cardType];
  return phrases[Math.floor(Math.random() * phrases.length)];
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

    const { userId, mood, cardType, moodKey, language = 'en' } = await req.json() as RequestBody;

    console.log('🎬 Starting recommendation request');
    console.log('User:', userId);
    console.log('Mood:', mood);
    console.log('Card Type:', cardType);
    console.log('Mood Key:', moodKey);

    if (!userId || !mood || !cardType || !moodKey) {
      throw new Error('Missing required fields');
    }

    // Check and reset tickets
    await supabase.rpc('check_and_reset_tickets', { user_id_input: userId });

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

    // Check if user has rated enough movies
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

    // Get available movies from pool
    console.log('📦 Fetching available movies from pool...');
    const { data: availableMoviesData, error: poolError } = await supabase
      .rpc('get_available_movies_for_recommendation', {
        p_user_id: userId,
        p_card_type: cardType,
        p_mood_key: moodKey
      });

    if (poolError) {
      console.error('Error fetching pool:', poolError);
      throw new Error(`Error fetching pool: ${poolError.message}`);
    }

    const availableMovies = availableMoviesData || [];
    console.log(`✅ Available movies: ${availableMovies.length}`);

    if (availableMovies.length === 0) {
      console.log('⚠️ No available movies in pool');

      // Refund tickets
      await supabase
        .from('user_tickets')
        .update({ tickets_remaining: ticketData.tickets_remaining })
        .eq('user_id', userId);

      return new Response(
        JSON.stringify({
          recommendation: "Desculpe, não tenho bons filmes para te recomendar no momento nessa categoria, tente novamente mais tarde.",
          mood: mood,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Pick random movie from available pool
    const randomIndex = Math.floor(Math.random() * availableMovies.length);
    const selectedMovieId = parseInt(availableMovies[randomIndex]);
    console.log(`🎯 Selected movie ID: ${selectedMovieId}`);

    // Deduct tickets
    await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 50 })
      .eq('user_id', userId);

    // Record recommendation
    await supabase.rpc('record_recommendation', {
      p_user_id: userId,
      p_movie_id: selectedMovieId,
      p_card_type: cardType,
      p_mood_key: moodKey
    });

    console.log('✅ Recommendation recorded');

    // Get random character phrase
    const characterPhrase = getRandomPhrase(cardType);

    // Format response
    const recommendation = `${characterPhrase}\n\n**Movie ID: ${selectedMovieId}**`;

    return new Response(
      JSON.stringify({
        recommendation,
        mood,
        movieId: selectedMovieId,
        ticketsRemaining: ticketData.tickets_remaining - 50,
        characterPhrase,
        debug: {
          cardType,
          moodKey,
          availableMoviesCount: availableMovies.length
        }
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