import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Loader2, Sparkles } from 'lucide-react';
import PosterArt, { EffectTag } from './PosterArt';
import { SerialLine } from './CollectorMark';
import { PAPER, MIST, FOCUS_RING, withAlpha } from '../../lib/oracleTheme';
import { RARITY_META, titleOf, type PosterEffect, type PosterItem } from '../../lib/posterJackpot';
import '../../styles/posterJackpot.css';

// A revelação do prêmio do Poster Jackpot: raios na cor da raridade, o
// pôster virando, a raridade em Cinzel Decorative, o Nº, o título, o efeito,
// Equipar e Voltar. 04/11/2026: saiu de dentro do PosterJackpotSheet para a
// roleta e o Mercado Negro da Cobra usarem a MESMA revelação (o contrato só
// troca a faixa de cima, "Contrato da Cobra" no lugar de "Giro da Sorte", e a
// linha de baixo). Assim, qualquer ajuste na revelação vale para os dois.

const SPARK_COLORS = ['#FFE8A3', '#F4C454', '#FF7AD9', '#8FE9FF', '#FFFFFF'];
const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

export const Twinkle: React.FC<{ className?: string; color?: string }> = ({ className = '', color = '#FFE8A3' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill={color} />
  </svg>
);

const JackpotReveal: React.FC<{
  item: PosterItem;
  effect: PosterEffect;
  reduceMotion: boolean;
  equipping: boolean;
  equipped: boolean;
  onEquip: () => void;
  onClose: () => void;
  backLabel: string;
  // A faixa acima do pôster (Giro da Sorte, Contrato da Cobra).
  ribbon?: React.ReactNode;
  // Uma linha extra sob o efeito (barra da sorte cheia, chance do contrato).
  note?: React.ReactNode;
  // Na roleta a revelação cobre a máquina (absolute); no Mercado Negro ela
  // ocupa o lugar do balcão, no fluxo da gaveta (a aba pode ser mais alta
  // que a tela, e cobrir tudo esconderia o pôster lá embaixo).
  inline?: boolean;
}> = ({ item, effect, reduceMotion, equipping, equipped, onEquip, onClose, backLabel, ribbon = null, note = null, inline = false }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const meta = RARITY_META[item.rarity];
  const title = titleOf(item, isPt);
  const big = item.rarity === 'legendary' || item.rarity === 'epic';

  const sparks = useMemo(() => {
    const count = { common: 14, rare: 20, epic: 28, legendary: 40 }[item.rarity];
    return Array.from({ length: count }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * (big ? 170 : 110);
      const second = item.rarity === 'legendary' && i % 2 === 1;
      return {
        dx: `${Math.cos(angle) * distance}px`,
        dy: `${Math.sin(angle) * distance}px`,
        s: `${6 + Math.random() * (big ? 12 : 8)}px`,
        c: i % 4 === 0 ? meta.color : pick(SPARK_COLORS),
        d: `${1.1 + Math.random() * 0.8}s`,
        delay: `${(second ? 0.7 : 0.15) + Math.random() * 0.3}s`,
      };
    });
  }, [item, big, meta.color]);

  return (
    <motion.div
      key="reveal"
      role="dialog"
      aria-modal="false"
      aria-label={t('jackpot.machine.revealAria', { rarity: t(`jackpot.rarity.${item.rarity}`), title })}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`${inline ? 'relative flex min-h-[460px]' : 'absolute inset-0 z-20'} overflow-hidden rounded-[30px]`}
      style={{ background: `radial-gradient(70% 55% at 50% 40%, ${withAlpha(meta.color, 0.28)}, transparent 70%), linear-gradient(180deg, #0f1645, #0a0e2c 60%, #150a33)` }}
    >
      <span className="pj-stars" aria-hidden />
      <span className="pj-rays" aria-hidden style={{ ['--pj-ray' as string]: withAlpha(meta.color, big ? 0.55 : 0.35) }} />
      {!reduceMotion && <span className="pj-flash" aria-hidden />}
      {!reduceMotion &&
        sparks.map((spark, i) => (
          <span
            key={i}
            aria-hidden
            className="pj-spark"
            style={{ ['--dx' as string]: spark.dx, ['--dy' as string]: spark.dy, ['--s' as string]: spark.s, ['--c' as string]: spark.c, ['--d' as string]: spark.d, ['--delay' as string]: spark.delay }}
          />
        ))}

      <div className={`relative ${inline ? 'flex-1 py-5' : 'h-full overflow-y-auto py-6 sm:py-7'} px-5 flex flex-col items-center justify-center text-center`}>
        {ribbon}
        <motion.div
          initial={reduceMotion ? false : { rotateY: 100, scale: 0.6, y: 20 }}
          animate={{ rotateY: 0, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 15, delay: 0.08 }}
          style={{ transformPerspective: 900 }}
          // No fluxo (Mercado Negro) o pôster também acompanha a altura da
          // tela, para Equipar e Voltar caberem sem rolar no celular baixo e
          // no computador.
          className={`${inline ? 'w-[min(40vw,184px,21dvh)]' : 'w-[min(40vw,184px)]'} shrink-0`}
        >
          <PosterArt
            filePath={item.file_path}
            effect={effect}
            alt={title}
            size="w500"
            loading="eager"
            className="aspect-[2/3] rounded-2xl shadow-[0_24px_50px_-18px_rgba(0,0,0,0.95)]"
            mark={{ rarity: item.rarity, serial: item.serial, size: 'md' }}
          />
        </motion.div>

        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 10, letterSpacing: '0.3em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '0.04em' }}
          transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
          className="pj-display mt-4 text-[26px] sm:text-[32px] font-black leading-none"
          style={{ color: meta.color, textShadow: `0 0 18px ${meta.glow}, 0 2px 0 rgba(0,0,0,0.6)` }}
        >
          {t(`jackpot.rarity.${item.rarity}`)}
        </motion.p>
        <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
          <SerialLine rarity={item.rarity} serial={item.serial} className="mt-2 text-[12.5px]" />
          <p className="mt-1.5 text-[15px] font-semibold leading-snug" style={{ color: PAPER }}>
            {title}
            {item.year ? <span className="font-normal" style={{ color: MIST }}> ({item.year})</span> : null}
          </p>
          {effect !== 'none' && <EffectTag effect={effect} className="mt-2" />}
          {note}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onEquip}
              disabled={equipping || equipped}
              className={`pj-spin inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-bold transition disabled:opacity-80 ${FOCUS_RING}`}
            >
              {equipping ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : equipped ? <Check className="w-4 h-4" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
              {equipped ? t('jackpot.collection.equipped') : t('jackpot.collection.equip')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`}
              style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
            >
              {backLabel}
            </button>
          </div>
          <p className="mt-3 text-xs" style={{ color: MIST }}>
            {equipped ? t('jackpot.collection.equipHint') : t('jackpot.machine.savedHint')}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default JackpotReveal;
