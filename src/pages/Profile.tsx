import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getEssenceLabel, getSubcategoryName } from '../lib/mood-genres';
import {
  User,
  Star,
  BarChart3,
  Users,
  Calendar,
  Film,
  Clock,
  MessageCircle,
  Crown,
  Palette,
  Loader2,
  Settings,
  Scroll,
  Info,
  RefreshCw,
  Tag,
  ArrowRight,
  Camera,
  Trash2,
  Check,
  Pencil,
  Globe2,
  Gem,
} from 'lucide-react';
import PentagonGraph from '../components/PentagonGraph';
import ArchetypeSymbol from '../components/ArchetypeSymbol';
import GlassLoader from '../components/GlassLoader';
import { supabase, getProfile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useWhispers } from '../contexts/WhispersContext';
import { getMovieDetailsFromDB, type Movie } from '../lib/tmdb';
import FollowersModal from '../components/FollowersModal';
import WhispersModal from '../components/WhispersModal';
import CustomizeModal from '../components/CustomizeModal';
import WorldMapCard from '../components/WorldMapCard';
import AllMoviesModal from '../components/AllMoviesModal';
import SettingsModal from '../components/SettingsModal';
import PersonasModal from '../components/PersonasModal';
import TagPinsModal from '../components/TagPinsModal';
import PersonaShareModal from '../components/PersonaShareModal';
import RatingSpectrum from '../components/RatingSpectrum';
import OracleSheet from '../components/OracleSheet';
import ConfirmationModal from '../components/ConfirmationModal';
import MovieDetailsModal from '../components/MovieDetailsModal';
import { toast } from 'sonner';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from '../components/GhostRiderFrame';
import { getBannerClass } from '../lib/banners';
import { getTextEffectNameClass, getTextEffectSecondaryClass } from '../lib/textEffects';
import { useTranslation } from 'react-i18next';
import { cache } from '../lib/cache';
import { useProfileData } from '../hooks/useProfileData';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ORACLES, ratingTone, tagCategoryStyle } from '../lib/oracleTheme';

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
  text_effect?: string;
  plan_type?: string;
  oracle_predictions_count?: number;
  oracle_recommendations_count?: number;
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
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('WebP conversion failed'))), 'image/webp', 0.85);
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

