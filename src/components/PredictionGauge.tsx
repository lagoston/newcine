import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion, type AnimationPlaybackControls } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { NIGHT } from '../lib/oracleTheme';
import { formatChance, ORACLE_SPECTRUM, reigningRange, spectrumColor } from '../lib/prediction';

// O Astrolábio do Oráculo (14/11/2026): a nota prevista no menu do título.
//
// Pedido do Bruno: "Números absolutos são cartesianos demais para o
// CineOracle; eles não têm alma. Trocar os algarismos por um espectro de cores
// com uma agulha oscilante transforma a previsão em um evento."
//
//   • O arco: fino e curvo, como o mostrador de um rádio antigo. Vai do azul
//     gélido (nota baixa), passa pelo púrpura (nota média) e acaba no dourado
//     incandescente (o 10). Tem onze riscos, um por nota, e nenhum número.
//   • A dança: a agulha nasce no centro e varre o arco de ponta a ponta, como
//     se lesse o gosto da pessoa. Depois de 1,5 s (ou quando a previsão
//     chegar, se demorar mais), ela trava no lugar da nota com um coice de
//     mola. A varredura é também o "carregando".
//   • A região onde a nota impera: travada a agulha, acende o trecho do arco
//     em volta dela que guarda metade da chance. Quem dá notas previsíveis vê
//     um trecho curto; quem varia mais, um trecho largo.
//   • A estrela na ponta dourada é o 10: brilha conforme a chance de nota 10.
//   • Ressonância: quando a previsão é 10, o arco inteiro pulsa e a agulha
//     treme de leve, em rajadas, no mesmo compasso.
//
// Os números não somem para quem precisa deles: estão no texto para leitores
// de tela e na dica ao passar o mouse. Com "reduzir movimento" não há dança,
// pulso nem tremor: a agulha aparece já no lugar.

// ---------- geometria (em unidades do desenho) ----------
const VIEW_W = 240;
const VIEW_H = 64;
const ARC_LEFT = 16;
const ARC_RIGHT = 224;
const ARC_TOP = 10;
// a flecha do arco (o quanto ele sobe do começo ao topo)
const ARC_RISE = 38;
const HALF = (ARC_RIGHT - ARC_LEFT) / 2;
const RADIUS = (HALF * HALF + ARC_RISE * ARC_RISE) / (2 * ARC_RISE);
const CENTER_X = VIEW_W / 2;
const CENTER_Y = ARC_TOP + RADIUS;
// meia abertura do arco, em radianos
const SWEEP = Math.asin(HALF / RADIUS);

// nota (0 a 10) → ângulo a partir da vertical; a agulha pode passar um pouco das pontas
const angleOf = (rating: number) => (rating / 10 - 0.5) * 2 * SWEEP;
const pointAt = (angle: number, radius: number): [number, number] => [CENTER_X + radius * Math.sin(angle), CENTER_Y - radius * Math.cos(angle)];
const fix = (value: number) => value.toFixed(2);
const arcPath = (from: number, to: number, radius = RADIUS): string => {
  const [x1, y1] = pointAt(angleOf(from), radius);
  const [x2, y2] = pointAt(angleOf(to), radius);
  return `M${fix(x1)} ${fix(y1)} A${fix(radius)} ${fix(radius)} 0 0 1 ${fix(x2)} ${fix(y2)}`;
};
// a agulha: uma lâmina que afina do pé (dentro do arco) até a ponta (fora dele)
const FOOT = RADIUS - 24;
const needlePath = (rating: number): string => {
  const angle = angleOf(rating);
  const [tx, ty] = pointAt(angle, RADIUS + 8.5);
  const [ex, ey] = pointAt(angle, FOOT);
  const px = Math.cos(angle) * 1.55;
  const py = Math.sin(angle) * 1.55;
  return `M${fix(tx)} ${fix(ty)} L${fix(ex + px)} ${fix(ey + py)} L${fix(ex - px)} ${fix(ey - py)} Z`;
};

