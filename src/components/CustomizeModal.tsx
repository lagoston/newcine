import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Tag, Layout, Crown, Star, BrainCircuit, Users, Lock, Loader2, Check, Palette, User, Film, Sparkles, Clock } from 'lucide-react';
import GlassLoader from './GlassLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { frames, FrameId } from '../lib/frames';
import { getContinent } from '../lib/continents';
import { ProgressionTag, ThemeTag, CommunityTag, OracleTag, PROGRESSION_TAGS, THEME_TAGS, COMMUNITY_TAGS, ORACLE_TAGS, FRANCHISE_MOVIES } from '../lib/tags';
import { banners, BannerId } from '../lib/banners';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface CustomizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

interface Frame {
  id: string;
  name: string;
  isPremium: boolean;
  className: string;
}

type TabType = 'frames' | 'banners' | 'tags' | 'cards';
type TagCategory = 'basic' | 'theme' | 'community' | 'oracle' | 'special';




const ORACLE_CARDS: Record<CardStyle, OracleCard> = {
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    images: {
      bogart: '/assets/BOGART.webp',
      fincher: '/assets/FINCHER.webp',
      cypher: '/assets/CYPHER.webp'
    }
  },
  yugioh: {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    isPremium: true,
    images: {
      bogart: '/assets/BOGART2.webp',
      fincher: '/assets/FINCHER2.webp',
      cypher: '/assets/CYPHER2.webp'
    }
  },
  horror: {
    id: 'horror',
    name: 'Horror',
    isPremium: true,
    requiredTag: 'Bloody Mary',
    images: {
      bogart: '/assets/BOGART3.webp',
      fincher: '/assets/FINCHER3.webp',
      cypher: '/assets/CYPHER3.webp'
    }
  }
};

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
      return 'bg-red-900 dark:bg-red-900/60 text-white dark:text-red-100';
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
        ? 'bg-red-800 text-white dark:bg-red-900/70 dark:text-red-100'
        : 'bg-red-900 text-white hover:bg-red-800 dark:bg-red-900 dark:hover:bg-red-800';
    default:
      return isActive
        ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
        : 'bg-gray-600 text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600';
  }
};

