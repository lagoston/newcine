import React from 'react';
import { frames, type FrameId } from '../../lib/frames';
import { GhostRiderFrame } from '../GhostRiderFrame';
import { KitFrame, type KitFrameId } from './KitFrame';

// As molduras que são componente (11/11/2026): o Motoqueiro Fantasma (giro
// para a caveira) e os quatro kits da Cobra (cada um com a sua segunda
// face). Quem desenha avatar pergunta frameUsesComponent() e, se vier algo,
// usa este componente no lugar da foto com a classe da moldura.

interface FlipFrameProps {
  frameId: string;
  src: string;
  alt?: string;
  size: number;
  className?: string;
}

export const FlipFrame: React.FC<FlipFrameProps> = ({ frameId, src, alt = '', size, className = '' }) => {
  const frame = frames[frameId as FrameId];
  if (frame && 'component' in frame && frame.component === 'KitFrame') {
    return <KitFrame kit={frame.id as KitFrameId} src={src} alt={alt} size={size} className={className} />;
  }
  return <GhostRiderFrame src={src} alt={alt} size={size} className={className} />;
};

export default FlipFrame;
