import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Eye, Lock, Sparkles } from 'lucide-react';
import type { Card } from '../../../lib/poker/cards';
import { rankOf } from '../../../lib/poker/cards';
import type { PlayerId, Rarity } from '../../../lib/poker/types';
import type { TableShow } from '../../../lib/poker/client/display';
import { HAND_EFFECTS } from '../../../lib/poker/client/display';
import type { CastShow } from '../../../lib/poker/client/useTable';
import { cardsName, fmt, type Lang } from '../../../lib/poker/client/format';
import PosterArt from '../../posterJackpot/PosterArt';
import '../../../styles/posterJackpot.css';
import '../../../styles/posterPoker.css';

// Pôster Poker na mesa (03/11/2026): o pôster mágico flutuando à esquerda do feltro,
// a aproximação + CATCHAW a cada lançada, a faixa do efeito em vigor, as fichas da
// casa voando do pôster até quem ganhou, a caixinha da Cobra e o pôster apostado.

/** O pôster da semana como a mesa precisa (do start/resume do torneio). */
export interface TourneyPoster {
  title: string;
  filePath: string;
  rarity: Rarity;
  serial: number | null;
}

/** O pôster apostado pela pessoa (na frente dela). */
export interface StakeShow {
  title: string;
  filePath: string;
  effect: string;
}

// ---------------------------------------------------------------------------
// A vaga do pôster
// ---------------------------------------------------------------------------

export const MagicPoster: React.FC<{
  poster: TourneyPoster;
  casts: number;
  casting: boolean;
  reduced: boolean;
  onOpen: () => void;
}> = ({ poster, casts, casting, reduced, onOpen }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="pp-magic-slot"
      data-pp-slot
      onClick={onOpen}
      aria-label={t('poker.tourney.posterAria', { title: poster.title })}
    >
      <span className={`pp-magic ${casting ? 'is-casting' : ''}`} aria-hidden>
        <PosterArt filePath={poster.filePath} effect="gold" size="w185" animated={!reduced} loading="eager" />
      </span>
      {casts > 0 && (
        <span className="pp-magic-count" aria-hidden>
          {casts}
        </span>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// O CATCHAW
// ---------------------------------------------------------------------------

// Estrela de quadrinho (o "POW"), 16 pontas, desenhada uma vez.
const BURST = (() => {
  const pts: string[] = [];
  const n = 16;
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? 50 : 36 + ((i * 7) % 5);
    pts.push(`${(160 + Math.cos(a) * r * 3.1).toFixed(1)},${(48 + Math.sin(a) * r * 0.95).toFixed(1)}`);
  }
  return pts.join(' ');
})();

export const CastOverlay: React.FC<{
  cast: CastShow;
  poster: TourneyPoster;
  lang: Lang;
  reduced: boolean;
  onSkip: () => void;
}> = ({ cast, poster, lang, reduced, onSkip }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // De onde o pôster sai: a vaga na mesa (a aproximação começa lá).
  const [from, setFrom] = useState<{ x: number; y: number; s: number } | null>(reduced ? { x: 0, y: 0, s: 1 } : null);
  useLayoutEffect(() => {
    if (reduced) return;
    const root = ref.current;
    const slot = root?.parentElement?.querySelector('[data-pp-slot]') as HTMLElement | null;
    const target = root?.querySelector('[data-pp-cast-poster]') as HTMLElement | null;
    if (!root || !slot || !target) {
      setFrom({ x: 0, y: 120, s: 0.3 });
      return;
    }
    const a = slot.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    setFrom({ x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2), s: Math.max(0.15, a.height / Math.max(1, b.height)) });
  }, [reduced]);

  const name = t(`poker.effects.${cast.effect}.name`);
  const rule = (() => {
    const d = cast.data;
    if (d.effect === 'hand_bounty') return t('poker.effects.hand_bounty.cast', { hand: t(`poker.hands.${d.target}`).toLowerCase(), amount: fmt(d.amount, lang) });
    if (d.effect === 'opal') return t('poker.effects.opal.cast', { card: cardsName([d.card], lang), amount: fmt(d.amount, lang) });
    if (d.effect === 'blackjack') return t('poker.effects.blackjack.cast', { amount: fmt(d.amount, lang) });
    if (d.effect === 'tell') return t('poker.effects.tell.cast', { count: d.hands });
    return t(`poker.effects.${cast.effect}.cast`);
  })();
  const impact = reduced ? 0 : 0.46;
  const still = reduced || !from;

  return (
    <div ref={ref} className="pp-cast" onClick={onSkip} role="status" aria-live="assertive" aria-label={`${t('poker.tourney.catchaw')} ${name}. ${rule}`}>
      <motion.div className="pp-cast-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0.15 : 0.3 }} />
      {!reduced && (
        <>
          <motion.div
            className="pp-cast-rays"
            style={{ top: '58%' }}
            initial={{ opacity: 0, scale: 0.3, rotate: 0 }}
            animate={{ opacity: [0, 1, 0.8], scale: [0.3, 1.15, 1], rotate: 28 }}
            transition={{ delay: impact, duration: 1.6, ease: 'easeOut' }}
          />
          <motion.div className="pp-cast-flash" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ delay: impact, duration: 0.45 }} />
        </>
      )}
      <motion.div
        className="pp-cast-body"
        animate={reduced ? undefined : { x: [0, -7, 6, -3, 0] }}
        transition={{ delay: impact, duration: 0.28 }}
      >
        <motion.div
          className="pp-cast-poster"
          data-pp-cast-poster
          initial={false}
          animate={
            still
              ? { opacity: from ? 1 : 0 }
              : { x: [from.x, 0], y: [from.y, -10, 0], scale: [from.s, 1.12, 1], rotate: [-10, 5, 0], opacity: [0.6, 1, 1] }
          }
          transition={{ duration: still ? 0.2 : 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <PosterArt filePath={poster.filePath} effect="gold" size="w342" animated={!reduced} loading="eager" />
        </motion.div>
        <motion.div
          className="pp-catchaw"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 2.6, rotate: -16 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, rotate: -6 }}
          transition={reduced ? { duration: 0.2 } : { delay: impact, type: 'spring', stiffness: 520, damping: 17 }}
          aria-hidden
        >
          <svg viewBox="0 0 320 96" preserveAspectRatio="none">
            <polygon points={BURST} fill="#e8b54a" stroke="#2a0610" strokeWidth="3" strokeLinejoin="round" />
            <polygon points={BURST} fill="none" stroke="#fff1bf" strokeWidth="1.5" transform="translate(160 48) scale(0.86) translate(-160 -48)" />
          </svg>
          <span className="pp-font">{t('poker.tourney.catchaw')}</span>
        </motion.div>
        <motion.div
          className="pp-cast-name"
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0.1 : impact + 0.35, duration: 0.3 }}
          aria-hidden
        >
          <b className="pp-font pp-gold-letters">{name}</b>
          <span>{rule}</span>
        </motion.div>
      </motion.div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A faixa do efeito em vigor (no lugar da fala quando a mesa está quieta)
