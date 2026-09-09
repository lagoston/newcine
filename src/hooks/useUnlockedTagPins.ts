import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getContinent } from '../lib/continents';
import { PROGRESSION_TAGS, THEME_TAGS, COMMUNITY_TAGS, FRANCHISE_MOVIES } from '../lib/tags';

export interface UnlockedPin {
  emoji: string;
  name: string;
  category: 'basic' | 'theme' | 'community' | 'special';
}

// Extraído do TagPinsModal.tsx pra ser reaproveitado em qualquer lugar que
// precise só da LISTA de pins desbloqueados de um usuário (sem o resto do
// sistema de progresso/ativação, que só faz sentido dentro do modal
// completo) — usado tanto lá quanto no card de pins do perfil de outros
// usuários, evitando duplicar essa lógica de cálculo duas vezes.
export function useUnlockedTagPins(userId: string | undefined) {
  const [pins, setPins] = useState<UnlockedPin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setPins([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const { data: userMovies } = await supabase
          .from('user_movies')
          .select('movie_id, rating, movies!inner(media_type)')
          .eq('user_id', userId)
          .not('rating', 'is', null);

        const ratedCount = userMovies?.length || 0;
        const basicProgress: Record<string, number> = {};

        if (userMovies && userMovies.length > 0) {
          basicProgress['CineHater'] = userMovies.filter((m: any) => m.rating <= 2).length;
          basicProgress['Golden Reel'] = userMovies.filter((m: any) => m.rating === 10).length;

          const movieIds = [...new Set(userMovies.map((m: any) => m.movie_id))];
          const { data: cacheData } = await supabase
            .from('movie_cache')
            .select('tmdb_id, media_type, genres_en, director, origin_country')
            .in('tmdb_id', movieIds);

          const cacheMap = new Map((cacheData || []).map((m: any) => [`${m.tmdb_id}_${m.media_type}`, m]));
          const genreCounts: Record<string, number> = {};
          const directorCounts: Record<string, number> = {};
          const countrySet = new Set<string>();
          const continentSet = new Set<string>();

          userMovies.forEach((entry: any) => {
            const mediaType = entry.movies?.media_type || 'movie';
            const cached: any = cacheMap.get(`${entry.movie_id}_${mediaType}`);
            if (cached?.genres_en) {
              cached.genres_en.forEach((g: any) => {
                genreCounts[g.name] = (genreCounts[g.name] || 0) + 1;
              });
            }
            if (cached?.director) {
              directorCounts[cached.director] = (directorCounts[cached.director] || 0) + 1;
            }
            const countryCode = cached?.origin_country?.[0];
            if (countryCode) {
              countrySet.add(countryCode);
              const continent = getContinent(countryCode);
              if (continent) continentSet.add(continent);
            }
          });

          const countGenres = (...keys: string[]) => keys.reduce((sum, k) => sum + (genreCounts[k] || 0), 0);
          basicProgress['Bloody Mary'] = countGenres('Horror', 'Terror');
          basicProgress['Punchliner'] = countGenres('Comedy', 'Comédia');
          basicProgress['Star Gazer'] = countGenres('Science Fiction', 'Ficção científica', 'Sci-Fi & Fantasy');
          basicProgress['Cine Cupid'] = countGenres('Romance');
          basicProgress['Truth Digger'] = countGenres('Documentary', 'Documentário');
          basicProgress["Director's Cut"] = Math.max(...Object.values(directorCounts), 0);
          basicProgress['Nowhere'] = countrySet.size;
          basicProgress['World Tour'] = continentSet.size;
        }

        const ratedMovieIds = new Set((userMovies || []).map((m: any) => m.movie_id));
        const themeProgress: Record<string, number> = {};
        Object.entries(FRANCHISE_MOVIES).forEach(([franchise, movieIds]) => {
          const watchedCount = movieIds.filter((id) => ratedMovieIds.has(id)).length;
          const tagId = THEME_TAGS.find((tag) => tag.condition.type === 'franchise' && tag.condition.value === franchise)?.id;
          if (tagId) themeProgress[tagId] = watchedCount;
        });
        THEME_TAGS.forEach((tag) => {
          if (tag.condition.type === 'franchise' && Array.isArray(tag.condition.value)) {
            const watchedCount = tag.condition.value.filter((id) => ratedMovieIds.has(id)).length;
            themeProgress[tag.id] = watchedCount;
          }
        });

        const { count: followers } = await supabase
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', userId);

        // curated_pool — soma os movie_ids de TODOS os moods de cada
        // card_type (recommendation_pools guarda um pool por mood, não
        // um pool único por oráculo). Une os IDs num Set por card_type
        // antes de contar, pra não contar o mesmo filme mais de uma vez
        // caso ele apareça em vários moods do mesmo oráculo.
        const { data: poolRows } = await supabase
          .from('recommendation_pools')
          .select('card_type, movie_ids');

        const poolIdsByType: Record<string, Set<number>> = {};
        (poolRows || []).forEach((row: any) => {
          if (!poolIdsByType[row.card_type]) poolIdsByType[row.card_type] = new Set();
          (row.movie_ids || []).forEach((id: number) => poolIdsByType[row.card_type].add(id));
        });
        const curatedProgress: Record<string, number> = {};
        Object.keys(poolIdsByType).forEach((cardType) => {
          curatedProgress[cardType] = [...poolIdsByType[cardType]].filter((id) => ratedMovieIds.has(id)).length;
        });

        // review_count / ai_review_count — reais vs. geradas pelo
        // Oráculo, contadas separadamente.
        const [{ count: realReviewCount }, { count: aiReviewCount }] = await Promise.all([
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_ai_generated', false),
          supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_ai_generated', true),
        ]);

        // completed_series — pelo menos uma série na biblioteca que já
        // terminou (não está mais no ar) E tem 100% dos episódios já
        // lançados assistidos. Reaproveita a mesma RPC que já calcula
        // isso pra barra de progresso na Biblioteca.
        const tvIds = (userMovies || [])
          .filter((m: any) => m.movies?.media_type === 'tv')
          .map((m: any) => m.movie_id);

        let hasCompletedSeries = false;
        if (tvIds.length > 0) {
          const [{ data: progressRows }, { data: tvCacheRows }] = await Promise.all([
            supabase.rpc('get_tv_progress_batch', { p_user_id: userId, p_tmdb_ids: tvIds }),
            supabase.from('movie_cache').select('tmdb_id, status').eq('media_type', 'tv').in('tmdb_id', tvIds),
          ]);
          const statusMap = new Map((tvCacheRows || []).map((r: any) => [r.tmdb_id, r.status]));
          hasCompletedSeries = (progressRows || []).some((p: any) => {
            const status = statusMap.get(p.tmdb_id);
            const isFinished = status === 'Ended' || status === 'Canceled';
            return isFinished && p.aired_count > 0 && p.watched_count >= p.aired_count;
          });
        }

        const { data: allSpecialTags } = await supabase.from('special_tags').select('id, name, emoji');
        const { data: userSpecialTags } = await supabase
          .from('user_special_tags')
          .select('tag_id')
          .eq('user_id', userId);

        const unlockedSpecialIds = new Set((userSpecialTags || []).map((ut: any) => ut.tag_id));

        // review_count e completed_series são condições da categoria
        // básica (PROGRESSION_TAGS) — preenche basicProgress usando o
        // nome de cada tag, mesmo padrão já usado pras outras condições
        // básicas (Bloody Mary, Nowhere, etc).
        basicProgress['Scribbler'] = realReviewCount || 0;
        basicProgress['Screenwriter'] = realReviewCount || 0;
        basicProgress['Memoirist'] = realReviewCount || 0;
        basicProgress['Sofa Sleeper'] = hasCompletedSeries ? 1 : 0;

        // curated_pool e ai_review_count são condições temáticas —
        // preenche themeProgress por tag.id, mesmo padrão já usado pra
        // franchise.
        THEME_TAGS.forEach((tag) => {
          if (tag.condition.type === 'curated_pool' && typeof tag.condition.value === 'string') {
            themeProgress[tag.id] = curatedProgress[tag.condition.value] || 0;
          } else if (tag.condition.type === 'ai_review_count') {
            themeProgress[tag.id] = aiReviewCount || 0;
          }
        });

        const unlockedPins: UnlockedPin[] = [];

        PROGRESSION_TAGS.forEach((tag) => {
          const progress = tag.condition ? (basicProgress[tag.name] || 0) : ratedCount;
          if (progress >= tag.minMovies) unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'basic' });
        });
        THEME_TAGS.forEach((tag) => {
          if ((themeProgress[tag.id] || 0) >= tag.condition.count) {
            unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'theme' });
          }
        });
        COMMUNITY_TAGS.forEach((tag) => {
          if ((followers || 0) >= tag.minFollowers) unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'community' });
        });
        (allSpecialTags || []).forEach((tag: any) => {
          if (unlockedSpecialIds.has(tag.id)) {
            unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'special' });
          }
        });

        if (!cancelled) setPins(unlockedPins);
      } catch (error) {
        console.error('Error fetching unlocked tag pins:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { pins, loading };
}