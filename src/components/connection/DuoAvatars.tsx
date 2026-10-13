import React from 'react';
import UserAvatar, { type AvatarUser } from '../UserAvatar';
import { NIGHT } from '../../lib/oracleTheme';

// Você e a outra pessoa, lado a lado (13/10/2026): o seu avatar à esquerda,
// o dela por cima, um pouco sobreposto. Cada um num aro da cor da noite,
// para a moldura de um não "encostar" na do outro.

interface DuoAvatarsProps {
  me: AvatarUser | null;
  other: AvatarUser;
  size?: number;
  className?: string;
}

const DuoAvatars: React.FC<DuoAvatarsProps> = ({ me, other, size = 36, className = '' }) => {
  // Espaço do aro: a moldura (ring) desenha 2px para fora do avatar.
  const pad = Math.max(3, Math.round(size / 14));
  const overlap = Math.round(size * 0.3);
  const ring = (user: AvatarUser) => (
    <span className="relative block rounded-full shrink-0" style={{ padding: pad, background: NIGHT }}>
      <UserAvatar user={user} size={size} />
    </span>
  );
  return (
    <span className={`relative inline-flex items-center shrink-0 ${className}`} aria-hidden>
      {ring(me ?? {})}
      <span style={{ marginLeft: -overlap }}>{ring(other)}</span>
    </span>
  );
};

export default DuoAvatars;
