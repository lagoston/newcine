import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { Card } from '../../../lib/poker/cards';
import { rankOf, suitOf } from '../../../lib/poker/cards';
import { cardName, langOf } from '../../../lib/poker/client/format';
import { deckLook } from '../cosmetics/looks';

// Baralho Clássico CineOracle (SPEC §7.12): índice grande só no canto de cima,
// naipe sempre com forma (nunca só cor), J/Q/K sem figura — a letra e, a partir
// de 56 px, um emblema em pixel (claquete, rolo, cadeira de diretor).

export type Suit = 's' | 'h' | 'd' | 'c';

const SUIT_PATH: Record<Suit, string> = {
  s: 'M12 2C9.2 6 4 9.2 4 13.6 4 16.2 6 18 8.5 18c1.3 0 2.4-.5 3-1.3L10.4 22h3.2l-1.1-5.3c.6.8 1.7 1.3 3 1.3 2.5 0 4.5-1.8 4.5-4.4C20 9.2 14.8 6 12 2z',
  h: 'M12 21.2s-8.2-5.3-8.2-11.4C3.8 6.6 6.2 4.4 8.9 4.4c1.4 0 2.5.6 3.1 1.7.6-1.1 1.7-1.7 3.1-1.7 2.7 0 5.1 2.2 5.1 5.4 0 6.1-8.2 11.4-8.2 11.4z',
  d: 'M12 2.2l7.2 9.8L12 21.8 4.8 12z',
  c: 'M12 2.6a4.1 4.1 0 0 0-3.7 5.9 4.1 4.1 0 1 0 2.3 6.7l-.5 6.3h3.8l-.5-6.3a4.1 4.1 0 1 0 2.3-6.7A4.1 4.1 0 0 0 12 2.6z',
};

export const SuitIcon: React.FC<{ suit: Suit; className?: string; style?: React.CSSProperties }> = ({ suit, className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden focusable="false">
    <path d={SUIT_PATH[suit]} fill="currentColor" />
  </svg>
);

// Emblemas 8×8 em pixel: J = claquete, Q = rolo de filme, K = cadeira de diretor.
const EMBLEMS: Record<number, string[]> = {
  11: ['#.#.#.#.', '########', '........', '########', '#......#', '#.####.#', '#......#', '########'],
  12: ['..####..', '.#....#.', '#.##.#.#', '#.#..#.#', '#..##..#', '#.#..#.#', '.#....#.', '..####..'],
  13: ['#......#', '########', '#......#', '########', '..#..#..', '.#.##.#.', '#......#', '#......#'],
};

const Emblem: React.FC<{ rank: number }> = ({ rank }) => {
  const rows = EMBLEMS[rank];
  if (!rows) return null;
  return (
    <svg viewBox="0 0 8 8" className="pk-card-emblem" aria-hidden focusable="false" shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        row.split('').map((ch, x) => (ch === '#' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)),
      )}
    </svg>
  );
};

const RANK_TEXT: Record<number, string> = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export type CardSize = 'board' | 'hand' | 'seat' | 'mini' | 'rank' | 'credits';
const SIZE_VAR: Record<CardSize, string> = {
  board: 'var(--board-w, 56px)',
  hand: 'var(--hand-w, 68px)',
  seat: 'var(--seat-card-w, 30px)',
  mini: 'var(--mini-w, 18px)',
  rank: '28px',
  credits: '44px',
};

interface PlayingCardProps {
  card?: Card | null;
  size: CardSize;
  /** Verso (carta fechada). */
  faceDown?: boolean;
  deckId?: string | null;
  fourColor?: boolean;
  best?: boolean;
  dimmed?: boolean;
  /** Entra virando (distribuir/flop). */
  deal?: boolean;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
  decorative?: boolean;
}

const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  size,
  faceDown,
  deckId,
  fourColor,
  best,
  dimmed,
  deal,
  delay = 0,
  className = '',
  style,
  decorative,
}) => {
  const { i18n, t } = useTranslation();
  const reduce = useReducedMotion();
  const sizeStyle = { '--cw': SIZE_VAR[size], ...style } as React.CSSProperties;
  const anim = deal && !reduce
    ? { initial: { opacity: 0, y: -14, rotateY: 90 }, animate: { opacity: 1, y: 0, rotateY: 0 }, transition: { duration: 0.26, delay } }
    : deal
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2, delay } }
      : {};

  if (faceDown || !card) {
    const look = deckLook(deckId);
    return (
      <motion.span
        {...anim}
        className={`pk-card ${className}`}
        style={{ ...sizeStyle, ...look.back, boxShadow: `0 0 0 0.5px ${look.edge}66, 0 2px 6px -2px rgba(0,0,0,0.7)` }}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : t('poker.table.hiddenCard')}
        aria-hidden={decorative ? true : undefined}
      />
    );
  }

  const rank = rankOf(card);
  const suit = suitOf(card) as Suit;
  const tone = suit === 'h' ? 'is-red' : suit === 'd' ? (fourColor ? 'is-blue' : 'is-red') : suit === 'c' && fourColor ? 'is-green' : '';
  const label = RANK_TEXT[rank] ?? String(rank);
  const tiny = size === 'mini' || size === 'rank';
  const showCenter = size === 'board' || size === 'hand' || size === 'credits';

  return (
    <motion.span
      {...anim}
      className={`pk-card ${tone} ${tiny ? 'is-tiny' : ''} ${best ? 'is-best' : ''} ${dimmed ? 'is-dimmed' : ''} ${className}`}
      style={sizeStyle}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : cardName(card, langOf(i18n.language))}
      aria-hidden={decorative ? true : undefined}
    >
      <span className="pk-card-idx" aria-hidden>
        <span className={`pk-card-rank ${rank === 10 ? 'is-ten' : ''}`}>{label}</span>
        {!tiny && <SuitIcon suit={suit} className="pk-card-suit" />}
        {tiny && size === 'rank' && <SuitIcon suit={suit} className="pk-card-suit" />}
      </span>
      {showCenter && (rank >= 11 && rank <= 13 ? <Emblem rank={rank} /> : <SuitIcon suit={suit} className="pk-card-center" />)}
    </motion.span>
  );
};

export default PlayingCard;
