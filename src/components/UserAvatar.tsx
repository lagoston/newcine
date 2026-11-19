import React, { useState } from 'react';
import { User } from 'lucide-react';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { FlipFrame } from './kitFrames/FlipFrame';
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
  // Moldura parada (sem animação). Por padrão, parada nos avatares pequenos
  // (listas) e viva nos grandes; passe true/false para decidir na mão.
  still?: boolean;
}

// 18/11/2026 (Reborn, bateria A6): até este tamanho o avatar é "de lista" e a
// moldura fica parada. Doze avatares com moldura animada numa lista custavam
// mais que a home inteira (822 ms de CPU por segundo, 266 só de recálculo de
// estilo, medido na auditoria); paradas, 0 (medido: 12 molduras, nenhuma
// animação rodando). A moldura continua viva onde ela é a estrela:
// o cartão do perfil e os avatares grandes. Parada = a classe .co-still, que
// aplica as mesmas regras de "reduzir movimento" (ver lib/motion.ts).
const STILL_UP_TO = 44;

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size, className = '', plain = false, still }) => {
  const [failed, setFailed] = useState(false);
  const premium = isAvatarUserPremium(user);
  const frameId = user.avatar_frame || undefined;
  const src = !failed ? user.avatar_url || null : null;
  const calm = (still ?? size <= STILL_UP_TO) ? 'co-still' : '';

  // Molduras com segunda face (Motoqueiro e os kits da Cobra, 11/11/2026).
  if (!plain && src && frameId && frameUsesComponent(frameId, premium)) {
    return <FlipFrame frameId={frameId} src={src} alt="" size={size} className={`shrink-0 ${calm} ${className}`} />;
  }
  const raw = plain ? '' : getFrameClass(frameId, premium);
  const frame = !raw || raw === 'ring-0' ? 'ring-2 ring-white/15' : raw;
  return (
    <span
      className={`relative block shrink-0 rounded-full overflow-hidden ${plain ? '' : `${frame} ${calm}`} ${className}`}
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
