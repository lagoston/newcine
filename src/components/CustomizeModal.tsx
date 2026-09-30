import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Layout, Crown, Lock, Unlock, Check, User, Film, Type, Palette } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { frames, FrameId, getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import { THEME_TAGS, PROGRESSION_TAGS } from '../lib/tags';
import { fetchTagProgress } from '../lib/tagProgress';
import { banners, BannerId, getBannerClass } from '../lib/banners';
import { textEffects, TextEffectId, meetsTextEffectRequirement, getTextEffectNameClass } from '../lib/textEffects';
import { useTranslation } from 'react-i18next';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

interface CustomizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

type TabType = 'frames' | 'banners' | 'cards' | 'textEffects';

// Estilos das cartas dos oráculos (o que aparece nas recomendações).
type CardStyle = 'default' | 'yugioh' | 'horror';

interface OracleCardStyle {
  id: CardStyle;
  name: string;
  isPremium: boolean;
  requiredTag?: string;
  images: { bogart: string; fincher: string; cypher: string };
}

const ORACLE_CARDS: Record<CardStyle, OracleCardStyle> = {
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    images: {
      bogart: '/assets/BOGART.webp',
      fincher: '/assets/FINCHER.webp',
      cypher: '/assets/CYPHER.webp',
    },
  },
  yugioh: {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    isPremium: true,
    images: {
      bogart: '/assets/BOGART2.webp',
      fincher: '/assets/FINCHER2.webp',
      cypher: '/assets/CYPHER2.webp',
    },
  },
  horror: {
    id: 'horror',
    name: 'Horror',
    isPremium: true,
    requiredTag: 'Bloody Mary',
    images: {
      bogart: '/assets/BOGART3.webp',
      fincher: '/assets/FINCHER3.webp',
      cypher: '/assets/CYPHER3.webp',
    },
  },
};

// Resultado do RPC set_user_cosmetic (o servidor valida se o item foi
// realmente desbloqueado antes de gravar).
type CosmeticResult = { success?: boolean } | null;

// As animações das prévias (molduras e banners) ficam PAUSADAS e só rodam
// com o mouse em cima do cartão (ou foco de teclado) — são até 12 animações
// pesadas ao mesmo tempo na tela. Precisa ser CSS de verdade porque
// ::before/::after não obedecem estilo inline. Quem prefere menos
// movimento nunca vê a animação rodando.
const PREVIEW_ANIM_CSS = `
  .cz-anim, .cz-anim::before, .cz-anim::after { animation-play-state: paused !important; }
  .cz-tile:hover .cz-anim, .cz-tile:hover .cz-anim::before, .cz-tile:hover .cz-anim::after,
  .cz-tile:focus-visible .cz-anim, .cz-tile:focus-visible .cz-anim::before, .cz-tile:focus-visible .cz-anim::after {
    animation-play-state: running !important;
  }
  @media (prefers-reduced-motion: reduce) {
    .cz-tile:hover .cz-anim, .cz-tile:hover .cz-anim::before, .cz-tile:hover .cz-anim::after,
    .cz-tile:focus-visible .cz-anim, .cz-tile:focus-visible .cz-anim::before, .cz-tile:focus-visible .cz-anim::after {
      animation-play-state: paused !important;
    }
  }
`;

interface UnlockTagInfo {
  emoji: string;
  name: string;
  requiredCount: number;
}

// Busca info de desbloqueio de uma tag de forma unificada — frames e
// banners referenciam THEME_TAGS pelo id, cards referenciam
// PROGRESSION_TAGS pelo próprio nome (ex.: 'Bloody Mary'); essa função
// resolve os dois casos numa única chamada, pra todas as 4 categorias
// mostrarem exatamente o mesmo formato (emoji + nome + progresso).
const getUnlockTagInfo = (requiredTagName: string | null | undefined): UnlockTagInfo | null => {
  if (!requiredTagName) return null;
  const themeTag = THEME_TAGS.find((tag) => tag.id === requiredTagName || tag.name === requiredTagName);
  if (themeTag) {
    return { emoji: themeTag.emoji, name: themeTag.name, requiredCount: themeTag.condition.count };
  }
  const progressionTag = PROGRESSION_TAGS.find((tag) => tag.name === requiredTagName);
  if (progressionTag) {
    return { emoji: progressionTag.emoji, name: progressionTag.name, requiredCount: progressionTag.minMovies };
  }
  return null;
};

