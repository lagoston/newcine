import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEssenceLabel, getSubcategoryName } from '../lib/mood-genres';
import { User, Star, BarChart3, Users, Calendar, Film, Clock, MessageCircle, Crown, Palette, Archive as ArchiveIcon, TrendingDown, X, Loader2, Settings, Scroll, Info, RefreshCw, LayoutGrid, Share2, Tag } from 'lucide-react';
import PentagonGraph from '../components/PentagonGraph';
import ArchetypeSymbol from '../components/ArchetypeSymbol';
import GlassLoader from '../components/GlassLoader';
import { supabase, getProfile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { getMovieDetailsFromDB } from '../lib/tmdb';
import FollowersModal from '../components/FollowersModal';
import WhispersModal from '../components/WhispersModal';
import CustomizeModal from '../components/CustomizeModal';
import WorldMapCard from '../components/WorldMapCard';
import AllMoviesModal from '../components/AllMoviesModal';
import SettingsModal from '../components/SettingsModal';
import PersonasModal from '../components/PersonasModal';
import PersonaShareModal from '../components/PersonaShareModal';
import { toast } from 'sonner';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { useProfileData } from '../hooks/useProfileData';

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

const AVATAR_MAX_DIMENSION = 500;
const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const STORAGE_AVATARS_PATH_MARKER = '/storage/v1/object/public/avatars/';

const convertImageToWebP = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > AVATAR_MAX_DIMENSION || height > AVATAR_MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height * AVATAR_MAX_DIMENSION) / width);
          width = AVATAR_MAX_DIMENSION;
        } else {
          width = Math.round((width * AVATAR_MAX_DIMENSION) / height);
          height = AVATAR_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not available'));

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('WebP conversion failed'))),
        'image/webp',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });

const extractAvatarStoragePath = (url: string): string | null => {
  const idx = url.indexOf(STORAGE_AVATARS_PATH_MARKER);
  if (idx === -1) return null;
  return url.slice(idx + STORAGE_AVATARS_PATH_MARKER.length).split('?')[0];
};

