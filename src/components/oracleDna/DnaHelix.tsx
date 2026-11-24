import React from 'react';

// A dupla hélice do Oracle DNA (18/11/2026): a faixa no alto da gaveta.
//
// 24/11/2026 (redesenho): uma cor só. Antes eram duas fitas (fúcsia e
// verde-água) e uma "base" acesa por gene, cada uma numa cor (doze cores): era
// a peça que mais puxava o olho numa tela que já tinha informação demais. Agora
// uma fita leva a cor do DNA, a outra e as bases ficam em tom de névoa.
//
// O desenho também mudou de motor:
//   • antes o SVG era esticado para caber na largura (no computador a hélice
//     crescia até ser cortada em cima e embaixo) — agora ele é desenhado em
//     pixels de verdade, mais largo que qualquer gaveta, e a faixa só recorta;
//   • antes quem andava era um <g> do SVG empurrado pelo framer-motion (o
//     navegador redesenhava a faixa a cada quadro) — agora anda o SVG inteiro,
//     por CSS e só com transform (regra .dna-band no index.css): a placa de
//     vídeo resolve. Quem pede menos movimento, ou está no modo economia, vê a
//     hélice parada.
// O padrão se repete a cada giro (TURN px): a faixa anda um giro e recomeça,
// sem emenda visível.

const TURN = 64; // largura de um giro completo
const AMP = 12; // amplitude
const HEIGHT = 40;
const PER_TURN = 6; // bases por giro
const WIDTH = 768; // a gaveta mais larga tem 672 px (sm:max-w-2xl); sobra o giro que a faixa anda
const MID = HEIGHT / 2;

export const DNA_ACCENT = '#5EEAD4';
const QUIET = '189,180,214'; // MIST

function build() {
  let a = '';
  let b = '';
  for (let x = 0; x <= WIDTH; x += 2) {
    const s = Math.sin((2 * Math.PI * x) / TURN);
    a += `${x === 0 ? 'M' : 'L'}${x},${(MID + AMP * s).toFixed(2)}`;
    b += `${x === 0 ? 'M' : 'L'}${x},${(MID - AMP * s).toFixed(2)}`;
  }
  const gap = TURN / PER_TURN;
  const rungs: { x: number; y1: number; y2: number; depth: number }[] = [];
  for (let x = gap / 2; x <= WIDTH; x += gap) {
    const s = Math.sin((2 * Math.PI * x) / TURN);
    const c = Math.cos((2 * Math.PI * x) / TURN);
    rungs.push({ x, y1: MID + AMP * s, y2: MID - AMP * s, depth: (c + 1) / 2 });
  }
  return { a, b, rungs };
}

// O desenho é sempre o mesmo: calculado uma vez, na primeira hélice da sessão.
let drawing: ReturnType<typeof build> | null = null;

const DnaHelix: React.FC<{ className?: string }> = ({ className }) => {
  if (!drawing) drawing = build();
  const { a, b, rungs } = drawing;
  return (
    <div className={`dna-band ${className ?? ''}`} style={{ height: HEIGHT }} aria-hidden>
      <svg className="dna-band__svg" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} focusable="false">
        {rungs.map((r) => (
          <line
            key={r.x}
            x1={r.x}
            x2={r.x}
            y1={r.y1}
            y2={r.y2}
            stroke={`rgba(${QUIET},${(0.14 + 0.2 * r.depth).toFixed(2)})`}
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}
        <path d={b} fill="none" stroke={`rgba(${QUIET},0.5)`} strokeWidth={1.75} strokeLinecap="round" />
        <path d={a} fill="none" stroke={DNA_ACCENT} strokeWidth={1.75} strokeLinecap="round" opacity={0.9} />
      </svg>
    </div>
  );
};

export default React.memo(DnaHelix);
