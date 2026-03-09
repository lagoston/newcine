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
  review?: {
    title: string;
    content: string;
  };
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
        movie_id,
        movies!inner (
          id,
          title,
          director,
          genres,
          media_type
        )
      `)
      .eq('user_id', userId)
      .not('rating', 'is', null);

    if (error || !userMovies) {
      console.error('Error fetching user movies:', error);
      return { signals, filters };
    }

    // Fetch all reviews for this user at once for efficiency
    const { data: userReviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('movie_id, media_type, title, content')
      .eq('user_id', userId);

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
    }

    // Create a map of reviews by movie_id for quick lookup
    const reviewsMap = new Map<string, { title: string; content: string }>();
    if (userReviews) {
      for (const review of userReviews) {
        const key = `${review.movie_id}_${review.media_type}`;
        reviewsMap.set(key, { title: review.title, content: review.content });
      }
    }

    const addedMovies = new Set<string>();

    // Helper function to get balanced selection from a pool of movies
    const selectBalancedMovies = (pool: any[], maxCount: number): void => {
      // Separate into high (7.0+), mid (6.0-7.0), and low (< 6.0) ratings
      const high = pool.filter(m => m.rating >= 7.0);
      const mid = pool.filter(m => m.rating > 6.0 && m.rating < 7.0);
      const low = pool.filter(m => m.rating <= 6.0);

      // Shuffle each category for randomness
      const shuffle = (arr: any[]) => {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      };

      const shuffledHigh = shuffle(high);
      const shuffledMid = shuffle(mid);
      const shuffledLow = shuffle(low);

      // Try to get a balanced mix: alternate between high, mid, and low
      const categories = [
        { movies: shuffledHigh, type: 'high' },
        { movies: shuffledMid, type: 'mid' },
        { movies: shuffledLow, type: 'low' }
      ];

      let categoryIndex = 0;
      let added = 0;

      // Round-robin selection from each category
      while (added < maxCount && (shuffledHigh.length > 0 || shuffledMid.length > 0 || shuffledLow.length > 0)) {
        const category = categories[categoryIndex % 3];

        if (category.movies.length > 0) {
          const movie = category.movies.shift();
          if (movie && !addedMovies.has(movie.movies.title)) {
            const reviewKey = `${movie.movie_id}_${movie.movies.media_type || 'movie'}`;
            const review = reviewsMap.get(reviewKey);

            const entry: RelevantMovie = {
              title: movie.movies.title,
              rating: movie.rating,
              matchType: movie.matchType || 'Genre',
              ...(review && { review })
            };

            if (movie.rating >= 7.0) {
              signals.push(entry);
            } else if (movie.rating <= 6.0) {
              filters.push(entry);
            }

            addedMovies.add(movie.movies.title);
            added++;
          }
        }

        categoryIndex++;

        // Break if all categories are empty
        if (shuffledHigh.length === 0 && shuffledMid.length === 0 && shuffledLow.length === 0) {
          break;
        }
      }
    };

    if (targetMovieData.director) {
      for (const movie of userMovies) {
        if (signals.length + filters.length >= 5) break;

        if (movie.movies.director === targetMovieData.director && !addedMovies.has(movie.movies.title)) {
          const reviewKey = `${movie.movie_id}_${movie.movies.media_type || 'movie'}`;
          const review = reviewsMap.get(reviewKey);

          const entry: RelevantMovie = {
            title: movie.movies.title,
            rating: movie.rating,
            matchType: 'Director',
            ...(review && { review })
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
          movie_id,
          movies!inner (
            id,
            title,
            media_type
          )
        `)
        .eq('user_id', userId)
        .not('rating', 'is', null)
        .limit(30);

      if (castResponse.data) {
        // Collect actor matches
        const actorMatches: any[] = [];

        for (const movie of castResponse.data) {
          if (addedMovies.has(movie.movies.title)) continue;
          if (actorMatches.length >= 15) break; // Check up to 15 movies

          try {
            const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movie.movies.id}?api_key=${Deno.env.get('TMDB_API_KEY')}&append_to_response=credits`;
            const detailsResponse = await fetch(movieDetailsUrl);
            const detailsData = await detailsResponse.json();

            const movieCast = detailsData.credits?.cast?.slice(0, 5).map((actor: any) => actor.name) || [];
            const hasCommonActor = movieCast.some((actor: string) => targetMovieData.cast?.includes(actor));

            if (hasCommonActor) {
              actorMatches.push({
                ...movie,
                matchType: 'Actor'
              });
            }
          } catch (error) {
            console.error('Error fetching cast for movie:', movie.movies.title, error);
          }
        }

        // Use balanced selection for actor matches
        if (actorMatches.length > 0) {
          const remainingSlots = 5 - (signals.length + filters.length);
          selectBalancedMovies(actorMatches, remainingSlots);
        }
      }
    }

    if (signals.length + filters.length < 5 && targetMovieData.genres && targetMovieData.genres.length > 0) {
      const primaryGenre = targetMovieData.genres[0];

      // Collect all genre matches first
      const genreMatches = userMovies
        .filter(movie =>
          !addedMovies.has(movie.movies.title) &&
          movie.movies.genres &&
          movie.movies.genres.includes(primaryGenre)
        )
        .map(movie => ({
          ...movie,
          matchType: 'Genre'
        }));

      // Use balanced selection for genre matches
      const remainingSlots = 5 - (signals.length + filters.length);
      selectBalancedMovies(genreMatches, remainingSlots);
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
    return matches.map(m => {
      let matchStr = `"${m.title}" (${m.rating}/10) - Same ${m.matchType}`;
      if (m.review) {
        matchStr += `\n  📝 User's Review: "${m.review.title}"\n  ${m.review.content}`;
      }
      return matchStr;
    }).join('\n\n');
  };

  const prompts = {
    en: `You are CineOracle — not a formal critic, but a knowledgeable old friend who has seen everything and will tell you exactly what they think. You're experienced but never pompous. You keep it close, informal, and honest — even when the news isn't great.

Your task is to predict a user's rating (0.0 to 10.0) for a target film using Weighted Bayesian Analysis.

# MANDATORY METHODOLOGY (DO NOT BREAK THESE RULES)
1. **ANCHOR:** Your analysis MUST start with the "Public Average Rating". This is your baseline.
2. **ADJUSTMENT:** Adjust the Anchor up or down based on relevant films from their history (loved vs. disliked).
3. **LENS:** Use the "Personality Profile" as the primary lens to justify your analysis.
4. **FINAL SCORE:** Provide a specific rating (e.g., 8.5/10). **NEVER** use ranges (e.g., "±1.0"). Be confident and commit.
5. **TONE — CRITICAL:** Write like a sharp, familiar friend — not a robot, not a critic. Be direct and honest even if it means bad news. When the situation is obvious or ironic (e.g., someone who hates horror is asking about a horror film), a dry, sarcastic remark is welcome and encouraged.
6. **MIRROR THE USER:** If reviews are present below, study how the user writes — their vocabulary, energy, formality level. Let your verdict subtly echo their voice back to them.
7. **EXTREME RATINGS ALLOWED:** If there is strong evidence from reviews or history, DO NOT hesitate to predict very high (9.0-10.0) or very low (0.0-2.0) ratings. Be bold when the evidence is clear.

# PREDICTION DATA

## 1. THE USER (The Lens)
* **Profile:** ${archetypeName} (${archetypeCode})
* **Archetype Core:** "${archetypeDescription}"
* **Subcategory Nuance:** "${subcategoryDescription}"

## 2. THE TARGET FILM
* **Film:** ${movieName}
* **Anchor (Public Average):** ${movieAnchor.toFixed(1)}/10

## 3. RELEVANT USER HISTORY
**IMPORTANT:** Reviews are gold. When a user has written a review below, pay EXTRA ATTENTION to their specific words — they reveal exactly what they loved or hated, and should heavily influence your prediction if the target film shares those traits. Also use their writing style as a mirror.

### Films They Loved (7.0+):
${formatMatches(signals)}

### Films They Disliked (≤6.0):
${formatMatches(filters)}

# RESPONSE FRAMEWORK (Follow EXACTLY)
You MUST generate ONLY two lines. Be extremely minimalist. NEVER add other paragraphs.

📊 Predicted Rating: X.X/10
🎬 Oracle's Verdict: (ONE sharp, direct sentence to the user, using "you". NEVER mention the archetype name. Be specific — cite an actor, genre, the film's vibe, or a past title from their history. Can be warm, dry, or brutally honest depending on the situation. Sarcasm welcome when it fits. Ex: "Has that same slow-burn you loved in [Movie X]", "Director Y doing Director Y things — you'll either love it or not", "If you're asking, you already know the answer." Maximum 15 words.)`,

    pt: `Você é o CineOracle — não um crítico formal, mas um velho amigo entendido que já viu de tudo e fala o que pensa na sua cara. Você tem experiência, mas nunca é pedante. Mantém a proximidade, a informalidade e a honestidade — mesmo quando a notícia não é boa.

Sua tarefa é prever a nota (0.0 a 10.0) de um usuário para um filme-alvo, usando uma análise Bayesiana Ponderada.

# METODOLOGIA OBRIGATÓRIA (NÃO QUEBRE ESTAS REGRAS)
1. **ÂNCORA:** Sua análise DEVE começar pela "Nota Média do Público". Esta é sua linha de base.
2. **AJUSTE:** Ajuste a Âncora para cima ou para baixo com base em filmes relevantes do histórico (amados vs. rejeitados).
3. **LENTE:** Use o "Perfil de Personalidade" como a lente principal para justificar sua análise.
4. **NOTA FINAL:** Forneça uma nota específica (ex: 8.5/10). **NUNCA** use intervalos (ex: "±1.0"). Seja confiante e se comprometa com a nota.
5. **TOM — CRÍTICO:** Escreva como um amigo próximo e afiado — não um robô, não um crítico. Seja direto e honesto mesmo que signifique dar más notícias. Quando a situação for óbvia ou irônica (ex: alguém que odeia terror perguntando sobre um filme de terror), um comentário seco e sarcástico é bem-vindo e encorajado.
6. **ESPELHE O USUÁRIO:** Se houver reviews abaixo, estude como o usuário escreve — seu vocabulário, energia, nível de formalidade. Deixe seu veredito ecoar sutilmente a voz dele de volta.
7. **NOTAS EXTREMAS PERMITIDAS:** Se houver fortes evidências das reviews ou histórico, NÃO hesite em prever notas muito altas (9.0-10.0) ou muito baixas (0.0-2.0). Seja ousado quando as evidências forem claras.

# DADOS DA PREVISÃO

## 1. O USUÁRIO (A Lente)
* **Perfil:** ${archetypeName} (${archetypeCode})
* **Essência do Arquétipo:** "${archetypeDescription}"
* **Nuance da Subcategoria:** "${subcategoryDescription}"

## 2. O FILME-ALVO
* **Filme:** ${movieName}
* **Âncora (Nota Média do Público):** ${movieAnchor.toFixed(1)}/10

## 3. HISTÓRICO RELEVANTE DO USUÁRIO
**IMPORTANTE:** Reviews são ouro. Quando um usuário escreveu uma review abaixo, preste ATENÇÃO ESPECIAL às palavras específicas dele — elas revelam exatamente o que amou ou odiou, e devem influenciar fortemente sua previsão se o filme-alvo compartilhar essas características. Use também o estilo de escrita dele como espelho.

### Filmes que Amou (7.0+):
${formatMatches(signals)}

### Filmes que Rejeitou (≤6.0):
${formatMatches(filters)}

# FRAMEWORK DA RESPOSTA (Siga EXATAMENTE)
Você DEVE gerar APENAS duas linhas. Seja extremamente minimalista. NUNCA adicione outros parágrafos.

📊 Nota Prevista: X.X/10
🎬 Veredito do Oráculo: (UMA frase direta e afiada para o usuário, usando "você". NUNCA mencione o nome do arquétipo. Seja específico — cite um ator, gênero, o clima do filme ou um título anterior do histórico. Pode ser caloroso, seco ou brutalmente honesto dependendo da situação. Sarcasmo bem-vindo quando couber. Ex: "Tem aquele clima de queima lenta que você amou em [Filme X]", "Diretor Y sendo Diretor Y — ou vai amar ou não", "Se está perguntando, já sabe a resposta." Máximo de 15 palavras.)`,

    es: `Eres CineOracle — no un crítico formal, sino un viejo amigo entendido que ha visto de todo y te dice exactamente lo que piensa. Tienes experiencia, pero nunca eres pedante. Mantienes la cercanía, la informalidad y la honestidad — incluso cuando las noticias no son buenas.

Tu tarea es predecir la calificación (0.0 a 10.0) de un usuario para una película objetivo, usando un Análisis Bayesiano Ponderado.

# METODOLOGÍA OBLIGATORIA (NO ROMPAS ESTAS REGLAS)
1. **ANCLA:** Tu análisis DEBE comenzar con el "Promedio Público". Esta es tu línea base.
2. **AJUSTE:** Ajusta el Ancla hacia arriba o abajo basándote en películas relevantes del historial (amadas vs. rechazadas).
3. **LENTE:** Usa el "Perfil de Personalidad" como la lente principal para justificar tu análisis.
4. **CALIFICACIÓN FINAL:** Proporciona una calificación específica (ej: 8.5/10). **NUNCA** uses rangos (ej: "±1.0"). Sé confiado y comprométete con la nota.
5. **TONO — CRÍTICO:** Escribe como un amigo cercano y agudo — no un robot, no un crítico. Sé directo y honesto aunque signifique malas noticias. Cuando la situación sea obvia o irónica (ej: alguien que odia el terror preguntando sobre una película de terror), un comentario seco y sarcástico es bienvenido y alentado.
6. **REFLEJA AL USUARIO:** Si hay reseñas abajo, estudia cómo escribe el usuario — su vocabulario, energía, nivel de formalidad. Deja que tu veredicto refleje sutilmente su voz de vuelta.
7. **CALIFICACIONES EXTREMAS PERMITIDAS:** Si hay evidencia fuerte de reseñas o historial, NO dudes en predecir calificaciones muy altas (9.0-10.0) o muy bajas (0.0-2.0). Sé audaz cuando la evidencia sea clara.

# DATOS DE LA PREDICCIÓN

## 1. EL USUARIO (La Lente)
* **Perfil:** ${archetypeName} (${archetypeCode})
* **Esencia del Arquetipo:** "${archetypeDescription}"
* **Matiz de la Subcategoría:** "${subcategoryDescription}"

## 2. LA PELÍCULA OBJETIVO
* **Película:** ${movieName}
* **Ancla (Promedio Público):** ${movieAnchor.toFixed(1)}/10

## 3. HISTORIAL RELEVANTE DEL USUARIO
**IMPORTANTE:** Las reseñas son oro. Cuando un usuario ha escrito una reseña abajo, presta ATENCIÓN ESPECIAL a sus palabras específicas — revelan exactamente lo que amó u odió, y deben influir fuertemente en tu predicción si la película objetivo comparte esas características. Usa también su estilo de escritura como espejo.

### Películas que Amó (7.0+):
${formatMatches(signals)}

### Películas que Rechazó (≤6.0):
${formatMatches(filters)}

# MARCO DE RESPUESTA (Sigue EXACTAMENTE)
Debes generar SOLO dos líneas. Sé extremadamente minimalista. NUNCA agregues otros párrafos.

📊 Calificación Predicha: X.X/10
🎬 Veredicto del Oráculo: (UNA frase directa y aguda para el usuario, usando "tú". NUNCA menciones el nombre del arquetipo. Sé específico — cita un actor, género, el ambiente de la película o un título anterior de su historial. Puede ser cálido, seco o brutalmente honesto según la situación. El sarcasmo es bienvenido cuando encaja. Ej: "Tiene ese mismo ritmo pausado que amaste en [Película X]", "Director Y siendo Director Y — o lo amarás o no", "Si lo preguntas, ya sabes la respuesta." Máximo 15 palabras.)`
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

    const { userId, movieName, movieId: requestMovieId, language = 'en' } = await req.json() as RequestBody;

    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    const startTime = Date.now();
    console.log('Starting hybrid prediction for user:', userId);
    console.log('Movie name:', movieName);

    if (!userId || !movieName) {
      throw new Error('Missing required fields: userId and movieName');
    }

    await supabase.rpc('check_and_reset_tickets', { user_id_param: userId });

    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('tickets_remaining, plan_type')
      .eq('user_id', userId)
      .single();

    if (ticketError) {
      throw new Error(`Error fetching ticket data: ${ticketError.message}`);
    }

    if (requestMovieId) {
      const { data: cached } = await supabase
        .from('prediction_cache')
        .select('prediction')
        .eq('user_id', userId)
        .eq('movie_id', requestMovieId)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({
            prediction: cached.prediction,
            movie: movieName,
            ticketsRemaining: ticketData.tickets_remaining
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    if (!ticketData || ticketData.tickets_remaining < 1) {
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
    console.log('⏱️ Personality fetch:', Date.now() - startTime, 'ms');

    const tmdbStart = Date.now();
    const movieData = await getMovieDataFromTMDB(movieName);
    console.log('⏱️ TMDB fetch:', Date.now() - tmdbStart, 'ms');

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

    if (!requestMovieId && movieData.id) {
      const { data: cached } = await supabase
        .from('prediction_cache')
        .select('prediction')
        .eq('user_id', userId)
        .eq('movie_id', movieData.id)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle();

      if (cached) {
        return new Response(
          JSON.stringify({
            prediction: cached.prediction,
            movie: movieName,
            ticketsRemaining: ticketData.tickets_remaining
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    console.log('Movie anchor score:', movieData.vote_average);

    const fishingStart = Date.now();
    const fishingResult = await fishForRelevantMovies(supabase, userId, {
      director: movieData.director,
      cast: movieData.cast,
      genres: movieData.genres
    });
    console.log('⏱️ Fishing:', Date.now() - fishingStart, 'ms');
    console.log('Fishing result - Signals:', fishingResult.signals.length, 'Filters:', fishingResult.filters.length);

    const { error: updateError } = await supabase
      .from('user_tickets')
      .update({ tickets_remaining: ticketData.tickets_remaining - 1 })
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(`Error updating tickets: ${updateError.message}`);
    }

    console.log('🔮 Incrementing oracle predictions counter for user:', userId);
    const { error: incrementError } = await supabase.rpc('increment_oracle_predictions', { p_user_id: userId });
    if (incrementError) {
      console.error('❌ Error incrementing predictions counter:', incrementError);
    } else {
      console.log('✅ Predictions counter incremented successfully');
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

    const aiStart = Date.now();
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
            { role: 'user', content: `Predict this user's rating for "${movieName}". Reply with EXACTLY two lines as specified. Nothing more.` }
          ],
          temperature: 0.7,
          max_tokens: 80
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('DeepSeek API error:', errorData);
      throw new Error(`DeepSeek API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('⏱️ AI Generation:', Date.now() - aiStart, 'ms');
    console.log('⏱️ TOTAL TIME:', Date.now() - startTime, 'ms');

    const prediction = data.choices?.[0]?.message?.content;

    if (!prediction) {
      console.error('No prediction in response:', JSON.stringify(data));
      throw new Error('Unable to generate prediction from DeepSeek');
    }

    const cacheMovieId = requestMovieId || movieData.id;
    if (cacheMovieId) {
      await supabase
        .from('prediction_cache')
        .upsert(
          {
            user_id: userId,
            movie_id: cacheMovieId,
            prediction,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          },
          { onConflict: 'user_id,movie_id' }
        );
    }

    return new Response(
      JSON.stringify({
        prediction,
        movie: movieName,
        ticketsRemaining: ticketData.tickets_remaining - 1
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