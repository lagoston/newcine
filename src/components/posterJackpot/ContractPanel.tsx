import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, ChevronRight, Eraser, Loader2, Lock, PenLine, RotateCcw, Wand2 } from 'lucide-react';
import OracleSheet from '../OracleSheet';
import PosterArt from './PosterArt';
import { RarityGem } from './CollectorMark';
import JackpotReveal from './JackpotReveal';
import WaxSeal from './WaxSeal';
import { JACKPOT_TOAST_STYLE } from './jackpotToast';
import { PAPER, MIST, FOCUS_RING } from '../../lib/oracleTheme';
import { cardArt } from '../../lib/poker/client/cosmetics';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import {
  EFFECT_META,
  RARITY_META,
  contractErrorCode,
  equipPoster,
  loadJackpotFont,
  signContract,
  titleOf,
  type ContractBoard,
  type ContractErrorCode,
  type ContractPoster,
  type ContractRarity,
  type ContractResult,
  type ContractTier,
  type PosterEffect,
} from '../../lib/posterJackpot';
import { playReveal, primeJackpotAudio } from '../../lib/jackpotSound';
import '../../styles/posterJackpot.css';

// ===========================================================================
// O Mercado Negro da Cobra (04/11/2026, pedido do Bruno): a aba Contrato da
// gaveta do Poster Jackpot. Como o "contrato" do CS:GO, a pessoa entrega
// `size` pôsteres da mesma raridade e recebe 1 da raridade de cima que ainda
// não tem. Quem cuida do balcão é a Cypher, a Cobra (a carta que a pessoa
// equipou, como no Pôster Poker), com um balão que muda conforme o contrato.
//
// Decisões de design (04/11/2026):
//   • É a sala dos fundos do cassino: o mesmo céu azul da roleta, mais escuro,
//     com uma fumaça verde-veneno e moldura de latão (ouro velho, não o ouro
//     novo do palco). A personalidade fica em DOIS elementos só: a Cobra no
//     balcão e o contrato, um papel de contrabando com o selo de cera verde
//     dela. O resto (degraus, grade, barra de assinar) é disciplinado e segue
//     o porta-fichas, a barra da sorte e a grade das trocas.
//   • Verde = a Cobra (balão, fumaça, selo); ouro = o que a pessoa escolhe
//     (degrau ativo, pôster no contrato, botão de assinar). As duas cores
//     nunca disputam o mesmo papel.
//   • Os números (quantos entram, quanto cada efeito soma, teto e piso) vêm
//     sempre do servidor (board.size, effectStep, effectCap, effectFloor).
//   • O botão de assinar fica numa barra presa embaixo (como o "Enviar" das
//     trocas): no celular a grade fica abaixo da dobra, e a pessoa escolhe
//     lá embaixo sem perder o botão.
//   • Depois de assinar: os pôsteres voam para dentro do pôster misterioso,
//     o selo carimba e vem a MESMA revelação da roleta (JackpotReveal), com a
//     faixa "Contrato da Cobra". Com "reduzir movimento", nada se move.
// ===========================================================================

type Phase = 'idle' | 'sealing' | 'revealed';
type CobraMood = 'idle' | 'partial' | 'full' | 'fullFx' | 'maxFx' | 'short' | 'complete' | 'sealing' | 'signed' | 'closed';

const keyOf = (p: { id: number; effect: PosterEffect }) => `${p.id}:${p.effect}`;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
// Efeitos que entram num contrato, na ordem da roleta (holo, negativo, ultra).
const FX: Exclude<PosterEffect, 'none' | 'gold'>[] = ['holo', 'negative', 'ultra_red'];

// O estilo de carta da pessoa (profiles.card_style), lido uma vez por visita:
// a aba abre e fecha muitas vezes e a carta da Cobra não precisa piscar.
let cardStyleCache: { userId: string; style: string } | null = null;
const useCardStyle = (userId: string | null | undefined): string => {
  const [style, setStyle] = useState(() => (cardStyleCache && cardStyleCache.userId === userId ? cardStyleCache.style : 'default'));
  useEffect(() => {
    if (!userId) return;
    if (cardStyleCache?.userId === userId) {
      setStyle(cardStyleCache.style);
      return;
    }
    let alive = true;
    supabase
      .from('profiles')
      .select('card_style')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const value = (data as { card_style?: string | null } | null)?.card_style || 'default';
        cardStyleCache = { userId, style: value };
        if (alive) setStyle(value);
      });
    return () => {
      alive = false;
    };
  }, [userId]);
  return style;
};

