import React, { useState } from 'react';
import { Globe2 } from 'lucide-react';

interface WorldMapCardProps {
  countryCounts: Record<string, number>;
  language: string;
}

// Imagem de mapa-múndi de domínio público (Wikimedia Commons), projeção equiretangular —
// permite posicionar marcadores só com longitude/latitude, sem nenhuma lib de mapas.
const WORLD_MAP_IMAGE = 'https://commons.wikimedia.org/wiki/Special:FilePath/BlankMap-World-Equirectangular.svg';

// Coordenadas médias (longitude, latitude) por código ISO 3166-1 alpha-2 —
// mesmo formato que o TMDB já usa em origin_country.
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-96.33, 38.82], CA: [-98.42, 57.55], MX: [-101.55, 23.87], BR: [-54.36, -11.52],
  AR: [-64.53, -38.42], CL: [-70.77, -37.83], CO: [-72.64, 4.19], PE: [-74.11, -8.52],
  UY: [-56.02, -32.78], PY: [-58.39, -23.42], BO: [-64.45, -16.73], VE: [-66.36, 7.15],
  EC: [-78.46, -1.56], CR: [-84.15, 9.86], PA: [-80.14, 8.44], CU: [-79.70, 21.48],
  DO: [-70.43, 18.78], GT: [-90.31, 15.82], HN: [-86.49, 14.74], SV: [-88.86, 13.76],
  NI: [-85.02, 12.89], JM: [-77.30, 18.12], PR: [-66.49, 18.22],
  GB: [-2.85, 53.98], IE: [-8.24, 53.30], FR: [2.19, 46.64], DE: [10.43, 51.08],
  ES: [-3.65, 40.37], PT: [-7.93, 39.68], IT: [12.76, 42.98], NL: [5.55, 52.13],
  BE: [4.68, 50.62], LU: [6.10, 49.78], CH: [8.29, 46.74], AT: [13.80, 47.63],
  DK: [9.38, 56.00], SE: [17.06, 62.73], NO: [16.67, 64.98], FI: [25.66, 65.02],
  IS: [-19.06, 65.12], PL: [19.44, 52.07], CZ: [15.38, 49.75], SK: [19.58, 48.70],
  HU: [19.40, 47.23], RO: [25.09, 45.82], BG: [25.25, 42.82], GR: [23.11, 39.42],
  HR: [16.63, 44.91], RS: [20.86, 44.03], SI: [14.89, 46.14], BA: [17.83, 44.14],
  AL: [20.06, 41.14], MK: [21.71, 41.59], ME: [19.30, 42.74], MT: [14.44, 35.89],
  CY: [33.38, 35.12], LT: [23.95, 55.29], LV: [24.69, 56.81], EE: [25.92, 58.65],
  UA: [31.27, 48.66], BY: [27.96, 53.47], MD: [28.39, 47.07], RU: [98.67, 59.04],
  TR: [35.57, 38.93], GE: [43.38, 42.18], AM: [45.05, 40.18], AZ: [48.63, 40.39],
  IL: [35.03, 31.51], PS: [35.24, 31.93], LB: [35.90, 33.91], JO: [36.96, 31.39],
  SY: [38.51, 35.10], IQ: [43.83, 33.11], SA: [44.60, 24.14], AE: [54.28, 24.18],
  QA: [51.20, 25.32], KW: [47.56, 29.28], BH: [50.54, 26.05], OM: [55.84, 20.72],
  YE: [47.47, 16.00], IR: [54.24, 32.91], EG: [30.24, 26.61], LY: [17.91, 27.20],
  TN: [9.66, 34.09], DZ: [2.66, 28.35], MA: [-8.82, 28.69], SD: [29.95, 15.67],
  SS: [30.39, 7.66], ET: [39.91, 8.73], SO: [45.40, 6.52], KE: [37.95, 0.69],
  UG: [32.34, 1.28], TZ: [34.82, -6.36], RW: [29.92, -2.01], BI: [29.89, -3.26],
  NG: [8.15, 9.61], GH: [-1.22, 7.95], CI: [-5.57, 7.54], SN: [-14.61, 14.23],
  ML: [-4.35, 17.17], NE: [8.87, 17.08], BF: [-1.69, 12.11], TD: [18.43, 15.28],
  CM: [12.95, 6.29], CD: [23.42, -3.34], CG: [14.88, -0.73], GA: [11.84, -0.63],
  AO: [17.65, -12.17], ZM: [27.76, -13.16], ZW: [29.72, -18.93], MZ: [35.21, -17.53],
  MW: [34.23, -13.13], NA: [18.16, -21.91], BW: [23.86, -22.24], ZA: [24.75, -28.55],
  LS: [28.24, -29.60], SZ: [31.51, -26.56], MG: [46.68, -19.04], MU: [57.56, -20.28],
  GN: [-10.99, 10.26], SL: [-11.79, 8.56], LR: [-9.26, 6.52], GM: [-15.38, 13.43],
  GW: [-14.98, 11.98], MR: [-10.50, 20.47], TG: [0.90, 8.66], BJ: [2.31, 9.50],
  CV: [-23.63, 15.08], DJ: [42.61, 11.75], ER: [39.27, 15.01],
  AF: [66.59, 34.13], PK: [69.09, 30.12], IN: [81.17, 23.59], NP: [84.13, 28.30],
  BD: [90.43, 23.67], BT: [90.47, 27.42], LK: [80.67, 7.70], MV: [73.10, -0.61],
  CN: [104.69, 38.07], JP: [137.47, 36.77], KR: [127.76, 36.40], KP: [127.34, 40.19],
  MN: [103.40, 47.09], TW: [120.96, 23.70], HK: [114.16, 22.28],
  TH: [101.09, 13.66], VN: [105.91, 16.52], LA: [103.81, 18.12], KH: [105.04, 12.70],
  MM: [97.09, 19.90], MY: [114.63, 3.67], SG: [103.81, 1.35], ID: [113.97, 0.16],
  PH: [121.82, 15.59], BN: [114.64, 4.54], TL: [125.95, -8.81],
  KZ: [66.59, 47.64], UZ: [63.85, 41.49], TM: [58.46, 39.06], KG: [74.18, 41.36],
  TJ: [70.94, 38.57],
  AU: [134.02, -25.70], NZ: [170.69, -43.83], FJ: [177.98, -17.82], PG: [144.83, -7.16]
};

