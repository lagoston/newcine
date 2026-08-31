import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, Tag, Palette, Users, BrainCircuit, Lock, Check, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { getContinent } from '../lib/continents';
import { PROGRESSION_TAGS, THEME_TAGS, COMMUNITY_TAGS, ORACLE_TAGS, FRANCHISE_MOVIES } from '../lib/tags';

interface TagPinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

type ViewMode = 'pins' | 'basic' | 'theme' | 'community' | 'oracle' | 'special';

interface UnlockedPin {
  emoji: string;
  name: string;
  category: 'basic' | 'theme' | 'community' | 'oracle' | 'special';
}

interface SpecialTag {
  id: string;
  name: string;
  emoji: string;
  description: string;
  requirement_description: string;
  starts_at: string | null;
  ends_at: string | null;
  is_unlocked: boolean;
  unlocked_at?: string;
  is_currently_active: boolean;
}

interface ActiveTag {
  category: string;
  name: string;
  emoji: string;
}

// Mesmas cores que existiam em CustomizeModal.tsx antes de o sistema de
// tags migrar pra cá — nada mudou na paleta, só o endereço.
const getTagColorClasses = (category: string) => {
  switch (category) {
    case 'basic':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'theme':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    case 'community':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'oracle':
      return 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400';
    case 'special':
      return 'bg-black dark:bg-black text-white dark:text-gray-100';
    default:
      return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
  }
};

const getCategoryButtonStyle = (isActive: boolean, category: string) => {
  switch (category) {
    case 'basic':
      return isActive
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600';
    case 'theme':
      return isActive
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-yellow-600 text-white hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600';
    case 'community':
      return isActive
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
    case 'oracle':
      return isActive
        ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
        : 'bg-pink-600 text-white hover:bg-pink-700 dark:bg-pink-500 dark:hover:bg-pink-600';
    case 'special':
      return isActive
        ? 'bg-black text-white dark:bg-gray-800 dark:text-gray-100'
        : 'bg-black text-white hover:bg-gray-900 dark:bg-black dark:hover:bg-gray-900';
    default:
      return isActive
        ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
        : 'bg-gray-600 text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600';
  }
};

