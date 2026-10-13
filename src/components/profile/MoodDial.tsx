import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MOODS, MOOD_BY_KEY, withMoodAlpha, type Mood } from '../../lib/moods';
import { PAPER, MIST, PIXEL, NIGHT, FOCUS_RING } from '../../lib/oracleTheme';
import type { Affinity, MoodSlice } from '../../lib/tasteStats';
import { formatOne, measureText, useElementWidth } from './observatoryKit';

// O disco dos humores (13/10/2026, segunda versão).
//
// Um disco de vidro com um anel em volta. O anel é dividido entre os 9
// humores (as prateleiras dos oráculos), cada um na sua cor e sempre na mesma
// ordem; o tamanho de cada arco é a parte dos filmes da pessoa naquele humor.
// Sobre cada arco, uma pílula com a letra e a %. Os 3 humores do código da
// personalidade têm a pílula com o contorno aceso na cor do humor.
//
// Tocar num humor (arco ou pílula) GIRA o anel até ele parar no topo, sob o
// marcador; tocar de novo (ou fechar) volta o anel para o lugar. As pílulas
// giram junto mas continuam de pé.
//
// No disco ficam os temas (palavras-chave) mais bem avaliados: o TAMANHO de
// cada palavra é a nota média que a pessoa dá aos filmes com aquele tema.
// Para não virar um emaranhado, aparecem no máximo 5 de cada vez (4 no
// celular) e os grupos se alternam sozinhos a cada poucos segundos — cada
// grupo mistura palavras grandes e pequenas.
//
// Nada do SVG é animado pelo framer-motion (o pathLength/whileInView em SVG
// não desenhava os arcos em alguns celulares): o anel é desenhado estático e
// o giro é um transform de CSS num <div>.

interface MoodDialProps {
  slices: MoodSlice[];
  // humores do código da personalidade, do mais forte para o menos
  codeKeys: string[];
  selected: string | null;
  onToggle: (key: string) => void;
  words: Affinity[];
  caption: string;
  emptyText: string;
}

// ---------- geometria (unidades do viewBox, centro em 0,0) ----------
const VB = 200;
const R = 170; // centro do traço do anel
const W = 18; // espessura do arco
const DISC_R = 146; // disco de vidro
const GAP_DEG = 3.2;
const MIN_ARC_DEG = 8;

