import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion, motion, AnimatePresence } from 'framer-motion';
import { geoOrthographic, geoPath, geoGraticule10, geoContains, geoCentroid, geoInterpolate, type GeoPermissibleObjects } from 'd3-geo';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { PAPER, MIST, PIXEL, FOCUS_RING, glassPanel } from '../../lib/oracleTheme';
import { ModuleTitle, affinityColor, formatOne } from './observatoryKit';

// O atlas do perfil como um globo que gira devagar (12/10/2026). Cada país
// acende mais quanto mais títulos de lá a pessoa avaliou (a mesma rampa
// violeta → lilás do mapa antigo). Arrastar gira; tocar num país (ou na
// lista ao lado) o traz para a frente e mostra quantos títulos, a média da
// pessoa e o atalho para ver os filmes. Sem animação para quem pede menos
// movimento. Carregado só quando chega perto da tela (lazy).

interface TasteGlobeProps {
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;
  language: string;
  onViewMovies?: (countryCode: string, countryName: string) => void;
}

type Feature = { type: 'Feature'; id: string; properties: Record<string, never>; geometry: { type: 'MultiPolygon'; coordinates: number[][][][] } };

const EMPTY_FILL = '#2E2650';
const RAMP_START = [91, 63, 168];
const RAMP_END = [240, 171, 252];
const SELECTED = '#F0ABFC';
const AUTO_SPEED = 0.006; // graus por ms
const LIST_SIZE = 6;

const fillFor = (count: number, max: number) => {
  if (!count) return EMPTY_FILL;
  const k = Math.sqrt(count / max);
  const [r, g, b] = RAMP_START.map((s, i) => Math.round(s + (RAMP_END[i] - s) * k));
  return `rgb(${r}, ${g}, ${b})`;
};

const flagOf = (code: string) =>
  code.length === 2 ? String.fromCodePoint(...code.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0))) : '🌍';