const formatTimeRemaining = (endsAt: string) => {
  const now = new Date();
  const end = new Date(endsAt);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 30) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''} left`;
  }
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
};

// Todo o sistema de categorias, progresso e ativação de tags que antes
// morava em CustomizeModal.tsx — movido pra cá pra não ficar redundante
// entre os dois modais. O CustomizeModal manteve só avatar/banner/cards.
const TagPinsModal: React.FC<TagPinsModalProps> = ({ isOpen, onClose, userId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('pins');
  const [savingTag, setSavingTag] = useState(false);

  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [basicTagProgress, setBasicTagProgress] = useState<Record<string, number>>({});
  const [themeTagProgress, setThemeTagProgress] = useState<Record<string, number>>({});
  const [oracleTagProgress, setOracleTagProgress] = useState<Record<string, number>>({});
  const [specialTags, setSpecialTags] = useState<SpecialTag[]>([]);
  const [activeTag, setActiveTag] = useState<ActiveTag | null>(null);
  const [pins, setPins] = useState<UnlockedPin[]>([]);

  useEffect(() => {
    if (isOpen && userId) {
      fetchAllData();
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

  useEffect(() => {
    if (!isOpen) {
      setViewMode('pins');
    }
  }, [isOpen]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      const { data: userMovies } = await supabase
        .from('user_movies')
        .select('movie_id, rating, movies!inner(media_type)')
        .eq('user_id', userId)
        .not('rating', 'is', null);

      const ratedCount = userMovies?.length || 0;
      setRatedMoviesCount(ratedCount);

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
      setBasicTagProgress(basicProgress);

      const { data: userMoviesForTheme } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', userId)
        .not('rating', 'is', null);
      const ratedMovieIds = new Set((userMoviesForTheme || []).map((m: any) => m.movie_id));
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
      setThemeTagProgress(themeProgress);

      const { count: followers } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', userId);
      setFollowersCount(followers || 0);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('oracle_predictions_count, oracle_recommendations_count, active_tag')
        .eq('id', userId)
        .single();

      const oracleProgress: Record<string, number> = {};
      const predictionsCount = profileData?.oracle_predictions_count || 0;
      const recommendationsCount = profileData?.oracle_recommendations_count || 0;
      ORACLE_TAGS.forEach((tag) => {
        oracleProgress[tag.name] = tag.type === 'prediction' ? predictionsCount : recommendationsCount;
      });
      setOracleTagProgress(oracleProgress);

      if (profileData?.active_tag) {
        setActiveTag(profileData.active_tag as ActiveTag);
      }

      const { data: allSpecialTags } = await supabase.from('special_tags').select('*');
      const { data: userSpecialTags } = await supabase
        .from('user_special_tags')
        .select('tag_id, unlocked_at, is_permanent')
        .eq('user_id', userId);

      const userTagsMap = new Map((userSpecialTags || []).map((ut: any) => [ut.tag_id, ut]));
      const now = new Date();
      const specialTagsWithStatus: SpecialTag[] = (allSpecialTags || [])
        .map((tag: any) => {
          const userTag: any = userTagsMap.get(tag.id);
          const isCurrentlyActive = !tag.ends_at || new Date(tag.ends_at) > now;
          return {
            id: tag.id,
            name: tag.name,
            emoji: tag.emoji,
            description: tag.description,
            requirement_description: tag.requirement_description,
            starts_at: tag.starts_at,
            ends_at: tag.ends_at,
            is_unlocked: !!userTag,
            unlocked_at: userTag?.unlocked_at,
            is_currently_active: isCurrentlyActive
          };
        })
        .filter((tag) => tag.is_unlocked || tag.is_currently_active);
      setSpecialTags(specialTagsWithStatus);

      // ---- Deriva a lista de pins desbloqueados de todos os dados já
      // buscados acima, sem precisar de nenhuma consulta extra. ----
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
      ORACLE_TAGS.forEach((tag) => {
        const count = tag.type === 'prediction' ? predictionsCount : recommendationsCount;
        if (count >= tag.minCount) unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'oracle' });
      });
      specialTagsWithStatus.forEach((tag) => {
        if (tag.is_unlocked) unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'special' });
      });

      setPins(unlockedPins);
    } catch (error) {
      console.error('Error fetching tag pins data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseTag = async (tag: { name: string; emoji: string }, category: string) => {
    if (savingTag) return;
    try {
      setSavingTag(true);
      const isCurrentlyActive = activeTag?.name === tag.name;
      const newTag = isCurrentlyActive ? null : { category, name: tag.name, emoji: tag.emoji };

      const { error } = await supabase
        .from('profiles')
        .update({ active_tag: newTag })
        .eq('id', userId);

      if (error) throw error;

      setActiveTag(newTag);
      toast.success(isCurrentlyActive ? t('customize.tagRemoved') : t('customize.tagUpdated'));
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error(t('customize.updateError'));
    } finally {
      setSavingTag(false);
    }
  };

  const categories: { id: ViewMode; label: string; icon: any }[] = [
    { id: 'pins', label: t('profile.myPins', { defaultValue: isPt ? 'Meus Pins' : 'My Pins' }), icon: Sparkles },
    { id: 'basic', label: t('customize.categories.basic'), icon: Tag },
    { id: 'theme', label: t('customize.categories.theme'), icon: Palette },
    { id: 'community', label: t('customize.categories.community'), icon: Users },
    { id: 'oracle', label: t('customize.categories.oracle'), icon: BrainCircuit },
    { id: 'special', label: t('customize.categories.special'), icon: Sparkles }
  ];

  const renderPinsView = () => {
    if (pins.length === 0) {
      return (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{t('profile.noTagPins', { defaultValue: isPt ? 'Nenhum pin desbloqueado ainda.' : 'No pins unlocked yet.' })}</p>
        </div>
      );
    }
    return (
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
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border border-transparent hover:border-blue-400/50 dark:hover:border-blue-500/50 transition-colors ${getTagColorClasses(pin.category)}`}
            >
              <span className="text-3xl leading-none">{pin.emoji}</span>
              <span className="text-[10px] text-center text-gray-600 dark:text-gray-300 line-clamp-2 leading-tight">
                {pin.name}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderCategoryContent = () => {
    switch (viewMode) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('customize.progress.moviesRated', { count: ratedMoviesCount })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {PROGRESSION_TAGS.map((tag) => {
                const progress = tag.condition ? basicTagProgress[tag.name] || 0 : ratedMoviesCount;
                const isUnlocked = progress >= tag.minMovies;
                const progressPercentage = tag.maxMovies
                  ? Math.min(100, (progress - tag.minMovies) / (tag.maxMovies - tag.minMovies) * 100)
                  : progress >= tag.minMovies ? 100 : (progress / tag.minMovies) * 100;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative rounded-2xl border ${
                      isUnlocked
                        ? 'border-green-300/50 dark:border-green-700/50 bg-green-50/50 dark:bg-green-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${isUnlocked ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {isPt ? tag.descriptionPt : tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>{progress}</span>
                          <span className="text-gray-400 dark:text-gray-500">/{tag.minMovies}</span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'basic')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${getCategoryButtonStyle(isActive, 'basic')}`}
                        >
                          {isActive ? (
                            <span className="flex items-center"><Check className="w-4 h-4 mr-1" />{t('customize.tags.active')}</span>
                          ) : savingTag ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            t('customize.tags.use')
                          )}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isUnlocked ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'theme':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {THEME_TAGS.map((tag) => {
              const progress = themeTagProgress[tag.id] || 0;
              const isUnlocked = progress >= tag.condition.count;
              const isActive = activeTag?.name === tag.name;

              return (
                <div
                  key={tag.id}
                  className={`relative rounded-2xl border ${
                    isUnlocked
                      ? 'border-yellow-300/50 dark:border-yellow-700/50 bg-yellow-50/50 dark:bg-yellow-900/20'
                      : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                  } p-4 transition-all duration-200`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{tag.emoji}</span>
                        <span className={`text-sm font-medium ${isUnlocked ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'}`}>
                          {tag.name}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {isPt ? tag.requirementPt : tag.requirement}
                      </p>
                      <div className="mt-2 text-sm">
                        <span className={isUnlocked ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}>{progress}</span>
                        <span className="text-gray-400 dark:text-gray-500">/{tag.condition.count}</span>
                      </div>
                    </div>
                    {!isUnlocked ? (
                      <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <button
                        onClick={() => handleUseTag(tag, 'theme')}
                        disabled={savingTag}
                        className={`px-3 py-1 text-sm rounded-lg transition-colors ${getCategoryButtonStyle(isActive, 'theme')}`}
                      >
                        {isActive ? (
                          <span className="flex items-center"><Check className="w-4 h-4 mr-1" />Active</span>
                        ) : savingTag ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : 'Use'}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isUnlocked ? 'bg-gradient-to-r from-yellow-400 to-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      style={{ width: `${Math.min(100, (progress / tag.condition.count) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'community':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('customize.progress.followers', { count: followersCount })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {COMMUNITY_TAGS.map((tag) => {
                const isUnlocked = followersCount >= tag.minFollowers;
                const progress = tag.maxFollowers
                  ? Math.min(100, (followersCount - tag.minFollowers) / (tag.maxFollowers - tag.minFollowers) * 100)
                  : followersCount >= tag.minFollowers ? 100 : 0;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative rounded-2xl border ${
                      isUnlocked
                        ? 'border-blue-300/50 dark:border-blue-700/50 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${isUnlocked ? 'text-blue-700 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {isPt ? tag.descriptionPt : tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}>{followersCount}</span>
                          <span className="text-gray-400 dark:text-gray-500">/{tag.maxFollowers || tag.minFollowers}+</span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'community')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${getCategoryButtonStyle(isActive, 'community')}`}
                        >
                          {isActive ? (
                            <span className="flex items-center"><Check className="w-4 h-4 mr-1" />{t('customize.tags.active')}</span>
                          ) : savingTag ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            t('customize.tags.use')
                          )}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isUnlocked ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'oracle':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 space-y-1">
              <div>{t('customize.progress.predictions')}: {oracleTagProgress['Curious Seeker'] || 0}</div>
              <div>{t('customize.progress.recommendations')}: {oracleTagProgress['Popcorn Taster'] || 0}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ORACLE_TAGS.map((tag) => {
                const progress = oracleTagProgress[tag.name] || 0;
                const isUnlocked = progress >= tag.minCount;
                const progressPercentage = tag.maxCount
                  ? Math.min(100, (progress - tag.minCount) / (tag.maxCount - tag.minCount) * 100)
                  : progress >= tag.minCount ? 100 : (progress / tag.minCount) * 100;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative rounded-2xl border ${
                      isUnlocked
                        ? 'border-pink-300/50 dark:border-pink-700/50 bg-pink-50/50 dark:bg-pink-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${isUnlocked ? 'text-pink-700 dark:text-pink-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {isPt ? tag.descriptionPt : tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-400'}>{progress}</span>
                          <span className="text-gray-400 dark:text-gray-500">/{tag.maxCount || tag.minCount}+</span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'oracle')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${getCategoryButtonStyle(isActive, 'oracle')}`}
                        >
                          {isActive ? (
                            <span className="flex items-center"><Check className="w-4 h-4 mr-1" />{t('customize.tags.active')}</span>
                          ) : savingTag ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            t('customize.tags.use')
                          )}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${isUnlocked ? 'bg-gradient-to-r from-pink-400 to-rose-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'special':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('customize.tags.limitedTime')}
            </div>
            {specialTags.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('customize.tags.noSpecialTags')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {specialTags.map((tag) => {
                  const isActive = activeTag?.name === tag.name;
                  return (
                    <div
                      key={tag.id}
                      className={`relative rounded-2xl border ${
                        tag.is_unlocked
                          ? 'border-black/50 dark:border-gray-500/40 bg-black/[0.06] dark:bg-black/20'
                          : 'border-gray-300/50 dark:border-gray-700/50 bg-gray-100/50 dark:bg-gray-800/20'
                      } p-4 transition-all duration-200`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{tag.emoji}</span>
                            <span className={`text-sm font-medium ${tag.is_unlocked ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                              {tag.name}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{tag.description}</p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{tag.requirement_description}</p>
                          {tag.ends_at && tag.is_currently_active && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-amber-600 dark:text-amber-400 font-medium">{formatTimeRemaining(tag.ends_at)}</span>
                            </div>
                          )}
                          {tag.ends_at && !tag.is_currently_active && tag.is_unlocked && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs">
                              <Sparkles className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                              <span className="text-gray-500 dark:text-gray-400 font-medium">
                                {t('customize.tags.permanentlyEarned')}
                              </span>
                            </div>
                          )}
                        </div>
                        {!tag.is_unlocked ? (
                          <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                        ) : (
                          <button
                            onClick={() => handleUseTag({ name: tag.name, emoji: tag.emoji }, 'special')}
                            disabled={savingTag}
                            className={`px-3 py-1 text-sm rounded-lg transition-colors ${getCategoryButtonStyle(isActive, 'special')}`}
                          >
                            {isActive ? (
                              <span className="flex items-center"><Check className="w-4 h-4 mr-1" />{t('customize.tags.active')}</span>
                            ) : savingTag ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              t('customize.tags.use')
                            )}
                          </button>
                        )}
                      </div>
                      {tag.is_unlocked && (
                        <div className="mt-3 h-1.5 bg-gray-200 dark:bg-gray-800/40 rounded-full overflow-hidden">
                          <div className="h-full w-full rounded-full bg-black dark:bg-gray-300" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      default:
        return null;
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
            className="relative w-full max-w-3xl max-h-[calc(100dvh-env(safe-area-inset-top)-4rem)] flex flex-col bg-white/95 dark:bg-gray-800/95 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
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

            <div className="flex-shrink-0 px-6 pt-4">
              <div className="flex gap-2 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {categories.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setViewMode(id)}
                    className={`flex items-center flex-shrink-0 whitespace-nowrap px-3.5 py-2 text-sm font-medium rounded-xl transition-all ${
                      viewMode === id
                        ? id === 'pins'
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                          : getTagColorClasses(id)
                        : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : viewMode === 'pins' ? (
                renderPinsView()
              ) : (
                renderCategoryContent()
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