import { supabase } from './supabase';
import { MOODS, MOOD_BY_KEY, MOOD_BY_LETTER } from './moods';
import { parseUserPersona, type UserPersona } from './persona';

// A Persona viva (13/11/2026): a cabine e a mariposa.
//
// Pedido do Bruno: "Quero que cada filme adicionado conte, que o usuário
// anseie por preencher e ver no que está se metamorfoseando, como as mudanças
// de sua vida refletem na mudança cinematográfica", com cara da era do Club
// Penguin e do Habbo Hotel, "o Tamagotchi dos filmes", "sempre mantendo a
// sanidade mental". Plano e conta em claude/persona-viva.md.
//
// A ideia em uma linha: a cabine guarda tudo o que a pessoa avaliou; a
// mariposa veste o que ela anda vendo.
//
// Este arquivo é o motor: lê o que o banco manda (get_persona_world) e tira
// dali tudo o que a cena desenha. É conta pura, sem relógio: nada decai, nada
// depende do dia. Parar de usar não muda um pixel.
//
//   • Trio: as três letras do código, da mais forte para a mais fraca. O
//     código já vem do banco com a regra dos 10 pontos (a prateleira de fora só
//     entra quando abre uma nota 10 inteira sobre a mais fraca do trio).
//   • Forma vizinha: a Persona em que ela viraria se a prateleira de fora mais
//     forte entrasse. Três graus: longe, perto (está a até 10 pontos de
//     empatar) e quase (já passou, mas sem os 10 de vantagem: é o casulo).
//   • Envergadura: G = Σ √n nos dez baldes (as 9 prateleiras e o Arquivo, os
//     títulos de fora). Todo título avaliado aumenta; o primeiro de uma
//     prateleira vale 1 inteiro, o 50º vale 0,07. G² = títulos × prateleiras
//     vivas, isto é, volume × variedade. O valor da nota não entra (senão a
//     conta empurraria a inflar notas).
//   • Bitola: a envergadura em formatos de película, de 8 mm a Cinerama. Cada
//     bitola traz um móvel para a cabine.
//   • Fase: os últimos 30 títulos de prateleira contra o todo. É o que as asas
//     vestem. Só vale a partir de 45 títulos de prateleira (antes disso a
//     janela é quase a história inteira).
//
// Os limiares (10 pontos, 30 títulos, 45, as bitolas) foram calibrados nas
// contas reais de 13/11/2026 (20 com Persona); reajustar com mais gente.

export const PHASE_WINDOW = 30;
export const PHASE_MIN = 45;
export const PHASE_DISTINCT = 0.25;
export const MARGIN = 10;

// A bitola de cada estágio. 0 = ovo, 1 = lagarta; a partir de 2, a mariposa.
export const GAUGES: { minG: number; key: string }[] = [
  { minG: -1, key: 'egg' },
  { minG: -1, key: 'larva' },
  { minG: 0, key: 'g8' },
  { minG: 12, key: 's8' },
  { minG: 20, key: 'g16' },
  { minG: 32, key: 's16' },
  { minG: 50, key: 'g35' },
  { minG: 80, key: 'g70' },
  { minG: 125, key: 'imax' },
  { minG: 200, key: 'cinerama' },
];
// O móvel que chega com cada bitola (chave de texto em personaWorld.furniture).
export const FURNITURE: Record<number, string> = { 2: 'projector', 3: 'armchair', 4: 'rug', 5: 'lamp', 6: 'popcorn', 7: 'curtain', 8: 'bigScreen', 9: 'marquee' };

export const LETTERS: string[] = MOODS.map((m) => m.letter);

export interface WorldTitle {
  id: number;
  type: 'movie' | 'tv';
  rating: number;
  // letra da prateleira, ou null para os títulos de fora (o Arquivo)
  letter: string | null;
  titlePt: string | null;
  titleEn: string | null;
  poster: string | null;
}

export interface WorldMolt {
  at: string;
  from: string | null;
  to: string;
  no: number | null;
}

export interface PersonaWorld {
  persona: UserPersona | null;
  rated: number;
  out: number;
  counted: number;
  // os últimos 30 títulos de prateleira, do mais antigo ao mais novo
  window: { letter: string; rating: number }[];
  // as notas dos últimos 9 títulos de cada prateleira (as tampas das latas)
  recent: Record<string, number[]>;
  // as prateleiras dos primeiros títulos (os gomos da lagarta)
  first: string[];
  eyes: WorldTitle[];
  tens: WorldTitle[];
  last: WorldTitle[];
  best: Record<string, WorldTitle[]>;
  molts: WorldMolt[];
}

