import React, { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// A dupla hélice do Oracle DNA (18/11/2026): duas fitas (fúcsia e verde-água)
// girando devagar, com as "bases" entre elas. Cada base acesa é um gene do
// título, na cor dele; as outras ficam apagadas. O gene escolhido no filtro
// brilha mais. Só SVG + framer-motion (sem lib nova); quem pede menos
// movimento no aparelho vê a hélice parada.
//
// O desenho se repete a cada LOOP px; a faixa anda exatamente LOOP px e
// recomeça, sem emenda visível.

interface DnaHelixProps {
  // Cores das bases acesas, na ordem (os genes do título). Vazio = só fitas.
  bases?: string[];
  // Índice da base em destaque (o gene do filtro), ou null.
  highlight?: number | null;
  // 'hero' (faixa larga do modal) ou 'icon' (o quadradinho do botão).
  size?: 'hero' | 'icon';
  // Gira mais rápido enquanto o oráculo "sequencia".
  busy?: boolean;
  className?: string;
}

const STRAND_A = '#E879F9';
const STRAND_B = '#5EEAD4';

const DnaHelix: React.FC<DnaHelixProps> = ({ bases = [], highlight = null, size = 'hero', busy = false, className }) => {
  const reduce = useReducedMotion();
  const gradId = useId().replace(/:/g, '');
  const hero = size === 'hero';
  const W = hero ? 360 : 40;
  const H = hero ? 72 : 40;
  const P = hero ? 72 : 26; // um giro completo
  const A = hero ? 22 : 11; // amplitude
  const cy = H / 2;
  const perTurn = hero ? 6 : 4; // bases por giro
  // O padrão repete a cada LOOP: giros suficientes para todas as bases.
  const turns = hero ? Math.max(2, Math.ceil(Math.max(bases.length, 1) / perTurn)) : 1;
  const LOOP = P * turns;
  const total = W + LOOP;

  const { pathA, pathB, rungs } = useMemo(() => {
    const step = 2;
    let a = '';
    let b = '';
    for (let x = 0; x <= total; x += step) {
      const s = Math.sin((2 * Math.PI * x) / P);
      const ya = cy + A * s;
      const yb = cy - A * s;
      a += `${x === 0 ? 'M' : 'L'}${x.toFixed(1)},${ya.toFixed(2)}`;
      b += `${x === 0 ? 'M' : 'L'}${x.toFixed(1)},${yb.toFixed(2)}`;
    }
    const gap = P / perTurn;
    const list: { x: number; y1: number; y2: number; depth: number; i: number }[] = [];
    let i = 0;
    for (let x = gap / 2; x <= total; x += gap) {
      const s = Math.sin((2 * Math.PI * x) / P);
      const c = Math.cos((2 * Math.PI * x) / P);
      list.push({ x, y1: cy + A * s, y2: cy - A * s, depth: (c + 1) / 2, i: i % (perTurn * turns) });
      i += 1;
    }
    return { pathA: a, pathB: b, rungs: list };
  }, [total, P, A, cy, perTurn, turns]);

  const duration = (busy ? 2.2 : 7) * turns;
  // 18/11/2026 (otimização): o ícone (40 px, no menu de cada título) fica
  // parado. Girando, ele rodava o framer-motion a 60 quadros/s enquanto o menu
  // estivesse aberto (~37 ms de CPU por segundo só para o ícone, medido). A
  // faixa grande (hero) continua girando.
  const still = reduce || !hero;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={hero ? 'xMidYMid slice' : 'xMidYMid meet'}
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`dna-fade-${gradId}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.12" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.88" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`dna-mask-${gradId}`}>
          <rect x="0" y="0" width={W} height={H} fill={hero ? `url(#dna-fade-${gradId})` : '#fff'} />
        </mask>
      </defs>
      <g mask={`url(#dna-mask-${gradId})`}>
        <motion.g
          animate={still ? undefined : { x: [0, -LOOP] }}
          transition={still ? undefined : { duration, ease: 'linear', repeat: Infinity }}
        >
          {rungs.map((r, k) => {
            const lit = r.i < bases.length;
            const color = lit ? bases[r.i] : 'rgba(189,180,214,0.35)';
            const isHot = lit && highlight !== null && r.i === highlight;
            const dim = highlight !== null && !isHot;
            return (
              <line
                key={k}
                x1={r.x}
                x2={r.x}
                y1={r.y1}
                y2={r.y2}
                stroke={color}
                strokeWidth={hero ? (isHot ? 3.2 : 2.2) : 1.6}
                strokeLinecap="round"
                opacity={(lit ? 0.45 + 0.55 * r.depth : 0.25 + 0.25 * r.depth) * (dim ? 0.35 : 1)}
                style={isHot ? { filter: `drop-shadow(0 0 4px ${color})` } : undefined}
              />
            );
          })}
          <path d={pathB} fill="none" stroke={STRAND_B} strokeWidth={hero ? 2.6 : 1.8} strokeLinecap="round" opacity={0.9} />
          <path d={pathA} fill="none" stroke={STRAND_A} strokeWidth={hero ? 2.6 : 1.8} strokeLinecap="round" opacity={0.95} />
        </motion.g>
      </g>
    </svg>
  );
};

export default React.memo(DnaHelix);
