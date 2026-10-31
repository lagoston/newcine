import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, type AnimationPlaybackControls } from 'framer-motion';
import PosterArt from './PosterArt';
import CollectorMark from './CollectorMark';
import { RARITY_META, type CatalogPoster, type PosterEffect, type PosterRarity } from '../../lib/posterJackpot';
import { playTick } from '../../lib/jackpotSound';

// A roleta do Poster Jackpot, no estilo da abertura de caixas do CS:GO: uma
// fita de pôsteres corre por baixo da agulha, desacelera e para no prêmio
// que o banco já sorteou. A fita é montada na hora do giro (os pôsteres que
// estavam na tela continuam no lugar, depois vêm os sorteados para encher, o
// prêmio e mais alguns depois dele) e anda por uma curva de freio longa, com
// um tic a cada pôster que passa pela agulha.

export interface ReelCard {
  key: string;
  item: CatalogPoster;
  effect: PosterEffect;
}

export interface JackpotReelHandle {
  // Recuo de antecipação enquanto o banco responde.
  windUp: () => void;
  // Gira até o prêmio; resolve quando a fita para.
  spinTo: (prize: ReelCard, opts: { reduceMotion: boolean }) => Promise<void>;
  // Toque na fita durante o giro: chega no prêmio na hora.
  skip: () => void;
}

const GAP = 10;
const SPIN_CARDS = 48; // quantos pôsteres passam pela agulha num giro
const TAIL = 7;
const SPIN_SECONDS = 6.2;
const EASE: [number, number, number, number] = [0.08, 0.62, 0.14, 1];

let cardSeq = 0;
export const reelKey = () => `c${(cardSeq += 1)}`;

const JackpotReel = forwardRef<
  JackpotReelHandle,
  {
    // Sorteia um pôster para encher a fita (pode pedir uma raridade, para o
    // "quase" lendário do lado do prêmio).
    filler: (rarity?: PosterRarity) => ReelCard | null;
    spinning: boolean;
    onSkipRequest?: () => void;
    winnerKey: string | null;
    className?: string;
  }