const FULL_ARC = arcPath(0, 10);
// o limbo graduado: um fio por dentro do arco e onze riscos, um por nota
const LIMB = arcPath(0, 10, RADIUS - 13.5);
const TICKS = Array.from({ length: 11 }, (_, rating) => {
  const angle = angleOf(rating);
  const [x1, y1] = pointAt(angle, RADIUS - 13.5);
  const [x2, y2] = pointAt(angle, RADIUS - (rating % 5 === 0 ? 6 : 9.5));
  return { rating, x1, y1, x2, y2 };
});
// a estrela do 10, logo depois da ponta dourada
const [STAR_X, STAR_Y] = pointAt(angleOf(10) + 0.052, RADIUS);
const starPath = (x: number, y: number, size: number) =>
  `M${fix(x)} ${fix(y - size)} Q${fix(x)} ${fix(y)} ${fix(x + size)} ${fix(y)} Q${fix(x)} ${fix(y)} ${fix(x)} ${fix(y + size)} Q${fix(x)} ${fix(y)} ${fix(x - size)} ${fix(y)} Q${fix(x)} ${fix(y)} ${fix(x)} ${fix(y - size)} Z`;

// ---------- a dança ----------
// O ritual dura pelo menos isto antes de a agulha travar.
const RITUAL_MS = 1500;
// A varredura: do lugar onde está (null) para as pontas, cada vez um pouco diferente.
const SCAN: (number | null)[] = [null, 0.2, 9.8, 0.9, 9.6, 2.1, 9.1, 0.2, 9.5, 1.4, 9.8, 2.6, 5];
const SCAN_SECONDS = (SCAN.length - 1) * 0.235;
// a mola do travamento: passa um pouco do ponto e volta (o coice)
const SETTLE = { type: 'spring' as const, stiffness: 210, damping: 13, mass: 1 };

interface PredictionGaugeProps {
  // a nota dos selos (inteira, já com o corte de 9 e 10)
  predicted: number | null;
  // a expectativa e a largura (ruído pessoal) do modelo
  mu: number | null;
  sigma: number | null;
  // a chance de nota 10 (0 a 1)
  tenChance: number | null;
  // a previsão ainda não chegou: a agulha segue varrendo
  pending?: boolean;
}

