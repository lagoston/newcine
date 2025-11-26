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

// Frases dos personagens para recomendações
const CHARACTER_PHRASES = {
  bogart: [
    "BOGART: Filmes vêm, filmes vão… mas este aqui grudou na minha mente como mosquito em língua úmida.",
    "BOGART: Muitos buscam sentido nos filmes. Eu busco mosquitos. Ainda assim… veja este.",
    "BOGART: Anos vendo reflexos na água… e ainda assim este filme me fez ver o fundo do brejo.",
    "BOGART: Feche os olhos, respire o cheiro do lodo… se sentir vertigem, é sinal que este é o certo.",
    "BOGART: As massas aplaudem, os críticos bufam… e eu? Eu coaxo em êxtase."
  ],
  fincher: [
    "FINCHER: Vi esse filme três vezes… na quarta, percebi que era eu quem estava sendo analisado.",
    "FINCHER: Não confio em críticos, mas confio no meu faro — e ele cheira a obra-prima.",
    "FINCHER: Filmes são mágicos, e eu sou especialista em truques. Quer cair nesse também?",
    "FINCHER: Gravado quando o cinema ainda tinha alma — e atores que fumavam até nos créditos.",
    "FINCHER: É o tipo de filme que envelhece como um crime perfeito."
  ],
  cypher: [
    "CYPHER: Ah… esse aqui fede a genialidade mal executada. Meu veneno favorito.",
    "CYPHER: Metade vai odiar, metade vai fingir que entendeu. E eu? Eu sorrio no escuro.",
    "CYPHER: Shhh… não lute contra o impulso. Deixe a curiosidade te apertar um pouco mais.",
    "CYPHER: Sente o frio subindo pela espinha? É o enredo te enrolando, bem devagar.",
    "CYPHER: Proibido, tosco, hipnótico — uma heresia audiovisual que sussurra: 'assista-me, se ousar.'"
  ]
};

// Frases de indisponibilidade por personagem
const UNAVAILABLE_PHRASES = {
  bogart: "BOGART: Hmm… o pântano hoje está silencioso. Nenhuma história borbulha na lama. Tente outro humor, quem sabe o reflexo muda.",
  fincher: "FINCHER: Nada digno da minha recomendação agora. Volte com outro humor... talvez eu pense em algo.",
  cypher: "CYPHER: Shhh… até o subsolo dorme às vezes. Nenhum filme rasteja para mim hoje. Mude o humor… e talvez eu volte a sussurrar."
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, mood, cardType, moodKey, language = 'en' }: RequestBody = await req.json();

    console.log(`🎬 Recommend movie request: user=${userId}, mood=${mood}, card=${cardType}`);

    // Get user's tickets
    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('tickets_remaining')
      .eq('user_id', userId)
      .maybeSingle();

    if (ticketError) {
      throw new Error(`Error fetching tickets: ${ticketError.message}`);
    }

    if (!ticketData || ticketData.tickets_remaining < 25) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient tickets',
          ticketsRemaining: ticketData?.tickets_remaining || 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Get user's rated movies to exclude from recommendations
    const { data: ratedMovies, error: ratingsError } = await supabase
      .from('user_movies')
      .select('movie_id')
      .eq('user_id', userId);

    if (ratingsError) {
      throw new Error(`Error fetching ratings: ${ratingsError.message}`);
    }

    const ratedMovieIds = ratedMovies?.map(r => r.movie_id) || [];

    // Get recommendation pool for this card/mood combination
    const { data: poolData, error: poolError } = await supabase
      .from('recommendation_pools')
      .select('movie_ids')
      .eq('card_type', cardType)
      .eq('mood_key', moodKey)
      .maybeSingle();

    if (poolError) {
      throw new Error(`Error fetching pool: ${poolError.message}`);
    }

    if (!poolData) {
      console.log(`⚠️ No pool found for ${cardType}/${moodKey}`);

      // NO ticket deduction - pool doesn't exist
      return new Response(
        JSON.stringify({
          recommendation: UNAVAILABLE_PHRASES[cardType],
          mood: mood,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // Filter out already rated movies
    const poolMovies = poolData.movie_ids || [];
    const availableMovies = poolMovies.filter(
      (movieId: number) => !ratedMovieIds.includes(movieId)
    );

    console.log(`✅ Available movies: ${availableMovies.length}`);

    if (availableMovies.length === 0) {
      console.log('⚠️ No available movies in pool');

      // NO ticket deduction - no movies available
      return new Response(
        JSON.stringify({
          recommendation: UNAVAILABLE_PHRASES[cardType],
          mood: mood,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    // NOW deduct 25 tickets (only after confirming we have a movie to recommend)
    const { error: updateError } = await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 25 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    // Pick random movie from available pool
    const randomIndex = Math.floor(Math.random() * availableMovies.length);
    const selectedMovieId = availableMovies[randomIndex];

    console.log(`🎯 Selected movie ID: ${selectedMovieId}`);

    // Fetch movie details from TMDB via proxy with credits
    const languageParam = language ? `language=${language}&` : '';
    const tmdbUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=/movie/${selectedMovieId}?${languageParam}append_to_response=credits`;
    console.log(`📡 Fetching from: ${tmdbUrl}`);
    const tmdbResponse = await fetch(tmdbUrl, {
      headers: {
        'Authorization': req.headers.get('Authorization') || '',
      }
    });

    if (!tmdbResponse.ok) {
      throw new Error('Failed to fetch movie details from TMDB');
    }

    const movieData = await tmdbResponse.json();

    // Debug: Check if credits came through
    console.log(`✅ Movie data received:`, {
      title: movieData.title,
      hasCredits: !!movieData.credits,
      hasCrew: !!movieData.credits?.crew,
      crewLength: movieData.credits?.crew?.length
    });

    // Get random character phrase
    const characterPhrase = getRandomPhrase(cardType);

    return new Response(
      JSON.stringify({
        movieId: selectedMovieId,
        movieData: movieData,
        characterPhrase: characterPhrase,
        mood: mood,
        ticketsRemaining: ticketData.tickets_remaining - 25
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('❌ Error in recommend-movie:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