// A divisão entre os efeitos entregues, em % inteiros que somam 100 (maiores
// restos): 2 holográficos e 1 negativo = 67% e 33%.
const splitPercents = (counts: Partial<Record<PosterEffect, number>>) => {
  const entries = FX.filter((e) => (counts[e] || 0) > 0).map((e) => ({ effect: e, n: counts[e] || 0 }));
  const total = entries.reduce((sum, e) => sum + e.n, 0);
  if (!total) return [];
  const raw = entries.map((e) => ({ ...e, exact: (e.n / total) * 100 }));
  const out = raw.map((e) => ({ effect: e.effect, value: Math.floor(e.exact), rest: e.exact - Math.floor(e.exact) }));
  let left = 100 - out.reduce((sum, e) => sum + e.value, 0);
  [...out].sort((a, b) => b.rest - a.rest).forEach((e) => {
    if (left > 0) {
      e.value += 1;
      left -= 1;
    }
  });
  return out.map(({ effect, value }) => ({ effect, value }));
};

// O texto de cada recusa do servidor, na voz da interface (não da Cobra):
// o que aconteceu e o que fazer. Toda recusa desfaz tudo no banco, então
// nenhum pôster saiu da coleção.
const errorText = (t: TFunction, code: ContractErrorCode, board: ContractBoard | null, tier: ContractTier | null) =>
  t(`jackpot.contract.errors.${code}`, {
    count: board?.size ?? 0,
    plural: tier ? t(`jackpot.contract.plural.${tier.to}`) : '',
    defaultValue: t('jackpot.contract.errors.error'),
  });

// ---------------------------------------------------------------------------
// A Cobra no balcão: a carta dela e o balão
// ---------------------------------------------------------------------------

const CobraCounter: React.FC<{ cardStyle: string; line: string; lineKey: string; dim?: boolean; reduceMotion: boolean }> = ({ cardStyle, line, lineKey, dim = false, reduceMotion }) => {
  const { t } = useTranslation();
  return (
    <div className="pj-contract-counter">
      <span className={`pj-contract-card ${dim ? 'is-dim' : ''}`} aria-hidden>
        <img src={cardArt('cypher', cardStyle)} alt="" decoding="async" draggable={false} />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="pj-display pj-gold-text pj-contract-title">{t('jackpot.contract.title')}</h3>
        {/* O balão fala só quando muda (aria-live); o nome dela vai para o
            leitor de tela, a tela já mostra a carta. */}
        <div className="pj-contract-bubble" aria-live="polite">
          <span className="sr-only">{t('jackpot.contract.cobraName')}: </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={lineKey}
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -3 }}
              transition={{ duration: 0.18 }}
            >
              {line}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Os três degraus: comuns → raro, raros → épico, épicos → lendário
// ---------------------------------------------------------------------------

