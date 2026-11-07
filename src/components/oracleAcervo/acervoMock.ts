import type { AcervoItem, AcervoPage, OracleSlot, PredLabel } from '../../lib/mesa/types';

// Mock do Acervo (SPEC §8.7), 05/11/2026: respostas falsas de `mesa_acervo`
// para construir e fotografar a tela antes de o WP-DB aplicar o banco. Só é
// carregado em DEV com ?mesaMock na URL (import() dinâmico em acervoApi.ts),
// então nunca vai para produção. Fica na pasta do Acervo para não mexer no
// mockData.ts da Mesa (outro pacote).
//
// Cenários (?mesaMock=<nome>):
//   1 (ou qualquer outro)  prateleiras cheias, selo `number`;
//   recon0                 selo `hidden` (menos de 3 notas);
//   recon9 / guess         selo `guess` (de 3 a 9 notas);
//   done                   prateleira toda avaliada ("Bom trabalho");
//   noseries               séries com 0 títulos ("ainda não tem séries");
//   error                  a primeira página falha depois de 800 ms;
//   pageerror              a primeira página chega, a segunda falha;
//   slow                   cada página demora 2,5 s (para ver o esqueleto).

// Contagens de algumas prateleiras citadas no SPEC (§2.13, §4.3, §8.4), para a
// prévia ter números críveis; as outras saem de um hash estável.
const KNOWN: Record<string, { total: number; unrated: number }> = {
  'cypher|catharsis|movie': { total: 547, unrated: 530 },
  'fincher|dark-and-scary|movie': { total: 155, unrated: 140 },
  'fincher|drug-trip|movie': { total: 75, unrated: 71 },
  'fincher|drug-trip|tv': { total: 10, unrated: 9 },
  'bogart|mind-blowing|movie': { total: 104, unrated: 95 },
};

// Títulos reais só para a prévia parecer o site (nada disto vai ao ar).
const TITLES: [string, string, number][] = [
  ['O Iluminado', 'The Shining', 1980],
  ['A Chegada', 'Arrival', 2016],
  ['Amor à Flor da Pele', 'In the Mood for Love', 2000],
  ['Oldboy', 'Oldboy', 2003],
  ['Paris, Texas', 'Paris, Texas', 1984],
  ['Antes do Amanhecer', 'Before Sunrise', 1995],
  ['Interestelar', 'Interstellar', 2014],
  ['Psicose', 'Psycho', 1960],
  ['Duna: Parte Dois', 'Dune: Part Two', 2024],
  ['A Viagem de Chihiro', 'Spirited Away', 2001],
  ['Cidade de Deus', 'City of God', 2002],
  ['Parasita', 'Parasite', 2019],
  ['Clube da Luta', 'Fight Club', 1999],
  ['Zodíaco', 'Zodiac', 2007],
  ['Se7en: Os Sete Crimes Capitais', 'Se7en', 1995],
  ['Corra!', 'Get Out', 2017],
  ['Hereditário', 'Hereditary', 2018],
  ['O Bebê de Rosemary', "Rosemary's Baby", 1968],
  ['Brilho Eterno de uma Mente sem Lembranças', 'Eternal Sunshine of the Spotless Mind', 2004],
  ['2001: Uma Odisseia no Espaço', '2001: A Space Odyssey', 1968],
  ['Central do Brasil', 'Central Station', 1998],
  ['Your Name.', 'Your Name.', 2016],
  ['Um Sonho de Liberdade', 'The Shawshank Redemption', 1994],
  ['O Labirinto do Fauno', "Pan's Labyrinth", 2006],
  ['Mulholland Drive', 'Mulholland Drive', 2001],
  ['Aftersun', 'Aftersun', 2022],
  ['Retrato de uma Jovem em Chamas', 'Portrait of a Lady on Fire', 2019],
  ['O Sétimo Selo', 'The Seventh Seal', 1957],
  ['Persona', 'Persona', 1966],
  ['Stalker', 'Stalker', 1979],
  ['Ran', 'Ran', 1985],
  ['Fale com Ela', 'Talk to Her', 2002],
  ['Bacurau', 'Bacurau', 2019],
  ['A Bruxa', 'The Witch', 2015],
  ['Ex Machina', 'Ex Machina', 2014],
  ['Drive', 'Drive', 2011],
  ['Whiplash', 'Whiplash', 2014],
  ['Cisne Negro', 'Black Swan', 2010],
  ['O Grande Lebowski', 'The Big Lebowski', 1998],
  ['Fargo', 'Fargo', 1996],
  ['Moonlight', 'Moonlight', 2016],
  ['Her', 'Her', 2013],
  ['Encontros e Desencontros', 'Lost in Translation', 2003],
  ['O Poderoso Chefão', 'The Godfather', 1972],
  ['Taxi Driver', 'Taxi Driver', 1976],
  ['Alien, o 8º Passageiro', 'Alien', 1979],
  ['Blade Runner', 'Blade Runner', 1982],
  ['Akira', 'Akira', 1988],
  ['Princesa Mononoke', 'Princess Mononoke', 1997],
  ['Tudo em Todo o Lugar ao Mesmo Tempo', 'Everything Everywhere All at Once', 2022],
];

