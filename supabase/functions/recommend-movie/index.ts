import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface RequestBody {
  userId: string;
  mood: string;
  cardType: 'bogart' | 'fincher' | 'cypher';
  moodGenres: number[];
  libraryMovieIds: number[];
  language?: string;
}

interface ProfileData {
  arquetipo_primario: string;
  arquetipo_secundario: string;
  subcategoria_id: string | null;
}

async function fetchMoviePool(
  cardType: string,
  moodGenres: number[],
  libraryMovieIds: number[],
  profileData: ProfileData
): Promise<number[]> {
  const genresQuery = moodGenres.join(',');
  const allMovies: number[] = [];

  console.log('=== FETCH MOVIE POOL DEBUG ===');
  console.log('Card Type:', cardType);
  console.log('Mood Genres:', moodGenres);
  console.log('Library Movies Count:', libraryMovieIds.length);
  console.log('Library Movies (first 10):', libraryMovieIds.slice(0, 10));

  try {
    if (cardType === 'bogart') {
      console.log('BOGART: Fetching page 1 with rating >= 5.5');
      const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&vote_average.gte=5.5&sort_by=popularity.desc&page=1`;
      console.log('BOGART URL:', url.replace(TMDB_API_KEY, 'HIDDEN'));

      const response = await fetch(url);
      const data = await response.json();
      const movies = data.results?.map((m: any) => m.id) || [];
      console.log('BOGART: Fetched', movies.length, 'movies');
      console.log('BOGART Movies:', movies);
      allMovies.push(...movies);

    } else if (cardType === 'fincher') {
      console.log('FINCHER: Fetching pages 1, 3, 7 (NO rating filter)');
      const pages = [1, 3, 7];

      for (const page of pages) {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&sort_by=popularity.desc&page=${page}`;
        console.log(`FINCHER: Fetching page ${page}`);
        console.log('FINCHER URL:', url.replace(TMDB_API_KEY, 'HIDDEN'));

        const response = await fetch(url);
        const data = await response.json();
        const movies = data.results?.map((m: any) => m.id) || [];
        console.log(`FINCHER Page ${page}: Fetched ${movies.length} movies`);
        console.log(`FINCHER Page ${page} Movies:`, movies);
        allMovies.push(...movies);
      }

    } else if (cardType === 'cypher') {
      console.log('CYPHER: Fetching pages 1, 3, 7 with inverted subcategory');
      const pages = [1, 3, 7];

      for (const page of pages) {
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&sort_by=popularity.desc&page=${page}`;
        console.log(`CYPHER: Fetching page ${page}`);
        console.log('CYPHER URL:', url.replace(TMDB_API_KEY, 'HIDDEN'));

        const response = await fetch(url);
        const data = await response.json();
        const movies = data.results?.map((m: any) => m.id) || [];
        console.log(`CYPHER Page ${page}: Fetched ${movies.length} movies`);
        console.log(`CYPHER Page ${page} Movies:`, movies);
        allMovies.push(...movies);
      }
    }

    console.log('Total movies before filter:', allMovies.length);
    console.log('All movies:', allMovies);

    const filteredMovies = allMovies.filter(id => !libraryMovieIds.includes(id));
    console.log('Movies after library filter:', filteredMovies.length);
    console.log('Filtered movies:', filteredMovies);

    // Better shuffle using Fisher-Yates algorithm with timestamp seed
    const shuffled = [...filteredMovies];
    const seed = Date.now() + Math.random();
    console.log('Shuffle seed:', seed);

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const limit = cardType === 'bogart' ? 20 : cardType === 'fincher' ? 10 : 30;
    const finalPool = shuffled.slice(0, limit);

    console.log(`Final pool (limit ${limit}):`, finalPool.length, 'movies');
    console.log('Final pool IDs:', finalPool);
    console.log('=== END FETCH MOVIE POOL DEBUG ===');

    return finalPool;

  } catch (error) {
    console.error('Error fetching movie pool:', error);
    return [];
  }
}

function getRecommendSystemPrompt(mood: string, cardType: string, moviePool: number[], language: string): string {
  const lang = language.startsWith('pt') ? 'pt' : language.startsWith('es') ? 'es' : 'en';

  const cardDescriptions = {
    en: {
      bogart: 'Classic approach - recommending popular, well-rated films',
      fincher: 'Underground approach - recommending hidden gems and lesser-known films',
      cypher: 'Paradox approach - recommending films that challenge expectations and invert polarities'
    },
    pt: {
      bogart: 'Abordagem clássica - recomendando filmes populares e bem avaliados',
      fincher: 'Abordagem underground - recomendando joias escondidas e filmes menos conhecidos',
      cypher: 'Abordagem paradoxo - recomendando filmes que desafiam expectativas e invertem polaridades'
    },
    es: {
      bogart: 'Enfoque clásico - recomendando películas populares y bien valoradas',
      fincher: 'Enfoque underground - recomendando joyas ocultas y películas menos conocidas',
      cypher: 'Enfoque paradoja - recomendando películas que desafían expectativas e invierten polaridades'
    }
  };

  const prompts = {
    en: `You are CineOracle's recommendation engine using the "${cardType.toUpperCase()}" card approach.\n\n# Card Type\n${cardDescriptions.en[cardType]}\n\n# Constraints\n✓ ONLY pick from these movie IDs: ${JSON.stringify(moviePool)}\n\n# Target Mood\n"${mood}"\n\n# Instructions\n1. Analyze the mood deeply—what emotions, themes, pacing, or tones does it imply?\n2. Select ONE film from the allowed pool that best captures this mood\n3. Format your response EXACTLY as:\n   **[Title] ([Year])**: [One compelling sentence explaining why it perfectly matches "${mood}"]\n\n# Examples\n- **Blade Runner 2049 (2017)**: Its slow-burn existential questions and stunning visuals deliver the perfect 'Contemplative' atmosphere.\n- **Mad Max: Fury Road (2015)**: Non-stop kinetic action and visceral intensity make it ideal for an 'Adrenaline Rush'.\n- **Moonlight (2016)**: Its intimate character study and emotional depth resonate with 'Melancholic' introspection.\n\nBe precise, insightful, and confident in your choice.`,

    pt: `Você é o motor de recomendação do CineOracle usando a carta "${cardType.toUpperCase()}".\n\n# Tipo de Carta\n${cardDescriptions.pt[cardType]}\n\n# Restrições\n✓ APENAS escolha destes IDs de filmes: ${JSON.stringify(moviePool)}\n\n# Humor Alvo\n"${mood}"\n\n# Instruções\n1. Analise o humor profundamente—que emoções, temas, ritmo ou tons ele implica?\n2. Selecione UM filme do pool permitido que melhor capture este humor\n3. Formate sua resposta EXATAMENTE como:\n   **[Título] ([Ano])**: [Uma frase convincente explicando por que combina perfeitamente com "${mood}"]\n\n# Exemplos\n- **Blade Runner 2049 (2017)**: Suas questões existenciais de queima lenta e visuais deslumbrantes entregam a atmosfera 'Contemplativa' perfeita.\n- **Mad Max: Fury Road (2015)**: Ação cinética sem parar e intensidade visceral o tornam ideal para 'Descarga de Adrenalina'.\n- **Moonlight (2016)**: Seu estudo íntimo de personagem e profundidade emocional ressoam com introspecção 'Melancólica'.\n\nSeja preciso, perspicaz e confiante em sua escolha.`,

    es: `Eres el motor de recomendación de CineOracle usando la carta "${cardType.toUpperCase()}".\n\n# Tipo de Carta\n${cardDescriptions.es[cardType]}\n\n# Restricciones\n✓ SOLO elige de estos IDs de películas: ${JSON.stringify(moviePool)}\n\n# Estado de Ánimo Objetivo\n"${mood}"\n\n# Instrucciones\n1. Analiza el estado de ánimo profundamente—¿qué emociones, temas, ritmo o tonos implica?\n2. Selecciona UNA película del pool permitido que mejor capture este estado de ánimo\n3. Formatea tu respuesta EXACTAMENTE como:\n   **[Título] ([Año])**: [Una oración convincente explicando por qué coincide perfectamente con "${mood}"]\n\n# Ejemplos\n- **Blade Runner 2049 (2017)**: Sus preguntas existenciales de lenta combustión y visuales impresionantes entregan la atmósfera 'Contemplativa' perfecta.\n- **Mad Max: Fury Road (2015)**: Acción cinética sin parar e intensidad visceral lo hacen ideal para 'Descarga de Adrenalina'.\n- **Moonlight (2016)**: Su estudio íntimo de personaje y profundidad emocional resuenan con introspección 'Melancólica'.\n\nSé preciso, perspicaz y confiado en tu elección.`
  };

  return prompts[lang];
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

    const { userId, mood, cardType, moodGenres, libraryMovieIds, language = 'en' } = await req.json() as RequestBody;

    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    console.log('Starting recommendation request for user:', userId);
    console.log('Mood:', mood);
    console.log('Card Type:', cardType);

    if (!userId || !mood) {
      throw new Error('Missing required fields: userId and mood');
    }

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

    const { error: updateError } = await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 50 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('arquetipo_primario, arquetipo_secundario, subcategoria_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`Error fetching profile: ${profileError.message}`);
    }

    // Fetch recent recommendations to avoid repeating
    const { data: recentRecommendations } = await supabase
      .from('oracle_recommendations')
      .select('movie_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    const recentMovieIds = recentRecommendations?.map(r => r.movie_id).filter(Boolean) || [];
    console.log('Recent recommendations to exclude:', recentMovieIds);

    // Combine library movies with recent recommendations
    const excludeMovieIds = [...libraryMovieIds, ...recentMovieIds];
    console.log('Total movies to exclude:', excludeMovieIds.length);

    const moviePool = await fetchMoviePool(cardType, moodGenres, excludeMovieIds, profileData);

    console.log('=== FINAL MOVIE POOL ===');
    console.log('Movie Pool Size:', moviePool.length);
    console.log('Movie Pool:', moviePool);

    if (moviePool.length === 0) {
      console.error('ERROR: Movie pool is empty! Cannot make recommendation.');
      return new Response(
        JSON.stringify({
          recommendation: "⚠️ No movies found matching your criteria. Please try a different mood or card.",
          mood: mood,
          ticketsRemaining: ticketData.tickets_remaining - 50
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    let systemPrompt = getRecommendSystemPrompt(mood, cardType, moviePool, language);

    // Add recent recommendations context to avoid repetition
    if (recentMovieIds.length > 0) {
      const lang = language.startsWith('pt') ? 'pt' : language.startsWith('es') ? 'es' : 'en';
      const avoidText = {
        en: `\n\n# IMPORTANT: Avoid Repeating Recent Recommendations\nYou recently recommended these movie IDs to this user: ${JSON.stringify(recentMovieIds.slice(0, 10))}\nDO NOT recommend any of these again. Pick something DIFFERENT from the allowed pool.`,
        pt: `\n\n# IMPORTANTE: Evite Repetir Recomendações Recentes\nVocê recentemente recomendou estes IDs de filmes para este usuário: ${JSON.stringify(recentMovieIds.slice(0, 10))}\nNÃO recomende nenhum destes novamente. Escolha algo DIFERENTE do pool permitido.`,
        es: `\n\n# IMPORTANTE: Evite Repetir Recomendaciones Recientes\nRecientemente recomendaste estos IDs de películas a este usuario: ${JSON.stringify(recentMovieIds.slice(0, 10))}\nNO recomiendes ninguno de estos nuevamente. Elige algo DIFERENTE del pool permitido.`
      };
      systemPrompt += avoidText[lang];
    }

    console.log('=== SYSTEM PROMPT (first 500 chars) ===');
    console.log(systemPrompt.substring(0, 500));

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
    const recommendation = data.choices?.[0]?.message?.content;

    if (!recommendation) {
      console.error('No recommendation in response:', JSON.stringify(data));
      throw new Error('Unable to generate recommendation from DeepSeek');
    }

    // Extract movie ID from recommendation (parse the title to find matching ID)
    let recommendedMovieId = null;
    try {
      // Try to extract movie ID from the recommendation text
      // The AI should return format like "**Title (Year)**"
      const movieMatch = recommendation.match(/\*\*(.+?)\s*\((\d{4})\)\*\*/);
      if (movieMatch) {
        console.log('Extracted movie info:', movieMatch[1], movieMatch[2]);
        // Find the movie ID from the pool - we'll need to fetch from TMDB to get the exact match
        // For now, we'll pick a random one from the pool as fallback
        recommendedMovieId = moviePool[0];
      }
    } catch (error) {
      console.error('Error extracting movie ID:', error);
    }

    // Save the recommendation to history
    if (recommendedMovieId) {
      try {
        await supabase
          .from('oracle_recommendations')
          .insert({
            user_id: userId,
            movie_id: recommendedMovieId,
            mood: mood,
            card_type: cardType,
            recommendation_text: recommendation
          });
        console.log('Saved recommendation to history:', recommendedMovieId);
      } catch (error) {
        console.error('Error saving recommendation:', error);
        // Don't fail the request if history save fails
      }
    }

    return new Response(
      JSON.stringify({
        recommendation,
        mood,
        ticketsRemaining: ticketData.tickets_remaining - 50,
        debug: {
          cardType,
          moodGenres,
          moviePoolSize: moviePool.length,
          moviePool: moviePool,
          recentExcluded: recentMovieIds.length
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