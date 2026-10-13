import React, { useId, useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Info, Scroll, X } from 'lucide-react';
import { MOODS, MOOD_BY_KEY, withMoodAlpha, type Mood } from '../../lib/moods';
import { personaText, topMoodKeys, PERSONA_THRESHOLD, type UserPersona } from '../../lib/persona';
import { PAPER, MIST, PIXEL, NIGHT, FOCUS_RING, glassPanel, ratingTone } from '../../lib/oracleTheme';
import type { Affinity, MoodSlice } from '../../lib/tasteStats';
import { PersonaCode, PersonaPoster, MoodChip } from '../PersonaBits';
import { PersonaRevelationSheet, PersonaHowItWorksSheet } from '../PersonaSheets';
import { ModuleTitle, formatOne, measureText, useElementWidth } from './observatoryKit';

// Personalidade cinematográfica + roda dos humores, num bloco só (13/10/2026).
//
// A roda é um anel: o perímetro inteiro é dividido entre os 9 humores (as
// prateleiras dos oráculos), cada um na sua cor e sempre no mesmo lugar, com
// o tamanho do arco = a parte dos filmes da pessoa naquele humor. A letra e a
// % vêm escritas no próprio arco. Os 3 humores do código da personalidade
// ficam mais grossos, com o número da posição. Dentro do anel flutuam os
// temas (palavras-chave do TMDB) mais bem avaliados.
//
// Ao lado, a personalidade: pôster, código, título e o começo da revelação
// (tocar abre a Revelação completa), e as 3 prateleiras do código. Tocar
// num humor — no anel ou numa das prateleiras — troca o painel pela leitura
// daquele humor (o que ele diz, quantos filmes, a média, a prateleira) e os
// temas do centro pelos temas dele. O "i" do canto abre o Como funciona.

interface EssenceRingProps {
  slices: MoodSlice[];
  counted: number;
  persona: UserPersona | null;
  personaLoading?: boolean;
  topKeywords: Affinity[];
  isOwn: boolean;
  // "@fulano" no perfil de outra pessoa
  ownerName?: string;
}

// ---------- geometria do anel (unidades do viewBox) ----------
const VIEW = 206;
const R = 172; // centro do traço de um arco comum
const W = 26; // espessura de um arco comum
const INNER = R - W / 2; // borda de dentro, igual para todos os arcos
const CODE_EXTRA = 8; // arcos do código: mais grossos para fora
const SELECTED_EXTRA = 14;
const DOTS_R = 150; // anel pontilhado por dentro
const WORDS_R = 142; // raio onde as palavras cabem
const GAP_DEG = 1.4;
const MIN_ARC_DEG = 3.5;

type ArcLayout = { mood: Mood; slice: MoodSlice | undefined; start: number; end: number };

const toRad = (deg: number) => (deg * Math.PI) / 180;
const polar = (deg: number, r: number) => ({ x: Math.cos(toRad(deg)) * r, y: Math.sin(toRad(deg)) * r });

