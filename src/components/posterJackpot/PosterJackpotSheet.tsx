import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Crown, Gift, Loader2, Lock, RotateCw, Sparkles, Ticket, Trophy } from 'lucide-react';
import OracleSheet, { SheetFade } from '../OracleSheet';
import PosterArt, { EffectTag, RarityTag } from './PosterArt';
import { MOOD_BY_KEY } from '../../lib/moods';
import { ORACLE_BY_ID, PAPER, MIST, PIXEL, FOCUS_RING, VELVET, type OracleId } from '../../lib/oracleTheme';
import {
  RARITIES,
  RARITY_META,
  EFFECT_META,
  FRAGMENTS_PER_TICKET,
  claimMission,
  equipPoster,
  fetchJackpotState,
  loadMyPosters,
  notifyPostersChanged,
  pullJackpot,
  titleOf,
  unequipPoster,
  type JackpotMission,
  type JackpotState,
  type OwnedPoster,
  type PosterRarity,
  type PullResult,
} from '../../lib/posterJackpot';
import '../../styles/posterJackpot.css';

// Poster Jackpot (30/10/2026): a máquina de cápsulas do Oracle Hub, inspirada
// nas máquinas de cápsula dos jogos (gabinete laranja, cúpula de vidro com as
// cápsulas, a barra do próximo prêmio, a manivela e a saída embaixo). Três
// abas: a máquina, a coleção (equipar/desequipar) e as missões da semana.

type Tab = 'machine' | 'collection' | 'missions';
type TicketKind = 'normal' | 'special';

// As cápsulas da cúpula: posição fixa (em %), tamanho e raridade. Mais
// comuns que raras, como as chances.
const CAPSULES: { x: number; y: number; s: number; r: PosterRarity; a: number }[] = (() => {
  const rows = [
    { y: 80, xs: [4, 18, 32, 46, 60, 74, 88] },
    { y: 64, xs: [10, 24, 38, 53, 67, 81] },
    { y: 49, xs: [3, 16, 30, 45, 59, 73, 87] },
    { y: 35, xs: [12, 27, 42, 57, 72] },
    { y: 22, xs: [22, 40, 58] },
  ];
  const pattern: PosterRarity[] = ['common', 'rare', 'common', 'epic', 'common', 'rare', 'common', 'legendary', 'common', 'rare', 'common', 'common', 'epic', 'rare'];
  const out: { x: number; y: number; s: number; r: PosterRarity; a: number }[] = [];
  let i = 0;
  rows.forEach((row, ri) =>
    row.xs.forEach((x) => {
      out.push({ x: x + ((i * 7) % 5) - 2, y: row.y + ((i * 3) % 4) - 2, s: 15 + ((i * 5 + ri) % 4), r: pattern[i % pattern.length], a: (i * 47) % 360 });
      i += 1;
    })
  );
  return out;
})();

const capsuleBackground = (rarity: PosterRarity) =>
  `linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.6) 46%, rgba(255,255,255,0.25) 50%, ${RARITY_META[rarity].color} 54%, ${RARITY_META[rarity].color} 100%)`;

const Capsule: React.FC<{ rarity: PosterRarity; size: number; className?: string; style?: React.CSSProperties }> = ({ rarity, size, className = '', style }) => (
  <span className={`pj-capsule ${className}`} style={{ width: size, height: size, background: capsuleBackground(rarity), ...style }} aria-hidden />
);

// ---------------------------------------------------------------------------
// A máquina
// ---------------------------------------------------------------------------

