import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { MOODS, MOOD_BY_KEY, withMoodAlpha, moodsOfCode } from '../../lib/moods';
import { PAPER, MIST, PIXEL, NIGHT, FOCUS_RING, glassPanel } from '../../lib/oracleTheme';
import type { Affinity, MoodSlice } from '../../lib/tasteStats';
import { ModuleTitle, affinityColor, formatOne } from './observatoryKit';

// A roda dos 9 humores (as prateleiras dos oráculos): cada raio é um humor,
// sempre no mesmo lugar e na cor dele; o comprimento é quanto a pessoa vê
// daquele humor e a pedrinha na ponta, a cor da nota média que ela dá. No
// centro, o código da personalidade (as 3 letras mais fortes). Em volta, os
// temas (palavras-chave do TMDB) mais bem avaliados — de todos os filmes ou,
// tocando num humor, só dos filmes dele.

interface MoodWheelProps {
  slices: MoodSlice[];
  counted: number;
  personaCode: string | null;
  topKeywords: Affinity[];
  ownerName?: string;
}

const VIEW = 186;
const HUB = 54;
const MAX_LEN = 84;
const STROKE = 18;
// O rótulo (letra em cima, % embaixo) fica logo depois da ponta mais longa
// possível do raio: a distância ao centro cresce com o quanto a caixa do
// rótulo se projeta naquela direção, então nenhum rótulo encosta no raio.
const LABEL_W = 30;
const LABEL_H = 28;
const labelRadius = (angleDeg: number) => {
  const a = (angleDeg * Math.PI) / 180;
  const extent = Math.abs(Math.cos(a)) * (LABEL_W / 2) + Math.abs(Math.sin(a)) * (LABEL_H / 2);
  return HUB + MAX_LEN + STROKE / 2 + 5 + extent;
};

const polar = (angleDeg: number, r: number) => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
};

// Linhas-guia em valores redondos (5%, 10%, 20%…).
function guideSteps(maxShare: number): number[] {
  const step = maxShare > 0.4 ? 0.2 : maxShare > 0.2 ? 0.1 : 0.05;
  const out: number[] = [];
  for (let v = step; v <= maxShare + 1e-9 && out.length < 4; v += step) out.push(Number(v.toFixed(2)));
  return out;
}

