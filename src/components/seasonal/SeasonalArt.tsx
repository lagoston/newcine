import React from 'react';

// Desenhos dos eventos sazonais: teia, aranha, morcegos, lua e abóbora
// (Halloween); varal de luzes, neve e gorro (Natal). Tudo decorativo
// (aria-hidden, pointer-events: none). As animações estão em
// src/styles/seasonal.css e param com prefers-reduced-motion.

// Sequência fixa de "aleatórios" (mesma cena em todo carregamento).
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Halloween
// ---------------------------------------------------------------------------

// Teia presa num canto (o de cima à esquerda; flip = à direita).
export const Cobweb: React.FC<{ size?: number; color?: string; flip?: boolean; className?: string; style?: React.CSSProperties }> = ({
  size = 120,
  color = 'rgba(243,234,211,0.32)',
  flip = false,
  className = '',
  style,
}) => {
  const angles = [0, 18, 36, 54, 72, 90].map((a) => (a * Math.PI) / 180);
  const radii = [15, 32, 51, 72, 95];
  const threads = angles.map((a) => `M0 0L${(Math.cos(a) * 104).toFixed(1)} ${(Math.sin(a) * 104).toFixed(1)}`).join('');
  const rings = radii
    .map((r) =>
      angles
        .map((a, i) => {
          const x = (Math.cos(a) * r).toFixed(1);
          const y = (Math.sin(a) * r).toFixed(1);
          if (i === 0) return `M${x} ${y}`;
          const mid = (angles[i - 1] + a) / 2;
          // o fio afunda em direção ao canto entre um raio e outro
          const cx = (Math.cos(mid) * r * 0.8).toFixed(1);
          const cy = (Math.sin(mid) * r * 0.8).toFixed(1);
          return `Q${cx} ${cy} ${x} ${y}`;
        })
        .join(''),
    )
    .join('');
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      className={`pointer-events-none ${className}`}
      style={{ ...style, transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <path d={threads + rings} fill="none" stroke={color} strokeWidth={1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// Aranha descendo por um fio, balançando devagar.
export const HangingSpider: React.FC<{ thread?: number; color?: string; eyes?: string; className?: string; style?: React.CSSProperties }> = ({
  thread = 40,
  color = '#0B0612',
  eyes = '#FF8A1F',
  className = '',
  style,
}) => {
  const legs: string[] = [];
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 4; i += 1) {
      legs.push(`M${side * 2.6} ${-2.2 + i * 1.7}Q${side * 7.5} ${-6.5 + i * 3.2} ${side * 9.6} ${-0.5 + i * 3.4}`);
    }
  });
  return (
    <span aria-hidden className={`co-spider pointer-events-none absolute ${className}`} style={style}>
      <svg width="24" height={thread + 24} viewBox={`0 0 24 ${thread + 24}`}>
        <line x1="12" y1="0" x2="12" y2={thread + 4} stroke="rgba(243,234,211,0.38)" strokeWidth="1" />
        <g transform={`translate(12 ${thread + 11})`}>
          <path d={legs.join('')} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
          <ellipse cx="0" cy="2" rx="4.4" ry="5.4" fill={color} stroke="rgba(255,255,255,0.18)" strokeWidth="0.6" />
          <circle cx="0" cy="-3.6" r="2.8" fill={color} />
          <circle cx="-1.1" cy="-4" r="0.75" fill={eyes} />
          <circle cx="1.1" cy="-4" r="0.75" fill={eyes} />
        </g>
      </svg>
    </span>
  );
};

const BAT_PATH =
  'M35 10C39 6 46 3 58 5C54 8 53 12 54 15C50 12.5 46 13 44 16.5C41 14 38 15 36 19C34.5 17.5 33.5 18.5 32 22' +
  'C30.5 18.5 29.5 17.5 28 19C26 15 23 14 20 16.5C18 13 14 12.5 10 15C11 12 10 8 6 5C18 3 25 6 29 10' +
  'L29.5 6L30.8 8.6L33.2 8.6L34.5 6Z';

export const BatGlyph: React.FC<{ size?: number; color?: string; glow?: string }> = ({ size = 22, color = '#2C1E40', glow }) => (
  <svg
    viewBox="0 0 64 26"
    width={size}
    height={(size * 26) / 64}
    style={glow ? { filter: `drop-shadow(0 0 4px ${glow})` } : undefined}
  >
    <path d={BAT_PATH} fill={color} />
  </svg>
);

// Morcegos atravessando a cena (top em %, duração e atraso em segundos).
export interface BatFlight {
  top: string;
  size: number;
  dur: number;
  delay: number;
  rest?: string;
}

export const BatFlights: React.FC<{ flights: BatFlight[]; color?: string; glow?: string; opacity?: number }> = ({
  flights,
  color,
  glow,
  opacity = 0.8,
}) => (
  <>
    {flights.map((flight, i) => (
      <span
        key={i}
        aria-hidden
        className="co-fly pointer-events-none"
        style={{
          top: flight.top,
          opacity,
          ['--dur' as string]: `${flight.dur}s`,
          ['--delay' as string]: `${flight.delay}s`,
          ['--rest-x' as string]: flight.rest ?? `${20 + i * 25}%`,
        } as React.CSSProperties}
      >
        <span className="co-bat">
          <BatGlyph size={flight.size} color={color} glow={glow} />
        </span>
      </span>
    ))}
  </>
);

// Lua cheia com halo (só luz, sem desenho de crateras).
export const MoonGlow: React.FC<{ size?: number; className?: string; style?: React.CSSProperties; strength?: number }> = ({
  size = 64,
  className = '',
  style,
  strength = 1,
}) => (
  <span
    aria-hidden
    className={`pointer-events-none absolute rounded-full ${className}`}
    style={{
      width: size,
      height: size,
      background: `radial-gradient(circle at 38% 35%, rgba(255,246,222,${0.95 * strength}), rgba(255,214,150,${0.75 * strength}) 55%, rgba(255,190,110,${0.5 * strength}) 70%, transparent 72%)`,
      boxShadow: `0 0 ${size * 0.6}px ${size * 0.18}px rgba(255,190,110,${0.22 * strength})`,
      ...style,
    }}
  />
);

// Abóbora com o rosto aceso.
export const JackOLantern: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 40, className = '', style }) => (
  <svg viewBox="0 0 40 36" width={size} height={(size * 36) / 40} aria-hidden className={`pointer-events-none ${className}`} style={style}>
    <path d="M18.5 7C18.2 4 19.6 1.4 22.6 1L23.2 2.8C21.4 3.3 20.9 5 21.4 7.4Z" fill="#5B7A2E" />
    <ellipse cx="12" cy="21" rx="9" ry="12" fill="#E86A10" />
    <ellipse cx="28" cy="21" rx="9" ry="12" fill="#E86A10" />
    <ellipse cx="20" cy="21" rx="9.5" ry="13.5" fill="#FF8A1F" />
    <path d="M14 9.5Q11 21 14 33M26 9.5Q29 21 26 33" fill="none" stroke="#C2410C" strokeWidth="0.9" opacity="0.7" />
    <g className="co-flicker" fill="#FFD08A">
      <path d="M11.5 17.5L15.5 13L17.8 18.2Z" />
      <path d="M28.5 17.5L24.5 13L22.2 18.2Z" />
      <path d="M19 20.2L21 20.2L20 22.2Z" />
      <path d="M10.5 24Q20 31.5 29.5 24L26.4 25.4L24.6 27.4L22.4 25.6L20 28.4L17.6 25.6L15.4 27.4L13.6 25.4Z" />
    </g>
  </svg>
);

