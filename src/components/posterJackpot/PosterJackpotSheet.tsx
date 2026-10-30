import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Crown, Loader2, Lock, Sparkles, Ticket, Trophy, Volume2, VolumeX } from 'lucide-react';
import OracleSheet, { SheetFade } from '../OracleSheet';
import PosterArt, { EffectTag, RarityTag } from './PosterArt';
import JackpotReel, { reelKey, type JackpotReelHandle, type ReelCard } from './JackpotReel';
import { MOOD_BY_KEY } from '../../lib/moods';
import { ORACLE_BY_ID, PAPER, MIST, FOCUS_RING, VELVET, withAlpha, type OracleId } from '../../lib/oracleTheme';
import {
  EFFECTS,
  RARITY_META,
  EFFECT_META,
  claimMission,
  equipPoster,
  fetchJackpotCatalog,
  loadJackpotFont,
  loadMyPosters,
  notifyPostersChanged,
  pullErrorCode,
  pullJackpot,
  titleOf,
  unequipPoster,
  type CatalogPoster,
  type JackpotMission,
  type JackpotState,
  type OwnedPoster,
  type PosterEffect,
  type PosterRarity,
  type PullResult,
} from '../../lib/posterJackpot';
import { isJackpotMuted, playReveal, primeJackpotAudio, setJackpotMuted } from '../../lib/jackpotSound';
import '../../styles/posterJackpot.css';

// Poster Jackpot: a roleta do Oracle Hub. Um palco de parque encantado
// (céu estrelado, moldura dourada em arco, lâmpadas de letreiro correndo)
// com a fita de pôsteres do estilo CS:GO, a revelação do prêmio com raios
// na cor da raridade e faíscas, a coleção (só os pôsteres) e as missões.

type Tab = 'machine' | 'collection' | 'missions';
type TicketKind = 'normal' | 'special';

const RARITY_ASC: PosterRarity[] = ['common', 'rare', 'epic', 'legendary'];
const SPARK_COLORS = ['#FFE8A3', '#F4C454', '#FF7AD9', '#8FE9FF', '#FFFFFF'];
const ARCH_BULBS = 17;
const BASE_BULBS = 13;

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const weighted = <T,>(list: T[], weight: (value: T) => number): T => {
  const total = list.reduce((sum, value) => sum + weight(value), 0);
  let roll = Math.random() * total;
  for (const value of list) {
    roll -= weight(value);
    if (roll <= 0) return value;
  }
  return list[list.length - 1];
};

// Monta o sorteador da fita: só versões que ainda podem sair para a pessoa
// (com este ticket), nas mesmas chances do banco.
const makeFiller = (catalog: CatalogPoster[], owned: Set<string>, kind: TicketKind) => {
  const versions: PosterEffect[] = kind === 'special' ? EFFECTS : ['none', ...EFFECTS];
  const open = (item: CatalogPoster) => versions.filter((effect) => !owned.has(`${item.id}:${effect}`));
  const obtainable = catalog.filter((item) => open(item).length > 0);
  const pool = obtainable.length ? obtainable : catalog;
  return (want?: PosterRarity): ReelCard | null => {
    if (!pool.length) return null;
    let rarity = want;
    if (rarity && !pool.some((item) => item.rarity === rarity)) return null;
    if (!rarity) {
      const present = RARITY_ASC.filter((r) => pool.some((item) => item.rarity === r));
      rarity = weighted(present, (r) => RARITY_META[r].odds);
    }
    const item = pick(pool.filter((p) => p.rarity === rarity));
    const free = open(item);
    const effects = (free.length ? free : versions).filter((effect) => effect !== 'none');
    const plain = kind === 'normal' && (free.length ? free : versions).includes('none');
    const effect: PosterEffect =
      plain && (Math.random() > 0.05 || !effects.length)
        ? 'none'
        : effects.length
          ? weighted(effects, (e) => EFFECT_META[e as Exclude<PosterEffect, 'none'>].odds)
          : 'none';
    return { key: reelKey(), item, effect };
  };
};

// ---------------------------------------------------------------------------
// Peças do palco
// ---------------------------------------------------------------------------

