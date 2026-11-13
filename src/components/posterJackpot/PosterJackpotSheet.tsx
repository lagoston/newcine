import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Copy, Crown, Gift, Loader2, Maximize2, Share2, Sparkles, Trophy, Volume2, VolumeX } from 'lucide-react';
import OracleSheet, { SheetFade } from '../OracleSheet';
import PosterArt, { EffectTag, RarityTag } from './PosterArt';
import { RarityGem, SerialLine } from './CollectorMark';
import ChipRack, { ChipFace, type ChipKind } from './Chips';
import LuckyMeter from './LuckyMeter';
import { getMovieDetails, type Movie } from '../../lib/tmdb';
import JackpotReel, { reelKey, type JackpotReelHandle, type ReelCard } from './JackpotReel';
import JackpotReveal, { Twinkle } from './JackpotReveal';
import ContractPanel from './ContractPanel';
import { CobraKitShelf, KitReveal, useCobraKits } from './CobraKits';
import { ackCobraKitDrops, equipCobraKit, kitName, type CobraKit, type CobraKitDrop } from '../../lib/cobraKits';
import { MOOD_BY_KEY } from '../../lib/moods';
import { ORACLE_BY_ID, PAPER, MIST, FOCUS_RING, VELVET, type OracleId } from '../../lib/oracleTheme';
import {
  EFFECTS,
  RARITY_META,
  EFFECT_META,
  LUCKY_ODDS,
  claimMission,
  equipPoster,
  fetchJackpotCatalog,
  getContractBoard,
  loadJackpotFont,
  loadMyPosters,
  nextFriday13,
  notifyPostersChanged,
  pullErrorCode,
  pullJackpot,
  specialFields,
  titleOf,
  unequipPoster,
  type CatalogPoster,
  type ContractBoard,
  type JackpotMission,
  type DailyReward,
  type JackpotState,
  type OwnedPoster,
  type PosterEffect,
  type PosterRarity,
  type PullKind,
  type PullResult,
} from '../../lib/posterJackpot';
import { isJackpotMuted, playReveal, primeJackpotAudio, setJackpotMuted } from '../../lib/jackpotSound';
import { INVITE_REWARD, copyInvite, getMyInvite, shareInvite, type MyInvite } from '../../lib/invite';
import { getMyTrades, type PosterTrade } from '../../lib/posterTrades';
import PosterTradesPanel from './PosterTradesPanel';
import { DailyChipReward } from './DailyChip';
import TablePrizeSeal from '../poker/jackpot/TablePrizeSeal';
import '../../styles/posterJackpot.css';

// O menu expandido do título (aberto ao tocar no pôster no detalhe da
// coleção). Carregado sob demanda: o MovieDetailsModal também mostra
// pôsteres do Jackpot, e assim os dois módulos não se puxam na carga.
const MovieDetailsModal = lazy(() => import('../MovieDetailsModal'));

// Poster Jackpot: a roleta do Oracle Hub. Um palco de parque encantado
// (céu estrelado, moldura dourada em arco, lâmpadas de letreiro correndo)
// com a fita de pôsteres do estilo CS:GO, a revelação do prêmio com raios
// na cor da raridade e faíscas, a coleção (só os pôsteres) e as missões.

// 03/11/2026 (tarde), pedido do Bruno: o pôquer virou um jogo à parte (Pôster
// Poker, botão próprio na home) e a aba Pôquer saiu da gaveta. Voltam as 4 abas.
// 04/11/2026: a 5ª aba, Contrato (o Mercado Negro da Cobra), logo depois da
// Coleção — é de lá que saem os pôsteres que entram no contrato.
export type JackpotTab = 'machine' | 'collection' | 'contract' | 'trades' | 'missions';
type Tab = JackpotTab;

const RARITY_ASC: PosterRarity[] = ['common', 'rare', 'epic', 'legendary'];
const ARCH_BULBS = 17;
const BASE_BULBS = 13;

