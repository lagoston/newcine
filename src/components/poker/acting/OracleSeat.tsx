import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PIXEL } from '../../../lib/oracleTheme';
import type { Rarity } from '../../../lib/poker/types';
import type { SeatShow } from '../../../lib/poker/client/display';
import { cardArt, characterOf, normalizeStyle, ORACLE_COLOR } from '../../../lib/poker/client/cosmetics';
import { fmt, type Lang } from '../../../lib/poker/client/format';
import type { Emote as EmoteId } from '../../../lib/poker/client/useDirector';
import PlayingCard from '../cards/PlayingCard';
import TableChip from '../cards/TableChip';
import Emote from './Emote';
import WantedPoster from './WantedPoster';
import { CobraBox, TellTag } from '../tournament/TableTourney';
import type { Card } from '../../../lib/poker/cards';

// Um oráculo à mesa (SPEC §7.3 e §7.5). A carta equipada nunca muda: a atuação
// vem de luz (halo na cor dele, aura no all-in), corpo (só transform), sinais
// presos às âncoras (bolhas, fumaça, língua, suor) e selos em pixel. Quem caiu
// fica no lugar, a 80%, em preto e branco, com o carimbo FIM.

export interface OracleSeatProps {
  seat: SeatShow;
  pos: 'left' | 'center' | 'right';
  cardStyle: string;
  deckId?: string | null;
  fourColor?: boolean;
  thinking: boolean;
  speaking: boolean;
  dim: boolean;
  winner: boolean;
  prize: { rarity: Rarity; captured: boolean } | null;
  emote?: EmoteId | null;
  reduced: boolean;
  lang: Lang;
  best5?: string[] | null;
  onPortrait?: () => void;
  /** Pôster Poker: a opala negra (a carta acende onde aparecer). */
  opal?: Card | null;
  /** Pôster Poker: o valor no 21 das cartas viradas pelo efeito. */
  bj?: { value: number; best: boolean } | null;
  /** Pôster Poker: a caixinha do item secreto (só na Cobra, quando ela trouxe). */
  cobraBox?: boolean;
  /**
   * Mesa com amigos (fase 3): uma pessoa sentada no lugar de um oráculo — a foto e o nome
   * dela, sem atuação de oráculo (nada de tique, tilt ou pista de corpo).
   */
  person?: { name: string; avatarUrl: string | null; color: string; away: boolean; left: boolean } | null;
  /** O relógio de 30 s de quem está na vez (só pessoas). */
  clock?: { endsAt: number; total: number } | null;
}

/** Segundos que faltam até `endsAt` (atualiza a cada 250 ms enquanto houver relógio). */
export function useSecondsLeft(endsAt: number | null | undefined): number | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** O anel do relógio em volta do retrato: esvazia em 30 s; vermelho nos últimos 10. */
export const ClockRing: React.FC<{ endsAt: number; total: number; reduced: boolean }> = ({ endsAt, total, reduced }) => {
  const { t } = useTranslation();
  const left = useSecondsLeft(endsAt) ?? 0;
  const frac = Math.max(0, Math.min(1, left / (total / 1000)));
  return (
    <span className={`pf-clock ${left <= 10 ? 'is-late' : ''} ${reduced ? 'is-still' : ''}`} role="timer" aria-label={t('poker.friends.table.clockAria', { count: left })}>
      <svg viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden>
        <rect x="2" y="2" width="96" height="121" rx="11" ry="11" pathLength={100} className="pf-clock-track" />
        <rect x="2" y="2" width="96" height="121" rx="11" ry="11" pathLength={100} className="pf-clock-fill" style={{ strokeDashoffset: 100 - frac * 100 }} />
      </svg>
      <b className="pf-clock-num pk-num" aria-hidden>{left}</b>
    </span>
  );
};

type Act = { body: string; fx: React.ReactNode; badge: string | null; emote: EmoteId | null };