const CustomizeModal: React.FC<CustomizeModalProps> = ({ isOpen, onClose, onSave }) => {
  const { t } = useTranslation();
  const { session, isPremium } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('frames');
  const [loading, setLoading] = useState(true);
  // Progresso das tags que desbloqueiam itens (a carta Horror exige a tag
  // Bloody Mary, a moldura Matrix exige Red-Pill Adept…). O resto do
  // sistema de tags mora no modal "Tags", aberto direto do Perfil.
  const [themeTagProgress, setThemeTagProgress] = useState<Record<string, number>>({});
  const [selectedFrame, setSelectedFrame] = useState<FrameId>('default');
  const [selectedBanner, setSelectedBanner] = useState<BannerId>('default');
  const [selectedCard, setSelectedCard] = useState<CardStyle>('default');
  const [selectedTextEffect, setSelectedTextEffect] = useState<TextEffectId>('default');
  const [realReviewCount, setRealReviewCount] = useState(0);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [frozenAvatarUrl, setFrozenAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  // Item sendo gravado agora — evita clique duplo e mostra o estado no cartão.
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id && isOpen) {
      setLoading(true);
      Promise.all([fetchProfile(), fetchThemeTagProgress(), fetchRealReviewCount()])
        .catch((err) => console.error('[CustomizeModal] erro ao carregar dados', err))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        .select('avatar_frame, banner, card_style, text_effect, avatar_url, username')
        .eq('id', session?.user?.id)
        .single();

      if (error) throw error;
      if (data?.avatar_frame) setSelectedFrame(data.avatar_frame as FrameId);
      if (data?.banner) setSelectedBanner(data.banner as BannerId);
      if (data?.card_style) setSelectedCard(data.card_style as CardStyle);
      if (data?.text_effect) setSelectedTextEffect(data.text_effect as TextEffectId);
      setUserAvatarUrl(data?.avatar_url || null);
      setUsername(data?.username || '');
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  // Contagem de resenhas REAIS (não geradas pelo Oráculo) — mesma
  // fonte de verdade usada pelo modal de Tags pra decidir se Scribbler
  // /Screenwriter/Memoirist estão desbloqueadas.
  const fetchRealReviewCount = async () => {
    if (!session?.user?.id) return;
    try {
      const { count } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_ai_generated', false);
      setRealReviewCount(count || 0);
    } catch (error) {
      console.error('Error fetching real review count:', error);
    }
  };

  // Uma rotina só pras 4 categorias. Antes fazia um UPDATE direto em
  // profiles, sem nenhuma validação no servidor — o botão desabilitado no
  // frontend era a única barreira, contornável via console.
  // set_user_cosmetic valida no servidor se o usuário realmente desbloqueou
  // esse item antes de escrever.
  const applyCosmetic = async (category: 'frame' | 'banner' | 'card' | 'text_effect', cosmeticId: string, onApplied: () => void, successMessage: string) => {
    if (!session?.user?.id || savingKey) return;
    const key = `${category}:${cosmeticId}`;
    setSavingKey(key);
    try {
      const { data, error } = await supabase
        .rpc('set_user_cosmetic', { p_user_id: session.user.id, p_category: category, p_cosmetic_id: cosmeticId })
        .single();

      if (error) throw error;
      if (!(data as CosmeticResult)?.success) {
        toast.error(t('customize.updateError'));
        return;
      }

      onApplied();
      toast.success(successMessage);
      // Propaga a mudança pro Profile IMEDIATAMENTE — o modal não tem mais
      // botão de "Salvar": cada escolha já é gravada na hora.
      onSave?.();
    } catch (error) {
      console.error(`Error updating ${category}:`, error);
      toast.error(t('customize.updateError'));
    } finally {
      setSavingKey(null);
    }
  };

  const handleFrameSelect = (frameId: FrameId) =>
    applyCosmetic('frame', frameId, () => setSelectedFrame(frameId), t('customize.frameUpdated'));
  const handleBannerSelect = (bannerId: BannerId) =>
    applyCosmetic('banner', bannerId, () => setSelectedBanner(bannerId), t('customize.bannerUpdated'));
  const handleCardSelect = (cardStyle: CardStyle) =>
    applyCosmetic('card', cardStyle, () => setSelectedCard(cardStyle), t('customize.cardUpdated'));
  const handleTextEffectSelect = (effectId: TextEffectId) =>
    applyCosmetic('text_effect', effectId, () => setSelectedTextEffect(effectId), t('customize.textEffectUpdated'));

  // Progresso das tags que liberam itens: temáticas pelo id (molduras e
  // banners, ex.: 'red-pill-adept') e básicas pelo nome (carta Horror =
  // 'Bloody Mary'). Mesmo cálculo do modal de Tags (lib/tagProgress.ts).
  const fetchThemeTagProgress = async () => {
    if (!session?.user?.id) return;
    try {
      const progress = await fetchTagProgress(session.user.id);
      setThemeTagProgress({ ...progress.theme, ...progress.basic });
    } catch (error) {
      console.error('Error fetching theme tag progress:', error);
    }
  };

  // Estado de desbloqueio comum a molduras, banners e cartas.
  const lockState = (item: { isPremium: boolean; requiredTag?: string | null }) => {
    const isPremiumLocked = item.isPremium && !isPremium;
    const unlockInfo = getUnlockTagInfo(item.requiredTag);
    const progress = item.requiredTag ? themeTagProgress[item.requiredTag] || 0 : 0;
    const required = unlockInfo?.requiredCount || 0;
    const tagMet = !item.requiredTag || progress >= required;
    return { isPremiumLocked, unlockInfo, progress: Math.min(progress, required || progress), required, tagMet, isLocked: isPremiumLocked || !tagMet };
  };

  // ---- Peças visuais compartilhadas ----
  const tileClass = (selected: boolean, locked: boolean) =>
    `cz-tile group relative w-full rounded-2xl text-left ring-1 transition ${FOCUS_RING} ${
      selected && !locked ? 'ring-2 ring-violet-400/80 bg-violet-500/15' : locked ? 'ring-white/[0.07]' : 'ring-white/10 hover:ring-white/30'
    } ${locked ? 'cursor-not-allowed' : ''}`;
  const tileStyle = (selected: boolean, locked = false): React.CSSProperties => ({ background: selected && !locked ? undefined : VELVET });

  const selectedBadge = (
    <span className="absolute top-2 right-2 z-20 grid place-items-center w-6 h-6 rounded-full bg-violet-500 text-white shadow" aria-hidden>
      <Check className="w-3.5 h-3.5" strokeWidth={3} />
    </span>
  );

  const premiumChip = (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-amber-400 text-[#221B36] text-[11px] font-bold shadow">
      <Crown className="w-3 h-3" aria-hidden />
      Premium
    </span>
  );

  const lockChip = (
    <span className="grid place-items-center w-6 h-6 rounded-full bg-black/60 ring-1 ring-white/20 text-white" aria-hidden>
      <Lock className="w-3 h-3" />
    </span>
  );

  // Faixa "🩸 Bloody Mary · 3/10" com barrinha de progresso.
  const unlockStrip = (info: UnlockTagInfo, progress: number, required: number, met: boolean) => (
    <span className="block w-full">
      <span className="flex items-center justify-center gap-1.5 text-[11px] leading-tight" style={{ color: met ? '#A7F3D0' : MIST }}>
        {met ? <Unlock className="w-3 h-3 shrink-0" aria-hidden /> : <Lock className="w-3 h-3 shrink-0" aria-hidden />}
        <span className="truncate">
          {info.emoji} {info.name}
        </span>
        <span className="shrink-0 tabular-nums">
          {progress}/{required}
        </span>
      </span>
      {!met && required > 0 && (
        <span className="mt-1.5 block h-1 rounded-full bg-white/10 overflow-hidden" aria-hidden>
          <span className="block h-full rounded-full bg-violet-400" style={{ width: `${Math.min(100, (progress / required) * 100)}%` }} />
        </span>
      )}
    </span>
  );

  const ariaLabelFor = (name: string, selected: boolean, locked: boolean, isPremiumLocked: boolean) =>
    [name, selected ? t('customize.inUse') : null, isPremiumLocked ? 'Premium' : locked ? t('customize.locked') : null].filter(Boolean).join(' — ');

  const avatarPlaceholder = (iconClass: string) => (
    <span className="w-full h-full grid place-items-center" style={{ background: NIGHT, color: MIST }}>
      <User className={iconClass} aria-hidden />
    </span>
  );

  // ---- Molduras ----
  const renderFrameContent = () => {
    const ordered = [frames.default, ...Object.values(frames).filter((frame) => frame.id !== 'default')];

    const avatarPreview = (frame: (typeof frames)[FrameId], animate: boolean) => {
      if ('renderType' in frame && frame.renderType === 'component' && frame.component === 'GhostRiderFrame') {
        return <GhostRiderFrame src={frozenAvatarUrl || ''} alt="" size={72} className="shrink-0" />;
      }
      const anim = animate ? 'cz-anim' : '';
      const ring = frame.id === 'default' ? 'ring-2 ring-white/15' : frame.className;
      return (
        <span className={`block w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full overflow-hidden shrink-0 ${ring} ${anim}`} style={{ background: NIGHT }}>
          {/* A classe de animação vai TAMBÉM na foto: algumas molduras animam
              a própria imagem ([&>img]:...), e a regra que pausa só afeta o
              elemento que tem a classe diretamente. */}
          {frozenAvatarUrl ? <img src={frozenAvatarUrl} alt="" className={`w-full h-full object-cover ${anim}`} /> : avatarPlaceholder('w-8 h-8')}
        </span>
      );
    };

    return (
      <>
        <p className="mb-4 text-sm" style={{ color: MIST }}>
          {t('customize.frames.changePhotoHint')}
        </p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {ordered.map((frame) => {
            const state = lockState(frame);
            const selected = selectedFrame === frame.id;
            const busy = savingKey === `frame:${frame.id}`;
            const isLockedNow = state.isLocked;
            return (
              <li key={frame.id}>
                <button
                  onClick={() => !state.isLocked && !selected && handleFrameSelect(frame.id as FrameId)}
                  aria-disabled={state.isLocked || undefined}
                  aria-pressed={selected}
                  aria-busy={busy || undefined}
                  aria-label={ariaLabelFor(frame.name, selected, state.isLocked, state.isPremiumLocked)}
                  className={`${tileClass(selected, state.isLocked)} flex-col justify-start gap-3 px-3 pt-5 pb-3.5 h-full`}
                  style={tileStyle(selected, state.isLocked)}
                >
                  <span className={`grid place-items-center h-24 ${state.isLocked ? 'opacity-50 saturate-50' : ''} ${busy ? 'animate-pulse' : ''}`}>
                    {avatarPreview(frame, frame.id !== 'default')}
                  </span>
                  <span className="block w-full text-center text-[13px] font-medium truncate" style={{ color: PAPER }}>
                    {frame.name}
                  </span>
                  {!state.isPremiumLocked && state.unlockInfo && unlockStrip(state.unlockInfo, state.progress, state.required, state.tagMet)}
                  {selected && !isLockedNow && selectedBadge}
                  {state.isLocked && <span className="absolute top-2 right-2 z-20">{state.isPremiumLocked ? premiumChip : lockChip}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  };

  // ---- Banners ----
  const renderBannerContent = () => {
    const ordered = [banners.default, ...Object.values(banners).filter((banner) => banner.id !== 'default')];

    // Mini simulação de como o cabeçalho do perfil fica em cima do banner —
    // com o avatar e nome de usuário reais.
    const profileMockup = (
      <span className="relative z-10 flex items-center gap-2.5 min-w-0">
        <span className="block w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/70 shadow-lg shrink-0">
          {frozenAvatarUrl ? <img src={frozenAvatarUrl} alt="" className="w-full h-full object-cover" /> : avatarPlaceholder('w-5 h-5')}
        </span>
        <span className="text-sm font-bold text-white truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]" style={PIXEL}>
          @{username || t('customize.you')}
        </span>
      </span>
    );

    return (
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ordered.map((banner) => {
          const state = lockState(banner);
          const selected = selectedBanner === banner.id;
          const busy = savingKey === `banner:${banner.id}`;
          const isLockedNow = state.isLocked;
          const isDefault = banner.id === 'default';
          return (
            <li key={banner.id}>
              <button
                onClick={() => !state.isLocked && !selected && handleBannerSelect(banner.id as BannerId)}
                aria-disabled={state.isLocked || undefined}
                aria-pressed={selected}
                aria-busy={busy || undefined}
                aria-label={ariaLabelFor(banner.name, selected, state.isLocked, state.isPremiumLocked)}
                className={`${tileClass(selected, state.isLocked)} flex-col items-stretch justify-start gap-2.5 p-2 pb-3 h-full`}
                style={tileStyle(selected, state.isLocked)}
              >
                <span
                  className={`relative block h-28 w-full rounded-xl overflow-hidden ${isDefault ? '' : `${banner.className} cz-anim`} ${state.isLocked ? 'opacity-50 saturate-50' : ''} ${busy ? 'animate-pulse' : ''}`}
                  style={
                    isDefault
                      ? { background: `radial-gradient(ellipse 70% 90% at 100% 0%, rgba(139,92,246,0.22), transparent 65%), ${NIGHT}` }
                      : undefined
                  }
                >
                  <span className="absolute inset-0 flex items-center px-4">{profileMockup}</span>
                </span>
                <span className="flex items-center justify-between gap-2 px-1.5">
                  <span className="text-[13px] font-medium truncate" style={{ color: PAPER }}>
                    {banner.name}
                  </span>
                </span>
                {!state.isPremiumLocked && state.unlockInfo && (
                  <span className="px-1.5">{unlockStrip(state.unlockInfo, state.progress, state.required, state.tagMet)}</span>
                )}
                {selected && !isLockedNow && selectedBadge}
                {state.isLocked && <span className="absolute top-4 right-4 z-20">{state.isPremiumLocked ? premiumChip : lockChip}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  // ---- Cartas dos oráculos ----
  const renderCardContent = () => (
    <>
      <p className="mb-4 text-sm" style={{ color: MIST }}>
        {t('customize.cards.oracleCards')}
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.values(ORACLE_CARDS).map((card) => {
          const state = lockState(card);
          const selected = selectedCard === card.id;
          const busy = savingKey === `card:${card.id}`;
          const isLockedNow = state.isLocked;
          return (
            <li key={card.id}>
              <button
                onClick={() => !state.isLocked && !selected && handleCardSelect(card.id)}
                aria-disabled={state.isLocked || undefined}
                aria-pressed={selected}
                aria-busy={busy || undefined}
                aria-label={ariaLabelFor(card.name, selected, state.isLocked, state.isPremiumLocked)}
                className={`${tileClass(selected, state.isLocked)} flex-col items-stretch justify-start gap-3 p-3 pb-3.5 h-full`}
                style={tileStyle(selected, state.isLocked)}
              >
                <span className={`grid grid-cols-3 gap-2 ${state.isLocked ? 'opacity-50 saturate-50' : ''} ${busy ? 'animate-pulse' : ''}`}>
                  {(['bogart', 'fincher', 'cypher'] as const).map((oracle) => (
                    <span key={oracle} className="block aspect-[2/3] rounded-lg overflow-hidden shadow-lg" style={{ background: NIGHT }}>
                      <img src={card.images[oracle]} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    </span>
                  ))}
                </span>
                <span className="px-1 text-[13px] font-medium truncate" style={{ color: PAPER }}>
                  {card.name}
                </span>
                {!state.isPremiumLocked && state.unlockInfo && (
                  <span className="px-1">{unlockStrip(state.unlockInfo, state.progress, state.required, state.tagMet)}</span>
                )}
                {selected && !isLockedNow && selectedBadge}
                {state.isLocked && <span className="absolute top-4 right-4 z-20">{state.isPremiumLocked ? premiumChip : lockChip}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  // ---- Efeitos de texto ----
  // Diferente de frames/banners/cards, aqui cada efeito exige Premium E a
  // sua própria tag de resenha (Typewriter/Scribbler, Technicolor/
  // Screenwriter, Marquee Lights/Memoirist).
  const renderTextEffectsContent = () => {
    const previewName = username ? `@${username}` : `@${t('customize.you')}`;
    const ordered = Object.values(textEffects);

    return (
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ordered.map((effect) => {
          const isDefault = effect.id === 'default';
          const unlocked = meetsTextEffectRequirement(effect.id, isPremium, realReviewCount);
          const isLocked = !unlocked;
          const isPremiumLocked = effect.isPremium && !isPremium;
          const unlockInfo = getUnlockTagInfo(effect.requiredTag);
          const reviewProgress = Math.min(realReviewCount, effect.requiredReviewCount);
          const selected = selectedTextEffect === effect.id;
          const busy = savingKey === `text_effect:${effect.id}`;
          const isLockedNow = isLocked;
          const displayName = isDefault ? t('customize.textEffects.none') : effect.name;
          return (
            <li key={effect.id}>
              <button
                onClick={() => !isLocked && !selected && handleTextEffectSelect(effect.id as TextEffectId)}
                aria-disabled={isLocked || undefined}
                aria-pressed={selected}
                aria-busy={busy || undefined}
                aria-label={ariaLabelFor(displayName, selected, isLocked, isPremiumLocked)}
                className={`${tileClass(selected, isLocked)} flex-col items-stretch justify-start gap-2.5 p-2 pb-3 h-full`}
                style={tileStyle(selected, isLocked)}
              >
                {/* Prévia real — o próprio nome de usuário com o efeito aplicado. */}
                <span
                  className={`grid place-items-center min-h-[76px] px-3 rounded-xl ring-1 ring-white/[0.06] ${isLocked ? 'opacity-60' : ''} ${busy ? 'animate-pulse' : ''}`}
                  style={{ background: NIGHT, color: PAPER }}
                >
                  <span className={`text-xl leading-tight break-all ${effect.nameClassName}`} style={effect.nameClassName.includes('font-[') ? undefined : PIXEL}>
                    {previewName}
                  </span>
                </span>
                <span className="px-1.5 text-[13px] font-medium truncate" style={{ color: PAPER }}>
                  {displayName}
                </span>
                {isDefault ? (
                  <span className="px-1.5 text-[11px]" style={{ color: MIST }}>
                    {t('customize.textEffects.noneDesc')}
                  </span>
                ) : (
                  unlockInfo && <span className="px-1.5">{unlockStrip(unlockInfo, reviewProgress, effect.requiredReviewCount, reviewProgress >= effect.requiredReviewCount)}</span>
                )}
                {selected && !isLockedNow && selectedBadge}
                {isLocked && <span className="absolute top-4 right-4 z-20">{isPremiumLocked ? premiumChip : lockChip}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  // Prévia viva: o cartão do perfil com a moldura, o banner e o efeito de
  // texto escolhidos agora — pra ver as três peças juntas.
  const livePreview = () => {
    const bannerClass = getBannerClass(selectedBanner, isPremium);
    const rawFrame = getFrameClass(selectedFrame, isPremium);
    const frameClass = !rawFrame || rawFrame === 'ring-0' ? 'ring-2 ring-white/15' : rawFrame;
    const nameClass = getTextEffectNameClass(selectedTextEffect, isPremium, realReviewCount);
    return (
      <section aria-label={t('customize.preview')} className="mb-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider" style={{ color: MIST }}>
          {t('customize.preview')}
        </p>
        <div
          className={`relative rounded-2xl ring-1 ring-white/10 overflow-hidden ${bannerClass}`}
          style={bannerClass ? undefined : { background: `radial-gradient(ellipse 70% 90% at 100% 0%, rgba(139,92,246,0.22), transparent 65%), ${VELVET}` }}
        >
          <div className="relative z-10 flex items-center gap-4 px-4 sm:px-6 py-5">
            {frameUsesComponent(selectedFrame, isPremium) === 'GhostRiderFrame' && frozenAvatarUrl ? (
              <GhostRiderFrame src={frozenAvatarUrl} alt="" size={64} className="shrink-0" />
            ) : (
              <span className={`block w-16 h-16 shrink-0 rounded-full overflow-hidden ${frameClass}`} style={{ background: NIGHT }}>
                {frozenAvatarUrl ? <img src={frozenAvatarUrl} alt="" className="w-full h-full object-cover" /> : avatarPlaceholder('w-7 h-7')}
              </span>
            )}
            {/* A cor fica no pai: efeitos como o Technicolor pintam o texto
                com gradiente e precisam do text-transparent intacto. */}
            <span className="min-w-0" style={{ color: PAPER }}>
              <span className={`text-2xl sm:text-3xl leading-none break-all ${nameClass}`} style={nameClass.includes('font-[') ? undefined : PIXEL}>
                @{username || t('customize.you')}
              </span>
            </span>
          </div>
        </div>
      </section>
    );
  };

  const tabs: { id: TabType; label: string; icon: typeof ImageIcon }[] = [
    { id: 'frames', label: t('customize.tabs.avatars'), icon: ImageIcon },
    { id: 'banners', label: t('customize.tabs.banners'), icon: Layout },
    { id: 'cards', label: t('customize.tabs.cards'), icon: Film },
    { id: 'textEffects', label: t('customize.tabs.textEffects'), icon: Type },
  ];

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('customize.title')}
      subtitle={t('customize.subtitle')}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-violet-500/15 ring-1 ring-violet-400/30">
          <Palette className="w-5 h-5 text-violet-300" aria-hidden />
        </span>
      }
      size="xl"
      bodyClassName="px-5 sm:px-7 pb-6"
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className={`h-12 px-6 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
          >
            {t('customize.done')}
          </button>
        </div>
      }
    >
      <style>{PREVIEW_ANIM_CSS}</style>

      {/* Abas — grudadas no topo enquanto a grade rola */}
      <div className="sticky top-0 z-30 -mx-5 sm:-mx-7 px-5 sm:px-7 pt-4 pb-3 mb-4 border-b border-white/[0.07]" style={{ background: NIGHT }}>
        <div role="tablist" aria-label={t('customize.title')} className="grid grid-cols-4 gap-1 p-1 rounded-xl ring-1 ring-white/10" style={{ background: VELVET }}>
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`min-w-0 gap-1.5 h-11 px-1 sm:px-3 rounded-lg text-[13px] sm:text-sm font-medium transition ${FOCUS_RING} ${
                  active ? 'bg-violet-600 text-white shadow' : 'hover:bg-white/[0.06]'
                }`}
                style={active ? { minWidth: 0 } : { color: MIST, minWidth: 0 }}
              >
                <Icon className="hidden sm:block w-4 h-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="h-44 rounded-2xl ring-1 ring-white/[0.07] animate-pulse" style={{ background: VELVET }} />
          ))}
        </ul>
      ) : (
        <div role="tabpanel">
          {activeTab !== 'cards' && livePreview()}
          {activeTab === 'frames' && renderFrameContent()}
          {activeTab === 'banners' && renderBannerContent()}
          {activeTab === 'cards' && renderCardContent()}
          {activeTab === 'textEffects' && renderTextEffectsContent()}
        </div>
      )}
    </OracleSheet>
  );
};

export default CustomizeModal;
