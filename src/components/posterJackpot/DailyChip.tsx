import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { ChipFace } from './Chips';
import { playReveal } from '../../lib/jackpotSound';
import { FOCUS_RING } from '../../lib/oracleTheme';

// A ficha do dia (02/11/2026, pedido do Bruno: "um balãozinho saindo do
// Pôster Jackpot… em estilo quase pavloviano").
//
// • DailyChipBalloon — o balão que nasce da porta do Jackpot na home quando a
//   ficha de hoje ainda está lá. É um balão de fala da própria máquina: vidro
//   azul-noite com aro de ouro, a ficha girando num medalhão, "Ficha grátis!"
//   em Cinzel e o "+1" pendurado no canto; o rabicho aponta de volta para o
//   leque de pôsteres, de onde ele saiu. Nasce do rabicho (mola), flutua
//   devagar, a ficha vira de tempos em tempos e um brilho atravessa o vidro.
//   Tocar estoura o balão em faíscas — e a porta pega a ficha e abre a gaveta
//   na aba Missões.
//   No celular o balão é uma pílula fina montada na borda de cima da porta;
//   do tablet em diante, um balão de fala com a frase (styles/
//   posterJackpot.css). Fica no canto de cima à direita, onde não cobre o
//   título.
// • DailyChipReward — a recompensa, no topo da aba Missões: a ficha cai
//   girando com o "+1", pousa com um carrilhão sobre os raios dourados,
//   "Ficha do dia" (o "1" do Cinzel parece um "I": o número fica no selo), e
//   logo embaixo a ponte para as missões ("Quer mais? Cada missão da semana
//   vale 1 ficha."), que vêm em seguida. Primeiro o prêmio, depois o caminho
//   para o próximo.
// Com "reduzir movimento", nada flutua, gira ou cai: aparece parado.

const POP_SPARKS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const dist = 46 + (i % 3) * 16;
  return {
    dx: `${Math.round(Math.cos(angle) * dist * 1.5)}px`,
    dy: `${Math.round(Math.sin(angle) * dist)}px`,
    s: `${7 + (i % 3) * 3}px`,
    c: i % 4 === 0 ? '#FFFFFF' : i % 2 ? '#FFE8A3' : '#F4C454',
    delay: `${(i % 4) * 0.025}s`,
  };
});

// Brilhinhos em volta do balão (posições relativas ao balão).
const TWINKLES = [
  { left: '-10px', top: '6px', delay: '0s', size: 9 },
  { left: '74%', top: '-12px', delay: '1.1s', size: 7 },
  { left: '96%', top: '62%', delay: '2.2s', size: 8 },
];

export const DailyChipBalloon: React.FC<{
  show: boolean;
  // A porta está pegando a ficha (o balão estoura e espera).
  claiming: boolean;
  onClaim: () => void;
  className?: string;
}> = ({ show, claiming, onClaim, className = '' }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        // Por fora: só a posição e a saída (as faíscas do estouro moram aqui,
        // para não sumirem junto com o balão).
        <motion.div
          key="daily-balloon"
          className={`absolute z-20 ${className}`}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, delay: 0.25 } }}
        >
        {/* O balão: nasce do rabicho (transform-origin no CSS), como se saísse
            de dentro da máquina, e estoura quando é tocado. */}
        <motion.div
          className="pj-daily-anchor"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.25, y: 18, rotate: -8 }}
          animate={
            claiming
              ? reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 1.16, y: -6, rotate: 0, transition: { duration: 0.26, ease: 'easeOut' } }
              : { opacity: 1, scale: 1, y: 0, rotate: 0, transition: reduceMotion ? { duration: 0.2, delay: 0.6 } : { type: 'spring', stiffness: 380, damping: 15, delay: 0.95 } }
          }
        >
          <div className="pj-daily-float">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!claiming) onClaim();
              }}
              aria-label={t('jackpot.daily.balloonAria')}
              className={`pj-daily ${FOCUS_RING}`}
            >
              <span className="pj-daily-clip" aria-hidden>
                <span className="pj-stars" />
                <span className="pj-daily-sheen" />
              </span>
              <span className="pj-daily-coin" aria-hidden>
                <ChipFace className="pj-daily-chip" />
              </span>
              <span className="relative flex flex-col leading-tight">
                <span className="pj-display pj-daily-title">{t('jackpot.daily.balloonTitle')}</span>
                <span className="pj-daily-sub">{t('jackpot.daily.balloonHint')}</span>
              </span>
              <span className="pj-daily-plus" aria-hidden>
                +1
              </span>
              <span className="pj-daily-tail" aria-hidden />
            </button>
            {TWINKLES.map((tw, i) => (
              <span key={i} className="pj-daily-twinkle" style={{ left: tw.left, top: tw.top, width: tw.size, height: tw.size, animationDelay: tw.delay }} aria-hidden />
            ))}
          </div>
        </motion.div>
          {claiming && !reduceMotion && (
            <span className="absolute inset-0 pointer-events-none" aria-hidden>
              {POP_SPARKS.map((spark, i) => (
                <span
                  key={i}
                  className="pj-spark"
                  style={{ top: '50%', ['--dx' as string]: spark.dx, ['--dy' as string]: spark.dy, ['--s' as string]: spark.s, ['--c' as string]: spark.c, ['--delay' as string]: spark.delay, ['--d' as string]: '0.75s' }}
                />
              ))}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// As recompensas que já caíram nesta visita (pela chave do momento em que a
// ficha foi pega): trocar de aba e voltar não repete a queda nem o som.
const playedRewards = new Set<number>();

const LAND_SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = -Math.PI / 2 + ((i - 4.5) / 9) * Math.PI * 1.25;
  const dist = 54 + (i % 3) * 14;
  return {
    dx: `${Math.round(Math.cos(angle) * dist)}px`,
    dy: `${Math.round(Math.sin(angle) * dist * 0.8)}px`,
    s: `${7 + (i % 3) * 3}px`,
    c: i % 3 === 0 ? '#FFFFFF' : '#FFE8A3',
    delay: `${(i % 3) * 0.04}s`,
  };
});

