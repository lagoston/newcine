import React, { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Globe2 } from 'lucide-react';

interface WorldMapCardProps {
  countryCounts: Record<string, number>;
  language: string;
}

// Mapa TopoJSON de domínio público, já indexado por código ISO 3166-1 alpha-2
// (o mesmo formato que o TMDB usa em origin_country) — sem conversão de código necessária.
const GEO_URL = 'https://unpkg.com/@rembish/iso-topojson/iso-a2.json';

// Mesmo utilitário de bandeira usado em MovieDetailsModal.tsx, para consistência visual.
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Tenta extrair o código alpha-2 do país de diferentes formatos possíveis de propriedade,
// já que nem todo arquivo topojson usa a mesma convenção de nome de campo.
function getCountryCode(geo: any): string | null {
  const candidates = [
    geo.id,
    geo.properties?.iso_a2,
    geo.properties?.ISO_A2,
    geo.properties?.ISO2,
    geo.properties?.iso2,
    geo.properties?.code
  ];
  const found = candidates.find((c) => typeof c === 'string' && c.length === 2);
  return found ? found.toUpperCase() : null;
}

function getCountryName(geo: any, code: string | null): string {
  return geo.properties?.name || geo.properties?.NAME || code || '';
}

// Interpola entre um roxo claro (baixa intensidade) e um índigo profundo (alta intensidade),
// consistente com a paleta que o site já usa nas features do Oráculo.
function getFillColor(count: number, maxCount: number, isDark: boolean): string {
  if (!count) return isDark ? 'rgba(75, 85, 99, 0.35)' : 'rgba(203, 213, 225, 0.6)';
  const intensity = Math.sqrt(count / maxCount);
  const start = [196, 181, 253]; // violet-300
  const end = [79, 70, 229]; // indigo-600
  const r = Math.round(start[0] + (end[0] - start[0]) * intensity);
  const g = Math.round(start[1] + (end[1] - start[1]) * intensity);
  const b = Math.round(start[2] + (end[2] - start[2]) * intensity);
  return `rgb(${r}, ${g}, ${b})`;
}

const WorldMapCard: React.FC<WorldMapCardProps> = ({ countryCounts, language }) => {
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

  const maxCount = useMemo(() => Math.max(...Object.values(countryCounts), 1), [countryCounts]);
  const countriesVisited = Object.keys(countryCounts).length;
  const hasData = countriesVisited > 0;

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
          <div className="w-full overflow-hidden rounded-xl bg-black/5 dark:bg-black/20">
            <ComposableMap
              projectionConfig={{ scale: 148 }}
              width={800}
              height={420}
              style={{ width: '100%', height: 'auto' }}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const code = getCountryCode(geo);
                    const count = code ? countryCounts[code] || 0 : 0;
                    const name = getCountryName(geo, code);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onClick={() => {
                          if (code) setSelected({ code, name, count });
                        }}
                        style={{
                          default: {
                            fill: getFillColor(count, maxCount, isDark),
                            stroke: isDark ? 'rgba(17,24,39,0.6)' : 'rgba(255,255,255,0.6)',
                            strokeWidth: 0.4,
                            outline: 'none',
                            cursor: count ? 'pointer' : 'default'
                          },
                          hover: {
                            fill: count ? '#7c3aed' : getFillColor(0, maxCount, isDark),
                            stroke: isDark ? 'rgba(17,24,39,0.6)' : 'rgba(255,255,255,0.6)',
                            strokeWidth: 0.4,
                            outline: 'none',
                            cursor: count ? 'pointer' : 'default'
                          },
                          pressed: {
                            fill: '#6d28d9',
                            outline: 'none'
                          }
                        }}
                      >
                        <title>{count > 0 ? `${name}: ${count}` : name}</title>
                      </Geography>
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
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
                </>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                  {isPt ? 'Toque em um país para ver detalhes' : 'Tap a country for details'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
              <span>{isPt ? 'menos' : 'less'}</span>
              <div className="flex">
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