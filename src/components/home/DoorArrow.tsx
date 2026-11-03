import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PAPER, withAlpha } from '../../lib/oracleTheme';

// A seta das portas da home (02/11/2026): um botãozinho redondo de vidro
// escuro com o aro em neon nas cores da porta — as dos três oráculos na
// Biblioteca, as das três prateleiras da pessoa na Persona — e a seta no
// meio. É o que faz a faixa se ler como botão (pedido do Bruno). Ao passar o
// mouse, a seta anda um pouco e o brilho cresce. O Poster Jackpot tem a sua
// própria (posterJackpot/JackpotArrow).
const RING_MASK = 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))';

const DoorArrow: React.FC<{ colors: string[] }> = ({ colors }) => {
  const ring = `conic-gradient(from 210deg, ${colors.join(', ')}, ${colors[0]})`;
  return (
    <span
      aria-hidden
      className="relative grid place-items-center w-9 h-9 lg:w-8 lg:h-8 shrink-0 rounded-full transition-[box-shadow,transform] duration-300 shadow-[0_0_16px_-5px_var(--door-glow)] group-hover:shadow-[0_0_22px_-3px_var(--door-glow)] group-hover:translate-x-0.5"
      style={{ background: 'rgba(10, 8, 22, 0.55)', ['--door-glow' as string]: withAlpha(colors[1] ?? colors[0], 0.85) }}
    >
      <span className="absolute inset-0 rounded-full" style={{ background: ring, WebkitMask: RING_MASK, mask: RING_MASK }} />
      <ArrowRight className="relative w-[17px] h-[17px] lg:w-4 lg:h-4" strokeWidth={2.4} style={{ color: PAPER }} />
    </span>
  );
};

export default DoorArrow;