// Lê só as dimensões do arquivo, sem precisar decodificar frame a
// frame — o "canvas" de um GIF/WebP animado (a área de desenho onde
// todos os frames são compostos) tem tamanho fixo, igual pra qualquer
// frame, então carregar a imagem num <img> já basta pra saber a
// largura/altura reais, sem tocar na animação em si.
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read image dimensions'));
    };
    img.src = objectUrl;
  });

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
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showWhispersModal, setShowWhispersModal] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  // unreadWhispers vem do Context agora — a subscription antiga daqui
  // escutava a tabela "recommendations" (nome desatualizado, renomeada
  // pra "friend_indications" há tempos), então nunca disparava de
  // verdade; a contagem só atualizava em reloads manuais ou quando o
  // modal fechava e chamava fetchUnreadWhispers explicitamente. Uma
  // fonte de verdade só agora, compartilhada com o Navbar.
  const { unreadCount: unreadWhispers, refetchUnreadCount: fetchUnreadWhispers, openWhispersTarget, clearOpenWhispersTarget } = useWhispers();

  // Antes uma notificação clicada em qualquer outra página só navegava
  // pra cá sem nunca abrir o modal de verdade — o usuário precisava
  // clicar de novo no ícone de sussurros. Agora, chegando aqui com um
  // pedido pendente (target === 'profile'), o modal já abre sozinho.
  useEffect(() => {
    if (openWhispersTarget === 'profile') {
      setShowWhispersModal(true);
      clearOpenWhispersTarget();
    }
  }, [openWhispersTarget, clearOpenWhispersTarget]);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Contagem de resenhas REAIS (não geradas pelo Oráculo) — usada só
  // pra decidir se os Text Effects (Customize Profile) estão
  // desbloqueados. Mesma fonte de verdade do TagPinsModal/CustomizeModal.
  const [realReviewCount, setRealReviewCount] = useState(0);
  const [followedUsersCarousel, setFollowedUsersCarousel] = useState<FollowedUserCarousel[]>([]);
  const [showEssenceRevelation, setShowEssenceRevelation] = useState(false);
  const [showEssenceInfo, setShowEssenceInfo] = useState(false);
  const [showPersonasModal, setShowPersonasModal] = useState(false);
  const [showTagPinsModal, setShowTagPinsModal] = useState(false);
  const [showPersonaShare, setShowPersonaShare] = useState(false);
  const [showRetakeQuizModal, setShowRetakeQuizModal] = useState(false);
  // Joia menos conhecida aberta nos detalhes do filme.
  const [gemMovie, setGemMovie] = useState<Movie | null>(null);
  const [gemLoading, setGemLoading] = useState(false);
  // Faixa de atividade dos amigos (rolagem horizontal, arrastável no desktop).
  const friendsScrollRef = useRef<HTMLDivElement>(null);
  const friendsDrag = useRef({ active: false, startX: 0, scrollStart: 0, distance: 0 });

  const {
    ratedMoviesCount,
    ratingDistribution,
    totalWatchTime,
    favoriteGenres,
    favoriteKeywords,
    favoriteDecade,
    topDirectors,
    leastKnownGem,
    friendsCount,
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
    movies: [],
  });

  const handleViewCountryMovies = (countryCode: string, countryName: string) => {
    const filtered = (movies || []).filter((m: any) => m.origin_country?.[0] === countryCode && m.userRating !== null);
    setCountryMoviesModal({ isOpen: true, title: countryName, movies: filtered });
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile();
      fetchFollowedUsersForCarousel();
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

  const fetchFollowedUsersForCarousel = async () => {
    if (!session?.user?.id) return;
    try {
      const { data: friendships, error: followsError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);

      if (followsError) throw followsError;
      if (!friendships || friendships.length === 0) {
        setFollowedUsersCarousel([]);
        return;
      }

      const followingIds = friendships.map((f: any) => (f.requester_id === session.user.id ? f.addressee_id : f.requester_id));

      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, username, avatar_url, avatar_frame, plan_type').in('id', followingIds);

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

      supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_ai_generated', false)
        .then(({ count }) => setRealReviewCount(count || 0));

      if (session.user.created_at) {
        setCreatedAt(session.user.created_at);
      }

      if (checkPremiumStatus) {
        await checkPremiumStatus();
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error(t('profile.toast.loadError'));
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
          banner: '',
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
      toast.success(t('profile.toast.created'));
    } catch (error) {
      console.error('Error creating profile:', error);
      toast.error(t('profile.toast.createError'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      if (!session?.user?.id) return;

      if (!newUsername.trim()) {
        toast.error(t('profile.toast.usernameEmpty'));
        return;
      }

      if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
        toast.error(t('profile.toast.usernameInvalid'));
        return;
      }

      if (newUsername !== username) {
        const { data: existingUsers, error: checkError } = await supabase.from('profiles').select('id').eq('username', newUsername).not('id', 'eq', session.user.id);

        if (checkError) throw checkError;

        if (existingUsers && existingUsers.length > 0) {
          toast.error(t('profile.toast.usernameTaken'));
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

      toast.success(t('profile.toast.updated'));
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(t('profile.toast.updateError'));
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

      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', session.user.id);

      if (updateError) throw updateError;

      if (oldPath) {
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      setAvatarUrl('');
      toast.success(t('profile.toast.avatarRemoved'));
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error(t('profile.toast.avatarRemoveError'));
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
    // WebP também pode ser animado (comum em exportações de editores de
    // imagem) — antes só .gif escapava do canvas, então um avatar em WebP
    // animado caía direto na conversão via canvas.toBlob, que só consegue
    // capturar o frame atual de uma imagem animada e gera um arquivo
    // estático, congelando a animação pra sempre — mesmo cumprindo
    // qualquer limite de tamanho, já que o problema não era o tamanho do
    // arquivo, e sim ele nunca ter sido reconhecido como "pode ser
    // animado" antes de passar pelo canvas.
    const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
    const isAnimatable = isGif || isWebp;
    const isUserPremium = isPremium || profile?.plan_type === 'premium';
    const isPremiumAnimated = isAnimatable && isUserPremium;

    console.log(
      '[Avatar Upload] isPremium (auth):',
      isPremium,
      '| profile.plan_type:',
      profile?.plan_type,
      '| isUserPremium:',
      isUserPremium,
      '| isAnimatable:',
      isAnimatable,
      '| isPremiumAnimated:',
      isPremiumAnimated,
    );

    if (isPremiumAnimated) {
      const ANIMATED_MAX_BYTES = 2 * 1024 * 1024;
      if (file.size > ANIMATED_MAX_BYTES) {
        toast.error(t('profile.toast.animatedTooHeavy'));
        e.target.value = '';
        return;
      }

      // Peso em bytes e dimensão em pixels são coisas independentes — um
      // GIF com poucos frames/cores pode pesar pouco e ainda assim ter,
      // por exemplo, 1920x1080 de tamanho. Sem essa checagem, esse
      // arquivo passava batido no limite de bytes acima e era servido
      // cru pra qualquer visitante do site, decodificando uma imagem
      // enorme só pra caber num círculo de 40-112px. Usa o mesmo limite
      // já aplicado ao caminho estático (AVATAR_MAX_DIMENSION), pra
      // manter o padrão consistente entre os dois casos — como não dá
      // pra redimensionar um arquivo animado sem ferramentas mais pesadas
      // (fora do escopo aqui), a validação barra o upload em vez de
      // tentar corrigir sozinha.
      try {
        const { width, height } = await getImageDimensions(file);
        if (width > AVATAR_MAX_DIMENSION || height > AVATAR_MAX_DIMENSION) {
          toast.error(t('profile.toast.animatedTooLarge', { width, height, max: AVATAR_MAX_DIMENSION }));
          e.target.value = '';
          return;
        }
      } catch {
        toast.error(t('profile.toast.dimensionsError'));
        e.target.value = '';
        return;
      }
    } else if (file.size > AVATAR_MAX_INPUT_BYTES) {
      toast.error(t('profile.toast.imageTooLarge'));
      e.target.value = '';
      return;
    }

    if (isAnimatable && !isUserPremium) {
      toast.info(t('profile.toast.animatedStatic'));
    }

    setIsUploadingAvatar(true);
    try {
      let uploadBlob: Blob;
      let ext: string;
      let contentType: string;

      if (isPremiumAnimated) {
        console.log('[Avatar Upload] Path: animated bypass (Premium) — uploading raw file, preserving original format');
        uploadBlob = file;
        // Mantém o formato real do arquivo original — antes isso estava
        // fixo em 'gif'/'image/gif' mesmo quando o arquivo já podia ser
        // outro formato animável, corrompendo o upload nesse caso.
        ext = isGif ? 'gif' : 'webp';
        contentType = isGif ? 'image/gif' : 'image/webp';
      } else {
        console.log('[Avatar Upload] Path: Canvas → WebP conversion (free user or non-animatable format)');
        uploadBlob = await convertImageToWebP(file);
        ext = 'webp';
        contentType = 'image/webp';
      }

      console.log('[Avatar Upload] uploadBlob size:', (uploadBlob.size / 1024).toFixed(1) + 'KB', '| ext:', ext, '| contentType:', contentType);

      const filePath = `${session.user.id}/${Date.now()}.${ext}`;
      console.log('[Avatar Upload] filePath:', filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage.from('avatars').upload(filePath, uploadBlob, {
        contentType,
        cacheControl: '3600',
        upsert: true,
      });

      console.log('[Avatar Upload] Storage upload result:', { uploadData, uploadError });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const displayUrl = isPremiumAnimated ? `${publicUrl}?t=${Date.now()}` : publicUrl;

      console.log('[Avatar Upload] publicUrl:', publicUrl, '| displayUrl:', displayUrl);

      const oldPath = avatarUrl ? extractAvatarStoragePath(avatarUrl) : null;

      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', session.user.id);

      console.log('[Avatar Upload] DB update error:', updateError);

      if (updateError) throw updateError;

      if (oldPath && oldPath !== filePath) {
        await supabase.storage.from('avatars').remove([oldPath]);
      }

      setAvatarUrl(displayUrl);
      console.log('[Avatar Upload] Done — avatarUrl state set to:', displayUrl);
      toast.success(t('profile.toast.avatarUpdated'));
    } catch (error) {
      console.error('[Avatar Upload] ERROR:', error);
      toast.error(t('profile.toast.avatarError'));
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const formatWatchTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes % 60}m`;
  };

  // Joia menos conhecida — abre os detalhes do filme ao tocar no cartão.
  const openGem = async () => {
    if (!leastKnownGem || gemLoading) return;
    setGemLoading(true);
    try {
      const details = await getMovieDetailsFromDB(leastKnownGem.id);
      setGemMovie(details);
    } catch (error) {
      console.error('Error loading gem details:', error);
      toast.error(t('common.error'));
    } finally {
      setGemLoading(false);
    }
  };

  // Arrastar a faixa de amigos com o mouse (no celular é o toque nativo).
  const handleFriendsMouseDown = (e: React.MouseEvent) => {
    const el = friendsScrollRef.current;
    if (!el) return;
    friendsDrag.current = { active: true, startX: e.pageX, scrollStart: el.scrollLeft, distance: 0 };
  };
  const handleFriendsMouseMove = (e: React.MouseEvent) => {
    const el = friendsScrollRef.current;
    if (!el || !friendsDrag.current.active) return;
    e.preventDefault();
    const dx = e.pageX - friendsDrag.current.startX;
    friendsDrag.current.distance = Math.abs(dx);
    el.scrollLeft = friendsDrag.current.scrollStart - dx;
  };
  const handleFriendsMouseUp = () => {
    friendsDrag.current.active = false;
  };

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('common.loading')} />;
  }

  if (!profileExists) {
    return (
      <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-5 py-12">
        <div className="w-full max-w-md rounded-3xl ring-1 ring-white/10 p-8 text-center" style={{ background: VELVET }}>
          <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <User className="w-8 h-8 text-violet-300" aria-hidden />
          </span>
          <h1 style={{ ...PIXEL, color: PAPER }} className="mt-5 text-3xl leading-tight">
            {t('profile.setupTitle')}
          </h1>
          <p className="mt-2" style={{ color: MIST }}>
            {t('profile.setupDesc')}
          </p>
          <button
            onClick={createProfile}
            className={`mt-7 w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
          >
            {t('profile.setupButton')}
          </button>
        </div>
      </div>
    );
  }

  // ---- Valores derivados ----
  const bannerClass = getBannerClass(profile?.banner, isPremium);
  const nameEffectClass = getTextEffectNameClass(profile?.text_effect, isPremium, realReviewCount);
  const secondaryEffectClass = getTextEffectSecondaryClass(profile?.text_effect, isPremium, realReviewCount);
  // Efeitos com fonte própria (Typewriter) mantêm a fonte deles; os demais
  // usam a Pixelify, como todo título do site.
  const nameStyle = nameEffectClass.includes('font-[') ? undefined : PIXEL;
  const rawFrameClass = getFrameClass(profile?.avatar_frame, isPremium);
  const frameClass = !rawFrameClass || rawFrameClass === 'ring-0' ? 'ring-2 ring-white/15' : rawFrameClass;

  const ratingCounts = Array.from({ length: 11 }, (_, r) => Number(ratingDistribution[r]) || 0);
  const ratedTotal = ratingCounts.reduce((a, b) => a + b, 0);
  const average = ratedTotal > 0 ? ratingCounts.reduce((acc, count, r) => acc + count * r, 0) / ratedTotal : null;
  const countriesCount = Object.values(countryCounts || {}).filter((c) => c > 0).length;
  const joinedLabel = createdAt ? new Date(createdAt).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) : null;
  const formatNumber = (value: number, digits = 1) => value.toLocaleString(i18n.language, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const ghostButton = `inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 bg-black/20 hover:bg-white/10 backdrop-blur-sm text-sm font-medium transition ${FOCUS_RING}`;
  const card = 'rounded-2xl ring-1 ring-white/10 p-5 sm:p-6';
  const cardTitle = (text: string) => (
    <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
      {text}
    </h3>
  );
  const sectionHeading = (title: string, hint?: string) => (
    <div className="min-w-0">
      <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 text-sm" style={{ color: MIST }}>
          {hint}
        </p>
      )}
    </div>
  );

  // Década favorita: as três décadas mais vistas + "outras".
  const decadeView = (() => {
    if (!favoriteDecade) return null;
    const sorted = Object.entries(favoriteDecade.allDecades || {})
      .map(([decade, count]) => ({ decade, count: count as number }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = sorted.reduce((a, b) => a + b.count, 0) || 1;
    const top3 = sorted.slice(0, 3);
    const othersCount = sorted.slice(3).reduce((a, b) => a + b.count, 0);
    const accent = favoriteDecade.label === 'Grandpa Cinema' ? '#F59E0B' : favoriteDecade.label === 'Nostalgic' ? '#38BDF8' : '#34D399';
    const labelKey = favoriteDecade.label === 'Grandpa Cinema' ? 'grandpa' : favoriteDecade.label === 'Nostalgic' ? 'nostalgic' : 'modern';
    const descKey = favoriteDecade.label === 'Grandpa Cinema' ? 'classicFilm' : favoriteDecade.label === 'Nostalgic' ? 'nostalgic' : 'modern';
    const segments = [
      ...top3.map((d, i) => ({ key: d.decade, label: d.decade, count: d.count, rank: i })),
      ...(othersCount > 0 ? [{ key: 'others', label: t('profile.stats.otherDecades'), count: othersCount, rank: 3 }] : []),
    ].map((s) => ({ ...s, pct: (s.count / total) * 100 }));
    return { accent, labelKey, descKey, segments };
  })();

  const archetypeCode = essencePersonality?.personalidade_completa || '';
  const hasEssence = !!archetypeCode && !!essenceArchetype;
  const archetypeColor =
    ({ A: '#fbbf24', B: '#a78bfa', K: '#f87171', X: '#60a5fa', D: '#F3EAD3', L: '#34d399' } as Record<string, string>)[archetypeCode.charAt(2)] || '#60a5fa';
  const isPtLang = i18n.language.startsWith('pt');

  return (
    <div className="min-h-screen pb-16">
      {/* ---------- Cartão de identidade ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
        <div
          className={`relative rounded-3xl ring-1 ring-white/10 overflow-hidden shadow-2xl ${bannerClass}`}
          style={
            bannerClass
              ? undefined
              : {
                  background: `radial-gradient(ellipse 70% 90% at 100% 0%, rgba(139,92,246,0.22), transparent 65%), radial-gradient(ellipse 50% 70% at 0% 100%, rgba(217,70,239,0.10), transparent 70%), ${VELVET}`,
                }
          }
        >
          <div className="relative z-10 p-5 sm:p-8">
            <button
              onClick={() => setShowSettingsModal(true)}
              aria-label={t('settings.title')}
              title={t('settings.title')}
              className={`absolute top-3 right-3 sm:top-5 sm:right-5 grid place-items-center w-11 h-11 rounded-full ring-1 ring-white/15 bg-black/25 backdrop-blur-sm hover:bg-white/10 transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <Settings className="w-5 h-5" aria-hidden />
            </button>

            <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7">
              {/* Avatar (com a moldura escolhida) */}
              <div className="relative mx-auto sm:mx-0 shrink-0">
                {!isUploadingAvatar && avatarUrl && frameUsesComponent(profile?.avatar_frame, isPremium) === 'GhostRiderFrame' ? (
                  <GhostRiderFrame src={avatarUrl} alt={username} size={120} />
                ) : (
                  <div className={`w-[120px] h-[120px] rounded-full overflow-hidden ${frameClass}`} style={{ background: NIGHT }}>
                    {isUploadingAvatar ? (
                      <div className="w-full h-full grid place-items-center bg-black/40">
                        <Loader2 className="w-8 h-8 text-white animate-spin" aria-hidden />
                      </div>
                    ) : avatarUrl ? (
                      <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full grid place-items-center" style={{ color: MIST }}>
                        <User className="w-12 h-12" aria-hidden />
                      </div>
                    )}
                  </div>
                )}
                {isEditing && !isUploadingAvatar && (
                  <span aria-hidden className="absolute bottom-1 right-1 grid place-items-center w-9 h-9 rounded-full bg-violet-600 ring-4 ring-[#1C1433] text-white">
                    <Camera className="w-4 h-4" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left" style={{ color: MIST }}>
                {isEditing ? (
                  <div className="space-y-4 text-left sm:pr-12">
                    <label className="block">
                      <span className="block text-sm mb-1.5" style={{ color: MIST }}>
                        {t('profile.usernameLabel')}
                      </span>
                      <span className="relative block">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: MIST }}>
                          @
                        </span>
                        <input
                          type="text"
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value)}
                          maxLength={20}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full h-12 pl-9 pr-4 rounded-xl ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-[15px]"
                          style={{ background: 'rgba(18,13,34,0.75)', color: PAPER }}
                        />
                      </span>
                      <span className="block mt-1 text-xs" style={{ color: MIST }}>
                        {t('profile.usernameHint')}
                      </span>
                    </label>
                    <label className="block">
                      <span className="block text-sm mb-1.5" style={{ color: MIST }}>
                        {t('profile.bioLabel')}
                      </span>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        maxLength={160}
                        rows={3}
                        placeholder={t('profile.bioPlaceholder')}
                        className="w-full px-4 py-3 rounded-xl ring-1 ring-white/15 focus:ring-2 focus:ring-fuchsia-300/70 outline-none resize-none text-[15px] leading-relaxed placeholder:text-[#BDB4D6]/70"
                        style={{ background: 'rgba(18,13,34,0.75)', color: PAPER }}
                      />
                      <span className="block mt-1 text-xs text-right tabular-nums" style={{ color: MIST }}>
                        {bio.length}/160
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <label
                        className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 bg-black/20 hover:bg-white/10 text-sm font-medium cursor-pointer transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fuchsia-300 ${isUploadingAvatar ? 'opacity-50 pointer-events-none' : ''}`}
                        style={{ color: PAPER }}
                      >
                        <input
                          type="file"
                          accept="image/gif,image/webp,image/png,image/jpeg,image/jpg"
                          className="sr-only"
                          onChange={handleAvatarChange}
                          disabled={isUploadingAvatar}
                        />
                        <Camera className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                        {t('profile.changePhoto')}
                      </label>
                      {avatarUrl && (
                        <button
                          onClick={handleRemoveAvatar}
                          disabled={isUploadingAvatar}
                          className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-red-400/30 hover:bg-red-500/10 text-sm font-medium text-red-200 transition disabled:opacity-50 ${FOCUS_RING}`}
                        >
                          <Trash2 className="w-[18px] h-[18px]" aria-hidden />
                          {t('profile.removePhoto')}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-2 sm:pr-14" style={{ color: PAPER }}>
                      <h1 className={`text-[2rem] sm:text-5xl leading-none break-all ${nameEffectClass}`} style={nameStyle}>
                        @{username}
                      </h1>
                      {isPremium && <Crown className="w-6 h-6 shrink-0 text-amber-300" aria-label={t('settings.premium')} />}
                    </div>
                    {profile?.active_tag && (
                      <span
                        className={`mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium ${tagCategoryStyle(profile.active_tag.category).pill}`}
                      >
                        <span aria-hidden>{profile.active_tag.emoji}</span>
                        {profile.active_tag.name}
                      </span>
                    )}
                    {bio && <p className={`mt-3 max-w-2xl mx-auto sm:mx-0 text-[15px] leading-relaxed ${secondaryEffectClass}`}>{bio}</p>}
                    <div className={`mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-sm ${secondaryEffectClass}`}>
                      <button
                        onClick={() => setShowFriendsModal(true)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-1 -mx-1 hover:underline underline-offset-4 ${FOCUS_RING}`}
                      >
                        <Users className="w-4 h-4" aria-hidden />
                        <span style={PIXEL} className="text-base">
                          {friendsCount}
                        </span>
                        {t('profile.friendsLabel', { defaultValue: 'Amigos' })}
                      </button>
                      {joinedLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-4 h-4" aria-hidden />
                          {t('profile.joined', { date: joinedLabel })}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="mt-6 flex flex-wrap justify-center sm:justify-start gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleUpdateProfile}
                    className={`inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
                  >
                    <Check className="w-[18px] h-[18px]" aria-hidden />
                    {t('profile.saveChanges')}
                  </button>
                  <button onClick={handleCancelEditing} className={ghostButton} style={{ color: PAPER }}>
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setShowWhispersModal(true)}
                    aria-label={unreadWhispers > 0 ? `${t('profile.whispers')} (${unreadWhispers})` : t('profile.whispers')}
                    className={ghostButton}
                    style={{ color: PAPER }}
                  >
                    <MessageCircle className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                    {t('profile.whispers')}
                    {unreadWhispers > 0 && (
                      <span className="grid place-items-center min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-fuchsia-500 text-white text-xs font-bold" aria-hidden>
                        {unreadWhispers}
                      </span>
                    )}
                  </button>
                  <button onClick={() => setShowCustomizeModal(true)} className={ghostButton} style={{ color: PAPER }}>
                    <Palette className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                    {t('profile.customize')}
                  </button>
                  <button onClick={() => setShowTagPinsModal(true)} className={ghostButton} style={{ color: PAPER }}>
                    <Tag className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                    {t('profile.tagPins', { defaultValue: 'Tag Pins' })}
                  </button>
                  <button onClick={handleStartEditing} className={ghostButton} style={{ color: PAPER }}>
                    <Pencil className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                    {t('profile.editProfile')}
                  </button>
                  {!isPremium && (
                    <button
                      onClick={() => navigate('/premium')}
                      className={`inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#221B36] text-sm font-semibold shadow-lg shadow-amber-900/30 transition ${FOCUS_RING}`}
                    >
                      <Crown className="w-[18px] h-[18px]" aria-hidden />
                      {t('oracle.premium.upgrade')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Números ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 mt-4" aria-label={t('profile.numbersLabel')}>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Star, label: t('profile.stats.ratedMovies'), value: String(ratedMoviesCount) },
            { icon: Clock, label: t('profile.stats.timeWatching'), value: formatWatchTime(totalWatchTime) },
            { icon: BarChart3, label: t('profile.stats.averageRating'), value: average !== null ? formatNumber(average) : '—' },
            { icon: Globe2, label: t('profile.statCountries'), value: String(countriesCount) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-2xl px-4 py-4 ring-1 ring-white/10" style={{ background: VELVET }}>
              <dt className="flex items-center gap-2 text-sm" style={{ color: MIST }}>
                <Icon className="w-4 h-4 shrink-0 text-violet-300" aria-hidden />
                <span className="min-w-0 leading-tight">{label}</span>
              </dt>
              <dd style={{ ...PIXEL, color: PAPER }} className="mt-2 text-3xl leading-none truncate">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Atividade dos amigos ---------- */}
      <section className="mt-12 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 flex flex-wrap items-end justify-between gap-4">
          {sectionHeading(t('profile.friendsActivity'), followedUsersCarousel.length > 0 ? t('profile.friendsActivityHint') : undefined)}
          <Link
            to="/community"
            className={`inline-flex items-center gap-2 h-11 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {t('profile.accessCommunity')}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>

        {followedUsersCarousel.length > 0 ? (
          <div
            ref={friendsScrollRef}
            className="mt-5 overflow-x-auto cursor-grab select-none"
            onMouseDown={handleFriendsMouseDown}
            onMouseMove={handleFriendsMouseMove}
            onMouseUp={handleFriendsMouseUp}
            onMouseLeave={handleFriendsMouseUp}
            onClickCapture={(e) => {
              if (friendsDrag.current.distance > 5) {
                e.preventDefault();
                e.stopPropagation();
                friendsDrag.current.distance = 0;
              }
            }}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
          >
            <ol className="flex gap-3 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pb-2">
              {followedUsersCarousel.map((friend) => {
                const friendFrameRaw = getFrameClass(friend.avatar_frame || undefined, friend.plan_type === 'premium');
                const friendFrame = !friendFrameRaw || friendFrameRaw === 'ring-0' ? 'ring-2 ring-white/15' : friendFrameRaw;
                const tone = friend.lastRating !== null ? ratingTone(friend.lastRating) : null;
                return (
                  <li key={friend.id} className="shrink-0 w-[140px]">
                    <Link
                      to={`/profile/${friend.username}`}
                      draggable={false}
                      className={`group h-full flex flex-col items-center justify-start text-center rounded-2xl px-3 pt-4 pb-3.5 ring-1 ring-white/10 hover:ring-white/25 transition ${FOCUS_RING}`}
                      style={{ background: VELVET }}
                    >
                      {frameUsesComponent(friend.avatar_frame || undefined, friend.plan_type === 'premium') === 'GhostRiderFrame' && friend.avatar_url ? (
                        <GhostRiderFrame src={friend.avatar_url} alt="" size={64} />
                      ) : (
                        <span className={`block w-16 h-16 rounded-full overflow-hidden ${friendFrame}`} style={{ background: NIGHT }}>
                          {friend.avatar_url ? (
                            <img src={friend.avatar_url} alt="" draggable={false} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          ) : (
                            <span className="w-full h-full grid place-items-center text-xl font-semibold" style={{ color: PAPER }}>
                              {friend.username.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="mt-2.5 max-w-full text-sm font-semibold truncate group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                        @{friend.username}
                      </span>
                      {friend.lastRatedTitle ? (
                        <>
                          <span className="mt-1 text-xs leading-snug line-clamp-2" style={{ color: MIST }}>
                            {friend.lastRatedTitle}
                          </span>
                          {tone ? (
                            <span
                              className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] leading-none"
                              style={{ ...PIXEL, color: tone.color, boxShadow: `inset 0 0 0 1.5px ${tone.ring}` }}
                            >
                              <Star className="w-3 h-3 fill-current" aria-hidden />
                              {friend.lastRating}
                            </span>
                          ) : (
                            <span className="mt-2 text-[11px] text-sky-300">{t('profile.onWatchlist')}</span>
                          )}
                        </>
                      ) : (
                        <span className="mt-1 text-xs" style={{ color: MIST }}>
                          {t('profile.noRecentActivity')}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
            <div className={`${card} flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left`} style={{ background: VELVET }}>
              <span className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
                <Users className="w-7 h-7 text-violet-300" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: PAPER }}>
                  {t('profile.noFriendsActivityTitle')}
                </p>
                <p className="mt-1 text-sm" style={{ color: MIST }}>
                  {t('profile.noFriendsActivityDescription')}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ---------- Seu gosto ---------- */}
      <section className="mt-12 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          {sectionHeading(t('profile.tasteTitle'), t('profile.tasteHint'))}

          {ratedMoviesCount > 0 ? (
            <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className={`${card} md:col-span-2`} style={{ background: VELVET }}>
                <RatingSpectrum counts={ratingCounts} average={average} title={t('profile.stats.ratingDistribution')} />
              </div>

              <div className={card} style={{ background: VELVET }}>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    { title: t('profile.stats.favoriteGenres'), items: favoriteGenres, empty: t('profile.stats.noGenresYet'), capitalize: false },
                    { title: t('profile.stats.favoriteKeywords'), items: favoriteKeywords, empty: t('profile.stats.noKeywordsYet'), capitalize: true },
                  ].map((col) => (
                    <div key={col.title} className="min-w-0">
                      {cardTitle(col.title)}
                      {col.items.length > 0 ? (
                        <ol className="mt-4 space-y-1.5">
                          {col.items.map((item, index) => (
                            <li
                              key={item.id}
                              className={`truncate ${col.capitalize ? 'capitalize' : ''} ${index === 0 ? 'text-base font-semibold' : 'text-sm'}`}
                              style={{ color: index === 0 ? PAPER : MIST }}
                              title={item.name}
                            >
                              {item.name}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-4 text-sm" style={{ color: MIST }}>
                          {col.empty}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {favoriteDecade && decadeView && (
                <div className={card} style={{ background: VELVET }}>
                  {cardTitle(t('profile.stats.favoriteDecade'))}
                  <div className="mt-4 flex items-baseline gap-3">
                    <span style={{ ...PIXEL, color: PAPER }} className="text-5xl leading-none">
                      {favoriteDecade.decade}
                    </span>
                    <span className="text-sm" style={{ color: MIST }}>
                      {t('library.titleCount', { count: favoriteDecade.count })}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold" style={{ color: decadeView.accent }}>
                    {t(`profile.decadeLabels.${decadeView.labelKey}`)}
                  </p>
                  <p className="mt-1 text-sm leading-snug" style={{ color: MIST }}>
                    {t(`profile.stats.${decadeView.descKey}`)}
                  </p>
                  <div
                    className="mt-4 flex h-3 gap-[2px] rounded-full overflow-hidden"
                    role="img"
                    aria-label={decadeView.segments.map((s) => `${s.label}: ${Math.round(s.pct)}%`).join(', ')}
                  >
                    {decadeView.segments.map((seg) => (
                      <span
                        key={seg.key}
                        className="h-full"
                        style={{
                          width: `${seg.pct}%`,
                          background: seg.rank === 0 ? decadeView.accent : `rgba(189,180,214,${seg.rank === 3 ? 0.22 : 0.45 - seg.rank * 0.1})`,
                        }}
                      />
                    ))}
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: MIST }}>
                    {decadeView.segments.map((seg) => (
                      <li key={seg.key} className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className="w-2 h-2 rounded-full"
                          style={{ background: seg.rank === 0 ? decadeView.accent : `rgba(189,180,214,${seg.rank === 3 ? 0.3 : 0.55 - seg.rank * 0.1})` }}
                        />
                        <span style={seg.rank === 0 ? { color: PAPER } : undefined}>{seg.label}</span>
                        <span className="tabular-nums">{Math.round(seg.pct)}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={card} style={{ background: VELVET }}>
                {cardTitle(t('profile.stats.favoriteDirectors'))}
                {topDirectors.length > 0 ? (
                  <ol className="mt-4 space-y-2.5">
                    {topDirectors.map((director, index) => (
                      <li key={`${director.name}-${index}`} className="flex items-center gap-3 min-w-0">
                        <span style={{ ...PIXEL, color: index === 0 ? PAPER : MIST }} className="w-5 shrink-0 text-base leading-none text-right">
                          {index + 1}
                        </span>
                        <span className={`flex-1 min-w-0 truncate ${index === 0 ? 'font-semibold' : ''}`} style={{ color: PAPER }}>
                          {director.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums" style={{ color: MIST }}>
                          {t('library.titleCount', { count: director.count })}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-sm" style={{ color: MIST }}>
                    {t('common.no_data')}
                  </p>
                )}
              </div>

              <div className={card} style={{ background: VELVET }}>
                {cardTitle(t('profile.stats.leastKnownGem'))}
                {leastKnownGem ? (
                  <button
                    onClick={openGem}
                    aria-busy={gemLoading || undefined}
                    className={`group mt-4 -mx-2 w-[calc(100%+1rem)] flex-col items-start justify-start gap-1 px-2 py-2 rounded-xl text-left hover:bg-white/[0.04] transition ${FOCUS_RING}`}
                  >
                    <span className="flex items-center gap-2 w-full">
                      <Gem className="w-5 h-5 shrink-0 text-emerald-300" aria-hidden />
                      <span className="flex-1 min-w-0 font-semibold leading-snug group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                        {leastKnownGem.title}
                      </span>
                      {gemLoading ? (
                        <Loader2 className="w-4 h-4 shrink-0 animate-spin text-violet-300" aria-hidden />
                      ) : (
                        <ArrowRight className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
                      )}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: MIST }}>
                      {leastKnownGem.release_date && <span>{leastKnownGem.release_date.slice(0, 4)}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                        {formatNumber(leastKnownGem.vote_average)}
                      </span>
                      {typeof leastKnownGem.userRating === 'number' && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] leading-none"
                          style={{
                            ...PIXEL,
                            color: ratingTone(leastKnownGem.userRating).color,
                            boxShadow: `inset 0 0 0 1.5px ${ratingTone(leastKnownGem.userRating).ring}`,
                          }}
                          title={t('home.desk.yourRating')}
                        >
                          <span className="sr-only">{t('home.desk.yourRating')}:</span>
                          {leastKnownGem.userRating}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 text-xs" style={{ color: MIST }}>
                      {t('profile.stats.onlyVotes', { count: leastKnownGem.vote_count })} {t('profile.stats.votesOnTmdb')}
                    </span>
                  </button>
                ) : (
                  <p className="mt-4 text-sm" style={{ color: MIST }}>
                    {t('profile.stats.noHiddenGems')}
                  </p>
                )}
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <WorldMapCard countryCounts={countryCounts} countryAvgRatings={countryAvgRatings} language={i18n.language} onViewMovies={handleViewCountryMovies} />
              </div>
            </div>
          ) : (
            <div className={`mt-6 ${card} flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left`} style={{ background: VELVET }}>
              <span className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
                <Film className="w-7 h-7 text-violet-300" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: PAPER }}>
                  {t('profile.tasteEmptyTitle')}
                </p>
                <p className="mt-1 text-sm" style={{ color: MIST }}>
                  {t('profile.tasteEmptyDesc')}
                </p>
              </div>
              <Link
                to="/add-movies"
                className={`shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
              >
                {t('library.addMovies')}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Essência cinematográfica ---------- */}
      <section className="mt-12 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          {sectionHeading(t('oracle.cinematicEssenceLabel'))}
          {essenceLoading ? (
            <div className={`mt-6 ${card} space-y-3`} style={{ background: VELVET }} aria-busy="true">
              <div className="h-14 w-56 rounded-lg bg-white/10 animate-pulse" />
              <div className="h-4 w-full max-w-lg rounded bg-white/10 animate-pulse" />
            </div>
          ) : hasEssence ? (
            <div className={`mt-6 ${card}`} style={{ background: VELVET }}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="shrink-0">
                    <ArchetypeSymbol archetypeId={archetypeCode.slice(0, 2)} subcategoryId={archetypeCode.slice(2, 3) || null} size={72} animated={false} />
                  </span>
                  <div className="min-w-0">
                    <p style={{ ...PIXEL, color: archetypeColor }} className="text-4xl leading-none">
                      {archetypeCode}
                    </p>
                    <p className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
                      {essenceArchetype!.archetype_name} {essenceArchetype!.subcategory_name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowEssenceRevelation(true)} className={ghostButton} style={{ color: PAPER }}>
                    <Scroll className="w-[18px] h-[18px] text-pink-300" aria-hidden />
                    {t('oracle.revelation')}
                  </button>
                  <button onClick={() => setShowEssenceInfo(true)} className={ghostButton} style={{ color: PAPER }}>
                    <Info className="w-[18px] h-[18px] text-sky-300" aria-hidden />
                    {t('profile.howItWorks')}
                  </button>
                </div>
              </div>
              {essenceArchetype!.archetype_description && (
                <p className="mt-5 max-w-3xl text-[15px] leading-relaxed line-clamp-3" style={{ color: MIST }}>
                  {essenceArchetype!.archetype_description}
                </p>
              )}
            </div>
          ) : (
            <div className={`mt-6 ${card} flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left`} style={{ background: VELVET }}>
              <div className="flex shrink-0" aria-hidden>
                {ORACLES.map((oracle, i) => (
                  <img
                    key={oracle.id}
                    src={oracle.avatar}
                    alt=""
                    width={44}
                    height={44}
                    className={`w-11 h-11 rounded-full object-cover ${i > 0 ? '-ml-2' : ''}`}
                    style={{ boxShadow: `0 0 0 2px ${VELVET}, 0 0 0 4px ${oracle.color}` }}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold" style={{ color: PAPER }}>
                  {t('home.desk.essenceEmptyTitle')}
                </p>
                <p className="mt-1 text-sm" style={{ color: MIST }}>
                  {t('home.desk.essenceEmptyDesc')}
                </p>
              </div>
              <Link
                to="/oracle"
                className={`shrink-0 inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold transition ${FOCUS_RING}`}
              >
                {t('oracle.discoverYourEssence')}
              </Link>
            </div>
          )}
        </div>
      </section>

      {showWhispersModal && session?.user?.id && (
        <WhispersModal
          isOpen={showWhispersModal}
          onClose={() => setShowWhispersModal(false)}
          userId={session.user.id}
          onFriendAccepted={() => {
            refetchProfileData();
            fetchFollowedUsersForCarousel();
          }}
        />
      )}

      {showFriendsModal && session?.user?.id && (
        <FollowersModal isOpen={true} onClose={() => setShowFriendsModal(false)} userId={session.user.id} onFollowChange={refetchProfileData} />
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

      {session?.user?.id && (
        <TagPinsModal
          isOpen={showTagPinsModal}
          onClose={() => setShowTagPinsModal(false)}
          userId={session.user.id}
          onSave={() => {
            fetchProfile();
          }}
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

      {/* Revelação — a leitura completa da essência */}
      <OracleSheet
        open={showEssenceRevelation && hasEssence}
        onClose={() => setShowEssenceRevelation(false)}
        title={t('oracle.revelation')}
        subtitle={hasEssence ? `${essenceArchetype!.archetype_name} ${essenceArchetype!.subcategory_name}` : undefined}
        leading={
          <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
            <Scroll className="w-5 h-5 text-pink-300" aria-hidden />
          </span>
        }
        size="lg"
        bodyClassName="px-5 sm:px-7 py-6 space-y-4"
      >
        {hasEssence && (
          <>
            <div className="flex items-center gap-4 rounded-xl p-4 ring-1 ring-white/10" style={{ background: VELVET }}>
              <ArchetypeSymbol archetypeId={archetypeCode.slice(0, 2)} subcategoryId={archetypeCode.slice(2, 3) || null} size={56} animated={false} />
              <div className="min-w-0">
                <p style={{ ...PIXEL, color: archetypeColor }} className="text-3xl leading-none">
                  {archetypeCode}
                </p>
                <p className="mt-1 font-semibold" style={{ color: PAPER }}>
                  {essenceArchetype!.archetype_name} {essenceArchetype!.subcategory_name}
                </p>
              </div>
            </div>
            <div className="rounded-xl p-4 sm:p-5 ring-1 ring-pink-400/25 bg-pink-500/[0.06]">
              <h3 className="font-semibold text-pink-200">
                {t('oracle.yourEssence')} ({getEssenceLabel(essencePersonality?.arquetipo_primario, essencePersonality?.arquetipo_secundario, isPtLang ? 'pt' : 'en')})
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                {essenceArchetype!.archetype_description}
              </p>
            </div>
            <div className="rounded-xl p-4 sm:p-5 ring-1 ring-sky-400/25 bg-sky-500/[0.06]">
              <h3 className="font-semibold text-sky-200">
                {t('oracle.yourAttunement')} ({getSubcategoryName(essenceArchetype!.subcategory_name, isPtLang ? 'pt' : 'en')})
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
                {essenceArchetype!.subcategory_description}
              </p>
            </div>
          </>
        )}
      </OracleSheet>

      {/* A Arquitetura da Alma — como a essência é calculada */}
      <OracleSheet
        open={showEssenceInfo && !!essencePersonality}
        onClose={() => setShowEssenceInfo(false)}
        title={t('oracle.architectureTitle')}
        subtitle={t('oracle.architectureIntro')}
        size="lg"
        escapeEnabled={!showRetakeQuizModal}
        bodyClassName="px-5 sm:px-7 py-6 space-y-4"
      >
        {essencePersonality && (
          <>
            <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
              <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
                <span style={PIXEL} className="text-lg text-violet-300">
                  1
                </span>
                {t('oracle.theEssence')} ({getEssenceLabel(essencePersonality.arquetipo_primario, essencePersonality.arquetipo_secundario, isPtLang ? 'pt' : 'en')})
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
                {t('oracle.essenceProfileText', { profile: `${essencePersonality.arquetipo_primario}${essencePersonality.arquetipo_secundario}` })}
              </p>
              <div className="mt-3 grid sm:grid-cols-2 gap-2">
                <div className="rounded-lg p-3 bg-black/25">
                  <p className="text-xs font-semibold" style={{ color: PAPER }}>
                    {t('oracle.essenceLogicLabel')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: MIST }}>
                    {t('oracle.essenceLogicText')}
                  </p>
                </div>
                <div className="rounded-lg p-3 bg-black/25">
                  <p className="text-xs font-semibold" style={{ color: PAPER }}>
                    {t('oracle.essenceResultLabel')}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: MIST }}>
                    {t('oracle.essenceResultText')}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
              <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
                <span style={PIXEL} className="text-lg text-amber-300">
                  2
                </span>
                {t('oracle.theAttunement')} ({getSubcategoryName(essenceArchetype?.subcategory_name, isPtLang ? 'pt' : 'en')})
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: MIST }}>
                {t('oracle.subarchetypeText', { id: essencePersonality.subcategoria_id })}
              </p>
              <p className="mt-3 text-xs" style={{ color: MIST }}>
                {t('oracle.axesListTitle')}
              </p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {[
                  { a: t('oracle.axisRadiant'), b: t('oracle.axisShadowy'), desc: t('oracle.axisOptimismMelancholy'), ca: '#fbbf24', cb: '#a78bfa' },
                  { a: t('oracle.axisClassic'), b: t('oracle.axisExperimental'), desc: t('oracle.axisTraditionBoldness'), ca: '#f87171', cb: '#60a5fa' },
                  { a: t('oracle.axisDense'), b: t('oracle.axisLight'), desc: t('oracle.axisComplexityAccessibility'), ca: '#F3EAD3', cb: '#34d399' },
                ].map((row) => (
                  <li key={row.a} className="flex items-start gap-2" style={{ color: MIST }}>
                    <span aria-hidden>•</span>
                    <span>
                      <span className="font-semibold" style={{ color: row.ca }}>
                        {row.a}
                      </span>
                      {' vs. '}
                      <span className="font-semibold" style={{ color: row.cb }}>
                        {row.b}
                      </span>
                      {' — '}
                      {row.desc}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl p-4 sm:p-5 ring-1 ring-white/10" style={{ background: VELVET }}>
              <h3 className="flex items-baseline gap-2 font-semibold" style={{ color: PAPER }}>
                <span style={PIXEL} className="text-lg text-sky-300">
                  3
                </span>
                {t('oracle.theGraph')}
              </h3>
              <div className="mt-4 flex justify-center">
                <PentagonGraph points={spectrumPoints} subcategoryId={essencePersonality.personalidade_completa || ''} />
              </div>
              <div className="mt-4 flex justify-center">
                <button onClick={() => setShowRetakeQuizModal(true)} className={ghostButton} style={{ color: PAPER }}>
                  <RefreshCw className="w-[18px] h-[18px] text-sky-300" aria-hidden />
                  {t('oracle.retakeQuiz')}
                </button>
              </div>
            </div>
          </>
        )}
      </OracleSheet>

      <ConfirmationModal
        isOpen={showRetakeQuizModal}
        onClose={() => setShowRetakeQuizModal(false)}
        onConfirm={async () => {
          setShowEssenceInfo(false);
          await supabase.from('profiles').update({ subcategoria_id: null }).eq('id', session?.user?.id);
          refetchProfileData();
        }}
        title={t('oracle.retakeQuizTitle')}
        message={t('oracle.retakeQuizConfirm')}
        confirmLabel={t('oracle.retakeQuiz')}
      />

      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

      <AllMoviesModal
        isOpen={countryMoviesModal.isOpen}
        onClose={() => setCountryMoviesModal({ isOpen: false, title: '', movies: [] })}
        title={countryMoviesModal.title}
        movies={countryMoviesModal.movies}
        rating={null}
      />

      {gemMovie && <MovieDetailsModal movie={gemMovie} isOpen={true} onClose={() => setGemMovie(null)} />}
    </div>
  );
}