type Arc = { mood: Mood; slice: MoodSlice | undefined; start: number; end: number; mid: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;
const polar = (deg: number, r: number) => ({ x: Math.cos(toRad(deg)) * r, y: Math.sin(toRad(deg)) * r });
const norm180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

// "#RRGGBB" + opacidade
function withHexAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function arcPath(r: number, from: number, to: number): string {
  const a = polar(from, r);
  const b = polar(to, r);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

// A volta dividida pela parte de cada humor, a partir do topo; humor sem
// filme (ou quase) fica com uma fatia mínima, só para marcar o lugar.
function layoutArcs(bySlice: Map<string, MoodSlice>): Arc[] {
  const total = 360 - GAP_DEG * MOODS.length;
  const raw = MOODS.map((mood) => (bySlice.get(mood.key)?.share ?? 0) * total);
  const small = raw.map((deg) => deg < MIN_ARC_DEG);
  const smallCount = small.filter(Boolean).length;
  const bigSum = raw.reduce((sum, deg, i) => (small[i] ? sum : sum + deg), 0);
  const free = total - smallCount * MIN_ARC_DEG;
  const angles = raw.map((deg, i) => (small[i] ? MIN_ARC_DEG : bigSum > 0 ? (deg / bigSum) * free : free / (MOODS.length - smallCount)));
  let cursor = -90 + GAP_DEG / 2;
  return MOODS.map((mood, i) => {
    const start = cursor;
    const end = cursor + angles[i];
    cursor = end + GAP_DEG;
    return { mood, slice: bySlice.get(mood.key), start, end, mid: (start + end) / 2 };
  });
}

// Afasta as pílulas vizinhas que ficariam uma em cima da outra (arcos curtos
// lado a lado), mantendo cada uma o mais perto possível do seu arco.
function spreadAngles(mids: number[], minSep: number): number[] {
  const angles = [...mids];
  const n = angles.length;
  for (let iter = 0; iter < 80; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const gap = (((angles[j] - angles[i]) % 360) + 360) % 360;
      if (gap < minSep) {
        const push = (minSep - gap) / 2;
        angles[i] -= push;
        angles[j] += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return angles;
}

// ---------- palavras no disco ----------
type WordBox = { item: Affinity; size: number; width: number };
type WordRow = { y: number; words: WordBox[] };

// Linhas dentro do círculo: as palavras maiores nas linhas do meio (as mais
// largas). Usa o menor número de linhas em que tudo cabe; se não couber,
// deixa de fora as últimas.
function packWords(words: WordBox[], radius: number, lineH: number, gap: number): WordRow[] {
  for (let count = words.length; count > 0; count--) {
    const list = words.slice(0, count);
    for (let k = 1; k <= 6; k++) {
      const top = (-k * lineH) / 2;
      const ys = Array.from({ length: k }, (_, i) => top + lineH * i + lineH / 2);
      const widths = ys.map((y) => {
        const edge = Math.abs(y) + lineH / 2;
        return edge >= radius ? 0 : 2 * Math.sqrt(radius * radius - edge * edge) * 0.9;
      });
      const order = ys.map((y, i) => ({ i, d: Math.abs(y) })).sort((a, b) => a.d - b.d).map((o) => o.i);
      const rows: WordRow[] = ys.map((y) => ({ y, words: [] }));
      const used = ys.map(() => 0);
      let fits = true;
      for (const word of list) {
        const at = order.find((ri) => used[ri] + (rows[ri].words.length ? gap : 0) + word.width <= widths[ri]);
        if (at === undefined) {
          fits = false;
          break;
        }
        used[at] += (rows[at].words.length ? gap : 0) + word.width;
        rows[at].words.push(word);
      }
      if (fits) return rows.filter((row) => row.words.length > 0);
    }
  }
  return [];
}

const CYCLE_MS = 4200;

const MoodDial: React.FC<MoodDialProps> = ({ slices, codeKeys, selected, onToggle, words, caption, emptyText }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { ref, width: size } = useElementWidth<HTMLDivElement>();
  const inView = useInView(ref, { margin: '-60px' });
  const [rotation, setRotation] = useState(0);
  const [group, setGroup] = useState(0);

  const bySlice = useMemo(() => new Map(slices.map((s) => [s.key, s])), [slices]);
  const arcs = useMemo(() => layoutArcs(bySlice), [bySlice]);
  const compact = size > 0 && size < 380;
  const px = size > 0 ? size / (VB * 2) : 0; // px por unidade do viewBox
  const pct = (share: number) => `${Math.round(share * 100)}%`;

  // Gira até o humor escolhido ficar no topo; sem escolha, volta ao lugar.
  // Sempre pelo caminho mais curto.
  useEffect(() => {
    const arc = selected ? arcs.find((a) => a.mood.key === selected) : null;
    const target = arc ? -90 - arc.mid : 0;
    setRotation((current) => current + norm180(target - current));
  }, [selected, arcs]);

  // Pílulas: no anel, afastadas quando os arcos são curtos.
  const pillW = compact ? 46 : 54;
  const pillAngles = useMemo(() => {
    if (!px) return arcs.map((a) => a.mid);
    const minSep = ((pillW + 6) / (R * px)) * (180 / Math.PI);
    return spreadAngles(
      arcs.map((a) => a.mid),
      minSep
    );
  }, [arcs, px, pillW]);

  // ---------- grupos de palavras que se alternam ----------
  const perGroup = compact ? 4 : 5;
  const groups = useMemo(() => {
    const count = Math.max(1, Math.ceil(words.length / perGroup));
    return Array.from({ length: count }, (_, g) => words.filter((_, i) => i % count === g));
  }, [words, perGroup]);
  const wordsKey = words.map((w) => w.key).join('|');
  useEffect(() => setGroup(0), [wordsKey, perGroup]);
  useEffect(() => {
    if (reduceMotion || groups.length < 2 || !inView) return;
    const timer = window.setInterval(() => setGroup((g) => (g + 1) % groups.length), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [groups.length, reduceMotion, inView]);

  // Tamanho = nota média (entre a menor e a maior nota da lista toda, para os
  // grupos falarem a mesma escala).
  const [minSize, maxSize] = compact ? [11, 19] : [12.5, 24];
  const avgs = words.map((w) => w.avg);
  const lo = avgs.length ? Math.min(...avgs) : 0;
  const hi = avgs.length ? Math.max(Math.max(...avgs), lo + 1) : 1;
  const sizeOf = (avg: number) => Math.round((minSize + ((avg - lo) / (hi - lo)) * (maxSize - minSize)) * 2) / 2;

  const current = groups[Math.min(group, groups.length - 1)] || [];
  const rows = useMemo(() => {
    if (!px || current.length === 0) return [];
    const radius = DISC_R * px * 0.8;
    // Palavra comprida demais para a linha mais larga: diminui só ela.
    const widest = 2 * Math.sqrt(radius * radius - (compact ? 15 : 19) ** 2) * 0.9 - 4;
    const boxes = current
      .map((item) => {
        let fontSize = sizeOf(item.avg);
        let width = measureText(item.name, fontSize, fontSize > 16 ? 600 : 500);
        if (width > widest) {
          fontSize = Math.max(10, Math.floor(((fontSize * widest) / width) * 2) / 2);
          width = Math.min(widest, measureText(item.name, fontSize, fontSize > 16 ? 600 : 500));
        }
        return { item, size: fontSize, width };
      })
      .sort((a, b) => b.size - a.size);
    return packWords(boxes, radius, compact ? 30 : 38, compact ? 12 : 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, px, compact, lo, hi]);

  const selectedMood = selected ? MOOD_BY_KEY[selected] : null;
  const accent = selectedMood?.color ?? (codeKeys[0] ? MOOD_BY_KEY[codeKeys[0]]?.color : undefined) ?? '#8B5CF6';
  const spin = reduceMotion ? 'none' : 'transform 850ms cubic-bezier(0.22, 1, 0.36, 1)';
  const discPct = (DISC_R / VB) * 50; // raio do disco em % do lado

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[440px] aspect-square select-none">
      {/* marcador no topo: onde para o humor escolhido */}
      <span
        aria-hidden
        className="absolute left-0 right-0 mx-auto w-0 h-0 z-20 transition-opacity duration-300"
        style={{
          top: `${(1 - (R + W / 2 + 14) / VB) * 50}%`,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: `9px solid ${selectedMood?.color ?? 'transparent'}`,
          opacity: selectedMood ? 1 : 0,
          filter: selectedMood ? `drop-shadow(0 0 6px ${selectedMood.color})` : undefined,
        }}
      />

      {/* disco de vidro (não gira) */}
      <div
        className={`absolute rounded-full overflow-hidden ${reduceMotion ? '' : 'essence-disc-in'}`}
        style={{
          inset: `${50 - discPct}%`,
          background: [
            'radial-gradient(120% 90% at 28% 18%, rgba(255,255,255,0.16), rgba(255,255,255,0.04) 38%, transparent 62%)',
            `radial-gradient(closest-side, ${withHexAlpha(accent, 0.16)}, transparent 80%)`,
            'rgba(28,20,51,0.42)',
          ].join(', '),
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -30px 60px -30px rgba(0,0,0,0.55), 0 30px 70px -36px ${withHexAlpha(accent, 0.6)}`,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          transition: 'box-shadow 500ms ease',
        }}
      >
        {/* reflexo */}
        <span
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{ left: '12%', top: '6%', width: '56%', height: '30%', background: 'radial-gradient(closest-side, rgba(255,255,255,0.10), transparent)', transform: 'rotate(-18deg)' }}
        />

        {/* palavras */}
        {size > 0 && (
          <div className="absolute inset-0" aria-live="polite">
            <p className="absolute left-0 right-0 text-center text-[11px] leading-none px-6" style={{ top: compact ? '15%' : '14%', color: MIST }}>
              {caption}
            </p>
            {current.length === 0 ? (
              <p className="absolute inset-[24%] grid place-items-center text-center text-[12px] leading-snug" style={{ color: MIST }}>
                {emptyText}
              </p>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${selected ?? 'all'}-${group}`}
                  className="absolute inset-0"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.02 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                >
                  {rows.map((row, ri) => (
                    <div
                      key={ri}
                      className="absolute left-0 right-0 flex items-center justify-center"
                      style={{ top: `calc(50% + ${row.y}px - ${compact ? 15 : 19}px)`, height: compact ? 30 : 38, columnGap: compact ? 12 : 16 }}
                    >
                      {row.words.map(({ item, size: fontSize }, wi) => (
                        <motion.span
                          key={item.key}
                          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.08 + (ri * 2 + wi) * 0.07, duration: 0.4 }}
                          className="whitespace-nowrap"
                          title={t('profile.observatory.keywordTitle', { name: item.name, count: item.count, avg: formatOne(item.avg, i18n.language) })}
                        >
                          <span
                            className={`inline-block capitalize leading-none ${reduceMotion ? '' : 'taste-float'}`}
                            style={{
                              fontSize,
                              fontWeight: fontSize > 16 ? 600 : 500,
                              color: PAPER,
                              opacity: 0.62 + ((fontSize - minSize) / (maxSize - minSize || 1)) * 0.38,
                              textShadow: `0 0 18px ${withHexAlpha(accent, 0.45)}`,
                              animationDelay: `${((ri * 3 + wi) % 5) * 0.8}s`,
                              animationDuration: `${5.5 + ((ri + wi) % 3)}s`,
                            }}
                          >
                            {item.name}
                          </span>
                        </motion.span>
                      ))}
                    </div>
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
            {groups.length > 1 && (
              <span className="absolute left-0 right-0 flex justify-center gap-1.5" style={{ bottom: compact ? '14%' : '13%' }} aria-hidden>
                {groups.map((_, g) => (
                  <span
                    key={g}
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: g === group ? 14 : 6, background: g === group ? withHexAlpha(accent, 0.9) : 'rgba(243,234,211,0.22)' }}
                  />
                ))}
              </span>
            )}
          </div>
        )}
      </div>

      {/* anel (gira) */}
      <div className={`absolute inset-0 ${reduceMotion ? '' : 'essence-ring-in'}`}>
        <div className="absolute inset-0" style={{ transform: `rotate(${rotation}deg)`, transition: spin }}>
          <svg viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`} className="absolute inset-0 w-full h-full" aria-hidden>
            {/* canaleta de vidro */}
            <circle r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={W + 12} />
            <circle r={R + W / 2 + 6} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <circle r={R - W / 2 - 6} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            {arcs.map(({ mood, slice, start, end, mid }) => {
              const share = slice?.share ?? 0;
              const isSel = selected === mood.key;
              const dim = selected !== null && !isSel;
              const width = isSel ? W + 8 : W;
              const capDeg = ((width / 2) / R) * (180 / Math.PI);
              const from = start + capDeg;
              const to = end - capDeg;
              const dot = to - from < 0.5;
              const at = polar(mid, R);
              const opacity = dim ? 0.3 : share === 0 ? 0.35 : 1;
              return (
                <g key={mood.key} onClick={() => onToggle(mood.key)} style={{ cursor: 'pointer', opacity, transition: 'opacity 300ms ease' }}>
                  {/* brilho do escolhido */}
                  {isSel && !dot && <path d={arcPath(R, from, to)} fill="none" stroke={mood.color} strokeOpacity={0.28} strokeWidth={width + 16} strokeLinecap="round" />}
                  {dot ? (
                    <circle cx={at.x} cy={at.y} r={width / 2} fill={mood.color} />
                  ) : (
                    <>
                      <path d={arcPath(R, from, to)} fill="none" stroke={mood.color} strokeWidth={width} strokeLinecap="round" />
                      {/* reflexo de vidro na borda de fora do arco */}
                      <path d={arcPath(R + width / 2 - 3.5, from, to)} fill="none" stroke="#FFFFFF" strokeOpacity={0.32} strokeWidth={2} strokeLinecap="round" />
                    </>
                  )}
                  {/* área de toque maior que o arco */}
                  <path d={arcPath(R, start, end)} fill="none" stroke="transparent" strokeWidth={W + 26} />
                </g>
              );
            })}
          </svg>

          {/* pílulas: letra + %, de pé enquanto o anel gira */}
          {px > 0 &&
            arcs.map(({ mood, slice }, i) => {
              const at = polar(pillAngles[i], R);
              const share = slice?.share ?? 0;
              const isSel = selected === mood.key;
              const inCode = codeKeys.includes(mood.key);
              const dim = selected !== null && !isSel;
              const label = t('profile.observatory.arcLabel', {
                mood: t(mood.labelKey),
                pct: pct(share),
                count: slice?.films ?? 0,
                avg: typeof slice?.avg === 'number' ? formatOne(slice.avg, i18n.language) : '–',
              });
              return (
                <button
                  key={mood.key}
                  type="button"
                  onClick={() => onToggle(mood.key)}
                  aria-pressed={isSel}
                  aria-label={label}
                  title={label}
                  className={`absolute z-10 inline-flex items-center justify-center gap-1 min-h-0 min-w-0 rounded-full leading-none ${FOCUS_RING}`}
                  style={{
                    left: `${50 + (at.x / VB) * 50}%`,
                    top: `${50 + (at.y / VB) * 50}%`,
                    height: compact ? 22 : 25,
                    padding: compact ? '0 7px' : '0 9px',
                    transform: `translate(-50%, -50%) rotate(${-rotation}deg) scale(${isSel ? 1.12 : 1})`,
                    transition: `${spin === 'none' ? '' : `${spin}, `}opacity 300ms ease, background 300ms ease`,
                    opacity: dim ? 0.45 : 1,
                    background: isSel ? mood.color : 'rgba(18,13,34,0.86)',
                    boxShadow: isSel
                      ? `0 0 0 2px ${NIGHT}, 0 0 16px ${mood.color}`
                      : inCode
                        ? `inset 0 0 0 1.5px ${mood.color}, 0 0 12px ${withMoodAlpha(mood, 0.45)}`
                        : `inset 0 0 0 1px ${withMoodAlpha(mood, 0.4)}, 0 4px 10px -4px rgba(0,0,0,0.6)`,
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                  }}
                >
                  <span style={{ ...PIXEL, color: isSel ? NIGHT : mood.color }} className={compact ? 'text-[12px]' : 'text-[13px]'}>
                    {mood.letter}
                  </span>
                  <span className={`font-semibold tabular-nums ${compact ? 'text-[10.5px]' : 'text-[11.5px]'}`} style={{ color: isSel ? NIGHT : PAPER }}>
                    {pct(share)}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default MoodDial;
