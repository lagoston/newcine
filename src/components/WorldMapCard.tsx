import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Globe2, ZoomIn, ZoomOut, Maximize2, ListOrdered, Map as MapIcon } from 'lucide-react';
import { COUNTRY_PATHS, WORLD_MAP_VIEWBOX } from '../data/worldMapPaths';

interface WorldMapCardProps {
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;
  language: string;
  onViewMovies?: (countryCode: string, countryName: string) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.75;

function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function getFillColor(count: number, maxCount: number, isDark: boolean): string {
  if (!count) return isDark ? '#374151' : '#e2e8f0';
  const intensity = Math.sqrt(count / maxCount);
  const start = [196, 181, 253];
  const end = [79, 70, 229];
  const r = Math.round(start[0] + (end[0] - start[0]) * intensity);
  const g = Math.round(start[1] + (end[1] - start[1]) * intensity);
  const b = Math.round(start[2] + (end[2] - start[2]) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

const WorldMapCard: React.FC<WorldMapCardProps> = ({ countryCounts, countryAvgRatings = {}, language, onViewMovies }) => {
  const isPt = language.startsWith('pt');
  const [selected, setSelected] = useState<{ code: string; name: string; count: number } | null>(null);
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  const [viewMode, setViewMode] = useState<'map' | 'ranking'>('map');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const maxOffset = (z - 1) * 150;
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, p.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, p.y))
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP / 2 : ZOOM_STEP / 2;
    setZoom((z) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
      if (newZoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (zoom <= MIN_ZOOM) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan(clampPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy }, zoom));
  };

  const handlePointerUp = () => setIsPanning(false);

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const countryCodes = useMemo(() => Object.keys(countryCounts).filter((c) => countryCounts[c] > 0), [countryCounts]);
  const countriesVisited = countryCodes.length;
  const hasData = countriesVisited > 0;
  const maxCount = useMemo(() => (hasData ? Math.max(...countryCodes.map((c) => countryCounts[c])) : 1), [countryCodes, countryCounts, hasData]);

  const allCountryEntries = useMemo(() => Object.entries(COUNTRY_PATHS), []);

  const rankedCountries = useMemo(() => {
    return countryCodes
      .map((code) => ({
        code,
        name: COUNTRY_PATHS[code]?.[0] || code,
        count: countryCounts[code],
        avg: countryAvgRatings[code]
      }))
      .sort((a, b) => {
        if (a.avg === undefined && b.avg === undefined) return b.count - a.count;
        if (a.avg === undefined) return 1;
        if (b.avg === undefined) return -1;
        return b.avg - a.avg;
      });
  }, [countryCodes, countryCounts, countryAvgRatings]);

  return (
    <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isPt ? 'Atlas Cinematográfico' : 'Cinematic Atlas'}
          </h2>
          <Globe2 className="w-5 h-5 text-violet-500" />
        </div>
        <div className="flex items-center gap-2">
          {hasData && (
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-violet-500/10 px-3 py-1 rounded-full">
              {countriesVisited} {isPt ? (countriesVisited === 1 ? 'país' : 'países') : countriesVisited === 1 ? 'country' : 'countries'}
            </span>
          )}
          {hasData && (
            <button
              onClick={() => setViewMode(viewMode === 'map' ? 'ranking' : 'map')}
              className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 px-3 py-1.5 rounded-full transition-colors"
            >
              {viewMode === 'map' ? (
                <>
                  <ListOrdered className="w-3.5 h-3.5" />
                  Ranking
                </>
              ) : (
                <>
                  <MapIcon className="w-3.5 h-3.5" />
                  {isPt ? 'Mapa' : 'Map'}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-10 text-sm">
          {isPt ? 'Avalie mais filmes para revelar seu mapa.' : 'Rate more movies to reveal your map.'}
        </div>
      ) : viewMode === 'ranking' ? (
        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {rankedCountries.map((c, idx) => (
            <button
              key={c.code}
              onClick={() => onViewMovies && onViewMovies(c.code, c.name)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50/60 dark:bg-gray-700/40 hover:bg-violet-500/10 transition-colors text-left"
            >
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 flex-shrink-0">
                {idx + 1}
              </span>
              <span className="text-lg leading-none flex-shrink-0">{getCountryFlag(c.code)}</span>
              <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">
                {c.name}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                {c.count} {isPt ? (c.count === 1 ? 'filme' : 'filmes') : c.count === 1 ? 'movie' : 'movies'}
              </span>
              {c.avg !== undefined && (
                <span className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full flex-shrink-0">
                  ★ {c.avg.toFixed(1)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div
            className="w-full aspect-[2/1] rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 relative touch-none select-none"
            onWheel={handleWheel}
          >
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
                cursor: zoom > MIN_ZOOM ? (isPanning ? 'grabbing' : 'grab') : 'default'
              }}
            >
              <svg viewBox={WORLD_MAP_VIEWBOX} className="w-full h-full" role="img" aria-label="World map">
                {allCountryEntries.map(([code, [name, d]]) => {
                  const count = countryCounts[code] || 0;
                  const isSelected = selected?.code === code;
                  return (
                    <path
                      key={code}
                      d={d}
                      onClick={() => !isPanning && setSelected({ code, name, count })}
                      fill={getFillColor(count, maxCount, isDark)}
                      stroke={isDark ? '#111827' : '#ffffff'}
                      strokeWidth={isSelected ? 1.4 : 0.4}
                      style={{ cursor: count ? 'pointer' : 'default', transition: 'fill 0.2s' }}
                    >
                      <title>{count > 0 ? `${name}: ${count}` : name}</title>
                    </path>
                  );
                })}
              </svg>
            </div>

            <div className="absolute bottom-2 right-2 flex flex-col gap-1">
              <button
                onClick={handleZoomIn}
                disabled={zoom >= MAX_ZOOM}
                className="w-7 h-7 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-md flex items-center justify-center text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                className="w-7 h-7 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-md flex items-center justify-center text-gray-700 dark:text-gray-200 disabled:opacity-40 hover:bg-white dark:hover:bg-gray-800 transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              {zoom > MIN_ZOOM && (
                <button
                  onClick={handleResetZoom}
                  className="w-7 h-7 rounded-lg bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-md flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-h-[28px] flex items-center gap-2">
              {selected ? (
                <>
                  <span className="text-xl leading-none">{getCountryFlag(selected.code)}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selected.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {selected.count > 0
                      ? `${selected.count} ${isPt ? (selected.count === 1 ? 'filme' : 'filmes') : selected.count === 1 ? 'movie' : 'movies'}`
                      : isPt
                      ? 'nenhum filme ainda'
                      : 'no movies yet'}
                  </span>
                  {selected.count > 0 && countryAvgRatings[selected.code] !== undefined && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                      ★ {countryAvgRatings[selected.code].toFixed(1)}
                    </span>
                  )}
                  {selected.count > 0 && onViewMovies && (
                    <button
                      onClick={() => onViewMovies(selected.code, selected.name)}
                      className="text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 px-3 py-1 rounded-full transition-colors"
                    >
                      {isPt ? 'Ver filmes' : 'View movies'}
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  {isPt ? 'Toque em um país para ver detalhes' : 'Tap a country for details'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
              <span>{isPt ? 'menos' : 'less'}</span>
              <div className="flex gap-0.5">
                {[0.15, 0.4, 0.65, 0.9].map((v) => (
                  <div
                    key={v}
                    className="w-3 h-3"
                    style={{ backgroundColor: getFillColor(v * maxCount, maxCount, isDark) }}
                  />
                ))}
              </div>
              <span>{isPt ? 'mais' : 'more'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorldMapCard;