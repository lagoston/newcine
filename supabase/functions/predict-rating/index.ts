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

async function getMovieDataFromTMDB(
  movieName: string,
  language: string
): Promise<{ vote_average: number; id: number; media_type: string; director?: string; cast?: string[]; genres?: string[] } | null> {
  const tmdbApiKey = Deno.env.get('TMDB_API_KEY');
  if (!tmdbApiKey) {
    console.error('TMDB_API_KEY not found');
    return null;
  }

  const tmdbLang = language.startsWith('pt') ? 'pt-BR' : language.startsWith('es') ? 'es-ES' : 'en-US';

  try {
    const [movieRes, tvRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(movieName)}&language=${tmdbLang}`),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(movieName)}&language=${tmdbLang}`)
    ]);

    const [movieData, tvData] = await Promise.all([movieRes.json(), tvRes.json()]);

    const movieResults = movieData.results || [];
    const tvResults = tvData.results || [];

    let result: any = null;
    let mediaType = 'movie';

    if (movieResults.length > 0 && tvResults.length > 0) {
      const topMovie = movieResults[0];
      const topTv = tvResults[0];
      if ((topTv.vote_count || 0) >= (topMovie.vote_count || 0)) {
        result = topTv;
        mediaType = 'tv';
      } else {
        result = topMovie;
        mediaType = 'movie';
      }
    } else if (movieResults.length > 0) {
      result = movieResults[0];
      mediaType = 'movie';
    } else if (tvResults.length > 0) {
      result = tvResults[0];
      mediaType = 'tv';
    } else {
      console.log('Not found in TMDB:', movieName);
      return null;
    }

    const itemId = result.id;
    const detailsUrl = `https://api.themoviedb.org/3/${mediaType}/${itemId}?api_key=${tmdbApiKey}&append_to_response=credits&language=${tmdbLang}`;
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    let director: string | undefined;
    let cast: string[] = [];

    if (mediaType === 'movie') {
      director = detailsData.credits?.crew?.find((p: any) => p.job === 'Director')?.name;
      cast = detailsData.credits?.cast?.slice(0, 5).map((a: any) => a.name) || [];
    } else {
      director = detailsData.created_by?.[0]?.name;
      cast = detailsData.credits?.cast?.slice(0, 5).map((a: any) => a.name) || [];
    }

    const genres = detailsData.genres?.map((g: any) => g.name) || [];

    return {
      vote_average: result.vote_average || 0,
      id: itemId,
      media_type: mediaType,
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

    const { data: userReviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('movie_id, media_type, title, content')
      .eq('user_id', userId);

    if (reviewsError) {
      console.error('Error fetching reviews:', reviewsError);
    }

    const reviewsMap = new Map<string, { title: string; content: string }>();
    if (userReviews) {
      for (const review of userReviews) {
        const key = `${review.movie_id}_${review.media_type}`;
        reviewsMap.set(key, { title: review.title, content: review.content });
      }
    }

    const addedMovies = new Set<string>();

    const pushMovieEntry = (movie: any, matchType: string) => {
      const reviewKey = `${movie.movie_id}_${movie.movies.media_type || 'movie'}`;
      const review = reviewsMap.get(reviewKey);
      const entry: RelevantMovie = {
        title: movie.movies.title,
        rating: movie.rating,
        matchType,
        ...(review && { review })
      };
      if (movie.rating >= 7.0) {
        signals.push(entry);
      } else if (movie.rating <= 6.0) {
        filters.push(entry);
      }
      addedMovies.add(movie.movies.title);
    };

    const selectBalancedMovies = (pool: any[], maxCount: number, matchType: string): void => {
      const high = pool.filter(m => m.rating >= 7.0);
      const mid = pool.filter(m => m.rating > 6.0 && m.rating < 7.0);
      const low = pool.filter(m => m.rating <= 6.0);

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

      let categoryIndex = 0;
      let added = 0;

      while (added < maxCount && (shuffledHigh.length > 0 || shuffledMid.length > 0 || shuffledLow.length > 0)) {
        const categories = [shuffledHigh, shuffledMid, shuffledLow];
        const category = categories[categoryIndex % 3];

        if (category.length > 0) {
          const movie = category.shift();
          if (movie && !addedMovies.has(movie.movies.title)) {
            pushMovieEntry(movie, matchType);
            added++;
          }
        }
        categoryIndex++;

        if (shuffledHigh.length === 0 && shuffledMid.length === 0 && shuffledLow.length === 0) break;
      }
    };

    // 1. DIRECTOR matches (highest priority)
    if (targetMovieData.director) {
      for (const movie of userMovies) {
        if (signals.length + filters.length >= 5) break;
        if (movie.movies.director === targetMovieData.director && !addedMovies.has(movie.movies.title)) {
          pushMovieEntry(movie, 'Director');
        }
      }
    }

    // 2. ACTOR matches (second priority)
    if (signals.length + filters.length < 5 && targetMovieData.cast && targetMovieData.cast.length > 0) {
      const tmdbApiKey = Deno.env.get('TMDB_API_KEY');
      const candidatePool = userMovies.filter((m: any) => !addedMovies.has(m.movies.title));
      const shuffledPool = [...candidatePool];
      for (let i = shuffledPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledPool[i], shuffledPool[j]] = [shuffledPool[j], shuffledPool[i]];
      }

      const MAX_TMDB_CHECKS = 25;
      const actorMatches: any[] = [];

      for (let i = 0; i < Math.min(shuffledPool.length, MAX_TMDB_CHECKS); i++) {
        if (actorMatches.length >= 10) break;
        const movie = shuffledPool[i];
        try {
          const mType = movie.movies.media_type === 'tv' ? 'tv' : 'movie';
          const movieDetailsUrl = `https://api.themoviedb.org/3/${mType}/${movie.movies.id}?api_key=${tmdbApiKey}&append_to_response=credits`;
          const detailsResponse = await fetch(movieDetailsUrl);
          if (!detailsResponse.ok) continue;
          const detailsData = await detailsResponse.json();
          const movieCast: string[] = detailsData.credits?.cast?.slice(0, 5).map((a: any) => a.name) || [];
          const hasCommonActor = movieCast.some((actor) => targetMovieData.cast?.includes(actor));
          if (hasCommonActor) {
            actorMatches.push(movie);
          }
        } catch (err) {
          console.error('Error fetching cast for', movie.movies.title, err);
        }
      }

      if (actorMatches.length > 0) {
        const remainingSlots = 5 - (signals.length + filters.length);
        selectBalancedMovies(actorMatches, remainingSlots, 'Actor');
      }
    }

    // 3. GENRE matches (third priority) — match against ALL target genres, not just primary
    if (signals.length + filters.length < 5 && targetMovieData.genres && targetMovieData.genres.length > 0) {
      const targetGenresLower = targetMovieData.genres.map(g => g.toLowerCase());

      const genreMatches = userMovies.filter((movie: any) => {
        if (addedMovies.has(movie.movies.title)) return false;
        if (!movie.movies.genres || movie.movies.genres.length === 0) return false;
        const movieGenresLower = movie.movies.genres.map((g: string) => g.toLowerCase());
        return movieGenresLower.some((g: string) => targetGenresLower.includes(g));
      });

      const remainingSlots = 5 - (signals.length + filters.length);
      selectBalancedMovies(genreMatches, remainingSlots, 'Genre');
    }

  } catch (error) {
    console.error('Error in fishing logic:', error);
  }

  return { signals, filters };
}