// Ângulos das lâmpadas do arco, espaçadas pelo comprimento do arco (e não
// pelo ângulo, que juntaria lâmpadas nas pontas).
const ARCH_ANGLES = (() => {
  const a = 4;
  const steps = 400;
  const lengths = [0];
  for (let k = 1; k <= steps; k++) {
    const t0 = Math.PI - ((k - 1) / steps) * Math.PI;
    const t1 = Math.PI - (k / steps) * Math.PI;
    lengths.push(lengths[k - 1] + Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), Math.sin(t1) - Math.sin(t0)));
  }
  const total = lengths[steps];
  return Array.from({ length: ARCH_BULBS }, (_, i) => {
    const target = (total * i) / (ARCH_BULBS - 1);
    const k = lengths.findIndex((len) => len >= target - 1e-9);
    return Math.PI - (Math.max(0, k) / steps) * Math.PI;
  });
})();

// Lâmpadas correndo pelo arco da moldura e na base.
const Marquee: React.FC<{ fast: boolean }> = ({ fast }) => (
  <div aria-hidden className={`absolute inset-0 pointer-events-none ${fast ? 'pj-fast' : ''}`}>
    {ARCH_ANGLES.map((angle, i) => {
      return (
        <span
          key={`a${i}`}
          className="pj-bulb absolute"
          style={{ left: `calc(${50 + Math.cos(angle) * 45.5}% - 3.5px)`, top: `${10 + (1 - Math.sin(angle)) * 50}px`, ['--i' as string]: i }}
        />
      );
    })}
    <div className="absolute inset-x-6 bottom-2.5 flex justify-between">
      {Array.from({ length: BASE_BULBS }, (_, i) => (
        <span key={`b${i}`} className="pj-bulb" style={{ ['--i' as string]: ARCH_BULBS + i }} />
      ))}
    </div>
  </div>
);

