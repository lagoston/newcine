import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Star, BarChart3, Users, Calendar, Film, Clock, MessageCircle, Crown, Palette, Archive as ArchiveIcon, Award, TrendingDown, X, Loader2, Settings, ChevronDown, Scroll, Info } from 'lucide-react';
import ArchetypeSymbol from '../components/ArchetypeSymbol';
import GlassLoader from '../components/GlassLoader';
import { supabase, getProfile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getMovieDetailsFromDB } from '../lib/tmdb';
import FollowersModal from '../components/FollowersModal';
import WhispersModal from '../components/WhispersModal';
import CustomizeModal from '../components/CustomizeModal';
import SettingsModal from '../components/SettingsModal';
import { toast } from 'sonner';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  active_tag?: {
    emoji: string;
    name: string;
    category: string;
  };
  avatar_frame?: string;
  banner?: string;
  plan_type?: string;
  oracle_predictions_count?: number;
  oracle_recommendations_count?: number;
}

interface RatingDistribution {
  [key: number]: number;
}

interface Genre {
  id: number;
  name: string;
  count: number;
}

interface DecadeCount {
  [decade: string]: number;
}

interface FavoriteDecade {
  decade: string;
  count: number;
  label: string;
  percentage: number;
  allDecades?: DecadeCount;
}

interface ActorCount {
  id: number;
  name: string;
  count: number;
  character?: string;
}

interface DirectorCount {
  id?: number;
  name: string;
  count: number;
}

interface LeastKnownGem {
  id: number;
  title: string;
  vote_count: number;
  release_date: string;
  vote_average: number;
  userRating?: number;
}

interface FollowedUserCarousel {
  id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string | null;
  lastRatedTitle: string | null;
  lastRating: number | null;
}

