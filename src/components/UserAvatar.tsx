import React, { useState } from 'react';
import { User } from 'lucide-react';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import { MIST, VELVET } from '../lib/oracleTheme';

// Avatar de alguém com a moldura escolhida (13/10/2026). Antes cada tela
// tinha a própria cópia deste código (FollowersModal, o Match Movie antigo…).
// Sem foto: o ícone de pessoa. A moldura "padrão" vira um aro discreto.

export interface AvatarUser {
  username?: string | null;
  avatar_url?: string | null;
  avatar_frame?: string | null;
  // Uma destas basta para liberar as molduras premium.
  is_premium?: boolean | null;
  plan_type?: string | null;
  lifetime_premium?: boolean | null;
}

export const isAvatarUserPremium = (u: AvatarUser) => Boolean(u.is_premium) || u.plan_type === 'premium' || Boolean(u.lifetime_premium);

interface UserAvatarProps {
  user: AvatarUser;
  size: number;
  className?: string;
  // Sem moldura (ex.: dentro de um selo pequeno).
  plain?: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size, className = '', plain = false }) => {
  const [failed, setFailed] = useState(false);
  const premium = isAvatarUserPremium(user);
  const frameId = user.avatar_frame || undefined;
  const src = !failed ? user.avatar_url || null : null;

  if (!plain && src && frameUsesComponent(frameId, premium) === 'GhostRiderFrame') {
    return <GhostRiderFrame src={src} alt="" size={size} className={`shrink-0 ${className}`} />;
  }
  const raw = plain ? '' : getFrameClass(frameId, premium);
  const frame = !raw || raw === 'ring-0' ? 'ring-2 ring-white/15' : raw;
  return (
    <span
      className={`relative block shrink-0 rounded-full overflow-hidden ${plain ? '' : frame} ${className}`}
      style={{ width: size, height: size, background: VELVET }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full grid place-items-center" style={{ color: MIST }}>
          <User style={{ width: Math.round(size * 0.45), height: Math.round(size * 0.45) }} aria-hidden />
        </span>
      )}
    </span>
  );
};

export default UserAvatar;