const TasteGlobe: React.FC<TasteGlobeProps> = ({ countryCounts, countryAvgRatings, language, onViewMovies }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [size, setSize] = useState(320);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rotation = useRef<[number, number]>([20, -18]);
  const anim = useRef<{ from: [number, number]; to: [number, number]; start: number } | null>(null);
  const idleUntil = useRef(0);
  const visible = useRef(true);
  const gesture = useRef({ active: false, dragging: false, x: 0, y: 0, rot: [0, 0] as [number, number], pointerId: 0 });
  const drawRef = useRef<() => void>(() => undefined);

  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([language], { type: 'region' });
    } catch {
      return null;
    }
  }, [language]);
  const nameOf = useCallback((code: string) => {
    try {
      return regionNames?.of(code) || code;
    } catch {
      return code;
    }
  }, [regionNames]);

  const ranking = useMemo(
    () =>
      Object.entries(countryCounts)
        .filter(([, n]) => n > 0)
        .map(([code, count]) => ({ code, count, avg: countryAvgRatings[code] ?? null }))
        .sort((a, b) => b.count - a.count),
    [countryCounts, countryAvgRatings],
  );
  const maxCount = Math.max(1, ...ranking.map((r) => r.count));
  const byCode = useMemo(() => new Map((features || []).map((f) => [f.id, f])), [features]);

  // Geometria dos países (arquivo à parte, carregado só aqui).
  useEffect(() => {
    let cancelled = false;
    import('../../data/worldGlobe').then(({ WORLD_GLOBE }) => {
      if (cancelled) return;
      const list: Feature[] = Object.entries(WORLD_GLOBE).map(([code, polygons]) => ({
        type: 'Feature',
        id: code,
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: polygons.map((rings) =>
            rings.map((flat) => {
              const ring: number[][] = [];
              for (let i = 0; i < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
              return ring;
            }),
          ),
        },
      }));
      setFeatures(list);
      // Começa olhando para o país com mais títulos.
      const top = ranking[0] && list.find((f) => f.id === ranking[0].code);
      if (top) {
        const [lon, lat] = geoCentroid(top as unknown as GeoPermissibleObjects);
        rotation.current = [-lon + 25, Math.max(-35, Math.min(35, -lat))];
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tamanho acompanha a largura disponível.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize(Math.max(220, Math.min(420, Math.floor(el.clientWidth))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
    });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // Desenho.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !features) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const projection = geoOrthographic().scale(size / 2 - 6).translate([size / 2, size / 2]).clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);
    const graticule = geoGraticule10();

    const draw = () => {
      projection.rotate(rotation.current);
      ctx.clearRect(0, 0, size, size);
      // esfera
      const grad = ctx.createRadialGradient(size * 0.36, size * 0.3, size * 0.05, size / 2, size / 2, size / 2);
      grad.addColorStop(0, '#2A1F4F');
      grad.addColorStop(1, '#130E26');
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.fillStyle = grad;
      ctx.fill();
      // grade
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = 'rgba(243,234,211,0.06)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // países
      for (const f of features) {
        const count = countryCounts[f.id] || 0;
        ctx.beginPath();
        path(f as unknown as GeoPermissibleObjects);
        ctx.fillStyle = f.id === selected ? SELECTED : f.id === hovered && count ? '#E9D5FF' : fillFor(count, maxCount);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18,13,34,0.75)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      const sel = selected ? byCode.get(selected) : null;
      if (sel) {
        ctx.beginPath();
        path(sel as unknown as GeoPermissibleObjects);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      // borda iluminada
      ctx.beginPath();
      path({ type: 'Sphere' });
      ctx.strokeStyle = 'rgba(196,181,253,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    drawRef.current = draw;

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      if (anim.current) {
        const k = Math.min(1, (now - anim.current.start) / 900);
        const e = 1 - Math.pow(1 - k, 3);
        const interp = geoInterpolate(anim.current.from, anim.current.to);
        const [lon, lat] = interp(e);
        rotation.current = [lon, lat];
        if (k >= 1) anim.current = null;
        draw();
      } else if (!reduceMotion && visible.current && !gesture.current.dragging && !selected && now > idleUntil.current) {
        rotation.current = [rotation.current[0] + AUTO_SPEED * dt, rotation.current[1]];
        draw();
      }
      frame = requestAnimationFrame(loop);
    };
    draw();
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [features, size, selected, hovered, countryCounts, maxCount, byCode, reduceMotion]);

  // Traz um país para a frente.
  const focus = useCallback(
    (code: string) => {
      setSelected(code);
      const f = byCode.get(code);
      if (!f) return;
      const [lon, lat] = geoCentroid(f as unknown as GeoPermissibleObjects);
      const to: [number, number] = [-lon, Math.max(-50, Math.min(50, -lat))];
      if (reduceMotion) {
        rotation.current = to;
        drawRef.current();
      } else {
        anim.current = { from: [...rotation.current] as [number, number], to, start: performance.now() };
      }
    },
    [byCode, reduceMotion],
  );

  const pick = (clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !features) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * size;
    const y = ((clientY - rect.top) / rect.height) * size;
    const r = size / 2 - 6;
    if (Math.hypot(x - size / 2, y - size / 2) > r) return null;
    const projection = geoOrthographic().scale(r).translate([size / 2, size / 2]).rotate(rotation.current);
    const point = projection.invert?.([x, y]);
    if (!point) return null;
    const hit = features.find((f) => geoContains(f as unknown as GeoPermissibleObjects, point));
    return hit ? hit.id : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    gesture.current = { active: true, dragging: false, x: e.clientX, y: e.clientY, rot: [...rotation.current] as [number, number], pointerId: e.pointerId };
    anim.current = null;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (g.active) {
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.dragging) {
        if (Math.hypot(dx, dy) < 6) return;
        g.dragging = true;
        e.currentTarget.setPointerCapture(g.pointerId);
      }
      const k = 180 / size;
      rotation.current = [g.rot[0] + dx * k, Math.max(-70, Math.min(70, g.rot[1] - dy * k))];
      drawRef.current();
      return;
    }
    if (e.pointerType === 'mouse') {
      const code = pick(e.clientX, e.clientY);
      if (code !== hovered) setHovered(code && countryCounts[code] ? code : null);
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    g.active = false;
    idleUntil.current = performance.now() + 4000;
    if (g.dragging) {
      g.dragging = false;
      return;
    }
    const code = pick(e.clientX, e.clientY);
    if (code && countryCounts[code]) focus(code);
    else setSelected(null);
  };

  const sel = selected ? ranking.find((r) => r.code === selected) || null : null;
  const list = showAll ? ranking : ranking.slice(0, LIST_SIZE);

  return (
    <section className="h-full rounded-3xl p-5 sm:p-7" style={glassPanel('#2DD4BF')}>
      <ModuleTitle title={t('profile.observatory.atlasTitle')} hint={t('profile.observatory.atlasHint', { count: ranking.length })} />
      <div className="mt-5 grid md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-6 md:gap-7 items-center">
        <div ref={wrapRef} className="relative w-full max-w-[300px] md:max-w-none mx-auto">
          <span
            aria-hidden
            className="absolute inset-[-8%] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(closest-side, rgba(167,139,250,0.28), rgba(45,212,191,0.08) 70%, transparent 100%)' }}
          />
          {!features && (
            <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
              <Globe2 className="w-8 h-8 animate-pulse" aria-hidden />
            </span>
          )}
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t('profile.observatory.atlasAria', { count: ranking.length })}
            style={{ width: size, height: size, touchAction: 'none', cursor: hovered ? 'pointer' : 'grab' }}
            className="relative block mx-auto"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHovered(null)}
          />
          {/* Painel do país, centralizado por inset + margem automática: o
              framer-motion escreve o próprio transform (o y da entrada) e
              apagava o -translate-x-1/2, jogando o painel para fora do cartão. */}
          <AnimatePresence>
            {sel && (
              <motion.div
                key={sel.code}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute inset-x-0 mx-auto bottom-1 w-[min(92%,300px)] rounded-2xl px-3.5 py-2.5 flex items-center gap-3"
                style={{ background: 'rgba(18,13,34,0.88)', boxShadow: '0 0 0 1px rgba(240,171,252,0.45), 0 12px 30px -10px rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {flagOf(sel.code)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: PAPER }}>
                    {nameOf(sel.code)}
                  </span>
                  <span className="flex items-center gap-1.5 text-[12px]" style={{ color: MIST }}>
                    {t('library.titleCount', { count: sel.count })}
                    {sel.avg != null && (
                      <>
                        <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: affinityColor(sel.avg) }} />
                        {formatOne(sel.avg, language)}
                      </>
                    )}
                  </span>
                </span>
                {onViewMovies && (
                  <button
                    type="button"
                    onClick={() => onViewMovies(sel.code, nameOf(sel.code))}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold ${FOCUS_RING}`}
                    style={{ background: PAPER, color: '#221B36' }}
                  >
                    {t('profile.observatory.seeTitles')}
                    <ArrowUpRight className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="min-w-0">
          <ol className="space-y-1" aria-label={t('profile.observatory.atlasTitle')}>
            {list.map((row, i) => {
              const isSel = selected === row.code;
              return (
                <li key={row.code}>
                  <button
                    type="button"
                    onClick={() => (isSel ? setSelected(null) : focus(row.code))}
                    aria-pressed={isSel}
                    className={`w-full grid grid-cols-[18px_24px_minmax(0,1fr)_minmax(0,44px)_32px_36px] sm:grid-cols-[18px_24px_minmax(0,1fr)_minmax(0,40px)_32px_36px] items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.05] ${FOCUS_RING}`}
                    style={isSel ? { background: 'rgba(240,171,252,0.12)', boxShadow: 'inset 0 0 0 1px rgba(240,171,252,0.45)' } : undefined}
                  >
                    <span style={{ ...PIXEL, color: MIST }} className="text-[12px] text-right">
                      {i + 1}
                    </span>
                    <span className="text-lg leading-none" aria-hidden>
                      {flagOf(row.code)}
                    </span>
                    <span className="truncate text-sm" style={{ color: PAPER }}>
                      {nameOf(row.code)}
                    </span>
                    <span className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(row.count / maxCount) * 100}%`, background: fillFor(row.count, maxCount) }} />
                    </span>
                    <span className="text-[13px] tabular-nums text-right" style={{ color: PAPER }}>
                      {row.count}
                    </span>
                    <span className="inline-flex items-center justify-end gap-1 text-[12px] tabular-nums" style={{ color: MIST }}>
                      {row.avg != null && (
                        <>
                          <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: affinityColor(row.avg) }} />
                          {formatOne(row.avg, language)}
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {ranking.length > LIST_SIZE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={`mt-2 ml-2 text-[13px] font-medium rounded ${FOCUS_RING}`}
              style={{ color: '#F0ABFC' }}
            >
              {showAll ? t('profile.observatory.showLess') : t('profile.observatory.showAllCountries', { count: ranking.length })}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default TasteGlobe;
