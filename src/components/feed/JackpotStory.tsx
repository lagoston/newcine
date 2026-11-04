import React, { useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, LayoutGrid, Sparkles } from 'lucide-react';
import { MIST, PAPER, FOCUS_RING, withAlpha } from '../../lib/oracleTheme';
import { RARITY_META, loadJackpotFont, titleOf } from '../../lib/posterJackpot';
import { jackpotPrizeOf, storyTitle, type FeedStory } from '../../lib/friendsFeed';
import PosterArt, { EffectTag } from '../posterJackpot/PosterArt';
import { SerialLine } from '../posterJackpot/CollectorMark';
import WaxSeal from '../posterJackpot/WaxSeal';
import '../../styles/posterJackpot.css';
import './jackpotStory.css';

// Story do Poster Jackpot no visualizador do Feed dos Amigos (02/11/2026):
// quando alguém tira um pôster LENDÁRIO, os amigos veem o momento da
// revelação da roleta adaptado ao story — o céu noturno com estrelas, os
// raios dourados girando, o pôster virando na moldura de ouro (com o efeito
// e a marca de colecionador), "Lendário" em Cinzel Decorative, o número
// ("Nº 008"), a obra e a faixa "Giro da Sorte" quando saiu nele (ou "Do
// Mercado Negro", quando saiu de um contrato da Cobra). Embaixo,
// o convite para girar também (o próprio dono vai para a coleção) e o
// atalho para a obra. Com movimento reduzido, nada vira nem estoura.

const SPARK_COLORS = ['#FFE8A3', '#F4C454', '#FF7AD9', '#8FE9FF', '#FFFFFF'];
// a mesma moldura de ouro do palco da roleta (.pj-stage-frame)
const GOLD_FRAME = 'linear-gradient(160deg, #fff1bf, #f4c454 22%, #a8741a 48%, #ffe8a3 66%, #b8841f 100%)';

const stopTap = (e: React.SyntheticEvent) => e.stopPropagation();

const Twinkle: React.FC<{ className?: string; color?: string }> = ({ className = '', color = '#FFE8A3' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill={color} />
  </svg>
);

// Fundo do cartão: o céu da roleta, com os raios na cor da raridade atrás
// do pôster e o escuro em cima e embaixo (cabeçalho e comentários legíveis).
export const JackpotBackdrop: React.FC<{ story: FeedStory }> = ({ story }) => {
  const prize = jackpotPrizeOf(story);
  const meta = RARITY_META[prize?.rarity ?? 'legendary'];
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `radial-gradient(70% 46% at 50% 40%, ${withAlpha(meta.color, 0.3)}, transparent 72%), radial-gradient(90% 50% at 50% 0%, rgba(80,96,220,0.38), transparent 70%), radial-gradient(80% 45% at 50% 100%, rgba(150,50,200,0.3), transparent 75%), linear-gradient(180deg, #0f1645 0%, #0a0e2c 58%, #150a33 100%)`,
      }}
    >
      <span className="pj-stars" />
      <span className="pj-rays" style={{ top: '40%', ['--pj-ray' as string]: withAlpha(meta.color, 0.5) }} />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to bottom, rgba(10,14,44,0.72), transparent 17%, transparent 66%, rgba(10,14,44,0.94) 90%)' }}
      />
    </div>
  );
};