function getHybridPrompt(
  archetypeName: string,
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
        matchStr += `\n  User's Review: "${m.review.title}"\n  ${m.review.content}`;
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
3. **LENS:** Use the Personality Profile as a silent internal compass to understand their taste. It informs your judgment — it must NEVER appear in the verdict.
4. **FINAL SCORE:** Provide a specific rating (e.g., 8.5/10). **NEVER** use ranges (e.g., "±1.0"). Be confident and commit.
5. **TONE — CRITICAL:** Write like a sharp, familiar friend — not a robot, not a critic. Be direct and honest even if it means bad news. When the situation is obvious or ironic (e.g., someone who hates horror is asking about a horror film), a dry, sarcastic remark is welcome and encouraged.
6. **MIRROR THE USER:** If reviews are present below, study how the user writes — their vocabulary, energy, formality level. Let your verdict subtly echo their voice back to them.
7. **STAY CLOSE TO ANCHOR:** When there is NO relevant history (both lists show "None"), your prediction MUST stay within ±1.5 points of the Public Average. Only deviate significantly when you have CLEAR evidence from the user's history.
8. **BE BOLD WHEN THE SIGNAL IS STRONG:** When the evidence from the user's history is clear and decisive, don't hold back — ratings like 0.0, 2.0, 9.0, or 10.0 are perfectly welcome if the context justifies them. Commit to the call.

# PREDICTION DATA

## 1. THE USER (Silent Context — Do NOT quote or paraphrase in the verdict)
* **Internal Profile:** ${archetypeName}
* **What drives their taste:** ${archetypeDescription}
* **Additional nuance:** ${subcategoryDescription}

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
You must generate a maximum of four lines.

Predicted Rating: X.X/10
Oracle's Verdict: (ONE sharp, direct sentence to the user, using "you". ANCHOR IT TO THE FILM — cite the director's style, a specific actor, the film's atmosphere, a genre pattern, or a direct comparison to a title from their history. AVOID: words or concepts from the archetype/subcategory labels. The personality is your compass, not your script. Can be warm, dry, or brutally honest. Sarcasm welcome when it fits. Maximum 15 words.)`,

    pt: `Você é o CineOracle — não um crítico formal, mas um velho amigo entendido que já viu de tudo e fala o que pensa na sua cara. Você tem experiência, mas nunca é pedante. Mantém a proximidade, a informalidade e a honestidade — mesmo quando a notícia não é boa.

Sua tarefa é prever a nota (0.0 a 10.0) de um usuário para um filme-alvo, usando uma análise Bayesiana Ponderada.

# METODOLOGIA OBRIGATÓRIA (NÃO QUEBRE ESTAS REGRAS)
1. **ÂNCORA:** Sua análise DEVE começar pela "Nota Média do Público". Esta é sua linha de base.
2. **AJUSTE:** Ajuste a Âncora para cima ou para baixo com base em filmes relevantes do histórico (amados vs. rejeitados).
3. **LENTE:** Use o Perfil de Personalidade como uma bússola interna silenciosa para entender o gosto do usuário. Ele informa seu julgamento — NUNCA deve aparecer no veredito.
4. **NOTA FINAL:** Forneça uma nota específica (ex: 8.5/10). **NUNCA** use intervalos (ex: "±1.0"). Seja confiante e se comprometa com a nota.
5. **TOM — CRÍTICO:** Escreva como um amigo próximo e afiado — não um robô, não um crítico. Seja direto e honesto mesmo que signifique dar más notícias. Quando a situação for óbvia ou irônica (ex: alguém que odeia terror perguntando sobre um filme de terror), um comentário seco e sarcástico é bem-vindo e encorajado.
6. **ESPELHE O USUÁRIO:** Se houver reviews abaixo, estude como o usuário escreve — seu vocabulário, energia, nível de formalidade. Deixe seu veredito ecoar sutilmente a voz dele de volta.
7. **FIQUE PRÓXIMO DA ÂNCORA:** Quando NÃO houver histórico relevante (ambas listas mostram "None"), sua previsão DEVE ficar dentro de ±1.5 pontos da Nota Média do Público. Só desvie significativamente quando tiver evidências CLARAS do histórico do usuário.
8. **SEJA OUSADO QUANDO O SINAL FOR FORTE:** Quando as evidências do histórico forem claras e decisivas, não segure — notas como 0.0, 2.0, 9.0 ou 10.0 são bem-vindas se o contexto justificar. Assuma a previsão com confiança.

# DADOS DA PREVISÃO

## 1. O USUÁRIO (Contexto Silencioso — NÃO cite nem parafraseie no veredito)
* **Perfil interno:** ${archetypeName}
* **O que guia o gosto dele:** ${archetypeDescription}
* **Nuance adicional:** ${subcategoryDescription}

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
Você deve gerar no máximo quatro linhas.

Nota Prevista: X.X/10
Veredito do Oráculo: (UMA frase direta e afiada para o usuário, usando "você". ANCORE NO FILME — cite o estilo do diretor, um ator específico, a atmosfera do filme, um padrão de gênero ou uma comparação direta com um título do histórico. EVITE: palavras ou conceitos dos rótulos do arquétipo/subcategoria. A personalidade é sua bússola, não seu roteiro. Pode ser caloroso, seco ou brutalmente honesto. Sarcasmo bem-vindo quando couber. Máximo de 15 palavras.)`,

    es: `Eres CineOracle — no un crítico formal, sino un viejo amigo entendido que ha visto de todo y te dice exactamente lo que piensa. Tienes experiencia, pero nunca eres pedante. Mantienes la cercanía, la informalidad y la honestidad — incluso cuando las noticias no son buenas.

Tu tarea es predecir la calificación (0.0 a 10.0) de un usuario para una película objetivo, usando un Análisis Bayesiano Ponderado.

# METODOLOGÍA OBLIGATORIA (NO ROMPAS ESTAS REGLAS)
1. **ANCLA:** Tu análisis DEBE comenzar con el "Promedio Público". Esta es tu línea base.
2. **AJUSTE:** Ajusta el Ancla hacia arriba o abajo basándote en películas relevantes del historial (amadas vs. rechazadas).
3. **LENTE:** Usa el Perfil de Personalidad como una brújula interna silenciosa para entender el gusto del usuario. Informa tu juicio — NUNCA debe aparecer en el veredicto.
4. **CALIFICACIÓN FINAL:** Proporciona una calificación específica (ej: 8.5/10). **NUNCA** uses rangos (ej: "±1.0"). Sé confiado y comprométete con la nota.
5. **TONO — CRÍTICO:** Escribe como un amigo cercano y agudo — no un robot, no un crítico. Sé directo y honesto aunque signifique malas noticias. Cuando la situación sea obvia o irónica (ej: alguien que odia el terror preguntando sobre una película de terror), un comentario seco y sarcástico es bienvenido y alentado.
6. **REFLEJA AL USUARIO:** Si hay reseñas abajo, estudia cómo escribe el usuario — su vocabulario, energía, nivel de formalidad. Deja que tu veredicto refleje sutilmente su voz de vuelta.
7. **QUÉDATE CERCA DEL ANCLA:** Cuando NO haya historial relevante (ambas listas muestran "None"), tu predicción DEBE quedarse dentro de ±1.5 puntos del Promedio Público. Solo desvíate significativamente cuando tengas evidencia CLARA del historial del usuario.
8. **SÉ AUDAZ CUANDO LA SEÑAL ES FUERTE:** Cuando la evidencia del historial sea clara y decisiva, no te contengas — calificaciones como 0.0, 2.0, 9.0 o 10.0 son bienvenidas si el contexto lo justifica. Comprométete con la predicción con confianza.

# DATOS DE LA PREDICCIÓN

## 1. EL USUARIO (Contexto Silencioso — NO cites ni parafrasees en el veredicto)
* **Perfil interno:** ${archetypeName}
* **Lo que guía su gusto:** ${archetypeDescription}
* **Matiz adicional:** ${subcategoryDescription}

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
Debes generar un máximo de cuatro líneas.

Calificación Predicha: X.X/10
Veredicto del Oráculo: (UNA frase directa y aguda para el usuario, usando "tú". ANCLA EN LA PELÍCULA — cita el estilo del director, un actor específico, la atmósfera del film, un patrón de género o una comparación directa con un título de su historial. EVITA: palabras o conceptos de las etiquetas del arquetipo/subcategoría. La personalidad es tu brújula, no tu guión. Puede ser cálido, seco o brutalmente honesto. El sarcasmo es bienvenido cuando encaja. Máximo 15 palabras.)`
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
    console.log('Movie name:', movieName, '| language:', language);

    if (!userId || !movieName) {
      throw new Error('Missing required fields: userId and movieName');
    }

    await supabase.rpc('check_and_reset_tickets', { user_id_param: userId });

    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('tickets_remaining, plan_type, next_reset')
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
            ticketsRemaining: ticketData.tickets_remaining,
            nextReset: ticketData.next_reset
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
    }

    if (!ticketData || ticketData.tickets_remaining < 1) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient tickets',
          ticketsRemaining: ticketData?.tickets_remaining || 0,
          nextReset: ticketData?.next_reset
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
          ticketsRemaining: ticketData.tickets_remaining,
          nextReset: ticketData.next_reset
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    const { data: personalityDataArray, error: personalityError } = await supabase
      .rpc('get_user_complete_personality', { p_user_id: userId, p_language: language.startsWith('pt') ? 'pt' : 'en' });

    if (personalityError) {
      console.error('Error fetching personality:', personalityError);
      return new Response(
        JSON.stringify({
          prediction: "⚠️ Error loading personality profile. Please try again.",
          movie: movieName,
          ticketsRemaining: ticketData.tickets_remaining,
          nextReset: ticketData.next_reset
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
          ticketsRemaining: ticketData.tickets_remaining,
          nextReset: ticketData.next_reset
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

    console.log('Personality:', {
      archetype_name: personalityData.archetype_name,
      subcategory_name: personalityData.subcategory_name
    });
    console.log('⏱️ Personality fetch:', Date.now() - startTime, 'ms');

    const tmdbStart = Date.now();
    const movieData = await getMovieDataFromTMDB(movieName, language);
    console.log('⏱️ TMDB fetch:', Date.now() - tmdbStart, 'ms');
    console.log('Target movie data:', {
      director: movieData?.director,
      cast: movieData?.cast,
      genres: movieData?.genres
    });

    if (!movieData) {
      return new Response(
        JSON.stringify({
          prediction: `⚠️ Could not find "${movieName}" in the movie database. Please check the spelling and try again.`,
          movie: movieName,
          ticketsRemaining: ticketData.tickets_remaining,
          nextReset: ticketData.next_reset
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
            ticketsRemaining: ticketData.tickets_remaining,
            nextReset: ticketData.next_reset
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
    console.log('Signals:', fishingResult.signals.map(s => `${s.title} (${s.matchType})${s.review ? ' [review]' : ''}`));
    console.log('Filters:', fishingResult.filters.map(f => `${f.title} (${f.matchType})${f.review ? ' [review]' : ''}`));

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
      personalityData.archetype_description || '',
      personalityData.subcategory_description || '',
      movieName,
      movieData.vote_average,
      fishingResult.signals,
      fishingResult.filters,
      language
    );

    // --- AI MODEL CONFIGURATION ---
    // Os nomes novos (deepseek-v4-flash / deepseek-v4-pro) só entram em vigor em 2026-07-24.
    // Até lá, os nomes válidos na API são:
    //   'deepseek-chat'      → rápido e econômico (= futuro deepseek-v4-flash)
    //   'deepseek-reasoner'  → mais capaz, com raciocínio (= futuro deepseek-v4-pro)
    // Após 2026-07-24 você pode trocar para 'deepseek-v4-flash' ou 'deepseek-v4-pro'.
    const AI_MODEL = 'deepseek-chat';
    // ------------------------------

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
          model: AI_MODEL,
          messages: [
            { role: 'system', content: hybridPrompt },
            { role: 'user', content: `Predict this user's rating for "${movieName}". Reply with EXACTLY two lines as specified. Nothing more.` }
          ],
          temperature: 0.7,
          max_tokens: 120
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
        ticketsRemaining: ticketData.tickets_remaining - 1,
        nextReset: ticketData.next_reset
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