function acting(id: string, cue: SeatShow['cue'], cueKey: number, anchors: { mouth: [number, number]; eyes: [number, number]; top: [number, number] }): Act {
  const at = (p: [number, number]): React.CSSProperties => ({ left: `${p[0]}%`, top: `${p[1]}%` });
  const bubbles = (
    <span className="pk-fx" style={{ ...at(anchors.mouth), width: 1, height: 1 }}>
      <i className="pk-bubble" style={{ left: -6, top: 0, animationDelay: '0s' }} />
      <i className="pk-bubble" style={{ left: 4, top: -4, animationDelay: '1.1s' }} />
      <i className="pk-bubble" style={{ left: -1, top: 2, animationDelay: '2s' }} />
    </span>
  );
  const wisp = (
    <span className="pk-fx" style={{ ...at([anchors.mouth[0] + 16, anchors.mouth[1] - 4]), width: 1, height: 1 }}>
      <i className="pk-smoke" style={{ left: 0, top: 0 }} />
      <i className="pk-smoke" style={{ left: 2, top: 0, animationDelay: '1.7s' }} />
    </span>
  );
  if (id === 'bogart') {
    if (cue === 'confiante') return { body: 'pk-cue-puff', fx: bubbles, badge: 'confiante', emote: null };
    if (cue === 'nervoso')
      return {
        body: 'pk-cue-shake',
        fx: (
          <span key={cueKey} className="pk-fx pk-sweat" style={at([anchors.eyes[0] + 22, anchors.eyes[1]])}>
            <Emote id="sweat" className="" style={{ width: 10, height: 10 }} />
          </span>
        ),
        badge: 'nervoso',
        emote: 'sweat',
      };
    if (cue === 'calado') return { body: 'pk-cue-still', fx: null, badge: 'calado', emote: null };
    return { body: 'pk-breathe', fx: bubbles, badge: null, emote: null };
  }
  if (id === 'cypher') {
    if (cue === 'confiante') return { body: 'pk-cue-tail', fx: null, badge: 'confiante', emote: null };
    if (cue === 'nervoso')
      return {
        body: 'pk-breathe',
        fx: (
          <svg key={cueKey} className="pk-fx pk-tongue" viewBox="0 0 10 9" style={{ ...at([anchors.mouth[0], anchors.mouth[1] + 6]) }} aria-hidden>
            <path d="M4 0h2v4l3 4H7.5L5 5 2.5 8H1l3-4z" fill="#E0233B" />
          </svg>
        ),
        badge: 'nervoso',
        emote: null,
      };
    if (cue === 'calado') return { body: 'pk-cue-still', fx: null, badge: 'calado', emote: null };
    return { body: 'pk-cue-sway', fx: null, badge: null, emote: null };
  }
  // Raposo
  if (cue === 'confiante')
    return {
      body: 'pk-cue-lean',
      fx: <i key={cueKey} className="pk-fx pk-smoke-ring" style={at([anchors.mouth[0], anchors.mouth[1] - 6])} />,
      badge: 'confiante',
      emote: null,
    };
  if (cue === 'nervoso') return { body: 'pk-cue-recline', fx: wisp, badge: 'nervoso', emote: 'hat' };
  if (cue === 'calado') return { body: 'pk-cue-still', fx: null, badge: 'calado', emote: null };
  return { body: 'pk-breathe', fx: wisp, badge: null, emote: null };
}