const PredictionGauge: React.FC<PredictionGaugeProps> = ({ predicted, mu, sigma, tenChance, pending = false }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const target = mu ?? predicted;
  const ready = !pending && target !== null;
  // 10 previsto: o título ressoa com a Persona
  const resonant = ready && predicted === 10;

  const [locked, setLocked] = useState(false);
  const position = useMotionValue(5);
  const needleRef = useRef<SVGPathElement>(null);
  const footRef = useRef<SVGCircleElement>(null);
  const handRef = useRef<SVGGElement>(null);
  const scanRef = useRef<AnimationPlaybackControls | null>(null);
  const startedAt = useRef(0);

  // A agulha é redesenhada a cada passo (posição e a cor do brilho, que é a
  // do ponto do arco para onde ela aponta).
  const draw = (rating: number) => {
    const at = Math.min(10.35, Math.max(-0.35, rating));
    needleRef.current?.setAttribute('d', needlePath(at));
    const [fx, fy] = pointAt(angleOf(at), FOOT);
    footRef.current?.setAttribute('cx', fix(fx));
    footRef.current?.setAttribute('cy', fix(fy));
    if (handRef.current) handRef.current.style.filter = `drop-shadow(0 0 3.5px ${spectrumColor(at)})`;
  };
  useMotionValueEvent(position, 'change', draw);
  useLayoutEffect(() => {
    draw(position.get());
    // só no primeiro desenho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      scanRef.current?.stop();
      scanRef.current = null;
      position.set(ready && target !== null ? target : 5);
      setLocked(ready);
      return;
    }
    if (!scanRef.current) {
      startedAt.current = performance.now();
      setLocked(false);
      scanRef.current = animate(position, SCAN, { duration: SCAN_SECONDS, ease: 'easeInOut', repeat: Infinity });
    }
    if (!ready || target === null) return;
    let settle: AnimationPlaybackControls | null = null;
    const timer = window.setTimeout(
      () => {
        scanRef.current?.stop();
        scanRef.current = null;
        settle = animate(position, target, SETTLE);
        setLocked(true);
      },
      Math.max(0, RITUAL_MS - (performance.now() - startedAt.current)),
    );
    return () => {
      window.clearTimeout(timer);
      settle?.stop();
    };
  }, [ready, target, reduceMotion, position]);
  useEffect(() => () => scanRef.current?.stop(), []);

  // Ressonância: a agulha treme em rajadas curtas, no compasso do pulso do arco.
  useEffect(() => {
    if (!locked || !resonant || reduceMotion || target === null) return;
    let tremble: AnimationPlaybackControls | null = null;
    const timer = window.setTimeout(() => {
      tremble = animate(position, [target, target + 0.07, target - 0.06, target + 0.05, target - 0.07, target + 0.03, target], { duration: 0.5, ease: 'linear', repeat: Infinity, repeatDelay: 1.9 });
    }, 900);
    return () => {
      window.clearTimeout(timer);
      tremble?.stop();
    };
  }, [locked, resonant, reduceMotion, target, position]);

  const [low, high] = locked && target !== null ? reigningRange(target, sigma) : [5, 5];
  const middle = locked && target !== null ? Math.min(10, Math.max(0, target)) : 5;
  // três trechos, do mais largo (fraco) ao miolo (forte): as bordas esmaecem
  const glow = [1, 0.62, 0.3].map((share) => arcPath(Math.max(0, middle - (middle - low) * share), Math.min(10, middle + (high - middle) * share)));
  const starShine = locked ? 0.3 + 0.7 * Math.min(1, (tenChance ?? 0) / 0.35) : 0.3;

  const shown = predicted ?? (target !== null ? Math.round(target) : 0);
  const label = !ready
    ? t('movieModal.score.gaugePending')
    : tenChance !== null && shown <= 9
      ? t('movieModal.score.gaugeAria', { rating: shown, chance: formatChance(tenChance) })
      : t('movieModal.score.gaugeAriaPlain', { rating: shown });

  return (
    <span role="img" aria-label={label} title={ready ? label : undefined} className="block w-full max-w-[240px]">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full h-auto overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-spectrum`} gradientUnits="userSpaceOnUse" x1={ARC_LEFT} y1="0" x2={ARC_RIGHT} y2="0">
            {ORACLE_SPECTRUM.map((color, rating) => (
              <stop key={rating} offset={rating / 10} stopColor={color} />
            ))}
          </linearGradient>
          {/* em unidades do desenho: a caixa de um trecho quase reto do arco é fina demais para o borrão */}
          <filter id={`${uid}-blur`} filterUnits="userSpaceOnUse" x="-20" y="-24" width={VIEW_W + 40} height={VIEW_H + 48}>
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>

        {/* o pulso da ressonância: o arco inteiro, borrado, respirando */}
        {resonant && locked && <path d={FULL_ARC} fill="none" stroke={`url(#${uid}-spectrum)`} strokeWidth="11" strokeLinecap="round" filter={`url(#${uid}-blur)`} className="astrolabe-pulse" />}

        {/* o limbo graduado */}
        <path d={LIMB} fill="none" stroke="rgba(243,234,211,0.16)" strokeWidth="0.8" strokeLinecap="round" />
        {TICKS.map((tick) => (
          <line key={tick.rating} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="rgba(243,234,211,0.32)" strokeWidth="0.9" strokeLinecap="round" />
        ))}

        {/* o arco apagado e, por cima, a região onde a nota impera */}
        <path d={FULL_ARC} fill="none" stroke={`url(#${uid}-spectrum)`} strokeWidth="3.2" strokeLinecap="round" opacity={resonant && locked ? 0.8 : 0.5} style={{ transition: 'opacity 600ms ease-out' }} />
        <g style={{ opacity: locked ? 1 : 0, transition: 'opacity 700ms ease-out 250ms' }}>
          <path d={glow[0]} fill="none" stroke={`url(#${uid}-spectrum)`} strokeWidth="10" strokeLinecap="round" filter={`url(#${uid}-blur)`} opacity="0.75" />
          {glow.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={`url(#${uid}-spectrum)`} strokeWidth="5" strokeLinecap="round" opacity={[0.45, 0.7, 1][i]} />
          ))}
        </g>

        {/* a estrela do 10: brilha conforme a chance de nota 10 */}
        <path
          d={starPath(STAR_X, STAR_Y, 5.2)}
          fill="#FFE39A"
          className={resonant && locked ? 'astrolabe-star' : undefined}
          style={{ opacity: starShine, filter: `drop-shadow(0 0 ${2 + 5 * starShine}px rgba(255,215,97,${0.35 + 0.6 * starShine}))`, transition: 'opacity 700ms ease-out 250ms, filter 700ms ease-out 250ms' }}
        />

        {/* a agulha */}
        <g ref={handRef} style={{ opacity: reduceMotion && !ready ? 0 : 1, transition: 'opacity 300ms ease-out' }}>
          <path ref={needleRef} fill="#FFF8E8" stroke={NIGHT} strokeWidth="0.6" strokeLinejoin="round" />
          {/* o cubo da agulha: um anel, como o eixo de um ponteiro */}
          <circle ref={footRef} r="2.7" fill={NIGHT} stroke="#FFF8E8" strokeWidth="1.3" />
        </g>
      </svg>
    </span>
  );
};

export default PredictionGauge;