function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function lonLatToPercent(lon: number, lat: number): { left: string; top: string } {
  const left = ((lon + 180) / 360) * 100;
  const top = ((90 - lat) / 180) * 100;
  return { left: `${left}%`, top: `${top}%` };
}

function getMarkerColor(count: number, maxCount: number): string {
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
  const [selected, setSelected] = useState<{ code: string; count: number } | null>(null);

  const entries = Object.entries(countryCounts).filter(([code]) => COUNTRY_COORDS[code]);
  const countriesVisited = entries.length;
  const hasData = countriesVisited > 0;
  const maxCount = hasData ? Math.max(...entries.map(([, c]) => c)) : 1;

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
          <div className="relative w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900/60" style={{ aspectRatio: '940 / 477' }}>
            <img
              src={WORLD_MAP_IMAGE}
              alt="World map"
              className="absolute inset-0 w-full h-full object-cover opacity-60 dark:opacity-30 dark:invert"
              loading="lazy"
            />
            {entries.map(([code, count]) => {
              const coords = COUNTRY_COORDS[code];
              if (!coords) return null;
              const { left, top } = lonLatToPercent(coords[0], coords[1]);
              const size = 8 + Math.sqrt(count / maxCount) * 22;
              const isSelected = selected?.code === code;
              return (
                <button
                  key={code}
                  onClick={() => setSelected({ code, count })}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200 hover:scale-125 hover:z-10"
                  style={{
                    left,
                    top,
                    width: size,
                    height: size,
                    backgroundColor: getMarkerColor(count, maxCount),
                    boxShadow: isSelected ? '0 0 0 3px rgba(124, 58, 237, 0.6)' : '0 1px 4px rgba(0,0,0,0.3)'
                  }}
                  title={`${code}: ${count}`}
                />
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-h-[28px] flex items-center gap-2">
              {selected ? (
                <>
                  <span className="text-xl leading-none">{getCountryFlag(selected.code)}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selected.code}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {selected.count} {isPt ? (selected.count === 1 ? 'filme' : 'filmes') : selected.count === 1 ? 'movie' : 'movies'}
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
              <div className="flex gap-0.5">
                {[0.15, 0.4, 0.65, 0.9].map((v) => (
                  <div
                    key={v}
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getMarkerColor(v * maxCount, maxCount) }}
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