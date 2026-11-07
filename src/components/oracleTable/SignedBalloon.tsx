import React, { useEffect, useState } from 'react';
import { PIXEL, ORACLE_BY_ID } from '../../lib/oracleTheme';
import type { Speaker } from '../../lib/mesa/dialogue/types';

// O balão assinado de cada oráculo (SPEC §3.8; porte do SpeechBand do pôquer):
// o Sapo com bolhas na borda, o Raposo em intertítulo de cinema mudo (preto,
// moldura dourada, itálico, centrado), a Cobra em zigue-zague com o texto
// "digitado" em 380 ms. Usado na faixa de fala, na leitura (o comentário
// selado) e numa linha do Livro.

export const SPEAKER_COLOR: Record<Speaker, string> = {
  bogart: ORACLE_BY_ID.bogart.color,
  fincher: ORACLE_BY_ID.fincher.color,
  cypher: ORACLE_BY_ID.cypher.color,
  espelho: '#B9A6FF',
};

export const Typed: React.FC<{ text: string; ms: number; off: boolean }> = ({ text, ms, off }) => {
  const [n, setN] = useState(off ? text.length : 0);
  useEffect(() => {
    if (off) {
      setN(text.length);
      return;
    }
    setN(0);
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / ms);
      setN(Math.ceil(k * text.length));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms, off]);
  // O resto fica invisível no lugar: o balão não cresce enquanto digita.
  return (
    <>
      {text.slice(0, n)}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </>
  );
};

interface SignedBalloonProps {
  who: Speaker;
  text: string;
  variant: 'band' | 'reading' | 'line';
  name?: string;
  reduced: boolean;
  tailX?: string | null;
  typed?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const SignedBalloon: React.FC<SignedBalloonProps> = ({ who, text, variant, name, reduced, tailX, typed = true, className = '', style, onClick }) => {
  const color = SPEAKER_COLOR[who];
  return (
    <div
      className={`ms-balloon is-${who} ${variant === 'band' ? '' : `is-${variant}`} ${className}`}
      style={{ '--c': color, ...style } as React.CSSProperties}
      onClick={onClick}
    >
      {tailX && <span className="ms-balloon-tail" style={{ left: tailX }} aria-hidden />}
      {who === 'cypher' && <span className="ms-zig" aria-hidden />}
      <p className="ms-balloon-text">
        {name && (
          <span className="ms-balloon-name" style={{ ...PIXEL, color }}>
            {name}
          </span>
        )}
        {who === 'cypher' && typed ? <Typed text={text} ms={380} off={reduced} /> : text}
      </p>
    </div>
  );
};

export default SignedBalloon;
