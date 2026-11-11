import type React from 'react';

// Os cosméticos do Grande Blefe (03/11/2026): o verso do baralho e o feltro
// da mesa. Cada id do catálogo (poker_items, migração 20261103064000) tem um
// visual aqui; id desconhecido cai no padrão, para um item novo no banco
// nunca deixar a mesa sem cara.
//
// Uso na mesa (pacote D1):
//   const { deck, table } = pokerCosmetics({ deckId: loadout.deck, tableId: loadout.table, mode });
//   <div style={table.felt}>…  <span style={deck.back} className="rounded-[3px]" />
// Tudo é CSS puro (gradientes e SVG em data URI): serve para a carta virada
// de 18×26 px e para a de 120×180 px, sem baixar imagem nenhuma.

export const DEFAULT_DECK_ID = 'deck-classico';
export const DEFAULT_TABLE_ID = 'table-feltro-verde';
// 11/11/2026: o conjunto Breaking Bad (baralho e mesa, itens separados do
// catálogo da Cobra, que saem em 20% dos torneios).
export const DECK_IDS = ['deck-classico', 'deck-noir', 'deck-breaking-bad'] as const;
export const TABLE_IDS = ['table-feltro-verde', 'table-meia-noite', 'table-breaking-bad'] as const;

// 'friends' (03/11/2026, fase 3): a mesa com amigos usa o feltro equipado, como a casual.
export type PokerMode = 'free' | 'bounty' | 'tutorial' | 'friends';

export interface DeckLook {
  id: string;
  // Fundo da carta virada (aplique com border-radius próprio).
  back: React.CSSProperties;
  // Cor do filete em volta da carta virada (contra o feltro).
  edge: string;
  // Cor de fundo enquanto o SVG não pinta (e para o canvas do compartilhar).
  base: string;
}

export interface TableLook {
  id: string;
  kind: 'felt' | 'velvet';
  // O pano da mesa.
  felt: React.CSSProperties;
  // A borda: couro com friso de ouro (SPEC §7.12).
  rim: React.CSSProperties;
  // Texto secundário sobre o pano (≥ 4,5:1 contra o tom do meio).
  textSoft: string;
  base: string;
}

const svgUri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s{2,}/g, ' ').trim())}")`;

// Raios finos saindo do centro (o leque art déco), recortados pela moldura.
const rays = (cx: number, cy: number, count: number, radius: number) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const x = (cx + Math.cos(angle) * radius).toFixed(1);
    const y = (cy + Math.sin(angle) * radius).toFixed(1);
    return `<line x1='${cx}' y1='${cy}' x2='${x}' y2='${y}'/>`;
  }).join('');

