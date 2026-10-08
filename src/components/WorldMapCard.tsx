import React, { useState, useMemo, useRef, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, ListOrdered, Map as MapIcon, ArrowRight, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { COUNTRY_PATHS, WORLD_MAP_VIEWBOX } from '../data/worldMapPaths';
import { NIGHT, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone, glassPanel } from '../lib/oracleTheme';

interface WorldMapCardProps {
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;
  language: string;
  onViewMovies?: (countryCode: string, countryName: string) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.75;

// Rampa do mapa no fundo noite: países sem filme ficam num violeta apagado
// (dá pra ver o contorno dos continentes) e os com filme vão do violeta ao
// lilás claro — quanto mais claro, mais filmes. Raiz quadrada pra que um
// país com 1 filme não suma perto de um com 200.
const EMPTY_FILL = '#2B2346';
const RAMP_START = [91, 63, 168]; // #5B3FA8
const RAMP_END = [240, 171, 252]; // #F0ABFC

function getFillColor(count: number, maxCount: number): string {
  if (!count) return EMPTY_FILL;
  const intensity = Math.sqrt(count / maxCount);
  const [r, g, b] = RAMP_START.map((start, i) => Math.round(start + (RAMP_END[i] - start) * intensity));
  return `rgb(${r}, ${g}, ${b})`;
}

function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const WorldMapCard: React.FC<WorldMapCardProps> = ({ countryCounts, countryAvgRatings = {}, language, onViewMovies }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<{ code: string; name: string; count: number } | null>(null);
  const [viewMode, setViewMode] = useState<'map' | 'ranking'>('map');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  // guarda o gesto em andamento sem ainda decidir se é "clique" ou "arraste"
  const gesture = useRef({ active: false, startX: 0, startY: 0, panX: 0, panY: 0, pointerId: 0 });

  // Movimento mínimo (em pixels) pra um toque virar arraste de verdade —
  // isso evita que um simples clique num país já mova o mapa (bug do
  // desktop) e reduz a sensibilidade no mobile (bug de "pesado demais").
  const DRAG_THRESHOLD = 8;
  // Reduz a resposta do arraste em relação ao movimento real do dedo/mouse —
  // 1:1 tende a parecer "nervoso" num mapa denso como a Europa.
  const PAN_DAMPING = 0.8;

  // Nomes dos países no idioma do usuário (a base de caminhos só tem inglês).
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([language], { type: 'region' });
    } catch {
      return null;
    }
  }, [language]);
  const countryName = useCallback(
    (code: string) => {
      const fallback = COUNTRY_PATHS[code]?.[0] || code;
      try {
        return regionNames?.of(code) || fallback;
      } catch {
        return fallback;
      }
    },
    [regionNames],
  );

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const maxOffset = (z - 1) * 150;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, p.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, p.y)),
    };
  }, []);

  const handleZoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  const handleZoomOut = () =>
    setZoom((z) => {
      const newZoom = Math.max(MIN_ZOOM, z - ZOOM_STEP);
      if (newZoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  const handleResetZoom = () => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
  };

  // A rodinha do mouse não dá zoom — só os botões +/-/reset.

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= MIN_ZOOM) return;
    gesture.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      pointerId: e.pointerId,
    };
    // Pointer capture só é aplicado quando o arraste for confirmado (em
    // handlePointerMove) — não aqui. Se fizermos isso cedo demais, o clique
    // num país deixa de funcionar mesmo sem nenhum arraste real acontecer.
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!gesture.current.active) return;
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;

    if (!isPanning) {
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_THRESHOLD) return; // ainda pode ser só um toque/clique
      setIsPanning(true);
      e.currentTarget.setPointerCapture(gesture.current.pointerId);
    }

    setPan(
      clampPan(
        {
          x: gesture.current.panX + dx * PAN_DAMPING,
          y: gesture.current.panY + dy * PAN_DAMPING,
        },
        zoom,
      ),
    );
  };

  const handlePointerUp = () => {
    gesture.current.active = false;
    setIsPanning(false);
  };

  const countryCodes = useMemo(() => Object.keys(countryCounts).filter((c) => countryCounts[c] > 0), [countryCounts]);
  const countriesVisited = countryCodes.length;
  const hasData = countriesVisited > 0;
  const maxCount = useMemo(() => (hasData ? Math.max(...countryCodes.map((c) => countryCounts[c])) : 1), [countryCodes, countryCounts, hasData]);

  const allCountryEntries = useMemo(() => Object.entries(COUNTRY_PATHS), []);

  const rankedCountries = useMemo(() => {
    return countryCodes
      .map((code) => ({
        code,
        name: countryName(code),
        count: countryCounts[code],
        avg: countryAvgRatings[code],
      }))
      .sort((a, b) => {
        if (a.avg === undefined && b.avg === undefined) return b.count - a.count;
        if (a.avg === undefined) return 1;
        if (b.avg === undefined) return -1;
        return b.avg - a.avg;
      });
  }, [countryCodes, countryCounts, countryAvgRatings, countryName]);

  const formatAvg = (value: number) => value.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const avgChip = (avg: number) => {
    const tone = ratingTone(avg);
    return (
      <span
        className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] leading-none"
        style={{ ...PIXEL, color: tone.color, boxShadow: `inset 0 0 0 1.5px ${tone.ring}` }}
        title={t('worldMap.averageRating')}
      >
        <Star className="w-3 h-3 fill-current" aria-hidden />
        <span className="sr-only">{t('worldMap.averageRating')}:</span>
        {formatAvg(avg)}
      </span>
    );
  };

  const mapButton = `grid place-items-center w-11 h-11 rounded-xl ring-1 ring-white/10 hover:ring-white/30 hover:bg-white/5 disabled:opacity-35 disabled:hover:bg-transparent transition ${FOCUS_RING}`;

  return (
    <div className="relative rounded-2xl p-5 sm:p-6" style={glassPanel('#2DD4BF')}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
            {t('worldMap.title')}
          </h3>
          {hasData && (
            <p className="mt-1.5 text-sm" style={{ color: MIST }}>
              {t('worldMap.countries', { count: countriesVisited })}
            </p>
          )}
        </div>
        {hasData && (
          <div role="tablist" aria-label={t('worldMap.title')} className="inline-flex p-1 rounded-full ring-1 ring-white/10" style={{ background: NIGHT }}>
            {(
              [
                { id: 'map', label: t('worldMap.map'), icon: MapIcon },
                { id: 'ranking', label: t('worldMap.ranking'), icon: ListOrdered },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = viewMode === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setViewMode(id)}
                  className={`gap-1.5 h-10 px-3.5 rounded-full text-sm font-medium transition ${FOCUS_RING} ${active ? 'bg-violet-600 text-white' : 'hover:bg-white/[0.06]'}`}
                  style={active ? undefined : { color: MIST }}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!hasData ? (
        <p className="py-10 text-center text-sm" style={{ color: MIST }}>
          {t('worldMap.empty')}
        </p>
      ) : viewMode === 'ranking' ? (
        <ol className="space-y-1 max-h-80 overflow-y-auto overscroll-contain -mx-2 px-2">
          {rankedCountries.map((c, idx) => (
            <li key={c.code}>
              <button
                onClick={() => onViewMovies && onViewMovies(c.code, c.name)}
                disabled={!onViewMovies}
                className={`group w-full justify-start gap-3 px-2.5 py-2 rounded-xl text-left hover:bg-white/[0.05] transition disabled:cursor-default ${FOCUS_RING}`}
              >
                <span style={{ ...PIXEL, color: idx < 3 ? PAPER : MIST }} className="w-6 shrink-0 text-right text-base leading-none">
                  {idx + 1}
                </span>
                <span className="text-xl leading-none shrink-0" aria-hidden>
                  {getCountryFlag(c.code)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                    {c.name}
                  </span>
                  <span className="block text-xs tabular-nums" style={{ color: MIST }}>
                    {t('worldMap.titles', { count: c.count })}
                  </span>
                </span>
                {c.avg !== undefined && avgChip(c.avg)}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden touch-none select-none ring-1 ring-white/[0.06]" style={{ background: NIGHT }}>
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full h-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isPanning ? 'none' : 'transform 0.2s ease-out',
                cursor: zoom > MIN_ZOOM ? (isPanning ? 'grabbing' : 'grab') : 'default',
              }}
            >
              <svg viewBox={WORLD_MAP_VIEWBOX} className="w-full h-full" role="img" aria-label={t('worldMap.mapLabel', { count: countriesVisited })}>
                {allCountryEntries.map(([code, [, d]]) => {
                  const count = countryCounts[code] || 0;
                  const isSelected = selected?.code === code;
                  const name = countryName(code);
                  return (
                    <path
                      key={code}
                      d={d}
                      onClick={() => !isPanning && setSelected({ code, name, count })}
                      fill={getFillColor(count, maxCount)}
                      stroke={isSelected ? PAPER : NIGHT}
                      strokeWidth={isSelected ? 1.2 : 0.4}
                      style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                    >
                      <title>{count > 0 ? `${name}: ${count}` : name}</title>
                    </path>
                  );
                })}
              </svg>
            </div>

            {/* Legenda da rampa */}
            <div className="pointer-events-none absolute left-2.5 bottom-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] bg-black/40 backdrop-blur-sm" style={{ color: MIST }} aria-hidden>
              <span>{t('worldMap.less')}</span>
              <span className="flex gap-0.5">
                {[0.05, 0.3, 0.6, 1].map((v) => (
                  <span key={v} className="block w-2.5 h-2.5 rounded-[2px]" style={{ backgroundColor: getFillColor(v * maxCount, maxCount) }} />
                ))}
              </span>
              <span>{t('worldMap.more')}</span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-h-[44px] flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0" aria-live="polite">
              {selected ? (
                <>
                  <span className="text-xl leading-none" aria-hidden>
                    {getCountryFlag(selected.code)}
                  </span>
                  <span className="font-semibold" style={{ color: PAPER }}>
                    {selected.name}
                  </span>
                  <span className="text-sm" style={{ color: MIST }}>
                    {selected.count > 0 ? t('worldMap.titles', { count: selected.count }) : t('worldMap.noMoviesYet')}
                  </span>
                  {selected.count > 0 && countryAvgRatings[selected.code] !== undefined && avgChip(countryAvgRatings[selected.code])}
                  {selected.count > 0 && onViewMovies && (
                    <button
                      onClick={() => onViewMovies(selected.code, selected.name)}
                      className={`gap-1.5 h-10 px-3.5 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
                      style={{ color: PAPER }}
                    >
                      {t('worldMap.viewMovies')}
                      <ArrowRight className="w-4 h-4" aria-hidden />
                    </button>
                  )}
                </>
              ) : (
                <span className="text-sm" style={{ color: MIST }}>
                  {t('worldMap.tapHint')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5" style={{ color: PAPER }}>
              <button onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} aria-label={t('worldMap.zoomOut')} className={mapButton}>
                <ZoomOut className="w-[18px] h-[18px]" aria-hidden />
              </button>
              <button onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} aria-label={t('worldMap.zoomIn')} className={mapButton}>
                <ZoomIn className="w-[18px] h-[18px]" aria-hidden />
              </button>
              <button onClick={handleResetZoom} disabled={zoom <= MIN_ZOOM} aria-label={t('worldMap.resetZoom')} className={mapButton}>
                <Maximize2 className="w-[18px] h-[18px]" aria-hidden />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorldMapCard;
