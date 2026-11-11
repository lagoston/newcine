import React, { useId } from 'react';

// As molduras dos kits da Cobra (11/11/2026), com a segunda face de cada
// obra — o equivalente ao giro para a caveira do Motoqueiro Fantasma
// (GhostRiderFrame), mas cada uma do seu jeito:
//   • Game of Thrones — o avatar gira em 3D e, do outro lado, o olho de um
//     dragão se abre e a pupila se fecha numa fenda;
//   • Rick and Morty — um portal verde se abre na foto e mostra você "de
//     outra dimensão" (as cores trocadas), girando; depois fecha;
//   • Família Soprano — corte seco para os patos na piscina à noite e corte
//     para o preto (o final da série), sem transição nenhuma;
//   • The Walking Dead — a foto "vira": treme, a cor morre, as veias sobem;
//     depois volta.
// Toda a animação é CSS (src/styles/cosmeticKits.css), sem estado nem timer.
// Ninguém aqui desenha personagem das séries: só o mundo de cada uma.
//
// Com "reduzir movimento", só a frente aparece (a segunda face some).

export type KitFrameId = 'got' | 'rick-morty' | 'sopranos' | 'walking-dead';

interface KitFrameProps {
  kit: KitFrameId;
  /** URL da foto do usuário. */
  src: string;
  alt?: string;
  /** Tamanho do avatar em pixels. */
  size?: number;
  className?: string;
}

// Ids do SVG únicos por avatar (vários na mesma página); o useId traz ":".
const useSvgId = () => useId().replace(/[^a-zA-Z0-9_-]/g, '');

// ---------------------------------------------------------------------------
// Game of Thrones — o olho do dragão
// ---------------------------------------------------------------------------

const EYE = 'M8,50 Q50,12 92,50 Q50,88 8,50 Z';

