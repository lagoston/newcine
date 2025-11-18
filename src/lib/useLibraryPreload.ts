import { useEffect, useRef } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';
import { cache, CACHE_KEYS, CACHE_TTL } from './cache';
import { getMovieDetails } from './tmdb';

interface UserMovie {
  movie_id: number;
  rating: number | null;
}

/**
 * Hook para pré-carregar a biblioteca do usuário em segundo plano
 * Inicia automaticamente ao logar e mantém o cache atualizado
 */
export const useLibraryPreload = () => {
  const { session } = useAuth();
  const isPreloading = useRef(false);
  const hasPreloaded = useRef(false);

  useEffect(() => {
    if (!session?.user?.id) {
      hasPreloaded.current = false;
      return;
    }

    // Evitar múltiplas execuções simultâneas
    if (isPreloading.current || hasPreloaded.current) {
      return;
    }

    // Verificar se já existe cache válido
    const cached = cache.get(CACHE_KEYS.USER_LIBRARY(session.user.id));
    if (cached) {
      hasPreloaded.current = true;
      return;
    }

    // Iniciar pré-carregamento em background
    preloadLibrary(session.user.id);
  }, [session?.user?.id]);

  const preloadLibrary = async (userId: string) => {
    if (isPreloading.current) return;

    try {
      isPreloading.current = true;
      console.log('🎬 Starting background library preload...');

      // 1. Buscar IDs dos filmes do usuário
      const { data: userMoviesData, error: userMoviesError } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (userMoviesError) {
        console.error('Error preloading user movies:', userMoviesError);
        return;
      }

      if (!userMoviesData || userMoviesData.length === 0) {
        console.log('📭 No movies to preload');
        cache.set(CACHE_KEYS.USER_LIBRARY(userId), [], CACHE_TTL.LIBRARY);
        hasPreloaded.current = true;
        return;
      }

      console.log(`🎬 Preloading ${userMoviesData.length} movies...`);

      // 2. Carregar detalhes dos filmes em lotes para não sobrecarregar
      const batchSize = 10;
      const movies: any[] = [];

      for (let i = 0; i < userMoviesData.length; i += batchSize) {
        const batch = userMoviesData.slice(i, i + batchSize);

        const batchResults = await Promise.allSettled(
          batch.map(async (um: UserMovie) => {
            try {
              const details = await getMovieDetails(um.movie_id);
              return {
                ...details,
                rating: um.rating
              };
            } catch (error) {
              console.error(`Failed to preload movie ${um.movie_id}:`, error);
              return null;
            }
          })
        );

        // Adicionar apenas filmes carregados com sucesso
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            movies.push(result.value);
          }
        });

        // Atualizar cache progressivamente
        cache.set(CACHE_KEYS.USER_LIBRARY(userId), movies, CACHE_TTL.LIBRARY);

        console.log(`✅ Preloaded ${movies.length}/${userMoviesData.length} movies`);

        // Pequeno delay entre lotes para não sobrecarregar
        if (i + batchSize < userMoviesData.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`🎉 Library preload complete: ${movies.length} movies cached`);
      hasPreloaded.current = true;

    } catch (error) {
      console.error('Error in library preload:', error);
    } finally {
      isPreloading.current = false;
    }
  };

  return {
    isPreloading: isPreloading.current,
    hasPreloaded: hasPreloaded.current
  };
};
