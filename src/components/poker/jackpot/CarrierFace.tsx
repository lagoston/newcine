import React from 'react';
import { HelpCircle } from 'lucide-react';
import { carrierOf } from './pokerMeta';

// O rosto redondo de um oráculo, com o aro na cor dele. `wanted` põe o aro
// de ouro de quem carrega o prêmio hoje. Rival desconhecido: um "?" neutro.
const CarrierFace: React.FC<{ id: string | null | undefined; size?: number; wanted?: boolean; className?: string; dim?: boolean }> = ({
  id,
  size = 32,
  wanted = false,
  className = '',
  dim = false,
}) => {
  const oracle = carrierOf(id);
  const ring = wanted ? '#F4C454' : oracle?.color ?? 'rgba(255,255,255,0.35)';
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 rounded-full overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        background: '#0B1033',
        boxShadow: `0 0 0 ${wanted ? 2 : 1.5}px ${ring}${wanted ? ', 0 0 12px -2px rgba(244,196,84,0.8)' : ''}`,
        filter: dim ? 'saturate(0.55) brightness(0.8)' : undefined,
      }}
    >
      {oracle ? (
        <img src={oracle.avatar} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <HelpCircle className="w-full h-full p-[18%] text-white/60" />
      )}
    </span>
  );
};

// Os três oráculos sentados em arco, na ordem dos lugares da mesa: o Sapo à
// esquerda, o Raposo no alto, a Cobra à direita. Quem carrega o prêmio de
// hoje ganha o aro de ouro e fica na frente.
export const OracleTrio: React.FC<{ carrier?: string | null; size?: number; className?: string }> = ({ carrier, size = 28, className = '' }) => {
  const step = Math.round(size * 0.68);
  const lift = Math.round(size * 0.22);
  const seats = [
    { id: 'bogart', x: 0, y: lift },
    { id: 'fincher', x: step, y: 0 },
    { id: 'cypher', x: step * 2, y: lift },
  ];
  return (
    <span aria-hidden className={`pe-trio ${className}`} style={{ width: step * 2 + size, height: size + lift }}>
      {seats.map((seat) => (
        <span key={seat.id} style={{ left: seat.x, top: seat.y, zIndex: seat.id === carrier ? 3 : seat.id === 'fincher' ? 2 : 1 }}>
          <CarrierFace id={seat.id} size={size} wanted={seat.id === carrier} />
        </span>
      ))}
    </span>
  );
};

export default CarrierFace;
