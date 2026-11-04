import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PAPER, MIST, PIXEL, ORACLES, withAlpha } from '../../lib/oracleTheme';
import './premium.css';

// Peças comuns da página Premium (04/11/2026): o marcador "Rolo N" de cada
// capítulo, o cabeçalho do capítulo, os textos e o leque de cartas
// Yu-Gi-Oh! que sai de trás do ingresso.

// Ouro do Premium (o mesmo de --prm-gold em premium.css), para estilos inline.
export const PREMIUM_GOLD = '#F4C454';

// Título de capítulo e de cartão: Pixelify, como todo título do site.
export const H2_CLASS = 'text-[30px] sm:text-[40px] leading-[1.04]';
export const H3_CLASS = 'text-[22px] sm:text-[26px] leading-[1.08]';
export const BODY_CLASS = 'text-[15px] sm:text-base leading-relaxed';

// "Rolo 1 · Os oráculos": os capítulos da página são os rolos do filme.
export const Reel: React.FC<{ label: string }> = ({ label }) => (
  <p style={PIXEL} className="prm-reel inline-flex items-center gap-2 text-[15px] leading-none tracking-wide uppercase">
    {label}
  </p>
);

export const ChapterHeader: React.FC<{ id: string; reel: string; title: string; lead?: string; className?: string }> = ({
  id,
  reel,
  title,
  lead,
  className = '',
}) => (
  <header className={`max-w-2xl ${className}`}>
    <Reel label={reel} />
    {/* scroll-mt: os atalhos do topo (#prm-…) param abaixo da barra fixa. */}
    <h2 id={id} style={{ ...PIXEL, color: PAPER }} className={`mt-3 scroll-mt-24 ${H2_CLASS}`}>
      {title}
    </h2>
    {lead && (
      <p className={`mt-3 ${BODY_CLASS}`} style={{ color: MIST }}>
        {lead}
      </p>
    )}
  </header>
);

// Os três retratos dos oráculos (sapo, raposa, cobra), sobrepostos.
export const OracleFaces: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => (
  <span className={`flex -space-x-2 ${className}`} aria-hidden>
    {ORACLES.map((oracle) => (
      <img
        key={oracle.id}
        src={oracle.avatar}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: `0 0 0 2px #120D22, 0 0 0 3.5px ${withAlpha(oracle.color, 0.85)}` }}
      />
    ))}
  </span>
);

// As cartas dos três oráculos no estilo Yu-Gi-Oh! (uma das cartas Premium),
// em leque, saindo de trás do ingresso. Abrem uma vez ao carregar; quem
// prefere menos movimento já as vê abertas.
const FAN = [
  { id: 'bogart', x: -66, y: 10, rotate: -13, z: 1 },
  { id: 'cypher', x: 66, y: 10, rotate: 13, z: 1 },
  { id: 'fincher', x: 0, y: 0, rotate: 0, z: 2 },
] as const;

export const TicketFan: React.FC = () => {
  const reduceMotion = useReducedMotion();
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[170px] sm:h-[190px]">
      {/* Halo dourado atrás das cartas */}
      <span
        className="absolute left-1/2 top-2 -translate-x-1/2 w-[260px] h-[170px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(244,196,84,0.34), rgba(217,70,239,0.14) 55%, transparent 72%)' }}
      />
      {FAN.map((card, i) => {
        const oracle = ORACLES.find((o) => o.id === card.id)!;
        return (
          <motion.img
            key={card.id}
            src={oracle.altImg}
            alt=""
            width={774}
            height={1141}
            decoding="async"
            draggable={false}
            className="absolute left-1/2 top-0 w-[100px] sm:w-[116px] -ml-[50px] sm:-ml-[58px] rounded-[7px]"
            style={{
              zIndex: card.z,
              transformOrigin: '50% 100%',
              boxShadow: `0 18px 30px -14px rgba(0,0,0,0.9), 0 0 22px -6px ${withAlpha(oracle.color, 0.7)}`,
            }}
            initial={reduceMotion ? false : { x: 0, y: 40, rotate: 0, opacity: 0 }}
            animate={{ x: card.x, y: card.y, rotate: card.rotate, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 16, delay: reduceMotion ? 0 : 0.15 + i * 0.1 }}
          />
        );
      })}
    </span>
  );
};