// Arcos em degrau, em cima e (espelhados) embaixo.
const arches = (gold: string, opacity: number) => {
  const top = [
    'M30 24 Q50 8 70 24',
    'M35 27.5 Q50 15 65 27.5',
    'M40 31 Q50 22 60 31',
  ];
  const mirror = (d: string) => d.replace(/(\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g, (_m, x, y) => `${x} ${(140 - Number(y)).toFixed(1)}`);
  return `<g fill='none' stroke='${gold}' stroke-width='.8' stroke-opacity='${opacity}' stroke-linecap='round'>${top
    .map((d) => `<path d='${d}'/><path d='${mirror(d)}'/>`)
    .join('')}</g>`;
};

// Clássico CineOracle: azul-noite com art déco dourado e a lua dos oráculos.
const CLASSIC_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <radialGradient id='b' cx='50%' cy='50%' r='65%'>
      <stop offset='0' stop-color='#1F2A86'/><stop offset='.68' stop-color='#141B5C'/><stop offset='1' stop-color='#0B1040'/>
    </radialGradient>
    <clipPath id='c'><rect x='9' y='9' width='82' height='122' rx='3'/></clipPath>
  </defs>
  <rect width='100' height='140' fill='url(#b)'/>
  <g clip-path='url(#c)' stroke='#E3B04B' stroke-opacity='.2' stroke-width='.45'>${rays(50, 70, 56, 110)}</g>
  ${arches('#E3B04B', 0.8)}
  <rect x='5' y='5' width='90' height='130' rx='5' fill='none' stroke='#E3B04B' stroke-width='1.5'/>
  <rect x='8.5' y='8.5' width='83' height='123' rx='3' fill='none' stroke='#E3B04B' stroke-opacity='.5' stroke-width='.6'/>
  <g fill='#E3B04B'>
    <path d='M9 9h6l-6 6z'/><path d='M91 9h-6l6 6z'/><path d='M9 131h6l-6-6z'/><path d='M91 131h-6l6-6z'/>
  </g>
  <circle cx='50' cy='70' r='18.5' fill='#141B5C' stroke='#F4C454' stroke-width='1.4'/>
  <circle cx='50' cy='70' r='15' fill='none' stroke='#F4C454' stroke-opacity='.5' stroke-width='.55' stroke-dasharray='1 1.7'/>
  <circle cx='48' cy='70.5' r='9.5' fill='#FFE8A3'/>
  <circle cx='52.6' cy='67.2' r='8.4' fill='#141B5C'/>
  <g fill='#FFE8A3'><circle cx='57.5' cy='76' r='.95'/><circle cx='60' cy='70.5' r='.6'/><circle cx='55.2' cy='80' r='.55'/></g>
</svg>`;

// Noir: preto e prata, risca de giz e um leque de cinema dos anos 30.
const NOIR_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <radialGradient id='b' cx='50%' cy='45%' r='70%'>
      <stop offset='0' stop-color='#24242C'/><stop offset='.7' stop-color='#121217'/><stop offset='1' stop-color='#08080B'/>
    </radialGradient>
    <clipPath id='c'><rect x='9' y='9' width='82' height='122' rx='3'/></clipPath>
  </defs>
  <rect width='100' height='140' fill='url(#b)'/>
  <g clip-path='url(#c)' stroke='#C9CED6' stroke-opacity='.13' stroke-width='.5'>
    ${Array.from({ length: 21 }, (_, i) => `<line x1='${10 + i * 4}' y1='0' x2='${10 + i * 4}' y2='140'/>`).join('')}
  </g>
  <path d='M50 20 L82 70 L50 120 L18 70Z' fill='#0D0D11' stroke='#DCE0E7' stroke-width='1.2'/>
  <path d='M50 28.5 L75.5 70 L50 111.5 L24.5 70Z' fill='none' stroke='#DCE0E7' stroke-opacity='.45' stroke-width='.55'/>
  <g fill='none' stroke='#DCE0E7' stroke-width='.8' stroke-linecap='round'>
    <path d='M41 80 A9 9 0 0 1 59 80'/><path d='M36 80 A14 14 0 0 1 64 80'/><path d='M45.5 80 A4.5 4.5 0 0 1 54.5 80'/>
    <line x1='50' y1='80' x2='50' y2='66'/><line x1='50' y1='80' x2='40.1' y2='70.1'/><line x1='50' y1='80' x2='59.9' y2='70.1'/>
    <line x1='36' y1='80' x2='64' y2='80'/>
  </g>
  <path d='M50 50 l3 5 l-3 5 l-3 -5z' fill='#DCE0E7'/>
  <rect x='5' y='5' width='90' height='130' rx='5' fill='none' stroke='#DCE0E7' stroke-width='1.3'/>
  <rect x='8.5' y='8.5' width='83' height='123' rx='3' fill='none' stroke='#DCE0E7' stroke-opacity='.4' stroke-width='.6'/>
  <g fill='none' stroke='#DCE0E7' stroke-width='.7'>
    <path d='M12 22 L12 12 L22 12'/><path d='M88 22 L88 12 L78 12'/><path d='M12 118 L12 128 L22 128'/><path d='M88 118 L88 128 L78 128'/>
  </g>
</svg>`;

// Breaking Bad (11/11/2026): o laboratório. Fundo de cristal azul estilhaçado,
// moldura amarela de material perigoso com as faixas listradas nos cantos e,
// no meio, a molécula em giz (o professor de química). Nada de logotipo nem
// de personagem: só o mundo da série.
const BB_SHARDS = (() => {
  // estilhaços em leque a partir de dois pontos de impacto (semente fixa)
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const out: string[] = [];
  [
    [30, 40],
    [72, 104],
  ].forEach(([cx, cy]) => {
    let a = rnd() * Math.PI * 2;
    for (let i = 0; i < 9; i += 1) {
      const step = 0.5 + rnd() * 0.6;
      const r1 = 40 + rnd() * 50;
      const r2 = 40 + rnd() * 50;
      const x1 = (cx + Math.cos(a) * r1).toFixed(1);
      const y1 = (cy + Math.sin(a) * r1).toFixed(1);
      const x2 = (cx + Math.cos(a + step) * r2).toFixed(1);
      const y2 = (cy + Math.sin(a + step) * r2).toFixed(1);
      const tone = ['#BAE6FD', '#7DD3FC', '#E0F2FE', '#38BDF8'][i % 4];
      const op = (0.06 + rnd() * 0.16).toFixed(2);
      out.push(`<path d='M${cx} ${cy} L${x1} ${y1} L${x2} ${y2}Z' fill='${tone}' fill-opacity='${op}' stroke='#E0F2FE' stroke-opacity='.18' stroke-width='.4'/>`);
      a += step;
    }
  });
  return out.join('');
})();

// faixas pretas e amarelas num triângulo de canto
const hazardCorner = (tx: number, ty: number, rot: number) => `
  <g transform='translate(${tx} ${ty}) rotate(${rot})'>
    <clipPath id='hz${rot}'><path d='M0 0 H15 L0 15Z'/></clipPath>
    <g clip-path='url(#hz${rot})'>
      <path d='M0 0 H15 L0 15Z' fill='#F2C318'/>
      ${[0, 6, 12].map((o) => `<path d='M${o} 0 h3 L${o - 15} 18 h-3Z' fill='#16130B'/>`).join('')}
    </g>
  </g>`;

const BREAKING_BAD_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <radialGradient id='b' cx='50%' cy='46%' r='70%'>
      <stop offset='0' stop-color='#1D7699'/><stop offset='.55' stop-color='#0F4560'/><stop offset='1' stop-color='#072131'/>
    </radialGradient>
    <clipPath id='c'><rect x='9' y='9' width='82' height='122' rx='3'/></clipPath>
  </defs>
  <rect width='100' height='140' fill='url(#b)'/>
  <g clip-path='url(#c)'>${BB_SHARDS}</g>
  <rect x='5' y='5' width='90' height='130' rx='5' fill='none' stroke='#F2C318' stroke-width='1.8'/>
  <rect x='8.5' y='8.5' width='83' height='123' rx='3' fill='none' stroke='#F2C318' stroke-opacity='.45' stroke-width='.6'/>
  ${hazardCorner(9, 9, 0)}${hazardCorner(91, 9, 90)}${hazardCorner(91, 131, 180)}${hazardCorner(9, 131, 270)}
  <circle cx='50' cy='70' r='21' fill='#0A2A3A' stroke='#F2C318' stroke-width='1.4'/>
  <circle cx='50' cy='70' r='17.5' fill='none' stroke='#F2C318' stroke-opacity='.4' stroke-width='.5' stroke-dasharray='1.2 1.6'/>
  <g fill='none' stroke='#EAF6FB' stroke-opacity='.92' stroke-width='1.1' stroke-linecap='round' stroke-linejoin='round'>
    <path d='M50 60.5 L58.2 65.2 L58.2 74.8 L50 79.5 L41.8 74.8 L41.8 65.2Z'/>
    <path d='M52.4 63.2 L56 65.3 M56 73.2 L52.4 75.3 M43.8 73.2 L43.8 66.8'/>
    <path d='M58.2 65.2 L63.6 62 L66.8 64.4 M63.6 62 L63.6 57.2'/>
    <path d='M41.8 74.8 L36.6 77.8'/>
  </g>
  <g fill='#BAE6FD'>
    <path d='M50 22 l3 4 l-3 5 l-3 -5z' fill-opacity='.9'/>
    <path d='M50 109 l3 4 l-3 5 l-3 -5z' fill-opacity='.9'/>
  </g>
</svg>`;

const DECKS: Record<string, DeckLook> = {
  'deck-classico': {
    id: 'deck-classico',
    back: { backgroundColor: '#141B5C', backgroundImage: svgUri(CLASSIC_SVG), backgroundSize: 'cover', backgroundPosition: 'center' },
    edge: '#F4C454',
    base: '#141B5C',
  },
  'deck-noir': {
    id: 'deck-noir',
    back: { backgroundColor: '#121217', backgroundImage: svgUri(NOIR_SVG), backgroundSize: 'cover', backgroundPosition: 'center' },
    edge: '#DCE0E7',
    base: '#121217',
  },
  'deck-breaking-bad': {
    id: 'deck-breaking-bad',
    back: { backgroundColor: '#0F4560', backgroundImage: svgUri(BREAKING_BAD_SVG), backgroundSize: 'cover', backgroundPosition: 'center' },
    edge: '#F2C318',
    base: '#0F4560',
  },
};

// Grão do pano: ruído fino em preto translúcido (some no celular, aparece
// no computador como textura de feltro).
const GRAIN = svgUri(`
<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>
  <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>
  <feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .3 0'/></filter>
  <rect width='100%' height='100%' filter='url(#n)'/>
</svg>`);

const RIM: React.CSSProperties = {
  boxShadow: 'inset 0 0 0 1.5px #F4C454, inset 0 0 0 7px #2A1A12, inset 0 0 0 8px rgba(244,196,84,0.45), inset 0 14px 30px -12px rgba(0,0,0,0.55)',
};

// Estrelas raras do feltro Meia-Noite (bem apagadas: as cartas mandam).
const MIDNIGHT_STARS = [
  'radial-gradient(1px 1px at 18% 24%, rgba(255,232,163,0.55) 50%, transparent 51%)',
  'radial-gradient(1px 1px at 72% 18%, rgba(255,255,255,0.45) 50%, transparent 51%)',
  'radial-gradient(1.2px 1.2px at 84% 66%, rgba(255,232,163,0.5) 50%, transparent 51%)',
  'radial-gradient(1px 1px at 30% 78%, rgba(255,255,255,0.4) 50%, transparent 51%)',
  'radial-gradient(1px 1px at 52% 44%, rgba(255,255,255,0.25) 50%, transparent 51%)',
].join(', ');

// Breaking Bad (11/11/2026): a mesa no meio do deserto do Novo México, ao
// entardecer. Pano cor de areia queimada, o rastro de pneus atravessando, uns
// cristais azuis espalhados brilhando e a borda de borracha amarela de
// material perigoso (no lugar do couro com friso de ouro).
const BB_CRYSTALS = [
  'radial-gradient(1.6px 1.6px at 14% 30%, rgba(125,211,252,0.75) 50%, transparent 51%)',
  'radial-gradient(1.2px 1.2px at 78% 22%, rgba(186,230,253,0.7) 50%, transparent 51%)',
  'radial-gradient(1.4px 1.4px at 66% 76%, rgba(125,211,252,0.65) 50%, transparent 51%)',
  'radial-gradient(1px 1px at 32% 70%, rgba(224,242,254,0.6) 50%, transparent 51%)',
  'radial-gradient(1.2px 1.2px at 88% 58%, rgba(125,211,252,0.6) 50%, transparent 51%)',
].join(', ');
// dois sulcos paralelos de pneu, na diagonal, e as dunas (luz e sombra largas)
const BB_TRACKS = [
  'linear-gradient(112deg, transparent 0 58%, rgba(52,32,14,0.17) 58.6% 61%, transparent 61.6% 64.6%, rgba(52,32,14,0.17) 65.2% 67.6%, transparent 68.2%)',
  'radial-gradient(60% 50% at 18% 85%, rgba(40,24,10,0.28), transparent 70%)',
  'radial-gradient(55% 45% at 82% 18%, rgba(255,214,150,0.14), transparent 70%)',
].join(', ');

const TABLES: Record<string, TableLook> = {
  'table-feltro-verde': {
    id: 'table-feltro-verde',
    kind: 'felt',
    felt: { backgroundColor: '#12513A', backgroundImage: `${GRAIN}, radial-gradient(120% 90% at 50% 38%, #1B6B4A 0%, #12513A 52%, #0A3326 100%)` },
    rim: RIM,
    textSoft: '#D9F2E4',
    base: '#12513A',
  },
  'table-meia-noite': {
    id: 'table-meia-noite',
    kind: 'felt',
    felt: {
      backgroundColor: '#101B4A',
      backgroundImage: `${GRAIN}, ${MIDNIGHT_STARS}, radial-gradient(120% 90% at 50% 38%, #16245C 0%, #101B4A 55%, #0B1440 100%)`,
      backgroundSize: '140px 140px, 220px 220px, 220px 220px, 220px 220px, 220px 220px, 220px 220px, 100% 100%',
    },
    rim: RIM,
    textSoft: '#D6DEFF',
    base: '#101B4A',
  },
  'table-breaking-bad': {
    id: 'table-breaking-bad',
    kind: 'felt',
    felt: {
      backgroundColor: '#7A5530',
      backgroundImage: `${GRAIN}, ${BB_CRYSTALS}, ${BB_TRACKS}, radial-gradient(90% 55% at 50% -6%, rgba(251,146,60,0.32), transparent 70%), radial-gradient(120% 90% at 50% 40%, #9A6E3E 0%, #7A5530 52%, #4A3018 100%)`,
      backgroundSize: '140px 140px, 240px 240px, 240px 240px, 240px 240px, 240px 240px, 240px 240px, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
    },
    // a borda de borracha amarela (material perigoso) com o friso preto
    rim: {
      boxShadow: 'inset 0 0 0 1.5px #F2C318, inset 0 0 0 7px #1D1A12, inset 0 0 0 8px rgba(242,195,24,0.55), inset 0 14px 30px -12px rgba(0,0,0,0.55)',
    },
    textSoft: '#FFF1D6',
    base: '#7A5530',
  },
};