export const DailyChipReward: React.FC<{ tickets: number; playKey: number }> = ({ tickets, playKey }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  // A ficha só cai na primeira vez que a recompensa aparece. (Marca como
  // vista quando pousa, não ao montar: o StrictMode monta duas vezes.)
  const fresh = useMemo(() => !playedRewards.has(playKey), [playKey]);
  const [landed, setLanded] = useState(!fresh || !!reduceMotion);

  useEffect(() => {
    if (reduceMotion) playedRewards.add(playKey);
  }, [playKey, reduceMotion]);

  const land = () => {
    if (landed) return;
    setLanded(true);
    playedRewards.add(playKey);
    playReveal('common', false);
    navigator.vibrate?.(18);
  };

  return (
    <div className="space-y-3">
      <div className="pj-daily-reward" role="status">
        <span className="pj-stars" aria-hidden />
        <span className="pj-rays" aria-hidden style={{ ['--pj-ray' as string]: 'rgba(255, 214, 120, 0.32)' }} />
        <div className="relative mx-auto h-[92px] w-[120px]" aria-hidden>
          {/* o lugar onde a ficha pousa: um brilho no chão do palco */}
          <span className={`pj-daily-pad ${landed ? 'is-lit' : ''}`} />
          <motion.span
            className="absolute left-1/2 top-[6px] -ml-[34px] block w-[68px] h-[68px]"
            style={{ transformPerspective: 400 }}
            initial={fresh && !reduceMotion ? { y: -150, rotateY: 900, opacity: 0 } : false}
            animate={{ y: 0, rotateY: 0, opacity: 1 }}
            transition={{ y: { type: 'spring', stiffness: 260, damping: 13, delay: 0.25 }, rotateY: { duration: 0.9, ease: 'easeOut', delay: 0.25 }, opacity: { duration: 0.15, delay: 0.25 } }}
            onAnimationComplete={land}
          >
            <ChipFace className="w-full h-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.7)]" />
            <span className="pj-daily-plus pj-daily-plus--big">+1</span>
          </motion.span>
          {landed && fresh && !reduceMotion && (
            <>
              <span className="pj-flash rounded-full" />
              {LAND_SPARKS.map((spark, i) => (
                <span
                  key={i}
                  className="pj-spark"
                  style={{ top: '46%', ['--dx' as string]: spark.dx, ['--dy' as string]: spark.dy, ['--s' as string]: spark.s, ['--c' as string]: spark.c, ['--delay' as string]: spark.delay, ['--d' as string]: '1s' }}
                />
              ))}
            </>
          )}
        </div>
        <motion.div
          className="relative"
          initial={fresh && !reduceMotion ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: fresh ? 0.75 : 0 }}
        >
          <p className="pj-display pj-gold-text text-[32px] sm:text-[36px] font-black leading-none">{t('jackpot.daily.rewardTitle')}</p>
          <p className="mt-2 text-[14px] leading-snug" style={{ color: '#E6DEFA' }}>
            {t('jackpot.daily.rewardBody')}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-[12.5px] font-semibold" style={{ background: 'rgba(94,168,255,0.18)', color: '#CFE3FF' }}>
            <ChipFace className="w-4 h-4" />
            {t('jackpot.daily.rewardCount', { count: tickets })}
          </p>
        </motion.div>
      </div>
      {/* A ponte para as missões, que vêm logo embaixo. */}
      <motion.p
        className="flex items-center justify-center gap-1.5 text-[14px] font-semibold text-center"
        style={{ color: '#FFE8A3' }}
        initial={fresh && !reduceMotion ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: fresh ? 1.15 : 0 }}
      >
        {t('jackpot.daily.bridge')}
        <ChevronDown className="pj-daily-arrow w-4 h-4 shrink-0" aria-hidden />
      </motion.p>
    </div>
  );
};