const Machine: React.FC<{
  state: JackpotState;
  onState: (patch: Partial<JackpotState>) => void;
  onCollectionChanged: () => void;
}> = ({ state, onState, onCollectionChanged }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const reduceMotion = useReducedMotion();
  const [kind, setKind] = useState<TicketKind>(state.tickets > 0 || !state.specialAvailable ? 'normal' : 'special');
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'dropped' | 'revealed'>('idle');
  const [result, setResult] = useState<PullResult | null>(null);
  const [turns, setTurns] = useState(0);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);

  const canPull = kind === 'special' ? state.specialAvailable : state.tickets > 0;

  const pull = async () => {
    if (phase === 'spinning') return;
    if (!canPull) {
      toast(kind === 'special' ? t('jackpot.machine.noSpecial') : t('jackpot.machine.noTickets'));
      return;
    }
    setPhase('spinning');
    setResult(null);
    setEquipped(false);
    setTurns((n) => n + 1);
    try {
      const [res] = await Promise.all([pullJackpot(kind), new Promise((r) => setTimeout(r, reduceMotion ? 200 : 1300))]);
      setResult(res);
      onState({
        tickets: res.tickets,
        fragments: res.fragments,
        specialAvailable: kind === 'special' ? false : state.specialAvailable,
        owned: state.owned + (res.duplicate ? 0 : 1),
      });
      onCollectionChanged();
      setPhase('dropped');
      if (kind === 'special') setKind('normal');
    } catch (error) {
      console.error('Poster Jackpot pull:', error);
      toast.error(t('jackpot.machine.error'));
      setPhase('idle');
    }
  };

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

  const fragmentPct = (state.fragments / FRAGMENTS_PER_TICKET) * 100;
  const spinning = phase === 'spinning';

  if (phase === 'revealed' && result) {
    const meta = RARITY_META[result.item.rarity];
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="relative mx-auto max-w-sm text-center"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 -top-6 mx-auto w-72 h-72 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(closest-side, ${meta.glow}, transparent 75%)` }}
        />
        <div className="relative mx-auto w-48 sm:w-56">
          <PosterArt
            filePath={result.item.file_path}
            effect={result.effect}
            rarity={result.item.rarity}
            alt={titleOf(result.item, isPt)}
            size="w500"
            animated
            frame
            loading="eager"
            className="aspect-[2/3] rounded-2xl"
          />
          {!result.duplicate && (
            <span className="absolute -top-2 -right-2 rounded-full px-2.5 py-1 text-[12px] font-bold shadow-lg" style={{ background: PAPER, color: '#221B36' }}>
              {t('jackpot.machine.new')}
            </span>
          )}
        </div>
        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-1.5">
          <RarityTag rarity={result.item.rarity} />
          <EffectTag effect={result.effect} />
        </div>
        <p style={{ ...PIXEL, color: PAPER }} className="relative mt-3 text-xl leading-tight">
          {titleOf(result.item, isPt)}
        </p>
        {result.item.year && <p className="relative text-sm" style={{ color: MIST }}>{result.item.year}</p>}
        <p className="relative mt-3 text-sm leading-relaxed" style={{ color: MIST }}>
          {result.duplicate
            ? t('jackpot.machine.duplicate', { count: result.fragmentsGained })
            : result.effect !== 'none'
              ? t('jackpot.machine.newEffect')
              : t('jackpot.machine.newPlain')}
          {result.bonusTickets > 0 && (
            <span className="block mt-1 font-semibold" style={{ color: '#FDE68A' }}>
              {t('jackpot.machine.fragmentTicket', { count: result.bonusTickets })}
            </span>
          )}
        </p>
        <div className="relative mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={equip}
            disabled={equipping || equipped}
            className={`inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${FOCUS_RING}`}
            style={{ background: PAPER, color: '#221B36' }}
          >
            {equipping ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : equipped ? <Check className="w-4 h-4" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
            {equipped ? t('jackpot.collection.equipped') : t('jackpot.collection.equip')}
          </button>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className={`inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-semibold ring-1 ring-white/20 hover:bg-white/5 transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <RotateCw className="w-4 h-4" aria-hidden />
            {t('jackpot.machine.again')}
          </button>
        </div>
        {!equipped && <p className="relative mt-3 text-xs" style={{ color: MIST }}>{t('jackpot.collection.equipHint')}</p>}
      </motion.div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="pj-cabinet rounded-[28px] p-3 sm:p-3.5">
        {/* Letreiro com as chances */}
        <div className="rounded-2xl px-3 pt-2.5 pb-2" style={{ background: 'linear-gradient(180deg, #2a1f45, #160f2a)', boxShadow: 'inset 0 0 0 2px rgba(124,45,18,0.55)' }}>
          <p style={{ ...PIXEL, color: '#FDE68A', textShadow: '0 0 12px rgba(251,191,36,0.55)' }} className="text-center text-[1.65rem] leading-none tracking-wide">
            Poster Jackpot
          </p>
          <ul className="mt-2 grid grid-cols-4 gap-1">
            {[...RARITIES].reverse().map((rarity) => (
              <li
                key={rarity}
                className="rounded-md py-1 text-center"
                style={{ background: 'rgba(255,255,255,0.05)', boxShadow: `inset 0 -2px 0 ${RARITY_META[rarity].color}` }}
              >
                <span className="block text-[10px] font-semibold leading-tight" style={{ color: RARITY_META[rarity].color }}>
                  {t(`jackpot.rarity.${rarity}`)}
                </span>
                <span style={PIXEL} className="block text-sm leading-none text-white/90">
                  {RARITY_META[rarity].odds}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Barra dos fragmentos (o "próximo prêmio" da máquina) */}
        <div className="mt-2.5 rounded-xl px-3 py-2" style={{ background: 'rgba(18,13,34,0.82)' }}>
          <div className="flex items-center justify-between text-[12px]" style={{ color: MIST }}>
            <span>{t('jackpot.machine.fragments')}</span>
            <span style={PIXEL} className="text-sm text-amber-200">
              {state.fragments}/{FRAGMENTS_PER_TICKET}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={FRAGMENTS_PER_TICKET} aria-valuenow={state.fragments} aria-label={t('jackpot.machine.fragments')}>
            <span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400 transition-[width] duration-500" style={{ width: `${fragmentPct}%` }} />
          </div>
        </div>

        {/* A cúpula com as cápsulas */}
        <div className={`pj-glass relative mt-2.5 h-48 sm:h-52 rounded-t-[22px] rounded-b-xl overflow-hidden ${spinning && !reduceMotion ? 'pj-shake' : ''}`}>
          {CAPSULES.map((c, i) => (
            <Capsule key={i} rarity={c.r} size={c.s * 2.6} style={{ left: `${c.x}%`, top: `${c.y}%`, transform: `rotate(${c.a}deg)` }} />
          ))}
          <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(100deg, rgba(255,255,255,0.18), transparent 30%)' }} />
        </div>

        {/* Painel: manivela, tickets e a saída */}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-3 items-center">
          <motion.button
            type="button"
            onClick={pull}
            disabled={spinning}
            aria-label={t('jackpot.machine.spin')}
            className={`relative grid place-items-center w-[104px] h-[104px] rounded-full ${FOCUS_RING}`}
            style={{ background: 'radial-gradient(circle at 35% 30%, #7dd3fc, #2563eb 60%, #1e3a8a)', boxShadow: 'inset 0 -6px 0 rgba(30,58,138,0.7), inset 0 3px 0 rgba(255,255,255,0.45), 0 10px 20px -8px rgba(0,0,0,0.7)' }}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
          >
            <motion.span
              aria-hidden
              className="absolute inset-3 rounded-full"
              style={{ border: '3px solid rgba(255,255,255,0.55)', borderTopColor: 'transparent', borderBottomColor: 'transparent' }}
              animate={{ rotate: turns * 360 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 1.1, ease: [0.3, 0.1, 0.2, 1] }}
            />
            <span style={PIXEL} className="relative text-lg leading-none text-white drop-shadow">
              {spinning ? <Loader2 className="w-6 h-6 animate-spin" aria-hidden /> : t('jackpot.machine.spinShort')}
            </span>
          </motion.button>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('jackpot.machine.ticketKind')}>
              <button
                type="button"
                role="radio"
                aria-checked={kind === 'normal'}
                onClick={() => setKind('normal')}
                className={`flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl text-[12px] font-semibold transition ${FOCUS_RING}`}
                style={kind === 'normal' ? { background: '#2563eb', color: '#fff', boxShadow: 'inset 0 0 0 2px #fde68a' } : { background: 'rgba(124,45,18,0.35)', color: '#ffedd5' }}
              >
                <Ticket className="w-4 h-4" aria-hidden />
                {t('jackpot.machine.tickets', { count: state.tickets })}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={kind === 'special'}
                onClick={() => setKind('special')}
                className={`flex flex-col items-center justify-center gap-0.5 h-14 rounded-xl text-[12px] font-semibold transition ${FOCUS_RING}`}
                style={kind === 'special' ? { background: 'linear-gradient(135deg, #a855f7, #f59e0b)', color: '#fff', boxShadow: 'inset 0 0 0 2px #fde68a' } : { background: 'rgba(124,45,18,0.35)', color: '#ffedd5', opacity: state.specialAvailable ? 1 : 0.7 }}
              >
                {state.premium ? <Crown className="w-4 h-4" aria-hidden /> : <Lock className="w-4 h-4" aria-hidden />}
                {state.specialAvailable ? t('jackpot.machine.special') : state.premium ? t('jackpot.machine.specialUsed') : t('jackpot.machine.specialPremium')}
              </button>
            </div>
            <div className="pj-chute relative h-16 rounded-2xl overflow-hidden grid place-items-center">
              <AnimatePresence>
                {phase === 'dropped' && result && (
                  <motion.button
                    type="button"
                    key="capsule"
                    onClick={() => setPhase('revealed')}
                    initial={reduceMotion ? false : { y: -60, rotate: -40 }}
                    animate={{ y: 0, rotate: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 14 }}
                    className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 ${FOCUS_RING}`}
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  >
                    <Capsule rarity={result.item.rarity} size={40} style={{ position: 'relative', boxShadow: `0 0 18px ${RARITY_META[result.item.rarity].glow}` }} />
                    <span className="text-[13px] font-semibold text-white">{t('jackpot.machine.open')}</span>
                  </motion.button>
                )}
              </AnimatePresence>
              {phase !== 'dropped' && (
                <span className="text-[11px]" style={{ color: 'rgba(253,230,138,0.55)' }}>
                  {spinning ? t('jackpot.machine.spinning') : t('jackpot.machine.chute')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] leading-relaxed" style={{ color: MIST }}>
        {kind === 'special' ? t('jackpot.machine.specialHint') : t('jackpot.machine.effectHint')}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A coleção
// ---------------------------------------------------------------------------

const Collection: React.FC<{ state: JackpotState; version: number }> = ({ state, version }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [list, setList] = useState<OwnedPoster[] | null>(null);
  const [filter, setFilter] = useState<PosterRarity | 'all'>('all');
  const [open, setOpen] = useState<OwnedPoster | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    loadMyPosters()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  const total = state.catalog.total * 4;
  const shown = (list || []).filter((p) => filter === 'all' || p.rarity === filter);
  const countBy = (rarity: PosterRarity) => (list || []).filter((p) => p.rarity === rarity).length;

  const toggleEquip = async (poster: OwnedPoster) => {
    setBusy(true);
    try {
      if (poster.equipped) await unequipPoster(poster.media_type, poster.tmdb_id);
      else await equipPoster(poster.id, poster.effect);
      const fresh = await loadMyPosters();
      setList(fresh);
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
        <Loader2 className="w-6 h-6 animate-spin text-fuchsia-300" aria-hidden />
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm" style={{ color: MIST }}>
        {t('jackpot.collection.progress', { owned: list.length, total })}
      </p>
      <div className="mt-3 -mx-1 px-1 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {(['all', ...RARITIES] as const).map((key) => {
          const active = filter === key;
          const color = key === 'all' ? PAPER : RARITY_META[key].color;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={active}
              className={`shrink-0 h-9 px-3 rounded-full text-[13px] font-medium transition ${FOCUS_RING}`}
              style={{ color: active ? '#221B36' : color, background: active ? color : 'transparent', boxShadow: `inset 0 0 0 1px ${color}` }}
            >
              {key === 'all' ? t('jackpot.collection.all') : `${t(`jackpot.rarity.${key}`)} · ${countBy(key)}/${state.catalog[key] * 4}`}
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="py-12 text-center">
          <Trophy className="w-8 h-8 mx-auto" style={{ color: MIST }} aria-hidden />
          <p className="mt-3 font-medium" style={{ color: PAPER }}>{t('jackpot.collection.empty')}</p>
          <p className="mt-1 text-sm" style={{ color: MIST }}>{t('jackpot.collection.emptyHint')}</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
          {shown.map((poster) => (
            <li key={`${poster.id}:${poster.effect}`}>
              <button type="button" onClick={() => setOpen(poster)} className={`group block w-full text-left rounded-xl ${FOCUS_RING}`}>
                <span className="relative block">
                  <PosterArt
                    filePath={poster.file_path}
                    effect={poster.effect}
                    rarity={poster.rarity}
                    alt={titleOf(poster, isPt)}
                    size="w185"
                    frame
                    className="aspect-[2/3] rounded-xl transition-transform duration-200 group-hover:-translate-y-1"
                  />
                  {poster.equipped && (
                    <span className="absolute top-1.5 right-1.5 grid place-items-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-lg" title={t('jackpot.collection.equipped')}>
                      <Check className="w-3.5 h-3.5" aria-hidden />
                    </span>
                  )}
                  {poster.copies > 1 && (
                    <span
                      style={{ ...PIXEL, background: 'rgba(18,13,34,0.85)' }}
                      className="absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-xs text-white"
                      title={t('jackpot.collection.copies', { count: poster.copies })}
                    >
                      ×{poster.copies}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block truncate text-[12px]" style={{ color: PAPER }}>
                  {titleOf(poster, isPt)}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1">
                  {poster.effect !== 'none' && <EffectTag effect={poster.effect} />}
                </span>
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
              <PosterArt filePath={open.file_path} effect={open.effect} rarity={open.rarity} alt={titleOf(open, isPt)} size="w500" animated frame loading="eager" className="aspect-[2/3] rounded-2xl" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
              <RarityTag rarity={open.rarity} />
              <EffectTag effect={open.effect} />
            </div>
            <p className="mt-2 text-sm" style={{ color: MIST }}>
              {t('jackpot.collection.copies', { count: open.copies })}
            </p>
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
      onState({ tickets: res.tickets, fragments: res.fragments, missions: state.missions.map((m) => (m.key === mission.key ? { ...m, claimed: true } : m)) });
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
                    <span style={PIXEL} className="text-sm tabular-nums" aria-label={t('jackpot.missions.progressAria', { progress: mission.progress, target: mission.target })}>
                      <span style={{ color: PAPER }}>{mission.progress}/{mission.target}</span>
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
          <Gift className="w-4 h-4 shrink-0 mt-0.5 text-amber-200" aria-hidden />
          {t('jackpot.missions.fragmentsRule', { per: FRAGMENTS_PER_TICKET })}
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
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (open) {
      setTab('machine');
      onReload();
    }
  }, [open, onReload]);

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
          <Loader2 className="w-7 h-7 animate-spin text-fuchsia-300" aria-hidden />
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
            {tab === 'machine' && (
              <Machine
                state={state}
                onState={onState}
                onCollectionChanged={() => {
                  setVersion((v) => v + 1);
                }}
              />
            )}
            {tab === 'collection' && <Collection state={state} version={version} />}
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
