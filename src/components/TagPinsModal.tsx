import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Tag, Palette, Users, BrainCircuit, Lock, Check, Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getContinent } from '../lib/continents';
import { syncUnlockedTagsAndNotify } from '../lib/tagNotifications';
import { PROGRESSION_TAGS, THEME_TAGS, COMMUNITY_TAGS, ORACLE_TAGS, FRANCHISE_MOVIES } from '../lib/tags';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, FOCUS_RING, tagCategoryStyle, withAlpha } from '../lib/oracleTheme';

interface TagPinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSave?: () => void;
}

type TagCategoryId = 'basic' | 'theme' | 'community' | 'oracle' | 'special';
type ViewMode = 'pins' | TagCategoryId;

interface UnlockedPin {
  emoji: string;
  name: string;
  category: TagCategoryId;
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

// Formato único de um cartão de tag — as 5 categorias tinham cada uma o
// seu próprio bloco de JSX quase idêntico; agora todas viram esta linha.
interface TagRow {
  key: string;
  emoji: string;
  name: string;
  description: string;
  detail?: string;
  progress: number | null; // null = sem contador (especiais)
  goal: number | null;
  isUnlocked: boolean;
  category: TagCategoryId;
  note?: { icon: 'clock' | 'sparkles'; text: string };
}

// Todo o sistema de categorias, progresso e ativação de tags que antes
// morava em CustomizeModal.tsx — movido pra cá pra não ficar redundante
// entre os dois modais. O CustomizeModal manteve só avatar/banner/cards.
const TagPinsModal: React.FC<TagPinsModalProps> = ({ isOpen, onClose, userId, onSave }) => {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('pins');
  // Nome da tag sendo gravada agora (null = nenhuma).
  const [savingName, setSavingName] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, userId]);

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

      const { count: followers } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      setFollowersCount(followers || 0);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('active_tag')
        .eq('id', userId)
        .single();

      // curated_pool — soma os movie_ids de TODOS os moods de cada
      // card_type (recommendation_pools guarda um pool por mood, não um
      // pool único por oráculo). Une os IDs num Set por card_type antes
      // de contar, pra não contar o mesmo filme mais de uma vez caso
      // apareça em vários moods do mesmo oráculo.
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
      basicProgress['Scribbler'] = realReviewCount || 0;
      basicProgress['Screenwriter'] = realReviewCount || 0;
      basicProgress['Memoirist'] = realReviewCount || 0;

      // completed_series — pelo menos uma série na biblioteca que já
      // terminou (não está mais no ar) E tem 100% dos episódios já
      // lançados assistidos. Reaproveita a mesma RPC que já calcula
      // isso pra barra de progresso na Biblioteca.
      const { data: userMoviesForTv } = await supabase
        .from('user_movies')
        .select('movie_id, media_type')
        .eq('user_id', userId)
        .not('rating', 'is', null);
      const tvIds = (userMoviesForTv || []).filter((m: any) => m.media_type === 'tv').map((m: any) => m.movie_id);

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
      basicProgress['Sofa Sleeper'] = hasCompletedSeries ? 1 : 0;
      setBasicTagProgress(basicProgress);

      const oracleProgress: Record<string, number> = {};
      ORACLE_TAGS.forEach((tag) => {
        if (tag.condition.type === 'curated_pool' && tag.condition.value) {
          oracleProgress[tag.id] = curatedProgress[tag.condition.value] || 0;
        } else if (tag.condition.type === 'ai_review_count') {
          oracleProgress[tag.id] = aiReviewCount || 0;
        }
      });
      setOracleTagProgress(oracleProgress);
      setThemeTagProgress(themeProgress);

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
        if ((oracleProgress[tag.id] || 0) >= tag.condition.count) {
          unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'oracle' });
        }
      });
      specialTagsWithStatus.forEach((tag) => {
        if (tag.is_unlocked) unlockedPins.push({ emoji: tag.emoji, name: tag.name, category: 'special' });
      });

      setPins(unlockedPins);

      // Só sincroniza/notifica quando é o PRÓPRIO usuário logado — por
      // precaução, mesmo esse modal parecendo ser usado só assim hoje
      // (não importa useAuth nem distingue "usuário logado" de
      // "usuário sendo visto" em nenhum outro lugar do componente).
      if (userId === session?.user?.id) {
        syncUnlockedTagsAndNotify(userId, unlockedPins);
      }
    } catch (error) {
      console.error('Error fetching tag pins data:', error);
    } finally {
      setLoading(false);
    }
  };

    // Toca de novo na tag em uso = tira do perfil.
  const handleUseTag = async (tag: { name: string; emoji: string }, category: string) => {
    if (savingName) return;
    try {
      setSavingName(tag.name);
      const isCurrentlyActive = activeTag?.name === tag.name;
      const newTag = isCurrentlyActive ? null : { category, name: tag.name, emoji: tag.emoji };

      const { error } = await supabase.from('profiles').update({ active_tag: newTag }).eq('id', userId);

      if (error) throw error;

      setActiveTag(newTag);
      toast.success(isCurrentlyActive ? t('customize.tagRemoved') : t('customize.tagUpdated'));
      // Propaga a mudança pro Profile assim que ela acontece de verdade,
      // sem depender de um botão "salvar".
      onSave?.();
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error(t('customize.updateError'));
    } finally {
      setSavingName(null);
    }
  };

  const formatTimeRemaining = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return t('tagPins.expired');
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 30) return t('tagPins.monthsLeft', { count: Math.floor(days / 30) });
    if (days > 0) return t('tagPins.daysLeft', { days, hours });
    return t('tagPins.hoursLeft', { hours });
  };

  // ---- Linhas de cada categoria, no formato único TagRow ----
  const rowsFor = (category: TagCategoryId): TagRow[] => {
    switch (category) {
      case 'basic':
        return PROGRESSION_TAGS.map((tag) => {
          const progress = tag.condition ? basicTagProgress[tag.name] || 0 : ratedMoviesCount;
          return {
            key: tag.name,
            emoji: tag.emoji,
            name: tag.name,
            description: isPt ? tag.descriptionPt : tag.description,
            progress,
            goal: tag.minMovies,
            isUnlocked: progress >= tag.minMovies,
            category,
          };
        });
      case 'theme':
        return THEME_TAGS.map((tag) => {
          const progress = themeTagProgress[tag.id] || 0;
          return {
            key: tag.id,
            emoji: tag.emoji,
            name: tag.name,
            description: isPt ? tag.requirementPt : tag.requirement,
            progress,
            goal: tag.condition.count,
            isUnlocked: progress >= tag.condition.count,
            category,
          };
        });
      case 'community':
        return COMMUNITY_TAGS.map((tag) => ({
          key: tag.name,
          emoji: tag.emoji,
          name: tag.name,
          description: isPt ? tag.descriptionPt : tag.description,
          progress: followersCount,
          goal: tag.minFollowers,
          isUnlocked: followersCount >= tag.minFollowers,
          category,
        }));
      case 'oracle':
        return ORACLE_TAGS.map((tag) => {
          const progress = oracleTagProgress[tag.id] || 0;
          return {
            key: tag.id,
            emoji: tag.emoji,
            name: tag.name,
            description: isPt ? tag.requirementPt : tag.requirement,
            progress,
            goal: tag.condition.count,
            isUnlocked: progress >= tag.condition.count,
            category,
          };
        });
      case 'special':
        return specialTags.map((tag) => ({
          key: tag.id,
          emoji: tag.emoji,
          name: tag.name,
          description: tag.description,
          detail: tag.requirement_description,
          progress: null,
          goal: null,
          isUnlocked: tag.is_unlocked,
          category,
          note:
            tag.ends_at && tag.is_currently_active
              ? { icon: 'clock' as const, text: formatTimeRemaining(tag.ends_at) }
              : tag.ends_at && tag.is_unlocked
                ? { icon: 'sparkles' as const, text: t('customize.tags.permanentlyEarned') }
                : undefined,
        }));
    }
  };

  const categories: { id: ViewMode; label: string; icon: typeof Tag }[] = [
    { id: 'pins', label: t('tagPins.myPins'), icon: Sparkles },
    { id: 'basic', label: t('customize.categories.basic'), icon: Tag },
    { id: 'theme', label: t('customize.categories.theme'), icon: Palette },
    { id: 'community', label: t('customize.categories.community'), icon: Users },
    { id: 'oracle', label: t('customize.categories.oracle'), icon: BrainCircuit },
    { id: 'special', label: t('customize.categories.special'), icon: Sparkles },
  ];

  const pinsByCategory = (category: string) => pins.filter((p) => p.category === category).length;

  const tagToggleButton = (name: string, emoji: string, category: TagCategoryId, compact = false) => {
    const isActive = activeTag?.name === name;
    const isSaving = savingName === name;
    const style = tagCategoryStyle(category);
    return (
      <button
        onClick={() => handleUseTag({ name, emoji }, category)}
        disabled={!!savingName}
        aria-pressed={isActive}
        aria-label={isActive ? `${t('tagPins.removeFromProfile')}: ${name}` : `${t('customize.tags.use')}: ${name}`}
        className={`shrink-0 gap-1.5 ${compact ? 'h-9 px-3' : 'h-10 px-4'} rounded-full text-sm font-semibold transition disabled:cursor-wait ${FOCUS_RING} ${
          isActive ? style.pill : 'border border-white/15 hover:border-white/35 hover:bg-white/5'
        }`}
        style={isActive ? undefined : { color: PAPER }}
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : isActive ? <Check className="w-4 h-4" aria-hidden /> : null}
        {isActive ? t('customize.tags.active') : t('customize.tags.use')}
      </button>
    );
  };

  const renderTagRow = (row: TagRow) => {
    const { accent } = tagCategoryStyle(row.category);
    const isActive = activeTag?.name === row.name;
    const pct = row.goal ? Math.min(100, ((row.progress || 0) / row.goal) * 100) : row.isUnlocked ? 100 : 0;
    return (
      <li
        key={row.key}
        className="rounded-2xl p-4 ring-1 ring-white/[0.07] flex flex-col gap-3"
        style={{
          background: VELVET,
          // Desbloqueada: contorno na cor da categoria (mais forte se em uso).
          boxShadow: row.isUnlocked ? `inset 0 0 0 1px ${withAlpha(accent, isActive ? 0.75 : 0.3)}` : undefined,
        }}
      >
        <div className="flex items-start gap-3">
          <span
            className={`grid place-items-center w-11 h-11 shrink-0 rounded-xl text-2xl leading-none ${row.isUnlocked ? '' : 'grayscale opacity-50'}`}
            style={{ background: NIGHT }}
            aria-hidden
          >
            {row.emoji}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-snug" style={{ color: row.isUnlocked ? PAPER : MIST }}>
              {row.name}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug" style={{ color: MIST }}>
              {row.description}
            </p>
            {row.detail && (
              <p className="mt-1 text-xs leading-snug" style={{ color: MIST, opacity: 0.8 }}>
                {row.detail}
              </p>
            )}
            {row.note && (
              <p className={`mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium ${row.note.icon === 'clock' ? 'text-amber-200' : ''}`} style={row.note.icon === 'clock' ? undefined : { color: MIST }}>
                {row.note.icon === 'clock' ? <Clock className="w-3.5 h-3.5" aria-hidden /> : <Sparkles className="w-3.5 h-3.5" aria-hidden />}
                {row.note.text}
              </p>
            )}
          </div>
          {row.isUnlocked ? (
            tagToggleButton(row.name, row.emoji, row.category, true)
          ) : (
            <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-white/[0.06]" style={{ color: MIST }}>
              <Lock className="w-4 h-4" aria-hidden />
              <span className="sr-only">{t('customize.locked')}</span>
            </span>
          )}
        </div>
        {row.goal !== null && (
          <div className="flex items-center gap-3">
            <span
              className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={row.goal}
              aria-valuenow={Math.min(row.progress || 0, row.goal)}
              aria-label={row.name}
            >
              <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: row.isUnlocked ? accent : 'rgba(189,180,214,0.55)' }} />
            </span>
            <span className="shrink-0 text-xs tabular-nums" style={{ color: row.isUnlocked ? PAPER : MIST }}>
              {Math.min(row.progress || 0, row.goal)}/{row.goal}
            </span>
          </div>
        )}
      </li>
    );
  };

  const renderPinsView = () => (
    <div className="space-y-6">
      {/* A tag em uso no perfil agora */}
      <section className="rounded-2xl p-4 ring-1 ring-white/10 flex items-center gap-3" style={{ background: VELVET }}>
        {activeTag ? (
          <>
            <span className="grid place-items-center w-12 h-12 shrink-0 rounded-xl text-2xl leading-none" style={{ background: NIGHT }} aria-hidden>
              {activeTag.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: MIST }}>
                {t('customize.tags.currentlyActive')}
              </p>
              <p className="font-semibold truncate" style={{ color: PAPER }}>
                {activeTag.name}
              </p>
            </div>
            <button
              onClick={() => handleUseTag(activeTag, activeTag.category)}
              disabled={!!savingName}
              className={`shrink-0 gap-1.5 h-10 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              {savingName === activeTag.name ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <X className="w-4 h-4" aria-hidden />}
              {t('customize.tags.remove')}
            </button>
          </>
        ) : (
          <p className="text-sm" style={{ color: MIST }}>
            {pins.length > 0 ? t('tagPins.noneActive') : t('tagPins.noneYetHint')}
          </p>
        )}
      </section>

      {pins.length === 0 ? (
        <div className="text-center py-10">
          <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Sparkles className="w-7 h-7 text-violet-300" aria-hidden />
          </span>
          <p className="mt-4 font-semibold" style={{ color: PAPER }}>
            {t('profile.noTagPins')}
          </p>
        </div>
      ) : (
        <section>
          <p className="text-sm" style={{ color: MIST }}>
            {t('tagPins.unlockedCount', { count: pins.length })} · {t('tagPins.tapToUse')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {pins.map((pin, idx) => {
              const isActive = activeTag?.name === pin.name;
              const style = tagCategoryStyle(pin.category);
              return (
                <li key={`${pin.category}-${pin.name}-${idx}`}>
                  <button
                    onClick={() => handleUseTag(pin, pin.category)}
                    disabled={!!savingName}
                    aria-pressed={isActive}
                    className={`gap-1.5 h-10 pl-2.5 pr-3.5 rounded-full text-sm font-medium transition disabled:cursor-wait ${FOCUS_RING} ${style.pill} ${
                      isActive ? 'ring-2' : 'opacity-90 hover:opacity-100'
                    }`}
                    style={isActive ? { boxShadow: `0 0 0 2px ${NIGHT}, 0 0 0 4px ${style.accent}` } : undefined}
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {pin.emoji}
                    </span>
                    {pin.name}
                    {savingName === pin.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : isActive ? <Check className="w-3.5 h-3.5" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );

  const renderCategoryContent = (category: TagCategoryId) => {
    const rows = rowsFor(category);
    const intro =
      category === 'basic'
        ? t('customize.progress.moviesRated', { count: ratedMoviesCount })
        : category === 'community'
          ? t('customize.progress.followers', { count: followersCount })
          : category === 'special'
            ? t('customize.tags.limitedTime')
            : null;
    return (
      <div>
        {intro && (
          <p className="mb-3 text-sm" style={{ color: MIST }}>
            {intro}
          </p>
        )}
        {rows.length === 0 ? (
          <div className="text-center py-10">
            <Sparkles className="w-8 h-8 mx-auto text-violet-300/70" aria-hidden />
            <p className="mt-3 text-sm" style={{ color: MIST }}>
              {t('customize.tags.noSpecialTags')}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">{rows.map(renderTagRow)}</ul>
        )}
      </div>
    );
  };

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('profile.tagPins')}
      subtitle={t('tagPins.subtitle')}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
          <Tag className="w-5 h-5 text-violet-300" aria-hidden />
        </span>
      }
      size="lg"
      bodyClassName="px-5 sm:px-7 pb-6"
    >
      {/* Categorias — rolagem lateral, grudadas no topo */}
      <div className="sticky top-0 z-10 -mx-5 sm:-mx-7 pt-4 pb-3 mb-4 border-b border-white/[0.07]" style={{ background: NIGHT }}>
        <div role="tablist" aria-label={t('profile.tagPins')} className="flex gap-2 overflow-x-auto px-5 sm:px-7 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {categories.map(({ id, label, icon: Icon }) => {
            const active = viewMode === id;
            const accent = id === 'pins' ? '#A78BFA' : tagCategoryStyle(id).accent;
            const count = id === 'pins' ? pins.length : pinsByCategory(id);
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setViewMode(id)}
                className={`shrink-0 whitespace-nowrap gap-2 h-10 px-3.5 rounded-full text-sm font-medium transition ${FOCUS_RING} ${
                  active ? 'bg-white/[0.12] ring-1 ring-white/25' : 'ring-1 ring-white/10 hover:ring-white/25'
                }`}
                style={{ color: active ? PAPER : MIST, background: active ? undefined : VELVET }}
              >
                <Icon className="w-4 h-4" style={{ color: accent }} aria-hidden />
                {label}
                {!loading && count > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums grid place-items-center" style={{ background: withAlpha(accent, 0.2), color: accent }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="h-28 rounded-2xl ring-1 ring-white/[0.07] animate-pulse" style={{ background: VELVET }} />
          ))}
        </ul>
      ) : (
        <div role="tabpanel">{viewMode === 'pins' ? renderPinsView() : renderCategoryContent(viewMode)}</div>
      )}
    </OracleSheet>
  );
};

export default TagPinsModal;
