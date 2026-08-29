import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { getContinent } from '../lib/continents';
import { PROGRESSION_TAGS, THEME_TAGS, COMMUNITY_TAGS, ORACLE_TAGS, FRANCHISE_MOVIES } from '../lib/tags';

interface TagPinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface UnlockedPin {
  emoji: string;
  name: string;
  namePt: string;
}

// Mesma lógica de cálculo de progresso já usada em CustomizeModal.tsx
// (busca de dados + comparação com os limiares de cada tag) — reaproveitada
// aqui porque esse modal precisa funcionar de forma independente, aberto
// direto do Profile, sem depender do CustomizeModal estar montado.
const TagPinsModal: React.FC<TagPinsModalProps> = ({ isOpen, onClose, userId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [loading, setLoading] = useState(true);
  const [pins, setPins] = useState<UnlockedPin[]>([]);

  useEffect(() => {
    if (isOpen && userId) {
      fetchUnlockedPins();
    }
  }, [isOpen, userId]);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  const fetchUnlockedPins = async () => {
    try {
      setLoading(true);
      const unlocked: UnlockedPin[] = [];

      // ---- Tags básicas/progressão (filmes avaliados, gêneros, etc.) ----
      const { data: userMovies } = await supabase
        .from('user_movies')
        .select('movie_id, rating, movies!inner(media_type)')
        .eq('user_id', userId)
        .not('rating', 'is', null);

      const ratedMoviesCount = userMovies?.length || 0;
      const basicProgress: Record<string, number> = {};

      if (userMovies && userMovies.length > 0) {
        basicProgress['CineHater'] = userMovies.filter((m: any) => m.rating <= 2).length;
        basicProgress['Golden Reel'] = userMovies.filter((m: any) => m.rating === 10).length;

        const movieIds = [...new Set(userMovies.map((m: any) => m.movie_id))];
        const { data: cacheData } = await supabase
          .from('movie_cache')
          .select('tmdb_id, media_type, genres_en, director, origin_country')
          .in('tmdb_id', movieIds);

        const cacheMap = new Map(
          (cacheData || []).map((m: any) => [`${m.tmdb_id}_${m.media_type}`, m])
        );

        const genreCounts: Record<string, number> = {};
        const directorCounts: Record<string, number> = {};
        const countrySet = new Set<string>();
        const continentSet = new Set<string>();

        userMovies.forEach((entry: any) => {
          const mediaType = entry.movies?.media_type || 'movie';
          const cached = cacheMap.get(`${entry.movie_id}_${mediaType}`);
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

      PROGRESSION_TAGS.forEach((tag) => {
        const progress = tag.condition ? (basicProgress[tag.name] || 0) : ratedMoviesCount;
        if (progress >= tag.minMovies) {
          unlocked.push({ emoji: tag.emoji, name: tag.name, namePt: tag.name });
        }
      });

      // ---- Tags de tema (franquias) ----
      const ratedMovieIds = new Set((userMovies || []).map((m: any) => m.movie_id));
      THEME_TAGS.forEach((tag) => {
        if (tag.condition.type === 'franchise') {
          const franchiseMovies = Array.isArray(tag.condition.value)
            ? tag.condition.value
            : FRANCHISE_MOVIES[tag.condition.value as keyof typeof FRANCHISE_MOVIES];
          const watchedCount = (franchiseMovies || []).filter((id) => ratedMovieIds.has(id)).length;
          if (watchedCount >= tag.condition.count) {
            unlocked.push({ emoji: tag.emoji, name: tag.name, namePt: tag.name });
          }
        }
      });

      // ---- Tags de comunidade (seguidores) ----
      const { count: followersCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);

      COMMUNITY_TAGS.forEach((tag) => {
        if ((followersCount || 0) >= tag.minFollowers) {
          unlocked.push({ emoji: tag.emoji, name: tag.name, namePt: tag.name });
        }
      });

      // ---- Tags do oráculo (previsões/recomendações) ----
      const { data: profileData } = await supabase
        .from('profiles')
        .select('oracle_predictions_count, oracle_recommendations_count')
        .eq('id', userId)
        .single();

      ORACLE_TAGS.forEach((tag) => {
        const count = tag.type === 'prediction'
          ? (profileData?.oracle_predictions_count || 0)
          : (profileData?.oracle_recommendations_count || 0);
        if (count >= tag.minCount) {
          unlocked.push({ emoji: tag.emoji, name: tag.name, namePt: tag.name });
        }
      });

      // ---- Tags especiais (sazonais/eventos) ----
      const { data: userSpecialTags } = await supabase
        .from('user_special_tags')
        .select('tag_id')
        .eq('user_id', userId);

      if (userSpecialTags && userSpecialTags.length > 0) {
        const { data: specialTagDefs } = await supabase
          .from('special_tags')
          .select('id, name, emoji')
          .in('id', userSpecialTags.map((t: any) => t.tag_id));

        (specialTagDefs || []).forEach((tag: any) => {
          unlocked.push({ emoji: tag.emoji, name: tag.name, namePt: tag.name });
        });
      }

      setPins(unlocked);
    } catch (error) {
      console.error('Error fetching unlocked tag pins:', error);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-4rem)] flex flex-col bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
          >
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                {t('profile.tagPins', { defaultValue: isPt ? 'Pins de Tags' : 'Tag Pins' })}
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : pins.length === 0 ? (
                <div className="text-center py-16 text-gray-500 dark:text-gray-400">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>{t('profile.noTagPins', { defaultValue: isPt ? 'Nenhum pin desbloqueado ainda.' : 'No pins unlocked yet.' })}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {isPt
                      ? `${pins.length} pin${pins.length === 1 ? '' : 's'} desbloqueado${pins.length === 1 ? '' : 's'}`
                      : `${pins.length} pin${pins.length === 1 ? '' : 's'} unlocked`}
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                    {pins.map((pin, idx) => (
                      <div
                        key={`${pin.name}-${idx}`}
                        title={pin.name}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-gray-50/80 dark:bg-gray-700/40 border border-gray-200/50 dark:border-gray-600/40 hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-colors"
                      >
                        <span className="text-3xl leading-none">{pin.emoji}</span>
                        <span className="text-[10px] text-center text-gray-600 dark:text-gray-300 line-clamp-2 leading-tight">
                          {pin.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default TagPinsModal;