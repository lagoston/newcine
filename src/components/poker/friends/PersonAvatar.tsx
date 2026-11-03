import React, { useState } from 'react';

// O rosto de uma pessoa no Pôster Poker (03/11/2026, fase 3): a foto do perfil, ou a
// inicial do nome sobre a cor da placa dela quando não há foto (ou a foto não abre).
const PersonAvatar: React.FC<{ name: string; url: string | null; color?: string; size?: number; className?: string; style?: React.CSSProperties }> = ({
  name,
  url,
  color = '#F5EBD3',
  size = 40,
  className = '',
  style,
}) => {
  const [broken, setBroken] = useState(false);
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    <span className={`pf-avatar ${className}`} style={{ width: size, height: size, '--pc': color, ...style } as React.CSSProperties} aria-hidden>
      {url && !broken ? (
        <img src={url} alt="" draggable={false} decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="pf-avatar-initial" style={{ fontSize: Math.round(size * 0.44) }}>{initial}</span>
      )}
    </span>
  );
};

export default PersonAvatar;