export type Neighbor = 'far' | 'near' | 'cocoon';

export interface WorldState {
  hasTrio: boolean;
  code: string | null;
  // letras do trio, da mais forte para a mais fraca
  trio: string[];
  // as 9 letras, da mais forte para a mais fraca
  rank: string[];
  films: Record<string, number>;
  score: Record<string, number>;
  rated: number;
  out: number;
  counted: number;
  // forma vizinha
  weakest: string | null;
  challenger: string | null;
  gap: number;
  nextCode: string | null;
  neighbor: Neighbor;
  // envergadura e bitola
  G: number;
  shelvesAlive: number;
  stage: number;
  gaugeKey: string;
  nextGaugeKey: string | null;
  gaugeBar: number;
  // fase
  essence: Record<string, number>;
  now: Record<string, number>;
  phaseAvailable: boolean;
  phaseDistinct: boolean;
  phaseMood: string | null;
  phaseLeft: number;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const parseTitle = (raw: unknown): WorldTitle | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Row;
  const id = num(r.id);
  if (!id) return null;
  return {
    id,
    type: r.type === 'tv' ? 'tv' : 'movie',
    rating: num(r.r),
    letter: strOrNull(r.m),
    titlePt: strOrNull(r.title_pt),
    titleEn: strOrNull(r.title_en),
    poster: strOrNull(r.poster),
  };
};
const parseTitles = (raw: unknown): WorldTitle[] => (Array.isArray(raw) ? raw.map(parseTitle).filter((x): x is WorldTitle => Boolean(x)) : []);

export function parsePersonaWorld(data: unknown): PersonaWorld | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Row;
  const recent: Record<string, number[]> = {};
  if (raw.recent && typeof raw.recent === 'object') {
    Object.entries(raw.recent as Row).forEach(([letter, list]) => {
      if (MOOD_BY_LETTER[letter] && Array.isArray(list)) recent[letter] = list.map(num);
    });
  }
  const best: Record<string, WorldTitle[]> = {};
  if (raw.best && typeof raw.best === 'object') {
    Object.entries(raw.best as Row).forEach(([letter, list]) => {
      if (MOOD_BY_LETTER[letter]) best[letter] = parseTitles(list);
    });
  }
  return {
    persona: parseUserPersona(raw.persona),
    rated: num(raw.rated),
    out: num(raw.out),
    counted: num(raw.counted),
    window: Array.isArray(raw.window)
      ? (raw.window as unknown[])
          .map((w) => (Array.isArray(w) ? { letter: String(w[0]), rating: num(w[1]) } : null))
          .filter((w): w is { letter: string; rating: number } => Boolean(w && MOOD_BY_LETTER[w.letter]))
      : [],
    recent,
    first: Array.isArray(raw.first) ? (raw.first as unknown[]).map(String).filter((l) => MOOD_BY_LETTER[l]) : [],
    eyes: parseTitles(raw.eyes),
    tens: parseTitles(raw.tens),
    last: parseTitles(raw.last),
    best,
    molts: Array.isArray(raw.molts)
      ? (raw.molts as Row[])
          .map((m) => ({ at: String(m.at ?? ''), from: strOrNull(m.from), to: String(m.to ?? ''), no: m.no == null ? null : num(m.no) }))
          .filter((m) => m.to.length === 3)
      : [],
  };
}

// A cena de alguém (a sua, ou a de um perfil que você pode ver).
export async function fetchPersonaWorld(userId: string): Promise<PersonaWorld | null> {
  const { data, error } = await supabase.rpc('get_persona_world', { p_user_id: userId });
  if (error) throw error;
  return parsePersonaWorld(data);
}

const sortByMoodOrder = (letters: string[]): string => letters.slice().sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b)).join('');