export default function Profile() {
  const navigate = useNavigate();
  const { session, isPremium, checkPremiumStatus } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [username, setUsername] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [originalBio, setOriginalBio] = useState('');
  const [profileExists, setProfileExists] = useState(true);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState<'followers' | 'following' | null>(null);
  const [showWhispersModal, setShowWhispersModal] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [unreadWhispers, setUnreadWhispers] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followedUsersCarousel, setFollowedUsersCarousel] = useState<FollowedUserCarousel[]>([]);
  const [carouselOffset, setCarouselOffset] = useState(0);
  const [carouselAutoPaused, setCarouselAutoPaused] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [showEssenceRevelation, setShowEssenceRevelation] = useState(false);
  const [showEssenceInfo, setShowEssenceInfo] = useState(false);
  const [showPersonasModal, setShowPersonasModal] = useState(false);
  const [showPersonaShare, setShowPersonaShare] = useState(false);
  const [showRetakeQuizModal, setShowRetakeQuizModal] = useState(false);

    const dragOccurred = React.useRef(false);

  const handleFriendsCarouselDragEnd = (_e: any, info: { offset: { x: number } }) => {
    const threshold = 50;
    if (Math.abs(info.offset.x) > threshold) {
      setCarouselAutoPaused(true);
      const maxOffset = Math.max(0, (Math.ceil(followedUsersCarousel.length / CAROUSEL_PAGE_SIZE) - 1) * CAROUSEL_PAGE_SIZE);
      setCarouselOffset((prev) => {
        const next = info.offset.x < 0 ? prev + CAROUSEL_PAGE_SIZE : prev - CAROUSEL_PAGE_SIZE;
        return Math.max(0, Math.min(maxOffset, next));
      });
    }
    setTimeout(() => { dragOccurred.current = false; }, 50);
  };

  const {
    ratedMoviesCount,
    ratingDistribution,
    totalWatchTime,
    favoriteGenres,
    favoriteKeywords,
    favoriteDecade,
    topActors,
    topDirectors,
    leastKnownGem,
    followersCount,
    followingCount,
    essencePersonality,
    essenceArchetype,
    spectrumPoints,
    essenceLoading,
    countryCounts,
    countryAvgRatings,
    movies,
    refetch: refetchProfileData,
  } = useProfileData(session?.user?.id, i18n.language);

  const [countryMoviesModal, setCountryMoviesModal] = useState<{ isOpen: boolean; title: string; movies: any[] }>({
    isOpen: false,
    title: '',
    movies: []
  });

  const handleViewCountryMovies = (countryCode: string, countryName: string) => {
    const filtered = (movies || []).filter((m: any) => m.origin_country?.[0] === countryCode && m.userRating !== null);
    setCountryMoviesModal({ isOpen: true, title: countryName, movies: filtered });
  };

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

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile();
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
      if (typeof window !== 'undefined') {
        cache.invalidatePattern('movie:');
      }
      if (session?.user?.id) {
        refetchProfileData();
      }
    };

    const handleEpisodeToggled = () => {
      if (session?.user?.id) {
        refetchProfileData();
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
      const { data, error } = await supabase.rpc('count_unread_indications', {
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

  const fetchProfile = async () => {
    try {
      if (!session?.user?.id) return;

      const { data: profileData, error } = await getProfile(session.user.id);

      if (error) throw error;

      if (!profileData) {
        setProfileExists(false);
        return;
      }

      setProfile(profileData);
      setUsername(profileData.username);
      setNewUsername(profileData.username);
      setBio(profileData.bio || '');
      setAvatarUrl(profileData.avatar_url || '');
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

  const handleStartEditing = () => {
    setOriginalBio(bio);
    setNewUsername(username);
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setNewUsername(username);
    setBio(originalBio);
  };

  const handleRemoveAvatar = async () => {
    if (!session?.user?.id) return;
    setIsUploadingAvatar(true);
    try {
      const oldPath = avatarUrl ? extractAvatarStoragePath(avatarUrl) : null;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      if (oldPath) {
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      setAvatarUrl('');
      toast.success('Avatar removed');
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error('Error removing avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditing) return;

    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    console.log('[Avatar Upload] File selected:', file.name, '| MIME:', file.type, '| Size:', (file.size / 1024).toFixed(1) + 'KB');

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isUserPremium = isPremium || profile?.plan_type === 'premium';
    const isPremiumGif = isGif && isUserPremium;

    console.log('[Avatar Upload] isPremium (auth):', isPremium, '| profile.plan_type:', profile?.plan_type, '| isUserPremium:', isUserPremium, '| isGif:', isGif, '| isPremiumGif:', isPremiumGif);

    if (isPremiumGif) {
      const GIF_MAX_BYTES = 2 * 1024 * 1024;
      if (file.size > GIF_MAX_BYTES) {
        toast.error('Erro: Seu GIF tem mais de 2MB. Por favor, comprima a imagem para utilizar o avatar animado.');
        e.target.value = '';
        return;
      }
    } else if (file.size > AVATAR_MAX_INPUT_BYTES) {
      toast.error('Image too large. Maximum input size is 15MB.');
      e.target.value = '';
      return;
    }

    if (isGif && !isUserPremium) {
      toast.info('Seu GIF foi adicionado como uma imagem estática. Assine o plano Premium para habilitar avatares animados no seu perfil!');
    }

    setIsUploadingAvatar(true);
    try {
      let uploadBlob: Blob;
      let ext: string;
      let contentType: string;

      if (isPremiumGif) {
        console.log('[Avatar Upload] Path: GIF bypass (Premium) — uploading raw GIF');
        uploadBlob = file;
        ext = 'gif';
        contentType = 'image/gif';
      } else {
        console.log('[Avatar Upload] Path: Canvas → WebP conversion (free user or non-GIF)');
        uploadBlob = await convertImageToWebP(file);
        ext = 'webp';
        contentType = 'image/webp';
      }

      console.log('[Avatar Upload] uploadBlob size:', (uploadBlob.size / 1024).toFixed(1) + 'KB', '| ext:', ext, '| contentType:', contentType);

      const filePath = `${session.user.id}/${Date.now()}.${ext}`;
      console.log('[Avatar Upload] filePath:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, uploadBlob, {
          contentType,
          cacheControl: '3600',
          upsert: true
        });

      console.log('[Avatar Upload] Storage upload result:', { uploadData, uploadError });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const displayUrl = isPremiumGif ? `${publicUrl}?t=${Date.now()}` : publicUrl;

      console.log('[Avatar Upload] publicUrl:', publicUrl, '| displayUrl:', displayUrl);

      const oldPath = avatarUrl ? extractAvatarStoragePath(avatarUrl) : null;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      console.log('[Avatar Upload] DB update error:', updateError);

      if (updateError) throw updateError;

      if (oldPath && oldPath !== filePath) {
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      setAvatarUrl(displayUrl);
      console.log('[Avatar Upload] Done — avatarUrl state set to:', displayUrl);
      toast.success('Avatar updated');
    } catch (error) {
      console.error('[Avatar Upload] ERROR:', error);
      toast.error('Error updating avatar');
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
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
                  {isUploadingAvatar ? (
                    <div className="w-full h-full flex items-center justify-center bg-black/40">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  ) : avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-full h-full p-5 text-gray-400" />
                  )}
                </div>
                {isEditing && !isUploadingAvatar && (
                  <label className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 hover:opacity-100 cursor-pointer rounded-full transition-opacity">
                    <input
                      type="file"
                      accept="image/gif,image/webp,image/png,image/jpeg,image/jpg"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                    <span className="text-sm">Change</span>
                  </label>
                )}
                {isEditing && avatarUrl && !isUploadingAvatar && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-colors z-10"
                    title="Remove avatar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
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
                    {t('profile.followingButton')}
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
                        onClick={handleCancelEditing}
                        className="px-4 py-2.5 bg-white/60 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300 rounded-xl hover:bg-white/80 dark:hover:bg-gray-600/80 transition-colors backdrop-blur-sm border border-white/40 dark:border-gray-600/40"
                      >
                        {t('common.cancel')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleStartEditing}
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
                        onClick={handleStartEditing}
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
                        onClick={handleCancelEditing}
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

                <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-violet-500 flex-shrink-0" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('profile.friendsActivity')}
              </h2>
            </div>
            <motion.button
              onClick={() => navigate('/community')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="group flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-xs font-bold rounded-full transition-all duration-200 shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 flex-shrink-0"
            >
              <Users className="w-3.5 h-3.5" />
              {t('profile.accessCommunity')}
              <span className="group-hover:translate-x-0.5 transition-transform duration-200">→</span>
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
                  className="flex gap-5 justify-center items-end pt-20 pb-3 cursor-grab active:cursor-grabbing"
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDrag={() => { dragOccurred.current = true; }}
                  onDragEnd={handleFriendsCarouselDragEnd}
                >
                  {visibleCarouselUsers.map((user, index) => {
                    const bubbleStyle = getBubbleStyle(user.lastRating);
                    return (
                      <button
                        key={user.id}
                        onClick={() => { if (!dragOccurred.current) navigate(`/profile/${user.username}`); }}
                        className="flex-shrink-0 flex flex-col items-center group"
                      >
                        <div className="relative mb-2">
                          {user.lastRatedTitle && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 pointer-events-none">
                              <div className={`relative border rounded-xl px-3 py-2 shadow-lg backdrop-blur-sm w-[104px] transition-transform duration-200 group-hover:scale-105 ${bubbleStyle.bubble}`}>
                                <p className={`text-[10px] font-semibold text-center leading-tight line-clamp-2 whitespace-normal ${bubbleStyle.titleText}`}>
                                  {user.lastRatedTitle}
                                </p>
                                {user.lastRating !== null && (
                                  <div className="flex items-center justify-center gap-1 mt-1">
                                    <Star className={`w-3 h-3 fill-current ${bubbleStyle.ratingText}`} />
                                    <p className={`text-xs font-bold ${bubbleStyle.ratingText}`}>
                                      {user.lastRating}
                                    </p>
                                  </div>
                                )}
                                <div className={`absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent ${bubbleStyle.arrow}`} />
                              </div>
                            </div>
                          )}
                          <div className={`w-16 h-16 rounded-full overflow-hidden border-2 border-white/80 dark:border-gray-700/80 shadow-lg transition-all duration-200 group-hover:border-violet-400 group-hover:shadow-violet-400/30 group-hover:scale-105 ${getFrameClass(user.avatar_frame, user.plan_type === 'premium')}`}>
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-600 flex items-center justify-center">
                                <User className="w-8 h-8 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400 text-center max-w-[64px] truncate font-semibold group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                          {user.username}
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
             {followedUsersCarousel.length > CAROUSEL_PAGE_SIZE && (
                <div className="flex justify-center items-center gap-1 mt-2 pb-1">
                  {Array.from({ length: Math.ceil(followedUsersCarousel.length / CAROUSEL_PAGE_SIZE) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setCarouselAutoPaused(true);
                        setCarouselOffset(i * CAROUSEL_PAGE_SIZE);
                      }}
                      className="rounded-full transition-all duration-300 block appearance-none"
                      style={{
                        display: 'block',
                        boxSizing: 'border-box',
                        padding: 0,
                        margin: 0,
                        border: 'none',
                        outline: 'none',
                        minWidth: 0,
                        minHeight: 0,
                        width: carouselOffset === i * CAROUSEL_PAGE_SIZE ? '22px' : '12px',
                        height: '12px',
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
            <div className="flex flex-col sm:flex-row items-center gap-5 py-6 px-2">
              <div className="relative flex-shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/15 to-purple-500/15 dark:from-violet-500/20 dark:to-purple-500/20 flex items-center justify-center rotate-3">
                  <Users className="w-9 h-9 text-violet-500" />
                </div>
                <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white dark:bg-gray-800 border-2 border-violet-300/50 dark:border-violet-600/50 flex items-center justify-center shadow-sm">
                  <span className="text-xs">👋</span>
                </div>
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-base font-bold text-gray-800 dark:text-white mb-1">
                  {t('profile.noFriendsActivityTitle')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                  {t('profile.noFriendsActivityDescription')}
                </p>
              </div>
            </div>
          )}
        </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Filmes Avaliados + Tempo Assistido, lado a lado */}
          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="grid grid-cols-2 divide-x divide-gray-200/60 dark:divide-gray-700/60">
              <div className="pr-4">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                    {t('profile.stats.ratedMovies')}
                  </h2>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {ratedMoviesCount}
                </div>
              </div>
              <div className="pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                    {t('profile.stats.timeWatching')}
                  </h2>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {formatWatchTime(totalWatchTime)}
                </div>
              </div>
            </div>
          </div>

          {/* Gêneros Favoritos + Palavras-chave, lado a lado */}
          <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
            <div className="grid grid-cols-2 divide-x divide-gray-200/60 dark:divide-gray-700/60">
              <div className="pr-4">
                <div className="flex items-center gap-2 mb-2">
                  <Film className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                    {t('profile.stats.favoriteGenres')}
                  </h2>
                </div>
                <div className="space-y-0.5">
                  {favoriteGenres.map((genre, index) => (
                    <div
                      key={genre.id}
                      className={`${index === 0 ? 'text-sm font-bold' : 'text-xs font-medium'} text-gray-900 dark:text-white truncate`}
                    >
                      {genre.name}
                    </div>
                  ))}
                  {favoriteGenres.length === 0 && (
                    <div className="text-gray-500 dark:text-gray-400 text-xs">
                      {t('profile.stats.noGenresYet')}
                    </div>
                  )}
                </div>
              </div>
              <div className="pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">
                    {t('profile.stats.favoriteKeywords')}
                  </h2>
                </div>
                <div className="space-y-0.5">
                  {favoriteKeywords.map((keyword, index) => (
                    <div
                      key={keyword.id}
                      className={`${index === 0 ? 'text-sm font-bold' : 'text-xs font-medium'} text-gray-900 dark:text-white truncate capitalize`}
                    >
                      {keyword.name}
                    </div>
                  ))}
                  {favoriteKeywords.length === 0 && (
                    <div className="text-gray-500 dark:text-gray-400 text-xs">
                      {t('profile.stats.noKeywordsYet')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {ratedMoviesCount > 0 && (
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

              <WorldMapCard
                countryCounts={countryCounts}
                countryAvgRatings={countryAvgRatings}
                language={i18n.language}
                onViewMovies={handleViewCountryMovies}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      {t('oracle.cinematicEssenceLabel')}
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
                          title={t('oracle.revelation')}
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
                          {t('oracle.cinematicEssenceLabel')}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                          {t('oracle.subcategoryExplain')}
                        </p>
                      </div>
                      <motion.button
                        onClick={() => navigate('/oracle')}
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-md whitespace-nowrap"
                      >
                        {t('oracle.discoverYourEssence')}
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
          onFollowChange={refetchProfileData}
        />
      )}

      <CustomizeModal
        isOpen={showCustomizeModal}
        onClose={() => setShowCustomizeModal(false)}
        onSave={() => {
          fetchProfile();
        }}
      />

      {session?.user?.id && (
        <PersonasModal
          isOpen={showPersonasModal}
          onClose={() => setShowPersonasModal(false)}
          viewerId={session.user.id}
          viewerPersonaCode={essencePersonality?.personalidade_completa ?? null}
          onUserClick={(uname) => navigate(`/profile/${uname}`)}
        />
      )}

      {essencePersonality?.personalidade_completa && essenceArchetype && (
        <PersonaShareModal
          isOpen={showPersonaShare}
          onClose={() => setShowPersonaShare(false)}
          personaCode={essencePersonality.personalidade_completa}
          archetypeName={essenceArchetype.archetype_name}
          subcategoryName={essenceArchetype.subcategory_name}
          username={profile?.username}
        />
      )}
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
                  <h2 className="text-2xl font-bold text-white">{t('oracle.revelation')}</h2>
                </div>
                <div className="text-center mb-6 rounded-xl p-5 border border-gray-700/60 bg-gray-800/50">
                  <p className="text-3xl font-bold mb-1" style={{ color: (() => { const c = essencePersonality.personalidade_completa?.charAt(2) ?? ''; return ({ A: '#fbbf24', B: '#64748b', K: '#ef4444', X: '#3b82f6', D: '#6b7280', L: '#10b981' } as Record<string,string>)[c] || '#3b82f6'; })() }}>
                    {essencePersonality.personalidade_completa}
                  </p>
                  <p className="text-lg text-gray-200 font-semibold">{essenceArchetype.archetype_name} {essenceArchetype.subcategory_name}</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-xl p-5 border border-pink-500/20 bg-pink-500/5">
                    <h3 className="text-base font-bold text-pink-400 mb-2">{t('oracle.yourEssence')} ({getEssenceLabel(essencePersonality?.arquetipo_primario, essencePersonality?.arquetipo_secundario, i18n.language.startsWith('pt') ? 'pt' : 'en')})</h3>
                    <p className="text-gray-300 text-sm leading-relaxed">{essenceArchetype.archetype_description}</p>
                  </div>
                  <div className="rounded-xl p-5 border border-blue-500/20 bg-blue-500/5">
                    <h3 className="text-base font-bold text-blue-400 mb-2">{t('oracle.yourAttunement')} ({getSubcategoryName(essenceArchetype.subcategory_name, i18n.language.startsWith('pt') ? 'pt' : 'en')})</h3>
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
                  <h2 className="text-2xl font-bold text-white">{t('oracle.architectureTitle')}</h2>
                </div>
                <p className="text-center italic text-gray-400 text-sm mb-6">
                  {t('oracle.architectureIntro')}
                </p>
                <div className="space-y-4">
                  <div className="rounded-xl p-5 border border-blue-500/20 bg-blue-500/5">
                    <h3 className="text-base font-bold text-blue-300 mb-2 flex items-center gap-2">
                      <span>1.</span> {t('oracle.theEssence')} ({getEssenceLabel(essencePersonality?.arquetipo_primario, essencePersonality?.arquetipo_secundario, i18n.language.startsWith('pt') ? 'pt' : 'en')})
                    </h3>
                    <p className="text-gray-300 text-sm leading-relaxed mb-3">
                      {t('oracle.essenceProfileText', { profile: `${essencePersonality.arquetipo_primario}${essencePersonality.arquetipo_secundario}` })}
                    </p>
                    <div className="bg-black/30 rounded-lg p-3 mb-2">
                      <p className="text-gray-400 text-xs font-bold mb-1">{t('oracle.essenceLogicLabel')}</p>
                      <p className="text-gray-300 text-xs leading-relaxed">{t('oracle.essenceLogicText')}</p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3">
                      <p className="text-gray-400 text-xs font-bold mb-1">{t('oracle.essenceResultLabel')}</p>
                      <p className="text-gray-300 text-xs leading-relaxed">{t('oracle.essenceResultText')}</p>
                    </div>
                  </div>
                  <div className="rounded-xl p-5 border border-amber-500/20 bg-amber-500/5">
                    <h3 className="text-base font-bold text-amber-300 mb-2 flex items-center gap-2">
                      <span>2.</span> {t('oracle.theAttunement')} ({getSubcategoryName(essenceArchetype?.subcategory_name, i18n.language.startsWith('pt') ? 'pt' : 'en')})
                    </h3>
                    <p className="text-gray-300 text-sm leading-relaxed mb-3">
                      {t('oracle.subarchetypeText', { id: essencePersonality.subcategoria_id })}
                    </p>
                    <p className="text-gray-400 text-xs mb-2">
                      {t('oracle.axesListTitle')}
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      {[
                        { a: t('oracle.axisRadiant'), b: t('oracle.axisShadowy'), desc: t('oracle.axisOptimismMelancholy'), ca: '#fbbf24', cb: '#8b5cf6' },
                        { a: t('oracle.axisClassic'), b: t('oracle.axisExperimental'), desc: t('oracle.axisTraditionBoldness'), ca: '#ef4444', cb: '#3b82f6' },
                        { a: t('oracle.axisDense'), b: t('oracle.axisLight'), desc: t('oracle.axisComplexityAccessibility'), ca: '#6b7280', cb: '#10b981' },
                      ].map((row, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-gray-500 mt-0.5">•</span>
                          <span className="text-gray-300">
                            <span className="font-semibold" style={{ color: row.ca }}>{row.a}</span>
                            {' vs. '}
                            <span className="font-semibold" style={{ color: row.cb }}>{row.b}</span>
                            {' — '}{row.desc}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl p-5 border border-cyan-500/20 bg-cyan-500/5">
                    <h3 className="text-base font-bold text-cyan-300 mb-4 flex items-center gap-2">
                      <span>3.</span> {t('oracle.theGraph')}
                    </h3>
                    <div className="flex justify-center mb-4">
                      <PentagonGraph points={spectrumPoints} subcategoryId={essencePersonality?.personalidade_completa || ''} />
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => setShowRetakeQuizModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:shadow-lg transition-all text-sm font-semibold"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>{t('oracle.retakeQuiz')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRetakeQuizModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowRetakeQuizModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full rounded-2xl bg-gray-900/95 backdrop-blur-xl shadow-2xl border border-gray-700/60 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-4 text-center">
                {t('oracle.retakeQuizTitle')}
              </h3>
              <p className="text-gray-300 text-center mb-6">
                {t('oracle.retakeQuizConfirm')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRetakeQuizModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    setShowRetakeQuizModal(false);
                    setShowEssenceInfo(false);
                    await supabase
                      .from('profiles')
                      .update({ subcategoria_id: null })
                      .eq('id', session?.user?.id);
                    refetchProfileData();
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      <AllMoviesModal
        isOpen={countryMoviesModal.isOpen}
        onClose={() => setCountryMoviesModal({ isOpen: false, title: '', movies: [] })}
        title={countryMoviesModal.title}
        movies={countryMoviesModal.movies}
        rating={null}
      />
    </div>
  );
}