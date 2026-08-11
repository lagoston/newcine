import React, { useState, useMemo } from 'react';
import { Globe2 } from 'lucide-react';
import { COUNTRY_PATHS, WORLD_MAP_VIEWBOX } from '../data/worldMapPaths';

interface WorldMapCardProps {
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;
  language: string;
  onViewMovies?: (countryCode: string, countryName: string) => void;
}

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
  const start = [196, 181, 253]; // violet-300
  const end = [79, 70, 229]; // indigo-600
  const r = Math.round(start[0] + (end[0] - start[0]) * intensity);
  const g = Math.round(start[1] + (end[1] - start[1]) * intensity);
  const b = Math.round(start[2] + (end[2] - start[2]) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

const WorldMapCard: React.FC<WorldMapCardProps> = ({ countryCounts, countryAvgRatings, language, onViewMovies }) => {
  const isPt = language.startsWith('pt');
  const [selected, setSelected] = useState<{ code: string; name: string; count: number } | null>(null);
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

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

  return (
    <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isPt ? 'Atlas Cinematográfico' : 'Cinematic Atlas'}
          </h2>
          <Globe2 className="w-5 h-5 text-violet-500" />
        </div>
        {hasData && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-violet-500/10 px-3 py-1 rounded-full">
            {countriesVisited} {isPt ? (countriesVisited === 1 ? 'país' : 'países') : countriesVisited === 1 ? 'country' : 'countries'}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="text-center text-gray-500 dark:text-gray-400 py-10 text-sm">
          {isPt ? 'Avalie mais filmes para revelar seu mapa.' : 'Rate more movies to reveal your map.'}
        </div>
      ) : (
        <>
          <div className="w-full rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900/60">
            <svg viewBox={WORLD_MAP_VIEWBOX} className="w-full h-auto" role="img" aria-label="World map">
              {allCountryEntries.map(([code, [name, d]]) => {
                const count = countryCounts[code] || 0;
                const isSelected = selected?.code === code;
                return (
                  <path
                    key={code}
                    d={d}
                    onClick={() => setSelected({ code, name, count })}
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