const TV_TITLES: [string, string, number][] = [
  ['Twin Peaks', 'Twin Peaks', 1990],
  ['Dark', 'Dark', 2017],
  ['Ruptura', 'Severance', 2022],
  ['True Detective', 'True Detective', 2014],
  ['Mindhunter', 'Mindhunter', 2017],
  ['Fleabag', 'Fleabag', 2016],
  ['The Leftovers', 'The Leftovers', 2014],
  ['Chernobyl', 'Chernobyl', 2019],
  ['Atlanta', 'Atlanta', 2016],
  ['Succession', 'Succession', 2018],
  ['Arcane', 'Arcane', 2021],
  ['Normal People', 'Normal People', 2020],
];

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

const scenario = (): string => (typeof window === 'undefined' ? '1' : new URLSearchParams(window.location.search).get('mesaMock') || '1');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mockMesaAcervo(oracle: OracleSlot, mood: string, media: 'movie' | 'tv', offset: number, limit: number): Promise<AcervoPage> {
  const kind = scenario();
  await wait(kind === 'slow' ? 2500 : 260 + (hash(`${oracle}${mood}${offset}`) % 240));
  if (kind === 'error' && offset === 0) throw new Error('mock: shelf error');
  if (kind === 'pageerror' && offset > 0) throw new Error('mock: page error');

  const key = `${oracle}|${mood}|${media}`;
  const h = hash(key);
  const known = KNOWN[key];
  let total = known?.total ?? (media === 'tv' ? 12 + (h % 40) : 80 + (h % 420));
  let unrated = known?.unrated ?? Math.max(0, total - (h % 19));
  if (kind === 'noseries' && media === 'tv') {
    total = 0;
    unrated = 0;
  }
  if (kind === 'done') unrated = 0;

  const pred_label: PredLabel = kind === 'recon0' ? 'hidden' : kind === 'recon9' || kind === 'guess' ? 'guess' : 'number';
  const pool = media === 'tv' ? TV_TITLES : TITLES;
  const safeLimit = Math.max(1, Math.min(60, limit));
  const end = Math.min(unrated, offset + safeLimit);
  const items: AcervoItem[] = [];
  for (let i = offset; i < end; i++) {
    const [pt, en, year] = pool[(i + (h % pool.length)) % pool.length];
    // A ordem do servidor é a nota prevista, decrescente: de 10 descendo até 5.
    const pred = pred_label === 'hidden' ? null : Math.max(5, 10 - Math.floor((i / Math.max(1, unrated)) * 6));
    items.push({
      tmdb_id: 900000 + (h % 5000) * 100 + i,
      media_type: media,
      title_pt: pt,
      title_en: en,
      year: year,
      poster_path: `/mock-acervo/${i % 997}-${slug(en)}.jpg`,
      poster_path_pt: null,
      pred,
      in_watchlist: (i + h) % 7 === 3,
    });
  }
  return {
    oracle,
    mood,
    media,
    total,
    unrated_total: unrated,
    offset,
    next_offset: end < unrated ? end : null,
    pred_label,
    items,
  };
}