const Twinkle: React.FC<{ className?: string; color?: string }> = ({ className = '', color = '#FFE8A3' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill={color} />
  </svg>
);

// ---------------------------------------------------------------------------
// A revelação
// ---------------------------------------------------------------------------

const Reveal: React.FC<{
  result: PullResult;
  reduceMotion: boolean;
  equipping: boolean;
  equipped: boolean;
  canSpinAgain: boolean;
  onEquip: () => void;
  onAgain: () => void;
  onClose: () => void;
}> = ({ result, reduceMotion, equipping, equipped, canSpinAgain, onEquip, onAgain, onClose }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const meta = RARITY_META[result.item.rarity];
  const title = titleOf(result.item, isPt);
  const big = result.item.rarity === 'legendary' || result.item.rarity === 'epic';

  const sparks = useMemo(() => {
    const count = { common: 14, rare: 20, epic: 28, legendary: 40 }[result.item.rarity];
    return Array.from({ length: count }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const distance = 90 + Math.random() * (big ? 170 : 110);
      const second = result.item.rarity === 'legendary' && i % 2 === 1;
      return {
        dx: `${Math.cos(angle) * distance}px`,
        dy: `${Math.sin(angle) * distance}px`,
        s: `${6 + Math.random() * (big ? 12 : 8)}px`,
        c: i % 4 === 0 ? meta.color : pick(SPARK_COLORS),
        d: `${1.1 + Math.random() * 0.8}s`,
        delay: `${(second ? 0.7 : 0.15) + Math.random() * 0.3}s`,
      };
    });
  }, [result, big, meta.color]);

  return (
    <motion.div
      key="reveal"
      role="dialog"
      aria-modal="false"
      aria-label={t('jackpot.machine.revealAria', { rarity: t(`jackpot.rarity.${result.item.rarity}`), title })}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-20 overflow-hidden rounded-[30px]"
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

      <div className="relative h-full overflow-y-auto px-5 py-6 sm:py-7 flex flex-col items-center justify-center text-center">
        <motion.div
          initial={reduceMotion ? false : { rotateY: 100, scale: 0.6, y: 20 }}
          animate={{ rotateY: 0, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 170, damping: 15, delay: 0.08 }}
          style={{ transformPerspective: 900 }}
          className="w-[min(40vw,184px)] shrink-0"
        >
          <PosterArt
            filePath={result.item.file_path}
            effect={result.effect}
            alt={title}
            size="w500"
            loading="eager"
            className="aspect-[2/3] rounded-2xl shadow-[0_24px_50px_-18px_rgba(0,0,0,0.95)]"
          />
        </motion.div>

        <motion.p
          initial={reduceMotion ? false : { opacity: 0, y: 10, letterSpacing: '0.3em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '0.04em' }}
          transition={{ duration: 0.6, delay: 0.35, ease: 'easeOut' }}
          className="pj-display mt-4 text-[26px] sm:text-[32px] font-black leading-none"
          style={{ color: meta.color, textShadow: `0 0 18px ${meta.glow}, 0 2px 0 rgba(0,0,0,0.6)` }}
        >
          {t(`jackpot.rarity.${result.item.rarity}`)}
        </motion.p>
        <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
          <p className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: PAPER }}>
            {title}
            {result.item.year ? <span className="font-normal" style={{ color: MIST }}> ({result.item.year})</span> : null}
          </p>
          {result.effect !== 'none' && <EffectTag effect={result.effect} className="mt-2" />}
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
              onClick={canSpinAgain ? onAgain : onClose}
              className={`inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`}
              style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
            >
              {canSpinAgain ? t('jackpot.machine.again') : t('jackpot.machine.back')}
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

// ---------------------------------------------------------------------------
// A roleta
// ---------------------------------------------------------------------------

const Machine: React.FC<{
  state: JackpotState;
  owned: OwnedPoster[] | null;
  onState: (patch: Partial<JackpotState>) => void;
  onCollectionChanged: () => void;
}> = ({ state, owned, onState, onCollectionChanged }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const reduceMotion = !!useReducedMotion();
  const reelRef = useRef<JackpotReelHandle>(null);
  const [catalog, setCatalog] = useState<CatalogPoster[] | null>(null);
  const [kind, setKind] = useState<TicketKind>(state.tickets > 0 || !state.specialAvailable ? 'normal' : 'special');
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'landed' | 'revealed'>('idle');
  const [result, setResult] = useState<PullResult | null>(null);
  const [winnerKey, setWinnerKey] = useState<string | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [muted, setMuted] = useState(isJackpotMuted);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchJackpotCatalog()
      .then((list) => alive && setCatalog(list))
      .catch((error) => {
        console.error('Poster Jackpot catalog:', error);
        if (alive) setCatalog([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const ownedSet = useMemo(() => new Set((owned || []).map((p) => `${p.id}:${p.effect}`)), [owned]);
  const filler = useMemo(() => makeFiller(catalog || [], ownedSet, kind), [catalog, ownedSet, kind]);

  const left = kind === 'special' ? state.remainingSpecial : state.remaining;
  const complete = state.remaining <= 0;
  const hasTicket = kind === 'special' ? state.specialAvailable : state.tickets > 0;
  const canSpin = hasTicket && left > 0;
  const spinning = phase === 'spinning';

  const spin = async () => {
    if (busyRef.current || !catalog?.length) return;
    if (complete) {
      toast(t('jackpot.machine.complete'));
      return;
    }
    if (!hasTicket) {
      toast(kind === 'special' ? (state.premium ? t('jackpot.machine.noSpecial') : t('jackpot.machine.specialPremiumHint')) : t('jackpot.machine.noTickets'));
      return;
    }
    if (left <= 0) {
      toast(t('jackpot.machine.specialComplete'));
      return;
    }
    busyRef.current = true;
    primeJackpotAudio();
    setPhase('spinning');
    setWinnerKey(null);
    setEquipped(false);
    reelRef.current?.windUp();
    let res: PullResult;
    try {
      [res] = await Promise.all([pullJackpot(kind), new Promise((r) => setTimeout(r, reduceMotion ? 0 : 430))]);
    } catch (error) {
      const code = pullErrorCode(error);
      console.error('Poster Jackpot pull:', error);
      if (code === 'collection_complete') onState(kind === 'special' ? { remainingSpecial: 0 } : { remaining: 0, remainingSpecial: 0 });
      if (code === 'no_tickets') onState({ tickets: 0 });
      if (code === 'special_used') onState({ specialAvailable: false });
      toast.error(
        code === 'collection_complete'
          ? t(kind === 'special' ? 'jackpot.machine.specialComplete' : 'jackpot.machine.complete')
          : code === 'no_tickets'
            ? t('jackpot.machine.noTickets')
            : code === 'special_used'
              ? t('jackpot.machine.noSpecial')
              : t('jackpot.machine.error')
      );
      setPhase('idle');
      busyRef.current = false;
      return;
    }
    const prize: ReelCard = {
      key: reelKey(),
      item: { id: res.item.id, rarity: res.item.rarity, file_path: res.item.file_path, media_type: res.item.media_type, tmdb_id: res.item.tmdb_id },
      effect: res.effect,
    };
    setResult(res);
    onState({
      tickets: res.tickets,
      specialAvailable: kind === 'special' ? false : state.specialAvailable,
      owned: state.owned + 1,
      remaining: Math.max(0, state.remaining - 1),
      remainingSpecial: Math.max(0, state.remainingSpecial - (res.effect !== 'none' ? 1 : 0)),
    });
    onCollectionChanged();
    await (reelRef.current?.spinTo(prize, { reduceMotion }) ?? Promise.resolve());
    setWinnerKey(prize.key);
    setPhase('landed');
    playReveal(res.item.rarity, res.effect !== 'none');
    try {
      if (res.item.rarity === 'legendary') navigator.vibrate?.([30, 40, 60]);
      else if (res.item.rarity === 'epic') navigator.vibrate?.(40);
    } catch {
      // sem vibração
    }
    if (kind === 'special') setKind('normal');
    window.setTimeout(
      () => {
        setPhase('revealed');
        busyRef.current = false;
      },
      reduceMotion ? 200 : 950
    );
  };

  // "Girar de novo" chama o giro da renderização mais nova (estado em dia).
  const spinRef = useRef(spin);
  spinRef.current = spin;

  const equip = async () => {
    if (!result) return;
    setEquipping(true);
    try {
      await equipPoster(result.item.id, result.effect);
      setEquipped(true);
      onCollectionChanged();
      toast.success(t('jackpot.collection.equippedToast', { title: titleOf(result.item, isPt) }));
    } catch (error) {
      console.error('Poster Jackpot equip:', error);
      toast.error(t('jackpot.collection.equipError'));
    } finally {
      setEquipping(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setJackpotMuted(next);
    setMuted(next);
  };

  const status = complete
    ? t('jackpot.machine.complete')
    : kind === 'special'
      ? state.remainingSpecial > 0
        ? t('jackpot.machine.specialHint')
        : t('jackpot.machine.specialComplete')
      : t('jackpot.machine.remaining', { count: state.remaining });

  const spinLabel = spinning ? t('jackpot.machine.skip') : complete ? t('jackpot.machine.completeShort') : t('jackpot.machine.spinShort');

  return (
    <div className="relative mx-auto max-w-xl">
      <div className="pj-stage-frame" style={{ borderRadius: '50% 50% 30px 30px / 70px 70px 30px 30px' }}>
        <div className="pj-stage px-3 sm:px-5 pt-[64px] sm:pt-[70px] pb-8" style={{ borderRadius: '50% 50% 27px 27px / 67px 67px 27px 27px' }}>
          <span className="pj-stars" aria-hidden />
          <Marquee fast={spinning} />

          <div className="relative text-center">
            <div className="flex items-center justify-center gap-2">
              <Twinkle className="w-3.5 h-3.5 sm:w-4 sm:h-4" color="#FF7AD9" />
              <h3 className="pj-display pj-gold-text text-[28px] sm:text-[38px] font-black leading-none">Poster Jackpot</h3>
              <Twinkle className="w-3.5 h-3.5 sm:w-4 sm:h-4" color="#8FE9FF" />
            </div>
            <p className="mt-1.5 text-[12.5px] sm:text-[13px]" style={{ color: '#CFC6EC' }}>
              {t('jackpot.machine.tagline')}
            </p>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-2.5 sm:gap-x-3.5 gap-y-1">
              {RARITY_ASC.map((rarity) => (
                <li key={rarity} className="inline-flex items-center gap-1 sm:gap-1.5 text-[10.5px] sm:text-[12px]" style={{ color: '#D9D2F2' }}>
                  <span aria-hidden className="w-2 h-2 rotate-45 rounded-[2px]" style={{ background: RARITY_META[rarity].color, boxShadow: `0 0 8px ${RARITY_META[rarity].glow}` }} />
                  {t(`jackpot.rarity.${rarity}`)}
                  <span className="font-semibold tabular-nums" style={{ color: '#FFF4D6' }}>{RARITY_META[rarity].odds}%</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-4">
            {catalog === null ? (
              <div className="pj-reel-window grid place-items-center h-[150px] sm:h-[200px]">
                <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
              </div>
            ) : (
              <JackpotReel ref={reelRef} filler={filler} spinning={spinning} onSkipRequest={() => reelRef.current?.skip()} winnerKey={winnerKey} />
            )}
            {complete && phase === 'idle' && (
              <div className="absolute inset-0 z-[5] grid place-items-center rounded-[18px] text-center px-6" style={{ background: 'rgba(10,14,44,0.82)' }}>
                <div>
                  <Trophy className="w-7 h-7 mx-auto text-amber-300" aria-hidden />
                  <p className="pj-display pj-gold-text mt-2 text-xl font-black">{t('jackpot.machine.completeShort')}</p>
                  <p className="mt-1 text-[13px]" style={{ color: '#CFC6EC' }}>{t('jackpot.machine.completeHint')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controles: a ficha (ticket ou especial) e o botão */}
      <div className="mt-4 flex gap-2">
      <div className="grid flex-1 grid-cols-2 gap-2" role="radiogroup" aria-label={t('jackpot.machine.ticketKind')}>
        <button
          type="button"
          role="radio"
          aria-checked={kind === 'normal'}
          disabled={spinning}
          onClick={() => setKind('normal')}
          className={`pj-token pj-token-normal flex items-center justify-center gap-2 h-12 rounded-2xl text-[13px] font-semibold text-white disabled:cursor-default ${FOCUS_RING}`}
          style={{ opacity: kind === 'normal' ? 1 : 0.6 }}
        >
          <Ticket className="w-4 h-4" aria-hidden />
          {t('jackpot.machine.tickets', { count: state.tickets })}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={kind === 'special'}
          disabled={spinning}
          onClick={() => setKind('special')}
          className={`pj-token pj-token-special flex items-center justify-center gap-2 h-12 rounded-2xl text-[13px] font-semibold text-white disabled:cursor-default ${FOCUS_RING}`}
          style={{ opacity: kind === 'special' ? 1 : state.specialAvailable ? 0.6 : 0.4 }}
        >
          {state.premium ? <Crown className="w-4 h-4" aria-hidden /> : <Lock className="w-4 h-4" aria-hidden />}
          {state.specialAvailable ? t('jackpot.machine.special') : state.premium ? t('jackpot.machine.specialUsed') : t('jackpot.machine.specialPremium')}
        </button>
      </div>
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? t('jackpot.machine.soundOn') : t('jackpot.machine.soundOff')}
          className={`shrink-0 grid place-items-center w-12 h-12 rounded-2xl transition hover:bg-white/10 ${FOCUS_RING}`}
          style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.35)' }}
        >
          {muted ? <VolumeX className="w-5 h-5" aria-hidden /> : <Volume2 className="w-5 h-5" aria-hidden />}
        </button>
      </div>

      <motion.button
        type="button"
        onClick={spinning ? () => reelRef.current?.skip() : spin}
        disabled={phase === 'landed' || (!spinning && (complete || !catalog?.length))}
        aria-label={spinning ? t('jackpot.machine.skipAria') : t('jackpot.machine.spin')}
        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
        className={`pj-spin ${canSpin && phase === 'idle' ? 'pj-ready' : ''} mt-3 w-full h-14 rounded-full pj-display text-[22px] font-black tracking-wide ${FOCUS_RING}`}
      >
        <span className="relative">{spinLabel}</span>
      </motion.button>

      <p className="mt-3 text-center text-[12.5px] leading-relaxed" style={{ color: MIST }} aria-live="polite">
        {status}
      </p>

      <AnimatePresence>
        {phase === 'revealed' && result && (
          <Reveal
            result={result}
            reduceMotion={reduceMotion}
            equipping={equipping}
            equipped={equipped}
            canSpinAgain={(state.tickets > 0 && state.remaining > 0) || (state.specialAvailable && state.remainingSpecial > 0)}
            onEquip={equip}
            onAgain={() => {
              setPhase('idle');
              if (state.tickets <= 0 && state.specialAvailable) setKind('special');
              window.setTimeout(() => void spinRef.current(), 260);
            }}
            onClose={() => setPhase('idle')}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A coleção: só os pôsteres
// ---------------------------------------------------------------------------

const Collection: React.FC<{ list: OwnedPoster[] | null; onChanged: () => void }> = ({ list, onChanged }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [open, setOpen] = useState<OwnedPoster | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleEquip = async (poster: OwnedPoster) => {
    setBusy(true);
    try {
      if (poster.equipped) await unequipPoster(poster.media_type, poster.tmdb_id);
      else await equipPoster(poster.id, poster.effect);
      const fresh = await loadMyPosters();
      onChanged();
      setOpen(fresh.find((p) => p.id === poster.id && p.effect === poster.effect) || null);
      toast.success(poster.equipped ? t('jackpot.collection.unequippedToast') : t('jackpot.collection.equippedToast', { title: titleOf(poster, isPt) }));
    } catch (error) {
      console.error('Poster Jackpot equip:', error);
      toast.error(t('jackpot.collection.equipError'));
    } finally {
      setBusy(false);
    }
  };

  if (!list) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
      </div>
    );
  }

  return (
    <div>
      {list.length === 0 ? (
        <div className="py-12 text-center">
          <Trophy className="w-8 h-8 mx-auto" style={{ color: MIST }} aria-hidden />
          <p className="mt-3 font-medium" style={{ color: PAPER }}>{t('jackpot.collection.empty')}</p>
          <p className="mt-1 text-sm" style={{ color: MIST }}>{t('jackpot.collection.emptyHint')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {list.map((poster) => (
            <li key={`${poster.id}:${poster.effect}`}>
              <button
                type="button"
                onClick={() => setOpen(poster)}
                aria-label={titleOf(poster, isPt)}
                className={`group relative block w-full rounded-xl ${FOCUS_RING}`}
              >
                <PosterArt
                  filePath={poster.file_path}
                  effect={poster.effect}
                  alt=""
                  size="w342"
                  className="aspect-[2/3] rounded-xl shadow-[0_14px_30px_-16px_rgba(0,0,0,0.9)] transition-transform duration-200 group-hover:-translate-y-1"
                />
                {poster.equipped && (
                  <span className="absolute top-1.5 right-1.5 grid place-items-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-lg" title={t('jackpot.collection.equipped')}>
                    <Check className="w-3.5 h-3.5" aria-hidden />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <OracleSheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? titleOf(open, isPt) : ''}
        subtitle={open?.year ? String(open.year) : undefined}
        size="md"
        zIndexClass="z-[10005]"
      >
        {open && (
          <div className="text-center">
            <div className="mx-auto w-44 sm:w-52">
              <PosterArt filePath={open.file_path} effect={open.effect} alt={titleOf(open, isPt)} size="w500" loading="eager" className="aspect-[2/3] rounded-2xl" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              <RarityTag rarity={open.rarity} />
              <EffectTag effect={open.effect} />
            </div>
            <button
              type="button"
              onClick={() => toggleEquip(open)}
              disabled={busy}
              className={`mt-4 inline-flex items-center gap-1.5 h-11 px-5 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
              style={open.equipped ? { color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' } : { background: PAPER, color: '#221B36' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : open.equipped ? null : <Sparkles className="w-4 h-4" aria-hidden />}
              {open.equipped ? t('jackpot.collection.unequip') : t('jackpot.collection.equip')}
            </button>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: MIST }}>
              {open.in_library ? t('jackpot.collection.equipHint') : t('jackpot.collection.notInLibrary')}
            </p>
          </div>
        )}
      </OracleSheet>
    </div>
  );
};

// ---------------------------------------------------------------------------
// As missões
// ---------------------------------------------------------------------------

const Missions: React.FC<{ state: JackpotState; onState: (patch: Partial<JackpotState>) => void }> = ({ state, onState }) => {
  const { t } = useTranslation();
  const [claiming, setClaiming] = useState<string | null>(null);

  const label = (mission: JackpotMission) => {
    if (mission.kind === 'rate_oracle') return t('jackpot.missions.rate_oracle', { oracle: ORACLE_BY_ID[mission.param as OracleId]?.name ?? mission.param });
    if (mission.kind === 'rate_mood') {
      const mood = mission.param ? MOOD_BY_KEY[mission.param] : undefined;
      return t('jackpot.missions.rate_mood', { mood: mood ? t(mood.labelKey) : mission.param });
    }
    return t(`jackpot.missions.${mission.kind}`, { count: mission.target });
  };

  const claim = async (mission: JackpotMission) => {
    setClaiming(mission.key);
    try {
      const res = await claimMission(mission.key);
      onState({ tickets: res.tickets, missions: state.missions.map((m) => (m.key === mission.key ? { ...m, claimed: true } : m)) });
      toast.success(t('jackpot.missions.claimed'));
    } catch (error) {
      console.error('Poster Jackpot claim:', error);
      toast.error(t('jackpot.missions.claimError'));
    } finally {
      setClaiming(null);
    }
  };

  const endsAt = state.weekEndsAt ? new Date(state.weekEndsAt) : null;
  const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: MIST }}>
        {daysLeft !== null ? t('jackpot.missions.resets', { count: daysLeft }) : t('jackpot.missions.resetsMonday')}
      </p>
      <ul className="space-y-2.5">
        {state.missions.map((mission) => {
          const done = mission.progress >= mission.target;
          const accent = mission.kind === 'rate_oracle' ? ORACLE_BY_ID[mission.param as OracleId]?.color : mission.kind === 'rate_mood' && mission.param ? MOOD_BY_KEY[mission.param]?.color : '#F0ABFC';
          return (
            <li key={mission.key} className="rounded-2xl p-3.5 sm:p-4" style={{ background: VELVET, boxShadow: `inset 0 0 0 1px ${done && !mission.claimed ? 'rgba(253,230,138,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
              <div className="flex items-start gap-3">
                <span className="mt-1 w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: accent || '#F0ABFC' }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug" style={{ color: PAPER }}>{label(mission)}</p>
                  <div className="mt-2 flex items-center gap-2.5">
                    <span className="h-1.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                      <span className="block h-full rounded-full" style={{ width: `${(mission.progress / mission.target) * 100}%`, background: accent || '#F0ABFC' }} />
                    </span>
                    <span className="text-sm tabular-nums" aria-label={t('jackpot.missions.progressAria', { progress: mission.progress, target: mission.target })} style={{ color: PAPER }}>
                      {mission.progress}/{mission.target}
                    </span>
                  </div>
                </div>
                {mission.claimed ? (
                  <span className="shrink-0 inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-[12px] font-semibold text-emerald-300">
                    <Check className="w-4 h-4" aria-hidden />
                    {t('jackpot.missions.done')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => claim(mission)}
                    disabled={!done || claiming === mission.key}
                    className={`shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-lg text-[12px] font-semibold transition disabled:opacity-40 ${FOCUS_RING}`}
                    style={done ? { background: '#FDE68A', color: '#221B36' } : { color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
                  >
                    {claiming === mission.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Ticket className="w-3.5 h-3.5" aria-hidden />}
                    {t('jackpot.missions.claim')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl p-3.5 sm:p-4 flex items-start gap-3" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.16), rgba(245,158,11,0.12))', boxShadow: 'inset 0 0 0 1px rgba(253,230,138,0.25)' }}>
        <Crown className="w-5 h-5 shrink-0 mt-0.5 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <p className="font-medium" style={{ color: PAPER }}>{t('jackpot.missions.specialTitle')}</p>
          <p style={{ color: MIST }}>
            {state.premium
              ? state.specialAvailable
                ? t('jackpot.missions.specialReady')
                : t('jackpot.missions.specialUsedWeek')
              : t('jackpot.missions.specialPremiumOnly')}
          </p>
          {!state.premium && (
            <Link to="/premium" className={`mt-1.5 inline-flex items-center gap-1 rounded text-[13px] font-semibold text-amber-200 ${FOCUS_RING}`}>
              {t('jackpot.missions.seePremium')}
            </Link>
          )}
        </div>
      </div>

      <div className="text-[13px] leading-relaxed space-y-1.5" style={{ color: MIST }}>
        <p className="flex items-start gap-2">
          <Twinkle className="w-4 h-4 shrink-0 mt-0.5" color="#FFE8A3" />
          {t('jackpot.missions.noRepeatsRule')}
        </p>
        <p className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-cyan-200" aria-hidden />
          {t('jackpot.missions.effectsRule', {
            holo: EFFECT_META.holo.odds,
            negative: EFFECT_META.negative.odds,
            ultra: EFFECT_META.ultra_red.odds,
          })}
        </p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A gaveta
// ---------------------------------------------------------------------------

const PosterJackpotSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  state: JackpotState | null;
  onState: (patch: Partial<JackpotState>) => void;
  onReload: () => void;
}> = ({ open, onClose, state, onState, onReload }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('machine');
  const [owned, setOwned] = useState<OwnedPoster[] | null>(null);

  const loadOwned = useCallback(() => {
    loadMyPosters()
      .then(setOwned)
      .catch(() => setOwned([]));
  }, []);

  useEffect(() => {
    if (open) {
      loadJackpotFont();
      setTab('machine');
      onReload();
      loadOwned();
    }
  }, [open, onReload, loadOwned]);

  const claimable = useMemo(() => (state?.missions || []).filter((m) => !m.claimed && m.progress >= m.target).length, [state?.missions]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'machine', label: t('jackpot.tabs.machine') },
    { key: 'collection', label: t('jackpot.tabs.collection'), badge: state?.owned || undefined },
    { key: 'missions', label: t('jackpot.tabs.missions'), badge: claimable || undefined },
  ];

  return (
    <OracleSheet
      open={open}
      onClose={onClose}
      title={t('jackpot.title')}
      subtitle={state ? t('jackpot.subtitle', { count: state.tickets }) : undefined}
      size="lg"
      contentKey={tab}
    >
      {!state ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-amber-200" aria-hidden />
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl p-1" style={{ background: VELVET }} role="tablist">
            {tabs.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={`relative h-10 rounded-lg text-sm font-semibold transition ${FOCUS_RING}`}
                  style={active ? { background: PAPER, color: '#221B36' } : { color: MIST }}
                >
                  {item.label}
                  {item.badge ? (
                    <span
                      className="ml-1.5 inline-grid place-items-center min-w-[1.25rem] h-5 px-1 rounded-full text-[11px] tabular-nums"
                      style={item.key === 'missions' ? { background: '#FDE68A', color: '#221B36' } : { background: active ? 'rgba(34,27,54,0.12)' : 'rgba(255,255,255,0.1)' }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <SheetFade id={tab}>
            {tab === 'machine' && <Machine state={state} owned={owned} onState={onState} onCollectionChanged={loadOwned} />}
            {tab === 'collection' && <Collection list={owned} onChanged={loadOwned} />}
            {tab === 'missions' && <Missions state={state} onState={onState} />}
          </SheetFade>
        </>
      )}
    </OracleSheet>
  );
};

export default PosterJackpotSheet;

// Usado pela porta do Hub e pelo menu da biblioteca: recarrega tudo.
export const refreshPosters = notifyPostersChanged;