>(({ filler, spinning, onSkipRequest, winnerKey, className = '' }, ref) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [geom, setGeom] = useState<{ vw: number; w: number }>({ vw: 0, w: 96 });
  const geomRef = useRef(geom);
  geomRef.current = geom;
  const [strip, setStrip] = useState<ReelCard[]>([]);
  const stripRef = useRef(strip);
  stripRef.current = strip;
  // Onde a fita está parada: o índice sob a agulha e o desvio dentro dele.
  const restRef = useRef<{ index: number; offset: number }>({ index: 3, offset: 0 });
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const finishRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<{ shift: number; prizeIndex: number; offset: number; reduceMotion: boolean } | null>(null);

  const targetX = useCallback((index: number, offset: number, g = geomRef.current) => g.vw / 2 - (index * (g.w + GAP) + g.w / 2 + offset), []);

  // A primeira fita: pôsteres sorteados, um no meio.
  useEffect(() => {
    if (stripRef.current.length) return;
    const first: ReelCard[] = [];
    for (let i = 0; i < 12; i++) {
      const card = filler();
      if (card) first.push(card);
    }
    if (first.length) setStrip(first);
  }, [filler]);

  // Mede a janela: o tamanho do pôster acompanha a largura (uns 3,7 por vez).
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      const vw = el.clientWidth;
      const w = Math.round(Math.min(124, Math.max(78, (vw - 3 * GAP) / 3.7)));
      setGeom((prev) => (prev.vw === vw && prev.w === w ? prev : { vw, w }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Parada: a fita fica no lugar quando a largura muda.
  useLayoutEffect(() => {
    if (controlsRef.current || pendingRef.current) return;
    x.set(targetX(restRef.current.index, restRef.current.offset, geom));
  }, [geom, x, targetX]);

  // O tic: cada pôster que cruza a agulha.
  useEffect(() => {
    let last = Number.NaN;
    let lastAt = 0;
    return x.on('change', (value) => {
      if (!controlsRef.current) return;
      const g = geomRef.current;
      const index = Math.floor((g.vw / 2 - value) / (g.w + GAP));
      if (index !== last) {
        last = index;
        const now = performance.now();
        if (now - lastAt > 26) {
          lastAt = now;
          playTick();
        }
      }
    });
  }, [x]);

  const finish = useCallback(() => {
    controlsRef.current = null;
    const done = finishRef.current;
    finishRef.current = null;
    done?.();
  }, []);

  // A fita nova entrou: ajusta o deslocamento (para nada pular na tela) e gira.
  useLayoutEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    x.stop();
    x.set(x.get() + pending.shift);
    restRef.current = { index: pending.prizeIndex, offset: pending.offset };
    const target = targetX(pending.prizeIndex, pending.offset);
    if (pending.reduceMotion) {
      x.set(target);
      finish();
      return;
    }
    const controls = animate(x, target, { duration: SPIN_SECONDS, ease: EASE });
    controlsRef.current = controls;
    controls.then(() => {
      if (controlsRef.current === controls) finish();
    });
  }, [strip, x, targetX, finish]);

  useImperativeHandle(
    ref,
    () => ({
      windUp: () => {
        if (controlsRef.current) return;
        const g = geomRef.current;
        animate(x, x.get() + Math.min(26, g.w * 0.28), { duration: 0.42, ease: [0.3, 0, 0.2, 1] });
      },
      spinTo: (prize, { reduceMotion }) =>
        new Promise<void>((resolve) => {
          finishRef.current = resolve;
          const g = geomRef.current;
          const current = stripRef.current;
          const stepNow = g.w + GAP;
          // Tira da frente o que já saiu da tela (a fita não cresce sem fim).
          const firstVisible = Math.max(0, Math.floor(-x.get() / stepNow) - 1);
          const base = current.slice(firstVisible);
          const centered = Math.max(0, Math.floor((g.vw / 2 - x.get()) / stepNow) - firstVisible);
          const prizeIndex = centered + SPIN_CARDS + Math.floor(Math.random() * 4);
          const cards = base.slice(0, prizeIndex);
          const fill = () => filler() ?? { ...prize, key: reelKey() };
          while (cards.length < prizeIndex) cards.push(fill());
          cards[prizeIndex] = prize;
          for (let i = 0; i < TAIL; i++) cards.push(fill());
          // O "quase": às vezes um lendário encostado no prêmio.
          if (prize.item.rarity !== 'legendary' && Math.random() < 0.4) {
            const near = filler('legendary');
            if (near) cards[prizeIndex + (Math.random() < 0.5 ? -1 : 1)] = near;
          }
          const offset = (Math.random() * 2 - 1) * g.w * 0.38;
          pendingRef.current = { shift: firstVisible * stepNow, prizeIndex, offset, reduceMotion };
          setStrip(cards);
        }),
      skip: () => {
        const controls = controlsRef.current;
        if (!controls) return;
        controls.stop();
        const target = targetX(restRef.current.index, restRef.current.offset);
        const quick = animate(x, target, { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] });
        controlsRef.current = quick;
        quick.then(() => {
          if (controlsRef.current === quick) finish();
        });
      },
    }),
    [x, filler, targetX, finish]
  );

  const landed = !spinning && winnerKey !== null;

  return (
    <div className={`pj-reel-window px-3 py-2 sm:px-3.5 ${className}`} onClick={spinning ? onSkipRequest : undefined} aria-hidden>
      <span className="pj-needle-cap top" aria-hidden />
      <span className="pj-needle-cap bottom" aria-hidden />
      <span className="pj-needle" aria-hidden />
      <div ref={viewportRef} className="pj-reel-viewport py-2.5">
        <motion.div className="flex will-change-transform" style={{ x, gap: GAP, height: Math.round(geom.w * 1.5) }}>
          {strip.map((card) => {
            const meta = RARITY_META[card.item.rarity];
            const isWinner = landed && card.key === winnerKey;
            return (
              <div
                key={card.key}
                className={`pj-reel-card transition-[opacity,filter,transform] duration-500 ${isWinner ? 'pj-winner' : ''}`}
                style={{
                  width: geom.w,
                  height: Math.round(geom.w * 1.5),
                  opacity: landed && !isWinner ? 0.32 : 1,
                  transform: isWinner ? 'scale(1.04)' : undefined,
                  boxShadow: isWinner ? `0 0 28px 4px ${meta.glow}` : undefined,
                  zIndex: isWinner ? 2 : undefined,
                }}
              >
                <PosterArt filePath={card.item.file_path} effect={card.effect} size="w185" animated={isWinner} loading="eager" className="absolute inset-0" />
                <span aria-hidden className="pj-rarity-glow" style={{ background: `linear-gradient(0deg, ${meta.glow}, transparent)` }} />
                <span aria-hidden className="pj-rarity-bar" style={{ background: meta.color }} />
                <CollectorMark rarity={card.item.rarity} serial={card.item.serial} size="xs" bottom="calc(4px + 0.55em)" />
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
});

JackpotReel.displayName = 'JackpotReel';

export default JackpotReel;
