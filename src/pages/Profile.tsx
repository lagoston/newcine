import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Star, BarChart3, Users, Calendar, Film, Clock, MessageCircle, Crown, Palette, ArchiveIcon, Award, Tv, TrendingDown, X, Loader2, Settings } from 'lucide-react';
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
import { motion } from 'framer-motion';
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
  label: string; // "Grandpa Cinema", "Nostalgic", or "Modern Lover"
  percentage: number;
  allDecades?: DecadeCount; // Todas as décadas com contagens
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

  // Animation variants for staggered animations
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

  // Reload when language changes
  useEffect(() => {
    const handleLanguageChange = () => {
      console.log('🌍 Language changed in Profile, reloading stats...');
      // Clear movie cache to reload with new language
      if (typeof window !== 'undefined') {
        const { cache } = require('../lib/cache');
        cache.invalidatePattern('movie:');
      }
      if (session?.user?.id) {
        fetchMovieStats();
      }
    };

    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
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

  const fetchMovieStats = async () => {
    try {
      if (!session?.user?.id) return;

      const cacheKey = CACHE_KEYS.USER_STATS(session.user.id);
      const cachedStats = cache.get<any>(cacheKey);

      if (cachedStats) {
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

      const totalMinutes = validMovies.reduce((sum, movie) => sum + (movie.runtime || 0), 0);
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

      // Calculate favorite decade
      const decadeCounts: DecadeCount = {};
      let totalRatedMovies = 0;

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
        // Find decade with most movies
        let topDecade = '';
        let topCount = 0;

        for (const [decade, count] of Object.entries(decadeCounts)) {
          if (count > topCount) {
            topDecade = decade;
            topCount = count;
          }
        }

        // Calculate percentage
        const percentage = (topCount / totalRatedMovies) * 100;

        // Determine label based on decade
        let label = '';
        const decadeNum = parseInt(topDecade);

        if (decadeNum < 1980) {
          label = 'Grandpa Cinema';
        } else if (decadeNum < 2010) {
          label = 'Nostalgic';
        } else {
          label = 'Modern Lover';
        }

        setFavoriteDecade({
          decade: topDecade,
          count: topCount,
          label,
          percentage: percentage,
          allDecades: decadeCounts // Adiciona todas as décadas
        });
      }

      // Calculate top actors
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

      // Calculate top directors
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

      // Find least-known gem (movie with lowest vote_count that the user has rated)
      const ratedMoviesWithVoteCounts = validMovies
        .filter(movie => movie.userRating !== null && movie.vote_count !== undefined)
        .sort((a, b) => (a.vote_count || 0) - (b.vote_count || 0));

      if (ratedMoviesWithVoteCounts.length > 0) {
        const leastRated = ratedMoviesWithVoteCounts[0];
        setLeastKnownGem({
          id: leastRated.id,
          title: leastRated.title,
          vote_count: leastRated.vote_count || 0,
          release_date: leastRated.release_date,
          vote_average: leastRated.vote_average,
          userRating: leastRated.userRating
        });
      }

      cache.set(cacheKey, {
        ratedMoviesCount: userMovies.length,
        ratingDistribution: distribution,
        totalWatchTime: totalMinutes,
        favoriteGenres: topGenres,
        favoriteDecade: favoriteDecade,
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

      // Use standardized profile fetching function
      const { data: profileData, error } = await getProfile(session.user.id);

      if (error) throw error;

      if (!profileData) {
        setProfileExists(false);
        return;
      }

      // Get follower count
      const { count: followersCount, error: followersError } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', session.user.id);

      if (followersError) throw followersError;

      // Get the following count
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

      // Force refresh premium status in auth context
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
      // Use the standardized function from supabase.ts
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

      // Username validation
      if (!newUsername.trim()) {
        toast.error('Username cannot be empty');
        return;
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
        toast.error('Username must be 3-20 characters and can only contain letters, numbers, and underscores');
        return;
      }

      // Check if username is already taken (only if username changed)
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
    if (!isEditing) return; // Only allow avatar changes in edit mode

    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    // Check if file is animated (GIF, WEBP, APNG)
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const animatedFormats = ['gif', 'webp', 'apng'];
    const animatedMimeTypes = ['image/gif', 'image/webp', 'image/apng'];

    const isAnimated =
      animatedFormats.includes(fileExt || '') ||
      animatedMimeTypes.includes(file.type) ||
      file.type.startsWith('image/') && (file.name.toLowerCase().includes('.gif'));

    if (isAnimated && !isPremium) {
      toast.error(
        '🌟 Avatares animados são um recurso Premium! Atualize para usar GIFs e imagens animadas.',
        { duration: 5000, icon: '👑' }
      );
      e.target.value = ''; // Reset file input
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

  const getMaxRatingCount = () => {
    return Math.max(...Object.values(ratingDistribution), 1);
  };

  const getTagColorClasses = (category: string) => {
    switch (category) {
      case 'basic':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
      case 'theme':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
      case 'community':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
    }
  };

  const handleWhispersClick = () => {
    setShowWhispersModal(true);
  };

  if (loading) {
    return (
      <motion.div 
        className="min-h-[calc(100vh-4rem)] flex justify-center items-center bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="p-8 rounded-xl bg-white/80 dark:bg-gray-800/80 shadow-xl border border-gray-100 dark:border-gray-700/30 backdrop-blur-sm">
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
        className="container mx-auto px-4 py-8 min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          <div className="p-8 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <User className="w-16 h-16 mx-auto text-blue-500" />
            </motion.div>
            <motion.h2 
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 mb-4"
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
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl hover:from-blue-600 hover:to-purple-600 transition-colors shadow-lg"
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
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5 py-8 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container mx-auto max-w-4xl">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Profile Header Card */}
          <motion.div
            variants={itemVariants}
            className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden ${getBannerClass(profile?.banner, isPremium)} relative`}
          >
            {/* Settings Button - Desktop Only (Top Right) */}
            <motion.button
              onClick={() => setShowSettingsModal(true)}
              className="hidden sm:flex absolute top-8 right-8 items-center justify-center w-10 h-10 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </motion.button>

            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6">
                <div className="relative mx-auto sm:mx-0 mb-4 sm:mb-0">
                  <div className={`w-24 h-24 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile?.avatar_frame, isPremium)}`}>
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
                            className="w-full px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
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
                          {followersCount === 1 ? 'follower' : 'followers'}
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
                        className="hidden sm:flex items-center px-4 py-2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg hover:from-yellow-500 hover:to-yellow-600 transition-colors font-medium shadow-lg hover:shadow-md"
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
                        className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg p-2 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                              className={`relative px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center ${
                                unreadWhispers > 0 ? 'animate-pulse shadow-lg shadow-orange-500/50' : ''
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
                              className="px-4 py-2 bg-indigo-600 text-white dark:bg-indigo-500 rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors flex items-center"
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
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                              className="px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              {t('common.cancel')}
                            </motion.button>
                          </>
                        ) : (
                          <motion.button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
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
                          className="w-full px-4 py-2 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg hover:from-yellow-500 hover:to-yellow-600 transition-colors flex items-center justify-center font-medium shadow-md hover:shadow-lg"
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
                            className={`relative flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center ${
                              unreadWhispers > 0 ? 'animate-pulse shadow-lg shadow-orange-500/50' : ''
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
                            className="px-4 py-2 bg-indigo-600 text-white dark:bg-indigo-500 rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors flex items-center justify-center"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <Palette className="w-5 h-5" />
                          </motion.button>
                          <motion.button
                            onClick={() => setShowSettingsModal(true)}
                            className="px-4 py-2 bg-gray-600 text-white dark:bg-gray-700 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
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
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                            className="w-full px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {t('common.cancel')}
                          </motion.button>
                        </>
                      ) : (
                        <motion.button
                          onClick={() => setIsEditing(true)}
                          className="w-full px-4 py-2 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
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

          {/* Stats Cards */}
          <motion.div 
            variants={containerVariants} 
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.ratedMovies')}
                </h2>
                <Star className="w-6 h-6 text-yellow-500" />
              </div>
              <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                {ratedMoviesCount}
              </div>
            </motion.div>

            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteGenres')}
                </h2>
                <Film className="w-6 h-6 text-purple-500" />
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

            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.timeWatching')}
                </h2>
                <Clock className="w-6 h-6 text-green-500" />
              </div>
              <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                {formatWatchTime(totalWatchTime)}
              </div>
            </motion.div>
          </motion.div>

          {/* Rating Distribution */}
          <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                {t('profile.stats.ratingDistribution')}
              </h2>
              <BarChart3 className="w-6 h-6 text-blue-500" />
            </div>
            <div className="space-y-2">
              {[...Array(11)].map((_, i) => {
                const rating = 10 - i;
                const percentage = (ratingDistribution[rating] / getMaxRatingCount()) * 100;
                return (
                  <div key={rating} className="flex items-center gap-2">
                    <div className="w-12 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                      {rating}<Star className="w-3 h-3 ml-0.5 inline fill-current" />
                    </div>
                    <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400 rounded-full"
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

          {/* Favorite Decade */}
          {favoriteDecade && (
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteDecade')}
                </h2>
                <ArchiveIcon className="w-6 h-6 text-amber-500" />
              </div>

              <div className="space-y-4">
                {/* Década favorita em destaque */}
                <div className="text-center">
                  <div className={`text-4xl font-bold mb-1 ${
                    favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                    favoriteDecade.label === 'Nostalgic' ? 'text-indigo-600 dark:text-indigo-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {favoriteDecade.label === 'Grandpa Cinema' && '🎬 '}
                    {favoriteDecade.label === 'Nostalgic' && '📼 '}
                    {favoriteDecade.label === 'Modern Lover' && '📱 '}
                    {favoriteDecade.decade.replace('s', '')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {favoriteDecade.count} {t('community.films')} • {Math.round(favoriteDecade.percentage)}%
                  </div>
                  <div className={`text-xs font-medium mt-1 ${
                    favoriteDecade.label === 'Grandpa Cinema' ? 'text-amber-600 dark:text-amber-400' :
                    favoriteDecade.label === 'Nostalgic' ? 'text-indigo-600 dark:text-indigo-400' :
                    'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    {favoriteDecade.label === 'Grandpa Cinema' ? 'Grandpa Cinema' :
                     favoriteDecade.label === 'Nostalgic' ? 'Nostalgic' :
                     'Modern Lover'}
                  </div>
                </div>

                {/* Barra de progresso principal com destaque */}
                <div className="relative">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        favoriteDecade.label === 'Grandpa Cinema' ? 'bg-amber-500 dark:bg-amber-600' :
                        favoriteDecade.label === 'Nostalgic' ? 'bg-indigo-500 dark:bg-indigo-600' :
                        'bg-emerald-500 dark:bg-emerald-600'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, favoriteDecade.percentage)}%` }}
                      transition={{ duration: 1, delay: 0.3 }}
                    />
                  </div>
                </div>

                {/* Todas as décadas - Grid */}
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
                              className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                            >
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                {decade.replace('s', '')}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {count}
                                </span>
                                <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
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

          {/* New Row for Frequent Actors, Directors, and Least-Known Gem */}
          <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Most Frequent Actors */}
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteActors')}
                </h2>
                <Award className="w-6 h-6 text-pink-500" />
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

            {/* Most Frequent Directors */}
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.favoriteDirectors')}
                </h2>
                <Film className="w-6 h-6 text-indigo-500" />
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

            {/* Least-Known Gem */}
            <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 transform transition-all duration-300 hover:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('profile.stats.leastKnownGem')}
                </h2>
                <TrendingDown className="w-6 h-6 text-emerald-500" />
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {t('profile.stats.onlyVotes', { count: leastKnownGem.vote_count })} {t('profile.stats.votesOnTmdb')}
                  </p>
                </div>
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  {t('profile.stats.noHiddenGems')}
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Modals */}
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
            // Recarregar perfil após salvar customização
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