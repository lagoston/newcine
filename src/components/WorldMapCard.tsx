import React, { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

interface WorldMapCardProps {
  countryCounts: Record<string, number>;
  language: string;
}

const GEO_URL = 'https://raw.githubusercontent.com/deldersveld/topojson/master/continents/africa-and-middle-east.json';

const COUNTRY_NAMES_EN: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', FR: 'France', DE: 'Germany',
  IT: 'Italy', JP: 'Japan', KR: 'South Korea', CN: 'China', IN: 'India',
  BR: 'Brazil', MX: 'Mexico', ES: 'Spain', PT: 'Portugal', AR: 'Argentina',
  CA: 'Canada', AU: 'Australia', RU: 'Russia', SE: 'Sweden', NO: 'Norway',
  DK: 'Denmark', FI: 'Finland', NL: 'Netherlands', BE: 'Belgium',
  CH: 'Switzerland', AT: 'Austria', IE: 'Ireland', PL: 'Poland',
  CZ: 'Czech Republic', GR: 'Greece', TR: 'Turkey', IL: 'Israel',
  HK: 'Hong Kong', TW: 'Taiwan', TH: 'Thailand', IR: 'Iran',
  NZ: 'New Zealand', ZA: 'South Africa', EG: 'Egypt', MA: 'Morocco',
  CO: 'Colombia', CL: 'Chile', VE: 'Venezuela', PE: 'Peru',
  HU: 'Hungary', RO: 'Romania', UA: 'Ukraine', RS: 'Serbia',
  BG: 'Bulgaria', HR: 'Croatia', SK: 'Slovakia', SI: 'Slovenia',
  LT: 'Lithuania', LV: 'Latvia', EE: 'Estonia', IS: 'Iceland',
  LU: 'Luxembourg', MT: 'Malta', CY: 'Cyprus', AL: 'Albania',
  BA: 'Bosnia', ME: 'Montenegro', MK: 'North Macedonia',
  SG: 'Singapore', MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines',
  VN: 'Vietnam', PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka',
  NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', ET: 'Ethiopia',
  TN: 'Tunisia', DZ: 'Algeria', LY: 'Libya', SA: 'Saudi Arabia',
  AE: 'UAE', QB: 'Qatar', KW: 'Kuwait', JO: 'Jordan', LB: 'Lebanon',
  IQ: 'Iraq', AF: 'Afghanistan', KZ: 'Kazakhstan', UZ: 'Uzbekistan',
};

const COUNTRY_NAMES_PT: Record<string, string> = {
  US: 'Estados Unidos', GB: 'Reino Unido', FR: 'França', DE: 'Alemanha',
  IT: 'Itália', JP: 'Japão', KR: 'Coreia do Sul', CN: 'China', IN: 'Índia',
  BR: 'Brasil', MX: 'México', ES: 'Espanha', PT: 'Portugal', AR: 'Argentina',
  CA: 'Canadá', AU: 'Austrália', RU: 'Rússia', SE: 'Suécia', NO: 'Noruega',
  DK: 'Dinamarca', FI: 'Finlândia', NL: 'Países Baixos', BE: 'Bélgica',
  CH: 'Suíça', AT: 'Áustria', IE: 'Irlanda', PL: 'Polônia',
  CZ: 'República Tcheca', GR: 'Grécia', TR: 'Turquia', IL: 'Israel',
  HK: 'Hong Kong', TW: 'Taiwan', TH: 'Tailândia', IR: 'Irã',
  NZ: 'Nova Zelândia', ZA: 'África do Sul', EG: 'Egito', MA: 'Marrocos',
  CO: 'Colômbia', CL: 'Chile', VE: 'Venezuela', PE: 'Peru',
  HU: 'Hungria', RO: 'Romênia', UA: 'Ucrânia', RS: 'Sérvia',
  BG: 'Bulgária', HR: 'Croácia', SK: 'Eslováquia', SI: 'Eslovênia',
  LT: 'Lituânia', LV: 'Letônia', EE: 'Estônia', IS: 'Islândia',
  LU: 'Luxemburgo', MT: 'Malta', CY: 'Chipre', AL: 'Albânia',
  BA: 'Bósnia', ME: 'Montenegro', MK: 'Macedônia do Norte',
  SG: 'Cingapura', MY: 'Malásia', ID: 'Indonésia', PH: 'Filipinas',
  VN: 'Vietnã', PK: 'Paquistão', BD: 'Bangladesh', LK: 'Sri Lanka',
  NG: 'Nigéria', KE: 'Quênia', GH: 'Gana', ET: 'Etiópia',
  TN: 'Tunísia', DZ: 'Argélia', LY: 'Líbia', SA: 'Arábia Saudita',
  AE: 'EAU', QB: 'Catar', KW: 'Kuwait', JO: 'Jordânia', LB: 'Líbano',
  IQ: 'Iraque', AF: 'Afeganistão', KZ: 'Cazaquistão', UZ: 'Uzbequistão',
};

