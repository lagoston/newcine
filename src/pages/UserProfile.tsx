import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEssenceLabel, getSubcategoryName } from '../lib/mood-genres';
import { User, Film, Users, Calendar, Star, BarChart3, Loader2, Clock, Crown, Archive as ArchiveIcon, Award, TrendingDown, ListPlus, MessageSquare, UserCheck, UserPlus, ChevronDown, ArrowLeft, Scroll, Info, X, Tag, Sparkles, Wand2 } from 'lucide-react';
import ArchetypeSymbol from '../components/ArchetypeSymbol';
import GlassLoader from '../components/GlassLoader';
import PentagonGraph from '../components/PentagonGraph';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Movie, getMovieDetailsFromDB } from '../lib/tmdb';
import RatingBox from '../components/RatingBox';
import FollowersModal from '../components/FollowersModal';
import ConfirmationModal from '../components/ConfirmationModal';
import WorldMapCard from '../components/WorldMapCard';
import UserPinsCard from '../components/UserPinsCard';
import { toast } from 'sonner';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from '../components/GhostRiderFrame';
import { getBannerClass } from '../lib/banners';
import { getTextEffectNameClass, getTextEffectSecondaryClass } from '../lib/textEffects';
import UserListsModal from '../components/UserListsModal';
import AllMoviesModal from '../components/AllMoviesModal';
import UserReviewsModal from '../components/UserReviewsModal';
import CompatibilityModal from '../components/CompatibilityModal';
import MatchMovieModal from '../components/MatchMovieModal';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileData } from '../hooks/useProfileData';

interface Profile {
 id: string;
 username: string;
 avatar_url: string | null;
 bio: string | null;
 created_at: string;
 plan_type: string;
 is_premium?: boolean;
 avatar_frame: string;
 banner?: string;
 text_effect?: string;
 chroma_box_enabled?: boolean;
 active_tag?: {
 emoji: string;
 name: string;
 category: string;
 };
}

interface UserMovie {
 movie_id: number;
 rating: number | null;
}

interface RatingDistribution {
 [key: number]: number;
}

