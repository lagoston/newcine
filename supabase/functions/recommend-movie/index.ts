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

const CHARACTER_PHRASES_PT = {
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

const CHARACTER_PHRASES_EN = {
  bogart: [
    "BOGART: Films come, films go… but this one stuck to my mind like a mosquito on a wet tongue.",
    "BOGART: Many seek meaning in films. I seek mosquitoes. Even so… watch this one.",
    "BOGART: Years staring at reflections in the water… and still, this film made me see the bottom of the swamp.",
    "BOGART: Close your eyes, breathe in the smell of mud… if you feel dizzy, that's the sign this one's right.",
    "BOGART: The masses applaud, the critics scoff… and me? I croak in ecstasy."
  ],
  fincher: [
    "FINCHER: I watched this film three times… on the fourth, I realized it was me being analyzed.",
    "FINCHER: I don't trust critics, but I trust my instincts — and they smell a masterpiece.",
    "FINCHER: Films are magic, and I'm an expert in tricks. Care to fall for this one too?",
    "FINCHER: Filmed when cinema still had a soul — and actors who smoked through the credits.",
    "FINCHER: It's the kind of film that ages like a perfect crime."
  ],
  cypher: [
    "CYPHER: Ah… this one reeks of poorly executed genius. My favorite poison.",
    "CYPHER: Half will hate it, half will pretend they understood it. And me? I smile in the dark.",
    "CYPHER: Shhh… don't fight the impulse. Let curiosity squeeze you a little tighter.",
    "CYPHER: Feel the cold creeping up your spine? That's the plot wrapping around you, nice and slow.",
    "CYPHER: Forbidden, raw, hypnotic — an audiovisual heresy that whispers: 'watch me, if you dare.'"
  ]
};

const UNAVAILABLE_PHRASES_PT = {
  bogart: "BOGART: Hmm… o pântano hoje está silencioso. Nenhuma história borbulha na lama. Tente outro humor, quem sabe o reflexo muda.",
  fincher: "FINCHER: Nada digno da minha recomendação agora. Volte com outro humor... talvez eu pense em algo.",
  cypher: "CYPHER: Shhh… até o subsolo dorme às vezes. Nenhum filme rasteja para mim hoje. Mude o humor… e talvez eu volte a sussurrar."
};

const UNAVAILABLE_PHRASES_EN = {
  bogart: "BOGART: Hmm… the swamp is quiet today. No story bubbles up from the mud. Try another mood — maybe the reflection will change.",
  fincher: "FINCHER: Nothing worthy of my recommendation right now. Come back with a different mood... perhaps something will come to mind.",
  cypher: "CYPHER: Shhh… even the underground sleeps sometimes. No film crawls to me today. Change the mood… and maybe I'll start whispering again."
};

function getRandomPhrase(cardType: 'bogart' | 'fincher' | 'cypher', language: string): string {
  const isPortuguese = language.startsWith('pt');
  const phrases = isPortuguese ? CHARACTER_PHRASES_PT[cardType] : CHARACTER_PHRASES_EN[cardType];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function getUnavailablePhrase(cardType: 'bogart' | 'fincher' | 'cypher', language: string): string {
  const isPortuguese = language.startsWith('pt');
  return isPortuguese ? UNAVAILABLE_PHRASES_PT[cardType] : UNAVAILABLE_PHRASES_EN[cardType];
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

    console.log(`🎬 Recommend movie request: user=${userId}, mood=${mood}, card=${cardType}, lang=${language}`);

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
      console.log(`⚠️ No pool found for ${cardType}/${moodKey}`);

      return new Response(
        JSON.stringify({
          recommendation: getUnavailablePhrase(cardType, language),
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

    console.log(`✅ Available movies: ${availableMovies.length}`);

    if (availableMovies.length === 0) {
      console.log('⚠️ No available movies in pool');

      return new Response(
        JSON.stringify({
          recommendation: getUnavailablePhrase(cardType, language),
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

    console.log(`🎯 Selected movie ID: ${selectedMovieId}`);

    const tmdbLang = language.startsWith('pt') ? 'pt-BR' : 'en-US';
    const tmdbUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=/movie/${selectedMovieId}?language=${tmdbLang}&append_to_response=credits`;
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

    console.log(`✅ Movie data received:`, {
      title: movieData.title,
      hasCredits: !!movieData.credits,
      hasCrew: !!movieData.credits?.crew,
      crewLength: movieData.credits?.crew?.length
    });

    const characterPhrase = getRandomPhrase(cardType, language);

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
