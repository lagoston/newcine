import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  userId: string;
  movieName: string;
  movieId?: number;
  language?: string;
}

interface TicketError {
  error: string;
  ticketsRemaining: number;
}

interface RelevantMovie {
  title: string;
  rating: number;
  matchType: string;
}

interface FishingResult {
  signals: RelevantMovie[];
  filters: RelevantMovie[];
}

async function getMovieDataFromTMDB(movieName: string): Promise<{ vote_average: number; id: number; director?: string; cast?: string[]; genres?: string[] } | null> {
  const tmdbApiKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbApiKey) {
    console.error('TMDB_API_KEY not found');
    return null;
  }

  try {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(movieName)}&language=en-US`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      console.log('Movie not found in TMDB:', movieName);
      return null;
    }

    const movie = searchData.results[0];
    const movieId = movie.id;

    const detailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${tmdbApiKey}&append_to_response=credits&language=en-US`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    const director = detailsData.credits?.crew?.find((person: any) => person.job === 'Director')?.name;
    const cast = detailsData.credits?.cast?.slice(0, 5).map((actor: any) => actor.name) || [];
    const genres = detailsData.genres?.map((g: any) => g.name) || [];

    return {
      vote_average: movie.vote_average || 0,
      id: movieId,
      director,
      cast,
      genres
    };
  } catch (error) {
    console.error('Error fetching TMDB data:', error);
    return null;
  }
}