// "#RRGGBB" + opacidade
const withHex = (hex: string, alpha: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

const KeywordCloud: React.FC<{ items: Affinity[]; accent?: string }> = ({ items, accent }) => {
  const { i18n, t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const maxCount = Math.max(1, ...items.map((k) => k.count));
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((kw, i) => {
        const tier = kw.count / maxCount;
        const color = affinityColor(kw.avg);
        return (
          <motion.li
            key={kw.key}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.035, type: 'spring', stiffness: 380, damping: 24 }}
            className={reduceMotion ? '' : 'taste-float'}
            style={{ animationDelay: `${(i % 5) * 0.7}s`, animationDuration: `${5 + (i % 3)}s` }}
          >
            <span
              className={`inline-flex items-center gap-2 rounded-full pl-2.5 pr-3 ${tier > 0.66 ? 'py-2 text-[15px]' : tier > 0.33 ? 'py-1.5 text-sm' : 'py-1 text-[13px]'}`}
              style={{
                background: accent ? withHex(accent, 0.1) : 'rgba(255,255,255,0.05)',
                boxShadow: `inset 0 0 0 1px ${accent ? withHex(accent, 0.35) : 'rgba(243,234,211,0.12)'}`,
                color: PAPER,
              }}
              title={t('profile.observatory.keywordTitle', { name: kw.name, count: kw.count, avg: formatOne(kw.avg, i18n.language) })}
            >
              <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
              <span className="capitalize">{kw.name}</span>
              <span className="tabular-nums text-[12px]" style={{ ...PIXEL, color: MIST }}>
                {formatOne(kw.avg, i18n.language)}
              </span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
};

const MoodWheel: React.FC<MoodWheelProps> = ({ slices, counted, personaCode, topKeywords, ownerName }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const bySlice = useMemo(() => new Map(slices.map((s) => [s.key, s])), [slices]);
  const maxShare = Math.max(0.0001, ...slices.map((s) => s.share));
  const guides = guideSteps(maxShare);
  const ranked = [...slices].sort((a, b) => b.share - a.share || b.films - a.films);
  const selectedSlice = selected ? bySlice.get(selected as MoodSlice['key']) || null : null;
  const selectedMood = selected ? MOOD_BY_KEY[selected] : null;
  const codeMoods = moodsOfCode(personaCode);
  const hubGlow = (selectedMood?.color ?? codeMoods[0]?.color) || '#8B5CF6';
  const pct = (share: number) => `${Math.round(share * 100)}%`;
  const keywords = selectedSlice ? selectedSlice.keywords : topKeywords;

  if (counted === 0) {
    return (
      <section className="h-full rounded-3xl p-5 sm:p-7" style={glassPanel('#8B5CF6')}>
        <ModuleTitle title={t('profile.observatory.moodsTitle')} hint={t('profile.observatory.moodsEmpty')} />
        <Link to="/oracle/libraries" className={`mt-4 inline-flex items-center justify-start gap-1.5 text-sm font-medium rounded ${FOCUS_RING}`} style={{ color: '#F0ABFC' }}>
          {t('profile.observatory.moodsEmptyCta')}
          <ArrowUpRight className="w-4 h-4" aria-hidden />
        </Link>
      </section>
    );
  }

  return (
    <section className="relative h-full rounded-3xl p-5 sm:p-7 overflow-hidden" style={glassPanel(hubGlow)}>
      <ModuleTitle
        title={t('profile.observatory.moodsTitle')}
        hint={t('profile.observatory.moodsHint', { count: counted })}
      />

      <div className="mt-5 grid md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 md:gap-7 items-center">
        {/* ---------- a roda ---------- */}
        <div className="relative mx-auto w-full max-w-[340px] aspect-square">
          {!reduceMotion && (
            <span
              aria-hidden
              className="absolute inset-[9%] rounded-full taste-sweep"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(196,181,253,0.16) 28deg, transparent 56deg)',
                WebkitMaskImage: 'radial-gradient(closest-side, transparent 30%, #000 32%, #000 98%, transparent 100%)',
                maskImage: 'radial-gradient(closest-side, transparent 30%, #000 32%, #000 98%, transparent 100%)',
              }}
            />
          )}
          <svg viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} className="relative w-full h-full" aria-hidden>
            <defs>
              <radialGradient id="hubFill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={hubGlow} stopOpacity="0.35" />
                <stop offset="100%" stopColor={NIGHT} stopOpacity="0.9" />
              </radialGradient>
              <filter id="spokeGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* guias */}
            {guides.map((g) => (
              <circle key={g} r={HUB + (g / maxShare) * MAX_LEN} fill="none" stroke="rgba(243,234,211,0.08)" strokeDasharray="2 5" />
            ))}
            {guides.map((g) => {
              const at = polar(-70, HUB + (g / maxShare) * MAX_LEN);
              return (
                <text key={`l${g}`} x={at.x} y={at.y} fontSize="8.5" textAnchor="middle" dominantBaseline="middle" fill="rgba(189,180,214,0.55)">
                  {pct(g)}
                </text>
              );
            })}

            {MOODS.map((mood, i) => {
              const slice = bySlice.get(mood.key);
              const share = slice?.share ?? 0;
              const angle = -90 + i * 40;
              const len = share > 0 ? Math.max(8, (share / maxShare) * MAX_LEN) : 0;
              const from = polar(angle, HUB - 6 + STROKE / 2);
              const ghostTo = polar(angle, HUB + MAX_LEN);
              const to = polar(angle, HUB + Math.max(len, 0.01));
              const label = polar(angle, labelRadius(angle));
              const dim = selected && selected !== mood.key;
              const isSel = selected === mood.key;
              return (
                <g
                  key={mood.key}
                  style={{ cursor: 'pointer', opacity: dim ? 0.28 : 1, transition: 'opacity 250ms' }}
                  onClick={() => setSelected(isSel ? null : mood.key)}
                >
                  <line x1={from.x} y1={from.y} x2={ghostTo.x} y2={ghostTo.y} stroke="rgba(255,255,255,0.045)" strokeWidth={STROKE} strokeLinecap="round" />
                  {len > 0 ? (
                    <motion.line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={mood.color}
                      strokeWidth={STROKE}
                      strokeLinecap="round"
                      filter={isSel ? 'url(#spokeGlow)' : undefined}
                      initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
                      whileInView={{ pathLength: 1, opacity: 0.92 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : (
                    <circle cx={from.x} cy={from.y} r={3} fill={withHex(mood.color, 0.4)} />
                  )}
                  {len > 0 && slice?.avg != null && (
                    <motion.circle
                      cx={to.x}
                      cy={to.y}
                      r={5}
                      fill={affinityColor(slice.avg)}
                      stroke={NIGHT}
                      strokeWidth={2.5}
                      initial={reduceMotion ? false : { scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.75 + i * 0.06, type: 'spring', stiffness: 420, damping: 18 }}
                    />
                  )}
                  <text x={label.x} y={label.y - 1} textAnchor="middle" fontSize="17" fill={mood.color} style={PIXEL}>
                    {mood.letter}
                  </text>
                  <text x={label.x} y={label.y + 12} textAnchor="middle" fontSize="12" fill={share > 0 ? PAPER : MIST} opacity={share > 0 ? 0.9 : 0.5}>
                    {pct(share)}
                  </text>
                  {/* área de toque maior que o raio */}
                  <line x1={from.x} y1={from.y} x2={polar(angle, labelRadius(angle) + 8).x} y2={polar(angle, labelRadius(angle) + 8).y} stroke="transparent" strokeWidth={34} />
                </g>
              );
            })}

            {/* centro */}
            <g style={{ cursor: selected ? 'pointer' : 'default' }} onClick={() => setSelected(null)}>
              <circle r={HUB - 8} fill="url(#hubFill)" stroke={withHex(hubGlow, 0.5)} strokeWidth={1} />
              {selectedMood && selectedSlice ? (
                <>
                  <text y={-4} textAnchor="middle" fontSize="30" fill={selectedMood.color} style={PIXEL}>
                    {selectedMood.letter}
                  </text>
                  <text y={16} textAnchor="middle" fontSize="10" fill={PAPER}>
                    {t('profile.observatory.films', { count: selectedSlice.films })}
                  </text>
                </>
              ) : codeMoods.length === 3 ? (
                <>
                  <text y={6} textAnchor="middle" fontSize="26" style={PIXEL}>
                    {codeMoods.map((m) => (
                      <tspan key={m.key} fill={m.color}>
                        {m.letter}
                      </tspan>
                    ))}
                  </text>
                  <text y={22} textAnchor="middle" fontSize="8.5" fill={MIST}>
                    {t('profile.observatory.code')}
                  </text>
                </>
              ) : (
                <text y={6} textAnchor="middle" fontSize="20" fill={PAPER} style={PIXEL}>
                  {counted}
                </text>
              )}
            </g>
          </svg>
        </div>

        {/* ---------- tabela dos humores (também é o controle acessível) ---------- */}
        <div className="min-w-0">
          <ol className="space-y-1" aria-label={t('profile.observatory.moodsTitle')}>
            {ranked.map((slice) => {
              const mood = MOOD_BY_KEY[slice.key];
              const isSel = selected === slice.key;
              return (
                <li key={slice.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(isSel ? null : slice.key)}
                    aria-pressed={isSel}
                    disabled={slice.films === 0}
                    className={`w-full grid grid-cols-[16px_minmax(112px,1fr)_minmax(20px,48px)_34px_34px] items-center gap-x-2 rounded-xl px-2 py-1.5 text-left transition enabled:hover:bg-white/[0.05] disabled:opacity-40 ${FOCUS_RING}`}
                    style={isSel ? { background: withMoodAlpha(mood, 0.14), boxShadow: `inset 0 0 0 1px ${withMoodAlpha(mood, 0.45)}` } : undefined}
                  >
                    <span style={{ ...PIXEL, color: mood.color }} className="text-base leading-none text-center">
                      {mood.letter}
                    </span>
                    <span className="truncate text-sm" style={{ color: PAPER }} title={t(mood.labelKey)}>
                      {t(mood.labelKey)}
                    </span>
                    <span className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(slice.share / maxShare) * 100}%`, background: mood.color }} />
                    </span>
                    <span className="text-[13px] tabular-nums text-right" style={{ color: PAPER }}>
                      {pct(slice.share)}
                    </span>
                    <span className="inline-flex items-center justify-end gap-1 text-[12px] tabular-nums" style={{ color: MIST }}>
                      {slice.avg != null && (
                        <>
                          <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: affinityColor(slice.avg) }} />
                          {formatOne(slice.avg, i18n.language)}
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <AnimatePresence mode="wait">
            {selectedMood && selectedSlice && (
              <motion.div
                key={selectedMood.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-3 flex flex-wrap items-center justify-between gap-2 px-2.5"
              >
                <p className="text-[13px]" style={{ color: MIST }}>
                  {selectedSlice.avg != null
                    ? t('profile.observatory.moodSummary', { count: selectedSlice.films, avg: formatOne(selectedSlice.avg, i18n.language) })
                    : t('profile.observatory.films', { count: selectedSlice.films })}
                </p>
                <Link
                  to={`/oracle/libraries?oracle=bogart&type=movie&mood=${selectedMood.key}`}
                  className={`inline-flex items-center gap-1 text-[13px] font-medium rounded ${FOCUS_RING}`}
                  style={{ color: selectedMood.color }}
                >
                  {t('profile.observatory.openShelf')}
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ---------- temas ---------- */}
      <div className="mt-7 pt-5 border-t border-white/[0.07]">
        <p className="text-sm font-medium" style={{ color: PAPER }}>
          {selectedMood
            ? t('profile.observatory.keywordsInMood', { mood: t(selectedMood.labelKey) })
            : ownerName
              ? t('profile.observatory.keywordsTitleOf', { name: ownerName })
              : t('profile.observatory.keywordsTitle')}
        </p>
        <div className="mt-3 min-h-[44px]">
          {keywords.length > 0 ? (
            <KeywordCloud key={selected ?? 'all'} items={keywords} accent={selectedMood?.color} />
          ) : (
            <p className="text-[13px]" style={{ color: MIST }}>
              {selectedMood ? t('profile.observatory.keywordsEmptyMood') : t('profile.observatory.keywordsEmpty')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default MoodWheel;
