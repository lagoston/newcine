import React from 'react';
import { useTranslation } from 'react-i18next';
import { User, Users, Calendar, Crown, Loader2 } from 'lucide-react';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import { getBannerClass } from '../lib/banners';
import { getTextEffectNameClass, getTextEffectSecondaryClass } from '../lib/textEffects';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, tagCategoryStyle } from '../lib/oracleTheme';
import type { SeasonalEventId } from '../lib/seasonalEvents';
import { AvatarSeasonalAccessory, ProfileSeasonalScene, SeasonalCountdown } from './seasonal/SeasonalDecor';

// Cartão de identidade de um perfil — o mesmo no seu Perfil e no perfil
// de outra pessoa (Comunidade). Mostra banner, moldura, efeito de texto,
// tag ativa, bio, amigos e data de entrada; quem usa decide as ações
// (botões abaixo) e o que fica no canto (configurações, por exemplo).

// Botão "fantasma" padrão dos cartões de perfil.
export const PROFILE_GHOST_BUTTON = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 bg-black/20 hover:bg-white/10 backdrop-blur-sm text-sm font-medium transition ${FOCUS_RING}`;
// Ação principal (gradiente da marca).
export const PROFILE_PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white text-sm font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-60 ${FOCUS_RING}`;

export interface ProfileActiveTag {
  emoji: string;
  name: string;
  category: string;
}

interface ProfileIdentityCardProps {
  username: string;
  avatarUrl: string | null;
  avatarFrame?: string | null;
  banner?: string | null;
  textEffect?: string | null;
  isPremium: boolean;
  // Resenhas reais do DONO do perfil — decidem se o efeito de texto dele
  // está desbloqueado.
  realReviewCount?: number;
  activeTag?: ProfileActiveTag | null;
  bio?: string | null;
  friendsCount: number;
  joinedAt?: string | null;
  onFriendsClick?: () => void;
  // Canto superior direito (ex.: engrenagem de configurações).
  topRight?: React.ReactNode;
  // Enviando uma foto nova: mostra um carregando no lugar do avatar.
  avatarBusy?: boolean;
  // Selo sobre o avatar (ex.: câmera no modo de edição).
  avatarBadge?: React.ReactNode;
  // Quando presente, substitui nome/bio/amigos (formulário de edição).
  editor?: React.ReactNode;
  actions?: React.ReactNode;
  // Perfil decorado de Halloween ou Natal (dono usando 🎃 Pumpkin Head ou
  // 🎅 Ho Ho Ho). Quem calcula é useTagDecoration.
  seasonalDecoration?: SeasonalEventId | null;
}

const ProfileIdentityCard: React.FC<ProfileIdentityCardProps> = ({
  username,
  avatarUrl,
  avatarFrame,
  banner,
  textEffect,
  isPremium,
  realReviewCount = 0,
  activeTag = null,
  bio = null,
  friendsCount,
  joinedAt = null,
  onFriendsClick,
  topRight,
  avatarBusy = false,
  avatarBadge,
  editor,
  actions,
  seasonalDecoration = null,
}) => {
  const { t, i18n } = useTranslation();

  const bannerClass = getBannerClass(banner || undefined, isPremium);
  const nameEffectClass = getTextEffectNameClass(textEffect || undefined, isPremium, realReviewCount);
  const secondaryEffectClass = getTextEffectSecondaryClass(textEffect || undefined, isPremium, realReviewCount);
  // Efeitos com fonte própria (Typewriter) mantêm a fonte deles; os demais
  // usam a Pixelify, como todo título do site.
  const nameStyle = nameEffectClass.includes('font-[') ? undefined : PIXEL;
  const rawFrameClass = getFrameClass(avatarFrame || undefined, isPremium);
  const frameClass = !rawFrameClass || rawFrameClass === 'ring-0' ? 'ring-2 ring-white/15' : rawFrameClass;
  const joinedLabel = joinedAt ? new Date(joinedAt).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }) : null;

  return (
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
      {seasonalDecoration && <ProfileSeasonalScene eventId={seasonalDecoration} />}
      <div className="relative z-10 p-5 sm:p-8">
        {topRight && <div className="absolute top-3 right-3 sm:top-5 sm:right-5">{topRight}</div>}

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-7">
          {/* Avatar (com a moldura escolhida) */}
          <div className="relative mx-auto sm:mx-0 shrink-0">
            {!avatarBusy && avatarUrl && frameUsesComponent(avatarFrame || undefined, isPremium) === 'GhostRiderFrame' ? (
              <GhostRiderFrame src={avatarUrl} alt={username} size={120} />
            ) : (
              <div className={`w-[120px] h-[120px] rounded-full overflow-hidden ${frameClass}`} style={{ background: NIGHT }}>
                {avatarBusy ? (
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
            {seasonalDecoration && !avatarBusy && <AvatarSeasonalAccessory eventId={seasonalDecoration} size={120} />}
            {avatarBadge}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left" style={{ color: MIST }}>
            {editor ?? (
              <>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-2 sm:pr-14" style={{ color: PAPER }}>
                  <h1 className={`text-[2rem] sm:text-5xl leading-none break-all ${nameEffectClass}`} style={nameStyle}>
                    @{username}
                  </h1>
                  {isPremium && <Crown className="w-6 h-6 shrink-0 text-amber-300" aria-label={t('settings.premium')} />}
                </div>
                {activeTag && (
                  <span className={`mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-medium ${tagCategoryStyle(activeTag.category).pill}`}>
                    <span aria-hidden>{activeTag.emoji}</span>
                    {activeTag.name}
                  </span>
                )}
                {bio && <p className={`mt-3 max-w-2xl mx-auto sm:mx-0 text-[15px] leading-relaxed ${secondaryEffectClass}`}>{bio}</p>}
                <div className={`mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-x-4 gap-y-1 text-sm ${secondaryEffectClass}`}>
                  {onFriendsClick ? (
                    <button
                      onClick={onFriendsClick}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-1 -mx-1 hover:underline underline-offset-4 ${FOCUS_RING}`}
                    >
                      <Users className="w-4 h-4" aria-hidden />
                      <span style={PIXEL} className="text-base">
                        {friendsCount}
                      </span>
                      {t('profile.friendsLabel', { defaultValue: 'Amigos' })}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="w-4 h-4" aria-hidden />
                      <span style={PIXEL} className="text-base">
                        {friendsCount}
                      </span>
                      {t('profile.friendsLabel', { defaultValue: 'Amigos' })}
                    </span>
                  )}
                  {joinedLabel && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" aria-hidden />
                      {t('profile.joined', { date: joinedLabel })}
                    </span>
                  )}
                </div>
                {seasonalDecoration && (
                  <div className="mt-4 flex justify-center sm:justify-start">
                    <SeasonalCountdown eventId={seasonalDecoration} />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {actions && <div className="mt-6 flex flex-wrap justify-center sm:justify-start gap-2">{actions}</div>}
      </div>
    </div>
  );
};

export default ProfileIdentityCard;