// 04/11/2026 (piscada ao voltar para a Roleta): o catálogo já buscado nesta
// visita. A busca fica guardada em lib/posterJackpot, mas como promessa: a
// Roleta remontada abria um quadro com o "carregando" (e a janela da fita
// 20 px mais baixa) antes da fita, a cada troca de aba. Com o catálogo à mão,
// a fita já sai no primeiro quadro.
let catalogMemo: CatalogPoster[] | null = null;

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
// (com esta ficha ou no Giro da Sorte), nas mesmas chances do banco. No Giro
// da Sorte a fita só mostra épicos e lendários, meio a meio.
const makeFiller = (catalog: CatalogPoster[], owned: Set<string>, kind: PullKind) => {
  const versions: PosterEffect[] = kind === 'special' ? EFFECTS : ['none', ...EFFECTS];
  const open = (item: CatalogPoster) => versions.filter((effect) => !owned.has(`${item.id}:${effect}`));
  const obtainable = catalog.filter((item) => open(item).length > 0);
  const lucky = kind === 'lucky' ? obtainable.filter((item) => LUCKY_ODDS[item.rarity]) : [];
  const pool = lucky.length ? lucky : obtainable.length ? obtainable : catalog;
  const odds = (r: PosterRarity) => (kind === 'lucky' && LUCKY_ODDS[r]) || RARITY_META[r].odds;
  return (want?: PosterRarity): ReelCard | null => {
    if (!pool.length) return null;
    let rarity = want;
    if (rarity && !pool.some((item) => item.rarity === rarity)) return null;
    if (!rarity) {
      const present = RARITY_ASC.filter((r) => pool.some((item) => item.rarity === r));
      rarity = weighted(present, odds);
    }
    const item = pick(pool.filter((p) => p.rarity === rarity));
    const free = open(item);
    const effects = (free.length ? free : versions).filter((effect) => effect !== 'none');
    const plain = kind !== 'special' && (free.length ? free : versions).includes('none');
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

// ---------------------------------------------------------------------------
// A roleta
// ---------------------------------------------------------------------------

const Machine: React.FC<{
  state: JackpotState;
  owned: OwnedPoster[] | null;
  onState: (patch: Partial<JackpotState>) => void;
  onCollectionChanged: () => void;
  onInvite: () => void;
  // A fita parada guardada entre as trocas de aba (ver JackpotReel).
  reelParkId: number;
}> = ({ state, owned, onState, onCollectionChanged, onInvite, reelParkId }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const reduceMotion = !!useReducedMotion();
  const reelRef = useRef<JackpotReelHandle>(null);
  const [catalog, setCatalog] = useState<CatalogPoster[] | null>(() => catalogMemo);
  // A ficha escolhida no porta-fichas.
  const [kind, setKind] = useState<ChipKind>(state.tickets > 0 || !state.specialAvailable ? 'normal' : 'special');
  // Um Giro da Sorte em andamento (do toque na barra até fechar a revelação).
  const [luckyRun, setLuckyRun] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'landed' | 'revealed'>('idle');
  const [result, setResult] = useState<PullResult | null>(null);
  const [winnerKey, setWinnerKey] = useState<string | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [muted, setMuted] = useState(isJackpotMuted);
  // A casa da barra que acabou de acender.
  const [freshCell, setFreshCell] = useState<number | null>(null);
  const busyRef = useRef(false);
  // Kits da Cobra (11/11/2026): 20% dos giros com ficha especial trazem um
  // kit (moldura + banner) JUNTO com o pôster. A revelação do kit vem depois
  // que a pessoa fecha a do pôster.
  const cobra = useCobraKits();
  const [kitDrop, setKitDrop] = useState<CobraKitDrop | null>(null);
  const [showKit, setShowKit] = useState(false);
  const [kitEquipping, setKitEquipping] = useState(false);
  const [kitEquipped, setKitEquipped] = useState(false);
  const kitOf = (drop: CobraKitDrop | null): CobraKit | null => (drop && cobra.state?.kits.find((k) => k.id === drop.kit_id)) || null;
  const kitsMissing = cobra.state ? cobra.state.kits.some((k) => !k.owned) : false;
  const kitPct = Math.round((cobra.state?.chance ?? 0.2) * 100);
  // Uma revelação que ficou para trás (a gaveta fechou antes de ver) aparece
  // uma vez, quando a roleta abre de novo.
  const pendingCheckedRef = useRef(false);
  useEffect(() => {
    if (pendingCheckedRef.current || !cobra.state) return;
    pendingCheckedRef.current = true;
    const first = cobra.state.unseen[0];
    if (first && phase === 'idle') {
      setKitDrop(first);
      setShowKit(true);
    }
  }, [cobra.state, phase]);

  const closeKit = () => {
    const drop = kitDrop;
    setShowKit(false);
    setKitDrop(null);
    setKitEquipped(false);
    if (drop) {
      ackCobraKitDrops([drop.id])
        .catch((error) => console.error('Kits da Cobra (visto):', error))
        .finally(() => cobra.reload());
    }
  };

  const equipKit = async () => {
    const kit = kitOf(kitDrop);
    if (!kit) return;
    setKitEquipping(true);
    try {
      const used = await equipCobraKit(kit.id);
      setKitEquipped(true);
      cobra.setLook((look) => (look ? { ...look, frame: used.frameId, banner: used.bannerId } : look));
      toast.success(t('jackpot.kits.usedToast', { name: kitName(kit, isPt) }));
    } catch (error) {
      console.error('Kits da Cobra (usar):', error);
      toast.error(t('jackpot.kits.useError'));
    } finally {
      setKitEquipping(false);
    }
  };

  useEffect(() => {
    let alive = true;
    fetchJackpotCatalog()
      .then((list) => {
        catalogMemo = list;
        if (alive) setCatalog(list);
      })
      .catch((error) => {
        console.error('Poster Jackpot catalog:', error);
        if (alive) setCatalog([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const reelMode: PullKind = luckyRun ? 'lucky' : kind;
  const ownedSet = useMemo(() => new Set((owned || []).map((p) => `${p.id}:${p.effect}`)), [owned]);
  const filler = useMemo(() => makeFiller(catalog || [], ownedSet, reelMode), [catalog, ownedSet, reelMode]);

  const left = kind === 'special' ? state.remainingSpecial : state.remaining;
  const complete = state.remaining <= 0;
  const hasChip = kind === 'special' ? state.specialAvailable : state.tickets > 0;
  const canSpin = hasChip && left > 0;
  const spinning = phase === 'spinning';

  const run = async (pullKind: PullKind) => {
    if (busyRef.current || !catalog?.length) return;
    if (complete) {
      toast(t('jackpot.machine.complete'));
      return;
    }
    if (pullKind === 'lucky') {
      if (state.luckySpins < 1) return;
    } else {
      if (!hasChip) {
        toast(kind === 'special' ? t('jackpot.machine.noSpecial') : t('jackpot.machine.noTickets'));
        return;
      }
      if (left <= 0) {
        toast(t('jackpot.machine.specialComplete'));
        return;
      }
    }
    busyRef.current = true;
    primeJackpotAudio();
    setLuckyRun(pullKind === 'lucky');
    setPhase('spinning');
    setWinnerKey(null);
    setEquipped(false);
    setFreshCell(null);
    reelRef.current?.windUp();
    let res: PullResult;
    try {
      [res] = await Promise.all([pullJackpot(pullKind), new Promise((r) => setTimeout(r, reduceMotion ? 0 : 430))]);
    } catch (error) {
      const code = pullErrorCode(error);
      console.error('Poster Jackpot pull:', error);
      if (code === 'collection_complete') onState(pullKind === 'special' ? { remainingSpecial: 0 } : { remaining: 0, remainingSpecial: 0 });
      if (code === 'no_tickets') onState({ tickets: 0 });
      if (code === 'no_special') onState(specialFields(false, 0));
      if (code === 'no_lucky') onState({ luckySpins: 0 });
      toast.error(
        code === 'collection_complete'
          ? t(pullKind === 'special' ? 'jackpot.machine.specialComplete' : 'jackpot.machine.complete')
          : code === 'no_tickets'
            ? t('jackpot.machine.noTickets')
            : code === 'no_special'
              ? t('jackpot.machine.noSpecial')
              : code === 'no_lucky'
                ? t('jackpot.lucky.none')
                : t('jackpot.machine.error')
      );
      setLuckyRun(false);
      setPhase('idle');
      busyRef.current = false;
      return;
    }
    // Giro com ficha especial: o banco já decidiu se veio kit; a pergunta
    // corre junto com a fita.
    const kitsAfter = pullKind === 'special' ? cobra.reload() : Promise.resolve(null);
    const prize: ReelCard = {
      key: reelKey(),
      item: { id: res.item.id, rarity: res.item.rarity, serial: res.item.serial, file_path: res.item.file_path, media_type: res.item.media_type, tmdb_id: res.item.tmdb_id },
      effect: res.effect,
    };
    setResult(res);
    // As fichas saem do porta-fichas na hora; a barra só anda quando a fita
    // para (para não entregar o resultado antes).
    onState({
      tickets: res.tickets,
      ...specialFields(res.specialWeekly, res.specialTickets),
      ...(pullKind === 'lucky' ? { luckySpins: res.luckySpins } : {}),
      owned: state.owned + 1,
      remaining: Math.max(0, state.remaining - 1),
      remainingSpecial: Math.max(0, state.remainingSpecial - (res.effect !== 'none' ? 1 : 0)),
    });
    onCollectionChanged();
    await (reelRef.current?.spinTo(prize, { reduceMotion }) ?? Promise.resolve());
    const kitsNow = await kitsAfter;
    setKitDrop(kitsNow?.unseen[kitsNow.unseen.length - 1] ?? null);
    setWinnerKey(prize.key);
    setPhase('landed');
    playReveal(res.item.rarity, res.effect !== 'none');
    if (pullKind !== 'lucky') {
      onState({ luckyProgress: res.luckyProgress, luckySpins: res.luckySpins });
      setFreshCell(res.luckyEarned ? null : res.luckyProgress - 1);
    }
    try {
      if (res.item.rarity === 'legendary') navigator.vibrate?.([30, 40, 60]);
      else if (res.item.rarity === 'epic' || res.luckyEarned) navigator.vibrate?.(40);
    } catch {
      // sem vibração
    }
    if (pullKind === 'special' && !res.specialWeekly && res.specialTickets <= 0) setKind('normal');
    window.setTimeout(
      () => {
        setPhase('revealed');
        busyRef.current = false;
      },
      reduceMotion ? 200 : 950
    );
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

  const toggleMute = () => {
    const next = !muted;
    setJackpotMuted(next);
    setMuted(next);
  };

  // Sem contagem de "faltam N pôsteres" (pedido do Bruno, 31/10).
  const status = complete
    ? t('jackpot.machine.complete')
    : luckyRun
      ? ''
      : kind === 'special'
        ? state.remainingSpecial > 0
          ? `${t('jackpot.machine.specialHint')}${kitsMissing ? ` ${t('jackpot.kits.chanceHint', { pct: kitPct })}` : ''}`
          : t('jackpot.machine.specialComplete')
        : '';

  // As chances no letreiro: as do giro com ficha ou as do Giro da Sorte.
  const odds: { rarity: PosterRarity; odds: number }[] = luckyRun
    ? (['epic', 'legendary'] as PosterRarity[]).map((rarity) => ({ rarity, odds: LUCKY_ODDS[rarity] || 0 }))
    : RARITY_ASC.map((rarity) => ({ rarity, odds: RARITY_META[rarity].odds }));

  return (
    <div className="relative mx-auto max-w-xl">
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={muted}
        aria-label={muted ? t('jackpot.machine.soundOn') : t('jackpot.machine.soundOff')}
        className={`pj-sound ${FOCUS_RING}`}
      >
        {muted ? <VolumeX className="w-4 h-4" aria-hidden /> : <Volume2 className="w-4 h-4" aria-hidden />}
      </button>

      <div className="pj-stage-frame" style={{ borderRadius: '50% 50% 30px 30px / 70px 70px 30px 30px' }}>
        <div className={`pj-stage ${luckyRun ? 'pj-lucky' : ''} px-3 sm:px-5 pt-[64px] sm:pt-[66px] pb-8`} style={{ borderRadius: '50% 50% 27px 27px / 67px 67px 27px 27px' }}>
          <span className="pj-stars" aria-hidden />
          {luckyRun && <span className="pj-lucky-wash" aria-hidden />}
          <Marquee fast={spinning} />

          <div className="relative text-center">
            <div className="flex items-center justify-center gap-2">
              <Twinkle className="w-3.5 h-3.5 sm:w-4 sm:h-4" color="#FF7AD9" />
              <h3 className="pj-display pj-gold-text text-[28px] sm:text-[38px] font-black leading-none">Poster Jackpot</h3>
              <Twinkle className="w-3.5 h-3.5 sm:w-4 sm:h-4" color="#8FE9FF" />
            </div>
            <p className="mt-1.5 text-[12.5px] sm:text-[13px]" style={{ color: '#CFC6EC' }}>
              {luckyRun ? t('jackpot.lucky.tagline') : t('jackpot.machine.tagline')}
            </p>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-2 sm:gap-x-3.5 gap-y-1">
              {odds.map(({ rarity, odds: chance }) => (
                <li key={rarity} className="inline-flex items-center gap-[3px] sm:gap-1.5 text-[10.5px] sm:text-[12px]" style={{ color: '#D9D2F2' }}>
                  <RarityGem rarity={rarity} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  {t(`jackpot.rarity.${rarity}`)}
                  <span className="font-semibold tabular-nums" style={{ color: '#FFF4D6' }}>{chance}%</span>
                </li>
              ))}
              {/* Com a ficha especial, a chance do kit da Cobra (enquanto faltar algum). */}
              {kind === 'special' && !luckyRun && kitsMissing && (
                <li className="inline-flex items-center gap-[3px] sm:gap-1.5 text-[10.5px] sm:text-[12px]" style={{ color: '#CFE9DA' }}>
                  <img src="/avatar-cobra.webp" alt="" className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full" />
                  {t('jackpot.kits.oddsLabel')}
                  <span className="font-semibold tabular-nums" style={{ color: '#FFF4D6' }}>{kitPct}%</span>
                </li>
              )}
            </ul>
          </div>

          <div className="relative mt-4">
            {catalog === null ? (
              <div className="pj-reel-window grid place-items-center h-[150px] sm:h-[200px]">
                <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
              </div>
            ) : (
              <JackpotReel ref={reelRef} filler={filler} spinning={spinning} onSkipRequest={() => reelRef.current?.skip()} winnerKey={winnerKey} parkId={reelParkId} />
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

          {/* A barra da sorte, presa na base da máquina */}
          <LuckyMeter
            progress={state.luckyProgress}
            spins={state.luckySpins}
            goal={state.luckyGoal}
            fresh={freshCell}
            active={luckyRun}
            disabled={phase !== 'idle' || complete || !catalog?.length}
            onUse={() => run('lucky')}
          />
        </div>
      </div>

      {/* O porta-fichas e o botão de girar */}
      <div className="mt-3.5 flex items-center gap-2.5 sm:gap-3.5">
        <ChipRack
          className="flex-1"
          normal={state.tickets}
          special={state.specialCount}
          specialAvailable={state.specialAvailable}
          kind={kind}
          onKind={setKind}
          disabled={phase !== 'idle'}
        />
        <span className="pj-spin-collar">
          <motion.button
            type="button"
            onClick={spinning ? () => reelRef.current?.skip() : () => run(kind)}
            disabled={phase === 'landed' || (!spinning && (complete || !catalog?.length))}
            aria-label={spinning ? t('jackpot.machine.skipAria') : complete ? t('jackpot.machine.completeShort') : t('jackpot.machine.spin')}
            whileTap={reduceMotion ? undefined : { scale: 0.95 }}
            className={`pj-spin pj-spin-round ${canSpin && phase === 'idle' && !complete ? 'pj-ready' : ''} grid place-items-center pj-display text-[17px] font-black tracking-wide ${FOCUS_RING}`}
          >
            {complete && !spinning ? <Trophy className="relative w-7 h-7" aria-hidden /> : <span className="relative">{spinning ? t('jackpot.machine.skip') : t('jackpot.machine.spinShort')}</span>}
          </motion.button>
        </span>
      </div>

      {status && (
        <p className="mt-3 text-center text-[12.5px] leading-relaxed" style={{ color: MIST }} aria-live="polite">
          {status}
        </p>
      )}
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={onInvite}
          disabled={spinning}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition hover:bg-white/5 disabled:opacity-50 ${FOCUS_RING}`}
          style={{ color: '#FFD3F1' }}
        >
          <Gift className="w-4 h-4" aria-hidden />
          {t('invite.cta', { count: INVITE_REWARD })}
        </button>
      </div>

      <AnimatePresence>
        {phase === 'revealed' && result && (
          <JackpotReveal
            item={result.item}
            effect={result.effect}
            reduceMotion={reduceMotion}
            equipping={equipping}
            equipped={equipped}
            onEquip={equip}
            backLabel={t('jackpot.machine.back')}
            ribbon={
              result.kind === 'lucky' ? (
                <motion.span
                  initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                  className="pj-lucky-ribbon mb-3 shrink-0"
                >
                  <Twinkle className="w-3 h-3" color="#7A4A00" />
                  {t('jackpot.lucky.title')}
                  <Twinkle className="w-3 h-3" color="#7A4A00" />
                </motion.span>
              ) : null
            }
            note={
              result.luckyEarned ? (
                <p
                  className="mt-3 mx-auto inline-flex items-center gap-2 rounded-full pl-2 pr-3 py-1.5 text-[12.5px] font-semibold leading-snug"
                  style={{ background: 'rgba(244,196,84,0.14)', color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.55)' }}
                >
                  <RarityGem rarity="legendary" glint className="w-4 h-4" />
                  {t('jackpot.lucky.earned')}
                </p>
              ) : null
            }
            onClose={() => {
              setPhase('idle');
              setLuckyRun(false);
              setFreshCell(null);
              if (state.tickets <= 0 && state.specialAvailable && state.remainingSpecial > 0) setKind('special');
              // veio kit junto: a revelação dele entra agora
              if (kitDrop) setShowKit(true);
            }}
          />
        )}
        {showKit && phase === 'idle' && kitOf(kitDrop) && (
          <KitReveal
            kit={kitOf(kitDrop) as CobraKit}
            avatarUrl={cobra.look?.avatarUrl ?? null}
            username={cobra.look?.username ?? ''}
            reduceMotion={reduceMotion}
            equipping={kitEquipping}
            equipped={kitEquipped}
            onEquip={equipKit}
            onClose={closeKit}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// A coleção: só os pôsteres
// ---------------------------------------------------------------------------

const Collection: React.FC<{ list: OwnedPoster[] | null; onChanged: () => void; onLayer?: (open: boolean) => void }> = ({ list, onChanged, onLayer }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  // Os kits da Cobra (11/11/2026), depois dos pôsteres.
  const cobra = useCobraKits();
  const [kitBusy, setKitBusy] = useState<string | null>(null);
  const applyKit = async (kit: CobraKit) => {
    setKitBusy(kit.id);
    try {
      const used = await equipCobraKit(kit.id);
      cobra.setLook((look) => (look ? { ...look, frame: used.frameId, banner: used.bannerId } : look));
      toast.success(t('jackpot.kits.usedToast', { name: kitName(kit, isPt) }));
    } catch (error) {
      console.error('Kits da Cobra (usar):', error);
      toast.error(t('jackpot.kits.useError'));
    } finally {
      setKitBusy(null);
    }
  };
  const [open, setOpen] = useState<OwnedPoster | null>(null);
  const [busy, setBusy] = useState(false);
  // O menu expandido do título, aberto ao tocar no pôster do detalhe.
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loadingMovie, setLoadingMovie] = useState(false);

  // Com o detalhe aberto, o Esc fecha só ele (e não a roleta inteira).
  useEffect(() => {
    onLayer?.(!!open);
  }, [open, onLayer]);
  useEffect(() => () => onLayer?.(false), [onLayer]);

  const openTitle = async (poster: OwnedPoster) => {
    if (loadingMovie) return;
    setLoadingMovie(true);
    try {
      setMovie(await getMovieDetails(poster.tmdb_id, poster.media_type));
    } catch (error) {
      console.error('Poster Jackpot open title:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingMovie(false);
    }
  };

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
                  mark={{ rarity: poster.rarity, serial: poster.serial, size: 'xs' }}
                />
                {poster.equipped && (
                  <span className="absolute top-1.5 right-1.5 grid place-items-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-lg" title={t('jackpot.collection.equipped')}>
                    <Check className="w-3.5 h-3.5" aria-hidden />
                  </span>
                )}
                {/* Ganho no Pôster Poker: não entra em trocas (03/11/2026). */}
                {poster.tradeable === false && <TablePrizeSeal size="xs" className="absolute top-1.5 left-1.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {cobra.state && cobra.state.kits.length > 0 && (
        <CobraKitShelf
          kits={cobra.state.kits}
          chance={cobra.state.chance}
          avatarUrl={cobra.look?.avatarUrl ?? null}
          inUse={(kit) => cobra.look?.frame === kit.frame_id && cobra.look?.banner === kit.banner_id}
          busyId={kitBusy}
          onUse={applyKit}
        />
      )}

      <OracleSheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? titleOf(open, isPt) : ''}
        subtitle={open?.year ? String(open.year) : undefined}
        size="md"
        zIndexClass="z-[10005]"
        escapeEnabled={!movie}
      >
        {open && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => openTitle(open)}
              aria-label={t('jackpot.collection.openTitle', { title: titleOf(open, isPt) })}
              className={`group relative mx-auto block w-44 sm:w-52 rounded-2xl transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98] ${FOCUS_RING}`}
            >
              {/* 04/11/2026: o w342 da grade (já no cache) fica por baixo
                  enquanto o w500 carrega — o detalhe abria com o quadro vazio
                  e o pôster "pipocava" depois. */}
              <PosterArt
                filePath={open.file_path}
                effect={open.effect}
                alt=""
                size="w500"
                placeholderSize="w342"
                loading="eager"
                className="aspect-[2/3] rounded-2xl shadow-[0_22px_44px_-20px_rgba(0,0,0,0.95)]"
                mark={{ rarity: open.rarity, serial: open.serial, size: 'md' }}
              />
              <span
                aria-hidden
                className="absolute top-2 right-2 z-10 grid place-items-center w-8 h-8 rounded-full text-white transition-transform duration-200 group-hover:scale-110"
                style={{ background: 'rgba(10,14,44,0.78)', boxShadow: 'inset 0 0 0 1px rgba(255,232,163,0.4), 0 6px 14px -6px rgba(0,0,0,0.8)' }}
              >
                {loadingMovie ? <Loader2 className="w-4 h-4 animate-spin" /> : <Maximize2 className="w-4 h-4" />}
              </span>
            </button>
            <p className="mt-2 text-[11.5px]" style={{ color: MIST }}>{t('jackpot.collection.openHint')}</p>
            <SerialLine rarity={open.rarity} serial={open.serial} gem={false} className="mt-3 text-[15px]" />
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
              <RarityTag rarity={open.rarity} />
              <EffectTag effect={open.effect} />
              {open.tradeable === false && <TablePrizeSeal />}
            </div>
            {open.tradeable === false && (
              <p className="mt-1.5 text-[12px]" style={{ color: MIST }}>
                {t('pokerEntry.trades.sealHint')}
              </p>
            )}
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

      {movie && (
        <Suspense fallback={null}>
          <MovieDetailsModal movie={movie} isOpen onClose={() => setMovie(null)} zIndexClass="z-[10010]" />
        </Suspense>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Convidar um amigo: os dois ganham 3 fichas especiais
// ---------------------------------------------------------------------------

const InviteCard: React.FC = () => {
  const { t } = useTranslation();
  const [invite, setInvite] = useState<MyInvite | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    getMyInvite()
      .then((value) => alive && setInvite(value))
      .catch((error) => {
        console.error('Invite:', error);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const share = async () => {
    if (!invite) return;
    const route = await shareInvite(invite.link);
    if (route === 'copied') toast.success(t('invite.copied'));
    if (route === 'failed') toast.error(t('invite.copyError'));
  };

  const copy = async () => {
    if (!invite) return;
    if (await copyInvite(invite.link)) {
      setCopied(true);
      toast.success(t('invite.copied'));
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('invite.copyError'));
    }
  };

  return (
    <section
      aria-labelledby="pj-invite-title"
      className="relative overflow-hidden rounded-2xl p-4 sm:p-5"
      style={{
        background: 'radial-gradient(90% 120% at 100% 0%, rgba(255,122,217,0.22), transparent 60%), linear-gradient(135deg, #1c2a78, #0a0e2c 55%, #4b1f7a)',
        boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.5)',
      }}
    >
      <span className="pj-stars" aria-hidden />
      <div className="relative flex items-start gap-3.5">
        <span className="relative w-12 h-12 shrink-0" aria-hidden>
          <ChipFace kind="special" className="absolute left-0 bottom-0 w-9 h-9 -rotate-12" />
          <ChipFace kind="special" className="absolute right-0 top-1 w-8 h-8 rotate-12" />
          <span className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-[1.5rem] h-6 px-1 rounded-full text-[12px] font-bold" style={{ background: '#F4C454', color: '#2A1A00' }}>
            +{INVITE_REWARD}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="pj-invite-title" className="text-[16px] font-semibold leading-snug" style={{ color: PAPER }}>
            {t('invite.title')}
          </h3>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: '#D9D2F2' }}>
            {t('invite.body', { count: INVITE_REWARD })}
          </p>
        </div>
      </div>

      {failed ? (
        <p className="relative mt-3 text-[13px]" style={{ color: MIST }}>{t('invite.loadError')}</p>
      ) : (
        <>
          <div className="relative mt-3.5 flex items-center gap-2 rounded-xl px-3 h-11 text-[13px]" style={{ background: 'rgba(10,14,44,0.7)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}>
            {invite ? (
              <span className="min-w-0 flex-1 truncate" style={{ color: '#FFE8A3' }}>{invite.link.replace(/^https:\/\//, '')}</span>
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-amber-200" aria-hidden />
            )}
          </div>
          <div className="relative mt-2.5 grid grid-cols-[1fr_auto] gap-2">
            <button
              type="button"
              onClick={share}
              disabled={!invite}
              className={`pj-spin inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-sm font-bold disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Share2 className="w-4 h-4" aria-hidden />
              <span className="relative">{t('invite.share')}</span>
            </button>
            <button
              type="button"
              onClick={copy}
              disabled={!invite}
              className={`inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-full text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60 ${FOCUS_RING}`}
              style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
            >
              {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />}
              {copied ? t('invite.copiedShort') : t('invite.copy')}
            </button>
          </div>
          <p className="relative mt-2.5 text-[12.5px] leading-relaxed" style={{ color: MIST }}>
            {invite && invite.joined > 0 ? t('invite.joined', { count: invite.joined }) : t('invite.howItWorks')}
          </p>
        </>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// As missões
// ---------------------------------------------------------------------------

// "A próxima é 13 de novembro" / "Hoje é sexta-feira 13…" (com o ano quando
// a próxima cai em outro ano).
const friday13Line = (t: TFunction, lang: string) => {
  const today = new Date();
  const next = nextFriday13(today);
  if (next.toDateString() === today.toDateString()) return t('jackpot.missions.friday13Today');
  const date = next.toLocaleDateString(lang, {
    day: 'numeric',
    month: 'long',
    ...(next.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
  });
  return t('jackpot.missions.friday13Next', { date });
};

const Missions: React.FC<{
  state: JackpotState;
  onState: (patch: Partial<JackpotState>) => void;
  dailyReward?: DailyReward | null;
  // A mesa da Cobra (04/11/2026): só para a linha de regra do contrato, que
  // aparece com o contrato aberto e usa os números do servidor.
  contract?: ContractBoard | null;
}> = ({ state, onState, dailyReward = null, contract = null }) => {
  const { t, i18n } = useTranslation();
  const [claiming, setClaiming] = useState<string | null>(null);

  const label = (mission: JackpotMission) => {
    if (mission.kind === 'rate_oracle') return t('jackpot.missions.rate_oracle', { oracle: ORACLE_BY_ID[mission.param as OracleId]?.name ?? mission.param });
    if (mission.kind === 'rate_mood') {
      const mood = mission.param ? MOOD_BY_KEY[mission.param] : undefined;
      return t('jackpot.missions.rate_mood', { mood: mood ? t(mood.labelKey) : mission.param });
    }
    // A missão do pôquer (03/11/2026) tem o texto no namespace pokerEntry.
    if (mission.kind === 'poker_play') return t('pokerEntry.missions.pokerPlay', { count: mission.target });
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
  const resetsLine = (
    <p className="text-sm" style={{ color: MIST }}>
      {daysLeft !== null ? t('jackpot.missions.resets', { count: daysLeft }) : t('jackpot.missions.resetsMonday')}
    </p>
  );

  return (
    <div className="space-y-5">
      {/* Vindo do balão da ficha do dia (02/11/2026): primeiro a recompensa,
          logo embaixo as missões que dão mais fichas, e o convite depois
          delas. Sem a recompensa, o convite abre a aba, como antes. */}
      {dailyReward ? <DailyChipReward tickets={dailyReward.tickets} playKey={dailyReward.at} /> : <InviteCard />}
      {!dailyReward && resetsLine}
      <ul className="space-y-2.5">
        {state.missions.map((mission) => {
          const done = mission.progress >= mission.target;
          const accent =
            mission.kind === 'rate_oracle'
              ? ORACLE_BY_ID[mission.param as OracleId]?.color
              : mission.kind === 'rate_mood' && mission.param
                ? MOOD_BY_KEY[mission.param]?.color
                : mission.kind === 'poker_play'
                  ? '#4FC08D'
                  : '#F0ABFC';
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
                    {claiming === mission.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ChipFace className="w-4 h-4" />}
                    {t('jackpot.missions.claim')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {dailyReward && (
        <>
          {resetsLine}
          <InviteCard />
        </>
      )}

      <div className="rounded-2xl p-3.5 sm:p-4 flex items-start gap-3" style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.16), rgba(245,158,11,0.12))', boxShadow: 'inset 0 0 0 1px rgba(253,230,138,0.25)' }}>
        <Crown className="w-5 h-5 shrink-0 mt-0.5 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1 text-sm leading-relaxed">
          <p className="font-medium" style={{ color: PAPER }}>{t('jackpot.missions.specialTitle')}</p>
          <p style={{ color: MIST }}>
            {state.premium
              ? state.specialWeekly
                ? t('jackpot.missions.specialReady')
                : t('jackpot.missions.specialUsedWeek')
              : t('jackpot.missions.specialPremiumOnly')}
            {state.specialTickets > 0 && <> {t('jackpot.missions.specialSaved', { count: state.specialTickets })}</>}
          </p>
          {/* Quem tem a Scary Clown ganha 3 fichas especiais em toda
              sexta-feira 13 (02/11/2026): a gaveta lembra quando é a próxima.
              13/11/2026: só ganha quem está USANDO a tag no perfil (o texto
              diz isso; a regra mora em jackpot_grant_friday13_on). */}
          {state.friday13Perk && (
            <p className="mt-1.5 flex items-start gap-1.5" style={{ color: '#FDE68A' }}>
              <span aria-hidden>🤡</span>
              <span>{friday13Line(t, i18n.language)}</span>
            </p>
          )}
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
          <RarityGem rarity="legendary" className="w-4 h-4 shrink-0 mt-0.5" />
          {t('jackpot.missions.luckyRule', { count: state.luckyGoal })}
        </p>
        <p className="flex items-start gap-2">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-cyan-200" aria-hidden />
          {t('jackpot.missions.effectsRule', {
            holo: EFFECT_META.holo.odds,
            negative: EFFECT_META.negative.odds,
            ultra: EFFECT_META.ultra_red.odds,
          })}
        </p>
        {contract?.open && (
          <p className="flex items-start gap-2">
            <RarityGem rarity="epic" className="w-4 h-4 shrink-0 mt-0.5" />
            {t('jackpot.contract.rule', { count: contract.size, step: contract.effectStep, cap: contract.effectCap })}
          </p>
        )}
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
  initialTab?: Tab;
  // A ficha do dia acabou de ser pega (balão da porta): a aba Missões abre
  // com a recompensa no topo.
  dailyReward?: DailyReward | null;
}> = ({ open, onClose, state, onState, onReload, initialTab = 'machine', dailyReward = null }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [owned, setOwned] = useState<OwnedPoster[] | null>(null);
  const [trades, setTrades] = useState<PosterTrade[] | null>(null);
  // A mesa da Cobra (04/11/2026): carregada com a gaveta, como a coleção e as
  // trocas, porque a aba Missões também lê (a linha de regra do contrato só
  // aparece com o contrato aberto). null = carregando; 'failed' = deu erro.
  const [board, setBoard] = useState<ContractBoard | 'failed' | null>(null);
  // Uma camada por cima (detalhe de um pôster): o Esc fecha só ela.
  const [layerOpen, setLayerOpen] = useState(false);
  // 04/11/2026: a fita da roleta fica guardada entre as trocas de aba, mas
  // só durante uma abertura da gaveta: fechar troca o número, e a próxima
  // abertura começa com uma fita nova, como antes. (Quem fecha ainda guarda a
  // fita com o número velho: a Roleta só desmonta depois da animação de
  // saída, com as props de quando estava aberta.)
  const [reelSession, setReelSession] = useState(0);
  useEffect(() => {
    if (!open) setReelSession((n) => n + 1);
  }, [open]);

  const loadOwned = useCallback(() => {
    loadMyPosters()
      .then(setOwned)
      .catch(() => setOwned([]));
  }, []);
  const loadTrades = useCallback(() => {
    getMyTrades()
      .then(setTrades)
      .catch((error) => {
        console.error('Poster trades:', error);
        setTrades([]);
      });
  }, []);
  // Recarregar não apaga a mesa que já está na tela (sem piscar o
  // carregando); só um erro sem mesa nenhuma vira 'failed'.
  const loadBoard = useCallback(() => {
    getContractBoard()
      .then(setBoard)
      .catch((error) => {
        console.error('Poster Jackpot contract board:', error);
        setBoard((prev) => (prev && prev !== 'failed' ? prev : 'failed'));
      });
  }, []);

  useEffect(() => {
    if (open) {
      loadJackpotFont();
      setTab(initialTab);
      onReload();
      loadOwned();
      loadTrades();
      loadBoard();
    }
  }, [open, initialTab, onReload, loadOwned, loadTrades, loadBoard]);

  const claimable = useMemo(() => (state?.missions || []).filter((m) => !m.claimed && m.progress >= m.target).length, [state?.missions]);
  const incomingTrades = useMemo(() => (trades || []).filter((tr) => tr.status === 'pending' && tr.incoming).length, [trades]);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'machine', label: t('jackpot.tabs.machine') },
    { key: 'collection', label: t('jackpot.tabs.collection') },
    { key: 'contract', label: t('jackpot.tabs.contract') },
    { key: 'trades', label: t('jackpot.tabs.trades'), badge: incomingTrades || undefined },
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
      escapeEnabled={!layerOpen}
      // 04/11/2026: no desktop, sem a barra de rolagem parada quando a aba
      // cabe (ver OracleSheet): a linha que aparece ao trocar de ficha não
      // faz a barra piscar por um quadro.
      steadyScrollbar
    >
      {!state ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-amber-200" aria-hidden />
        </div>
      ) : (
        <>
          {/* 5 abas desde 04/11/2026 (entrou Contrato). Para caberem em 360 px
              sem quebrar nem cortar: cada aba fica com a largura do rótulo
              (flex-auto, em vez de 5 colunas iguais, que cortavam "Coleção" e
              "Contrato"), a letra desce meio ponto no celular e o contador
              (trocas recebidas, missões para resgatar) vira um selo pendurado
              no canto de cima da aba, acima do rótulo, sem ocupar a linha
              dele. 44 px de altura (e de largura mínima): o alvo de toque. */}
          <div className="mb-5 flex gap-1 rounded-xl p-1" style={{ background: VELVET }} role="tablist">
            {tabs.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={`relative flex-auto min-w-[44px] h-11 px-1 sm:px-2 rounded-lg text-[12.5px] sm:text-sm font-semibold whitespace-nowrap transition ${FOCUS_RING}`}
                  style={active ? { background: PAPER, color: '#221B36' } : { color: MIST }}
                >
                  {item.label}
                  {item.badge ? (
                    <span
                      className="absolute -top-1.5 -right-1 sm:static sm:ml-1 inline-grid place-items-center min-w-[1rem] sm:min-w-[1.1rem] h-4 sm:h-[18px] px-1 rounded-full text-[10px] sm:text-[10.5px] leading-none tabular-nums"
                      style={{ background: '#FDE68A', color: '#221B36' }}
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
              <Machine state={state} owned={owned} onState={onState} onCollectionChanged={loadOwned} onInvite={() => setTab('missions')} reelParkId={reelSession} />
            )}
            {tab === 'collection' && <Collection list={owned} onChanged={loadOwned} onLayer={setLayerOpen} />}
            {tab === 'contract' && (
              <ContractPanel
                board={board === 'failed' ? null : board}
                failed={board === 'failed'}
                onReloadBoard={loadBoard}
                // Depois de um contrato (ou de equipar o pôster novo), tudo o
                // que depende da coleção acompanha, como depois de uma troca:
                // a coleção, as trocas (as propostas com os 6 caem), o estado
                // da gaveta (pôsteres na coleção, quantos ainda podem sair) e
                // a própria mesa.
                onCollectionChanged={() => {
                  loadOwned();
                  loadTrades();
                  loadBoard();
                  onReload();
                }}
                onLayer={setLayerOpen}
              />
            )}
            {tab === 'trades' && (
              <PosterTradesPanel
                trades={trades}
                onChanged={() => {
                  loadTrades();
                  loadOwned();
                  onReload();
                }}
              />
            )}
            {tab === 'missions' && <Missions state={state} onState={onState} dailyReward={dailyReward} contract={board && board !== 'failed' ? board : null} />}
          </SheetFade>
        </>
      )}
    </OracleSheet>
  );
};

export default PosterJackpotSheet;

// Usado pela porta do Hub e pelo menu da biblioteca: recarrega tudo.
export const refreshPosters = notifyPostersChanged;