// A mesa do prêmio é sempre de veludo vinho (veredito Q7).
const VELVET: TableLook = {
  id: 'velvet',
  kind: 'velvet',
  felt: {
    backgroundColor: '#5A1626',
    backgroundImage: `${GRAIN}, linear-gradient(115deg, rgba(255,255,255,0.07), transparent 38%), radial-gradient(120% 90% at 50% 38%, #7A2133 0%, #5A1626 52%, #2E0B14 100%)`,
  },
  rim: RIM,
  textSoft: '#F6DCE2',
  base: '#5A1626',
};

export const deckLook = (id?: string | null): DeckLook => DECKS[id || ''] ?? DECKS[DEFAULT_DECK_ID];

// O feltro equipado só vale na mesa livre ([arb] do SPEC §2.5); o treino usa
// o verde padrão e o prêmio, o veludo.
export const tableLook = (id?: string | null, mode: PokerMode = 'free'): TableLook => {
  if (mode === 'bounty') return VELVET;
  if (mode === 'tutorial') return TABLES[DEFAULT_TABLE_ID];
  return TABLES[id || ''] ?? TABLES[DEFAULT_TABLE_ID];
};

// O que a mesa pede: dado o que está equipado e o modo, o verso e o pano.
export function pokerCosmetics(sel: { deckId?: string | null; tableId?: string | null; mode?: PokerMode }) {
  const mode = sel.mode ?? 'free';
  return {
    deck: deckLook(mode === 'tutorial' ? DEFAULT_DECK_ID : sel.deckId),
    table: tableLook(sel.tableId, mode),
  };
}

export const isDeckId = (id: string) => id in DECKS;
export const isTableId = (id: string) => id in TABLES;