interface MovieWithRating extends Movie {
 userRating: number | null;
 runtime?: number;
 genres?: Array<{ id: number; name: string }>;
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

export default function UserProfile() {
 const { username } = useParams<{ username: string }>();
 const { session } = useAuth();
 const navigate = useNavigate();
 const { t, i18n } = useTranslation();
 const [profile, setProfile] = useState<Profile | null>(null);
 // Contagem de resenhas REAIS do dono deste perfil (não do viewer) —
 // usada só pra decidir se os Text Effects dele estão desbloqueados,
 // mesma lógica de Profile.tsx (o próprio perfil).
 const [realReviewCount, setRealReviewCount] = useState(0);
 // Amizade é mútua — não existe mais "eu sigo mas ele não me segue".
 // 4 estados possíveis: sem relação, pedido enviado por mim, pedido
 // recebido dele (posso aceitar direto aqui), ou já somos amigos.
 const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends'>('none');
 const [loading, setLoading] = useState(true);
 const [isToggling, setIsToggling] = useState(false);
 const [showFriendsModal, setShowFriendsModal] = useState(false);
 const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
 const [showUserListsModal, setShowUserListsModal] = useState(false);
 const [showUserReviewsModal, setShowUserReviewsModal] = useState(false);
 const [showCompatibilityModal, setShowCompatibilityModal] = useState(false);
 const [showMatchMovieModal, setShowMatchMovieModal] = useState(false);
 const [showStats, setShowStats] = useState(false);
 const [showEssenceRevelation, setShowEssenceRevelation] = useState(false);
 const [showEssenceInfo, setShowEssenceInfo] = useState(false);

 const {
 movies,
 ratedMoviesCount,
 ratingDistribution,
 totalWatchTime,
 favoriteGenres,
 favoriteKeywords,
 favoriteDecade,
 topActors,
 topDirectors,
 leastKnownGem,
 friendsCount,
 essencePersonality,
 essenceArchetype,
 spectrumPoints,
 essenceLoading,
 countryCounts,
 countryAvgRatings,
 refetch: refetchProfileData,
 } = useProfileData(profile?.id, i18n.language);

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
 if (username) {
 fetchProfileAndMovies();
 }
 }, [username]);

 useEffect(() => {
 const handleLanguageChange = () => {
 if (profile?.id) {
 const cacheKey = CACHE_KEYS.USER_PROFILE(profile.id);
 cache.delete(cacheKey);
 }
 cache.invalidatePattern('movie:');
 if (username) {
 fetchProfileAndMovies();
 }
 };

 i18n.on('languageChanged', handleLanguageChange);
 return () => {
 i18n.off('languageChanged', handleLanguageChange);
 };
 }, [i18n, username, profile?.id]);

 const fetchProfileAndMovies = async () => {
 if (!username) return;

 try {
 setLoading(true);

 // Antes buscava direto na tabela com select('*') — sem checagem de
 // profile_visibility, expondo todas as colunas (incluindo os pontos
 // brutos E/I/C/S/R) pra qualquer pessoa que soubesse o username, mesmo
 // perfis marcados como "só seguidores". Agora passa pela mesma lógica
 // de visibilidade já usada em get_visible_profiles.
 const { data: profileRows, error: profileError } = await supabase
 .rpc('get_profile_by_username', {
 p_username: username,
 p_viewer_id: session?.user?.id || null
 });

 if (profileError) throw profileError;

 const profileData = profileRows?.[0] || null;

 if (!profileData) {
 setProfile(null);
 setLoading(false);
 return;
 }

 setProfile(profileData);

 supabase
 .from('reviews')
 .select('*', { count: 'exact', head: true })
 .eq('user_id', profileData.id)
 .eq('is_ai_generated', false)
 .then(({ count }) => setRealReviewCount(count || 0));

 if (session?.user?.id) {
 const { data: friendshipData } = await supabase
 .from('friendships')
 .select('status, requester_id')
 .or(`and(requester_id.eq.${session.user.id},addressee_id.eq.${profileData.id}),and(requester_id.eq.${profileData.id},addressee_id.eq.${session.user.id})`)
 .maybeSingle();

 if (!friendshipData) {
 setFriendshipStatus('none');
 } else if (friendshipData.status === 'accepted') {
 setFriendshipStatus('friends');
 } else if (friendshipData.requester_id === session.user.id) {
 setFriendshipStatus('pending_sent');
 } else {
 setFriendshipStatus('pending_received');
 }
 }
 } catch (error) {
 console.error('Error fetching profile and movies:', error);
 toast.error('Failed to load profile');
 } finally {
 setLoading(false);
 }
 };

 // Só "desfazer amizade" precisa de confirmação — é a única ação
 // destrutiva das quatro (enviar pedido, cancelar pedido enviado, e
 // aceitar pedido recebido não desfazem nada que já existia).
 const handleFriendAction = () => {
 if (friendshipStatus === 'friends') {
 setShowUnfriendConfirm(true);
 return;
 }
 performFriendAction();
 };

 const performFriendAction = async () => {
 if (!session) {
 toast.error('Please sign in to add friends');
 return;
 }

 if (!profile?.id || isToggling) {
 return;
 }

 try {
 setIsToggling(true);

 if (friendshipStatus === 'none') {
 const { data, error } = await supabase.rpc('send_friend_request', {
 p_requester_id: session.user.id,
 p_addressee_id: profile.id
 });

 if (error) throw error;
 if (!data?.success) throw new Error(data?.error || 'request_failed');

 setFriendshipStatus('pending_sent');
 toast.success(t('profile.friendRequestSent', { defaultValue: `Pedido de amizade enviado para @${profile.username}` }));

 // Substitui a antiga notificação informativa de "novo seguidor" —
 // agora é um pedido de verdade, que aparece no Whispers com
 // opção de Aceitar/Recusar, não só um aviso passivo.
 await supabase
 .from('friend_indications')
 .insert({
 from_user_id: session.user.id,
 to_user_id: profile.id,
 type: 'friend_request',
 read: false
 });
 } else if (friendshipStatus === 'pending_sent') {
 const { error } = await supabase.rpc('remove_friendship', {
 p_user_id: session.user.id,
 p_other_user_id: profile.id
 });

 if (error) throw error;
 setFriendshipStatus('none');
 refetchProfileData();
 toast.success(t('profile.friendRequestCancelled', { defaultValue: 'Pedido de amizade cancelado' }));
 } else if (friendshipStatus === 'pending_received') {
 const { data, error } = await supabase.rpc('respond_to_friend_request', {
 p_addressee_id: session.user.id,
 p_requester_id: profile.id,
 p_accept: true
 });

 if (error) throw error;
 if (!data?.success) throw new Error(data?.error || 'accept_failed');

 setFriendshipStatus('friends');
 refetchProfileData();
 toast.success(t('profile.friendRequestAccepted', { defaultValue: `Agora você e @${profile.username} são amigos!` }));
 } else {
 const { error } = await supabase.rpc('remove_friendship', {
 p_user_id: session.user.id,
 p_other_user_id: profile.id
 });

 if (error) throw error;
 setFriendshipStatus('none');
 refetchProfileData();
 toast.success(t('profile.friendRemoved', { defaultValue: `Você e @${profile.username} não são mais amigos` }));
 }
 } catch (error) {
 console.error('Error handling friend action:', error);
 toast.error('Failed to update friendship status');
 } finally {
 setIsToggling(false);
 setShowUnfriendConfirm(false);
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
 return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
 case 'special':
 return 'bg-black dark:bg-black text-white dark:text-gray-100';
 default:
 return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
 }
 }, []);

 if (loading) {
 return <GlassLoader fullPage size="lg" />;
 }

 if (!profile) {
 return (
 <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
 <div className="text-center">
 <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
 {t('profile.notFound')}
 </h2>
 <p className="text-gray-600 dark:text-gray-400">
 {t('profile.userDoesntExist', { username })}
 </p>
 </div>
 </div>
 );
 }

 const moviesByRating = movies.reduce(
 (acc, movie: any) => {
 const rating = movie.userRating;
 if (rating === null) {
 acc.unrated.push(movie);
 } else {
 acc[rating] = acc[rating] || [];
 acc[rating].push(movie);
 }
 return acc;
 },
 { unrated: [], ...Array.from({ length: 11 }, () => []) }
 );

 return (
 <>
 <motion.div
 className="min-h-[calc(100vh-4rem)] py-8 px-4 relative overflow-hidden"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 >
 <div className="max-w-5xl mx-auto relative z-10 space-y-6">
 <motion.button
 onClick={() => navigate(-1)}
 initial={{ opacity: 0, x: -10 }}
 animate={{ opacity: 1, x: 0 }}
 transition={{ duration: 0.3 }}
 className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-gray-800/50 hover:bg-white/80 dark:hover:bg-gray-700/80 border border-white/60 dark:border-gray-700/60 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white text-sm font-medium backdrop-blur-sm transition-all duration-200 shadow-sm"
 >
 <ArrowLeft className="w-4 h-4" />
 <span>{t('common.back')}</span>
 </motion.button>

 <motion.div
 className={`relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden ${getBannerClass(profile?.banner, profile.is_premium ?? profile.plan_type === 'premium')}`}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 >
 <div className="absolute inset-0 pointer-events-none">
 <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
 <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
 </div>

 <div className="relative z-10 p-6 sm:p-8">
 <div className="flex flex-col sm:flex-row sm:items-start gap-6">
 <div className="relative mx-auto sm:mx-0 flex-shrink-0">
 {frameUsesComponent(profile?.avatar_frame, profile.is_premium ?? profile.plan_type === 'premium') === 'GhostRiderFrame' && profile?.avatar_url ? (
 <GhostRiderFrame src={profile.avatar_url} alt={profile.username} size={112} />
 ) : (
 <div className={`w-28 h-28 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile?.avatar_frame, profile.is_premium ?? profile.plan_type === 'premium')}`}>
 {profile?.avatar_url ? (
 <img
 src={profile.avatar_url}
 alt={profile.username}
 className="w-full h-full object-cover"
 />
 ) : (
 <User className="w-full h-full p-5 text-gray-400" />
 )}
 </div>
 )}
 </div>

 <div className="flex-1 text-center sm:text-left">
 <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
 <div className="flex items-center justify-center sm:justify-start gap-2">
 <h1 className={`text-2xl sm:text-3xl font-bold ${getTextEffectNameClass(profile?.text_effect, profile.is_premium ?? profile.plan_type === 'premium', realReviewCount)}`}>
 @{profile.username}
 </h1>
 {(profile.is_premium ?? profile.plan_type === 'premium') && (
 <Crown className="w-6 h-6 text-yellow-400" title="Premium member" />
 )}
 </div>
 {profile.active_tag && (
 <div className="flex justify-center sm:justify-start w-full sm:w-auto">
 <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${getTagColorClasses(profile.active_tag.category)}`}>
 <span>{profile.active_tag.emoji}</span>
 <span className="text-sm font-medium">{profile.active_tag.name}</span>
 </div>
 </div>
 )}
 </div>

 {profile.bio && (
 <p className={`mb-4 max-w-2xl ${getTextEffectSecondaryClass(profile?.text_effect, profile.is_premium ?? profile.plan_type === 'premium', realReviewCount)}`}>
 {profile.bio}
 </p>
 )}

 <div className={`flex flex-wrap justify-center sm:justify-start gap-4 sm:gap-6 text-sm mb-4 ${getTextEffectSecondaryClass(profile?.text_effect, profile.is_premium ?? profile.plan_type === 'premium', realReviewCount)}`}>
 <button
 onClick={() => setShowFriendsModal(true)}
 className="flex items-center hover:opacity-70 transition-opacity"
 >
 <Users className="w-5 h-5 mr-2" />
 <span>
 <strong className={getTextEffectNameClass(profile?.text_effect, profile.is_premium ?? profile.plan_type === 'premium', realReviewCount)}>{friendsCount}</strong>{' '}
 {t('profile.friendsLabel', { defaultValue: 'Amigos' })}
 </span>
 </button>
 <div className="flex items-center">
 <Calendar className="w-5 h-5 mr-2" />
 <span>{t('profile.joined', { date: formatDate(profile.created_at) })}</span>
 </div>
 </div>

 {session?.user?.id !== profile.id && (
 <div className="flex flex-wrap justify-center sm:justify-start gap-3">
 <motion.button
 onClick={() => setShowUserListsModal(true)}
 className="px-4 py-2.5 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-200 font-medium hover:bg-white/70 dark:hover:bg-gray-600/70 transition-all flex items-center gap-2"
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 >
 <ListPlus className="w-5 h-5" />
 <span className="hidden sm:inline">{t('lists.userLists')}</span>
 </motion.button>
 <motion.button
 onClick={() => setShowUserReviewsModal(true)}
 className="px-4 py-2.5 rounded-xl bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-200 font-medium hover:bg-white/70 dark:hover:bg-gray-600/70 transition-all flex items-center gap-2"
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 >
 <MessageSquare className="w-5 h-5" />
 <span className="hidden sm:inline">Reviews</span>
 </motion.button>
 <motion.button
 onClick={() => setShowCompatibilityModal(true)}
 className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 backdrop-blur-sm border border-pink-400/40 dark:border-pink-500/30 text-pink-600 dark:text-pink-400 font-medium hover:from-pink-500/20 hover:to-purple-500/20 transition-all flex items-center gap-2"
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 >
 <Sparkles className="w-5 h-5" />
 <span className="hidden sm:inline">{t('compatibility.buttonLabel')}</span>
 </motion.button>
 <motion.button
 onClick={() => setShowMatchMovieModal(true)}
 className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all flex items-center gap-2"
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 >
 <Wand2 className="w-5 h-5" />
 <span className="hidden sm:inline">{t('matchMovie.buttonLabel')}</span>
 </motion.button>
 <motion.button
 onClick={handleFriendAction}
 disabled={isToggling}
 className={`px-5 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
 friendshipStatus === 'none'
 ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:shadow-lg hover:shadow-blue-500/25'
 : friendshipStatus === 'pending_received'
 ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg hover:shadow-green-500/25'
 : 'bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-200 hover:bg-white/70 dark:hover:bg-gray-600/70'
 }`}
 whileHover={{ scale: 1.02 }}
 whileTap={{ scale: 0.98 }}
 >
 {isToggling ? (
 <Loader2 className="w-5 h-5 animate-spin" />
 ) : friendshipStatus === 'friends' ? (
 <>
 <UserCheck className="w-5 h-5" />
 <span className="hidden sm:inline">{t('profile.friendsButton', { defaultValue: 'Amigos' })}</span>
 </>
 ) : friendshipStatus === 'pending_sent' ? (
 <>
 <Clock className="w-5 h-5" />
 <span className="hidden sm:inline">{t('profile.requestSentButton', { defaultValue: 'Pedido Enviado' })}</span>
 </>
 ) : friendshipStatus === 'pending_received' ? (
 <>
 <UserCheck className="w-5 h-5" />
 <span className="hidden sm:inline">{t('profile.acceptRequestButton', { defaultValue: 'Aceitar Pedido' })}</span>
 </>
 ) : (
 <>
 <UserPlus className="w-5 h-5" />
 <span className="hidden sm:inline">{t('profile.addFriendButton', { defaultValue: 'Adicionar Amigo' })}</span>
 </>
 )}
 </motion.button>
 </div>
 )}
 </div>
 </div>
 </div>
 </motion.div>

 <motion.div
 className="grid grid-cols-1 md:grid-cols-2 gap-4"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.2 }}
 >
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
 </motion.div>

 {ratedMoviesCount > 0 && (
 <motion.button
 onClick={() => setShowStats(!showStats)}
 className="w-full relative rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500 text-white p-4 shadow-xl hover:shadow-2xl hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 font-semibold"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.3 }}
 whileHover={{ scale: 1.01 }}
 whileTap={{ scale: 0.99 }}
 >
 <BarChart3 className="w-5 h-5" />
 {showStats ? t('profile.hideStats') : t('profile.showStats')}
 <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${showStats ? 'rotate-180' : ''}`} />
 </motion.button>
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
 <motion.div
 className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
 initial={{ width: 0 }}
 animate={{ width: `${(ratingDistribution[rating] / getMaxRatingCount) * 100}%` }}
 transition={{ duration: 0.5, delay: i * 0.05 }}
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
 {favoriteDecade.label === 'Grandpa Cinema' && '🎬 '}
 {favoriteDecade.label === 'Nostalgic' && '📼 '}
 {favoriteDecade.label === 'Modern Lover' && '📱 '}
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
 {segs.map((seg, idx) => {
 const pct = (seg.count / total) * 100;
 const isFirst = seg.rank === 0;
 return (
 <motion.div
 key={seg.key}
 title={`${seg.key}: ${seg.count} filmes`}
 className={`h-full rounded-sm ${isFirst ? accentBg : seg.rank === 3 ? 'bg-gray-200/60 dark:bg-gray-700/50' : 'bg-gray-300/70 dark:bg-gray-600/60'}`}
 initial={{ opacity: 0, scaleX: 0 }}
 animate={{ opacity: 1, scaleX: 1 }}
 transition={{ duration: 0.4, delay: 0.1 * idx }}
 style={{
 width: `${pct}%`,
 transformOrigin: 'left',
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

 {profile?.id && <UserPinsCard userId={profile.id} />}

 <WorldMapCard countryCounts={countryCounts} countryAvgRatings={countryAvgRatings} language={i18n.language} onViewMovies={handleViewCountryMovies} />

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
 <span className="text-gray-500 dark:text-gray-400 mr-1">{t('movies.friendRating')}:</span>
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

 {!essenceLoading && essencePersonality?.personalidade_completa && essenceArchetype && (() => {
 const isPt = i18n.language.startsWith('pt');
 const archetypeColor = (() => {
 const third = essencePersonality.personalidade_completa?.charAt(2) ?? '';
 const map: Record<string, string> = { A: '#fbbf24', B: '#64748b', K: '#ef4444', X: '#3b82f6', D: '#6b7280', L: '#10b981' };
 return map[third] || '#3b82f6';
 })();
 const archetypeId = essencePersonality.personalidade_completa?.slice(0, 2) || '';
 const subcategoryId = essencePersonality.personalidade_completa?.slice(2, 3) || null;

 return (
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
 {essencePersonality.personalidade_completa}
 </span>
 <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
 {essenceArchetype.archetype_name} {essenceArchetype.subcategory_name}
 </span>
 </div>
 <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
 {essenceArchetype.description}
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
 );
 })()}
 </motion.div>
 )}
 </AnimatePresence>

 <motion.div
 className="mt-8"
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.4 }}
 >
 <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
 {t('profile.movieCollection')}
 </h2>

 {movies.length === 0 ? (
 <div className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-12 text-center">
 <Film className="w-16 h-16 text-gray-400 mx-auto mb-4" />
 <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
 {t('profile.noMoviesYet')}
 </h3>
 <p className="text-gray-600 dark:text-gray-400">
 {t('profile.noMoviesYet')}
 </p>
 </div>
 ) : (
 <>
 {[...Array(11)].map((_, i) => {
 const rating = 10 - i;
 const ratedMovies = moviesByRating[rating] || [];
 if (ratedMovies.length > 0) {
 return (
 <RatingBox
 key={rating}
 title={`Rated ${rating}`}
 movies={ratedMovies}
 rating={rating}
 isOtherUserProfile={true}
 profileUserId={profile.id}
 chromaBoxEnabled={profile.chroma_box_enabled ?? true}
 />
 );
 }
 return null;
 })}

 {moviesByRating.unrated && moviesByRating.unrated.length > 0 && (
 <RatingBox
 title={t('library.watchList')}
 movies={moviesByRating.unrated}
 rating={null}
 isOtherUserProfile={true}
 profileUserId={profile.id}
 chromaBoxEnabled={profile.chroma_box_enabled ?? true}
 />
 )}
 </>
 )}
 </motion.div>
 </div>
 </motion.div>

 {showFriendsModal && profile.id && (
 <FollowersModal
 isOpen={true}
 onClose={() => setShowFriendsModal(false)}
 userId={profile.id}
 onFollowChange={refetchProfileData}
 />
 )}

 <ConfirmationModal
 isOpen={showUnfriendConfirm}
 onClose={() => setShowUnfriendConfirm(false)}
 onConfirm={performFriendAction}
 title={t('profile.unfriendConfirmTitle', { defaultValue: 'Desfazer amizade' })}
 message={t('profile.unfriendConfirmMessage', { defaultValue: `Tem certeza que deseja desfazer a amizade com @${profile.username}?` })}
 confirmLabel={t('profile.unfriendConfirmButton', { defaultValue: 'Desfazer' })}
 />

 {showUserListsModal && profile.id && (
 <UserListsModal
 isOpen={true}
 onClose={() => setShowUserListsModal(false)}
 userId={profile.id}
 />
 )}

 {showUserReviewsModal && profile.id && (
 <UserReviewsModal
 userId={profile.id}
 username={profile.username}
 onClose={() => setShowUserReviewsModal(false)}
 />
 )}

 {showCompatibilityModal && profile.id && session?.user?.id && (
 <CompatibilityModal
 isOpen={showCompatibilityModal}
 onClose={() => setShowCompatibilityModal(false)}
 myUserId={session.user.id}
 otherUserId={profile.id}
 otherUsername={profile.username}
 />
 )}

 {showMatchMovieModal && profile.id && session?.user?.id && (
 <MatchMovieModal
 isOpen={showMatchMovieModal}
 onClose={() => setShowMatchMovieModal(false)}
 otherUserId={profile.id}
 otherUsername={profile.username}
 />
 )}

 <AllMoviesModal
 isOpen={countryMoviesModal.isOpen}
 onClose={() => setCountryMoviesModal({ isOpen: false, title: '', movies: [] })}
 title={countryMoviesModal.title}
 movies={countryMoviesModal.movies}
 rating={null}
 isOtherUserProfile={true}
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
 {t('oracle.essenceProfileText', { profile: `${essencePersonality?.arquetipo_primario}${essencePersonality?.arquetipo_secundario}` })}
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
 {t('oracle.subarchetypeText', { id: essencePersonality?.subcategoria_id })}
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
 <div className="flex justify-center">
 <PentagonGraph points={spectrumPoints} subcategoryId={essencePersonality?.personalidade_completa || ''} />
 </div>
 </div>
 </div>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </>
 );
}