const TierPicker: React.FC<{
  tiers: ContractTier[];
  free: Record<ContractRarity, number>;
  value: ContractRarity;
  onChange: (rarity: ContractRarity) => void;
  disabled: boolean;
}> = ({ tiers, free, value, onChange, disabled }) => {
  const { t } = useTranslation();
  return (
    <div className="pj-contract-tiers" role="radiogroup" aria-label={t('jackpot.contract.tiersAria')}>
      {tiers.map((tier) => {
        const on = tier.from === value;
        const complete = tier.left <= 0;
        const give = t(`jackpot.contract.give.${tier.from}`, { count: free[tier.from] });
        return (
          <button
            key={tier.from}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(tier.from)}
            aria-label={`${t('jackpot.contract.terms', { give: t(`jackpot.contract.plural.${tier.from}`), get: t(`jackpot.contract.get.${tier.to}`) })}. ${
              complete ? t('jackpot.contract.complete', { plural: t(`jackpot.contract.plural.${tier.to}`) }) : t('jackpot.contract.tierHave', { give })
            }`}
            className={`pj-contract-tier ${on ? 'is-on' : ''} ${complete ? 'is-complete' : ''} ${FOCUS_RING}`}
          >
            <span className="pj-contract-tier-gems" aria-hidden>
              <RarityGem rarity={tier.from} />
              <ChevronRight className="w-3 h-3" />
              <RarityGem rarity={tier.to} glint={tier.to === 'legendary' && on} />
            </span>
            <span className="pj-contract-tier-name">{t(`jackpot.rarity.${tier.to}`)}</span>
            <span className="pj-contract-tier-sub">
              {complete ? (
                <>
                  <Check className="w-3 h-3" aria-hidden />
                  {t('jackpot.contract.tierComplete')}
                </>
              ) : (
                give
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// O medidor da chance de efeito: uma casa por pôster com efeito (até o teto)
// ---------------------------------------------------------------------------

const EffectMeter: React.FC<{ board: ContractBoard; picked: ContractPoster[] }> = ({ board, picked }) => {
  const { t } = useTranslation();
  const withFx = picked.filter((p) => p.effect !== 'none');
  const chance = Math.min(board.effectCap, Math.max(board.effectFloor, withFx.length * board.effectStep));
  // As casas: quantos pôsteres com efeito chegam ao teto (60 / 10 = 6).
  const cells = board.effectStep > 0 ? Math.max(1, Math.ceil(board.effectCap / board.effectStep)) : 0;
  const counts: Partial<Record<PosterEffect, number>> = {};
  withFx.forEach((p) => {
    counts[p.effect] = (counts[p.effect] || 0) + 1;
  });
  const split = splitPercents(counts);
  return (
    <div className="pj-contract-meter">
      <div
        className="pj-contract-meter-head"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={chance}
        aria-label={t('jackpot.contract.chance')}
        aria-valuetext={t('jackpot.contract.chanceAria', { value: chance })}
      >
        <span className="pj-contract-meter-label">{t('jackpot.contract.chance')}</span>
        <span className="pj-contract-meter-value pj-display" aria-hidden>
          {chance}%
        </span>
      </div>
      {cells > 0 && (
        <span className="pj-contract-cells" aria-hidden style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
          {Array.from({ length: cells }, (_, i) => {
            const fx = withFx[i]?.effect;
            return <span key={i} className={`pj-contract-cell ${fx ? `is-on is-${fx}` : ''}`} />;
          })}
        </span>
      )}
      <p className="pj-contract-meter-hint">
        {t('jackpot.contract.chanceRule', { step: board.effectStep, cap: board.effectCap })}
        {withFx.length === 0 && <> {t('jackpot.contract.chanceFloor', { floor: board.effectFloor })}</>}
      </p>
      <p className="pj-contract-meter-hint">
        {split.length ? (
          <>
            {t('jackpot.contract.split')}{' '}
            {split.map(({ effect, value }) => (
              <span key={effect} className="pj-contract-split">
                <span className={`pj-contract-dot is-${effect}`} aria-hidden />
                {t(`jackpot.effect.${effect}`)} <b>{value}%</b>
              </span>
            ))}
          </>
        ) : (
          t('jackpot.contract.splitSpin', { holo: EFFECT_META.holo.odds, negative: EFFECT_META.negative.odds, ultra: EFFECT_META.ultra_red.odds })
        )}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// O contrato: o papel de contrabando com os lugares, o que sai e o selo
// ---------------------------------------------------------------------------

const ContractPaper = React.forwardRef<
  HTMLDivElement,
  {
    board: ContractBoard;
    tier: ContractTier;
    picked: ContractPoster[];
    phase: Phase;
    reduceMotion: boolean;
    onRemove: (poster: ContractPoster) => void;
  }
>(({ board, tier, picked, phase, reduceMotion, onRemove }, ref) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const sealing = phase === 'sealing';
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const outRef = useRef<HTMLDivElement>(null);
  // Para onde cada pôster voa ao assinar: o centro do pôster misterioso.
  const [fly, setFly] = useState<{ x: number; y: number }[]>([]);
  useEffect(() => {
    if (!sealing || reduceMotion) return;
    const target = outRef.current?.getBoundingClientRect();
    if (!target) return;
    setFly(
      slotRefs.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: target.left + target.width / 2 - (r.left + r.width / 2), y: target.top + target.height / 2 - (r.top + r.height / 2) } : { x: 0, y: 0 };
      })
    );
  }, [sealing, reduceMotion]);
  const toMeta = RARITY_META[tier.to];

  return (
    <div ref={ref} className={`pj-contract-paper ${sealing ? 'is-sealing' : ''}`}>
      <div className="pj-contract-paper-head">
        <h4 className="pj-display pj-contract-paper-title">{t('jackpot.contract.paperTitle')}</h4>
        <p className="pj-contract-terms">
          <RarityGem rarity={tier.from} className="w-3.5 h-3.5" />
          {t('jackpot.contract.terms', {
            give: t(`jackpot.contract.give.${tier.from}`, { count: board.size }),
            get: t(`jackpot.contract.get.${tier.to}`),
          })}
          <RarityGem rarity={tier.to} className="w-3.5 h-3.5" />
        </p>
      </div>

      <div className="pj-contract-deal">
        <div className="pj-contract-slots">
          {Array.from({ length: board.size }, (_, i) => {
            const poster = picked[i];
            const target = fly[i];
            return (
              <div key={i} ref={(el) => (slotRefs.current[i] = el)} className="pj-contract-slot">
                <AnimatePresence initial={false}>
                  {poster ? (
                    <motion.button
                      key={keyOf(poster)}
                      type="button"
                      onClick={() => onRemove(poster)}
                      disabled={phase !== 'idle'}
                      aria-label={t('jackpot.contract.slotRemove', { title: titleOf(poster, isPt) })}
                      initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
                      animate={
                        sealing && !reduceMotion && target
                          ? { x: target.x, y: target.y, scale: 0.3, opacity: 0, rotate: (i % 2 ? 1 : -1) * 8 }
                          : { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
                      }
                      exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { scale: 0.7, opacity: 0, transition: { duration: 0.15 } }}
                      transition={sealing ? { duration: 0.5, delay: i * 0.06, ease: [0.55, 0, 0.75, 0.2] } : { type: 'spring', stiffness: 520, damping: 30 }}
                      className={`pj-contract-slot-fill ${FOCUS_RING}`}
                    >
                      <PosterArt
                        filePath={poster.file_path}
                        effect={poster.effect}
                        alt=""
                        size="w185"
                        className="w-full h-full rounded-[5px]"
                        mark={{ rarity: poster.rarity, serial: poster.serial, size: 'xs' }}
                      />
                    </motion.button>
                  ) : (
                    <span key="empty" className="pj-contract-slot-empty" role="img" aria-label={t('jackpot.contract.slotEmpty')}>
                      <RarityGem rarity={tier.from} />
                    </span>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <ChevronRight className="pj-contract-arrow" aria-hidden />

        <div className="pj-contract-out">
          <motion.div
            ref={outRef}
            className="pj-contract-mystery"
            role="img"
            aria-label={t(`jackpot.contract.out.${tier.to}`)}
            style={{ ['--pj-out' as string]: toMeta.color, ['--pj-out-glow' as string]: toMeta.glow, ['--pj-gem-glow' as string]: toMeta.glow }}
            animate={sealing && !reduceMotion ? { scale: [1, 1, 1.08, 1] } : { scale: 1 }}
            transition={sealing ? { duration: 0.9, times: [0, 0.5, 0.72, 1] } : { duration: 0.2 }}
          >
            <span className="pj-contract-mystery-q pj-display" aria-hidden>
              ?
            </span>
            <RarityGem rarity={tier.to} glint={tier.to === 'legendary'} className="pj-contract-mystery-gem" />
          </motion.div>
          <p className="pj-contract-out-caption">{t(`jackpot.contract.out.${tier.to}`)}</p>
        </div>
      </div>

      <div className="pj-contract-foot">
        <EffectMeter board={board} picked={picked} />
        <span className="pj-contract-seal-spot" aria-hidden>
          <span className="pj-contract-seal-ghost" />
          <AnimatePresence>
            {sealing && (
              <motion.span
                key="seal"
                className="pj-contract-seal"
                initial={reduceMotion ? { opacity: 1 } : { scale: 2.6, opacity: 0, rotate: -32 }}
                animate={{ scale: 1, opacity: 1, rotate: -10 }}
                exit={{ opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { delay: 0.62, type: 'spring', stiffness: 620, damping: 17 }}
                onAnimationComplete={() => {
                  // O carimbo bate: um toque curto na vibração (quando houver).
                  try {
                    if (!reduceMotion) navigator.vibrate?.(18);
                  } catch {
                    // sem vibração
                  }
                }}
              >
                <WaxSeal className="w-full h-full" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      <p className="pj-contract-fine">{t('jackpot.contract.finePrint', { count: board.size })}</p>
    </div>
  );
});
ContractPaper.displayName = 'ContractPaper';

// ---------------------------------------------------------------------------
// A grade: os pôsteres da raridade do degrau
// ---------------------------------------------------------------------------

const PickGrid: React.FC<{
  posters: ContractPoster[];
  picked: Set<string>;
  disabled: boolean;
  onToggle: (poster: ContractPoster) => void;
}> = ({ posters, picked, disabled, onToggle }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  return (
    <ul className="grid grid-cols-4 sm:grid-cols-6 gap-2">
      {posters.map((poster) => {
        const key = keyOf(poster);
        const active = picked.has(key);
        const locked = !!poster.lock;
        const label = [
          titleOf(poster, isPt),
          poster.effect !== 'none' ? t(`jackpot.effect.${poster.effect}`) : null,
          poster.equipped ? t('jackpot.contract.equipped') : null,
          poster.in_trade ? t('jackpot.contract.inTrade') : null,
          poster.lock ? t(`jackpot.contract.lock.${poster.lock}`) : null,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onToggle(poster)}
              disabled={locked || disabled}
              aria-pressed={locked ? undefined : active}
              aria-label={label}
              className={`pj-contract-pick relative block w-full rounded-lg transition ${FOCUS_RING} ${locked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'} ${active ? 'is-on' : ''}`}
            >
              <PosterArt
                filePath={poster.file_path}
                effect={poster.effect}
                alt=""
                size="w185"
                animated={false}
                className={`aspect-[2/3] rounded-lg ${locked ? 'opacity-30 grayscale' : ''}`}
                mark={locked ? null : { rarity: poster.rarity, serial: poster.serial, size: 'xs' }}
              />
              {/* No contrato: o pôster escurece e ganha o check de ouro no
                  meio (o canto de cima fica para "Equipado" / "Em troca"). */}
              {active && (
                <span className="pj-contract-pick-on" aria-hidden>
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
              )}
              {(poster.equipped || poster.in_trade) && !locked && (
                <span className="absolute top-1 left-1 flex flex-col items-start gap-0.5" aria-hidden>
                  {poster.equipped && <span className="pj-contract-flag is-equipped">{t('jackpot.contract.equipped')}</span>}
                  {poster.in_trade && <span className="pj-contract-flag is-trade">{t('jackpot.contract.inTrade')}</span>}
                </span>
              )}
              {locked && (
                <>
                  <Lock className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-5 h-5" style={{ color: PAPER }} aria-hidden />
                  <span className="absolute inset-x-1 bottom-1 rounded-md px-1 py-0.5 text-[10.5px] font-semibold leading-tight text-center" style={{ background: 'rgba(10,14,44,0.9)', color: PAPER }} aria-hidden>
                    {t(`jackpot.contract.lock.${poster.lock}`)}
                  </span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

// ---------------------------------------------------------------------------
// A aba
// ---------------------------------------------------------------------------

const ContractPanel: React.FC<{
  board: ContractBoard | null;
  failed?: boolean;
  onReloadBoard: () => void;
  onCollectionChanged: () => void;
  // Uma camada por cima (confirmação, assinatura, revelação): o Esc da gaveta
  // espera, e cada Esc fecha uma camada só.
  onLayer?: (open: boolean) => void;
}> = ({ board, failed = false, onReloadBoard, onCollectionChanged, onLayer }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const reduceMotion = !!useReducedMotion();
  const { session } = useAuth();
  const cardStyle = useCardStyle(session?.user?.id);
  const [tierFrom, setTierFrom] = useState<ContractRarity | null>(null);
  // Os pôsteres no contrato, na ordem em que entraram (chaves item:efeito).
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ContractResult | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [equipped, setEquipped] = useState(false);
  // Acabou de fechar um contrato: a Cobra comenta até o próximo toque.
  const [justSigned, setJustSigned] = useState(false);
  const busyRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  // A mesa é recarregada sempre que a aba aparece (depois de um giro ou de
  // uma troca, a coleção pode ter mudado); a que já está na tela fica até a
  // nova chegar.
  useEffect(() => {
    loadJackpotFont();
    onReloadBoard();
  }, [onReloadBoard]);

  // Esc: uma camada por vez (a confirmação já tem o Esc da própria gaveta).
  useEffect(() => {
    onLayer?.(confirmOpen || phase !== 'idle');
  }, [confirmOpen, phase, onLayer]);
  useEffect(() => () => onLayer?.(false), [onLayer]);

  const tiers = useMemo(() => board?.tiers ?? [], [board]);
  const size = board?.size ?? 0;

  // Pôsteres livres (sem trava) de cada raridade, para os degraus.
  const free = useMemo(() => {
    const out: Record<ContractRarity, number> = { common: 0, rare: 0, epic: 0 };
    (board?.posters ?? []).forEach((p) => {
      if (!p.lock) out[p.rarity as ContractRarity] += 1;
    });
    return out;
  }, [board]);

  // O degrau inicial: o primeiro que já dá para fechar; senão o primeiro
  // ainda aberto com algum pôster; senão o primeiro ainda aberto.
  useEffect(() => {
    if (!board || tierFrom) return;
    const open = tiers.filter((tier) => tier.left > 0);
    const pickTier = open.find((tier) => free[tier.from] >= board.size) || open.find((tier) => free[tier.from] > 0) || open[0] || tiers[0];
    if (pickTier) setTierFrom(pickTier.from);
  }, [board, tiers, free, tierFrom]);

  const tier = tiers.find((item) => item.from === tierFrom) ?? null;
  const complete = !!tier && tier.left <= 0;

  // Os da raridade do degrau: os livres primeiro (na ordem do servidor:
  // sem efeito, holográfico, negativo, ultra vermelho), os travados no fim.
  const tierPosters = useMemo(() => {
    const list = (board?.posters ?? []).filter((p) => p.rarity === tierFrom);
    return [...list.filter((p) => !p.lock), ...list.filter((p) => p.lock)];
  }, [board, tierFrom]);
  const eligible = useMemo(() => tierPosters.filter((p) => !p.lock), [tierPosters]);
  const byKey = useMemo(() => new Map(eligible.map((p) => [keyOf(p), p])), [eligible]);
  const pickedPosters = useMemo(() => picked.map((key) => byKey.get(key)).filter(Boolean) as ContractPoster[], [picked, byKey]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);

  // A mesa mudou (recarregou depois de um erro, de uma troca): sai do
  // contrato o que não está mais livre na coleção.
  useEffect(() => {
    setPicked((prev) => {
      const next = prev.filter((key) => byKey.has(key));
      return next.length === prev.length ? prev : next;
    });
  }, [byKey]);

  const fxCount = pickedPosters.filter((p) => p.effect !== 'none').length;
  const cells = board && board.effectStep > 0 ? Math.ceil(board.effectCap / board.effectStep) : 0;
  const chance = board ? Math.min(board.effectCap, Math.max(board.effectFloor, fxCount * board.effectStep)) : 0;
  const full = size > 0 && pickedPosters.length >= size;

  const mood: CobraMood = !board?.open
    ? 'closed'
    : phase === 'sealing'
      ? 'sealing'
      : justSigned
        ? 'signed'
        : complete
          ? 'complete'
          : pickedPosters.length === 0
            ? eligible.length < size
              ? 'short'
              : 'idle'
            : !full
              ? 'partial'
              : cells > 0 && fxCount >= cells
                ? 'maxFx'
                : fxCount > 0
                  ? 'fullFx'
                  : 'full';
  const cobraLine = t(`jackpot.contract.cobra.${mood}`, { count: mood === 'partial' ? size - pickedPosters.length : size });

  const chooseTier = (rarity: ContractRarity) => {
    if (rarity === tierFrom) return;
    setTierFrom(rarity);
    setPicked([]);
    setJustSigned(false);
  };

  const toggle = (poster: ContractPoster) => {
    if (phase !== 'idle' || poster.lock) return;
    const key = keyOf(poster);
    setJustSigned(false);
    if (pickedSet.has(key)) {
      setPicked((prev) => prev.filter((k) => k !== key));
      return;
    }
    if (pickedPosters.length >= size) {
      toast(t('jackpot.contract.fullToast', { count: size }), { id: 'pj-contract-full', style: JACKPOT_TOAST_STYLE });
      return;
    }
    setPicked((prev) => [...prev, key]);
  };

  // "Escolher por mim": completa com os livres, não equipados e fora de
  // troca — os sem efeito primeiro (os com efeito valem mais na coleção; quem
  // quer gastar efeito para subir a chance escolhe à mão).
  const autoFill = () => {
    setJustSigned(false);
    const room = size - pickedPosters.length;
    if (room <= 0) return;
    const spare = eligible.filter((p) => !p.equipped && !p.in_trade && !pickedSet.has(keyOf(p)));
    const ordered = [...spare.filter((p) => p.effect === 'none'), ...spare.filter((p) => p.effect !== 'none')];
    if (!ordered.length) {
      toast(t('jackpot.contract.autoNone'), { id: 'pj-contract-auto', style: JACKPOT_TOAST_STYLE });
      return;
    }
    setPicked([...pickedPosters.map(keyOf), ...ordered.slice(0, room).map(keyOf)]);
  };

  const clearAll = () => {
    setPicked([]);
    setJustSigned(false);
  };

  // Rola a gaveta até o topo (ao voltar da revelação para o balcão: as abas
  // e a Cobra de novo à vista).
  const scrollToTop = useCallback(() => {
    let node = rootRef.current?.parentElement ?? null;
    while (node && !(node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY))) node = node.parentElement;
    if (node) node.scrollTop = 0;
  }, []);

  const sign = async () => {
    if (busyRef.current || !board || !tier || !full || complete) return;
    busyRef.current = true;
    primeJackpotAudio();
    setConfirmOpen(false);
    setPhase('sealing');
    setJustSigned(false);
    // O contrato na tela enquanto a Cobra costura.
    window.requestAnimationFrame(() => paperRef.current?.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' }));
    const items = pickedPosters.slice(0, size).map((p) => ({ item_id: p.id, effect: p.effect }));
    let res: ContractResult;
    try {
      // A animação (voo + selo) tem um tempo mínimo; o servidor corre junto.
      [res] = await Promise.all([signContract(tier.from, items), wait(reduceMotion ? 250 : 1500)]);
    } catch (error) {
      const code = contractErrorCode(error);
      console.error('Poster Jackpot contract:', error);
      toast.error(errorText(t, code, board, tier), { id: 'pj-contract-error', duration: 7000, style: JACKPOT_TOAST_STYLE });
      setPhase('idle');
      busyRef.current = false;
      // Depois de qualquer recusa a mesa volta do servidor (o que mudou —
      // fechou, um pôster saiu, o degrau completou — aparece na hora).
      onReloadBoard();
      return;
    }
    setResult(res);
    setEquipped(false);
    setPicked([]);
    onCollectionChanged();
    setPhase('revealed');
    // A revelação entra no lugar do balcão: a gaveta rola até o começo dela
    // (Equipar e Voltar à vista, como na roleta).
    window.requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'start' }));
    playReveal(res.poster.rarity, res.poster.effect !== 'none');
    try {
      if (res.poster.rarity === 'legendary') navigator.vibrate?.([30, 40, 60]);
      else if (res.poster.rarity === 'epic') navigator.vibrate?.(40);
    } catch {
      // sem vibração
    }
    busyRef.current = false;
  };

  // De volta ao balcão: a mesa já veio nova do servidor; a gaveta volta ao
  // topo, onde a Cobra comenta o negócio.
  const closeReveal = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setJustSigned(true);
    window.requestAnimationFrame(scrollToTop);
  }, [scrollToTop]);

  // Esc na revelação volta ao balcão (e não fecha a gaveta inteira).
  useEffect(() => {
    if (phase !== 'revealed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeReveal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, closeReveal]);

  const equip = async () => {
    if (!result) return;
    setEquipping(true);
    try {
      await equipPoster(result.poster.id, result.poster.effect);
      setEquipped(true);
      onCollectionChanged();
      toast.success(t('jackpot.collection.equippedToast', { title: titleOf(result.poster, isPt) }), { style: JACKPOT_TOAST_STYLE });
    } catch (error) {
      console.error('Poster Jackpot equip:', error);
      toast.error(t('jackpot.collection.equipError'), { style: JACKPOT_TOAST_STYLE });
    } finally {
      setEquipping(false);
    }
  };

  // --- Estados sem balcão -----------------------------------------------------

  if (!board) {
    return (
      <div ref={rootRef} className="pj-contract-den">
        <span className="pj-stars" aria-hidden />
        {failed ? (
          <div className="relative py-10 text-center">
            <p className="text-[15px] font-medium" style={{ color: PAPER }}>
              {t('jackpot.contract.loadError')}
            </p>
            <button
              type="button"
              onClick={onReloadBoard}
              className={`mt-4 inline-flex items-center gap-1.5 h-11 px-5 rounded-full text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`}
              style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
            >
              <RotateCcw className="w-4 h-4" aria-hidden />
              {t('jackpot.contract.retry')}
            </button>
          </div>
        ) : (
          <div className="relative flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
          </div>
        )}
      </div>
    );
  }

  if (!board.open) {
    // Fechado para a pessoa: o balcão aparece, com a Cobra apagada e o aviso
    // discreto de "em breve". Sem botão (não há o que fazer ainda).
    return (
      <div ref={rootRef} className="pj-contract-den">
        <span className="pj-contract-smoke" aria-hidden />
        <span className="pj-stars" aria-hidden />
        <div className="relative">
          <CobraCounter cardStyle={cardStyle} line={cobraLine} lineKey={mood} dim reduceMotion={reduceMotion} />
          <div className="pj-contract-closed">
            <Lock className="w-5 h-5 mx-auto" style={{ color: '#E9D08A' }} aria-hidden />
            <p className="mt-2 text-[15px] font-semibold" style={{ color: PAPER }}>
              {t('jackpot.contract.closed.title')}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: MIST }}>
              {t('jackpot.contract.closed.body', { count: board.size })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'revealed' && result) {
    return (
      <div ref={rootRef}>
        <JackpotReveal
          inline
          item={result.poster}
          effect={result.poster.effect}
          reduceMotion={reduceMotion}
          equipping={equipping}
          equipped={equipped}
          onEquip={equip}
          onClose={closeReveal}
          backLabel={t('jackpot.contract.reveal.back')}
          ribbon={
            <motion.span
              initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="pj-contract-ribbon mb-3 shrink-0"
            >
              <WaxSeal className="w-[18px] h-[18px] -ml-1" />
              {t('jackpot.contract.ribbon')}
            </motion.span>
          }
          note={
            <p className="mt-2.5 text-[12.5px] leading-snug" style={{ color: '#CFE9DA' }}>
              {result.effectRolled ? t('jackpot.contract.reveal.rolled', { value: result.effectChance }) : t('jackpot.contract.reveal.notRolled', { value: result.effectChance })}
            </p>
          }
        />
      </div>
    );
  }

  // --- O balcão ---------------------------------------------------------------

  const confirmWarnings = {
    equipped: pickedPosters.filter((p) => p.equipped).length,
    trade: pickedPosters.filter((p) => p.in_trade).length,
  };
  const giveText = tier ? t(`jackpot.contract.give.${tier.from}`, { count: size }) : '';
  const getText = tier ? t(`jackpot.contract.get.${tier.to}`) : '';

  return (
    <div ref={rootRef}>
      <section className="pj-contract-den" aria-label={t('jackpot.contract.title')}>
        <span className="pj-contract-smoke" aria-hidden />
        <span className="pj-stars" aria-hidden />
        <div className="relative">
          <CobraCounter cardStyle={cardStyle} line={cobraLine} lineKey={`${mood}:${mood === 'partial' ? pickedPosters.length : ''}`} reduceMotion={reduceMotion} />
          <TierPicker tiers={tiers} free={free} value={tierFrom ?? 'common'} onChange={chooseTier} disabled={phase !== 'idle'} />

          {tier && complete ? (
            <div className="pj-contract-paper is-complete">
              <span className="pj-contract-complete-gem" style={{ ['--pj-gem-glow' as string]: RARITY_META[tier.to].glow }}>
                <RarityGem rarity={tier.to} glint={tier.to === 'legendary'} className="w-9 h-9" />
              </span>
              <p className="pj-display pj-contract-paper-title mt-2">{t('jackpot.contract.complete', { plural: t(`jackpot.contract.plural.${tier.to}`) })}</p>
              <p className="pj-contract-fine mt-1.5">{t('jackpot.contract.completeHint')}</p>
            </div>
          ) : tier ? (
            <ContractPaper ref={paperRef} board={board} tier={tier} picked={pickedPosters} phase={phase} reduceMotion={reduceMotion} onRemove={toggle} />
          ) : null}
        </div>
      </section>

      {tier && !complete && (
        <section className="mt-5" aria-labelledby="pj-contract-pick-title">
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <h4 id="pj-contract-pick-title" className="text-[14px] font-semibold" style={{ color: PAPER }}>
                {t(`jackpot.contract.pickTitle.${tier.from}`)}
                <span className="ml-1.5 font-normal tabular-nums" style={{ color: MIST }}>
                  {eligible.length}
                </span>
              </h4>
              <p className="mt-0.5 text-[12.5px]" style={{ color: MIST }}>
                {eligible.length < size
                  ? t('jackpot.contract.short', { need: giveText, have: eligible.length })
                  : t('jackpot.contract.pickHint')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={autoFill}
                disabled={phase !== 'idle' || full || eligible.length === 0}
                className={`inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full text-[13px] font-semibold transition hover:bg-white/10 disabled:opacity-45 disabled:hover:bg-transparent ${FOCUS_RING}`}
                style={{ color: '#FFE8A3', boxShadow: 'inset 0 0 0 1.5px rgba(244,196,84,0.7)' }}
              >
                <Wand2 className="w-4 h-4" aria-hidden />
                {t('jackpot.contract.auto')}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={phase !== 'idle' || picked.length === 0}
                className={`inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full text-[13px] font-semibold transition hover:bg-white/10 disabled:opacity-45 disabled:hover:bg-transparent ${FOCUS_RING}`}
                style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)' }}
              >
                <Eraser className="w-4 h-4" aria-hidden />
                {t('jackpot.contract.clear')}
              </button>
            </div>
          </div>

          <div className="mt-3">
            {tierPosters.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: MIST }}>
                {t('jackpot.contract.pickEmpty')}
              </p>
            ) : (
              <PickGrid posters={tierPosters} picked={pickedSet} disabled={phase !== 'idle'} onToggle={toggle} />
            )}
          </div>

          {/* A barra de assinar, presa embaixo (o "Enviar" das trocas). */}
          <div className="sticky bottom-0 -mx-1 mt-5 px-1 pt-3 pb-1" style={{ background: 'linear-gradient(180deg, transparent, rgba(18,13,34,0.96) 22%)' }}>
            <div className="pj-contract-bar">
              <span className="pj-contract-count" role="status" aria-label={t('jackpot.contract.progressAria', { count: pickedPosters.length, size })}>
                <span className="pj-contract-count-num pj-display" aria-hidden>
                  {pickedPosters.length}
                  <span className="pj-contract-count-of">/{size}</span>
                </span>
                <span className="pj-contract-count-fx" aria-hidden>
                  {chance}% {t('jackpot.contract.chance').toLowerCase()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => full && setConfirmOpen(true)}
                disabled={!full || phase !== 'idle'}
                className={`pj-spin flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-12 rounded-full text-[15px] font-bold disabled:opacity-60 ${FOCUS_RING}`}
              >
                {phase === 'sealing' ? <Loader2 className="relative w-4 h-4 animate-spin" aria-hidden /> : <PenLine className="relative w-4 h-4" aria-hidden />}
                <span className="relative truncate">{phase === 'sealing' ? t('jackpot.contract.sealing') : t('jackpot.contract.sign')}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* A confirmação: o que sai, o que pode acontecer, e assinar. */}
      <OracleSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('jackpot.contract.confirm.title')} size="md" zIndexClass="z-[10005]">
        {tier && (
          <div>
            <ul className="grid grid-cols-6 gap-1.5" aria-label={giveText}>
              {pickedPosters.map((poster) => (
                <li key={keyOf(poster)}>
                  <PosterArt filePath={poster.file_path} effect={poster.effect} alt={titleOf(poster, isPt)} size="w185" animated={false} className="aspect-[2/3] rounded-md" />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: PAPER }}>
              {t('jackpot.contract.confirm.body', { give: giveText, get: getText })}
            </p>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: MIST }}>
              {t('jackpot.contract.confirm.leave', { count: size })}
            </p>
            {(confirmWarnings.equipped > 0 || confirmWarnings.trade > 0) && (
              <ul className="mt-3 space-y-1.5">
                {confirmWarnings.equipped > 0 && (
                  <li className="flex items-start gap-2 text-[13.5px] leading-snug" style={{ color: '#FDE68A' }}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    {t('jackpot.contract.confirm.equipped', { count: confirmWarnings.equipped })}
                  </li>
                )}
                {confirmWarnings.trade > 0 && (
                  <li className="flex items-start gap-2 text-[13.5px] leading-snug" style={{ color: '#FDE68A' }}>
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    {t('jackpot.contract.confirm.trade', { count: confirmWarnings.trade })}
                  </li>
                )}
              </ul>
            )}
            <p className="mt-3 text-[13.5px] font-semibold" style={{ color: '#A7F3D0' }}>
              {t('jackpot.contract.confirm.chance', { value: chance })}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button type="button" onClick={sign} className={`pj-spin inline-flex items-center justify-center gap-1.5 h-12 rounded-full text-[15px] font-bold ${FOCUS_RING}`}>
                <PenLine className="relative w-4 h-4" aria-hidden />
                <span className="relative">{t('jackpot.contract.confirm.sign')}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className={`inline-flex items-center justify-center h-11 rounded-full text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`}
                style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)' }}
              >
                {t('jackpot.contract.confirm.back')}
              </button>
            </div>
          </div>
        )}
      </OracleSheet>
    </div>
  );
};

export default ContractPanel;