const DragonEye: React.FC = () => {
  const id = useSvgId();
  const fibers = Array.from({ length: 28 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return (
      <line
        key={i}
        x1={50 + Math.cos(a) * 6}
        y1={50 + Math.sin(a) * 6}
        x2={50 + Math.cos(a) * 34}
        y2={50 + Math.sin(a) * 34}
        stroke={i % 2 ? '#FDE68A' : '#7C2D12'}
        strokeOpacity={i % 2 ? 0.28 : 0.35}
        strokeWidth={0.8}
      />
    );
  });
  return (
    <svg viewBox="0 0 100 100" className="kit-photo" aria-hidden>
      <defs>
        <radialGradient id={`${id}bg`} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor="#5A2A10" />
          <stop offset="0.6" stopColor="#24130A" />
          <stop offset="1" stopColor="#0C0705" />
        </radialGradient>
        <pattern id={`${id}sc`} width="10" height="8" patternUnits="userSpaceOnUse">
          <path d="M-5,8 Q0,0 5,8 M5,8 Q10,0 15,8 M0,4 Q5,-4 10,4" fill="none" stroke="#C2410C" strokeOpacity="0.35" strokeWidth="0.7" />
        </pattern>
        <radialGradient id={`${id}ir`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFF7CC" />
          <stop offset="0.28" stopColor="#FBBF24" />
          <stop offset="0.62" stopColor="#EA580C" />
          <stop offset="0.9" stopColor="#7C2D12" />
          <stop offset="1" stopColor="#3B0F05" />
        </radialGradient>
        <clipPath id={`${id}eye`}>
          <path d={EYE} />
        </clipPath>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}bg)`} />
      <rect width="100" height="100" fill={`url(#${id}sc)`} />
      <g clipPath={`url(#${id}eye)`}>
        <rect width="100" height="100" fill={`url(#${id}ir)`} />
        <g>{fibers}</g>
        <ellipse className="kit-eye-pupil" cx="50" cy="50" rx="3" ry="27" fill="#0A0503" />
        <ellipse cx="41" cy="38" rx="5" ry="2.6" fill="#FFFBEB" opacity="0.7" transform="rotate(-24 41 38)" />
        <rect className="kit-eye-lid-top" x="0" y="10" width="100" height="40" fill="#2A160B" />
        <rect className="kit-eye-lid-bottom" x="0" y="50" width="100" height="40" fill="#2A160B" />
        <rect className="kit-eye-lid-top" x="0" y="10" width="100" height="40" fill={`url(#${id}sc)`} />
      </g>
      <path d={EYE} fill="none" stroke="#0C0603" strokeWidth="2.4" />
      <path d="M8,50 Q50,12 92,50" fill="none" stroke="#F59E0B" strokeOpacity="0.35" strokeWidth="0.8" />
      <g className="kit-eye-ember" fill="#FDBA74">
        <circle cx="22" cy="78" r="1.1" />
        <circle cx="70" cy="84" r="0.9" />
        <circle cx="84" cy="70" r="1.2" />
        <circle cx="36" cy="88" r="0.8" />
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Família Soprano — os patos na piscina, à noite
// ---------------------------------------------------------------------------

const Duck: React.FC<{ x: number; y: number; s: number; second?: boolean }> = ({ x, y, s, second }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="7.5" rx="11" ry="2.2" fill="#03141C" opacity="0.5" />
    <g className={`kit-duck ${second ? 'kit-duck--second' : ''}`}>
      {/* corpo */}
      <path d="M-9,4 C-9,-1 -4,-3 2,-2 C7,-1 10,1 12,-1 C12,3 9,7 2,7 C-4,7 -9,7 -9,4 Z" fill="#5B4636" />
      {/* asa */}
      <path d="M-3,1 C1,-1 6,0 9,2 C6,4 1,4 -3,1 Z" fill="#3E3026" />
      {/* peito */}
      <path d="M-9,4 C-9,1 -7,-1 -5,-1 C-5,2 -6,5 -8,6 Z" fill="#7A4A2E" />
      {/* pescoço com o colar branco e a cabeça verde */}
      <path d="M-7,0 C-8,-3 -8,-6 -7,-8 C-5,-9 -3,-8 -3,-6 C-3,-4 -4,-2 -5,0 Z" fill="#1F5130" />
      <path d="M-7.6,-1.2 L-4.6,-1.2" stroke="#E5E7EB" strokeWidth="0.9" />
      {/* bico */}
      <path d="M-7.5,-7 L-11,-6.2 L-7.5,-5.5 Z" fill="#D9A92B" />
      <circle cx="-5.6" cy="-6.6" r="0.5" fill="#0A0A0A" />
    </g>
  </g>
);

const PoolScene: React.FC = () => {
  const id = useSvgId();
  // fio de lâmpadas do quintal (uma curva) e as lâmpadas
  const bulbs = Array.from({ length: 9 }, (_, i) => {
    const t = (i + 0.5) / 9;
    return { x: t * 100, y: 10 + 18 * t * (1 - t) * 1.7 + 1.4 };
  });
  const waves = Array.from({ length: 6 }, (_, i) => {
    const y = 52 + i * 8;
    let d = `M-10,${y}`;
    for (let x = -10; x <= 130; x += 10) d += ` Q${x + 5},${y - 2.2} ${x + 10},${y}`;
    return <path key={i} d={d} fill="none" stroke="#A5F3FC" strokeOpacity={0.18 + (i % 2) * 0.12} strokeWidth="0.8" />;
  });
  return (
    <svg viewBox="0 0 100 100" className="kit-photo" aria-hidden>
      <defs>
        <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07071A" />
          <stop offset="1" stopColor="#1E1636" />
        </linearGradient>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1491A8" />
          <stop offset="1" stopColor="#0B3B4E" />
        </linearGradient>
        <radialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FCD34D" stopOpacity="0.5" />
          <stop offset="1" stopColor="#FCD34D" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="44" fill={`url(#${id}sky)`} />
      <path d="M0,36 Q8,31 16,35 Q24,30 34,34 Q44,29 54,34 Q64,30 74,34 Q84,29 92,33 L100,32 L100,44 L0,44 Z" fill="#05050B" />
      <path d={`M0,10 Q50,${10 + 18 * 0.25 * 1.7 * 2} 100,10`} fill="none" stroke="#2A2018" strokeWidth="0.6" />
      <g>
        {bulbs.map((b) => (
          <circle key={`g${b.x}`} cx={b.x} cy={b.y} r="4" fill={`url(#${id}glow)`} />
        ))}
        {bulbs.map((b) => (
          <circle key={`b${b.x}`} cx={b.x} cy={b.y} r="1.3" fill="#FCD34D" />
        ))}
      </g>
      <rect y="42" width="100" height="58" fill={`url(#${id}w)`} />
      <rect y="42" width="100" height="1.6" fill="#D1FAE5" opacity="0.55" />
      <g className="kit-ripple">{waves}</g>
      <Duck x={40} y={66} s={1.45} />
      <Duck x={70} y={78} s={1.2} second />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// The Walking Dead — as veias subindo
// ---------------------------------------------------------------------------

const VEINS = [
  'M50,100 C48,90 52,84 47,76 C44,70 46,64 42,58',
  'M47,76 C54,72 56,68 60,62',
  'M0,62 C8,60 12,64 18,58 C22,54 26,56 30,50',
  'M18,58 C16,52 20,48 18,42',
  'M100,58 C92,56 88,62 82,56 C78,52 74,54 70,48',
  'M82,56 C84,50 80,46 82,40',
  'M14,92 C20,86 26,88 30,80',
  'M88,90 C82,86 76,88 72,80',
];

const Veins: React.FC = () => (
  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full kit-veins" aria-hidden>
    <g fill="none" stroke="#2A1530" strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round">
      {VEINS.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
    <g fill="#7F1D1D" opacity="0.7">
      <circle cx="20" cy="84" r="1.6" />
      <circle cx="24" cy="88" r="1" />
      <circle cx="16" cy="80" r="0.8" />
      <circle cx="78" cy="22" r="0.9" />
    </g>
  </svg>
);

// ---------------------------------------------------------------------------

export function KitFrame({ kit, src, alt = '', size = 120, className = '' }: KitFrameProps) {
  const box = { width: size, height: size };
  const photo = <img src={src || '/placeholder.svg'} alt={alt} className="kit-photo" loading="lazy" decoding="async" />;
  const echo = <img src={src || '/placeholder.svg'} alt="" className="kit-photo" loading="lazy" decoding="async" />;

  if (kit === 'got') {
    // Gira em 3D: o aro vai junto, nas duas faces.
    return (
      <div className={`kit-frame kit-scene--got ${className}`} style={box}>
        <div className="kit-card--got">
          <div className="kit-face co-frame co-frame--got">{photo}</div>
          <div className="kit-face kit-back co-frame co-frame--got" aria-hidden>
            <DragonEye />
          </div>
        </div>
      </div>
    );
  }

  // Nos outros três, a segunda face fica por cima da foto e o aro por cima
  // de tudo (uma camada só de aro).
  const rim = <div className={`kit-face co-frame co-frame--${kit}`} style={{ pointerEvents: 'none' }} aria-hidden />;

  if (kit === 'rick-morty') {
    return (
      <div className={`kit-frame ${className}`} style={box}>
        <div className="kit-face">{photo}</div>
        <div className="kit-face kit-back kit-back--portal" aria-hidden>
          <span className="kit-portal-swirl" />
          <span className="kit-portal-you">{echo}</span>
        </div>
        <div className="kit-face" aria-hidden>
          <span className="kit-portal-ring" />
        </div>
        {rim}
      </div>
    );
  }

  if (kit === 'sopranos') {
    return (
      <div className={`kit-frame ${className}`} style={box}>
        <div className="kit-face">{photo}</div>
        <div className="kit-face kit-back kit-back--pool" aria-hidden>
          <PoolScene />
        </div>
        <span className="kit-cut-black kit-back" aria-hidden />
        {rim}
      </div>
    );
  }

  // The Walking Dead
  return (
    <div className={`kit-frame ${className}`} style={box}>
      <div className="kit-card--wd">
        <div className="kit-face">{photo}</div>
        <div className="kit-face kit-back kit-back--turned" aria-hidden>
          {echo}
          <span className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 44%, transparent 28%, rgba(18, 22, 14, 0.6) 78%)' }} />
          <span className="absolute inset-0" style={{ background: 'rgba(86, 104, 64, 0.22)', mixBlendMode: 'multiply' }} />
          <Veins />
        </div>
        {rim}
      </div>
    </div>
  );
}

export default KitFrame;