const OracleSeat: React.FC<OracleSeatProps> = ({
  seat,
  pos,
  cardStyle,
  deckId,
  fourColor,
  thinking,
  speaking,
  dim,
  winner,
  prize,
  emote,
  reduced,
  lang,
  onPortrait,
  opal = null,
  bj = null,
  cobraBox = false,
  person = null,
  clock = null,
}) => {
  const { t } = useTranslation();
  const style = normalizeStyle(cardStyle);
  const ch = characterOf(seat.id);
  const color = person?.color ?? ORACLE_COLOR[seat.id] ?? '#F3EAD3';
  const crop = ch?.crop[style] ?? { focus: '50% 62%', zoom: 1.6 };
  const anchors = ch?.anchors[style] ?? { mouth: [50, 60] as [number, number], eyes: [50, 35] as [number, number], top: [50, 5] as [number, number] };
  const out = seat.status === 'eliminated';
  const folded = seat.status === 'folded';
  const allIn = seat.status === 'allIn';
  // Pessoa: sem atuação de oráculo (só a queda, o pulo da vitória e o "dormindo" ao desistir).
  const act = out || person ? { body: '', fx: null, badge: null, emote: null } : acting(seat.id, seat.cue, seat.cueKey, anchors);
  const body = out ? '' : winner ? 'pk-jump' : folded && !person ? 'pk-cue-recline' : thinking ? 'pk-breathe' : act.body;
  const name = person?.name ?? t(`poker.oracles.${seat.id}.short`, { defaultValue: seat.id });
  // As cartas abertas: a mão inteira (showdown, mostrou, 21) ou a carta que a Leitura virou.
  const open = seat.cards.length === 2 ? seat.cards : seat.revealed;
  const showCards = open.length > 0 && !out;
  const halfOpen = open.length === 1 && seat.hasCards;
  const tag = person ? (folded ? 'zzz' : null) : emote ?? (folded ? 'zzz' : act.emote ?? (seat.tilt === 'veneno' ? 'vein' : null));
  const badgeText = reduced && act.badge && seat.cue ? t(`poker.tells.${seat.id}.${seat.cue}`, { defaultValue: '' }) : '';
  const yugi = style === 'yugioh';

  const pill = (() => {
    if (out) return null;
    if (seat.odds != null && seat.cards.length === 2 && !out)
      return (
        <span className={`pk-pill pk-num ${allIn ? 'is-allin' : ''}`}>
          <span className="pk-odds">{Math.round(seat.odds * 100)}%</span>
          {seat.bet > 0 && fmt(seat.bet, lang)}
        </span>
      );
    if (allIn && seat.last?.allIn)
      return (
        <span className="pk-pill is-allin">
          <span className="pk-display" style={{ fontSize: 11, fontWeight: 900, color: '#FFE8A3' }}>
            {yugi ? 'ALL-IN · ATK' : 'ALL-IN'}
          </span>
          <span className="pk-num">{fmt(yugi ? seat.last.to : seat.bet || seat.last.to, lang)}</span>
        </span>
      );
    if (seat.bet > 0)
      return (
        <span className="pk-pill pk-num">
          <TableChip amount={seat.bet} size={16} />
          {seat.isSB && seat.last?.kind === 'post' && <small>SB</small>}
          {seat.isBB && seat.last?.kind === 'post' && <small>BB</small>}
          {fmt(seat.bet, lang)}
        </span>
      );
    if (seat.last?.kind === 'check') return <span className="pk-pill"><span className="pk-pill-label">{t('poker.table.checked')}</span></span>;
    return null;
  })();

  return (
    <div
      className={`pk-seat ${dim ? 'is-dim' : ''} ${out ? 'is-out' : ''} ${folded ? 'is-folded' : ''} ${allIn ? 'is-allin' : ''} ${speaking ? 'is-speaking' : ''} ${winner ? 'is-winner' : ''} ${seat.tilt === 'veneno' ? 'pk-tilt-venom' : ''}`}
      data-pos={pos}
      data-seat={seat.id}
      data-person={person ? '' : undefined}
      style={{ '--c': color } as React.CSSProperties}
    >
      <div className="pk-actor">
        <span className="pk-halo" aria-hidden />
        <div className={`pk-body ${reduced ? '' : body}`} key={`${seat.cueKey}-${winner ? 'w' : ''}`}>
          <button
            type="button"
            className="pk-portrait-btn"
            onClick={onPortrait}
            aria-label={t('poker.table.seatAria', {
              name,
              stack: fmt(seat.stack, lang),
              status: out ? t('poker.table.out', seat.place ? { place: seat.place, count: seat.place, ordinal: true } : { place: '' }) : folded ? t('poker.table.folded') : thinking ? t('poker.table.thinking') : '',
            })}
          >
            <span className={`pk-portrait ${person ? 'is-person' : ''}`}>
              {person ? (
                person.avatarUrl ? (
                  <img src={person.avatarUrl} alt="" draggable={false} decoding="async" className="pf-face" />
                ) : (
                  <span className="pf-face-initial" style={{ color }}>{(person.name.trim().charAt(0) || '?').toUpperCase()}</span>
                )
              ) : (
                <img
                  src={cardArt(seat.id, cardStyle)}
                  alt=""
                  draggable={false}
                  decoding="async"
                  style={{ '--focus': crop.focus, '--zoom': String(crop.zoom) } as React.CSSProperties}
                />
              )}
              {out && <span className="pk-grain" aria-hidden />}
            </span>
          </button>
          {!reduced && act.fx}
        </div>
        {thinking && !out && !clock && <span className="pk-ring" aria-hidden />}
        {clock && !out && <ClockRing endsAt={clock.endsAt} total={clock.total} reduced={reduced} />}
        {person?.away && !out && <span className="pf-away-tag">{t('poker.friends.table.away')}</span>}
        {thinking && reduced && <span className="pk-thinking-tag">{t('poker.table.thinking')}</span>}
        {out && <span className="pk-stamp pk-display" aria-hidden>{t('poker.table.end')}</span>}
        {tag && !out && <Emote id={tag} horror={style === 'horror'} />}
        {badgeText && <span className="pk-tell-badge" style={{ '--c': color } as React.CSSProperties}>{badgeText}</span>}
        {prize && (
          <motion.span layoutId="pk-wanted" className="pk-wanted" transition={{ duration: reduced ? 0 : 0.7, ease: 'easeInOut' }}>
            <WantedPoster rarity={prize.rarity} />
          </motion.span>
        )}
        {seat.hasCards && !showCards && !out && (
          <span className="pk-minis" aria-hidden>
            <PlayingCard size="mini" faceDown deckId={deckId} decorative />
            <PlayingCard size="mini" faceDown deckId={deckId} decorative />
          </span>
        )}
        {showCards && (
          <span className="pk-shown">
            {open.map((c, i) => (
              <PlayingCard
                key={`${i}-${c}`}
                card={c}
                size="seat"
                fourColor={fourColor}
                best={!!seat.best5?.includes(c) && winner}
                deal={!reduced}
                rotate={i === 0 ? -6 : 5}
                className={opal && c === opal ? 'pp-opal' : ''}
              />
            ))}
            {halfOpen && <PlayingCard size="seat" faceDown deckId={deckId} decorative rotate={5} />}
            {bj && <span className={`pp-bj pk-num ${bj.best ? 'is-best' : ''}`}>{bj.value}</span>}
          </span>
        )}
        {cobraBox && !out && <CobraBox />}
        <AnimatePresence>
          {seat.bonus != null && seat.bonus > 0 && (
            <motion.span
              key={`bonus-${seat.bonus}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: -4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="pp-house absolute left-1/2 -translate-x-1/2 top-[38%] z-10"
            >
              {t('poker.tourney.house', { amount: fmt(seat.bonus, lang) })}
            </motion.span>
          )}
          {seat.won != null && seat.won > 0 && (
            <motion.span
              key={`won-${seat.won}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, y: -18 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="pk-num absolute left-1/2 -translate-x-1/2 top-0 text-[13px] z-10"
              style={{ color: '#FFE8A3', textShadow: '0 1px 0 #000, 0 0 8px rgba(0,0,0,0.8)' }}
            >
              +{fmt(seat.won, lang)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="pk-plate">
        <span className={`pk-plate-name ${person ? 'pf-plate-name' : ''}`} style={person ? { color } : { ...PIXEL, color }}>{name}</span>
        {person?.left ? (
          <span className="pk-plate-note">{t('poker.friends.table.left')}</span>
        ) : out ? (
          <span className="pk-plate-note">{t('poker.table.out', seat.place ? { place: seat.place, count: seat.place, ordinal: true } : { place: '' })}</span>
        ) : (
          <span className="pk-plate-stack pk-num">{fmt(seat.stack, lang)}</span>
        )}
      </div>
      <div className="pk-betrow">
        {seat.isButton && !out && (
          <motion.span layoutId="pk-dealer" className="pk-dealer pk-sans" transition={{ duration: reduced ? 0 : 0.4 }} aria-label={t('poker.table.dealer')}>
            D
          </motion.span>
        )}
        {pill}
        {seat.tell && !out && <TellTag mark={seat.tell} />}
        {folded && !pill && <span className="pk-plate-note">{t('poker.table.folded')}</span>}
      </div>
    </div>
  );
};

export default OracleSeat;