export default function Profile() {
  const navigate = useNavigate();
  const { session, isPremium, checkPremiumStatus } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [profileExists, setProfileExists] = useState(true);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution>({});
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState<'followers' | 'following' | null>(null);
  const [showWhispersModal, setShowWhispersModal] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [totalWatchTime, setTotalWatchTime] = useState(0);
  const [unreadWhispers, setUnreadWhispers] = useState(0);
  const [favoriteGenres, setFavoriteGenres] = useState<Genre[]>([]);
  const [favoriteDecade, setFavoriteDecade] = useState<FavoriteDecade | null>(null);
  const [topActors, setTopActors] = useState<ActorCount[]>([]);
  const [topDirectors, setTopDirectors] = useState<DirectorCount[]>([]);
  const [leastKnownGem, setLeastKnownGem] = useState<LeastKnownGem | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [followedUsersCarousel, setFollowedUsersCarousel] = useState<FollowedUserCarousel[]>([]);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const [carouselAutoPaused, setCarouselAutoPaused] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [essencePersonality, setEssencePersonality] = useState<{ subcategoria_id: string | null; personalidade_completa: string | null; arquetipo_primario: string | null; arquetipo_secundario: string | null } | null>(null);
  const [essenceArchetype, setEssenceArchetype] = useState<{ archetype_name: string; subcategory_name: string; description: string; archetype_description: string; subcategory_description: string } | null>(null);
  const [essenceLoading, setEssenceLoading] = useState(true);
  const [showEssenceRevelation, setShowEssenceRevelation] = useState(false);
  const [showEssenceInfo, setShowEssenceInfo] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(prev => {
        if (prev !== desktop) setCarouselOffset(0);
        return desktop;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const CAROUSEL_PAGE_SIZE = isDesktop ? 8 : 4;

  useEffect(() => {
    if (followedUsersCarousel.length <= CAROUSEL_PAGE_SIZE || carouselAutoPaused) return;
    const timer = setInterval(() => {
      setCarouselOffset(prev => {
        const next = prev + CAROUSEL_PAGE_SIZE;
        return next >= followedUsersCarousel.length ? 0 : next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [followedUsersCarousel.length, CAROUSEL_PAGE_SIZE, carouselAutoPaused]);

  const visibleCarouselUsers = followedUsersCarousel.slice(carouselOffset, carouselOffset + CAROUSEL_PAGE_SIZE);

  const getBubbleStyle = (rating: number | null): { bubble: string; titleText: string; ratingText: string; arrow: string } => {
    if (rating === null) return { bubble: 'bg-white/90 dark:bg-gray-700/90 border-gray-200 dark:border-gray-600', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-gray-400', arrow: 'border-t-white dark:border-t-gray-700' };
    if (rating === 10) return { bubble: 'bg-pink-50/90 dark:bg-pink-900/40 border-pink-300 dark:border-pink-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-pink-600 dark:text-pink-400', arrow: 'border-t-pink-50 dark:border-t-pink-900' };
    if (rating >= 7) return { bubble: 'bg-green-50/90 dark:bg-green-900/40 border-green-300 dark:border-green-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-green-600 dark:text-green-400', arrow: 'border-t-green-50 dark:border-t-green-900' };
    if (rating >= 4) return { bubble: 'bg-yellow-50/90 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-yellow-600 dark:text-yellow-400', arrow: 'border-t-yellow-50 dark:border-t-yellow-900' };
    return { bubble: 'bg-red-50/90 dark:bg-red-900/40 border-red-300 dark:border-red-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-red-600 dark:text-red-400', arrow: 'border-t-red-50 dark:border-t-red-900' };
  };

  const fetchEssence = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      setEssenceLoading(true);
      const { data: profileData } = await supabase
        .from('profiles')
        .select('subcategoria_id, personalidade_completa, arquetipo_primario, arquetipo_secundario')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!profileData?.personalidade_completa) {
        setEssencePersonality(profileData ?? null);
        return;
      }
      setEssencePersonality(profileData);
      const { data: archetypeData } = await supabase
        .rpc('get_user_complete_personality', { p_user_id: session.user.id })
        .maybeSingle();
      setEssenceArchetype(archetypeData ?? null);
    } catch {
    } finally {
      setEssenceLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile();
      fetchMovieStats();
      fetchUnreadWhispers();
      fetchFollowedUsersForCarousel();
      fetchEssence();

      const channel = supabase
        .channel('profile-whispers-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'recommendations',
            filter: `to_user_id=eq.${session.user.id}`
          },
          () => {
            fetchUnreadWhispers();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const handleLanguageChange = () => {
      if (typeof window !== 'undefined') {
        cache.invalidatePattern('movie:');
      }
      if (session?.user?.id) {
        fetchMovieStats();
      }
    };

    const handleEpisodeToggled = () => {
      if (session?.user?.id) {
        fetchMovieStats();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);
    window.addEventListener('episodeToggled', handleEpisodeToggled);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
      window.removeEventListener('episodeToggled', handleEpisodeToggled);
    };
  }, [i18n, session?.user?.id]);

  const fetchUnreadWhispers = async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase.rpc('count_unread_recommendations', {
        user_id_input: session.user.id
      });

      if (error) throw error;
      setUnreadWhispers(data || 0);
    } catch (error) {
      console.error('Error fetching unread whispers:', error);
    }
  };

  const fetchFollowedUsersForCarousel = async () => {
    if (!session?.user?.id) return;
    try {
      const { data: follows, error: followsError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', session.user.id);

      if (followsError) throw followsError;
      if (!follows || follows.length === 0) {
        setFollowedUsersCarousel([]);
        return;
      }

      const followingIds = follows.map((f: any) => f.following_id);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, avatar_frame, plan_type')
        .in('id', followingIds);

      if (profilesError) throw profilesError;

      const { data: lastRatings, error: ratingsError } = await supabase
        .from('user_movies')
        .select('user_id, rating, created_at, movies!inner(title)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false });

      if (ratingsError) throw ratingsError;

      const lastEntryPerUser = new Map<string, { title: string; rating: number | null }>();
      (lastRatings || []).forEach((r: any) => {
        if (!lastEntryPerUser.has(r.user_id) && r.movies?.title) {
          lastEntryPerUser.set(r.user_id, { title: r.movies.title, rating: r.rating ?? null });
        }
      });

      const shuffled = [...(profiles || [])].sort(() => Math.random() - 0.5);

      const result: FollowedUserCarousel[] = shuffled.map((p: any) => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url,
        avatar_frame: p.avatar_frame,
        plan_type: p.plan_type,
        lastRatedTitle: lastEntryPerUser.get(p.id)?.title || null,
        lastRating: lastEntryPerUser.get(p.id)?.rating ?? null,
      }));

      setFollowedUsersCarousel(result);
    } catch (error) {
      console.error('Error fetching followed users carousel:', error);
    }
  };

  const fetchMovieStats = async () => {
    try {
      if (!session?.user?.id) return;

      const cacheKey = CACHE_KEYS.USER_STATS(session.user.id);
      const cachedStats = cache.get<any>(cacheKey);

      if (cachedStats && cachedStats.ratedMoviesCount > 0) {
        setRatedMoviesCount(cachedStats.ratedMoviesCount);
        setRatingDistribution(cachedStats.ratingDistribution);
        setTotalWatchTime(cachedStats.totalWatchTime);
        setFavoriteGenres(cachedStats.favoriteGenres);
        setFavoriteDecade(cachedStats.favoriteDecade);
        setTopActors(cachedStats.topActors || []);
        setTopDirectors(cachedStats.topDirectors || []);
        setLeastKnownGem(cachedStats.leastKnownGem || null);
        return;
      }

      const { data: userMovies, error: moviesError } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', session.user.id)
        .not('rating', 'is', null);

      if (moviesError) throw moviesError;

      setRatedMoviesCount(userMovies.length);

      const distribution: RatingDistribution = {};
      for (let i = 0; i <= 10; i++) {
        distribution[i] = 0;
      }

      userMovies.forEach(movie => {
        if (movie.rating !== null) {
          distribution[movie.rating]++;
        }
      });
      setRatingDistribution(distribution);

      const movieDetails = await Promise.all(
        userMovies.map(async (userMovie) => {
          try {
            const details = await getMovieDetailsFromDB(userMovie.movie_id);
            return {
              ...details,
              userRating: userMovie.rating
            };
          } catch (error) {
            console.error(`Error fetching details for movie ${userMovie.movie_id}:`, error);
            return null;
          }
        })
      );

      const validMovies = movieDetails.filter(movie => movie !== null);

      let totalMinutes = 0;

      for (const movie of validMovies) {
        if (movie.media_type === 'tv') {
          const { data: watchedEps } = await supabase
            .from('watched_episodes')
            .select('season_number, episode_number')
            .eq('user_id', session.user.id)
            .eq('tmdb_id', movie.id);

          if (watchedEps && watchedEps.length > 0 && movie.seasons) {
            watchedEps.forEach(ep => {
              const season = movie.seasons.find((s: any) => s.season_number === ep.season_number);
              const episode = season?.episodes.find((e: any) => e.episode_number === ep.episode_number);
              if (episode?.runtime) {
                totalMinutes += episode.runtime;
              }
            });
          }
        } else {
          totalMinutes += movie.runtime || 0;
        }
      }

      setTotalWatchTime(totalMinutes);

      const genreCounts = {};
      validMovies.forEach(movie => {
        movie.genres?.forEach(genre => {
          genreCounts[genre.id] = genreCounts[genre.id] || { id: genre.id, name: genre.name, count: 0 };
          genreCounts[genre.id].count++;
        });
      });

      const topGenres = Object.values(genreCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setFavoriteGenres(topGenres);

      const decadeCounts: DecadeCount = {};
      let totalRatedMovies = 0;
      let calculatedFavoriteDecade: FavoriteDecade | null = null;

      validMovies.forEach(movie => {
        if (movie.release_date) {
          const year = new Date(movie.release_date).getFullYear();
          const decade = Math.floor(year / 10) * 10;
          const decadeStr = `${decade}s`;
          decadeCounts[decadeStr] = (decadeCounts[decadeStr] || 0) + 1;
          totalRatedMovies++;
        }
      });

      if (totalRatedMovies > 0) {
        let topDecade = '';
        let topCount = 0;

        for (const [decade, count] of Object.entries(decadeCounts)) {
          if (count > topCount) {
            topDecade = decade;
            topCount = count;
          }
        }

        const percentage = (topCount / totalRatedMovies) * 100;

        let label = '';
        const decadeNum = parseInt(topDecade);

        if (decadeNum < 1980) {
          label = 'Grandpa Cinema';
        } else if (decadeNum < 2010) {
          label = 'Nostalgic';
        } else {
          label = 'Modern Lover';
        }

        calculatedFavoriteDecade = {
          decade: topDecade,
          count: topCount,
          label,
          percentage: percentage,
          allDecades: decadeCounts
        };

        setFavoriteDecade(calculatedFavoriteDecade);
      }

      const actorCounts = {};
      validMovies.forEach(movie => {
        movie.credits?.cast?.slice(0, 5).forEach(actor => {
          actorCounts[actor.id] = actorCounts[actor.id] || {
            id: actor.id,
            name: actor.name,
            character: actor.character,
            count: 0
          };
          actorCounts[actor.id].count++;
        });
      });

      const mostFrequentActors = Object.values(actorCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setTopActors(mostFrequentActors);

      const directorCounts = {};
      validMovies.forEach(movie => {
        const director = movie.credits?.crew?.find(person => person.job === 'Director');
        if (director) {
          directorCounts[director.name] = directorCounts[director.name] || {
            id: director.id,
            name: director.name,
            count: 0
          };
          directorCounts[director.name].count++;
        }
      });

      const mostFrequentDirectors = Object.values(directorCounts)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 3);

      setTopDirectors(mostFrequentDirectors);

      const ratedMoviesWithVoteCounts = validMovies
        .filter(movie => movie.userRating !== null && movie.vote_count !== undefined && movie.vote_count !== null)
        .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

      if (ratedMoviesWithVoteCounts.length > 0) {
        const leastKnown = ratedMoviesWithVoteCounts[0];
        setLeastKnownGem({
          id: leastKnown.id,
          title: leastKnown.title,
          vote_count: leastKnown.vote_count || 0,
          release_date: leastKnown.release_date,
          vote_average: leastKnown.vote_average,
          userRating: leastKnown.userRating
        });
      }

      cache.set(cacheKey, {
        ratedMoviesCount: userMovies.length,
        ratingDistribution: distribution,
        totalWatchTime: totalMinutes,
        favoriteGenres: topGenres,
        favoriteDecade: calculatedFavoriteDecade,
        topActors: mostFrequentActors,
        topDirectors: mostFrequentDirectors,
        leastKnownGem: ratedMoviesWithVoteCounts.length > 0 ? {
          id: ratedMoviesWithVoteCounts[0].id,
          title: ratedMoviesWithVoteCounts[0].title,
          vote_count: ratedMoviesWithVoteCounts[0].vote_count || 0,
          release_date: ratedMoviesWithVoteCounts[0].release_date,
          vote_average: ratedMoviesWithVoteCounts[0].vote_average,
          userRating: ratedMoviesWithVoteCounts[0].userRating
        } : null
      }, CACHE_TTL.USER_STATS);

    } catch (error) {
      console.error('Error fetching movie stats:', error);
      toast.error('Failed to load movie statistics');
    }
  };

  const fetchProfile = async () => {
    try {
      if (!session?.user?.id) return;

      const { data: profileData, error } = await getProfile(session.user.id);

      if (error) throw error;

      if (!profileData) {
        setProfileExists(false);
        return;
      }

      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', session.user.id);

      if (followersError) throw followersError;

      const { count: followingCount, error: followingError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', session.user.id);

      if (followingError) throw followingError;

      setProfile(profileData);
      setUsername(profileData.username);
      setNewUsername(profileData.username);
      setBio(profileData.bio || '');
      setAvatarUrl(profileData.avatar_url || '');
      setFollowersCount(followersCount || 0);
      setFollowingCount(followingCount || 0);
      setProfileExists(true);

      if (session.user.created_at) {
        setCreatedAt(session.user.created_at);
      }

      if (checkPremiumStatus) {
        await checkPremiumStatus();
      }

    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Error loading profile');
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async () => {
    try {
      if (!session?.user?.id) return;

      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: session.user.id,
          username: session.user.email?.split('@')[0] || `user_${Date.now()}`,
          bio: '',
          avatar_url: '',
          avatar_frame: '',
          banner: ''
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          await fetchProfile();
          return;
        }
        throw error;
      }

      setUsername(data.username);
      setNewUsername(data.username);
      setBio(data.bio || '');
      setAvatarUrl(data.avatar_url || '');
      setProfile(data);
      setProfileExists(true);
      toast.success('Profile created successfully');
    } catch (error) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      if (!session?.user?.id) return;

      if (!newUsername.trim()) {
        toast.error('Username cannot be empty');
        return;
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
        toast.error('Username must be 3-20 characters and can only contain letters, numbers, and underscores');
        return;
      }

      if (newUsername !== username) {
        const { data: existingUsers, error: checkError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', newUsername)
          .not('id', 'eq', session.user.id);

        if (checkError) throw checkError;

        if (existingUsers && existingUsers.length > 0) {
          toast.error('This username is already taken. Please choose a different one.');
          return;
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          username: newUsername,
          bio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setUsername(newUsername);
      await fetchProfile();

      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Error updating profile');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditing) return;

    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const animatedFormats = ['gif', 'webp', 'apng'];
    const animatedMimeTypes = ['image/gif', 'image/webp', 'image/apng'];

    const isAnimated =
      animatedFormats.includes(fileExt || '') ||
      animatedMimeTypes.includes(file.type) ||
      file.type.startsWith('image/') && (file.name.toLowerCase().includes('.gif'));

    if (isAnimated && !isPremium) {
      toast.error(
        'Avatares animados sao um recurso Premium! Atualize para usar GIFs e imagens animadas.',
        { duration: 5000, icon: '' }
      );
      e.target.value = '';
      return;
    }

    try {
      const filePath = `${session.user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast.success('Avatar updated successfully');
    } catch (error) {
      console.error('Error updating avatar:', error);
      toast.error('Error updating avatar');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatWatchTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes % 60}m`;
  };

  const getMaxRatingCount = useMemo(() => {
    return Math.max(...Object.values(ratingDistribution), 1);
  }, [ratingDistribution]);

  const getTagColorClasses = useCallback((category: string) => {
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
  }, []);

  const handleWhispersClick = () => {
    setShowWhispersModal(true);
  };

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  if (!profileExists) {
    return (
      <div className="container mx-auto px-4 py-8 min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl" />
          <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-2xl mx-auto bg-white/60 dark:bg-gray-800/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/60 dark:border-gray-700/60 relative z-10">
          <div className="p-8 text-center">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 mb-4">
              Welcome! Let's set up your profile
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              It looks like you haven't created a profile yet. Click below to get started.
            </p>
            <button
              onClick={createProfile}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-colors shadow-lg"
            >
              Create Profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl" />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="container mx-auto max-w-5xl relative z-10 space-y-6">
        <div className={`relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl ${getBannerClass(profile?.banner, isPremium)}`}>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
          </div>


          <button
            onClick={() => setShowSettingsModal(true)}
            className="hidden sm:flex absolute top-6 right-6 items-center justify-center w-10 h-10 bg-white/60 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40 z-20"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <div className="relative z-10 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              <div className="relative mx-auto sm:mx-0 flex-shrink-0">
                <div className={`w-28 h-28 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile?.avatar_frame, isPremium)}`}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-full h-full p-5 text-gray-400" />
                  )}
                </div>
                {isEditing && (
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 hover:opacity-100 cursor-pointer rounded-full transition-opacity">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <span className="text-sm">Change</span>
                  </label>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm"
                        maxLength={20}
                        placeholder="Username"
                      />
                    ) : (
                      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                        @{username}
                      </h1>
                    )}
                    {isPremium && (
                      <Crown className="w-6 h-6 text-yellow-400" title="Premium member" />
                    )}
                  </div>
                  {profile?.active_tag && (
                    <div className="flex justify-center sm:justify-start w-full sm:w-auto">
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${getTagColorClasses(profile.active_tag.category)}`}>
                        <span>{profile.active_tag.emoji}</span>
                        <span className="text-sm font-medium">{profile.active_tag.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={160}
                    rows={3}
                    className="w-full bg-white/60 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm mb-4"
                    placeholder="Write something about yourself..."
                  />
                ) : bio ? (
                  <p className="text-gray-600 dark:text-gray-300 mb-4 max-w-2xl">
                    {bio}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-center sm:justify-start gap-4 sm:gap-6 text-sm text-gray-600 dark:text-gray-400 mb-4">
                  <button
                    onClick={() => setShowFollowModal('followers')}
                    className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    <span>
                      <strong className="text-gray-900 dark:text-white">{followersCount}</strong>{' '}
                      {t('profile.followersLabel')}
                    </span>
                  </button>
                  <button
                    onClick={() => setShowFollowModal('following')}
                    className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <Users className="w-5 h-5 mr-2" />
                    <span>
                      <strong className="text-gray-900 dark:text-white">{followingCount}</strong>{' '}
                      {t('profile.following', { count: followingCount })}
                    </span>
                  </button>
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    <span>{t('profile.joined', { date: createdAt ? formatDate(createdAt) : 'Unknown' })}</span>
                  </div>
                </div>

                {/* Desktop buttons */}
                <div className="hidden sm:flex flex-wrap justify-start gap-2">
                  {!isEditing && (
                    <>
                      <button
                        onClick={handleWhispersClick}
                        className={`relative px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 transition-colors flex items-center shadow-lg ${
                          unreadWhispers > 0 ? 'animate-pulse shadow-orange-500/50' : ''
                        }`}
                      >
                        <MessageCircle className="w-5 h-5 mr-2" />
                        {t('profile.whispers')}
                        {unreadWhispers > 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-white text-orange-600 text-xs font-bold rounded-full">
                            {unreadWhispers}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => setShowCustomizeModal(true)}
                        className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-colors flex items-center shadow-lg"
                      >
                        <Palette className="w-5 h-5 mr-2" />
                        {t('profile.customize')}
                      </button>
                      {!isPremium && (
                        <button
                          onClick={() => navigate('/premium')}
                          className="px-4 py-2.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black rounded-xl hover:from-yellow-500 hover:to-amber-600 transition-colors font-medium shadow-lg flex items-center"
                        >
                          <Crown className="w-5 h-5 mr-2" />
                          {t('oracle.premium.upgrade')}
                        </button>
                      )}
                    </>
                  )}
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleUpdateProfile}
                        className="px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-colors shadow-lg"
                      >
                        {t('profile.saveChanges')}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setNewUsername(username);
                          setBio(bio);
                        }}
                        className="px-4 py-2.5 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2.5 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                    >
                      {t('profile.editProfile')}
                    </button>
                  )}
                </div>

                {/* Mobile buttons */}
                <div className="flex sm:hidden flex-col gap-2 w-full">
                  {!isEditing && (
                    <>
                      {!isPremium && (
                        <button
                          onClick={() => navigate('/premium')}
                          className="w-full px-4 py-2.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black rounded-xl hover:from-yellow-500 hover:to-amber-600 transition-colors font-medium shadow-lg flex items-center justify-center"
                        >
                          <Crown className="w-5 h-5 mr-2" />
                          {t('oracle.premium.upgrade')}
                        </button>
                      )}
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={handleWhispersClick}
                          className={`relative flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 transition-colors flex items-center justify-center shadow-lg ${
                            unreadWhispers > 0 ? 'animate-pulse shadow-orange-500/50' : ''
                          }`}
                        >
                          <MessageCircle className="w-5 h-5 mr-2" />
                          {t('profile.whispers')}
                          {unreadWhispers > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-white text-orange-600 text-xs font-bold rounded-full">
                              {unreadWhispers}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setShowCustomizeModal(true)}
                          className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-colors flex items-center justify-center shadow-lg"
                        >
                          <Palette className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setShowSettingsModal(true)}
                          className="px-4 py-2.5 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-white rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors flex items-center justify-center backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                        >
                          <Settings className="w-5 h-5" />
                        </button>
                      </div>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="w-full px-4 py-2.5 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                      >
                        {t('profile.editProfile')}
                      </button>
                    </>
                  )}
                  {isEditing && (
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={handleUpdateProfile}
                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-colors shadow-lg"
                      >
                        {t('profile.saveChanges')}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditing(false);
                          setNewUsername(username);
                          setBio(bio);
                        }}
                        className="flex-1 px-4 py-2.5 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative rounded-2xl bg-violet-50/10 dark:bg-violet-950/5 backdrop-blur-xl border border-violet-300/40 dark:border-violet-700/30 shadow-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {t('profile.friendsActivity')}
              </h2>
            </div>
            <button
              onClick={() => navigate('/community')}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <Users className="w-4 h-4" />
              {t('profile.accessCommunity')}
            </button>
          </div>

          {followedUsersCarousel.length > 0 ? (
            <div className="relative pt-2">
              <AnimatePresence mode="wait">
                <motion.div
                  key={carouselOffset}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: 'easeInOut' }}
                  className="flex gap-5 justify-center items-end pt-20 pb-3"
                >
                  {visibleCarouselUsers.map((user, index) => {
                    const bubbleStyle = getBubbleStyle(user.lastRating);
                    return (
                      <div key={user.id} className="flex-shrink-0 flex flex-col items-center">
                        <div className="relative mb-2">
                          {user.lastRatedTitle && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 pointer-events-none">
                              <div className={`relative border rounded-xl px-2.5 py-1.5 shadow-lg backdrop-blur-sm w-[90px] ${bubbleStyle.bubble}`}>
                                <p className={`text-[9px] font-medium text-center leading-tight line-clamp-2 whitespace-normal ${bubbleStyle.titleText}`}>
                                  {user.lastRatedTitle}
                                </p>
                                {user.lastRating !== null && (
                                  <p className={`text-[10px] font-bold text-center mt-0.5 ${bubbleStyle.ratingText}`}>
                                    {user.lastRating}
                                  </p>
                                )}
                                <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent ${bubbleStyle.arrow}`} />
                              </div>
                            </div>
                          )}
                          <button
                            onClick={() => navigate(`/profile/${user.username}`)}
                            className="block"
                          >
                            <div className={`w-14 h-14 rounded-full overflow-hidden border-2 border-white/80 dark:border-gray-700/80 shadow-lg ${getFrameClass(user.avatar_frame, user.plan_type === 'premium')}`}>
                              {user.avatar_url ? (
                                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center">
                                  <User className="w-7 h-7 text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        </div>
                        <span className="text-[10px] text-gray-600 dark:text-gray-400 text-center max-w-[56px] truncate font-medium">
                          {user.username}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
              {followedUsersCarousel.length > CAROUSEL_PAGE_SIZE && (
                <div className="flex justify-center gap-0.5 mt-2 pb-1">
                  {Array.from({ length: Math.ceil(followedUsersCarousel.length / CAROUSEL_PAGE_SIZE) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCarouselAutoPaused(true);
                        setCarouselOffset(i * CAROUSEL_PAGE_SIZE);
                      }}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: carouselOffset === i * CAROUSEL_PAGE_SIZE ? '6px' : '4px',
                        height: '4px',
                        backgroundColor: carouselOffset === i * CAROUSEL_PAGE_SIZE
                          ? 'rgb(139 92 246 / 0.7)'
                          : 'rgb(156 163 175 / 0.5)'
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Follow users to see their activity here</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {t('profile.stats.ratedMovies')}
              </h2>
              <Star className="w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {ratedMoviesCount}
            </div>
          </div>

          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {t('profile.stats.favoriteGenres')}
              </h2>
              <Film className="w-5 h-5 text-purple-500" />
            </div>
            <div className="space-y-1">
              {favoriteGenres.map((genre, index) => (
                <div
                  key={genre.id}
                  className={`text-${index === 0 ? 'lg' : 'sm'} ${index === 0 ? 'font-bold' : 'font-medium'} text-gray-900 dark:text-white`}
                >
                  {genre.name}
                </div>
              ))}
              {favoriteGenres.length === 0 && (
                <div className="text-gray-500 dark:text-gray-400 text-sm">
                  {t('profile.stats.noGenresYet')}
                </div>
              )}
            </div>
          </div>

          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                {t('profile.stats.timeWatching')}
              </h2>
              <Clock className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatWatchTime(totalWatchTime)}
            </div>
          </div>
        </div>

        {ratedMoviesCount > 0 && (
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full relative rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4 shadow-xl hover:shadow-2xl hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 font-semibold"
          >
            <BarChart3 className="w-5 h-5" />
            {showStats ? t('profile.hideStats') : t('profile.showStats')}
            <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${showStats ? 'rotate-180' : ''}`} />
          </button>
        )}

        <AnimatePresence>
          {showStats && ratedMoviesCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t('profile.stats.ratingDistribution')}
                  </h2>
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                </div>
                <div className="space-y-2">
                  {[...Array(11)].map((_, i) => {
                    const rating = 10 - i;
                    return (
                      <div key={rating} className="flex items-center gap-2">
                        <div className="w-10 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                          {rating}<Star className="w-3 h-3 ml-0.5 inline fill-current" />
                        </div>
                        <div className="flex-1 h-3 bg-gray-200/50 dark:bg-gray-700/50 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${(ratingDistribution[rating] / getMaxRatingCount) * 100}%` }}
                          />
                        </div>
                        <div className="w-8 text-sm text-right text-gray-600 dark:text-gray-400">
                          {ratingDistribution[rating]}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {ratedMoviesCount > 0 && (() => {
                  const totalSum = Object.entries(ratingDistribution).reduce((acc, [r, count]) => acc + Number(r) * count, 0);
                  const avg = totalSum / ratedMoviesCount;
                  return (
                    <div className="mt-4 pt-3 border-t border-gray-200/50 dark:border-gray-700/50 flex items-center justify-end gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('profile.stats.averageRating')}:</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{avg.toFixed(1)}</span>
                    </div>
                  );
                })()}
              </div>

              {favoriteDecade && (
                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('profile.stats.favoriteDecade')}
                    </h2>
                    <ArchiveIcon className="w-5 h-5 text-amber-500" />
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900 dark:text-white">
                        {favoriteDecade.decade}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {favoriteDecade.count} {t('community.films')}
                      </div>
                    </div>

                    <div className="flex-1">
                      <div className={`text-lg font-medium mb-2 ${
                        favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                        favoriteDecade.label === 'Nostalgic' ? 'text-indigo-600 dark:text-indigo-400' :
                        'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {favoriteDecade.label}
                      </div>

                      {(() => {
                        const allDecades = favoriteDecade.allDecades || {};
                        const sorted = Object.entries(allDecades)
                          .map(([k, v]) => ({ decade: k, count: v as number }))
                          .filter(d => d.count > 0)
                          .sort((a, b) => b.count - a.count);
                        const total = sorted.reduce((a, b) => a + b.count, 0) || 1;
                        const top3 = sorted.slice(0, 3);
                        const othersCount = sorted.slice(3).reduce((a, b) => a + b.count, 0);
                        const accentBg =
                          favoriteDecade.label === 'Grandpa Cinema' ? 'bg-amber-500' :
                          favoriteDecade.label === 'Nostalgic' ? 'bg-blue-500' : 'bg-emerald-500';
                        const accentText =
                          favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-500' :
                          favoriteDecade.label === 'Nostalgic' ? 'text-blue-500' : 'text-emerald-500';
                        const accentGlow =
                          favoriteDecade.label === 'Grandpa Cinema' ? 'rgba(245,158,11,0.5)' :
                          favoriteDecade.label === 'Nostalgic' ? 'rgba(59,130,246,0.5)' : 'rgba(16,185,129,0.5)';
                        const segs = [
                          ...top3.map((d, i) => ({ key: d.decade, count: d.count, rank: i })),
                          ...(othersCount > 0 ? [{ key: 'outros', count: othersCount, rank: 3 }] : [])
                        ];
                        return (
                          <div className="space-y-1.5">
                            <div className="flex gap-1 h-4 rounded-lg overflow-hidden">
                              {segs.map((seg) => {
                                const pct = (seg.count / total) * 100;
                                const isFirst = seg.rank === 0;
                                return (
                                  <div
                                    key={seg.key}
                                    title={`${seg.key}: ${seg.count} filmes`}
                                    className={`h-full rounded-sm transition-all duration-300 ${isFirst ? accentBg : seg.rank === 3 ? 'bg-gray-200/60 dark:bg-gray-700/50' : 'bg-gray-300/70 dark:bg-gray-600/60'}`}
                                    style={{
                                      width: `${pct}%`,
                                      boxShadow: isFirst ? `0 0 8px ${accentGlow}` : undefined,
                                    }}
                                  />
                                );
                              })}
                            </div>
                            <div className="flex gap-1">
                              {segs.map((seg) => {
                                const pct = (seg.count / total) * 100;
                                const isFirst = seg.rank === 0;
                                return (
                                  <div
                                    key={seg.key}
                                    className={`text-center text-[9px] font-semibold truncate ${isFirst ? accentText : 'text-gray-400 dark:text-gray-500'}`}
                                    style={{ width: `${pct}%` }}
                                  >
                                    {seg.key}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {t('profile.stats.favoriteActors')}
                    </h2>
                    <Award className="w-5 h-5 text-pink-500" />
                  </div>
                  {topActors.length > 0 ? (
                    <div className="space-y-2">
                      {topActors.map((actor, index) => (
                        <div key={actor.id} className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {index + 1}. {actor.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {actor.count} {actor.count === 1 ? t('community.film') : t('community.films')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">
                      {t('common.no_data')}
                    </div>
                  )}
                </div>

                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {t('profile.stats.favoriteDirectors')}
                    </h2>
                    <Film className="w-5 h-5 text-indigo-500" />
                  </div>
                  {topDirectors.length > 0 ? (
                    <div className="space-y-2">
                      {topDirectors.map((director, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 dark:text-white text-sm">
                            {index + 1}. {director.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {director.count} {director.count === 1 ? t('community.film') : t('community.films')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">
                      {t('common.no_data')}
                    </div>
                  )}
                </div>

                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                      {t('profile.stats.leastKnownGem')}
                    </h2>
                    <TrendingDown className="w-5 h-5 text-emerald-500" />
                  </div>
                  {leastKnownGem ? (
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white mb-1 text-sm">
                        {leastKnownGem.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {new Date(leastKnownGem.release_date).getFullYear()}
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center text-yellow-500">
                          <Star className="w-4 h-4 fill-current mr-1" />
                          <span className="text-sm">{leastKnownGem.vote_average.toFixed(1)}</span>
                        </div>
                        {leastKnownGem.userRating && (
                          <div className="flex items-center text-xs">
                            <span className="text-gray-500 dark:text-gray-400 mr-1">{t('movies.yourRating')}:</span>
                            <span className="font-medium text-gray-900 dark:text-white">{leastKnownGem.userRating}/10</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">
                      {t('profile.stats.noHiddenGems')}
                    </div>
                  )}
                </div>
              </div>

              {!essenceLoading && (() => {
                const isPt = i18n.language.startsWith('pt');
                const hasEssence = essencePersonality?.personalidade_completa && essenceArchetype;
                const archetypeColor = (() => {
                  const third = essencePersonality?.personalidade_completa?.charAt(2) ?? '';
                  const map: Record<string, string> = { A: '#fbbf24', B: '#64748b', K: '#ef4444', X: '#3b82f6', D: '#6b7280', L: '#10b981' };
                  return map[third] || '#3b82f6';
                })();
                const archetypeId = essencePersonality?.personalidade_completa?.slice(0, 2) || '';
                const subcategoryId = essencePersonality?.personalidade_completa?.slice(2, 3) || null;

                return hasEssence ? (
                  <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
                      {isPt ? 'Essência Cinematográfica' : 'Cinematic Essence'}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <ArchetypeSymbol archetypeId={archetypeId} subcategoryId={subcategoryId} size={64} animated={false} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-lg font-bold" style={{ color: archetypeColor }}>
                            {essencePersonality!.personalidade_completa}
                          </span>
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                            {essenceArchetype!.archetype_name} {essenceArchetype!.subcategory_name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                          {essenceArchetype!.description}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <motion.button
                          onClick={() => setShowEssenceRevelation(true)}
                          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                          className="p-2 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 dark:bg-pink-500/15 dark:hover:bg-pink-500/25 text-pink-600 dark:text-pink-400 border border-pink-400/20 transition-all duration-200"
                          title={isPt ? 'Revelação' : 'Revelation'}
                        >
                          <Scroll className="w-4 h-4" />
                        </motion.button>
                        <motion.button
                          onClick={() => setShowEssenceInfo(true)}
                          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                          className="p-2 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 dark:bg-blue-500/15 dark:hover:bg-blue-500/25 text-blue-600 dark:text-blue-400 border border-blue-400/20 transition-all duration-200"
                          title="Info"
                        >
                          <Info className="w-4 h-4" />
                        </motion.button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                          {isPt ? 'Essência Cinematográfica' : 'Cinematic Essence'}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                          {isPt
                            ? 'Descubra o arquétipo que define seu gosto cinematográfico.'
                            : 'Discover the archetype that defines your cinematic taste.'}
                        </p>
                      </div>
                      <motion.button
                        onClick={() => navigate('/oracle')}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-md whitespace-nowrap"
                      >
                        {isPt ? 'Descubra sua Essência' : 'Discover your Essence'}
                      </motion.button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showWhispersModal && session?.user?.id && (
        <WhispersModal
          isOpen={showWhispersModal}
          onClose={() => setShowWhispersModal(false)}
          userId={session.user.id}
          onMarkAsRead={fetchUnreadWhispers}
        />
      )}

      {showFollowModal && session?.user?.id && (
        <FollowersModal
          isOpen={true}
          onClose={() => setShowFollowModal(null)}
          userId={session.user.id}
          type={showFollowModal}
          onFollowChange={fetchProfile}
        />
      )}

      <CustomizeModal
        isOpen={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
        onSave={() => {
          fetchProfile();
        }}
      />

      <AnimatePresence>
        {showEssenceRevelation && essenceArchetype && essencePersonality && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-4"
            onClick={() => setShowEssenceRevelation(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }} transition={{ type: 'spring', duration: 0.4 }}
              className="relative max-w-xl w-full max-h-[calc(100vh-5rem)] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative bg-gray-900/95 backdrop-blur-md rounded-3xl shadow-2xl border border-gray-700/60 p-8">
                <button onClick={() => setShowEssenceRevelation(false)} className="absolute top-4 right-4 z-10 p-2.5 bg-gray-700/60 hover:bg-gray-700 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-300" />
                </button>
                <div className="flex items-center justify-center gap-3 mb-6">
                  <Scroll className="w-8 h-8 text-pink-400" style={{ filter: 'drop-shadow(0 0 8px rgba(236,72,153,0.5))' }} />
                  <h2 className="text-2xl font-bold text-white">{i18n.language.startsWith('pt') ? 'Revelação' : 'Revelation'}</h2>
                </div>
                <div className="text-center mb-6 rounded-xl p-5 border border-gray-700/60 bg-gray-800/50">
                  <p className="text-3xl font-bold mb-1" style={{ color: (() => { const t = essencePersonality.personalidade_completa?.charAt(2) ?? ''; return ({ A: '#fbbf24', B: '#64748b', K: '#ef4444', X: '#3b82f6', D: '#6b7280', L: '#10b981' } as Record<string,string>)[t] || '#3b82f6'; })() }}>
                    {essencePersonality.personalidade_completa}
                  </p>
                  <p className="text-lg text-gray-200 font-semibold">{essenceArchetype.archetype_name} {essenceArchetype.subcategory_name}</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl p-5 border border-pink-500/20 bg-pink-500/5">
                    <h3 className="text-base font-bold text-pink-400 mb-2">{i18n.language.startsWith('pt') ? `Sua Essência (${essenceArchetype.archetype_name})` : `Your Essence (${essenceArchetype.archetype_name})`}</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">{essenceArchetype.archetype_description}</p>
                  </div>
                  <div className="rounded-xl p-5 border border-blue-500/20 bg-blue-500/5">
                    <h3 className="text-base font-bold text-blue-400 mb-2">{i18n.language.startsWith('pt') ? `Sua Sintonia (${essenceArchetype.subcategory_name})` : `Your Attunement (${essenceArchetype.subcategory_name})`}</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">{essenceArchetype.subcategory_description}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEssenceInfo && essencePersonality && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[9999] flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-4"
            onClick={() => setShowEssenceInfo(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }} transition={{ type: 'spring', duration: 0.4 }}
              className="relative max-w-xl w-full max-h-[calc(100vh-5rem)] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative bg-gray-900/95 backdrop-blur-md rounded-3xl shadow-2xl border border-gray-700/60 p-8">
                <button onClick={() => setShowEssenceInfo(false)} className="absolute top-4 right-4 z-10 p-2.5 bg-gray-700/60 hover:bg-gray-700 rounded-full transition-colors">
                  <X className="w-5 h-5 text-gray-300" />
                </button>
                <div className="flex items-center justify-center gap-3 mb-6">
                  <Info className="w-8 h-8 text-blue-400" style={{ filter: 'drop-shadow(0 0 8px rgba(96,165,250,0.5))' }} />
                  <h2 className="text-2xl font-bold text-white">{i18n.language.startsWith('pt') ? 'A Arquitetura da Alma' : "The Soul's Architecture"}</h2>
                </div>
                <p className="text-center italic text-gray-400 text-sm mb-6">
                  {i18n.language.startsWith('pt')
                    ? 'Seu Arquétipo não é adivinhação. É a arquitetura de seus gostos, construída em duas etapas:'
                    : 'Your Archetype is not guesswork. It is the architecture of your tastes, built in two stages:'}
                </p>
                <div className="space-y-4">
                  <div className="rounded-xl p-5 border border-blue-500/20 bg-blue-500/5">
                    <h3 className="text-base font-bold text-blue-300 mb-2 flex items-center gap-2">
                      <span>1.</span> {i18n.language.startsWith('pt') ? `A Essência (${essenceArchetype?.archetype_name})` : `The Essence (${essenceArchetype?.archetype_name})`}
                    </h3>
                    <p className="text-gray-300 text-sm leading-relaxed mb-3">
                      {i18n.language.startsWith('pt')
                        ? `Seu perfil principal (${essencePersonality.arquetipo_primario}${essencePersonality.arquetipo_secundario}) é a soma matemática do que você ama e odeia. Cada filme que você avalia move cinco balanças: Emocional (E), Intelectual (I), Cultural (C), Sensorial (S) e Recreativa (R).`
                        : `Your main profile (${essencePersonality.arquetipo_primario}${essencePersonality.arquetipo_secundario}) is the mathematical sum of what you love and hate. Every film you rate moves five scales: Emotional (E), Intellectual (I), Cultural (C), Sensorial (S), and Recreational (R).`}
                    </p>
                  </div>
                  <div className="rounded-xl p-5 border border-amber-500/20 bg-amber-500/5">
                    <h3 className="text-base font-bold text-amber-300 mb-2 flex items-center gap-2">
                      <span>2.</span> {i18n.language.startsWith('pt') ? `A Sintonia (${essenceArchetype?.subcategory_name})` : `The Attunement (${essenceArchetype?.subcategory_name})`}
                    </h3>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {i18n.language.startsWith('pt')
                        ? 'A terceira letra vem de um questionário de 12 perguntas. Ela revela sua sintonia emocional com o cinema: Radiante (A), Sombrio (B), Clássico (K), Experimental (X), Denso (D) ou Leve (L).'
                        : 'The third letter comes from a 12-question questionnaire. It reveals your emotional attunement to cinema: Radiant (A), Dark (B), Classic (K), Experimental (X), Dense (D), or Light (L).'}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
    </div>
  );
}