// ---------------------------------------------------------------------------

export function effectRibbon(t: (k: string, o?: Record<string, unknown>) => string, table: TableShow, lang: Lang): React.ReactNode {
  const tt = table.tournament;
  if (!tt) return null;
  const a = tt.active;
  const text = (() => {
    // A de mão primeiro (vale agora), depois as que ficam em vigor.
    if (a && HAND_EFFECTS.includes(a.effect) && tt.castHand === table.handNumber) {
      if (a.effect === 'blackjack') return t('poker.effects.blackjack.ribbon', { amount: fmt(a.amount, lang) });
      return t(`poker.effects.${a.effect}.ribbon`);
    }
    if (tt.bounty && !tt.bounty.claimed) return t('poker.effects.hand_bounty.ribbon', { hand: t(`poker.hands.${tt.bounty.target}`).toLowerCase(), amount: fmt(tt.bounty.amount, lang) });
    if (tt.opal && !tt.opal.claimed) return t('poker.effects.opal.ribbon', { card: cardsName([tt.opal.card], lang), amount: fmt(tt.opal.amount, lang) });
    if (tt.tellUntil != null && table.handNumber <= tt.tellUntil) return t('poker.effects.tell.ribbon', { count: tt.tellUntil - table.handNumber + 1 });
    if (tt.aces) return t('poker.effects.eight_aces.ribbon');
    return null;
  })();
  if (!text) return null;
  return (
    <div className="pp-ribbon" role="note">
      <Sparkles className="pp-ribbon-mark" aria-hidden />
      <span className="pp-ribbon-text">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// As fichas da casa voando do pôster até quem ganhou
// ---------------------------------------------------------------------------

export const HouseChips: React.FC<{ bonus: NonNullable<NonNullable<TableShow['tournament']>['lastBonus']> | null; reduced: boolean }> = ({ bonus, reduced }) => {
  const host = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<{ key: number; from: [number, number]; to: [number, number] } | null>(null);
  useLayoutEffect(() => {
    if (!bonus || reduced) return;
    const root = host.current?.parentElement;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const slot = root.querySelector('[data-pp-slot]') as HTMLElement | null;
    const seat = root.querySelector(`[data-seat="${bonus.playerId}"]`) as HTMLElement | null;
    if (!slot || !seat) return;
    const a = slot.getBoundingClientRect();
    const b = seat.getBoundingClientRect();
    setPath({
      key: bonus.key,
      from: [a.left + a.width / 2 - box.left, a.top + a.height / 2 - box.top],
      to: [b.left + b.width / 2 - box.left, b.top + b.height / 2 - box.top],
    });
  }, [bonus, reduced]);
  useEffect(() => {
    if (!path) return;
    const id = window.setTimeout(() => setPath(null), 1300);
    return () => window.clearTimeout(id);
  }, [path]);
  return (
    <div ref={host} aria-hidden style={{ display: 'contents' }}>
      {path &&
        Array.from({ length: 7 }, (_, i) => (
          <motion.span
            key={`${path.key}-${i}`}
            className="pp-fly"
            initial={{ x: path.from[0], y: path.from[1], opacity: 0, scale: 0.6 }}
            animate={{
              x: [path.from[0], (path.from[0] + path.to[0]) / 2 + (i - 3) * 14, path.to[0]],
              y: [path.from[1], Math.min(path.from[1], path.to[1]) - 50 - i * 4, path.to[1]],
              opacity: [0, 1, 1, 0],
              scale: [0.6, 1, 0.8],
            }}
            transition={{ duration: 0.9, delay: i * 0.06, ease: 'easeInOut' }}
          />
        ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Peças pequenas: a caixinha da Cobra, o pôster apostado, o tique, o 21
// ---------------------------------------------------------------------------

export const CobraBox: React.FC = () => {
  const { t } = useTranslation();
  return (
    <span className="pp-cobra-box" role="img" aria-label={t('poker.tourney.cobraBox')}>
      <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden>
        <rect x="3" y="10" width="20" height="13" rx="2" fill="#1a3d22" stroke="#e2c84a" strokeWidth="1.5" />
        <rect x="1.5" y="6" width="23" height="6" rx="1.5" fill="#24502c" stroke="#e2c84a" strokeWidth="1.5" />
        <rect x="11.5" y="6" width="3" height="17" fill="#e2c84a" />
        <path d="M13 6c-2-4-6-4-6-1.5S11 6 13 6zm0 0c2-4 6-4 6-1.5S15 6 13 6z" fill="none" stroke="#e2c84a" strokeWidth="1.4" />
        <text x="7.5" y="20.5" fontSize="8" fontWeight="900" fill="#fff1bf" fontFamily="system-ui, sans-serif">?</text>
      </svg>
    </span>
  );
};

export const StakeThumb: React.FC<{ stake: StakeShow }> = ({ stake }) => {
  const { t } = useTranslation();
  return (
    <span className="pp-stake" role="img" aria-label={t('poker.tourney.stakeAria', { title: stake.title })}>
      <PosterArt filePath={stake.filePath} effect={stake.effect as never} size="w185" animated={false} />
      <Lock aria-hidden />
    </span>
  );
};

export const TellTag: React.FC<{ mark: 'blefe' | 'valor' }> = ({ mark }) => {
  const { t } = useTranslation();
  return (
    <span className={`pp-tell is-${mark}`}>
      <Eye aria-hidden />
      {t(`poker.tourney.tell.${mark}`)}
    </span>
  );
};

/** O valor no 21 de duas cartas (Ás 11 ou 1, figuras e 10 valem 10). */
export function blackjackValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = rankOf(c);
    if (r === 14) {
      aces += 1;
      total += 11;
    } else total += Math.min(10, r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

/** Quem está mais perto de 21 entre as mãos viradas pelo efeito 21. */
export function blackjackLeaders(table: TableShow): Set<PlayerId> {
  const tt = table.tournament;
  if (!tt || tt.active?.effect !== 'blackjack' || tt.castHand !== table.handNumber) return new Set();
  const vals = table.seats
    .filter((s) => s.revealed.length === 2)
    .map((s) => ({ id: s.id, v: blackjackValue(s.revealed) }))
    .filter((x) => x.v <= 21);
  const best = Math.max(0, ...vals.map((x) => x.v));
  return new Set(vals.filter((x) => x.v === best).map((x) => x.id));
}
