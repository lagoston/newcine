import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ORACLES } from '../lib/oracleTheme';

// A mão de três cartas em leque — o elemento de marca do CineOracle.
// Usada no herói da home de visitante e ao lado dos formulários de conta.
// Posições em % do tamanho da própria carta, então o leque escala com o
// container sem precisar de breakpoints. Único movimento automático: as
// cartas se abrem ao montar; depois só reagem a hover/toque.
const FAN = [
  { rotate: -13, x: '-58%', y: '5%' },
  { rotate: 0, x: '0%', y: '0%' },
  { rotate: 13, x: '58%', y: '5%' },
];

interface OracleCardFanProps {
  // Classes do container — é ele que define o tamanho do leque.
  className?: string;
  // Classes de largura/margem de cada carta (precisam andar juntas:
  // margem = -metade da largura, pra centralizar).
  cardClassName?: string;
}

const OracleCardFan: React.FC<OracleCardFanProps> = ({
  className = 'max-w-[540px] lg:max-w-none',
  cardClassName = 'w-[35%] -ml-[17.5%] lg:w-[39%] lg:-ml-[19.5%]',
}) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative mx-auto w-full aspect-[4/3] ${className}`} role="img" aria-label={t('guestHome.cardsAlt')}>
      {/* Luz da lua — o arco-íris do topo das cartas, como um halo atrás da mão */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[2%] -translate-x-1/2 w-[78%] aspect-square rounded-full blur-3xl opacity-70 pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(67,211,195,0.30) 0%, rgba(139,92,246,0.28) 42%, transparent 70%)' }}
      />
      {ORACLES.map((oracle, i) => (
        <motion.img
          key={oracle.id}
          src={oracle.img}
          alt=""
          width={1696}
          height={2528}
          draggable={false}
          decoding="async"
          className={`absolute bottom-[4%] left-1/2 ${cardClassName} rounded-[6px] select-none cursor-pointer`}
          style={{
            transformOrigin: '50% 100%',
            zIndex: i === 1 ? 3 : i === 2 ? 2 : 1,
            boxShadow: '0 28px 60px -18px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06)',
          }}
          initial={reduceMotion ? false : { x: '0%', y: '14%', rotate: 0, opacity: 0 }}
          animate={{ x: FAN[i].x, y: FAN[i].y, rotate: FAN[i].rotate, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 110, damping: 15, delay: reduceMotion ? 0 : 0.2 + i * 0.12 }}
          whileHover={{ y: '-7%', rotate: FAN[i].rotate * 0.4, zIndex: 5 }}
          whileTap={{ y: '-7%', rotate: FAN[i].rotate * 0.4, zIndex: 5 }}
        />
      ))}
    </div>
  );
};

export default OracleCardFan;