// Varal de bandeirinhas (laranja, roxo e verde-gosma), balançando de leve.
const PENNANT_COLORS = ['#FF8A1F', '#8B5CF6', '#65A30D'];

export const PennantBunting: React.FC<{ count?: number; className?: string; style?: React.CSSProperties }> = ({ count = 12, className = '', style }) => (
  <div aria-hidden className={`pointer-events-none flex ${className}`} style={style}>
    {Array.from({ length: count }).map((_, i) => (
      <span key={i} className="relative flex-1 block" style={{ height: 34 }}>
        <svg className="absolute inset-x-0 top-0 w-full" height="12" viewBox="0 0 100 12" preserveAspectRatio="none">
          <path d="M0 1Q50 15 100 1" fill="none" stroke="rgba(243,234,211,0.4)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
        <span
          className="co-pennant absolute left-1/2 block"
          style={{
            top: 6,
            width: 16,
            height: 21,
            marginLeft: -8,
            background: `linear-gradient(180deg, ${PENNANT_COLORS[i % PENNANT_COLORS.length]}, ${PENNANT_COLORS[i % PENNANT_COLORS.length]}cc)`,
            clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
            ['--delay' as string]: `${-((i * 7) % 5) * 0.4}s`,
          } as React.CSSProperties}
        />
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Natal
// ---------------------------------------------------------------------------

const BULB_COLORS = ['#E5484D', '#F5C451', '#2FB36B', '#5EB1EF'];

// Varal de luzes: fio em arcos, uma lâmpada no fundo de cada arco.
export const LightsGarland: React.FC<{ count?: number; className?: string; style?: React.CSSProperties; sag?: number; bulb?: number }> = ({
  count = 14,
  className = '',
  style,
  sag = 10,
  bulb = 7,
}) => (
  <div aria-hidden className={`pointer-events-none flex ${className}`} style={style}>
    {Array.from({ length: count }).map((_, i) => {
      const color = BULB_COLORS[i % BULB_COLORS.length];
      return (
        <span key={i} className="relative flex-1 block" style={{ height: sag + bulb * 1.6 }}>
          <svg className="absolute inset-x-0 top-0 w-full" height={sag + 2} viewBox={`0 0 100 ${sag + 2}`} preserveAspectRatio="none">
            <path d={`M0 1Q50 ${sag * 2 - 1} 100 1`} fill="none" stroke="rgba(30,45,38,0.95)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          </svg>
          <span
            className="co-bulb absolute left-1/2 -translate-x-1/2 block"
            style={{
              top: sag - 1,
              width: bulb,
              height: bulb * 1.45,
              borderRadius: `${bulb}px ${bulb}px ${bulb}px ${bulb}px / ${bulb * 0.7}px ${bulb * 0.7}px ${bulb * 1.1}px ${bulb * 1.1}px`,
              background: `radial-gradient(circle at 35% 30%, #fff8, transparent 45%), ${color}`,
              boxShadow: `0 0 ${bulb * 1.4}px ${bulb * 0.3}px ${color}99`,
              ['--dur' as string]: `${2 + ((i * 7) % 5) * 0.35}s`,
              ['--delay' as string]: `${-((i * 13) % 9) * 0.3}s`,
            } as React.CSSProperties}
          />
        </span>
      );
    })}
  </div>
);

// Neve caindo dentro do elemento pai (que precisa de position + overflow).
export const Snowfall: React.FC<{ count?: number; seed?: number; maxSize?: number; opacity?: [number, number]; speed?: [number, number] }> = ({
  count = 24,
  seed = 7,
  maxSize = 4,
  opacity = [0.25, 0.6],
  speed = [12, 26],
}) => {
  const rand = seeded(seed);
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const size = 1.5 + rand() * (maxSize - 1.5);
        const dur = speed[0] + rand() * (speed[1] - speed[0]);
        return (
          <span
            key={i}
            aria-hidden
            className="co-flake pointer-events-none"
            style={{
              left: `${(rand() * 100).toFixed(2)}%`,
              ['--dur' as string]: `${dur.toFixed(1)}s`,
              ['--delay' as string]: `${(-rand() * dur).toFixed(1)}s`,
              ['--rest-y' as string]: `${(rand() * 90).toFixed(0)}%`,
            } as React.CSSProperties}
          >
            <span
              style={{
                width: size,
                height: size,
                opacity: opacity[0] + rand() * (opacity[1] - opacity[0]),
                ['--sway' as string]: `${(2 + rand() * 3).toFixed(1)}s`,
              } as React.CSSProperties}
            />
          </span>
        );
      })}
    </>
  );
};

