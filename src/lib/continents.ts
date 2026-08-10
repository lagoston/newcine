// Classificação de países por continente, no modelo "5 continentes" (América unificada, sem Antártida) —
// o mesmo usado nos anéis olímpicos, mais intuitivo para o público brasileiro do que o modelo de 7 continentes.
// Chaves: código ISO 3166-1 alpha-2 (o mesmo formato que o TMDB usa em origin_country).

export type Continent = 'América' | 'Europa' | 'África' | 'Ásia' | 'Oceania';

export const ALL_CONTINENTS: Continent[] = ['América', 'Europa', 'África', 'Ásia', 'Oceania'];

export const CONTINENT_BY_COUNTRY: Record<string, Continent> = {
  // América
  US: 'América', CA: 'América', MX: 'América', BR: 'América', AR: 'América', CL: 'América',
  CO: 'América', PE: 'América', UY: 'América', PY: 'América', BO: 'América', VE: 'América',
  EC: 'América', CR: 'América', PA: 'América', CU: 'América', DO: 'América', GT: 'América',
  HN: 'América', SV: 'América', NI: 'América', JM: 'América', PR: 'América', GY: 'América',
  SR: 'América', BZ: 'América', BS: 'América', BB: 'América', TT: 'América', GD: 'América',
  LC: 'América', VC: 'América', DM: 'América', KN: 'América', BM: 'América',

  // Europa
  GB: 'Europa', IE: 'Europa', FR: 'Europa', DE: 'Europa', ES: 'Europa', PT: 'Europa',
  IT: 'Europa', NL: 'Europa', BE: 'Europa', LU: 'Europa', CH: 'Europa', AT: 'Europa',
  DK: 'Europa', SE: 'Europa', NO: 'Europa', FI: 'Europa', IS: 'Europa', PL: 'Europa',
  CZ: 'Europa', SK: 'Europa', HU: 'Europa', RO: 'Europa', BG: 'Europa', GR: 'Europa',
  HR: 'Europa', RS: 'Europa', SI: 'Europa', BA: 'Europa', AL: 'Europa', MK: 'Europa',
  ME: 'Europa', MT: 'Europa', CY: 'Europa', LT: 'Europa', LV: 'Europa', EE: 'Europa',
  UA: 'Europa', BY: 'Europa', MD: 'Europa', RU: 'Europa', AD: 'Europa', SM: 'Europa',
  VA: 'Europa', LI: 'Europa', MC: 'Europa', SU: 'Europa', // SU = URSS (código histórico, ainda usado pelo TMDB em filmes antigos)

  // África
  EG: 'África', LY: 'África', TN: 'África', DZ: 'África', MA: 'África', SD: 'África',
  SS: 'África', ET: 'África', SO: 'África', KE: 'África', UG: 'África', TZ: 'África',
  RW: 'África', BI: 'África', NG: 'África', GH: 'África', CI: 'África', SN: 'África',
  ML: 'África', NE: 'África', BF: 'África', TD: 'África', CM: 'África', CD: 'África',
  CG: 'África', GA: 'África', AO: 'África', ZM: 'África', ZW: 'África', MZ: 'África',
  MW: 'África', NA: 'África', BW: 'África', ZA: 'África', LS: 'África', SZ: 'África',
  MG: 'África', MU: 'África', GN: 'África', SL: 'África', LR: 'África', GM: 'África',
  GW: 'África', MR: 'África', TG: 'África', BJ: 'África', CV: 'África', DJ: 'África',
  ER: 'África',

  // Ásia (inclui Oriente Médio e Cáucaso)
  TR: 'Ásia', GE: 'Ásia', AM: 'Ásia', AZ: 'Ásia', IL: 'Ásia', PS: 'Ásia', LB: 'Ásia',
  JO: 'Ásia', SY: 'Ásia', IQ: 'Ásia', SA: 'Ásia', AE: 'Ásia', QA: 'Ásia', KW: 'Ásia',
  BH: 'Ásia', OM: 'Ásia', YE: 'Ásia', IR: 'Ásia', AF: 'Ásia', PK: 'Ásia', IN: 'Ásia',
  NP: 'Ásia', BD: 'Ásia', BT: 'Ásia', LK: 'Ásia', MV: 'Ásia', CN: 'Ásia', JP: 'Ásia',
  KR: 'Ásia', KP: 'Ásia', MN: 'Ásia', TW: 'Ásia', HK: 'Ásia', TH: 'Ásia', VN: 'Ásia',
  LA: 'Ásia', KH: 'Ásia', MM: 'Ásia', MY: 'Ásia', SG: 'Ásia', ID: 'Ásia', PH: 'Ásia',
  BN: 'Ásia', TL: 'Ásia', KZ: 'Ásia', UZ: 'Ásia', TM: 'Ásia', KG: 'Ásia', TJ: 'Ásia',

  // Oceania
  AU: 'Oceania', NZ: 'Oceania', FJ: 'Oceania', PG: 'Oceania', NC: 'Oceania', PF: 'Oceania',
  WS: 'Oceania', TO: 'Oceania', VU: 'Oceania', SB: 'Oceania', KI: 'Oceania', TV: 'Oceania',
  NR: 'Oceania', PW: 'Oceania', FM: 'Oceania', MH: 'Oceania', GU: 'Oceania'
};

export function getContinent(countryCode: string | null | undefined): Continent | null {
  if (!countryCode) return null;
  return CONTINENT_BY_COUNTRY[countryCode.toUpperCase()] || null;
}