// O retrato que a cena desenha.
export function worldState(world: PersonaWorld): WorldState {
  const films: Record<string, number> = {};
  const score: Record<string, number> = {};
  LETTERS.forEach((l) => {
    films[l] = 0;
    score[l] = 0;
  });
  const rank: string[] = [];
  (world.persona?.scores ?? []).forEach((s) => {
    const mood = MOOD_BY_KEY[s.moodKey];
    if (!mood) return;
    films[mood.letter] = s.films;
    score[mood.letter] = s.score;
    rank.push(mood.letter);
  });
  LETTERS.forEach((l) => {
    if (!rank.includes(l)) rank.push(l);
  });

  const code = world.persona?.code ?? null;
  const trio = code ? rank.filter((l) => code.includes(l)) : [];
  const hasTrio = trio.length === 3;

  let weakest: string | null = null;
  let challenger: string | null = null;
  let gap = -Infinity;
  let nextCode: string | null = null;
  let neighbor: Neighbor = 'far';
  if (hasTrio) {
    weakest = trio[2];
    challenger = rank.find((l) => !trio.includes(l) && films[l] > 0) ?? null;
    if (challenger) {
      gap = score[challenger] - score[weakest];
      nextCode = sortByMoodOrder([trio[0], trio[1], challenger]);
      neighbor = gap >= 0 ? 'cocoon' : gap >= -MARGIN ? 'near' : 'far';
    }
  }

  let G = Math.sqrt(world.out);
  LETTERS.forEach((l) => {
    G += Math.sqrt(films[l]);
  });
  const total = world.counted + world.out;
  let stage = total > 0 ? 1 : 0;
  if (hasTrio) {
    stage = 2;
    for (let s = 3; s < GAUGES.length; s += 1) if (G >= GAUGES[s].minG) stage = s;
  }
  let nextGaugeKey: string | null = null;
  let gaugeBar = 0;
  if (stage >= 2 && stage < GAUGES.length - 1) {
    const lo = Math.max(GAUGES[stage].minG, 0);
    const hi = GAUGES[stage + 1].minG;
    nextGaugeKey = GAUGES[stage + 1].key;
    gaugeBar = Math.max(0, Math.min(1, (G - lo) / (hi - lo)));
  } else if (stage < 2) {
    nextGaugeKey = GAUGES[2].key;
    gaugeBar = Math.max(0, Math.min(1, world.counted / 10));
  }

  const sumScore = LETTERS.reduce((acc, l) => acc + score[l], 0);
  const winScore: Record<string, number> = {};
  LETTERS.forEach((l) => {
    winScore[l] = 0;
  });
  let winTotal = 0;
  world.window.forEach((w) => {
    winScore[w.letter] += w.rating;
    winTotal += w.rating;
  });
  const essence: Record<string, number> = {};
  const phase: Record<string, number> = {};
  let distance = 0;
  let phaseMood: string | null = null;
  let bestDiff = -Infinity;
  LETTERS.forEach((l) => {
    essence[l] = sumScore ? score[l] / sumScore : 0;
    phase[l] = winTotal ? winScore[l] / winTotal : 0;
    distance += Math.abs(phase[l] - essence[l]);
    if (phase[l] - essence[l] > bestDiff) {
      bestDiff = phase[l] - essence[l];
      phaseMood = l;
    }
  });
  const phaseAvailable = world.counted >= PHASE_MIN;

  return {
    hasTrio,
    code: hasTrio ? code : null,
    trio,
    rank,
    films,
    score,
    rated: world.rated,
    out: world.out,
    counted: world.counted,
    weakest,
    challenger,
    gap,
    nextCode,
    neighbor,
    G,
    shelvesAlive: total > 0 ? (G * G) / total : 0,
    stage,
    gaugeKey: GAUGES[stage].key,
    nextGaugeKey,
    gaugeBar,
    essence,
    now: phaseAvailable ? phase : essence,
    phaseAvailable,
    phaseDistinct: phaseAvailable && distance / 2 >= PHASE_DISTINCT,
    phaseMood,
    phaseLeft: Math.max(0, PHASE_MIN - world.counted),
  };
}

// O nome de cada forma (as mudas e a forma vizinha mostram o título da Persona
// de outros códigos). A tabela cine_personas é pública; guarda o que já veio.
export interface PersonaName {
  titlePt: string;
  titleEn: string;
}
const nameCache = new Map<string, PersonaName>();
export async function fetchPersonaNames(codes: string[]): Promise<Record<string, PersonaName>> {
  const wanted = Array.from(new Set(codes.filter((code) => code && code.length === 3)));
  const missing = wanted.filter((code) => !nameCache.has(code));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('cine_personas').select('code, title_pt, title_en').in('code', missing);
    if (error) throw error;
    (data ?? []).forEach((row: { code: string; title_pt: string | null; title_en: string | null }) => {
      nameCache.set(row.code, { titlePt: row.title_pt ?? '', titleEn: row.title_en ?? '' });
    });
  }
  const out: Record<string, PersonaName> = {};
  wanted.forEach((code) => {
    const hit = nameCache.get(code);
    if (hit) out[code] = hit;
  });
  return out;
}
