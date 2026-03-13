import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Star, BarChart3, Users, Calendar, Film, Clock, MessageCircle, Crown, Palette, Archive as ArchiveIcon, Award, Tv, TrendingDown, X, Loader2, Settings } from 'lucide-react';
import { supabase, getProfile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import RatingBox from '../components/RatingBox';
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
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

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
    if (followedUsersCarousel.length <= CAROUSEL_PAGE_SIZE) return;
    const timer = setInterval(() => {
      setCarouselOffset(prev => {
        const next = prev + CAROUSEL_PAGE_SIZE;
        return next >= followedUsersCarousel.length ? 0 : next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [followedUsersCarousel.length, CAROUSEL_PAGE_SIZE]);

  const visibleCarouselUsers = followedUsersCarousel.slice(carouselOffset, carouselOffset + CAROUSEL_PAGE_SIZE);

  const getBubbleStyle = (rating: number | null): { bubble: string; titleText: string; ratingText: string; arrow: string } => {
    if (rating === null) return { bubble: 'bg-white/90 dark:bg-gray-700/90 border-gray-200 dark:border-gray-600', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-gray-400', arrow: 'border-t-white dark:border-t-gray-700' };
    if (rating === 10) return { bubble: 'bg-pink-50/90 dark:bg-pink-900/40 border-pink-300 dark:border-pink-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-pink-600 dark:text-pink-400', arrow: 'border-t-pink-50 dark:border-t-pink-900' };
    if (rating >= 7) return { bubble: 'bg-green-50/90 dark:bg-green-900/40 border-green-300 dark:border-green-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-green-600 dark:text-green-400', arrow: 'border-t-green-50 dark:border-t-green-900' };
    if (rating >= 4) return { bubble: 'bg-yellow-50/90 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-yellow-600 dark:text-yellow-400', arrow: 'border-t-yellow-50 dark:border-t-yellow-900' };
    return { bubble: 'bg-red-50/90 dark:bg-red-900/40 border-red-300 dark:border-red-500/50', titleText: 'text-gray-700 dark:text-gray-200', ratingText: 'text-red-600 dark:text-red-400', arrow: 'border-t-red-50 dark:border-t-red-900' };
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile();
      fetchMovieStats();
      fetchUnreadWhispers();
      fetchFollowedUsersForCarousel();

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
      console.log('Language changed in Profile, reloading stats...');
      if (typeof window !== 'undefined') {
        const { cache } = require('../lib/cache');
        cache.invalidatePattern('movie:');
      }
      if (session?.user?.id) {
        fetchMovieStats();
      }
    };

    const handleEpisodeToggled = () => {
      console.log('Episode toggled, reloading stats...');
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
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
    }
  }, []);

  const getOracleTags = () => {
    const tags = [];
    const predictions = profile?.oracle_predictions_count || 0;
    const recommendations = profile?.oracle_recommendations_count || 0;

    if (predictions >= 1000) tags.push({ emoji: '', name: 'Timeline Overlord', progress: predictions, total: 1000, category: 'oracle' });
    else if (predictions >= 500) tags.push({ emoji: '', name: 'Fate Architect', progress: predictions, total: 500, category: 'oracle' });
    else if (predictions >= 200) tags.push({ emoji: '', name: 'Oracle\'s Chosen', progress: predictions, total: 200, category: 'oracle' });
    else if (predictions >= 100) tags.push({ emoji: '', name: 'Future Whisperer', progress: predictions, total: 100, category: 'oracle' });
    else if (predictions >= 50) tags.push({ emoji: '', name: 'Mind Decoder', progress: predictions, total: 50, category: 'oracle' });
    else if (predictions >= 25) tags.push({ emoji: '', name: 'Pattern Hunter', progress: predictions, total: 25, category: 'oracle' });
    else if (predictions >= 10) tags.push({ emoji: '', name: 'Curious Seeker', progress: predictions, total: 10, category: 'oracle' });

    if (recommendations >= 1000) tags.push({ emoji: '', name: 'Multiverse Sommelier', progress: recommendations, total: 1000, category: 'oracle' });
    else if (recommendations >= 500) tags.push({ emoji: '', name: 'Galaxy Curator', progress: recommendations, total: 500, category: 'oracle' });
    else if (recommendations >= 200) tags.push({ emoji: '', name: 'Recommendation Lord', progress: recommendations, total: 200, category: 'oracle' });
    else if (recommendations >= 100) tags.push({ emoji: '', name: 'Taste Alchemist', progress: recommendations, total: 100, category: 'oracle' });
    else if (recommendations >= 50) tags.push({ emoji: '', name: 'Genre Explorer', progress: recommendations, total: 50, category: 'oracle' });
    else if (recommendations >= 25) tags.push({ emoji: '', name: 'Hidden Gem Hunter', progress: recommendations, total: 25, category: 'oracle' });
    else if (recommendations >= 10) tags.push({ emoji: '', name: 'Popcorn Taster', progress: recommendations, total: 10, category: 'oracle' });

    return tags;
  };

  const handleWhispersClick = () => {
    setShowWhispersModal(true);
  };

  if (loading) {
    return (
      <motion.div
        className="min-h-[calc(100vh-4rem)] flex justify-center items-center bg-gradient-to-br from-blue-50/80 via-cyan-50/50 to-teal-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-cyan-950/50 relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-400/20 dark:bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        <div className="p-8 rounded-2xl bg-white/60 dark:bg-gray-800/60 shadow-2xl border border-white/60 dark:border-gray-700/60 backdrop-blur-xl">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium text-center">
            {t('common.loading')}
          </p>
        </div>
      </motion.div>
    );
  }

  if (!profileExists) {
    return (
      <motion.div
        className="container mx-auto px-4 py-8 min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50/80 via-cyan-50/50 to-teal-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-cyan-950/50 relative overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-400/20 dark:bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        <div className="max-w-2xl mx-auto bg-white/60 dark:bg-gray-800/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
          <div className="p-8 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
            </motion.div>
            <motion.h2
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 mb-4"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              Welcome! Let's set up your profile
            </motion.h2>
            <motion.p
              className="text-gray-600 dark:text-gray-300 mb-6"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              It looks like you haven't created a profile yet. Click below to get started.
            </motion.p>
            <motion.button
              onClick={createProfile}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-colors shadow-lg"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Create Profile
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-cyan-50/50 to-teal-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-cyan-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-20 w-96 h-96 bg-blue-400/20 dark:bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -right-20 w-80 h-80 bg-cyan-400/20 dark:bg-cyan-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-teal-400/15 dark:bg-teal-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        <div
          className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.5) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      <div className="container mx-auto max-w-4xl relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <motion.div
            variants={itemVariants}
            className={`bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/60 dark:border-gray-700/60 ${getBannerClass(profile?.banner, isPremium)} relative`}
          >
            <motion.button
              onClick={() => setShowSettingsModal(true)}
              className="hidden sm:flex absolute top-8 right-8 items-center justify-center w-10 h-10 bg-white/60 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </motion.button>

            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6">
                <div className="relative mx-auto sm:mx-0 mb-4 sm:mb-0">
                  <div className={`w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 ${getFrameClass(profile?.avatar_frame, isPremium)}`}>
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-full h-full p-4 text-gray-400" />
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-2">
                      {isEditing ? (
                        <div className="w-full sm:w-auto">
                          <input
                            type="text"
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm"
                            maxLength={20}
                            placeholder="Username"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            @{username}
                          </h1>
                          {isPremium && (
                            <motion.div
                              whileHover={{ rotate: 360 }}
                              transition={{ duration: 0.5 }}
                              className="inline-block align-middle ml-2"
                            >
                              <Crown className="w-5 h-5 text-yellow-400" title="Premium member" />
                            </motion.div>
                          )}
                        </div>
                      )}
                      {profile?.active_tag && (
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-sm ${
                          getTagColorClasses(profile.active_tag.category)
                        }`}>
                          <span>{profile.active_tag.emoji}</span>
                          <span className="text-sm font-medium">
                            {profile.active_tag.name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center sm:justify-between items-center gap-4 sm:gap-6 text-sm text-gray-600 dark:text-gray-400 mb-4">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <motion.button
                        onClick={() => setShowFollowModal('followers')}
                        className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                        whileHover={{ scale: 1.05 }}
                      >
                        <Users className="w-5 h-5 mr-2" />
                        <span>
                          <strong className="text-gray-900 dark:text-white">
                            {followersCount}
                          </strong>{' '}
                          {t('profile.followersLabel')}
                        </span>
                      </motion.button>
                      <motion.button
                        onClick={() => setShowFollowModal('following')}
                        className="flex items-center hover:text-gray-900 dark:hover:text-white transition-colors"
                        whileHover={{ scale: 1.05 }}
                      >
                        <Users className="w-5 h-5 mr-2" />
                        <span>
                          <strong className="text-gray-900 dark:text-white">
                            {followingCount}
                          </strong>{' '}
                          {t('profile.following', { count: followingCount })}
                        </span>
                      </motion.button>
                    </div>
                    {!isPremium && (
                      <motion.button
                        onClick={() => navigate('/premium')}
                        className="hidden sm:flex items-center px-4 py-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black rounded-xl hover:from-yellow-500 hover:to-amber-600 transition-colors font-medium shadow-lg hover:shadow-md"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Crown className="w-4 h-4 mr-2" />
                        {t('oracle.premium.upgrade')}
                      </motion.button>
                    )}
                  </div>

                  <div className="sm:hidden text-xs text-gray-600 dark:text-gray-400 mb-4">
                    <div className="flex items-center justify-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      <span>{t('profile.joined', { date: createdAt ? formatDate(createdAt) : 'Unknown' })}</span>
                    </div>
                  </div>

                  <div className="mt-4 sm:mt-0">
                    {isEditing ? (
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={160}
                        rows={3}
                        className="w-full bg-white/60 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 backdrop-blur-sm"
                        placeholder="Write something about yourself..."
                      />
                    ) : (
                      <p className="text-gray-600 dark:text-gray-300 sm:mb-4">
                        {bio || t('profile.bio')}
                      </p>
                    )}
                  </div>

                  <div className="hidden sm:flex items-center justify-between mt-6">
                    <div className="flex items-center text-gray-600 dark:text-gray-400">
                      <Calendar className="w-5 h-5 mr-2" />
                      <span>{t('profile.joined', { date: createdAt ? formatDate(createdAt) : 'Unknown' })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-2">
                        {!isEditing && (
                          <>
                            <motion.button
                              onClick={handleWhispersClick}
                              className={`relative px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 transition-colors flex items-center shadow-lg ${
                                unreadWhispers > 0 ? 'animate-pulse shadow-orange-500/50' : ''
                              }`}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <MessageCircle className="w-5 h-5 mr-2" />
                              {t('profile.whispers')}
                              {unreadWhispers > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-white text-orange-600 text-xs font-bold rounded-full">
                                  {unreadWhispers}
                                </span>
                              )}
                            </motion.button>
                            <motion.button
                              onClick={() => setShowCustomizeModal(true)}
                              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-colors flex items-center shadow-lg"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Palette className="w-5 h-5 mr-2" />
                              {t('profile.customize')}
                            </motion.button>
                          </>
                        )}
                        {isEditing ? (
                          <>
                            <motion.button
                              onClick={handleUpdateProfile}
                              className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-colors shadow-lg"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {t('profile.saveChanges')}
                            </motion.button>
                            <motion.button
                              onClick={() => {
                                setIsEditing(false);
                                setNewUsername(username);
                                setBio(bio);
                              }}
                              className="px-4 py-2 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {t('common.cancel')}
                            </motion.button>
                          </>
                        ) : (
                          <motion.button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {t('profile.editProfile')}
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 sm:hidden">
                    <div className="flex flex-col gap-2">
                      {!isPremium && (
                        <motion.button
                          onClick={() => navigate('/premium')}
                          className="w-full px-4 py-2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black rounded-xl hover:from-yellow-500 hover:to-amber-600 transition-colors flex items-center justify-center font-medium shadow-lg hover:shadow-xl"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <Crown className="w-5 h-5 mr-2" />
                          {t('oracle.premium.upgrade')}
                        </motion.button>
                      )}
                      {!isEditing && (
                        <div className="flex gap-2">
                          <motion.button
                            onClick={handleWhispersClick}
                            className={`relative flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 transition-colors flex items-center justify-center shadow-lg ${
                              unreadWhispers > 0 ? 'animate-pulse shadow-orange-500/50' : ''
                            }`}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <MessageCircle className="w-5 h-5" />
                            {unreadWhispers > 0 && (
                              <span className="ml-2 px-2 py-0.5 bg-white text-orange-600 text-xs font-bold rounded-full">
                                {unreadWhispers}
                              </span>
                            )}
                          </motion.button>
                          <motion.button
                            onClick={() => setShowCustomizeModal(true)}
                            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-colors flex items-center justify-center shadow-lg"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <Palette className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            onClick={() => setShowSettingsModal(true)}
                            className="px-4 py-2 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-white rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors flex items-center justify-center backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <Settings className="w-5 h-5" />
                          </motion.button>
                        </div>
                      )}
                      {isEditing ? (
                        <>
                          <motion.button
                            onClick={handleUpdateProfile}
                            className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl hover:from-green-600 hover:to-emerald-600 transition-colors shadow-lg"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {t('profile.saveChanges')}
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              setIsEditing(false);
                              setNewUsername(username);
                              setBio(bio);
                            }}
                            className="w-full px-4 py-2 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {t('common.cancel')}
                          </motion.button>
                        </>
                      ) : (
                        <motion.button
                          onClick={() => setIsEditing(true)}
                          className="w-full px-4 py-2 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {t('profile.editProfile')}
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="bg-gradient-to-br from-blue-500/10 via-cyan-500/10 to-teal-500/10 dark:from-blue-500/20 dark:via-cyan-500/20 dark:to-teal-500/20 rounded-2xl shadow-2xl p-6 transform transition-all duration-300 hover:shadow-xl backdrop-blur-xl border-2 border-blue-300/50 dark:border-blue-500/30"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {t('profile.friendsActivity')}
                </h2>
              </div>
              <motion.button
                onClick={() => navigate('/community')}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg hover:shadow-xl"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Users className="w-4 h-4" />
                {t('profile.accessCommunity')}
              </motion.button>
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
                            <motion.button
                              onClick={() => navigate(`/profile/${user.username}`)}
                              className="block"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                              animate={{ y: [0, -4, 0] }}
                              transition={{
                                y: { duration: 2.5 + index * 0.3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 },
                              }}
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
                            </motion.button>
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
                  <div className="flex justify-center gap-1.5 mt-2 pb-1">
                    {Array.from({ length: Math.ceil(followedUsersCarousel.length / CAROUSEL_PAGE_SIZE) }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCarouselOffset(i * CAROUSEL_PAGE_SIZE)}
                        className={`rounded-full transition-all duration-300 ${carouselOffset === i * CAROUSEL_PAGE_SIZE ? 'bg-blue-500 w-4' : 'bg-gray-300 dark:bg-gray-600 w-2'}`}
                        style={{ height: '6px' }}
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
          </motion.div>

          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.ratedMovies')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center">
                  <Star className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400">
                {ratedMoviesCount}
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteGenres')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
                  <Film className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="space-y-2">
                {favoriteGenres.map((genre, index) => (
                  <div
                    key={genre.id}
                    className={`text-${index === 0 ? 'xl' : 'base'} ${
                      index === 0 ? 'font-bold' : 'font-medium'
                    } text-gray-900 dark:text-white text-center`}
                  >
                    {genre.name}
                  </div>
                ))}
                {favoriteGenres.length === 0 && (
                  <div className="text-gray-500 dark:text-gray-400 text-center">
                    {t('profile.stats.noGenresYet')}
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.timeWatching')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400">
                {formatWatchTime(totalWatchTime)}
              </div>
            </motion.div>
          </motion.div>

          {ratedMoviesCount > 0 && (
            <motion.button
              variants={itemVariants}
              onClick={() => setShowStats(!showStats)}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-2xl p-4 shadow-xl transition-all duration-300 flex items-center justify-center gap-2 font-semibold"
            >
              <BarChart3 className="w-5 h-5" />
              {showStats ? t('profile.hideStats') : t('profile.showStats')}
              <svg
                className={`w-5 h-5 transition-transform duration-300 ${showStats ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </motion.button>
          )}

          {showStats && (
          <>
          <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                {t('profile.stats.ratingDistribution')}
              </h2>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              {[...Array(11)].map((_, i) => {
                const rating = 10 - i;
                const percentage = (ratingDistribution[rating] / getMaxRatingCount) * 100;
                return (
                  <div key={rating} className="flex items-center gap-2">
                    <div className="w-12 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                      {rating}<Star className="w-3 h-3 ml-0.5 inline fill-current" />
                    </div>
                    <div className="flex-1 h-4 bg-gray-100/80 dark:bg-gray-700/80 rounded-full overflow-hidden backdrop-blur-sm">
                      <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-blue-400 dark:to-cyan-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, delay: i * 0.05, ease: "easeOut" }}
                      />
                    </div>
                    <div className="w-8 text-sm text-right text-gray-600 dark:text-gray-400">
                      {ratingDistribution[rating]}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {favoriteDecade && (
            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteDecade')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <ArchiveIcon className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-center">
                  <div className={`text-4xl font-bold mb-1 ${
                    favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                    favoriteDecade.label === 'Nostalgic' ? 'text-blue-600 dark:text-blue-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {favoriteDecade.decade.replace('s', '')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {favoriteDecade.count} {t('community.films')} - {Math.round(favoriteDecade.percentage)}%
                  </div>
                  <div className={`text-xs font-medium mt-1 ${
                    favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                    favoriteDecade.label === 'Nostalgic' ? 'text-blue-600 dark:text-blue-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {favoriteDecade.label === 'Grandpa Cinema' ? 'Grandpa Cinema' :
                     favoriteDecade.label === 'Nostalgic' ? 'Nostalgic' :
                     'Modern Lover'}
                  </div>
                </div>

                <div className="relative">
                  <div className="h-3 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden backdrop-blur-sm">
                    <motion.div
                      className={`h-full rounded-full ${
                        favoriteDecade.label === 'Grandpa Cinema' ? 'bg-gradient-to-r from-amber-400 to-orange-500' :
                        favoriteDecade.label === 'Nostalgic' ? 'bg-gradient-to-r from-blue-400 to-cyan-500' :
                        'bg-gradient-to-r from-emerald-400 to-teal-500'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, favoriteDecade.percentage)}%` }}
                      transition={{ duration: 1, delay: 0.3 }}
                    />
                  </div>
                </div>

                {favoriteDecade.allDecades && Object.keys(favoriteDecade.allDecades).length > 1 && (
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {t('profile.stats.otherDecades')}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(favoriteDecade.allDecades)
                        .sort(([a], [b]) => parseInt(b) - parseInt(a))
                        .filter(([decade]) => decade !== favoriteDecade.decade)
                        .map(([decade, count]) => {
                          const totalMovies = Object.values(favoriteDecade.allDecades!).reduce((sum, c) => sum + c, 0);
                          const percentage = (count / totalMovies) * 100;

                          return (
                            <div
                              key={decade}
                              className="flex items-center justify-between px-3 py-2 bg-white/40 dark:bg-gray-700/40 rounded-xl backdrop-blur-sm"
                            >
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {decade.replace('s', '')}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {count}
                                </span>
                                <div className="w-12 h-1.5 bg-gray-200/80 dark:bg-gray-600/80 rounded-full overflow-hidden">
                                  <motion.div
                                    className="h-full bg-gray-400 dark:bg-gray-500 rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 0.8, delay: 0.5 }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteActors')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center">
                  <Award className="w-5 h-5 text-white" />
                </div>
              </div>
              {topActors.length > 0 ? (
                <div className="space-y-2">
                  {topActors.map((actor, index) => (
                    <div key={actor.id} className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {index + 1}. {actor.name}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {actor.count} {actor.count === 1 ? t('community.film') : t('community.films')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  {t('common.no_data')}
                </div>
              )}
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteDirectors')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
                  <Film className="w-5 h-5 text-white" />
                </div>
              </div>
              {topDirectors.length > 0 ? (
                <div className="space-y-2">
                  {topDirectors.map((director, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {index + 1}. {director.name}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {director.count} {director.count === 1 ? t('community.film') : t('community.films')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  {t('common.no_data')}
                </div>
              )}
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white/50 dark:bg-gray-800/50 rounded-2xl shadow-xl p-6 transform transition-all duration-300 hover:shadow-2xl backdrop-blur-xl border border-white/60 dark:border-gray-700/60">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.leastKnownGem')}
                </h2>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-white" />
                </div>
              </div>
              {leastKnownGem ? (
                <div className="flex flex-col">
                  <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                    {leastKnownGem.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {new Date(leastKnownGem.release_date).getFullYear()}
                  </p>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center text-yellow-500">
                      <Star className="w-4 h-4 fill-current mr-1" />
                      <span className="text-sm">{leastKnownGem.vote_average.toFixed(1)}</span>
                    </div>
                    {leastKnownGem.userRating && (
                      <div className="flex items-center">
                        <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">{t('movies.yourRating')}:</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{leastKnownGem.userRating}/10</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  {t('profile.stats.noHiddenGems')}
                </div>
              )}
            </motion.div>
          </motion.div>

          </>
          )}
        </motion.div>

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

        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />
      </div>
    </motion.div>
  );
}