const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [-100, 42], GB: [-2, 54], FR: [2, 47], DE: [10, 51],
  IT: [12, 42], JP: [138, 36], KR: [128, 36], CN: [104, 35],
  IN: [78, 22], BR: [-55, -10], MX: [-102, 23], ES: [-4, 40],
  PT: [-8, 39], AR: [-64, -34], CA: [-106, 56], AU: [134, -25],
  RU: [100, 60], SE: [18, 60], NO: [10, 62], DK: [10, 56],
  FI: [26, 64], NL: [5, 52], BE: [4, 50], CH: [8, 47],
  AT: [14, 47], IE: [-8, 53], PL: [19, 52], CZ: [15, 50],
  GR: [22, 39], TR: [35, 39], IL: [35, 31], HK: [114, 22],
  TW: [121, 24], TH: [101, 15], IR: [53, 32], NZ: [174, -41],
  ZA: [25, -29], EG: [30, 27], MA: [-7, 32], CO: [-74, 4],
  CL: [-71, -35], VE: [-66, 8], PE: [-75, -10], HU: [19, 47],
  RO: [25, 46], UA: [32, 49], RS: [21, 44], BG: [25, 43],
  HR: [15, 45], SK: [19, 49], SI: [14, 46], LT: [24, 55],
  LV: [25, 57], EE: [26, 58], IS: [-19, 65], LU: [6, 50],
  MT: [14, 36], CY: [33, 35], AL: [20, 41], BA: [18, 44],
  ME: [19, 42], MK: [21, 42], SG: [104, 1], MY: [102, 3],
  ID: [113, -2], PH: [122, 13], VN: [109, 16], PK: [69, 30],
  BD: [90, 24], LK: [81, 7], NG: [8, 10], KE: [38, 0],
  GH: [-1, 8], ET: [40, 9], TN: [9, 34], DZ: [3, 28],
  LY: [17, 27], SA: [45, 24], AE: [54, 24], QB: [51, 25],
  KW: [47, 29], JO: [36, 31], LB: [36, 34], IQ: [44, 33],
  AF: [67, 33], KZ: [67, 48], UZ: [64, 41],
};

export default function WorldMapCard({ countryCounts, language }: WorldMapCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | null>(null);
  const isPt = language.startsWith('pt');
  const names = isPt ? COUNTRY_NAMES_PT : COUNTRY_NAMES_EN;

  const sortedCountries = useMemo(() => {
    return Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .filter(([code]) => COUNTRY_COORDS[code]);
  }, [countryCounts]);

  const totalCountries = sortedCountries.length;
  const maxCount = Math.max(...sortedCountries.map(([, c]) => c), 1);

  if (totalCountries === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
          {isPt ? 'Origem dos Filmes' : 'Film Origins'}
        </h2>
        <Globe className="w-5 h-5 text-cyan-500" />
      </div>

      <div className="relative w-full h-48 sm:h-56 overflow-hidden rounded-xl bg-gradient-to-b from-cyan-50/30 to-blue-50/10 dark:from-gray-900/30 dark:to-gray-800/10">
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 120, center: [0, 0] }}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#e5e7eb55"
                  stroke="#cbd5e155"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', fill: '#94a3b844' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {sortedCountries.map(([code, count]) => {
            const coords = COUNTRY_COORDS[code];
            if (!coords) return null;
            const size = 4 + (count / maxCount) * 10;
            return (
              <Marker
                key={code}
                coordinates={coords}
                onMouseEnter={() => setHovered(code)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  r={size}
                  fill="#06b6d4"
                  fillOpacity={0.7}
                  stroke="#0891b2"
                  strokeWidth={1}
                />
                {hovered === code && (
                  <text
                    textAnchor="middle"
                    y={-size - 4}
                    fontSize={9}
                    fill="#1e293b"
                    style={{ fontWeight: 600, pointerEvents: 'none' }}
                  >
                    {names[code] || code} ({count})
                  </text>
                )}
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {sortedCountries.slice(0, 8).map(([code, count]) => (
          <div
            key={code}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
              hovered === code
                ? 'bg-cyan-500/20 dark:bg-cyan-500/25 text-cyan-700 dark:text-cyan-300 scale-105'
                : 'bg-gray-100/60 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400'
            }`}
          >
            <span className="font-semibold">{names[code] || code}</span>
            <span className="text-gray-400 dark:text-gray-500">{count}</span>
          </div>
        ))}
        {sortedCountries.length > 8 && (
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100/60 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400">
            +{sortedCountries.length - 8}
          </div>
        )}
      </div>
    </motion.div>
  );
}
