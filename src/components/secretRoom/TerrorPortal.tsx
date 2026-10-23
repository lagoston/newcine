import React, { useId } from 'react';
import { BLOOD_TEXT, BONE, CANDLE, OXBLOOD } from './terrorTheme';

// O portal do Clube do Terror (23/10/2026): uma espiral à luz de vela que
// gira para dentro, com brasas sendo puxadas para o centro escuro. Aparece
// no perfil de quem usa a Deadly Sleeping (e leva direto ao clube) e, em
// miniatura, no botão do clube no painel de Halloween da home.
// Os movimentos ficam no index.css (terror-portal-*); com "reduzir
// movimento", a espiral fica parada.

const C = 50;

// Um braço da espiral (logarítmica, r = a·e^(bθ)) como uma fita que afina
// nas duas pontas. Girar a espiral no sentido horário faz os braços parecerem
// entrar no centro.
function arm(rotation: number, halfWidth: number, turns = 1.35, a = 2.2, end = 47) {
  const steps = 72;
  const tMax = turns * 2 * Math.PI;
  const b = Math.log(end / a) / tMax;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const th = (i / steps) * tMax;
    const r = a * Math.exp(b * th);
    const taper = Math.min(1, th / (0.5 * Math.PI), (tMax - th) / (0.7 * Math.PI));
    const hw = halfWidth * Math.max(0, taper);
    const ang = th + rotation;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    outer.push(`${(C + r * (1 + hw) * cos).toFixed(2)} ${(C + r * (1 + hw) * sin).toFixed(2)}`);
    inner.push(`${(C + r * (1 - hw) * cos).toFixed(2)} ${(C + r * (1 - hw) * sin).toFixed(2)}`);
  }
  return `M${outer.join(' L')} L${inner.reverse().join(' L')} Z`;
}

const ARMS = [0, 1, 2].map((k) => arm((k * 2 * Math.PI) / 3, 0.17)).join(' ');
const WISPS = [0, 1, 2].map((k) => arm((k * 2 * Math.PI) / 3 + Math.PI / 3, 0.07, 1.2)).join(' ');

// As brasas: ângulo de partida, distância do centro (fração do raio),
// duração e atraso.
const EMBERS = [
  { angle: 10, dist: 0.46, dur: 3.4, delay: 0 },
  { angle: 130, dist: 0.42, dur: 4.1, delay: -1.3 },
  { angle: 250, dist: 0.48, dur: 3.8, delay: -2.6 },
  { angle: 75, dist: 0.4, dur: 4.6, delay: -0.7 },
  { angle: 200, dist: 0.45, dur: 3.1, delay: -2.1 },
  { angle: 310, dist: 0.43, dur: 4.3, delay: -3.4 },
];

export const PortalSpiral: React.FC<{
  size: number;
  // Portal fechado (tem a tag mas não está usando): parado e apagado.
  dormant?: boolean;
  embers?: boolean;
  className?: string;
}> = ({ size, dormant = false, embers = true, className = '' }) => {
  const id = useId().replace(/:/g, '');
  const armFill = `url(#${id}-arm)`;
  return (
    <span
      aria-hidden
      className={`terror-portal relative block shrink-0 rounded-full ${dormant ? 'is-dormant' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        // o disco se desfaz até a borda, e o halo continua dele (sem anel)
        background: `radial-gradient(circle, #040105 0 13%, rgba(15,8,17,0.96) 24%, rgba(142,27,43,0.6) 50%, rgba(255,181,71,0.2) 70%, rgba(142,27,43,0.12) 86%, rgba(142,27,43,0) 100%)`,
        ['--portal-glow' as string]: dormant ? 'rgba(185,169,180,0.18)' : 'rgba(255,181,71,0.42)',
        ['--portal-blood' as string]: dormant ? 'rgba(142,27,43,0.18)' : 'rgba(142,27,43,0.55)',
        // o halo acompanha o tamanho (no botão pequeno da home, não transborda)
        ['--pg1' as string]: `${Math.round(size * 0.19)}px`,
        ['--pg2' as string]: `${Math.round(size * 0.4)}px`,
        ['--pg2s' as string]: `${Math.round(size * 0.07)}px`,
      }}
    >
      {/* o brilho que gira por baixo dos braços */}
      <span
        className="terror-portal-shimmer absolute inset-[6%] rounded-full"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${dormant ? 'rgba(185,169,180,0.25)' : 'rgba(255,181,71,0.55)'} 40deg, transparent 110deg, ${dormant ? 'rgba(142,27,43,0.2)' : 'rgba(238,114,114,0.45)'} 190deg, transparent 260deg, ${dormant ? 'rgba(185,169,180,0.2)' : 'rgba(255,181,71,0.35)'} 320deg, transparent 360deg)`,
          WebkitMaskImage: 'radial-gradient(circle, transparent 22%, #000 38%, #000 58%, transparent 70%)',
          maskImage: 'radial-gradient(circle, transparent 22%, #000 38%, #000 58%, transparent 70%)',
          filter: 'blur(1.5px)',
        }}
      />
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <radialGradient id={`${id}-arm`} cx="50" cy="50" r="48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={OXBLOOD} stopOpacity="0" />
            <stop offset="0.18" stopColor={BLOOD_TEXT} stopOpacity={dormant ? 0.35 : 0.85} />
            <stop offset="0.55" stopColor={dormant ? '#B9A9B4' : CANDLE} stopOpacity={dormant ? 0.55 : 1} />
            <stop offset="0.82" stopColor={dormant ? '#B9A9B4' : CANDLE} stopOpacity={dormant ? 0.25 : 0.55} />
            <stop offset="1" stopColor={CANDLE} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-core`} cx="50" cy="50" r="13" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#000" />
            <stop offset="0.7" stopColor="#0A0408" />
            <stop offset="1" stopColor={OXBLOOD} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="terror-portal-wisps" style={{ transformOrigin: '50px 50px' }}>
          <path d={WISPS} fill={armFill} opacity={0.5} />
        </g>
        <g className="terror-portal-arms" style={{ transformOrigin: '50px 50px' }}>
          <path d={ARMS} fill={armFill} />
        </g>
        <circle cx="50" cy="50" r="13" fill={`url(#${id}-core)`} />
        <circle className="terror-portal-rim" cx="50" cy="50" r="7.5" fill="none" stroke={dormant ? '#B9A9B4' : CANDLE} strokeWidth="0.9" opacity={dormant ? 0.25 : 0.55} />
      </svg>
      {embers && !dormant && (
        <span className="absolute inset-0">
          {EMBERS.map((e, i) => (
            <span key={i} className="absolute left-1/2 top-1/2 w-0 h-0" style={{ transform: `rotate(${e.angle}deg)` }}>
              <span
                className="terror-portal-ember absolute block rounded-full"
                style={{
                  width: Math.max(2, size * 0.035),
                  height: Math.max(2, size * 0.035),
                  marginLeft: -Math.max(1, size * 0.0175),
                  marginTop: -Math.max(1, size * 0.0175),
                  background: i % 2 ? BONE : CANDLE,
                  boxShadow: `0 0 ${Math.round(size * 0.06)}px ${CANDLE}`,
                  ['--ember-from' as string]: `${Math.round(size * e.dist)}px`,
                  animationDuration: `${e.dur}s`,
                  animationDelay: `${e.delay}s`,
                }}
              />
            </span>
          ))}
        </span>
      )}
    </span>
  );
};