// Gorro de Papai Noel (inclinado, pra pôr no canto do avatar).
export const SantaHat: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 60, className = '', style }) => (
  <svg viewBox="0 0 60 50" width={size} height={(size * 50) / 60} aria-hidden className={`pointer-events-none ${className}`} style={style}>
    <path d="M5 39C8 22 21 7 39 4.5C49.5 3 56.5 10 54.5 19C50.5 13.5 44.5 12.8 40.5 16.5C35 21.5 34.5 30 36.5 39Z" fill="#D93A45" />
    <path d="M39 4.5C49.5 3 56.5 10 54.5 19C52 15.5 48.5 13.8 45 14C48 10 46 6 39 4.5Z" fill="#B42A35" />
    <rect x="1.5" y="34.5" width="39" height="11" rx="5.5" fill="#F8F4EC" />
    <circle cx="54" cy="20.5" r="5.8" fill="#F8F4EC" />
    <path d="M6 37.5H36" stroke="#E3DCCD" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />
  </svg>
);

// Estrela dourada pequena (topo da árvore, brilho do painel).
export const GoldStar: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({ size = 18, className = '', style }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={`pointer-events-none ${className}`} style={style}>
    <path
      d="M12 2.5L14.6 8.6L21.2 9.2L16.2 13.6L17.7 20.1L12 16.7L6.3 20.1L7.8 13.6L2.8 9.2L9.4 8.6Z"
      fill="#F5C451"
      style={{ filter: 'drop-shadow(0 0 6px rgba(245,196,81,0.7))' }}
    />
  </svg>
);
