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

const CHARACTER_PHRASES = {
  bogart: [
    "BOGART: Filmes v\u00eam, filmes v\u00e3o\u2026 mas este aqui grudou na minha mente como mosquito em l\u00edngua \u00famida.",
    "BOGART: Muitos buscam sentido nos filmes. Eu busco mosquitos. Ainda assim\u2026 veja este.",
    "BOGART: Anos vendo reflexos na \u00e1gua\u2026 e ainda assim este filme me fez ver o fundo do brejo.",
    "BOGART: Feche os olhos, respire o cheiro do lodo\u2026 se sentir vertigem, \u00e9 sinal que este \u00e9 o certo.",
    "BOGART: As massas aplaudem, os cr\u00edticos bufam\u2026 e eu? Eu coaxo em \u00eaxtase."
  ],
  fincher: [
    "FINCHER: Vi esse filme tr\u00eas vezes\u2026 na quarta, percebi que era eu quem estava sendo analisado.",
    "FINCHER: N\u00e3o confio em cr\u00edticos, mas confio no meu faro \u2014 e ele cheira a obra-prima.",
    "FINCHER: Filmes s\u00e3o m\u00e1gicos, e eu sou especialista em truques. Quer cair nesse tamb\u00e9m?",
    "FINCHER: Gravado quando o cinema ainda tinha alma \u2014 e atores que fumavam at\u00e9 nos cr\u00e9ditos.",
    "FINCHER: \u00c9 o tipo de filme que envelhece como um crime perfeito."
  ],
  cypher: [
    "CYPHER: Ah\u2026 esse aqui fede a genialidade mal executada. Meu veneno favorito.",
    "CYPHER: Metade vai odiar, metade vai fingir que entendeu. E eu? Eu sorrio no escuro.",
    "CYPHER: Shhh\u2026 n\u00e3o lute contra o impulso. Deixe a curiosidade te apertar um pouco mais.",
    "CYPHER: Sente o frio subindo pela espinha? \u00c9 o enredo te enrolando, bem devagar.",
    "CYPHER: Proibido, tosco, hipn\u00f3tico \u2014 uma heresia audiovisual que sussurra: \u2018assista-me, se ousar.\u2019"
  ]
};

const UNAVAILABLE_PHRASES = {
  bogart: "BOGART: Hmm\u2026 o p\u00e2ntano hoje est\u00e1 silencioso. Nenhuma hist\u00f3ria borbulha na lama. Tente outro humor, quem sabe o reflexo muda.",
  fincher: "FINCHER: Nada digno da minha recomenda\u00e7\u00e3o agora. Volte com outro humor... talvez eu pense em algo.",
  cypher: "CYPHER: Shhh\u2026 at\u00e9 o subsolo dorme \u00e0s vezes. Nenhum filme rasteja para mim hoje. Mude o humor\u2026 e talvez eu volte a sussurrar."
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

    console.log(`\ud83c\udfac Recommend movie request: user=${userId}, mood=${mood}, card=${cardType}`);

    await supabase.rpc('check_and_reset_tickets', { user_id_param: userId });

    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('tickets_remaining')
      .eq('user_id', userId)
      .maybeSingle();

    if (ticketError) {
      throw new Error(`Error fetching tickets: ${ticketError.message}`);
    }

    if (!ticketData || ticketData.tickets_remaining < 1) {
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

    const { data: ratedMovies, error: ratingsError } = await supabase
      .from('user_movies')
      .select('movie_id')
      .eq('user_id', userId);

    if (ratingsError) {
      throw new Error(`Error fetching ratings: ${ratingsError.message}`);
    }

    const ratedMovieIds = ratedMovies?.map(r => r.movie_id) || [];

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
      console.log(`\u26a0\ufe0f No pool found for ${cardType}/${moodKey}`);

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

    const poolMovies = poolData.movie_ids || [];
    const availableMovies = poolMovies.filter(
      (movieId: number) => !ratedMovieIds.includes(movieId)
    );

    console.log(`\u2705 Available movies: ${availableMovies.length}`);

    if (availableMovies.length === 0) {
      console.log('\u26a0\ufe0f No available movies in pool');

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

    const { error: updateError } = await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 1 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    await supabase.rpc('increment_oracle_recommendations', { p_user_id: userId });

    const randomIndex = Math.floor(Math.random() * availableMovies.length);
    const selectedMovieId = availableMovies[randomIndex];

    console.log(`\ud83c\udfaf Selected movie ID: ${selectedMovieId}`);

    const languageParam = language ? `language=${language}&` : '';
    const tmdbUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=/movie/${selectedMovieId}?${languageParam}append_to_response=credits`;
    console.log(`\ud83d\udce1 Fetching from: ${tmdbUrl}`);
    const tmdbResponse = await fetch(tmdbUrl, {
      headers: {
        'Authorization': req.headers.get('Authorization') || '',
      }
    });

    if (!tmdbResponse.ok) {
      throw new Error('Failed to fetch movie details from TMDB');
    }

    const movieData = await tmdbResponse.json();

    console.log(`\u2705 Movie data received:`, {
      title: movieData.title,
      hasCredits: !!movieData.credits,
      hasCrew: !!movieData.credits?.crew,
      crewLength: movieData.credits?.crew?.length
    });

    const characterPhrase = getRandomPhrase(cardType);

    return new Response(
      JSON.stringify({
        movieId: selectedMovieId,
        movieData: movieData,
        characterPhrase: characterPhrase,
        mood: mood,
        ticketsRemaining: ticketData.tickets_remaining - 1
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('\u274c Error in recommend-movie:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
