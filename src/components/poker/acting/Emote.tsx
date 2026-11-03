import React from 'react';
import type { Emote as EmoteId } from '../../../lib/poker/client/useDirector';

// Selos em pixel art (05 §4.3): 20 px sobre o retrato. Cada um é uma grade 9×9;
// "#" = cor do selo, "o" = contorno escuro. No estilo Horror, coração e suor
// viram gota de sangue e caveira.

const ART: Record<EmoteId | 'skull' | 'blood', { rows: string[]; color: string }> = {
  excl: { color: '#FFE14D', rows: ['...ooo...', '...o#o...', '...o#o...', '...o#o...', '...o#o...', '...ooo...', '.........', '...o#o...', '...ooo...'] },
  quest: { color: '#9AD8FF', rows: ['..ooooo..', '.o#####o.', '.o#ooo#o.', '....o#o..', '...o#o...', '...ooo...', '.........', '...o#o...', '...ooo...'] },
  dots: { color: '#F3EAD3', rows: ['.........', '.........', '.........', '.........', 'ooooooooo', 'o#oo#oo#o', 'ooooooooo', '.........', '.........'] },
  sweat: { color: '#7FD3FF', rows: ['....o....', '...o#o...', '...o#o...', '..o###o..', '..o###o..', '.o#####o.', '.o##o##o.', '..o###o..', '...ooo...'] },
  vein: { color: '#FF4D5E', rows: ['.oo...oo.', 'o##o.o##o', 'o#o...o#o', '.o.....o.', '.........', '.o.....o.', 'o#o...o#o', 'o##o.o##o', '.oo...oo.'] },
  heart: { color: '#FF6B8A', rows: ['.........', '.oo...oo.', 'o##o.o##o', 'o#######o', 'o#######o', '.o#####o.', '..o###o..', '...o#o...', '....o....'] },
  broken: { color: '#FF6B8A', rows: ['.........', '.oo...oo.', 'o##o.o##o', 'o###o###o', 'o##o####o', '.o##o##o.', '..o#o#o..', '...o#o...', '....o....'] },
  star: { color: '#FFD966', rows: ['....o....', '...o#o...', 'oooo#oooo', 'o#######o', '.o#####o.', '..o###o..', '.o##o##o.', 'o#o...o#o', 'oo.....oo'] },
  hat: { color: '#C9A27A', rows: ['.........', '...ooo...', '..o###o..', '..o###o..', '..o###o..', 'ooooooooo', 'o#######o', 'ooooooooo', '.........'] },
  note: { color: '#E8B4FF', rows: ['....oooo.', '....o##o.', '....o#oo.', '....o#...', '....o#...', '.ooo##...', 'o###o#...', 'o###o....', '.ooo.....'] },
  zzz: { color: '#C9C2E0', rows: ['ooooo....', '...o.....', '..o......', 'ooooo....', '.....oooo', '.......o.', '......o..', '.....oooo', '.........'] },
  skull: { color: '#F3EAD3', rows: ['..ooooo..', '.o#####o.', 'o#######o', 'o#oo#oo#o', 'o#oo#oo#o', 'o#######o', '.o##o##o.', '.o#o#o#o.', '..ooooo..'] },
  blood: { color: '#D0142C', rows: ['....o....', '...o#o...', '...o#o...', '..o###o..', '.o#####o.', '.o#####o.', '.o#####o.', '..o###o..', '...ooo...'] },
};

const Emote: React.FC<{ id: EmoteId; horror?: boolean; className?: string; style?: React.CSSProperties }> = ({ id, horror, className = 'pk-emote', style }) => {
  const key = horror && (id === 'heart' || id === 'broken') ? 'skull' : horror && id === 'sweat' ? 'blood' : id;
  const art = ART[key];
  if (!art) return null;
  return (
    <svg viewBox="0 0 9 9" className={className} style={style} aria-hidden focusable="false" shapeRendering="crispEdges">
      {art.rows.flatMap((row, y) =>
        row.split('').map((ch, x) =>
          ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={ch === '#' ? art.color : '#120d22'} />,
        ),
      )}
    </svg>
  );
};

export default Emote;
