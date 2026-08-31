import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Layout, Crown, Lock, Check, User, Film } from 'lucide-react';
import GlassLoader from './GlassLoader';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { frames, FrameId } from '../lib/frames';
import { THEME_TAGS } from '../lib/tags';
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

type TabType = 'frames' | 'banners' | 'cards';

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

const CustomizeModal: React.FC<CustomizeModalProps> = ({ isOpen, onClose, onSave }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const { session, isPremium } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('frames');
  const [loading, setLoading] = useState(true);
  // themeTagProgress é a ÚNICA parte do antigo sistema de tags que
  // continua aqui — molduras, banners e cards têm requisitos de tags
  // temáticas específicas (ex: moldura "Bloody Mary" exige a tag de
  // mesmo nome) pra desbloquear. O resto do sistema (categorias, ativar
  // tag, cores, progresso detalhado) mudou de casa pro modal "Tag Pins",
  // aberto direto do Profile — ficaria redundante manter os dois.
  const [themeTagProgress, setThemeTagProgress] = useState<Record<string, number>>({});
  const [selectedFrame, setSelectedFrame] = useState<FrameId>('default');
  const [selectedBanner, setSelectedBanner] = useState<BannerId>('default');
  const [selectedCard, setSelectedCard] = useState<CardStyle>('default');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [frozenAvatarUrl, setFrozenAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    if (session?.user?.id && isOpen) {
      const t0 = performance.now();
      console.log('[CustomizeModal] abrindo, iniciando carregamento…', { userId: session.user.id, timestamp: t0 });
      setLoading(true);
      Promise.all([
        fetchProfile(),
        fetchThemeTagProgress()
      ])
        .catch((err) => console.error('[CustomizeModal] erro ao carregar dados', err))
        .finally(() => {
          const t1 = performance.now();
          console.log('[CustomizeModal] carregamento concluído, loading=false', { duracaoMs: Math.round(t1 - t0) });
          setLoading(false);
        });
    }
  }, [session?.user?.id, isOpen]);

  // Log de diagnóstico — mostra toda vez que `loading` muda de valor. Se o
  // flick persistir mesmo com o corpo inteiro protegido, esse log revela
  // se `loading` está alternando MAIS de uma vez (true→false→true→false),
  // o que apontaria pra causa diferente (efeito duplicado, StrictMode,
  // remontagem do componente) em vez de só "dados chegando aos poucos".
  useEffect(() => {
    console.log('[CustomizeModal] loading mudou para:', loading, { timestamp: performance.now() });
  }, [loading]);

  useEffect(() => {
    console.log('[CustomizeModal] isOpen mudou para:', isOpen);
  }, [isOpen]);

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
        .select('avatar_frame, banner, card_style, avatar_url, username')
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
      setUsername(data?.username || '');
    } catch (error) {
      console.error('Error fetching profile:', error);
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

  if (!isOpen) return null;

  const tabs = [
    { id: 'frames', label: t('customize.tabs.avatars'), icon: ImageIcon },
    { id: 'banners', label: t('customize.tabs.banners'), icon: Layout },
    { id: 'cards', label: t('customize.tabs.cards'), icon: Film }
  ];

  const renderFrameContent = () => {
    const defaultFrame = frames.default;
    const otherFrames = Object.values(frames).filter(frame => frame.id !== 'default');

    const avatarPreview = (extraClassName: string) => (
      <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden shadow-xl flex-shrink-0 ${extraClassName}`}>
        {frozenAvatarUrl ? (
          <img src={frozenAvatarUrl} alt="" className="w-full h-full object-cover" />
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

    // Mesma técnica de pausar animação via CSS de verdade que já usamos nas
    // molduras — pseudo-elementos (::before/::after) não respeitam estilo inline.
    const bannerAnimClass = 'banner-preview-anim';
    const pauseAnimationCss = `
      .banner-preview-anim,
      .banner-preview-anim::before,
      .banner-preview-anim::after {
        animation-play-state: paused !important;
      }
      .banner-preview-anim:hover,
      .banner-preview-anim:hover::before,
      .banner-preview-anim:hover::after {
        animation-play-state: running !important;
      }
    `;

    // Mini simulação de como o cabeçalho do perfil fica em cima do banner —
    // com o avatar e nome de usuário reais, não só o nome do banner escrito.
    const profileMockup = (
      <div className="relative z-10 flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/70 shadow-lg flex-shrink-0">
          {frozenAvatarUrl ? (
            <img src={frozenAvatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
        </div>
        <span className="text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          @{username || 'you'}
        </span>
      </div>
    );

    return (
      <div>
        <style>{pauseAnimationCss}</style>
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
              <div className="relative bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 rounded-2xl h-28 w-full flex items-center px-4">
                {profileMockup}
                <span className="absolute top-2 right-3 text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                  {defaultBanner.name}
                </span>
              </div>
              {selectedBanner === defaultBanner.id && (
                <div className="absolute top-2 left-2 bg-blue-500 text-white p-1 rounded-full z-10">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </button>
          </motion.div>

          {otherBanners.map((banner, index) => {
            const isPremiumLocked = banner.isPremium && !isPremium;
            const requiredThemeTag = banner.requiredTag ? THEME_TAGS.find(t => t.id === banner.requiredTag) : null;
            const requiredTagProgress = banner.requiredTag ? (themeTagProgress[banner.requiredTag] || 0) : 0;
            const requiredTagCount = requiredThemeTag?.condition.count || 0;
            const requiredTagMet = !banner.requiredTag || requiredTagProgress >= requiredTagCount;
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
                  <div className={`rounded-2xl h-28 w-full flex items-center px-4 ${banner.className} ${bannerAnimClass}`}>
                    {profileMockup}
                    <span className="absolute top-2 right-3 text-[10px] font-bold text-white/70 uppercase tracking-wide drop-shadow z-10">
                      {banner.name}
                    </span>
                  </div>
                  {isLocked && (
                    <div className="absolute top-2 left-2 z-10">
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
                    <div className="absolute top-2 left-2 bg-blue-500 text-white p-1 rounded-full z-10">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  {isLocked && !isPremiumLocked && requiredThemeTag && (
                    <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 z-10">
                      <p className="text-[10px] text-white text-center font-medium truncate">
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          onClick={onClose}
        />
        <div className="flex min-h-full items-start justify-center p-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 relative z-[101]">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-4xl max-h-[calc(100dvh-env(safe-area-inset-top)-4rem)] flex flex-col bg-white/90 dark:bg-gray-800/90 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/20 dark:border-gray-700/50 overflow-hidden"
          >
            <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
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

            {/* Corpo com scroll PRÓPRIO — antes, o motion.div inteiro (sem
                nenhum limite de altura) crescia livremente pra caber TODO
                o conteúdo (cabeçalho + abas + grade + rodapé de botões),
                sem overflow interno, empurrando o modal inteiro pra além
                da viewport — daí o tamanho "indecente" mesmo em telas
                grandes, e o modal cobrindo/vazando por cima da navbar.
                Agora o container principal tem um teto real de altura
                (calc(100dvh - área segura - respiro)), cabeçalho e rodapé
                nunca encolhem (flex-shrink-0), e só o MEIO rola quando o
                conteúdo é maior que o espaço disponível. */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* AnimatePresence com key própria pra essa troca específica
                  — antes, a troca loading→carregado era um swap instantâneo
                  de React (sem nenhuma animação explícita), e a suavização
                  que aparecia no desktop vinha só do reflow natural do
                  navegador (via transition-all da classe do modal). Esse
                  reflow implícito se comporta de forma diferente em mobile
                  — combinado com unidades dvh (que recalculam conforme a
                  barra de endereço do navegador mobile aparece/some), o
                  resultado ali era abrupto (sumiço + reaparecimento) em vez
                  de suave. Com fade explícito e determinístico, o
                  comportamento fica igual em qualquer aparelho, sem
                  depender de como cada navegador decide suavizar sozinho. */}
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="h-full min-h-[400px] flex items-center justify-center"
                  >
                    <GlassLoader size="lg" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="loaded-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                  <div className="grid grid-cols-3 gap-1.5 sm:flex sm:gap-2 border-b border-gray-200/50 dark:border-gray-700/50 mb-6 pb-2">
                    {tabs.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-0 sm:flex-shrink-0 sm:whitespace-nowrap px-1.5 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-sm font-medium rounded-xl transition-all ${
                          activeTab === id
                            ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                        }`}
                      >
                        <Icon className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                        <span className="truncate max-w-full">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="min-h-[400px]">
                    {activeTab === 'frames' && renderFrameContent()}
                    {activeTab === 'banners' && renderBannerContent()}
                    {activeTab === 'cards' && renderCardContent()}
                  </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-shrink-0 flex justify-end gap-4 p-6 border-t border-gray-200/50 dark:border-gray-700/50">
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