import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Film, MessageCircle, Crown, Palette, Settings, Tag, ArrowRight, Camera, Trash2, Check, Pencil, User } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import { supabase, getProfile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useWhispers } from '../contexts/WhispersContext';
import FollowersModal from '../components/FollowersModal';
import WhispersModal from '../components/WhispersModal';
import CustomizeModal from '../components/CustomizeModal';
import AllMoviesModal from '../components/AllMoviesModal';
import SettingsModal from '../components/SettingsModal';
import TagPinsModal from '../components/TagPinsModal';
import ProfileIdentityCard, { PROFILE_GHOST_BUTTON, PROFILE_PRIMARY_BUTTON } from '../components/ProfileIdentityCard';
import { ProfileStatTiles, ProfileTasteGrid, ProfileSectionHeading, PROFILE_CARD } from '../components/ProfileTaste';
import { summarizeRatings } from '../lib/profileStats';
import ProfileEssence from '../components/ProfileEssence';
import FriendsActivityCarousel from '../components/FriendsActivityCarousel';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cache } from '../lib/cache';
import { useProfileData } from '../hooks/useProfileData';
import { VELVET, SURFACE, SURFACE_VAR, PAPER, MIST, PIXEL, FOCUS_RING, ORACLES } from '../lib/oracleTheme';
import { getBannerTone } from '../lib/banners';
import { useProfileSeasonalDecoration } from '../contexts/SeasonalEventContext';

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
  const [showTagPinsModal, setShowTagPinsModal] = useState(false);

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
    persona,
    personaLoading,
    countryCounts,
    countryAvgRatings,
    movies,
    refetch: refetchProfileData,
  } = useProfileData(session?.user?.id, i18n.language);
  // Perfil decorado pelo evento sazonal (quem completou o Halloween/Natal).
  const seasonalDecoration = useProfileSeasonalDecoration(session?.user?.id, true);

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
  const { counts: ratingCounts, average } = summarizeRatings(ratingDistribution);
  // Os blocos da página (Números, Seu gosto, Essência…) vestem o tom do seu
  // banner — a mesma regra dos perfis da Comunidade (lib/banners.ts).
  const bannerTone = getBannerTone(profile?.banner, isPremium);
  const pageStyle = bannerTone ? ({ [SURFACE_VAR]: bannerTone.surface } as React.CSSProperties) : undefined;

  return (
    <div className="min-h-screen pb-16" style={pageStyle}>
      {/* ---------- Cartão de identidade ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
        <ProfileIdentityCard
          username={username}
          avatarUrl={avatarUrl || null}
          avatarFrame={profile?.avatar_frame}
          banner={profile?.banner}
          textEffect={profile?.text_effect}
          isPremium={isPremium}
          realReviewCount={realReviewCount}
          activeTag={profile?.active_tag}
          bio={bio}
          friendsCount={friendsCount}
          joinedAt={createdAt}
          onFriendsClick={() => setShowFriendsModal(true)}
          avatarBusy={isUploadingAvatar}
          seasonalDecoration={seasonalDecoration}
          topRight={
            <button
              onClick={() => setShowSettingsModal(true)}
              aria-label={t('settings.title')}
              title={t('settings.title')}
              className={`grid place-items-center w-11 h-11 rounded-full ring-1 ring-white/15 bg-black/25 backdrop-blur-sm hover:bg-white/10 transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <Settings className="w-5 h-5" aria-hidden />
            </button>
          }
          avatarBadge={
            isEditing && !isUploadingAvatar ? (
              <span aria-hidden className="absolute bottom-1 right-1 grid place-items-center w-9 h-9 rounded-full bg-violet-600 ring-4 ring-[#1C1433] text-white">
                <Camera className="w-4 h-4" />
              </span>
            ) : undefined
          }
          editor={
            isEditing ? (
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
            ) : undefined
          }
          actions={
            isEditing ? (
              <>
                <button onClick={handleUpdateProfile} className={PROFILE_PRIMARY_BUTTON}>
                  <Check className="w-[18px] h-[18px]" aria-hidden />
                  {t('profile.saveChanges')}
                </button>
                <button onClick={handleCancelEditing} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              // No celular, grade 2×2 de caixas com a mesma largura (Sussurros
              // e Tags em cima, Personalizar e Editar perfil embaixo); a partir
              // do sm, uma fileira só.
              <div className="w-full grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:w-auto">
                <button
                  onClick={() => setShowWhispersModal(true)}
                  aria-label={unreadWhispers > 0 ? `${t('profile.whispers')} (${unreadWhispers})` : t('profile.whispers')}
                  className={PROFILE_GHOST_BUTTON}
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
                <button onClick={() => setShowTagPinsModal(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
                  <Tag className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                  {t('profile.tagPins', { defaultValue: 'Tags' })}
                </button>
                <button onClick={() => setShowCustomizeModal(true)} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
                  <Palette className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                  {t('profile.customize')}
                </button>
                <button onClick={handleStartEditing} className={PROFILE_GHOST_BUTTON} style={{ color: PAPER }}>
                  <Pencil className="w-[18px] h-[18px] text-violet-300" aria-hidden />
                  {t('profile.editProfile')}
                </button>
                {!isPremium && (
                  <button
                    onClick={() => navigate('/premium')}
                    className={`col-span-2 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#221B36] text-sm font-semibold shadow-lg shadow-amber-900/30 transition ${FOCUS_RING}`}
                  >
                    <Crown className="w-[18px] h-[18px]" aria-hidden />
                    {t('oracle.premium.upgrade')}
                  </button>
                )}
              </div>
            )
          }
        />
      </section>

      {/* ---------- Números ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 mt-4">
        <ProfileStatTiles ratedCount={ratedMoviesCount} watchMinutes={totalWatchTime} />
      </section>

      {/* ---------- Atividade dos amigos ---------- */}
      <section className="mt-12 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <ProfileSectionHeading
            title={t('profile.friendsActivity')}
            hint={followedUsersCarousel.length > 0 ? t('profile.friendsActivityHint') : undefined}
            action={
              <Link
                to="/community"
                className={`inline-flex items-center gap-2 h-11 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
                style={{ color: PAPER }}
              >
                {t('profile.accessCommunity')}
                <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            }
          />
        </div>

        {followedUsersCarousel.length > 0 ? (
          <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-6">
            <FriendsActivityCarousel friends={followedUsersCarousel} />
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
            <div className={`${PROFILE_CARD} flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left`} style={{ background: SURFACE }}>
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
          <ProfileSectionHeading title={t('profile.tasteTitle')} hint={t('profile.tasteHint')} />
          <div className="mt-6">
            {ratedMoviesCount > 0 ? (
              <ProfileTasteGrid
                ratingCounts={ratingCounts}
                average={average}
                favoriteGenres={favoriteGenres}
                favoriteKeywords={favoriteKeywords}
                favoriteDecade={favoriteDecade}
                topDirectors={topDirectors}
                leastKnownGem={leastKnownGem}
                countryCounts={countryCounts}
                countryAvgRatings={countryAvgRatings}
                onViewCountryMovies={handleViewCountryMovies}
              />
            ) : (
              <div className={`${PROFILE_CARD} flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left`} style={{ background: SURFACE }}>
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
                <Link to="/add-movies" className={`shrink-0 ${PROFILE_PRIMARY_BUTTON}`}>
                  {t('library.addMovies')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---------- Essência cinematográfica ---------- */}
      <section className="mt-12 border-t border-white/[0.07] pt-10">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <ProfileSectionHeading title={t('oracle.cinematicEssenceLabel')} />
          <div className="mt-6">
            <ProfileEssence
              isOwn
              loading={personaLoading}
              persona={persona}
              emptyState={
                <div className={`${PROFILE_CARD} flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left`} style={{ background: SURFACE }}>
                  <div className="flex shrink-0" aria-hidden>
                    {ORACLES.map((oracle, i) => (
                      <img
                        key={oracle.id}
                        src={oracle.avatar}
                        alt=""
                        width={44}
                        height={44}
                        className={`w-11 h-11 rounded-full object-cover ${i > 0 ? '-ml-2' : ''}`}
                        style={{ boxShadow: `0 0 0 2px ${SURFACE}, 0 0 0 4px ${oracle.color}` }}
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
                  <Link to="/oracle" className={`shrink-0 ${PROFILE_PRIMARY_BUTTON}`}>
                    {t('oracle.discoverYourEssence')}
                  </Link>
                </div>
              }
            />
          </div>
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
        <TagPinsModal
          isOpen={showTagPinsModal}
          onClose={() => setShowTagPinsModal(false)}
          userId={session.user.id}
          onSave={() => {
            fetchProfile();
          }}
        />
      )}

      <SettingsModal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} />

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
