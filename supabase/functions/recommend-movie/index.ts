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
  subcategoria: string | null;
}

async function fetchMoviePool(
  cardType: string,
  moodGenres: number[],
  libraryMovieIds: number[],
  profileData: ProfileData
): Promise<number[]> {
  const genresQuery = moodGenres.join(',');
  const allMovies: number[] = [];

  try {
    if (cardType === 'bogart') {
      const response = await fetch(
        `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&vote_average.gte=5.5&sort_by=popularity.desc&page=1`
      );
      const data = await response.json();
      allMovies.push(...(data.results?.map((m: any) => m.id) || []));
    } else if (cardType === 'fincher') {
      const pages = [1, 3, 7];
      for (const page of pages) {
        const response = await fetch(
          `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&sort_by=popularity.desc&page=${page}`
        );
        const data = await response.json();
        allMovies.push(...(data.results?.map((m: any) => m.id) || []));
      }
    } else if (cardType === 'cypher') {
      const pages = [1, 3, 7];
      for (const page of pages) {
        const response = await fetch(
          `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&with_genres=${genresQuery}&sort_by=popularity.desc&page=${page}`
        );
        const data = await response.json();
        allMovies.push(...(data.results?.map((m: any) => m.id) || []));
      }
    }

    const filteredMovies = allMovies.filter(id => !libraryMovieIds.includes(id));
    const shuffled = filteredMovies.sort(() => Math.random() - 0.5);
    const limit = cardType === 'bogart' ? 20 : cardType === 'fincher' ? 10 : 30;
    return shuffled.slice(0, limit);

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
      .select('arquetipo_primario, arquetipo_secundario, subcategoria')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`Error fetching profile: ${profileError.message}`);
    }

    const moviePool = await fetchMoviePool(cardType, moodGenres, libraryMovieIds, profileData);

    const systemPrompt = getRecommendSystemPrompt(mood, cardType, moviePool, language);

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