async function fishForRelevantMovies(
  supabase: any,
  userId: string,
  targetMovieData: { director?: string; cast?: string[]; genres?: string[] }
): Promise<FishingResult> {
  const signals: RelevantMovie[] = [];
  const filters: RelevantMovie[] = [];

  try {
    const { data: userMovies, error } = await supabase
      .from('user_movies')
      .select(`
        rating,
        movies!inner (
          id,
          title,
          director,
          genres
        )
      `)
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .order('rating', { ascending: false });

    if (error || !userMovies) {
      console.error('Error fetching user movies:', error);
      return { signals, filters };
    }

    const addedMovies = new Set<string>();

    if (targetMovieData.director) {
      for (const movie of userMovies) {
        if (signals.length + filters.length >= 5) break;

        if (movie.movies.director === targetMovieData.director && !addedMovies.has(movie.movies.title)) {
          const entry: RelevantMovie = {
            title: movie.movies.title,
            rating: movie.rating,
            matchType: 'Director'
          };

          if (movie.rating >= 7.0) {
            signals.push(entry);
          } else if (movie.rating <= 6.0) {
            filters.push(entry);
          }
          addedMovies.add(movie.movies.title);
        }
      }
    }

    if (signals.length + filters.length < 5 && targetMovieData.cast && targetMovieData.cast.length > 0) {
      const castResponse = await supabase
        .from('user_movies')
        .select(`
          rating,
          movies!inner (
            id,
            title
          )
        `)
        .eq('user_id', userId)
        .not('rating', 'is', null);

      if (castResponse.data) {
        for (const movie of castResponse.data) {
          if (signals.length + filters.length >= 5) break;
          if (addedMovies.has(movie.movies.title)) continue;

          const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movie.movies.id}?api_key=${Deno.env.get('TMDB_API_KEY')}&append_to_response=credits`;
          const detailsResponse = await fetch(movieDetailsUrl);
          const detailsData = await detailsResponse.json();

          const movieCast = detailsData.credits?.cast?.slice(0, 5).map((actor: any) => actor.name) || [];
          const hasCommonActor = movieCast.some((actor: string) => targetMovieData.cast?.includes(actor));

          if (hasCommonActor) {
            const entry: RelevantMovie = {
              title: movie.movies.title,
              rating: movie.rating,
              matchType: 'Actor'
            };

            if (movie.rating >= 7.0) {
              signals.push(entry);
            } else if (movie.rating <= 6.0) {
              filters.push(entry);
            }
            addedMovies.add(movie.movies.title);
          }
        }
      }
    }

    if (signals.length + filters.length < 5 && targetMovieData.genres && targetMovieData.genres.length > 0) {
      const primaryGenre = targetMovieData.genres[0];

      for (const movie of userMovies) {
        if (signals.length + filters.length >= 5) break;
        if (addedMovies.has(movie.movies.title)) continue;

        if (movie.movies.genres && movie.movies.genres.includes(primaryGenre)) {
          const entry: RelevantMovie = {
            title: movie.movies.title,
            rating: movie.rating,
            matchType: 'Genre'
          };

          if (movie.rating >= 7.0) {
            signals.push(entry);
          } else if (movie.rating <= 6.0) {
            filters.push(entry);
          }
          addedMovies.add(movie.movies.title);
        }
      }
    }

  } catch (error) {
    console.error('Error in fishing logic:', error);
  }

  return { signals, filters };
}

function getHybridPrompt(
  archetypeName: string,
  archetypeCode: string,
  archetypeDescription: string,
  subcategoryDescription: string,
  movieName: string,
  movieAnchor: number,
  signals: RelevantMovie[],
  filters: RelevantMovie[],
  language: string
): string {
  const lang = language.startsWith('pt') ? 'pt' : language.startsWith('es') ? 'es' : 'en';

  const formatMatches = (matches: RelevantMovie[]): string => {
    if (matches.length === 0) return 'None';
    return matches.map(m => `"${m.title}" (${m.rating}/10) - Same ${m.matchType}`).join('\n');
  };

  const prompts = {
    en: `You are CineOracle. Your task is to predict a user's rating (0.0 to 10.0) for a target film using Weighted Bayesian Analysis.

# MANDATORY METHODOLOGY (DO NOT BREAK THESE RULES)
1. **ANCHOR:** Your analysis MUST start with the "Public Average Rating". This is your baseline.
2. **ADJUSTMENT:** Adjust the Anchor up or down based on relevant films from their history (loved vs. disliked).
3. **LENS:** Use the "Personality Profile" as the primary lens to justify your analysis.
4. **FINAL SCORE:** Provide a specific rating (e.g., 8.5/10). **NEVER** use ranges (e.g., "±1.0"). Be confident.
5. **NATURAL LANGUAGE:** Write as if analyzing a real person. Avoid technical jargon or methodology terms. Be conversational and insightful.

# PREDICTION DATA

## 1. THE USER (The Lens)
* **Profile:** ${archetypeName} (${archetypeCode})
* **Archetype Core:** "${archetypeDescription}"
* **Subcategory Nuance:** "${subcategoryDescription}"

## 2. THE TARGET FILM
* **Film:** ${movieName}
* **Anchor (Public Average):** ${movieAnchor.toFixed(1)}/10

## 3. RELEVANT USER HISTORY

### Films They Loved (7.0+):
${formatMatches(signals)}

### Films They Disliked (≤6.0):
${formatMatches(filters)}

# RESPONSE FRAMEWORK (Follow EXACTLY)

📊 Predicted Rating: X.X/10
(Your final, confident rating. No "±" estimates.)

🧠 Personalized Analysis
(Start with the Anchor. Explain how their personality type and past reactions to similar films inform your prediction. Reference specific titles naturally without labeling them as "signals" or "filters". Be analytical but conversational.)

⚖️ Weightings
(Identify the SINGLE decisive factor. What will make this user love or hate this film? Use concrete examples from their history.)

🎬 Oracle's Verdict
(Close with a sharp, memorable one-liner.)`,

    pt: `Você é o CineOracle. Sua tarefa é prever a nota (0.0 a 10.0) de um usuário para um filme-alvo, usando uma análise Bayesiana Ponderada.

# METODOLOGIA OBRIGATÓRIA (NÃO QUEBRE ESTAS REGRAS)
1. **ÂNCORA:** Sua análise DEVE começar pela "Nota Média do Público". Esta é sua linha de base.
2. **AJUSTE:** Ajuste a Âncora para cima ou para baixo com base em filmes relevantes do histórico (amados vs. rejeitados).
3. **LENTE:** Use o "Perfil de Personalidade" como a lente principal para justificar sua análise.
4. **NOTA FINAL:** Forneça uma nota específica (ex: 8.5/10). **NUNCA** use intervalos (ex: "±1.0"). Seja confiante.
5. **LINGUAGEM NATURAL:** Escreva como se estivesse analisando uma pessoa real. Evite jargão técnico ou termos metodológicos. Seja conversacional e perspicaz.

# DADOS DA PREVISÃO

## 1. O USUÁRIO (A Lente)
* **Perfil:** ${archetypeName} (${archetypeCode})
* **Essência do Arquétipo:** "${archetypeDescription}"
* **Nuance da Subcategoria:** "${subcategoryDescription}"

## 2. O FILME-ALVO
* **Filme:** ${movieName}
* **Âncora (Nota Média do Público):** ${movieAnchor.toFixed(1)}/10

## 3. HISTÓRICO RELEVANTE DO USUÁRIO

### Filmes que Amou (7.0+):
${formatMatches(signals)}

### Filmes que Rejeitou (≤6.0):
${formatMatches(filters)}

# FRAMEWORK DA RESPOSTA (Siga EXATAMENTE)

📊 Nota Prevista: X.X/10
(Sua nota final e confiante. Sem estimações "±".)

🧠 Análise Personalizada
(Comece com a Âncora. Explique como o tipo de personalidade dele e reações passadas a filmes similares informam sua previsão. Referencie títulos específicos naturalmente, sem rotulá-los como "sinais" ou "filtros". Seja analítico mas conversacional.)

⚖️ Ponderações
(Identifique o ÚNICO fator decisivo. O que fará este usuário amar ou odiar este filme? Use exemplos concretos do histórico dele.)

🎬 Veredito do Oráculo
(Feche com uma frase marcante e afiada.)`,

    es: `Eres CineOracle. Tu tarea es predecir la calificación (0.0 a 10.0) de un usuario para una película objetivo, usando un Análisis Bayesiano Ponderado.

# METODOLOGÍA OBLIGATORIA (NO ROMPAS ESTAS REGLAS)
1. **ANCLA:** Tu análisis DEBE comenzar con el "Promedio Público". Esta es tu línea base.
2. **AJUSTE:** Ajusta el Ancla hacia arriba o abajo basándote en películas relevantes del historial (amadas vs. rechazadas).
3. **LENTE:** Usa el "Perfil de Personalidad" como la lente principal para justificar tu análisis.
4. **CALIFICACIÓN FINAL:** Proporciona una calificación específica (ej: 8.5/10). **NUNCA** uses rangos (ej: "±1.0"). Sé confiado.
5. **LENGUAJE NATURAL:** Escribe como si estuvieras analizando a una persona real. Evita jerga técnica o términos metodológicos. Sé conversacional y perspicaz.

# DATOS DE LA PREDICCIÓN

## 1. EL USUARIO (La Lente)
* **Perfil:** ${archetypeName} (${archetypeCode})
* **Esencia del Arquetipo:** "${archetypeDescription}"
* **Matiz de la Subcategoría:** "${subcategoryDescription}"

## 2. LA PELÍCULA OBJETIVO
* **Película:** ${movieName}
* **Ancla (Promedio Público):** ${movieAnchor.toFixed(1)}/10

## 3. HISTORIAL RELEVANTE DEL USUARIO

### Películas que Amó (7.0+):
${formatMatches(signals)}

### Películas que Rechazó (≤6.0):
${formatMatches(filters)}

# MARCO DE RESPUESTA (Sigue EXACTAMENTE)

📊 Calificación Predicha: X.X/10
(Tu calificación final y confiada. Sin estimaciones "±".)

🧠 Análisis Personalizado
(Comienza con el Ancla. Explica cómo su tipo de personalidad y reacciones pasadas a películas similares informan tu predicción. Referencia títulos específicos naturalmente, sin etiquetarlos como "señales" o "filtros". Sé analítico pero conversacional.)

⚖️ Ponderaciones
(Identifica el ÚNICO factor decisivo. ¿Qué hará que este usuario ame u odie esta película? Usa ejemplos concretos de su historial.)

🎬 Veredicto del Oráculo
(Cierra con una frase memorable y aguda.)`
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

    const { userId, movieName, language = 'en' } = await req.json() as RequestBody;

    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    console.log('Starting hybrid prediction for user:', userId);
    console.log('Movie name:', movieName);

    if (!userId || !movieName) {
      throw new Error('Missing required fields: userId and movieName');
    }

    await supabase.rpc('check_and_reset_tickets', { user_id_input: userId });

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

    const { data: personalityDataArray, error: personalityError } = await supabase
      .rpc('get_user_complete_personality', { p_user_id: userId });

    if (personalityError) {
      console.error('Error fetching personality:', personalityError);
      return new Response(
        JSON.stringify({
          prediction: "⚠️ Error loading personality profile. Please try again.",
          movie: movieName,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const personalityData = personalityDataArray?.[0];

    if (!personalityData || !personalityData.personalidade_completa) {
      console.error('No personality data found for user:', userId);
      return new Response(
        JSON.stringify({
          prediction: "⚠️ Personality profile not found. Please complete the Oracle questionnaire first.",
          movie: movieName,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log('Personality data:', personalityData);

    const movieData = await getMovieDataFromTMDB(movieName);

    if (!movieData) {
      return new Response(
        JSON.stringify({
          prediction: `⚠️ Could not find "${movieName}" in the movie database. Please check the spelling and try again.`,
          movie: movieName,
          ticketsRemaining: ticketData.tickets_remaining
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log('Movie anchor score:', movieData.vote_average);

    const fishingResult = await fishForRelevantMovies(supabase, userId, {
      director: movieData.director,
      cast: movieData.cast,
      genres: movieData.genres
    });

    console.log('Fishing result - Signals:', fishingResult.signals.length, 'Filters:', fishingResult.filters.length);

    const { error: updateError } = await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 100 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    const hybridPrompt = getHybridPrompt(
      personalityData.archetype_name || 'Unknown',
      personalityData.complete_personality || 'XXX',
      personalityData.archetype_description || '',
      personalityData.subcategory_description || '',
      movieName,
      movieData.vote_average,
      fishingResult.signals,
      fishingResult.filters,
      language
    );

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
            { role: 'system', content: hybridPrompt },
            { role: 'user', content: `Predict this user's rating for "${movieName}" using the hybrid Bayesian + Spectrogram model.` }
          ],
          temperature: 0.7,
          max_tokens: 500
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API error:', errorData);
      throw new Error(`DeepSeek API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
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