// O conteúdo (no centro do cartão, onde fica a capa nos stories de obra).
export const JackpotCard: React.FC<{
  story: FeedStory;
  own: boolean;
  // girar a roleta (amigo) ou abrir a coleção (dono)
  onPlay: () => void;
  // abrir a obra do pôster
  onOpenWork?: () => void;
}> = ({ story, own, onPlay, onOpenWork }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const prize = jackpotPrizeOf(story);

  useEffect(() => {
    loadJackpotFont();
  }, []);

  // Faíscas saindo do pôster (sorteadas uma vez por story).
  const sparks = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const distance = 110 + Math.random() * 140;
        return {
          dx: `${Math.cos(angle) * distance}px`,
          dy: `${Math.sin(angle) * distance}px`,
          s: `${6 + Math.random() * 10}px`,
          c: i % 4 === 0 ? RARITY_META.legendary.color : SPARK_COLORS[i % SPARK_COLORS.length],
          d: `${1.1 + Math.random() * 0.8}s`,
          delay: `${(i % 2 ? 0.75 : 0.3) + Math.random() * 0.3}s`,
        };
      }),
    // novas faíscas a cada story
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story.id],
  );

  if (!prize) return null;
  const meta = RARITY_META[prize.rarity];
  const isPt = i18n.language.toLowerCase().startsWith('pt');
  const title = titleOf(prize, isPt) || storyTitle(story, i18n.language);
  const rarityName = t(`jackpot.rarity.${prize.rarity}`);
  const lucky = prize.pull_kind === 'lucky';
  // 04/11/2026: o lendário que saiu de um contrato do Mercado Negro da Cobra
  // ganha a faixa verde da toca (a mesma da revelação do contrato) no lugar
  // da faixa do giro. Ocupa a mesma altura da faixa do Giro da Sorte.
  const contract = prize.pull_kind === 'contract';
  const hasEffect = prize.effect !== 'none';
  // O que o cartão ocupa além do pôster (px), para o pôster ficar com o
  // resto da altura (jackpotStory.css): o fixo + a faixa da sorte, o selo do
  // efeito, o título em duas linhas e o aviso de story oculto.
  const year = prize.year ? ` (${prize.year})` : '';
  const reserve =
    280 + (lucky || contract ? 36 : 0) + (hasEffect ? 28 : 0) + ((title + year).length > 34 ? 22 : 0) + (own && story.hidden ? 44 : 0) - (onOpenWork ? 0 : 44);

  return (
    <div
      className="flex flex-col items-center text-center w-full"
      style={{
        ['--co-jp-reserve' as string]: `${reserve}px`,
        // o que sai no cartão baixo: letreiro, selo do efeito e atalho da obra
        ['--co-jp-compact' as string]: `${17 + (hasEffect ? 28 : 0) + (onOpenWork ? 44 : 0)}px`,
      }}
    >
      <p className="co-jp-eyebrow pj-display pj-gold-text text-[17px] font-black leading-none" style={{ letterSpacing: '0.06em' }}>
        Poster Jackpot
      </p>
      {lucky && (
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="co-jp-ribbon pj-lucky-ribbon mt-2.5"
        >
          <Twinkle className="w-3 h-3" color="#7A4A00" />
          {t('jackpot.lucky.title')}
          <Twinkle className="w-3 h-3" color="#7A4A00" />
        </motion.span>
      )}
      {contract && (
        <motion.span
          initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="co-jp-ribbon pj-contract-ribbon mt-2.5"
        >
          <WaxSeal className="w-[18px] h-[18px] -ml-1" />
          {t('jackpot.contract.storyRibbon')}
        </motion.span>
      )}

      {/* o pôster, virando na moldura de ouro, com a explosão de faíscas */}
      {/* altura: a que sobra no cartão (jackpotStory.css) */}
      <div className="co-jackpot-poster relative mt-4 shrink-0">
        {!reduceMotion && (
          <span
            aria-hidden
            className="pj-flash"
            style={{ inset: '-35% -60%', background: 'radial-gradient(closest-side, rgba(255,236,180,0.85), transparent)' }}
          />
        )}
        {!reduceMotion &&
          sparks.map((spark, i) => (
            <span
              key={i}
              aria-hidden
              className="pj-spark"
              style={{
                top: '50%',
                ['--dx' as string]: spark.dx,
                ['--dy' as string]: spark.dy,
                ['--s' as string]: spark.s,
                ['--c' as string]: spark.c,
                ['--d' as string]: spark.d,
                ['--delay' as string]: spark.delay,
              }}
            />
          ))}
        <motion.div
          initial={reduceMotion ? false : { rotateY: 100, scale: 0.6, y: 18 }}
          animate={{ rotateY: 0, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 15, delay: 0.12 }}
          style={{ transformPerspective: 900 }}
          className="relative h-full"
        >
          <span
            className="block h-full rounded-[18px] p-[3px]"
            style={{
              background: GOLD_FRAME,
              boxShadow: `0 28px 60px -22px rgba(0,0,0,0.95), 0 0 70px -12px ${meta.glow}`,
            }}
          >
            <PosterArt
              filePath={prize.file_path}
              effect={prize.effect}
              alt={`${t('feed.jackpot.label')} · ${title}`}
              size="w500"
              loading="eager"
              className="w-full h-full rounded-[15px]"
              mark={{ rarity: prize.rarity, serial: prize.serial, size: 'md' }}
            />
          </span>
        </motion.div>
      </div>

      <motion.p
        initial={reduceMotion ? false : { opacity: 0, y: 10, letterSpacing: '0.3em' }}
        animate={{ opacity: 1, y: 0, letterSpacing: '0.04em' }}
        transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
        className="pj-display mt-4 text-[30px] font-black leading-none"
        style={{ color: meta.color, textShadow: `0 0 18px ${meta.glow}, 0 2px 0 rgba(0,0,0,0.6)` }}
      >
        {rarityName}
      </motion.p>

      <motion.div
        className="flex flex-col items-center"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <SerialLine rarity={prize.rarity} serial={prize.serial} className="mt-2 text-[13px]" />
        <p className="mt-1.5 max-w-full text-[15px] font-semibold leading-snug line-clamp-2 break-words" style={{ color: PAPER }}>
          {title}
          {prize.year ? <span className="font-normal" style={{ color: MIST }}> ({prize.year})</span> : null}
        </p>
        {hasEffect && <EffectTag effect={prize.effect} className="co-jp-effect mt-2" />}

        {/* o convite em ouro (como o botão de girar) e, menor, a obra — o
            mesmo atalho "Ver detalhes" dos stories de obra */}
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onPointerDown={stopTap}
            onPointerUp={stopTap}
            onClick={onPlay}
            className={`pj-spin inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-bold transition hover:brightness-105 ${FOCUS_RING}`}
          >
            {own ? <LayoutGrid className="w-4 h-4" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
            {own ? t('feed.jackpot.collection') : t('feed.jackpot.play')}
          </button>
          {onOpenWork && (
            <button
              type="button"
              onPointerDown={stopTap}
              onPointerUp={stopTap}
              onClick={onOpenWork}
              className={`co-jp-secondary inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              {prize.media_type === 'tv' ? t('feed.jackpot.viewSeries') : t('feed.jackpot.viewMovie')}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