// Caminho de um arco (sentido horário). `reverse` desenha de trás pra frente —
// usado no texto dos arcos de baixo, para as letras não ficarem de cabeça
// pra baixo.
function arcPath(r: number, from: number, to: number, reverse = false): string {
  const a = polar(from, r);
  const b = polar(to, r);
  const large = to - from > 180 ? 1 : 0;
  return reverse
    ? `M ${b.x.toFixed(2)} ${b.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${a.x.toFixed(2)} ${a.y.toFixed(2)}`
    : `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

// Divide a volta entre os humores pela parte de cada um; humor sem filme (ou
// quase) fica com uma fatia mínima, só para marcar o lugar.
function layoutArcs(bySlice: Map<string, MoodSlice>): ArcLayout[] {
  const total = 360 - GAP_DEG * MOODS.length;
  const raw = MOODS.map((mood) => (bySlice.get(mood.key)?.share ?? 0) * total);
  const small = raw.map((deg) => deg < MIN_ARC_DEG);
  const smallCount = small.filter(Boolean).length;
  const bigSum = raw.reduce((sum, deg, i) => (small[i] ? sum : sum + deg), 0);
  const free = total - smallCount * MIN_ARC_DEG;
  const angles = raw.map((deg, i) => {
    if (small[i]) return MIN_ARC_DEG;
    return bigSum > 0 ? (deg / bigSum) * free : free / (MOODS.length - smallCount);
  });
  let cursor = -90 + GAP_DEG / 2;
  return MOODS.map((mood, i) => {
    const start = cursor;
    const end = cursor + angles[i];
    cursor = end + GAP_DEG;
    return { mood, slice: bySlice.get(mood.key), start, end };
  });
}

// ---------- palavras no centro ----------
type WordBox = { item: Affinity; size: number; width: number };
type WordRow = { y: number; words: WordBox[] };

const WORD_GAP = 14;
const WORD_GAP_COMPACT = 10;

// Arruma as palavras em linhas dentro do círculo: as mais importantes nas
// linhas do meio (as mais largas), as outras para fora. Usa o menor número
// de linhas em que tudo cabe; se nada servir, deixa de fora as últimas.
function packWords(words: WordBox[], radius: number, lineH: number, captionH: number, captionW: number, gap: number): { rows: WordRow[]; captionY: number } | null {
  for (let count = words.length; count > 0; count--) {
    const list = words.slice(0, count);
    for (let k = 1; k <= 7; k++) {
      const block = captionH + k * lineH;
      const top = -block / 2;
      const captionY = top + captionH / 2;
      const ys = Array.from({ length: k }, (_, i) => top + captionH + lineH * i + lineH / 2);
      const chord = (y: number, h: number) => {
        const edge = Math.abs(y) + h / 2;
        return edge >= radius ? 0 : 2 * Math.sqrt(radius * radius - edge * edge) * 0.94;
      };
      if (captionW > 0 && chord(captionY, captionH) < captionW) continue;
      const widths = ys.map((y) => chord(y, lineH));
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
      if (fits) return { rows: rows.filter((row) => row.words.length > 0), captionY };
    }
  }
  return null;
}

const EssenceRing: React.FC<EssenceRingProps> = ({ slices, counted, persona, personaLoading = false, topKeywords, isOwn, ownerName }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const [selected, setSelected] = useState<string | null>(null);
  const [showRevelation, setShowRevelation] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const { ref: ringRef, width: ringPx } = useElementWidth<HTMLDivElement>();

  const bySlice = useMemo(() => new Map(slices.map((s) => [s.key, s])), [slices]);
  const arcs = useMemo(() => layoutArcs(bySlice), [bySlice]);
  const codeKeys = useMemo(() => topMoodKeys(persona), [persona]);
  const hasPersona = Boolean(persona?.code && persona.persona);
  const text = hasPersona && persona?.persona ? personaText(persona.persona, i18n.language) : null;

  const selectedMood = selected ? MOOD_BY_KEY[selected] : null;
  const selectedSlice = selected ? bySlice.get(selected as MoodSlice['key']) : undefined;
  const accent = selectedMood?.color ?? (codeKeys[0] ? MOOD_BY_KEY[codeKeys[0]]?.color : undefined) ?? '#8B5CF6';
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const avgText = (avg: number | null | undefined) => (typeof avg === 'number' ? formatOne(avg, i18n.language) : '–');
  const username = ownerName?.replace(/^@/, '');
  const toggle = (key: string) => setSelected((prev) => (prev === key ? null : key));

  // ---------- palavras ----------
  const words = selectedSlice ? selectedSlice.keywords : topKeywords;
  const caption = selectedMood
    ? t('profile.observatory.keywordsInMood', { mood: t(selectedMood.labelKey) })
    : ownerName
      ? t('profile.observatory.keywordsTitleOf', { name: ownerName })
      : t('profile.observatory.keywordsTitle');
  const scale = ringPx > 0 ? ringPx / (VIEW * 2) : 0;
  const compact = ringPx > 0 && ringPx < 380;
  const packed = useMemo(() => {
    if (!scale || words.length === 0) return null;
    const sizes = compact ? [14, 12.5, 11.5] : [18, 15, 13];
    const boxes: WordBox[] = words.map((item, i) => {
      const size = i < 2 ? sizes[0] : i < 5 ? sizes[1] : sizes[2];
      const width = measureText(item.name, size, 500) + 6 + measureText(formatOne(item.avg, i18n.language), compact ? 10 : 11, 500);
      return { item, size, width };
    });
    const captionW = measureText(caption, 11, 400) + 8;
    return packWords(boxes, WORDS_R * scale, compact ? 25 : 32, compact ? 18 : 22, captionW, compact ? WORD_GAP_COMPACT : WORD_GAP);
  }, [words, scale, compact, caption, i18n.language]);

  if (counted === 0 && !hasPersona && !personaLoading) {
    return (
      <section className="h-full rounded-3xl p-5 sm:p-7" style={glassPanel('#8B5CF6')}>
        <ModuleTitle title={isOwn ? t('oracle.cinematicEssenceLabel') : t('profile.essenceOf', { username })} hint={isOwn ? t('home.desk.essenceEmptyDesc') : t('profile.essenceEmptyOther', { username })} />
        {isOwn && (
          <Link to="/oracle" className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
            {t('oracle.discoverYourEssence')}
            <ArrowUpRight className="w-4 h-4" aria-hidden />
          </Link>
        )}
      </section>
    );
  }

  // ---------- painel ao lado do anel ----------
  const personaPanel = (() => {
    if (personaLoading) {
      return (
        <div className="flex gap-4" aria-busy="true">
          <span className="w-[84px] aspect-[2/3] rounded-lg bg-white/10 animate-pulse" />
          <span className="flex-1 space-y-3">
            <span className="block h-9 w-28 rounded-lg bg-white/10 animate-pulse" />
            <span className="block h-4 w-full rounded bg-white/10 animate-pulse" />
            <span className="block h-4 w-2/3 rounded bg-white/10 animate-pulse" />
          </span>
        </div>
      );
    }
    if (!hasPersona || !persona?.persona || !text) {
      const threshold = persona?.threshold || PERSONA_THRESHOLD;
      const missing = Math.max(0, threshold - (persona?.counted ?? counted));
      return (
        <div>
          <p className="font-semibold" style={{ color: PAPER }}>
            {isOwn ? t('home.desk.essenceEmptyTitle') : t('profile.essenceEmptyOther', { username })}
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, ((threshold - missing) / threshold) * 100)}%`, background: 'linear-gradient(90deg,#8B5CF6,#F0ABFC)' }} />
          </div>
          <p className="mt-2 text-[13px]" style={{ color: MIST }}>
            {t('profile.observatory.personaProgress', { counted: threshold - missing, threshold })}
          </p>
          {isOwn && (
            <Link to="/oracle" className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
              {t('oracle.discoverYourEssence')}
              <ArrowUpRight className="w-4 h-4" aria-hidden />
            </Link>
          )}
        </div>
      );
    }
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowRevelation(true)}
          className={`group w-full flex items-start justify-start gap-4 text-left rounded-2xl p-2 -m-2 transition hover:bg-white/[0.04] ${FOCUS_RING}`}
          aria-label={`${t('oracle.revelation')}: ${text.title}`}
        >
          <PersonaPoster path={persona.persona.posterPath} alt="" className="w-[76px] sm:w-[88px] shrink-0 rounded-lg" />
          <span className="min-w-0 flex flex-col">
            <PersonaCode code={persona.code as string} className="text-4xl sm:text-[44px] leading-none" />
            <span className="mt-1.5 text-lg font-semibold leading-snug" style={{ color: PAPER }}>
              {text.title}
            </span>
            <span className="mt-0.5 text-[13px]" style={{ color: MIST }}>
              {text.sameAsFilm ? text.filmWithYear : t('oracle.persona.characterIn', { character: text.character, film: text.filmWithYear })}
            </span>
          </span>
        </button>
        {text.blurb && (
          <p className="mt-3 text-[14px] leading-relaxed line-clamp-3" style={{ color: 'rgba(243,234,211,0.82)' }}>
            {text.blurb}
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowRevelation(true)}
          className={`mt-1.5 inline-flex items-center justify-start gap-1.5 text-[13px] font-medium rounded ${FOCUS_RING}`}
          style={{ color: '#F9A8D4' }}
        >
          <Scroll className="w-4 h-4" aria-hidden />
          {t('profile.observatory.readRevelation')}
        </button>

        {codeKeys.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/[0.07]">
            <p className="text-[12px]" style={{ color: MIST }}>
              {isOwn ? t('profile.observatory.codeShelves') : t('profile.observatory.codeShelvesOf', { name: ownerName })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {codeKeys.map((key, i) => (
                <li key={key}>
                  <button type="button" onClick={() => toggle(key)} className={`rounded-full transition hover:brightness-125 ${FOCUS_RING}`} aria-pressed={selected === key}>
                    <MoodChip moodKey={key} rank={i + 1} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  })();

  const moodPanel = selectedMood ? (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="grid place-items-center w-14 h-14 shrink-0 rounded-2xl text-3xl leading-none"
            style={{ ...PIXEL, color: selectedMood.color, background: withMoodAlpha(selectedMood, 0.14), boxShadow: `inset 0 0 0 1px ${withMoodAlpha(selectedMood, 0.4)}` }}
            aria-hidden
          >
            {selectedMood.letter}
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-snug" style={{ color: PAPER }}>
              {t(selectedMood.labelKey)}
            </span>
            {codeKeys.includes(selectedMood.key) && (
              <span className="block text-[12px]" style={{ color: selectedMood.color }}>
                {t('profile.observatory.codeRank', { rank: codeKeys.indexOf(selectedMood.key) + 1 })}
              </span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-1 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
          aria-label={hasPersona ? t('profile.observatory.backToPersona') : t('common.close')}
          title={hasPersona ? t('profile.observatory.backToPersona') : t('common.close')}
        >
          <X className="w-[18px] h-[18px]" style={{ color: MIST }} aria-hidden />
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: t('profile.observatory.moodShareLabel'), value: pct(selectedSlice?.share ?? 0), color: PAPER },
          { label: t('profile.observatory.moodFilmsLabel'), value: String(selectedSlice?.films ?? 0), color: PAPER },
          {
            label: isOwn ? t('profile.observatory.moodAvgLabel') : t('profile.observatory.moodAvgLabelOf'),
            value: avgText(selectedSlice?.avg),
            color: typeof selectedSlice?.avg === 'number' ? ratingTone(Math.round(selectedSlice.avg)).color : MIST,
          },
        ].map((cell) => (
          <div key={cell.label} className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <dd style={{ ...PIXEL, color: cell.color }} className="text-2xl leading-none tabular-nums">
              {cell.value}
            </dd>
            <dt className="mt-1 text-[11px] leading-tight" style={{ color: MIST }}>
              {cell.label}
            </dt>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[14px] leading-relaxed" style={{ color: 'rgba(243,234,211,0.86)' }}>
        {t(selectedMood.readingKey)}
      </p>

      <Link
        to={`/oracle/libraries?oracle=bogart&type=movie&mood=${selectedMood.key}`}
        className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`}
        style={{ color: selectedMood.color }}
      >
        {t('profile.observatory.openShelf')}
        <ArrowUpRight className="w-4 h-4" aria-hidden />
      </Link>
    </div>
  ) : null;

  // ---------- anel ----------
  return (
    <section className="relative h-full rounded-3xl p-5 sm:p-7 overflow-hidden" style={glassPanel(accent)}>
      <ModuleTitle
        title={isOwn ? t('oracle.cinematicEssenceLabel') : t('profile.essenceOf', { username })}
        hint={counted > 0 ? t('profile.observatory.moodsHint', { count: counted }) : undefined}
        action={
          <button
            type="button"
            onClick={() => setShowHowItWorks(true)}
            className={`grid place-items-center w-11 h-11 shrink-0 -mr-2 -mt-2 rounded-full transition hover:bg-white/[0.06] ${FOCUS_RING}`}
            aria-label={t('profile.howItWorks')}
            title={t('profile.howItWorks')}
          >
            <Info className="w-5 h-5 text-sky-300" aria-hidden />
          </button>
        }
      />

      <div className="mt-4 grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 md:gap-8 items-center">
        <div ref={ringRef} className="relative mx-auto w-full max-w-[460px] aspect-square">
          {!reduceMotion && (
            <span
              aria-hidden
              className="absolute rounded-full taste-sweep"
              style={{
                inset: `${((VIEW - DOTS_R) / (VIEW * 2)) * 100}%`,
                background: `conic-gradient(from 0deg, transparent 0deg, ${withMoodAlpha(selectedMood ?? MOOD_BY_KEY[codeKeys[0]] ?? MOODS[0], 0.13)} 30deg, transparent 62deg)`,
              }}
            />
          )}

          <svg viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} className="relative w-full h-full overflow-visible">
            <defs>
              <filter id={`${uid}-glow`} filterUnits="userSpaceOnUse" x={-VIEW} y={-VIEW} width={VIEW * 2} height={VIEW * 2}>
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
                <stop offset="70%" stopColor={NIGHT} stopOpacity="0.2" />
                <stop offset="100%" stopColor={NIGHT} stopOpacity="0" />
              </radialGradient>
            </defs>

            <circle r={INNER - 2} fill={`url(#${uid}-core)`} />
            <circle r={DOTS_R} fill="none" stroke="rgba(243,234,211,0.16)" strokeWidth={1.2} strokeDasharray="1 6" strokeLinecap="round" />

            {arcs.map(({ mood, slice, start, end }, i) => {
              const share = slice?.share ?? 0;
              const inCode = codeKeys.includes(mood.key);
              const isSel = selected === mood.key;
              const extra = isSel ? SELECTED_EXTRA : inCode ? CODE_EXTRA : 0;
              const width = W + extra;
              const rc = INNER + width / 2;
              const mid = (start + end) / 2;
              const midNorm = ((mid % 360) + 360) % 360;
              const flip = midNorm > 0 && midNorm < 180;
              const length = toRad(end - start) * rc;
              const letterOnly = length < 64;
              const showLabel = length >= 18;
              const empty = share === 0;
              const dim = selected !== null && !isSel;
              const rank = codeKeys.indexOf(mood.key);
              const badge = polar(mid, INNER + W + CODE_EXTRA + 2);
              const label = t('profile.observatory.arcLabel', {
                mood: t(mood.labelKey),
                pct: pct(share),
                count: slice?.films ?? 0,
                avg: avgText(slice?.avg),
              });
              return (
                <g
                  key={mood.key}
                  className="essence-arc"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={label}
                  onClick={() => toggle(mood.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(mood.key);
                    }
                  }}
                  style={{ cursor: 'pointer', opacity: dim ? 0.3 : 1 }}
                >
                  <title>{label}</title>
                  {/* foco do teclado */}
                  <path className="essence-focus" d={arcPath(rc, start, end)} fill="none" stroke={PAPER} strokeWidth={width + 6} />
                  <motion.path
                    d={arcPath(rc, start, end)}
                    fill="none"
                    stroke={mood.color}
                    strokeOpacity={empty ? 0.28 : 1}
                    strokeWidth={width}
                    filter={isSel ? `url(#${uid}-glow)` : undefined}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    whileInView={{ pathLength: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.07, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transition: 'stroke-width 250ms ease' }}
                  />
                  {showLabel && (
                    <>
                      <path id={`${uid}-t-${mood.key}`} d={arcPath(rc, start, end, flip)} fill="none" stroke="none" />
                      <motion.text
                        initial={reduceMotion ? false : { opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.5 + i * 0.07 }}
                        fill={empty ? MIST : NIGHT}
                        dominantBaseline="central"
                        aria-hidden
                      >
                        <textPath href={`#${uid}-t-${mood.key}`} startOffset="50%" textAnchor="middle">
                          <tspan fontSize={16} style={PIXEL}>
                            {mood.letter}
                          </tspan>
                          {!letterOnly && (
                            <tspan fontSize={12.5} fontWeight={700} dx={6}>
                              {pct(share)}
                            </tspan>
                          )}
                        </textPath>
                      </motion.text>
                    </>
                  )}
                  {rank >= 0 && (
                    <g aria-hidden>
                      <circle cx={badge.x} cy={badge.y} r={8.5} fill={NIGHT} stroke={mood.color} strokeWidth={1.5} />
                      <text x={badge.x} y={badge.y} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fill={mood.color} style={PIXEL}>
                        {rank + 1}
                      </text>
                    </g>
                  )}
                  {/* área de toque maior que o arco */}
                  <path d={arcPath(rc, start, end)} fill="none" stroke="transparent" strokeWidth={width + 18} />
                </g>
              );
            })}
          </svg>

          {/* temas flutuando dentro do anel */}
          <div className="absolute inset-0 pointer-events-none" aria-live="polite">
            <AnimatePresence mode="wait">
              <motion.div
                key={selected ?? 'all'}
                className="absolute inset-0"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {packed && ringPx > 0 ? (
                  <>
                    <p
                      className="absolute left-0 right-0 text-center text-[11px] leading-none"
                      style={{ top: ringPx / 2 + packed.captionY - 6, color: MIST }}
                    >
                      {caption}
                    </p>
                    {packed.rows.map((row, ri) => (
                      <div
                        key={ri}
                        className="absolute left-0 right-0 flex items-center justify-center"
                        style={{ top: ringPx / 2 + row.y - (compact ? 12.5 : 16), height: compact ? 25 : 32, columnGap: compact ? WORD_GAP_COMPACT : WORD_GAP }}
                      >
                        {row.words.map(({ item, size }, wi) => {
                          const order = words.indexOf(item);
                          return (
                            <motion.span
                              key={item.key}
                              initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: 0.15 + order * 0.05, type: 'spring', stiffness: 320, damping: 22 }}
                              className="inline-flex items-baseline gap-1.5 whitespace-nowrap"
                              title={t('profile.observatory.keywordTitle', { name: item.name, count: item.count, avg: formatOne(item.avg, i18n.language) })}
                            >
                              <span
                                className={reduceMotion ? 'inline-flex items-baseline gap-1.5' : 'taste-float inline-flex items-baseline gap-1.5'}
                                style={{ animationDelay: `${((ri * 3 + wi) % 6) * 0.65}s`, animationDuration: `${5 + ((ri + wi) % 3)}s` }}
                              >
                                <span
                                  className="capitalize font-medium leading-none"
                                  style={{
                                    fontSize: size,
                                    color: PAPER,
                                    opacity: order < 2 ? 1 : order < 5 ? 0.9 : 0.78,
                                    textShadow: selectedMood ? `0 0 14px ${withMoodAlpha(selectedMood, 0.55)}` : '0 0 14px rgba(139,92,246,0.35)',
                                  }}
                                >
                                  {item.name}
                                </span>
                                <span className="leading-none tabular-nums" style={{ ...PIXEL, fontSize: compact ? 10 : 11, color: ratingTone(Math.round(item.avg)).color }}>
                                  {formatOne(item.avg, i18n.language)}
                                </span>
                              </span>
                            </motion.span>
                          );
                        })}
                      </div>
                    ))}
                  </>
                ) : ringPx > 0 ? (
                  <p className="absolute inset-[26%] grid place-items-center text-center text-[12px] leading-snug" style={{ color: MIST }}>
                    {selectedMood ? t('profile.observatory.keywordsEmptyMood') : t('profile.observatory.keywordsEmpty')}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* painel: personalidade ou o humor escolhido */}
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected ?? 'persona'}
              initial={reduceMotion ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.22 }}
            >
              {moodPanel ?? personaPanel}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {hasPersona && persona && <PersonaRevelationSheet open={showRevelation} onClose={() => setShowRevelation(false)} persona={persona} isOwn={isOwn} />}
      <PersonaHowItWorksSheet open={showHowItWorks} onClose={() => setShowHowItWorks(false)} persona={persona} isOwn={isOwn} />
    </section>
  );
};

export default EssenceRing;