const CustomizeModal: React.FC<CustomizeModalProps> = ({ isOpen, onClose, onSave }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const { session, isPremium } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('frames');
  const [activeTagCategory, setActiveTagCategory] = useState<TagCategory>('basic');
  const [ratedMoviesCount, setRatedMoviesCount] = useState<number>(0);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [themeTagProgress, setThemeTagProgress] = useState<Record<string, number>>({});
  const [basicTagProgress, setBasicTagProgress] = useState<Record<string, number>>({});
  const [oracleTagProgress, setOracleTagProgress] = useState<Record<string, number>>({});
  const [specialTags, setSpecialTags] = useState<SpecialTag[]>([]);
  const [activeTag, setActiveTag] = useState<ActiveTag | null>(null);
  const [savingTag, setSavingTag] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<FrameId>('default');
  const [selectedBanner, setSelectedBanner] = useState<BannerId>('default');
  const [selectedCard, setSelectedCard] = useState<CardStyle>('default');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [frozenAvatarUrl, setFrozenAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id && isOpen) {
      fetchProfile();
      fetchRatedMoviesCount();
      fetchThemeTagProgress();
      fetchBasicTagProgress();
      fetchOracleTagProgress();
      fetchSpecialTags();
      fetchActiveTag();
      fetchFollowersCount();
    }
  }, [session?.user?.id, isOpen]);

    // Se o avatar do usuário for um GIF, congela o primeiro frame numa imagem
  // estática uma única vez (via canvas) e reaproveita em todas as prévias de
  // moldura — evita decodificar/animar o GIF 9 vezes ao mesmo tempo na tela.
  useEffect(() => {
    if (!userAvatarUrl) {
      setFrozenAvatarUrl(null);
      return;
    }
    if (!userAvatarUrl.toLowerCase().includes('.gif')) {
      setFrozenAvatarUrl(userAvatarUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setFrozenAvatarUrl(userAvatarUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        setFrozenAvatarUrl(canvas.toDataURL('image/png'));
      } catch (err) {
        console.error('Error freezing GIF frame:', err);
        setFrozenAvatarUrl(userAvatarUrl);
      }
    };
    img.onerror = () => setFrozenAvatarUrl(userAvatarUrl);
    img.src = userAvatarUrl;
  }, [userAvatarUrl]);

    const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_frame, banner, card_style, avatar_url')
        .eq('id', session?.user?.id)
        .single();

      if (error) throw error;
      if (data?.avatar_frame) {
        setSelectedFrame(data.avatar_frame as FrameId);
      }
      if (data?.banner) {
        setSelectedBanner(data.banner as BannerId);
      }
      if (data?.card_style) {
        setSelectedCard(data.card_style as CardStyle);
      }
      setUserAvatarUrl(data?.avatar_url || null);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchFollowersCount = async () => {
    try {
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', session?.user?.id);

      if (error) throw error;
      setFollowersCount(count || 0);
    } catch (error) {
      console.error('Error fetching followers count:', error);
    }
  };

  const fetchActiveTag = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('active_tag')
        .eq('id', session?.user?.id)
        .single();

      if (error) throw error;
      if (data?.active_tag) {
        setActiveTag(data.active_tag as ActiveTag);
      }
    } catch (error) {
      console.error('Error fetching active tag:', error);
    }
  };

  const handleUseTag = async (tag: { name: string; emoji: string }, category: TagCategory) => {
    if (!session?.user?.id || savingTag) return;

    try {
      setSavingTag(true);

      const isCurrentlyActive = activeTag?.name === tag.name;
      const newTag = isCurrentlyActive ? null : { category, name: tag.name, emoji: tag.emoji };

      const { error } = await supabase
        .from('profiles')
        .update({ active_tag: newTag })
        .eq('id', session.user.id);

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

  const handleFrameSelect = async (frameId: FrameId) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_frame: frameId,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setSelectedFrame(frameId);
      toast.success(t('customize.frameUpdated'));
    } catch (error) {
      console.error('Error updating frame:', error);
      toast.error(t('customize.updateError'));
    }
  };

  const handleBannerSelect = async (bannerId: BannerId) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          banner: bannerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setSelectedBanner(bannerId);
      toast.success(t('customize.bannerUpdated'));
    } catch (error) {
      console.error('Error updating banner:', error);
      toast.error(t('customize.updateError'));
    }
  };

  const handleCardSelect = async (cardStyle: CardStyle) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          card_style: cardStyle,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setSelectedCard(cardStyle);
      toast.success(t('customize.cardUpdated'));
    } catch (error) {
      console.error('Error updating card style:', error);
      toast.error(t('customize.updateError'));
    }
  };

  const fetchRatedMoviesCount = async () => {
    try {
      setLoading(true);
      const { count, error } = await supabase
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session?.user?.id)
        .not('rating', 'is', null);

      if (error) throw error;
      setRatedMoviesCount(count || 0);
    } catch (error) {
      console.error('Error fetching rated movies count:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBasicTagProgress = async () => {
    if (!session?.user?.id) return;

    try {
      const progress: Record<string, number> = {};

      const { data: userMovies, error: userMoviesError } = await supabase
        .from('user_movies')
        .select('movie_id, rating, movies!inner(media_type)')
        .eq('user_id', session.user.id)
        .not('rating', 'is', null);

      if (userMoviesError) throw userMoviesError;

      if (userMovies && userMovies.length > 0) {
        const ratingCounts = {
          lowRatings: userMovies.filter(m => m.rating <= 2).length,
          perfectRatings: userMovies.filter(m => m.rating === 10).length
        };

        progress['CineHater'] = ratingCounts.lowRatings;
        progress['Golden Reel'] = ratingCounts.perfectRatings;

        const movieIds = [...new Set(userMovies.map(m => m.movie_id))];
        const { data: cacheData } = await supabase
          .from('movie_cache')
          .select('tmdb_id, media_type, genres_en, director, origin_country')
          .in('tmdb_id', movieIds);

        type CacheGenre = { id: number; name: string };
        type CacheEntry = { tmdb_id: number; media_type: string; genres_en: CacheGenre[] | null; director: string | null; origin_country: string[] | null };
        const cacheMap = new Map<string, CacheEntry>(
          ((cacheData as CacheEntry[]) || []).map(m => [`${m.tmdb_id}_${m.media_type}`, m])
        );

        const genreCounts: Record<string, number> = {};
        const directorCounts: Record<string, number> = {};
        const countrySet = new Set<string>();
        const continentSet = new Set<string>();

        userMovies.forEach((entry: any) => {
          const mediaType = entry.movies?.media_type || 'movie';
          const cached = cacheMap.get(`${entry.movie_id}_${mediaType}`);
          if (cached?.genres_en) {
            cached.genres_en.forEach(genre => {
              genreCounts[genre.name] = (genreCounts[genre.name] || 0) + 1;
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

        const countGenres = (...keys: string[]) =>
          keys.reduce((sum, k) => sum + (genreCounts[k] || 0), 0);

        progress['Bloody Mary'] = countGenres('Horror', 'Terror');
        progress['Punchliner'] = countGenres('Comedy', 'Comédia');
        progress['Star Gazer'] = countGenres('Science Fiction', 'Ficção científica', 'Sci-Fi & Fantasy');
        progress['Cine Cupid'] = countGenres('Romance');
        progress['Truth Digger'] = countGenres('Documentary', 'Documentário');

        progress["Director's Cut"] = Math.max(...Object.values(directorCounts), 0);
        progress['Nowhere'] = countrySet.size;
        progress['World Tour'] = continentSet.size;
      }

      setBasicTagProgress(progress);
    } catch (error) {
      console.error('Error fetching basic tag progress:', error);
    }
  };

  const fetchThemeTagProgress = async () => {
    if (!session?.user?.id) return;

    try {
      const progress: Record<string, number> = {};

      const { data: userMovies, error: userMoviesError } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', session.user.id)
        .not('rating', 'is', null);

      if (!userMoviesError && userMovies) {
        const ratedMovieIds = new Set(userMovies.map(movie => movie.movie_id));

        Object.entries(FRANCHISE_MOVIES).forEach(([franchise, movieIds]) => {
          const watchedCount = movieIds.filter(id => ratedMovieIds.has(id)).length;
          const tagId = THEME_TAGS.find(tag =>
            tag.condition.type === 'franchise' &&
            tag.condition.value === franchise
          )?.id;

          if (tagId) {
            progress[tagId] = watchedCount;
          }
        });

        THEME_TAGS.forEach(tag => {
          if (tag.condition.type === 'franchise' && Array.isArray(tag.condition.value)) {
            const watchedCount = tag.condition.value.filter(id => ratedMovieIds.has(id)).length;
            progress[tag.id] = watchedCount;
          }
        });
      }

      setThemeTagProgress(progress);
    } catch (error) {
      console.error('Error fetching theme tag progress:', error);
    }
  };

  const fetchOracleTagProgress = async () => {
    if (!session?.user?.id) return;

    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('oracle_predictions_count, oracle_recommendations_count')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      const progress: Record<string, number> = {};

      if (profileData) {
        const predictionsCount = profileData.oracle_predictions_count || 0;
        const recommendationsCount = profileData.oracle_recommendations_count || 0;

        ORACLE_TAGS.forEach(tag => {
          const count = tag.type === 'prediction' ? predictionsCount : recommendationsCount;
          progress[tag.name] = count;
        });
      }

      setOracleTagProgress(progress);
    } catch (error) {
      console.error('Error fetching oracle tag progress:', error);
    }
  };

  const fetchSpecialTags = async () => {
    if (!session?.user?.id) return;

    try {
      const { data: allTags, error: tagsError } = await supabase
        .from('special_tags')
        .select('*')
        .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`);

      if (tagsError) throw tagsError;

      const { data: userTags, error: userTagsError } = await supabase
        .from('user_special_tags')
        .select('tag_id, unlocked_at')
        .eq('user_id', session.user.id);

      if (userTagsError) throw userTagsError;

      const userTagsMap = new Map(userTags?.map(ut => [ut.tag_id, ut.unlocked_at]) || []);

      const tagsWithStatus: SpecialTag[] = (allTags || []).map(tag => ({
        id: tag.id,
        name: tag.name,
        emoji: tag.emoji,
        description: tag.description,
        requirement_description: tag.requirement_description,
        starts_at: tag.starts_at,
        ends_at: tag.ends_at,
        is_unlocked: userTagsMap.has(tag.id),
        unlocked_at: userTagsMap.get(tag.id)
      }));

      setSpecialTags(tagsWithStatus);
    } catch (error) {
      console.error('Error fetching special tags:', error);
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
    if (days > 0) {
      return `${days}d ${hours}h left`;
    }
    return `${hours}h left`;
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'frames', label: t('customize.tabs.avatars'), icon: ImageIcon },
    { id: 'banners', label: t('customize.tabs.banners'), icon: Layout },
    { id: 'tags', label: t('customize.tabs.tags'), icon: Tag },
    { id: 'cards', label: t('customize.tabs.cards'), icon: Film }
  ];

  const tagCategories = [
    { id: 'basic', label: t('customize.categories.basic'), icon: Tag },
    { id: 'theme', label: t('customize.categories.theme'), icon: Palette },
    { id: 'community', label: t('customize.categories.community'), icon: Users },
    { id: 'oracle', label: t('customize.categories.oracle'), icon: BrainCircuit },
    { id: 'special', label: t('customize.categories.special'), icon: Sparkles }
  ];

    const renderFrameContent = () => {
    const defaultFrame = frames.default;
    const otherFrames = Object.values(frames).filter(frame => frame.id !== 'default');

    const avatarPreview = (extraClassName: string) => (
      <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shadow-xl flex-shrink-0 ${extraClassName}`}>
        {userAvatarUrl ? (
          <img src={userAvatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
            <User className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
        )}
      </div>
    );

        // Animações pausadas por padrão (só rodam ao passar o mouse/tocar) —
    // via CSS de verdade (não classes Tailwind), porque antes/depois
    // (pseudo-elementos ::before/::after) só respeitam regras CSS reais,
    // não conseguem ser controlados por estilo inline.
    const hoverAnimClasses = 'frame-preview-anim';
      
    const pauseAnimationCss = `
      .frame-preview-anim,
      .frame-preview-anim::before,
      .frame-preview-anim::after {
        animation-play-state: paused !important;
      }
      .frame-preview-anim:hover,
      .frame-preview-anim:hover::before,
      .frame-preview-anim:hover::after {
        animation-play-state: running !important;
      }
    `;

            return (
      <div>
        <style>{pauseAnimationCss}</style>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-1">
          <motion.div
            key={defaultFrame.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className={`relative aspect-square rounded-2xl ${selectedFrame === defaultFrame.id ? 'ring-4 ring-blue-500 shadow-lg shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
          >
            <button
              onClick={() => handleFrameSelect(defaultFrame.id as FrameId)}
              className="w-full h-full relative group bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-300 flex flex-col items-center justify-center p-3 rounded-2xl overflow-hidden"
            >
              {avatarPreview(defaultFrame.className)}
              <span className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                {defaultFrame.name}
              </span>
              {selectedFrame === defaultFrame.id && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full">
                  <Check className="w-4 h-4" />
                </div>
              )}
            </button>
          </motion.div>

          {otherFrames.map((frame, index) => {
            const isPremiumLocked = frame.isPremium && !isPremium;
            const requiredThemeTag = frame.requiredTag ? THEME_TAGS.find(t => t.id === frame.requiredTag) : null;
            const requiredTagProgress = frame.requiredTag ? (themeTagProgress[frame.requiredTag] || 0) : 0;
            const requiredTagCount = requiredThemeTag?.condition.count || 0;
            const requiredTagMet = !frame.requiredTag || requiredTagProgress >= requiredTagCount;
            const isLocked = isPremiumLocked || !requiredTagMet;

            return (
              <motion.div
                key={frame.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: (index + 1) * 0.03 }}
                className={`relative aspect-square rounded-2xl ${
                  isLocked ? 'opacity-60' : ''
                } ${selectedFrame === frame.id ? 'ring-4 ring-blue-500 shadow-lg shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
              >
                <button
                  onClick={() => !isLocked && handleFrameSelect(frame.id as FrameId)}
                  disabled={isLocked}
                  className="w-full h-full relative group bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-300 disabled:cursor-not-allowed disabled:hover:from-gray-100 disabled:hover:to-gray-200 dark:disabled:hover:from-gray-700 dark:disabled:hover:to-gray-800 flex flex-col items-center justify-center p-3 rounded-2xl overflow-hidden"
                >
                  {avatarPreview(`${frame.className} ${hoverAnimClasses}`)}
                  <span className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm text-center line-clamp-1">
                    {frame.name}
                  </span>
                  {isLocked && (
                    <div className="absolute top-2 right-2 z-10">
                      {isPremiumLocked ? (
                        <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                          <Crown className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 bg-gray-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                          <Lock className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  )}
                  {!isLocked && selectedFrame === frame.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                  {isLocked && !isPremiumLocked && requiredThemeTag && (
                    <div className="absolute bottom-1 left-1 right-1 bg-black/60 backdrop-blur-sm rounded-lg px-1.5 py-1">
                      <p className="text-[9px] text-white text-center font-medium truncate">
                        {requiredThemeTag.emoji} {requiredThemeTag.name} · {requiredTagProgress}/{requiredTagCount}
                      </p>
                    </div>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBannerContent = () => {
    const defaultBanner = banners.default;
    const otherBanners = Object.values(banners).filter(banner => banner.id !== 'default');

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-1">
        <motion.div
          key={defaultBanner.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`relative rounded-2xl ${selectedBanner === defaultBanner.id ? 'ring-4 ring-blue-500 shadow-xl shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
        >
          <button
            onClick={() => handleBannerSelect(defaultBanner.id as BannerId)}
            className="w-full relative group transition-all duration-300 hover:scale-[1.02] rounded-2xl overflow-hidden"
          >
            <div className="bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 rounded-2xl h-28 w-full flex items-center justify-center px-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-white text-center">
                {defaultBanner.name}
              </h3>
            </div>
            {selectedBanner === defaultBanner.id && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full z-10">
                <Check className="w-3 h-3" />
              </div>
            )}
          </button>
        </motion.div>

        {otherBanners.map((banner, index) => {
          const isPremiumLocked = banner.isPremium && !isPremium;
          const requiredTagProgress = banner.requiredTag ? (themeTagProgress[banner.requiredTag] || 0) : 0;
          const requiredTagMet = !banner.requiredTag || (requiredTagProgress >= (THEME_TAGS.find(t => t.id === banner.requiredTag)?.condition.count || 0));
          const isLocked = isPremiumLocked || !requiredTagMet;

          return (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: (index + 1) * 0.05 }}
              className={`relative rounded-2xl ${
                isLocked ? 'opacity-60' : ''
              } ${selectedBanner === banner.id ? 'ring-4 ring-blue-500 shadow-xl shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
            >
              <button
                onClick={() => !isLocked && handleBannerSelect(banner.id as BannerId)}
                disabled={isLocked}
                className="block w-full relative group transition-all duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100 rounded-2xl overflow-hidden"
              >
                <div className={`rounded-2xl h-28 w-full flex items-center justify-center px-4 ${banner.className}`}>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white z-10 relative text-center line-clamp-2">
                    {banner.name}
                  </h3>
                </div>
                {isLocked && (
                  <div className="absolute top-2 right-2 z-10">
                    {isPremiumLocked ? (
                      <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                        <Crown className="w-3 h-3" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-gray-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                        <Lock className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                )}
                {!isLocked && selectedBanner === banner.id && (
                  <div className="absolute top-2 right-2 bg-blue-500 text-white p-1 rounded-full z-10">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderCardContent = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {Object.values(ORACLE_CARDS).map((card, index) => {
          const isPremiumLocked = card.isPremium && !isPremium;
          const requiredTagProgress = card.requiredTag ? (themeTagProgress[card.requiredTag] || 0) : 0;
          const isTagUnlocked = card.requiredTag ? requiredTagProgress >= 50 : true;
          const isLocked = isPremiumLocked || !isTagUnlocked;

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className={`relative rounded-2xl overflow-hidden border-2 ${
                selectedCard === card.id
                  ? 'border-blue-500 shadow-xl shadow-blue-500/30'
                  : 'border-white/20 dark:border-gray-700/60'
              } ${isLocked ? 'opacity-60' : ''} bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl`}
            >
              <button
                onClick={() => !isLocked && handleCardSelect(card.id)}
                disabled={isLocked}
                className="w-full p-5 hover:bg-white/30 dark:hover:bg-gray-700/30 transition-all disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {card.name}
                    </h3>
                    {isPremiumLocked ? (
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-3 py-1.5 rounded-full">
                        <Crown className="w-4 h-4" />
                        <span>Premium</span>
                      </div>
                    ) : !isTagUnlocked ? (
                      <div className="flex items-center gap-1.5 bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold px-3 py-1.5 rounded-full">
                        <Lock className="w-4 h-4" />
                        <span>{card.requiredTag}</span>
                      </div>
                    ) : selectedCard === card.id ? (
                      <div className="bg-blue-500 text-white p-1.5 rounded-full">
                        <Check className="w-4 h-4" />
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
                      <img
                        src={card.images.bogart}
                        alt="Bogart"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
                      <img
                        src={card.images.fincher}
                        alt="Fincher"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
                      <img
                        src={card.images.cypher}
                        alt="Cypher"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    {t('customize.cards.oracleCards')}
                  </p>
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderTagContent = (category: TagCategory) => {
    switch (category) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('customize.progress.moviesRated', { count: ratedMoviesCount })}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROGRESSION_TAGS.map((tag) => {
                const progress = tag.condition
                  ? basicTagProgress[tag.name] || 0
                  : ratedMoviesCount;
                const isUnlocked = progress >= tag.minMovies;
                const progressPercentage = tag.maxMovies
                  ? Math.min(100, (progress - tag.minMovies) / (tag.maxMovies - tag.minMovies) * 100)
                  : progress >= tag.minMovies ? 100 : (progress / tag.minMovies) * 100;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative group rounded-2xl border ${
                      isUnlocked
                        ? 'border-green-300/50 dark:border-green-700/50 bg-green-50/50 dark:bg-green-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200 backdrop-blur-sm ${
                      isUnlocked ? 'hover:border-green-400 dark:hover:border-green-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${
                            isUnlocked
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {isPt ? tag.descriptionPt : tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            {progress}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            /{tag.minMovies}
                          </span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'basic')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                            getCategoryButtonStyle(isActive, 'basic')
                          }`}
                        >
                          {isActive ? (
                            <span className="flex items-center">
                              <Check className="w-4 h-4 mr-1" />
                              {t('customize.tags.active')}
                            </span>
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
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {THEME_TAGS.map((tag) => {
              const progress = themeTagProgress[tag.id] || 0;
              const isUnlocked = progress >= tag.condition.count;
              const isActive = activeTag?.name === tag.name;

              return (
                <div
                  key={tag.id}
                  className={`relative group rounded-2xl border ${
                    isUnlocked
                      ? 'border-yellow-300/50 dark:border-yellow-700/50 bg-yellow-50/50 dark:bg-yellow-900/20'
                      : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                  } p-4 transition-all duration-200 backdrop-blur-sm ${
                    isUnlocked ? 'hover:border-yellow-400 dark:hover:border-yellow-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{tag.emoji}</span>
                        <span className={`text-sm font-medium ${
                          isUnlocked
                            ? 'text-yellow-700 dark:text-yellow-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {tag.name}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {isPt ? tag.requirementPt : tag.requirement}
                      </p>
                      <div className="mt-2 text-sm">
                        <span className={isUnlocked ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}>
                          {progress}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">
                          /{tag.condition.count}
                        </span>
                      </div>
                    </div>
                    {!isUnlocked ? (
                      <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <button
                        onClick={() => handleUseTag(tag, 'theme')}
                        disabled={savingTag}
                        className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                          getCategoryButtonStyle(isActive, 'theme')
                        }`}
                      >
                        {isActive ? (
                          <span className="flex items-center">
                            <Check className="w-4 h-4 mr-1" />
                            Active
                          </span>
                        ) : savingTag ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Use'
                        )}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isUnlocked
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COMMUNITY_TAGS.map((tag) => {
                const isUnlocked = followersCount >= tag.minFollowers;
                const progress = tag.maxFollowers
                  ? Math.min(100, (followersCount - tag.minFollowers) / (tag.maxFollowers - tag.minFollowers) * 100)
                  : followersCount >= tag.minFollowers ? 100 : 0;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative group rounded-2xl border ${
                      isUnlocked
                        ? 'border-blue-300/50 dark:border-blue-700/50 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200 backdrop-blur-sm ${
                      isUnlocked ? 'hover:border-blue-400 dark:hover:border-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${
                            isUnlocked
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {isPt ? tag.descriptionPt : tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}>
                            {followersCount}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            /{tag.maxFollowers || tag.minFollowers}+
                          </span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'community')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                            getCategoryButtonStyle(isActive, 'community')
                          }`}
                        >
                          {isActive ? (
                            <span className="flex items-center">
                              <Check className="w-4 h-4 mr-1" />
                              {t('customize.tags.active')}
                            </span>
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
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-blue-400 to-cyan-500'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    className={`relative group rounded-2xl border ${
                      isUnlocked
                        ? 'border-pink-300/50 dark:border-pink-700/50 bg-pink-50/50 dark:bg-pink-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200 backdrop-blur-sm ${
                      isUnlocked ? 'hover:border-pink-400 dark:hover:border-pink-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${
                            isUnlocked
                              ? 'text-pink-700 dark:text-pink-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {isPt ? tag.descriptionPt : tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-400'}>
                            {progress}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            /{tag.maxCount || tag.minCount}+
                          </span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'oracle')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                            getCategoryButtonStyle(isActive, 'oracle')
                          }`}
                        >
                          {isActive ? (
                            <span className="flex items-center">
                              <Check className="w-4 h-4 mr-1" />
                              {t('customize.tags.active')}
                            </span>
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
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-pink-400 to-rose-500'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {specialTags.map((tag) => {
                  const isActive = activeTag?.name === tag.name;

                  return (
                    <div
                      key={tag.id}
                      className={`relative group rounded-2xl border ${
                        tag.is_unlocked
                          ? 'border-red-800/50 dark:border-red-700/40 bg-red-900/[0.06] dark:bg-red-900/20'
                          : 'border-red-200/50 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20'
                      } p-4 transition-all duration-200 backdrop-blur-sm ${
                        tag.is_unlocked ? 'hover:border-red-700/70 dark:hover:border-red-600/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{tag.emoji}</span>
                            <span className={`text-sm font-medium ${
                              tag.is_unlocked
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}>
                              {tag.name}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                            {tag.description}
                          </p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                            {tag.requirement_description}
                          </p>
                          {tag.ends_at && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs">
                              <Clock className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                {formatTimeRemaining(tag.ends_at)}
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
                            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                              getCategoryButtonStyle(isActive, 'special')
                            }`}
                          >
                            {isActive ? (
                              <span className="flex items-center">
                                <Check className="w-4 h-4 mr-1" />
                                {t('customize.tags.active')}
                              </span>
                            ) : savingTag ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              t('customize.tags.use')
                            )}
                          </button>
                        )}
                      </div>
                      {tag.is_unlocked && (
                        <div className="mt-3 h-1.5 bg-red-200 dark:bg-red-900/40 rounded-full overflow-hidden">
                          <div className="h-full w-full rounded-full bg-gradient-to-r from-red-700 to-red-950 dark:from-red-600 dark:to-red-400" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[100]"
          onClick={onClose}
        />
        <div className="flex min-h-full items-center justify-center p-4 relative z-[101]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-4xl bg-white/90 dark:bg-gray-800/90 rounded-2xl shadow-2xl transform transition-all backdrop-blur-xl border border-white/20 dark:border-gray-700/50"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400">
                {t('customize.title')}
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex space-x-2 border-b border-gray-200/50 dark:border-gray-700/50 mb-6 pb-2">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all ${
                      activeTab === id
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-[400px] max-h-[60vh] overflow-y-auto pr-2">
                {activeTab === 'frames' && renderFrameContent()}
                {activeTab === 'banners' && renderBannerContent()}
                {activeTab === 'cards' && renderCardContent()}
                {activeTab === 'tags' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-2">
                      {tagCategories.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          onClick={() => setActiveTagCategory(id)}
                          className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                            activeTagCategory === id
                              ? getTagColorClasses(id)
                              : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-gray-700'
                          }`}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="bg-gray-50/80 dark:bg-gray-700/30 rounded-2xl p-6 backdrop-blur-sm">
                      {loading ? (
                        <div className="flex items-center justify-center py-12">
                          <GlassLoader size="md" />
                        </div>
                      ) : (
                        renderTagContent(activeTagCategory)
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-4 p-6 border-t border-gray-200/50 dark:border-gray-700/50">
              <button
                onClick={() => {
                  if (onSave) onSave();
                  onClose();
                }}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {t('customize.save')}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

export default CustomizeModal;